import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

async function callAI(apiKey: string, messages: any[], tools?: any[], tool_choice?: any) {
  const body: any = { model: MODEL, messages };
  if (tools) { body.tools = tools; body.tool_choice = tool_choice ?? "auto"; }
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
  if (r.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await supa.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const aiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY") || "";

    const { action, message, item_ids, query } = await req.json();

    // Persist user message
    if (message) {
      await supa.from("content_chat_messages").insert({ user_id: user.id, role: "user", content: message, action_kind: action });
    }

    // Load library context (titles only — keep prompt small)
    const { data: items } = await supa.from("content_items").select("id,title,category_name,level,duration,key_topics,source_url,item_type,creator").eq("user_id", user.id).order("position").limit(800);
    const lib = (items ?? []).map((i, n) => `${n + 1}. [${i.category_name ?? "—"}] ${i.title}${i.level ? ` (${i.level})` : ""}${i.key_topics ? ` — ${i.key_topics}` : ""}`).join("\n");

    let assistantText = "";
    let payload: any = null;

    if (action === "nl_filter") {
      const out = await callAI(aiKey, [
        { role: "system", content: "You convert natural-language requests into a JSON filter for a content library. Return ONLY via the function call." },
        { role: "user", content: `User request: ${message}\n\nLibrary preview:\n${lib.slice(0, 4000)}` },
      ], [{
        type: "function",
        function: {
          name: "apply_filter",
          description: "Filter the library",
          parameters: {
            type: "object", additionalProperties: false,
            properties: {
              search: { type: "string", description: "free-text keyword filter" },
              categories: { type: "array", items: { type: "string" } },
              levels: { type: "array", items: { type: "string", enum: ["Beginner", "Intermediate", "Advanced"] } },
              max_duration_minutes: { type: "number" },
              explanation: { type: "string" },
            },
            required: ["explanation"],
          },
        },
      }], { type: "function", function: { name: "apply_filter" } });
      const tc = out.choices?.[0]?.message?.tool_calls?.[0];
      payload = tc ? JSON.parse(tc.function.arguments) : { explanation: "Could not parse filter." };
      assistantText = payload.explanation || "Filter applied.";
    }
    else if (action === "brainstorm") {
      const out = await callAI(aiKey, [
        { role: "system", content: "You are a content strategist for a creator making YouTube/LinkedIn/Instagram/Facebook videos about GTM automation, AI tools, and no-code building. Suggest 5-8 NEW video ideas that fill gaps in the existing library. Each idea: title, hook, target_platforms, why_now (1 line)." },
        { role: "user", content: `Brief: ${message || "Surprise me — fill the most valuable gaps."}\n\nExisting library:\n${lib.slice(0, 6000)}` },
      ], [{
        type: "function", function: {
          name: "suggest_ideas",
          parameters: {
            type: "object", additionalProperties: false,
            properties: {
              ideas: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    hook: { type: "string" },
                    why_now: { type: "string" },
                    target_platforms: { type: "array", items: { type: "string", enum: ["youtube","linkedin","instagram","facebook"] } },
                    suggested_category: { type: "string" },
                    key_topics: { type: "string" },
                  },
                  required: ["title", "hook", "target_platforms"],
                },
              },
            },
            required: ["ideas"],
          },
        },
      }], { type: "function", function: { name: "suggest_ideas" } });
      const tc = out.choices?.[0]?.message?.tool_calls?.[0];
      payload = tc ? JSON.parse(tc.function.arguments) : { ideas: [] };
      assistantText = `Drafted ${payload.ideas?.length ?? 0} new ideas.`;
    }
    else if (action === "combine") {
      const ids = (item_ids ?? []) as string[];
      const { data: picked } = await supa.from("content_items").select("*").eq("user_id", user.id).in("id", ids);
      const ctx = (picked ?? []).map((p, i) => `[${i+1}] ${p.title} — ${p.key_topics ?? ""} (${p.duration ?? ""}) ${p.source_url ?? ""}`).join("\n");
      const out = await callAI(aiKey, [
        { role: "system", content: "You combine multiple lessons/videos into ONE original piece of content. Output: a punchy title, a 3-line hook, a structured outline (5-8 bullets), platform-specific captions for YouTube/LinkedIn/Instagram/Facebook, and 5 SEO tags." },
        { role: "user", content: `Goal: ${message || "Combine these into a single high-impact video."}\n\nSources:\n${ctx}` },
      ]);
      assistantText = out.choices?.[0]?.message?.content ?? "";
      payload = { combined: assistantText, source_ids: ids };
    }
    else if (action === "web_search") {
      const apiKey = Deno.env.get("LINKUP_API_KEY");
      if (!apiKey) throw new Error("LINKUP_API_KEY not configured.");
      const r = await fetch("https://api.linkup.so/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query || message, depth: "standard", outputType: "sourcedAnswer", includeImages: false }),
      });
      const txt = await r.text();
      let data: any = {}; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      if (!r.ok) throw new Error(`Linkup ${r.status}: ${txt}`);
      // Ask AI to convert results into 5-8 actionable video ideas
      const out = await callAI(aiKey, [
        { role: "system", content: "Convert web search results into 5-8 concrete content ideas the creator can film. Each idea: title, hook (1 line), key_topics, source_url (from results), suggested_category, target_platforms." },
        { role: "user", content: `Topic: ${query || message}\n\nWeb results (Linkup):\n${JSON.stringify(data).slice(0, 8000)}` },
      ], [{
        type: "function", function: {
          name: "ideas_from_web",
          parameters: {
            type: "object", additionalProperties: false,
            properties: {
              ideas: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    hook: { type: "string" },
                    key_topics: { type: "string" },
                    source_url: { type: "string" },
                    suggested_category: { type: "string" },
                    target_platforms: { type: "array", items: { type: "string", enum: ["youtube","linkedin","instagram","facebook"] } },
                  },
                  required: ["title", "hook"],
                },
              },
              answer: { type: "string" },
            },
            required: ["ideas"],
          },
        },
      }], { type: "function", function: { name: "ideas_from_web" } });
      const tc = out.choices?.[0]?.message?.tool_calls?.[0];
      payload = tc ? JSON.parse(tc.function.arguments) : { ideas: [] };
      payload.linkup_answer = data?.answer ?? null;
      payload.linkup_sources = data?.sources ?? data?.results ?? [];
      assistantText = `Found ${payload.ideas?.length ?? 0} ideas from the web.`;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    await supa.from("content_chat_messages").insert({ user_id: user.id, role: "assistant", content: assistantText, action_kind: action, payload });

    return new Response(JSON.stringify({ ok: true, assistantText, payload }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("content-studio-ai error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});