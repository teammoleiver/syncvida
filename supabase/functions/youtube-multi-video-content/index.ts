import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate combined content (ideas + ready-to-post drafts) by reasoning across
 * MULTIPLE transcribed YouTube videos. The model is told to look for shared
 * themes, contrasting takes, and unique angles — turning the selection into
 * one cohesive content batch instead of N isolated outputs.
 *
 * Body: {
 *   video_ids: string[],
 *   mode?: "ideas" | "posts" | "both",  // default "both"
 *   count?: number,                       // default 7
 *   platforms?: ("linkedin"|"twitter"|"instagram")[],
 *   intent?: string,                      // optional user steering ("combine these into one POV", etc.)
 * }
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
    const videoIds: string[] = Array.isArray(body?.video_ids) ? body.video_ids.map(String).filter(Boolean) : [];
    if (videoIds.length < 1) return json({ error: "Pick at least one video" }, 400);
    if (videoIds.length > 10) return json({ error: "Max 10 videos at a time" }, 400);

    const mode = String(body?.mode ?? "both") as "ideas" | "posts" | "both";
    const count = Math.min(15, Math.max(3, Number(body?.count ?? 7)));
    const platforms: string[] = Array.isArray(body?.platforms) && body.platforms.length
      ? body.platforms.map(String) : ["linkedin", "twitter", "instagram"];
    const intent = String(body?.intent ?? "").slice(0, 500);

    const { data: vids } = await admin.from("youtube_videos")
      .select("video_id, title, description, transcript, channel_id")
      .eq("user_id", user.id).in("video_id", videoIds);
    if (!vids?.length) return json({ error: "Videos not found" }, 404);

    const channelIds = [...new Set(vids.map((v: any) => v.channel_id))];
    const { data: chs } = await admin.from("youtube_channels")
      .select("channel_id, title, handle").eq("user_id", user.id).in("channel_id", channelIds);
    const chMap = new Map<string, string>();
    for (const c of chs ?? []) chMap.set((c as any).channel_id, (c as any).title || (c as any).handle || (c as any).channel_id);

    // Build a compact multi-source prompt. Cap each transcript so we stay
    // within token limits even with 10 videos.
    const perVideoCap = videoIds.length <= 3 ? 5000 : videoIds.length <= 6 ? 3000 : 1800;
    const sourcesText = vids.map((v: any, i: number) => {
      const ch = chMap.get(v.channel_id) ?? v.channel_id;
      const desc = (v.description ?? "").slice(0, 600);
      const tr = (v.transcript ?? "").slice(0, perVideoCap);
      return `## Source ${i + 1}\nCreator: ${ch}\nTitle: ${v.title}\n${desc ? `Description: ${desc}\n` : ""}${tr ? `Transcript excerpt:\n${tr}` : "(no transcript)"}`;
    }).join("\n\n");

    const sources = vids.map((v: any, i: number) => ({
      n: i + 1,
      video_id: v.video_id,
      title: v.title,
      channel: chMap.get(v.channel_id) ?? v.channel_id,
      url: `https://www.youtube.com/watch?v=${v.video_id}`,
    }));

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const wantIdeas = mode === "ideas" || mode === "both";
    const wantPosts = mode === "posts" || mode === "both";

    const systemPrompt = `You are a content strategist helping a creator synthesize multiple source videos into ORIGINAL content.
Your job is NOT to summarize each video. Your job is to look across them, find shared themes, contradictions, and gaps, then produce content the user can post as their own POV.

Rules:
- Cite which source(s) inspired each output using 1-based indices like [S1], [S2,S3].
- Prefer ideas that combine 2+ sources or take a contrarian stance.
- Each idea = a specific angle, not a generic restatement.
- Hooks must be 8-14 words, scroll-stoppers, no clickbait fluff.
- Output STRICT JSON, no markdown, no commentary.

Schema:
{
  "themes": [{ "label": string, "sources": number[] }],   // 3-5 cross-cutting themes
${wantIdeas ? `  "ideas": [{ "hook": string, "body": string, "angle": string, "format": "insight|story|contrarian|framework|list|tutorial|hot-take", "sources": number[] }],\n` : ""}${wantPosts ? `  "posts": [{ "platform": "linkedin"|"twitter"|"instagram", "hook": string, "body": string, "hashtags": string[], "sources": number[] }],\n` : ""}  "next_steps": string[]    // 3 quick actions the user could take
}`;

    const userPrompt = `${intent ? `User intent: ${intent}\n\n` : ""}I selected ${vids.length} videos. Synthesize across ALL of them.

${sourcesText}

Return ${wantIdeas ? `${count} ideas` : ""}${wantIdeas && wantPosts ? " and " : ""}${wantPosts ? `${Math.min(count, 6)} platform-ready posts (covering: ${platforms.join(", ")})` : ""}.`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({
        ...fallbackSynthesis(vids, chMap, count, platforms, intent, sources),
        ai_unavailable: true,
        warning: "AI credits are exhausted, so this draft was generated locally from the selected transcripts.",
      });
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const aiBody = await ai.json();
    const content: string = aiBody.choices?.[0]?.message?.content ?? "";
    const parsed = safeParse(content);
    if (!parsed) return json({ error: "AI returned invalid JSON", raw: content }, 500);

    return json({
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas.map(normalizeIdea) : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts.map(normalizePost) : [],
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String) : [],
      sources,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { /* try extract */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}
function normalizeIdea(x: any) {
  return {
    hook: String(x?.hook ?? "").trim(),
    body: String(x?.body ?? "").trim(),
    angle: String(x?.angle ?? "").trim(),
    format: String(x?.format ?? "insight").trim().toLowerCase(),
    sources: Array.isArray(x?.sources) ? x.sources.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [],
  };
}
function normalizePost(x: any) {
  return {
    platform: String(x?.platform ?? "linkedin").toLowerCase(),
    hook: String(x?.hook ?? "").trim(),
    body: String(x?.body ?? "").trim(),
    hashtags: Array.isArray(x?.hashtags) ? x.hashtags.map(String) : [],
    sources: Array.isArray(x?.sources) ? x.sources.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [],
  };
}
function fallbackSynthesis(vids: any[], chMap: Map<string, string>, count: number, platforms: string[], intent: string, sources: any[]) {
  const commonWords = topKeywords(vids.map((v) => `${v.title ?? ""} ${v.description ?? ""} ${(v.transcript ?? "").slice(0, 2500)}`).join(" "));
  const baseTheme = commonWords.slice(0, 3).join(" + ") || "shared creator strategy";
  const sourceNums = sources.map((s) => s.n);
  const ideas = Array.from({ length: Math.min(count, 8) }, (_, i) => {
    const v = vids[i % vids.length];
    const n = sources.find((s) => s.video_id === v.video_id)?.n ?? 1;
    const secondary = sourceNums.find((x) => x !== n) ?? n;
    const keyword = commonWords[i % Math.max(commonWords.length, 1)] ?? "content";
    return normalizeIdea({
      hook: fallbackHooks[i % fallbackHooks.length].replace("{keyword}", titleCase(keyword)),
      body: `${intent ? `${intent}\n\n` : ""}Use ${v.title} as the entry point, then connect it with the wider pattern across the selected videos: ${baseTheme}. Turn the overlap into a clear POV, a practical example, and one takeaway the audience can use immediately.`,
      angle: `Combine source S${n} with S${secondary} instead of treating each video separately.`,
      format: ["insight", "framework", "contrarian", "tutorial", "list"][i % 5],
      sources: [...new Set([n, secondary])],
    });
  });
  const posts = platforms.slice(0, 3).flatMap((platform, i) => {
    const idea = ideas[i % ideas.length];
    return [normalizePost({
      platform,
      hook: idea.hook,
      body: `${idea.hook}\n\n${idea.body}\n\nThe interesting part is not one isolated tactic — it is the pattern across multiple examples.`,
      hashtags: commonWords.slice(0, 3).map((w) => w.replace(/[^a-z0-9]/gi, "")),
      sources: idea.sources,
    })];
  });
  return {
    themes: [
      { label: titleCase(baseTheme), sources: sourceNums },
      { label: "Different executions of the same underlying problem", sources: sourceNums.slice(0, 4) },
      { label: "Reusable lessons for your own content angle", sources: sourceNums.slice(0, 4) },
    ],
    ideas,
    posts,
    next_steps: ["Top up AI balance for deeper synthesis", "Review the local drafts and keep the strongest angle", "Push the best idea to the planner"],
    sources,
  };
}
const fallbackHooks = [
  "The hidden pattern behind {keyword}",
  "Most people miss this angle on {keyword}",
  "I compared multiple takes on {keyword}",
  "The smarter way to think about {keyword}",
  "What these videos reveal about {keyword}",
];
function topKeywords(text: string) {
  const stop = new Set("about after again all also and are because been but can could each for from have how into more most not now only out over should that the their them then there these they this through use using very was what when where which while will with would your video videos".split(" "));
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}
function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}