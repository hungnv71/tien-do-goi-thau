import { createClient } from "@supabase/supabase-js";

// ============================================================
//  DÁN 2 GIÁ TRỊ CỦA ANH VÀO ĐÂY
//  Supabase Dashboard > Project Settings > Data API / API Keys
// ============================================================
const SUPABASE_URL = "https://kcbwbeaqymoarzjuzvct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYndiZWFxeW1vYXJ6anV6dmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjkwMTAsImV4cCI6MjA5MTk0NTAxMH0.yn6jGGmVTONEa-hieqU0A5OfdswP5U06rmtVIYmaAeg";
// ============================================================

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const isConfigured = !SUPABASE_URL.includes("YOUR-PROJECT");

export const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- mappers: DB snake_case <-> app camelCase ----
const staffToApp = (r) => ({ id: r.id, code: r.code, fullName: r.full_name, isManager: r.is_manager, position: r.position });
const staffToRow = (t) => ({ id: t.id, code: t.code, full_name: t.fullName, is_manager: t.isManager, position: t.position ?? 0 });

const tplToApp = (r) => ({ id: r.id, name: r.name, isDefault: r.is_default });
const tplToRow = (t) => ({ id: t.id, name: t.name, is_default: t.isDefault ?? false });

const tmToApp = (r) => ({ id: r.id, templateId: r.template_id, position: r.position, name: r.name });
const tmToRow = (t) => ({ id: t.id, template_id: t.templateId, position: t.position, name: t.name });

const pkgToApp = (r) => ({ id: r.id, staffId: r.staff_id, templateId: r.template_id, name: r.name, note: r.note });
const pkgToRow = (t) => ({ id: t.id, staff_id: t.staffId, template_id: t.templateId, name: t.name, note: t.note ?? null });

const pmToApp = (r) => ({ id: r.id, packageId: r.package_id, position: r.position, name: r.name,
  docNumber: r.doc_number, plannedDate: r.planned_date, actualDate: r.actual_date, note: r.note });
const pmToRow = (t) => ({ id: t.id, package_id: t.packageId, position: t.position, name: t.name,
  doc_number: t.docNumber ?? null, planned_date: t.plannedDate || null, actual_date: t.actualDate || null, note: t.note ?? null });

export const MAPPERS = {
  staff: { toApp: staffToApp, toRow: staffToRow },
  workflow_templates: { toApp: tplToApp, toRow: tplToRow },
  template_milestones: { toApp: tmToApp, toRow: tmToRow },
  packages: { toApp: pkgToApp, toRow: pkgToRow },
  package_milestones: { toApp: pmToApp, toRow: pmToRow },
};

export const TABLE_ORDER = ["staff", "workflow_templates", "template_milestones", "packages", "package_milestones"];

export async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data.map(MAPPERS[table].toApp);
}
export async function insertRow(table, o) {
  const { error } = await supabase.from(table).insert(MAPPERS[table].toRow(o));
  if (error) throw error;
}
export async function insertRows(table, arr) {
  if (!arr.length) return;
  const { error } = await supabase.from(table).insert(arr.map(MAPPERS[table].toRow));
  if (error) throw error;
}
export async function updateRow(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
