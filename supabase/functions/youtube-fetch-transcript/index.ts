import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fetch the transcript of a YouTube video using the user's configured Apify
 * actor for kind='youtube_video_transcript'. Saves the transcript on the
 * youtube_videos row and returns it.
 *
 * Body: { video_id: string }
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
    const videoId = String(body?.video_id ?? "").trim();
    if (!videoId) return json({ error: "video_id required" }, 400);

    const { data: vid } = await admin.from("youtube_videos")
      .select("id, video_id, title, transcript")
      .eq("user_id", user.id).eq("video_id", videoId).maybeSingle();
    if (!vid) return json({ error: "Video not found" }, 404);

    if (vid.transcript && vid.transcript.length > 50 && body?.refresh !== true) {
      return json({ ok: true, transcript: vid.transcript, cached: true });
    }

    const freeResult = await fetchYouTubeTimedTextTranscript(videoId);
    const freeTranscript = freeResult.text;
    // Default to allowing Apify fallback: YouTube actively bot-blocks Supabase
    // Edge, so without Apify most videos cannot be transcribed. Older frontend
    // bundles sent allow_apify:false by default, so only skip on an explicit
    // skip_apify flag.
    const allowApifyFallback = body?.skip_apify !== true;
    if (!freeTranscript && !allowApifyFallback) {
      console.log(`youtube-fetch-transcript: no public captions; apify skipped video_id=${videoId} trace=${JSON.stringify(freeResult.trace).slice(0, 1600)}`);
      return json({
        ok: false,
        message: freeResult.trace.some((t: any) => t?.playability === "LOGIN_REQUIRED")
          ? "YouTube is blocking transcript access from the Supabase Edge server with bot detection. No Apify credits were used. Use Retry with Apify only if you want to spend actor credits, or connect a dedicated transcript API/proxy."
          : "No public YouTube captions were found for this video. The app did not run Apify, so no Apify credits were used.",
        error_type: freeResult.trace.some((t: any) => t?.playability === "LOGIN_REQUIRED") ? "youtube-bot-blocked" : "youtube-captions-unavailable",
        fallback: true,
        debug: freeResult.trace,
      }, 200);
    }
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const actorId = freeTranscript ? null : await pickTranscriptActor(admin, user.id);
    if (!freeTranscript && !actorId) return json({ ok: false, message: "No youtube_video_transcript actor configured. Add one in Social Hub → Settings → Apify actors.", fallback: true }, 200);
    const tokenCandidates = freeTranscript ? [] : await pickApifyTokens(admin, user.id);
    if (!freeTranscript && tokenCandidates.length === 0) return json({ ok: false, message: "No Apify token available. Add one in Social Hub → Settings → Apify account pool.", fallback: true }, 200);
    const transcript = freeTranscript ?? await runTranscriptActorWithFallback(tokenCandidates, actorId!, videoUrl);
    if (!transcript) {
      return json({
        ok: false,
        message: "No transcript available for this video. Captions may be disabled, and the transcript actor did not return readable text.",
        fallback: true,
      }, 200);
    }

    await admin.from("youtube_videos").update({
      transcript,
      transcript_fetched_at: new Date().toISOString(),
      transcript_source: freeTranscript ? "youtube_timedtext" : "apify",
    }).eq("id", vid.id);

    console.log(`youtube-fetch-transcript: saved transcript source=${freeTranscript ? "youtube_timedtext" : "apify"} video_id=${videoId} chars=${transcript.length}`);

    return json({ ok: true, transcript, cached: false });
  } catch (e) {
    if (e instanceof ApifyActorError) {
      return json({ ok: false, message: e.userMessage, error_type: e.type, action_url: e.actionUrl, fallback: true }, 200);
    }
    const fallback = apifyFallbackFromUnknownError(e);
    if (fallback) return json(fallback, 200);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function pickTranscriptActor(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.from("apify_actors")
    .select("actor_id")
    .eq("user_id", userId).eq("kind", "youtube_video_transcript").eq("is_default", true)
    .maybeSingle();
  if (data?.actor_id) return data.actor_id as string;
  return Deno.env.get("APIFY_YT_TRANSCRIPT_ACTOR") ?? null;
}

async function pickApifyTokens(admin: any, userId: string): Promise<string[]> {
  const { data } = await admin.from("social_apify_accounts")
    .select("api_token, monthly_budget_usd, posts_used_this_period, cost_per_10_posts_usd, active")
    .eq("user_id", userId).eq("active", true);
  if (Array.isArray(data) && data.length > 0) {
    const ranked = data
      .map((a: any) => {
        const cost = (Number(a.posts_used_this_period ?? 0) / 10) * Number(a.cost_per_10_posts_usd ?? 0.5);
        return { token: a.api_token as string, remaining: Number(a.monthly_budget_usd ?? 5) - cost };
      })
      .filter((x) => x.token && x.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
    if (ranked.length > 0) return ranked.map((x) => x.token);
  }
  const envToken = Deno.env.get("APIFY_API_TOKEN") ?? "";
  return envToken ? [envToken] : [];
}

async function runTranscriptActorWithFallback(tokens: string[], actorId: string, videoUrl: string): Promise<string | null> {
  let lastCreditError: ApifyActorError | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    try {
      const transcript = await runTranscriptActor(tokens[i], actorId, videoUrl);
      if (transcript) return transcript;
    } catch (e) {
      if (e instanceof ApifyActorError && e.isCreditError) {
        lastCreditError = e;
        console.log(`youtube-fetch-transcript: Apify token ${i + 1}/${tokens.length} lacks credits; trying next token`);
        continue;
      }
      throw e;
    }
  }
  if (lastCreditError) throw lastCreditError;
  return null;
}

async function runTranscriptActor(token: string, actorId: string, videoUrl: string): Promise<string | null> {
  // Send several common field names so the actor's expected schema is covered.
  const url = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`);
  url.searchParams.set("token", token);
  url.searchParams.set("maxItems", "10");
  url.searchParams.set("maxTotalChargeUsd", "1");

  const body: Record<string, any> = {
    videoUrls: [videoUrl],
    startUrls: [{ url: videoUrl }],
    videoUrl,
    url: videoUrl,
    urls: [videoUrl],
    language: "en",
    languages: ["en"],
    subtitlesLanguage: "en",
    maxItems: 10,
    maxResults: 10,
    maxResultStreams: 10,
    maxTotalChargeUsd: 1,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw ApifyActorError.fromResponse(res.status, await res.text());
  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) return null;
  return extractTranscriptFromItems(items);
}

type TranscriptFetchResult = { text: string | null; trace: Record<string, unknown>[] };

async function fetchYouTubeTimedTextTranscript(videoId: string): Promise<TranscriptFetchResult> {
  const trace: Record<string, unknown>[] = [];
  const innerTubeTranscript = await fetchYouTubeInnerTubeTranscript(videoId, trace);
  if (innerTubeTranscript) return { text: innerTubeTranscript, trace };

  const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": WEB_USER_AGENT,
    },
  }).then((r) => r.ok ? r.text() : "").catch(() => "");
  const captionTracks = watch.match(/"captionTracks":(\[.*?\])/)?.[1];
  if (!captionTracks) return { text: null, trace };

  let tracks: any[] = [];
  try { tracks = JSON.parse(captionTracks.replace(/\\u0026/g, "&")); } catch { return { text: null, trace }; }
  const track = tracks.find((t: any) => String(t.languageCode).startsWith("en")) ?? tracks[0];
  const baseUrl = track?.baseUrl;
  if (!baseUrl) return { text: null, trace };

  const transcriptRes = await fetch(`${baseUrl}&fmt=srv3`, { headers: { "User-Agent": WEB_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" } });
  const xml = await transcriptRes.text();
  const text = parseTimedTextXml(xml);
  trace.push({ stage: "watch_html", tracks: tracks.length, transcriptStatus: transcriptRes.status, chars: text.length });
  return { text: text.length > 50 ? text : null, trace };
}

const WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const ANDROID_YOUTUBE_VERSION = "20.10.38";
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_YOUTUBE_VERSION} (Linux; U; Android 14)`;
const IOS_YOUTUBE_VERSION = "20.10.4";
const IOS_USER_AGENT = `com.google.ios.youtube/${IOS_YOUTUBE_VERSION} (iPhone16,2; U; CPU iOS 17_5 like Mac OS X;)`;

const INNERTUBE_CLIENTS = [
  { name: "ANDROID", version: ANDROID_YOUTUBE_VERSION, userAgent: ANDROID_USER_AGENT },
  { name: "IOS", version: IOS_YOUTUBE_VERSION, userAgent: IOS_USER_AGENT },
  { name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", version: "2.0", userAgent: WEB_USER_AGENT },
] as const;

async function fetchYouTubeInnerTubeTranscript(videoId: string, trace: Record<string, unknown>[]): Promise<string | null> {
  for (const client of INNERTUBE_CLIENTS) {
    const text = await fetchYouTubeInnerTubeTranscriptForClient(videoId, client, trace);
    if (text) return text;
  }
  return null;
}

async function fetchYouTubeInnerTubeTranscriptForClient(videoId: string, client: typeof INNERTUBE_CLIENTS[number], trace: Record<string, unknown>[]): Promise<string | null> {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": client.userAgent,
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({
        context: { client: { clientName: client.name, clientVersion: client.version, hl: "en", gl: "US" } },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    if (!res.ok) {
      trace.push({ stage: "innertube", client: client.name, status: res.status, tracks: 0 });
      return null;
    }
    const data = await res.json().catch(() => null);
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    trace.push({ stage: "innertube", client: client.name, status: res.status, playability: data?.playabilityStatus?.status, reason: data?.playabilityStatus?.reason, tracks: Array.isArray(tracks) ? tracks.length : 0 });
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    const track = pickBestCaptionTrack(tracks);
    const baseUrl = String(track?.baseUrl ?? "");
    if (!isSafeYouTubeCaptionUrl(baseUrl)) return null;

    const text = await fetchCaptionTrackText(baseUrl, client.userAgent, trace, { client: client.name, language: track?.languageCode, kind: track?.kind ?? "manual" });
    return text.length > 50 ? text : null;
  } catch (error) {
    trace.push({ stage: "innertube", client: client.name, error: String((error as Error)?.message ?? error) });
    return null;
  }
}

async function fetchCaptionTrackText(baseUrl: string, userAgent: string, trace: Record<string, unknown>[], meta: Record<string, unknown>): Promise<string> {
  const urls = [baseUrl, appendCaptionParam(baseUrl, "fmt", "json3"), appendCaptionParam(baseUrl, "fmt", "srv3")];
  for (const url of urls) {
    const format = new URL(url).searchParams.get("fmt") ?? "xml";
    const transcriptRes = await fetch(url, { headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" } });
    if (!transcriptRes.ok) {
      trace.push({ stage: "timedtext", ...meta, format, status: transcriptRes.status, chars: 0 });
      continue;
    }
    const raw = await transcriptRes.text();
    const text = raw.trim().startsWith("{") ? parseTimedTextJson3(raw) : parseTimedTextXml(raw);
    trace.push({ stage: "timedtext", ...meta, format, status: transcriptRes.status, contentType: transcriptRes.headers.get("content-type"), rawChars: raw.length, chars: text.length });
    if (text.length > 50) return text;
  }
  return "";
}

function appendCaptionParam(input: string, key: string, value: string): string {
  const url = new URL(input);
  url.searchParams.set(key, value);
  return url.toString();
}

function pickBestCaptionTrack(tracks: any[]): any {
  return tracks.find((t) => t?.languageCode === "en" && t?.kind !== "asr")
    ?? tracks.find((t) => String(t?.languageCode ?? "").startsWith("en"))
    ?? tracks[0];
}

function isSafeYouTubeCaptionUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && (url.hostname === "www.youtube.com" || url.hostname.endsWith(".youtube.com") || url.hostname === "video.google.com");
  } catch {
    return false;
  }
}

function parseTimedTextXml(xml: string): string {
  const srv3 = Array.from(xml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g))
    .map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, "")))
    .join(" ");
  const classic = Array.from(xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g))
    .map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, " ")))
    .join(" ");
  return `${srv3} ${classic}`.replace(/\s+/g, " ").trim();
}

function parseTimedTextJson3(raw: string): string {
  try {
    const data = JSON.parse(raw);
    return (Array.isArray(data?.events) ? data.events : [])
      .flatMap((event: any) => Array.isArray(event?.segs) ? event.segs : [])
      .map((seg: any) => typeof seg?.utf8 === "string" ? seg.utf8 : "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

class ApifyActorError extends Error {
  type: string;
  userMessage: string;
  actionUrl?: string;
  isCreditError: boolean;

  constructor(type: string, userMessage: string, actionUrl?: string, isCreditError = false) {
    super(userMessage);
    this.type = type;
    this.userMessage = userMessage;
    this.actionUrl = actionUrl;
    this.isCreditError = isCreditError;
  }

  static fromResponse(status: number, text: string): ApifyActorError {
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* keep null */ }
    const type = parsed?.error?.type ?? `apify-${status}`;
    const message = parsed?.error?.message ?? text;
    if (status === 402 || type === "not-enough-usage-to-run-paid-actor") {
      return new ApifyActorError(type, "All configured Apify accounts were tried, but none had enough usage credit to run this paid transcript actor. Add credits or upgrade an Apify account, then try again.", "https://console.apify.com/billing/subscription", true);
    }
    if (type === "max-items-must-be-greater-than-zero") {
      return new ApifyActorError(type, "Apify rejected the actor run limit. The app now sends positive maxItems and maxTotalChargeUsd values; if this keeps happening, switch this channel to another YouTube transcript actor in Social Hub settings.");
    }
    return new ApifyActorError(type, `Apify ${status}: ${message}`);
  }
}

function apifyFallbackFromUnknownError(e: unknown) {
  const raw = String((e as Error)?.message ?? e ?? "");
  if (!raw.includes("Apify")) return null;
  if (raw.includes("max-items-must-be-greater-than-zero") || raw.includes("Maximum charged results must be greater than zero")) {
    return {
      ok: false,
      message: "Apify rejected this transcript actor's charged-results limit even though the app sends positive limits. Try a different YouTube transcript actor in Social Hub settings, or use a video with public YouTube captions.",
      error_type: "max-items-must-be-greater-than-zero",
      fallback: true,
    };
  }
  if (raw.includes("not-enough-usage-to-run-paid-actor") || raw.includes("exceed your remaining usage")) {
    return {
      ok: false,
      message: "Apify does not have enough usage credit to run this paid transcript actor. Add credits or upgrade the Apify account, then try again.",
      error_type: "not-enough-usage-to-run-paid-actor",
      action_url: "https://console.apify.com/billing/subscription",
      fallback: true,
    };
  }
  return { ok: false, message: raw, error_type: "apify-error", fallback: true };
}

function extractTranscriptFromItems(items: any[]): string | null {
  const TEXT_KEYS = ["transcript", "text", "fullText", "subtitles_text", "plainText", "content", "caption"];
  const ARRAY_KEYS = ["subtitles", "transcript", "segments", "captions", "lines", "items", "data", "tracks"];

  const joinSegments = (arr: any[]): string =>
    arr
      .map((s: any) => (typeof s === "string" ? s : s?.text ?? s?.snippet ?? s?.line ?? s?.content ?? ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  // Recursive search through any nested object
  const walk = (node: any, depth = 0): string | null => {
    if (!node || depth > 6) return null;
    if (typeof node === "string") {
      return node.trim().length > 50 ? node.trim() : null;
    }
    if (Array.isArray(node)) {
      const joined = joinSegments(node);
      if (joined.length > 50) return joined;
      for (const child of node) {
        const r = walk(child, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const k of TEXT_KEYS) {
        const v = node[k];
        if (typeof v === "string" && v.trim().length > 50) return v.trim();
      }
      for (const k of ARRAY_KEYS) {
        const v = node[k];
        if (Array.isArray(v) && v.length > 0) {
          const joined = joinSegments(v);
          if (joined.length > 50) return joined;
        }
      }
      for (const v of Object.values(node)) {
        const r = walk(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  };

  return walk(items);
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

