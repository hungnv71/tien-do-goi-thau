// DỮ LIỆU MINH HỌA — chỉ dùng khi mở ?demo=1. Không bao giờ ghi vào CSDL thật.
import { addDays, addMonths } from "./dates.js";

const RONGRAI = [
  ["Tờ trình chủ trương", 0, "chu_truong", true], ["QĐ phê duyệt dự toán (nếu có)", 5, "chu_truong", false],
  ["Tờ trình phê duyệt KHLCNT", 9, "ke_hoach", true], ["Báo cáo thẩm định KHLCNT", 10, "ke_hoach", true],
  ["Quyết định phê duyệt KHLCNT", 11, "ke_hoach", true], ["Tờ trình TCG", 15, "ho_so", true],
  ["Tờ trình phê duyệt HSMT", 21, "ho_so", true], ["Quyết định phê duyệt HSMT", 22, "ho_so", true],
  ["Phát hành HSMT", 22, "moi_thau", true], ["Đóng thầu", 31, "moi_thau", true],
  ["Báo cáo Gia hạn thời gian đóng thầu (nếu có)", null, "moi_thau", false], ["Báo cáo đánh giá HSDT", 44, "danh_gia", true],
  ["Biên bản thương thảo HĐ", 46, "danh_gia", true], ["Tờ trình phê duyệt KQLCNT", 47, "phe_duyet", true],
  ["QĐ phê duyệt KQĐT", 49, "phe_duyet", true], ["Thông báo trúng thầu", 49, "phe_duyet", true], ["Hợp đồng", 51, "ky_hd", true],
];
const CHAOHANG = [
  ["Tờ trình chủ trương", 0, "chu_truong", true], ["QĐ phê duyệt dự toán (nếu có)", 5, "chu_truong", false],
  ["Tờ trình + QĐ phê duyệt KHLCNT", 10, "ke_hoach", true], ["Phê duyệt E-HSMST/HSYC", 13, "ho_so", true],
  ["Phát hành HSYC", 14, "moi_thau", true], ["Đóng thầu", 19, "moi_thau", true], ["Báo cáo đánh giá HSDT", 27, "danh_gia", true],
  ["Tờ trình + QĐ phê duyệt KQLCNT", 29, "phe_duyet", true], ["Thông báo trúng thầu", 29, "phe_duyet", true], ["Hợp đồng", 31, "ky_hd", true],
];

export function makeDemo(R) {
  const now = new Date().toISOString();
  const old = addDays(R, -40) + "T08:00:00Z";
  const staff = [
    { id: "d_admin", fullName: "Quản trị (demo)", account: "admin.demo", role: "admin", position: 0, active: true },
    { id: "d_tp", fullName: "Phạm Thu Dung", account: "dungpt", role: "manager", position: 1, active: true },
    { id: "d_a", fullName: "Nguyễn Văn An", account: "annv", role: "staff", position: 2, active: true },
    { id: "d_b", fullName: "Trần Thị Bình", account: "binhtt", role: "staff", position: 3, active: true },
    { id: "d_c", fullName: "Lê Minh Cường", account: "cuonglm", role: "staff", position: 4, active: true },
    { id: "d_v", fullName: "Người xem (demo)", account: "viewer", role: "viewer", position: 5, active: true },
  ];
  const workflow_templates = [
    { id: "tpl_rongrai", name: "Đấu thầu rộng rãi qua mạng", isDefault: true, dayMode: "calendar" },
    { id: "tpl_chaohang", name: "Chào hàng cạnh tranh qua mạng", isDefault: false, dayMode: "calendar" },
  ];
  const template_milestones = [
    ...RONGRAI.map(([name, off, stage, req], i) => ({ id: `tm_r${i}`, templateId: "tpl_rongrai", position: i + 1, name, offsetDays: off, stage, required: req, weight: 1 })),
    ...CHAOHANG.map(([name, off, stage, req], i) => ({ id: `tm_c${i}`, templateId: "tpl_chaohang", position: i + 1, name, offsetDays: off, stage, required: req, weight: 1 })),
  ];
  const packages = [], package_milestones = [];
  // [id, code, name, staff, start offset từ R, số mốc đã xong, tpl, extra]
  const P = [
    ["pk1", "GT-2026-021", "Bảo trì trạm BTS khu vực miền Bắc", "d_a", -35, 9, "tpl_rongrai", {}],                 // quá hạn
    ["pk2", "GT-2026-018", "Cải tạo hệ thống điện trạm", "d_b", -21, 6, "tpl_rongrai", {}],                         // đến hạn hôm nay
    ["pk3", "GT-2026-024", "Thuê hạ tầng cột anten", "d_a", -8, 3, "tpl_chaohang", {}],                             // sắp đến hạn
    ["pk4", "GT-2026-030", "Khảo sát 500 trạm 5G quý 4", "d_c", 3, 0, "tpl_rongrai", {}],                           // đúng tiến độ
    ["pk5", "GT-2026-011", "Củng cố cột BTS sau bão", "d_b", -60, 17, "tpl_rongrai", { signed: -9 }],             // đã ký HĐ trong tháng
    ["pk6", "GT-2026-033", "Đo kiểm chất lượng 5G", null, null, 0, "tpl_chaohang", {}],                             // thiếu hạn + thiếu người
    ["pk7", "GT-2026-027", "Sửa chữa hạ tầng GPON", "d_c", -40, 4, "tpl_rongrai", { status: "paused" }],           // tạm dừng nhưng quá hạn
    ["pk8", "GT-2026-015", "Thuê kiểm định cột", "d_a", -50, 2, "tpl_chaohang", { status: "cancelled" }],
  ];
  for (const [id, code, name, st, off, nDone, tpl, x] of P) {
    const tms = template_milestones.filter((t) => t.templateId === tpl);
    const start = off === null ? null : addDays(R, off);
    packages.push({ id, code, name, staffId: st, templateId: tpl, category: "Dịch vụ phi tư vấn", selectionMethod: tpl === "tpl_rongrai" ? "Đấu thầu rộng rãi" : "Chào hàng cạnh tranh",
      policyApprovedDate: start, status: x.status || "active", year: 2026, unit: "Phòng QLHT", packageValue: 5e9 + packages.length * 1.3e9, currency: "VND", vatBasis: "after_vat",
      planLocked: id === "pk1", updatedAt: id === "pk3" ? old : now, nextAction: "" });
    tms.forEach((t, i) => {
      const planned = start && t.offsetDays != null ? addDays(start, t.offsetDays) : null;
      let actual = null;
      if (i < nDone && planned) actual = i === 5 && id === "pk1" ? addDays(planned, 2) : planned;
      if (x.signed != null && t.stage === "ky_hd") actual = addDays(R, x.signed);
      package_milestones.push({ id: `${id}_m${i + 1}`, packageId: id, position: t.position, name: t.name, stage: t.stage, required: t.required,
        applicable: !(t.required === false && i === 1 && id !== "pk2"), plannedDate: planned, baselineDate: planned, actualDate: actual, weight: 1,
        nextAction: id === "pk1" && i === nDone ? "Trình Lãnh đạo Ban ký QĐ" : "", delayReason: id === "pk1" && i === nDone ? "Chờ ý kiến Phòng Thẩm định" : "", updatedAt: now });
    });
  }
  const contractors = [
    { id: "n1", name: "Công ty CP Công trình Viettel", shortName: "VCC" }, { id: "n2", name: "Công ty TNHH Kỹ thuật VTK", shortName: "VTK" },
    { id: "n3", name: "Liên danh Phú Thái - Hải Anh", shortName: "LD Phú Thái" }, { id: "n4", name: "Global Tower Services Ltd.", shortName: "GTS" },
  ];
  const C = (id, no, name, st, ctr, sign, due, extra = {}) => ({ id, contractNo: no, name, staffId: st, contractorId: ctr, signDate: sign, originalDue: due,
    signValue: 1.2e10, plannedValue: 1.25e10, currency: "VND", vatBasis: "after_vat", execStatus: "in_progress", acceptanceStatus: "none", liquidationStatus: "none",
    paymentOwner: "qlht", category: "Xây lắp", selectionMethod: "Đấu thầu rộng rãi", unit: "Phòng QLHT", year: Number(sign.slice(0, 4)), updatedAt: now, ...extra });
  const contracts = [
    C("h1", "HĐ-2026-032", "Bảo dưỡng điều hòa trạm", "d_c", "n2", addDays(R, -200), addDays(R, -1)),                                  // quá hạn 1 ngày
    C("h2", "HĐ-2026-041", "Thuê dịch vụ ứng cứu thông tin", "d_a", "n1", addDays(R, -120), R),                                        // đến hạn hôm nay
    C("h3", "HĐ-2026-045", "Củng cố cột BTS sau bão - Phần 1", "d_b", "n1", addDays(R, -9), addMonths(addDays(R, -9), 6), { packageId: "pk5", packageCode: "GT-2026-011" }),
    C("h4", "HĐ-2026-046", "Củng cố cột BTS sau bão - Phần 2", "d_b", "n3", addDays(R, -9), addDays(R, 20), { packageId: "pk5", packageCode: "GT-2026-011" }), // sắp hết hạn
    C("h5", "HĐ-2025-118", "Thu hồi thiết bị sau swap", "d_a", "n3", addDays(R, -300), addDays(R, -10)),                              // gia hạn chờ duyệt
    C("h6", "HĐ-2025-102", "Giám sát tuyến cáp trục", "d_c", "n2", addDays(R, -280), addDays(R, -20)),                               // 2 lần gia hạn
    C("h7", "HĐ-2025-090", "Tư vấn thiết kế DAS tòa nhà", "d_b", "n1", addDays(R, -250), addDays(R, -60), { execStatus: "completed", actualCompletionDate: addDays(R, -45), acceptanceStatus: "done" }), // HT chậm, chờ thanh lý
    C("h8", "HĐ-2025-077", "Thuê đo kiểm 5G", "d_a", "n2", addDays(R, -330), addDays(R, -100), { execStatus: "completed", liquidationStatus: "done" }), // thanh lý thiếu ngày/hồ sơ
    C("h9", "HĐ-2026-050", "Thuê tư vấn quốc tế", "d_c", "n4", addDays(R, -30), addDays(R, 200), { currency: "USD", signValue: 250000, plannedValue: 260000, paymentOwner: "quyet_toan" }),
    C("h10", "HĐ-2026-051", "Phụ lục khung đơn giá (HĐ khung)", "d_b", "n1", addDays(R, -15), addDays(R, 350), { signValue: 0, paymentOwner: "tinh" }),
    C("h11", "HĐ-2026-038", "Sửa chữa nhà trạm", "d_a", "n2", addDays(R, -90), addDays(R, 60), { execStatus: "cancelled" }),
    C("h12", "HĐ-2026-040", "Cải tạo tiếp địa", null, "n1", addDays(R, -60), null),                                                  // thiếu hạn + thiếu người
  ];
  const contract_extensions = [
    { id: "e1", contractId: "h5", seq: 1, docNo: "ĐN-15/QLHT", dueBefore: addDays(R, -10), dueAfter: addDays(R, 45), status: "proposed", reason: "Vướng mặt bằng tại 3 tỉnh" },
    { id: "e2", contractId: "h6", seq: 1, docNo: "PL01", signDate: addDays(R, -25), effectiveDate: addDays(R, -25), dueBefore: addDays(R, -20), dueAfter: addDays(R, -5), status: "approved", reason: "Thời tiết" },
    { id: "e3", contractId: "h6", seq: 2, docNo: "PL02", signDate: addDays(R, -6), effectiveDate: addDays(R, -6), dueBefore: addDays(R, -5), dueAfter: addDays(R, 25), status: "approved", reason: "Bổ sung khối lượng" },
    { id: "e4", contractId: "h3", seq: 1, docNo: "PL01", signDate: addDays(R, -1), effectiveDate: addDays(R, 5), dueBefore: addMonths(addDays(R, -9), 6), dueAfter: addMonths(addDays(R, -9), 7), status: "approved", reason: "Điều chỉnh phạm vi" },
  ];
  const contract_amendments = [
    { id: "a1", contractId: "h6", seq: 1, docNo: "PL02", docDate: addDays(R, -6), effectiveDate: addDays(R, -6), deltaValue: 8e8, status: "approved", reason: "Bổ sung khối lượng" },
  ];
  const contract_payments = [
    { id: "t1", contractId: "h1", kind: "advance", amount: 3e9, status: "confirmed", payDate: addDays(R, -180) },
    { id: "t2", contractId: "h1", kind: "payment", amount: 6e9, status: "confirmed", payDate: addDays(R, -60) },
    { id: "t3", contractId: "h1", kind: "advance_recovery", amount: 1.5e9, status: "confirmed", payDate: addDays(R, -60) },
    { id: "t4", contractId: "h1", kind: "payment", amount: 2e9, status: "draft", payDate: addDays(R, -5) },
    { id: "t5", contractId: "h7", kind: "payment", amount: 1.25e10, status: "confirmed", payDate: addDays(R, -30) },   // > 100%
    { id: "t6", contractId: "h7", kind: "payment", amount: 9e9, status: "cancelled", payDate: addDays(R, -30) },
    { id: "t7", contractId: "h2", kind: "request", amount: 1.5e9, status: "confirmed", dueDate: addDays(R, -3), settled: false },
  ];
  const contract_acceptances = [{ id: "ac1", contractId: "h7", seq: 1, accDate: addDays(R, -44), value: 1.2e10, status: "confirmed" }];
  const contract_milestones = [
    { id: "cm1", contractId: "h3", position: 1, name: "Hoàn thành Phần 1 - 12 tỉnh phía Bắc", plannedDate: addDays(R, 60) },
    { id: "cm2", contractId: "h3", position: 2, name: "Hoàn thành Phần 1 - còn lại", plannedDate: addMonths(addDays(R, -9), 6) },
  ];
  const issues = [
    { id: "i1", entity: "package", entityId: "pk1", content: "Phòng Thẩm định chưa có ý kiến về KHLCNT", ownerStaffId: "d_a", waitingOn: "Phòng Thẩm định", coordUnit: "P.Thẩm định", plan: "Làm việc trực tiếp, xin ý kiến", commitDue: addDays(R, 2), status: "open" },
    { id: "i2", entity: "contract", entityId: "h5", content: "Chưa bàn giao mặt bằng tại 3 tỉnh", ownerStaffId: "d_a", waitingOn: "Viettel tỉnh", plan: "Công văn đôn đốc tỉnh", commitDue: addDays(R, -2), status: "open" },
  ];
  const app_settings = [
    { key: "org_name", value: "Phòng Quản lý hạ tầng - B.QLDAHTVT" }, { key: "due_soon_days", value: 7 }, { key: "due_soon_days_long", value: 14 },
    { key: "contract_expiring_days", value: 30 }, { key: "stale_days", value: 14 }, { key: "payment_module", value: true },
  ];
  return {
    app_settings, holidays: [{ id: "hol1", day: `${R.slice(0, 4)}-09-02`, name: "Quốc khánh" }], staff, workflow_templates, template_milestones, contractors,
    packages, package_milestones, contracts, contract_extensions, contract_amendments, contract_milestones, contract_acceptances, contract_payments, issues,
  };
}

/** Áp thao tác ghi vào bộ nhớ (chế độ minh họa). */
export function applyDemoOps(data, ops) {
  const next = { ...data };
  for (const o of ops) {
    const key = o.table === "app_settings" ? "key" : "id";
    const arr = [...(next[o.table] || [])];
    const idx = arr.findIndex((x) => x[key] === o.id);
    if (o.op === "insert") arr.push({ ...o.data, [key]: o.id, updatedAt: new Date().toISOString() });
    else if (o.op === "update") { if (idx >= 0) arr[idx] = { ...arr[idx], ...o.data, updatedAt: new Date().toISOString() }; else if (o.table === "app_settings") arr.push({ key: o.id, ...o.data }); }
    else if (o.op === "delete" && idx >= 0) arr.splice(idx, 1);
    next[o.table] = arr;
    if (o.op === "delete" && o.table === "packages") next.package_milestones = next.package_milestones.filter((m) => m.packageId !== o.id);
    if (o.op === "delete" && o.table === "contracts") for (const t of ["contract_extensions", "contract_amendments", "contract_milestones", "contract_acceptances", "contract_payments"]) next[t] = next[t].filter((m) => m.contractId !== o.id);
  }
  return next;
}
