import { useMemo } from "react";
import { Search, RotateCcw } from "lucide-react";
import { useApp, EMPTY_FILTERS, STATUS_OPTIONS } from "../lib/store.jsx";
import { Sel, Inp, Btn } from "./ui.jsx";
import { staffLabel } from "../lib/rules.js";

/** Bộ lọc xuyên suốt: phạm vi Của tôi / Toàn phòng không nhân đôi dữ liệu, chỉ lọc. */
export default function FilterBar({ lockMine = false, showContractor = true }) {
  const { data, filters: f, setFilters, reportDate, setReportDate, today, me, allPkgRows, allHdRows } = useApp();
  const opts = useMemo(() => {
    const all = [...allPkgRows, ...allHdRows];
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "vi"));
    return {
      staff: data.staff.filter((s) => s.active !== false).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      units: uniq(all.map((r) => r.unit)),
      cats: uniq(all.map((r) => r.category)),
      years: uniq(all.map((r) => r.year)).sort((a, b) => b - a),
      contractors: data.contractors.filter((c) => allHdRows.some((r) => r.contractorId === c.id)).sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name, "vi")),
    };
  }, [data, allPkgRows, allHdRows]);
  const scope = lockMine ? "mine" : f.scope;
  const dirty = Object.keys(EMPTY_FILTERS).some((k) => k !== "scope" && f[k]) || reportDate !== today;

  return (
    <section className="filters" aria-label="Bộ lọc">
      <div>
        <span className="lbl">Phạm vi</span>
        <div className="seg" role="radiogroup" aria-label="Phạm vi">
          <button role="radio" aria-checked={scope === "mine"} className={scope === "mine" ? "on" : ""} disabled={!me} onClick={() => setFilters({ scope: "mine" })}>Của tôi</button>
          <button role="radio" aria-checked={scope === "all"} className={scope === "all" ? "on" : ""} disabled={lockMine} onClick={() => setFilters({ scope: "all" })}>Toàn phòng</button>
        </div>
      </div>
      <label><span className="lbl">Cán bộ</span>
        <Sel value={f.staff} onChange={(e) => setFilters({ staff: e.target.value })} disabled={scope === "mine"}>
          <option value="">Tất cả</option><option value="__none">Chưa phân công</option>
          {opts.staff.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}{s.account && s.account !== s.fullName?.toLowerCase() ? ` · ${s.account}` : ""}</option>)}
        </Sel></label>
      <label><span className="lbl">Đơn vị</span>
        <Sel value={f.unit} onChange={(e) => setFilters({ unit: e.target.value })}><option value="">Tất cả</option>{opts.units.map((u) => <option key={u}>{u}</option>)}</Sel></label>
      {showContractor && <label><span className="lbl">Nhà thầu</span>
        <Sel value={f.contractor} onChange={(e) => setFilters({ contractor: e.target.value })}><option value="">Tất cả</option>{opts.contractors.map((c) => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}</Sel></label>}
      <label><span className="lbl">Nhóm nghiệp vụ</span>
        <Sel value={f.category} onChange={(e) => setFilters({ category: e.target.value })}><option value="">Tất cả</option>{opts.cats.map((u) => <option key={u}>{u}</option>)}</Sel></label>
      <label><span className="lbl">Năm</span>
        <Sel value={f.year} onChange={(e) => setFilters({ year: e.target.value })}><option value="">Tất cả</option>{opts.years.map((y) => <option key={y}>{y}</option>)}</Sel></label>
      <label><span className="lbl">Trạng thái</span>
        <Sel value={f.status} onChange={(e) => setFilters({ status: e.target.value })}><option value="">Tất cả</option>{STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></label>
      <label><span className="lbl">Ngày báo cáo</span>
        <Inp type="date" value={reportDate} max="2100-12-31" onChange={(e) => setReportDate(e.target.value)} /></label>
      <label><span className="lbl">Tìm kiếm</span>
        <div className="rel"><Search size={15} aria-hidden style={{ position: "absolute", left: 9, top: 9, color: "var(--muted)" }} />
          <Inp style={{ paddingLeft: 30 }} value={f.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder="Mã gói, số HĐ, tên, nhà thầu…" /></div></label>
      <div>{dirty && <Btn kind="ghost" sm icon={RotateCcw} onClick={() => { setFilters({ ...EMPTY_FILTERS, scope: f.scope }); setReportDate(today); }}>Xóa lọc</Btn>}</div>
    </section>
  );
}

/** Ghi chú khi xem ngày quá khứ: không giả lập trạng thái cũ cho hồ sơ thiếu lịch sử. */
export function PastDateNote() {
  const { reportDate, today } = useApp();
  if (reportDate >= today) return null;
  return (
    <div className="warn-note" style={{ marginBottom: 12 }}>
      Đang xem theo ngày báo cáo {reportDate.split("-").reverse().join("/")} (quá khứ). Mốc/HĐ hoàn thành sau ngày này được coi là chưa hoàn thành; gia hạn/phụ lục tính theo ngày hiệu lực.
      Các hạn mốc đã sửa sau ngày này hiển thị theo giá trị hiện hành và được đánh dấu “đổi sau ngày BC” — hệ thống không dựng lại trạng thái cũ khi thiếu lịch sử.
    </div>
  );
}
