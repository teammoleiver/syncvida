import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Add a YouTube channel by URL/handle. Resolves to a channel_id, persists the
 * channel row, and immediately fetches the latest batch of videos.
 *
 * Body: { url: string }
 *
 * Strategy:
 *   1. Parse the URL to extract handle/channel_id/custom name
 *   2. Use YouTube Data API if YOUTUBE_API_KEY is set (full backfill)
 *   3. Fall back to YouTube RSS for channel meta + latest 15 videos
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ur } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = ur?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const url: string = String(body?.url ?? "").trim();
    if (!url) return json({ error: "url required" }, 400);

    const apiKey = Deno.env.get("YOUTUBE_API_KEY") ?? "";
    const ident = parseYouTubeIdent(url);
    if (!ident) return json({ error: "Could not parse a channel handle/ID from that URL" }, 400);

    // Priority: Apify (full backfill) → YouTube Data API → public RSS scrape.
    let channel: any = null;
    let apifyVideos: any[] = [];
    const apifyActor = await pickChannelActor(admin, user.id);
    const apifyAccounts = await pickApifyAccounts(admin, user.id);
    if (apifyActor && apifyAccounts.length > 0) {
      const apifyMax = Math.min(1000, Math.max(10, Number((body as any)?.max_results ?? 200)));
      try {
        const r = await fetchChannelApifyWithFallback(admin, apifyAccounts, apifyActor, url, apifyMax);
        channel = r.meta;
        apifyVideos = r.videos;
      } catch (e) {
        console.warn("Apify path failed, falling through:", String((e as Error).message ?? e));
      }
    }
    if (!channel?.channel_id && apiKey) channel = await resolveChannelDataApi(apiKey, ident);
    if (!channel?.channel_id) channel = await resolveChannelRss(ident);
    if (!channel?.channel_id) return json({ error: "Could not resolve this channel. Double-check the URL." }, 404);

    // Upsert channel
    const { data: row, error: upErr } = await admin.from("youtube_channels").upsert({
      user_id: user.id,
      channel_id: channel.channel_id,
      handle: channel.handle ?? ident.handle ?? null,
      title: channel.title ?? null,
      description: channel.description ?? null,
      avatar_url: channel.avatar_url ?? null,
      subscriber_count: channel.subscriber_count ?? null,
      video_count: channel.video_count ?? null,
      view_count: channel.view_count ?? null,
      uploads_playlist_id: channel.uploads_playlist_id ?? null,
      source_url: url,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,channel_id" }).select().single();
    if (upErr) return json({ error: upErr.message }, 500);

    // Use Apify videos if we already pulled them; otherwise fall back to Data API or RSS.
    const videos = apifyVideos.length > 0
      ? apifyVideos
      : apiKey
        ? await fetchVideosDataApi(apiKey, channel.channel_id, channel.uploads_playlist_id ?? null)
        : await fetchVideosRss(channel.channel_id);

    let inserted = 0;
    if (videos.length) {
      const rowsToInsert = videos.map((v) => ({
        user_id: user.id,
        channel_pk: row.id,
        channel_id: channel.channel_id,
        video_id: v.video_id,
        title: v.title,
        description: v.description ?? null,
        published_at: v.published_at,
        thumbnail_url: v.thumbnail_url ?? null,
        view_count: v.view_count ?? null,
        like_count: v.like_count ?? null,
        comment_count: v.comment_count ?? null,
        duration_seconds: v.duration_seconds ?? null,
        source: v.source,
        raw: v.raw ?? null,
      }));
      const { error: insErr, count } = await admin.from("youtube_videos")
        .upsert(rowsToInsert, { onConflict: "user_id,video_id", count: "exact" });
      if (insErr) console.warn("video insert error", insErr.message);
      inserted = count ?? rowsToInsert.length;
    }

    await admin.from("youtube_channels").update({ last_fetched_at: new Date().toISOString() }).eq("id", row.id);

    const sourceUsed = apifyVideos.length > 0 ? "apify" : (apiKey ? "data_api" : "rss");
    return json({ ok: true, channel: row, videos_inserted: inserted, source: sourceUsed });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

/* ─── Parsing helpers ─── */

function parseYouTubeIdent(input: string): { handle?: string; channel_id?: string; user?: string; custom?: string } | null {
  const s = input.trim();
  // Raw channel id
  if (/^UC[\w-]{20,}$/.test(s)) return { channel_id: s };
  // Bare @handle
  if (/^@[\w.-]+$/.test(s)) return { handle: s.slice(1) };
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!u.hostname.includes("youtube.com") && !u.hostname.includes("youtu.be")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    if (parts[0].startsWith("@")) return { handle: parts[0].slice(1) };
    if (parts[0] === "channel" && parts[1]?.startsWith("UC")) return { channel_id: parts[1] };
    if (parts[0] === "c" && parts[1]) return { custom: parts[1] };
    if (parts[0] === "user" && parts[1]) return { user: parts[1] };
    if (parts[0].startsWith("UC")) return { channel_id: parts[0] };
    return null;
  } catch { return null; }
}

/* ─── YouTube Data API path ─── */

async function resolveChannelDataApi(apiKey: string, ident: ReturnType<typeof parseYouTubeIdent>): Promise<any> {
  if (!ident) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("key", apiKey);
  if (ident.channel_id) url.searchParams.set("id", ident.channel_id);
  else if (ident.handle) url.searchParams.set("forHandle", "@" + ident.handle);
  else if (ident.user) url.searchParams.set("forUsername", ident.user);
  else if (ident.custom) {
    // Custom URLs aren't directly resolvable; search for the channel
    const sUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    sUrl.searchParams.set("part", "snippet");
    sUrl.searchParams.set("type", "channel");
    sUrl.searchParams.set("q", ident.custom);
    sUrl.searchParams.set("maxResults", "1");
    sUrl.searchParams.set("key", apiKey);
    const sr = await fetch(sUrl);
    if (!sr.ok) return null;
    const sj = await sr.json();
    const cid = sj.items?.[0]?.snippet?.channelId;
    if (!cid) return null;
    url.searchParams.set("id", cid);
  } else return null;

  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const item = j.items?.[0];
  if (!item) return null;
  return {
    channel_id: item.id,
    handle: item.snippet?.customUrl?.replace(/^@/, "") ?? null,
    title: item.snippet?.title,
    description: item.snippet?.description,
    avatar_url: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
    subscriber_count: Number(item.statistics?.subscriberCount ?? 0) || null,
    video_count: Number(item.statistics?.videoCount ?? 0) || null,
    view_count: Number(item.statistics?.viewCount ?? 0) || null,
    uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

async function fetchVideosDataApi(apiKey: string, channelId: string, uploadsPlaylistId: string | null): Promise<any[]> {
  const playlistId = uploadsPlaylistId ?? ("UU" + channelId.slice(2));
  const out: any[] = [];
  let pageToken: string | null = null;
  // Cap at 200 videos per add to keep quota usage reasonable.
  const MAX = 200;
  while (out.length < MAX) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json();
    const items = (j.items ?? []) as any[];
    if (!items.length) break;
    for (const it of items) {
      out.push({
        video_id: it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId,
        title: it.snippet?.title ?? "",
        description: it.snippet?.description ?? "",
        published_at: it.snippet?.publishedAt ?? null,
        thumbnail_url: it.snippet?.thumbnails?.maxres?.url ?? it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.medium?.url ?? null,
        source: "data_api" as const,
        raw: it,
      });
      if (out.length >= MAX) break;
    }
    pageToken = j.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return out;
}

/* ─── RSS fallback ─── */

async function resolveChannelRss(ident: ReturnType<typeof parseYouTubeIdent>): Promise<any> {
  if (!ident) return null;
  let url: string;
  if (ident.channel_id) url = `https://www.youtube.com/channel/${ident.channel_id}`;
  else if (ident.handle) url = `https://www.youtube.com/@${ident.handle}`;
  else if (ident.user) url = `https://www.youtube.com/user/${ident.user}`;
  else if (ident.custom) url = `https://www.youtube.com/c/${ident.custom}`;
  else return null;

  const html = await fetchYouTubeHtml(url);
  if (!html) return null;
  const channel_id = extractChannelId(html);
  if (!channel_id) return null;
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
  const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  return {
    channel_id,
    handle: ident.handle ?? null,
    title: titleMatch?.[1] ?? null,
    description: descMatch?.[1] ?? null,
    avatar_url: imgMatch?.[1] ?? null,
    uploads_playlist_id: null,
  };
}

async function fetchYouTubeHtml(url: string): Promise<string | null> {
  const u = new URL(url);
  // Force English locale + region so we hit a stable HTML and skip EU consent walls.
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "US");
  u.searchParams.set("persist_hl", "1");
  u.searchParams.set("persist_gl", "1");
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // CONSENT=YES+1 bypasses the EU "before you continue" interstitial that
    // otherwise replaces the channel HTML when the request originates from the EU.
    "Cookie": "CONSENT=YES+1; SOCS=CAI; PREF=hl=en&gl=US",
  };
  const r = await fetch(u.toString(), { headers, redirect: "follow" });
  if (!r.ok) return null;
  return await r.text();
}

function extractChannelId(html: string): string | null {
  // Priority: page-specific signals first, then JSON blob with explicit context,
  // then loose patterns as last resort. The loose patterns match the FIRST
  // channel id in the HTML, which on a channel page is often a sidebar /
  // recommendation entry rather than the channel itself — so they must run last.
  const patterns = [
    /<link rel="canonical" href="[^"]*\/channel\/(UC[\w-]{20,})"/,
    /<meta property="og:url" content="[^"]*\/channel\/(UC[\w-]{20,})"/,
    /<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{20,})"/,
    /"channelMetadataRenderer":\{[^}]*?"externalId":"(UC[\w-]{20,})"/,
    /"c4TabbedHeaderRenderer":\{[^}]*?"channelId":"(UC[\w-]{20,})"/,
    /"pageHeaderRenderer":\{[^}]*?"channelId":"(UC[\w-]{20,})"/,
    // Last-resort generic matches:
    /"externalId":"(UC[\w-]{20,})"/,
    /"channelId":"(UC[\w-]{20,})"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchVideosRss(channelId: string): Promise<any[]> {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!r.ok) return [];
  const xml = await r.text();
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const get = (tag: string) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m?.[1]?.trim();
    };
    const videoId = get("yt:videoId") ?? "";
    return {
      video_id: videoId,
      title: get("title") ?? "",
      description: get("media:description") ?? "",
      published_at: get("published") ?? null,
      thumbnail_url: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
      source: "rss" as const,
    };
  }).filter((v) => v.video_id);
}

/* ─── Apify path (Fast YouTube Channel Scraper) ─── */

type ApifyAccountCandidate = { id: string | null; label: string; token: string; remaining: number; postsUsed: number };

async function pickChannelActor(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.from("apify_actors")
    .select("actor_id")
    .eq("user_id", userId).eq("kind", "youtube_channel").eq("is_default", true)
    .maybeSingle();
  return data?.actor_id ?? Deno.env.get("APIFY_YT_CHANNEL_ACTOR") ?? "67Q6fmd8iedTVcCwY";
}

async function pickApifyAccounts(admin: any, userId: string): Promise<ApifyAccountCandidate[]> {
  const { data } = await admin.from("social_apify_accounts")
    .select("id, label, api_token, monthly_budget_usd, posts_used_this_period, cost_per_10_posts_usd, active, last_used_at")
    .eq("user_id", userId).eq("active", true);
  if (Array.isArray(data) && data.length > 0) {
    return data.map((a: any) => {
      const cost = (Number(a.posts_used_this_period ?? 0) / 10) * Number(a.cost_per_10_posts_usd ?? 0.5);
      return { id: a.id, label: String(a.label ?? "Apify account"), token: a.api_token, remaining: Number(a.monthly_budget_usd ?? 5) - cost, postsUsed: Number(a.posts_used_this_period ?? 0), lastUsedAt: a.last_used_at ? new Date(a.last_used_at).getTime() : 0 };
    }).filter((a: any) => a.token && a.remaining > 0).sort((a: any, b: any) => (b.remaining - a.remaining) || (a.lastUsedAt - b.lastUsedAt));
  }
  const envToken = Deno.env.get("APIFY_API_TOKEN") ?? "";
  return envToken ? [{ id: null, label: "Project Apify token", token: envToken, remaining: Number.POSITIVE_INFINITY, postsUsed: 0 }] : [];
}

async function fetchChannelApifyWithFallback(admin: any, accounts: ApifyAccountCandidate[], actorId: string, sourceUrl: string, maxResults: number): Promise<{ videos: any[]; meta: any | null }> {
  let lastError: Error | null = null;
  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];
    try {
      const result = await fetchChannelApify(account.token, actorId, sourceUrl, maxResults);
      if (account.id && result.videos.length > 0) {
        await admin.from("social_apify_accounts").update({ posts_used_this_period: account.postsUsed + result.videos.length, last_used_at: new Date().toISOString(), last_test_status: "ok", last_test_at: new Date().toISOString() }).eq("id", account.id);
      }
      return result;
    } catch (e) {
      lastError = e as Error;
      if (isApifyUsageLimitError(e)) {
        if (account.id) await admin.from("social_apify_accounts").update({ last_test_status: "usage limit", last_test_at: new Date().toISOString() }).eq("id", account.id);
        console.log(`youtube-add-channel: ${account.label} (${i + 1}/${accounts.length}) hit Apify usage limit; trying next account`);
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error("No Apify account available");
}

function normalizeActorId(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const actorIndex = parts.indexOf("actors");
    if (actorIndex >= 0 && parts[actorIndex + 1]) return parts[actorIndex + 1];
    const storeIndex = parts.indexOf("store");
    if (storeIndex >= 0 && parts[storeIndex + 1] && parts[storeIndex + 2]) return `${parts[storeIndex + 1]}~${parts[storeIndex + 2]}`;
  } catch { /* raw actor id */ }
  const cleaned = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (cleaned.startsWith("actors/")) return cleaned.split("/")[1] ?? "";
  return cleaned.replace("/", "~");
}

function isApifyUsageLimitError(e: unknown): boolean {
  return /monthly usage hard limit exceeded|usage hard limit|not-enough-usage-to-run-paid-actor|exceed your remaining usage|platform-feature-disabled/i.test(String((e as Error)?.message ?? e));
}

async function fetchChannelApify(token: string, actorId: string, sourceUrl: string, maxResults: number): Promise<{ videos: any[]; meta: any | null }> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(normalizeActorId(actorId))}/run-sync-get-dataset-items?token=${token}`;
  const body = {
    maxResults,
    maxResultStreams: 0,
    maxResultsShorts: 0,
    startUrls: [{ url: sourceUrl }],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) return { videos: [], meta: null };
  const videos = items.map(normalizeApifyVideo).filter((v) => v.video_id);
  const meta = extractApifyChannelMeta(items[0]);
  return { videos, meta };
}

function normalizeApifyVideo(it: any) {
  const id = it.id ?? it.videoId ?? it.video_id ?? extractVideoIdFromUrl(it.url ?? it.videoUrl);
  return {
    video_id: id ?? "",
    title: it.title ?? it.name ?? "",
    description: it.text ?? it.description ?? null,
    published_at: parseApifyDate(it.date ?? it.uploadDate ?? it.publishedAt ?? it.published_at),
    thumbnail_url: it.thumbnailUrl ?? it.thumbnail ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null),
    view_count: parseApifyNum(it.viewCount ?? it.views),
    like_count: parseApifyNum(it.likes ?? it.likeCount),
    comment_count: parseApifyNum(it.commentCount ?? it.comments ?? it.commentsCount),
    duration_seconds: parseApifyDuration(it.duration ?? it.length ?? it.durationSeconds),
    source: "apify" as const,
    raw: it,
  };
}

function extractApifyChannelMeta(item: any) {
  const channelUrl: string | undefined = item.channelUrl ?? item.channel?.url;
  const cidFromField = item.channelId ?? item.channel?.id;
  const cidFromUrl = typeof channelUrl === "string" ? channelUrl.match(/\/channel\/(UC[\w-]{20,})/)?.[1] : null;
  const handleFromUrl = typeof channelUrl === "string" ? channelUrl.match(/@([\w.-]+)/)?.[1] : null;
  return {
    channel_id: cidFromField ?? cidFromUrl ?? null,
    handle: item.channelHandle ?? handleFromUrl ?? null,
    title: item.channelName ?? item.channelTitle ?? item.channel?.name ?? null,
    description: null,
    avatar_url: item.channelAvatarUrl ?? item.channel?.avatar ?? null,
    subscriber_count: parseApifyNum(item.numberOfSubscribers ?? item.channel?.subscribers),
    video_count: null,
    view_count: null,
    uploads_playlist_id: null,
  };
}

function extractVideoIdFromUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/) || url.match(/\/shorts\/([\w-]{11})/);
  return m?.[1];
}

function parseApifyNum(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(String(x).replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseApifyDuration(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return Math.round(x);
  const s = String(x).trim();
  if (/^\d+$/.test(s)) return Number(s);
  // HH:MM:SS or MM:SS
  const parts = s.split(":").map((p) => Number(p));
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => Number.isFinite(p))) {
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return null;
}

function parseApifyDate(x: any): string | null {
  if (!x) return null;
  if (typeof x === "number") {
    const ms = x < 1e12 ? x * 1000 : x;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(x).trim();
  if (!s) return null;
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.toISOString();
  // Relative: "1 year ago", "Streamed 2 weeks ago"
  const m = s.replace(/^streamed\s+/i, "").match(/^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const ms: Record<string, number> = {
      second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000,
      week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000,
    };
    return new Date(Date.now() - n * (ms[unit] ?? 0)).toISOString();
  }
  if (/^yesterday/i.test(s)) return new Date(Date.now() - 86_400_000).toISOString();
  if (/^today|^just now/i.test(s)) return new Date().toISOString();
  return null;
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
