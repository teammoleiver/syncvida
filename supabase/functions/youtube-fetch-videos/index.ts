import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Refresh videos for one channel (channel_pk) or all of the user's channels.
 *
 * Body: { channel_pk?: string, max_results?: number }
 *
 * Source priority:
 *   1. Apify Fast YouTube Channel Scraper (full backfill, if APIFY_API_TOKEN set)
 *   2. YouTube Data API (if YOUTUBE_API_KEY set)
 *   3. Public RSS feed (latest 15 only)
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
    const channelPk: string | undefined = body?.channel_pk;
    const apiKey = Deno.env.get("YOUTUBE_API_KEY") ?? "";
    const apifyToken = Deno.env.get("APIFY_API_TOKEN") ?? "";
    const apifyActor = Deno.env.get("APIFY_YT_CHANNEL_ACTOR") ?? "67Q6fmd8iedTVcCwY";
    const apifyMax = Math.min(1000, Math.max(10, Number((body as any)?.max_results ?? 200)));

    let q = admin.from("youtube_channels").select("*").eq("user_id", user.id);
    if (channelPk) q = q.eq("id", channelPk);
    const { data: channels, error } = await q;
    if (error) return json({ error: error.message }, 500);
    if (!channels?.length) return json({ ok: true, channels: 0, new_videos: 0 });

    let totalNew = 0;
    const perChannel: any[] = [];
    for (const ch of channels) {
      try {
        let videos: any[] = [];
        let usedSource = "rss";
        let apifyError: string | null = null;
        if (apifyToken) {
          try {
            const sourceUrl = ch.source_url || (ch.handle ? `https://www.youtube.com/@${ch.handle}` : `https://www.youtube.com/channel/${ch.channel_id}`);
            const r = await fetchChannelApify(apifyToken, apifyActor, sourceUrl, apifyMax);
            videos = r.videos;
            usedSource = "apify";
          } catch (e) {
            apifyError = String((e as Error).message ?? e);
            console.warn("Apify failed for", ch.channel_id, apifyError);
          }
        }
        if (videos.length === 0 && apifyError) {
          // Surface the Apify error to the client instead of silently returning 0.
          perChannel.push({ channel_id: ch.channel_id, fetched: 0, new: 0, source: "apify", error: apifyError });
          continue;
        }
        if (videos.length === 0) {
          perChannel.push({ channel_id: ch.channel_id, fetched: 0, new: 0, source: usedSource });
          continue;
        }
        const rows = videos.map((v) => ({
          user_id: user.id,
          channel_pk: ch.id,
          channel_id: ch.channel_id,
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
        const incomingIds = rows.map((r) => r.video_id);
        const { data: existing } = await admin.from("youtube_videos")
          .select("video_id").eq("user_id", user.id).in("video_id", incomingIds);
        const existingSet = new Set((existing ?? []).map((x: any) => x.video_id));
        const newCount = rows.filter((r) => !existingSet.has(r.video_id)).length;
        await admin.from("youtube_videos").upsert(rows, { onConflict: "user_id,video_id" });
        await admin.from("youtube_channels").update({ last_fetched_at: new Date().toISOString() }).eq("id", ch.id);
        totalNew += newCount;
        perChannel.push({ channel_id: ch.channel_id, fetched: rows.length, new: newCount, source: usedSource });
      } catch (e: any) {
        perChannel.push({ channel_id: ch.channel_id, error: String(e?.message ?? e) });
      }
    }
    return json({ ok: true, channels: channels.length, new_videos: totalNew, perChannel });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function fetchVideosDataApi(apiKey: string, channelId: string, uploadsPlaylistId: string | null): Promise<any[]> {
  const playlistId = uploadsPlaylistId ?? ("UU" + channelId.slice(2));
  const out: any[] = [];
  let pageToken: string | null = null;
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

async function fetchChannelApify(token: string, actorId: string, sourceUrl: string, maxResults: number): Promise<{ videos: any[]; meta: any | null }> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
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
  return { videos, meta: null };
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
  const parts = s.split(":").map((p) => Number(p));
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => Number.isFinite(p))) {
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return null;
}

function parseApifyDate(x: any): string | null {
  if (!x) return null;
  // ISO / numeric timestamps first
  if (typeof x === "number") {
    const ms = x < 1e12 ? x * 1000 : x;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(x).trim();
  if (!s) return null;
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.toISOString();
  // Relative dates: "1 year ago", "Streamed 2 weeks ago", "3 days ago"
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
