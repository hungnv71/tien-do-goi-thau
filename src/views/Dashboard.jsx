import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from "recharts";
import { Download, ChevronRight } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { LCNT_KPI, HD_KPI, computeKpis, PKG_STATUS, HD_PROGRESS, STAGES, EXEC_STATUS, daysText, ALERT_LABEL, MODULE_LABEL, MODULE_PAGE } from "../lib/rules.js";
import { fmtDate } from "../lib/dates.js";
import { Banner, Btn, Icon3D, Badge, fmtD, ty, Empty, InfoTip, Progress } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { exportWorkbook, exportTasksWorkbook } from "../lib/excel.js";
import { TaskOverview } from "./Tasks.jsx";

export const kpiLabel = (k, cfg) => k.label.replace("N ngày", `${k.key === "hd_expiring" ? cfg.contractSoonDays : cfg.dueSoonDays} ngày`);
export const tone = (kind) => ({ overdue: "red", due_today: "amber", due_soon: "amber", pending_ext: "blue", review: "amber", await_liq: "gray", guarantee_soon: "amber", issue_overdue: "red" }[kind] || "gray");

export default function Dashboard() {
  const { route, go, pkgRows, hdRows, alerts, cfg, reportDate, filters, me, data, taskRows } = useApp();
  const mod = route.params.m === "hd" ? "hd" : route.params.m === "nv" ? "nv" : "lcnt";
  const rows = mod === "hd" ? hdRows : pkgRows;
  const ctx = { reportDate, cfg };
  const kpis = useMemo(() => (mod === "nv" ? [] : computeKpis(mod === "hd" ? HD_KPI : LCNT_KPI, rows, ctx)), [rows, mod, reportDate, cfg]); // eslint-disable-line
  const scopeText = filters.scope === "mine" ? `Của tôi (${me?.fullName || ""})` : "Toàn phòng";
  const actions = alerts.action.filter((a) => a.module === mod);
  const open = (a) => go(MODULE_PAGE[a.module], { open: a.recordId });

  return (
    <>
      <Banner icon="06-progress" title="Điều hành gói thầu, hợp đồng & nhiệm vụ" sub={<>{cfg.orgName} · Ngày dữ liệu: <b>{fmtDate(reportDate)}</b></>}>
        <Btn kind="ghost" icon={Download} onClick={() => (mod === "nv" ? exportTasksWorkbook({ data, rows: taskRows, reportDate, cfg, filters, me }) : exportWorkbook({ data, pkgRows: mod === "lcnt" ? pkgRows : [], hdRows: mod === "hd" ? hdRows : [], alerts, reportDate, cfg, filters, me }))}>Xuất Excel</Btn>
      </Banner>
      <div className="modtabs" role="tablist" aria-label="Phân hệ">
        {[["lcnt", "Lựa chọn nhà thầu"], ["hd", "Hợp đồng đã ký"], ["nv", "Nhiệm vụ phòng"]].map(([k, l], i) => (
          <button key={k} role="tab" aria-selected={mod === k} className={mod === k ? "on" : ""} onClick={() => go("dashboard", { m: k })}><span className="n" aria-hidden>{i + 1}</span>{l}</button>
        ))}
      </div>
      <FilterBar showContractor={mod === "hd"} tasksOnly={mod === "nv"} />
      <PastDateNote />
      {mod === "nv" ? <TaskOverview /> : <>

      <section className="kpis" aria-label="Chỉ tiêu tổng quan">
        {kpis.map((k) => (
          <button key={k.key} className="kpi" onClick={() => go(mod === "hd" ? "hop-dong" : "lcnt", { kpi: k.key })} title={`${k.hint}. Bấm để xem danh sách.`}>
            <Icon3D name={k.icon} size={56} />
            <div style={{ minWidth: 0 }}>
              <div className={`kpi-n ${k.money ? "money" : ""} ${k.tone ? "tone-" + k.tone : ""}`}>{k.money ? ty(k.value) : k.value}</div>
              <div className="kpi-l">{kpiLabel(k, cfg)}</div>
              <div className="kpi-s">{k.money ? `${k.count} HĐ · ` : ""}{scopeText} · {fmtDate(reportDate)}</div>
            </div>
          </button>
        ))}
      </section>
      <p className="small mut" style={{ margin: "-6px 0 14px" }}>
        Các thẻ cảnh báo là tập con có thể giao nhau, không cộng thành tổng số hồ sơ. Chưa có dữ liệu lịch sử nên không hiển thị tăng/giảm so với kỳ trước.
      </p>

      {rows.length >= 3 ? (mod === "lcnt" ? <LcntCharts rows={pkgRows} /> : <HdCharts rows={hdRows} />) :
        <div className="note" style={{ marginBottom: 14 }}>Chỉ có {rows.length} hồ sơ trong phạm vi lọc — ẩn biểu đồ vì ít thông tin.</div>}

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="todo-h">
        <div className="card-h">
          <h2 id="todo-h">Cần xử lý ưu tiên {actions.length > 0 && <Badge tone={actions.some((a) => a.kind === "overdue") ? "red" : "amber"}>{actions.filter((a) => a.kind === "overdue").length} quá hạn · {actions.length} việc</Badge>}</h2>
          <Btn kind="ghost" sm onClick={() => go("canh-bao", { m: mod })}>Xem tất cả <ChevronRight size={14} /></Btn>
        </div>
        {actions.length ? <ActionTable items={actions.slice(0, 8)} onOpen={open} /> : <Empty icon="07-closeout" title="Không có việc quá hạn hoặc sắp đến hạn">theo bộ lọc hiện tại</Empty>}
      </section>

      <section className="card" aria-labelledby="list-h">
        <div className="card-h">
          <h2 id="list-h">{mod === "lcnt" ? "Gói thầu đang diễn ra" : "Hợp đồng đang thực hiện"} <span className="small mut">(tối đa 6, ưu tiên cần xử lý)</span></h2>
          <Btn kind="ghost" sm onClick={() => go(mod === "hd" ? "hop-dong" : "lcnt")}>Xem toàn bộ <ChevronRight size={14} /></Btn>
        </div>
        {mod === "lcnt" ? <TopPackages rows={pkgRows} onOpen={(id) => go("lcnt", { open: id })} /> : <TopContracts rows={hdRows} onOpen={(id) => go("hop-dong", { open: id })} />}
      </section>
      </>}
    </>
  );
}

export function ActionTable({ items, onOpen, showModule }) {
  return (
    <div className="tbl-wrap short">
      <table className="tbl">
        <thead><tr>
          <th scope="col">Hồ sơ</th>{showModule && <th scope="col">Phân hệ</th>}<th scope="col">Công việc</th><th scope="col">Phụ trách</th><th scope="col">Hạn</th><th scope="col">Cảnh báo</th><th scope="col">Vướng mắc / chờ ai</th><th scope="col">Việc tiếp theo</th><th scope="col"><span className="sr-only">Thao tác</span></th>
        </tr></thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={a.recordId + a.kind + i} className={a.kind === "overdue" ? "hl" : ""}>
              <td style={{ minWidth: 200, maxWidth: 320 }}><div className="code b">{a.code}</div><div className="small mut wrap2">{a.title}</div></td>
              {showModule && <td className="small">{MODULE_LABEL[a.module] || a.module}</td>}
              <td style={{ maxWidth: 240 }}>{a.task}{a.paused && <div><Badge tone="gray">Đang tạm dừng</Badge></div>}</td>
              <td className="nowrap">{a.staffName}</td>
              <td className={`nowrap num ${a.days < 0 ? "tone-red b" : ""}`}>{fmtD(a.due)}</td>
              <td><Badge tone={tone(a.kind)}>{a.days !== null && a.days !== undefined ? daysText(a.days) : ALERT_LABEL[a.kind]}</Badge></td>
              <td className="small" style={{ maxWidth: 220 }}>{a.issue || <span className="mut">—</span>}{a.waitingOn && <div className="mut">Chờ: {a.waitingOn}</div>}</td>
              <td className="small" style={{ maxWidth: 220 }}>{a.next || <span className="mut">—</span>}</td>
              <td><Btn kind="ghost" sm onClick={() => onOpen(a)} aria-label={`Mở và cập nhật hồ sơ ${a.code}`}>Mở</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLORS = { overdue: "#dc2626", due: "#f59e0b", on_track: "#16a34a", no_due: "#94a3b8", done: "#2563eb" };
function byStaff(rows, codeOf) {
  const m = new Map();
  for (const r of rows) {
    const k = r.staffName;
    const o = m.get(k) || { name: k, overdue: 0, due: 0, on_track: 0, no_due: 0 };
    const c = codeOf(r);
    if (c === "overdue") o.overdue++; else if (c === "due_today" || c === "due_soon") o.due++; else if (c === "on_track") o.on_track++; else o.no_due++;
    m.set(k, o);
  }
  return [...m.values()].sort((a, b) => b.overdue + b.due - (a.overdue + a.due));
}
export function StaffChart({ data, unit }) {
  const h = Math.max(160, data.length * 34 + 60);
  return (
    <div style={{ height: h }} role="img" aria-label={`Biểu đồ số ${unit} theo cán bộ và trạng thái`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} fontSize={12} />
          <YAxis type="category" dataKey="name" width={130} fontSize={12} />
          <Tooltip formatter={(v, n) => [`${v} ${unit}`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {[["overdue", "Quá hạn"], ["due", "Đến hạn / sắp đến hạn"], ["on_track", "Đúng tiến độ"], ["no_due", "Chưa có hạn"]].map(([k, n]) => (
            <Bar key={k} dataKey={k} name={n} stackId="a" fill={COLORS[k]} isAnimationActive={false}><LabelList dataKey={k} position="center" fill="#fff" fontSize={11} formatter={(v) => (v ? v : "")} /></Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SimpleBars({ data, unit, color = "#2563eb", label }) {
  return (
    <div style={{ height: Math.max(180, data.length * 30 + 40) }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 34 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="name" width={150} fontSize={12} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, "Số lượng"]} />
          <Bar dataKey="value" fill={color} isAnimationActive={false}><LabelList dataKey="value" position="right" fontSize={12} /></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LcntCharts({ rows }) {
  const open = rows.filter((r) => !["completed", "cancelled"].includes(r.ev.code));
  const staff = byStaff(open, (r) => (r.ev.code === "paused" ? (r.ev.overdue.length ? "overdue" : "no_due") : r.ev.code));
  const stages = STAGES.map((s) => ({ name: s.label, value: open.filter((r) => r.ev.stage === s.id).length }));
  const noStage = open.filter((r) => !r.ev.stage).length;
  if (noStage) stages.push({ name: "Chưa xác định bước", value: noStage });
  return (
    <div className="grid2" style={{ marginBottom: 14 }}>
      <section className="card"><div className="card-h"><h2>Tiến độ theo cán bộ</h2><InfoTip text="Số gói đang tổ chức theo trạng thái. Không phản ánh năng lực cá nhân khi chưa rõ nguyên nhân chậm." /></div>
        {staff.length ? <StaffChart data={staff} unit="gói" /> : <Empty title="Không có gói đang tổ chức" />}
        <p className="small mut" style={{ margin: 0 }}>Không tự diễn giải số gói chậm là năng lực cá nhân — xem nguyên nhân tại từng hồ sơ.</p></section>
      <section className="card"><div className="card-h"><h2>Số gói đang ở từng bước</h2></div>
        <SimpleBars data={stages} unit="gói" label="Số gói theo bước hiện tại" /></section>
    </div>
  );
}
function HdCharts({ rows }) {
  const act = rows.filter((r) => r.active);
  const staff = byStaff(act, (r) => r.progress.code);
  const exec = Object.entries(EXEC_STATUS).map(([k, v]) => ({ name: v, value: rows.filter((r) => r.rec.execStatus === k).length })).filter((x) => x.value);
  const paid = rows.filter((r) => r.pay.tracked && r.pay.hasData && r.value.current > 0 && r.value.currency === "VND")
    .map((r) => ({ name: r.no.length > 18 ? r.no.slice(0, 18) + "…" : r.no, full: r.no, value: Math.round(r.value.current / 1e7) / 100, paid: Math.round(r.pay.paid / 1e7) / 100 })).slice(0, 10);
  return (
    <>
      <div className="grid2" style={{ marginBottom: 14 }}>
        <section className="card"><div className="card-h"><h2>Tiến độ HĐ theo cán bộ</h2><InfoTip text="HĐ đang thực hiện theo trạng thái hạn. Không phản ánh năng lực cá nhân khi chưa rõ nguyên nhân." /></div>
          {staff.length ? <StaffChart data={staff} unit="HĐ" /> : <Empty title="Không có HĐ đang thực hiện" />}</section>
        <section className="card"><div className="card-h"><h2>Trạng thái thực hiện hợp đồng</h2></div>
          <SimpleBars data={exec} unit="HĐ" color="#475569" label="Số hợp đồng theo trạng thái thực hiện" /></section>
      </div>
      {paid.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><h2>Đã thanh toán so với giá trị HĐ hiện hành (tỷ đồng)</h2><InfoTip text="Chỉ HĐ do P.QLHT theo dõi thanh toán, cùng tiền tệ VND, giao dịch đã xác nhận. Tỷ lệ thanh toán không phải tỷ lệ hoàn thành." /></div>
          <div style={{ height: Math.max(200, paid.length * 36 + 50) }} role="img" aria-label="Biểu đồ đã thanh toán so với giá trị hợp đồng">
            <ResponsiveContainer>
              <BarChart data={paid} layout="vertical" margin={{ left: 10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} /><YAxis type="category" dataKey="name" width={150} fontSize={12} />
                <Tooltip formatter={(v, n) => [`${v} tỷ`, n]} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" name="Giá trị hiện hành" fill="#cbd5e1" isAnimationActive={false}><LabelList dataKey="value" position="right" fontSize={11} /></Bar>
                <Bar dataKey="paid" name="Đã thanh toán" fill="#2563eb" isAnimationActive={false}><LabelList dataKey="paid" position="right" fontSize={11} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  );
}

const SEV_P = { overdue: 0, due_today: 1, due_soon: 2, no_due: 3, no_milestones: 3, paused: 4, on_track: 5 };
function TopPackages({ rows, onOpen }) {
  const list = rows.filter((r) => !["completed", "cancelled"].includes(r.ev.code)).sort((a, b) => (SEV_P[a.ev.code] ?? 9) - (SEV_P[b.ev.code] ?? 9) || b.ev.lateDays - a.ev.lateDays).slice(0, 6);
  if (!list.length) return <Empty icon="01-tender" title="Không có gói đang diễn ra" />;
  return (
    <div className="tbl-wrap short"><table className="tbl">
      <thead><tr><th>Mã gói</th><th>Tên gói</th><th>Cán bộ</th><th>Bước hiện tại</th><th>Hạn bước</th><th>Tiến độ các mốc</th><th>Mục tiêu ký HĐ</th><th>Đánh giá</th></tr></thead>
      <tbody>{list.map((r) => (
        <tr key={r.id}>
          <td className="code">{r.code || "—"}</td>
          <td style={{ maxWidth: 320 }}><button className="linkbtn wrap2" onClick={() => onOpen(r.id)}>{r.name}</button></td>
          <td className="nowrap">{r.staffName}</td><td className="small">{r.ev.current?.name || "—"}</td>
          <td className="nowrap num">{fmtD(r.ev.current?.plannedDate)}</td><td><Progress value={r.ev.progress} /></td>
          <td className="nowrap num">{fmtD(r.ev.targetSign)}</td><td><Badge tone={PKG_STATUS[r.ev.code].tone}>{PKG_STATUS[r.ev.code].label}</Badge></td>
        </tr>))}</tbody>
    </table></div>
  );
}
const SEV_C = { overdue: 0, review: 1, due_today: 1, due_soon: 2, no_due: 3, on_track: 5 };
function TopContracts({ rows, onOpen }) {
  const list = rows.filter((r) => r.active).sort((a, b) => (SEV_C[a.progress.code] ?? 9) - (SEV_C[b.progress.code] ?? 9) || (b.progress.lateDays || 0) - (a.progress.lateDays || 0)).slice(0, 6);
  if (!list.length) return <Empty icon="02-contract" title="Không có HĐ đang thực hiện" />;
  return (
    <div className="tbl-wrap short"><table className="tbl">
      <thead><tr><th>Số HĐ</th><th>Nội dung</th><th>Nhà thầu</th><th>Cán bộ</th><th>Hạn hiện hành</th><th>Gia hạn</th><th>Tiến độ</th></tr></thead>
      <tbody>{list.map((r) => (
        <tr key={r.id}>
          <td className="code">{r.no}</td><td style={{ maxWidth: 340 }}><button className="linkbtn wrap2" onClick={() => onOpen(r.id)}>{r.name}</button></td>
          <td className="small">{r.contractorName}</td><td className="nowrap">{r.staffName}</td><td className="nowrap num">{fmtD(r.due.currentDue)}</td>
          <td className="num">{r.due.extCount ? `Lần ${r.due.extCount}` : "—"}</td>
          <td><Badge tone={HD_PROGRESS[r.progress.code].tone}>{HD_PROGRESS[r.progress.code].label}{r.progress.lateDays ? ` · ${r.progress.lateDays} ngày` : ""}</Badge></td>
        </tr>))}</tbody>
    </table></div>
  );
}
