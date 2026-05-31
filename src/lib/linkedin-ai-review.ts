import { supabase } from "@/integrations/supabase/client";

/**
 * Persistence for the carousel AI-review feature:
 *  - `linkedin_ai_reviews`   — one cached review per design (so it isn't re-run
 *    every time the editor opens).
 *  - `linkedin_design_memory` — learned rules fed into future reviews so the
 *    same issues aren't repeated; editable by the user in Settings.
 */

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export type CachedReview = { review: any; applied: string[] };

export async function getAiReview(designId: string): Promise<CachedReview | null> {
  const u = await uid();
  if (!u) return null;
  const { data } = await supabase
    .from("linkedin_ai_reviews" as any)
    .select("review, applied")
    .eq("user_id", u)
    .eq("design_id", designId)
    .maybeSingle();
  if (!data) return null;
  return { review: (data as any).review, applied: (data as any).applied ?? [] };
}

export async function saveAiReview(designId: string, review: any, applied: string[]): Promise<void> {
  const u = await uid();
  if (!u || !designId) return;
  await supabase.from("linkedin_ai_reviews" as any).upsert(
    { user_id: u, design_id: designId, review, applied, updated_at: new Date().toISOString() } as any,
    { onConflict: "user_id,design_id" },
  );
}

export type MemoryRow = { id: string; rule: string; source: string; active: boolean; created_at: string };

export async function listDesignMemory(): Promise<MemoryRow[]> {
  const u = await uid();
  if (!u) return [];
  const { data } = await supabase
    .from("linkedin_design_memory" as any)
    .select("*")
    .eq("user_id", u)
    .order("created_at", { ascending: false });
  return (data as any) ?? [];
}

/** Active rules only, deduped — what gets fed to the AI review. */
export async function getActiveMemoryRules(): Promise<string[]> {
  const rows = await listDesignMemory();
  return Array.from(new Set(rows.filter((r) => r.active && r.rule.trim()).map((r) => r.rule.trim())));
}

export async function addDesignMemory(rule: string, source = "ai_review"): Promise<void> {
  const u = await uid();
  const clean = (rule || "").trim();
  if (!u || !clean) return;
  const existing = await listDesignMemory();
  if (existing.some((r) => r.rule.trim().toLowerCase() === clean.toLowerCase())) return; // no near-dupes
  await supabase.from("linkedin_design_memory" as any).insert({ user_id: u, rule: clean, source } as any);
}

export async function updateDesignMemory(id: string, patch: Partial<Pick<MemoryRow, "rule" | "active">>): Promise<void> {
  await supabase.from("linkedin_design_memory" as any).update(patch as any).eq("id", id);
}

export async function deleteDesignMemory(id: string): Promise<void> {
  await supabase.from("linkedin_design_memory" as any).delete().eq("id", id);
}
