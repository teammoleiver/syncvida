import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const count = Math.min(10, Math.max(1, Number(body?.count ?? 5)));
    const platforms: string[] = Array.isArray(body?.platforms) && body.platforms.length
      ? body.platforms.filter((p: any) => ["linkedin", "twitter", "instagram"].includes(p))
      : ["linkedin", "twitter", "instagram"];

    const { data: vid } = await admin.from("youtube_videos")
      .select("video_id, title, description, transcript, channel_id")
      .eq("user_id", user.id).eq("video_id", videoId).maybeSingle();
    if (!vid) return json({ error: "Video not found" }, 404);

    const { data: ch } = await admin.from("youtube_channels")
      .select("title, handle").eq("user_id", user.id).eq("channel_id", vid.channel_id).maybeSingle();
    const channelTitle = (ch?.title || ch?.handle || vid.channel_id) as string;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const transcript = (vid.transcript ?? "").slice(0, 8000);
    const description = (vid.description ?? "").slice(0, 1500);

    const systemPrompt = `You are a senior social-media strategist. Turn the source video into ${count} platform-ready posts.
Selected platforms: ${platforms.join(", ")}. Distribute posts across them (or all on one if only one is selected).

Each post:
- LinkedIn: punchy hook line, 3-6 short paragraphs body, conversational expert voice
- Twitter/X: hook ≤ 240 chars, body can be a short thread-opener (≤ 600 chars)
- Instagram: scroll-stopping hook, body 2-4 lines, friendly tone
- 3-6 relevant hashtags per post (no #ad / #sponsored)

Return STRICT JSON only:
{ "posts": [ { "platform": "linkedin|twitter|instagram", "hook": "...", "body": "...", "hashtags": ["tag1","tag2"] } ] }
No markdown, no commentary outside JSON.`;

    const userPrompt = `Source video by ${channelTitle}
Title: ${vid.title}
${description ? `Description: ${description}` : ""}
${transcript ? `Transcript:\n${transcript}` : "(no transcript available — work from title + description)"}

Produce ${count} posts.`;

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) {
      const txt = await ai.text();
      if (ai.status === 429) return json({ error: "AI rate limit or quota exhausted. Check your OpenAI billing and try again." }, 200);
      if (ai.status === 402) return json({ error: "AI credits exhausted. Add funds to your OpenAI account." }, 200);
      if (ai.status === 401) return json({ error: "OpenAI API key invalid. Update OPENAI_API_KEY in secrets." }, 200);
      return json({ error: `AI error: ${txt}` }, 200);
    }
    const aiBody = await ai.json();
    const content: string = aiBody.choices?.[0]?.message?.content ?? "";
    const posts = parsePosts(content, platforms);
    if (!posts.length) return json({ error: "AI returned no usable posts", raw: content }, 200);

    return json({ posts, source_video: { video_id: vid.video_id, title: vid.title, channel: channelTitle } });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 200);
  }
});

function parsePosts(content: string, platforms: string[]): any[] {
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch { /* */ }
  if (!parsed) {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* */ } }
  }
  const arr = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : [];
  return arr
    .map((x: any) => {
      const platform = String(x?.platform ?? platforms[0]).toLowerCase();
      const hook = String(x?.hook ?? "").trim();
      const bodyText = String(x?.body ?? "").trim();
      const hashtags = Array.isArray(x?.hashtags)
        ? x.hashtags.map((h: any) => String(h).replace(/^#/, "").trim()).filter(Boolean)
        : [];
      return { platform, hook, body: bodyText, hashtags, length: (hook + " " + bodyText).length };
    })
    .filter((p: any) => p.hook.length > 0 && ["linkedin", "twitter", "instagram"].includes(p.platform));
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}