import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate content ideas for the user based on a single YouTube video.
 * Uses the video title + description + transcript (when available).
 *
 * Body: { video_id: string, count?: number }
 * Returns: { ideas: [{ hook, body, angle, format }] }
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
    const count = Math.min(15, Math.max(3, Number(body?.count ?? 7)));

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

    const systemPrompt = `You are a content strategist helping a creator turn other creators' videos into their own original posts.
Given a video by another creator, generate ${count} concrete, distinct content ideas the user can produce themselves.

Each idea should be:
- A specific angle, not a generic restatement
- Phrased as a usable hook (10-14 words) plus a 2-3 sentence body
- Tagged with a format from: insight, story, contrarian, framework, list, tutorial, hot-take

Return STRICT JSON:
{ "ideas": [ { "hook": "...", "body": "...", "angle": "...", "format": "insight|story|contrarian|framework|list|tutorial|hot-take" } ] }
No markdown, no commentary outside JSON.`;

    const userPrompt = `Source video by ${channelTitle}
Title: ${vid.title}
${description ? `Description: ${description}` : ""}
${transcript ? `Transcript:\n${transcript}` : "(no transcript available — work from title + description)"}

Give me ${count} content ideas.`;

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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
    const ideas = parseIdeas(content);
    if (!ideas.length) return json({ error: "AI returned no usable ideas", raw: content }, 500);

    return json({ ideas, source_video: { video_id: vid.video_id, title: vid.title, channel: channelTitle } });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function parseIdeas(content: string): any[] {
  // Try direct JSON parse, then try extracting first {...} block
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch { /* try extraction */ }
  if (!parsed) {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* */ }
    }
  }
  const arr = Array.isArray(parsed?.ideas) ? parsed.ideas : Array.isArray(parsed) ? parsed : [];
  return arr
    .map((x: any) => ({
      hook: String(x?.hook ?? "").trim(),
      body: String(x?.body ?? "").trim(),
      angle: String(x?.angle ?? "").trim(),
      format: String(x?.format ?? "insight").trim().toLowerCase(),
    }))
    .filter((x: any) => x.hook.length > 0);
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
