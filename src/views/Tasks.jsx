import { useMemo, useState } from "react";
import { Download, Plus, Pencil, Trash2, Lock, Unlock, Send, CalendarClock, Check, X as XIcon, ChevronRight, CornerDownLeft, ExternalLink } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { genId } from "../lib/supabase.js";
import { fmtDate, todayVN, weekday } from "../lib/dates.js";
import { staffLabel, daysText, rank, ROLE } from "../lib/rules.js";
import { TASK_TYPES, TASK_STATUS, TASK_STATE, EXT_TASK, taskKpis, staffRanking, monthMatrix, isoWeek, weekLabel, weekBounds, prevWeek, OPEN, DONE } from "../lib/tasks.js";
import { Banner, Btn, Badge, Field, Inp, Sel, TA, Modal, DataTable, Empty, Icon3D, askReason, fmtD, InfoTip } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { StaffChart, ActionTable } from "./Dashboard.jsx";
import { exportTasksWorkbook } from "../lib/excel.js";

const SEV = { overdue: 0, due_today: 1, due_soon: 2, no_due: 3, on_track: 4, done_late: 6, done: 7, done_nodate: 7, cancelled: 9 };
const sortRows = (a, b) => (SEV[a.ev.code] ?? 5) - (SEV[b.ev.code] ?? 5) || (b.ev.lateDays || 0) - (a.ev.lateDays || 0) || String(a.ev.due || "9999").localeCompare(String(b.ev.due || "9999"));
const pctText = (v) => (v == null ? "—" : `${Math.round(v)}%`);
export const stateBadge = (ev) => {
  const s = TASK_STATE[ev.code] || { label: ev.code, tone: "gray" };
  const extra = ev.code === "overdue" ? ` ${ev.lateDays} ngày` : ev.code === "due_soon" ? ` · còn ${ev.daysLeft} ngày` : ev.code === "done_late" ? ` ${ev.lateDays} ngày` : "";
  return <Badge tone={s.tone}>{s.label}{extra}</Badge>;
};
function Pct({ v }) {
  if (v == null) return <span className="small mut">—</span>;
  return <div className="prog"><div className="prog-bar" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label="% hoàn thành"><i style={{ width: `${Math.min(100, v)}%` }} /></div><span className="small num">{Math.round(v)}%</span></div>;
}

/** Nhắc gửi báo cáo tuần (hiện từ thứ Năm, hoặc ngay khi tuần trước chưa gửi). */
export function WeekReminder() {
  const { me, data, allTaskRows, go, route, today } = useApp();
  if (!me || rank(me.role) < 1 || (route.page === "nhiem-vu" && route.params.tab === "tuan")) return null;
  const week = isoWeek(today), pw = prevWeek(week);
  const reps = new Set((data.weekly_reports || []).filter((w) => w.staffId === me.id).map((w) => w.week));
  const open = allTaskRows.filter((r) => !r.virtual && r.staffId === me.id && OPEN(r.ev.code));
  if (!open.length || reps.has(week)) return null;
  const wd = weekday(today);
  if (![0, 4, 5, 6].includes(wd) && reps.has(pw)) return null;
  const od = open.filter((r) => r.ev.code === "overdue").length;
  return (
    <div className="warn-note row" role="status" style={{ marginBottom: 12, justifyContent: "space-between" }}>
      <span>Anh/chị chưa gửi <b>báo cáo tiến độ {weekLabel(week)}</b> — {open.length} nhiệm vụ đang mở{od ? <>, <b className="tone-red">{od} quá hạn</b></> : ""}. Chỉ cần ~2 phút.</span>
      <Btn sm icon={Send} onClick={() => go("nhiem-vu", { tab: "tuan" })}>Cập nhật tuần ngay</Btn>
    </div>
  );
}

export default function Tasks() {
  const { route, go, taskRows, cfg, reportDate, data, me, can, filters } = useApp();
  const tab = route.params.tab || "ds";
  const [adding, setAdding] = useState(null);
  const setParams = (p) => go("nhiem-vu", { ...route.params, ...p });
  const week = isoWeek(reportDate);
  const TABS = [["ds", "Danh sách nhiệm vụ"], ["tuan", "Cập nhật tuần"], ["xh", "Xếp hạng & thống kê"], ["kh", "Kế hoạch phòng"]];
  return (
    <>
      <Banner icon="08-responsibility" title="Nhiệm vụ phòng" sub={<>{weekLabel(week)} · Hạn nhiệm vụ khóa cứng, đổi hạn qua đề nghị gia hạn · Gói thầu tự liên kết từ phân hệ LCNT · Ngày dữ liệu {fmtDate(reportDate)}</>}>
        <Btn kind="ghost" icon={Download} onClick={() => exportTasksWorkbook({ data, rows: taskRows, reportDate, cfg, filters, me })}>Xuất Excel (mẫu BC tuần)</Btn>
        {can.write && <Btn icon={Plus} onClick={() => setAdding({})}>{can.manage ? "Giao nhiệm vụ" : "Thêm nhiệm vụ"}</Btn>}
      </Banner>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go("nhiem-vu", { tab: k })}>{l}</button>)}</div>
      {tab !== "tuan" && tab !== "kh" && <FilterBar tasksOnly showContractor={false} />}
      {tab !== "tuan" && <PastDateNote />}
      {tab === "ds" && <TaskList setParams={setParams} />}
      {tab === "tuan" && <WeeklyUpdate />}
      {tab === "xh" && <RankStats />}
      {tab === "kh" && <Plans onAddTask={(planId) => setAdding({ planId })} />}
      {route.params.open && <TaskDetail id={route.params.open} onClose={() => setParams({ open: "" })} />}
      {adding && <TaskForm init={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ KPI dùng chung (cả Tổng quan)
export function TaskKpiCards({ rows, onPick, active }) {
  const { cfg, reportDate, filters, me } = useApp();
  const kpis = taskKpis(rows, { reportDate, cfg });
  const scope = filters.scope === "mine" ? `Của tôi (${me?.fullName || ""})` : "Toàn phòng";
  return (
    <section className="kpis" aria-label="Chỉ tiêu nhiệm vụ">
      {kpis.map((k) => (
        <button key={k.key} className="kpi" style={active === k.key ? { outline: "2px solid var(--red)" } : undefined} onClick={() => onPick(k.key)} title={`${k.hint}. Bấm để lọc danh sách.`}>
          <Icon3D name={k.icon} size={56} />
          <div style={{ minWidth: 0 }}>
            <div className={`kpi-n ${k.tone ? "tone-" + k.tone : ""}`}>{k.value}</div>
            <div className="kpi-l">{k.label.replace("N ngày", `${cfg.taskSoonDays} ngày`)}</div>
            <div className="kpi-s">{scope} · {fmtDate(reportDate)}</div>
          </div>
        </button>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ Danh sách
function TaskList({ setParams }) {
  const { route, taskRows, cfg, reportDate, data, go, filters } = useApp();
  const kpi = route.params.kpi || "";
  const plan = route.params.plan || "";
  const [type, setType] = useState("");
  const [showPkg, setShowPkg] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const kpis = useMemo(() => Object.fromEntries(taskKpis(taskRows, { reportDate, cfg }).map((k) => [k.key, k])), [taskRows, reportDate, cfg]);
  const rows = useMemo(() => {
    let l = taskRows;
    if (kpi && kpis[kpi]) l = l.filter((r) => kpis[kpi].ids.has(r.id));
    else if (!showDone && !["done", "inactive"].includes(filters.status)) l = l.filter((r) => OPEN(r.ev.code));
    if (!showPkg && kpi !== "nv_pkg") l = l.filter((r) => !r.virtual);
    if (type) l = l.filter((r) => r.type === type);
    if (plan) l = l.filter((r) => r.rec.planId === plan);
    return [...l].sort(sortRows);
  }, [taskRows, kpi, kpis, showDone, showPkg, type, plan, filters.status]);
  const open = (r) => (r.virtual ? go("lcnt", { open: r.pkg.id }) : setParams({ open: r.id }));
  const planObj = data.task_plans?.find((p) => p.id === plan);
  return (
    <>
      <TaskKpiCards rows={taskRows} active={kpi} onPick={(k) => setParams({ kpi: kpi === k ? "" : k })} />
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="row">
          {kpi && <span className="chip">Chỉ tiêu: {kpis[kpi]?.label.replace("N ngày", `${cfg.taskSoonDays} ngày`)} <button className="linkbtn" onClick={() => setParams({ kpi: "" })} aria-label="Bỏ lọc chỉ tiêu"><XIcon size={13} /></button></span>}
          {planObj && <span className="chip">Kế hoạch: {planObj.docNo || planObj.title} <button className="linkbtn" onClick={() => setParams({ plan: "" })} aria-label="Bỏ lọc kế hoạch"><XIcon size={13} /></button></span>}
          <label className="row small">Loại <Sel style={{ width: 200 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">Tất cả</option>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</Sel></label>
          <label className="row small"><input type="checkbox" checked={showPkg} onChange={(e) => setShowPkg(e.target.checked)} /> Gồm gói thầu (tự động)</label>
          <label className="row small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Hiện cả việc đã xong / hủy</label>
        </div>
        <span className="small mut">{rows.length} dòng</span>
      </div>
      <DataTable rows={rows} empty={<Empty icon="07-closeout" title="Không có nhiệm vụ phù hợp bộ lọc" />} hl={(r) => r.ev.code === "overdue"} columns={[
        { key: "c", label: "Mã", stick: true, render: (r) => <span className="code">{r.code || "—"}</span> },
        { key: "n", label: "Nhiệm vụ", stick: true, render: (r) => (
          <div style={{ minWidth: 260, maxWidth: 420 }}>
            <button className="linkbtn wrap2" style={{ textAlign: "left" }} onClick={() => open(r)}>{r.name}</button>
            <div className="small mut">{r.type}{r.virtual ? " · tự động từ LCNT" : ""}{r.rec.sourceDoc ? ` · ${r.rec.sourceDoc}` : ""}{r.plan ? ` · KH: ${r.plan.docNo || r.plan.title}` : ""}</div>
          </div>) },
        { key: "s", label: "Chủ trì", render: (r) => <span className="nowrap">{r.staffName}</span> },
        { key: "g", label: "Ngày giao", render: (r) => <span className="nowrap num">{fmtD(r.rec.assignedDate)}</span> },
        { key: "d", label: "Hạn", render: (r) => (
          <div className="nowrap num">{!r.virtual && r.rec.dueLocked !== false && <Lock size={12} aria-label="Hạn đã khóa" style={{ marginRight: 3, color: "var(--muted)" }} />}{fmtD(r.ev.due)}
            {r.ev.extended && <div className="small mut">gốc {fmtD(r.rec.originalDue)}</div>}
            {r.ev.pendingExt && <div><Badge tone="blue">Xin GH → {fmtD(r.rec.extRequestedDue)}</Badge></div>}</div>) },
        { key: "e", label: "Đánh giá", render: (r) => stateBadge(r.ev) },
        { key: "p", label: "% HT", render: (r) => <Pct v={r.percent} /> },
        { key: "t", label: "Trạng thái", render: (r) => <span className="small nowrap">{TASK_STATUS[r.ev.status] || r.ev.status}</span> },
        { key: "w", label: "Kết quả tuần / tự động", render: (r) => <div className="small wrap2" style={{ maxWidth: 300 }} title={r.autoText || r.rec.weekResult || ""}>{r.autoText || r.rec.weekResult || <span className="mut">—</span>}</div> },
        { key: "k", label: "Khó khăn", render: (r) => <div className="small wrap2" style={{ maxWidth: 220 }} title={r.rec.difficulty || ""}>{r.rec.difficulty || <span className="mut">—</span>}</div> },
        { key: "b", label: "BC tuần", render: (r) => (r.virtual ? <span className="small mut">Tự động</span> : r.reported ? <Badge tone="green">Đã cập nhật</Badge> : OPEN(r.ev.code) ? <Badge tone="gray">Chưa</Badge> : "—") },
      ]} />
    </>
  );
}

// ------------------------------------------------------------------ ghi cập nhật tiến độ (dùng chung)
export function updateOps(t, f, meId, week) {
  const now = new Date().toISOString();
  let percent = f.percent === "" || f.percent == null ? null : Math.max(0, Math.min(100, Number(f.percent)));
  if (f.status === "done") percent = 100;
  const d = { percent, status: f.status, weekResult: f.weekResult?.trim() || null, nextPlan: f.nextPlan?.trim() || null, difficulty: f.difficulty?.trim() || null, lastReportWeek: week, lastReportAt: now };
  if (f.resultTotal !== undefined) d.resultTotal = f.resultTotal?.trim() || null;
  if (f.status === "done" && !t.completedDate) d.completedDate = todayVN();
  if (f.status !== "done" && t.completedDate) d.completedDate = null;
  return [
    { table: "tasks", op: "update", id: t.id, data: d },
    { table: "task_updates", op: "insert", id: genId("tu_"), data: { taskId: t.id, staffId: meId, week, percent, status: f.status, weekResult: d.weekResult, nextPlan: d.nextPlan, difficulty: d.difficulty } },
  ];
}
const initForm = (t, week) => ({
  percent: t.percent ?? "", status: t.status || "in_progress",
  weekResult: t.lastReportWeek === week ? t.weekResult || "" : "", nextPlan: t.lastReportWeek === week ? t.nextPlan || "" : "",
  difficulty: t.difficulty || "",
});

// ------------------------------------------------------------------ Cập nhật tuần (1 màn hình, bấm 1 lần gửi)
function WeeklyUpdate() {
  const { me, can, data, allTaskRows, write, today, notify } = useApp();
  const week = isoWeek(today);
  const [who, setWho] = useState(me.id);
  const staffOpts = data.staff.filter((s) => s.active !== false && rank(s.role) >= 1).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const mine = allTaskRows.filter((r) => r.staffId === who);
  const { from } = weekBounds(week);
  const list = mine.filter((r) => !r.virtual && (OPEN(r.ev.code) || (DONE(r.ev.code) && r.ev.completed && r.ev.completed >= from))).sort(sortRows);
  const pk = mine.filter((r) => r.virtual && OPEN(r.ev.code));
  const [forms, setForms] = useState({});
  const [busy, setBusy] = useState(false);
  const rep = (data.weekly_reports || []).find((w) => w.staffId === who && w.week === week);
  const f = (r) => forms[r.id] || initForm(r.rec, week);
  const set = (r, patch) => setForms((s) => ({ ...s, [r.id]: { ...f(r), ...patch, _dirty: true } }));
  const dirty = list.filter((r) => forms[r.id]?._dirty);
  const ro = !(who === me.id ? can.write : can.manage);
  const submit = async () => {
    setBusy(true);
    const ops = dirty.flatMap((r) => updateOps(r.rec, f(r), me.id, week));
    const wr = { staffId: who, week, submittedAt: new Date().toISOString(), taskCount: dirty.length };
    ops.push(rep ? { table: "weekly_reports", op: "update", id: rep.id, data: wr } : { table: "weekly_reports", op: "insert", id: `${who}|${week}`, data: wr });
    const ok = await write(ops, null);
    setBusy(false);
    if (ok) { setForms({}); notify(`Đã gửi báo cáo ${weekLabel(week)} · ${dirty.length} nhiệm vụ cập nhật`); }
  };
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="between">
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>Báo cáo tiến độ {weekLabel(week)}</h2>
            <div className="small mut">Chỉ sửa dòng có thay đổi rồi bấm <b>Gửi báo cáo tuần</b>. Hạn đã khóa — cần đổi hạn thì mở nhiệm vụ → Đề nghị gia hạn. Gói thầu tự cập nhật từ phân hệ LCNT, không cần báo cáo lại.</div>
          </div>
          <div className="row">
            {can.manage && <label className="row small">Báo cáo của <Sel style={{ width: 210 }} value={who} onChange={(e) => { setWho(e.target.value); setForms({}); }}>{staffOpts.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></label>}
            {rep ? <Badge tone="green">Đã gửi {new Date(rep.submittedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })}</Badge> : <Badge tone="amber">Chưa gửi tuần này</Badge>}
            {!ro && <Btn icon={Send} disabled={busy} onClick={submit}>{busy ? "Đang gửi…" : dirty.length ? `Gửi báo cáo tuần (${dirty.length} việc cập nhật)` : rep ? "Gửi lại: không thay đổi" : "Gửi báo cáo: không có thay đổi"}</Btn>}
          </div>
        </div>
      </div>
      {!list.length && !pk.length ? <Empty icon="07-closeout" title="Không có nhiệm vụ đang mở">Có thể bấm “Gửi báo cáo” để xác nhận tuần này không có việc tồn.</Empty> : null}
      <div className="stack">
        {list.map((r) => {
          const v = f(r), t = r.rec;
          return (
            <section key={r.id} className="card" style={{ borderLeft: `4px solid ${r.ev.code === "overdue" ? "var(--red)" : ["due_today", "due_soon"].includes(r.ev.code) ? "#f59e0b" : "var(--line, #e4e9f1)"}` }} aria-label={r.name}>
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}><span className="code">{r.code}</span>{stateBadge(r.ev)}<span className="small mut"><Lock size={11} aria-hidden /> Hạn {fmtD(r.ev.due)}{r.ev.extended ? ` (gốc ${fmtD(t.originalDue)})` : ""}</span>{r.ev.pendingExt && <Badge tone="blue">Đang xin gia hạn → {fmtD(t.extRequestedDue)}</Badge>}{forms[r.id]?._dirty && <Badge tone="blue">Đã sửa</Badge>}</div>
                  <div className="b" style={{ margin: "4px 0" }}>{r.name}</div>
                  {(t.weekResult || t.nextPlan) && t.lastReportWeek !== week && <div className="small mut">Lần trước ({t.lastReportWeek || "nhập từ file"}): {t.weekResult ? <>KQ: {t.weekResult.slice(0, 160)}{t.weekResult.length > 160 ? "…" : ""}</> : null}{t.nextPlan ? <> · KH: {t.nextPlan.slice(0, 160)}</> : null}</div>}
                  {r.pkg && <div className="small"><b>Gói thầu liên kết:</b> {r.autoText} — % tự động</div>}
                </div>
              </div>
              <div className="form-grid" style={{ marginTop: 8, gridTemplateColumns: "310px 200px minmax(220px,1fr) minmax(220px,1fr)" }}>
                <Field label="% hoàn thành" group>
                  <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <Inp type="number" min={0} max={100} disabled={ro || !!r.pkg} style={{ width: 70 }} value={r.pkg ? r.percent ?? "" : v.percent} onChange={(e) => set(r, { percent: e.target.value })} aria-label="% hoàn thành" />
                    {!r.pkg && !ro && [25, 50, 75, 100].map((p) => <button key={p} type="button" className={`btn ghost sm ${Number(v.percent) === p ? "on" : ""}`} onClick={() => set(r, { percent: p, status: p === 100 ? "done" : v.status === "not_started" ? "in_progress" : v.status })}>{p}</button>)}
                  </div>
                </Field>
                <Field label="Trạng thái"><Sel disabled={ro} value={v.status} onChange={(e) => set(r, { status: e.target.value })}>{Object.entries(TASK_STATUS).filter(([k]) => k !== "cancelled" || can.manage).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>
                <Field label={<span className="between">Kết quả tuần này {!ro && t.nextPlan && t.lastReportWeek !== week && <button type="button" className="linkbtn small" onClick={() => set(r, { weekResult: t.nextPlan })} title="Chép kế hoạch tuần trước làm kết quả tuần này"><CornerDownLeft size={12} /> Đúng như KH tuần trước</button>}</span>}>
                  <TA rows={2} disabled={ro} value={v.weekResult} onChange={(e) => set(r, { weekResult: e.target.value })} placeholder="Đã làm được gì trong tuần…" />
                </Field>
                <Field label={<span className="between">Kế hoạch tuần tới {!ro && t.nextPlan && t.lastReportWeek !== week && <button type="button" className="linkbtn small" onClick={() => set(r, { nextPlan: t.nextPlan })}>Giữ KH cũ</button>}</span>}>
                  <TA rows={2} disabled={ro} value={v.nextPlan} onChange={(e) => set(r, { nextPlan: e.target.value })} placeholder="Việc dự kiến tuần tới…" />
                </Field>
              </div>
              <Field label="Khó khăn, vướng mắc (nếu có)"><Inp disabled={ro} value={v.difficulty} onChange={(e) => set(r, { difficulty: e.target.value })} placeholder="Để trống nếu không có" /></Field>
            </section>
          );
        })}
      </div>
      {pk.length > 0 && <section className="card" style={{ marginTop: 12 }}>
        <div className="card-h"><h2>Gói thầu đang tổ chức <span className="small mut">(tự cập nhật từ phân hệ LCNT — chỉ cần cập nhật mốc tại hồ sơ gói thầu)</span></h2></div>
        <DataTable short rows={pk} columns={[
          { key: "c", label: "Mã gói", render: (r) => <span className="code">{r.code || "—"}</span> },
          { key: "n", label: "Tên gói", render: (r) => <div className="wrap2" style={{ maxWidth: 380 }}>{r.name}</div> },
          { key: "a", label: "Tiến độ tự động", render: (r) => <span className="small">{r.autoText}</span> },
          { key: "p", label: "% mốc", render: (r) => <Pct v={r.percent} /> }, { key: "e", label: "Đánh giá", render: (r) => stateBadge(r.ev) },
          { key: "o", label: "", render: (r) => <OpenPkg id={r.pkg.id} /> },
        ]} />
      </section>}
    </>
  );
}
const OpenPkg = ({ id }) => { const { go } = useApp(); return <Btn kind="ghost" sm icon={ExternalLink} onClick={() => go("lcnt", { open: id })}>Mở</Btn>; };

// ------------------------------------------------------------------ Chi tiết nhiệm vụ
function TaskDetail({ id, onClose }) {
  const { allTaskRows, data, can, me, write, go, today } = useApp();
  const r = allTaskRows.find((x) => x.id === id);
  const [mode, setMode] = useState(null); // edit | quick | ext
  const [qf, setQf] = useState(null);
  const [ext, setExt] = useState({ due: "", reason: "" });
  if (!r) return <Modal title="Không tìm thấy nhiệm vụ" onClose={onClose}><Empty title="Nhiệm vụ không tồn tại hoặc đã bị xóa" /></Modal>;
  const t = r.rec;
  const editable = can.edit(t.staffId);
  const week = isoWeek(today);
  const hist = (data.task_updates || []).filter((u) => u.taskId === t.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const locked = t.dueLocked !== false;
  const approve = async () => { if (await write([{ table: "tasks", op: "update", id: t.id, reason: `Duyệt gia hạn: ${t.extReason || ""}`, data: { dueDate: t.extRequestedDue, extStatus: "approved" } }], "Đã duyệt gia hạn")) setMode(null); };
  const reject = async () => { const reason = await askReason("Lý do từ chối đề nghị gia hạn"); if (reason) write([{ table: "tasks", op: "update", id: t.id, reason, data: { extStatus: "rejected" } }], "Đã từ chối đề nghị gia hạn"); };
  const sendExt = async () => { if (await write([{ table: "tasks", op: "update", id: t.id, data: { extRequestedDue: ext.due, extReason: ext.reason.trim(), extStatus: "pending" } }], "Đã gửi đề nghị gia hạn — chờ lãnh đạo duyệt")) setMode(null); };
  const toggleLock = async () => { const reason = await askReason(locked ? "Lý do mở khóa hạn nhiệm vụ" : "Khóa lại hạn nhiệm vụ"); if (reason) write([{ table: "tasks", op: "update", id: t.id, reason, data: { dueLocked: !locked } }], locked ? "Đã mở khóa hạn" : "Đã khóa hạn"); };
  const del = async () => { const reason = await askReason("Xóa nhiệm vụ? (khuyến nghị chuyển trạng thái Hủy)"); if (reason && (await write([{ table: "tasks", op: "delete", id: t.id, reason }], "Đã xóa nhiệm vụ"))) onClose(); };
  const saveQuick = async () => { if (await write(updateOps(t, qf, me.id, week), "Đã cập nhật tiến độ")) setMode(null); };
  const info = [
    ["Loại nhiệm vụ", t.taskType], ["Văn bản / nguồn giao", t.sourceDoc || "—"], ["Người / cấp giao", t.assigner || "—"], ["Chủ trì", r.staffName], ["Phối hợp", t.collaborators || "—"],
    ["Ngày giao", fmtD(t.assignedDate)], ["Hạn hiện hành", <span key="d">{locked && <Lock size={12} aria-hidden />} {fmtD(t.dueDate)}{locked ? " (đã khóa)" : " (đang mở khóa)"}</span>],
    ["Hạn giao ban đầu", fmtD(t.originalDue)], ["Gia hạn", t.extStatus ? `${EXT_TASK[t.extStatus]}${t.extRequestedDue ? " → " + fmtDate(t.extRequestedDue) : ""}${t.extReason ? ` · ${t.extReason}` : ""}` : "—"],
    ["Sản phẩm đầu ra", t.output || "—"], ["% hoàn thành", pctText(r.percent) + (r.pkg ? " (tự động theo mốc gói thầu)" : "")], ["Trạng thái", TASK_STATUS[r.ev.status]], ["Ngày hoàn thành", fmtD(r.ev.completed)],
    ["Kế hoạch phòng", r.plan ? `${r.plan.docNo ? r.plan.docNo + " · " : ""}${r.plan.title}` : "—"],
    ["Gói thầu liên kết", r.pkg ? <button key="p" className="linkbtn" onClick={() => go("lcnt", { open: r.pkg.id })}>{r.pkg.code || r.pkg.name}</button> : "—"],
    ["Nhiệm vụ thường xuyên", t.recurring ? "Có" : "Không"], ["Báo cáo gần nhất", t.lastReportWeek ? `${t.lastReportWeek}` : "Chưa có"],
  ];
  return (
    <Modal size="wide" title={<span className="code" style={{ fontSize: 15 }}>{t.code || "Nhiệm vụ"}</span>} sub={<span className="row" style={{ gap: 8 }}>{stateBadge(r.ev)}<span className="wrap2" style={{ maxWidth: 720 }}>{t.title}</span></span>} onClose={onClose}>
      <div className="row" style={{ marginBottom: 10 }}>
        {editable && <Btn sm icon={Check} onClick={() => { setQf(initForm(t, week)); setMode("quick"); }}>Cập nhật tiến độ</Btn>}
        {editable && <Btn kind="ghost" sm icon={Pencil} onClick={() => setMode("edit")}>Sửa thông tin</Btn>}
        {editable && OPEN(r.ev.code) && locked && !can.manage && <Btn kind="ghost" sm icon={CalendarClock} onClick={() => { setExt({ due: t.extRequestedDue || "", reason: "" }); setMode("ext"); }}>Đề nghị gia hạn</Btn>}
        {can.manage && r.ev.pendingExt && <><Btn sm icon={Check} onClick={approve}>Duyệt gia hạn → {fmtD(t.extRequestedDue)}</Btn><Btn kind="ghost" sm icon={XIcon} onClick={reject}>Từ chối</Btn></>}
        <span style={{ flex: 1 }} />
        {can.manage && <Btn kind="ghost" sm icon={locked ? Unlock : Lock} onClick={toggleLock}>{locked ? "Mở khóa hạn" : "Khóa hạn"}</Btn>}
        {can.manage && <Btn kind="danger" sm icon={Trash2} onClick={del}>Xóa</Btn>}
      </div>
      {mode === "quick" && qf && (
        <section className="card" style={{ marginBottom: 12, background: "var(--bg2, #f6f8fc)" }}>
          <div className="form-grid">
            <Field label="% hoàn thành"><Inp type="number" min={0} max={100} disabled={!!r.pkg} value={r.pkg ? r.percent ?? "" : qf.percent} onChange={(e) => setQf({ ...qf, percent: e.target.value })} /></Field>
            <Field label="Trạng thái"><Sel value={qf.status} onChange={(e) => setQf({ ...qf, status: e.target.value })}>{Object.entries(TASK_STATUS).filter(([k]) => k !== "cancelled" || can.manage).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>
            <Field label="Kết quả tuần này" span={2}><TA rows={2} value={qf.weekResult} onChange={(e) => setQf({ ...qf, weekResult: e.target.value })} /></Field>
            <Field label="Kế hoạch tiếp theo" span={2}><TA rows={2} value={qf.nextPlan} onChange={(e) => setQf({ ...qf, nextPlan: e.target.value })} /></Field>
            <Field label="Khó khăn, vướng mắc" span={2}><Inp value={qf.difficulty} onChange={(e) => setQf({ ...qf, difficulty: e.target.value })} /></Field>
          </div>
          <div className="row"><Btn onClick={saveQuick}>Lưu cập nhật</Btn><Btn kind="ghost" onClick={() => setMode(null)}>Hủy</Btn><span className="small mut">Mỗi lần lưu được ghi vào nhật ký tuần {week}.</span></div>
        </section>
      )}
      {mode === "ext" && (
        <section className="card" style={{ marginBottom: 12 }}>
          <div className="form-grid">
            <Field label="Hạn đề nghị mới *"><Inp type="date" min={t.dueDate || undefined} value={ext.due} onChange={(e) => setExt({ ...ext, due: e.target.value })} /></Field>
            <Field label="Lý do / căn cứ *" span={2}><TA rows={2} value={ext.reason} onChange={(e) => setExt({ ...ext, reason: e.target.value })} placeholder="VD: Chờ ý kiến đơn vị phối hợp theo CV số …" /></Field>
          </div>
          <div className="row"><Btn disabled={!ext.due || !ext.reason.trim() || (t.dueDate && ext.due <= t.dueDate)} onClick={sendExt}>Gửi đề nghị</Btn><Btn kind="ghost" onClick={() => setMode(null)}>Hủy</Btn><span className="small mut">Hạn hiện hành giữ nguyên đến khi lãnh đạo duyệt.</span></div>
        </section>
      )}
      <div className="grid2">
        <dl className="form-grid" style={{ margin: 0 }}>
          {info.map(([k, v]) => <div key={k} className="field"><dt className="lbl">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
        </dl>
        <div>
          {r.pkg && <div className="note" style={{ marginBottom: 8 }}><b>Tự động từ phân hệ LCNT:</b> {r.autoText}</div>}
          {[["Kết quả đã thực hiện (lũy kế)", t.resultTotal], ["Kết quả tuần gần nhất", t.weekResult], ["Kế hoạch tiếp theo", t.nextPlan], ["Khó khăn, vướng mắc", t.difficulty], ["Đề xuất, kiến nghị", t.proposal], ["Ghi chú", t.note]].map(([k, v]) => v ? (
            <div key={k} style={{ marginBottom: 8 }}><span className="lbl">{k}</span><div className="small" style={{ whiteSpace: "pre-wrap" }}>{v}</div></div>) : null)}
          <span className="lbl">Nhật ký cập nhật tuần ({hist.length})</span>
          {hist.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{hist.slice(0, 20).map((u) => (
            <li key={u.id} style={{ marginBottom: 4 }}><b>{u.week}</b> · {pctText(u.percent)} · {TASK_STATUS[u.status] || u.status} · <span className="mut">{staffLabel(data.staff.find((s) => s.id === u.staffId))}</span>{u.weekResult ? <div>{u.weekResult}</div> : null}</li>))}</ul>
            : <div className="small mut">Chưa có cập nhật trên web (dữ liệu ban đầu nhập từ file tuần 40).</div>}
        </div>
      </div>
      {mode === "edit" && <TaskForm init={t} onClose={() => setMode(null)} />}
    </Modal>
  );
}

// ------------------------------------------------------------------ Thêm / sửa nhiệm vụ
function nextCode(tasks, today) {
  const yy = today.slice(2, 4);
  const max = tasks.map((t) => (t.code || "").match(new RegExp(`^NV${yy}-(\\d+)$`))).filter(Boolean).reduce((a, m) => Math.max(a, Number(m[1])), 0);
  return `NV${yy}-${String(max + 1).padStart(4, "0")}`;
}
export function TaskForm({ init = {}, onClose }) {
  const { data, me, can, write, today, allPkgRows } = useApp();
  const isNew = !init.id;
  const [f, setF] = useState(() => ({ taskType: "Nhiệm vụ được giao", staffId: me.id, assignedDate: today, status: "not_started", percent: 0, recurring: false, ...init }));
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const locked = !isNew && init.dueLocked !== false && !can.manage;
  const staff = data.staff.filter((s) => s.active !== false && rank(s.role) >= 1).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const pkgs = allPkgRows.filter((p) => !["cancelled"].includes(p.ev.code)).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const save = async () => {
    setErr("");
    if (!f.title?.trim()) return setErr("Nhập tên nhiệm vụ.");
    if (f.dueDate && f.assignedDate && f.dueDate < f.assignedDate) return setErr("Hạn hoàn thành phải sau ngày giao.");
    const keys = ["code", "title", "taskType", "planId", "packageId", "sourceDoc", "assigner", "staffId", "collaborators", "assignedDate", "dueDate", "output", "recurring", "note", "proposal", "resultTotal"];
    const d = Object.fromEntries(keys.map((k) => [k, f[k] === "" ? null : f[k] ?? null]));
    if (isNew) {
      d.code = d.code || nextCode(data.tasks || [], today);
      Object.assign(d, { originalDue: d.dueDate, dueLocked: true, status: f.status, percent: Number(f.percent) || 0, source: "Nhập trên web" });
      if (!can.manage) d.staffId = me.id;
      if (await write([{ table: "tasks", op: "insert", id: genId("nv_"), data: d }], `Đã giao nhiệm vụ ${d.code}`)) onClose();
      return;
    }
    const ch = Object.fromEntries(Object.entries(d).filter(([k, v]) => (init[k] ?? null) !== v));
    if (locked) delete ch.dueDate;
    if (!Object.keys(ch).length) return onClose();
    let reason = null;
    if (("dueDate" in ch && init.dueDate) || ("staffId" in ch && init.staffId)) { reason = await askReason("Lý do đổi hạn / chuyển người chủ trì"); if (!reason) return; }
    if (await write([{ table: "tasks", op: "update", id: init.id, data: ch, reason }], "Đã lưu nhiệm vụ")) onClose();
  };
  return (
    <Modal size="wide" title={isNew ? "Giao / thêm nhiệm vụ" : `Sửa nhiệm vụ ${init.code || ""}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn><Btn onClick={save}>Lưu</Btn></>}>
      <div className="form-grid">
        <Field label="Tên nhiệm vụ / nội dung công việc *" span={2}><TA rows={2} value={f.title || ""} onChange={set("title")} /></Field>
        <Field label="Loại nhiệm vụ"><Sel value={f.taskType} onChange={set("taskType")}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</Sel></Field>
        <Field label="Mã" hint={isNew ? "Để trống: tự cấp số NVyy-xxxx" : undefined}><Inp value={f.code || ""} onChange={set("code")} /></Field>
        <Field label="Chủ trì"><Sel value={f.staffId || ""} disabled={!can.manage} onChange={set("staffId")}><option value="">— Chưa phân công —</option>{staff.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
        <Field label="Phối hợp"><Inp value={f.collaborators || ""} onChange={set("collaborators")} placeholder="VD: hungnv71, P.Thẩm định" /></Field>
        <Field label="Văn bản / nguồn giao"><Inp value={f.sourceDoc || ""} onChange={set("sourceDoc")} placeholder="Số KH, CV, VO…" /></Field>
        <Field label="Người / cấp giao"><Inp value={f.assigner || ""} onChange={set("assigner")} placeholder="VD: TGĐ, Trưởng phòng" /></Field>
        <Field label="Ngày giao"><Inp type="date" value={f.assignedDate || ""} onChange={set("assignedDate")} /></Field>
        <Field label={<>Hạn hoàn thành {locked && <Lock size={12} aria-label="đã khóa" />}</>} hint={locked ? "Hạn đã khóa — dùng “Đề nghị gia hạn”." : isNew ? "Sau khi lưu, hạn được khóa cứng." : undefined}>
          <Inp type="date" disabled={locked} value={f.dueDate || ""} onChange={set("dueDate")} /></Field>
        <Field label="Kế hoạch phòng"><Sel value={f.planId || ""} onChange={set("planId")}><option value="">—</option>{(data.task_plans || []).map((p) => <option key={p.id} value={p.id}>{p.docNo ? p.docNo + " · " : ""}{p.title}</option>)}</Sel></Field>
        <Field label="Gắn gói thầu (tự lấy tiến độ)"><Sel value={f.packageId || ""} onChange={set("packageId")}><option value="">—</option>{pkgs.map((p) => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name.slice(0, 70)}</option>)}</Sel></Field>
        <Field label="Sản phẩm đầu ra" span={2}><Inp value={f.output || ""} onChange={set("output")} /></Field>
        {isNew && <Field label="Trạng thái ban đầu"><Sel value={f.status} onChange={set("status")}>{Object.entries(TASK_STATUS).filter(([k]) => k !== "cancelled").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>}
        <Field label="Ghi chú" span={isNew ? 1 : 2}><Inp value={f.note || ""} onChange={set("note")} /></Field>
      </div>
      <label className="row"><input type="checkbox" checked={!!f.recurring} onChange={set("recurring")} /> Nhiệm vụ thường xuyên (lặp lại)</label>
      {err && <div className="warn-note" role="alert" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ------------------------------------------------------------------ Xếp hạng & thống kê
function RankStats() {
  const { taskRows, data, reportDate, setFilters, go } = useApp();
  const [sortBy, setSortBy] = useState("open");
  const [year, setYear] = useState(Number(reportDate.slice(0, 4)));
  const [metric, setMetric] = useState("assigned");
  const ranking = useMemo(() => staffRanking(taskRows, data, reportDate, sortBy), [taskRows, data, reportDate, sortBy]);
  const staffList = ranking.map((x) => x.staff);
  const mx = useMemo(() => monthMatrix(taskRows, staffList, year, metric), [taskRows, staffList, year, metric]); // eslint-disable-line
  const chart = ranking.filter((x) => x.open).map((x) => ({ name: x.name, overdue: x.overdue, due: x.dueSoon, on_track: x.open - x.overdue - x.dueSoon - x.noDue, no_due: x.noDue }));
  const years = [...new Set((data.tasks || []).flatMap((t) => [t.assignedDate, t.dueDate, t.completedDate]).filter(Boolean).map((d) => Number(d.slice(0, 4))))].sort((a, b) => b - a);
  if (!years.includes(year)) years.unshift(year);
  const pick = (id) => { setFilters({ scope: "all", staff: id }); go("nhiem-vu", { tab: "ds" }); };
  const notRep = ranking.filter((x) => !x.reported && x.open > 0);
  return (
    <>
      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><h2>Xếp hạng cá nhân theo số việc tồn <InfoTip text="Tồn = nhiệm vụ chưa hoàn thành + gói thầu đang tổ chức (tự động). Số liệu trạng thái, không phải đánh giá năng lực khi chưa rõ nguyên nhân." /></h2>
          <label className="row small">Sắp xếp theo <Sel style={{ width: 200 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="open">Tổng việc tồn</option><option value="overdue">Số việc quá hạn</option><option value="done">Hoàn thành trong tháng</option></Sel></label></div>
        {notRep.length > 0 && <div className="warn-note" style={{ marginBottom: 10 }}>Chưa gửi báo cáo {weekLabel(isoWeek(reportDate))}: <b>{notRep.map((x) => x.name).join(", ")}</b></div>}
        <DataTable short rows={ranking} hl={(x) => x.overdue > 0} columns={[
          { key: "r", label: "Hạng", right: true, render: (x) => <b className="num">{x.rank}</b> },
          { key: "n", label: "Cán bộ", render: (x) => <button className="linkbtn nowrap" onClick={() => pick(x.id)} title="Xem danh sách nhiệm vụ của cán bộ">{x.name}</button> },
          { key: "b", label: "Tổng tồn", right: true, render: (x) => <b className="num">{x.backlog}</b> },
          { key: "o", label: "NV đang làm", right: true, render: (x) => x.open },
          { key: "q", label: "Quá hạn", right: true, render: (x) => <span className={x.overdue ? "tone-red b" : ""}>{x.overdue}</span> },
          { key: "s", label: "Sắp đến hạn", right: true, render: (x) => x.dueSoon },
          { key: "nd", label: "Chưa có hạn", right: true, render: (x) => x.noDue },
          { key: "w", label: "Chờ phối hợp", right: true, render: (x) => x.waiting },
          { key: "p", label: "Gói thầu đang TC", right: true, render: (x) => x.pkgOpen },
          { key: "d", label: "HT trong tháng", right: true, render: (x) => x.doneMonth },
          { key: "t", label: "Tổng NV / đã HT", right: true, render: (x) => `${x.total} / ${x.doneTotal}` },
          { key: "a", label: "Tiến độ BQ việc mở", right: true, render: (x) => pctText(x.avgPct) },
          { key: "c", label: "BC tuần này", render: (x) => (x.reported ? <Badge tone="green">Đã gửi</Badge> : x.open ? <Badge tone="amber">Chưa gửi</Badge> : <span className="small mut">—</span>) },
        ]} />
      </section>
      <div className="grid2" style={{ marginBottom: 14 }}>
        <section className="card"><div className="card-h"><h2>Việc đang mở theo cán bộ</h2></div>
          {chart.length ? <StaffChart data={chart} unit="nhiệm vụ" /> : <Empty title="Không có nhiệm vụ đang mở" />}</section>
        <section className="card">
          <div className="card-h"><h2>Số nhiệm vụ theo người × tháng</h2>
            <div className="row">
              <div className="seg" role="radiogroup" aria-label="Chỉ tiêu">{[["assigned", "Giao mới"], ["due", "Đến hạn"], ["done", "Hoàn thành"]].map(([k, l]) => <button key={k} role="radio" aria-checked={metric === k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>)}</div>
              <Sel style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">{years.map((y) => <option key={y}>{y}</option>)}</Sel>
            </div></div>
          <div className="tbl-wrap short"><table className="tbl">
            <thead><tr><th>Cán bộ</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className="r">T{i + 1}</th>)}<th className="r">Cả năm</th></tr></thead>
            <tbody>{mx.body.map((b) => <tr key={b.id}><td className="nowrap">{b.name}</td>{b.counts.map((c, i) => <td key={i} className="r num" style={c ? { background: `rgba(238,0,51,${Math.min(0.08 + c * 0.06, 0.45)})` } : undefined}>{c || ""}</td>)}<td className="r num b">{b.total}</td></tr>)}
              <tr><td className="b">Toàn phòng</td>{mx.totals.map((c, i) => <td key={i} className="r num b">{c || ""}</td>)}<td className="r num b">{mx.total}</td></tr></tbody>
          </table></div>
          {mx.missing > 0 && <p className="small mut" style={{ marginBottom: 0 }}>{mx.missing} nhiệm vụ không có {metric === "assigned" ? "ngày giao" : metric === "due" ? "hạn" : "ngày hoàn thành (nhập từ file cũ)"} nên chưa đưa vào bảng.</p>}
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Kế hoạch phòng ban hành
function Plans({ onAddTask }) {
  const { data, allTaskRows, can, write, go } = useApp();
  const [form, setForm] = useState(null);
  const plans = [...(data.task_plans || [])].sort((a, b) => String(b.issuedDate || "").localeCompare(String(a.issuedDate || "")));
  const stat = (p) => { const l = allTaskRows.filter((r) => r.rec.planId === p.id); const done = l.filter((r) => DONE(r.ev.code)).length; return { n: l.length, done, od: l.filter((r) => r.ev.code === "overdue").length, pct: l.length ? Math.round((done / l.length) * 100) : null }; };
  const save = async () => {
    if (!form.title?.trim()) return;
    const d = { docNo: form.docNo || null, title: form.title.trim(), issuedDate: form.issuedDate || null, issuer: form.issuer || null, periodFrom: form.periodFrom || null, periodTo: form.periodTo || null, note: form.note || null, status: form.status || "active" };
    if (await write([form.id ? { table: "task_plans", op: "update", id: form.id, data: d } : { table: "task_plans", op: "insert", id: genId("kh_"), data: d }], "Đã lưu kế hoạch")) setForm(null);
  };
  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="small mut">Kế hoạch / phiếu giao nhiệm vụ do phòng ban hành. Mỗi nhiệm vụ gắn với kế hoạch để theo dõi tỷ lệ hoàn thành của cả kế hoạch.</span>
        {can.manage && <Btn icon={Plus} onClick={() => setForm({ status: "active" })}>Thêm kế hoạch</Btn>}
      </div>
      {plans.length ? <DataTable rows={plans} columns={[
        { key: "s", label: "Số văn bản", render: (p) => <span className="code">{p.docNo || "—"}</span> },
        { key: "t", label: "Tên kế hoạch", render: (p) => <div style={{ maxWidth: 380 }}><b>{p.title}</b>{p.note && <div className="small mut">{p.note}</div>}</div> },
        { key: "d", label: "Ban hành", render: (p) => <span className="nowrap">{fmtD(p.issuedDate)}{p.issuer ? ` · ${p.issuer}` : ""}</span> },
        { key: "k", label: "Kỳ thực hiện", render: (p) => <span className="nowrap">{fmtD(p.periodFrom)} – {fmtD(p.periodTo)}</span> },
        { key: "n", label: "Số NV", right: true, render: (p) => stat(p).n },
        { key: "h", label: "Đã HT", right: true, render: (p) => stat(p).done },
        { key: "o", label: "Quá hạn", right: true, render: (p) => <span className={stat(p).od ? "tone-red b" : ""}>{stat(p).od}</span> },
        { key: "p", label: "% HT", render: (p) => <Pct v={stat(p).pct} /> },
        { key: "a", label: "", render: (p) => <div className="row" style={{ flexWrap: "nowrap" }}>
          <Btn kind="ghost" sm onClick={() => go("nhiem-vu", { tab: "ds", plan: p.id })}>Xem NV <ChevronRight size={13} /></Btn>
          {can.manage && <Btn kind="ghost" sm icon={Plus} onClick={() => onAddTask(p.id)}>Giao NV</Btn>}
          {can.manage && <Btn kind="ghost" sm icon={Pencil} onClick={() => setForm(p)} aria-label="Sửa kế hoạch" />}</div> },
      ]} /> : <Empty icon="06-progress" title="Chưa có kế hoạch phòng">{can.manage ? "Bấm “Thêm kế hoạch” để khai báo kế hoạch/phiếu giao nhiệm vụ." : "Lãnh đạo phòng khai báo kế hoạch."}</Empty>}
      {form && <Modal title={form.id ? "Sửa kế hoạch phòng" : "Thêm kế hoạch phòng"} onClose={() => setForm(null)} footer={<><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn disabled={!form.title?.trim()} onClick={save}>Lưu</Btn></>}>
        <div className="form-grid">
          <Field label="Tên kế hoạch *" span={2}><Inp value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Phiếu giao nhiệm vụ Quý 04/2026" /></Field>
          <Field label="Số văn bản"><Inp value={form.docNo || ""} onChange={(e) => setForm({ ...form, docNo: e.target.value })} /></Field>
          <Field label="Ngày ban hành"><Inp type="date" value={form.issuedDate || ""} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} /></Field>
          <Field label="Cấp ban hành"><Inp value={form.issuer || ""} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Trưởng phòng / Ban / TCT" /></Field>
          <Field label="Trạng thái"><Sel value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Đang thực hiện</option><option value="closed">Đã kết thúc</option></Sel></Field>
          <Field label="Từ ngày"><Inp type="date" value={form.periodFrom || ""} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} /></Field>
          <Field label="Đến ngày"><Inp type="date" value={form.periodTo || ""} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} /></Field>
          <Field label="Ghi chú" span={2}><Inp value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
      </Modal>}
    </>
  );
}

// ------------------------------------------------------------------ Tab "Nhiệm vụ phòng" ở Tổng quan
export function TaskOverview() {
  const { taskRows, alerts, go, data, reportDate } = useApp();
  const actions = alerts.action.filter((a) => a.module === "nv");
  const ranking = useMemo(() => staffRanking(taskRows, data, reportDate), [taskRows, data, reportDate]);
  const chart = ranking.filter((x) => x.open).map((x) => ({ name: x.name, overdue: x.overdue, due: x.dueSoon, on_track: x.open - x.overdue - x.dueSoon - x.noDue, no_due: x.noDue }));
  const week = isoWeek(reportDate);
  return (
    <>
      <TaskKpiCards rows={taskRows} onPick={(k) => go("nhiem-vu", { tab: "ds", kpi: k })} />
      <div className="grid2" style={{ marginBottom: 14 }}>
        <section className="card"><div className="card-h"><h2>Việc đang mở theo cán bộ</h2><Btn kind="ghost" sm onClick={() => go("nhiem-vu", { tab: "xh" })}>Xếp hạng <ChevronRight size={14} /></Btn></div>
          {chart.length ? <StaffChart data={chart} unit="nhiệm vụ" /> : <Empty title="Không có nhiệm vụ đang mở" />}</section>
        <section className="card"><div className="card-h"><h2>Báo cáo {weekLabel(week)}</h2></div>
          <div className="row" style={{ gap: 6 }}>{ranking.map((x) => <Badge key={x.id} tone={x.reported ? "green" : x.open ? "amber" : "gray"} title={x.lastReport ? `Lần gần nhất: ${x.lastReport}` : "Chưa từng gửi"}>{x.reported ? "✓" : "•"} {x.name}</Badge>)}</div>
          <p className="small mut">Xanh: đã gửi tuần này · Vàng: còn việc mở nhưng chưa gửi. Hệ thống tự gửi mail nhắc chiều thứ Sáu và sáng thứ Hai (n8n).</p>
        </section>
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><h2>Nhiệm vụ cần xử lý {actions.length > 0 && <Badge tone={actions.some((a) => a.kind === "overdue") ? "red" : "amber"}>{actions.filter((a) => a.kind === "overdue").length} quá hạn · {actions.length} việc</Badge>}</h2>
          <Btn kind="ghost" sm onClick={() => go("canh-bao", { m: "nv" })}>Xem tất cả <ChevronRight size={14} /></Btn></div>
        {actions.length ? <ActionTable items={actions.slice(0, 8)} onOpen={(a) => go("nhiem-vu", { open: a.recordId })} /> : <Empty icon="07-closeout" title="Không có nhiệm vụ quá hạn hoặc sắp đến hạn" />}
      </section>
    </>
  );
}
