import { useMemo, useState } from "react";
import { Plus, Upload, Download, Pencil, Trash2, Check, X, Link2, Wand2 } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { genId } from "../lib/supabase.js";
import {
  HD_PROGRESS, EXEC_STATUS, ACC_STATUS, LIQ_STATUS, PAY_OWNER, EXT_STATUS, PAY_KIND, TX_STATUS, KPI_BY_KEY, daysText, staffLabel, contractDue,
} from "../lib/rules.js";
import { fmtDate, suggestDue, diffDays } from "../lib/dates.js";
import { Banner, Btn, Badge, Tag, Field, Inp, Sel, TA, Modal, DataTable, ColumnMenu, useLocalState, fmtD, money, ty, Empty, askReason, InfoTip } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { IssuesPanel, HistoryPanel, ImportDialog, KpiChip } from "../components/Record.jsx";
import { exportWorkbook, parseContracts } from "../lib/excel.js";
import { DataLists } from "./Tenders.jsx";

const SEV = { overdue: 0, review: 1, due_today: 1, due_soon: 2, no_due: 3, on_track: 5, done_nodate: 6, done_late: 6, done: 7, terminated: 8, cancelled: 9 };
export const progressBadge = (p) => {
  const s = HD_PROGRESS[p.code];
  const extra = p.code === "overdue" || p.code === "done_late" ? ` ${p.lateDays} ngày` : p.code === "due_soon" ? ` · còn ${p.daysLeft} ngày` : "";
  return <Badge tone={s.tone}>{s.label}{extra}{p.paused ? " · tạm dừng" : ""}</Badge>;
};

export default function Contracts() {
  const { route, go, hdRows, cfg, reportDate, data, alerts, filters, me, can } = useApp();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const kpi = route.params.kpi;
  const rows = useMemo(() => {
    const k = KPI_BY_KEY[kpi];
    const list = k ? hdRows.filter((r) => k.test(r, { reportDate, cfg })) : hdRows;
    return [...list].sort((a, b) => (SEV[a.progress.code] ?? 9) - (SEV[b.progress.code] ?? 9) || (b.progress.lateDays || 0) - (a.progress.lateDays || 0) || String(b.rec.signDate).localeCompare(String(a.rec.signDate)));
  }, [hdRows, kpi, reportDate, cfg]);
  const setParams = (p) => go("hop-dong", { ...route.params, ...p });
  const vnd = rows.filter((r) => r.value.currency === "VND" && r.value.current !== null);
  return (
    <>
      <Banner icon="02-contract" title="Hợp đồng đã ký" sub={<>{rows.length} hợp đồng · giá trị hiện hành {ty(vnd.reduce((a, r) => a + r.value.current, 0))} VNĐ{rows.length !== vnd.length ? ` (+${rows.length - vnd.length} HĐ ngoại tệ/thiếu giá trị, không cộng)` : ""} · Ngày dữ liệu {fmtDate(reportDate)}</>}>
        <Btn kind="ghost" icon={Download} onClick={() => exportWorkbook({ data, hdRows: rows, alerts, reportDate, cfg, filters, me, kpiKey: kpi })}>Xuất Excel</Btn>
        {can.write && <Btn kind="ghost" icon={Upload} onClick={() => setImporting(true)}>Nhập Excel</Btn>}
        {can.write && <Btn icon={Plus} onClick={() => setAdding(true)}>Thêm HĐ</Btn>}
      </Banner>
      <FilterBar />
      <PastDateNote />
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="row">{kpi && <KpiChip kpi={kpi} cfg={cfg} onClear={() => setParams({ kpi: "" })} />}<span className="small mut">Không lấy ngày ký làm ngày bắt đầu/hết hạn; hạn hiện hành chỉ đổi theo gia hạn đã duyệt và có hiệu lực.</span></div>
        <HdColumns />
      </div>
      <ContractTable rows={rows} onOpen={(id) => setParams({ open: id })} />
      {route.params.open && <ContractDetail id={route.params.open} onClose={() => setParams({ open: "" })} />}
      {adding && <ContractForm onClose={() => setAdding(false)} />}
      {importing && <ImportContracts onClose={() => setImporting(false)} />}
    </>
  );
}

const HCOLS = [
  { key: "code", label: "Mã gói", fixed: true }, { key: "no", label: "Số HĐ & tên", fixed: true }, { key: "ctr", label: "Nhà thầu" }, { key: "staff", label: "Cán bộ" },
  { key: "sign", label: "Ngày ký" }, { key: "due", label: "Hạn hiện hành" }, { key: "ext", label: "Gia hạn lần" }, { key: "value", label: "Giá trị hiện hành" },
  { key: "prog", label: "Tiến độ" }, { key: "next", label: "Việc tiếp theo" }, { key: "orig", label: "Hạn ban đầu" }, { key: "lateo", label: "Chậm so hạn gốc" },
  { key: "exec", label: "Thực hiện" }, { key: "acc", label: "Nghiệm thu" }, { key: "pay", label: "Thanh toán" }, { key: "liq", label: "Thanh lý" },
  { key: "method", label: "Hình thức LCNT" }, { key: "cat", label: "Loại gói" }, { key: "year", label: "Năm" }, { key: "guar", label: "Bảo lãnh / bảo hành" }, { key: "upd", label: "Cập nhật cuối" },
];
const DEFAULT_H = ["code", "no", "ctr", "staff", "sign", "due", "ext", "value", "prog", "next"];
function HdColumns() { const [v, setV] = useLocalState("dh_hd_cols", DEFAULT_H); return <ColumnMenu columns={HCOLS} visible={v} onChange={setV} />; }
function ContractTable({ rows, onOpen }) {
  const [vis] = useLocalState("dh_hd_cols", DEFAULT_H);
  const all = {
    code: { label: "Mã gói", stick: true, render: (r) => <span className="code">{r.code || "—"}</span> },
    no: { label: "Số HĐ & tên", stick: true, render: (r) => <><div className="code b">{r.no}</div><button className="linkbtn wrap2 small" style={{ fontWeight: 500 }} onClick={() => onOpen(r.id)}>{r.name}</button></> },
    ctr: { label: "Nhà thầu", render: (r) => <div className="small" style={{ maxWidth: 140 }}>{r.contractorName || "—"}</div> },
    staff: { label: "Cán bộ", render: (r) => <span className="nowrap">{r.staffName}</span> },
    sign: { label: "Ngày ký", render: (r) => <span className="num nowrap">{fmtD(r.rec.signDate)}</span> },
    due: { label: "Hạn hiện hành", render: (r) => <span className={`num nowrap ${r.progress.code === "overdue" ? "tone-red b" : ""}`}>{r.due.conflict ? "Cần rà soát" : fmtD(r.due.currentDue)}</span> },
    ext: { label: "Gia hạn lần", render: (r) => <span className="num">{r.due.extCount || "—"}{r.due.proposed.length ? <div><Tag>{r.due.proposed.length} chờ duyệt</Tag></div> : null}</span> },
    value: { label: "Giá trị hiện hành", right: true, render: (r) => <span className="num nowrap" title={`${money(r.value.current, r.value.currency)}${r.value.delta ? ` (gốc ${money(r.value.original, r.value.currency)})` : ""}`}>{r.value.currency === "VND" ? ty(r.value.current) : money(r.value.current, r.value.currency)}{r.value.delta ? <div className="small mut">có điều chỉnh</div> : null}</span> },
    prog: { label: "Tiến độ", render: (r) => progressBadge(r.progress) },
    next: { label: "Việc tiếp theo", render: (r) => <div className="small wrap2" style={{ maxWidth: 220 }}>{r.nextAction || "—"}</div> },
    orig: { label: "Hạn ban đầu", render: (r) => <span className="num nowrap">{fmtD(r.due.originalDue)}</span> },
    lateo: { label: "Chậm so hạn gốc", render: (r) => (r.progress.lateVsOriginal ? `${r.progress.lateVsOriginal} ngày` : "—") },
    exec: { label: "Thực hiện", render: (r) => <span className="small">{EXEC_STATUS[r.rec.execStatus]}</span> },
    acc: { label: "Nghiệm thu", render: (r) => <span className="small">{ACC_STATUS[r.rec.acceptanceStatus]}</span> },
    pay: { label: "Thanh toán", render: (r) => <span className="small">{r.pay.tracked ? (!r.pay.hasData ? "Chưa có giao dịch" : r.pay.rate === null ? "Chưa đủ dữ liệu" : `${r.pay.rate.toFixed(1)}%${r.pay.over100 ? " ⚠" : ""}`) : PAY_OWNER[r.pay.owner] || "Chưa xác định"}</span> },
    liq: { label: "Thanh lý", render: (r) => <span className="small">{LIQ_STATUS[r.rec.liquidationStatus]}{r.rec.liquidationStatus === "done" && !r.rec.liquidationDate ? " (thiếu ngày)" : ""}</span> },
    method: { label: "Hình thức LCNT", render: (r) => <span className="small">{r.rec.selectionMethod || "—"}</span> },
    cat: { label: "Loại gói", render: (r) => <span className="small">{r.category || "—"}</span> },
    year: { label: "Năm", render: (r) => r.year || "—" },
    guar: { label: "Bảo lãnh / bảo hành", render: (r) => <span className="small nowrap">{r.rec.guaranteeUntil ? `BL ${fmtD(r.rec.guaranteeUntil)}` : ""}{r.rec.warrantyUntil ? ` BH ${fmtD(r.rec.warrantyUntil)}` : ""}{!r.rec.guaranteeUntil && !r.rec.warrantyUntil ? "—" : ""}</span> },
    upd: { label: "Cập nhật cuối", render: (r) => <span className="small nowrap">{r.updatedAt ? fmtD(String(r.updatedAt).slice(0, 10)) : "—"}</span> },
  };
  const cols = HCOLS.filter((c) => vis.includes(c.key) || c.fixed).map((c) => ({ key: c.key, ...all[c.key] }));
  cols.push({ key: "act", label: "", render: (r) => <Btn kind="ghost" sm onClick={() => onOpen(r.id)} aria-label={`Mở HĐ ${r.no}`}>Mở</Btn> });
  return <DataTable columns={cols} rows={rows} onRow={(r) => onOpen(r.id)} hl={(r) => r.progress.code === "overdue"} empty={<Empty icon="02-contract" title="Không có hợp đồng phù hợp bộ lọc" />} />;
}

// =================================================================== CHI TIẾT HĐ
export function ContractDetail({ id, onClose }) {
  const { allHdRows, data, can, write, go, reportDate, cfg } = useApp();
  const r = allHdRows.find((x) => x.id === id);
  const [tab, setTab] = useState("ov");
  const [edit, setEdit] = useState(false);
  if (!r) return <Modal title="Không tìm thấy hợp đồng" onClose={onClose}><Empty title="Hợp đồng không tồn tại hoặc đã bị xóa" /></Modal>;
  const c = r.rec;
  const editable = can.edit(c.staffId);
  const childIds = ["contract_extensions", "contract_amendments", "contract_milestones", "contract_acceptances", "contract_payments"].flatMap((t) => data[t].filter((x) => x.contractId === c.id).map((x) => x.id));
  const del = async () => { const reason = await askReason("Xóa hợp đồng khỏi hệ thống? (khuyến nghị chuyển trạng thái Hủy thay vì xóa)"); if (reason && (await write([{ table: "contracts", op: "delete", id: c.id, reason }], "Đã xóa hợp đồng"))) onClose(); };
  const pkg = c.packageId ? data.packages.find((p) => p.id === c.packageId) : null;
  return (
    <Modal size="wide" title={<><span className="code" style={{ fontSize: 15 }}>{c.contractNo}</span></>} sub={<span className="row" style={{ gap: 8 }}>{progressBadge(r.progress)}<span className="wrap2" style={{ maxWidth: 700 }}>{r.name}</span></span>} onClose={onClose}>
      <div className="row" style={{ marginBottom: 10 }}>
        <Badge tone="gray">Thực hiện: {EXEC_STATUS[c.execStatus]}</Badge>
        <Badge tone={c.acceptanceStatus === "done" ? "blue" : "gray"}>{ACC_STATUS[c.acceptanceStatus]}</Badge>
        <Badge tone={r.pay.tracked ? (r.pay.over100 ? "red" : "gray") : "gray"}>{r.pay.tracked ? (!r.pay.hasData ? "Thanh toán: chưa có giao dịch" : `Thanh toán: ${r.pay.rate === null ? "chưa đủ dữ liệu" : r.pay.rate.toFixed(1) + "%"}`) : PAY_OWNER[r.pay.owner] || "Thanh toán: chưa xác định bộ phận"}</Badge>
        <Badge tone={c.liquidationStatus === "done" ? "blue" : "gray"}>{LIQ_STATUS[c.liquidationStatus]}</Badge>
        <span style={{ flex: 1 }} />
        {editable && <Btn kind="ghost" sm icon={Pencil} onClick={() => setEdit(true)}>Sửa thông tin</Btn>}
        {can.manage && <Btn kind="danger" sm icon={Trash2} onClick={del}>Xóa</Btn>}
      </div>
      <div className="tabs" role="tablist">
        {[["ov", "Tổng quan"], ["ms", "Mốc thực hiện"], ["ext", `Gia hạn & phụ lục (${r.due.all.length})`], ["pay", "Nghiệm thu & thanh toán"], ["doc", "Hồ sơ"], ["issue", `Vướng mắc (${r.issues.length})`], ["log", "Lịch sử"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === "ov" && (
        <div className="grid2">
          <div>
            <dl className="form-grid" style={{ margin: 0 }}>
              {[
                ["Mã gói", pkg ? <button className="linkbtn code" onClick={() => go("lcnt", { open: pkg.id })}>{c.packageCode || pkg.code}</button> : <span className="code">{c.packageCode || "—"}</span>],
                ["Tên gói", c.packageName || "—"], ["Nhà thầu", r.contractorName || "—"], ["Cán bộ phụ trách", r.staffName], ["Đơn vị quản lý", c.unit || "—"],
                ["Hình thức LCNT", c.selectionMethod || "—"], ["Ngày ký", fmtD(c.signDate)], ["Ngày hiệu lực", fmtD(c.effectiveDate)],
                ["Căn cứ bắt đầu", c.startBasis || "—"], ["Ngày bắt đầu thực hiện", fmtD(c.startDate)],
                ["Thời gian thực hiện", c.duration ? `${c.duration} ${{ day: "ngày", month: "tháng", working_day: "ngày làm việc" }[c.durationUnit] || ""}` : "—"],
                ["Hạn ban đầu", fmtD(r.due.originalDue)], ["Hạn hiện hành", r.due.conflict ? "Cần rà soát (xung đột)" : fmtD(r.due.currentDue)], ["Số lần gia hạn (đã duyệt, có hiệu lực)", r.due.extCount],
                ["Hoàn thành thực tế", fmtD(c.actualCompletionDate)], ["Chậm so hạn gốc", r.progress.lateVsOriginal ? `${r.progress.lateVsOriginal} ngày` : "—"],
                ["Giá trị ký ban đầu", money(r.value.original, r.value.currency)], ["Điều chỉnh (phụ lục đã duyệt)", money(r.value.delta, r.value.currency)],
                ["Giá trị hiện hành", <b key="v">{money(r.value.current, r.value.currency)}</b>], ["Cơ sở VAT", { before_vat: "Trước VAT", after_vat: "Sau VAT" }[c.vatBasis] || "Chưa rõ"],
                ["GT kế hoạch thầu", money(c.plannedValue, c.currency)], ["Bảo lãnh thực hiện đến", fmtD(c.guaranteeUntil)], ["Bảo hành đến", fmtD(c.warrantyUntil)],
                ["Việc tiếp theo", r.nextAction || "—"],
              ].map(([k, v]) => <div key={k} className="field"><dt className="lbl">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
            </dl>
            {c.note && <div className="note">{c.note}</div>}
          </div>
          <div>
            <span className="lbl">Dòng thời gian hạn</span>
            <Timeline r={r} reportDate={reportDate} />
          </div>
        </div>
      )}
      {tab === "ms" && <ContractMilestones c={c} editable={editable} />}
      {tab === "ext" && <Extensions r={r} editable={editable} />}
      {tab === "pay" && <Payments r={r} editable={editable} />}
      {tab === "doc" && <Docs r={r} editable={editable} />}
      {tab === "issue" && <IssuesPanel entity="contract" entityId={c.id} ownerId={c.staffId} />}
      {tab === "log" && <HistoryPanel ids={[c.id, ...childIds]} />}
      {edit && <ContractForm init={c} onClose={() => setEdit(false)} />}
    </Modal>
  );
}

function Timeline({ r, reportDate }) {
  const c = r.rec;
  const ev = [];
  if (c.signDate) ev.push([c.signDate, "Ký hợp đồng", ""]);
  if (c.effectiveDate) ev.push([c.effectiveDate, "Hiệu lực hợp đồng", ""]);
  if (c.startDate) ev.push([c.startDate, "Bắt đầu thực hiện", c.startBasis || ""]);
  if (c.originalDue) ev.push([c.originalDue, "Hạn hoàn thành ban đầu", ""]);
  for (const e of r.due.all) {
    const eff = e.effectiveDate || e.signDate;
    const st = e.status === "approved" ? (eff && eff <= reportDate ? "đã duyệt, có hiệu lực" : "đã duyệt, CHƯA có hiệu lực") : EXT_STATUS[e.status].toLowerCase();
    ev.push([eff || e.dueAfter || "9999-12-31", `Gia hạn lần ${e.seq ?? "?"}: ${fmtD(e.dueBefore)} → ${fmtD(e.dueAfter)}`, st, e.status !== "approved" ? "gray" : ""]);
  }
  if (c.actualCompletionDate) ev.push([c.actualCompletionDate, "Hoàn thành thực tế", r.progress.code === "done_late" ? `chậm ${r.progress.lateDays} ngày` : "", r.progress.code === "done_late" ? "red" : ""]);
  if (c.acceptanceDate) ev.push([c.acceptanceDate, "Nghiệm thu", ""]);
  if (c.liquidationDate) ev.push([c.liquidationDate, "Thanh lý", c.liquidationDoc || ""]);
  ev.push([reportDate, "Ngày báo cáo", r.due.currentDue ? `hạn hiện hành ${fmtD(r.due.currentDue)} · ${daysText(diffDays(reportDate, r.due.currentDue))}` : "", "red"]);
  ev.sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <ul className="tl">
      {ev.map(([d, t, s, cls], i) => <li key={i} className={cls}><div className="small mut num">{d === "9999-12-31" ? "Chưa có ngày" : fmtD(d)}</div><div className="b">{t}</div>{s && <div className="small mut">{s}</div>}</li>)}
    </ul>
  );
}

/** Bảng con CRUD đơn giản dùng cho mốc HĐ / gia hạn / phụ lục / nghiệm thu / giao dịch. */
function SubTable({ table, rows, columns, fields, editable, defaults, title, reasonFields = [], approve, canEditRow = () => true }) {
  const { write, can } = useApp();
  const [form, setForm] = useState(null);
  const save = async () => {
    const { id, _isNew, ...rest } = form;
    const orig = rows.find((x) => x.id === id);
    let reason = null;
    if (orig && reasonFields.some((k) => orig[k] != null && String(orig[k]) !== String(rest[k] ?? ""))) { reason = await askReason(`Lý do thay đổi (${title})`); if (!reason) return; }
    const data = {};
    for (const f of fields) { let v = rest[f.k]; if (f.type === "number") v = v === "" || v == null ? null : Number(v); if (f.type === "checkbox") v = !!v; data[f.k] = v === "" ? null : v; }
    if (await write([{ table, op: _isNew ? "insert" : "update", id: _isNew ? genId("x_") : id, data: { ...defaults, ...data }, reason }])) setForm(null);
  };
  const del = async (row) => { const reason = await askReason(`Xóa dòng (${title})`); if (reason) write([{ table, op: "delete", id: row.id, reason }], "Đã xóa"); };
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="between" style={{ marginBottom: 6 }}><b>{title}</b>{editable && <Btn sm icon={Plus} onClick={() => setForm({ _isNew: true, ...Object.fromEntries(fields.map((f) => [f.k, f.def ?? ""])) })}>Thêm</Btn>}</div>
      {rows.length ? <DataTable short rows={rows} columns={[...columns, { key: "act", label: "", render: (x) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {approve && can.manage && x.status === "proposed" && <><Btn sm kind="ghost" icon={Check} onClick={() => approve(x, "approved")}>Duyệt</Btn><Btn sm kind="ghost" icon={X} onClick={() => approve(x, "rejected")}>Từ chối</Btn></>}
          {editable && canEditRow(x) && <><Btn sm kind="ghost" onClick={() => setForm({ ...x })}>Sửa</Btn><Btn sm kind="ghost" onClick={() => del(x)} aria-label="Xóa"><Trash2 size={14} /></Btn></>}
        </div>) }]} /> : <div className="note">Chưa có dữ liệu.</div>}
      {form && (
        <Modal title={`${form._isNew ? "Thêm" : "Sửa"}: ${title}`} onClose={() => setForm(null)} footer={<><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn onClick={save}>Lưu</Btn></>}>
          <div className="form-grid">
            {fields.map((f) => (
              <Field key={f.k} label={f.label} hint={f.hint} span={f.span}>
                {f.type === "select" ? <Sel value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
                  : f.type === "checkbox" ? <input type="checkbox" checked={!!form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.checked })} />
                  : f.type === "textarea" ? <TA value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                  : <Inp type={f.type || "text"} value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />}
              </Field>))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ContractMilestones({ c, editable }) {
  const { data, reportDate } = useApp();
  const rows = data.contract_milestones.filter((m) => m.contractId === c.id).sort((a, b) => a.position - b.position);
  return (
    <>
      <p className="small mut">Dùng cho hợp đồng nhiều đợt / nhiều phạm vi: mỗi đầu việc có hạn riêng. Gia hạn theo phạm vi riêng ghi ở tab Gia hạn với “Phạm vi” tương ứng.</p>
      <SubTable table="contract_milestones" title="Mốc / đầu việc thực hiện" rows={rows} editable={editable} defaults={{ contractId: c.id }} reasonFields={["plannedDate"]}
        fields={[{ k: "position", label: "TT", type: "number", def: rows.length + 1 }, { k: "name", label: "Nội dung", span: 2 }, { k: "scope", label: "Phạm vi" }, { k: "plannedDate", label: "Hạn", type: "date" }, { k: "actualDate", label: "Hoàn thành thực tế", type: "date" }, { k: "note", label: "Ghi chú", type: "textarea", span: 2 }]}
        columns={[{ key: "p", label: "TT", render: (m) => m.position }, { key: "n", label: "Nội dung", render: (m) => m.name }, { key: "s", label: "Phạm vi", render: (m) => m.scope || "—" },
          { key: "d", label: "Hạn", render: (m) => fmtD(m.plannedDate) }, { key: "a", label: "Hoàn thành", render: (m) => fmtD(m.actualDate) },
          { key: "st", label: "Trạng thái", render: (m) => m.actualDate ? <Badge tone={m.plannedDate && m.actualDate > m.plannedDate ? "amber" : "blue"}>{m.plannedDate && m.actualDate > m.plannedDate ? `Hoàn thành chậm ${diffDays(m.plannedDate, m.actualDate)} ngày` : "Hoàn thành"}</Badge>
            : !m.plannedDate ? <Badge tone="gray">Chưa có hạn</Badge> : <Badge tone={m.plannedDate < reportDate ? "red" : m.plannedDate === reportDate ? "amber" : "green"}>{daysText(diffDays(reportDate, m.plannedDate))}</Badge> }]} />
    </>
  );
}

function Extensions({ r, editable }) {
  const { data, write, reportDate, can } = useApp();
  const c = r.rec;
  const ext = r.due.all;
  const amd = data.contract_amendments.filter((a) => a.contractId === c.id).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const approve = async (tbl, x, status) => {
    const reason = await askReason(status === "approved" ? "Phê duyệt — ghi số/ngày văn bản trong lý do nếu có" : "Lý do từ chối");
    if (!reason) return;
    const patch = { status };
    if (status === "approved" && tbl === "contract_extensions" && !x.effectiveDate && !x.signDate) patch.effectiveDate = reportDate;
    await write([{ table: tbl, op: "update", id: x.id, data: patch, reason }], status === "approved" ? "Đã phê duyệt" : "Đã từ chối");
  };
  const nextSeq = (list) => (list.reduce((a, x) => Math.max(a, x.seq || 0), 0) + 1);
  const dueNow = contractDue(c, data.contract_extensions, reportDate);
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <Badge tone="gray">Hạn ban đầu: {fmtD(r.due.originalDue)}</Badge><Badge tone="blue">Hạn hiện hành: {r.due.conflict ? "cần rà soát" : fmtD(r.due.currentDue)}</Badge>
        <Badge tone="gray">Đã gia hạn: {dueNow.extCount} lần</Badge>{r.progress.lateVsOriginal ? <Badge tone="amber">Chậm so hạn gốc: {r.progress.lateVsOriginal} ngày</Badge> : null}
        <InfoTip text="Số lần gia hạn đếm từ bản đã phê duyệt và có hiệu lực, không nhập tay. Đề nghị chưa duyệt không làm đổi hạn. Giữ số ngày chậm so với hạn gốc." />
      </div>
      {r.due.notYetEffective.length > 0 && <div className="warn-note" style={{ marginBottom: 8 }}>Có {r.due.notYetEffective.length} gia hạn đã duyệt nhưng chưa đến ngày hiệu lực — hạn hiện hành chưa thay đổi.</div>}
      {r.due.missingDate.length > 0 && <div className="warn-note" style={{ marginBottom: 8 }}>Có gia hạn đã duyệt nhưng thiếu ngày ký/hiệu lực — chưa được tính, cần bổ sung.</div>}
      {r.due.conflict && <div className="warn-note" style={{ marginBottom: 8 }}>Nhiều gia hạn cùng ngày hiệu lực nhưng hạn khác nhau — cần rà soát, hệ thống không tự chọn.</div>}
      <SubTable table="contract_extensions" title="Gia hạn thời gian" rows={ext} editable={editable} defaults={{ contractId: c.id }} approve={(x, s) => approve("contract_extensions", x, s)}
        canEditRow={(x) => x.status !== "approved" || can.manage}
        fields={[{ k: "seq", label: "Lần", type: "number", def: nextSeq(ext) }, { k: "docNo", label: "Số phụ lục / văn bản" }, { k: "signDate", label: "Ngày ký / phê duyệt", type: "date" },
          { k: "effectiveDate", label: "Ngày có hiệu lực", type: "date" }, { k: "dueBefore", label: "Hạn trước", type: "date", def: r.due.currentDue || "" }, { k: "dueAfter", label: "Hạn sau", type: "date" },
          { k: "scope", label: "Phạm vi", def: "all", hint: "all = toàn HĐ; hoặc tên phạm vi/đầu việc" }, { k: "status", label: "Trạng thái", type: "select", def: "proposed", options: Object.entries(EXT_STATUS), hint: "Chỉ lãnh đạo được duyệt/từ chối" },
          { k: "reason", label: "Lý do gia hạn", type: "textarea", span: 2 }, { k: "fileUrl", label: "Đường dẫn file đính kèm", type: "url", span: 2 }]}
        columns={[{ key: "s", label: "Lần", render: (e) => e.seq ?? "—" }, { key: "d", label: "Số VB", render: (e) => e.docNo || "—" }, { key: "k", label: "Ngày ký", render: (e) => fmtD(e.signDate) },
          { key: "h", label: "Hiệu lực", render: (e) => fmtD(e.effectiveDate) }, { key: "b", label: "Hạn trước → sau", render: (e) => <span className="nowrap">{fmtD(e.dueBefore)} → <b>{fmtD(e.dueAfter)}</b></span> },
          { key: "p", label: "Phạm vi", render: (e) => (!e.scope || e.scope === "all" ? "Toàn HĐ" : e.scope) }, { key: "r", label: "Lý do", render: (e) => <div className="small" style={{ maxWidth: 220 }}>{e.reason}</div> },
          { key: "st", label: "Trạng thái", render: (e) => <Badge tone={e.status === "approved" ? ((e.effectiveDate || e.signDate) && (e.effectiveDate || e.signDate) <= reportDate ? "blue" : "amber") : e.status === "rejected" ? "gray" : "amber"}>{EXT_STATUS[e.status]}{e.status === "approved" && !((e.effectiveDate || e.signDate) && (e.effectiveDate || e.signDate) <= reportDate) ? " · chưa hiệu lực" : ""}</Badge> },
          { key: "f", label: "File", render: (e) => e.fileUrl ? <a href={e.fileUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> Mở</a> : "" }]} />
      <SubTable table="contract_amendments" title="Phụ lục điều chỉnh giá trị" rows={amd} editable={editable} defaults={{ contractId: c.id }} approve={(x, s) => approve("contract_amendments", x, s)} reasonFields={["deltaValue"]}
        fields={[{ k: "seq", label: "Lần", type: "number", def: nextSeq(amd) }, { k: "docNo", label: "Số phụ lục" }, { k: "docDate", label: "Ngày ký", type: "date" }, { k: "effectiveDate", label: "Ngày hiệu lực", type: "date" },
          { k: "deltaValue", label: `Giá trị điều chỉnh (+/−, ${c.currency || "VND"})`, type: "number" }, { k: "status", label: "Trạng thái", type: "select", def: "proposed", options: Object.entries(EXT_STATUS) },
          { k: "reason", label: "Lý do", type: "textarea", span: 2 }, { k: "fileUrl", label: "Đường dẫn file", type: "url", span: 2 }]}
        columns={[{ key: "s", label: "Lần", render: (a) => a.seq ?? "—" }, { key: "d", label: "Số PL", render: (a) => a.docNo || "—" }, { key: "h", label: "Hiệu lực", render: (a) => fmtD(a.effectiveDate || a.docDate) },
          { key: "v", label: "Điều chỉnh", right: true, render: (a) => <span className={`num ${a.deltaValue < 0 ? "tone-red" : ""}`}>{a.deltaValue > 0 ? "+" : ""}{money(a.deltaValue, c.currency)}</span> },
          { key: "st", label: "Trạng thái", render: (a) => <Badge tone={a.status === "approved" ? "blue" : "gray"}>{EXT_STATUS[a.status]}</Badge> }, { key: "r", label: "Lý do", render: (a) => <span className="small">{a.reason}</span> }]} />
    </>
  );
}

function Payments({ r, editable }) {
  const { data, write, cfg } = useApp();
  const c = r.rec, p = r.pay;
  const tx = data.contract_payments.filter((x) => x.contractId === c.id).sort((a, b) => String(a.payDate || a.dueDate).localeCompare(String(b.payDate || b.dueDate)));
  const acc = data.contract_acceptances.filter((x) => x.contractId === c.id).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const setOwner = (v) => write([{ table: "contracts", op: "update", id: c.id, data: { paymentOwner: v || null } }], "Đã cập nhật bộ phận theo dõi thanh toán");
  const stat = (label, v, hint, tone) => <div className="card" style={{ padding: "10px 12px" }}><div className="small mut">{label} {hint && <InfoTip text={hint} />}</div><div className={`b num ${tone || ""}`} style={{ fontSize: 17 }}>{v}</div></div>;
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="row"><span className="lbl" style={{ margin: 0 }}>Bộ phận theo dõi thanh toán</span>
          <Sel style={{ width: 240 }} disabled={!editable} value={c.paymentOwner || ""} onChange={(e) => setOwner(e.target.value)}><option value="">Chưa xác định</option>{Object.entries(PAY_OWNER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></label>
        <span className="small mut">Tùy HĐ: P.QLHT, P.Quyết toán, hoặc tỉnh (HĐ khung). Chỉ HĐ do P.QLHT theo dõi mới tính tỷ lệ tại đây.</span>
      </div>
      <SubTable table="contract_acceptances" title="Nghiệm thu" rows={acc} editable={editable} defaults={{ contractId: c.id }}
        fields={[{ k: "seq", label: "Đợt", type: "number", def: acc.length + 1 }, { k: "accDate", label: "Ngày nghiệm thu", type: "date" }, { k: "value", label: "Giá trị nghiệm thu", type: "number" },
          { k: "docNo", label: "Số biên bản" }, { k: "status", label: "Trạng thái", type: "select", def: "confirmed", options: Object.entries(TX_STATUS) }, { k: "note", label: "Ghi chú", type: "textarea", span: 2 }]}
        columns={[{ key: "s", label: "Đợt", render: (a) => a.seq }, { key: "d", label: "Ngày", render: (a) => fmtD(a.accDate) }, { key: "v", label: "Giá trị", right: true, render: (a) => money(a.value, c.currency) },
          { key: "n", label: "Số BB", render: (a) => a.docNo || "—" }, { key: "st", label: "Trạng thái", render: (a) => <Badge tone={a.status === "confirmed" ? "blue" : "gray"}>{TX_STATUS[a.status]}</Badge> }]} />
      {p.tracked && cfg.paymentModule ? (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            {stat("Giá trị HĐ hiện hành", money(r.value.current, c.currency))}
            {stat("Tổng giá trị nghiệm thu", money(p.acceptance, c.currency), "Chỉ biên bản đã xác nhận")}
            {stat("Đã thanh toán (thực chi)", money(p.paid, c.currency), "Tạm ứng + thanh toán thực chi + chi trả khoản giữ lại − nhà thầu hoàn trả; chỉ giao dịch đã xác nhận. Thu hồi tạm ứng không cộng thêm.")}
            {stat("Tỷ lệ thanh toán", p.rate === null ? "Chưa đủ dữ liệu" : `${p.rate.toFixed(1)}%`, "Đã thanh toán / giá trị HĐ hiện hành × 100. Không phải tỷ lệ hoàn thành.", p.over100 ? "tone-red" : "")}
            {stat("Dư tạm ứng chưa thu hồi", money(p.advanceOutstanding, c.currency))}
            {stat("Đến hạn chưa thanh toán", money(p.dueUnpaid, c.currency), "Từ hồ sơ đề nghị thanh toán đã xác nhận, đến hạn và chưa chi trả")}
            {stat("Giá trị HĐ chưa thanh toán", money(p.unpaidValue, c.currency), "Giá trị hiện hành − đã thanh toán. Không phải công nợ đến hạn.")}
            {stat("Giao dịch không tính", `${p.draftOrCancelled} nháp/hủy${p.excludedOtherCurrency ? ` · ${p.excludedOtherCurrency} khác tiền tệ` : ""}`)}
          </div>
          {p.over100 && <div className="warn-note" style={{ marginBottom: 10 }}>Đã thanh toán vượt 100% giá trị hiện hành — cần rà soát (hệ thống không tự ép về 100%).</div>}
          <SubTable table="contract_payments" title="Giao dịch thanh toán" rows={tx} editable={editable} defaults={{ contractId: c.id }} reasonFields={["amount"]}
            fields={[{ k: "kind", label: "Loại", type: "select", def: "payment", options: Object.entries(PAY_KIND) }, { k: "amount", label: "Số tiền", type: "number" },
              { k: "currency", label: "Tiền tệ", def: c.currency || "VND" }, { k: "payDate", label: "Ngày chi / ngày chứng từ", type: "date" }, { k: "dueDate", label: "Ngày đến hạn (hồ sơ đề nghị)", type: "date" },
              { k: "settled", label: "Đã chi trả (hồ sơ đề nghị)", type: "checkbox" }, { k: "docNo", label: "Số chứng từ" },
              { k: "status", label: "Trạng thái", type: "select", def: "draft", options: Object.entries(TX_STATUS), hint: "Chỉ giao dịch Đã xác nhận được cộng" }, { k: "note", label: "Ghi chú", type: "textarea", span: 2 }]}
            columns={[{ key: "k", label: "Loại", render: (x) => PAY_KIND[x.kind] }, { key: "a", label: "Số tiền", right: true, render: (x) => <span className={`num ${x.kind === "refund" ? "tone-red" : ""}`}>{x.kind === "refund" ? "−" : ""}{money(x.amount, x.currency || c.currency)}</span> },
              { key: "d", label: "Ngày", render: (x) => fmtD(x.payDate || x.dueDate) }, { key: "n", label: "Chứng từ", render: (x) => x.docNo || "—" },
              { key: "st", label: "Trạng thái", render: (x) => <Badge tone={x.status === "confirmed" ? "blue" : "gray"}>{TX_STATUS[x.status]}</Badge> }]} />
        </>
      ) : <div className="note">{c.paymentOwner ? `${PAY_OWNER[c.paymentOwner]} — không tính tỷ lệ thanh toán tại P.QLHT.` : "Chưa xác định bộ phận theo dõi thanh toán — chọn ở trên để bật theo dõi (nếu do P.QLHT)."}</div>}
    </>
  );
}

function Docs({ r, editable }) {
  const { write } = useApp();
  const c = r.rec;
  const [f, setF] = useState({ docsUrl: c.docsUrl || "", liquidationDoc: c.liquidationDoc || "" });
  const links = [
    ...r.due.all.filter((e) => e.fileUrl).map((e) => [`Gia hạn lần ${e.seq}`, e.fileUrl]),
  ];
  return (
    <div>
      <p className="small mut">Lưu liên kết hồ sơ do người dùng cung cấp (thư mục, Voffice, Vcontract, SAP). Hệ thống không tự kết nối hay đồng bộ các hệ thống này.</p>
      <div className="form-grid">
        <Field label="Thư mục / đường dẫn hồ sơ HĐ"><Inp type="url" disabled={!editable} value={f.docsUrl} onChange={(e) => setF({ ...f, docsUrl: e.target.value })} placeholder="https://…" /></Field>
        <Field label="Hồ sơ thanh lý (số / đường dẫn)"><Inp disabled={!editable} value={f.liquidationDoc} onChange={(e) => setF({ ...f, liquidationDoc: e.target.value })} /></Field>
      </div>
      {editable && <Btn onClick={() => write([{ table: "contracts", op: "update", id: c.id, data: f }], "Đã lưu hồ sơ")}>Lưu</Btn>}
      <div style={{ marginTop: 14 }}>
        {c.docsUrl && <div><a href={c.docsUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> Mở thư mục hồ sơ</a></div>}
        {links.map(([l, u]) => <div key={u}><a href={u} target="_blank" rel="noreferrer"><Link2 size={13} /> {l}</a></div>)}
      </div>
    </div>
  );
}

// =================================================================== FORM HĐ
export function ContractForm({ init = {}, onClose }) {
  const { data, me, can, write, cfg } = useApp();
  const isNew = !init.id;
  const [f, setF] = useState({ currency: "VND", execStatus: "in_progress", acceptanceStatus: "none", liquidationStatus: "none", unit: me.unit || "Phòng QLHT", staffId: me.id, ...init });
  const [newCtr, setNewCtr] = useState("");
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sugg = suggestDue(f.startDate, f.duration, f.durationUnit, cfg.holidays);
  const NEED = ["originalDue", "signValue", "execStatus", "liquidationStatus", "acceptanceStatus", "staffId", "actualCompletionDate"];
  const NUM = ["duration", "plannedValue", "signValue", "year"];
  const save = async () => {
    setErr("");
    if (!f.contractNo?.trim()) return setErr("Nhập số hợp đồng.");
    const dup = data.contracts.find((c) => c.id !== f.id && String(c.contractNo).trim().toUpperCase() === f.contractNo.trim().toUpperCase() && (c.unit || "") === (f.unit || ""));
    if (dup) return setErr(`Số HĐ đã tồn tại trong đơn vị ${f.unit || ""}.`);
    if (f.liquidationStatus === "done" && (!f.liquidationDate || !f.liquidationDoc) && (init.liquidationStatus !== "done" || isNew)) return setErr("“Đã thanh lý” cần ngày thanh lý và hồ sơ xác nhận.");
    if (f.execStatus === "completed" && !f.actualCompletionDate && init.execStatus !== "completed") return setErr("Chuyển “Đã hoàn thành” cần ngày hoàn thành thực tế.");
    const ops = [];
    let contractorId = f.contractorId || null;
    if (newCtr.trim()) { contractorId = genId("nt_"); ops.push({ table: "contractors", op: "insert", id: contractorId, data: { name: newCtr.trim(), shortName: newCtr.trim().length <= 20 ? newCtr.trim() : null } }); }
    const KEYS = ["packageId", "packageCode", "packageName", "contractNo", "name", "category", "selectionMethod", "unit", "staffId", "signDate", "effectiveDate", "startBasis", "startDate", "duration", "durationUnit",
      "originalDue", "actualCompletionDate", "plannedValue", "signValue", "currency", "vatBasis", "execStatus", "acceptanceStatus", "acceptanceDate", "liquidationStatus", "liquidationDate", "liquidationDoc",
      "paymentOwner", "warrantyUntil", "guaranteeUntil", "docsUrl", "nextAction", "note", "year"];
    const out = {};
    for (const k of KEYS) { let v = f[k]; if (NUM.includes(k)) v = v === "" || v == null ? null : Number(v); out[k] = v === "" ? null : v ?? null; }
    out.contractorId = contractorId;
    if (!out.year && out.signDate) out.year = Number(out.signDate.slice(0, 4));
    if (!can.manage) out.staffId = isNew ? me.id : init.staffId;
    let reason = null;
    if (!isNew) {
      const patch = {};
      for (const k of Object.keys(out)) if (String(out[k] ?? "") !== String(init[k] ?? "")) patch[k] = out[k];
      if (!Object.keys(patch).length && !ops.length) return onClose();
      if (NEED.some((k) => k in patch && init[k] != null)) { reason = await askReason("Lý do thay đổi hạn / giá trị / trạng thái hợp đồng"); if (!reason) return; }
      ops.push({ table: "contracts", op: "update", id: init.id, data: patch, reason });
    } else ops.push({ table: "contracts", op: "insert", id: genId("hd_"), data: { ...out, source: "manual" } });
    if (await write(ops, isNew ? "Đã thêm hợp đồng" : "Đã cập nhật hợp đồng")) onClose();
  };
  const dis = !isNew && !can.edit(init.staffId);
  return (
    <Modal size="wide" title={isNew ? "Thêm hợp đồng" : `Sửa hợp đồng ${init.contractNo}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn><Btn onClick={save} disabled={dis}>Lưu</Btn></>}>
      <div className="form-grid">
        <Field label="Số hợp đồng *"><Inp value={f.contractNo || ""} onChange={set("contractNo")} /></Field>
        <Field label="Nội dung / tên HĐ" span={2}><Inp value={f.name || ""} onChange={set("name")} /></Field>
        <Field label="Gói LCNT liên kết"><Sel value={f.packageId || ""} onChange={(e) => { const p = data.packages.find((x) => x.id === e.target.value); setF({ ...f, packageId: e.target.value, packageCode: p?.code || f.packageCode, packageName: p?.name || f.packageName }); }}>
          <option value="">— Không liên kết —</option>{data.packages.map((p) => <option key={p.id} value={p.id}>{p.code ? p.code + " · " : ""}{p.name.slice(0, 70)}</option>)}</Sel></Field>
        <Field label="Mã / số hiệu gói"><Inp value={f.packageCode || ""} onChange={set("packageCode")} /></Field>
        <Field label="Tên gói thầu"><Inp value={f.packageName || ""} onChange={set("packageName")} /></Field>
        <Field label="Nhà thầu"><Sel value={f.contractorId || ""} onChange={set("contractorId")}><option value="">—</option>{[...data.contractors].sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name, "vi")).map((c) => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}</Sel></Field>
        <Field label="…hoặc nhà thầu mới"><Inp value={newCtr} onChange={(e) => setNewCtr(e.target.value)} placeholder="Tên nhà thầu mới" /></Field>
        <Field label="Loại gói / nhóm"><Inp list="dl-cat" value={f.category || ""} onChange={set("category")} /></Field>
        <Field label="Hình thức LCNT"><Inp list="dl-method" value={f.selectionMethod || ""} onChange={set("selectionMethod")} /></Field>
        <Field label="Đơn vị quản lý"><Inp value={f.unit || ""} onChange={set("unit")} /></Field>
        <Field label="Cán bộ phụ trách" hint={can.manage ? "" : "Chỉ lãnh đạo giao lại"}><Sel disabled={!can.manage} value={f.staffId || ""} onChange={set("staffId")}><option value="">Chưa phân công</option>{data.staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
        <Field label="Ngày ký"><Inp type="date" value={f.signDate || ""} onChange={set("signDate")} /></Field>
        <Field label="Ngày hiệu lực"><Inp type="date" value={f.effectiveDate || ""} onChange={set("effectiveDate")} /></Field>
        <Field label="Căn cứ bắt đầu thực hiện"><Inp value={f.startBasis || ""} onChange={set("startBasis")} placeholder="VD: Biên bản bàn giao mặt bằng" /></Field>
        <Field label="Ngày bắt đầu thực hiện" hint="Không tự lấy ngày ký"><Inp type="date" value={f.startDate || ""} onChange={set("startDate")} /></Field>
        <Field label="Thời gian thực hiện"><Inp type="number" value={f.duration ?? ""} onChange={set("duration")} /></Field>
        <Field label="Đơn vị thời gian"><Sel value={f.durationUnit || ""} onChange={set("durationUnit")}><option value="">—</option><option value="day">Ngày lịch</option><option value="month">Tháng</option><option value="working_day">Ngày làm việc</option></Sel></Field>
        <Field label="Hạn hoàn thành ban đầu" hint={sugg ? `Gợi ý ${fmtD(sugg)} (${f.durationUnit === "month" ? "tháng lịch, không quy đổi 30 ngày" : f.durationUnit === "working_day" ? "ngày làm việc theo lịch nghỉ" : "ngày đầu không tính"})` : ""}>
          <div className="row" style={{ flexWrap: "nowrap" }}><Inp type="date" value={f.originalDue || ""} onChange={set("originalDue")} />{sugg && <Btn kind="ghost" sm icon={Wand2} onClick={() => setF({ ...f, originalDue: sugg })} aria-label="Dùng hạn gợi ý" />}</div></Field>
        <Field label="Ngày hoàn thành thực tế"><Inp type="date" value={f.actualCompletionDate || ""} onChange={set("actualCompletionDate")} /></Field>
        <Field label="GT kế hoạch thầu"><Inp type="number" value={f.plannedValue ?? ""} onChange={set("plannedValue")} /></Field>
        <Field label="Giá trị ký ban đầu"><Inp type="number" value={f.signValue ?? ""} onChange={set("signValue")} /></Field>
        <Field label="Tiền tệ"><Sel value={f.currency || "VND"} onChange={set("currency")}><option>VND</option><option>USD</option><option>EUR</option></Sel></Field>
        <Field label="Cơ sở VAT"><Sel value={f.vatBasis || ""} onChange={set("vatBasis")}><option value="">Chưa rõ</option><option value="before_vat">Trước VAT</option><option value="after_vat">Sau VAT</option></Sel></Field>
        <Field label="Trạng thái thực hiện"><Sel value={f.execStatus} onChange={set("execStatus")}>{Object.entries(EXEC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Field>
        <Field label="Nghiệm thu"><Sel value={f.acceptanceStatus} onChange={set("acceptanceStatus")}>{Object.entries(ACC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Field>
        <Field label="Ngày nghiệm thu"><Inp type="date" value={f.acceptanceDate || ""} onChange={set("acceptanceDate")} /></Field>
        <Field label="Thanh lý" hint="Đã thanh lý cần ngày + hồ sơ; không suy từ thanh toán 100%"><Sel value={f.liquidationStatus} onChange={set("liquidationStatus")}>{Object.entries(LIQ_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Field>
        <Field label="Ngày thanh lý"><Inp type="date" value={f.liquidationDate || ""} onChange={set("liquidationDate")} /></Field>
        <Field label="Hồ sơ thanh lý"><Inp value={f.liquidationDoc || ""} onChange={set("liquidationDoc")} /></Field>
        <Field label="Theo dõi thanh toán"><Sel value={f.paymentOwner || ""} onChange={set("paymentOwner")}><option value="">Chưa xác định</option>{Object.entries(PAY_OWNER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Field>
        <Field label="Bảo lãnh thực hiện đến"><Inp type="date" value={f.guaranteeUntil || ""} onChange={set("guaranteeUntil")} /></Field>
        <Field label="Bảo hành đến"><Inp type="date" value={f.warrantyUntil || ""} onChange={set("warrantyUntil")} /></Field>
        <Field label="Việc tiếp theo" span={2}><Inp value={f.nextAction || ""} onChange={set("nextAction")} /></Field>
      </div>
      <Field label="Ghi chú"><TA value={f.note || ""} onChange={set("note")} /></Field>
      {err && <div className="warn-note" role="alert">{err}</div>}
      <DataLists />
    </Modal>
  );
}

function ImportContracts({ onClose }) {
  const { data, me, can } = useApp();
  return <ImportDialog kind="contract" parse={(f) => parseContracts(f, data, me.id)} onClose={onClose}
    buildOps={(items, res) => {
      const used = new Set(items.map((i) => i.rec.contractorId));
      const ctr = (res.newContractors || []).filter((c) => used.has(c.id)).map((c) => ({ table: "contractors", op: "insert", id: c.id, data: { name: c.name, shortName: c.shortName, note: "Nhập từ Excel" } }));
      return [...ctr, ...items.map((i) => ({ table: "contracts", op: "insert", id: genId("hd_"), data: { ...i.rec, staffId: can.manage ? i.rec.staffId : me.id } }))];
    }} />;
}
