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
