// Ngày nghiệp vụ: lưu & tính dạng date-only "YYYY-MM-DD", múi giờ Asia/Ho_Chi_Minh.
// Mọi phép tính dùng số ngày UTC nên không lệch do múi giờ máy.
export const TZ = "Asia/Ho_Chi_Minh";
const pad = (n) => String(n).padStart(2, "0");

/** Hôm nay theo giờ Việt Nam (không phụ thuộc múi giờ máy). */
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const toDays = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const fromDays = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
/** b - a (số ngày lịch). */
export const diffDays = (a, b) => toDays(b) - toDays(a);
export const addDays = (iso, n) => fromDays(toDays(iso) + n);

/** Cộng tháng theo lịch; nếu tháng đích không có ngày tương ứng thì lấy ngày cuối tháng. Không quy đổi 30 ngày/tháng. */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = m - 1 + n;
  const ny = y + Math.floor(t / 12);
  const nm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export const weekday = (iso) => new Date(toDays(iso) * 864e5).getUTCDay(); // 0 = CN
/** Ngày làm việc: bỏ T7, CN và các ngày trong lịch nghỉ do quản trị cấu hình. */
export const isWorkingDay = (iso, holidays = new Set()) => { const w = weekday(iso); return w !== 0 && w !== 6 && !holidays.has(iso); };

/** Cộng n ngày làm việc (n >= 0). Ngày bắt đầu không tính. */
export function addWorkingDays(iso, n, holidays = new Set()) {
  let cur = iso, left = n;
  while (left > 0) { cur = addDays(cur, 1); if (isWorkingDay(cur, holidays)) left--; }
  return cur;
}
/** Số ngày làm việc trong (a, b] — dùng để tính chậm theo ngày làm việc. */
export function workingDaysBetween(a, b, holidays = new Set()) {
  if (a === b) return 0;
  const sign = toDays(b) > toDays(a) ? 1 : -1;
  let cur = a, n = 0;
  while (cur !== b) { cur = addDays(cur, sign); if (isWorkingDay(cur, holidays)) n += sign; }
  return n;
}

/** Cộng khoảng thời gian theo chế độ: calendar | working. */
export const addByMode = (iso, n, mode = "calendar", holidays) =>
  mode === "working" ? addWorkingDays(iso, n, holidays) : addDays(iso, n);

/**
 * Gợi ý hạn từ ngày bắt đầu + thời gian thực hiện. Quy ước (hiển thị cho người dùng):
 * - "day": ngày lịch, ngày bắt đầu KHÔNG tính (BLDS 2015 Đ.147) → hạn = bắt đầu + N
 * - "month": theo tháng lịch, hạn = ngày tương ứng của tháng cuối (không đổi 30 ngày/tháng)
 * - "working_day": N ngày làm việc sau ngày bắt đầu
 */
export function suggestDue(start, duration, unit, holidays) {
  if (!isISODate(start) || !Number.isFinite(Number(duration))) return null;
  const n = Number(duration);
  if (unit === "month") return addMonths(start, n);
  if (unit === "working_day") return addWorkingDays(start, n, holidays);
  return addDays(start, n);
}

export const fmtDate = (iso) => (isISODate(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export const monthKey = (iso) => (iso ? iso.slice(0, 7) : "");
export const yearOf = (iso) => (iso ? Number(iso.slice(0, 4)) : null);

/** Đọc ngày từ ô Excel: Date (SheetJS cellDates), số serial, "dd/mm/yyyy", "yyyy-mm-dd". */
export function parseDateCell(v) {
  if (v == null || v === "") return null;
  // Date từ thư viện Excel có thể lệch vài giây/phút về ngày hôm trước (lỗi múi giờ lịch sử) → làm tròn về ngày gần nhất
  if (v instanceof Date && !isNaN(v)) return fromDays(Math.round((v.getTime() - v.getTimezoneOffset() * 60000) / 864e5));
  if (typeof v === "number" && v > 20000 && v < 80000) return fromDays(Math.round(v) - 25569);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return valid(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) return valid(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  return undefined; // có giá trị nhưng không đọc được -> báo lỗi dòng
}
function valid(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? iso : undefined;
}
