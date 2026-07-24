import { useEffect, useMemo, useState } from "react";
import {
  supabase, isConfigured, genId, MAPPERS, TABLE_ORDER,
  fetchAll, insertRow, insertRows, updateRow, deleteRow,
} from "./lib/supabase";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

/* ---------------- date helpers ---------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? d.split("-").reverse().join("/") : "");
const byPos = (a, b) => a.position - b.position;
const isoToDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const pad = (n) => String(n).padStart(2, "0");
const addDays = (iso, n) => {
  const dt = isoToDate(iso); dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const daysBetween = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / 864e5);

// chuyển giá trị ô Excel (Date hoặc chuỗi dd/mm/yyyy | yyyy-mm-dd) -> "YYYY-MM-DD"
function toISO(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

const STATUS = {
  done:    { label: "Đã xong",       icon: "✅", cls: "done" },
  ontrack: { label: "Đúng tiến độ",  icon: "🟢", cls: "ontrack" },
  late:    { label: "Chậm tiến độ",  icon: "🔴", cls: "late" },
  na:      { label: "Chưa bắt đầu",  icon: "⏳", cls: "na" },
};
const STATUS_ARGB = { done: "FF2563EB", ontrack: "FF16A34A", late: "FFDC2626", na: "FF64748B" };

function evalPackage(ms, today) {
  const list = [...ms].sort(byPos);
  if (!list.length) return { code: "na", done: 0, total: 0, lateList: [], current: "Chưa bắt đầu" };
  const total = list.length;
  const done = list.filter((m) => m.actualDate).length;
  const last = list[list.length - 1];
  const lateList = list.filter((m) => m.plannedDate && !m.actualDate && m.plannedDate < today);
  const doneOnes = list.filter((m) => m.actualDate);
  const current = doneOnes.length ? doneOnes[doneOnes.length - 1].name : "Chưa bắt đầu";
  let code = "ontrack";
  if (last.actualDate) code = "done";
  else if (lateList.length) code = "late";
  return { code, done, total, lateList, current };
}
function plannedContractDate(ms) {
  const list = [...ms].sort(byPos);
  if (!list.length) return null;
  const hd = [...list].reverse().find((m) => m.name.toLowerCase().includes("hợp đồng")) || list[list.length - 1];
  return hd.plannedDate || null;
}
const isLateMilestone = (m) => m.actualDate && m.plannedDate && m.actualDate > m.plannedDate;
const STATUS_ORDER = { late: 0, na: 1, ontrack: 2, done: 3 };

// Sinh lịch kế hoạch từ 1 ngày đầu + offset_days của bộ mốc
function buildSchedule(tplMs, firstDate) {
  const sorted = [...tplMs].sort(byPos);
  const base = sorted.find((m) => m.offsetDays != null)?.offsetDays ?? 0;
  const out = {};
  sorted.forEach((m) => {
    out[m.position] = firstDate && m.offsetDays != null ? addDays(firstDate, m.offsetDays - base) : null;
  });
  return out;
}

/* ---------------- UI primitives ---------------- */
const Btn = ({ children, kind = "", ...p }) => <button className={`btn ${kind}`} {...p}>{children}</button>;
const Inp = (p) => <input className="inp" {...p} />;
const Sel = ({ children, ...p }) => <select className="sel" {...p}>{children}</select>;
const TA = (p) => <textarea className="ta" {...p} />;
const Field = ({ label, children }) => <div className="field"><label className="lbl">{label}</label>{children}</div>;
const Badge = ({ code }) => { const s = STATUS[code] || STATUS.na; return <span className={`bdg ${s.cls}`}>{s.icon} {s.label}</span>; };
const Modal = ({ wide, onClose, children }) => (
  <div className="ov" onClick={onClose}>
    <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);

/* ============================================================ */
export default function App() {
  const [data, setData] = useState(null);
  const [me, setMe] = useState(() => localStorage.getItem("gt_user") || "");
  const [tab, setTab] = useState("dashboard");
  const today = todayStr();

  useEffect(() => {
    if (!isConfigured) { setData({ error: "config" }); return; }
    (async () => {
      try {
        const res = await Promise.all(TABLE_ORDER.map(fetchAll));
        setData(Object.fromEntries(TABLE_ORDER.map((t, i) => [t, res[i]])));
      } catch (e) { setData({ error: e.message }); }
    })();
    const ch = supabase.channel("gt-realtime");
    TABLE_ORDER.forEach((table) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
        const toApp = MAPPERS[table].toApp;
        setData((d) => {
          if (!d || d.error) return d;
          const arr = d[table] || [];
          if (p.eventType === "INSERT") {
            const r = toApp(p.new);
            return arr.some((x) => x.id === r.id) ? d : { ...d, [table]: [...arr, r] };
          }
          if (p.eventType === "UPDATE") { const r = toApp(p.new); return { ...d, [table]: arr.map((x) => (x.id === r.id ? r : x)) }; }
          if (p.eventType === "DELETE") return { ...d, [table]: arr.filter((x) => x.id !== p.old.id) };
          return d;
        });
      });
    });
    ch.subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  if (!data) return <Splash text="Đang tải dữ liệu…" />;
  if (data.error === "config") return <ConfigHelp />;
  if (data.error) return <Splash text={"Lỗi kết nối: " + data.error} />;

  const staff = [...data.staff].sort(byPos);
  const currentUser = staff.find((s) => s.id === me);
  if (!currentUser) return <Login staff={staff} onPick={(id) => { localStorage.setItem("gt_user", id); setMe(id); }} />;

  const NAV = [
    { id: "dashboard", ico: "📊", label: "Tổng hợp" },
    { id: "mine", ico: "📁", label: "Gói của tôi" },
    { id: "all", ico: "🗂️", label: "Toàn phòng" },
    { id: "templates", ico: "⚙️", label: "Bộ mốc quy trình" },
    { id: "staff", ico: "👥", label: "Cán bộ" },
  ];
  const ctx = { data, today, me: currentUser, staff };

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><b>TIẾN ĐỘ GÓI THẦU</b><span>B.QLDAHTVT · VTNet</span></div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)}>
              <span className="ico">{n.ico}</span> {n.label}
            </button>
          ))}
        </nav>
        <div className="who">
          Đang đăng nhập
          <b>{currentUser.fullName}{currentUser.isManager ? " (Trưởng phòng)" : ""}</b>
          <button onClick={() => { localStorage.removeItem("gt_user"); setMe(""); }}>Đổi người</button>
        </div>
      </aside>
      <main className="main">
        {tab === "dashboard" && <Dashboard {...ctx} />}
        {tab === "mine" && <MyPackages {...ctx} />}
        {tab === "all" && <AllPackages {...ctx} />}
        {tab === "templates" && <Templates {...ctx} />}
        {tab === "staff" && <StaffView {...ctx} />}
      </main>
    </div>
  );
}

/* ---------------- Splash / Login / Config ---------------- */
const Splash = ({ text }) => (
  <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>{text}</div>
);
function ConfigHelp() {
  return (
    <div style={{ maxWidth: 620, margin: "60px auto", padding: 24 }}>
      <div className="card"><h2 style={{ marginTop: 0 }}>⚙️ Chưa cấu hình Supabase</h2>
        <p>Mở <code>src/lib/supabase.js</code> và dán Project URL + anon key vào 2 dòng đầu.</p></div>
    </div>
  );
}
function Login({ staff, onPick }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card" style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Theo dõi tiến độ gói thầu</div>
          <div className="mut small">B.QLDAHTVT · VTNet</div>
        </div>
        <hr className="hr" />
        <label className="lbl">Chọn tên của anh/chị để vào</label>
        <div className="grid" style={{ gridTemplateColumns: "1fr", marginTop: 6 }}>
          {staff.map((s) => (
            <button key={s.id} className="btn ghost" style={{ justifyContent: "flex-start" }} onClick={() => onPick(s.id)}>
              {s.isManager ? "👔 " : "👤 "}{s.fullName}{s.code ? ` · ${s.code}` : ""}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- shared rows ---------------- */
function usePkgRows(data, today) {
  return useMemo(() => data.packages.map((pk) => {
    const ms = data.package_milestones.filter((m) => m.packageId === pk.id);
    const ev = evalPackage(ms, today);
    const staff = data.staff.find((s) => s.id === pk.staffId);
    const tpl = data.workflow_templates.find((t) => t.id === pk.templateId);
    return { ...pk, ms, ev, staffName: staff ? staff.fullName : "—", tplName: tpl ? tpl.name : "—", plannedContract: plannedContractDate(ms) };
  }), [data, today]);
}

/* ---------------- Excel export (ExcelJS, có viền + màu) ---------------- */
async function exportStyledExcel(rows, today) {
  const wb = new ExcelJS.Workbook();
  const RED = "FFEE0033", DARK = "FF7A0019", GREY = "FFF2F4F7";
  const thin = { style: "thin", color: { argb: "FFBFC5CE" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // ---- Sheet 1: Tổng hợp ----
  const ws = wb.addWorksheet("Tổng hợp", { views: [{ state: "frozen", ySplit: 4 }] });
  const cols = [
    { h: "STT", w: 6 }, { h: "Cán bộ", w: 16 }, { h: "Tên gói thầu", w: 55 },
    { h: "Loại quy trình", w: 26 }, { h: "Tiến độ hiện tại", w: 24 },
    { h: "Ngày ký HĐ (KH)", w: 16 }, { h: "Đánh giá", w: 16 }, { h: "Mốc", w: 9 },
  ];
  ws.columns = cols.map((c) => ({ width: c.w }));
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = "BÁO CÁO TIẾN ĐỘ CÁC GÓI THẦU — B.QLDAHTVT / VTNet";
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, cols.length);
  const st = ws.getCell(2, 1);
  st.value = `Ngày báo cáo: ${fmt(today)}  ·  Tổng ${rows.length} gói thầu`;
  st.font = { italic: true, color: { argb: "FF555555" } };
  st.alignment = { horizontal: "center" };
  ws.addRow([]);
  const hr = ws.addRow(cols.map((c) => c.h));
  hr.height = 24;
  hr.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = border;
  });
  rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, r.staffName, r.name, r.tplName, r.ev.current, fmt(r.plannedContract) || "—", STATUS[r.ev.code].label, `${r.ev.done}/${r.ev.total}`]);
    row.eachCell((c, col) => {
      c.border = border;
      c.alignment = { vertical: "middle", wrapText: true, horizontal: col === 3 ? "left" : "center" };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    });
    const ev = row.getCell(7);
    ev.font = { bold: true, color: { argb: STATUS_ARGB[r.ev.code] } };
  });

  // ---- Sheet 2: Chi tiết mốc ----
  const ws2 = wb.addWorksheet("Chi tiết mốc", { views: [{ state: "frozen", ySplit: 1 }] });
  const c2 = [
    { h: "Cán bộ", w: 16 }, { h: "Gói thầu", w: 42 }, { h: "TT", w: 5 }, { h: "Nội dung công việc", w: 34 },
    { h: "Số văn bản", w: 22 }, { h: "Ngày dự kiến", w: 14 }, { h: "Ngày thực tế", w: 14 }, { h: "Ghi chú", w: 30 },
  ];
  ws2.columns = c2.map((c) => ({ width: c.w }));
  const h2 = ws2.addRow(c2.map((c) => c.h));
  h2.height = 22;
  h2.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = border;
  });
  rows.forEach((r) => {
    [...r.ms].sort(byPos).forEach((m) => {
      const late = m.plannedDate && !m.actualDate && m.plannedDate < today;
      const slow = isLateMilestone(m);
      const row = ws2.addRow([r.staffName, r.name, m.position, m.name, m.docNumber || "", fmt(m.plannedDate), fmt(m.actualDate), m.note || ""]);
      row.eachCell((c, col) => {
        c.border = border;
        c.alignment = { vertical: "middle", wrapText: true, horizontal: [3, 6, 7].includes(col) ? "center" : "left" };
        if (late) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
        else if (slow) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF1E0" } };
      });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `TienDoGoiThau_${today}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ data, today }) {
  const rows = usePkgRows(data, today);
  const total = rows.length;
  const cnt = { done: 0, ontrack: 0, late: 0, na: 0 };
  rows.forEach((r) => { cnt[r.ev.code]++; });

  const byStaff = {};
  rows.forEach((r) => {
    byStaff[r.staffName] = byStaff[r.staffName] || { name: r.staffName, done: 0, ontrack: 0, late: 0, na: 0 };
    byStaff[r.staffName][r.ev.code]++;
  });
  const staffChart = Object.values(byStaff);
  const pieData = [
    { name: "Đã xong", value: cnt.done, c: "#2563eb" },
    { name: "Đúng tiến độ", value: cnt.ontrack, c: "#16a34a" },
    { name: "Chậm tiến độ", value: cnt.late, c: "#dc2626" },
    { name: "Chưa bắt đầu", value: cnt.na, c: "#94a3b8" },
  ].filter((d) => d.value > 0);

  const warns = [];
  rows.forEach((r) => r.ev.lateList.forEach((m) => {
    const days = Math.round((new Date(today) - new Date(m.plannedDate)) / 864e5);
    warns.push({ pkg: r.name, staff: r.staffName, milestone: m.name, planned: m.plannedDate, days, note: m.note });
  }));
  warns.sort((a, b) => b.days - a.days);

  // Chỉ hiển thị tối đa 6 gói ĐANG DIỄN RA (chưa xong), ưu tiên gói chậm
  const ongoing = rows.filter((r) => r.ev.code !== "done")
    .sort((a, b) => STATUS_ORDER[a.ev.code] - STATUS_ORDER[b.ev.code] || a.staffName.localeCompare(b.staffName));
  const show = ongoing.slice(0, 6);

  return (
    <>
      <div className="between">
        <div>
          <h1 className="h1">Tổng hợp tiến độ gói thầu</h1>
          <p className="sub">Ngày báo cáo: {fmt(today)} · Toàn phòng {total} gói thầu</p>
        </div>
        <Btn kind="ghost" onClick={() => exportStyledExcel(rows, today)}>⬇ Xuất Excel</Btn>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 16 }}>
        <StatCard ico="📦" n={total} l="Tổng số gói" color="#1f2733" />
        <StatCard ico="✅" n={cnt.done} l="Đã xong" color="#2563eb" />
        <StatCard ico="🟢" n={cnt.ontrack} l="Đúng tiến độ" color="#16a34a" />
        <StatCard ico="🔴" n={cnt.late} l="Chậm tiến độ" color="#dc2626" />
        <StatCard ico="⏳" n={cnt.na} l="Chưa bắt đầu" color="#64748b" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", marginBottom: 16 }}>
        <div className="card">
          <b>Số gói theo cán bộ</b>
          <div style={{ height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <BarChart data={staffChart} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="done" stackId="a" name="Đã xong" fill="#2563eb" />
                <Bar dataKey="ontrack" stackId="a" name="Đúng TĐ" fill="#16a34a" />
                <Bar dataKey="late" stackId="a" name="Chậm" fill="#dc2626" />
                <Bar dataKey="na" stackId="a" name="Chưa BĐ" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <b>Tỷ lệ trạng thái</b>
          <div style={{ height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.c} />)}
                </Pie>
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <b>📋 Gói thầu đang diễn ra</b>
          <span className="tag">Hiển thị {show.length}/{ongoing.length} gói đang chạy</span>
        </div>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>STT</th><th>Cán bộ</th><th>Tên gói thầu</th><th>Tiến độ hiện tại</th><th>Mốc</th><th>Ngày ký HĐ (KH)</th><th>Đánh giá</th></tr></thead>
            <tbody>
              {show.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td><td>{r.staffName}</td><td style={{ maxWidth: 380 }}>{r.name}</td>
                  <td className="small">{r.ev.current}</td><td>{r.ev.done}/{r.ev.total}</td>
                  <td className="small">{fmt(r.plannedContract) || "—"}</td><td><Badge code={r.ev.code} /></td>
                </tr>
              ))}
              {!show.length && <tr><td colSpan={7} className="empty">Không có gói nào đang diễn ra.</td></tr>}
            </tbody>
          </table>
        </div>
        {ongoing.length > 6 && <div className="small mut" style={{ marginTop: 8 }}>Xem đầy đủ ở tab “Toàn phòng”.</div>}
      </div>

      <div className="card">
        <div className="between" style={{ marginBottom: 10 }}>
          <b>⚠️ Cảnh báo mốc chậm / vướng mắc</b>
          <span className="tag">{warns.length} mốc quá hạn</span>
        </div>
        {!warns.length && <div className="empty">🎉 Không có mốc nào quá hạn.</div>}
        {warns.map((w, i) => (
          <div key={i} className="warnrow late">
            <span style={{ fontSize: 18 }}>🔴</span>
            <div style={{ flex: 1 }}>
              <div><b>{w.milestone}</b> <span className="pill-late">Chậm {w.days} ngày</span></div>
              <div className="small mut" style={{ marginTop: 2 }}>{w.staff} · {w.pkg}</div>
              <div className="small" style={{ marginTop: 2 }}>Dự kiến ký: {fmt(w.planned)}{w.note ? ` · ${w.note}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
const StatCard = ({ ico, n, l, color }) => (
  <div className="card stat"><span className="ico">{ico}</span><span className="n" style={{ color }}>{n}</span><span className="l">{l}</span></div>
);

/* ---------------- My Packages ---------------- */
function MyPackages({ data, today, me }) {
  const rows = usePkgRows(data, today).filter((r) => r.staffId === me.id);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState(null);
  return (
    <>
      <div className="between">
        <div><h1 className="h1">Gói thầu của tôi</h1><p className="sub">{me.fullName} · {rows.length} gói thầu</p></div>
        <div className="row">
          <Btn kind="ghost" onClick={() => setImporting(true)}>⬆ Import Excel</Btn>
          <Btn onClick={() => setAdding(true)}>+ Thêm gói thầu</Btn>
        </div>
      </div>
      {!rows.length && <div className="card empty">Chưa có gói thầu nào. Bấm “+ Thêm gói thầu” hoặc “⬆ Import Excel”.</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))" }}>
        {rows.map((r) => <PkgCard key={r.id} r={r} onOpen={() => setDetail(r.id)} />)}
      </div>
      {adding && <AddPackage data={data} me={me} onClose={() => setAdding(false)} />}
      {importing && <ImportPackages data={data} me={me} onClose={() => setImporting(false)} />}
      {detail && <PackageDetail data={data} today={today} pkgId={detail} canEdit onClose={() => setDetail(null)} />}
    </>
  );
}
function PkgCard({ r, onOpen }) {
  const pct = r.ev.total ? Math.round((r.ev.done / r.ev.total) * 100) : 0;
  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={onOpen}>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <Badge code={r.ev.code} />
        <span className="tag">{r.ev.done}/{r.ev.total} mốc{r.planLocked ? " · 🔒" : ""}</span>
      </div>
      <div style={{ fontWeight: 700, margin: "10px 0 4px", lineHeight: 1.4 }}>{r.name}</div>
      <div className="small mut">Đang ở: {r.ev.current}</div>
      <div className="small mut" style={{ marginTop: 2 }}>Ngày ký HĐ (KH): {fmt(r.plannedContract) || "—"}</div>
      <div style={{ height: 7, background: "#eef1f5", borderRadius: 5, marginTop: 10, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: r.ev.code === "late" ? "#dc2626" : "#16a34a" }} />
      </div>
      {r.ev.lateList.length > 0 && <div className="small" style={{ color: "#dc2626", marginTop: 8, fontWeight: 600 }}>⚠️ {r.ev.lateList.length} mốc đang chậm</div>}
    </div>
  );
}

/* ---------------- All Packages ---------------- */
function AllPackages({ data, today, me }) {
  const all = usePkgRows(data, today);
  const [fStaff, setFStaff] = useState(""); const [fStatus, setFStatus] = useState(""); const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null); const [importing, setImporting] = useState(false);
  const rows = all.filter((r) => (!fStaff || r.staffId === fStaff) && (!fStatus || r.ev.code === fStatus) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const staff = [...data.staff].sort(byPos);
  return (
    <>
      <div className="between">
        <div><h1 className="h1">Toàn phòng</h1><p className="sub">Tiến độ tất cả gói thầu · theo người & theo trạng thái</p></div>
        <div className="row">
          <Btn kind="ghost" onClick={() => exportStyledExcel(all, today)}>⬇ Xuất Excel</Btn>
          <Btn kind="ghost" onClick={() => setImporting(true)}>⬆ Import Excel</Btn>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <div style={{ flex: "1 1 200px" }}><label className="lbl">Tìm tên gói</label>
            <Inp value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập tên gói thầu…" /></div>
          <div style={{ flex: "0 0 200px" }}><label className="lbl">Cán bộ</label>
            <Sel value={fStaff} onChange={(e) => setFStaff(e.target.value)}>
              <option value="">Tất cả</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Sel></div>
          <div style={{ flex: "0 0 180px" }}><label className="lbl">Trạng thái</label>
            <Sel value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Tất cả</option><option value="done">Đã xong</option><option value="ontrack">Đúng tiến độ</option>
              <option value="late">Chậm tiến độ</option><option value="na">Chưa bắt đầu</option>
            </Sel></div>
        </div>
      </div>
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>STT</th><th>Cán bộ</th><th>Tên gói thầu</th><th>Tiến độ hiện tại</th><th>Mốc</th><th>Ngày ký HĐ (KH)</th><th>Đánh giá</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td><td>{r.staffName}</td><td style={{ maxWidth: 360 }}>{r.name}</td>
                <td className="small">{r.ev.current}</td><td>{r.ev.done}/{r.ev.total}</td>
                <td className="small">{fmt(r.plannedContract) || "—"}</td><td><Badge code={r.ev.code} /></td>
                <td><Btn kind="ghost sm" onClick={() => setDetail(r.id)}>Xem</Btn></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="empty">Không có gói thầu phù hợp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
      {detail && <PackageDetail data={data} today={today} pkgId={detail}
        canEdit={me.isManager || all.find((r) => r.id === detail)?.staffId === me.id} onClose={() => setDetail(null)} />}
      {importing && <ImportPackages data={data} me={me} onClose={() => setImporting(false)} />}
    </>
  );
}

/* ---------------- Package detail (grid + cascade + lock) ---------------- */
function PackageDetail({ data, today, pkgId, canEdit, onClose }) {
  const pkg = data.packages.find((p) => p.id === pkgId);
  const ms = data.package_milestones.filter((m) => m.packageId === pkgId).sort(byPos);
  const staff = data.staff.find((s) => s.id === pkg?.staffId);
  const ev = evalPackage(ms, today);
  const locked = !!pkg?.plan_locked;

  const saveField = async (id, col, value) => {
    try { await updateRow("package_milestones", id, { [col]: value || null }); }
    catch (e) { alert("Lỗi lưu: " + e.message); }
  };
  // Sửa ngày dự kiến: nếu đã có ngày cũ -> tịnh tiến toàn bộ mốc sau cùng độ lệch
  const onPlannedChange = async (m, newVal) => {
    if (locked) return;
    try {
      if (m.plannedDate && newVal) {
        const delta = daysBetween(m.plannedDate, newVal);
        await updateRow("package_milestones", m.id, { planned_date: newVal });
        if (delta !== 0) {
          const subs = ms.filter((x) => x.position > m.position && x.plannedDate);
          for (const x of subs) await updateRow("package_milestones", x.id, { planned_date: addDays(x.plannedDate, delta) });
        }
      } else {
        await updateRow("package_milestones", m.id, { planned_date: newVal || null });
      }
    } catch (e) { alert("Lỗi: " + e.message); }
  };
  const toggleLock = async () => {
    try { await updateRow("packages", pkgId, { plan_locked: !locked }); } catch (e) { alert("Lỗi: " + e.message); }
  };
  const delPkg = async () => { if (!confirm("Xóa gói thầu này và toàn bộ mốc?")) return; await deleteRow("packages", pkgId); onClose(); };

  return (
    <Modal wide onClose={onClose}>
      <div className="between" style={{ marginBottom: 4 }}>
        <div>
          <h3 style={{ margin: 0 }}>{pkg?.name}</h3>
          <div className="small mut">{staff?.fullName} · {ev.done}/{ev.total} mốc · Ngày ký HĐ (KH): {fmt(plannedContractDate(ms)) || "—"}</div>
        </div>
        <Badge code={ev.code} />
      </div>
      <hr className="hr" />
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="small mut">
          {canEdit ? (locked
            ? "🔒 Kế hoạch đang KHÓA — không sửa được ngày dự kiến."
            : "🔓 Kế hoạch đang MỞ — sửa 1 ngày dự kiến, các mốc sau tự tịnh tiến theo.")
            : "🔒 Chỉ xem — chỉ cán bộ phụ trách hoặc trưởng phòng mới sửa được."}
        </div>
        {canEdit && <Btn kind="ghost sm" onClick={toggleLock}>{locked ? "🔓 Mở khóa kế hoạch" : "🔒 Khóa kế hoạch"}</Btn>}
      </div>
      <div className="scroll" style={{ maxHeight: "58vh" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}>TT</th><th style={{ minWidth: 220 }}>Nội dung công việc</th>
              <th style={{ minWidth: 150 }}>Số văn bản</th><th style={{ width: 140 }}>Ngày dự kiến ký</th>
              <th style={{ width: 140 }}>Ngày thực tế</th><th style={{ minWidth: 170 }}>Ghi chú tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {ms.map((m) => {
              const late = m.plannedDate && !m.actualDate && m.plannedDate < today;
              const slow = isLateMilestone(m);
              return (
                <tr key={m.id}>
                  <td>{m.position}</td>
                  <td>{m.name}
                    {late && <span className="pill-late" style={{ marginLeft: 6 }}>chậm</span>}
                    {slow && <span className="pill-late" style={{ marginLeft: 6 }}>🟠 muộn</span>}
                  </td>
                  <td><input className="cell-in" defaultValue={m.docNumber || ""} disabled={!canEdit}
                    onBlur={(e) => e.target.value !== (m.docNumber || "") && saveField(m.id, "doc_number", e.target.value)} /></td>
                  <td><input key={"p_" + m.id + (m.plannedDate || "")} type="date" className="cell-in"
                    defaultValue={m.plannedDate || ""} disabled={!canEdit || locked}
                    onChange={(e) => onPlannedChange(m, e.target.value)} /></td>
                  <td><input key={"a_" + m.id + (m.actualDate || "")} type="date" className="cell-in"
                    defaultValue={m.actualDate || ""} disabled={!canEdit} style={slow ? { background: "#fdf1e0" } : {}}
                    onChange={(e) => saveField(m.id, "actual_date", e.target.value)} /></td>
                  <td><input className="cell-in" defaultValue={m.note || ""} disabled={!canEdit}
                    onBlur={(e) => e.target.value !== (m.note || "") && saveField(m.id, "note", e.target.value)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="between" style={{ marginTop: 14 }}>
        {canEdit ? <Btn kind="danger sm" onClick={delPkg}>🗑 Xóa gói thầu</Btn> : <span />}
        <Btn kind="ghost" onClick={onClose}>Đóng</Btn>
      </div>
    </Modal>
  );
}

/* ---------------- Add package (tự sinh lịch từ 1 ngày) ---------------- */
function AddPackage({ data, me, onClose }) {
  const staff = [...data.staff].sort(byPos);
  const tpls = data.workflow_templates;
  const [name, setName] = useState("");
  const [staffId, setStaffId] = useState(me.id);
  const [tplId, setTplId] = useState(tpls.find((t) => t.isDefault)?.id || tpls[0]?.id || "");
  const [firstDate, setFirstDate] = useState("");
  const [planLocked, setPlanLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const tms = useMemo(() => data.template_milestones.filter((t) => t.templateId === tplId).sort(byPos), [data, tplId]);
  const schedule = useMemo(() => buildSchedule(tms, firstDate), [tms, firstDate]);
  const firstName = tms[0]?.name || "mốc đầu";

  const create = async () => {
    if (!name.trim()) return alert("Nhập tên gói thầu.");
    if (!tplId) return alert("Chưa có bộ mốc quy trình.");
    setBusy(true);
    try {
      const pid = "pk_" + genId();
      await insertRow("packages", { id: pid, staffId, templateId: tplId, name: name.trim(), note: null, planLocked });
      await insertRows("package_milestones", tms.map((t) => ({
        id: "pm_" + genId(), packageId: pid, position: t.position, name: t.name,
        docNumber: null, plannedDate: schedule[t.position] || null, actualDate: null, note: null,
      })));
      onClose();
    } catch (e) { alert("Lỗi: " + e.message); setBusy(false); }
  };

  return (
    <Modal wide onClose={onClose}>
      <h3>Thêm gói thầu</h3>
      <div className="row">
        <div style={{ flex: "1 1 340px" }}>
          <Field label="Tên gói thầu"><TA value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Khảo sát 3184 trạm 5G quý 3/2026…" /></Field>
          <Field label="Cán bộ phụ trách">
            <Sel value={staffId} onChange={(e) => setStaffId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Sel>
          </Field>
          <Field label="Loại quy trình (bộ mốc)">
            <Sel value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.name} ({data.template_milestones.filter((m) => m.templateId === t.id).length} mốc)</option>)}
            </Sel>
          </Field>
          <Field label={`Ngày dự kiến ký "${firstName}"`}>
            <Inp type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
          </Field>
          <label className="flex" style={{ cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" checked={planLocked} onChange={(e) => setPlanLocked(e.target.checked)} />
            🔒 Khóa cứng tiến độ kế hoạch sau khi tạo
          </label>
          <div className="small mut" style={{ marginTop: 6 }}>
            Chỉ nhập 1 ngày đầu — các mốc sau tự nhảy theo khoảng chuẩn của bộ mốc. Sau này sửa 1 mốc, các mốc sau tự tịnh tiến (nếu chưa khóa).
          </div>
        </div>
        <div style={{ flex: "1 1 300px" }}>
          <label className="lbl">Lịch kế hoạch tự sinh</label>
          <div className="scroll card" style={{ maxHeight: 300, padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 30 }}>TT</th><th>Mốc</th><th style={{ width: 100 }}>Dự kiến</th></tr></thead>
              <tbody>
                {tms.map((m) => (
                  <tr key={m.id}><td>{m.position}</td><td className="small">{m.name}</td>
                    <td className="small">{schedule[m.position] ? fmt(schedule[m.position]) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="right" style={{ marginTop: 8 }}>
        <Btn kind="ghost" onClick={onClose}>Hủy</Btn>
        <Btn onClick={create} disabled={busy}>{busy ? "Đang tạo…" : "Tạo gói thầu"}</Btn>
      </div>
    </Modal>
  );
}

/* ---------------- Import packages ---------------- */
function ImportPackages({ data, me, onClose }) {
  const tpls = data.workflow_templates;
  const [tplId, setTplId] = useState(tpls.find((t) => t.isDefault)?.id || tpls[0]?.id || "");
  const [preview, setPreview] = useState(null); const [busy, setBusy] = useState(false);
  const tplMs = data.template_milestones.filter((m) => m.templateId === tplId).sort(byPos);

  const downloadTemplate = () => {
    const guide = { "Cán bộ": "(điền họ tên hoặc mã cán bộ)", "Tên gói thầu": "(bắt buộc)", "Ngày ký Tờ trình chủ trương": "dd/mm/yyyy (các mốc sau tự nhảy)" };
    const example = { "Cán bộ": me.fullName, "Tên gói thầu": "VD: Khảo sát 500 trạm 5G quý 4/2026", "Ngày ký Tờ trình chủ trương": "" };
    const ws = XLSX.utils.json_to_sheet([guide, example]);
    ws["!cols"] = [{ wch: 24 }, { wch: 50 }, { wch: 30 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "GoiThau");
    XLSX.writeFile(wb, "Mau_Import_GoiThau.xlsx");
  };

  const onFile = async (file) => {
    try {
      const wb = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => { try { res(XLSX.read(e.target.result, { type: "array", cellDates: true })); } catch (err) { rej(err); } };
        r.onerror = () => rej(new Error("Không đọc được file")); r.readAsArrayBuffer(file);
      });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const items = [], errors = [];
      raw.forEach((row, i) => {
        const name = String(row["Tên gói thầu"] ?? "").trim();
        const key = String(row["Cán bộ"] ?? "").trim();
        const first = toISO(row["Ngày ký Tờ trình chủ trương"] ?? row["Ngày ký tờ trình chủ trương"] ?? "");
        if (key.startsWith("(") || name.startsWith("(")) return;
        if (!name) { errors.push(`Dòng ${i + 2}: thiếu Tên gói thầu — bỏ qua`); return; }
        const st = data.staff.find((s) => s.fullName.toLowerCase() === key.toLowerCase() || (s.code || "").toLowerCase() === key.toLowerCase());
        if (key && !st) errors.push(`Dòng ${i + 2}: không thấy cán bộ "${key}" → gán cho ${me.fullName}`);
        items.push({ name, staffId: st ? st.id : me.id, staffLabel: st ? st.fullName : me.fullName, first });
      });
      setPreview({ items, errors, total: raw.length });
    } catch (e) { alert("Lỗi đọc file: " + e.message); }
  };

  const commit = async () => {
    if (!preview?.items.length) return;
    setBusy(true);
    try {
      for (const it of preview.items) {
        const pid = "pk_" + genId();
        await insertRow("packages", { id: pid, staffId: it.staffId, templateId: tplId, name: it.name, note: null, planLocked: false });
        const sched = buildSchedule(tplMs, it.first);
        await insertRows("package_milestones", tplMs.map((m) => ({
          id: "pm_" + genId(), packageId: pid, position: m.position, name: m.name,
          docNumber: null, plannedDate: sched[m.position] || null, actualDate: null, note: null,
        })));
      }
      alert(`Đã import ${preview.items.length} gói thầu.`);
      onClose();
    } catch (e) { alert("Lỗi import: " + e.message); setBusy(false); }
  };

  return (
    <Modal wide onClose={onClose}>
      <h3>Import gói thầu từ Excel</h3>
      <p className="small mut" style={{ marginTop: -8 }}>
        Mỗi dòng = 1 gói thầu. Chỉ cần điền tên gói, cán bộ và ngày ký Tờ trình chủ trương — các mốc còn lại tự nhảy theo bộ mốc đã chọn.
      </p>
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: "1 1 320px" }}>
          <label className="lbl">Loại quy trình (áp cho mọi dòng)</label>
          <Sel value={tplId} onChange={(e) => { setTplId(e.target.value); setPreview(null); }}>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.name} ({data.template_milestones.filter((m) => m.templateId === t.id).length} mốc)</option>)}
          </Sel>
        </div>
        <Btn kind="ghost" onClick={downloadTemplate}>⬇ Tải file mẫu</Btn>
        <label className="btn" style={{ display: "inline-block" }}>📄 Chọn file…
          <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      {preview && (
        <>
          <div className="between" style={{ marginBottom: 8 }}>
            <b>Xem trước: {preview.items.length} gói hợp lệ / {preview.total} dòng</b>
            {preview.errors.length > 0 && <span className="tag">{preview.errors.length} cảnh báo</span>}
          </div>
          {preview.errors.length > 0 && (
            <div className="card" style={{ background: "#fef6f6", marginBottom: 10, maxHeight: 120, overflow: "auto" }}>
              {preview.errors.map((e, i) => <div key={i} className="small" style={{ color: "#b91c1c" }}>• {e}</div>)}
            </div>
          )}
          <div className="scroll" style={{ maxHeight: "34vh" }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Cán bộ</th><th>Tên gói thầu</th><th>Ngày ký TTr chủ trương</th></tr></thead>
              <tbody>{preview.items.map((it, i) => (
                <tr key={i}><td>{i + 1}</td><td>{it.staffLabel}</td><td>{it.name}</td><td className="small">{it.first ? fmt(it.first) : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <div className="right" style={{ marginTop: 14 }}>
        <Btn kind="ghost" onClick={onClose}>Đóng</Btn>
        <Btn onClick={commit} disabled={!preview?.items.length || busy}>{busy ? "Đang import…" : `Import ${preview?.items.length || 0} gói`}</Btn>
      </div>
    </Modal>
  );
}

/* ---------------- Templates ---------------- */
function Templates({ data }) {
  const tpls = data.workflow_templates;
  const [edit, setEdit] = useState(null); const [newName, setNewName] = useState("");
  const addTpl = async () => { if (!newName.trim()) return; await insertRow("workflow_templates", { id: "tpl_" + genId(), name: newName.trim(), isDefault: false }); setNewName(""); };
  const delTpl = async (id) => {
    if (data.packages.some((p) => p.templateId === id)) return alert("Không xóa được: đang có gói thầu dùng bộ mốc này.");
    if (!confirm("Xóa bộ mốc này?")) return; await deleteRow("workflow_templates", id);
  };
  return (
    <>
      <h1 className="h1">Bộ mốc quy trình</h1>
      <p className="sub">Mỗi loại hình đấu thầu một bộ mốc · “Khoảng ngày” = số ngày kể từ mốc đầu, dùng để tự sinh lịch</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <label className="lbl">Thêm bộ mốc mới</label>
        <div className="row"><Inp value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="VD: Chỉ định thầu rút gọn" style={{ flex: 1 }} /><Btn onClick={addTpl}>+ Thêm</Btn></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {tpls.map((t) => {
          const n = data.template_milestones.filter((m) => m.templateId === t.id).length;
          return (
            <div key={t.id} className="card">
              <div className="between"><b>{t.name}</b>{t.isDefault && <span className="tag">mặc định</span>}</div>
              <div className="small mut" style={{ margin: "6px 0 12px" }}>{n} mốc</div>
              <div className="row"><Btn kind="ghost sm" onClick={() => setEdit(t.id)}>Sửa mốc</Btn><Btn kind="danger sm" onClick={() => delTpl(t.id)}>Xóa</Btn></div>
            </div>
          );
        })}
      </div>
      {edit && <TemplateEditor data={data} tplId={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function TemplateEditor({ data, tplId, onClose }) {
  const tpl = data.workflow_templates.find((t) => t.id === tplId);
  const ms = data.template_milestones.filter((m) => m.templateId === tplId).sort(byPos);
  const [newM, setNewM] = useState("");
  const add = async () => {
    if (!newM.trim()) return;
    const pos = (ms[ms.length - 1]?.position || 0) + 1;
    const off = (ms[ms.length - 1]?.offsetDays ?? 0) + 3;
    await insertRow("template_milestones", { id: "tm_" + genId(), templateId: tplId, position: pos, name: newM.trim(), offsetDays: off });
    setNewM("");
  };
  const rename = async (id, name) => { await updateRow("template_milestones", id, { name }); };
  const setOffset = async (id, v) => { await updateRow("template_milestones", id, { offset_days: v === "" ? null : Number(v) }); };
  const del = async (id) => { await deleteRow("template_milestones", id); };
  const move = async (m, dir) => {
    const idx = ms.findIndex((x) => x.id === m.id); const swap = ms[idx + dir]; if (!swap) return;
    await updateRow("template_milestones", m.id, { position: swap.position });
    await updateRow("template_milestones", swap.id, { position: m.position });
  };
  return (
    <Modal onClose={onClose}>
      <h3>Sửa mốc — {tpl?.name}</h3>
      <div className="small mut" style={{ marginBottom: 8 }}>“Khoảng ngày” = số ngày kể từ mốc đầu tiên. Để trống nếu mốc không bắt buộc (VD: gia hạn).</div>
      <div className="scroll" style={{ maxHeight: "52vh" }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 30 }}>TT</th><th>Tên mốc</th><th style={{ width: 90 }}>Khoảng ngày</th><th style={{ width: 92 }}></th></tr></thead>
          <tbody>
            {ms.map((m, i) => (
              <tr key={m.id}>
                <td>{i + 1}</td>
                <td><input className="cell-in" defaultValue={m.name} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && rename(m.id, e.target.value.trim())} /></td>
                <td><input className="cell-in" type="number" defaultValue={m.offsetDays ?? ""} onBlur={(e) => String(e.target.value) !== String(m.offsetDays ?? "") && setOffset(m.id, e.target.value)} /></td>
                <td><div className="flex">
                  <button className="btn ghost sm" onClick={() => move(m, -1)}>↑</button>
                  <button className="btn ghost sm" onClick={() => move(m, 1)}>↓</button>
                  <button className="btn danger sm" onClick={() => del(m.id)}>×</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Inp value={newM} onChange={(e) => setNewM(e.target.value)} placeholder="Tên mốc mới…" style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Btn onClick={add}>+ Thêm mốc</Btn>
      </div>
      <div className="right" style={{ marginTop: 12 }}><Btn kind="ghost" onClick={onClose}>Đóng</Btn></div>
    </Modal>
  );
}

/* ---------------- Staff ---------------- */
function StaffView({ data, me }) {
  const staff = [...data.staff].sort(byPos);
  const [form, setForm] = useState(null);
  const save = async () => {
    if (!form.fullName.trim()) return alert("Nhập họ tên.");
    try {
      if (form.id) await updateRow("staff", form.id, { code: form.code || null, full_name: form.fullName.trim(), is_manager: form.isManager });
      else await insertRow("staff", { id: "st_" + genId(), code: form.code || null, fullName: form.fullName.trim(), isManager: form.isManager, position: staff.length + 1 });
      setForm(null);
    } catch (e) { alert("Lỗi: " + e.message); }
  };
  const del = async (s) => {
    if (data.packages.some((p) => p.staffId === s.id)) return alert("Không xóa được: cán bộ này đang có gói thầu.");
    if (!confirm(`Xóa cán bộ ${s.fullName}?`)) return; await deleteRow("staff", s.id);
  };
  return (
    <>
      <div className="between">
        <div><h1 className="h1">Cán bộ</h1><p className="sub">Danh sách người dùng để đăng nhập & phân gói thầu</p></div>
        <Btn onClick={() => setForm({ code: "", fullName: "", isManager: false })}>+ Thêm cán bộ</Btn>
      </div>
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>Mã</th><th>Họ tên</th><th>Vai trò</th><th>Số gói</th><th></th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.code || "—"}</td>
                <td>{s.fullName}{s.id === me.id && <span className="tag" style={{ marginLeft: 6 }}>bạn</span>}</td>
                <td>{s.isManager ? "👔 Trưởng phòng" : "Cán bộ"}</td>
                <td>{data.packages.filter((p) => p.staffId === s.id).length}</td>
                <td><div className="flex">
                  <Btn kind="ghost sm" onClick={() => setForm({ id: s.id, code: s.code || "", fullName: s.fullName, isManager: s.isManager })}>Sửa</Btn>
                  <Btn kind="danger sm" onClick={() => del(s)}>Xóa</Btn>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal onClose={() => setForm(null)}>
          <h3>{form.id ? "Sửa cán bộ" : "Thêm cán bộ"}</h3>
          <Field label="Mã NV (tùy chọn)"><Inp value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VD: NV02" /></Field>
          <Field label="Họ tên"><Inp value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Họ tên cán bộ" /></Field>
          <label className="flex" style={{ cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={form.isManager} onChange={(e) => setForm({ ...form, isManager: e.target.checked })} />
            Là Trưởng phòng (xem & sửa mọi gói thầu)
          </label>
          <div className="right"><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn onClick={save}>Lưu</Btn></div>
        </Modal>
      )}
    </>
  );
}
