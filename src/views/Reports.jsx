import { useMemo } from "react";
import { Download } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { LCNT_KPI, HD_KPI, computeKpis } from "../lib/rules.js";
import { fmtDate } from "../lib/dates.js";
import { Banner, Btn, DataTable, ty, Empty } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { exportWorkbook } from "../lib/excel.js";
import { kpiLabel } from "./Dashboard.jsx";

const group = (rows, keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r) || "(chưa có)"; m.set(k, [...(m.get(k) || []), r]); } return m; };
const vndSum = (rs) => rs.filter((r) => r.value.currency === "VND" && r.value.current !== null).reduce((a, r) => a + r.value.current, 0);

export default function Reports() {
  const { pkgRows, hdRows, alerts, data, reportDate, cfg, filters, me } = useApp();
  const ctx = { reportDate, cfg };
  const lk = computeKpis(LCNT_KPI, pkgRows, ctx), hk = computeKpis(HD_KPI, hdRows, ctx);
  const byStaff = useMemo(() => {
    const names = [...new Set([...pkgRows, ...hdRows].map((r) => r.staffName))];
    return names.map((n) => {
      const p = pkgRows.filter((r) => r.staffName === n), h = hdRows.filter((r) => r.staffName === n);
      const pk = Object.fromEntries(computeKpis(LCNT_KPI, p, ctx).map((k) => [k.key, k.value])), hkk = Object.fromEntries(computeKpis(HD_KPI, h, ctx).map((k) => [k.key, k.value]));
      return { id: n, name: n, ...pk, ...hkk, hdCount: h.length };
    }).sort((a, b) => b.lcnt_overdue + b.hd_overdue - (a.lcnt_overdue + a.hd_overdue));
  }, [pkgRows, hdRows, reportDate, cfg]); // eslint-disable-line
  const byYear = [...group(hdRows, (r) => r.year).entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([y, rs]) => ({ id: y, y, n: rs.length, pk: new Set(rs.map((r) => r.code || r.id)).size, sign: rs.filter((r) => r.value.currency === "VND").reduce((a, r) => a + (Number(r.value.original) || 0), 0), cur: vndSum(rs), ext: rs.filter((r) => r.due.extCount).length, fx: rs.filter((r) => r.value.currency !== "VND").length }));
  const byCat = [...group(hdRows, (r) => r.category).entries()].map(([c, rs]) => ({ id: c, c, n: rs.length, act: rs.filter((r) => r.active).length, od: rs.filter((r) => r.progress.code === "overdue").length, cur: vndSum(rs) })).sort((a, b) => b.cur - a.cur);
  const byCtr = [...group(hdRows, (r) => r.contractorName).entries()].map(([c, rs]) => ({ id: c, c, n: rs.length, act: rs.filter((r) => r.active).length, od: rs.filter((r) => r.progress.code === "overdue").length, cur: vndSum(rs) })).sort((a, b) => b.n - a.n).slice(0, 15);
  return (
    <>
      <Banner icon="06-progress" title="Báo cáo" sub={<>{cfg.orgName} · Ngày báo cáo {fmtDate(reportDate)} · Cùng bộ lọc với bảng, biểu đồ và Excel</>}>
        <Btn icon={Download} onClick={() => exportWorkbook({ data, pkgRows, hdRows, alerts, reportDate, cfg, filters, me })}>Xuất Excel đầy đủ</Btn>
      </Banner>
      <FilterBar />
      <PastDateNote />
      <div className="grid2" style={{ marginBottom: 14 }}>
        <section className="card"><div className="card-h"><h2>Chỉ tiêu lựa chọn nhà thầu</h2></div>
          <DataTable short rows={lk} columns={[{ key: "l", label: "Chỉ tiêu", render: (k) => kpiLabel(k, cfg) }, { key: "v", label: "Giá trị", right: true, render: (k) => <b className="num">{k.value}</b> }, { key: "h", label: "Định nghĩa", render: (k) => <span className="small mut">{k.hint}</span> }]} /></section>
        <section className="card"><div className="card-h"><h2>Chỉ tiêu hợp đồng</h2></div>
          <DataTable short rows={hk} columns={[{ key: "l", label: "Chỉ tiêu", render: (k) => kpiLabel(k, cfg) }, { key: "v", label: "Giá trị", right: true, render: (k) => <b className="num">{k.money ? ty(k.value) : k.value}</b> }, { key: "h", label: "Định nghĩa", render: (k) => <span className="small mut">{k.hint}</span> }]} /></section>
      </div>
      <section className="card" style={{ marginBottom: 14 }}><div className="card-h"><h2>Theo cán bộ</h2><span className="small mut">Số liệu trạng thái, không phải đánh giá năng lực cá nhân.</span></div>
        {byStaff.length ? <DataTable short rows={byStaff} columns={[
          { key: "n", label: "Cán bộ", render: (r) => r.name }, { key: "a", label: "LCNT đang tổ chức", right: true, render: (r) => r.lcnt_open },
          { key: "b", label: "LCNT quá hạn", right: true, render: (r) => <span className={r.lcnt_overdue ? "tone-red b" : ""}>{r.lcnt_overdue}</span> }, { key: "c", label: "LCNT đến hạn", right: true, render: (r) => r.lcnt_due },
          { key: "d", label: "Tổng HĐ", right: true, render: (r) => r.hdCount }, { key: "e", label: "HĐ đang thực hiện", right: true, render: (r) => r.hd_active },
          { key: "f", label: "HĐ quá hạn", right: true, render: (r) => <span className={r.hd_overdue ? "tone-red b" : ""}>{r.hd_overdue}</span> }, { key: "g", label: "Chờ thanh lý", right: true, render: (r) => r.hd_liq },
          { key: "h", label: "Giá trị HĐ đang TH (VND)", right: true, render: (r) => ty(r.hd_value) },
        ]} /> : <Empty />}</section>
      <div className="grid2" style={{ marginBottom: 14 }}>
        <section className="card"><div className="card-h"><h2>Hợp đồng theo năm ký</h2></div>
          <DataTable short rows={byYear} columns={[{ key: "y", label: "Năm", render: (r) => r.y }, { key: "n", label: "Số HĐ", right: true, render: (r) => r.n }, { key: "p", label: "Số gói (mã)", right: true, render: (r) => r.pk },
            { key: "s", label: "GT ký ban đầu (VND)", right: true, render: (r) => ty(r.sign) }, { key: "c", label: "GT hiện hành (VND)", right: true, render: (r) => ty(r.cur) }, { key: "e", label: "Có gia hạn", right: true, render: (r) => r.ext },
            { key: "f", label: "Ngoại tệ (không cộng)", right: true, render: (r) => r.fx || "—" }]} /></section>
        <section className="card"><div className="card-h"><h2>Hợp đồng theo loại gói</h2></div>
          <DataTable short rows={byCat} columns={[{ key: "c", label: "Loại", render: (r) => r.c }, { key: "n", label: "Số HĐ", right: true, render: (r) => r.n }, { key: "a", label: "Đang TH", right: true, render: (r) => r.act },
            { key: "o", label: "Quá hạn", right: true, render: (r) => r.od }, { key: "v", label: "GT hiện hành (VND)", right: true, render: (r) => ty(r.cur) }]} /></section>
      </div>
      <section className="card"><div className="card-h"><h2>Nhà thầu (15 nhà thầu nhiều HĐ nhất)</h2></div>
        <DataTable short rows={byCtr} columns={[{ key: "c", label: "Nhà thầu", render: (r) => r.c }, { key: "n", label: "Số HĐ", right: true, render: (r) => r.n }, { key: "a", label: "Đang TH", right: true, render: (r) => r.act },
          { key: "o", label: "Quá hạn", right: true, render: (r) => r.od }, { key: "v", label: "GT hiện hành (VND)", right: true, render: (r) => ty(r.cur) }]} /></section>
      <p className="small mut">Không cộng giá trị gói thầu với hợp đồng (có thể trùng phạm vi); không cộng khác tiền tệ khi chưa có tỷ giá và ngày quy đổi. Tổng số gói/HĐ đếm theo ID riêng.</p>
    </>
  );
}
