import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadAll, reloadTable, subscribeAll, toApp, api, AppError } from "./supabase.js";
import { todayVN, isISODate } from "./dates.js";
import { DEFAULT_CFG, buildPackageRows, buildContractRows, buildAlerts, rank } from "./rules.js";
import { makeDemo, applyDemoOps } from "./demo.js";
import { buildTaskRows, taskAlerts } from "./tasks.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const DEMO = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
const SKEY = DEMO ? "dh_session_demo" : "dh_session";
const FKEY = "dh_filters_v2";
export const EMPTY_FILTERS = { scope: "all", staff: "", contractor: "", category: "", year: "", status: "", q: "" };

const safeGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

// Trạng thái hợp nhất cho bộ lọc chung
const STATUS_MAP = {
  overdue: { p: ["overdue"], c: ["overdue"], t: ["overdue"] },
  due: { p: ["due_today", "due_soon"], c: ["due_today", "due_soon"], t: ["due_today", "due_soon"] },
  on_track: { p: ["on_track"], c: ["on_track"], t: ["on_track"] },
  no_due: { p: ["no_due", "no_milestones"], c: ["no_due", "review"], t: ["no_due"] },
  done: { p: ["completed"], c: ["done", "done_late", "done_nodate"], t: ["done", "done_late", "done_nodate"] },
  inactive: { p: ["paused", "cancelled"], c: ["cancelled", "terminated"], t: ["cancelled"] },
};
export { STATUS_OPTIONS } from "./rules.js";

export function applyFilters(rows, f, meId) {
  const q = norm(f.q);
  return rows.filter((r) => {
    if (f.scope === "mine" && r.staffId !== meId) return false;
    if (f.staff && (f.staff === "__none" ? r.staffId : r.staffId !== f.staff)) return false;
    if (r.kind === "task") {
      if (f.status) { const m = STATUS_MAP[f.status]; if (m && !m.t.includes(r.ev.code)) return false; }
      if (q && !norm([r.code, r.name, r.staffName, r.type, r.rec.sourceDoc, r.rec.collaborators].join(" ")).includes(q)) return false;
      return true;
    }
    if (f.category && r.category !== f.category) return false;
    if (f.year && String(r.year) !== String(f.year)) return false;
    if (f.contractor) {
      if (r.kind === "contract" && r.contractorId !== f.contractor) return false;
      if (r.kind === "package" && !r.contracts.some((c) => c.contractorId === f.contractor)) return false;
    }
    if (f.status) {
      const m = STATUS_MAP[f.status];
      const code = r.kind === "package" ? r.ev.code : r.progress.code;
      if (m && !(r.kind === "package" ? m.p : m.c).includes(code) && !(f.status === "inactive" && r.kind === "contract" && r.rec.execStatus === "paused")) return false;
    }
    if (q) {
      const hay = norm([r.code, r.no, r.name, r.staffName, r.contractorName, r.rec?.packageName].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function settingsToCfg(settings, holidays) {
  const s = Object.fromEntries((settings || []).map((x) => [x.key, x.value]));
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    ...DEFAULT_CFG,
    orgName: s.org_name || "Phòng Quản lý hạ tầng - B.QLDAHTVT",
    dueSoonDays: n(s.due_soon_days, 7), dueSoonLong: n(s.due_soon_days_long, 14),
    contractSoonDays: n(s.contract_expiring_days, 30), staleDays: n(s.stale_days, 14),
    paymentModule: s.payment_module !== false, taskSoonDays: n(s.task_soon_days, 3), appUrl: s.app_url || "",
    holidays: new Set((holidays || []).map((h) => h.day)),
  };
}

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ state: "loading" });
  const [session, setSessionState] = useState(() => safeGet(SKEY, null));
  const [reportDate, setReportDateState] = useState(todayVN());
  const [filters, setFiltersState] = useState(() => ({ ...EMPTY_FILTERS, ...safeGet(FKEY, {}) }));
  const [route, setRoute] = useState(() => parseHash());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const setSession = useCallback((s) => { safeSet(SKEY, s); setSessionState(s); }, []);
  const setFilters = useCallback((patch) => setFiltersState((f) => { const n = typeof patch === "function" ? patch(f) : { ...f, ...patch }; safeSet(FKEY, n); return n; }), []);
  const setReportDate = useCallback((d) => { if (isISODate(d)) setReportDateState(d); }, []);
  const notify = useCallback((msg, tone = "ok") => {
    setToast({ msg, tone }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), tone === "err" ? 7000 : 3500);
  }, []);

  // ---- tải dữ liệu + realtime
  const load = useCallback(async () => {
    setStatus({ state: "loading" });
    if (DEMO) { setData(makeDemo(todayVN())); setStatus({ state: "ready" }); return; }
    try { setData(await loadAll()); setStatus({ state: "ready" }); }
    catch (e) { setStatus({ state: e.kind === "MIGRATION" ? "migration" : "error", message: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (DEMO || status.state !== "ready") return;
    return subscribeAll((table, p) => setData((d) => {
      if (!d) return d;
      const key = table === "app_settings" ? "key" : "id";
      const arr = d[table] || [];
      if (p.eventType === "DELETE") return { ...d, [table]: arr.filter((x) => x[key] !== p.old[key]) };
      const r = toApp(p.new);
      const i = arr.findIndex((x) => x[key] === r[key]);
      return { ...d, [table]: i >= 0 ? arr.map((x, j) => (j === i ? r : x)) : [...arr, r] };
    }));
  }, [status.state]);

  // ---- kiểm tra phiên với server
  useEffect(() => {
    if (DEMO || !session?.token) return;
    api.whoami(session.token).catch((e) => { if (e.kind === "AUTH") setSession(null); });
  }, [session?.token, setSession]);

  // ---- điều hướng (nút Back của trình duyệt hoạt động)
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((page, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
    window.location.hash = `/${page}${qs ? "?" + qs : ""}`;
  }, []);

  const cfg = useMemo(() => settingsToCfg(data?.app_settings, data?.holidays), [data?.app_settings, data?.holidays]);
  const me = data?.staff.find((s) => s.id === session?.staffId && s.active !== false) || null;
  const role = me?.role || "viewer";

  // ---- ghi dữ liệu (luôn qua server; server kiểm tra quyền lần cuối)
  const write = useCallback(async (ops, okMsg = "Đã lưu") => {
    if (!ops.length) return true;
    try {
      if (DEMO) setData((d) => applyDemoOps(d, ops));
      else {
        if (!session?.token) throw new AppError("AUTH:Vui lòng đăng nhập để cập nhật");
        await api.write(session.token, ops);
        const tables = [...new Set(ops.map((o) => o.table))];
        const fresh = await Promise.all(tables.map(reloadTable));
        setData((d) => ({ ...d, ...Object.fromEntries(tables.map((t, i) => [t, fresh[i]])) }));
      }
      if (okMsg) notify(okMsg);
      return true;
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError(e.message);
      if (err.kind === "AUTH") setSession(null);
      notify(err.message, "err");
      return false;
    }
  }, [session?.token, notify, setSession]);

  // ---- dòng đánh giá dùng chung cho mọi màn hình
  const allPkgRows = useMemo(() => (data ? buildPackageRows(data, reportDate, cfg) : []), [data, reportDate, cfg]);
  const allHdRows = useMemo(() => (data ? buildContractRows(data, reportDate, cfg) : []), [data, reportDate, cfg]);
  const pkgRows = useMemo(() => applyFilters(allPkgRows, filters, me?.id), [allPkgRows, filters, me?.id]);
  const hdRows = useMemo(() => applyFilters(allHdRows, filters, me?.id), [allHdRows, filters, me?.id]);
  const allTaskRows = useMemo(() => (data ? buildTaskRows(data, allPkgRows, reportDate, cfg) : []), [data, allPkgRows, reportDate, cfg]);
  const taskRows = useMemo(() => applyFilters(allTaskRows, filters, me?.id), [allTaskRows, filters, me?.id]);
  const alerts = useMemo(() => {
    const a = buildAlerts(pkgRows, hdRows, reportDate, cfg), t = taskAlerts(taskRows, reportDate, cfg);
    const SEV = { overdue: 0, due_today: 1, due_soon: 2 };
    const action = [...a.action, ...t.action].sort((x, y) => (SEV[x.kind] ?? 4) - (SEV[y.kind] ?? 4) || (x.days ?? 999) - (y.days ?? 999));
    return { action, data: [...a.data, ...t.data] };
  }, [pkgRows, hdRows, taskRows, reportDate, cfg]);

  const can = useMemo(() => ({
    edit: (ownerId) => rank(role) >= 2 || (rank(role) >= 1 && !!me && ownerId === me.id),
    manage: rank(role) >= 2, admin: rank(role) >= 3, write: rank(role) >= 1,
  }), [role, me]);

  const value = {
    DEMO, data, setData, status, reload: load, session, setSession, me, role, can, cfg,
    reportDate, setReportDate, today: todayVN(), filters, setFilters, route, go, toast, notify, write,
    allPkgRows, allHdRows, pkgRows, hdRows, alerts, allTaskRows, taskRows,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function parseHash() {
  const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#\/?/, "");
  const [page, qs] = h.split("?");
  return { page: page || "dashboard", params: Object.fromEntries(new URLSearchParams(qs || "")) };
}
