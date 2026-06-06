import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Validates a user's AI provider API key with a zero-cost call (lists models —
 * no tokens spent). Body: { provider: "openai" | "anthropic", key?: string }.
 * If `key` is omitted, the user's saved key from social_writer_settings is used,
 * so the UI can test either a freshly-typed key or the saved one.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider ?? "").toLowerCase();
    if (provider !== "openai" && provider !== "anthropic") {
      return json({ ok: false, error: "provider must be 'openai' or 'anthropic'" }, 400);
    }

    // Use the provided key, or fall back to the user's saved key.
    let key = (body?.key ?? "").trim();
    let source = "provided";
    if (!key) {
      const col = provider === "openai" ? "openai_api_key" : "anthropic_api_key";
      const { data: settings } = await userClient
        .from("social_writer_settings").select(col).eq("user_id", user.id).maybeSingle();
      key = ((settings as any)?.[col] ?? "").trim();
      source = "saved";
    }
    if (!key) {
      return json({ ok: false, error: `No ${provider} key to test. Enter a key or save one first.` }, 200);
    }

    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        const count = Array.isArray(d?.data) ? d.data.length : undefined;
        return json({ ok: true, provider, source, detail: count ? `${count} models available` : "Key is valid" });
      }
      if (r.status === 401) return json({ ok: false, provider, error: "Invalid OpenAI key (401 Unauthorized)." }, 200);
      const t = await r.text();
      return json({ ok: false, provider, error: `OpenAI ${r.status}: ${t.slice(0, 200)}` }, 200);
    }

    // Anthropic: GET /v1/models validates the key without spending tokens.
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const count = Array.isArray(d?.data) ? d.data.length : undefined;
      return json({ ok: true, provider, source, detail: count ? `${count} models available` : "Key is valid" });
    }
    if (r.status === 401) return json({ ok: false, provider, error: "Invalid Anthropic key (401 Unauthorized)." }, 200);
    const t = await r.text();
    return json({ ok: false, provider, error: `Anthropic ${r.status}: ${t.slice(0, 200)}` }, 200);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
