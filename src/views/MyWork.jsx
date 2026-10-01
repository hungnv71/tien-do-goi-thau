import { useMemo } from "react";
import { useApp } from "../lib/store.jsx";
import { buildAlerts, ROLE, MODULE_PAGE } from "../lib/rules.js";
import { addDays, diffDays, weekday, fmtDate } from "../lib/dates.js";
import { Banner, Empty, NoPerm, Badge } from "../components/ui.jsx";
import { ActionTable } from "./Dashboard.jsx";
import { PastDateNote } from "../components/FilterBar.jsx";
import { taskAlerts, OPEN } from "../lib/tasks.js";
import { Btn } from "../components/ui.jsx";

/** Việc của tôi: chỉ hồ sơ do tôi phụ trách / vướng mắc tôi chịu trách nhiệm. Quyền sửa kiểm tra trên server. */
export default function MyWork() {
  const { me, role, can, allPkgRows, allHdRows, allTaskRows, reportDate, cfg, go, data } = useApp();
  const mine = useMemo(() => {
    const p = allPkgRows.filter((r) => r.staffId === me.id), h = allHdRows.filter((r) => r.staffId === me.id);
    const t = allTaskRows.filter((r) => r.staffId === me.id && !r.virtual);
    return { p, h, t, tOpen: t.filter((r) => OPEN(r.ev.code)), alerts: buildAlerts(p, h, reportDate, cfg), ta: taskAlerts(t, reportDate, cfg) };
  }, [allPkgRows, allHdRows, allTaskRows, me.id, reportDate, cfg]);
  if (role === "viewer") return <NoPerm>Tài khoản “Chỉ xem” không được giao hồ sơ. Liên hệ quản trị để được phân quyền cán bộ.</NoPerm>;

  const endWeek = addDays(reportDate, (7 - weekday(reportDate)) % 7); // đến Chủ nhật
  const a = mine.alerts.action;
  const overdue = a.filter((x) => x.kind === "overdue");
  const week = a.filter((x) => ["due_today", "due_soon"].includes(x.kind) && x.due && x.due <= endWeek);
  const later = [...mine.p.filter((r) => r.ev.current?.plannedDate && !["completed", "cancelled"].includes(r.ev.code)).map((r) => ({ module: "lcnt", recordId: r.id, code: r.code || "—", title: r.name, task: r.ev.current.name, staffName: r.staffName, due: r.ev.current.plannedDate, days: diffDays(reportDate, r.ev.current.plannedDate), kind: "due_soon", next: r.ev.nextAction, issue: r.issues[0]?.content || "" })),
    ...mine.h.filter((r) => r.active && r.due.currentDue).map((r) => ({ module: "hd", recordId: r.id, code: r.no, title: r.name, task: "Hoàn thành thực hiện HĐ", staffName: r.staffName, due: r.due.currentDue, days: diffDays(reportDate, r.due.currentDue), kind: "due_soon", next: r.nextAction, issue: r.issues[0]?.content || "" }))]
    .filter((x) => x.due > endWeek && x.days <= cfg.dueSoonLong).sort((x, y) => x.days - y.days);
  const other = a.filter((x) => ["pending_ext", "review", "await_liq", "guarantee_soon"].includes(x.kind));
  const myIssues = data.issues.filter((i) => i.ownerStaffId === me.id && i.status !== "resolved");
  const dataAlerts = [...mine.alerts.data, ...mine.ta.data];
  const taskApprovals = can.manage ? allTaskRows.filter((r) => !r.virtual && r.ev.pendingExt && OPEN(r.ev.code)).map((r) => ({ module: "nv", recordId: r.id, code: r.code, title: r.name, task: `Duyệt gia hạn nhiệm vụ → ${fmtDate(r.rec.extRequestedDue)}`, staffName: r.staffName, due: r.rec.extRequestedDue, days: null, kind: "pending_ext", next: r.rec.extReason || "", issue: "" })) : [];
  const approvals = taskApprovals.concat(can.manage ? allHdRows.flatMap((r) => r.due.proposed.map((e) => ({ module: "hd", recordId: r.id, code: r.no, title: r.name, task: `Duyệt gia hạn lần ${e.seq ?? ""}: → ${fmtDate(e.dueAfter)}`, staffName: r.staffName, due: e.dueAfter, days: null, kind: "pending_ext", next: e.reason || "", issue: "" }))) : []);
  const open = (x) => go(MODULE_PAGE[x.module], { open: x.recordId });
  const Sec = ({ title, items, tone, empty }) => (
    <section className="card" style={{ marginBottom: 14 }}>
      <div className="card-h"><h2>{title} <Badge tone={items.length ? tone : "gray"}>{items.length}</Badge></h2></div>
      {items.length ? <ActionTable items={items} onOpen={open} showModule /> : <div className="note">{empty}</div>}
    </section>
  );
  return (
    <>
      <Banner icon="08-responsibility" title="Việc của tôi" sub={<>{me.fullName} · {ROLE[role]} · {mine.p.length} gói LCNT, {mine.h.length} HĐ, {mine.tOpen.length} nhiệm vụ đang mở · Ngày dữ liệu {fmtDate(reportDate)}</>} />
      <PastDateNote />
      <div className="note" style={{ marginBottom: 14 }}>Chỉ hiện hồ sơ anh/chị phụ trách. Cán bộ chỉ cập nhật được hồ sơ của mình; lãnh đạo phòng cập nhật và phê duyệt toàn phòng — quyền được kiểm tra trên máy chủ, không chỉ ẩn nút.</div>
      {!mine.p.length && !mine.h.length && !mine.t.length && !myIssues.length && !approvals.length ? <Empty icon="08-responsibility" title="Chưa có hồ sơ nào được giao" /> : (
        <>
          {approvals.length > 0 && <Sec title="Chờ tôi phê duyệt" items={approvals} tone="blue" empty="" />}
          <section className="card" style={{ marginBottom: 14 }}>
            <div className="card-h"><h2>Nhiệm vụ phòng của tôi <Badge tone={mine.ta.action.some((x) => x.kind === "overdue") ? "red" : mine.ta.action.length ? "amber" : "gray"}>{mine.ta.action.length} cần xử lý / {mine.tOpen.length} đang mở</Badge></h2>
              <div className="row"><Btn kind="ghost" sm onClick={() => go("nhiem-vu", { tab: "ds" })}>Danh sách</Btn><Btn sm onClick={() => go("nhiem-vu", { tab: "tuan" })}>Cập nhật tuần</Btn></div></div>
            {mine.ta.action.length ? <ActionTable items={mine.ta.action} onOpen={open} /> : <div className="note">Không có nhiệm vụ quá hạn hoặc sắp đến hạn.</div>}
          </section>
          <Sec title="Quá hạn (gói thầu / hợp đồng)" items={overdue} tone="red" empty="Không có việc quá hạn." />
          <Sec title={`Tuần này (đến CN ${fmtDate(endWeek)})`} items={week} tone="amber" empty="Không có việc đến hạn trong tuần." />
          <Sec title={`Sắp tới (≤ ${cfg.dueSoonLong} ngày)`} items={later} tone="green" empty="Không có." />
          <Sec title="Gia hạn / thanh lý / bảo lãnh" items={other} tone="amber" empty="Không có." />
          <Sec title="Cảnh báo dữ liệu (thiếu hạn, lâu chưa cập nhật…)" items={dataAlerts} tone="gray" empty="Dữ liệu đầy đủ." />
          <section className="card"><div className="card-h"><h2>Vướng mắc tôi chịu trách nhiệm <Badge tone={myIssues.length ? "amber" : "gray"}>{myIssues.length}</Badge></h2></div>
            {myIssues.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{myIssues.map((i) => (
              <li key={i.id} style={{ marginBottom: 6 }}><b>{i.content}</b> <span className="small mut">· chờ: {i.waitingOn || "—"} · hạn cam kết {fmtDate(i.commitDue) || "—"}</span>{" "}
                <button className="linkbtn small" onClick={() => go(i.entity === "contract" ? "hop-dong" : "lcnt", { open: i.entityId })}>Mở hồ sơ</button></li>))}</ul> : <div className="note">Không có.</div>}
          </section>
        </>
      )}
    </>
  );
}
