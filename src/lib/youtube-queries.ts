import { supabase } from "@/integrations/supabase/client";

export type YouTubeChannel = {
  id: string;
  user_id: string;
  channel_id: string;
  handle: string | null;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number | null;
  video_count: number | null;
  view_count: number | null;
  uploads_playlist_id: string | null;
  source_url: string;
  last_fetched_at: string | null;
  last_seen_at: string;
  notify_new: boolean;
  created_at: string;
  updated_at: string;
};

export type YouTubeVideo = {
  id: string;
  user_id: string;
  channel_pk: string;
  channel_id: string;
  video_id: string;
  title: string;
  description: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  source: "rss" | "data_api" | "apify";
  fetched_at: string;
  has_transcript?: boolean;
  transcript_fetched_at?: string | null;
  is_liked?: boolean;
  summary_points?: SummaryPoint[] | null;
};

export type AskAnswer = {
  answer: string;
  sources: { n: number; video_id: string; title: string; url: string; channel: string; published_at: string | null }[];
  video_count: number;
};

async function callEdge<T>(fn: string, body: any): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL ?? "https://vpsaonpsidmuzufhlbis.supabase.co"}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = parsed?.error || text || `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { debug?: any };
    if (parsed?.debug) err.debug = parsed.debug;
    throw err;
  }
  if (parsed?.error) {
    const err = new Error(parsed.error) as Error & { debug?: any };
    if (parsed?.debug) err.debug = parsed.debug;
    throw err;
  }
  return (parsed as T) ?? ({} as T);
}

export async function listYouTubeChannels(): Promise<YouTubeChannel[]> {
  const { data, error } = await supabase
    .from("youtube_channels" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown) as YouTubeChannel[];
}

export async function addYouTubeChannel(url: string): Promise<{ channel: YouTubeChannel; videos_inserted: number; source: string }> {
  return callEdge("youtube-add-channel", { url });
}

/**
 * Refresh videos for a channel. `max` controls how many of the channel's
 * latest videos to pull from Apify — keep small (10–20) for normal refreshes
 * to save credits, since duplicates are skipped server-side.
 */
export async function refreshYouTubeChannel(channel_pk?: string, max = 15): Promise<{ ok: boolean; channels: number; new_videos: number; perChannel: any[] }> {
  return callEdge("youtube-fetch-videos", { channel_pk, max_results: max });
}

export async function markChannelSeen(id: string): Promise<void> {
  const { error } = await supabase
    .from("youtube_channels" as any)
    .update({ last_seen_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteYouTubeChannel(id: string): Promise<void> {
  const { error } = await supabase.from("youtube_channels" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function setNotifyNew(id: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from("youtube_channels" as any)
    .update({ notify_new: notify } as any)
    .eq("id", id);
  if (error) throw error;
}

export type ListVideosArgs = {
  channelPks?: string[];
  query?: string;
  fromIso?: string | null;
  toIso?: string | null;
  sort?: "newest" | "oldest";
  limit?: number;
};

export async function listYouTubeVideos(args: ListVideosArgs = {}): Promise<YouTubeVideo[]> {
  const { channelPks, query, fromIso, toIso, sort = "newest", limit = 200 } = args;
  // Select known columns explicitly so we can include transcript_fetched_at
  // without dragging the full transcript text into every list response.
  let q = supabase.from("youtube_videos" as any).select(
    "id, user_id, channel_pk, channel_id, video_id, title, description, published_at, thumbnail_url, view_count, like_count, comment_count, duration_seconds, source, fetched_at, transcript_fetched_at, is_liked"
  ).limit(limit);
  if (channelPks?.length) q = q.in("channel_pk", channelPks);
  if (fromIso) q = q.gte("published_at", fromIso);
  if (toIso) q = q.lte("published_at", toIso);
  if (query?.trim()) {
    const safe = query.trim().replace(/[%_]/g, "\\$&");
    q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  q = q.order("published_at", { ascending: sort === "oldest", nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((v) => ({
    ...v,
    has_transcript: !!v.transcript_fetched_at,
  })) as YouTubeVideo[];
}

export async function askYouTubeAi(question: string, channelPks: string[] = [], limit = 60): Promise<AskAnswer> {
  return callEdge("youtube-ai-ask", { question, channel_pks: channelPks, limit });
}

export type VideoIdea = { hook: string; body: string; angle: string; format: string };
export type VideoPost = { platform: "linkedin" | "twitter" | "instagram"; hook: string; body: string; hashtags: string[]; length: number };
export type SummaryPoint = { headline: string; detail: string };

export async function fetchVideoTranscript(video_id: string, refresh = false): Promise<{ transcript: string; cached: boolean }> {
  return callEdge("youtube-fetch-transcript", { video_id, refresh });
}

export async function generateVideoIdeas(video_id: string, count = 7, refresh = false): Promise<{ ideas: VideoIdea[]; cached?: boolean; source_video: { video_id: string; title: string; channel: string } }> {
  return callEdge("youtube-video-ideas", { video_id, count, refresh });
}

export async function generateVideoPosts(video_id: string, count = 5, platforms: string[] = ["linkedin", "twitter", "instagram"], refresh = false): Promise<{ posts: VideoPost[]; cached?: boolean; source_video: { video_id: string; title: string; channel: string } }> {
  return callEdge("youtube-video-posts", { video_id, count, platforms, refresh });
}

export async function generateVideoSummary(video_id: string, refresh = false): Promise<{ points: SummaryPoint[]; cached: boolean }> {
  return callEdge("youtube-video-summary", { video_id, refresh });
}

export type MultiVideoTheme = { label: string; sources: number[] };
export type MultiVideoSource = { n: number; video_id: string; title: string; channel: string; url: string };
export type MultiVideoIdea = VideoIdea & { sources: number[] };
export type MultiVideoPost = VideoPost & { sources: number[] };
export type MultiVideoResult = {
  themes: MultiVideoTheme[];
  ideas: MultiVideoIdea[];
  posts: MultiVideoPost[];
  next_steps: string[];
  sources: MultiVideoSource[];
  ai_unavailable?: boolean;
  warning?: string;
  provider?: string;
};

/**
 * Generate combined ideas + posts across N transcribed videos. The model is
 * told to look across sources for shared themes, contradictions, and gaps —
 * not just summarize each one in isolation.
 */
export async function generateMultiVideoContent(args: {
  video_ids: string[];
  mode?: "ideas" | "posts" | "both";
  count?: number;
  platforms?: string[];
  intent?: string;
  fallback_videos?: Pick<YouTubeVideo, "video_id" | "title" | "description" | "channel_id">[];
}): Promise<MultiVideoResult> {
  let result: Partial<MultiVideoResult>;
  try {
    result = await callEdge<Partial<MultiVideoResult>>("youtube-multi-video-content", args);
  } catch (e: any) {
    if (String(e?.message ?? "").toLowerCase().includes("ai credits exhausted")) {
      return buildLocalMultiVideoFallback(args);
    }
    throw e;
  }
  return {
    themes: Array.isArray(result.themes) ? result.themes : [],
    ideas: Array.isArray(result.ideas) ? result.ideas : [],
    posts: Array.isArray(result.posts) ? result.posts : [],
    next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
    sources: Array.isArray(result.sources) ? result.sources : [],
    ai_unavailable: !!result.ai_unavailable,
    warning: result.warning,
    provider: typeof result.provider === "string" ? result.provider : undefined,
  };
}

function buildLocalMultiVideoFallback(args: { count?: number; platforms?: string[]; intent?: string; fallback_videos?: Pick<YouTubeVideo, "video_id" | "title" | "description" | "channel_id">[] }): MultiVideoResult {
  const videos = args.fallback_videos ?? [];
  const sources = videos.map((v, i) => ({ n: i + 1, video_id: v.video_id, title: v.title, channel: v.channel_id, url: `https://www.youtube.com/watch?v=${v.video_id}` }));
  const words = topLocalKeywords(videos.map((v) => `${v.title} ${v.description ?? ""}`).join(" "));
  const theme = words.slice(0, 3).join(" + ") || "shared content angle";
  const sourceNums = sources.map((s) => s.n);
  const count = Math.min(Math.max(args.count ?? 5, 3), 8);
  const ideas: MultiVideoIdea[] = Array.from({ length: count }, (_, i) => {
    const source = sources[i % Math.max(sources.length, 1)];
    const other = sourceNums.find((n) => n !== source?.n) ?? source?.n ?? 1;
    const keyword = toTitleCase(words[i % Math.max(words.length, 1)] ?? "idea");
    return {
      hook: [
        `The hidden pattern behind ${keyword}`,
        `Most people miss this angle on ${keyword}`,
        `I compared multiple takes on ${keyword}`,
        `The smarter way to think about ${keyword}`,
      ][i % 4],
      body: `${args.intent ? `${args.intent}\n\n` : ""}Connect ${source?.title ?? "the selected videos"} with the repeated pattern across the sources: ${theme}. Build the post around one clear POV, one concrete example, and one practical takeaway.`,
      angle: `Combine S${source?.n ?? 1} with S${other} instead of posting a single-video summary.`,
      format: ["insight", "framework", "contrarian", "tutorial"][i % 4],
      sources: [...new Set([source?.n ?? 1, other])],
    };
  });
  const posts: MultiVideoPost[] = (args.platforms?.length ? args.platforms : ["linkedin", "twitter", "instagram"]).slice(0, 3).map((platform, i) => {
    const idea = ideas[i % ideas.length];
    const body = buildLocalStructuredPost(platform, idea, theme, words, args.intent);
    return {
      platform: platform as any,
      hook: idea?.hook ?? "A stronger cross-video angle",
      body,
      hashtags: words.slice(0, 3),
      length: body.length,
      sources: idea?.sources ?? sourceNums,
    };
  });
  return {
    themes: [
      { label: toTitleCase(theme), sources: sourceNums },
      { label: "Different examples of the same audience problem", sources: sourceNums },
      { label: "Reusable lessons for original social posts", sources: sourceNums },
    ],
    ideas,
    posts: posts.map((p) => ({ ...p, length: p.body.length })),
    next_steps: ["Review the strongest cross-video angle", "Personalize the opening line", "Add the best post to the planner"],
    sources,
    ai_unavailable: true,
    warning: "AI providers are unavailable, so local drafts were generated from the selected video titles and descriptions.",
  };
}

function buildLocalStructuredPost(platform: string, idea: MultiVideoIdea | undefined, theme: string, words: string[], intent?: string) {
  const hook = idea?.hook ?? "A stronger cross-video angle";
  const body = idea?.body ?? "Use the selected videos as one combined source of inspiration.";
  if (platform === "twitter") {
    return `${hook}\n\nThe useful insight is rarely inside one video. It is in the pattern across sources: ${theme}.\n\nTurn that overlap into one claim, one example, and one practical takeaway. That is how a simple recap becomes an original post.`;
  }
  const topic = toTitleCase(words.slice(0, 2).join(" and ") || "This Topic");
  return `${hook}\n\nI would not treat these videos as separate ideas.\n\nThe stronger move is to read them together and look for the repeated pattern: ${theme}.\n\nThat is where original content starts. Not with a recap. Not with a list of tips. With a clear point of view about what all the examples reveal.\n\n${intent ? `${intent}\n\n` : ""}${body}\n\nThe practical takeaway:\n\nWhen multiple sources point to the same problem, name the pattern first. Then show the tension. Then give the reader one next step they can apply today.\n\nFor ${topic}, the question is not “what did this video say?”\n\nIt is: “what system is hiding underneath these examples?”\n\nThat is usually the post worth publishing.\n\nWhat pattern would you pull from these sources?`;
}

function topLocalKeywords(text: string) {
  const stop = new Set("about after again also and are but can for from have how into more most not only should that the their them then these they this use using video videos what when which with your".split(" "));
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    if (!stop.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word]) => word);
}

function toTitleCase(text: string) {
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function toggleVideoLike(video_id: string, liked: boolean): Promise<void> {
  const { error } = await supabase
    .from("youtube_videos" as any)
    .update({ is_liked: liked } as any)
    .eq("video_id", video_id);
  if (error) throw error;
}

export async function addPointToTasks(point: SummaryPoint, source: { video_id: string; title: string; channel: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const url = `https://www.youtube.com/watch?v=${source.video_id}`;
  const { data, error } = await supabase.from("tasks" as any).insert({
    user_id: user.id,
    title: point.headline,
    description: point.detail,
    column_id: "col_inbox",
    status: "inbox",
    tags: ["youtube"] as any,
    source: {
      kind: "youtube_video",
      video_id: source.video_id,
      video_title: source.title,
      channel: source.channel,
      url,
      headline: point.headline,
      detail: point.detail,
    } as any,
  } as any).select().single();
  if (error) throw error;
  return data;
}

export async function addPostToPlanner(post: VideoPost, source: { video_id: string; title: string; channel: string }, schedule?: Schedule) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const sourceNote = `From YouTube: "${source.title}" by ${source.channel} (https://www.youtube.com/watch?v=${source.video_id})`;
  const sched = schedule ?? { scheduled_date: null, scheduled_time: null };
  const { data, error } = await supabase.from("social_content_plan" as any).insert({
    user_id: user.id,
    hook: post.hook || post.body.split("\n")[0].slice(0, 120),
    body: post.body,
    format: "social-post",
    pillar: "general",
    status: "planned",
    platforms: [post.platform] as any,
    notes: sourceNote,
    source_kind: "youtube",
    scheduled_date: sched.scheduled_date,
    scheduled_time: sched.scheduled_time,
    scheduled_at: buildScheduledAt(sched),
  } as any).select().single();
  if (error) throw error;
  return data;
}

export async function getVideoDetail(video_id: string): Promise<YouTubeVideo & { transcript: string | null; transcript_fetched_at: string | null } | null> {
  const { data, error } = await supabase
    .from("youtube_videos" as any)
    .select("*")
    .eq("video_id", video_id)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export type Schedule = { scheduled_date: string | null; scheduled_time: string | null };

function buildScheduledAt(s: Schedule): string | null {
  if (!s.scheduled_date) return null;
  const time = s.scheduled_time || "09:00";
  // Treat as local time in the user's browser; the dispatcher converts to UTC.
  return new Date(`${s.scheduled_date}T${time}:00`).toISOString();
}

export async function addIdeaToPlanner(idea: VideoIdea, source: { video_id: string; title: string; channel: string }, schedule?: Schedule) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const formatNote = `From YouTube: "${source.title}" by ${source.channel} (https://www.youtube.com/watch?v=${source.video_id})`;
  const sched = schedule ?? { scheduled_date: null, scheduled_time: null };
  const { data, error } = await supabase.from("social_content_plan" as any).insert({
    user_id: user.id,
    hook: idea.hook,
    body: idea.body,
    format: idea.format || "insight",
    pillar: "general",
    status: "planned",
    notes: idea.angle ? `${idea.angle}\n\n${formatNote}` : formatNote,
    source_kind: "youtube",
    scheduled_date: sched.scheduled_date,
    scheduled_time: sched.scheduled_time,
    scheduled_at: buildScheduledAt(sched),
  } as any).select().single();
  if (error) throw error;
  return data;
}
