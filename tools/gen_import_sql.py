"""Sinh supabase/02_import_hd_2024_2026.sql từ file 'Báo cáo các HĐ 2024-2026.xlsx'.

Chạy:  python tools/gen_import_sql.py
- Chỉ đọc sheet 'DS GÓI THẦU', dòng có STT là số.
- ID ổn định theo số HĐ (md5) -> chạy lại không nhân đôi (on conflict do nothing).
- Không suy diễn: ngày bắt đầu, ngày hoàn thành thực tế, VAT, bộ phận theo dõi thanh toán để trống nếu file không có.
"""
import hashlib
import datetime as dt
import pathlib
import re
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "Báo cáo các HĐ 2024-2026.xlsx"
OUT = ROOT / "supabase" / "02_import_hd_2024_2026.sql"

STATUS = {  # Tình trạng trong file -> (exec_status, liquidation_status)
    "Đang thực hiện": ("in_progress", "none"),
    "Hoàn thành": ("completed", "none"),
    "Đã kết thúc": ("completed", "none"),   # anh Hùng xác nhận: = đã hoàn thành thực hiện
    "Đã thanh lý": ("completed", "done"),
}


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(v, 2)) if isinstance(v, float) else str(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return "'" + v.strftime("%Y-%m-%d") + "'"
    s = str(v).replace("'", "''")
    return "'" + s + "'"


def clean(s):
    if s is None:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s or None


def hid(prefix, key):
    return prefix + hashlib.md5(key.upper().encode("utf-8")).hexdigest()[:12]


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["DS GÓI THẦU"]
    rows = []
    for r in ws.iter_rows(min_row=6, values_only=True):
        if not isinstance(r[0], (int, float)) or not r[2]:
            continue
        rows.append(r)

    contractors = {}
    lines = [
        "-- =====================================================================",
        "-- Migration 02: NHẬP DỮ LIỆU HỢP ĐỒNG từ 'Báo cáo các HĐ 2024-2026.xlsx'",
        f"-- Sinh tự động {dt.date.today():%d/%m/%Y} bởi tools/gen_import_sql.py — {len(rows)} hợp đồng",
        "-- Chạy lại an toàn: bản ghi đã có (cùng id) được giữ nguyên, không ghi đè.",
        "-- Không suy diễn dữ liệu file không có: ngày bắt đầu, ngày HT thực tế, VAT, bộ phận theo dõi TT.",
        "-- =====================================================================",
        "",
    ]
    for r in rows:
        name = clean(r[11])
        if name:
            contractors.setdefault(name.upper(), name)
    lines.append("insert into contractors (id, name, short_name, note) values")
    vals = [f"  ({q(hid('nt_', k))}, {q(v)}, {q(v if len(v) <= 20 else None)}, 'Nhập từ báo cáo HĐ 2024-2026')"
            for k, v in sorted(contractors.items())]
    lines.append(",\n".join(vals) + "\non conflict (id) do nothing;\n")

    lines.append(
        "insert into contracts (id, package_code, package_name, contract_no, name, category, selection_method,\n"
        "  contractor_id, unit, staff_id, sign_date, original_due, planned_value, sign_value, currency,\n"
        "  exec_status, liquidation_status, year, source, note) values")
    vals = []
    for r in rows:
        no = clean(r[2])
        cname = clean(r[11])
        ex, lq = STATUS.get(clean(r[17]) or "", ("in_progress", "none"))
        acct = (clean(r[18]) or "").lower()
        staff = f"(select id from staff where lower(account) = {q(acct)} or lower(full_name) = {q(acct)} or id = {q('st_' + acct)} order by (lower(account) = {q(acct)}) desc nulls last limit 1)" if acct else "null"
        note = "Nhập từ báo cáo HĐ 2024-2026 (kỳ 01/01/2024–03/03/2026)"
        if lq == "done":
            note += "; tình trạng 'Đã thanh lý' — cần bổ sung ngày & hồ sơ thanh lý"
        if clean(r[17]) == "Đã kết thúc":
            note += "; tình trạng gốc 'Đã kết thúc'"
        vals.append("  (" + ", ".join([
            q(hid("hd_", no)), q(clean(r[1])), q(clean(r[4])), q(no), q(clean(r[3])), q(clean(r[5])), q(clean(r[7])),
            q(hid("nt_", cname.upper())) if cname else "null", "'Phòng QLHT'", staff,
            q(r[13]), q(r[15]), q(r[8]), q(r[9]), "'VND'", q(ex), q(lq),
            q(int(r[14])) if r[14] else (q(r[13].year) if r[13] else "null"),
            "'excel_bao_cao_hd_2024_2026'", q(note),
        ]) + ")")
    lines.append(",\n".join(vals) + "\non conflict (id) do nothing;\n")

    lines += [
        "-- Gói đang theo dõi LCNT trùng tên gói trong báo cáo: gắn số hiệu gói (chỉ khi còn trống)",
        "update packages set code = '25042601_ĐTRR_VTNET_XL2026'",
        " where code is null and name ilike 'Củng cố sửa chữa, khắc phục 6.617 trạm BTS%';",
        "",
        "-- Liên kết HĐ với gói LCNT theo số hiệu gói (một gói có thể nhiều HĐ)",
        "update contracts c set package_id = p.id from packages p",
        " where c.package_id is null and p.code is not null and upper(trim(p.code)) = upper(trim(c.package_code));",
        "",
        "select count(*) as so_hd, count(distinct upper(trim(package_code))) as so_goi from contracts",
        " where source = 'excel_bao_cao_hd_2024_2026';",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(rows)} HĐ, {len(contractors)} nhà thầu -> {OUT}")


if __name__ == "__main__":
    main()
