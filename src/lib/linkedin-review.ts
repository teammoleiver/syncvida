import { supabase } from "@/integrations/supabase/client";
import postsData from "@/data/linkedin-posts.json";

export const SALEH_EMAIL = "saleh.moh.seddik@gmail.com";

export type LinkedInPost = {
  id: string;
  month: string;
  date: string;
  post_type: string;
  pillar: string;
  topic: string;
  body: string;
};

export type PostStatus = "pending" | "kept" | "rejected" | "deleted";

export type PostState = {
  post_id: string;
  status: PostStatus;
  edited_body: string | null;
  notes: string | null;
  updated_at: string;
};

export const SEED_POSTS: LinkedInPost[] = postsData as LinkedInPost[];

export async function isSeedUser(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return (data?.user?.email ?? "").toLowerCase() === SALEH_EMAIL;
}

export async function getPostsForUser(): Promise<LinkedInPost[]> {
  return (await isSeedUser()) ? SEED_POSTS : [];
}

export async function listStates(): Promise<Record<string, PostState>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from("linkedin_post_states" as any)
    .select("post_id,status,edited_body,notes,updated_at")
    .eq("user_id", user.id);
  if (error) throw error;
  const map: Record<string, PostState> = {};
  (data ?? []).forEach((r: any) => { map[r.post_id] = r as PostState; });
  return map;
}

export async function upsertState(post_id: string, patch: Partial<Pick<PostState, "status" | "edited_body" | "notes">>): Promise<PostState> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const row: any = { user_id: user.id, post_id, ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("linkedin_post_states" as any)
    .upsert(row, { onConflict: "user_id,post_id" })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PostState;
}

export async function clearAllStates(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("linkedin_post_states" as any).delete().eq("user_id", user.id);
}

export async function rewritePost(payload: {
  mode: string;
  postBody: string;
  customText?: string;
  newTopic?: string;
  keywords?: string[];
  style?: string;
}): Promise<{ rewrite?: string; error?: string }> {
  // Feed the user's learned writing rules so the rewrite avoids what they reject.
  const avoid = await getActiveWritingRules().catch(() => [] as string[]);
  const { data, error } = await supabase.functions.invoke("rewrite-linkedin-post", { body: { ...payload, avoid } });
  if (error) return { error: error.message };
  return data as { rewrite?: string; error?: string };
}

/* ── Writing-style memory: learned from rejected/deleted posts (Settings-editable) ── */

export type WritingMemoryRow = { id: string; rule: string; reason: string | null; source: string; active: boolean; created_at: string };

export async function listWritingMemory(): Promise<WritingMemoryRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("linkedin_writing_memory" as any)
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return (data as any) ?? [];
}

export async function getActiveWritingRules(): Promise<string[]> {
  const rows = await listWritingMemory();
  return Array.from(new Set(rows.filter((r) => r.active && r.rule.trim()).map((r) => r.rule.trim())));
}

export async function addWritingMemory(rule: string, reason?: string | null, source = "reject"): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const clean = (rule || "").trim();
  if (!user || !clean) return;
  const existing = await listWritingMemory();
  if (existing.some((r) => r.rule.trim().toLowerCase() === clean.toLowerCase())) return;
  await supabase.from("linkedin_writing_memory" as any).insert({ user_id: user.id, rule: clean, reason: reason ?? null, source } as any);
}

export async function updateWritingMemory(id: string, patch: Partial<Pick<WritingMemoryRow, "rule" | "active">>): Promise<void> {
  await supabase.from("linkedin_writing_memory" as any).update(patch as any).eq("id", id);
}

export async function deleteWritingMemory(id: string): Promise<void> {
  await supabase.from("linkedin_writing_memory" as any).delete().eq("id", id);
}

export const PILLAR_COLORS: Record<string, { chip: string; border: string; text: string }> = {
  P1: { chip: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" },
  P2: { chip: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300" },
  P3: { chip: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" },
  P4: { chip: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300" },
  P5: { chip: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300" },
  P6: { chip: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300" },
};

export function pillarColor(pillar: string) {
  const key = (pillar.match(/P\d/)?.[0] ?? "P1") as keyof typeof PILLAR_COLORS;
  return PILLAR_COLORS[key] ?? PILLAR_COLORS.P1;
}

export const POST_TYPE_LABELS: Record<string, string> = {
  "PT-01": "Tactical Deep Dive",
  "PT-04": "Stack Breakdown",
  "PT-05": "Framework",
  "PT-08": "Counter-take / POV",
  "PT-09": "BTS / Build in Public",
  "PT-13": "Personal Story",
  "PT-15": "Lessons / Tactical List",
};

export function exportMarkdown(posts: LinkedInPost[], states: Record<string, PostState>): string {
  const grouped: Record<string, LinkedInPost[]> = {};
  for (const p of posts) {
    const s = states[p.id];
    if (s?.status === "rejected") continue;
    if (!s || s.status !== "kept") continue;
    (grouped[p.month] ||= []).push(p);
  }
  const lines: string[] = [];
  lines.push("# LinkedIn Content Plan — Saleh Seddik");
  lines.push(`# Reviewed export · ${new Date().toISOString()}`);
  lines.push("");
  for (const month of Object.keys(grouped)) {
    lines.push(`## ${month}`);
    lines.push("");
    for (const p of grouped[month]) {
      const s = states[p.id];
      lines.push("---");
      lines.push(`**${p.date}**  ·  **${p.post_type}**  ·  ${p.pillar}  ·  *${p.topic}*`);
      lines.push("[✓ KEPT]");
      if (s?.edited_body) lines.push("[✎ EDITED]");
      lines.push("");
      lines.push(s?.edited_body ?? p.body);
      lines.push("");
    }
  }
  return lines.join("\n");
}