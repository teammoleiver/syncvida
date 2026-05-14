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

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const lovableKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey && !lovableKey) return json({ error: "No AI provider key configured" }, 500);

    const wantIdeas = mode === "ideas" || mode === "both";
    const wantPosts = mode === "posts" || mode === "both";

    const systemPrompt = `You are a senior LinkedIn ghostwriter and content strategist helping a creator synthesize multiple source videos into ORIGINAL content.
Your job is NOT to summarize each video. Your job is to look across them, find shared themes, contradictions, and gaps, then produce content the user can post as their own POV.

Rules:
- Cite which source(s) inspired each output using 1-based indices like [S1], [S2,S3].
- Prefer ideas that combine 2+ sources or take a contrarian stance.
- Each idea = a specific angle, not a generic restatement.
- Hooks must be 8-14 words, scroll-stoppers, no clickbait fluff.
- LinkedIn posts must be complete, ready-to-publish posts: 900-1,500 characters, 6-10 short paragraphs, a strong first-line hook, a clear POV, concrete examples from the sources, a practical takeaway, and a final engagement question.
- Twitter/X posts must be 500-900 characters unless the requested platform only allows shorter content.
- Instagram captions must be 700-1,200 characters with a human caption structure.
- Do not return outlines, placeholders, summaries, or one-paragraph idea blurbs in posts.
- Keep hashtags separate in the hashtags array, not inside the body.
- Output STRICT JSON, no markdown, no commentary.

Schema:
{
  "themes": [{ "label": string, "sources": number[] }],   // 3-5 cross-cutting themes
${wantIdeas ? `  "ideas": [{ "hook": string, "body": string, "angle": string, "format": "insight|story|contrarian|framework|list|tutorial|hot-take", "sources": number[] }],\n` : ""}${wantPosts ? `  "posts": [{ "platform": "linkedin"|"twitter"|"instagram", "hook": string, "body": string, "hashtags": string[], "sources": number[] }],\n` : ""}  "next_steps": string[]    // 3 quick actions the user could take
}`;

    const userPrompt = `${intent ? `User intent: ${intent}\n\n` : ""}I selected ${vids.length} videos. Synthesize across ALL of them.

${sourcesText}

Return ${wantIdeas ? `exactly ${count} ideas` : ""}${wantIdeas && wantPosts ? " and " : ""}${wantPosts ? `exactly ${Math.min(count, 6)} platform-ready posts. Selected platforms: ${platforms.join(", ")}. If one platform is selected, every post must use that platform. If multiple platforms are selected, distribute posts across them.` : ""}.`;

    const { response: ai, provider, errorStatus } = await callBestAiProvider({ openAiKey, lovableKey, systemPrompt, userPrompt });
    if (!ai?.ok) {
      if (errorStatus === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (errorStatus === 402) return json({
        ...fallbackSynthesis(vids, chMap, count, platforms, intent, sources),
        ai_unavailable: true,
        warning: "AI provider credits are unavailable, so this draft was generated locally from the selected transcripts.",
      });
      return json({ error: `AI error: ${ai ? await ai.text() : "No provider succeeded"}` }, 500);
    }
    const aiBody = await ai.json();
    const content: string = aiBody.choices?.[0]?.message?.content ?? "";
    const parsed = safeParse(content);
    if (!parsed) return json({
      ...fallbackSynthesis(vids, chMap, count, platforms, intent, sources),
      ai_unavailable: true,
      warning: "AI returned an unreadable response, so structured local drafts were generated from the selected transcripts.",
    });

    const normalizedPosts = Array.isArray(parsed.posts)
      ? parsed.posts.map((post: any, index: number) => normalizePost(post, parsed.themes, sources, intent, index))
      : [];

    return json({
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas.map(normalizeIdea) : [],
      posts: normalizedPosts,
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String) : [],
      sources,
      provider,
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
function normalizePost(x: any, themes: any[] = [], sources: any[] = [], intent = "", index = 0) {
  const platform = String(x?.platform ?? "linkedin").toLowerCase();
  const hook = String(x?.hook ?? "").trim();
  const rawBody = String(x?.body ?? "").trim();
  const body = platform === "linkedin" && rawBody.length < 700
    ? expandShortLinkedInPost(hook, rawBody, themes, sources, intent, index)
    : rawBody;
  return {
    platform,
    hook,
    body,
    hashtags: Array.isArray(x?.hashtags) ? x.hashtags.map(String) : [],
    sources: Array.isArray(x?.sources) ? x.sources.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [],
  };
}

function expandShortLinkedInPost(hook: string, body: string, themes: any[], sources: any[], intent: string, index: number) {
  const theme = String(themes?.[index % Math.max(themes.length, 1)]?.label ?? themes?.[0]?.label ?? "the repeated pattern across these videos");
  const sourceTitles = sources.slice(0, 3).map((s) => s.title).filter(Boolean);
  return `${hook || "The strongest post is hiding between the videos"}\n\n${body || "The obvious move is to summarize each video separately. The better move is to connect them."}\n\nThe pattern that stands out is this: ${theme}.\n\nThat is a stronger LinkedIn angle because it gives the reader a point of view, not just a recap.\n\n${sourceTitles.length ? `You can see it across examples like ${sourceTitles.join("; ")}.\n\n` : ""}${intent ? `${intent}\n\n` : ""}Here is the practical takeaway:\n\nWhen multiple sources point to the same problem, do not publish another generic summary. Name the pattern, explain why it matters, and give the audience one action they can use today.\n\nThat turns the content from “I watched this” into “here is what this changes.”\n\nWhat pattern would you build the post around?`;
}

async function callBestAiProvider(args: { openAiKey?: string | null; lovableKey?: string | null; systemPrompt: string; userPrompt: string }) {
  const providers = args.openAiKey ? ["openai", "lovable"] : ["lovable"];
  let lastResponse: Response | null = null;
  let lastStatus = 0;

  for (const provider of providers) {
    try {
      if (provider === "openai" && args.openAiKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${args.openAiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: args.systemPrompt }, { role: "user", content: args.userPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 5000,
          }),
        });
        if (response.ok) return { response, provider, errorStatus: 0 };
        lastResponse = response; lastStatus = response.status;
      }
      if (provider === "lovable" && args.lovableKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${args.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: args.systemPrompt }, { role: "user", content: args.userPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 5000,
          }),
        });
        if (response.ok) return { response, provider, errorStatus: 0 };
        lastResponse = response; lastStatus = response.status;
      }
    } catch (_) { /* try next provider */ }
  }

  return { response: lastResponse, provider: "", errorStatus: lastStatus };
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
  const postCount = Math.min(count, 6);
  const selectedPlatforms = platforms.length ? platforms : ["linkedin"];
  const posts = Array.from({ length: postCount }, (_, i) => {
    const platform = selectedPlatforms[i % selectedPlatforms.length];
    const idea = ideas[i % ideas.length];
    const postBody = buildStructuredFallbackPost(String(platform), idea, baseTheme, commonWords, intent);
    return normalizePost({
      platform,
      hook: idea.hook,
      body: postBody,
      hashtags: commonWords.slice(0, 3).map((w) => w.replace(/[^a-z0-9]/gi, "")),
      sources: idea.sources,
    });
  });
  return {
    themes: [
      { label: titleCase(baseTheme), sources: sourceNums },
      { label: "Different executions of the same underlying problem", sources: sourceNums.slice(0, 4) },
      { label: "Reusable lessons for your own content angle", sources: sourceNums.slice(0, 4) },
    ],
    ideas,
    posts,
    next_steps: ["Review the strongest cross-video angle", "Personalize the opening line", "Push the best post to the planner"],
    sources,
  };
}

function buildStructuredFallbackPost(platform: string, idea: any, baseTheme: string, keywords: string[], intent: string) {
  if (platform === "twitter") {
    return `${idea.hook}\n\nMost people treat every video as a separate source. The better move is to look for the repeated pattern: ${baseTheme}.\n\nThat is where the original POV comes from — not from summarizing one tactic, but from connecting what multiple creators keep circling around.\n\nTakeaway: turn the overlap into one clear claim, one example, and one next step.`;
  }

  const topic = titleCase(keywords.slice(0, 2).join(" and ") || "this workflow");
  return `${idea.hook}\n\nI watched these selected videos as one combined source, not as separate content ideas.\n\nThe pattern that stood out: ${baseTheme}.\n\nThat matters because most LinkedIn posts stop at the obvious summary: “here is what the video said.” But the stronger post is the one that connects the dots and gives the reader a usable point of view.\n\n${intent ? `${intent}\n\n` : ""}Here is the angle I would use:\n\n${idea.body}\n\nThe practical lesson: when several sources point to the same problem, do not repeat the sources. Name the pattern, show the tension, then give the audience one action they can apply immediately.\n\nFor ${topic}, that means asking: what is the repeatable system underneath the tactic?\n\nThat is usually where the best post is hiding.\n\nWhat pattern would you pull from these examples?`;
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