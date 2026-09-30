import { useEffect, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, KeyRound, Save } from "lucide-react";
import { useApp, DEMO } from "../lib/store.jsx";
import { api, genId } from "../lib/supabase.js";
import { STAGES, ROLE, staffLabel, byPos } from "../lib/rules.js";
import { Banner, Btn, Badge, Field, Inp, Sel, TA, Modal, DataTable, Empty, askReason, fmtD } from "../components/ui.jsx";

const ReadOnly = ({ who = "quản trị" }) => <div className="note" style={{ marginBottom: 12 }}>Chỉ {who} được thay đổi mục này — anh/chị đang xem ở chế độ chỉ đọc.</div>;

// ------------------------------------------------------------------ Bộ mốc
export function AdminTemplates() {
  const { data, can, write } = useApp();
  const [sel, setSel] = useState(data.workflow_templates[0]?.id || "");
  const [name, setName] = useState("");
  const tpl = data.workflow_templates.find((t) => t.id === sel);
  const ms = data.template_milestones.filter((m) => m.templateId === sel).sort(byPos);
  const ro = !can.admin;
  const upd = (m, patch) => write([{ table: "template_milestones", op: "update", id: m.id, data: patch }], null);
  const move = (m, dir) => { const i = ms.indexOf(m), s = ms[i + dir]; if (s) write([{ table: "template_milestones", op: "update", id: m.id, data: { position: s.position } }, { table: "template_milestones", op: "update", id: s.id, data: { position: m.position } }], null); };
  const add = () => write([{ table: "template_milestones", op: "insert", id: genId("tm_"), data: { templateId: sel, position: (ms[ms.length - 1]?.position || 0) + 1, name: "Mốc mới", offsetDays: (ms[ms.length - 1]?.offsetDays ?? 0) + 3, stage: ms[ms.length - 1]?.stage || "ky_hd", required: true, weight: 1 } }], "Đã thêm mốc");
  const del = async (m) => { if (await askReason(`Xóa mốc “${m.name}” khỏi bộ mốc (gói đã tạo không bị ảnh hưởng)`)) write([{ table: "template_milestones", op: "delete", id: m.id }], "Đã xóa mốc"); };
  const addTpl = async () => { if (!name.trim()) return; const id = genId("tpl_"); if (await write([{ table: "workflow_templates", op: "insert", id, data: { name: name.trim(), isDefault: false, dayMode: "calendar" } }], "Đã tạo bộ mốc")) { setSel(id); setName(""); } };
  const delTpl = async () => {
    if (data.packages.some((p) => p.templateId === sel)) return alert("Đang có gói thầu dùng bộ mốc này — không xóa được.");
    if (await askReason(`Xóa bộ mốc “${tpl.name}”`)) write([{ table: "workflow_templates", op: "delete", id: sel }], "Đã xóa bộ mốc").then(() => setSel(data.workflow_templates[0]?.id || ""));
  };
  return (
    <>
      <Banner icon="01-tender" title="Bộ mốc quy trình" sub="Khung quản lý đề xuất, cấu hình theo loại gói / hình thức lựa chọn — không phải trình tự pháp lý bắt buộc cho mọi gói." />
      {ro && <ReadOnly />}
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="row"><span className="lbl" style={{ margin: 0 }}>Bộ mốc</span>
          <Sel style={{ width: 320 }} value={sel} onChange={(e) => setSel(e.target.value)}>{data.workflow_templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (mặc định)" : ""}</option>)}</Sel></label>
        {!ro && <><Inp style={{ width: 260 }} placeholder="Tên bộ mốc mới" value={name} onChange={(e) => setName(e.target.value)} /><Btn icon={Plus} onClick={addTpl}>Tạo bộ mốc</Btn></>}
      </div>
      {tpl ? (
        <section className="card">
          <div className="form-grid">
            <Field label="Tên bộ mốc"><Inp disabled={ro} defaultValue={tpl.name} key={tpl.id + "n"} onBlur={(e) => e.target.value.trim() && e.target.value !== tpl.name && write([{ table: "workflow_templates", op: "update", id: tpl.id, data: { name: e.target.value.trim() } }])} /></Field>
            <Field label="Hình thức áp dụng"><Inp disabled={ro} defaultValue={tpl.method || ""} key={tpl.id + "m"} onBlur={(e) => e.target.value !== (tpl.method || "") && write([{ table: "workflow_templates", op: "update", id: tpl.id, data: { method: e.target.value } }])} /></Field>
            <Field label="Cách tính khoảng ngày" hint="Ngày làm việc dùng lịch nghỉ ở mục Cấu hình"><Sel disabled={ro} value={tpl.dayMode || "calendar"} onChange={(e) => write([{ table: "workflow_templates", op: "update", id: tpl.id, data: { dayMode: e.target.value } }])}><option value="calendar">Ngày lịch</option><option value="working">Ngày làm việc</option></Sel></Field>
            <Field label="Mặc định khi tạo gói"><Sel disabled={ro} value={tpl.isDefault ? "1" : "0"} onChange={(e) => write(data.workflow_templates.map((t) => ({ table: "workflow_templates", op: "update", id: t.id, data: { isDefault: e.target.value === "1" ? t.id === tpl.id : t.id === tpl.id ? false : t.isDefault } })))}><option value="1">Có</option><option value="0">Không</option></Sel></Field>
          </div>
          <DataTable short rows={ms} rowKey={(m) => m.id} columns={[
            { key: "p", label: "TT", render: (m) => m.position },
            { key: "n", label: "Tên mốc", render: (m) => <Inp disabled={ro} defaultValue={m.name} key={m.id + m.name} style={{ minWidth: 260 }} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && upd(m, { name: e.target.value.trim() })} /> },
            { key: "r", label: "Bắt buộc", render: (m) => <input type="checkbox" disabled={ro} checked={m.required !== false} aria-label={`Mốc ${m.name} bắt buộc`} onChange={(e) => upd(m, { required: e.target.checked })} /> },
            { key: "s", label: "Giai đoạn (Kanban)", render: (m) => <Sel disabled={ro} value={m.stage || ""} onChange={(e) => upd(m, { stage: e.target.value })}><option value="">—</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel> },
            { key: "o", label: "Khoảng ngày từ mốc đầu", render: (m) => <Inp disabled={ro} type="number" style={{ width: 90 }} defaultValue={m.offsetDays ?? ""} key={m.id + "o" + m.offsetDays} onBlur={(e) => String(e.target.value) !== String(m.offsetDays ?? "") && upd(m, { offsetDays: e.target.value === "" ? null : Number(e.target.value) })} /> },
            { key: "w", label: "Trọng số", render: (m) => <Inp disabled={ro} type="number" step="0.5" style={{ width: 70 }} defaultValue={m.weight ?? 1} key={m.id + "w" + m.weight} onBlur={(e) => Number(e.target.value) !== Number(m.weight ?? 1) && upd(m, { weight: Number(e.target.value) || 1 })} /> },
            { key: "a", label: "", render: (m) => !ro && <div className="row" style={{ flexWrap: "nowrap" }}>
              <Btn kind="ghost" sm onClick={() => move(m, -1)} aria-label="Lên"><ArrowUp size={14} /></Btn><Btn kind="ghost" sm onClick={() => move(m, 1)} aria-label="Xuống"><ArrowDown size={14} /></Btn>
              <Btn kind="ghost" sm onClick={() => del(m)} aria-label="Xóa"><Trash2 size={14} /></Btn></div> },
          ]} />
          {!ro && <div className="between" style={{ marginTop: 10 }}><Btn kind="ghost" icon={Plus} onClick={add}>Thêm mốc</Btn><Btn kind="danger" sm onClick={delTpl}>Xóa bộ mốc</Btn></div>}
          <p className="small mut">Mốc để trống khoảng ngày (VD: gia hạn đóng thầu nếu có) sẽ không tự sinh hạn. Trọng số dùng cho “Tiến độ các mốc”; mốc không áp dụng không vào mẫu số. Thay đổi bộ mốc không làm đổi các gói đã tạo.</p>
        </section>
      ) : <Empty title="Chưa có bộ mốc" />}
    </>
  );
}

// ------------------------------------------------------------------ Nhà thầu
export function AdminContractors() {
  const { data, can, write } = useApp();
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const count = (id) => data.contracts.filter((c) => c.contractorId === id).length;
  const rows = data.contractors.filter((c) => !q || `${c.name} ${c.shortName} ${c.taxCode}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => count(b.id) - count(a.id));
  const save = async () => {
    const { id, _new, ...rest } = form;
    const d = { name: rest.name, shortName: rest.shortName, taxCode: rest.taxCode, contact: rest.contact, note: rest.note };
    if (await write([{ table: "contractors", op: _new ? "insert" : "update", id: _new ? genId("nt_") : id, data: d }])) setForm(null);
  };
  const del = async (c) => { if (count(c.id)) return alert("Nhà thầu đang có hợp đồng — không xóa được."); if (await askReason(`Xóa nhà thầu ${c.name}`)) write([{ table: "contractors", op: "delete", id: c.id }], "Đã xóa"); };
  return (
    <>
      <Banner icon="08-responsibility" title="Nhà thầu" sub={`${data.contractors.length} nhà thầu`}>{can.write && <Btn icon={Plus} onClick={() => setForm({ _new: true, name: "" })}>Thêm nhà thầu</Btn>}</Banner>
      {!can.manage && <div className="note" style={{ marginBottom: 12 }}>Cán bộ được thêm nhà thầu mới; sửa/xóa do lãnh đạo hoặc quản trị.</div>}
      <Inp style={{ maxWidth: 360, marginBottom: 12 }} placeholder="Tìm nhà thầu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm nhà thầu" />
      <DataTable rows={rows} columns={[
        { key: "n", label: "Tên nhà thầu", render: (c) => <b>{c.name}</b> }, { key: "s", label: "Tên viết tắt", render: (c) => c.shortName || "—" },
        { key: "t", label: "Mã số thuế", render: (c) => c.taxCode || "—" }, { key: "c", label: "Liên hệ", render: (c) => <span className="small">{c.contact || "—"}</span> },
        { key: "h", label: "Số HĐ", right: true, render: (c) => count(c.id) },
        { key: "a", label: "", render: (c) => can.manage && <div className="row" style={{ flexWrap: "nowrap" }}><Btn kind="ghost" sm onClick={() => setForm({ ...c })}>Sửa</Btn><Btn kind="ghost" sm onClick={() => del(c)} aria-label="Xóa"><Trash2 size={14} /></Btn></div> },
      ]} />
      {form && <Modal title={form._new ? "Thêm nhà thầu" : "Sửa nhà thầu"} onClose={() => setForm(null)} footer={<><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn disabled={!form.name?.trim()} onClick={save}>Lưu</Btn></>}>
        <Field label="Tên nhà thầu *"><Inp value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="form-grid"><Field label="Tên viết tắt"><Inp value={form.shortName || ""} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
          <Field label="Mã số thuế"><Inp value={form.taxCode || ""} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} /></Field></div>
        <Field label="Liên hệ"><Inp value={form.contact || ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <Field label="Ghi chú"><TA value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </Modal>}
    </>
  );
}

// ------------------------------------------------------------------ Cán bộ & phân quyền
export function AdminStaff() {
  const { data, can, write, session, notify, me } = useApp();
  const [form, setForm] = useState(null);
  const [pins, setPins] = useState({});
  useEffect(() => { if (!DEMO) api.pinStatus().then((r) => setPins(Object.fromEntries((r || []).map((x) => [x.staff_id, x.has_pin])))).catch(() => {}); }, [data.staff]);
  const staff = [...data.staff].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const count = (id) => data.packages.filter((p) => p.staffId === id).length + data.contracts.filter((c) => c.staffId === id).length;
  const save = async () => {
    const { id, _new, ...r } = form;
    const d = { fullName: r.fullName.trim(), account: r.account?.trim().toLowerCase() || null, role: r.role, unit: r.unit || null, email: r.email || null, active: r.active !== false, isManager: ["manager", "admin"].includes(r.role), position: Number(r.position) || 0 };
    if (!_new && id === me.id && d.role !== "admin") return notify("Không tự hạ quyền quản trị của chính mình (tránh khóa hệ thống).", "err");
    if (await write([{ table: "staff", op: _new ? "insert" : "update", id: _new ? "st_" + (d.account || genId()) : id, data: d }])) setForm(null);
  };
  const reset = async (s) => {
    const reason = await askReason(`Đặt lại PIN cho ${staffLabel(s)} — cán bộ sẽ tự đặt PIN mới ở lần đăng nhập tới`);
    if (!reason) return;
    try { await api.resetPin(session.token, s.id, reason); notify("Đã đặt lại PIN"); setPins({ ...pins, [s.id]: false }); } catch (e) { notify(e.message, "err"); }
  };
  return (
    <>
      <Banner icon="08-responsibility" title="Cán bộ & phân quyền" sub="Tên hiển thị dễ đọc; mã tài khoản là thông tin phụ.">{can.admin && <Btn icon={Plus} onClick={() => setForm({ _new: true, fullName: "", role: "staff", active: true, position: staff.length + 1 })}>Thêm cán bộ</Btn>}</Banner>
      {!can.admin && <ReadOnly />}
      <section className="card" style={{ marginBottom: 12 }}>
        <b>Quyền theo vai trò</b> (kiểm tra trên máy chủ):
        <ul className="small" style={{ margin: "6px 0 0" }}>
          <li><b>Chỉ xem</b>: xem toàn phòng, không cập nhật.</li>
          <li><b>Cán bộ</b>: xem toàn phòng; tạo & cập nhật hồ sơ mình phụ trách; đề nghị gia hạn; không tự giao hồ sơ cho người khác, không xóa, không đổi hạn khi kế hoạch đã khóa.</li>
          <li><b>Lãnh đạo phòng</b>: cập nhật mọi hồ sơ, phân công, phê duyệt gia hạn/phụ lục, mở khóa kế hoạch, xóa.</li>
          <li><b>Quản trị</b>: như lãnh đạo + bộ mốc, cán bộ, cấu hình, đặt lại PIN.</li>
        </ul>
      </section>
      <DataTable rows={staff} columns={[
        { key: "n", label: "Họ tên", render: (s) => <b>{staffLabel(s)}</b> }, { key: "a", label: "Tài khoản", render: (s) => <span className="small">{s.account || "—"}</span> },
        { key: "r", label: "Vai trò", render: (s) => <Badge tone={s.role === "admin" ? "red" : s.role === "manager" ? "blue" : "gray"}>{ROLE[s.role] || s.role}</Badge> },
        { key: "u", label: "Đơn vị", render: (s) => s.unit || "—" }, { key: "h", label: "Hồ sơ phụ trách", right: true, render: (s) => count(s.id) },
        { key: "p", label: "PIN", render: (s) => (DEMO ? "—" : pins[s.id] ? <Badge tone="green">Đã đặt</Badge> : <Badge tone="amber">Chưa đặt</Badge>) },
        { key: "s", label: "Trạng thái", render: (s) => (s.active === false ? <Badge tone="gray">Ngừng</Badge> : <Badge tone="green">Hoạt động</Badge>) },
        { key: "x", label: "", render: (s) => can.admin && <div className="row" style={{ flexWrap: "nowrap" }}><Btn kind="ghost" sm onClick={() => setForm({ ...s })}>Sửa</Btn>{!DEMO && pins[s.id] && <Btn kind="ghost" sm icon={KeyRound} onClick={() => reset(s)}>Đặt lại PIN</Btn>}</div> },
      ]} />
      {form && <Modal title={form._new ? "Thêm cán bộ" : `Sửa: ${staffLabel(form)}`} onClose={() => setForm(null)} footer={<><Btn kind="ghost" onClick={() => setForm(null)}>Hủy</Btn><Btn disabled={!form.fullName?.trim()} onClick={save}>Lưu</Btn></>}>
        <div className="form-grid">
          <Field label="Họ tên hiển thị *"><Inp value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="VD: Nguyễn Việt Hùng" /></Field>
          <Field label="Mã tài khoản"><Inp value={form.account || ""} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="VD: hungnv71" /></Field>
          <Field label="Vai trò"><Sel value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Field>
          <Field label="Đơn vị"><Inp value={form.unit || ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="Email"><Inp type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Thứ tự"><Inp type="number" value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
        </div>
        <label className="row"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Đang hoạt động (bỏ chọn để ngừng đăng nhập, giữ lịch sử)</label>
      </Modal>}
    </>
  );
}

// ------------------------------------------------------------------ Cấu hình
export function AdminSettings() {
  const { data, can, write, cfg } = useApp();
  const ro = !can.admin;
  const S = Object.fromEntries(data.app_settings.map((s) => [s.key, s.value]));
  const [f, setF] = useState({ org_name: S.org_name ?? cfg.orgName, due_soon_days: S.due_soon_days ?? 7, due_soon_days_long: S.due_soon_days_long ?? 14, contract_expiring_days: S.contract_expiring_days ?? 30, stale_days: S.stale_days ?? 14, payment_module: S.payment_module !== false });
  const [hol, setHol] = useState({ day: "", name: "" });
  const save = async () => {
    const ops = Object.entries(f).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(S[k])).map(([k, v]) => ({ table: "app_settings", op: "update", id: k, data: { value: typeof v === "string" && k !== "org_name" ? Number(v) : v } }));
    if (!ops.length) return;
    const reason = await askReason("Lý do thay đổi cấu hình ngưỡng cảnh báo");
    if (reason) write(ops.map((o) => ({ ...o, reason })), "Đã lưu cấu hình");
  };
  const hols = [...data.holidays].sort((a, b) => a.day.localeCompare(b.day));
  return (
    <>
      <Banner icon="03-deadline" title="Cấu hình" sub="Ngưỡng cảnh báo là cấu hình quản trị đề xuất, không phải thời hạn pháp luật." />
      {ro && <ReadOnly />}
      <div className="grid2">
        <section className="card">
          <div className="card-h"><h2>Tham số chung</h2></div>
          <Field label="Tên đơn vị hiển thị"><Inp disabled={ro} value={f.org_name} onChange={(e) => setF({ ...f, org_name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Đến hạn (LCNT) ≤ N ngày"><Inp disabled={ro} type="number" min={0} value={f.due_soon_days} onChange={(e) => setF({ ...f, due_soon_days: e.target.value })} /></Field>
            <Field label="Sắp tới (Việc của tôi) ≤ N ngày"><Inp disabled={ro} type="number" min={0} value={f.due_soon_days_long} onChange={(e) => setF({ ...f, due_soon_days_long: e.target.value })} /></Field>
            <Field label="HĐ sắp hết hạn ≤ N ngày"><Inp disabled={ro} type="number" min={0} value={f.contract_expiring_days} onChange={(e) => setF({ ...f, contract_expiring_days: e.target.value })} /></Field>
            <Field label="Lâu chưa cập nhật > N ngày"><Inp disabled={ro} type="number" min={0} value={f.stale_days} onChange={(e) => setF({ ...f, stale_days: e.target.value })} /></Field>
          </div>
          <label className="row"><input type="checkbox" disabled={ro} checked={f.payment_module} onChange={(e) => setF({ ...f, payment_module: e.target.checked })} /> Bật mô-đun thanh toán (chỉ áp dụng HĐ do P.QLHT theo dõi)</label>
          {!ro && <div style={{ marginTop: 12 }}><Btn icon={Save} onClick={save}>Lưu cấu hình</Btn></div>}
        </section>
        <section className="card">
          <div className="card-h"><h2>Lịch nghỉ (ngày làm việc)</h2></div>
          <p className="small mut" style={{ marginTop: 0 }}>Dùng khi bộ mốc tính theo ngày làm việc. Hệ thống đã bỏ T7, CN; các ngày lễ/Tết/nghỉ bù phải khai báo ở đây.</p>
          {!ro && <div className="row" style={{ marginBottom: 10 }}>
            <Inp type="date" style={{ width: 170 }} value={hol.day} onChange={(e) => setHol({ ...hol, day: e.target.value })} aria-label="Ngày nghỉ" />
            <Inp style={{ width: 220 }} placeholder="Tên ngày nghỉ" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} aria-label="Tên ngày nghỉ" />
            <Btn icon={Plus} disabled={!hol.day || hols.some((h) => h.day === hol.day)} onClick={() => write([{ table: "holidays", op: "insert", id: genId("hol_"), data: hol }], "Đã thêm ngày nghỉ").then(() => setHol({ day: "", name: "" }))}>Thêm</Btn>
          </div>}
          {hols.length ? <DataTable short rows={hols} columns={[{ key: "d", label: "Ngày", render: (h) => fmtD(h.day) }, { key: "n", label: "Tên", render: (h) => h.name || "—" },
            { key: "x", label: "", render: (h) => !ro && <Btn kind="ghost" sm onClick={() => write([{ table: "holidays", op: "delete", id: h.id }], "Đã xóa")} aria-label="Xóa ngày nghỉ"><Trash2 size={14} /></Btn> }]} /> : <div className="note">Chưa khai báo ngày nghỉ.</div>}
        </section>
      </div>
    </>
  );
}
