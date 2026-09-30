// Xuất Excel (ExcelJS, có định dạng) & nhập Excel (SheetJS) — dùng CÙNG bộ dòng đã lọc với bảng/KPI/biểu đồ.
// Thư viện Excel tải khi cần (giảm dung lượng trang đầu)
const loadExcelJS = () => import("exceljs").then((m) => m.default || m);
const loadXLSX = () => import("xlsx");
import { fmtDate, parseDateCell } from "./dates.js";
import { PKG_STATUS, HD_PROGRESS, EXEC_STATUS, ACC_STATUS, LIQ_STATUS, PAY_OWNER, EXT_STATUS, ALERT_LABEL, LCNT_KPI, HD_KPI, computeKpis, daysText, staffLabel, byPos, STATUS_OPTIONS } from "./rules.js";

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

function filterText(f, data, me) {
  const parts = [f.scope === "mine" ? `Của tôi (${staffLabel(me)})` : "Toàn phòng"];
  if (f.staff) parts.push("Cán bộ: " + (f.staff === "__none" ? "Chưa phân công" : staffLabel(data.staff.find((s) => s.id === f.staff))));
  if (f.unit) parts.push("Đơn vị: " + f.unit);
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
  if (hdRows.length) computeKpis(HD_KPI, hdRows, ctx).forEach((k) => info.addRow([`HĐ · ${k.label.replace("N ngày", cfg.contractSoonDays + " ngày")}`, k.value, k.hint]));
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
      { h: "Tiến độ", w: 20, alert: true, v: (r) => HD_PROGRESS[r.progress.code].label + (r.progress.lateDays ? ` (${r.progress.lateDays} ngày)` : "") },
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
