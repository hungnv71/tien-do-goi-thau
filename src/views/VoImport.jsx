import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useApp } from "../lib/store.jsx";
import { genId } from "../lib/supabase.js";
import { fmtDate } from "../lib/dates.js";
import { staffLabel } from "../lib/rules.js";
import { matchVoRows, voMissing, VO_STATUS_IN } from "../lib/tasks.js";
import { parseVoffice } from "../lib/excel.js";
import { Btn, Badge, Modal, Empty, fmtD } from "../components/ui.jsx";

/**
 * Nhập file "Báo cáo thực hiện nhiệm vụ đơn vị" xuất từ Voffice:
 * - Khớp theo ID VO (lần sau) hoặc theo tên (lần đầu) — 1 việc VO có thể đã tách cho nhiều cán bộ.
 * - Việc VO chưa có trên web => tạo nhiệm vụ "Chưa giao" để TP / quản trị giao.
 * - Hạn trên VO khác hạn web (VO đã gia hạn chính thức) => tùy chọn cập nhật hạn, ghi lý do & lịch sử.
 */
export function VoImport({ onClose, onDone }) {
  const { data, write, today } = useApp();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [act, setAct] = useState({});
  const [sync, setSync] = useState({});
  const [busy, setBusy] = useState(false);
  const staffName = (id) => staffLabel(data.staff.find((s) => s.id === id));

  const onFile = async (file) => {
    setErr(""); setRes(null);
    try {
      const p = await parseVoffice(file);
      const matches = matchVoRows(p.rows, data.tasks || []);
      const a = {}, sy = {};
      for (const m of matches) {
        a[m.vo.voId] = m.links.length ? "link" : "new";
        for (const l of m.links) if (m.vo.due && l.task.dueDate !== m.vo.due && !["done", "cancelled"].includes(l.task.status))
          sy[l.task.id] = !l.task.dueDate || (m.vo.extCount || 0) > (l.task.voExtCount || 0);
      }
      setAct(a); setSync(sy);
      setRes({ ...p, matches, missing: voMissing(p.rows, data.tasks || []) });
    } catch (e) { setErr(e.message); }
  };

  const plan = useMemo(() => {
    if (!res) return null;
    const out = { link: [], create: [], skip: 0, due: 0 };
    for (const m of res.matches) {
      const a = act[m.vo.voId];
      if (a === "skip") { out.skip++; continue; }
      if (a === "new") { out.create.push(m.vo); continue; }
      const tasks = a === "link" ? m.links.map((l) => l.task) : [(data.tasks || []).find((t) => t.id === a.slice(5))].filter(Boolean);
      for (const t of tasks) { out.link.push({ vo: m.vo, task: t }); if (sync[t.id] && m.vo.due && t.dueDate !== m.vo.due) out.due++; }
    }
    return out;
  }, [res, act, sync, data.tasks]);

  const commit = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const ops = [];
    const voFields = (v) => ({ voId: v.voId, voStatus: [v.status, v.level].filter(Boolean).join(" · ") || null, voDue: v.due, voExtCount: v.extCount || 0, voSyncedAt: now });
    for (const { vo, task } of plan.link) {
      const d = voFields(vo);
      let reason = null;
      if (sync[task.id] && vo.due && task.dueDate !== vo.due) {
        d.dueDate = vo.due;
        if (!task.originalDue) d.originalDue = vo.due;
        if (task.dueDate) reason = `Đồng bộ hạn từ Voffice (ID ${vo.voId}${vo.extCount ? `, gia hạn ${vo.extCount} lần` : ""})`;
      }
      ops.push({ table: "tasks", op: "update", id: task.id, data: d, reason });
    }
    const yy = today.slice(2, 4);
    let seq = (data.tasks || []).map((t) => (t.code || "").match(new RegExp(`^NV${yy}-(\\d+)$`))).filter(Boolean).reduce((a, m) => Math.max(a, Number(m[1])), 0);
    for (const v of plan.create) {
      seq++;
      ops.push({ table: "tasks", op: "insert", id: genId("nv_"), data: {
        code: `NV${yy}-${String(seq).padStart(4, "0")}`, title: v.title, taskType: "VO", sourceDoc: v.source || null, assigner: v.assigner || null,
        output: v.target || null, note: v.content ? v.content.slice(0, 2000) : null, resultTotal: v.result || null, difficulty: v.difficulty || null, proposal: v.proposal || null,
        assignedDate: v.start, dueDate: v.due, originalDue: v.due, dueLocked: true, status: VO_STATUS_IN[(v.status || "").toLowerCase()] || "not_started", percent: 0,
        staffId: null, source: `Nhập từ Voffice ${fmtDate(today)}`, ...voFields(v) } });
    }
    const ok = await write(ops, `Đã đồng bộ Voffice: ${plan.link.length} NV cập nhật, ${plan.create.length} NV mới đưa vào “Chưa giao”${plan.due ? `, ${plan.due} hạn theo VO` : ""}`);
    setBusy(false);
    if (ok) { onClose(); if (plan.create.length) onDone?.(); }
  };

  return (
    <Modal size="wide" title="Nhập / đồng bộ nhiệm vụ từ Voffice" sub="File “Báo cáo thực hiện nhiệm vụ đơn vị” (.xls/.xlsx) xuất từ Voffice — xem trước, chọn xử lý từng dòng rồi mới ghi."
      onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn>{plan && <Btn disabled={busy || (!plan.link.length && !plan.create.length)} onClick={commit}>{busy ? "Đang ghi…" : `Ghi: ${plan.link.length} cập nhật · ${plan.create.length} mới (chưa giao)`}</Btn>}</>}>
      <label className="btn ghost" style={{ display: "inline-flex", gap: 6, cursor: "pointer", marginBottom: 10 }}>
        <Upload size={16} aria-hidden /> Chọn file Voffice
        <input type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      </label>
      {err && <div className="warn-note" role="alert">{err}</div>}
      {!res && !err && <div className="note">Khớp tự động: lần đầu theo <b>tên nhiệm vụ</b> (giống ≥ 60%), các lần sau theo <b>ID Voffice</b>. Việc VO chưa có trên web được tạo ở mục <b>Chưa giao</b> để Trưởng phòng / quản trị giao. Hạn trên Voffice khác hạn web chỉ cập nhật khi anh/chị chọn (ghi lý do “Đồng bộ hạn từ Voffice”).</div>}
      {res && <>
        <div className="row" style={{ marginBottom: 8 }}>
          <Badge tone="blue">{res.rows.length} việc trên VO{res.meta.date ? ` (chốt ${fmtDate(res.meta.date)})` : ""}</Badge>
          <Badge tone="green">{res.matches.filter((m) => m.links.length).length} đã khớp</Badge>
          <Badge tone="amber">{res.matches.filter((m) => !m.links.length).length} chưa có trên web</Badge>
          {res.errors.length > 0 && <Badge tone="red">{res.errors.length} dòng lỗi</Badge>}
        </div>
        <div className="tbl-wrap" style={{ maxHeight: "55vh" }}><table className="tbl">
          <thead><tr><th>ID VO</th><th>Nhiệm vụ trên Voffice</th><th>Hạn VO</th><th>Trạng thái VO</th><th>Khớp trên web</th><th>Xử lý</th></tr></thead>
          <tbody>{res.matches.map((m) => {
            const v = m.vo, a = act[v.voId];
            return (
              <tr key={v.voId} className={!m.links.length ? "hl" : ""}>
                <td className="code nowrap">{v.voId}</td>
                <td style={{ maxWidth: 360 }}><div className="small b wrap2" title={v.title}>{v.title}</div>{v.source && <div className="small mut wrap2">{v.source}</div>}</td>
                <td className="nowrap num small">{fmtD(v.due)}{v.extCount ? <div><Badge tone="amber">Gia hạn {v.extCount} lần</Badge></div> : null}</td>
                <td className="small">{v.status}{v.level && <div className={/chậm/i.test(v.level) ? "tone-red" : "mut"}>{v.level}</div>}</td>
                <td className="small" style={{ minWidth: 240 }}>
                  {m.links.length ? m.links.map(({ task: t, score }) => (
                    <div key={t.id} style={{ marginBottom: 4 }}>
                      <b className="code">{t.code}</b> · {staffName(t.staffId)} · hạn {fmtD(t.dueDate)} {m.kind === "id" ? <Badge tone="green">đúng ID</Badge> : <span className="mut">({Math.round(score * 100)}%)</span>}
                      {a === "link" && v.due && t.dueDate !== v.due && !["done", "cancelled"].includes(t.status) && (
                        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={!!sync[t.id]} onChange={(e) => setSync({ ...sync, [t.id]: e.target.checked })} /> Cập nhật hạn theo VO: {fmtD(t.dueDate)} → <b>{fmtD(v.due)}</b></label>)}
                    </div>)) : m.candidates.length ? <span className="mut">Có thể giống: {m.candidates.map((c) => `${c.task.code} (${Math.round(c.score * 100)}%)`).join(", ")}</span> : <span className="mut">Chưa có</span>}
                </td>
                <td>
                  <select className="sel" style={{ minWidth: 190 }} value={a} onChange={(e) => setAct({ ...act, [v.voId]: e.target.value })} aria-label={`Xử lý việc VO ${v.voId}`}>
                    {m.links.length > 0 && <option value="link">Gắn & cập nhật ({m.links.length} NV)</option>}
                    {m.candidates.map((c) => <option key={c.task.id} value={`cand:${c.task.id}`}>Gắn với {c.task.code} ({Math.round(c.score * 100)}%)</option>)}
                    <option value="new">Tạo mới → Chưa giao</option>
                    <option value="skip">Bỏ qua</option>
                  </select>
                </td>
              </tr>);
          })}</tbody>
        </table></div>
        {res.errors.length > 0 && <div className="warn-note" style={{ marginTop: 8 }}>{res.errors.map((e) => `Dòng ${e.line}: ${e.msg}`).join(" · ")}</div>}
        {res.missing.length > 0 && <div className="note" style={{ marginTop: 8 }}>
          <b>{res.missing.length} nhiệm vụ đã gắn VO nhưng không còn trong file “chưa đóng”</b> (có thể đã đóng trên Voffice — hệ thống không tự đóng, cán bộ/TP kiểm tra rồi chuyển Hoàn thành): {res.missing.map((t) => `${t.code} (${staffName(t.staffId)})`).join(", ")}
        </div>}
        {!res.rows.length && <Empty title="Không có dòng nào" />}
      </>}
    </Modal>
  );
}
