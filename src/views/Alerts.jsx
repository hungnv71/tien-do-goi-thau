import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { ALERT_LABEL, staffLabel, MODULE_PAGE } from "../lib/rules.js";
import { addDays, weekday, fmtDate } from "../lib/dates.js";
import { Banner, Btn, Badge, Sel, Empty, DataTable, fmtD } from "../components/ui.jsx";
import FilterBar, { PastDateNote } from "../components/FilterBar.jsx";
import { ActionTable } from "./Dashboard.jsx";
import { exportWorkbook } from "../lib/excel.js";

export default function Alerts() {
  const { alerts, pkgRows, hdRows, data, go, reportDate, cfg, filters, me, route } = useApp();
  const [tab, setTab] = useState("action");
  const [mod, setMod] = useState(route.params.m || "");
  const [kind, setKind] = useState("");
  const [waiting, setWaiting] = useState("");
  const inMod = (x) => !mod || x.module === mod;
  const endWeek = addDays(reportDate, (7 - weekday(reportDate)) % 7);
  const action = alerts.action.filter(inMod).filter((a) => !kind || a.kind === kind);
  const dataAl = alerts.data.filter(inMod).filter((a) => !kind || a.kind === kind);
  const week = alerts.action.filter(inMod).filter((a) => a.kind === "overdue" || (a.due && a.due <= endWeek && a.due >= reportDate));
  const awaitSign = pkgRows.filter((r) => r.ev.stage === "ky_hd" && r.ev.code !== "completed" && r.ev.code !== "cancelled");
  const guarantee = alerts.action.filter((a) => a.kind === "guarantee_soon");
  const ids = new Set([...pkgRows, ...hdRows].map((r) => r.id));
  const issues = useMemo(() => data.issues.filter((i) => i.status !== "resolved" && ids.has(i.entityId)), [data.issues, pkgRows, hdRows]); // eslint-disable-line
  const waitOpts = [...new Set(issues.map((i) => i.waitingOn).filter(Boolean))];
  const issueRows = issues.filter((i) => !waiting || i.waitingOn === waiting);
  const open = (a) => go(MODULE_PAGE[a.module], { open: a.recordId });
  const kinds = [...new Set((tab === "data" ? alerts.data : alerts.action).map((a) => a.kind))];
  const recName = (i) => { const r = [...pkgRows, ...hdRows].find((x) => x.id === i.entityId); return r ? `${r.no || r.code || ""} ${r.name}` : i.entityId; };
  const TABS = [["action", "Việc cần xử lý", action.length], ["week", "Tuần này", week.length], ["issues", "Vướng mắc · chờ ai xử lý", issues.length], ["sign", "Hồ sơ chờ ký", awaitSign.length], ["guar", "Bảo lãnh / bảo hành", guarantee.length], ["data", "Cảnh báo dữ liệu", dataAl.length]];
  return (
    <>
      <Banner icon="03-deadline" title="Cảnh báo" sub={<>Quá hạn trước, rồi đến hạn hôm nay và sắp đến hạn · ngưỡng {cfg.dueSoonDays}/{cfg.dueSoonLong}/{cfg.contractSoonDays} ngày (cấu hình quản trị) · Ngày dữ liệu {fmtDate(reportDate)}</>}>
        <Btn kind="ghost" icon={Download} onClick={() => exportWorkbook({ data, pkgRows, hdRows, alerts, reportDate, cfg, filters, me })}>Xuất Excel</Btn>
      </Banner>
      <FilterBar />
      <PastDateNote />
      <div className="tabs" role="tablist">{TABS.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setKind(""); }}>{l} ({n})</button>)}</div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="row small">Phân hệ <Sel style={{ width: 180 }} value={mod} onChange={(e) => setMod(e.target.value)}><option value="">Tất cả</option><option value="lcnt">Lựa chọn nhà thầu</option><option value="hd">Hợp đồng</option><option value="nv">Nhiệm vụ phòng</option></Sel></label>
        {(tab === "action" || tab === "data") && <label className="row small">Loại <Sel style={{ width: 220 }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả</option>{kinds.map((k) => <option key={k} value={k}>{ALERT_LABEL[k]}</option>)}</Sel></label>}
        {tab === "issues" && <label className="row small">Chờ ai xử lý <Sel style={{ width: 220 }} value={waiting} onChange={(e) => setWaiting(e.target.value)}><option value="">Tất cả</option>{waitOpts.map((w) => <option key={w}>{w}</option>)}</Sel></label>}
      </div>
      {tab === "action" && (action.length ? <ActionTable items={action} onOpen={open} showModule /> : <Empty icon="07-closeout" title="Không có việc cần xử lý" />)}
      {tab === "week" && (week.length ? <ActionTable items={week} onOpen={open} showModule /> : <Empty icon="07-closeout" title={`Không có việc đến hạn đến CN ${fmtDate(endWeek)}`} />)}
      {tab === "data" && (dataAl.length ? <ActionTable items={dataAl.map((a) => ({ ...a, days: a.days ?? null }))} onOpen={open} showModule /> : <Empty icon="07-closeout" title="Dữ liệu đầy đủ" />)}
      {tab === "guar" && (guarantee.length ? <ActionTable items={guarantee} onOpen={open} showModule /> : <Empty icon="04-extension" title="Không có bảo lãnh / bảo hành sắp hết hạn">Chỉ tính HĐ đã nhập ngày bảo lãnh/bảo hành.</Empty>)}
      {tab === "sign" && (awaitSign.length ? <DataTable rows={awaitSign} columns={[
        { key: "c", label: "Mã gói", render: (r) => <span className="code">{r.code || "—"}</span> },
        { key: "n", label: "Tên gói", render: (r) => <button className="linkbtn" onClick={() => go("lcnt", { open: r.id })}>{r.name}</button> },
        { key: "s", label: "Cán bộ", render: (r) => r.staffName }, { key: "d", label: "Hạn ký HĐ", render: (r) => fmtD(r.ev.current?.plannedDate) },
        { key: "h", label: "HĐ đã ký", render: (r) => r.contracts.length },
      ]} /> : <Empty icon="02-contract" title="Không có hồ sơ đang chờ ký hợp đồng" />)}
      {tab === "issues" && (issueRows.length ? <DataTable rows={issueRows} columns={[
        { key: "r", label: "Hồ sơ", render: (i) => <button className="linkbtn wrap2" style={{ maxWidth: 300 }} onClick={() => go(i.entity === "contract" ? "hop-dong" : "lcnt", { open: i.entityId })}>{recName(i)}</button> },
        { key: "c", label: "Vướng mắc", render: (i) => <div style={{ maxWidth: 300 }}>{i.content}</div> },
        { key: "w", label: "Chờ ai xử lý", render: (i) => <b>{i.waitingOn || "—"}</b> },
        { key: "o", label: "Chịu trách nhiệm", render: (i) => staffLabel(data.staff.find((s) => s.id === i.ownerStaffId)) },
        { key: "p", label: "Phương án", render: (i) => <div className="small" style={{ maxWidth: 240 }}>{i.plan || "—"}</div> },
        { key: "d", label: "Hạn cam kết", render: (i) => i.commitDue && i.commitDue < reportDate ? <Badge tone="red">{fmtD(i.commitDue)} · quá hạn</Badge> : fmtD(i.commitDue) },
      ]} /> : <Empty icon="08-responsibility" title="Không có vướng mắc đang mở" />)}
    </>
  );
}
