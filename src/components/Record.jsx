import { useEffect, useState } from "react";
import { Plus, Check, Upload, Download, X } from "lucide-react";
import { useApp, DEMO } from "../lib/store.jsx";
import { api, genId } from "../lib/supabase.js";
import { staffLabel, KPI_BY_KEY } from "../lib/rules.js";
import { Btn, Field, Inp, Sel, TA, Badge, fmtD, Empty, Modal, Loading, DataTable } from "./ui.jsx";
import { downloadTemplate } from "../lib/excel.js";

/** Vướng mắc: người chịu trách nhiệm, chờ ai xử lý, đơn vị phối hợp, phương án, hạn cam kết. */
export function IssuesPanel({ entity, entityId, ownerId }) {
  const { data, write, can, reportDate, me } = useApp();
  const list = data.issues.filter((i) => i.entity === entity && i.entityId === entityId).sort((a, b) => (a.status === "resolved") - (b.status === "resolved"));
  const [form, setForm] = useState(null);
  const editable = can.edit(ownerId);
  const save = async () => {
    if (!form.content?.trim()) return;
    const { id, ...rest } = form;
    const ok = await write([{ table: "issues", op: id ? "update" : "insert", id: id || genId("vm_"), data: { ...rest, entity, entityId } }]);
    if (ok) setForm(null);
  };
  const resolve = (i) => write([{ table: "issues", op: "update", id: i.id, data: { status: "resolved", resolvedAt: reportDate } }], "Đã đóng vướng mắc");
  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="small mut">Mỗi vướng mắc có người chịu trách nhiệm, bên đang chờ xử lý, phương án và hạn cam kết tiếp theo.</span>
        {editable && <Btn sm icon={Plus} onClick={() => setForm({ ownerStaffId: ownerId || me?.id || "", status: "open" })}>Thêm vướng mắc</Btn>}
      </div>
      {!list.length ? <Empty icon="08-responsibility" title="Chưa có vướng mắc" /> : (
        <DataTable short rows={list} columns={[
          { key: "c", label: "Nội dung", render: (i) => <div style={{ maxWidth: 320 }}>{i.content}</div> },
          { key: "o", label: "Chịu trách nhiệm", render: (i) => staffLabel(data.staff.find((s) => s.id === i.ownerStaffId)) },
          { key: "w", label: "Chờ ai xử lý", render: (i) => i.waitingOn || "—" },
          { key: "u", label: "Đơn vị phối hợp", render: (i) => i.coordUnit || "—" },
          { key: "p", label: "Phương án", render: (i) => <div style={{ maxWidth: 240 }}>{i.plan || "—"}</div> },
          { key: "d", label: "Hạn cam kết", render: (i) => <span className={i.status !== "resolved" && i.commitDue && i.commitDue < reportDate ? "tone-red b" : ""}>{fmtD(i.commitDue)}</span> },
          { key: "s", label: "Trạng thái", render: (i) => (i.status === "resolved" ? <Badge tone="green">Đã xử lý {fmtD(i.resolvedAt)}</Badge> : i.commitDue && i.commitDue < reportDate ? <Badge tone="red">Quá hạn cam kết</Badge> : <Badge tone="amber">Đang mở</Badge>) },
          { key: "a", label: "", render: (i) => (can.edit(ownerId) || i.ownerStaffId === me?.id) && i.status !== "resolved" && (
            <div className="row" style={{ flexWrap: "nowrap" }}><Btn kind="ghost" sm onClick={() => setForm(i)}>Sửa</Btn><Btn kind="ghost" sm icon={Check} onClick={() => resolve(i)}>Đã xử lý</Btn></div>) },
        ]} />
      )}
      {form && (
        <Modal title={form.id ? "Sửa vướng mắc" : "Thêm vướng mắc"} onClose={() => setForm(null)} footer={<><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn onClick={save} disabled={!form.content?.trim()}>Lưu</Btn></>}>
          <Field label="Nội dung vướng mắc *"><TA value={form.content || ""} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Người chịu trách nhiệm"><Sel value={form.ownerStaffId || ""} onChange={(e) => setForm({ ...form, ownerStaffId: e.target.value })}><option value="">—</option>{data.staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}</Sel></Field>
            <Field label="Đang chờ ai / đơn vị nào xử lý"><Inp value={form.waitingOn || ""} onChange={(e) => setForm({ ...form, waitingOn: e.target.value })} placeholder="VD: Phòng Thẩm định" /></Field>
            <Field label="Đơn vị cần phối hợp"><Inp value={form.coordUnit || ""} onChange={(e) => setForm({ ...form, coordUnit: e.target.value })} /></Field>
            <Field label="Hạn cam kết tiếp theo"><Inp type="date" value={form.commitDue || ""} onChange={(e) => setForm({ ...form, commitDue: e.target.value })} /></Field>
          </div>
          <Field label="Phương án xử lý"><TA value={form.plan || ""} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}

const FIELD_VI = {
  planned_date: "Hạn hiện hành", actual_date: "Hoàn thành thực tế", baseline_date: "KH ban đầu", actual_start: "Bắt đầu thực tế", applicable: "Áp dụng",
  status: "Trạng thái", staff_id: "Cán bộ", original_due: "Hạn ban đầu", sign_value: "Giá trị ký", exec_status: "Trạng thái thực hiện",
  liquidation_status: "Thanh lý", acceptance_status: "Nghiệm thu", actual_completion_date: "Ngày hoàn thành", next_action: "Việc tiếp theo",
  plan_locked: "Khóa kế hoạch", "*": "Bản ghi", value: "Giá trị", due_after: "Hạn sau", delta_value: "Giá trị điều chỉnh", doc_number: "Số văn bản",
  delay_reason: "Nguyên nhân chậm", target_sign_date: "Mục tiêu ký HĐ", package_value: "Giá gói", payment_owner: "Theo dõi thanh toán", amount: "Số tiền",
};
/** Lịch sử: người sửa, thời gian, trước/sau, lý do. */
export function HistoryPanel({ ids }) {
  const { data } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const key = ids.join(",");
  useEffect(() => {
    if (DEMO) { setRows([]); return; }
    let live = true;
    api.history(null, ids).then((r) => live && setRows(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [key]); // eslint-disable-line
  if (err) return <div className="warn-note">{err}</div>;
  if (!rows) return <Loading text="Đang tải lịch sử…" />;
  if (!rows.length) return <Empty icon="06-progress" title="Chưa có lịch sử thay đổi">{DEMO ? "Chế độ minh họa không lưu lịch sử." : "Lịch sử được ghi từ khi nâng cấp lên phiên bản có phân quyền."}</Empty>;
  const dt = (t) => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
  return (
    <DataTable short rows={rows} columns={[
      { key: "t", label: "Thời gian", render: (r) => <span className="nowrap small">{dt(r.at)}</span> },
      { key: "u", label: "Người sửa", render: (r) => staffLabel(data.staff.find((s) => s.id === r.staffId)) },
      { key: "e", label: "Đối tượng", render: (r) => <span className="small">{r.entity}</span> },
      { key: "f", label: "Trường", render: (r) => FIELD_VI[r.field] || r.field },
      { key: "o", label: "Trước", render: (r) => <span className="small">{r.field === "*" ? "" : r.oldValue ?? "—"}</span> },
      { key: "n", label: "Sau", render: (r) => <span className="small">{r.newValue ?? "—"}</span> },
      { key: "r", label: "Lý do", render: (r) => <span className="small">{r.reason || ""}</span> },
    ]} />
  );
}

/** Nhập Excel: chọn file → xem trước (lỗi theo dòng, trùng) → xác nhận mới ghi. */
export function ImportDialog({ kind, parse, buildOps, onClose }) {
  const { write } = useApp();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [skipDup, setSkipDup] = useState(true);
  const onFile = async (f) => { setErr(""); setRes(null); try { setRes(await parse(f)); } catch (e) { setErr(e.message); } };
  const ok = res ? res.items.filter((i) => !i.errs.length && !(skipDup && i.dup)) : [];
  const commit = async () => {
    setBusy(true);
    const done = await write(buildOps(ok, res), `Đã nhập ${ok.length} ${kind === "contract" ? "hợp đồng" : "gói thầu"}`);
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal size="wide" title={`Nhập ${kind === "contract" ? "hợp đồng" : "gói thầu"} từ Excel`} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Đóng</Btn><Btn disabled={!ok.length || busy} onClick={commit}>{busy ? "Đang ghi…" : `Xác nhận nhập ${ok.length} dòng`}</Btn></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Btn kind="ghost" icon={Download} onClick={() => downloadTemplate(kind)}>Tải file mẫu</Btn>
        <label className="btn"><Upload size={16} aria-hidden />Chọn file Excel…<input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></label>
        <label className="row small"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> Bỏ qua dòng trùng với dữ liệu đã có (khuyến nghị)</label>
      </div>
      {kind === "contract" && <div className="note" style={{ marginBottom: 10 }}>Đọc được file “Báo cáo các HĐ 2024-2026” (sheet DS GÓI THẦU). Trùng được xác định theo Số HĐ trong cùng đơn vị. Không tự suy ngày bắt đầu từ ngày ký.</div>}
      {err && <div className="warn-note" role="alert">{err}</div>}
      {res && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <Badge tone="green">{ok.length} dòng sẽ nhập</Badge>
            <Badge tone="red">{res.items.filter((i) => i.errs.length).length} dòng lỗi</Badge>
            <Badge tone="amber">{res.items.filter((i) => i.dup).length} dòng trùng</Badge>
            {res.newContractors?.length > 0 && <Badge tone="blue">{res.newContractors.length} nhà thầu mới</Badge>}
          </div>
          <DataTable rows={res.items} rowKey={(i) => i.line} hl={(i) => i.errs.length > 0} columns={[
            { key: "l", label: "Dòng", render: (i) => i.line },
            { key: "k", label: kind === "contract" ? "Số HĐ" : "Mã gói", render: (i) => <span className="code">{i.rec.contractNo || i.rec.code || "—"}</span> },
            { key: "n", label: "Tên", render: (i) => <div className="wrap2" style={{ maxWidth: 360 }}>{i.rec.name}</div> },
            { key: "s", label: "Cán bộ", render: (i) => i.staffLabel || "—" },
            { key: "r", label: "Kết quả kiểm tra", render: (i) => i.errs.length ? <span className="tone-red small">Lỗi: {i.errs.join("; ")}</span>
              : i.dup ? <span className="tone-amber small">Trùng dữ liệu đã có{skipDup ? " — bỏ qua" : " — sẽ báo lỗi khi ghi"}</span>
              : <span className="tone-green small">Hợp lệ{i.warn.length ? ` · Lưu ý: ${i.warn.join("; ")}` : ""}</span> },
          ]} />
        </>
      )}
    </Modal>
  );
}

export function KpiChip({ kpi, onClear, cfg }) {
  const k = KPI_BY_KEY[kpi];
  if (!k) return null;
  return <span className="chip">Chỉ tiêu: {k.label.replace("N ngày", `${k.key === "hd_expiring" ? cfg.contractSoonDays : cfg.dueSoonDays} ngày`)}<button onClick={onClear} aria-label="Bỏ lọc chỉ tiêu"><X size={14} /></button></span>;
}
