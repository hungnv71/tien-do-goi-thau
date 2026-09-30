// Kiểm thử nhập Excel với file thật "Báo cáo các HĐ 2024-2026.xlsx" (bỏ qua nếu không có file) + xuất Excel.
// Chạy: npm run test:excel
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseContracts, parsePackages } from "../src/lib/excel.js";
import { buildContractRows, DEFAULT_CFG } from "../src/lib/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "Báo cáo các HĐ 2024-2026.xlsx");
const base = () => ({
  staff: ["hungnv71", "hungnt16", "tungtt17", "dangnt2", "tucna", "tuantn1"].map((a) => ({ id: "st_" + a, account: a, fullName: a })),
  contractors: [], contracts: [], packages: [],
});

test("Đọc file báo cáo HĐ thật: 80 HĐ hợp lệ, bỏ dòng tổng/chú thích, không trùng", { skip: !existsSync(SRC) }, async () => {
  const file = new File([readFileSync(SRC)], "bc.xlsx");
  const data = base();
  const res = await parseContracts(file, data, "st_hungnv71");
  assert.equal(res.items.length, 80);
  assert.equal(res.items.filter((i) => i.errs.length).length, 0);
  assert.equal(res.items.filter((i) => i.dup).length, 0);
  assert.equal(res.items.filter((i) => !i.rec.staffId).length, 0, "mọi HĐ gắn được cán bộ");
  assert.equal(res.newContractors.length, 37);
  const st = res.items.reduce((m, i) => ((m[i.rec.execStatus + "/" + i.rec.liquidationStatus] = (m[i.rec.execStatus + "/" + i.rec.liquidationStatus] || 0) + 1), m), {});
  assert.deepEqual(st, { "in_progress/none": 63, "completed/none": 14, "completed/done": 3 });
  assert.ok(res.items.every((i) => i.rec.startDate === undefined), "không suy ngày bắt đầu từ ngày ký");
  assert.equal(res.items.filter((i) => !i.rec.originalDue).length, 6);
  // không lệch ngày do múi giờ: HĐ 3720261 ký 03/07/2026, HT dự kiến 03/03/2027 (đúng như file)
  const u = res.items.find((i) => i.rec.contractNo.startsWith("3720261"));
  assert.deepEqual([u.rec.signDate, u.rec.originalDue], ["2026-07-03", "2027-03-03"]);
  // lần 2: đã có trong CSDL => phát hiện trùng theo Số HĐ + đơn vị
  data.contracts = res.items.map((i, k) => ({ id: "c" + k, ...i.rec }));
  const again = await parseContracts(new File([readFileSync(SRC)], "bc.xlsx"), data, "st_hungnv71");
  assert.equal(again.items.filter((i) => i.dup).length, 80);
  // KPI trên dữ liệu thật tại 30/09/2026: đếm theo ID, không lỗi
  const full = { ...data, contract_extensions: [], contract_amendments: [], contract_payments: [], contract_acceptances: [], issues: [], contractors: res.newContractors };
  const rows = buildContractRows(full, "2026-09-30", DEFAULT_CFG);
  assert.equal(rows.length, 80);
  const od = rows.filter((r) => r.progress.code === "overdue").length;
  const nodue = rows.filter((r) => !r.due.currentDue).length;
  assert.equal(nodue, 6);
  console.log(`   Dữ liệu thật @30/09/2026: ${od} HĐ đang thực hiện đã quá hạn hoàn thành dự kiến; ${nodue} HĐ chưa có hạn`);
});

test("Nhập gói thầu: báo lỗi theo dòng (ngày sai, trùng mã trong file), cảnh báo cán bộ lạ", async () => {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Mã gói", "Tên gói thầu", "Cán bộ", "Nhóm công việc", "Hình thức LCNT", "Giá gói (VNĐ)", "Ngày phê duyệt chủ trương", "Mục tiêu ký HĐ", "Đơn vị"],
    ["G1", "Gói hợp lệ", "hungnv71", "Tư vấn", "Đấu thầu rộng rãi", 5e9, "01/10/2026", "", "Phòng QLHT"],
    ["G1", "Trùng mã", "hungnv71", "", "", "", "", "", "Phòng QLHT"],
    ["G3", "Ngày sai", "ai_do", "", "", "abc", "31/02/2026", "", ""],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "GoiThau");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const res = await parsePackages(new File([buf], "g.xlsx"), base());
  assert.equal(res.items.length, 3);
  assert.deepEqual(res.items[0].errs, []);
  assert.equal(res.items[0].rec.policyApprovedDate, "2026-10-01");
  assert.match(res.items[1].errs.join(), /trùng mã gói/);
  assert.match(res.items[2].errs.join(), /ngày không hợp lệ/);
  assert.match(res.items[2].errs.join(), /giá gói/);
  assert.match(res.items[2].warn.join(), /không thấy cán bộ/);
});
