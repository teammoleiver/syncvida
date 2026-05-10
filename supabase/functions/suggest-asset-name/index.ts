import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { asset_id } = await req.json();
    if (typeof asset_id !== "string") return json({ error: "asset_id required" }, 400);

    const { data: src } = await supabase.from("design_assets").select("*").eq("id", asset_id).eq("user_id", user.id).maybeSingle();
    if (!src) return json({ error: "Asset not found" }, 404);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Suggest a SHORT (2-5 words) descriptive filename for this image, in Title Case. Reply with ONLY the name, no quotes, no extension." },
            { type: "image_url", image_url: { url: src.public_url } },
          ],
        }],
      }),
    });
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const data = await ai.json();
    const text = (data.choices?.[0]?.message?.content ?? "").toString().trim().replace(/^["']|["']$/g, "").slice(0, 80);
    if (!text) return json({ error: "No suggestion returned" }, 500);

    const { data: row, error: updErr } = await supabase.from("design_assets")
      .update({ name: text }).eq("id", asset_id).eq("user_id", user.id).select().single();
    if (updErr) return json({ error: updErr.message }, 500);
    return json({ asset: row, name: text });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }