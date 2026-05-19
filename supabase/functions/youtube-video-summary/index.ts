import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate a structured summary (key points) for a single YouTube video.
 * Body: { video_id: string, refresh?: boolean }
 * Returns: { points: [{ headline, detail }], cached: boolean }
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
    const refresh = Boolean(body?.refresh);
    if (!videoId) return json({ error: "video_id required" }, 400);

    const { data: vid } = await admin.from("youtube_videos")
      .select("id, video_id, title, description, transcript, channel_id, summary_points")
      .eq("user_id", user.id).eq("video_id", videoId).maybeSingle();
    if (!vid) return json({ error: "Video not found" }, 404);

    if (!refresh && Array.isArray(vid.summary_points) && vid.summary_points.length > 0) {
      return json({ points: vid.summary_points, cached: true });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY missing. Add it in Supabase secrets." }, 500);

    const transcript = (vid.transcript ?? "").slice(0, 12000);
    const description = (vid.description ?? "").slice(0, 1500);

    const systemPrompt = `You summarize a YouTube video into 5-8 concise key points.
Each point has:
- "headline": 6-10 words capturing the takeaway
- "detail": 1-2 sentences expanding the headline with concrete substance from the video

Return STRICT JSON: { "points": [ { "headline": "...", "detail": "..." } ] }
No markdown, no commentary outside JSON.`;

    const userPrompt = `Title: ${vid.title}
${description ? `Description: ${description}` : ""}
${transcript ? `Transcript:\n${transcript}` : "(no transcript available — work from title + description)"}

Summarize this video.`;

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
      if (ai.status === 429) return json({ error: "OpenAI rate limit or quota exceeded. Check your OpenAI billing." }, 200);
      if (ai.status === 402) return json({ error: "OpenAI credits exhausted. Add funds to your OpenAI account." }, 200);
      if (ai.status === 401) return json({ error: "OpenAI API key invalid. Update OPENAI_API_KEY in Supabase secrets." }, 200);
      return json({ error: `OpenAI error: ${txt}` }, 200);
    }
    const aiBody = await ai.json();
    const content: string = aiBody.choices?.[0]?.message?.content ?? "";
    const points = parsePoints(content);
    if (!points.length) return json({ error: "AI returned no usable summary points", raw: content }, 500);

    await admin.from("youtube_videos")
      .update({ summary_points: points })
      .eq("id", vid.id);

    return json({ points, cached: false });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function parsePoints(content: string): { headline: string; detail: string }[] {
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  const arr = Array.isArray(parsed?.points) ? parsed.points : [];
  return arr
    .map((p: any) => ({
      headline: String(p?.headline ?? "").trim(),
      detail: String(p?.detail ?? "").trim(),
    }))
    .filter((p: any) => p.headline);
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}