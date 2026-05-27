import { supabase } from "@/integrations/supabase/client";

// ── Webhook history ──
export type WebhookLog = {
  id: string;
  user_id: string;
  plan_id: string | null;
  platform: string;
  webhook_url: string;
  request_payload: any | null;
  status_code: number | null;
  ok: boolean;
  response_body: string | null;
  response_headers: any | null;
  error: string | null;
  duration_ms: number | null;
  trigger_kind: "manual" | "cron" | "retry";
  attempted_at: string;
};

export async function listWebhookLogs(filter?: {
  platform?: string;
  status?: "all" | "ok" | "error";
  plan_id?: string;
  limit?: number;
}): Promise<WebhookLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  let q = supabase.from("webhook_logs" as any)
    .select("*")
    .eq("user_id", user.id)
    .order("attempted_at", { ascending: false })
    .limit(filter?.limit ?? 200);
  if (filter?.platform && filter.platform !== "all") q = q.eq("platform", filter.platform);
  if (filter?.status === "ok") q = q.eq("ok", true);
  else if (filter?.status === "error") q = q.eq("ok", false);
  if (filter?.plan_id) q = q.eq("plan_id", filter.plan_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) ?? [];
}

export async function deleteWebhookLog(id: string): Promise<void> {
  const { error } = await supabase.from("webhook_logs" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function clearWebhookLogs(filter?: { platform?: string; olderThanDays?: number }): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  let q = supabase.from("webhook_logs" as any).delete({ count: "exact" }).eq("user_id", user.id);
  if (filter?.platform && filter.platform !== "all") q = q.eq("platform", filter.platform);
  if (filter?.olderThanDays && filter.olderThanDays > 0) {
    const cutoff = new Date(Date.now() - filter.olderThanDays * 86400_000).toISOString();
    q = q.lt("attempted_at", cutoff);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function uid(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Profiles ──
export async function listSocialProfiles() {
  const u = await uid(); if (!u) return [];
  // Paginate past Supabase's default 1000-row cap
  const PAGE = 1000;
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("social_profiles" as any)
      .select("*")
      .eq("user_id", u)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) break;
    const batch = (data as any[]) ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}
export async function createSocialProfile(p: {
  profile_url: string; username?: string; display_name?: string; company?: string;
  location?: string; title?: string; info_summary?: string; followers?: number;
  scrape_cadence?: string; apify_actor_id?: string; tags?: string[];
  [key: string]: any;
}) {
  const u = await uid(); if (!u) return null;
  const username = p.username || (() => {
    try { const url = new URL(p.profile_url); return url.pathname.split("/").filter(Boolean).pop() ?? ""; } catch { return ""; }
  })();
  const { data, error } = await supabase.from("social_profiles" as any).insert({ ...p, username, user_id: u } as any).select().single();
  if (error) throw error;
  return data;
}

export async function bulkCreateSocialProfiles(rows: Array<Record<string, any>>) {
  const u = await uid(); if (!u) return { inserted: 0, skipped: 0, duplicates: 0 };
  const valid = rows
    .filter((r) => r.profile_url && String(r.profile_url).trim())
    .map((r) => {
      let username = r.username;
      if (!username) {
        try { username = new URL(r.profile_url).pathname.split("/").filter(Boolean).pop() ?? ""; } catch { username = ""; }
      }
      return { ...r, username, user_id: u };
    });
  if (!valid.length) return { inserted: 0, skipped: rows.length, duplicates: 0 };

  // Check existing URLs to compute duplicates (chunked to avoid URL length limits)
  const urls = valid.map((r: any) => r.profile_url);
  const existingSet = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const part = urls.slice(i, i + CHUNK);
    const { data: existing } = await supabase.from("social_profiles" as any)
      .select("profile_url").eq("user_id", u).in("profile_url", part);
    ((existing as any[]) ?? []).forEach((r) => existingSet.add(r.profile_url));
  }
  const fresh = valid.filter((r: any) => !existingSet.has(r.profile_url));
  const duplicates = valid.length - fresh.length;
  if (!fresh.length) return { inserted: 0, skipped: rows.length - valid.length, duplicates };

  // Insert in batches of 500 to stay within edge/timeout limits
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const batch = fresh.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("social_profiles" as any)
      .upsert(batch as any, { onConflict: "user_id,profile_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted += (data as any[])?.length ?? 0;
  }
  return { inserted, skipped: rows.length - valid.length, duplicates };
}

export async function listExistingProfileUrls(urls: string[]): Promise<string[]> {
  const u = await uid(); if (!u || !urls.length) return [];
  const out: string[] = [];
  const CHUNK = 200;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const part = urls.slice(i, i + CHUNK);
    const { data } = await supabase.from("social_profiles" as any)
      .select("profile_url").eq("user_id", u).in("profile_url", part);
    ((data as any[]) ?? []).forEach((r) => out.push(r.profile_url));
  }
  return out;
}

export async function bulkUpdateSocialProfiles(ids: string[], updates: Record<string, any>) {
  if (!ids.length) return 0;
  const CHUNK = 200;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("social_profiles" as any)
      .update(updates).in("id", part).select("id");
    if (error) throw error;
    updated += (data as any[])?.length ?? 0;
  }
  return updated;
}

// Merge-only: for each row matched by profile_url, fill ONLY columns that are
// currently null/empty on the existing record. Never overwrites existing data.
export async function bulkMergeBlankSocialProfiles(rows: Array<Record<string, any>>) {
  const u = await uid(); if (!u) return { updated: 0, unchanged: 0, notFound: 0 };
  const urls = rows.map((r) => r.profile_url).filter(Boolean) as string[];
  if (!urls.length) return { updated: 0, unchanged: 0, notFound: 0 };

  // Fetch existing rows
  const CHUNK = 200;
  const existing: any[] = [];
  for (let i = 0; i < urls.length; i += CHUNK) {
    const part = urls.slice(i, i + CHUNK);
    const { data } = await supabase.from("social_profiles" as any)
      .select("*").eq("user_id", u).in("profile_url", part);
    existing.push(...((data as any[]) ?? []));
  }
  const byUrl = new Map<string, any>(existing.map((r) => [r.profile_url, r]));

  let updated = 0, unchanged = 0, notFound = 0;
  for (const row of rows) {
    const cur = byUrl.get(row.profile_url);
    if (!cur) { notFound++; continue; }
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "profile_url" || k === "user_id" || k === "id" || k === "username") continue;
      if (v === null || v === undefined || v === "") continue;
      const existingVal = cur[k];
      const isEmpty = existingVal === null || existingVal === undefined || existingVal === "" ||
        (typeof existingVal === "number" && Number.isNaN(existingVal));
      if (isEmpty) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) { unchanged++; continue; }
    const { error } = await supabase.from("social_profiles" as any).update(patch).eq("id", cur.id);
    if (error) throw error;
    updated++;
  }
  return { updated, unchanged, notFound };
}

export async function bulkDeleteSocialProfiles(ids: string[]) {
  if (!ids.length) return 0;
  const CHUNK = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from("social_profiles" as any).delete().in("id", part);
    if (error) throw error;
    deleted += part.length;
  }
  return deleted;
}

// ── Favorites & Lists ─────────────────────────────────────────────────
export async function setProfileFavorite(id: string, value: boolean) {
  const { error } = await supabase.from("social_profiles" as any)
    .update({ is_favorite: value }).eq("id", id);
  if (error) throw error;
}

export async function bulkSetProfileFavorite(ids: string[], value: boolean) {
  if (!ids.length) return 0;
  return bulkUpdateSocialProfiles(ids, { is_favorite: value });
}

export async function addProfilesToList(ids: string[], listName: string) {
  const name = listName.trim();
  if (!ids.length || !name) return 0;
  // Fetch current lists for each so we can union
  const { data, error } = await supabase.from("social_profiles" as any)
    .select("id, lists").in("id", ids);
  if (error) throw error;
  let updated = 0;
  for (const row of (data as any[]) || []) {
    const cur: string[] = Array.isArray(row.lists) ? row.lists : [];
    if (cur.includes(name)) continue;
    const next = [...cur, name];
    const { error: e2 } = await supabase.from("social_profiles" as any)
      .update({ lists: next }).eq("id", row.id);
    if (e2) throw e2;
    updated++;
  }
  return updated;
}

export async function removeProfilesFromList(ids: string[], listName: string) {
  const name = listName.trim();
  if (!ids.length || !name) return 0;
  const { data, error } = await supabase.from("social_profiles" as any)
    .select("id, lists").in("id", ids);
  if (error) throw error;
  let updated = 0;
  for (const row of (data as any[]) || []) {
    const cur: string[] = Array.isArray(row.lists) ? row.lists : [];
    if (!cur.includes(name)) continue;
    const next = cur.filter((x) => x !== name);
    const { error: e2 } = await supabase.from("social_profiles" as any)
      .update({ lists: next }).eq("id", row.id);
    if (e2) throw e2;
    updated++;
  }
  return updated;
}

export async function renameProfileList(oldName: string, newName: string) {
  const u = await uid(); if (!u) return 0;
  const o = oldName.trim(), n = newName.trim();
  if (!o || !n || o === n) return 0;
  const { data, error } = await supabase.from("social_profiles" as any)
    .select("id, lists").eq("user_id", u).contains("lists", [o]);
  if (error) throw error;
  let updated = 0;
  for (const row of (data as any[]) || []) {
    const cur: string[] = Array.isArray(row.lists) ? row.lists : [];
    const next = Array.from(new Set(cur.map((x) => (x === o ? n : x))));
    const { error: e2 } = await supabase.from("social_profiles" as any)
      .update({ lists: next }).eq("id", row.id);
    if (e2) throw e2;
    updated++;
  }
  return updated;
}

export async function deleteProfileList(listName: string) {
  const u = await uid(); if (!u) return 0;
  const name = listName.trim(); if (!name) return 0;
  const { data, error } = await supabase.from("social_profiles" as any)
    .select("id, lists").eq("user_id", u).contains("lists", [name]);
  if (error) throw error;
  let updated = 0;
  for (const row of (data as any[]) || []) {
    const cur: string[] = Array.isArray(row.lists) ? row.lists : [];
    const next = cur.filter((x) => x !== name);
    const { error: e2 } = await supabase.from("social_profiles" as any)
      .update({ lists: next }).eq("id", row.id);
    if (e2) throw e2;
    updated++;
  }
  return updated;
}
export async function updateSocialProfile(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("social_profiles" as any).update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteSocialProfile(id: string) {
  const { error } = await supabase.from("social_profiles" as any).delete().eq("id", id);
  if (error) throw error;
}

// ── Posts ──
export async function listSocialPosts(filters?: { profile_id?: string; limit?: number }) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("social_posts" as any).select("*").eq("user_id", u).order("posted_at", { ascending: false }).limit(filters?.limit ?? 500);
  if (filters?.profile_id) q = q.eq("profile_id", filters.profile_id);
  const { data } = await q;
  return (data as any[]) ?? [];
}
export async function deleteSocialPost(id: string) {
  // Cascade-delete any engagement comment first (no FK cascade in schema), then the post itself.
  await supabase.from("linkedin_engagement_comments" as any).delete().eq("post_id", id);
  const { error } = await supabase.from("social_posts" as any).delete().eq("id", id);
  if (error) throw error;
}

// Bulk delete posts (chunked to stay under PostgREST/IN() limits)
export async function deleteSocialPosts(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const CHUNK = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    await supabase.from("linkedin_engagement_comments" as any).delete().in("post_id", part);
    const { error } = await supabase.from("social_posts" as any).delete().in("id", part);
    if (error) throw error;
    deleted += part.length;
  }
  return deleted;
}
export async function createManualSocialPost(p: { profile_id?: string; author?: string; company?: string; post_text: string; post_url?: string; posted_at?: string; }) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_posts" as any).insert({ ...p, user_id: u } as any).select().single();
  if (error) throw error;
  return data;
}

// ── Engagement (commenting on influencer posts) ──
export type EngagementRow = {
  id: string;
  post_id: string;
  draft_text: string | null;
  status: "draft" | "copied" | "posted" | "skipped";
  liked: boolean;
  posted_at: string | null;
  updated_at: string;
};

export async function listEngagementComments(postIds?: string[]): Promise<Record<string, EngagementRow>> {
  const u = await uid(); if (!u) return {};
  let q = supabase.from("linkedin_engagement_comments" as any).select("id,post_id,draft_text,status,liked,posted_at,updated_at").eq("user_id", u);
  if (postIds && postIds.length) q = q.in("post_id", postIds);
  const { data, error } = await q;
  if (error) throw error;
  const map: Record<string, EngagementRow> = {};
  (data ?? []).forEach((r: any) => { map[r.post_id] = r as EngagementRow; });
  return map;
}

export async function upsertEngagementComment(post_id: string, patch: Partial<Pick<EngagementRow, "draft_text" | "status" | "liked" | "posted_at">>): Promise<EngagementRow> {
  const u = await uid(); if (!u) throw new Error("Not signed in");
  const row: any = { user_id: u, post_id, ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("linkedin_engagement_comments" as any)
    .upsert(row, { onConflict: "user_id,post_id" })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as EngagementRow;
}

export type CommentTone = { id: string; label: string; description?: string; prompt: string };

export async function generateEngagementComment(payload: { post_text: string; author?: string; tone_id?: string; instruction?: string }): Promise<{ comment?: string; error?: string; tone_id?: string }> {
  const { data, error } = await supabase.functions.invoke("generate-engagement-comment", { body: { action: "generate", ...payload } });
  if (error) return { error: error.message };
  return data as any;
}

export async function suggestCommentTone(payload: { post_text: string }): Promise<{ tone_id?: string; reason?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("generate-engagement-comment", { body: { action: "suggest_tone", ...payload } });
  if (error) return { error: error.message };
  return data as any;
}

export async function previewAllTones(payload: { post_text: string; author?: string }): Promise<{ previews?: { tone_id: string; label: string; comment: string; error?: string }[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("generate-engagement-comment", { body: { action: "preview_all", ...payload } });
  if (error) return { error: error.message };
  return data as any;
}

export async function listCommentTones(): Promise<{ tones: CommentTone[]; defaults: CommentTone[]; is_custom: boolean }> {
  const { data, error } = await supabase.functions.invoke("generate-engagement-comment", { body: { action: "list_tones" } });
  if (error) throw error;
  return data as any;
}

export async function saveCommentTones(tones: CommentTone[] | null): Promise<void> {
  const { error } = await supabase.functions.invoke("generate-engagement-comment", { body: { action: "save_tones", tones } });
  if (error) throw error;
}

// ── Hot topics ──
export async function listHotTopics() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_hot_topics" as any).select("*").eq("user_id", u).order("score", { ascending: false });
  return (data as any[]) ?? [];
}
export async function deleteHotTopic(id: string) {
  await supabase.from("social_hot_topics" as any).delete().eq("id", id);
}

// ── Drafts ──
export async function listDraftsForPost(postId: string) {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_generated_drafts" as any).select("*").eq("user_id", u).eq("source_post_id", postId).order("created_at", { ascending: false });
  return (data as any[]) ?? [];
}
export async function deleteDraft(id: string) {
  await supabase.from("social_generated_drafts" as any).delete().eq("id", id);
}

// ── Content plan ──
export async function listContentPlan() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_content_plan" as any).select("*").eq("user_id", u).order("position", { ascending: true });
  return (data as any[]) ?? [];
}
export async function createPlanEntry(e: { hook: string; body?: string; format?: string; pillar?: string; framework?: string; status?: string; scheduled_date?: string; source_post_id?: string; source_topic_id?: string; }) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_content_plan" as any).insert({ ...e, user_id: u } as any).select().single();
  if (error) throw error;
  return data;
}
export async function updatePlanEntry(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("social_content_plan" as any).update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePlanEntry(id: string) {
  await supabase.from("social_content_plan" as any).delete().eq("id", id);
}

// ── Writer settings ──
export async function getWriterSettings() {
  const u = await uid(); if (!u) return null;
  const { data } = await supabase.from("social_writer_settings" as any).select("*").eq("user_id", u).maybeSingle();
  return data;
}
export async function upsertWriterSettings(s: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const existing = await getWriterSettings();
  if (existing) {
    const { data, error } = await supabase.from("social_writer_settings" as any).update(s).eq("user_id", u).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("social_writer_settings" as any).insert({ ...s, user_id: u } as any).select().single();
  if (error) throw error;
  return data;
}

// ── Engagement analytics ──────────────────────────────────────────────
export type CommentTargets = { daily: number; weekly: number; monthly: number };
export type CommentAnalytics = {
  targets: CommentTargets;
  today: number;
  week: number;
  month: number;
  year: number;
  total: number;
  byDayLast30: { date: string; count: number }[];
  byMonthLast12: { month: string; count: number }[]; // YYYY-MM
  streakDays: number;
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d: Date) { // Monday-based
  const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x;
}
function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x; }
function startOfYear(d: Date) { const x = startOfMonth(d); x.setMonth(0); return x; }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function ym(d: Date) { return d.toISOString().slice(0, 7); }

export async function getCommentAnalytics(): Promise<CommentAnalytics> {
  const u = await uid();
  const empty: CommentAnalytics = {
    targets: { daily: 10, weekly: 50, monthly: 200 },
    today: 0, week: 0, month: 0, year: 0, total: 0,
    byDayLast30: [], byMonthLast12: [], streakDays: 0,
  };
  if (!u) return empty;
  const settings = await getWriterSettings().catch(() => null) as any;
  const targets: CommentTargets = {
    daily: Number(settings?.comment_target_daily ?? 10),
    weekly: Number(settings?.comment_target_weekly ?? 50),
    monthly: Number(settings?.comment_target_monthly ?? 200),
  };
  const since = startOfDay(new Date()); since.setDate(since.getDate() - 365);
  const { data, error } = await supabase
    .from("linkedin_engagement_comments" as any)
    .select("status,posted_at,updated_at,created_at")
    .eq("user_id", u)
    .in("status", ["posted", "copied"])
    .gte("updated_at", since.toISOString())
    .limit(5000);
  if (error) throw error;
  const rows = (data || []) as any[];

  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let today = 0, week = 0, month = 0, year = 0;
  for (const r of rows) {
    const t = new Date(r.posted_at || r.updated_at || r.created_at);
    if (isNaN(+t)) continue;
    if (t >= dayStart) today++;
    if (t >= weekStart) week++;
    if (t >= monthStart) month++;
    if (t >= yearStart) year++;
    byDay.set(ymd(t), (byDay.get(ymd(t)) || 0) + 1);
    byMonth.set(ym(t), (byMonth.get(ym(t)) || 0) + 1);
  }

  const byDayLast30: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(dayStart); d.setDate(d.getDate() - i);
    byDayLast30.push({ date: ymd(d), count: byDay.get(ymd(d)) || 0 });
  }
  const byMonthLast12: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monthStart); d.setMonth(d.getMonth() - i);
    byMonthLast12.push({ month: ym(d), count: byMonth.get(ym(d)) || 0 });
  }
  // streak: consecutive days (ending today or yesterday) with >=1 comment
  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(dayStart); d.setDate(d.getDate() - i);
    const c = byDay.get(ymd(d)) || 0;
    if (c > 0) streakDays++;
    else if (i === 0) continue; // allow no comment yet today
    else break;
  }

  return { targets, today, week, month, year, total: rows.length, byDayLast30, byMonthLast12, streakDays };
}

export async function saveCommentTargets(t: CommentTargets) {
  return upsertWriterSettings({
    comment_target_daily: Math.max(0, Math.floor(t.daily)),
    comment_target_weekly: Math.max(0, Math.floor(t.weekly)),
    comment_target_monthly: Math.max(0, Math.floor(t.monthly)),
  });
}

// ── Edge function calls ──
export async function scrapeProfile(profile_id: string) {
  return supabase.functions.invoke("scrape-linkedin-profile", { body: { profile_id } });
}
export async function generatePostImage(args: { hook: string; post_body?: string; entry_id?: string | null }) {
  return supabase.functions.invoke("generate-post-image", { body: args });
}

// Upload a user-provided photo to the public post-images bucket and return its public URL.
export async function uploadPostImage(file: File): Promise<string> {
  const u = await uid();
  if (!u) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${u}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Upload succeeded but no public URL");
  return data.publicUrl;
}

// Vision + voice assistant for photo-based posts (uses OpenAI directly).
export async function analyzePhotoPost(args: {
  mode: "suggest" | "write";
  image_url?: string | null;
  user_note?: string;
  hook?: string;
  current_draft?: string;
  platform?: string;
  framework?: string;
}) {
  return supabase.functions.invoke("analyze-photo-post", { body: args });
}
export async function generateCarousel(posts: string[]) {
  return supabase.functions.invoke("generate-carousel", { body: { posts } });
}
export async function rotateNowScrape(profile_id: string) {
  return supabase.functions.invoke("scrape-linkedin-profile", { body: { profile_id, force_rotate: true } });
}
export async function retryWithAccount(profile_id: string, account_id: string) {
  return supabase.functions.invoke("scrape-linkedin-profile", { body: { profile_id, account_id } });
}
export async function scrapeAllActive() {
  return supabase.functions.invoke("scrape-linkedin-profile", { body: { all_active: true } });
}
export async function clusterHotTopics() {
  return supabase.functions.invoke("cluster-hot-topics", { body: {} });
}
export async function generatePost(args: { framework: string; source_post_id?: string; source_topic_id?: string; idea?: string; significance?: string; data?: string; description?: string; implications?: string; }) {
  return supabase.functions.invoke("generate-social-post", { body: { ...args, mode: "generate" } });
}
export async function suggestFrameworks(args: { source_post_id?: string; source_topic_id?: string; idea?: string; }) {
  return supabase.functions.invoke("generate-social-post", { body: { ...args, mode: "suggest" } });
}

// ── Apify accounts (rotating fallback pool) ──
export async function listApifyAccounts() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_apify_accounts_safe" as any).select("*").eq("user_id", u).order("created_at", { ascending: true });
  return (data as any[]) ?? [];
}
export async function createApifyAccount(p: { label: string; api_token: string; actor_id?: string; monthly_budget_usd?: number }) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_apify_accounts" as any).insert({
    user_id: u, label: p.label, api_token: p.api_token, actor_id: p.actor_id ?? null,
    monthly_budget_usd: p.monthly_budget_usd ?? 5,
    period_start: new Date().toISOString().slice(0, 10),
  } as any).select().single();
  if (error) throw error;
  return data;
}
export async function updateApifyAccount(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("social_apify_accounts" as any).update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteApifyAccount(id: string) {
  await supabase.from("social_apify_accounts" as any).delete().eq("id", id);
}
export async function testApifyAccount(id: string, mode: "health" | "run" = "run") {
  return supabase.functions.invoke("test-apify-account", { body: { account_id: id, mode } });
}

// ── Apify actor presets (per-platform actor IDs) ──
export type ApifyActorKind =
  | "youtube_channel"
  | "youtube_video_transcript"
  | "linkedin_profile"
  | "linkedin_company"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "other";

export type ApifyActor = {
  id: string;
  user_id: string;
  kind: ApifyActorKind;
  label: string;
  actor_id: string;
  is_default: boolean;
  notes: string | null;
  input_template: any | null;
  created_at: string;
  updated_at: string;
};

export async function listApifyActors(kind?: ApifyActorKind): Promise<ApifyActor[]> {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("apify_actors" as any).select("*").eq("user_id", u).order("kind").order("is_default", { ascending: false }).order("created_at");
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return ((data ?? []) as unknown) as ApifyActor[];
}

export async function createApifyActor(p: {
  kind: ApifyActorKind; label: string; actor_id: string; is_default?: boolean; notes?: string; input_template?: any;
}): Promise<ApifyActor> {
  const u = await uid();
  if (!u) throw new Error("Not authenticated");
  const actorId = parseApifyActorId(p.actor_id) || p.actor_id.trim();
  if (!actorId) throw new Error("Actor ID required");
  if (p.is_default) {
    // Clear any existing default for this kind first.
    await supabase.from("apify_actors" as any).update({ is_default: false } as any)
      .eq("user_id", u).eq("kind", p.kind).eq("is_default", true);
  }
  const { data, error } = await supabase.from("apify_actors" as any).insert({
    user_id: u, kind: p.kind, label: p.label.trim() || "Actor",
    actor_id: actorId, is_default: !!p.is_default, notes: p.notes ?? null,
    input_template: p.input_template ?? null,
  } as any).select().single();
  if (error) throw error;
  return data as unknown as ApifyActor;
}

export async function updateApifyActor(id: string, updates: Partial<Pick<ApifyActor, "label" | "actor_id" | "notes" | "is_default" | "kind" | "input_template">>): Promise<void> {
  const u = await uid();
  if (!u) throw new Error("Not authenticated");
  const patch: any = { ...updates };
  if (patch.actor_id) patch.actor_id = parseApifyActorId(patch.actor_id) || patch.actor_id;
  if (patch.is_default && updates.kind) {
    await supabase.from("apify_actors" as any).update({ is_default: false } as any)
      .eq("user_id", u).eq("kind", updates.kind).eq("is_default", true).neq("id", id);
  }
  const { error } = await supabase.from("apify_actors" as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteApifyActor(id: string): Promise<void> {
  const { error } = await supabase.from("apify_actors" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function setDefaultApifyActor(id: string, kind: ApifyActorKind): Promise<void> {
  const u = await uid();
  if (!u) throw new Error("Not authenticated");
  await supabase.from("apify_actors" as any).update({ is_default: false } as any)
    .eq("user_id", u).eq("kind", kind);
  const { error } = await supabase.from("apify_actors" as any).update({ is_default: true } as any).eq("id", id);
  if (error) throw error;
}

// ── Scrape run history ──
export async function listScrapeRuns(filters?: { account_id?: string; profile_id?: string; limit?: number }) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("social_scrape_runs" as any).select("*").eq("user_id", u).order("ran_at", { ascending: false }).limit(filters?.limit ?? 50);
  if (filters?.account_id) q = q.eq("apify_account_id", filters.account_id);
  if (filters?.profile_id) q = q.eq("profile_id", filters.profile_id);
  const { data } = await q;
  return (data as any[]) ?? [];
}
export async function getScrapeRun(id: string) {
  const { data } = await supabase.from("social_scrape_runs" as any).select("*").eq("id", id).maybeSingle();
  return data;
}

// ── Per-profile scraped post history (all-time) ──
export async function listPostsForProfile(profile_id: string, limit = 200) {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_posts" as any).select("*")
    .eq("user_id", u).eq("profile_id", profile_id)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as any[]) ?? [];
}

// ── Editable framework prompts ──
export async function listFrameworkPrompts() {
  const { data, error } = await supabase.functions.invoke("framework-prompts", { body: { action: "list" } });
  if (error) throw error;
  return (data as any)?.frameworks ?? [];
}
export async function saveFrameworkPrompt(framework_id: string, prompt: string) {
  return supabase.functions.invoke("framework-prompts", { body: { action: "save", framework_id, prompt } });
}
export async function suggestFrameworkPromptImprovement(framework_id: string) {
  return supabase.functions.invoke("framework-prompts", { body: { action: "suggest", framework_id } });
}

// ── Self LinkedIn analysis ──
export async function analyzeSelfProfile(linkedin_url?: string, profile_actor_id?: string) {
  return supabase.functions.invoke("analyze-self-profile", { body: { linkedin_url, profile_actor_id } });
}
export async function getSelfProfileId(): Promise<string | null> {
  const u = await uid(); if (!u) return null;
  const { data } = await supabase.from("social_profiles" as any).select("id")
    .eq("user_id", u).eq("is_self", true).maybeSingle();
  return (data as any)?.id ?? null;
}
export async function scrapeMyLastPosts(limit = 50) {
  const id = await getSelfProfileId();
  if (!id) throw new Error("Run 'Analyze my LinkedIn' first to create your self profile.");
  const res = await supabase.functions.invoke("scrape-linkedin-profile", { body: { profile_id: id, limit, force_rotate: true } });
  // After posts land, refine voice strictly from real posts (no hallucination).
  try { await supabase.functions.invoke("enrich-voice-from-posts", { body: {} }); } catch { /* non-fatal */ }
  return res;
}

export async function enrichVoiceFromPosts() {
  return supabase.functions.invoke("enrich-voice-from-posts", { body: {} });
}

// ── Self LinkedIn analytics (profile + posts + growth snapshots) ──
export type SelfProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  country: string | null;
  info_summary: string | null;
  num_followers: number | null;
  followers: number | null;
  avatar_url: string | null;
  profile_url: string | null;
  username: string | null;
  last_scraped_at: string | null;
};

export async function getSelfProfile(): Promise<SelfProfile | null> {
  const u = await uid(); if (!u) return null;
  const { data } = await supabase.from("social_profiles" as any)
    .select("id,display_name,full_name,title,company,location,country,info_summary,num_followers,followers,avatar_url,profile_url,username,last_scraped_at")
    .eq("user_id", u).eq("is_self", true).maybeSingle();
  return (data as any) ?? null;
}

export type SelfPostsAnalytics = {
  count: number;
  totals: { likes: number; comments: number; shares: number; views: number };
  averages: { likes: number; comments: number; shares: number; views: number };
  byMonth: { month: string; posts: number; likes: number; comments: number; shares: number }[];
  top: { id: string; post_url: string | null; post_text: string | null; posted_at: string | null; likes: number; comments: number; shares: number; views: number; score: number }[];
  latestPostedAt: string | null;
};

export async function getSelfPostsAnalytics(): Promise<SelfPostsAnalytics> {
  const empty: SelfPostsAnalytics = {
    count: 0, totals: { likes:0, comments:0, shares:0, views:0 },
    averages: { likes:0, comments:0, shares:0, views:0 },
    byMonth: [], top: [], latestPostedAt: null,
  };
  const id = await getSelfProfileId();
  if (!id) return empty;
  const { data, error } = await supabase.from("social_posts" as any)
    .select("id,post_url,post_text,posted_at,likes,comments,shares,views")
    .eq("profile_id", id)
    .order("posted_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data || []) as any[];
  const totals = { likes:0, comments:0, shares:0, views:0 };
  const byMonthMap = new Map<string, { posts:number; likes:number; comments:number; shares:number }>();
  for (const r of rows) {
    totals.likes += r.likes || 0;
    totals.comments += r.comments || 0;
    totals.shares += r.shares || 0;
    totals.views += r.views || 0;
    if (r.posted_at) {
      const m = String(r.posted_at).slice(0, 7);
      const cur = byMonthMap.get(m) || { posts:0, likes:0, comments:0, shares:0 };
      cur.posts++; cur.likes += r.likes || 0; cur.comments += r.comments || 0; cur.shares += r.shares || 0;
      byMonthMap.set(m, cur);
    }
  }
  const count = rows.length;
  const averages = {
    likes: count ? Math.round(totals.likes / count) : 0,
    comments: count ? Math.round(totals.comments / count) : 0,
    shares: count ? Math.round(totals.shares / count) : 0,
    views: count ? Math.round(totals.views / count) : 0,
  };
  // build 12-month series ending current month
  const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
  const byMonth: SelfPostsAnalytics["byMonth"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const cur = byMonthMap.get(key) || { posts:0, likes:0, comments:0, shares:0 };
    byMonth.push({ month: key, ...cur });
  }
  const top = [...rows]
    .map((r) => ({ ...r, score: (r.likes||0) + 2*(r.comments||0) + 3*(r.shares||0) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
  return { count, totals, averages, byMonth, top, latestPostedAt: rows[0]?.posted_at ?? null };
}

export type SelfSnapshot = {
  id: string;
  captured_at: string;
  followers: number | null;
  connections: number | null;
  posts_count: number | null;
  total_likes: number | null;
  total_comments: number | null;
  total_shares: number | null;
  total_views: number | null;
};

export async function listSelfSnapshots(limit = 52): Promise<SelfSnapshot[]> {
  const u = await uid(); if (!u) return [];
  const { data, error } = await supabase.from("social_self_snapshots" as any)
    .select("id,captured_at,followers,connections,posts_count,total_likes,total_comments,total_shares,total_views")
    .eq("user_id", u)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as any[]).reverse();
}

export async function recordSelfSnapshot(): Promise<SelfSnapshot | null> {
  const u = await uid(); if (!u) return null;
  const [profile, analytics] = await Promise.all([getSelfProfile(), getSelfPostsAnalytics()]);
  const followers = profile?.num_followers ?? profile?.followers ?? null;
  const row = {
    user_id: u,
    followers,
    connections: null as number | null,
    posts_count: analytics.count,
    total_likes: analytics.totals.likes,
    total_comments: analytics.totals.comments,
    total_shares: analytics.totals.shares,
    total_views: analytics.totals.views,
  };
  const { data, error } = await supabase.from("social_self_snapshots" as any).insert(row).select().single();
  if (error) throw error;
  return data as any;
}

// ── Reference websites enrichment (Linkup deep-search of competitor/topic sites) ──
export async function enrichFromWebsites(websites?: string[]) {
  return supabase.functions.invoke("enrich-from-websites", { body: websites ? { websites } : {} });
}

export async function listWebsiteEnrichments() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase
    .from("social_website_enrichments" as any)
    .select("*")
    .eq("user_id", u)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as any[]) ?? [];
}

// ── RSS feeds ──
export async function listRssFeeds() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_rss_feeds" as any).select("*").eq("user_id", u).order("created_at", { ascending: false });
  return (data as any[]) ?? [];
}
export async function createRssFeed(p: { feed_url: string; label?: string; cadence?: string }) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_rss_feeds" as any).insert({
    user_id: u, feed_url: p.feed_url.trim(), label: p.label?.trim() || null, cadence: p.cadence || "daily",
  } as any).select().single();
  if (error) throw error; return data;
}
export async function updateRssFeed(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("social_rss_feeds" as any).update(updates).eq("id", id).select().single();
  if (error) throw error; return data;
}
export async function deleteRssFeed(id: string) {
  await supabase.from("social_rss_feeds" as any).delete().eq("id", id);
}
export async function fetchRssNow(feed_id?: string) {
  return supabase.functions.invoke("fetch-rss-articles", { body: feed_id ? { feed_id } : { all_due: false } });
}
export async function fetchAllRssDue() {
  return supabase.functions.invoke("fetch-rss-articles", { body: { all_due: true } });
}

// ── Articles ──
export async function listArticles(filters?: { feed_id?: string; limit?: number }) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("social_articles" as any).select("*").eq("user_id", u).order("published_at", { ascending: false, nullsFirst: false }).limit(filters?.limit ?? 200);
  if (filters?.feed_id) q = q.eq("feed_id", filters.feed_id);
  const { data } = await q; return (data as any[]) ?? [];
}
export async function deleteArticle(id: string) {
  await supabase.from("social_articles" as any).delete().eq("id", id);
}

// ── Hot News ──
export async function listHotNews() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_hot_news" as any).select("*").eq("user_id", u).order("score", { ascending: false });
  return (data as any[]) ?? [];
}
export async function clusterHotNews() {
  return supabase.functions.invoke("cluster-hot-news", { body: {} });
}
export async function deleteHotNews(id: string) {
  await supabase.from("social_hot_news" as any).delete().eq("id", id);
}

export function computeAccountHealth(acc: any) {
  const budget = Number(acc.monthly_budget_usd ?? 5);
  const cost = (Number(acc.posts_used_this_period ?? 0) / 10) * Number(acc.cost_per_10_posts_usd ?? 0.5);
  const remaining = Math.max(0, budget - cost);
  const start = new Date(acc.period_start);
  const periodEnd = new Date(start); periodEnd.setDate(periodEnd.getDate() + 30);
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86400000));
  return { budget, cost, remaining, pct: budget > 0 ? (remaining / budget) * 100 : 0, daysLeft, periodEnd };
}

// Parse "https://console.apify.com/actors/<id>/..." or "apify.com/store/<user>/<actor>" or raw id
export function parseApifyActorId(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("actors");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
    const j = parts.indexOf("store");
    if (j >= 0 && parts[j + 1] && parts[j + 2]) return `${parts[j + 1]}~${parts[j + 2]}`;
    return parts[parts.length - 1] || s;
  } catch {
    const cleaned = s.replace(/^\/+/, "").replace(/\/+$/, "");
    if (cleaned.startsWith("actors/")) return cleaned.split("/")[1] ?? "";
    return cleaned.replace("/", "~");
  }
}

export const FRAMEWORK_OPTIONS = [
  { id: "PPPP", name: "PPPP", description: "Promise · Picture · Proof · Push" },
  { id: "BAB", name: "BAB", description: "Before · After · Bridge" },
  { id: "CIII", name: "CIII", description: "Connect · Inform · Inspire · Interact" },
  { id: "AICPBSAWR", name: "AICPBSAWR", description: "Authority compressed (5 beats)" },
  { id: "Contrarian", name: "Contrarian", description: "Pick a fight with consensus" },
  { id: "BuildInPublic", name: "Build-in-Public", description: "Show your real work" },
  { id: "Listicle", name: "Listicle", description: "Numbered insights · most-saved" },
  { id: "PersonalExperience", name: "Personal Experience", description: "Humanized story · share a real moment or lesson" },
];

// ── Content Studio ──
export async function listContentCategories() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("content_categories" as any).select("*").eq("user_id", u).order("position", { ascending: true });
  return (data as any[]) ?? [];
}
export async function createContentCategory(p: { name: string; slug?: string; color?: string; icon?: string }) {
  const u = await uid(); if (!u) return null;
  const slug = (p.slug || p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data, error } = await supabase.from("content_categories" as any).insert({ user_id: u, name: p.name, slug, color: p.color, icon: p.icon } as any).select().single();
  if (error) throw error; return data;
}
export async function deleteContentCategory(id: string) {
  const { error } = await supabase.from("content_categories" as any).delete().eq("id", id);
  if (error) throw error;
}
export async function updateContentCategory(id: string, updates: { name?: string; slug?: string; color?: string; icon?: string; position?: number }) {
  const patch: Record<string, any> = { ...updates };
  if (updates.name && !updates.slug) {
    patch.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  const { data, error } = await supabase.from("content_categories" as any).update(patch).eq("id", id).select().single();
  if (error) throw error;
  // Also propagate name to denormalized category_name on items
  if (updates.name) {
    await supabase.from("content_items" as any).update({ category_name: updates.name } as any).eq("category_id", id);
  }
  return data;
}
export async function bulkUpdateContentItems(ids: string[], updates: Record<string, any>) {
  if (!ids.length) return;
  const { error } = await supabase.from("content_items" as any).update(updates).in("id", ids);
  if (error) throw error;
}
export async function bulkDeleteContentItems(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("content_items" as any).delete().in("id", ids);
  if (error) throw error;
}

export async function listContentItems(filters?: { category_id?: string; search?: string; level?: string; status?: string; limit?: number }) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("content_items" as any).select("*").eq("user_id", u).order("position", { ascending: true }).limit(filters?.limit ?? 1000);
  if (filters?.category_id) q = q.eq("category_id", filters.category_id);
  if (filters?.level) q = q.eq("level", filters.level);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.search) q = q.ilike("title", `%${filters.search}%`);
  const { data } = await q;
  return (data as any[]) ?? [];
}
export async function createContentItem(p: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("content_items" as any).insert({ ...p, user_id: u } as any).select().single();
  if (error) throw error; return data;
}
export async function updateContentItem(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("content_items" as any).update(updates).eq("id", id).select().single();
  if (error) throw error; return data;
}
export async function deleteContentItem(id: string) {
  const { error } = await supabase.from("content_items" as any).delete().eq("id", id);
  if (error) throw error;
}
export async function seedContentLibrary(force = false) {
  return supabase.functions.invoke("content-studio-seed", { body: { force } });
}
export async function contentStudioAI(args: { action: "nl_filter" | "brainstorm" | "combine" | "web_search"; message?: string; item_ids?: string[]; query?: string }) {
  return supabase.functions.invoke("content-studio-ai", { body: args });
}
export async function listContentChatMessages(limit = 50) {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("content_chat_messages" as any).select("*").eq("user_id", u).order("created_at", { ascending: true }).limit(limit);
  return (data as any[]) ?? [];
}
export async function pushIdeasToPlanner(ideas: Array<{ title: string; hook?: string; key_topics?: string }>) {
  const u = await uid(); if (!u) return null;
  const rows = ideas.map((i) => ({ user_id: u, hook: i.title, body: [i.hook, i.key_topics].filter(Boolean).join("\n\n"), status: "planned", source_kind: "content_studio" }));
  const { data, error } = await supabase.from("social_content_plan" as any).insert(rows as any).select();
  if (error) throw error; return data;
}

// ── Webhook settings (per platform per user) ──
export const PLANNER_PLATFORMS = ["linkedin", "facebook", "instagram", "twitter", "youtube"] as const;
export type PlannerPlatform = typeof PLANNER_PLATFORMS[number];

export async function listWebhookSettings() {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from("social_webhook_settings" as any).select("*").eq("user_id", u);
  return (data as any[]) ?? [];
}
export async function upsertWebhookSetting(p: { platform: PlannerPlatform; webhook_url?: string | null; json_template?: any; active?: boolean }) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_webhook_settings" as any).upsert({ user_id: u, ...p } as any, { onConflict: "user_id,platform" }).select().single();
  if (error) throw error; return data;
}

// ── Planner: send/schedule ──
export async function pushSinglePost(plan_id: string) {
  return supabase.functions.invoke("dispatch-due-posts", { body: { plan_id } });
}
export async function createPlannerPost(p: {
  hook: string; body?: string; image_url?: string;
  scheduled_date?: string; scheduled_time?: string;
  platforms?: string[]; status?: string;
  source_kind?: string; source_content_item_id?: string;
}) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("social_content_plan" as any).insert({ ...p, user_id: u } as any).select().single();
  if (error) throw error; return data;
}
