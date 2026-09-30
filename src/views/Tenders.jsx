import { useMemo, useState } from "react";
import { Plus, Upload, Download, Table2, KanbanSquare, GanttChart, Lock, Unlock, Trash2, Check, Pencil, Link2 } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { genId } from "../lib/supabase.js";
import { PKG_STATUS, STAGES, KPI_BY_KEY, daysText, staffLabel, byPos, cascadeShift, buildSchedule, isApplicable, HD_PROGRESS } from "../lib/rules.js";
import { addByMode, diffDays, fmtDate, toDays, fromDays, addMonths } from "../lib/dates.js";
import { Banner, Btn, Badge, Tag, Field, Inp, Sel, TA, Modal, DataTable, ColumnMenu, useLocalState, Progress, fmtD, money, Empty, askReason, InfoTip, Icon3D } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { IssuesPanel, HistoryPanel, ImportDialog, KpiChip } from "../components/Record.jsx";
import { exportWorkbook, parsePackages } from "../lib/excel.js";
import { ContractForm } from "./Contracts.jsx";

const SEV = { overdue: 0, due_today: 1, due_soon: 2, no_due: 3, no_milestones: 3, paused: 4, on_track: 5, completed: 6, cancelled: 7 };
const statusBadge = (ev) => {
  const s = PKG_STATUS[ev.code];
  const extra = ev.code === "overdue" ? ` ${ev.lateDays} ngày` : ev.code === "due_soon" ? ` · còn ${ev.currentState.daysLeft} ngày` : ev.code === "paused" && ev.overdue.length ? " · có mốc quá hạn" : "";
  return <Badge tone={ev.code === "paused" && ev.overdue.length ? "red" : s.tone}>{s.label}{extra}</Badge>;
};
const remain = (ev) => {
  if (ev.overdue.length) return <span className="tone-red b nowrap">{daysText(-ev.lateDays)}</span>;
  const s = ev.currentState;
  if (!s) return "—";
  if (s.code === "no_due") return <span className="mut">Chưa có hạn</span>;
  return <span className={`nowrap ${s.code === "due_today" || s.code === "due_soon" ? "tone-amber b" : ""}`}>{daysText(s.daysLeft ?? 0)}</span>;
};

export default function Tenders() {
  const { route, go, pkgRows, cfg, reportDate, data, alerts, filters, me, can } = useApp();
  const [view, setView] = useLocalState("dh_lcnt_view", "table");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useLocalState("dh_lcnt_sort", "sev");
  const kpi = route.params.kpi;
  const rows = useMemo(() => {
    const k = KPI_BY_KEY[kpi];
    const list = k ? pkgRows.filter((r) => k.test(r, { reportDate, cfg })) : pkgRows;
    const cmp = {
      sev: (a, b) => SEV[a.ev.code] - SEV[b.ev.code] || b.ev.lateDays - a.ev.lateDays,
      due: (a, b) => String(a.ev.current?.plannedDate || "9").localeCompare(String(b.ev.current?.plannedDate || "9")),
      code: (a, b) => String(a.code).localeCompare(String(b.code)),
      upd: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    }[sort] || (() => 0);
    return [...list].sort(cmp);
  }, [pkgRows, kpi, sort, reportDate, cfg]);
  const openId = route.params.open;
  const setParams = (p) => go("lcnt", { ...route.params, ...p });

  return (
    <>
      <Banner icon="01-tender" title="Lựa chọn nhà thầu" sub={<>Từ khi chủ trương được phê duyệt đến ký hợp đồng · {rows.length} gói · Ngày dữ liệu {fmtDate(reportDate)}</>}>
        <Btn kind="ghost" icon={Download} onClick={() => exportWorkbook({ data, pkgRows: rows, alerts, reportDate, cfg, filters, me, kpiKey: kpi })}>Xuất Excel</Btn>
        {can.write && <Btn kind="ghost" icon={Upload} onClick={() => setImporting(true)}>Nhập Excel</Btn>}
        {can.write && <Btn icon={Plus} onClick={() => setAdding(true)}>Thêm gói</Btn>}
      </Banner>
      <FilterBar />
      <PastDateNote />
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="row">
          <div className="seg" role="radiogroup" aria-label="Chế độ xem">
            {[["table", "Bảng", Table2], ["kanban", "Kanban", KanbanSquare], ["gantt", "Gantt", GanttChart]].map(([v, l, I]) => (
              <button key={v} role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}><I size={15} aria-hidden />{l}</button>))}
          </div>
          {kpi && <KpiChip kpi={kpi} cfg={cfg} onClear={() => setParams({ kpi: "" })} />}
        </div>
        {view === "table" && <div className="row">
          <label className="row small">Sắp xếp <Sel style={{ width: 170 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="sev">Mức cảnh báo</option><option value="due">Hạn bước gần nhất</option><option value="code">Mã gói</option><option value="upd">Cập nhật gần nhất</option></Sel></label>
          <PackageColumns />
        </div>}
      </div>
      {view === "table" && <PackageTable rows={rows} onOpen={(id) => setParams({ open: id })} />}
      {view === "kanban" && <Kanban rows={rows} onOpen={(id) => setParams({ open: id })} />}
      {view === "gantt" && <Gantt rows={rows} onOpen={(id) => setParams({ open: id })} />}
      {view === "kanban" && <p className="small mut">Kanban chỉ để xem và mở hồ sơ. Chuyển bước bằng cách cập nhật ngày hoàn thành thực tế và minh chứng trong chi tiết gói — kéo thả không đủ để hoàn thành một bước.</p>}

      {openId && <PackageDetail id={openId} onClose={() => setParams({ open: "" })} />}
      {adding && <AddPackage onClose={() => setAdding(false)} />}
      {importing && <ImportPackages onClose={() => setImporting(false)} />}
    </>
  );
}

const PCOLS = [
  { key: "code", label: "Mã gói", fixed: true }, { key: "name", label: "Tên gói", fixed: true }, { key: "staff", label: "Cán bộ" },
  { key: "step", label: "Bước hiện tại" }, { key: "due", label: "Hạn bước" }, { key: "remain", label: "Còn / chậm" }, { key: "target", label: "Mục tiêu ký HĐ" },
  { key: "next", label: "Việc tiếp theo" }, { key: "status", label: "Đánh giá" }, { key: "prog", label: "Tiến độ các mốc" }, { key: "method", label: "Hình thức LCNT" },
  { key: "value", label: "Giá gói" }, { key: "cat", label: "Nhóm công việc" }, { key: "hd", label: "HĐ đã ký" }, { key: "issue", label: "Vướng mắc" }, { key: "upd", label: "Cập nhật cuối" },
];
const DEFAULT_P = ["code", "name", "staff", "step", "due", "remain", "target", "next", "status"];
function PackageColumns() {
  const [vis, setVis] = useLocalState("dh_lcnt_cols", DEFAULT_P);
  return <ColumnMenu columns={PCOLS} visible={vis} onChange={setVis} />;
}
function PackageTable({ rows, onOpen }) {
  const [vis] = useLocalState("dh_lcnt_cols", DEFAULT_P);
  const all = {
    code: { label: "Mã gói", stick: true, render: (r) => <span className="code">{r.code || "—"}</span> },
    name: { label: "Tên gói", stick: true, render: (r) => <><button className="linkbtn wrap2" onClick={() => onOpen(r.id)}>{r.name}</button>{r.changedAfterReport && <div><Tag>đổi sau ngày BC</Tag></div>}</> },
    staff: { label: "Cán bộ", render: (r) => <span className="nowrap">{r.staffName}</span> },
    step: { label: "Bước hiện tại", render: (r) => <div style={{ maxWidth: 220 }}>{r.ev.current?.name || (r.ev.code === "completed" ? "Đã ký HĐ" : "—")}</div> },
    due: { label: "Hạn bước", render: (r) => <span className="nowrap num">{fmtD(r.ev.current?.plannedDate)}</span> },
    remain: { label: "Còn / chậm", render: (r) => (r.ev.code === "completed" || r.ev.code === "cancelled" ? "—" : remain(r.ev)) },
    target: { label: "Mục tiêu ký HĐ", render: (r) => <span className="nowrap num">{fmtD(r.ev.targetSign)}</span> },
    next: { label: "Việc tiếp theo", render: (r) => <div className="small wrap2" style={{ maxWidth: 240 }}>{r.ev.nextAction || "—"}</div> },
    status: { label: "Đánh giá", render: (r) => statusBadge(r.ev) },
    prog: { label: "Tiến độ các mốc", render: (r) => <Progress value={r.ev.progress} /> },
    method: { label: "Hình thức LCNT", render: (r) => <span className="small">{r.rec.selectionMethod || "—"}</span> },
    value: { label: "Giá gói", right: true, render: (r) => <span className="num nowrap">{money(r.rec.packageValue, r.rec.currency)}</span> },
    cat: { label: "Nhóm công việc", render: (r) => r.category || "—" },
    hd: { label: "HĐ đã ký", render: (r) => (r.contracts.length ? `${r.contracts.length} HĐ${r.rec.scopeSignedConfirmed ? " · đủ" : ""}` : "—") },
    issue: { label: "Vướng mắc", render: (r) => <div className="small" style={{ maxWidth: 220 }}>{r.issues[0]?.content || "—"}</div> },
    upd: { label: "Cập nhật cuối", render: (r) => <span className="small nowrap">{r.updatedAt ? fmtD(String(r.updatedAt).slice(0, 10)) : "—"}{r.stale ? " · lâu" : ""}</span> },
  };
  const cols = PCOLS.filter((c) => vis.includes(c.key) || c.fixed).map((c) => ({ key: c.key, ...all[c.key] }));
  cols.push({ key: "act", label: "", render: (r) => <Btn kind="ghost" sm onClick={() => onOpen(r.id)} aria-label={`Mở gói ${r.code || r.name}`}>Mở</Btn> });
  return <DataTable columns={cols} rows={rows} onRow={(r) => onOpen(r.id)} hl={(r) => r.ev.code === "overdue"} empty={<Empty icon="01-tender" title="Không có gói thầu phù hợp bộ lọc" />} />;
}

function Kanban({ rows, onOpen }) {
  const cols = [...STAGES.map((s) => ({ ...s, list: rows.filter((r) => r.ev.stage === s.id && r.ev.code !== "completed") })),
    { id: "done", label: "Đã ký HĐ", list: rows.filter((r) => r.ev.code === "completed") }];
  const none = rows.filter((r) => !r.ev.stage && r.ev.code !== "completed");
  if (none.length) cols.unshift({ id: "none", label: "Chưa có bộ mốc / chưa xác định", list: none });
  if (!rows.length) return <Empty icon="01-tender" title="Không có gói thầu phù hợp bộ lọc" />;
  return (
    <div className="kanban" role="list" aria-label="Kanban theo giai đoạn">
      {cols.map((c) => (
        <section key={c.id} className="kcol" role="listitem" aria-label={`${c.label}: ${c.list.length} gói`}>
          <h3><span>{c.label}</span><span className="tag">{c.list.length}</span></h3>
          {c.list.map((r) => (
            <button key={r.id} className="kcard" onClick={() => onOpen(r.id)}>
              <div className="code small mut">{r.code || "—"}</div>
              <div className="b wrap2" style={{ fontSize: 13.5 }}>{r.name}</div>
              <div className="small mut" style={{ margin: "3px 0 5px" }}>{r.staffName} · {r.ev.current?.name || ""}</div>
              {statusBadge(r.ev)}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function Gantt({ rows, onOpen }) {
  const { reportDate } = useApp();
  const list = rows.filter((r) => r.ev.milestones.some((m) => m.plannedDate || m.actualDate));
  if (!list.length) return <Empty icon="06-progress" title="Chưa có gói nào có ngày kế hoạch để vẽ Gantt" />;
  const dates = list.flatMap((r) => r.ev.milestones.flatMap((m) => [m.baselineDate, m.plannedDate, m.actualDate])).filter(Boolean).concat(reportDate);
  const min = toDays(addMonths(dates.reduce((a, b) => (a < b ? a : b)).slice(0, 8) + "01", 0));
  const max = toDays(addMonths(dates.reduce((a, b) => (a > b ? a : b)).slice(0, 8) + "01", 1));
  const span = Math.max(1, max - min);
  const pct = (iso) => ((toDays(iso) - min) / span) * 100;
  const months = [];
  for (let d = fromDays(min); toDays(d) < max; d = addMonths(d, 1)) months.push(d);
  const bar = (a, b) => (a && b ? { left: `${pct(a)}%`, width: `${Math.max(0.6, pct(b) - pct(a))}%` } : null);
  return (
    <>
      <div className="row small mut" style={{ marginBottom: 6 }}>
        <span><span className="g-legend" style={{ display: "inline-block", width: 22, height: 8, background: "#cbd5e1", borderRadius: 4 }} /> Kế hoạch hiện hành</span>
        <span><span style={{ display: "inline-block", width: 22, height: 8, border: "1.5px dashed #94a3b8", borderRadius: 4 }} /> Kế hoạch ban đầu</span>
        <span><span style={{ display: "inline-block", width: 22, height: 8, background: "var(--blue)", borderRadius: 4 }} /> Thực tế</span>
        <span><span style={{ display: "inline-block", width: 22, height: 8, background: "var(--brand)", borderRadius: 4 }} /> Thực tế – đang chậm</span>
        <span style={{ color: "var(--brand)" }}>│ Ngày báo cáo</span>
      </div>
      <div className="gantt" role="table" aria-label="Biểu đồ Gantt kế hoạch và thực tế">
        <div className="g-row head" role="row"><div className="g-name" role="columnheader">Gói thầu</div>
          <div className="g-track" role="columnheader">{months.map((m) => <span key={m} className="g-month" style={{ left: `${pct(m)}%` }}>{m.slice(5, 7)}/{m.slice(2, 4)}</span>)}</div></div>
        {list.map((r) => {
          const ms = r.ev.milestones.filter(isApplicable);
          const pl = ms.map((m) => m.plannedDate).filter(Boolean).sort();
          const bl = ms.map((m) => m.baselineDate).filter(Boolean).sort();
          const ac = ms.map((m) => m.actualDate).filter((d) => d && d <= reportDate).sort();
          const stopped = ["completed", "cancelled"].includes(r.ev.code);
          const actEnd = stopped ? ac[ac.length - 1] : ac.length ? reportDate : null;
          return (
            <div className="g-row" role="row" key={r.id}>
              <div className="g-name" role="cell"><button className="linkbtn wrap2" onClick={() => onOpen(r.id)}>{r.code ? `${r.code} · ` : ""}{r.name}</button></div>
              <div className="g-track" role="cell" aria-label={`Kế hoạch ${fmtDate(pl[0])}–${fmtDate(pl[pl.length - 1])}, ${PKG_STATUS[r.ev.code].label}`}>
                {bar(bl[0], bl[bl.length - 1]) && <span className="g-bar base" style={bar(bl[0], bl[bl.length - 1])} />}
                {bar(pl[0], pl[pl.length - 1]) && <span className="g-bar plan" style={bar(pl[0], pl[pl.length - 1])} title={`Kế hoạch: ${fmtDate(pl[0])} → ${fmtDate(pl[pl.length - 1])}`} />}
                {bar(ac[0], actEnd) && <span className={`g-bar act ${r.ev.overdue.length && !stopped ? "late" : ""}`} style={{ ...bar(ac[0], actEnd), ...(r.ev.code === "cancelled" ? { background: "#94a3b8" } : {}) }}  title={`Thực tế: ${fmtDate(ac[0])} → ${fmtDate(actEnd)}`} />}
                <span className="g-today" style={{ left: `${pct(reportDate)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// =================================================================== CHI TIẾT GÓI
export function PackageDetail({ id, onClose }) {
  const { allPkgRows, data, can, write, go, reportDate, cfg } = useApp();
  const r = allPkgRows.find((x) => x.id === id);
  const [tab, setTab] = useState("ms");
  const [editMs, setEditMs] = useState(null);
  const [newHd, setNewHd] = useState(false);
  if (!r) return <Modal title="Không tìm thấy gói thầu" onClose={onClose}><Empty title="Gói thầu không tồn tại hoặc đã bị xóa" /></Modal>;
  const p = r.rec, ev = r.ev;
  const editable = can.edit(p.staffId);
  const locked = !!p.planLocked;
  const toggleLock = async () => {
    if (locked && !can.manage) return;
    await write([{ table: "packages", op: "update", id: p.id, data: { planLocked: !locked } }], locked ? "Đã mở khóa kế hoạch" : "Đã khóa kế hoạch");
  };
  const del = async () => {
    const reason = await askReason("Xóa gói thầu và toàn bộ mốc? (không hoàn tác được)");
    if (reason && (await write([{ table: "packages", op: "delete", id: p.id, reason }], "Đã xóa gói thầu"))) onClose();
  };
  const quickDone = (m) => write([{ table: "package_milestones", op: "update", id: m.id, data: { actualDate: reportDate } }], `Đã ghi hoàn thành “${m.name}” ngày ${fmtDate(reportDate)}`);
  const stageState = (s) => {
    const ms = ev.milestones.filter((m) => m.stage === s.id && isApplicable(m));
    if (!ms.length) return "skip";
    if (ms.every((m) => m.actualDate && m.actualDate <= reportDate)) return "done";
    return ev.stage === s.id ? "cur" : "todo";
  };

  return (
    <Modal size="wide" title={<>{p.code && <span className="code mut" style={{ fontSize: 14 }}>{p.code} · </span>}{p.name}</>}
      sub={<span className="row" style={{ gap: 8 }}>{statusBadge(ev)}<span>{r.staffName}</span><span>·</span><span>{r.tplName || "Chưa có bộ mốc"}</span>{locked && <Badge tone="gray">Kế hoạch đã khóa</Badge>}</span>}
      onClose={onClose}>
      <div className="stepper" aria-label="Hành trình lựa chọn nhà thầu">
        {STAGES.map((s) => { const st = stageState(s); if (st === "skip") return null; return (
          <div key={s.id} className={`step ${st === "done" ? "done" : ""} ${st === "cur" ? "cur" : ""} ${st === "cur" && ev.overdue.length ? "late" : ""}`}>
            <div className="dot" aria-hidden>{st === "done" && <Check size={14} />}</div>
            <b>{s.label}</b><div className="small mut">{st === "done" ? "Đã xong" : st === "cur" ? (ev.overdue.length ? daysText(-ev.lateDays) : "Đang thực hiện") : "Chưa tới"}</div>
          </div>); })}
      </div>
      <div className="row" style={{ margin: "10px 0 4px" }}>
        <Progress value={ev.progress} />
        <span className="small mut">Tiến độ các mốc: {ev.done}/{ev.applicable} mốc áp dụng</span>
        <span className="small mut">· Mục tiêu ký HĐ: <b>{fmtD(ev.targetSign)}</b></span>
        <span style={{ flex: 1 }} />
        {editable && (can.manage || !locked) && <Btn kind="ghost" sm icon={locked ? Unlock : Lock} onClick={toggleLock}>{locked ? "Mở khóa kế hoạch" : "Khóa kế hoạch"}</Btn>}
        {editable && locked && !can.manage && <span className="small mut">Kế hoạch đã khóa cứng — cần lãnh đạo mở khóa</span>}
        {can.manage && <Btn kind="danger" sm icon={Trash2} onClick={del}>Xóa</Btn>}
      </div>
      <div className="tabs" role="tablist">
        {[["ms", "Mốc tiến độ"], ["info", "Thông tin gói"], ["hd", `Hợp đồng (${r.contracts.length})`], ["issue", `Vướng mắc (${r.issues.length})`], ["log", "Lịch sử"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === "ms" && (!ev.milestones.length ? <Empty icon="01-tender" title="Chưa có bộ mốc">Chọn bộ mốc khi tạo gói.</Empty> : (
        <DataTable short rows={ev.milestones} columns={[
          { key: "p", label: "TT", render: (m) => m.position },
          { key: "n", label: "Mốc", render: (m) => <div style={{ minWidth: 200, maxWidth: 280 }}>{m.name} {m.required === false && <Tag>Tùy chọn</Tag>} {m.applicable === false && <Tag>Không áp dụng</Tag>}{m.skipReason && <div className="small mut">Lý do: {m.skipReason}</div>}</div> },
          { key: "b", label: "KH ban đầu", render: (m) => <span className="num nowrap mut">{fmtD(m.baselineDate)}</span> },
          { key: "d", label: "Hạn hiện hành", render: (m) => <span className="num nowrap">{fmtD(m.plannedDate)}{m.baselineDate && m.plannedDate && m.plannedDate !== m.baselineDate && <div className="small tone-amber">{diffDays(m.baselineDate, m.plannedDate) > 0 ? "+" : ""}{diffDays(m.baselineDate, m.plannedDate)} ngày</div>}</span> },
          { key: "a", label: "Hoàn thành TT", render: (m) => <span className="num nowrap">{fmtD(m.actualDate)}</span> },
          { key: "s", label: "Trạng thái", render: (m) => msBadge(ev.states.get(m.id)) },
          { key: "o", label: "Chủ trì", render: (m) => <span className="small nowrap">{m.ownerId ? staffLabel(data.staff.find((s) => s.id === m.ownerId)) : r.staffName}</span> },
          { key: "v", label: "Số VB / minh chứng", render: (m) => <div className="small" style={{ maxWidth: 180 }}>{m.docNumber || ""}{m.evidenceUrl && <div><a href={m.evidenceUrl} target="_blank" rel="noreferrer"><Link2 size={12} /> Hồ sơ</a></div>}</div> },
          { key: "x", label: "Nguyên nhân chậm / việc tiếp theo", render: (m) => <div className="small" style={{ maxWidth: 220 }}>{m.delayReason && <div className="tone-red">{m.delayReason}</div>}{m.nextAction}</div> },
          { key: "act", label: "", render: (m) => editable && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Btn kind="ghost" sm icon={Pencil} onClick={() => setEditMs(m)} aria-label={`Cập nhật mốc ${m.name}`}>Cập nhật</Btn>
              {!m.actualDate && m.applicable !== false && <Btn kind="ghost" sm icon={Check} onClick={() => quickDone(m)} aria-label={`Hoàn thành mốc ${m.name} hôm nay`}>Xong</Btn>}
            </div>) },
        ]} />))}
      {tab === "info" && <PackageInfo r={r} editable={editable} />}
      {tab === "hd" && (
        <div>
          <div className="between" style={{ marginBottom: 8 }}>
            <label className="row"><input type="checkbox" disabled={!editable} checked={!!p.scopeSignedConfirmed} onChange={(e) => write([{ table: "packages", op: "update", id: p.id, data: { scopeSignedConfirmed: e.target.checked } }])} /> Đã ký đủ hợp đồng theo phạm vi gói (xác nhận)</label>
            {editable && <Btn sm icon={Plus} onClick={() => setNewHd(true)}>Tạo HĐ từ gói</Btn>}
          </div>
          <p className="small mut">Ký một HĐ không tự kết thúc cả gói; lịch sử lựa chọn nhà thầu được giữ nguyên.</p>
          {r.contracts.length ? <DataTable short rows={r.contracts} columns={[
            { key: "n", label: "Số HĐ", render: (c) => <button className="linkbtn code" onClick={() => go("hop-dong", { open: c.id })}>{c.contractNo}</button> },
            { key: "t", label: "Nội dung", render: (c) => <div className="wrap2" style={{ maxWidth: 380 }}>{c.name}</div> },
            { key: "s", label: "Ngày ký", render: (c) => fmtD(c.signDate) },
            { key: "v", label: "Giá trị ký", right: true, render: (c) => money(c.signValue, c.currency) },
            { key: "st", label: "Tiến độ", render: (c) => <HdBadge id={c.id} /> },
          ]} /> : <Empty icon="02-contract" title="Chưa có hợp đồng liên kết" />}
        </div>
      )}
      {tab === "issue" && <IssuesPanel entity="package" entityId={p.id} ownerId={p.staffId} />}
      {tab === "log" && <HistoryPanel ids={[p.id, ...ev.milestones.map((m) => m.id)]} />}
      {editMs && <MilestoneForm m={editMs} pkg={p} milestones={ev.milestones} onClose={() => setEditMs(null)} />}
      {newHd && <ContractForm init={{ packageId: p.id, packageCode: p.code, packageName: p.name, category: p.category, selectionMethod: p.selectionMethod, staffId: p.staffId, unit: p.unit, currency: p.currency || "VND", plannedValue: p.packageValue }} onClose={() => setNewHd(false)} />}
    </Modal>
  );
}
function HdBadge({ id }) {
  const { allHdRows } = useApp();
  const r = allHdRows.find((x) => x.id === id);
  if (!r) return null;
  return <Badge tone={HD_PROGRESS[r.progress.code].tone}>{HD_PROGRESS[r.progress.code].label}</Badge>;
}
const msBadge = (s) => {
  if (!s) return null;
  const M = { done: ["blue", "Hoàn thành"], done_late: ["amber", `Hoàn thành chậm ${s.lateDays} ngày`], overdue: ["red", `Quá hạn ${s.lateDays} ngày`], due_today: ["amber", "Đến hạn hôm nay"],
    due_soon: ["amber", `Còn ${s.daysLeft} ngày`], on_track: ["green", `Còn ${s.daysLeft} ngày`], no_due: ["gray", "Chưa có hạn"], skipped: ["gray", "Không áp dụng"], optional_unused: ["gray", "Tùy chọn – chưa dùng"] }[s.code];
  return <Badge tone={M[0]}>{M[1]}</Badge>;
};

function MilestoneForm({ m, pkg, milestones, onClose }) {
  const { write, can, data, cfg } = useApp();
  const [f, setF] = useState({ ...m });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const locked = !!pkg.planLocked && !can.manage;
  const save = async () => {
    const fields = ["actualStart", "actualDate", "ownerId", "collaborators", "docNumber", "evidenceUrl", "delayReason", "nextAction", "note"];
    const patch = {};
    for (const k of fields) if ((f[k] || null) !== (m[k] || null)) patch[k] = f[k] || null;
    let reason = null, ops = [];
    const plannedChanged = (f.plannedDate || null) !== (m.plannedDate || null);
    const appChanged = f.applicable !== m.applicable;
    if (appChanged) {
      reason = await askReason(f.applicable ? "Áp dụng lại mốc" : `Bỏ qua mốc “${m.name}” (không áp dụng)`);
      if (!reason) return;
      patch.applicable = f.applicable; patch.skipReason = f.applicable ? null : reason;
    }
    if (plannedChanged) {
      if (m.plannedDate && f.plannedDate) {
        const ans = await askReason(`Điều chỉnh hạn “${m.name}”: ${fmtDate(m.plannedDate)} → ${fmtDate(f.plannedDate)}`, {
          optLabel: "Tịnh tiến các mốc sau (chưa hoàn thành) cùng số ngày", defaultOpt: true,
          note: "Kế hoạch ban đầu được giữ nguyên; thay đổi được ghi lịch sử kèm lý do." });
        if (!ans) return;
        reason = [reason, ans.reason].filter(Boolean).join("; ");
        const shifts = ans.opt ? cascadeShift(milestones, m, f.plannedDate, cfg) : [{ id: m.id, plannedDate: f.plannedDate }];
        ops = shifts.filter((s) => s.id !== m.id).map((s) => ({ table: "package_milestones", op: "update", id: s.id, data: { plannedDate: s.plannedDate }, reason }));
        patch.plannedDate = f.plannedDate;
      } else {
        patch.plannedDate = f.plannedDate || null;
        if (!m.baselineDate && f.plannedDate) patch.baselineDate = f.plannedDate;
        if (m.plannedDate && !f.plannedDate) { reason = reason || (await askReason("Xóa hạn của mốc")); if (!reason) return; }
      }
    }
    if (!Object.keys(patch).length && !ops.length) return onClose();
    if (await write([{ table: "package_milestones", op: "update", id: m.id, data: patch, reason }, ...ops], "Đã cập nhật mốc")) onClose();
  };
  return (
    <Modal size="mid" title={`Cập nhật mốc: ${m.name}`} sub={`KH ban đầu: ${fmtD(m.baselineDate)} (giữ nguyên)`} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn><Btn onClick={save}>Lưu</Btn></>}>
      <div className="form-grid">
        <Field label="Hạn hiện hành" hint={locked ? "Kế hoạch đã khóa — cần lãnh đạo điều chỉnh" : "Đổi hạn cần lý do; có thể tịnh tiến các mốc sau"}>
          <Inp type="date" value={f.plannedDate || ""} disabled={locked} onChange={set("plannedDate")} /></Field>
        <Field label="Bắt đầu thực tế"><Inp type="date" value={f.actualStart || ""} onChange={set("actualStart")} /></Field>
        <Field label="Hoàn thành thực tế"><Inp type="date" value={f.actualDate || ""} onChange={set("actualDate")} /></Field>
        <Field label="Người chủ trì"><Sel value={f.ownerId || ""} onChange={set("ownerId")}><option value="">(Cán bộ phụ trách gói)</option>{data.staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
        <Field label="Người / đơn vị phối hợp"><Inp value={f.collaborators || ""} onChange={set("collaborators")} /></Field>
        <Field label="Số văn bản"><Inp value={f.docNumber || ""} onChange={set("docNumber")} /></Field>
      </div>
      <Field label="Hồ sơ minh chứng (đường dẫn Voffice / Vcontract / thư mục)" hint="Chỉ lưu liên kết do người dùng cung cấp; hệ thống không tự kết nối Voffice/SAP.">
        <Inp type="url" value={f.evidenceUrl || ""} onChange={set("evidenceUrl")} placeholder="https://…" /></Field>
      <Field label="Nguyên nhân chậm"><TA value={f.delayReason || ""} onChange={set("delayReason")} /></Field>
      <Field label="Hành động tiếp theo"><Inp value={f.nextAction || ""} onChange={set("nextAction")} /></Field>
      <label className="row"><input type="checkbox" checked={f.applicable !== false} onChange={(e) => setF({ ...f, applicable: e.target.checked })} /> Mốc áp dụng cho gói này {m.required !== false && <span className="small mut">(mốc bắt buộc — bỏ qua cần lý do)</span>}</label>
    </Modal>
  );
}

function PackageInfo({ r, editable }) {
  const { write, data, can } = useApp();
  const p = r.rec;
  const [f, setF] = useState({ ...p });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const KEYS = ["code", "name", "category", "selectionMethod", "unit", "fundingSource", "packageValue", "currency", "vatBasis", "policyDocNo", "policyDocDate", "policyApprovedDate", "targetSignDate", "coordinatorUnit", "status", "staffId", "nextAction", "year"];
  const NEED = ["status", "targetSignDate", "packageValue", "staffId"];
  const save = async () => {
    const patch = {};
    for (const k of KEYS) if (String(f[k] ?? "") !== String(p[k] ?? "")) patch[k] = f[k] === "" ? null : k === "packageValue" || k === "year" ? (f[k] === null ? null : Number(f[k])) : f[k];
    if (!Object.keys(patch).length) return;
    let reason = null;
    if (NEED.some((k) => k in patch && p[k] != null)) { reason = await askReason("Lý do thay đổi thông tin gói (trạng thái / mục tiêu ký / giá gói / cán bộ)"); if (!reason) return; }
    await write([{ table: "packages", op: "update", id: p.id, data: patch, reason }], "Đã lưu thông tin gói");
  };
  const dis = !editable;
  return (
    <div>
      <div className="form-grid">
        <Field label="Mã / số hiệu gói"><Inp disabled={dis} value={f.code || ""} onChange={set("code")} /></Field>
        <Field label="Tên gói" span={2}><Inp disabled={dis} value={f.name || ""} onChange={set("name")} /></Field>
        <Field label="Nhóm công việc"><Inp disabled={dis} list="dl-cat" value={f.category || ""} onChange={set("category")} /></Field>
        <Field label="Hình thức lựa chọn"><Inp disabled={dis} list="dl-method" value={f.selectionMethod || ""} onChange={set("selectionMethod")} /></Field>
        <Field label="Đơn vị"><Inp disabled={dis} value={f.unit || ""} onChange={set("unit")} /></Field>
        <Field label="Nguồn vốn"><Inp disabled={dis} value={f.fundingSource || ""} onChange={set("fundingSource")} /></Field>
        <Field label="Giá gói"><Inp disabled={dis} type="number" value={f.packageValue ?? ""} onChange={set("packageValue")} /></Field>
        <Field label="Tiền tệ"><Sel disabled={dis} value={f.currency || "VND"} onChange={set("currency")}><option>VND</option><option>USD</option><option>EUR</option></Sel></Field>
        <Field label="Cơ sở VAT"><Sel disabled={dis} value={f.vatBasis || ""} onChange={set("vatBasis")}><option value="">Chưa rõ</option><option value="before_vat">Trước VAT</option><option value="after_vat">Sau VAT</option></Sel></Field>
        <Field label="Số VB chủ trương"><Inp disabled={dis} value={f.policyDocNo || ""} onChange={set("policyDocNo")} /></Field>
        <Field label="Ngày VB chủ trương"><Inp disabled={dis} type="date" value={f.policyDocDate || ""} onChange={set("policyDocDate")} /></Field>
        <Field label="Ngày phê duyệt chủ trương" hint="Mốc bắt đầu theo dõi"><Inp disabled={dis} type="date" value={f.policyApprovedDate || ""} onChange={set("policyApprovedDate")} /></Field>
        <Field label="Mục tiêu ký HĐ" hint="Để trống = lấy hạn mốc ký HĐ"><Inp disabled={dis} type="date" value={f.targetSignDate || ""} onChange={set("targetSignDate")} /></Field>
        <Field label="Đơn vị phối hợp"><Inp disabled={dis} value={f.coordinatorUnit || ""} onChange={set("coordinatorUnit")} /></Field>
        <Field label="Trạng thái gói"><Sel disabled={dis} value={f.status || "active"} onChange={set("status")}><option value="active">Đang thực hiện</option><option value="paused">Tạm dừng</option><option value="cancelled">Hủy</option></Sel></Field>
        <Field label="Cán bộ chính" hint={can.manage ? "" : "Chỉ lãnh đạo giao lại"}><Sel disabled={dis || !can.manage} value={f.staffId || ""} onChange={set("staffId")}><option value="">Chưa phân công</option>{data.staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
        <Field label="Năm"><Inp disabled={dis} type="number" value={f.year ?? ""} onChange={set("year")} /></Field>
      </div>
      <Field label="Việc tiếp theo (chung)"><Inp disabled={dis} value={f.nextAction || ""} onChange={set("nextAction")} /></Field>
      <div className="between"><span className="small mut">Cập nhật cuối: {p.updatedAt ? new Date(p.updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—"}</span>{editable && <Btn onClick={save}>Lưu thông tin</Btn>}</div>
      <DataLists />
    </div>
  );
}
export function DataLists() {
  const { data } = useApp();
  const cats = [...new Set([...data.packages, ...data.contracts].map((x) => x.category).filter(Boolean))];
  const methods = [...new Set(["Đấu thầu rộng rãi", "Chào hàng cạnh tranh", "Chỉ định thầu", "Mua sắm trực tiếp", ...[...data.packages, ...data.contracts].map((x) => x.selectionMethod).filter(Boolean)])];
  return <><datalist id="dl-cat">{cats.map((c) => <option key={c} value={c} />)}</datalist><datalist id="dl-method">{methods.map((c) => <option key={c} value={c} />)}</datalist></>;
}

// =================================================================== THÊM GÓI
function makePackageOps(rec, tpl, tms, cfg) {
  const pid = genId("pk_");
  const first = rec.policyApprovedDate || null;
  const sched = buildSchedule(tms, first, (d, n) => addByMode(d, n, tpl?.dayMode, cfg.holidays));
  const ops = [{ table: "packages", op: "insert", id: pid, data: { ...rec, templateId: tpl?.id || null, year: rec.year || (first ? Number(first.slice(0, 4)) : new Date().getFullYear()) } }];
  for (const t of tms) ops.push({ table: "package_milestones", op: "insert", id: genId("pm_"), data: {
    packageId: pid, position: t.position, name: t.name, stage: t.stage || null, required: t.required !== false, weight: t.weight ?? 1,
    plannedDate: sched[t.position] || null, baselineDate: sched[t.position] || null } });
  return ops;
}
function AddPackage({ onClose }) {
  const { data, me, can, write, cfg } = useApp();
  const tpls = data.workflow_templates;
  const [f, setF] = useState({ name: "", code: "", staffId: me.id, templateId: tpls.find((t) => t.isDefault)?.id || tpls[0]?.id || "", policyApprovedDate: "", planLocked: false, currency: "VND", status: "active", unit: me.unit || "Phòng QLHT" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const tpl = tpls.find((t) => t.id === f.templateId);
  const tms = useMemo(() => data.template_milestones.filter((t) => t.templateId === f.templateId).sort(byPos), [data, f.templateId]);
  const sched = useMemo(() => buildSchedule(tms, f.policyApprovedDate, (d, n) => addByMode(d, n, tpl?.dayMode, cfg.holidays)), [tms, f.policyApprovedDate, tpl, cfg]);
  const create = async () => {
    if (!f.name.trim()) return;
    const { templateId, ...rec } = f;
    rec.packageValue = rec.packageValue ? Number(rec.packageValue) : null;
    if (await write(makePackageOps({ ...rec, name: rec.name.trim() }, tpl, tms, cfg), "Đã tạo gói thầu")) onClose();
  };
  return (
    <Modal size="wide" title="Thêm gói thầu" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn><Btn disabled={!f.name.trim()} onClick={create}>Tạo gói thầu</Btn></>}>
      <div className="grid2">
        <div>
          <Field label="Tên gói thầu *"><TA value={f.name} onChange={set("name")} /></Field>
          <div className="form-grid">
            <Field label="Mã / số hiệu gói"><Inp value={f.code} onChange={set("code")} /></Field>
            <Field label="Cán bộ phụ trách" hint={can.manage ? "" : "Cán bộ tạo gói cho chính mình"}><Sel value={f.staffId} disabled={!can.manage} onChange={set("staffId")}>{data.staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
            <Field label="Nhóm công việc"><Inp list="dl-cat" value={f.category || ""} onChange={set("category")} /></Field>
            <Field label="Hình thức lựa chọn"><Inp list="dl-method" value={f.selectionMethod || ""} onChange={set("selectionMethod")} /></Field>
            <Field label="Giá gói (VNĐ)"><Inp type="number" value={f.packageValue || ""} onChange={set("packageValue")} /></Field>
            <Field label="Bộ mốc quy trình"><Sel value={f.templateId} onChange={set("templateId")}>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name} ({data.template_milestones.filter((m) => m.templateId === t.id).length} mốc)</option>)}</Sel></Field>
            <Field label="Ngày phê duyệt chủ trương" hint="Mốc bắt đầu; các mốc sau tự tính theo khoảng ngày chuẩn"><Inp type="date" value={f.policyApprovedDate} onChange={set("policyApprovedDate")} /></Field>
          </div>
          <label className="row"><input type="checkbox" checked={f.planLocked} onChange={set("planLocked")} /> Khóa cứng kế hoạch sau khi tạo (cán bộ không tự đổi hạn)</label>
          <p className="small mut">Khoảng ngày trong bộ mốc là khung quản lý nội bộ do quản trị cấu hình, không phải thời hạn pháp lý bắt buộc. Tính theo {tpl?.dayMode === "working" ? "ngày làm việc (theo lịch nghỉ)" : "ngày lịch"}.</p>
        </div>
        <div>
          <span className="lbl">Lịch kế hoạch tự sinh</span>
          {tms.length ? <DataTable rows={tms} columns={[
            { key: "p", label: "TT", render: (t) => t.position }, { key: "n", label: "Mốc", render: (t) => <span className="small">{t.name}</span> },
            { key: "d", label: "Hạn", render: (t) => <span className="small num nowrap">{fmtD(sched[t.position])}</span> },
          ]} /> : <Empty title="Bộ mốc chưa có mốc" />}
        </div>
      </div>
      <DataLists />
    </Modal>
  );
}
function ImportPackages({ onClose }) {
  const { data, me, can, cfg } = useApp();
  const tpl = data.workflow_templates.find((t) => t.isDefault) || data.workflow_templates[0];
  const tms = data.template_milestones.filter((t) => t.templateId === tpl?.id).sort(byPos);
  return <ImportDialog kind="package" parse={(f) => parsePackages(f, data)} onClose={onClose}
    buildOps={(items) => items.flatMap((i) => makePackageOps({ ...i.rec, staffId: can.manage ? i.rec.staffId : me.id }, tpl, tms, cfg))} />;
}
