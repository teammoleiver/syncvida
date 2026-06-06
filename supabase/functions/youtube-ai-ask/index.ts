import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Ask AI a question grounded in the user's saved YouTube videos.
 *
 * Body: {
 *   question: string,
 *   channel_pks?: string[],   // limit to specific channels
 *   limit?: number             // how many recent videos to feed (default 60)
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

    const body = await req.json();
    const question: string = String(body?.question ?? "").trim();
    if (!question) return json({ error: "question required" }, 400);
    const limit = Math.min(200, Math.max(10, Number(body?.limit ?? 60)));
    const channelPks: string[] = Array.isArray(body?.channel_pks) ? body.channel_pks : [];

    let q = admin.from("youtube_videos")
      .select("video_id, title, description, published_at, channel_id")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (channelPks.length) q = q.in("channel_pk", channelPks);
    const { data: videos } = await q;
    if (!videos || videos.length === 0) {
      return json({ error: "No videos to ground the answer in. Add a YouTube channel first." }, 400);
    }

    // Also fetch channel titles for nicer source attributions
    const channelIds = [...new Set(videos.map((v: any) => v.channel_id))];
    const { data: channels } = await admin.from("youtube_channels")
      .select("channel_id, title").eq("user_id", user.id).in("channel_id", channelIds);
    const titleByCid: Record<string, string> = {};
    for (const c of channels ?? []) titleByCid[(c as any).channel_id] = (c as any).title ?? "";

    const corpus = videos.map((v: any, i: number) => {
      const dt = v.published_at ? new Date(v.published_at).toISOString().slice(0, 10) : "?";
      const ch = titleByCid[v.channel_id] || v.channel_id;
      const desc = (v.description ?? "").replace(/\s+/g, " ").slice(0, 400);
      return `[${i + 1}] ${dt} · ${ch}: "${v.title}"${desc ? ` — ${desc}` : ""} (https://www.youtube.com/watch?v=${v.video_id})`;
    }).join("\n");

    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await admin.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const apiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "No OpenAI key available. Add your own in Social Hub → Settings → AI provider." }, 500);

    const systemPrompt = `You are an assistant for a content creator who tracks other YouTubers for inspiration.
You will receive a list of recent videos (title + short description + URL + date) from creators they follow.
Answer the user's question grounded in these videos.

Output guidelines:
- Cite the video numbers in brackets like [1], [3] when you reference them.
- If the user asks for ideas, give them 5-10 concrete content ideas with a one-line angle each.
- If asked about trends, summarize what creators are talking about across the corpus.
- If the corpus doesn't contain enough info to answer, say so plainly.
- Be specific. No generic advice. Reference actual video titles when relevant.`;

    const userPrompt = `Videos in my library (${videos.length} total):\n${corpus}\n\n---\n\nQuestion: ${question}`;

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
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const aiBody = await ai.json();
    const answer: string = aiBody.choices?.[0]?.message?.content ?? "";

    // Build citation map back to videos
    const sources = videos.map((v: any, i: number) => ({
      n: i + 1,
      video_id: v.video_id,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.video_id}`,
      channel: titleByCid[v.channel_id] || v.channel_id,
      published_at: v.published_at,
    }));

    return json({ answer, sources, video_count: videos.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
