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
