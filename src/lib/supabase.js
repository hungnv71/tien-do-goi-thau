import { createClient } from "@supabase/supabase-js";

// Khóa anon được thiết kế để công khai; bảo vệ thật nằm ở RLS + hàm app_write_batch trên server.
const SUPABASE_URL = "https://kcbwbeaqymoarzjuzvct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYndiZWFxeW1vYXJ6anV6dmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjkwMTAsImV4cCI6MjA5MTk0NTAxMH0.yn6jGGmVTONEa-hieqU0A5OfdswP5U06rmtVIYmaAeg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Thứ tự: bảng cha trước bảng con
export const TABLES = [
  "app_settings", "holidays", "staff", "workflow_templates", "template_milestones", "contractors",
  "packages", "package_milestones", "contracts", "contract_extensions", "contract_amendments",
  "contract_milestones", "contract_acceptances", "contract_payments", "issues",
];

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const snake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
export const toApp = (r) => { const o = {}; for (const k in r) o[camel(k)] = r[k]; return o; };
export const toRow = (o) => { const r = {}; for (const k in o) r[snake(k)] = o[k] === "" ? null : o[k]; return r; };

export const genId = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Lỗi từ server dạng "AUTH:..." | "PERM:..." | "VALID:..." | "NOTFOUND:..." */
export class AppError extends Error {
  constructor(raw) {
    const s = String(raw?.message || raw || "Lỗi không xác định");
    const m = s.match(/^(AUTH|PERM|VALID|NOTFOUND):(.*)$/s);
    super(m ? m[2].trim() : s);
    this.kind = m ? m[1] : "ERR";
  }
}

async function fetchTable(table) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + page - 1);
    if (error) { const e = new Error(error.message); e.code = error.code; e.table = table; throw e; }
    out.push(...data.map(toApp));
    if (data.length < page) break;
  }
  return out;
}

/** Tải toàn bộ dữ liệu. Nếu chưa chạy migration v2 => lỗi kind MIGRATION. */
export async function loadAll() {
  try {
    const res = await Promise.all(TABLES.map(fetchTable));
    return Object.fromEntries(TABLES.map((t, i) => [t, res[i]]));
  } catch (e) {
    if (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message)) {
      const err = new Error(`Chưa có bảng "${e.table}". Cần chạy migration supabase/01_v2_schema.sql.`);
      err.kind = "MIGRATION";
      throw err;
    }
    throw e;
  }
}
export const reloadTable = fetchTable;

export function subscribeAll(onChange) {
  const ch = supabase.channel("dieu-hanh-rt");
  TABLES.forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) => onChange(table, p)));
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new AppError(error.message);
  return data;
}
export const api = {
  login: (staffId, pin) => rpc("app_login", { p_staff_id: staffId, p_pin: pin }),
  setupPin: (staffId, pin) => rpc("app_setup_pin", { p_staff_id: staffId, p_new_pin: pin }),
  whoami: (token) => rpc("app_whoami", { p_token: token }),
  logout: (token) => rpc("app_logout", { p_token: token }),
  changePin: (token, oldPin, newPin) => rpc("app_change_pin", { p_token: token, p_old: oldPin, p_new: newPin }),
  resetPin: (token, staffId, reason) => rpc("app_reset_pin", { p_token: token, p_staff_id: staffId, p_reason: reason }),
  pinStatus: () => rpc("app_pin_status", {}),
  /** ops: [{table, op:'insert'|'update'|'delete', id, data (camelCase), reason}] */
  write: (token, ops) => rpc("app_write_batch", {
    p_token: token,
    p_ops: ops.map((o) => ({ table: o.table, op: o.op, id: o.id, reason: o.reason || null, data: o.data ? toRow(o.data) : {} })),
  }),
  history: async (entity, ids) => {
    const { data, error } = await supabase.from("change_log").select("*").in("entity_id", ids).order("at", { ascending: false }).limit(300);
    if (error) throw new AppError(error.message);
    return data.map(toApp);
  },
};
