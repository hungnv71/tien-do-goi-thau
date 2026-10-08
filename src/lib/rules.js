// Quy tắc nghiệp vụ dùng chung — hàm thuần, không phụ thuộc giao diện.
// KPI, bảng, biểu đồ, cảnh báo và Excel đều tính từ đây nên luôn khớp nhau.
import { diffDays, workingDaysBetween, monthKey } from "./dates.js";

export const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export const DEFAULT_CFG = { dueSoonDays: 7, dueSoonLong: 14, contractSoonDays: 30, staleDays: 14, holidays: new Set(), dayMode: "calendar" };

/** Chênh lệch ngày theo chế độ (lịch/làm việc): b - a */
export const gap = (a, b, cfg = DEFAULT_CFG) => (cfg.dayMode === "working" ? workingDaysBetween(a, b, cfg.holidays) : diffDays(a, b));

// ------------------------------------------------------------------ nhãn
export const PKG_STATUS = {
  overdue: { label: "Quá hạn", tone: "red" },
  due_today: { label: "Đến hạn hôm nay", tone: "amber" },
  due_soon: { label: "Sắp đến hạn", tone: "amber" },
  on_track: { label: "Đúng tiến độ", tone: "green" },
  no_due: { label: "Chưa có hạn", tone: "gray" },
  completed: { label: "Đã ký HĐ", tone: "blue" },
  paused: { label: "Tạm dừng", tone: "gray" },
  cancelled: { label: "Đã hủy", tone: "gray" },
  no_milestones: { label: "Chưa có bộ mốc", tone: "gray" },
};
export const HD_PROGRESS = {
  overdue: { label: "Quá hạn", tone: "red" },
  due_today: { label: "Đến hạn hôm nay", tone: "amber" },
  due_soon: { label: "Sắp đến hạn", tone: "amber" },
  on_track: { label: "Đúng hạn", tone: "green" },
  no_due: { label: "Chưa có hạn", tone: "gray" },
  review: { label: "Cần rà soát hạn", tone: "amber" },
  done: { label: "Hoàn thành đúng hạn", tone: "blue" },
  done_late: { label: "Hoàn thành chậm", tone: "amber" },
  done_nodate: { label: "Hoàn thành – thiếu ngày TT", tone: "gray" },
  cancelled: { label: "Đã hủy", tone: "gray" },
  terminated: { label: "Chấm dứt", tone: "gray" },
};
export const EXEC_STATUS = { not_started: "Chưa bắt đầu", in_progress: "Đang thực hiện", paused: "Tạm dừng", completed: "Đã hoàn thành", terminated: "Chấm dứt", cancelled: "Đã hủy" };
export const ACC_STATUS = { none: "Chưa nghiệm thu", partial: "Nghiệm thu một phần", done: "Đã nghiệm thu" };
export const LIQ_STATUS = { none: "Chưa thanh lý", in_progress: "Đang thanh lý", done: "Đã thanh lý", other: "Phòng khác thực hiện" };
/** P.QLHT chỉ phải theo dõi thanh lý khi chính phòng theo dõi thanh toán; còn lại (P.QT, tỉnh, chưa xác định) chỉ lấy thông tin. */
export const liqTracked = (c) => c.paymentOwner === "qlht" && c.liquidationStatus !== "other";
/** Giá trị tiết kiệm = GT kế hoạch thầu − GT ký ban đầu (cùng tiền tệ HĐ, đủ 2 số). */
export function savingOf(c) {
  const p = num(c.plannedValue), s = num(c.signValue);
  if (p === null || s === null || !(p > 0) || !(s > 0)) return { planned: p, saving: null, pct: null };   // HĐ khung (GT = 0) không tính tiết kiệm
  return { planned: p, saving: p - s, pct: Math.round(((p - s) / p) * 10000) / 100 };
}
/** Ngày bất thường: hoàn thành / nghiệm thu / thanh lý trước ngày ký — cần đối chiếu hồ sơ, không tự sửa. */
export function dateIssues(c) {
  const out = [];
  if (!c.signDate) return out;
  for (const [f, lb] of [["actualCompletionDate", "Hoàn thành thực tế"], ["acceptanceDate", "Nghiệm thu"], ["liquidationDate", "Thanh lý"], ["originalDue", "Hạn hoàn thành"]]) if (c[f] && c[f] < c.signDate) out.push(`${lb} (${c[f].split("-").reverse().join("/")}) trước ngày ký`);
  return out;
}
export const PAY_OWNER = { qlht: "P.QLHT theo dõi", quyet_toan: "P.Quyết toán theo dõi", tinh: "Tỉnh theo dõi (HĐ khung)", khac: "Đơn vị khác" };
export const EXT_STATUS = { proposed: "Đề nghị", approved: "Đã phê duyệt", rejected: "Từ chối" };
export const PAY_KIND = {
  advance: "Tạm ứng", advance_recovery: "Thu hồi tạm ứng", payment: "Thanh toán (thực chi)",
  retention_release: "Chi trả khoản giữ lại", refund: "Nhà thầu hoàn trả", request: "Hồ sơ đề nghị TT",
};
export const TX_STATUS = { draft: "Nháp", confirmed: "Đã xác nhận", cancelled: "Hủy" };
export const STAGES = [
  { id: "chu_truong", label: "Chủ trương" }, { id: "ke_hoach", label: "Kế hoạch LCNT" },
  { id: "ho_so", label: "HSMT/HSYC" }, { id: "moi_thau", label: "Mời thầu & đóng thầu" },
  { id: "danh_gia", label: "Đánh giá" }, { id: "phe_duyet", label: "Phê duyệt kết quả" }, { id: "ky_hd", label: "Ký hợp đồng" },
];
export const STATUS_OPTIONS = [
  ["overdue", "Quá hạn"], ["due", "Đến hạn / sắp đến hạn"], ["on_track", "Đúng tiến độ"],
  ["no_due", "Chưa có hạn / cần rà soát"], ["done", "Đã hoàn thành"], ["inactive", "Tạm dừng / hủy"],
];
export const ROLE = { viewer: "Chỉ xem", staff: "Cán bộ", manager: "Lãnh đạo phòng", admin: "Quản trị" };
export const rank = (role) => ({ admin: 3, manager: 2, staff: 1 }[role] || 0);

// ------------------------------------------------------------------ mốc
/**
 * Trạng thái 1 mốc tại ngày báo cáo.
 * - Hoàn thành: tính chậm theo ngày hoàn thành thực tế, không tăng tiếp theo hôm nay.
 * - Hoàn thành sau ngày báo cáo => tại ngày đó coi như chưa hoàn thành.
 */
/** Mốc áp dụng: không bị đánh dấu bỏ qua, và mốc TÙY CHỌN chỉ áp dụng khi đã có hạn hoặc ngày thực tế. */
export const isApplicable = (m) => m.applicable !== false && !(m.required === false && !m.plannedDate && !m.actualDate);

export function milestoneState(m, reportDate, cfg = DEFAULT_CFG) {
  if (m.applicable === false) return { code: "skipped" };
  if (!isApplicable(m)) return { code: "optional_unused" };
  const due = m.plannedDate || null;
  if (m.actualDate && m.actualDate <= reportDate) {
    if (!due) return { code: "done", lateDays: 0, noDue: true };
    const late = gap(due, m.actualDate, cfg);
    return late > 0 ? { code: "done_late", lateDays: late } : { code: "done", lateDays: 0 };
  }
  if (!due) return { code: "no_due" };
  const d = gap(reportDate, due, cfg);
  if (d < 0) return { code: "overdue", lateDays: -d };
  if (d === 0) return { code: "due_today", lateDays: 0, daysLeft: 0 };
  if (d <= cfg.dueSoonDays) return { code: "due_soon", daysLeft: d };
  return { code: "on_track", daysLeft: d };
}
export const isDone = (m, reportDate) => !!m.actualDate && m.actualDate <= reportDate;

// ------------------------------------------------------------------ gói thầu (LCNT)
export function evalPackage(pkg, allMs, reportDate, cfg = DEFAULT_CFG) {
  const list = allMs.filter((m) => m.packageId === pkg.id).sort(byPos);
  const base = { milestones: list, overdue: [], lateDays: 0 };
  if (!list.length) return { ...base, code: "no_milestones", progress: null, done: 0, applicable: 0 };
  const app = list.filter(isApplicable);
  const totalW = sum(app.map((m) => m.weight ?? 1));
  const doneList = app.filter((m) => isDone(m, reportDate));
  const doneW = sum(doneList.map((m) => m.weight ?? 1));
  const current = app.find((m) => !isDone(m, reportDate)) || null;
  const states = new Map(list.map((m) => [m.id, milestoneState(m, reportDate, cfg)]));
  const overdue = app.filter((m) => states.get(m.id).code === "overdue");
  const lateDays = overdue.reduce((a, m) => Math.max(a, states.get(m.id).lateDays), 0);
  const cs = current ? states.get(current.id) : null;
  let code;
  if (pkg.status === "cancelled") code = "cancelled";
  else if (!current) code = "completed";
  else if (pkg.status === "paused") code = "paused";          // vẫn giữ danh sách quá hạn, không tự miễn
  else if (overdue.length) code = "overdue";
  else if (cs.code === "due_today") code = "due_today";
  else if (cs.code === "due_soon") code = "due_soon";
  else if (cs.code === "no_due") code = "no_due";
  else code = "on_track";
  const signMs = [...app].reverse().find((m) => m.stage === "ky_hd" || /hợp đồng/i.test(m.name)) || app[app.length - 1];
  return {
    ...base, code, states, current, currentState: cs, overdue, lateDays,
    done: doneList.length, applicable: app.length,
    progress: totalW > 0 ? doneW / totalW : null,
    stage: current?.stage || (current ? null : "ky_hd"),
    signMilestone: signMs,
    targetSign: pkg.targetSignDate || signMs?.plannedDate || null,
    signedOn: signMs && isDone(signMs, reportDate) ? signMs.actualDate : null,
    nextAction: current ? current.nextAction || pkg.nextAction || `Hoàn thành: ${current.name}` : pkg.nextAction || "",
  };
}

// ------------------------------------------------------------------ hợp đồng
const effOf = (e) => e.effectiveDate || e.signDate || null;
/**
 * Hạn hiện hành = hạn sau của lần gia hạn ĐÃ PHÊ DUYỆT, phạm vi toàn HĐ, CÓ HIỆU LỰC tại ngày xem.
 * Đề nghị chưa duyệt / đã duyệt nhưng chưa hiệu lực không làm đổi hạn. Xung đột => cần rà soát.
 */
export function contractDue(c, allExt, asOf) {
  const ext = allExt.filter((e) => e.contractId === c.id);
  const approved = ext.filter((e) => e.status === "approved" && (e.scope || "all") === "all");
  const effective = approved.filter((e) => effOf(e) && effOf(e) <= asOf && e.dueAfter)
    .sort((a, b) => (effOf(a) < effOf(b) ? -1 : effOf(a) > effOf(b) ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
  const latest = effective[effective.length - 1] || null;
  const conflict = !!latest && effective.some((e) => e !== latest && effOf(e) === effOf(latest) && e.dueAfter !== latest.dueAfter);
  return {
    originalDue: c.originalDue || null,
    currentDue: conflict ? null : latest ? latest.dueAfter : c.originalDue || null,
    extCount: effective.length,
    conflict,
    proposed: ext.filter((e) => e.status === "proposed"),
    notYetEffective: approved.filter((e) => effOf(e) && effOf(e) > asOf),
    missingDate: approved.filter((e) => !effOf(e)),
    all: ext.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
  };
}

export function contractProgress(c, allExt, reportDate, cfg = DEFAULT_CFG) {
  if (c.execStatus === "cancelled") return { code: "cancelled" };
  if (c.execStatus === "terminated") return { code: "terminated" };
  const doneOn = c.actualCompletionDate && c.actualCompletionDate <= reportDate ? c.actualCompletionDate : null;
  if (doneOn) {
    const dueAtDone = contractDue(c, allExt, doneOn);
    const ref = dueAtDone.currentDue;
    const lateOrig = c.originalDue ? Math.max(0, gap(c.originalDue, doneOn, cfg)) : null;
    if (!ref) return { code: "done", noDue: true, lateVsOriginal: lateOrig };
    const late = gap(ref, doneOn, cfg);
    return late > 0 ? { code: "done_late", lateDays: late, lateVsOriginal: lateOrig } : { code: "done", lateDays: 0, lateVsOriginal: lateOrig };
  }
  if (c.execStatus === "completed") return { code: "done_nodate" };
  const due = contractDue(c, allExt, reportDate);
  if (due.conflict) return { code: "review" };
  if (!due.currentDue) return { code: "no_due" };
  const d = gap(reportDate, due.currentDue, cfg);
  const lateVsOriginal = c.originalDue ? Math.max(0, gap(c.originalDue, reportDate, cfg)) : null;
  if (d < 0) return { code: "overdue", lateDays: -d, lateVsOriginal, paused: c.execStatus === "paused" };
  if (d === 0) return { code: "due_today", lateDays: 0, lateVsOriginal };
  if (d <= cfg.contractSoonDays) return { code: "due_soon", daysLeft: d, lateVsOriginal };
  return { code: "on_track", daysLeft: d, lateVsOriginal };
}

/** Giá trị hiện hành = giá trị ký ban đầu + các phụ lục điều chỉnh đã duyệt & có hiệu lực. Giữ nguyên giá trị gốc. */
export function contractValue(c, allAmd, asOf) {
  const amd = allAmd.filter((a) => a.contractId === c.id);
  const eff = amd.filter((a) => a.status === "approved" && (a.effectiveDate || a.docDate || "0000-00-00") <= asOf);
  const delta = sum(eff.map((a) => a.deltaValue));
  const original = num(c.signValue);
  return { original, delta, current: original === null ? null : original + delta, currency: c.currency || "VND", count: eff.length, pending: amd.filter((a) => a.status === "proposed").length };
}

/**
 * Thanh toán — chỉ cộng giao dịch ĐÃ XÁC NHẬN (bỏ nháp/hủy), cùng tiền tệ HĐ, ngày <= ngày báo cáo.
 * Đã thực chi = Tạm ứng + Thanh toán (thực chi, đã trừ thu hồi) + Chi trả khoản giữ lại − Nhà thầu hoàn trả.
 * Thu hồi tạm ứng KHÔNG cộng vào đã chi (tránh cộng hai lần), chỉ giảm dư tạm ứng.
 */
export function paymentSummary(c, allPay, allAcc, valueInfo, reportDate) {
  const cur = c.currency || "VND";
  const tx = allPay.filter((p) => p.contractId === c.id);
  const ok = tx.filter((p) => p.status === "confirmed" && (!p.payDate || p.payDate <= reportDate));
  const otherCur = ok.filter((p) => p.currency && p.currency !== cur);
  const valid = ok.filter((p) => !p.currency || p.currency === cur);
  const k = (kind) => sum(valid.filter((p) => p.kind === kind).map((p) => p.amount));
  const advance = k("advance"), recovery = k("advance_recovery"), payment = k("payment"), retention = k("retention_release"), refund = k("refund");
  const paid = advance + payment + retention - refund;
  const acceptance = sum(allAcc.filter((a) => a.contractId === c.id && a.status === "confirmed" && (!a.accDate || a.accDate <= reportDate)).map((a) => a.value));
  const dueUnpaid = sum(valid.filter((p) => p.kind === "request" && !p.settled && p.dueDate && p.dueDate <= reportDate).map((p) => p.amount));
  const base = valueInfo?.current;
  const rate = base && base > 0 && valueInfo.currency === cur ? Math.round((paid / base) * 1e6) / 1e4 : null;
  return {
    tracked: c.paymentOwner === "qlht", owner: c.paymentOwner || null, currency: cur,
    advance, recovery, advanceOutstanding: advance - recovery, payment, retention, refund, paid, acceptance, dueUnpaid,
    unpaidValue: base == null ? null : base - paid,
    rate, over100: rate !== null && rate > 100.0001,
    excludedOtherCurrency: otherCur.length, draftOrCancelled: tx.length - ok.length - tx.filter((p) => p.status === "confirmed" && p.payDate > reportDate).length,
    hasData: tx.length > 0,
  };
}

// ------------------------------------------------------------------ dựng dòng đánh giá (dùng chung)
export function buildPackageRows(data, reportDate, cfg) {
  const openIssues = groupIssues(data.issues, "package");
  return data.packages.map((p) => {
    const ev = evalPackage(p, data.package_milestones, reportDate, cfg);
    const staff = data.staff.find((s) => s.id === p.staffId);
    const tpl = data.workflow_templates.find((t) => t.id === p.templateId);
    const contracts = data.contracts.filter((c) => c.packageId === p.id);
    return {
      kind: "package", id: p.id, rec: p, ev, staff, staffId: p.staffId || null, staffName: staffLabel(staff),
      code: p.code || "", name: p.name, category: p.category || "", unit: p.unit || "", year: p.year || yearFrom(p.policyApprovedDate || p.createdAt),
      tplName: tpl?.name || "", contracts, issues: openIssues.get(p.id) || [],
      // cập nhật gần nhất của CẢ hồ sơ = max(thông tin gói, các mốc)
      updatedAt: lastOf([p.updatedAt, ...ev.milestones.map((m) => m.updatedAt)]), changedAfterReport: isAfter(p.updatedAt, reportDate) || ev.milestones.some((m) => isAfter(m.updatedAt, reportDate)),
      stale: isStale(lastOf([p.updatedAt, ...ev.milestones.map((m) => m.updatedAt)]), reportDate, cfg),
    };
  });
}
export function buildContractRows(data, reportDate, cfg) {
  const openIssues = groupIssues(data.issues, "contract");
  return data.contracts.map((c) => {
    const due = contractDue(c, data.contract_extensions, reportDate);
    const progress = contractProgress(c, data.contract_extensions, reportDate, cfg);
    const value = contractValue(c, data.contract_amendments, reportDate);
    const pay = paymentSummary(c, data.contract_payments, data.contract_acceptances, value, reportDate);
    const staff = data.staff.find((s) => s.id === c.staffId);
    const contractor = data.contractors.find((x) => x.id === c.contractorId);
    const issues = openIssues.get(c.id) || [];
    return {
      kind: "contract", id: c.id, rec: c, due, progress, value, pay, staff, staffId: c.staffId || null, staffName: staffLabel(staff),
      contractorId: c.contractorId || null, contractorName: contractor ? contractor.shortName || contractor.name : "",
      code: c.packageCode || "", no: c.contractNo, name: c.name || c.packageName || "", category: c.category || "", unit: c.unit || "",
      year: c.year || yearFrom(c.signDate), issues,
      nextAction: c.nextAction || contractNextAction(c, progress, due, pay),
      updatedAt: c.updatedAt, changedAfterReport: isAfter(c.updatedAt, reportDate), stale: isStale(c.updatedAt, reportDate, cfg),
      active: ["not_started", "in_progress", "paused"].includes(c.execStatus),
      saving: savingOf(c), dateIssues: dateIssues(c),
    };
  });
}
function contractNextAction(c, progress, due, pay) {
  if (due.proposed.length) return "Trình duyệt đề nghị gia hạn";
  if (progress.code === "overdue") return "Xử lý quá hạn: đôn đốc hoặc lập hồ sơ gia hạn";
  if (progress.code === "review") return "Rà soát các văn bản gia hạn xung đột";
  if (["done", "done_late", "done_nodate"].includes(progress.code) && liqTracked(c) && c.liquidationStatus !== "done") return "Nghiệm thu, thanh lý hợp đồng";
  if (progress.code === "no_due") return "Bổ sung hạn hoàn thành";
  if (pay.over100) return "Rà soát thanh toán vượt giá trị HĐ";
  return "";
}
function groupIssues(issues, entity) {
  const m = new Map();
  (issues || []).filter((i) => i.entity === entity && i.status !== "resolved").forEach((i) => m.set(i.entityId, [...(m.get(i.entityId) || []), i]));
  return m;
}
export const staffLabel = (s) => (s ? s.fullName || s.account || s.id : "Chưa phân công");
const lastOf = (arr) => arr.filter(Boolean).map(String).sort().pop() || null;
const yearFrom = (iso) => (iso ? Number(String(iso).slice(0, 4)) : null);
const isAfter = (ts, reportDate) => !!ts && String(ts).slice(0, 10) > reportDate;
const isStale = (ts, reportDate, cfg) => !!ts && diffDays(String(ts).slice(0, 10), reportDate) > cfg.staleDays;

// ------------------------------------------------------------------ KPI (mỗi KPI = 1 bộ lọc, bấm là ra đúng danh sách)
const PKG_OPEN = (r) => !["completed", "cancelled"].includes(r.ev.code);
const awaitingApproval = (r) => PKG_OPEN(r) && !!r.ev.current && /phê duyệt|thẩm định|quyết định/i.test(r.ev.current.name);
export const LCNT_KPI = [
  { key: "lcnt_open", label: "Đang tổ chức lựa chọn", icon: "01-tender", hint: "Gói chưa hoàn thành ký HĐ, không tính gói đã hủy", test: PKG_OPEN },
  { key: "lcnt_overdue", label: "Quá hạn mốc", icon: "03-deadline", tone: "red", hint: "Có ít nhất 1 mốc áp dụng đã quá hạn mà chưa hoàn thành", test: (r) => r.ev.overdue.length > 0 && r.ev.code !== "cancelled" },
  { key: "lcnt_due", label: "Đến hạn ≤ N ngày", icon: "03-deadline", tone: "amber", hint: "Bước hiện tại đến hạn trong N ngày (gồm hôm nay), chưa quá hạn", test: (r) => ["due_today", "due_soon"].includes(r.ev.code) },
  { key: "lcnt_approval", label: "Chờ phê duyệt", icon: "06-progress", hint: "Bước hiện tại là thẩm định / phê duyệt / quyết định", test: awaitingApproval },
  { key: "lcnt_signed", label: "Ký HĐ trong tháng", icon: "02-contract", tone: "blue", hint: "Mốc ký HĐ hoàn thành trong tháng của ngày báo cáo", test: (r, ctx) => !!r.ev.signedOn && monthKey(r.ev.signedOn) === monthKey(ctx.reportDate) },
  { key: "lcnt_missing", label: "Thiếu hạn / người phụ trách", icon: "08-responsibility", tone: "gray", hint: "Bước hiện tại chưa có hạn, hoặc gói chưa có cán bộ phụ trách", test: (r) => PKG_OPEN(r) && (r.ev.code === "no_due" || !r.staffId || r.ev.code === "no_milestones") },
];
export const HD_KPI = [
  { key: "hd_active", label: "Đang thực hiện", icon: "02-contract", hint: "Trạng thái thực hiện: chưa bắt đầu / đang thực hiện / tạm dừng", test: (r) => r.active },
  { key: "hd_overdue", label: "Quá hạn thực hiện", icon: "03-deadline", tone: "red", hint: "Chưa hoàn thành và ngày báo cáo > hạn hiện hành", test: (r) => r.progress.code === "overdue" },
  { key: "hd_expiring", label: "Sắp hết hạn ≤ N ngày", icon: "03-deadline", tone: "amber", hint: "0 ≤ hạn hiện hành − ngày báo cáo ≤ N, chưa hoàn thành", test: (r) => ["due_today", "due_soon"].includes(r.progress.code) },
  { key: "hd_ext", label: "Đang đề nghị gia hạn", icon: "04-extension", hint: "Có đề nghị gia hạn chưa được duyệt", test: (r) => r.due.proposed.length > 0 },
  { key: "hd_liq", label: "Chờ thanh lý", icon: "07-closeout", hint: "Đã hoàn thành, chưa thanh lý — chỉ HĐ do P.QLHT theo dõi thanh toán/thanh lý", test: (r) => ["done", "done_late", "done_nodate"].includes(r.progress.code) && liqTracked(r.rec) && r.rec.liquidationStatus !== "done" },
  { key: "hd_value", label: "Giá trị HĐ đang thực hiện", icon: "05-payment", tone: "money", hint: "Tổng giá trị hiện hành (VND) của HĐ đang thực hiện; không cộng gói thầu, không cộng ngoại tệ", test: (r) => r.active && r.value.current !== null && r.value.currency === "VND", money: true },
];
export const KPI_BY_KEY = Object.fromEntries([...LCNT_KPI, ...HD_KPI].map((k) => [k.key, k]));

export function computeKpis(defs, rows, ctx) {
  return defs.map((k) => {
    const hit = rows.filter((r) => k.test(r, ctx));
    const ids = new Set(hit.map((r) => r.id));               // đếm theo ID, không nhân đôi
    const value = k.money ? sum(hit.map((r) => r.value.current)) : ids.size;
    return { ...k, value, count: ids.size };
  });
}

// ------------------------------------------------------------------ cảnh báo & việc cần xử lý
const SEV = { overdue: 0, due_today: 1, due_soon: 2, pending_ext: 3, issue_overdue: 3, review: 3, await_liq: 5 };
/** Mỗi hồ sơ chỉ xuất hiện 1 lần trong danh sách hành động (loại nghiêm trọng nhất). */
export function buildAlerts(pkgRows, hdRows, reportDate, cfg) {
  const action = [], data = [];
  for (const r of pkgRows) {
    if (["cancelled", "completed"].includes(r.ev.code)) continue;
    const issue = r.issues[0];
    const common = { module: "lcnt", recordId: r.id, code: r.code || "—", title: r.name, staffId: r.staffId, staffName: r.staffName, issue: issue?.content || "", waitingOn: issue?.waitingOn || "", next: r.ev.nextAction };
    if (r.ev.overdue.length) {
      const m = r.ev.overdue[0];
      action.push({ ...common, kind: "overdue", task: m.name + (r.ev.overdue.length > 1 ? ` (+${r.ev.overdue.length - 1} mốc)` : ""), due: m.plannedDate, days: -r.ev.states.get(m.id).lateDays, paused: r.ev.code === "paused" });
    } else if (r.ev.current && ["due_today", "due_soon"].includes(r.ev.currentState.code)) {
      action.push({ ...common, kind: r.ev.currentState.code, task: r.ev.current.name, due: r.ev.current.plannedDate, days: r.ev.currentState.daysLeft ?? 0 });
    }
    if (r.ev.code === "no_milestones") data.push({ ...common, kind: "no_milestones", task: "Chưa có bộ mốc" });
    else if (r.ev.current && !r.ev.current.plannedDate) data.push({ ...common, kind: "no_due", task: `Bước "${r.ev.current.name}" chưa có hạn` });
    if (!r.staffId) data.push({ ...common, kind: "no_owner", task: "Chưa có cán bộ phụ trách" });
    if (r.stale) data.push({ ...common, kind: "stale", task: `Chưa cập nhật > ${cfg.staleDays} ngày` });
  }
  for (const r of hdRows) {
    const c = r.rec, p = r.progress;
    if (["cancelled", "terminated"].includes(p.code)) continue;
    const issue = r.issues[0];
    const common = { module: "hd", recordId: r.id, code: r.no, title: r.name, sub: r.contractorName, staffId: r.staffId, staffName: r.staffName, issue: issue?.content || "", waitingOn: issue?.waitingOn || "", next: r.nextAction };
    if (p.code === "overdue") action.push({ ...common, kind: "overdue", task: "Hoàn thành thực hiện HĐ", due: r.due.currentDue, days: -p.lateDays, paused: p.paused });
    else if (p.code === "due_today" || p.code === "due_soon") action.push({ ...common, kind: p.code, task: "Hoàn thành thực hiện HĐ", due: r.due.currentDue, days: p.daysLeft ?? 0 });
    else if (r.due.proposed.length) action.push({ ...common, kind: "pending_ext", task: `Duyệt đề nghị gia hạn lần ${r.due.proposed[0].seq ?? ""}`.trim(), due: r.due.proposed[0].dueAfter, days: null });
    else if (p.code === "review") action.push({ ...common, kind: "review", task: "Rà soát văn bản gia hạn xung đột", due: null, days: null });
    else if (["done", "done_late", "done_nodate"].includes(p.code) && liqTracked(c) && c.liquidationStatus !== "done") action.push({ ...common, kind: "await_liq", task: "Nghiệm thu, thanh lý", due: null, days: null });
    if (p.code === "no_due") data.push({ ...common, kind: "no_due", task: "Chưa có hạn hoàn thành" });
    if (p.code === "done_nodate") data.push({ ...common, kind: "missing_done_date", task: "Đã hoàn thành nhưng thiếu ngày hoàn thành thực tế" });
    if (liqTracked(c) && c.liquidationStatus === "done" && (!c.liquidationDate || !c.liquidationDoc)) data.push({ ...common, kind: "liq_missing", task: "Đã thanh lý nhưng thiếu ngày/hồ sơ thanh lý" });
    if (r.dateIssues?.length) data.push({ ...common, kind: "date_check", task: `Ngày cần kiểm tra: ${r.dateIssues.join("; ")}` });
    if (!r.staffId) data.push({ ...common, kind: "no_owner", task: "Chưa có cán bộ phụ trách" });
    if (r.active && r.stale) data.push({ ...common, kind: "stale", task: `Chưa cập nhật > ${cfg.staleDays} ngày` });
    if (r.pay.tracked && r.pay.over100) data.push({ ...common, kind: "pay_over", task: `Đã thanh toán ${r.pay.rate.toFixed(1)}% > 100% giá trị hiện hành` });
    for (const [f, lb] of [["guaranteeUntil", "bảo lãnh"], ["warrantyUntil", "bảo hành"]]) {
      if (c[f]) { const d = diffDays(reportDate, c[f]); if (d >= 0 && d <= cfg.contractSoonDays) action.push({ ...common, kind: "guarantee_soon", task: `Hết hạn ${lb}`, due: c[f], days: d }); }
    }
  }
  for (const r of [...pkgRows, ...hdRows]) for (const i of r.issues) {
    if (i.commitDue && i.commitDue < reportDate) data.push({ module: r.kind === "package" ? "lcnt" : "hd", recordId: r.id, code: r.code || r.no || "—", title: r.name, staffId: i.ownerStaffId, staffName: r.staffName, kind: "issue_overdue", task: `Vướng mắc quá hạn cam kết: ${i.content}`, due: i.commitDue, days: -diffDays(i.commitDue, reportDate), waitingOn: i.waitingOn });
  }
  action.sort((a, b) => (SEV[a.kind] ?? 4) - (SEV[b.kind] ?? 4) || (a.days ?? 999) - (b.days ?? 999));
  return { action, data };
}
export const ALERT_LABEL = {
  overdue: "Quá hạn", due_today: "Đến hạn hôm nay", due_soon: "Sắp đến hạn", pending_ext: "Chờ duyệt gia hạn", review: "Cần rà soát",
  await_liq: "Chờ thanh lý", guarantee_soon: "Sắp hết bảo lãnh/bảo hành", no_due: "Chưa có hạn", no_owner: "Thiếu người phụ trách",
  stale: "Lâu chưa cập nhật", no_milestones: "Chưa có bộ mốc", missing_done_date: "Thiếu ngày hoàn thành", liq_missing: "Thiếu hồ sơ thanh lý",
  pay_over: "Thanh toán > 100%", issue_overdue: "Vướng mắc quá hạn",
  date_check: "Ngày cần kiểm tra", nv_done_pct: "Hoàn thành nhưng % < 100", nv_pct_full: "100% chưa đóng việc", nv_no_report: "Lâu không báo cáo tuần",
};
export const MODULE_LABEL = { lcnt: "LCNT", hd: "Hợp đồng", nv: "Nhiệm vụ" };
export const MODULE_PAGE = { lcnt: "lcnt", hd: "hop-dong", nv: "nhiem-vu" };

/** Số ngày chậm/còn lại dạng chữ. */
export function daysText(days) {
  if (days === null || days === undefined) return "";
  if (days < 0) return `Chậm ${-days} ngày`;
  if (days === 0) return "Đến hạn hôm nay";
  return `Còn ${days} ngày`;
}

/** Tịnh tiến các mốc sau khi đổi hạn 1 mốc (không đổi kế hoạch ban đầu). */
export function cascadeShift(milestones, changed, newDate, cfg = DEFAULT_CFG) {
  if (!changed.plannedDate || !newDate) return [{ id: changed.id, plannedDate: newDate || null }];
  const delta = diffDays(changed.plannedDate, newDate);
  const out = [{ id: changed.id, plannedDate: newDate }];
  if (delta === 0) return out;
  for (const m of milestones) {
    if (m.id === changed.id || m.position <= changed.position || !m.plannedDate || m.actualDate) continue;
    out.push({ id: m.id, plannedDate: fromDaysShift(m.plannedDate, delta) });
  }
  return out;
}
const fromDaysShift = (iso, d) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };

/** Sinh lịch kế hoạch từ ngày mốc đầu + khoảng ngày chuẩn của bộ mốc. */
export function buildSchedule(tplMs, firstDate, addFn) {
  const sorted = [...tplMs].sort(byPos);
  const base = sorted.find((m) => m.offsetDays != null)?.offsetDays ?? 0;
  const out = {};
  for (const m of sorted) out[m.position] = firstDate && m.offsetDays != null ? addFn(firstDate, m.offsetDays - base) : null;
  return out;
}
