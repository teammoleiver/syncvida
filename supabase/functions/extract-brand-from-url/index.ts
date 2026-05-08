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

    const { url } = await req.json();
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return json({ error: "Invalid URL" }, 400);

    const html = await (await fetch(url, { redirect: "follow" })).text();
    const snippet = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").slice(0, 12000);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You analyze a website's HTML to extract brand identity. Return ONLY JSON." },
          { role: "user", content: `URL: ${url}\nHTML excerpt:\n${snippet}\n\nReturn JSON: { "brand_name": string, "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "bg": "#hex", "text": "#hex" }, "fonts": { "heading": string, "body": string }, "tone": string }` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI error: ${await ai.text()}` }, 500);
    const data = await ai.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return json(parsed);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }