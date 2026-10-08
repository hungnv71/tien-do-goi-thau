// Kiểm thử quy tắc ngày / cảnh báo / số liệu — chạy: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayVN, addMonths, addDays, diffDays, addWorkingDays, workingDaysBetween, suggestDue, parseDateCell, fmtDate } from "../src/lib/dates.js";
import {
  DEFAULT_CFG, milestoneState, evalPackage, contractDue, contractProgress, contractValue, paymentSummary,
  buildPackageRows, buildContractRows, computeKpis, LCNT_KPI, HD_KPI, buildAlerts, cascadeShift, buildSchedule, daysText,
} from "../src/lib/rules.js";

const R = "2026-09-30"; // ngày báo cáo
const cfg = { ...DEFAULT_CFG };
const emptyData = () => ({
  staff: [{ id: "a", fullName: "Nguyễn Văn A" }], packages: [], package_milestones: [], workflow_templates: [], contracts: [],
  contract_extensions: [], contract_amendments: [], contract_payments: [], contract_acceptances: [], contractors: [], issues: [],
});

// ---------------- ngày & múi giờ
test("Hôm nay theo giờ VN: 23:30 UTC ngày 30/09 là 01/10 tại VN", () => {
  assert.equal(todayVN(new Date("2026-09-30T23:30:00Z")), "2026-10-01");
  assert.equal(todayVN(new Date("2026-09-30T16:59:00Z")), "2026-09-30");
  assert.equal(todayVN(new Date("2026-09-30T17:00:00Z")), "2026-10-01");
});
test("Cuối tháng / cuối năm / năm nhuận: cộng tháng theo lịch, không 30 ngày/tháng", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(diffDays("2026-12-31", "2027-01-01"), 1);
  assert.notEqual(suggestDue("2026-01-31", 6, "month"), addDays("2026-01-31", 180));
});
test("Ngày làm việc tính theo lịch nghỉ cấu hình, không chỉ bỏ T7/CN", () => {
  const hol = new Set(["2026-09-01", "2026-09-02"]);  // nghỉ Quốc khánh (cấu hình)
  assert.equal(addWorkingDays("2026-08-28", 2, hol), "2026-09-03"); // T6 -> bỏ T7, CN; 31/8 (1), bỏ 1-2/9, 3/9 (2)
  assert.equal(addWorkingDays("2026-08-28", 2), "2026-09-01");      // không có lịch nghỉ thì khác
  assert.equal(workingDaysBetween("2026-08-28", "2026-09-03", hol), 2);
  assert.equal(suggestDue("2026-01-01", 10, "day"), "2026-01-11"); // ngày đầu không tính
});
test("Đọc ngày Excel: serial, dd/mm/yyyy, ngày sai báo lỗi", () => {
  assert.equal(parseDateCell(46295), "2026-09-30");
  assert.equal(parseDateCell(new Date(2026, 6, 2, 23, 59, 30)), "2026-07-03"); // lệch múi giờ của SheetJS
  assert.equal(parseDateCell(new Date(2026, 6, 3, 0, 0, 0)), "2026-07-03");
  assert.equal(parseDateCell("30/09/2026"), "2026-09-30");
  assert.equal(parseDateCell("31/02/2026"), undefined);
  assert.equal(parseDateCell(""), null);
  assert.equal(fmtDate("2026-09-30"), "30/09/2026");
});

// ---------------- mốc
test("Quá hạn 1 ngày / đến hạn hôm nay / sắp đến hạn / chưa có hạn", () => {
  assert.deepEqual(milestoneState({ plannedDate: "2026-09-29" }, R, cfg), { code: "overdue", lateDays: 1 });
  assert.equal(milestoneState({ plannedDate: R }, R, cfg).code, "due_today");
  assert.equal(milestoneState({ plannedDate: R }, R, cfg).lateDays, 0);
  assert.equal(milestoneState({ plannedDate: "2026-10-07" }, R, cfg).code, "due_soon");
  assert.equal(milestoneState({ plannedDate: "2026-10-08" }, R, cfg).code, "on_track");
  assert.equal(milestoneState({ plannedDate: null }, R, cfg).code, "no_due");
});
test("Hoàn thành đúng hạn / chậm: tính theo ngày thực tế, không tăng theo hôm nay", () => {
  assert.equal(milestoneState({ plannedDate: "2026-09-10", actualDate: "2026-09-10" }, R, cfg).code, "done");
  const late = milestoneState({ plannedDate: "2026-09-10", actualDate: "2026-09-13" }, R, cfg);
  assert.deepEqual(late, { code: "done_late", lateDays: 3 });
  assert.deepEqual(milestoneState({ plannedDate: "2026-09-10", actualDate: "2026-09-13" }, "2026-12-31", cfg), late);
});
test("Báo cáo ngày quá khứ: mốc hoàn thành sau ngày đó thì tại ngày đó chưa hoàn thành", () => {
  assert.equal(milestoneState({ plannedDate: "2026-09-10", actualDate: "2026-09-20" }, "2026-09-15", cfg).code, "overdue");
});

// ---------------- gói thầu
const ms = (pid, arr) => arr.map(([pos, name, planned, actual, extra], i) => ({ id: `${pid}_${i}`, packageId: pid, position: pos, name, plannedDate: planned, actualDate: actual, ...extra }));
test("Tiến độ các mốc: mốc không áp dụng không vào mẫu số; không suy từ thời gian trôi", () => {
  const list = ms("p", [[1, "Chủ trương", "2026-09-01", "2026-09-01"], [2, "Dự toán (nếu có)", null, null, { applicable: false }], [3, "KHLCNT", "2026-10-20", null], [4, "Hợp đồng", "2026-11-20", null]]);
  const ev = evalPackage({ id: "p" }, list, R, cfg);
  assert.equal(ev.applicable, 3);
  assert.equal(ev.done, 1);
  assert.ok(Math.abs(ev.progress - 1 / 3) < 1e-9);
  assert.equal(ev.current.name, "KHLCNT");
  assert.equal(ev.code, "on_track");
});
test("Mốc tùy chọn (nếu có) chưa có ngày không chặn bước hiện tại, không vào mẫu số; có hạn thì được tính", () => {
  const base = [[1, "Đóng thầu", "2026-09-01", "2026-09-01"], [2, "Gia hạn đóng thầu (nếu có)", null, null, { required: false }], [3, "Hợp đồng", "2026-09-20", "2026-09-20"]];
  const ev = evalPackage({ id: "p" }, ms("p", base), R, cfg);
  assert.equal(ev.code, "completed");
  assert.equal(ev.applicable, 2);
  const used = ms("p", [[1, "Đóng thầu", "2026-09-01", "2026-09-01"], [2, "Gia hạn đóng thầu (nếu có)", "2026-09-05", null, { required: false }], [3, "Hợp đồng", "2026-10-20", null]]);
  const ev2 = evalPackage({ id: "p" }, used, R, cfg);
  assert.equal(ev2.code, "overdue");
  assert.equal(ev2.current.position, 2);
});
test("Chưa có bộ mốc / thiếu hạn không coi là đúng tiến độ / tạm dừng không tự miễn quá hạn", () => {
  assert.equal(evalPackage({ id: "x" }, [], R, cfg).code, "no_milestones");
  assert.equal(evalPackage({ id: "p" }, ms("p", [[1, "A", null, null]]), R, cfg).code, "no_due");
  const paused = evalPackage({ id: "p", status: "paused" }, ms("p", [[1, "A", "2026-09-01", null]]), R, cfg);
  assert.equal(paused.code, "paused");
  assert.equal(paused.overdue.length, 1);
});
test("Tịnh tiến mốc sau khi đổi hạn, bỏ qua mốc đã xong", () => {
  const list = ms("p", [[1, "A", "2026-09-01", null], [2, "B", "2026-09-05", "2026-09-05"], [3, "C", "2026-09-10", null]]);
  const out = cascadeShift(list, list[0], "2026-09-04");
  assert.deepEqual(out, [{ id: "p_0", plannedDate: "2026-09-04" }, { id: "p_2", plannedDate: "2026-09-13" }]);
  const sch = buildSchedule([{ position: 1, offsetDays: 0 }, { position: 2, offsetDays: 9 }, { position: 3, offsetDays: null }], "2026-12-28", addDays);
  assert.deepEqual(sch, { 1: "2026-12-28", 2: "2027-01-06", 3: null });
});

// ---------------- hợp đồng: gia hạn
const C = { id: "c1", originalDue: "2026-09-20", execStatus: "in_progress", signValue: 1000, currency: "VND" };
test("Gia hạn chờ duyệt không đổi hạn; đã duyệt nhưng chưa hiệu lực không đổi hạn", () => {
  const ext = [{ contractId: "c1", seq: 1, status: "proposed", dueAfter: "2026-12-31" }];
  assert.equal(contractDue(C, ext, R).currentDue, "2026-09-20");
  assert.equal(contractProgress(C, ext, R, cfg).code, "overdue");
  const ext2 = [{ contractId: "c1", seq: 1, status: "approved", effectiveDate: "2026-10-05", dueAfter: "2026-12-31" }];
  assert.equal(contractDue(C, ext2, R).currentDue, "2026-09-20");
  assert.equal(contractDue(C, ext2, R).notYetEffective.length, 1);
  assert.equal(contractDue(C, ext2, "2026-10-05").currentDue, "2026-12-31");
});
test("2 lần gia hạn: số lần đếm từ bản đã duyệt & có hiệu lực; giữ số ngày chậm so hạn gốc", () => {
  const ext = [
    { contractId: "c1", seq: 1, status: "approved", effectiveDate: "2026-09-15", dueAfter: "2026-09-25" },
    { contractId: "c1", seq: 2, status: "approved", effectiveDate: "2026-09-24", dueAfter: "2026-10-20" },
    { contractId: "c1", seq: 3, status: "rejected", effectiveDate: "2026-09-26", dueAfter: "2027-01-01" },
  ];
  const d = contractDue(C, ext, R);
  assert.equal(d.extCount, 2);
  assert.equal(d.currentDue, "2026-10-20");
  const p = contractProgress(C, ext, R, cfg);
  assert.equal(p.code, "due_soon");
  assert.equal(p.lateVsOriginal, 10);
});
test("Hai bản gia hạn cùng ngày hiệu lực, hạn khác nhau => cần rà soát, không chọn ngẫu nhiên", () => {
  const ext = [
    { contractId: "c1", seq: 1, status: "approved", effectiveDate: "2026-09-15", dueAfter: "2026-10-10" },
    { contractId: "c1", seq: 2, status: "approved", effectiveDate: "2026-09-15", dueAfter: "2026-11-10" },
  ];
  assert.equal(contractDue(C, ext, R).conflict, true);
  assert.equal(contractProgress(C, ext, R, cfg).code, "review");
});
test("HĐ hoàn thành chậm tính theo hạn có hiệu lực tại ngày hoàn thành; thiếu ngày TT => chưa đủ dữ liệu", () => {
  const done = { ...C, execStatus: "completed", actualCompletionDate: "2026-09-25" };
  assert.deepEqual(contractProgress(done, [], R, cfg), { code: "done_late", lateDays: 5, lateVsOriginal: 5 });
  assert.equal(contractProgress({ ...C, execStatus: "completed" }, [], R, cfg).code, "done_nodate");
  assert.equal(contractProgress({ ...C, execStatus: "cancelled" }, [], R, cfg).code, "cancelled");
  assert.equal(contractProgress({ ...C, originalDue: null }, [], R, cfg).code, "no_due");
});

// ---------------- giá trị & thanh toán
test("Giá trị hiện hành = gốc + phụ lục đã duyệt có hiệu lực; giữ giá trị gốc", () => {
  const amd = [
    { contractId: "c1", status: "approved", effectiveDate: "2026-09-01", deltaValue: 200 },
    { contractId: "c1", status: "approved", effectiveDate: "2026-10-01", deltaValue: -50 },
    { contractId: "c1", status: "proposed", effectiveDate: "2026-09-01", deltaValue: 999 },
  ];
  const v = contractValue(C, amd, R);
  assert.deepEqual([v.original, v.delta, v.current, v.pending], [1000, 200, 1200, 1]);
});
test("Thanh toán: chỉ cộng giao dịch đã xác nhận; thu hồi tạm ứng không cộng hai lần; hoàn trả trừ đúng dấu", () => {
  const c = { ...C, paymentOwner: "qlht" };
  const pay = [
    { contractId: "c1", kind: "advance", amount: 300, status: "confirmed", payDate: "2026-06-01" },
    { contractId: "c1", kind: "payment", amount: 400, status: "confirmed", payDate: "2026-08-01" },
    { contractId: "c1", kind: "advance_recovery", amount: 100, status: "confirmed", payDate: "2026-08-01" },
    { contractId: "c1", kind: "refund", amount: 50, status: "confirmed", payDate: "2026-08-15" },
    { contractId: "c1", kind: "payment", amount: 5000, status: "draft", payDate: "2026-08-01" },
    { contractId: "c1", kind: "payment", amount: 5000, status: "cancelled", payDate: "2026-08-01" },
    { contractId: "c1", kind: "payment", amount: 7, currency: "USD", status: "confirmed", payDate: "2026-08-01" },
  ];
  const s = paymentSummary(c, pay, [], { current: 1000, currency: "VND" }, R);
  assert.equal(s.paid, 650);
  assert.equal(s.advanceOutstanding, 200);
  assert.equal(s.rate, 65);
  assert.equal(s.unpaidValue, 350);
  assert.equal(s.excludedOtherCurrency, 1);
  assert.equal(s.draftOrCancelled, 2);
});
test("Giá trị HĐ = 0 => chưa đủ dữ liệu; thanh toán > 100% cảnh báo, không ép về 100%", () => {
  const c = { ...C, paymentOwner: "qlht" };
  const pay = [{ contractId: "c1", kind: "payment", amount: 1100, status: "confirmed" }];
  assert.equal(paymentSummary(c, pay, [], { current: 0, currency: "VND" }, R).rate, null);
  const s = paymentSummary(c, pay, [], { current: 1000, currency: "VND" }, R);
  assert.equal(s.rate, 110);
  assert.equal(s.over100, true);
});
test("Nhiều tiền tệ: không cộng giá trị USD vào tổng VND", () => {
  const d = emptyData();
  d.contracts = [
    { id: "v", contractNo: "1", execStatus: "in_progress", signValue: 100, currency: "VND", originalDue: "2027-01-01" },
    { id: "u", contractNo: "2", execStatus: "in_progress", signValue: 5, currency: "USD", originalDue: "2027-01-01" },
  ];
  const rows = buildContractRows(d, R, cfg);
  const k = computeKpis(HD_KPI, rows, { reportDate: R }).find((x) => x.key === "hd_value");
  assert.equal(k.value, 100);
});

// ---------------- dữ liệu rỗng, ít, nhiều; một gói nhiều HĐ; cảnh báo không trùng
test("Chưa có dữ liệu: KPI = 0, không lỗi", () => {
  const d = emptyData();
  const k = computeKpis(LCNT_KPI, buildPackageRows(d, R, cfg), { reportDate: R });
  assert.ok(k.every((x) => x.value === 0));
  assert.deepEqual(buildAlerts([], [], R, cfg), { action: [], data: [] });
});
test("Một gói nhiều HĐ; hủy 1 HĐ không tính vào đang thực hiện; KPI đếm theo ID", () => {
  const d = emptyData();
  d.packages = [{ id: "p", name: "Gói", staffId: "a" }];
  d.contracts = [
    { id: "h1", packageId: "p", contractNo: "1", execStatus: "in_progress", originalDue: "2026-09-29", staffId: "a" },
    { id: "h2", packageId: "p", contractNo: "2", execStatus: "cancelled", originalDue: "2026-09-29", staffId: "a" },
    { id: "h3", packageId: "p", contractNo: "3", execStatus: "in_progress", originalDue: R, staffId: "a" },
  ];
  d.contract_extensions = [{ contractId: "h1", status: "proposed", seq: 1, dueAfter: "2026-12-01" }, { contractId: "h1", status: "proposed", seq: 2, dueAfter: "2026-12-02" }];
  const prow = buildPackageRows(d, R, cfg)[0];
  assert.equal(prow.contracts.length, 3);
  const rows = buildContractRows(d, R, cfg);
  const k = Object.fromEntries(computeKpis(HD_KPI, rows, { reportDate: R }).map((x) => [x.key, x.value]));
  assert.equal(k.hd_active, 2);
  assert.equal(k.hd_overdue, 1);
  assert.equal(k.hd_expiring, 1);
  assert.equal(k.hd_ext, 1);   // 2 đề nghị nhưng 1 HĐ
  const { action } = buildAlerts([], rows, R, cfg);
  assert.deepEqual(action.map((a) => [a.recordId, a.kind]), [["h1", "overdue"], ["h3", "due_today"]]); // quá hạn trước, mỗi HĐ 1 lần
});
test("Nhiều gói: KPI bấm lọc khớp danh sách; thiếu người phụ trách là cảnh báo dữ liệu", () => {
  const d = emptyData();
  for (let i = 0; i < 30; i++) {
    d.packages.push({ id: `p${i}`, name: `Gói ${i}`, staffId: i % 5 ? "a" : null });
    d.package_milestones.push(...ms(`p${i}`, [[1, "Tờ trình", addDays(R, i - 10), null], [2, "Hợp đồng", addDays(R, i + 20), null]]));
  }
  const rows = buildPackageRows(d, R, cfg);
  const k = Object.fromEntries(computeKpis(LCNT_KPI, rows, { reportDate: R }).map((x) => [x.key, x.value]));
  assert.equal(k.lcnt_open, 30);
  assert.equal(k.lcnt_overdue, 10);
  assert.equal(k.lcnt_due, 8);   // hôm nay + 7 ngày tới
  assert.equal(k.lcnt_missing, 6);
  const { data } = buildAlerts(rows, [], R, cfg);
  assert.equal(data.filter((x) => x.kind === "no_owner").length, 6);
  assert.equal(daysText(-3), "Chậm 3 ngày");
});

test("HĐ đã thanh lý = đã hoàn thành: không quá hạn, không còn đang thực hiện; ngày sai định dạng bị cảnh báo", async () => {
  const { contractProgress, dateIssues } = await import("../src/lib/rules.js");
  const c = { id: "x", execStatus: "in_progress", liquidationStatus: "done", originalDue: "2025-03-11", signDate: "2024-09-12" };
  const p = contractProgress(c, [], "2026-10-08");
  assert.equal(p.code, "done_nodate"); assert.equal(p.liquidated, true);
  const d = { ...emptyData(), contracts: [c] };
  const rows = buildContractRows(d, "2026-10-08", cfg);
  assert.equal(rows[0].active, false);
  const al = buildAlerts([], rows, "2026-10-08", cfg);
  assert.equal(al.action.filter((a) => a.kind === "overdue").length, 0);
  assert.equal(al.data.filter((a) => a.kind === "missing_done_date").length, 0);
  assert.match(dateIssues({ signDate: "2026-01-02", liquidationDate: "22026-06-30" }).join(), /sai định dạng/);
  // có ngày hoàn thành thực tế: vẫn đánh giá đúng / chậm theo ngày hoàn thành
  assert.equal(contractProgress({ ...c, actualCompletionDate: "2025-03-20" }, [], "2026-10-08").code, "done_late");
});

test("Tổng HĐ đã ký không giảm khi đóng / thanh lý HĐ; HĐ hủy không tính", async () => {
  const { HD_TOTAL_KPI } = await import("../src/lib/rules.js");
  const C = (id, x) => ({ id, contractNo: id, signDate: "2026-01-01", originalDue: "2026-12-31", signValue: 1e9, currency: "VND", execStatus: "in_progress", liquidationStatus: "none", ...x });
  const before = { ...emptyData(), contracts: [C("a"), C("b"), C("c", { execStatus: "cancelled" })] };
  const after = { ...emptyData(), contracts: [C("a", { liquidationStatus: "done" }), C("b", { execStatus: "completed", actualCompletionDate: "2026-06-01" }), C("c", { execStatus: "cancelled" })] };
  const k = (d) => Object.fromEntries(computeKpis([...HD_TOTAL_KPI, ...HD_KPI], buildContractRows(d, "2026-10-08", cfg), { reportDate: "2026-10-08", cfg }).map((x) => [x.key, x.value]));
  const kb = k(before), ka = k(after);
  assert.deepEqual([kb.hd_signed, kb.hd_signed_value], [2, 2e9]);
  assert.deepEqual([ka.hd_signed, ka.hd_signed_value], [2, 2e9], "đóng HĐ không làm giảm tổng đã ký");
  assert.deepEqual([kb.hd_active, ka.hd_active, ka.hd_done, ka.hd_done_value], [2, 0, 2, 2e9]);
});
