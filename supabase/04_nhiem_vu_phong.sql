-- =====================================================================
-- Migration 04: MODULE NHIỆM VỤ PHÒNG (ngoài gói thầu) — bổ sung, chạy lại an toàn
-- * Nhiệm vụ: VO, được giao, thường xuyên, phát sinh, phiếu giao NV quý, theo kế hoạch phòng...
-- * Hạn nhiệm vụ KHÓA CỨNG: cán bộ không tự đổi hạn; gửi đề nghị gia hạn, lãnh đạo duyệt.
-- * Báo cáo tuần: mỗi lần cập nhật lưu nhật ký (task_updates) + đánh dấu đã báo cáo tuần (weekly_reports).
-- * Hàm app_weekly_digest(key) phục vụ n8n gửi mail nhắc hằng tuần.
-- =====================================================================

-- ---------- 1. BẢNG ----------
create table if not exists task_plans (
  id text primary key, doc_no text, title text not null, issued_date date, issuer text,
  period_from date, period_to date, note text, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by text
);
create table if not exists tasks (
  id text primary key,
  code text,
  title text not null,
  task_type text not null default 'Nhiệm vụ được giao',
  plan_id text references task_plans(id) on delete set null,
  package_id text references packages(id) on delete set null,
  contract_id text references contracts(id) on delete set null,
  source_doc text,               -- số văn bản / KH / VO giao việc
  assigner text,                 -- người / cấp giao
  staff_id text references staff(id) on delete set null,   -- chủ trì
  collaborators text,            -- phối hợp
  assigned_date date,
  due_date date,                 -- hạn hiện hành (khóa)
  original_due date,             -- hạn giao ban đầu (giữ nguyên)
  due_locked boolean not null default true,
  recurring boolean not null default false,
  output text,                   -- sản phẩm đầu ra
  percent numeric,               -- 0..100
  status text not null default 'in_progress',  -- not_started|in_progress|waiting|done|cancelled
  completed_date date,
  result_total text,             -- kết quả đã thực hiện (lũy kế)
  week_result text,              -- kết quả trong tuần
  next_plan text,                -- kế hoạch tiếp theo
  difficulty text,               -- khó khăn, vướng mắc
  proposal text,                 -- đề xuất, kiến nghị
  note text,
  ext_requested_due date, ext_reason text, ext_status text,   -- đề nghị gia hạn: pending|approved|rejected
  last_report_week text, last_report_at timestamptz,
  source text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by text
);
create index if not exists tasks_staff_idx on tasks (staff_id);
create table if not exists task_updates (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  staff_id text, week text not null, percent numeric, status text,
  week_result text, next_plan text, difficulty text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by text
);
create index if not exists task_updates_task_idx on task_updates (task_id, week);
create table if not exists weekly_reports (
  id text primary key,                       -- staff_id || '|' || week
  staff_id text not null references staff(id) on delete cascade,
  week text not null, submitted_at timestamptz not null default now(), task_count int, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by text,
  unique (staff_id, week)
);
-- khóa bí mật cho n8n (không đọc được qua API)
create table if not exists app_secrets (key text primary key, value text not null);
insert into app_secrets(key, value) values ('digest_key', encode(extensions.gen_random_bytes(16), 'hex')) on conflict (key) do nothing;
insert into app_settings(key, value) values ('task_soon_days', '3'), ('app_url', '"https://tien-do-goi-thau.vercel.app"') on conflict (key) do nothing;

do $$ declare t text; begin
  foreach t in array array['task_plans','tasks','task_updates','weekly_reports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read_all" on %I', t);
    execute format('create policy "read_all" on %I for select using (true)', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop; end $$;
alter table app_secrets enable row level security;

-- ---------- 2. QUYỀN: mở rộng hàm kiểm tra ----------
create or replace function app__owner(p_table text, r jsonb) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if r is null then return null; end if;
  if p_table in ('packages', 'contracts', 'tasks', 'weekly_reports') then return r->>'staff_id'; end if;
  if p_table = 'package_milestones' then
    select staff_id into v from packages where id = r->>'package_id'; return v;
  end if;
  if p_table in ('contract_extensions','contract_amendments','contract_milestones','contract_acceptances','contract_payments') then
    select staff_id into v from contracts where id = r->>'contract_id'; return v;
  end if;
  if p_table = 'task_updates' then
    select staff_id into v from tasks where id = r->>'task_id'; return v;
  end if;
  if p_table = 'issues' then
    if r->>'entity' = 'package' then select staff_id into v from packages where id = r->>'entity_id';
    elsif r->>'entity' = 'task' then select staff_id into v from tasks where id = r->>'entity_id';
    else select staff_id into v from contracts where id = r->>'entity_id'; end if;
    return v;
  end if;
  return null;
end $$;

create or replace function app__check(me staff, p_table text, p_op text, d jsonb, o jsonb, p_reason text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rk int := app__rank(me.role);
  owner text;
  lk boolean;
  f text;
  need_reason text[] := array[]::text[];
begin
  if rk = 0 then raise exception 'PERM:Tài khoản chỉ có quyền xem'; end if;
  if p_table in ('staff','workflow_templates','template_milestones','app_settings','holidays') then
    if rk < 3 then raise exception 'PERM:Chỉ quản trị được thay đổi mục này'; end if;
    return;
  end if;
  if p_table = 'contractors' then
    if p_op <> 'insert' and rk < 2 then raise exception 'PERM:Chỉ lãnh đạo/quản trị được sửa, xóa nhà thầu'; end if;
    return;
  end if;
  if p_table = 'task_plans' then
    if rk < 2 then raise exception 'PERM:Chỉ lãnh đạo phòng được tạo/sửa kế hoạch phòng'; end if;
    return;
  end if;

  owner := app__owner(p_table, case when p_op = 'insert' then d else o end);
  if rk < 2 and coalesce(owner, '') <> me.id then
    if not (p_table = 'issues' and o is not null and o->>'owner_staff_id' = me.id) then
      raise exception 'PERM:Chỉ cán bộ phụ trách hoặc lãnh đạo được cập nhật hồ sơ này';
    end if;
  end if;
  if p_table in ('packages','contracts','tasks','weekly_reports') and d ? 'staff_id' and rk < 2
     and (d->>'staff_id') is distinct from me.id then
    raise exception 'PERM:Cán bộ không tự giao hồ sơ/nhiệm vụ cho người khác, cần lãnh đạo';
  end if;
  if p_op = 'delete' and p_table in ('packages','contracts','tasks') and rk < 2 then
    raise exception 'PERM:Chỉ lãnh đạo được xóa. Cán bộ hãy chuyển trạng thái sang Hủy/Tạm dừng';
  end if;
  if p_table = 'task_updates' and p_op <> 'insert' and rk < 2 then
    raise exception 'PERM:Nhật ký báo cáo tuần không được sửa/xóa';
  end if;
  if p_op = 'update' and ((p_table = 'package_milestones' and d ? 'package_id' and d->>'package_id' is distinct from o->>'package_id')
                       or (d ? 'contract_id' and p_table <> 'tasks' and d->>'contract_id' is distinct from o->>'contract_id')
                       or (p_table = 'task_updates' and d ? 'task_id' and d->>'task_id' is distinct from o->>'task_id')) then
    raise exception 'PERM:Không được chuyển bản ghi sang hồ sơ khác';
  end if;

  -- Khóa kế hoạch gói thầu
  if p_table = 'packages' and p_op = 'update' and d ? 'plan_locked'
     and coalesce((o->>'plan_locked')::boolean, false) and not coalesce((d->>'plan_locked')::boolean, false) and rk < 2 then
    raise exception 'PERM:Kế hoạch đã khóa cứng — chỉ lãnh đạo được mở khóa';
  end if;
  if p_table = 'package_milestones' and p_op = 'update' and d ? 'planned_date'
     and (d->>'planned_date') is distinct from (o->>'planned_date') then
    select plan_locked into lk from packages where id = o->>'package_id';
    if coalesce(lk, false) and rk < 2 then raise exception 'PERM:Kế hoạch đã khóa — cần lãnh đạo điều chỉnh hạn'; end if;
  end if;
  if p_table = 'package_milestones' and p_op = 'update' and d ? 'baseline_date'
     and o->>'baseline_date' is not null and (d->>'baseline_date') is distinct from (o->>'baseline_date') and rk < 3 then
    raise exception 'PERM:Kế hoạch ban đầu được giữ nguyên, không sửa';
  end if;

  -- Khóa hạn nhiệm vụ
  if p_table = 'tasks' and p_op = 'update' then
    if d ? 'due_date' and (d->>'due_date') is distinct from (o->>'due_date') and coalesce((o->>'due_locked')::boolean, true) and rk < 2 then
      raise exception 'PERM:Hạn nhiệm vụ đã khóa — hãy gửi đề nghị gia hạn để lãnh đạo duyệt';
    end if;
    if d ? 'due_locked' and coalesce((o->>'due_locked')::boolean, true) and not coalesce((d->>'due_locked')::boolean, true) and rk < 2 then
      raise exception 'PERM:Chỉ lãnh đạo được mở khóa hạn nhiệm vụ';
    end if;
    if d ? 'original_due' and o->>'original_due' is not null and (d->>'original_due') is distinct from (o->>'original_due') and rk < 3 then
      raise exception 'PERM:Hạn giao ban đầu được giữ nguyên';
    end if;
    if d ? 'ext_status' and (d->>'ext_status') in ('approved','rejected') and (d->>'ext_status') is distinct from (o->>'ext_status') and rk < 2 then
      raise exception 'PERM:Chỉ lãnh đạo được duyệt đề nghị gia hạn';
    end if;
  end if;

  -- Duyệt gia hạn / phụ lục HĐ
  if p_table in ('contract_extensions','contract_amendments') then
    if (d->>'status') in ('approved','rejected')
       and (p_op = 'insert' or (d->>'status') is distinct from (o->>'status')) and rk < 2 then
      raise exception 'PERM:Chỉ lãnh đạo được phê duyệt/từ chối';
    end if;
    if p_op in ('update','delete') and o->>'status' = 'approved' and rk < 2 then
      raise exception 'PERM:Bản đã phê duyệt — cần lãnh đạo điều chỉnh';
    end if;
  end if;

  if p_op = 'update' then
    need_reason := case p_table
      when 'packages'            then array['status','target_sign_date','package_value','staff_id']
      when 'package_milestones'  then array['planned_date','applicable']
      when 'contracts'           then array['original_due','sign_value','exec_status','liquidation_status','acceptance_status','staff_id','actual_completion_date']
      when 'contract_milestones' then array['planned_date']
      when 'tasks'               then array['due_date','staff_id']
      else array[]::text[] end;
    foreach f in array need_reason loop
      if d ? f and o->>f is not null and (d->>f) is distinct from (o->>f) and nullif(trim(coalesce(p_reason, '')), '') is null then
        raise exception 'VALID:Cần nhập lý do khi thay đổi "%"', f;
      end if;
    end loop;
  end if;
end $$;

-- Danh sách bảng được ghi: thêm bảng nhiệm vụ
create or replace function app__apply(me staff, p_op jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tbl text := p_op->>'table';
  op  text := p_op->>'op';
  rid text := coalesce(p_op->>'id', p_op->'data'->>'id');
  rsn text := nullif(trim(coalesce(p_op->>'reason', '')), '');
  d   jsonb := coalesce(p_op->'data', '{}'::jsonb);
  cols text[];
  o jsonb; n jsonb; k text; lst text;
begin
  if tbl not in ('staff','workflow_templates','template_milestones','app_settings','holidays','contractors',
                 'packages','package_milestones','contracts','contract_extensions','contract_amendments',
                 'contract_milestones','contract_acceptances','contract_payments','issues',
                 'task_plans','tasks','task_updates','weekly_reports') then
    raise exception 'PERM:Không được ghi vào "%"', tbl;
  end if;
  if op not in ('insert','update','delete') then raise exception 'VALID:Thao tác không hợp lệ'; end if;
  if rid is null and tbl <> 'app_settings' then raise exception 'VALID:Thiếu id bản ghi'; end if;
  select array_agg(column_name::text) into cols
    from information_schema.columns where table_schema = 'public' and table_name = tbl;
  select coalesce(jsonb_object_agg(key, case when value = '""'::jsonb then 'null'::jsonb else value end), '{}'::jsonb)
    into d from jsonb_each(d)
   where key = any(cols) and key not in ('updated_at','updated_by','created_at');
  if tbl = 'app_settings' then
    rid := coalesce(rid, d->>'key');
    execute 'select to_jsonb(t) from app_settings t where key = $1' into o using rid;
  elsif op <> 'insert' then
    execute format('select to_jsonb(t) from %I t where id = $1', tbl) into o using rid;
    if o is null then raise exception 'NOTFOUND:Không tìm thấy bản ghi'; end if;
  end if;
  perform app__check(me, tbl, op, d, o, rsn);
  if tbl = 'app_settings' then
    insert into app_settings(key, value, updated_at, updated_by) values (rid, d->'value', now(), me.id)
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = me.id;
    insert into change_log(staff_id, entity, entity_id, field, old_value, new_value, reason)
    values (me.id, tbl, rid, 'value', o->>'value', (d->'value')::text, rsn);
    return rid;
  end if;
  if op = 'insert' then
    d := d || jsonb_build_object('id', rid);
    if 'updated_by' = any(cols) then d := d || jsonb_build_object('updated_by', me.id); end if;
    select string_agg(quote_ident(key), ',') into lst from jsonb_object_keys(d) key;
    execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)', tbl, lst, lst, tbl) using d;
    if tbl not in ('task_updates','weekly_reports') then
      insert into change_log(staff_id, entity, entity_id, field, new_value, reason) values (me.id, tbl, rid, '*', 'Tạo mới', rsn);
    end if;
  elsif op = 'update' then
    d := d - 'id';
    if d = '{}'::jsonb then return rid; end if;
    if 'updated_at' = any(cols) then d := d || jsonb_build_object('updated_at', now()); end if;
    if 'updated_by' = any(cols) then d := d || jsonb_build_object('updated_by', me.id); end if;
    select string_agg(quote_ident(key), ',') into lst from jsonb_object_keys(d) key;
    execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2',
                   tbl, lst, lst, tbl) using d, rid;
    execute format('select to_jsonb(t) from %I t where id = $1', tbl) into n using rid;
    for k in select jsonb_object_keys(d) loop
      if k in ('updated_at','updated_by','last_report_at','last_report_week','week_result','next_plan') then continue; end if;
      if (o->k) is distinct from (n->k) then
        insert into change_log(staff_id, entity, entity_id, field, old_value, new_value, reason)
        values (me.id, tbl, rid, k, o->>k, n->>k, rsn);
      end if;
    end loop;
  else
    execute format('delete from %I where id = $1', tbl) using rid;
    insert into change_log(staff_id, entity, entity_id, field, old_value, reason)
    values (me.id, tbl, rid, '*', left(o::text, 2000), rsn);
  end if;
  return rid;
end $$;
revoke all on function app__apply(staff, jsonb) from public, anon, authenticated;
revoke all on function app__check(staff, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function app__owner(text, jsonb) from public, anon, authenticated;

-- ---------- 3. TỔNG HỢP TUẦN CHO n8n (cần khóa bí mật) ----------
create or replace function app__iso_week(d date) returns text language sql immutable set search_path = public, pg_temp as $$
  select to_char(d, 'IYYY') || '-W' || to_char(d, 'IW')
$$;

-- p_week (tùy chọn, dạng 2026-W40): tổng hợp cho tuần chỉ định — n8n sáng thứ Hai dùng tuần trước
drop function if exists app_weekly_digest(text);
create or replace function app_weekly_digest(p_key text, p_week text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  wk text := coalesce(nullif(trim(p_week), ''), app__iso_week((now() at time zone 'Asia/Ho_Chi_Minh')::date));
  soon int := coalesce((select (value #>> '{}')::int from app_settings where key = 'task_soon_days'), 3);
  url text := coalesce((select value #>> '{}' from app_settings where key = 'app_url'), '');
  res jsonb := '[]'::jsonb;
  s record; rows text; n_open int; n_over int; n_soon int; submitted boolean;
begin
  if p_key is null or p_key <> (select value from app_secrets where key = 'digest_key') then
    raise exception 'AUTH:Sai khóa tổng hợp';
  end if;
  if wk !~ '^\d{4}-W\d{2}$' then raise exception 'VALID:Tuần không hợp lệ (dạng 2026-W40)'; end if;
  for s in select * from staff where active and role in ('staff','manager','admin') order by position loop
    select count(*) filter (where t.status not in ('done','cancelled')),
           count(*) filter (where t.status not in ('done','cancelled') and t.due_date < today),
           count(*) filter (where t.status not in ('done','cancelled') and t.due_date between today and today + soon),
           string_agg(case when t.status not in ('done','cancelled') then
             '<tr><td style="padding:4px 8px;border:1px solid #e4e9f1">' || replace(replace(left(t.title, 140), '<', '&lt;'), '>', '&gt;') ||
             '</td><td style="padding:4px 8px;border:1px solid #e4e9f1;white-space:nowrap">' || coalesce(to_char(t.due_date, 'DD/MM/YYYY'), 'Chưa có hạn') ||
             '</td><td style="padding:4px 8px;border:1px solid #e4e9f1;white-space:nowrap;color:' ||
             case when t.due_date < today then '#b91c1c">Quá hạn ' || (today - t.due_date) || ' ngày'
                  when t.due_date <= today + soon then '#92400e">Còn ' || (t.due_date - today) || ' ngày'
                  else '#15803d">' || coalesce((t.due_date - today)::text || ' ngày', '') end ||
             '</td><td style="padding:4px 8px;border:1px solid #e4e9f1;text-align:right">' || coalesce(round(t.percent)::text || '%', '') || '</td></tr>'
           end, '' order by t.due_date nulls last)
      into n_open, n_over, n_soon, rows
      from tasks t where t.staff_id = s.id;
    submitted := exists (select 1 from weekly_reports w where w.staff_id = s.id and w.week = wk);
    res := res || jsonb_build_object(
      'staff_id', s.id, 'name', s.full_name, 'email', s.email, 'role', s.role, 'week', wk,
      'open', n_open, 'overdue', n_over, 'due_soon', n_soon, 'submitted', submitted,
      'subject', '[P.QLHT] Cập nhật tiến độ nhiệm vụ ' || wk || ' — ' || n_open || ' việc' ||
                 case when n_over > 0 then ', ' || n_over || ' quá hạn' else '' end,
      'html', '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#172033">' ||
        '<p>Chào ' || s.full_name || ',</p><p>Đề nghị anh/chị cập nhật tiến độ nhiệm vụ tuần <b>' || wk || '</b> (khoảng 2 phút): ' ||
        '<a href="' || url || '/#/nhiem-vu?tab=tuan" style="color:#ee0033;font-weight:bold">Mở trang Cập nhật tuần</a></p>' ||
        '<p>Đang thực hiện: <b>' || n_open || '</b> · Quá hạn: <b style="color:#b91c1c">' || n_over || '</b> · Sắp đến hạn (≤' || soon || ' ngày): <b>' || n_soon || '</b>' ||
        case when submitted then ' · <span style="color:#15803d">Đã gửi báo cáo tuần này</span>' else '' end || '</p>' ||
        case when coalesce(rows, '') = '' then '<p>Không có nhiệm vụ đang mở.</p>' else
          '<table style="border-collapse:collapse;font-size:13px"><tr style="background:#172033;color:#fff"><th style="padding:4px 8px">Nhiệm vụ</th><th>Hạn</th><th>Tình trạng</th><th>%</th></tr>' || rows || '</table>' end ||
        '<p style="color:#586579;font-size:12px">Thư tự động từ hệ thống Điều hành gói thầu & nhiệm vụ — Phòng Quản lý hạ tầng. Hạn nhiệm vụ đã khóa; cần đổi hạn vui lòng gửi đề nghị gia hạn trên web.</p></div>'
    );
  end loop;
  return jsonb_build_object('week', wk, 'date', today, 'staff', res,
    'missing', (select coalesce(jsonb_agg(x->>'name'), '[]'::jsonb) from jsonb_array_elements(res) x where not (x->>'submitted')::boolean and (x->>'open')::int > 0));
end $$;
revoke all on function app_weekly_digest(text, text) from public;
grant execute on function app_weekly_digest(text, text) to anon, authenticated;
revoke all on function app__iso_week(date) from public, anon, authenticated;
