import { useState, useMemo } from "react";
import {
  LayoutDashboard, FileSearch, FileSignature, ClipboardList, Bell, BarChart3, ListChecks, Building2, ShieldCheck, Settings, LogOut, KeyRound,
} from "lucide-react";
import { AppProvider, useApp, DEMO } from "./lib/store.jsx";
import { api } from "./lib/supabase.js";
import { ROLE, staffLabel } from "./lib/rules.js";
import { Btn, Field, Inp, Sel, Modal, Toast, ReasonHost, Loading, ErrorBox, Icon3D, NoPerm } from "./components/ui.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Tenders from "./views/Tenders.jsx";
import Contracts from "./views/Contracts.jsx";
import MyWork from "./views/MyWork.jsx";
import Alerts from "./views/Alerts.jsx";
import Reports from "./views/Reports.jsx";
import { AdminTemplates, AdminContractors, AdminStaff, AdminSettings } from "./views/Admin.jsx";

export default function App() {
  return <AppProvider><Shell /><Toast /><ReasonHost /></AppProvider>;
}

const NAV = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "lcnt", label: "Lựa chọn nhà thầu", icon: FileSearch },
  { id: "hop-dong", label: "Hợp đồng đã ký", icon: FileSignature },
  { id: "viec-cua-toi", label: "Việc của tôi", icon: ClipboardList, count: "mine" },
  { id: "canh-bao", label: "Cảnh báo", icon: Bell, count: "alerts" },
  { id: "bao-cao", label: "Báo cáo", icon: BarChart3 },
];
const ADMIN = [
  { id: "bo-moc", label: "Bộ mốc quy trình", icon: ListChecks },
  { id: "nha-thau", label: "Nhà thầu", icon: Building2 },
  { id: "can-bo", label: "Cán bộ & phân quyền", icon: ShieldCheck },
  { id: "cau-hinh", label: "Cấu hình", icon: Settings },
];

function Shell() {
  const { status, reload, data, me, session, route, go, alerts, cfg, setSession, role } = useApp();
  const [pinOpen, setPinOpen] = useState(false);
  const myCount = useMemo(() => (me ? alerts.action.filter((a) => a.staffId === me.id && ["overdue", "due_today", "due_soon"].includes(a.kind)).length : 0), [alerts, me]);

  if (status.state === "loading" && !data) return <div className="center-page"><Loading /></div>;
  if (status.state === "migration") return <div className="center-page"><div className="card" style={{ maxWidth: 640 }}><ErrorBox title="CSDL chưa được nâng cấp" onRetry={reload}>
    {status.message} Chạy lần lượt <b>supabase/01_v2_schema.sql</b> và <b>02_import_hd_2024_2026.sql</b> trong Supabase → SQL Editor, rồi bấm Thử lại. Có thể xem thử giao diện bằng <a href="?demo=1">chế độ minh họa</a>.
  </ErrorBox></div></div>;
  if (status.state === "error") return <div className="center-page"><div className="card" style={{ maxWidth: 640 }}><ErrorBox onRetry={reload}>{status.message}</ErrorBox></div></div>;
  if (!me) return <Login />;

  const page = route.page;
  const adminPage = ADMIN.some((a) => a.id === page);
  const logout = async () => { if (!DEMO && session?.token) api.logout(session.token).catch(() => {}); setSession(null); };

  return (
    <div className="app">
      <aside className="side" aria-label="Điều hướng">
        <div className="brand"><div className="brand-mark" aria-hidden>ĐH</div><div><b>Điều hành gói thầu<br />& hợp đồng</b><span>{cfg.orgName}</span></div></div>
        <nav className="nav">
          {NAV.map((n) => {
            const c = n.count === "alerts" ? alerts.action.filter((a) => ["overdue", "due_today"].includes(a.kind)).length : n.count === "mine" ? myCount : 0;
            return (
              <button key={n.id} className={page === n.id ? "on" : ""} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
                <n.icon size={18} aria-hidden /> {n.label}{c > 0 && <span className="cnt" aria-label={`${c} việc cần xử lý`}>{c}</span>}
              </button>
            );
          })}
          <div className="nav-h">Quản trị</div>
          {ADMIN.map((n) => (
            <button key={n.id} className={page === n.id ? "on" : ""} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
              <n.icon size={18} aria-hidden /> {n.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <span>Đang đăng nhập</span>
          <b>{staffLabel(me)}</b>
          <span className="small">{me.account ? `${me.account} · ` : ""}{ROLE[role] || role}</span>
          <div className="row" style={{ marginTop: 8 }}>
            {!DEMO && <button onClick={() => setPinOpen(true)}><KeyRound size={13} aria-hidden />Đổi PIN</button>}
            <button onClick={logout}><LogOut size={13} aria-hidden />Đăng xuất</button>
          </div>
        </div>
      </aside>
      <main className="main" id="main">
        {DEMO && <div className="demo-flag" style={{ marginBottom: 10 }}>DỮ LIỆU MINH HỌA — chỉ để xem thử giao diện, mọi thay đổi chỉ nằm trong trình duyệt, không ghi vào dữ liệu thật.</div>}
        {page === "dashboard" && <Dashboard />}
        {page === "lcnt" && <Tenders />}
        {page === "hop-dong" && <Contracts />}
        {page === "viec-cua-toi" && <MyWork />}
        {page === "canh-bao" && <Alerts />}
        {page === "bao-cao" && <Reports />}
        {page === "bo-moc" && <AdminTemplates />}
        {page === "nha-thau" && <AdminContractors />}
        {page === "can-bo" && <AdminStaff />}
        {page === "cau-hinh" && <AdminSettings />}
        {![...NAV, ...ADMIN].some((n) => n.id === page) && <NoPerm>Không tìm thấy trang “{page}”.</NoPerm>}
        {adminPage && null}
      </main>
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
    </div>
  );
}

function Login() {
  const { data, setSession, notify, cfg } = useApp();
  const staff = data.staff.filter((s) => s.active !== false).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const [sid, setSid] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [mode, setMode] = useState("login"); // login | setup
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (!sid) return setErr("Chọn tên cán bộ.");
    if (DEMO) { setSession({ staffId: sid, token: "demo" }); return; }
    if (!/^\d{4,8}$/.test(pin)) return setErr("PIN gồm 4–8 chữ số.");
    if (mode === "setup" && pin !== pin2) return setErr("Hai lần nhập PIN không khớp.");
    setBusy(true);
    try {
      const r = mode === "setup" ? await api.setupPin(sid, pin) : await api.login(sid, pin);
      if (r?.need_setup) { setMode("setup"); setPin(""); setErr("Tài khoản chưa có PIN — hãy tự đặt PIN (4–8 số) và nhớ kỹ. Quản trị có thể đặt lại nếu quên."); }
      else if (r?.error) setErr(r.error);
      else if (r?.token) { setSession({ staffId: r.staff_id, token: r.token }); notify("Đăng nhập thành công"); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="center-page">
      <form className="card" style={{ width: 420, padding: 26 }} onSubmit={submit} aria-labelledby="login-h">
        <div className="row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
          <Icon3D name="08-responsibility" size={64} />
          <div><h1 id="login-h" style={{ fontSize: 22, margin: 0 }}>Điều hành gói thầu & hợp đồng</h1><div className="small mut">{cfg.orgName}</div></div>
        </div>
        {DEMO && <div className="demo-flag" style={{ margin: "8px 0" }}>Chế độ minh họa: chọn vai trò bất kỳ, không cần PIN.</div>}
        <Field label="Cán bộ">
          <Sel value={sid} onChange={(e) => { setSid(e.target.value); setMode("login"); setErr(""); }} autoFocus>
            <option value="">— Chọn tên —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}{s.account ? ` (${s.account})` : ""} · {ROLE[s.role] || s.role}</option>)}
          </Sel>
        </Field>
        {!DEMO && <Field label={mode === "setup" ? "Đặt PIN mới (4–8 chữ số)" : "Mã PIN"}>
          <Inp className="inp pin-input" type="password" inputMode="numeric" autoComplete={mode === "setup" ? "new-password" : "current-password"} maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </Field>}
        {!DEMO && mode === "setup" && <Field label="Nhập lại PIN">
          <Inp className="inp pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
        </Field>}
        {err && <div className="warn-note" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
        <Btn type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Đang kiểm tra…" : mode === "setup" ? "Đặt PIN & vào" : "Đăng nhập"}</Btn>
        <p className="small mut" style={{ marginBottom: 0 }}>Quyền được kiểm tra trên máy chủ theo PIN phiên đăng nhập. Nhập sai 5 lần sẽ tạm khóa 15 phút.</p>
      </form>
    </div>
  );
}

function ChangePin({ onClose }) {
  const { session, notify } = useApp();
  const [o, setO] = useState(""); const [n, setN] = useState(""); const [n2, setN2] = useState(""); const [err, setErr] = useState("");
  const save = async () => {
    if (!/^\d{4,8}$/.test(n)) return setErr("PIN gồm 4–8 chữ số.");
    if (n !== n2) return setErr("Hai lần nhập không khớp.");
    try { await api.changePin(session.token, o, n); notify("Đã đổi PIN"); onClose(); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Đổi mã PIN" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Hủy</Btn><Btn onClick={save}>Lưu</Btn></>}>
      <Field label="PIN hiện tại"><Inp type="password" inputMode="numeric" value={o} onChange={(e) => setO(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="PIN mới"><Inp type="password" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="Nhập lại PIN mới"><Inp type="password" inputMode="numeric" value={n2} onChange={(e) => setN2(e.target.value.replace(/\D/g, ""))} /></Field>
      {err && <div className="warn-note" role="alert">{err}</div>}
    </Modal>
  );
}
