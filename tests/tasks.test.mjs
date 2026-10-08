// Kiểm thử quy tắc NHIỆM VỤ PHÒNG — chạy: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeek, weekBounds, prevWeek, evalTask, buildTaskRows, staffRanking, monthMatrix, taskAlerts, taskKpis } from "../src/lib/tasks.js";

const R = "2026-10-01";
const cfg = { taskSoonDays: 3 };

test("Tuần ISO khớp Postgres IYYY-IW (kể cả giao năm)", () => {
  assert.equal(isoWeek("2026-09-28"), "2026-W40");
  assert.equal(isoWeek("2026-10-04"), "2026-W40");
  assert.equal(isoWeek("2026-10-05"), "2026-W41");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isoWeek("2024-12-30"), "2025-W01");
  assert.deepEqual(weekBounds("2026-W40"), { from: "2026-09-28", to: "2026-10-04" });
  assert.equal(prevWeek("2026-W01"), "2025-W52");
});

test("Đánh giá nhiệm vụ: quá hạn / đến hạn / sắp đến hạn / chưa có hạn / hoàn thành chậm", () => {
  assert.equal(evalTask({ dueDate: "2026-09-30" }, R, cfg).code, "overdue");
  assert.equal(evalTask({ dueDate: "2026-09-30" }, R, cfg).lateDays, 1);
  assert.equal(evalTask({ dueDate: R }, R, cfg).code, "due_today");
  assert.equal(evalTask({ dueDate: "2026-10-04" }, R, cfg).code, "due_soon");
  assert.equal(evalTask({ dueDate: "2026-10-05" }, R, cfg).code, "on_track");
  assert.equal(evalTask({}, R, cfg).code, "no_due");
  const late = evalTask({ dueDate: "2026-09-20", status: "done", completedDate: "2026-09-25" }, R, cfg);
  assert.equal(late.code, "done_late"); assert.equal(late.lateDays, 5);
  // Hoàn thành sau ngày báo cáo => tại ngày đó chưa hoàn thành
  assert.equal(evalTask({ dueDate: "2026-09-20", status: "done", completedDate: "2026-10-03" }, R, cfg).code, "overdue");
  assert.equal(evalTask({ dueDate: "2026-09-20", status: "done" }, R, cfg).code, "done_nodate");
  assert.equal(evalTask({ dueDate: "2026-09-20", status: "cancelled" }, R, cfg).code, "cancelled");
  // Đề nghị gia hạn chưa duyệt không làm đổi hạn
  const e = evalTask({ dueDate: "2026-09-20", originalDue: "2026-09-20", extRequestedDue: "2026-10-30", extStatus: "pending" }, R, cfg);
  assert.equal(e.code, "overdue"); assert.equal(e.pendingExt, true); assert.equal(e.extended, false);
});

const pkgRow = (id, code, extra = {}) => ({ id, code, name: "Gói " + code, staffId: "a", staffName: "A", staff: { id: "a" }, year: 2026, rec: { status: "active" }, updatedAt: null,
  ev: { code: "on_track", progress: 0.5, done: 5, applicable: 10, current: { name: "Đóng thầu", plannedDate: "2026-10-10" }, targetSign: "2026-11-15", signedOn: null, ...extra } });

test("Gói thầu: gắn nhiệm vụ lấy % tự động; gói chưa gắn => dòng tự động; gói đã ký => hoàn thành", () => {
  const data = { staff: [{ id: "a", fullName: "A", role: "staff" }], tasks: [
    { id: "t1", title: "NV gắn gói", staffId: "a", packageId: "p1", dueDate: "2026-11-30", status: "in_progress", percent: 10 },
    { id: "t2", title: "NV gắn gói đã ký", staffId: "a", packageId: "p3", dueDate: "2026-09-30", status: "in_progress" },
  ], task_plans: [], weekly_reports: [] };
  const pk = [pkgRow("p1", "G1"), pkgRow("p2", "G2"), pkgRow("p3", "G3", { code: "completed", signedOn: "2026-09-29", progress: 1 })];
  const rows = buildTaskRows(data, pk, R, cfg);
  const t1 = rows.find((r) => r.id === "t1");
  assert.equal(t1.percent, 50);
  assert.match(t1.autoText, /Đóng thầu/);
  const t2 = rows.find((r) => r.id === "t2");
  assert.equal(t2.ev.code, "done"); assert.equal(t2.ev.completed, "2026-09-29");
  const v = rows.filter((r) => r.virtual);
  assert.deepEqual(v.map((r) => r.id), ["pkg:p2"]); // p1 đã gắn, p3 đã ký => không tạo dòng ảo
  assert.equal(v[0].ev.due, "2026-11-15");
  // Dòng ảo không sinh cảnh báo nhiệm vụ (đã có ở LCNT)
  assert.equal(taskAlerts(rows, R, cfg).action.filter((a) => a.recordId === "pkg:p2").length, 0);
});

test("Xếp hạng theo việc tồn, thống kê tháng, KPI, cảnh báo dữ liệu", () => {
  const data = { staff: [{ id: "a", fullName: "An", role: "staff" }, { id: "b", fullName: "Bình", role: "staff" }, { id: "v", fullName: "Xem", role: "viewer" }, { id: "tp", fullName: "TP", role: "manager" }],
    tasks: [
      { id: "1", title: "x", staffId: "a", assignedDate: "2026-09-01", dueDate: "2026-09-25", status: "in_progress", percent: 40, lastReportWeek: "2026-W40" },
      { id: "2", title: "y", staffId: "a", assignedDate: "2026-09-10", dueDate: "2026-10-03", status: "in_progress", percent: 100, lastReportWeek: "2026-W40" },
      { id: "3", title: "z", staffId: "b", assignedDate: "2026-08-05", dueDate: "2026-09-30", status: "done", completedDate: "2026-10-01", percent: 100 },
      { id: "4", title: "w", staffId: "b", assignedDate: "2026-08-20", status: "done", percent: 50 },
      { id: "5", title: "u", staffId: "b", assignedDate: "2026-08-01", dueDate: "2026-12-01", status: "not_started", percent: 0 },
    ], task_plans: [], weekly_reports: [{ staffId: "a", week: "2026-W40" }] };
  const rows = buildTaskRows(data, [], R, cfg);
  const rk = staffRanking(rows, data, R);
  assert.deepEqual(rk.map((x) => [x.name, x.rank, x.backlog, x.overdue]), [["An", 1, 2, 1], ["Bình", 2, 1, 0]]); // không tính tài khoản chỉ xem và Trưởng phòng
  assert.equal(rk[0].reported, true); assert.equal(rk[1].reported, false);
  assert.equal(rk[1].doneMonth, 1);
  const mx = monthMatrix(rows, rk.map((x) => x.staff), 2026, "assigned");
  assert.deepEqual(mx.totals.slice(7, 9), [3, 2]); assert.equal(mx.total, 5);
  const md = monthMatrix(rows, rk.map((x) => x.staff), 2026, "done");
  assert.equal(md.totals[9], 1); assert.equal(md.missing, 1); // NV 4 hoàn thành không có ngày
  const k = Object.fromEntries(taskKpis(rows, { reportDate: R, cfg }).map((x) => [x.key, x.value]));
  assert.equal(k.nv_open, 3); assert.equal(k.nv_overdue, 1); assert.equal(k.nv_due, 1); assert.equal(k.nv_done_month, 1);
  const al = taskAlerts(rows, R, cfg);
  assert.deepEqual(al.action.map((a) => a.kind).sort(), ["due_soon", "overdue"]);
  const kinds = al.data.map((a) => `${a.recordId}:${a.kind}`).sort();
  assert.ok(kinds.includes("2:nv_pct_full"));
  assert.ok(kinds.includes("4:nv_done_pct"));
  assert.ok(kinds.includes("5:nv_no_report"));
  assert.ok(!kinds.some((x) => x.startsWith("1:nv_no_report")));
});

import { similarity, matchVoRows, voMissing, periodOf, periodLabel } from "../src/lib/tasks.js";
test("Voffice: khớp theo ID, theo tên (1 việc VO nhiều cán bộ), việc mới, việc không còn trong VO", () => {
  const tasks = [
    { id: "a", title: "(NV TCT - TGĐ Hà) 118/KL-VP: Xây dựng giải pháp quản lý công trình hạ tầng ngầm, cống bể", staffId: "x", status: "in_progress" },
    { id: "b", title: "NV TCT (TGĐ Hà): Đăng ký các chương trình đào tạo năm 2027 trên NetCareer.", staffId: "x", status: "done" },
    { id: "c", title: "NV TCT (TGĐ Hà): Đăng ký các chương trình đào tạo năm 2027 trên NetCareer.", staffId: "y", status: "in_progress" },
    { id: "d", title: "Việc cũ", voId: "111", status: "in_progress" },
    { id: "e", title: "Việc VO đã khớp", voId: "222", status: "in_progress" },
  ];
  const vo = [
    { voId: "222", title: "Tên khác hẳn" },
    { voId: "861057", title: "(NV TCT - TGĐ Hà) 118/KL-VP: Xây dựng giải pháp quản lý công trình hạ tầng ngầm, cống bể - Đ/c Doanh chủ trì" },
    { voId: "854270", title: "NV TCT (TGĐ Hà): Đăng ký các chương trình đào tạo năm 2027 trên NetCareer" },
    { voId: "873053", title: "Hoàn thành các nội dung khóa học AI thực chiến" },
  ];
  const m = matchVoRows(vo, tasks);
  assert.equal(m[0].kind, "id"); assert.deepEqual(m[0].links.map((x) => x.task.id), ["e"]);
  assert.equal(m[1].kind, "name"); assert.deepEqual(m[1].links.map((x) => x.task.id), ["a"]);
  assert.deepEqual(m[2].links.map((x) => x.task.id).sort(), ["b", "c"]);
  assert.equal(m[3].kind, "new");
  assert.deepEqual(voMissing(vo, tasks).map((t) => t.id), ["d"]);
  assert.ok(similarity("Đăng ký đào tạo", "dang ky dao tao") === 1);
  assert.equal(periodOf("2026-10-08"), "2026-10"); assert.equal(periodOf("2026-11-30", "quarterly"), "2026-Q4");
  assert.equal(periodLabel("2026-10"), "T10/2026"); assert.equal(periodLabel("2026-Q4"), "Quý 4/2026");
});
