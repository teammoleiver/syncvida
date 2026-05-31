import { supabase } from "@/integrations/supabase/client";

/**
 * Persistent "memory" learned from how the user accepts/rejects scraped social
 * posts. Each row is one rule (a tag and/or sentence). The relevance scorer
 * feeds active rules back into its prompt so the AI keeps getting smarter
 * about which topics, tones and audiences the user cares about.
 */

export type ScrapeMemorySignal = "positive" | "negative";
export type ScrapeMemorySource = "ignore" | "delete" | "generate" | "manual" | "like";

export type ScrapeMemoryRow = {
  id: string;
  user_id: string;
  signal: ScrapeMemorySignal;
  tags: string[];
  reason: string | null;
  source: ScrapeMemorySource;
  source_post_id: string | null;
  source_post_author: string | null;
  source_post_excerpt: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** Curated reason chips surfaced in the feedback dialog. */
export const NEGATIVE_TAGS = [
  "Off-topic",
  "Wrong industry",
  "Too promotional",
  "Too generic",
  "Not my audience",
  "Outdated",
  "Wrong tone",
  "Low quality",
] as const;

export const POSITIVE_TAGS = [
  "On-brand",
  "My niche",
  "Great insight",
  "Audience match",
  "Inspiring tone",
  "Hot topic",
  "Worth commenting",
] as const;

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listScrapeMemory(): Promise<ScrapeMemoryRow[]> {
  const u = await uid();
  if (!u) return [];
  const { data } = await supabase
    .from("social_scrape_memory" as any)
    .select("*")
    .eq("user_id", u)
    .order("created_at", { ascending: false });
  return (data as any) ?? [];
}

export async function addScrapeMemory(input: {
  signal: ScrapeMemorySignal;
  tags?: string[];
  reason?: string | null;
  source?: ScrapeMemorySource;
  source_post?: { id?: string | null; author?: string | null; text?: string | null } | null;
}): Promise<void> {
  const u = await uid();
  if (!u) return;
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const reason = (input.reason ?? "").trim() || null;
  if (tags.length === 0 && !reason) return; // nothing to learn
  await supabase.from("social_scrape_memory" as any).insert({
    user_id: u,
    signal: input.signal,
    tags,
    reason,
    source: input.source ?? "manual",
    source_post_id: input.source_post?.id ?? null,
    source_post_author: input.source_post?.author ?? null,
    source_post_excerpt: input.source_post?.text ? String(input.source_post.text).slice(0, 280) : null,
  } as any);
}

export async function updateScrapeMemory(
  id: string,
  patch: Partial<Pick<ScrapeMemoryRow, "active" | "reason" | "tags" | "signal">>,
): Promise<void> {
  await supabase.from("social_scrape_memory" as any).update(patch as any).eq("id", id);
}

export async function deleteScrapeMemory(id: string): Promise<void> {
  await supabase.from("social_scrape_memory" as any).delete().eq("id", id);
}

/** Active memory split by signal — what the scorer prompt consumes. */
export async function getActiveScrapeMemory(): Promise<{ positive: ScrapeMemoryRow[]; negative: ScrapeMemoryRow[] }> {
  const rows = (await listScrapeMemory()).filter((r) => r.active);
  return {
    positive: rows.filter((r) => r.signal === "positive"),
    negative: rows.filter((r) => r.signal === "negative"),
  };
}