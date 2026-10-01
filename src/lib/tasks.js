// Quy tắc nghiệp vụ NHIỆM VỤ PHÒNG — hàm thuần, dùng chung cho bảng, xếp hạng, thống kê, cảnh báo, Excel.
import { toDays, fromDays, diffDays, monthKey } from "./dates.js";
import { staffLabel, rank } from "./rules.js";

export const TASK_TYPES = ["Nhiệm vụ được giao", "VO", "Nhiệm vụ thường xuyên", "Nhiệm vụ phát sinh", "Phiếu giao nhiệm vụ quý", "Kế hoạch phòng", "Gói thầu"];
export const TASK_STATUS = { not_started: "Chưa bắt đầu", in_progress: "Đang thực hiện", waiting: "Chờ ý kiến / phối hợp", done: "Hoàn thành", cancelled: "Hủy" };
export const TASK_STATE = {
  overdue: { label: "Quá hạn", tone: "red" },
  due_today: { label: "Đến hạn hôm nay", tone: "amber" },
  due_soon: { label: "Sắp đến hạn", tone: "amber" },
  on_track: { label: "Trong hạn", tone: "green" },
  no_due: { label: "Chưa có hạn", tone: "gray" },
  done: { label: "Hoàn thành đúng hạn", tone: "blue" },
  done_late: { label: "Hoàn thành chậm", tone: "amber" },
  done_nodate: { label: "Hoàn thành", tone: "blue" },
  cancelled: { label: "Hủy", tone: "gray" },
};
export const EXT_TASK = { pending: "Chờ duyệt gia hạn", approved: "Đã duyệt gia hạn", rejected: "Từ chối gia hạn" };
export const OPEN = (code) => !["done", "done_late", "done_nodate", "cancelled"].includes(code);
export const DONE = (code) => ["done", "done_late", "done_nodate"].includes(code);

// ------------------------------------------------------------------ tuần ISO (khớp to_char(d,'IYYY-"W"IW') của Postgres)
export function isoWeek(iso) {
  const d = toDays(iso);
  const wd = ((new Date(d * 864e5).getUTCDay() + 6) % 7) + 1; // T2=1..CN=7
  const thu = d - wd + 4;
  const y = Number(fromDays(thu).slice(0, 4));
  const w = Math.floor((thu - toDays(`${y}-01-01`)) / 7) + 1;
  return `${y}-W${String(w).padStart(2, "0")}`;
}
/** Thứ Hai & Chủ nhật của tuần ISO */
export function weekBounds(week) {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = toDays(`${y}-01-04`);
  const wd = ((new Date(jan4 * 864e5).getUTCDay() + 6) % 7) + 1;
  const mon = jan4 - wd + 1 + (w - 1) * 7;
  return { from: fromDays(mon), to: fromDays(mon + 6) };
}
export const weekLabel = (week) => { const { from, to } = weekBounds(week); const [y, w] = week.split("-W"); return `Tuần ${Number(w)}/${y} (${from.slice(8)}/${from.slice(5, 7)} – ${to.slice(8)}/${to.slice(5, 7)})`; };
export const prevWeek = (week) => isoWeek(fromDays(toDays(weekBounds(week).from) - 7));

// ------------------------------------------------------------------ đánh giá 1 nhiệm vụ
/**
 * - Hạn áp dụng = due_date (hạn hiện hành, đã khóa). Hạn gốc giữ ở original_due.
 * - Hoàn thành: chậm/đúng tính theo ngày hoàn thành so với hạn; không tăng tiếp theo hôm nay.
 * - Nhiệm vụ gắn gói thầu: % và kết quả lấy tự động từ phân hệ LCNT; gói đã ký HĐ => hoàn thành.
 */
export function evalTask(t, reportDate, cfg = {}, pkgRow = null) {
  const soon = cfg.taskSoonDays ?? 3;
  let status = t.status || "in_progress";
  let completed = t.completedDate || null;
  if (pkgRow) {
    if (pkgRow.ev.code === "completed" && status !== "cancelled") { status = "done"; completed = completed || pkgRow.ev.signedOn || null; }
    if (pkgRow.ev.code === "cancelled") status = "cancelled";
  }
  const due = t.dueDate || null;
  const base = { due, status, completed, waiting: status === "waiting", pendingExt: t.extStatus === "pending", extended: !!(t.originalDue && due && t.originalDue !== due) };
  if (status === "cancelled") return { ...base, code: "cancelled" };
  if (status === "done" && (!completed || completed <= reportDate)) {
    if (!completed || !due) return { ...base, code: completed ? "done" : "done_nodate", lateDays: 0 };
    const late = diffDays(due, completed);
    return late > 0 ? { ...base, code: "done_late", lateDays: late } : { ...base, code: "done", lateDays: 0 };
  }
  if (!due) return { ...base, code: "no_due" };
  const d = diffDays(reportDate, due);
  if (d < 0) return { ...base, code: "overdue", lateDays: -d };
  if (d === 0) return { ...base, code: "due_today", daysLeft: 0 };
  if (d <= soon) return { ...base, code: "due_soon", daysLeft: d };
  return { ...base, code: "on_track", daysLeft: d };
}

/** Dòng nhiệm vụ dùng chung. Gói thầu đang tổ chức chưa gắn nhiệm vụ => dòng ảo "Gói thầu (tự động)". */
export function buildTaskRows(data, pkgRows, reportDate, cfg = {}) {
  const tasks = data.tasks || [];
  const week = isoWeek(reportDate);
  const pkgById = new Map(pkgRows.map((r) => [r.id, r]));
  const plans = new Map((data.task_plans || []).map((p) => [p.id, p]));
  const linked = new Set(tasks.map((t) => t.packageId).filter(Boolean));
  const rows = tasks.map((t) => {
    const pkg = t.packageId ? pkgById.get(t.packageId) || null : null;
    const ev = evalTask(t, reportDate, cfg, pkg);
    const staff = data.staff.find((s) => s.id === t.staffId);
    const auto = pkg ? pkgAuto(pkg) : null;
    return {
      kind: "task", id: t.id, rec: t, ev, staff, staffId: t.staffId || null, staffName: staffLabel(staff),
      code: t.code || "", name: t.title, type: t.taskType || "", plan: plans.get(t.planId) || null, pkg,
      percent: auto ? auto.percent : t.percent == null ? null : Number(t.percent),
      autoText: auto?.text || "", year: Number((t.assignedDate || t.dueDate || String(t.createdAt || "")).slice(0, 4)) || null,
      reported: t.lastReportWeek === week, week, updatedAt: t.updatedAt,
    };
  });
  for (const p of pkgRows) {
    if (linked.has(p.id) || ["completed", "cancelled"].includes(p.ev.code)) continue;
    const auto = pkgAuto(p);
    const due = p.ev.targetSign || null;
    const t = { id: "pkg:" + p.id, code: p.code, title: p.name, taskType: "Gói thầu", staffId: p.staffId, dueDate: due, originalDue: due, status: p.rec.status === "paused" ? "waiting" : "in_progress", packageId: p.id };
    const ev = evalTask(t, reportDate, cfg, p);
    rows.push({
      kind: "task", virtual: true, id: t.id, rec: t, ev, staff: p.staff, staffId: p.staffId, staffName: p.staffName,
      code: p.code || "", name: p.name, type: "Gói thầu", plan: null, pkg: p, percent: auto.percent, autoText: auto.text,
      year: p.year, reported: true, week, updatedAt: p.updatedAt,
    });
  }
  return rows;
}
function pkgAuto(p) {
  const cur = p.ev.current;
  const pct = p.ev.progress == null ? null : Math.round(p.ev.progress * 100);
  const text = p.ev.code === "completed" ? `Đã ký HĐ${p.ev.signedOn ? " ngày " + p.ev.signedOn.split("-").reverse().join("/") : ""}`
    : cur ? `Bước hiện tại: ${cur.name}${cur.plannedDate ? " (hạn " + cur.plannedDate.split("-").reverse().join("/") + ")" : ""} · xong ${p.ev.done}/${p.ev.applicable} mốc` : "Chưa có bộ mốc";
  return { percent: pct, text };
}

// ------------------------------------------------------------------ KPI nhiệm vụ (mỗi KPI là 1 bộ lọc)
export const TASK_KPI = [
  { key: "nv_open", label: "Nhiệm vụ đang thực hiện", icon: "06-progress", hint: "Chưa hoàn thành, không tính hủy (không gồm gói thầu tự động)", test: (r) => !r.virtual && OPEN(r.ev.code) },
  { key: "nv_overdue", label: "Quá hạn", icon: "03-deadline", tone: "red", hint: "Chưa hoàn thành và ngày báo cáo > hạn hiện hành", test: (r) => !r.virtual && r.ev.code === "overdue" },
  { key: "nv_due", label: "Sắp đến hạn ≤ N ngày", icon: "03-deadline", tone: "amber", hint: "Đến hạn hôm nay hoặc trong N ngày tới", test: (r) => !r.virtual && ["due_today", "due_soon"].includes(r.ev.code) },
  { key: "nv_done_month", label: "Hoàn thành trong tháng", icon: "07-closeout", tone: "blue", hint: "Ngày hoàn thành thuộc tháng của ngày báo cáo", test: (r, ctx) => !r.virtual && DONE(r.ev.code) && !!r.ev.completed && monthKey(r.ev.completed) === monthKey(ctx.reportDate) },
  { key: "nv_ext", label: "Chờ duyệt gia hạn", icon: "04-extension", hint: "Cán bộ đã đề nghị gia hạn, chờ lãnh đạo duyệt", test: (r) => !r.virtual && r.ev.pendingExt && OPEN(r.ev.code) },
  { key: "nv_pkg", label: "Gói thầu đang tổ chức", icon: "01-tender", tone: "gray", hint: "Tự liên kết từ phân hệ LCNT (không cần nhập lại)", test: (r) => !!r.pkg && OPEN(r.ev.code) },
];
export function taskKpis(rows, ctx) {
  return TASK_KPI.map((k) => { const hit = rows.filter((r) => k.test(r, ctx)); return { ...k, value: hit.length, ids: new Set(hit.map((r) => r.id)) }; });
}

// ------------------------------------------------------------------ xếp hạng cá nhân theo số việc tồn
export function staffRanking(rows, data, reportDate, sortBy = "open") {
  const week = isoWeek(reportDate);
  const reported = new Set((data.weekly_reports || []).filter((w) => w.week === week).map((w) => w.staffId));
  // Không xếp hạng lãnh đạo phòng (người giao việc)
  const staff = data.staff.filter((s) => s.active !== false && rank(s.role) >= 1 && s.role !== "manager");
  const out = staff.map((s) => {
    const mine = rows.filter((r) => r.staffId === s.id);
    const real = mine.filter((r) => !r.virtual);
    const open = real.filter((r) => OPEN(r.ev.code));
    const pk = mine.filter((r) => r.virtual && OPEN(r.ev.code));
    const pcts = open.map((r) => r.percent).filter((v) => v != null);
    const lastRep = (data.weekly_reports || []).filter((w) => w.staffId === s.id).map((w) => w.week).sort().pop() || null;
    return {
      id: s.id, staff: s, name: staffLabel(s), total: real.length,
      open: open.length, overdue: open.filter((r) => r.ev.code === "overdue").length,
      dueSoon: open.filter((r) => ["due_today", "due_soon"].includes(r.ev.code)).length,
      noDue: open.filter((r) => r.ev.code === "no_due").length,
      waiting: open.filter((r) => r.ev.waiting).length,
      pkgOpen: pk.length,
      doneMonth: real.filter((r) => DONE(r.ev.code) && r.ev.completed && monthKey(r.ev.completed) === monthKey(reportDate)).length,
      doneTotal: real.filter((r) => DONE(r.ev.code)).length,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      reported: reported.has(s.id), lastReport: lastRep,
    };
  }).map((x) => ({ ...x, backlog: x.open + x.pkgOpen }));
  const key = { open: (x) => [x.backlog, x.overdue], overdue: (x) => [x.overdue, x.backlog], done: (x) => [x.doneMonth, -x.backlog] }[sortBy] || ((x) => [x.backlog, x.overdue]);
  out.sort((a, b) => { const ka = key(a), kb = key(b); return kb[0] - ka[0] || kb[1] - ka[1] || a.name.localeCompare(b.name, "vi"); });
  let prev = null, rk = 0;
  out.forEach((x, i) => { const k = key(x).join("|"); if (k !== prev) rk = i + 1; x.rank = rk; prev = k; });
  return out;
}

/** Ma trận số nhiệm vụ theo người × tháng. metric: assigned (ngày giao) | due (hạn) | done (ngày hoàn thành). */
export function monthMatrix(rows, staffList, year, metric = "assigned") {
  const dateOf = { assigned: (r) => r.rec.assignedDate, due: (r) => r.ev.due, done: (r) => (DONE(r.ev.code) ? r.ev.completed : null) }[metric];
  const real = rows.filter((r) => !r.virtual);
  const mk = (list) => { const c = Array(12).fill(0); for (const r of list) { const d = dateOf(r); if (d && Number(d.slice(0, 4)) === Number(year)) c[Number(d.slice(5, 7)) - 1]++; } return c; };
  const body = staffList.map((s) => { const c = mk(real.filter((r) => r.staffId === s.id)); return { id: s.id, name: staffLabel(s), counts: c, total: c.reduce((a, b) => a + b, 0) }; });
  const none = mk(real.filter((r) => !r.staffId));
  if (none.some(Boolean)) body.push({ id: "__none", name: "Chưa phân công", counts: none, total: none.reduce((a, b) => a + b, 0) });
  const totals = Array(12).fill(0).map((_, i) => body.reduce((a, r) => a + r.counts[i], 0));
  const missing = metric === "done" ? real.filter((r) => r.ev.code === "done_nodate").length : real.filter((r) => !dateOf(r)).length;
  return { body, totals, total: totals.reduce((a, b) => a + b, 0), missing };
}

// ------------------------------------------------------------------ cảnh báo nhiệm vụ (gói thầu ảo đã có cảnh báo ở LCNT)
export function taskAlerts(rows, reportDate, cfg = {}) {
  const action = [], data = [];
  const week = isoWeek(reportDate), pw = prevWeek(week);
  for (const r of rows) {
    if (r.virtual) continue;
    const t = r.rec, e = r.ev;
    const common = { module: "nv", recordId: r.id, code: r.code || "—", title: r.name, staffId: r.staffId, staffName: r.staffName, issue: t.difficulty || "", waitingOn: e.waiting ? "Chờ ý kiến / phối hợp" : "", next: t.nextPlan || "" };
    if (!OPEN(e.code)) {
      if (DONE(e.code) && r.percent != null && r.percent < 100 && !r.pkg) data.push({ ...common, kind: "nv_done_pct", task: `Đã hoàn thành nhưng % ghi ${r.percent}%` });
      continue;
    }
    if (e.code === "overdue") action.push({ ...common, kind: "overdue", task: "Hoàn thành nhiệm vụ", due: e.due, days: -e.lateDays });
    else if (e.code === "due_today" || e.code === "due_soon") action.push({ ...common, kind: e.code, task: "Hoàn thành nhiệm vụ", due: e.due, days: e.daysLeft ?? 0 });
    if (e.pendingExt) action.push({ ...common, kind: "pending_ext", task: `Duyệt gia hạn → ${(t.extRequestedDue || "").split("-").reverse().join("/")}`, due: t.extRequestedDue, days: null, next: t.extReason || "" });
    if (e.code === "no_due") data.push({ ...common, kind: "no_due", task: "Nhiệm vụ chưa có hạn hoàn thành" });
    if (!r.staffId) data.push({ ...common, kind: "no_owner", task: "Chưa có người chủ trì" });
    if (r.percent != null && r.percent >= 100) data.push({ ...common, kind: "nv_pct_full", task: "Đã 100% nhưng chưa chuyển Hoàn thành" });
    if (!r.pkg && t.lastReportWeek !== week && t.lastReportWeek !== pw && (t.assignedDate || "0000") < weekBounds(pw).from) data.push({ ...common, kind: "nv_no_report", task: "Không cập nhật tiến độ ≥ 2 tuần" });
  }
  return { action, data };
}
export const TASK_ALERT_LABEL = { nv_done_pct: "Hoàn thành nhưng % < 100", nv_pct_full: "100% chưa đóng việc", nv_no_report: "Lâu không báo cáo tuần" };
