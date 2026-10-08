// Kiểm thử migration + hàm phân quyền trên Postgres thật (PGlite, chạy trong Node).
// Chạy:  npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = (f) => readFileSync(path.join(ROOT, f), "utf8");

// Môi trường giống Supabase ở mức cần thiết
async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema if not exists extensions;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create publication supabase_realtime;
  `);
  // CSDL v1 như đang chạy + 2 cột đã thêm ở bản trước
  await db.exec(sql("supabase_migration.sql"));
  await db.exec(`
    alter table template_milestones add column if not exists offset_days int;
    alter table packages add column if not exists plan_locked boolean not null default false;
    -- dữ liệu người dùng tự tạo qua giao diện cũ
    insert into staff (id, code, full_name, is_manager, position) values ('st_x1', null, 'HUNGNT16', false, 2);
    -- tình huống: người dùng đã đổi tên hiển thị qua app cũ
    update staff set full_name = 'Nguyễn Việt Hùng' where id = 'st_hungnv71';
    insert into packages (id, staff_id, template_id, name) values ('pk_u1', 'st_x1', 'tpl_rongrai', 'Thu hồi 3G năm 2026');
    insert into package_milestones (id, package_id, position, name, planned_date) values
      ('pmu_1', 'pk_u1', 1, 'Tờ trình chủ trương', '2026-09-01'),
      ('pmu_2', 'pk_u1', 2, 'QĐ phê duyệt dự toán (nếu có)', '2026-09-06');
  `);
  return db;
}

const one = async (db, q, p) => (await db.query(q, p)).rows[0];
const rpc = async (db, fn, args) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  return (await db.query(`select ${fn}(${ph}) as r`, args)).rows[0].r;
};
const write = (db, token, ops) => rpc(db, "app_write_batch", [token, JSON.stringify(ops)]);
const rejects = async (p, re) => assert.rejects(p, (e) => { assert.match(String(e.message), re); return true; });

let db, tokAdmin, tokStaff, tokMgr;

test("migration 01 + 02 chạy được trên CSDL đang có dữ liệu, chạy lại không lỗi", async () => {
  db = await freshDb();
  await db.exec(sql("supabase/01_v2_schema.sql"));
  await db.exec(sql("supabase/02_import_hd_2024_2026.sql"));
  // chạy lại lần 2: idempotent
  await db.exec(sql("supabase/01_v2_schema.sql"));
  await db.exec(sql("supabase/02_import_hd_2024_2026.sql"));

  const c = await one(db, "select count(*)::int n, count(distinct upper(trim(package_code)))::int g from contracts");
  assert.equal(c.n, 80);
  assert.equal(c.g, 44);
  // dữ liệu cũ giữ nguyên
  assert.equal((await one(db, "select count(*)::int n from packages")).n, 3);
  assert.equal((await one(db, "select planned_date::text d from package_milestones where id='pmu_2'")).d, "2026-09-06");
  // kế hoạch ban đầu được sao lưu từ hạn hiện có
  assert.equal((await one(db, "select baseline_date::text d from package_milestones where id='pmu_2'")).d, "2026-09-06");
  // cán bộ: không nhân đôi HUNGNT16 (đã có với id khác), có thêm tungtt17...
  assert.equal((await one(db, "select count(*)::int n from staff where lower(account)='hungnt16' or lower(full_name)='hungnt16'")).n, 1);
  assert.equal((await one(db, "select count(*)::int n from staff where account='tungtt17'")).n, 1);
  // mọi HĐ đều gắn được cán bộ
  assert.equal((await one(db, "select count(*)::int n from contracts where staff_id is null")).n, 0);
  // HĐ của HUNGNT16 gắn đúng id cũ st_x1
  assert.ok((await one(db, "select count(*)::int n from contracts where staff_id='st_x1'")).n > 20);
  // gói demo gắn số hiệu -> liên kết nhiều HĐ
  const link = await one(db, "select count(*)::int n from contracts where package_id='pk_demo1'");
  assert.ok(link.n >= 2, "một gói nhiều hợp đồng");
  // trạng thái
  const st = await one(db, `select count(*) filter (where exec_status='completed')::int done,
      count(*) filter (where liquidation_status='done')::int liq, count(*) filter (where original_due is null)::int nodue from contracts`);
  assert.equal(st.done, 17);
  assert.equal(st.liq, 3);
  assert.equal(st.nodue, 6);
  // quản trị ban đầu
  assert.equal((await one(db, "select role from staff where account='hungnv71'")).role, "admin");
});

test("PIN: thiết lập lần đầu, đăng nhập, sai PIN, không lộ hash", async () => {
  const r = await rpc(db, "app_login", ["st_hungnv71", "0000"]);
  assert.equal(r.need_setup, true);
  await rejects(rpc(db, "app_setup_pin", ["st_hungnv71", "12ab"]), /VALID:PIN/);
  tokAdmin = (await rpc(db, "app_setup_pin", ["st_hungnv71", "246810"])).token;
  assert.ok(tokAdmin && tokAdmin.length === 48);
  await rejects(rpc(db, "app_setup_pin", ["st_hungnv71", "111111"]), /đã có PIN/);
  assert.match((await rpc(db, "app_login", ["st_hungnv71", "999999"])).error, /Sai mã PIN/);
  assert.equal((await rpc(db, "app_login", ["st_hungnv71", "246810"])).role, "admin");
  tokStaff = (await rpc(db, "app_setup_pin", ["st_x1", "1357"])).token;
  tokMgr = (await rpc(db, "app_setup_pin", ["st_truongphong", "8642"])).token;
  const ps = (await db.query("select * from app_pin_status() order by staff_id")).rows;
  assert.ok(ps.every((x) => !("pin_hash" in x)));
  await rejects(rpc(db, "app_whoami", ["token-gia"]), /hết hạn/);
});

test("Khóa sau 5 lần sai PIN", async () => {
  await rpc(db, "app_setup_pin", ["st_tungtt17", "5555"]);
  for (let i = 0; i < 5; i++) assert.match((await rpc(db, "app_login", ["st_tungtt17", "0000"])).error, /Sai mã PIN/);
  assert.match((await rpc(db, "app_login", ["st_tungtt17", "5555"])).error, /Tạm khóa/);   // đúng PIN vẫn bị khóa 15'
});

test("Quyền: cán bộ chỉ sửa hồ sơ của mình; không tự giao cho người khác; không xóa", async () => {
  // hồ sơ của mình: được
  await write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_u1", data: { next_action: "Trình ký QĐ" } }]);
  // hồ sơ người khác: bị chặn ở server
  await rejects(write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_demo1", data: { next_action: "x" } }]), /PERM:Chỉ cán bộ phụ trách/);
  await rejects(write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_u1", data: { staff_id: "st_hungnv71" }, reason: "chuyển" }]), /PERM:Cán bộ không tự giao/);
  await rejects(write(db, tokStaff, [{ table: "packages", op: "delete", id: "pk_u1" }]), /PERM:Chỉ lãnh đạo được xóa/);
  await rejects(write(db, tokStaff, [{ table: "staff", op: "update", id: "st_x1", data: { role: "admin" } }]), /PERM:Chỉ quản trị/);
  // tạo gói mới cho chính mình: được; tạo cho người khác: bị chặn
  await write(db, tokStaff, [{ table: "packages", op: "insert", id: "pk_n1", data: { name: "Gói mới", staff_id: "st_x1", template_id: "tpl_rongrai" } }]);
  await rejects(write(db, tokStaff, [{ table: "packages", op: "insert", id: "pk_n2", data: { name: "Gói B", staff_id: "st_hungnv71" } }]), /PERM/);
  // lãnh đạo sửa được hồ sơ người khác
  await write(db, tokMgr, [{ table: "packages", op: "update", id: "pk_demo1", data: { next_action: "Theo dõi" } }]);
});

test("Đổi hạn phải có lý do, ghi nhật ký trước/sau; kế hoạch ban đầu giữ nguyên", async () => {
  await rejects(write(db, tokStaff, [{ table: "package_milestones", op: "update", id: "pmu_2", data: { planned_date: "2026-09-10" } }]), /VALID:Cần nhập lý do/);
  await write(db, tokStaff, [{ table: "package_milestones", op: "update", id: "pmu_2", data: { planned_date: "2026-09-10" }, reason: "Chờ thẩm định" }]);
  const m = await one(db, "select planned_date::text p, baseline_date::text b, updated_by from package_milestones where id='pmu_2'");
  assert.deepEqual([m.p, m.b, m.updated_by], ["2026-09-10", "2026-09-06", "st_x1"]);
  const log = await one(db, "select old_value, new_value, reason, staff_id from change_log where entity_id='pmu_2' and field='planned_date' order by id desc limit 1");
  assert.deepEqual([log.old_value, log.new_value, log.reason, log.staff_id], ["2026-09-06", "2026-09-10", "Chờ thẩm định", "st_x1"]);
  await rejects(write(db, tokStaff, [{ table: "package_milestones", op: "update", id: "pmu_2", data: { baseline_date: "2026-09-20" } }]), /Kế hoạch ban đầu/);
});

test("Khóa kế hoạch: cán bộ không đổi hạn/mở khóa; lãnh đạo được", async () => {
  await write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_u1", data: { plan_locked: true } }]);
  await rejects(write(db, tokStaff, [{ table: "package_milestones", op: "update", id: "pmu_2", data: { planned_date: "2026-09-12" }, reason: "x" }]), /đã khóa/);
  await rejects(write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_u1", data: { plan_locked: false } }]), /khóa cứng/);
  await write(db, tokMgr, [{ table: "package_milestones", op: "update", id: "pmu_2", data: { planned_date: "2026-09-12" }, reason: "Lãnh đạo điều chỉnh" }]);
  // vẫn cập nhật được ngày thực tế khi đã khóa
  await write(db, tokStaff, [{ table: "package_milestones", op: "update", id: "pmu_1", data: { actual_date: "2026-09-02" } }]);
});

test("Gia hạn: cán bộ đề nghị, chỉ lãnh đạo duyệt; lô ghi lỗi thì hoàn tác toàn bộ", async () => {
  const hd = await one(db, "select id from contracts where staff_id='st_x1' limit 1");
  await write(db, tokStaff, [{ table: "contract_extensions", op: "insert", id: "ex1", data: { contract_id: hd.id, seq: 1, due_before: "2026-11-14", due_after: "2026-12-31", status: "proposed" } }]);
  await rejects(write(db, tokStaff, [{ table: "contract_extensions", op: "update", id: "ex1", data: { status: "approved" } }]), /Chỉ lãnh đạo được phê duyệt/);
  await write(db, tokMgr, [{ table: "contract_extensions", op: "update", id: "ex1", data: { status: "approved", effective_date: "2026-10-01" } }]);
  await rejects(write(db, tokStaff, [{ table: "contract_extensions", op: "update", id: "ex1", data: { reason: "sửa" } }]), /đã phê duyệt/);
  // lô: thao tác 1 hợp lệ, thao tác 2 sai quyền => không ghi gì
  const before = (await one(db, "select count(*)::int n from contract_payments")).n;
  await rejects(write(db, tokStaff, [
    { table: "contract_payments", op: "insert", id: "p1", data: { contract_id: hd.id, kind: "payment", amount: 100, status: "confirmed" } },
    { table: "packages", op: "update", id: "pk_demo1", data: { next_action: "x" } },
  ]), /PERM/);
  assert.equal((await one(db, "select count(*)::int n from contract_payments")).n, before);
});

test("Chuỗi rỗng thành null, cột lạ bị bỏ qua, không ghi đè updated_by", async () => {
  await write(db, tokStaff, [{ table: "packages", op: "update", id: "pk_u1",
    data: { target_sign_date: "", hacker_col: 1, updated_by: "st_hungnv71", next_action: "Chờ" } }]);
  const p = await one(db, "select target_sign_date, updated_by, next_action from packages where id='pk_u1'");
  assert.equal(p.target_sign_date, null);
  assert.equal(p.updated_by, "st_x1");
  assert.equal(p.next_action, "Chờ");
});

test("Quản trị: cấu hình, đặt lại PIN; cán bộ không đọc được bảng PIN qua quyền anon", async () => {
  await write(db, tokAdmin, [{ table: "app_settings", op: "update", id: "due_soon_days", data: { value: 10 } }]);
  assert.equal((await one(db, "select value from app_settings where key='due_soon_days'")).value, 10);
  await rejects(rpc(db, "app_reset_pin", [tokStaff, "st_hungnv71", "x"]), /Chỉ quản trị/);
  await rpc(db, "app_reset_pin", [tokAdmin, "st_x1", "Quên PIN"]);
  assert.equal((await rpc(db, "app_login", ["st_x1", "1357"])).need_setup, true);
  await rejects(rpc(db, "app_whoami", [tokStaff]), /hết hạn/);   // phiên cũ bị hủy
  // anon không có policy trên staff_secrets/app_sessions
  await db.exec("grant usage on schema public to anon; grant select on all tables in schema public to anon;");
  await db.exec("set role anon");
  const r = await db.query("select count(*)::int n from staff_secrets");
  assert.equal(r.rows[0].n, 0, "RLS chặn đọc PIN");
  const c = await db.query("select count(*)::int n from contracts");
  assert.equal(c.rows[0].n, 80, "đọc dữ liệu nghiệp vụ bình thường");
  await db.exec("reset role");
});

test("Migration 03 khóa ghi trực tiếp; 03b mở lại", async () => {
  await db.exec(sql("supabase/03_lockdown_khi_deploy.sql"));
  const pol = await db.query("select policyname, cmd from pg_policies where tablename='packages'");
  assert.deepEqual(pol.rows.map((x) => x.cmd), ["SELECT"]);
  await db.exec(sql("supabase/03b_mo_lai_ghi_truc_tiep.sql"));
  const pol2 = await db.query("select cmd from pg_policies where tablename='packages' order by cmd");
  assert.ok(pol2.rows.some((x) => x.cmd === "ALL"));
});

test("Module nhiệm vụ: migration 04 + 05 (76 NV), cán bộ thật, TP thainn2", async () => {
  await db.exec(sql("supabase/04_nhiem_vu_phong.sql"));
  const has05 = (() => { try { return sql("supabase/05_import_nhiem_vu_tuan40.sql"); } catch { return null; } })();
  if (has05) { await db.exec(has05); await db.exec(has05); }       // chạy 2 lần: không nhân đôi
  await db.exec(sql("supabase/04_nhiem_vu_phong.sql"));
  if (has05) {
    const c = await one(db, "select count(*)::int n, count(*) filter (where staff_id is null)::int nul, count(*) filter (where package_id='pk_demo2')::int pk from tasks");
    assert.deepEqual([c.n, c.nul, c.pk], [76, 0, 1]);
    assert.equal((await one(db, "select count(*)::int n from weekly_reports")).n, 5);
    assert.equal((await one(db, "select full_name from staff where account='hungnv71'")).full_name, "Nguyễn Việt Hùng");
    assert.equal((await one(db, "select role from staff where account='thainn2'")).role, "manager");
    assert.equal((await one(db, "select count(*)::int n from staff where lower(account)='hungnt16'")).n, 1);
  }
});

test("Nhiệm vụ: hạn khóa cứng, đề nghị gia hạn, TP duyệt; nhật ký tuần không sửa được", async () => {
  const tokA = (await rpc(db, "app_setup_pin", ["st_tucna", "2468"])).token;
  const tokTP = (await rpc(db, "app_setup_pin", ["st_thainn2", "1357"])).token;
  await write(db, tokA, [{ table: "tasks", op: "insert", id: "t1", data: { title: "Việc phát sinh", staff_id: "st_tucna", due_date: "2026-10-10", original_due: "2026-10-10" } }]);
  await rejects(write(db, tokA, [{ table: "tasks", op: "insert", id: "t2", data: { title: "Giao người khác", staff_id: "st_dangnt2" } }]), /PERM/);
  await rejects(write(db, tokA, [{ table: "tasks", op: "update", id: "t1", data: { due_date: "2026-10-20" }, reason: "x" }]), /Hạn nhiệm vụ đã khóa/);
  await rejects(write(db, tokA, [{ table: "tasks", op: "update", id: "t1", data: { due_locked: false } }]), /mở khóa hạn/);
  await write(db, tokA, [{ table: "tasks", op: "update", id: "t1", data: { ext_requested_due: "2026-10-20", ext_reason: "Chờ số liệu", ext_status: "pending" } }]);
  await rejects(write(db, tokA, [{ table: "tasks", op: "update", id: "t1", data: { ext_status: "approved" } }]), /Chỉ lãnh đạo được duyệt/);
  await rejects(write(db, tokTP, [{ table: "tasks", op: "update", id: "t1", data: { due_date: "2026-10-20", ext_status: "approved" } }]), /Cần nhập lý do/);
  await write(db, tokTP, [{ table: "tasks", op: "update", id: "t1", data: { due_date: "2026-10-20", ext_status: "approved" }, reason: "Duyệt gia hạn: Chờ số liệu" }]);
  const t = await one(db, "select due_date::text d, original_due::text o from tasks where id='t1'");
  assert.deepEqual([t.d, t.o], ["2026-10-20", "2026-10-10"]);
  // cập nhật tuần: % + nhật ký + đánh dấu đã báo cáo
  await write(db, tokA, [
    { table: "tasks", op: "update", id: "t1", data: { percent: 50, week_result: "Xong bước 1", last_report_week: "2026-W40" } },
    { table: "task_updates", op: "insert", id: "u1", data: { task_id: "t1", staff_id: "st_tucna", week: "2026-W40", percent: 50 } },
    { table: "weekly_reports", op: "insert", id: "st_tucna|2026-W40", data: { staff_id: "st_tucna", week: "2026-W40", task_count: 1 } },
  ]);
  await rejects(write(db, tokA, [{ table: "task_updates", op: "update", id: "u1", data: { percent: 90 } }]), /không được sửa/);
  await rejects(write(db, tokA, [{ table: "tasks", op: "delete", id: "t1" }]), /Chỉ lãnh đạo được xóa/);
  await rejects(write(db, tokA, [{ table: "task_plans", op: "insert", id: "kh1", data: { title: "KH" } }]), /lãnh đạo phòng/);
  await write(db, tokTP, [{ table: "task_plans", op: "insert", id: "kh1", data: { title: "KH tháng 10", doc_no: "01/KH-QLHT" } }]);
  // Hạn mốc gói thầu khóa cứng với cán bộ, kể cả khi chưa bật "khóa kế hoạch"; chỉ điền được hạn còn trống
  await write(db, tokA, [{ table: "packages", op: "insert", id: "pkA", data: { name: "Gói A", staff_id: "st_tucna", plan_locked: false } },
    { table: "package_milestones", op: "insert", id: "pmA1", data: { package_id: "pkA", position: 1, name: "M1", planned_date: "2026-10-05", baseline_date: "2026-10-05" } },
    { table: "package_milestones", op: "insert", id: "pmA2", data: { package_id: "pkA", position: 2, name: "M2" } }]);
  await rejects(write(db, tokA, [{ table: "package_milestones", op: "update", id: "pmA1", data: { planned_date: "2026-10-09" }, reason: "x" }]), /Hạn mốc đã khóa/);
  await write(db, tokA, [{ table: "package_milestones", op: "update", id: "pmA2", data: { planned_date: "2026-10-12", baseline_date: "2026-10-12" } }]);
  await write(db, tokA, [{ table: "package_milestones", op: "update", id: "pmA1", data: { actual_date: "2026-10-04" } }]);
  await write(db, tokTP, [{ table: "package_milestones", op: "update", id: "pmA1", data: { planned_date: "2026-10-09" }, reason: "TP điều chỉnh" }]);
  // Nhiệm vụ: lãnh đạo mở khóa cũng không cho cán bộ tự đổi hạn
  await write(db, tokTP, [{ table: "tasks", op: "update", id: "t1", data: { due_locked: false } }]);
  await rejects(write(db, tokA, [{ table: "tasks", op: "update", id: "t1", data: { due_date: "2026-10-25" }, reason: "x" }]), /Hạn nhiệm vụ đã khóa/);
});

test("Tổng hợp tuần cho n8n: sai khóa bị chặn, đúng khóa trả danh sách + HTML", async () => {
  await rejects(rpc(db, "app_weekly_digest", ["sai"]), /Sai khóa/);
  const key = (await one(db, "select value from app_secrets where key='digest_key'")).value;
  const r = await rpc(db, "app_weekly_digest", [key]);
  assert.ok(r.week.startsWith("20"));
  const a = r.staff.find((s) => s.staff_id === "st_tucna");
  assert.ok(a.open >= 1 && a.html.includes("Cập nhật tuần") && a.subject.includes("[P.QLHT]"));
  const w40 = await rpc(db, "app_weekly_digest", [key, "2026-W40"]);
  assert.equal(w40.week, "2026-W40");
  assert.equal(w40.staff.find((s) => s.staff_id === "st_bichngoc").submitted, true, "tuần 40 Bích Ngọc đã gửi");
  assert.ok(w40.missing.includes("Trân Văn Doanh"));
  await rejects(rpc(db, "app_weekly_digest", [key, "W40<script>"]), /không hợp lệ/);
  await db.exec("grant select on all tables in schema public to anon; set role anon");   // như Supabase: anon có quyền bảng, RLS chặn dòng
  assert.equal((await db.query("select count(*)::int n from app_secrets")).rows[0].n, 0, "anon không đọc được khóa");
  await db.exec("reset role");
});

test("Việc định kỳ tự chuyển kỳ (09): tạo kỳ mới, giữ cuối tháng, không nhân đôi, kỳ cũ giữ nguyên", async () => {
  await db.exec(sql("supabase/09_dinh_ky_voffice.sql"));
  await db.exec(sql("supabase/09_dinh_ky_voffice.sql"));   // chạy lại an toàn
  await db.exec(`
    insert into tasks (id, code, title, staff_id, due_date, original_due, status, recurring, recurrence, series_id) values
      ('r1', 'NV26-0901', 'Thanh toán OS hàng tháng', 'st_tucna', '2026-09-30', '2026-09-30', 'in_progress', true, 'monthly', 'r1'),
      ('r2', 'NV26-0902', 'Báo cáo quý', 'st_tucna', '2026-09-15', '2026-09-15', 'done', true, 'quarterly', 'r2'),
      ('r3', 'NV26-0903', 'Việc thường xuyên dài hạn', 'st_tucna', '2026-11-30', '2026-11-30', 'in_progress', true, 'monthly', 'r3'),
      ('r4', 'NV26-0904', 'Đã dừng lặp', 'st_tucna', '2026-08-20', '2026-08-20', 'done', false, null, null);
  `);
  assert.ok(await rpc(db, "app_roll_recurring", ["2026-10-08"]) >= 2);       // r1 (tháng), r2 (quý 3 → quý 4) + việc định kỳ có sẵn
  assert.equal(await rpc(db, "app_roll_recurring", ["2026-10-20"]), 0, "chạy lại không nhân đôi");
  const rows = (await db.query("select series_id, due_date::text d, period, status, percent::int p, staff_id, code from tasks where series_id in ('r1','r2') and id not in ('r1','r2') order by series_id")).rows;
  assert.deepEqual(rows.map((r) => [r.series_id, r.d, r.period, r.status, r.p, r.staff_id]),
    [["r1", "2026-10-31", "2026-10", "not_started", 0, "st_tucna"], ["r2", "2026-12-15", "2026-Q4", "not_started", 0, "st_tucna"]]);
  assert.match(rows[0].code, /^NV26-\d{4}$/);
  assert.equal((await one(db, "select status from tasks where id='r1'")).status, "in_progress", "kỳ cũ giữ nguyên trạng thái thật");
  assert.equal((await one(db, "select count(*)::int n from tasks where series_id='r3'")).n, 1, "chưa sang kỳ mới thì không tạo");
  assert.equal((await one(db, "select count(*)::int n from tasks where coalesce(series_id,id)='r4'")).n, 1, "bỏ lặp thì không tạo");
  // nhảy nhiều tháng chỉ tạo 1 bản ghi cho kỳ hiện tại
  assert.ok(await rpc(db, "app_roll_recurring", ["2027-01-05"]) >= 2);
  assert.equal((await one(db, "select max(due_date)::text d from tasks where series_id='r1'")).d, "2027-01-31");
  // chỉ lãnh đạo / quản trị được bấm chuyển kỳ
  const tokA = (await rpc(db, "app_login", ["st_tucna", "2468"])).token;
  await rejects(rpc(db, "app_roll_recurring_now", [tokA]), /Chỉ lãnh đạo/);
  const tokTP = (await rpc(db, "app_login", ["st_thainn2", "1357"])).token;
  assert.equal(typeof (await rpc(db, "app_roll_recurring_now", [tokTP])), "number");
  // cột VO: 1 nhiệm vụ VO có thể gắn nhiều cán bộ
  await db.exec("update tasks set vo_id = '837076' where id in ('r3','r4')");
  assert.equal((await one(db, "select count(*)::int n from tasks where vo_id='837076'")).n, 2);
});
