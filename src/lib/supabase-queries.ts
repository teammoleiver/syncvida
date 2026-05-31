import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { emitSync } from "./sync-events";

// ── Helpers ──
const today = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
};


const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── User Profile (legacy table — kept for API key storage) ──
export async function getUserProfile() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("user_profile").select("*").eq("user_id", uid).limit(1).maybeSingle();
  if (error && error.code !== "PGRST116") console.error("getUserProfile", error);
  // Cast as any: legacy callers reference removed `openai_api_key` field; those code paths
  // now gracefully no-op (the field is intentionally not stored in the DB).
  return data as any;
}

export async function updateUserProfile(updates: Record<string, any>) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  // Strip any attempt to write secrets that are no longer columns
  const { openai_api_key: _omit, ...safeUpdates } = updates as Record<string, any>;
  const profile = await getUserProfile();
  if (!profile) {
    // Create if not exists
    const { data, error } = await supabase.from("user_profile").insert({ ...safeUpdates, user_id: uid } as any).select().single();
    if (error) console.error("createUserProfile", error);
    return data;
  }
  const { data, error } = await supabase.from("user_profile").update(safeUpdates as any).eq("id", profile.id).select().single();
  if (error) console.error("updateUserProfile", error);
  return data;
}

// ── Profiles (new auth-linked table) ──
export async function getProfile() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles" as any).select("*").eq("user_id", uid).single();
  if (error) console.error("getProfile", error);
  return data;
}

export async function updateProfile(updates: Record<string, any>) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles" as any).update({ ...updates, updated_at: new Date().toISOString() }).eq("user_id", uid).select().single();
  if (error) console.error("updateProfile", error);
  return data;
}

// ── Water Logs ──
export async function getTodayWaterLog() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("water_logs").select("*").eq("user_id", uid).eq("logged_date", today()).maybeSingle();
  if (error) console.error("getTodayWaterLog", error);
  return data;
}

export async function upsertWaterLog(glasses: number, mlTotal?: number) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const ml = mlTotal ?? glasses * 250;
  const existing = await getTodayWaterLog();
  if (existing) {
    const { data, error } = await supabase
      .from("water_logs")
      .update({ glasses, ml_total: ml })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) console.error("upsertWaterLog update", error);
    if (data) emitSync("water:updated");
    return data;
  }
  const { data, error } = await supabase
    .from("water_logs")
    .insert({ glasses, ml_total: ml, logged_date: today(), user_id: uid } as any)
    .select()
    .single();
  if (error) console.error("upsertWaterLog insert", error);
  if (data) emitSync("water:updated");
  return data;
}

export async function getWaterHistory(limit = 30) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("water_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_date", { ascending: false })
    .limit(limit);
  if (error) console.error("getWaterHistory", error);
  return data ?? [];
}

// ── Weight Logs ──
export async function getWeightHistory() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("weight_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_at", { ascending: true });
  if (error) console.error("getWeightHistory", error);
  return data ?? [];
}

export async function getLatestWeight() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("weight_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("getLatestWeight", error);
  return data;
}

export async function logWeight(weightKg: number, options?: { waist_cm?: number; notes?: string; body_fat_pct?: number }, loggedAt?: string) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const profile = await getProfile();
  const heightM = (profile as any)?.height_cm ? (profile as any).height_cm / 100 : 1.71;
  const bmi = parseFloat((weightKg / (heightM * heightM)).toFixed(1));
  const { data, error } = await supabase
    .from("weight_logs")
    .insert({ weight_kg: weightKg, bmi, ...options, ...(loggedAt ? { logged_at: loggedAt } : {}), user_id: uid } as any)
    .select()
    .single();
  if (error) console.error("logWeight", error);
  if (data) emitSync("weight:logged");
  return data;
}

// ── Exercise Logs ──
export async function logExercise(entry: TablesInsert<"exercise_logs">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("exercise_logs").insert({ ...entry, user_id: uid } as any).select().single();
  if (error) console.error("logExercise", error);
  if (data) {
    await upsertChecklist({ exercise_done: true });
    emitSync("exercise:logged");
  }
  return data;
}

export async function getTodayExercise() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("exercise_logs")
    .select("*")
    .eq("user_id", uid)
    .gte("logged_at", today() + "T00:00:00")
    .lte("logged_at", today() + "T23:59:59")
    .limit(1)
    .maybeSingle();
  if (error) console.error("getTodayExercise", error);
  return data;
}

export async function getMonthExerciseLogs() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("exercise_logs")
    .select("*")
    .eq("user_id", uid)
    .gte("logged_at", startOfMonth())
    .order("logged_at", { ascending: false });
  if (error) console.error("getMonthExerciseLogs", error);
  return data ?? [];
}

export async function getAllExerciseLogs(limit = 90) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("exercise_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) console.error("getAllExerciseLogs", error);
  return data ?? [];
}

// ── Meal Logs ──
export async function logMeal(entry: TablesInsert<"meal_logs">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("meal_logs").insert({ ...entry, user_id: uid } as any).select().single();
  if (error) console.error("logMeal", error);
  if (data) emitSync("meal:logged");
  return data;
}

export async function getTodayMeals() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("user_id", uid)
    .gte("logged_at", today() + "T00:00:00")
    .lte("logged_at", today() + "T23:59:59")
    .order("logged_at", { ascending: true });
  if (error) console.error("getTodayMeals", error);
  return data ?? [];
}

export async function getAllMealLogs(limit = 90) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) console.error("getAllMealLogs", error);
  return data ?? [];
}

// ── Daily Checklist ──
export async function getTodayChecklist() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("daily_checklist")
    .select("*")
    .eq("user_id", uid)
    .eq("checklist_date", today())
    .maybeSingle();
  if (error) console.error("getTodayChecklist", error);
  return data;
}

export async function upsertChecklist(updates: Partial<TablesUpdate<"daily_checklist">>) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const existing = await getTodayChecklist();
  if (existing) {
    const { data, error } = await supabase
      .from("daily_checklist")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) console.error("upsertChecklist update", error);
    if (data) emitSync("checklist:updated");
    return data;
  }
  const { data, error } = await supabase
    .from("daily_checklist")
    .insert({ checklist_date: today(), ...updates, updated_at: new Date().toISOString(), user_id: uid } as any)
    .select()
    .single();
  if (error) console.error("upsertChecklist insert", error);
  if (data) emitSync("checklist:updated");
  return data;
}

// ── Fasting Logs ──
export async function getFastingLogs(limit = 30) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("fasting_logs")
    .select("*")
    .eq("user_id", uid)
    .order("logged_date", { ascending: false })
    .limit(limit);
  if (error) console.error("getFastingLogs", error);
  return data ?? [];
}

// ── Fasting 5:2 Schedule ──
export function getWeekStartDate(d = new Date()) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split("T")[0];
}

export async function getFasting52Schedule(weekStart?: string) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const ws = weekStart ?? getWeekStartDate();
  const { data, error } = await supabase
    .from("fasting_52_schedule")
    .select("*")
    .eq("user_id", uid)
    .eq("week_start_date", ws)
    .maybeSingle();
  if (error) console.error("getFasting52Schedule", error);
  return data;
}

export async function upsertFasting52Schedule(schedule: TablesInsert<"fasting_52_schedule">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const existing = await getFasting52Schedule(schedule.week_start_date);
  if (existing) {
    const { data, error } = await supabase
      .from("fasting_52_schedule")
      .update(schedule)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) console.error("upsertFasting52Schedule", error);
    return data;
  }
  const { data, error } = await supabase
    .from("fasting_52_schedule")
    .insert({ ...schedule, user_id: uid } as any)
    .select()
    .single();
  if (error) console.error("upsertFasting52Schedule insert", error);
  return data;
}

// ── AI Chat History ──
export async function getChatHistory(limit = 50) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("ai_chat_history")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) console.error("getChatHistory", error);
  return data ?? [];
}

export async function saveChatMessage(role: string, content: string, module_context?: string) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("ai_chat_history")
    .insert({ role, content, module_context, user_id: uid } as any)
    .select()
    .single();
  if (error) console.error("saveChatMessage", error);
  return data;
}

export async function clearChatHistory() {
  const uid = await getCurrentUserId();
  if (!uid) return;
  const { error } = await supabase.from("ai_chat_history").delete().eq("user_id", uid);
  if (error) console.error("clearChatHistory", error);
}

// ── Goals ──
export async function getGoals() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase.from("goals").select("*").eq("user_id", uid).order("created_at", { ascending: true });
  if (error) console.error("getGoals", error);
  return data ?? [];
}

export async function updateGoal(id: string, updates: TablesUpdate<"goals">) {
  const { data, error } = await supabase.from("goals").update(updates).eq("id", id).select().single();
  if (error) console.error("updateGoal", error);
  return data;
}

// ── Blood Test Records ──
export async function getBloodTestRecords() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("blood_test_records")
    .select("*")
    .eq("user_id", uid)
    .order("test_date", { ascending: true });
  if (error) console.error("getBloodTestRecords", error);
  return data ?? [];
}

export async function getAppliedBloodTestRecords() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("blood_test_records")
    .select("*")
    .eq("user_id", uid)
    .eq("applied", true)
    .order("test_date", { ascending: true });
  if (error) console.error("getAppliedBloodTestRecords", error);
  return data ?? [];
}

export async function saveBloodTestRecord(record: {
  test_date: string;
  source: string;
  file_name?: string;
  weight_kg?: number | null;
  bmi?: number | null;
  markers: any;
  summary?: string;
  recommendations?: string[];
  risk_factors?: string[];
  pdf_storage_path?: string;
}) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("blood_test_records")
    .insert({
      test_date: record.test_date,
      source: record.source,
      file_name: record.file_name,
      weight_kg: record.weight_kg,
      bmi: record.bmi,
      markers: record.markers,
      summary: record.summary,
      recommendations: record.recommendations ?? [],
      risk_factors: record.risk_factors ?? [],
      pdf_storage_path: record.pdf_storage_path,
      applied: false,
      analyzed_at: new Date().toISOString(),
      user_id: uid,
    } as any)
    .select()
    .single();
  if (error) console.error("saveBloodTestRecord", error);
  return data;
}

export async function applyBloodTestRecord(id: string) {
  const { data, error } = await supabase
    .from("blood_test_records")
    .update({ applied: true })
    .eq("id", id)
    .select()
    .single();
  if (error) console.error("applyBloodTestRecord", error);
  return data;
}

export async function declineBloodTestRecord(id: string) {
  const { data, error } = await supabase
    .from("blood_test_records")
    .update({ applied: false })
    .eq("id", id)
    .select()
    .single();
  if (error) console.error("declineBloodTestRecord", error);
  return data;
}

export async function deleteBloodTestRecord(id: string) {
  const { error } = await supabase.from("blood_test_records").delete().eq("id", id);
  if (error) console.error("deleteBloodTestRecord", error);
}

// ── Sleep Logs ──
export async function getSleepLogs(limit = 30) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("sleep_logs" as any)
    .select("*")
    .eq("user_id", uid)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) console.error("getSleepLogs", error);
  return data ?? [];
}

export async function saveSleepLog(log: {
  date: string;
  bedtime: string;
  wake_time: string;
  total_hours: number;
  quality: number;
  wake_ups?: number;
  notes?: string;
  late_eating?: boolean;
  exercise_today?: boolean;
  screen_before_bed?: boolean;
  caffeine_after_2pm?: boolean;
  stress_level?: number;
  morning_feeling?: number;
}) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data: existing } = await supabase
    .from("sleep_logs" as any)
    .select("id")
    .eq("user_id", uid)
    .eq("date", log.date)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("sleep_logs" as any)
      .update(log)
      .eq("id", (existing as any).id)
      .select()
      .single();
    if (error) console.error("saveSleepLog update", error);
    return data;
  }
  const { data, error } = await supabase
    .from("sleep_logs" as any)
    .insert({ ...log, user_id: uid })
    .select()
    .single();
  if (error) console.error("saveSleepLog insert", error);
  return data;
}

// ── Checklist Stats ──
export async function getChecklistStats() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("daily_checklist")
    .select("*")
    .eq("user_id", uid)
    .order("checklist_date", { ascending: false })
    .limit(90);
  if (error) console.error("getChecklistStats", error);
  return data ?? [];
}

// ══════════════════════════════════════════════════════════════
// ── Projects ──
// ══════════════════════════════════════════════════════════════

export async function getProjects() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) console.error("getProjects", error);
  return data ?? [];
}

export async function getProject(id: string) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .single();
  if (error) console.error("getProject", error);
  return data;
}

export async function createProject(project: Omit<TablesInsert<"projects">, "user_id">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...project, user_id: uid })
    .select()
    .single();
  if (error) console.error("createProject", error);
  return data;
}

export async function updateProject(id: string, updates: TablesUpdate<"projects">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .eq("user_id", uid)
    .select()
    .single();
  if (error) console.error("updateProject", error);
  return data;
}

export async function deleteProject(id: string) {
  const uid = await getCurrentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteProject", error);
}

// ══════════════════════════════════════════════════════════════
// ── Kanban Columns ──
// ══════════════════════════════════════════════════════════════

export async function getKanbanColumns() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("kanban_columns")
    .select("*")
    .eq("user_id", uid)
    .order("col_order", { ascending: true });
  if (error) console.error("getKanbanColumns", error);
  return data ?? [];
}

export async function upsertKanbanColumn(column: Omit<TablesInsert<"kanban_columns">, "user_id">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("kanban_columns")
    .upsert({ ...column, user_id: uid })
    .select()
    .single();
  if (error) console.error("upsertKanbanColumn", error);
  return data;
}

export async function deleteKanbanColumn(id: string) {
  const uid = await getCurrentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("kanban_columns")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteKanbanColumn", error);
}

// ══════════════════════════════════════════════════════════════
// ── Tasks ──
// ══════════════════════════════════════════════════════════════

export async function getTasks() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", uid)
    .order("task_order", { ascending: true });
  if (error) console.error("getTasks", error);
  return data ?? [];
}

export async function getTasksByProject(projectId: string) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", uid)
    .eq("project_id", projectId)
    .order("task_order", { ascending: true });
  if (error) console.error("getTasksByProject", error);
  return data ?? [];
}

export async function getTasksByStatus(status: string) {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", uid)
    .eq("status", status)
    .order("task_order", { ascending: true });
  if (error) console.error("getTasksByStatus", error);
  return data ?? [];
}

export async function createTask(task: Omit<TablesInsert<"tasks">, "user_id">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...task, user_id: uid })
    .select()
    .single();
  if (error) console.error("createTask", error);
  return data;
}

export async function updateTask(id: string, updates: TablesUpdate<"tasks">) {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", uid)
    .select()
    .single();
  if (error) console.error("updateTask", error);
  return data;
}

export async function deleteTask(id: string) {
  const uid = await getCurrentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteTask", error);
}
