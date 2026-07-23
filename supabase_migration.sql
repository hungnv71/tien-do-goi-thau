-- ============================================================
-- HE THONG THEO DOI TIEN DO GOI THAU — B.QLDAHTVT / VTNet
-- Chay toan bo file nay 1 lan trong: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- 1) CAN BO
create table if not exists staff (
  id          text primary key,
  code        text,
  full_name   text not null,
  is_manager  boolean not null default false,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 2) BO MOC QUY TRINH (template)
create table if not exists workflow_templates (
  id          text primary key,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists template_milestones (
  id           text primary key,
  template_id  text not null references workflow_templates(id) on delete cascade,
  position     int  not null,
  name         text not null
);

-- 3) GOI THAU
create table if not exists packages (
  id           text primary key,
  staff_id     text references staff(id) on delete set null,
  template_id  text references workflow_templates(id) on delete set null,
  name         text not null,
  note         text,
  created_at   timestamptz not null default now()
);

-- 4) MOC TIEN DO CUA TUNG GOI
create table if not exists package_milestones (
  id           text primary key,
  package_id   text not null references packages(id) on delete cascade,
  position     int  not null,
  name         text not null,
  doc_number   text,
  planned_date date,
  actual_date  date,
  note         text
);

-- RLS mo (anon key + RLS true)
alter table staff                 enable row level security;
alter table workflow_templates    enable row level security;
alter table template_milestones   enable row level security;
alter table packages              enable row level security;
alter table package_milestones    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['staff','workflow_templates','template_milestones','packages','package_milestones']
  loop
    execute format('drop policy if exists "open_all" on %I;', t);
    execute format('create policy "open_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- REALTIME
do $$
declare t text;
begin
  foreach t in array array['staff','workflow_templates','template_milestones','packages','package_milestones']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- DU LIEU MAU
-- ============================================================

insert into workflow_templates (id, name, is_default) values
  ('tpl_rongrai', 'Đấu thầu rộng rãi qua mạng', true)
on conflict (id) do nothing;

insert into template_milestones (id, template_id, position, name) values
  ('tm_01','tpl_rongrai',1 ,'Tờ trình chủ trương'),
  ('tm_02','tpl_rongrai',2 ,'QĐ phê duyệt dự toán (nếu có)'),
  ('tm_03','tpl_rongrai',3 ,'Tờ trình phê duyệt KHLCNT'),
  ('tm_04','tpl_rongrai',4 ,'Báo cáo thẩm định KHLCNT'),
  ('tm_05','tpl_rongrai',5 ,'Quyết định phê duyệt KHLCNT'),
  ('tm_06','tpl_rongrai',6 ,'Tờ trình TCG'),
  ('tm_07','tpl_rongrai',7 ,'Tờ trình phê duyệt HSMT'),
  ('tm_08','tpl_rongrai',8 ,'Quyết định phê duyệt HSMT'),
  ('tm_09','tpl_rongrai',9 ,'Phát hành HSMT'),
  ('tm_10','tpl_rongrai',10,'Đóng thầu'),
  ('tm_11','tpl_rongrai',11,'Báo cáo Gia hạn thời gian đóng thầu (nếu có)'),
  ('tm_12','tpl_rongrai',12,'Báo cáo đánh giá HSDT'),
  ('tm_13','tpl_rongrai',13,'Biên bản thương thảo HĐ'),
  ('tm_14','tpl_rongrai',14,'Tờ trình phê duyệt KQLCNT'),
  ('tm_15','tpl_rongrai',15,'QĐ phê duyệt KQĐT'),
  ('tm_16','tpl_rongrai',16,'Thông báo trúng thầu'),
  ('tm_17','tpl_rongrai',17,'Hợp đồng')
on conflict (id) do nothing;

insert into workflow_templates (id, name, is_default) values
  ('tpl_chaohang', 'Chào hàng cạnh tranh qua mạng', false)
on conflict (id) do nothing;

insert into template_milestones (id, template_id, position, name) values
  ('ch_01','tpl_chaohang',1,'Tờ trình chủ trương'),
  ('ch_02','tpl_chaohang',2,'QĐ phê duyệt dự toán (nếu có)'),
  ('ch_03','tpl_chaohang',3,'Tờ trình + QĐ phê duyệt KHLCNT'),
  ('ch_04','tpl_chaohang',4,'Phê duyệt E-HSMST/HSYC'),
  ('ch_05','tpl_chaohang',5,'Phát hành HSYC'),
  ('ch_06','tpl_chaohang',6,'Đóng thầu'),
  ('ch_07','tpl_chaohang',7,'Báo cáo đánh giá HSDT'),
  ('ch_08','tpl_chaohang',8,'Tờ trình + QĐ phê duyệt KQLCNT'),
  ('ch_09','tpl_chaohang',9,'Thông báo trúng thầu'),
  ('ch_10','tpl_chaohang',10,'Hợp đồng')
on conflict (id) do nothing;

insert into staff (id, code, full_name, is_manager, position) values
  ('st_truongphong','TP','Trưởng phòng', true, 0),
  ('st_hungnv71','NV01','HUNGNV71', false, 1)
on conflict (id) do nothing;

insert into packages (id, staff_id, template_id, name) values
  ('pk_demo1','st_hungnv71','tpl_rongrai','Củng cố sửa chữa, khắc phục 6.617 trạm BTS tại 34 tỉnh/TP trên toàn quốc'),
  ('pk_demo2','st_hungnv71','tpl_rongrai','KHẢO SÁT 3184 TRẠM 5G QUÝ 3/2026 - ĐẤU THẦU RỘNG RÃI QUA MẠNG')
on conflict (id) do nothing;

insert into package_milestones (id, package_id, position, name, doc_number, planned_date, actual_date, note) values
  ('pm1_01','pk_demo1',1 ,'Tờ trình chủ trương','305225268/TTr-BQLDAHTVT','2026-03-18','2026-03-18',null),
  ('pm1_02','pk_demo1',2 ,'QĐ phê duyệt dự toán (nếu có)','316/QĐ-VTNet','2026-04-26','2026-04-26',null),
  ('pm1_03','pk_demo1',3 ,'Tờ trình phê duyệt KHLCNT','1442/TTr-BQLDAHTVT','2026-05-07','2026-05-07',null),
  ('pm1_04','pk_demo1',4 ,'Báo cáo thẩm định KHLCNT',null,'2026-05-08','2026-05-08',null),
  ('pm1_05','pk_demo1',5 ,'Quyết định phê duyệt KHLCNT','4556/QĐ-VTNet','2026-05-09','2026-05-09',null),
  ('pm1_06','pk_demo1',6 ,'Tờ trình TCG','4707/TTr-BQLDAHTVT','2026-05-10','2026-05-13',null),
  ('pm1_07','pk_demo1',7 ,'Tờ trình phê duyệt HSMT',null,'2026-05-15','2026-05-15',null),
  ('pm1_08','pk_demo1',8 ,'Quyết định phê duyệt HSMT',null,'2026-05-15','2026-05-15',null),
  ('pm1_09','pk_demo1',9 ,'Phát hành HSMT',null,'2026-05-16','2026-05-16',null),
  ('pm1_10','pk_demo1',10,'Đóng thầu',null,'2026-05-25','2026-05-25',null),
  ('pm1_11','pk_demo1',11,'Báo cáo Gia hạn thời gian đóng thầu (nếu có)',null,null,null,null),
  ('pm1_12','pk_demo1',12,'Báo cáo đánh giá HSDT',null,'2026-06-05','2026-06-05',null),
  ('pm1_13','pk_demo1',13,'Biên bản thương thảo HĐ',null,'2026-06-05','2026-06-05',null),
  ('pm1_14','pk_demo1',14,'Tờ trình phê duyệt KQLCNT',null,'2026-06-06','2026-06-06',null),
  ('pm1_15','pk_demo1',15,'QĐ phê duyệt KQĐT',null,'2026-06-08','2026-06-08',null),
  ('pm1_16','pk_demo1',16,'Thông báo trúng thầu',null,'2026-06-11','2026-06-11',null),
  ('pm1_17','pk_demo1',17,'Hợp đồng',null,'2026-06-12','2026-06-25','Đã ký xong')
on conflict (id) do nothing;

insert into package_milestones (id, package_id, position, name, doc_number, planned_date, actual_date, note) values
  ('pm2_01','pk_demo2',1 ,'Tờ trình chủ trương','16158/256412/TTr-TTCP','2026-05-13','2026-05-13',null),
  ('pm2_02','pk_demo2',2 ,'QĐ phê duyệt dự toán (nếu có)',null,'2026-07-23',null,'Phòng Thẩm định chưa ký xong QĐ. Dự kiến 24/7 ký xong'),
  ('pm2_03','pk_demo2',3 ,'Tờ trình phê duyệt KHLCNT',null,'2026-07-27',null,null),
  ('pm2_04','pk_demo2',4 ,'Báo cáo thẩm định KHLCNT',null,'2026-07-28',null,null),
  ('pm2_05','pk_demo2',5 ,'Quyết định phê duyệt KHLCNT',null,'2026-07-29',null,null),
  ('pm2_06','pk_demo2',6 ,'Tờ trình TCG',null,'2026-08-02',null,null),
  ('pm2_07','pk_demo2',7 ,'Tờ trình phê duyệt HSMT',null,'2026-08-08',null,null),
  ('pm2_08','pk_demo2',8 ,'Quyết định phê duyệt HSMT',null,'2026-08-09',null,null),
  ('pm2_09','pk_demo2',9 ,'Phát hành HSMT',null,'2026-08-09',null,null),
  ('pm2_10','pk_demo2',10,'Đóng thầu',null,'2026-08-18',null,null),
  ('pm2_11','pk_demo2',11,'Báo cáo Gia hạn thời gian đóng thầu (nếu có)',null,null,null,null),
  ('pm2_12','pk_demo2',12,'Báo cáo đánh giá HSDT',null,'2026-08-31',null,null),
  ('pm2_13','pk_demo2',13,'Biên bản thương thảo HĐ',null,'2026-09-02',null,null),
  ('pm2_14','pk_demo2',14,'Tờ trình phê duyệt KQLCNT',null,'2026-09-03',null,null),
  ('pm2_15','pk_demo2',15,'QĐ phê duyệt KQĐT',null,'2026-09-05',null,null),
  ('pm2_16','pk_demo2',16,'Thông báo trúng thầu',null,'2026-09-05',null,null),
  ('pm2_17','pk_demo2',17,'Hợp đồng',null,'2026-09-07',null,null)
on conflict (id) do nothing;
