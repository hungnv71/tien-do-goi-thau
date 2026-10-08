-- =====================================================================
-- Migration 09 (08/10/2026): VIỆC ĐỊNH KỲ TỰ CHUYỂN KỲ + ĐỒNG BỘ VOFFICE. Chạy lại an toàn.
-- * Việc định kỳ (recurring): mỗi kỳ (tháng/quý/năm) là 1 bản ghi riêng cùng series_id.
--   Sang kỳ mới, hệ thống tự tạo bản ghi kỳ mới (hạn = cùng ngày của kỳ mới, giữ "cuối tháng").
--   Bản ghi kỳ cũ giữ nguyên trạng thái thật (chưa xong thì vẫn quá hạn — không tự đóng hộ).
-- * Voffice: lưu ID nhiệm vụ VO để lần nhập sau khớp chính xác; hạn & số lần gia hạn theo VO.
-- =====================================================================
alter table tasks add column if not exists recurrence text;        -- monthly | quarterly | yearly
alter table tasks add column if not exists series_id text;         -- chuỗi việc định kỳ (id bản ghi đầu)
alter table tasks add column if not exists period text;            -- kỳ: 2026-10 / 2026-Q4 / 2026
alter table tasks add column if not exists vo_id text;             -- ID nhiệm vụ trên Voffice
alter table tasks add column if not exists vo_status text;         -- trạng thái / mức độ trên VO lần đồng bộ gần nhất
alter table tasks add column if not exists vo_due date;            -- hạn trên VO lần đồng bộ gần nhất
alter table tasks add column if not exists vo_ext_count int;       -- số lần gia hạn trên VO
alter table tasks add column if not exists vo_synced_at timestamptz;
-- 1 nhiệm vụ VO (cấp đơn vị) có thể tách cho nhiều cán bộ => nhiều dòng cùng vo_id
drop index if exists tasks_vo_id_uq;
create index if not exists tasks_vo_id_idx on tasks (vo_id);
create index if not exists tasks_series_idx on tasks (series_id);

-- kỳ của 1 ngày theo kiểu lặp
create or replace function app__period(d date, rec text) returns text language sql immutable set search_path = public, pg_temp as $$
  select case coalesce(rec, 'monthly')
    when 'quarterly' then to_char(d, 'YYYY') || '-Q' || to_char(d, 'Q')
    when 'yearly' then to_char(d, 'YYYY')
    else to_char(d, 'YYYY-MM') end
$$;
create or replace function app__unit(rec text) returns text language sql immutable set search_path = public, pg_temp as $$
  select case coalesce(rec, 'monthly') when 'quarterly' then 'quarter' when 'yearly' then 'year' else 'month' end
$$;

-- gắn chuỗi cho các việc định kỳ đã có
update tasks set series_id = id where recurring and series_id is null;
update tasks set recurrence = 'monthly' where recurring and recurrence is null;
update tasks set period = app__period(due_date, recurrence) where recurring and period is null and due_date is not null;

/** Tạo bản ghi kỳ hiện tại cho mọi chuỗi việc định kỳ đã sang kỳ mới. Trả về số bản ghi tạo. */
create or replace function app_roll_recurring(p_today date default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  t record; u text; step int; nd date; eom boolean; n int := 0; yy text; mx int; nid text; per text;
begin
  for t in
    select distinct on (coalesce(series_id, id)) *
      from tasks
     where recurring is true and due_date is not null and status <> 'cancelled'
     order by coalesce(series_id, id), due_date desc, created_at desc
  loop
    u := app__unit(t.recurrence);
    if date_trunc(u, t.due_date) >= date_trunc(u, today) then continue; end if;   -- chưa sang kỳ mới
    step := case u when 'quarter' then 3 when 'year' then 12 else 1 end;
    eom := t.due_date = (date_trunc('month', t.due_date) + interval '1 month - 1 day')::date;
    nd := t.due_date;
    while date_trunc(u, nd) < date_trunc(u, today) loop                            -- nhảy thẳng tới kỳ hiện tại
      nd := (nd + make_interval(months => step))::date;
      if eom then nd := (date_trunc('month', nd) + interval '1 month - 1 day')::date; end if;
    end loop;
    per := app__period(nd, t.recurrence);
    nid := 'nv_r' || left(md5(coalesce(t.series_id, t.id) || '|' || per), 12);
    if exists (select 1 from tasks where id = nid) then continue; end if;
    yy := to_char(today, 'YY');
    select coalesce(max((regexp_match(code, '^NV' || yy || '-(\d+)$'))[1]::int), 0) into mx from tasks where code like 'NV' || yy || '-%';
    insert into tasks (id, code, title, task_type, plan_id, source_doc, assigner, staff_id, collaborators, assigned_date, due_date, original_due,
                       due_locked, recurring, recurrence, series_id, period, output, percent, status, note, source)
    values (nid, 'NV' || yy || '-' || lpad((mx + 1)::text, 4, '0'), t.title, t.task_type, t.plan_id, t.source_doc, t.assigner, t.staff_id, t.collaborators,
            date_trunc(u, today)::date, nd, nd, true, true, t.recurrence, coalesce(t.series_id, t.id), per, t.output, 0, 'not_started', t.note,
            'Tự động chuyển kỳ từ ' || coalesce(t.code, t.id));
    insert into change_log(staff_id, entity, entity_id, field, new_value, reason)
    values (null, 'tasks', nid, '*', 'Tạo mới', 'Hệ thống tự chuyển kỳ việc định kỳ ' || coalesce(t.code, t.id) || ' → kỳ ' || per);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app_roll_recurring(date) from public, anon, authenticated;

/** Lãnh đạo / quản trị bấm "Chuyển kỳ ngay" trên web. */
create or replace function app_roll_recurring_now(p_token text) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me staff;
begin
  me := app__me(p_token);
  if app__rank(me.role) < 2 then raise exception 'PERM:Chỉ lãnh đạo phòng / quản trị được chuyển kỳ'; end if;
  return app_roll_recurring(null);
end $$;
revoke all on function app_roll_recurring_now(text) from public;
grant execute on function app_roll_recurring_now(text) to anon, authenticated;

-- Lịch tự chạy hằng ngày: xem 09b_lich_chuyen_ky.sql (pg_cron, chỉ chạy trên Supabase).
