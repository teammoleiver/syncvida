import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cron-only refresher: iterates ALL youtube_channels rows across ALL users
 * and pulls each channel's latest videos via the public RSS feed (no API key).
 * Inserts only video_ids that aren't already in the user's library.
 *
 * Triggered every 3 days by pg_cron. Auth: relies on the Supabase platform's
 * JWT verification of the anon key passed by pg_cron + the service-role
 * client used internally for DB writes.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Cron-only: require service role bearer to prevent anonymous quota burn.
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer || bearer !== serviceKey) {
      return json({ error: "Unauthorized" }, 401);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const apiKey = Deno.env.get("YOUTUBE_API_KEY") ?? "";

    const { data: channels, error } = await admin.from("youtube_channels").select("*");
    if (error) return json({ error: error.message }, 500);
    if (!channels?.length) return json({ ok: true, channels: 0, new_videos: 0 });

    let totalNew = 0;
    const perChannel: any[] = [];
    for (const ch of channels) {
      try {
        const videos = apiKey
          ? await fetchVideosDataApi(apiKey, ch.channel_id, ch.uploads_playlist_id)
          : await fetchVideosRss(ch.channel_id);
        if (videos.length === 0) {
          perChannel.push({ user_id: ch.user_id, channel_id: ch.channel_id, fetched: 0, new: 0 });
          continue;
        }
        const rows = videos.map((v) => ({
          user_id: ch.user_id,
          channel_pk: ch.id,
          channel_id: ch.channel_id,
          video_id: v.video_id,
          title: v.title,
          description: v.description ?? null,
          published_at: v.published_at,
          thumbnail_url: v.thumbnail_url ?? null,
          source: v.source,
          raw: v.raw ?? null,
        }));
        const incomingIds = rows.map((r) => r.video_id);
        const { data: existing } = await admin.from("youtube_videos")
          .select("video_id").eq("user_id", ch.user_id).in("video_id", incomingIds);
        const existingSet = new Set((existing ?? []).map((x: any) => x.video_id));
        const newCount = rows.filter((r) => !existingSet.has(r.video_id)).length;
        await admin.from("youtube_videos").upsert(rows, { onConflict: "user_id,video_id" });
        await admin.from("youtube_channels").update({ last_fetched_at: new Date().toISOString() }).eq("id", ch.id);
        totalNew += newCount;
        perChannel.push({ user_id: ch.user_id, channel_id: ch.channel_id, fetched: rows.length, new: newCount });
      } catch (e: any) {
        perChannel.push({ user_id: ch.user_id, channel_id: ch.channel_id, error: String(e?.message ?? e) });
      }
    }

    return json({ ok: true, channels: channels.length, new_videos: totalNew, perChannel, source: apiKey ? "data_api" : "rss" });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function fetchVideosDataApi(apiKey: string, channelId: string, uploadsPlaylistId: string | null): Promise<any[]> {
  const playlistId = uploadsPlaylistId ?? ("UU" + channelId.slice(2));
  const out: any[] = [];
  let pageToken: string | null = null;
  // Cron only pulls the latest page (50) — full backfill happens on add.
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);
  const r = await fetch(url);
  if (!r.ok) return out;
  const j = await r.json();
  const items = (j.items ?? []) as any[];
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

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
