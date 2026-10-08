// Xuất Excel (ExcelJS, có định dạng) & nhập Excel (SheetJS) — dùng CÙNG bộ dòng đã lọc với bảng/KPI/biểu đồ.
// Thư viện Excel tải khi cần (giảm dung lượng trang đầu)
const loadExcelJS = () => import("exceljs").then((m) => m.default || m);
const loadXLSX = () => import("xlsx");
import { fmtDate, parseDateCell } from "./dates.js";
import * as T from "./tasks.js";
import { PKG_STATUS, HD_PROGRESS, EXEC_STATUS, ACC_STATUS, LIQ_STATUS, PAY_OWNER, EXT_STATUS, ALERT_LABEL, LCNT_KPI, HD_KPI, HD_TOTAL_KPI, computeKpis, daysText, staffLabel, byPos, STATUS_OPTIONS } from "./rules.js";

const RED = "FFEE0033", DARK = "FF172033", ZEBRA = "FFF6F8FC";
const thin = { style: "thin", color: { argb: "FFD5DBE5" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function sheet(wb, name, title, sub, cols, rows, opt = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, xSplit: opt.freezeCols || 0 }] });
  ws.columns = cols.map((c) => ({ width: c.w || 14 }));
  ws.mergeCells(1, 1, 1, cols.length);
  Object.assign(ws.getCell(1, 1), { value: title });
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  ws.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = sub;
  ws.getCell(2, 1).font = { italic: true, color: { argb: "FF586579" } };
  ws.addRow([]);
  const h = ws.addRow(cols.map((c) => c.h));
  h.height = 30;
  h.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }; c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.border = border; });
  rows.forEach((r, i) => {
    const row = ws.addRow(cols.map((c) => { const v = c.v(r); return v === undefined || v === "" ? null : v; }));
    row.eachCell({ includeEmpty: true }, (cell, n) => {
      const col = cols[n - 1];
      cell.border = border;
      cell.alignment = { vertical: "top", wrapText: true, horizontal: col?.money || col?.num ? "right" : "left" };
      if (col?.money) cell.numFmt = "#,##0";
      if (col?.pct) cell.numFmt = "0.0";
      if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      if (col?.alert && opt.alertFill?.(r)) cell.font = { bold: true, color: { argb: "FFB91C1C" } };
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
  return ws;
}

export function filterText(f, data, me) {
  const parts = [f.scope === "mine" ? `Của tôi (${staffLabel(me)})` : "Toàn phòng"];
  if (f.staff) parts.push("Cán bộ: " + (f.staff === "__none" ? "Chưa phân công" : staffLabel(data.staff.find((s) => s.id === f.staff))));
  if (f.contractor) parts.push("Nhà thầu: " + (data.contractors.find((c) => c.id === f.contractor)?.name || f.contractor));
  if (f.category) parts.push("Nhóm: " + f.category);
  if (f.year) parts.push("Năm: " + f.year);
  if (f.status) parts.push("Trạng thái: " + (STATUS_OPTIONS.find((x) => x[0] === f.status)?.[1] || f.status));
  if (f.q) parts.push(`Tìm: "${f.q}"`);
  return parts.join(" · ");
}

export async function exportWorkbook({ data, pkgRows = [], hdRows = [], alerts, reportDate, cfg, filters, me, kpiKey }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.orgName;
  const ft = filterText(filters, data, me) + (kpiKey ? ` · Chỉ tiêu: ${kpiKey}` : "");
  const sub = `${cfg.orgName} · Ngày báo cáo: ${fmtDate(reportDate)} · Bộ lọc: ${ft} · Đơn vị tiền: VNĐ (ngoại tệ ghi rõ)`;

  // --- Thông tin & định nghĩa
  const ctx = { reportDate, cfg };
  const info = wb.addWorksheet("Định nghĩa");
  info.columns = [{ width: 34 }, { width: 18 }, { width: 110 }];
  info.addRow(["BÁO CÁO ĐIỀU HÀNH GÓI THẦU & HỢP ĐỒNG"]).font = { bold: true, size: 14, color: { argb: "FFEE0033" } };
  info.addRow([cfg.orgName]); info.addRow(["Ngày báo cáo", fmtDate(reportDate)]); info.addRow(["Bộ lọc", ft]);
  info.addRow(["Múi giờ", "Asia/Ho_Chi_Minh"]); info.addRow(["Đơn vị tiền", "VNĐ; hợp đồng ngoại tệ ghi rõ, không cộng chung"]);
  info.addRow([]);
  const hk = info.addRow(["Chỉ tiêu", "Giá trị", "Định nghĩa"]); hk.font = { bold: true };
  if (pkgRows.length) computeKpis(LCNT_KPI, pkgRows, ctx).forEach((k) => info.addRow([`LCNT · ${k.label.replace("N ngày", cfg.dueSoonDays + " ngày")}`, k.value, k.hint]));
  if (hdRows.length) computeKpis([...HD_TOTAL_KPI, ...HD_KPI], hdRows, ctx).forEach((k) => info.addRow([`HĐ · ${k.label.replace("N ngày", cfg.contractSoonDays + " ngày")}`, k.value, k.hint]));
  info.addRow([]);
  [
    ["Quá hạn", "Chưa hoàn thành và ngày báo cáo > hạn áp dụng; số ngày chậm = chênh lệch ngày lịch."],
    ["Đến hạn hôm nay", "Hạn = ngày báo cáo; số ngày chậm = 0."],
    ["Hoàn thành chậm", "Tính theo ngày hoàn thành thực tế so với hạn có hiệu lực tại ngày hoàn thành; không tăng theo ngày hiện tại."],
    ["Chưa có hạn", "Thiếu hạn không được coi là đúng tiến độ."],
    ["Hạn hiện hành (HĐ)", "Hạn sau của lần gia hạn đã phê duyệt, phạm vi toàn HĐ, có hiệu lực tại ngày báo cáo; đề nghị chưa duyệt không làm đổi hạn."],
    ["Số lần gia hạn", "Đếm các lần gia hạn đã phê duyệt và có hiệu lực tại ngày báo cáo."],
    ["Giá trị hiện hành", "Giá trị ký ban đầu + các phụ lục điều chỉnh đã phê duyệt, có hiệu lực. Không cộng gói thầu với HĐ; không cộng khác tiền tệ."],
    ["Đã thanh toán (thực chi)", "Tạm ứng + Thanh toán (thực chi) + Chi trả khoản giữ lại − Nhà thầu hoàn trả; chỉ giao dịch đã xác nhận. Thu hồi tạm ứng không cộng thêm."],
    ["Tỷ lệ thanh toán", "Đã thanh toán / Giá trị HĐ hiện hành × 100 (cùng tiền tệ, mẫu số > 0). Không phải tỷ lệ hoàn thành; > 100% là cảnh báo."],
    ["Giá trị HĐ chưa thanh toán", "Giá trị hiện hành − Đã thanh toán; không phải công nợ đến hạn."],
    ["Tiến độ các mốc", "Tỷ lệ (theo trọng số) các mốc áp dụng đã hoàn thành; mốc không áp dụng không vào mẫu số."],
  ].forEach((r) => info.addRow([r[0], "", r[1]]));

  if (pkgRows.length) {
    sheet(wb, "Lựa chọn nhà thầu", "DANH SÁCH GÓI THẦU — LỰA CHỌN NHÀ THẦU", sub, [
      { h: "Mã gói", w: 22, v: (r) => r.code }, { h: "Tên gói", w: 50, v: (r) => r.name }, { h: "Cán bộ", w: 16, v: (r) => r.staffName },
      { h: "Hình thức", w: 18, v: (r) => r.rec.selectionMethod }, { h: "Giá gói", w: 17, money: true, v: (r) => r.rec.packageValue },
      { h: "Bước hiện tại", w: 30, v: (r) => r.ev.current?.name || (r.ev.code === "completed" ? "Đã ký HĐ" : "") },
      { h: "Hạn bước", w: 12, v: (r) => fmtDate(r.ev.current?.plannedDate) },
      { h: "Còn / chậm", w: 16, alert: true, v: (r) => (r.ev.overdue.length ? daysText(-r.ev.lateDays) : r.ev.currentState?.daysLeft != null ? daysText(r.ev.currentState.daysLeft) : "") },
      { h: "Tiến độ các mốc (%)", w: 11, num: true, v: (r) => (r.ev.progress == null ? "" : Math.round(r.ev.progress * 100)) },
      { h: "Mục tiêu ký HĐ", w: 13, v: (r) => fmtDate(r.ev.targetSign) }, { h: "Việc tiếp theo", w: 34, v: (r) => r.ev.nextAction },
      { h: "Vướng mắc", w: 34, v: (r) => r.issues.map((i) => i.content + (i.waitingOn ? ` (chờ: ${i.waitingOn})` : "")).join("; ") },
      { h: "Đánh giá", w: 16, alert: true, v: (r) => PKG_STATUS[r.ev.code].label }, { h: "Số HĐ đã ký", w: 9, num: true, v: (r) => r.contracts.length },
    ], pkgRows, { freezeCols: 2, alertFill: (r) => r.ev.code === "overdue" });
    const msRows = pkgRows.flatMap((r) => [...r.ev.milestones].sort(byPos).map((m) => ({ r, m, s: r.ev.states?.get(m.id) })));
    sheet(wb, "Mốc LCNT", "CHI TIẾT MỐC LỰA CHỌN NHÀ THẦU", sub, [
      { h: "Mã gói", w: 22, v: (x) => x.r.code }, { h: "Tên gói", w: 40, v: (x) => x.r.name }, { h: "TT", w: 5, num: true, v: (x) => x.m.position },
      { h: "Mốc", w: 36, v: (x) => x.m.name }, { h: "Áp dụng", w: 9, v: (x) => (x.m.applicable === false ? "Không" + (x.m.skipReason ? `: ${x.m.skipReason}` : "") : "Có") },
      { h: "KH ban đầu", w: 12, v: (x) => fmtDate(x.m.baselineDate) }, { h: "Hạn hiện hành", w: 12, v: (x) => fmtDate(x.m.plannedDate) },
      { h: "Bắt đầu TT", w: 12, v: (x) => fmtDate(x.m.actualStart) }, { h: "Hoàn thành TT", w: 12, v: (x) => fmtDate(x.m.actualDate) },
      { h: "Số văn bản", w: 22, v: (x) => x.m.docNumber }, { h: "Trạng thái", w: 16, alert: true, v: (x) => ({ done: "Hoàn thành", done_late: `Hoàn thành chậm ${x.s?.lateDays} ngày`, overdue: `Quá hạn ${x.s?.lateDays} ngày`, due_today: "Đến hạn hôm nay", due_soon: `Còn ${x.s?.daysLeft} ngày`, on_track: "Đúng tiến độ", no_due: "Chưa có hạn", skipped: "Không áp dụng", optional_unused: "Tùy chọn – chưa dùng" }[x.s?.code] || "") },
      { h: "Nguyên nhân chậm", w: 30, v: (x) => x.m.delayReason }, { h: "Ghi chú", w: 30, v: (x) => x.m.note },
    ], msRows, { freezeCols: 2, alertFill: (x) => x.s?.code === "overdue" });
  }

  if (hdRows.length) {
    sheet(wb, "Hợp đồng", "DANH SÁCH HỢP ĐỒNG ĐÃ KÝ", sub, [
      { h: "Mã gói", w: 22, v: (r) => r.code }, { h: "Số HĐ", w: 30, v: (r) => r.no }, { h: "Nội dung", w: 46, v: (r) => r.name },
      { h: "Nhà thầu", w: 22, v: (r) => r.contractorName }, { h: "Cán bộ", w: 14, v: (r) => r.staffName }, { h: "Ngày ký", w: 12, v: (r) => fmtDate(r.rec.signDate) },
      { h: "Hạn ban đầu", w: 12, v: (r) => fmtDate(r.due.originalDue) }, { h: "Hạn hiện hành", w: 12, v: (r) => fmtDate(r.due.currentDue) },
      { h: "Gia hạn (lần)", w: 9, num: true, v: (r) => r.due.extCount }, { h: "Tiền tệ", w: 7, v: (r) => r.value.currency },
      { h: "Giá trị ký ban đầu", w: 18, money: true, v: (r) => r.value.original }, { h: "Giá trị hiện hành", w: 18, money: true, v: (r) => r.value.current },
      { h: "Tiến độ", w: 20, alert: true, v: (r) => (r.progress.liquidated ? "Đã thanh lý" : HD_PROGRESS[r.progress.code].label) + (r.progress.lateDays ? ` (${r.progress.lateDays} ngày)` : "") },
      { h: "Chậm so hạn gốc (ngày)", w: 11, num: true, v: (r) => r.progress.lateVsOriginal || "" },
      { h: "Thực hiện", w: 15, v: (r) => EXEC_STATUS[r.rec.execStatus] }, { h: "Nghiệm thu", w: 15, v: (r) => ACC_STATUS[r.rec.acceptanceStatus] },
      { h: "Thanh lý", w: 13, v: (r) => LIQ_STATUS[r.rec.liquidationStatus] }, { h: "Theo dõi thanh toán", w: 18, v: (r) => PAY_OWNER[r.pay.owner] || "Chưa xác định" },
      { h: "Đã thanh toán", w: 17, money: true, v: (r) => (r.pay.tracked ? r.pay.paid : "") }, { h: "Tỷ lệ TT (%)", w: 9, pct: true, v: (r) => (r.pay.tracked ? r.pay.rate : "") },
      { h: "Việc tiếp theo", w: 32, v: (r) => r.nextAction },
    ], hdRows, { freezeCols: 2, alertFill: (r) => r.progress.code === "overdue" });
    const ext = hdRows.flatMap((r) => r.due.all.map((e) => ({ r, e })));
    if (ext.length) sheet(wb, "Gia hạn", "DANH SÁCH GIA HẠN HỢP ĐỒNG", sub, [
      { h: "Số HĐ", w: 30, v: (x) => x.r.no }, { h: "Lần", w: 6, num: true, v: (x) => x.e.seq }, { h: "Số phụ lục/VB", w: 20, v: (x) => x.e.docNo },
      { h: "Ngày ký/duyệt", w: 12, v: (x) => fmtDate(x.e.signDate) }, { h: "Hiệu lực", w: 12, v: (x) => fmtDate(x.e.effectiveDate) },
      { h: "Hạn trước", w: 12, v: (x) => fmtDate(x.e.dueBefore) }, { h: "Hạn sau", w: 12, v: (x) => fmtDate(x.e.dueAfter) },
      { h: "Phạm vi", w: 12, v: (x) => (!x.e.scope || x.e.scope === "all" ? "Toàn HĐ" : x.e.scope) }, { h: "Trạng thái", w: 13, v: (x) => EXT_STATUS[x.e.status] }, { h: "Lý do", w: 40, v: (x) => x.e.reason },
    ], ext);
  }
  if (alerts) {
    const mods = new Set([pkgRows.length && "lcnt", hdRows.length && "hd"].filter(Boolean));
    const al = [...alerts.action.map((a) => ({ ...a, group: "Cần xử lý" })), ...alerts.data.map((a) => ({ ...a, group: "Dữ liệu" }))].filter((a) => mods.has(a.module));
    if (al.length) sheet(wb, "Cảnh báo", "CẢNH BÁO & VIỆC CẦN XỬ LÝ", sub, [
      { h: "Nhóm", w: 11, v: (a) => a.group }, { h: "Loại", w: 20, v: (a) => ALERT_LABEL[a.kind] }, { h: "Phân hệ", w: 10, v: (a) => (a.module === "hd" ? "Hợp đồng" : "LCNT") },
      { h: "Mã / số HĐ", w: 28, v: (a) => a.code }, { h: "Tên", w: 44, v: (a) => a.title }, { h: "Công việc", w: 34, v: (a) => a.task },
      { h: "Cán bộ", w: 14, v: (a) => a.staffName }, { h: "Hạn", w: 12, v: (a) => fmtDate(a.due) }, { h: "Còn / chậm", w: 16, alert: true, v: (a) => daysText(a.days) },
      { h: "Vướng mắc", w: 30, v: (a) => a.issue }, { h: "Chờ ai", w: 18, v: (a) => a.waitingOn }, { h: "Việc tiếp theo", w: 30, v: (a) => a.next },
    ], al, { alertFill: (a) => a.kind === "overdue" });
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `DieuHanh_GoiThau_HopDong_${reportDate}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================ NHẬP EXCEL
export const CONTRACT_COLS = ["Số Hiệu Gói Thầu", "Tên Gói Thầu", "Số Hợp Đồng", "Nội Dung Hợp Đồng", "Loại Gói Thầu", "Hình Thức LCNT", "GT Kế hoạch thầu (VNĐ)",
  "GT Hợp đồng (VNĐ)", "Tiền tệ", "Nhà Thầu Thực Hiện", "Ngày Ký HĐ", "Ngày HT Dự Kiến", "Ngày HT Thực Tế", "Tình Trạng", "Cán bộ", "Đơn vị", "Theo dõi thanh toán"];
export const PACKAGE_COLS = ["Mã gói", "Tên gói thầu", "Cán bộ", "Nhóm công việc", "Hình thức LCNT", "Giá gói (VNĐ)", "Ngày phê duyệt chủ trương", "Mục tiêu ký HĐ", "Đơn vị"];

export async function downloadTemplate(kind) {
  const XLSX = await loadXLSX();
  const cols = kind === "contract" ? CONTRACT_COLS : PACKAGE_COLS;
  const ex = kind === "contract"
    ? ["25042601_ĐTRR_VTNET_XL2026", "Củng cố sửa chữa trạm BTS", "24620266-BQLDA/VTNet - ACT/XL 2026", "Củng cố ... Phần 28", "Xây lắp", "Đấu thầu rộng rãi", 12954632371, 12889675769, "VND", "ACT", "29/06/2026", "24/02/2027", "", "Đang thực hiện", "hungnv71", "Phòng QLHT", "P.QLHT"]
    : ["GT-2026-040", "Khảo sát 500 trạm 5G quý 4/2026", "hungnv71", "Tư vấn", "Đấu thầu rộng rãi", 5000000000, "01/10/2026", "", "Phòng QLHT"];
  const ws = XLSX.utils.aoa_to_sheet([cols, ex]);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(14, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, kind === "contract" ? "HopDong" : "GoiThau");
  XLSX.writeFile(wb, kind === "contract" ? "Mau_nhap_hop_dong.xlsx" : "Mau_nhap_goi_thau.xlsx");
}

async function readRows(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  // Không dùng cellDates: đọc số serial Excel rồi quy đổi thuần số học, tránh lệch ngày theo múi giờ
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames.includes("DS GÓI THẦU") ? "DS GÓI THẦU" : wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  const hi = aoa.findIndex((r) => r.some((c) => /số\s*hợp\s*đồng|tên\s*gói/i.test(String(c).replace(/\n/g, " "))));
  if (hi < 0) throw new Error("Không tìm thấy dòng tiêu đề (cần cột 'Số Hợp Đồng' hoặc 'Tên gói thầu').");
  const head = aoa[hi].map((h) => String(h).replace(/\s+/g, " ").trim().toLowerCase());
  return { head, rows: aoa.slice(hi + 1).map((r, i) => ({ line: hi + 2 + i, r })) };
}
const col = (head, ...names) => { for (const n of names) { const i = head.findIndex((h) => h.startsWith(n.toLowerCase())); if (i >= 0) return i; } return -1; };
const s = (v) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
const n = (v) => { if (v === "" || v == null) return null; const x = typeof v === "number" ? v : Number(String(v).replace(/[.\s]/g, "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const findStaff = (data, key) => { const k = s(key).toLowerCase(); return k ? data.staff.find((x) => (x.account || "").toLowerCase() === k || (x.fullName || "").toLowerCase() === k) : null; };
const STATUS_IN = { "đang thực hiện": ["in_progress", "none"], "hoàn thành": ["completed", "none"], "đã kết thúc": ["completed", "none"], "đã thanh lý": ["completed", "done"], "tạm dừng": ["paused", "none"], "chấm dứt": ["terminated", "none"], "đã hủy": ["cancelled", "none"], "chưa bắt đầu": ["not_started", "none"] };
const OWNER_IN = { "p.qlht": "qlht", qlht: "qlht", "phòng qlht": "qlht", "p.quyết toán": "quyet_toan", "quyết toán": "quyet_toan", tỉnh: "tinh", "hđ khung": "tinh" };

/** Đọc file HĐ, kiểm tra từng dòng, phát hiện trùng số HĐ trong cùng đơn vị (với dữ liệu có sẵn và trong file). */
export async function parseContracts(file, data, meId) {
  const { head, rows } = await readRows(file);
  const I = {
    pcode: col(head, "số hiệu gói"), pname: col(head, "tên gói"), no: col(head, "số hợp đồng"), name: col(head, "nội dung"), cat: col(head, "loại gói"),
    method: col(head, "hình thức"), planned: col(head, "gt kế hoạch"), value: col(head, "gt hợp đồng", "giá trị"), cur: col(head, "tiền tệ"),
    ctr: col(head, "nhà thầu thực hiện", "nhà thầu"), sign: col(head, "ngày ký"), due: col(head, "ngày ht dự kiến", "hạn"), done: col(head, "ngày ht thực tế"),
    st: col(head, "tình trạng"), staff: col(head, "cán bộ", "ghi chú"), unit: col(head, "đơn vị"), owner: col(head, "theo dõi thanh toán"),
  };
  if (I.no < 0) throw new Error("Thiếu cột 'Số Hợp Đồng'.");
  const existing = new Map(data.contracts.map((c) => [`${s(c.contractNo).toUpperCase()}|${c.unit || ""}`, c]));
  const seen = new Set();
  const items = [], errors = [], newContractors = new Map();
  for (const { line, r } of rows) {
    const no = s(r[I.no]);
    if (!no) continue;
    if (/^(tổng|subtotal|chú thích)/i.test(s(r[0])) || /tổng/i.test(no)) continue;
    const errs = [];
    const unit = I.unit >= 0 ? s(r[I.unit]) || "Phòng QLHT" : "Phòng QLHT";
    const key = `${no.toUpperCase()}|${unit}`;
    if (seen.has(key)) errs.push("trùng số HĐ trong file");
    seen.add(key);
    const dup = existing.get(key);
    const dates = {};
    for (const [k, idx] of [["signDate", I.sign], ["originalDue", I.due], ["actualCompletionDate", I.done]]) {
      if (idx < 0) continue;
      const d = parseDateCell(r[idx]);
      if (d === undefined) errs.push(`ngày không hợp lệ ở cột ${head[idx]}`); else dates[k] = d;
    }
    const value = I.value >= 0 ? n(r[I.value]) : null, planned = I.planned >= 0 ? n(r[I.planned]) : null;
    if (Number.isNaN(value) || Number.isNaN(planned)) errs.push("giá trị không phải số");
    const stf = I.staff >= 0 ? findStaff(data, r[I.staff]) : null;
    const warn = [];
    if (I.staff >= 0 && s(r[I.staff]) && !stf) warn.push(`không thấy cán bộ "${s(r[I.staff])}" → để trống`);
    const ctrName = I.ctr >= 0 ? s(r[I.ctr]) : "";
    let ctr = ctrName ? data.contractors.find((c) => c.name.toUpperCase() === ctrName.toUpperCase() || (c.shortName || "").toUpperCase() === ctrName.toUpperCase()) : null;
    if (ctrName && !ctr) { ctr = newContractors.get(ctrName.toUpperCase()) || { id: "nt_" + Math.random().toString(36).slice(2, 10), name: ctrName, shortName: ctrName.length <= 20 ? ctrName : null, _new: true }; newContractors.set(ctrName.toUpperCase(), ctr); }
    const [exec, liq] = STATUS_IN[s(r[I.st]).toLowerCase()] || ["in_progress", "none"];
    const pkgCode = I.pcode >= 0 ? s(r[I.pcode]) : "";
    const pkg = pkgCode ? data.packages.find((p) => s(p.code).toUpperCase() === pkgCode.toUpperCase()) : null;
    const rec = {
      packageCode: pkgCode || null, packageName: I.pname >= 0 ? s(r[I.pname]) || null : null, packageId: pkg?.id || null, contractNo: no,
      name: I.name >= 0 ? s(r[I.name]) : "", category: I.cat >= 0 ? s(r[I.cat]) || null : null, selectionMethod: I.method >= 0 ? s(r[I.method]) || null : null,
      plannedValue: Number.isNaN(planned) ? null : planned, signValue: Number.isNaN(value) ? null : value, currency: (I.cur >= 0 && s(r[I.cur]).toUpperCase()) || "VND",
      contractorId: ctr?.id || null, unit, staffId: stf?.id || null, ...dates, execStatus: exec, liquidationStatus: liq,
      paymentOwner: I.owner >= 0 ? OWNER_IN[s(r[I.owner]).toLowerCase()] || null : null, year: dates.signDate ? Number(dates.signDate.slice(0, 4)) : null, source: "excel_import",
    };
    items.push({ line, rec, errs, warn, dup: !!dup, ctrName, staffLabel: stf ? staffLabel(stf) : "" });
  }
  return { items, newContractors: [...newContractors.values()], meId };
}

export async function parsePackages(file, data) {
  const { head, rows } = await readRows(file);
  const I = { code: col(head, "mã gói", "số hiệu"), name: col(head, "tên gói"), staff: col(head, "cán bộ"), cat: col(head, "nhóm", "loại gói"), method: col(head, "hình thức"),
    value: col(head, "giá gói"), policy: col(head, "ngày phê duyệt chủ trương", "ngày ký tờ trình"), target: col(head, "mục tiêu ký"), unit: col(head, "đơn vị") };
  if (I.name < 0) throw new Error("Thiếu cột 'Tên gói thầu'.");
  const existing = new Set(data.packages.filter((p) => p.code).map((p) => `${s(p.code).toUpperCase()}|${p.unit || ""}`));
  const seen = new Set();
  const items = [];
  for (const { line, r } of rows) {
    const name = s(r[I.name]);
    if (!name) continue;
    const errs = [], warn = [];
    const code = I.code >= 0 ? s(r[I.code]) : "";
    const unit = I.unit >= 0 ? s(r[I.unit]) || "Phòng QLHT" : "Phòng QLHT";
    const key = `${code.toUpperCase()}|${unit}`;
    if (code && seen.has(key)) errs.push("trùng mã gói trong file");
    if (code) seen.add(key);
    const policy = I.policy >= 0 ? parseDateCell(r[I.policy]) : null;
    const target = I.target >= 0 ? parseDateCell(r[I.target]) : null;
    if (policy === undefined || target === undefined) errs.push("ngày không hợp lệ");
    const value = I.value >= 0 ? n(r[I.value]) : null;
    if (Number.isNaN(value)) errs.push("giá gói không phải số");
    const stf = I.staff >= 0 ? findStaff(data, r[I.staff]) : null;
    if (I.staff >= 0 && s(r[I.staff]) && !stf) warn.push(`không thấy cán bộ "${s(r[I.staff])}"`);
    if (!policy) warn.push("chưa có ngày phê duyệt chủ trương → các mốc chưa có hạn");
    items.push({ line, errs, warn, dup: !!code && existing.has(key), staffLabel: stf ? staffLabel(stf) : "",
      rec: { code: code || null, name, staffId: stf?.id || null, category: I.cat >= 0 ? s(r[I.cat]) || null : null, selectionMethod: I.method >= 0 ? s(r[I.method]) || null : null,
        packageValue: Number.isNaN(value) ? null : value, policyApprovedDate: policy || null, targetSignDate: target || null, unit, currency: "VND", status: "active" } });
  }
  return { items };
}

// ============================================================ XUẤT EXCEL NHIỆM VỤ PHÒNG (theo mẫu BC_TienDo_PhongQLHT)
export async function exportTasksWorkbook({ data, rows, reportDate, cfg, filters, me }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.orgName;
  const week = T.isoWeek(reportDate);
  const sub = `${cfg.orgName} · Kỳ báo cáo: ${T.weekLabel(week)} · Ngày tổng hợp: ${fmtDate(reportDate)} · Bộ lọc: ${filterText(filters, data, me)}`;
  const real = rows.filter((r) => !r.virtual);
  const open = real.filter((r) => T.OPEN(r.ev.code));
  const ranking = T.staffRanking(rows, data, reportDate);
  const warn = (r) => (r.ev.code === "overdue" ? `QUÁ HẠN ${r.ev.lateDays} ngày` : r.ev.code === "due_today" ? "ĐẾN HẠN HÔM NAY" : r.ev.code === "due_soon" ? `Còn ${r.ev.daysLeft} ngày` : T.TASK_STATE[r.ev.code]?.label || "");

  // DASHBOARD
  const ws = wb.addWorksheet("DASHBOARD");
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 12 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }];
  ws.addRow(["BAN QLDA HẠ TẦNG VIỄN THÔNG"]).font = { bold: true };
  ws.addRow([cfg.orgName.toUpperCase()]).font = { bold: true };
  ws.addRow([]);
  const t1 = ws.addRow(["BÁO CÁO TỔNG HỢP TIẾN ĐỘ NHIỆM VỤ"]); t1.font = { bold: true, size: 14, color: { argb: RED } };
  ws.addRow([T.weekLabel(week)]).font = { italic: true };
  ws.addRow([`Ngày tổng hợp: ${fmtDate(reportDate)} · Số CBNV đã báo cáo tuần: ${ranking.filter((x) => x.reported).length}/${ranking.length}`]);
  ws.addRow([]);
  const hd = (cells) => { const r = ws.addRow(cells); r.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }; c.border = border; c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; }); r.height = 30; };
  const bodyRow = (cells, bold) => { const r = ws.addRow(cells); r.eachCell({ includeEmpty: true }, (c) => { c.border = border; if (bold) c.font = { bold: true }; }); return r; };
  ws.addRow(["I. CHỈ TIÊU CHUNG TOÀN PHÒNG"]).font = { bold: true };
  hd(["TT", "Chỉ tiêu", "Giá trị", "Ghi chú / cách tính"]);
  const cnt = (f) => real.filter(f).length;
  const pcts = real.map((r) => r.percent).filter((v) => v != null);
  [
    ["Tổng số nhiệm vụ", real.length, "Không gồm gói thầu tự động"],
    ...T.TASK_TYPES.filter((t) => t !== "Gói thầu").map((t) => [`  ${t}`, cnt((r) => r.type === t), "Theo loại nhiệm vụ"]),
    ["Đã hoàn thành", cnt((r) => T.DONE(r.ev.code)), "Trạng thái Hoàn thành"],
    ["Đang thực hiện", cnt((r) => r.ev.status === "in_progress" && T.OPEN(r.ev.code)), ""],
    ["Chưa bắt đầu", cnt((r) => r.ev.status === "not_started" && T.OPEN(r.ev.code)), ""],
    ["Chờ ý kiến / phối hợp", cnt((r) => r.ev.status === "waiting" && T.OPEN(r.ev.code)), ""],
    ["Nhiệm vụ QUÁ HẠN", cnt((r) => r.ev.code === "overdue"), "Chưa hoàn thành và ngày tổng hợp > hạn hiện hành"],
    [`Sắp đến hạn (≤ ${cfg.taskSoonDays} ngày)`, cnt((r) => ["due_today", "due_soon"].includes(r.ev.code)), "Cảnh báo sớm"],
    ["Chờ duyệt gia hạn", cnt((r) => r.ev.pendingExt && T.OPEN(r.ev.code)), ""],
    ["Gói thầu đang tổ chức (tự liên kết LCNT)", rows.filter((r) => r.virtual && T.OPEN(r.ev.code)).length, "Lấy từ phân hệ Lựa chọn nhà thầu"],
    ["Tỷ lệ hoàn thành (%)", real.length ? Math.round((cnt((r) => T.DONE(r.ev.code)) / real.length) * 1000) / 10 : 0, "Đã hoàn thành / Tổng nhiệm vụ"],
    ["Tiến độ bình quân (%)", pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0, "Bình quân % hoàn thành"],
  ].forEach((x, i) => bodyRow([i + 1, ...x]));
  ws.addRow([]);
  ws.addRow(["II. TIẾN ĐỘ THEO TỪNG CBNV (xếp theo số việc tồn)"]).font = { bold: true };
  hd(["Hạng", "Họ và tên", "Tổng NV", "Tồn", "Quá hạn", "Sắp đến hạn", "Gói thầu đang TC", "HT trong tháng", "Tiến độ BQ (%)", "BC tuần này", "BC gần nhất"]);
  ranking.forEach((x) => { const r = bodyRow([x.rank, x.name, x.total, x.backlog, x.overdue, x.dueSoon, x.pkgOpen, x.doneMonth, x.avgPct ?? "", x.reported ? "Đã gửi" : "Chưa gửi", x.lastReport || "Chưa có"]); if (x.overdue) r.getCell(5).font = { bold: true, color: { argb: "FFB91C1C" } }; if (!x.reported) r.getCell(10).font = { color: { argb: "FFB45309" } }; });
  bodyRow(["", "TỔNG CỘNG", ...[2, 3, 4, 5, 6, 7].map((k) => ranking.reduce((a, x) => a + [x.total, x.backlog, x.overdue, x.dueSoon, x.pkgOpen, x.doneMonth][k - 2], 0)), "", "", ""], true);

  // CHI TIẾT
  const list = [...rows].sort((a, b) => a.staffName.localeCompare(b.staffName, "vi") || String(a.ev.due || "9").localeCompare(String(b.ev.due || "9"))).map((r, i) => ({ ...r, stt: i + 1 }));
  sheet(wb, "ChiTiet_ToanPhong", "TỔNG HỢP CHI TIẾT NHIỆM VỤ - PHÒNG", sub, [
    { h: "STT", w: 5, num: true, v: (r) => r.stt }, { h: "Người thực hiện", w: 20, v: (r) => r.staffName }, { h: "Tài khoản", w: 14, v: (r) => r.staff?.account },
    { h: "Mã NV", w: 11, v: (r) => r.code }, { h: "Loại nhiệm vụ", w: 16, v: (r) => r.type }, { h: "Tên nhiệm vụ / Nội dung công việc", w: 50, v: (r) => r.name },
    { h: "Văn bản giao", w: 18, v: (r) => r.rec.sourceDoc }, { h: "Ngày giao", w: 11, v: (r) => fmtDate(r.rec.assignedDate) }, { h: "Hạn hoàn thành", w: 11, v: (r) => fmtDate(r.ev.due) },
    { h: "Hạn giao ban đầu", w: 11, v: (r) => fmtDate(r.rec.originalDue) }, { h: "Sản phẩm đầu ra", w: 30, v: (r) => r.rec.output },
    { h: "% Hoàn thành", w: 9, num: true, v: (r) => (r.percent == null ? "" : Math.round(r.percent)) }, { h: "Trạng thái", w: 14, v: (r) => T.TASK_STATUS[r.ev.status] },
    { h: "Cảnh báo hạn (tự động)", w: 16, alert: true, v: warn }, { h: "Kết quả đã thực hiện", w: 36, v: (r) => r.autoText || r.rec.resultTotal },
    { h: "Kết quả thực hiện trong tuần", w: 36, v: (r) => r.rec.weekResult }, { h: "Kế hoạch tiếp theo", w: 30, v: (r) => r.rec.nextPlan },
    { h: "Khó khăn, vướng mắc", w: 28, v: (r) => r.rec.difficulty }, { h: "Đề xuất, kiến nghị", w: 28, v: (r) => r.rec.proposal || (r.rec.extStatus === "pending" ? `Đề nghị gia hạn đến ${fmtDate(r.rec.extRequestedDue)}: ${r.rec.extReason || ""}` : "") },
    { h: "BC tuần", w: 10, v: (r) => (r.virtual ? "Tự động" : r.reported ? "Đã cập nhật" : "Chưa") }, { h: "Ghi chú", w: 20, v: (r) => r.rec.note },
  ], list, { freezeCols: 3, alertFill: (r) => r.ev.code === "overdue" });

  // CẢNH BÁO
  const al = open.filter((r) => ["overdue", "due_today", "due_soon"].includes(r.ev.code)).sort((a, b) => (b.ev.lateDays || 0) - (a.ev.lateDays || 0) || (a.ev.daysLeft ?? 0) - (b.ev.daysLeft ?? 0)).map((r, i) => ({ ...r, stt: i + 1 }));
  sheet(wb, "CanhBao_QuaHan", "DANH SÁCH NHIỆM VỤ QUÁ HẠN / SẮP ĐẾN HẠN", `Tính đến ngày ${fmtDate(reportDate)} · ${sub}`, [
    { h: "STT", w: 5, num: true, v: (r) => r.stt }, { h: "Người thực hiện", w: 20, v: (r) => r.staffName }, { h: "Loại nhiệm vụ", w: 16, v: (r) => r.type },
    { h: "Tên nhiệm vụ", w: 55, v: (r) => r.name }, { h: "Hạn hoàn thành", w: 12, v: (r) => fmtDate(r.ev.due) }, { h: "Số ngày quá hạn / còn lại", w: 18, alert: true, v: warn },
    { h: "% Hoàn thành", w: 9, num: true, v: (r) => (r.percent == null ? "" : Math.round(r.percent)) }, { h: "Khó khăn / Đề xuất", w: 40, v: (r) => [r.rec.difficulty, r.rec.proposal].filter(Boolean).join(" · ") },
  ], al, { alertFill: (r) => r.ev.code === "overdue" });

  // THỐNG KÊ THÁNG
  const yr = Number(reportDate.slice(0, 4));
  const staffList = ranking.map((x) => x.staff);
  for (const [metric, name, sh] of [["assigned", "Giao mới", "GiaoMoi"], ["done", "Hoàn thành", "HoanThanh"]]) {
    const mx = T.monthMatrix(rows, staffList, yr, metric);
    sheet(wb, `TK_${sh}_${yr}`, `SỐ NHIỆM VỤ ${name.toUpperCase()} THEO NGƯỜI × THÁNG NĂM ${yr}`, sub,
      [{ h: "Cán bộ", w: 24, v: (b) => b.name }, ...Array.from({ length: 12 }, (_, i) => ({ h: `T${i + 1}`, w: 6, num: true, v: (b) => b.counts[i] || "" })), { h: "Cả năm", w: 8, num: true, v: (b) => b.total }],
      [...mx.body, { name: "TOÀN PHÒNG", counts: mx.totals, total: mx.total }]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `BC_TienDo_NhiemVu_${week}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================ XUẤT EXCEL HỢP ĐỒNG THEO MẪU "Báo cáo các HĐ" (TỔNG HỢP + DS GÓI THẦU)
const HD_RED = "FF5B9BD5", HD_PINK = "FFF2F7FC", HD_HEAD2 = "FFDDEBF7";   // tông xanh nhạt (theo yêu cầu)
export const hdStatusText = (c) => (c.liquidationStatus === "done" && !["cancelled", "terminated"].includes(c.execStatus) ? "Đã thanh lý" : null) || ({ cancelled: "Đã hủy", terminated: "Chấm dứt", paused: "Tạm dừng", not_started: "Đang thực hiện", in_progress: "Đang thực hiện" }[c.execStatus]
  || (c.liquidationStatus === "done" ? "Đã thanh lý" : "Đã kết thúc"));
const xlDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : iso || null);

export async function exportContractsTracking({ data, hdRows, reportDate, cfg, filters, me, kpiKey }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.orgName;
  const rows = [...hdRows].sort((a, b) => String(a.rec.signDate || "9").localeCompare(String(b.rec.signDate || "9")));
  const years = rows.map((r) => r.rec.signDate).filter(Boolean).sort();
  const ky = years.length ? `${fmtDate(years[0])} – ${fmtDate(reportDate)}` : fmtDate(reportDate);
  const ft = filterText(filters, data, me) + (kpiKey ? ` · Chỉ tiêu: ${kpiKey}` : "");
  const N0 = 6, N1 = N0 + Math.max(rows.length, 1) - 1;          // dòng dữ liệu
  const DS = "'DS GÓI THẦU'";
  const rng = (col) => `${DS}!$${col}$${N0}:$${col}$${N1}`;
  const vnd = (r) => (r.value.currency || "VND") === "VND";
  const J = (r) => (vnd(r) && r.rec.signValue != null ? Number(r.rec.signValue) : null);
  // HĐ khung / chưa có GT ký (= 0): không cộng GT KH thầu để tiết kiệm không bị thổi phồng (ghi ở Ghi chú)
  const I = (r) => (vnd(r) && r.rec.plannedValue != null && J(r) > 0 ? Number(r.rec.plannedValue) : null);
  const ctr = (r) => r.contractorName || "";
  const thin2 = { style: "thin", color: { argb: "FFBDD7EE" } };
  const bd = { top: thin2, left: thin2, bottom: thin2, right: thin2 };
  const NUM = "#,##0;(#,##0);-", TY = "#,##0.00;(#,##0.00);-";

  // ---------- TỔNG HỢP (tạo trước để đứng đầu, điền sau)
  const th = wb.addWorksheet("TỔNG HỢP", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  // ---------- DS GÓI THẦU
  const ds = wb.addWorksheet("DS GÓI THẦU", { views: [{ state: "frozen", ySplit: 5, xSplit: 3 }] });
  const COLS = [["STT", 5], ["Số Hiệu\nGói Thầu", 18], ["Số Hợp Đồng", 34], ["Nội Dung\nHợp Đồng", 32], ["Tên Gói Thầu", 42], ["Loại Gói\nThầu", 16], ["Phân Loại\nDV Phi TV", 14],
    ["Hình Thức\nLCNT", 19], ["GT Kế hoạch thầu\n(VNĐ)", 19], ["GT Hợp đồng\n(VNĐ)", 19], ["Tiết Kiệm\n(VNĐ)", 17], ["Nhà Thầu Thực Hiện", 26], ["Kiểm Tra\nNhà Thầu", 14],
    ["Ngày Ký\nHĐ", 12], ["Năm\nKý HĐ", 8], ["Ngày HT\nDự Kiến", 12], ["Ngày HT\nThực Tế", 12], ["Tình Trạng", 16], ["Ghi Chú", 24]];
  ds.columns = COLS.map(([, w]) => ({ width: w }));
  ds.mergeCells(1, 1, 1, 19); ds.mergeCells(2, 1, 2, 19); ds.mergeCells(3, 1, 3, 19);
  Object.assign(ds.getCell("A1"), { value: "BÁO CÁO KẾT QUẢ TỔ CHỨC LỰA CHỌN NHÀ THẦU" });
  ds.getCell("A1").font = { bold: true, size: 17, color: { argb: "FFFFFFFF" } };
  ds.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_RED } };
  ds.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  ds.getCell("A2").value = `${cfg.orgName} |  Kỳ báo cáo: ${ky}  |  Đơn vị giá trị: VNĐ  |  Bộ lọc: ${ft}`;
  ds.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF1F4E79" } };
  ds.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_PINK } };
  ds.getRow(1).height = 32; ds.getRow(3).height = 6; ds.getRow(4).height = 34;
  COLS.forEach(([h], i) => {
    const c = ds.getCell(4, i + 1);
    c.value = h; c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_RED } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.border = bd;
  });
  const sumI = rows.reduce((a, r) => a + (I(r) || 0), 0), sumJ = rows.reduce((a, r) => a + (J(r) || 0), 0);
  const hasK = (r) => I(r) != null && J(r) != null && J(r) > 0;
  const sumK = rows.reduce((a, r) => a + (hasK(r) ? I(r) - J(r) : 0), 0);
  const uniq = (arr) => new Set(arr.filter(Boolean)).size;
  const sub = ds.getRow(5);
  sub.values = ["SUBTOTAL", { formula: `SUMPRODUCT((B${N0}:B${N1}<>"")/COUNTIF(B${N0}:B${N1},B${N0}:B${N1}&""))`, result: uniq(rows.map((r) => r.code)) },
    { formula: `SUBTOTAL(3,C${N0}:C${N1})`, result: rows.length }, "◄ Tổng theo BỘ LỌC", null, null, null, null,
    { formula: `SUBTOTAL(9,I${N0}:I${N1})`, result: sumI }, { formula: `SUBTOTAL(9,J${N0}:J${N1})`, result: sumJ }, { formula: `SUBTOTAL(9,K${N0}:K${N1})`, result: sumK },
    { formula: "IFERROR(K5/I5,0)", result: sumI ? sumK / sumI : 0 }, { formula: `SUMPRODUCT((L${N0}:L${N1}<>"")/COUNTIF(L${N0}:L${N1},L${N0}:L${N1}&""))`, result: uniq(rows.map(ctr)) }];
  sub.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > 19) return;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n === 1 ? HD_RED : HD_PINK } };
    c.font = { bold: true, size: 10.5, color: { argb: n === 1 ? "FFFFFFFF" : "FF2F5597" } }; c.border = bd;
  });
  ds.getCell("B5").numFmt = '#,##0" gói"'; ds.getCell("C5").numFmt = '#,##0" HĐ"'; ds.getCell("L5").numFmt = "0.00%"; ds.getCell("M5").numFmt = '#,##0" NT"';
  ["I5", "J5", "K5"].forEach((k) => { ds.getCell(k).numFmt = NUM; });
  const ctrList = [...new Set(rows.map(ctr).filter(Boolean))];
  rows.forEach((r, i) => {
    const n = N0 + i, c = r.rec;
    const note = [r.staff?.account || r.staffName, vnd(r) && r.rec.plannedValue != null && !(J(r) > 0) ? `GT KH thầu ${new Intl.NumberFormat("vi-VN").format(Number(r.rec.plannedValue))} — HĐ khung/chưa có GT ký, không tính tiết kiệm` : "", !vnd(r) ? `GT ${new Intl.NumberFormat("vi-VN").format(Number(c.signValue) || 0)} ${r.value.currency} — không cộng vào tổng VNĐ` : "", r.dateIssues?.length ? `Ngày cần kiểm tra: ${r.dateIssues.join("; ")}` : ""].filter(Boolean).join(" · ");
    const row = ds.getRow(n);
    row.values = [i + 1, r.code || null, r.no, r.name || null, c.packageName || null, r.category || null, null, c.selectionMethod || null, I(r), J(r),
      { formula: `IF(OR(I${n}="",J${n}="",J${n}=0),"",I${n}-J${n})`, result: hasK(r) ? I(r) - J(r) : "" }, ctr(r) || null,
      { formula: `IF($L${n}="","",IFERROR(VLOOKUP($L${n},'TỔNG HỢP'!$B$${0}:$B$${0},1,FALSE),"⚠ CHƯA CÓ Ở TỔNG HỢP"))`, result: ctr(r) || "" },
      xlDate(c.signDate), c.signDate ? { formula: `YEAR(N${n})`, result: Number(c.signDate.slice(0, 4)) } : null, xlDate(r.due.currentDue), xlDate(c.actualCompletionDate), hdStatusText(c), note || null];
    row.eachCell({ includeEmpty: true }, (cell, k) => {
      if (k > 19) return;
      cell.border = bd; cell.font = { size: 9.5 }; cell.alignment = { vertical: "top", wrapText: [3, 4, 5, 12, 19].includes(k) };
      if ([9, 10, 11].includes(k)) cell.numFmt = "#,##0";
      if ([14, 16, 17].includes(k)) cell.numFmt = "dd/mm/yyyy";
    });
    const st = row.getCell(18);
    const tone = { "Đang thực hiện": ["FF1565C0", "FFE3F2FD"], "Đã kết thúc": ["FF2E7D32", "FFE8F5E9"], "Đã thanh lý": ["FF6A1B9A", "FFF3E5F5"] }[st.value];
    if (tone) { st.font = { size: 9.5, bold: true, color: { argb: tone[0] } }; st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone[1] } }; }
    if (r.progress.code === "overdue") row.getCell(16).font = { size: 9.5, bold: true, color: { argb: "FFB91C1C" } };
  });
  ds.autoFilter = { from: { row: 4, column: 1 }, to: { row: N1, column: 19 } };

  // ---------- TỔNG HỢP: thẻ + 5 bảng phân loại (công thức liên kết DS GÓI THẦU, kèm giá trị tính sẵn)
  th.columns = [{ width: 4 }, { width: 46 }, { width: 11 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 10 }];
  th.mergeCells("B1:K1"); th.mergeCells("B2:K2");
  th.getCell("B1").value = `BÁO CÁO TỔNG HỢP KẾT QUẢ LỰA CHỌN NHÀ THẦU`;
  th.getCell("B1").font = { bold: true, size: 19, color: { argb: "FFFFFFFF" } };
  th.getCell("B1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_RED } };
  th.getCell("B1").alignment = { vertical: "middle", horizontal: "center" };
  th.getRow(1).height = 34;
  th.getCell("B2").value = `${cfg.orgName}   |   Kỳ báo cáo: ${ky}   |   Đơn vị giá trị: tỷ đồng   |   Số liệu liên kết động từ sheet 'DS GÓI THẦU'   |   Bộ lọc: ${ft}`;
  th.getCell("B2").font = { size: 10, color: { argb: "FF1F4E79" } };
  th.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_PINK } };
  const ty9 = (v) => Math.round((v / 1e9) * 100) / 100;
  const cards = [["B", "C", "TỔNG GÓI THẦU", uniq(rows.map((r) => r.code)), NUM, "gói (không trùng số hiệu)"], ["D", "E", "TỔNG HỢP ĐỒNG", rows.length, NUM, "hợp đồng"],
    ["F", "G", "GT KẾ HOẠCH THẦU", ty9(sumI), TY, "tỷ đồng"], ["H", "I", "GT TRÚNG THẦU", ty9(sumJ), TY, "tỷ đồng"],
    ["J", "K", "TIẾT KIỆM", ty9(sumK), TY, `tỷ đồng (tiết kiệm ${sumI ? Math.round((sumK / sumI) * 10000) / 100 : 0}%)`]];
  for (const [a, b, lb, v, fmt, unit] of cards) {
    th.mergeCells(`${a}4:${b}4`); th.mergeCells(`${a}5:${b}6`); th.mergeCells(`${a}7:${b}7`);
    Object.assign(th.getCell(`${a}4`), { value: lb });
    th.getCell(`${a}4`).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    th.getCell(`${a}4`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_RED } };
    th.getCell(`${a}4`).alignment = { horizontal: "center" };
    th.getCell(`${a}5`).value = v; th.getCell(`${a}5`).numFmt = fmt;
    th.getCell(`${a}5`).font = { bold: true, size: 22, color: { argb: "FF2F5597" } };
    th.getCell(`${a}5`).alignment = { horizontal: "center", vertical: "middle" };
    th.getCell(`${a}7`).value = unit; th.getCell(`${a}7`).font = { size: 8.5, color: { argb: "FF777777" } };
    th.getCell(`${a}7`).alignment = { horizontal: "center" };
  }
  let rowN = 9;
  const sectionHead = (title) => {
    th.mergeCells(`B${rowN}:K${rowN}`);
    const c = th.getCell(`B${rowN}`); c.value = title; c.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_RED } }; rowN++;
  };
  const head2 = (cells) => {
    const r = th.getRow(rowN); r.values = [null, ...cells]; r.height = 30;
    r.eachCell((c, k) => { if (k < 2) return; c.font = { bold: true, size: 9.5 }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_HEAD2 } }; c.alignment = { wrapText: true, horizontal: "center", vertical: "middle" }; c.border = bd; });
    rowN++;
  };
  const group = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (k == null || k === "") continue; m.set(k, [...(m.get(k) || []), r]); } return m; };
  const block = (title, colLetter, keyFn, label, order) => {
    sectionHead(title);
    head2([label, "Số gói", "Số HĐ", "GT KH thầu\n(tỷ đ)", "GT trúng\n(tỷ đ)", "Tiết kiệm\n(tỷ đ)", "% Tiết\nkiệm", "Tỷ trọng\nGT trúng", "GT TB\n/HĐ"]);
    const g = group(keyFn);
    const keys = order ? order.filter((k) => g.has(k)).concat([...g.keys()].filter((k) => !order.includes(k))) : [...g.keys()];
    const first = rowN, totalRow = first + keys.length;
    for (const k of keys) {
      const rs = g.get(k), n = rowN;
      const si = rs.reduce((a, r) => a + (I(r) || 0), 0), sj = rs.reduce((a, r) => a + (J(r) || 0), 0);
      const crit = typeof k === "number" ? `$B${n}` : `$B${n}`;
      th.getRow(n).values = [null, k, uniq(rs.map((r) => r.code)),
        { formula: `COUNTIF(${rng(colLetter)},${crit})`, result: rs.length },
        { formula: `SUMIF(${rng(colLetter)},${crit},${rng("I")})/10^9`, result: si / 1e9 },
        { formula: `SUMIF(${rng(colLetter)},${crit},${rng("J")})/10^9`, result: sj / 1e9 },
        { formula: `E${n}-F${n}`, result: (si - sj) / 1e9 }, { formula: `IFERROR(G${n}/E${n},0)`, result: si ? (si - sj) / si : 0 },
        { formula: `IFERROR(F${n}/F$${totalRow},0)`, result: sumJ ? sj / sumJ : 0 }, { formula: `IFERROR(F${n}/D${n},0)`, result: rs.length ? sj / 1e9 / rs.length : 0 }];
      rowN++;
    }
    const n = rowN, L = (c) => `${c}${first}:${c}${totalRow - 1}`;
    th.getRow(n).values = [null, "TỔNG CỘNG", { formula: `SUM(${L("C")})`, result: keys.reduce((a, k) => a + uniq(g.get(k).map((r) => r.code)), 0) },
      { formula: `SUM(${L("D")})`, result: keys.reduce((a, k) => a + g.get(k).length, 0) }, { formula: `SUM(${L("E")})`, result: sumI / 1e9 }, { formula: `SUM(${L("F")})`, result: sumJ / 1e9 },
      { formula: `SUM(${L("G")})`, result: (sumI - sumJ) / 1e9 }, { formula: `IFERROR(G${n}/E${n},0)`, result: sumI ? (sumI - sumJ) / sumI : 0 },
      { formula: `SUM(${L("I")})`, result: 1 }, { formula: `IFERROR(F${n}/D${n},0)`, result: rows.length ? sumJ / 1e9 / rows.length : 0 }];
    for (let k = first; k <= n; k++) {
      th.getRow(k).eachCell({ includeEmpty: true }, (c, col) => {
        if (col < 2 || col > 10) return;
        c.border = bd; c.font = { size: k === n ? 11 : 10, bold: k === n || col === 8 };
        c.numFmt = [3, 4].includes(col) ? NUM : [5, 6, 7, 10].includes(col) ? TY : col === 8 ? "0.00%" : col === 9 ? "0.0%" : "General";
        if (k === n) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_PINK } };
      });
    }
    rowN += 2;
  };
  block("A.  PHÂN LOẠI THEO LOẠI GÓI THẦU", "F", (r) => r.category, "Loại gói thầu", ["Xây lắp", "Tư vấn", "Dịch vụ phi tư vấn"]);
  block("B.  PHÂN LOẠI THEO NĂM KÝ HỢP ĐỒNG", "O", (r) => (r.rec.signDate ? Number(r.rec.signDate.slice(0, 4)) : null), "Năm ký hợp đồng", years.map((y) => Number(y.slice(0, 4))).filter((v, i, a) => a.indexOf(v) === i));
  block("C.  PHÂN LOẠI THEO HÌNH THỨC LỰA CHỌN NHÀ THẦU", "H", (r) => r.rec.selectionMethod, "Hình thức LCNT", ["Đấu thầu rộng rãi", "Chào hàng cạnh tranh", "Chỉ định thầu", "Mua sắm trực tiếp"]);
  block("D.  PHÂN LOẠI THEO TÌNH TRẠNG THỰC HIỆN HỢP ĐỒNG", "R", (r) => hdStatusText(r.rec), "Tình trạng", ["Đang thực hiện", "Đã kết thúc", "Đã thanh lý", "Tạm dừng", "Chấm dứt", "Đã hủy"]);
  // E. theo nhà thầu (xếp theo GT trúng)
  sectionHead("E.  PHÂN LOẠI THEO NHÀ THẦU THỰC HIỆN");
  head2(["Nhà thầu thực hiện", "Số HĐ", "GT KH thầu\n(tỷ đ)", "GT trúng\n(tỷ đ)", "Tiết kiệm\n(tỷ đ)", "% Tiết\nkiệm", "Tỷ trọng\nGT trúng", "GT TB\n/HĐ", "STT\n(xếp hạng)"]);
  const gc = group(ctr);
  const ckeys = [...gc.keys()].sort((a, b) => gc.get(b).reduce((s, r) => s + (J(r) || 0), 0) - gc.get(a).reduce((s, r) => s + (J(r) || 0), 0));
  const e0 = rowN, eTot = e0 + ckeys.length;
  ckeys.forEach((k, i) => {
    const rs = gc.get(k), n = rowN, si = rs.reduce((a, r) => a + (I(r) || 0), 0), sj = rs.reduce((a, r) => a + (J(r) || 0), 0);
    th.getRow(n).values = [null, k, { formula: `COUNTIF(${rng("L")},$B${n})`, result: rs.length },
      { formula: `SUMIF(${rng("L")},$B${n},${rng("I")})/10^9`, result: si / 1e9 }, { formula: `SUMIF(${rng("L")},$B${n},${rng("J")})/10^9`, result: sj / 1e9 },
      { formula: `D${n}-E${n}`, result: (si - sj) / 1e9 }, { formula: `IFERROR(F${n}/D${n},0)`, result: si ? (si - sj) / si : 0 },
      { formula: `IFERROR(E${n}/E$${eTot},0)`, result: sumJ ? sj / sumJ : 0 }, { formula: `IFERROR(E${n}/C${n},0)`, result: sj / 1e9 / rs.length }, i + 1];
    rowN++;
  });
  th.getRow(rowN).values = [null, "TỔNG CỘNG", { formula: `SUM(C${e0}:C${eTot - 1})`, result: rows.filter((r) => ctr(r)).length },
    { formula: `SUM(D${e0}:D${eTot - 1})`, result: sumI / 1e9 }, { formula: `SUM(E${e0}:E${eTot - 1})`, result: sumJ / 1e9 }, { formula: `D${rowN}-E${rowN}`, result: (sumI - sumJ) / 1e9 },
    { formula: `IFERROR(F${rowN}/D${rowN},0)`, result: sumI ? (sumI - sumJ) / sumI : 0 }, null, null, null];
  for (let k = e0; k <= rowN; k++) th.getRow(k).eachCell({ includeEmpty: true }, (c, col) => {
    if (col < 2 || col > 10) return;
    c.border = bd; c.font = { size: k === rowN ? 11 : 10, bold: k === rowN };
    c.numFmt = [3, 10].includes(col) ? NUM : [4, 5, 6, 9].includes(col) ? TY : col === 7 ? "0.00%" : col === 8 ? "0.0%" : "General";
    if (k === rowN) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HD_PINK } };
  });
  // cột "Kiểm tra nhà thầu" ở DS tra trong danh sách nhà thầu của TỔNG HỢP
  rows.forEach((r, i) => { const cell = ds.getCell(N0 + i, 13); cell.value = { formula: cell.value.formula.replace("$B$0:$B$0", `$B$${e0}:$B$${Math.max(e0, eTot - 1)}`), result: ctr(r) || "" }; });
  th.getCell(`B${rowN + 2}`).value = "Ghi chú: Tiết kiệm = GT kế hoạch thầu − GT hợp đồng (giá trị ký ban đầu). HĐ khung / chưa có GT ký và HĐ ngoại tệ không cộng vào tổng VNĐ (ghi ở cột Ghi chú). Số gói đếm theo số hiệu không trùng.";
  th.getCell(`B${rowN + 2}`).font = { italic: true, size: 9, color: { argb: "FF777777" } };

  // ---------- Gia hạn (giữ chi tiết như bản cũ)
  const ext = rows.flatMap((r) => r.due.all.map((e) => ({ r, e })));
  if (ext.length) sheet(wb, "Gia hạn", "DANH SÁCH GIA HẠN HỢP ĐỒNG", `${cfg.orgName} · Ngày báo cáo ${fmtDate(reportDate)}`, [
    { h: "Số HĐ", w: 30, v: (x) => x.r.no }, { h: "Lần", w: 6, num: true, v: (x) => x.e.seq }, { h: "Số phụ lục/VB", w: 20, v: (x) => x.e.docNo },
    { h: "Hiệu lực", w: 12, v: (x) => fmtDate(x.e.effectiveDate || x.e.signDate) }, { h: "Hạn trước", w: 12, v: (x) => fmtDate(x.e.dueBefore) },
    { h: "Hạn sau", w: 12, v: (x) => fmtDate(x.e.dueAfter) }, { h: "Trạng thái", w: 13, v: (x) => EXT_STATUS[x.e.status] }, { h: "Lý do", w: 40, v: (x) => x.e.reason },
  ], ext);

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `Bao_cao_cac_HD_${reportDate}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================ NHẬP NHIỆM VỤ TỪ VOFFICE (file "bao_cao_nhiem_vu_chua_dong_don_vi_*.xls")
export async function parseVoffice(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  const hi = aoa.findIndex((r) => r.some((c) => /id\s*nhiệm\s*vụ/i.test(String(c))) && r.some((c) => /tên\s*nhiệm\s*vụ/i.test(String(c))));
  if (hi < 0) throw new Error("Không nhận ra file Voffice: cần cột “ID nhiệm vụ” và “Tên nhiệm vụ” (file Báo cáo thực hiện nhiệm vụ đơn vị).");
  const head = aoa[hi].map((h) => String(h).replace(/\s+/g, " ").trim().toLowerCase());
  const exact = (name) => head.findIndex((h) => h === name);
  const C = {
    id: col(head, "id nhiệm vụ"), src: col(head, "nguồn gốc"), title: col(head, "tên nhiệm vụ"), content: col(head, "nội dung"), target: col(head, "mục tiêu"),
    start: col(head, "ngày thực hiện"), due: exact("ngày hoàn thành") >= 0 ? exact("ngày hoàn thành") : col(head, "ngày hoàn thành"), ext: col(head, "gia hạn"),
    owner: col(head, "đầu mối"), status: col(head, "trạng thái"), result: col(head, "kết quả"), level: col(head, "mức độ"), diff: col(head, "khó khăn"),
    prop: col(head, "đề xuất"), assigner: col(head, "người giao"), upd: col(head, "ngày cập nhật"), kind: col(head, "loại nhiệm vụ"),
  };
  const subHead = (aoa[hi + 1] || []).some((c) => /số lần|mốc cũ|họ tên/i.test(String(c)));
  const rows = [], errors = [];
  const meta = { date: null, total: null };
  for (const r of aoa.slice(0, hi)) { const t = r.map((x) => String(x)).join(" "); const m = t.match(/ngày chốt[^0-9]*(\d{1,2}\/\d{1,2}\/\d{4})/i); if (m) meta.date = parseDateCell(m[1]); }
  aoa.slice(hi + (subHead ? 2 : 1)).forEach((r, i) => {
    const line = hi + (subHead ? 3 : 2) + i;
    const id = s(r[C.id]);
    if (!id && !s(r[C.title])) return;
    if (!id) return errors.push({ line, msg: "Thiếu ID nhiệm vụ" });
    const d = (k) => (C[k] >= 0 ? parseDateCell(r[C[k]]) : null);
    const due = d("due"), start = d("start");
    if (due === undefined || start === undefined) errors.push({ line, msg: "Ngày không đọc được" });
    rows.push({
      line, voId: id.replace(/\.0$/, ""), source: s(r[C.src]), title: s(r[C.title]), content: s(r[C.content]), target: s(r[C.target]),
      start: start || null, due: due || null, extCount: C.ext >= 0 ? Number(r[C.ext]) || 0 : 0, oldDue: C.ext >= 0 ? parseDateCell(r[C.ext + 1]) || null : null,
      owner: C.owner >= 0 ? s(r[C.owner]) : "", status: s(r[C.status]), result: s(r[C.result]), level: s(r[C.level]), difficulty: s(r[C.diff]), proposal: s(r[C.prop]),
      assigner: s(r[C.assigner]), kind: s(r[C.kind]),
    });
  });
  if (!rows.length) throw new Error("File không có dòng nhiệm vụ nào.");
  return { rows, errors, meta };
}
