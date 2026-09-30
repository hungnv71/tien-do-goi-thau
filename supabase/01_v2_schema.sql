-- =====================================================================
-- ĐIỀU HÀNH GÓI THẦU & HỢP ĐỒNG — Migration 01 (BỔ SUNG, AN TOÀN)
-- Phòng Quản lý hạ tầng - B.QLDAHTVT
-- * Chỉ THÊM bảng/cột/hàm. Không xóa, không đổi dữ liệu đang có.
-- * Chạy lại nhiều lần vẫn an toàn (idempotent).
-- * App cũ đang chạy vẫn hoạt động bình thường sau khi chạy file này.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. CẤU HÌNH & LỊCH NGHỈ ----------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into app_settings(key, value) values
  ('org_name',               '"Phòng Quản lý hạ tầng - B.QLDAHTVT"'),
  ('due_soon_days',          '7'),
  ('due_soon_days_long',     '14'),
  ('contract_expiring_days', '30'),
  ('stale_days',             '14'),
  ('payment_module',         'true')
on conflict (key) do nothing;

create table if not exists holidays (
  id text primary key,
  day date not null unique,
  name text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- 2. CÁN BỘ: vai trò, tài khoản, đơn vị ----------
alter table staff add column if not exists account    text;
alter table staff add column if not exists role       text not null default 'staff';  -- viewer|staff|manager|admin
alter table staff add column if not exists unit       text;
alter table staff add column if not exists email      text;
alter table staff add column if not exists active     boolean not null default true;
alter table staff add column if not exists updated_at timestamptz not null default now();
alter table staff add column if not exists updated_by text;

update staff set role = 'manager' where is_manager and role = 'staff';
update staff set account = lower(full_name)
 where account is null and full_name ~ '^[A-Za-z]+[0-9]*$';
update staff set account = substring(id from 4)
 where account is null and id ~ '^st_[a-z]+[0-9]*$' and id <> 'st_truongphong';

-- Cán bộ xuất hiện trong file "Báo cáo các HĐ 2024-2026" (chưa có thì thêm)
insert into staff (id, code, full_name, account, is_manager, role, position)
select 'st_' || a, null, initcap(a), a, false, 'staff', 10 + ord
from unnest(array['hungnv71','hungnt16','tungtt17','dangnt2','tucna','tuantn1']) with ordinality as t(a, ord)
where not exists (select 1 from staff s where lower(coalesce(s.account, '')) = a or lower(s.full_name) = a or s.id = 'st_' || a)
on conflict (id) do nothing;

-- Quản trị ban đầu: tài khoản hungnv71
update staff set role = 'admin' where lower(account) = 'hungnv71' and role <> 'admin';

-- PIN lưu riêng, KHÔNG đọc được qua API
create table if not exists staff_secrets (
  staff_id     text primary key references staff(id) on delete cascade,
  pin_hash     text,
  pin_set_at   timestamptz,
  failed       int not null default 0,
  locked_until timestamptz
);
create table if not exists app_sessions (
  token      text primary key,
  staff_id   text not null references staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ---------- 3. BỘ MỐC: bắt buộc/tùy chọn, giai đoạn, trọng số, cách tính ngày ----------
alter table workflow_templates add column if not exists day_mode    text not null default 'calendar'; -- calendar|working
alter table workflow_templates add column if not exists method      text;
alter table workflow_templates add column if not exists description text;
alter table workflow_templates add column if not exists updated_at  timestamptz not null default now();
alter table workflow_templates add column if not exists updated_by  text;

alter table template_milestones add column if not exists required   boolean not null default true;
alter table template_milestones add column if not exists stage      text;
alter table template_milestones add column if not exists weight     numeric not null default 1;
alter table template_milestones add column if not exists updated_at timestamptz not null default now();
alter table template_milestones add column if not exists updated_by text;

update template_milestones set required = false where name ilike '%nếu có%' and required;

update template_milestones set stage = case
  when position in (1,2) then 'chu_truong'
  when position in (3,4,5) then 'ke_hoach'
  when position in (6,7,8) then 'ho_so'
  when position in (9,10,11) then 'moi_thau'
  when position in (12,13) then 'danh_gia'
  when position in (14,15,16) then 'phe_duyet'
  else 'ky_hd' end
where template_id = 'tpl_rongrai' and stage is null;

update template_milestones set stage = case
  when position in (1,2) then 'chu_truong'
  when position = 3 then 'ke_hoach'
  when position = 4 then 'ho_so'
  when position in (5,6) then 'moi_thau'
  when position = 7 then 'danh_gia'
  when position in (8,9) then 'phe_duyet'
  else 'ky_hd' end
where template_id = 'tpl_chaohang' and stage is null;

-- ---------- 4. GÓI THẦU (LCNT): thông tin mở rộng ----------
alter table packages add column if not exists code                   text;
alter table packages add column if not exists category               text;
alter table packages add column if not exists unit                   text;
alter table packages add column if not exists funding_source         text;
alter table packages add column if not exists package_value          numeric;
alter table packages add column if not exists currency               text not null default 'VND';
alter table packages add column if not exists vat_basis              text;      -- before_vat|after_vat
alter table packages add column if not exists selection_method       text;
alter table packages add column if not exists policy_doc_no          text;
alter table packages add column if not exists policy_doc_date        date;
alter table packages add column if not exists policy_approved_date   date;
alter table packages add column if not exists target_sign_date       date;
alter table packages add column if not exists coordinator_unit       text;
alter table packages add column if not exists status                 text not null default 'active'; -- active|paused|cancelled|completed
alter table packages add column if not exists year                   int;
alter table packages add column if not exists scope_signed_confirmed boolean not null default false;
alter table packages add column if not exists next_action            text;
alter table packages add column if not exists updated_at             timestamptz not null default now();
alter table packages add column if not exists updated_by             text;

alter table package_milestones add column if not exists applicable    boolean not null default true;
alter table package_milestones add column if not exists skip_reason   text;
alter table package_milestones add column if not exists required      boolean not null default true;
alter table package_milestones add column if not exists stage         text;
alter table package_milestones add column if not exists weight        numeric not null default 1;
alter table package_milestones add column if not exists baseline_date date;
alter table package_milestones add column if not exists actual_start  date;
alter table package_milestones add column if not exists owner_id      text references staff(id) on delete set null;
alter table package_milestones add column if not exists collaborators text;
alter table package_milestones add column if not exists depends_on    text[];
alter table package_milestones add column if not exists evidence_url  text;
alter table package_milestones add column if not exists delay_reason  text;
alter table package_milestones add column if not exists next_action   text;
alter table package_milestones add column if not exists round         int not null default 1;
alter table package_milestones add column if not exists updated_at    timestamptz not null default now();
alter table package_milestones add column if not exists updated_by    text;

update package_milestones set baseline_date = planned_date where baseline_date is null and planned_date is not null;
update package_milestones set required = false where name ilike '%nếu có%' and required;
update package_milestones pm set stage = tm.stage
  from packages p, template_milestones tm
 where pm.package_id = p.id and tm.template_id = p.template_id and tm.position = pm.position and pm.stage is null;
update packages set year = extract(year from created_at)::int where year is null;

-- ---------- 5. NHÀ THẦU ----------
create table if not exists contractors (
  id         text primary key,
  name       text not null,
  short_name text,
  tax_code   text,
  contact    text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- 6. HỢP ĐỒNG ----------
create table if not exists contracts (
  id                     text primary key,
  package_id             text references packages(id) on delete set null,
  package_code           text,
  package_name           text,
  contract_no            text not null,
  name                   text,
  category               text,
  selection_method       text,
  contractor_id          text references contractors(id) on delete set null,
  unit                   text,
  staff_id               text references staff(id) on delete set null,
  sign_date              date,
  effective_date         date,
  start_basis            text,
  start_date             date,
  duration               int,
  duration_unit          text,          -- day|month|working_day
  original_due           date,          -- hạn hoàn thành ban đầu
  actual_completion_date date,
  planned_value          numeric,       -- giá gói / GT kế hoạch thầu
  sign_value             numeric,       -- giá trị ký ban đầu
  currency               text not null default 'VND',
  vat_basis              text,          -- before_vat|after_vat
  exec_status            text not null default 'in_progress', -- not_started|in_progress|paused|completed|terminated|cancelled
  acceptance_status      text not null default 'none',        -- none|partial|done
  acceptance_date        date,
  liquidation_status     text not null default 'none',        -- none|in_progress|done
  liquidation_date       date,
  liquidation_doc        text,
  payment_owner          text,          -- qlht|quyet_toan|tinh|khac
  warranty_until         date,
  guarantee_until        date,
  docs_url               text,
  next_action            text,
  year                   int,
  source                 text,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             text
);
create index if not exists contracts_pkgcode_idx on contracts (upper(trim(package_code)));
create unique index if not exists contracts_no_unit_uq on contracts (upper(trim(contract_no)), coalesce(unit, ''));

create table if not exists contract_extensions (
  id             text primary key,
  contract_id    text not null references contracts(id) on delete cascade,
  seq            int,
  doc_no         text,
  sign_date      date,
  effective_date date,
  due_before     date,
  due_after      date,
  scope          text not null default 'all',
  reason         text,
  status         text not null default 'proposed',   -- proposed|approved|rejected
  file_url       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create table if not exists contract_amendments (
  id             text primary key,
  contract_id    text not null references contracts(id) on delete cascade,
  seq            int,
  doc_no         text,
  doc_date       date,
  effective_date date,
  delta_value    numeric not null default 0,
  reason         text,
  status         text not null default 'proposed',  -- proposed|approved|rejected
  file_url       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create table if not exists contract_milestones (
  id           text primary key,
  contract_id  text not null references contracts(id) on delete cascade,
  position     int not null default 1,
  name         text not null,
  scope        text,
  planned_date date,
  actual_date  date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text
);
create table if not exists contract_acceptances (
  id          text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  seq         int,
  acc_date    date,
  value       numeric,
  doc_no      text,
  status      text not null default 'confirmed',   -- draft|confirmed|cancelled
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
-- kind: advance (tạm ứng) | advance_recovery (thu hồi tạm ứng) | payment (thực chi đợt TT)
--       retention_release (chi trả khoản giữ lại) | refund (nhà thầu hoàn trả) | request (hồ sơ đề nghị TT)
create table if not exists contract_payments (
  id          text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  kind        text not null,
  amount      numeric not null default 0,
  currency    text,
  pay_date    date,
  due_date    date,
  settled     boolean not null default false,
  doc_no      text,
  status      text not null default 'draft',        -- draft|confirmed|cancelled
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ---------- 7. VƯỚNG MẮC ----------
create table if not exists issues (
  id             text primary key,
  entity         text not null,       -- package|contract
  entity_id      text not null,
  content        text not null,
  owner_staff_id text references staff(id) on delete set null,
  waiting_on     text,
  coord_unit     text,
  plan           text,
  commit_due     date,
  status         text not null default 'open',  -- open|resolved
  resolved_at    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create index if not exists issues_entity_idx on issues (entity, entity_id);

-- ---------- 8. NHẬT KÝ THAY ĐỔI ----------
create table if not exists change_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  staff_id  text,
  entity    text not null,
  entity_id text not null,
  field     text,
  old_value text,
  new_value text,
  reason    text
);
create index if not exists change_log_entity_idx on change_log (entity, entity_id, at desc);

-- ---------- 9. RLS: bảng mới chỉ ĐỌC qua API; ghi phải qua hàm app_write_batch ----------
do $$
declare t text;
begin
  foreach t in array array['app_settings','holidays','contractors','contracts','contract_extensions',
    'contract_amendments','contract_milestones','contract_acceptances','contract_payments','issues','change_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read_all" on %I', t);
    execute format('create policy "read_all" on %I for select using (true)', t);
  end loop;
end $$;
alter table staff_secrets enable row level security;   -- không policy => API không đọc/ghi được
alter table app_sessions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['app_settings','holidays','contractors','contracts','contract_extensions',
    'contract_amendments','contract_milestones','contract_acceptances','contract_payments','issues']
  loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- =====================================================================
-- 10. HÀM PHÂN QUYỀN & GHI DỮ LIỆU (chạy trên server, security definer)
-- =====================================================================
create or replace function app__rank(p_role text) returns int language sql immutable as $$
  select case p_role when 'admin' then 3 when 'manager' then 2 when 'staff' then 1 else 0 end
$$;

create or replace function app_login(p_staff_id text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff; sec staff_secrets; tok text; exp timestamptz := now() + interval '12 hours';
begin
  select * into s from staff where id = p_staff_id and active;
  if not found then raise exception 'AUTH:Không tìm thấy cán bộ hoặc tài khoản đã ngừng'; end if;
  select * into sec from staff_secrets where staff_id = p_staff_id;
  if sec.pin_hash is null then return jsonb_build_object('need_setup', true); end if;
  -- Lỗi đăng nhập trả về JSON (không raise) để bộ đếm sai PIN được lưu lại
  if sec.locked_until is not null and sec.locked_until > now() then
    return jsonb_build_object('error', 'Tạm khóa do nhập sai nhiều lần, thử lại sau ' ||
      to_char(sec.locked_until at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'));
  end if;
  if extensions.crypt(coalesce(p_pin, ''), sec.pin_hash) <> sec.pin_hash then
    update staff_secrets set failed = failed + 1,
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end
     where staff_id = p_staff_id;
    return jsonb_build_object('error', 'Sai mã PIN (còn ' || greatest(0, 4 - sec.failed) || ' lần thử)');
  end if;
  update staff_secrets set failed = 0, locked_until = null where staff_id = p_staff_id;
  delete from app_sessions where expires_at < now();
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into app_sessions(token, staff_id, expires_at) values (tok, s.id, exp);
  return jsonb_build_object('token', tok, 'staff_id', s.id, 'role', s.role, 'expires_at', exp);
end $$;

create or replace function app_setup_pin(p_staff_id text, p_new_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'VALID:PIN gồm 4–8 chữ số'; end if;
  if not exists (select 1 from staff where id = p_staff_id and active) then raise exception 'AUTH:Không tìm thấy cán bộ'; end if;
  if exists (select 1 from staff_secrets where staff_id = p_staff_id and pin_hash is not null) then
    raise exception 'AUTH:Tài khoản đã có PIN. Nếu quên, nhờ quản trị đặt lại.';
  end if;
  insert into staff_secrets(staff_id, pin_hash, pin_set_at)
  values (p_staff_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf')), now())
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, pin_set_at = now(), failed = 0, locked_until = null;
  insert into change_log(staff_id, entity, entity_id, field, new_value, reason)
  values (p_staff_id, 'staff', p_staff_id, 'pin', '(đã thiết lập)', 'Tự thiết lập PIN lần đầu');
  return app_login(p_staff_id, p_new_pin);
end $$;

create or replace function app__me(p_token text) returns staff
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff;
begin
  select st.* into s from app_sessions a join staff st on st.id = a.staff_id
   where a.token = p_token and a.expires_at > now() and st.active;
  if not found then raise exception 'AUTH:Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại'; end if;
  return s;
end $$;

create or replace function app_whoami(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff;
begin
  s := app__me(p_token);
  return jsonb_build_object('staff_id', s.id, 'role', s.role);
end $$;

create or replace function app_logout(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from app_sessions where token = p_token;
$$;

create or replace function app_change_pin(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff; h text;
begin
  s := app__me(p_token);
  if coalesce(p_new, '') !~ '^[0-9]{4,8}$' then raise exception 'VALID:PIN gồm 4–8 chữ số'; end if;
  select pin_hash into h from staff_secrets where staff_id = s.id;
  if h is null or extensions.crypt(coalesce(p_old, ''), h) <> h then raise exception 'AUTH:PIN hiện tại không đúng'; end if;
  update staff_secrets set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), pin_set_at = now() where staff_id = s.id;
  insert into change_log(staff_id, entity, entity_id, field, new_value, reason) values (s.id, 'staff', s.id, 'pin', '(đã đổi)', 'Tự đổi PIN');
end $$;

-- Quản trị đặt lại PIN: xóa PIN để cán bộ tự thiết lập lại ở lần đăng nhập tới
create or replace function app_reset_pin(p_token text, p_staff_id text, p_reason text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff;
begin
  s := app__me(p_token);
  if app__rank(s.role) < 3 then raise exception 'PERM:Chỉ quản trị được đặt lại PIN'; end if;
  update staff_secrets set pin_hash = null, failed = 0, locked_until = null where staff_id = p_staff_id;
  delete from app_sessions where staff_id = p_staff_id;
  insert into change_log(staff_id, entity, entity_id, field, new_value, reason)
  values (s.id, 'staff', p_staff_id, 'pin', '(đặt lại)', coalesce(p_reason, 'Quản trị đặt lại PIN'));
end $$;

-- Ai phụ trách bản ghi (để kiểm tra quyền sửa)
create or replace function app__owner(p_table text, r jsonb) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if r is null then return null; end if;
  if p_table in ('packages', 'contracts') then return r->>'staff_id'; end if;
  if p_table = 'package_milestones' then
    select staff_id into v from packages where id = r->>'package_id'; return v;
  end if;
  if p_table in ('contract_extensions','contract_amendments','contract_milestones','contract_acceptances','contract_payments') then
    select staff_id into v from contracts where id = r->>'contract_id'; return v;
  end if;
  if p_table = 'issues' then
    if r->>'entity' = 'package' then select staff_id into v from packages where id = r->>'entity_id';
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

  -- Hồ sơ nghiệp vụ: chỉ cán bộ phụ trách hoặc lãnh đạo
  owner := app__owner(p_table, case when p_op = 'insert' then d else o end);
  if rk < 2 and coalesce(owner, '') <> me.id then
    if not (p_table = 'issues' and o is not null and o->>'owner_staff_id' = me.id) then
      raise exception 'PERM:Chỉ cán bộ phụ trách hoặc lãnh đạo được cập nhật hồ sơ này';
    end if;
  end if;

  if p_table in ('packages','contracts') and d ? 'staff_id' and rk < 2
     and (d->>'staff_id') is distinct from me.id then
    raise exception 'PERM:Cán bộ không tự giao hồ sơ cho người khác, cần lãnh đạo';
  end if;
  if p_op = 'delete' and p_table in ('packages','contracts') and rk < 2 then
    raise exception 'PERM:Chỉ lãnh đạo được xóa. Cán bộ hãy chuyển trạng thái sang Hủy/Tạm dừng';
  end if;
  if p_op = 'update' and ((p_table = 'package_milestones' and d ? 'package_id' and d->>'package_id' is distinct from o->>'package_id')
                       or (d ? 'contract_id' and d->>'contract_id' is distinct from o->>'contract_id')) then
    raise exception 'PERM:Không được chuyển bản ghi sang hồ sơ khác';
  end if;

  -- Khóa kế hoạch
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

  -- Phê duyệt gia hạn / phụ lục điều chỉnh
  if p_table in ('contract_extensions','contract_amendments') then
    if (d->>'status') in ('approved','rejected')
       and (p_op = 'insert' or (d->>'status') is distinct from (o->>'status')) and rk < 2 then
      raise exception 'PERM:Chỉ lãnh đạo được phê duyệt/từ chối';
    end if;
    if p_op in ('update','delete') and o->>'status' = 'approved' and rk < 2 then
      raise exception 'PERM:Bản đã phê duyệt — cần lãnh đạo điều chỉnh';
    end if;
  end if;

  -- Bắt buộc ghi lý do khi đổi hạn / giá trị / trạng thái
  if p_op = 'update' then
    need_reason := case p_table
      when 'packages'            then array['status','target_sign_date','package_value','staff_id']
      when 'package_milestones'  then array['planned_date','applicable']
      when 'contracts'           then array['original_due','sign_value','exec_status','liquidation_status','acceptance_status','staff_id','actual_completion_date']
      when 'contract_milestones' then array['planned_date']
      else array[]::text[] end;
    foreach f in array need_reason loop
      if d ? f and o->>f is not null and (d->>f) is distinct from (o->>f) and nullif(trim(coalesce(p_reason, '')), '') is null then
        raise exception 'VALID:Cần nhập lý do khi thay đổi "%"', f;
      end if;
    end loop;
  end if;
end $$;

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
                 'contract_milestones','contract_acceptances','contract_payments','issues') then
    raise exception 'PERM:Không được ghi vào "%"', tbl;
  end if;
  if op not in ('insert','update','delete') then raise exception 'VALID:Thao tác không hợp lệ'; end if;
  if rid is null and tbl <> 'app_settings' then raise exception 'VALID:Thiếu id bản ghi'; end if;

  select array_agg(column_name::text) into cols
    from information_schema.columns where table_schema = 'public' and table_name = tbl;
  -- chỉ giữ cột thật; chuỗi rỗng -> null; server tự ghi updated_*/created_at
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
    insert into change_log(staff_id, entity, entity_id, field, new_value, reason)
    values (me.id, tbl, rid, '*', 'Tạo mới', rsn);
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
      if k in ('updated_at','updated_by') then continue; end if;
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

-- Ghi nhiều thao tác trong 1 giao dịch (lỗi 1 thao tác => hoàn tác toàn bộ)
create or replace function app_write_batch(p_token text, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me staff; op jsonb; n int := 0;
begin
  me := app__me(p_token);
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'VALID:Dữ liệu ghi không hợp lệ'; end if;
  if jsonb_array_length(p_ops) > 2000 then raise exception 'VALID:Tối đa 2000 thao tác mỗi lần'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    perform app__apply(me, op);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Danh sách cán bộ nào đã có PIN (không lộ PIN)
create or replace function app_pin_status() returns table(staff_id text, has_pin boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, (sec.pin_hash is not null) from staff s left join staff_secrets sec on sec.staff_id = s.id
$$;

-- Quyền gọi hàm: chỉ mở các hàm công khai
revoke all on function app__apply(staff, jsonb) from public, anon, authenticated;
revoke all on function app__check(staff, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function app__owner(text, jsonb) from public, anon, authenticated;
revoke all on function app__me(text) from public, anon, authenticated;
grant execute on function app_login(text, text), app_setup_pin(text, text), app_whoami(text), app_logout(text),
  app_change_pin(text, text, text), app_reset_pin(text, text, text), app_write_batch(text, jsonb),
  app_pin_status() to anon, authenticated;
