import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Whitelist of secret names that providers are allowed to reference.
// Prevents authenticated users from exfiltrating arbitrary server-side secrets
// (e.g. SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY) by setting api_key_secret_name.
const ALLOWED_SECRET_NAMES = new Set<string>([
  "LINKUP_API_KEY",
]);

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower.startsWith("::ffff:")) return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}
async function assertPublicUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs allowed");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("URL host is not public");
  }
  const a4 = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
  const a6 = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
  for (const ip of [...a4, ...a6]) if (isPrivateIp(ip)) throw new Error("URL resolves to a private address");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "search";

    // ── Optimize prompt only ──
    if (action === "optimize") {
      // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
      const { data: __aikeys } = await supabase.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
      const __openaiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY") || "";
      const optimized = await optimizePrompt(body.query ?? "", body.outputType ?? "sourcedAnswer", body.depth ?? "auto", __openaiKey);
      return json({ optimized });
    }

    // ── Run a search ──
    if (action !== "search") return json({ error: `Unknown action: ${action}` }, 400);

    const query: string = (body.query ?? "").toString().trim();
    if (!query) return json({ error: "Query is required" }, 400);

    // Pick provider
    let provider: any = null;
    if (body.provider_id) {
      const { data } = await supabase.from("social_search_providers").select("*").eq("id", body.provider_id).maybeSingle();
      provider = data;
    }
    if (!provider) {
      const { data } = await supabase.from("social_search_providers").select("*")
        .eq("user_id", user.id).eq("is_active", true).order("is_default", { ascending: false }).limit(1).maybeSingle();
      provider = data;
    }
    // Auto-create a default Linkup provider if none exists
    if (!provider) {
      const { data: created } = await supabase.from("social_search_providers").insert({
        user_id: user.id,
        name: "Linkup (default)",
        provider_kind: "linkup",
      }).select().single();
      provider = created;
    }
    if (!provider) return json({ error: "No search provider configured" }, 400);

    const secretName = provider.api_key_secret_name || "LINKUP_API_KEY";
    if (!ALLOWED_SECRET_NAMES.has(secretName)) {
      return json({ error: `Secret name '${secretName}' is not allowed. Allowed: ${[...ALLOWED_SECRET_NAMES].join(", ")}` }, 400);
    }
    const apiKey = Deno.env.get(secretName);
    if (!apiKey) return json({ error: `Missing secret ${secretName}. Add it in project settings.` }, 400);

    try { await assertPublicUrl(provider.endpoint_url); }
    catch (e) { return json({ error: `Invalid endpoint_url: ${(e as Error).message}` }, 400); }

    const outputType = body.outputType ?? provider.default_body?.outputType ?? "sourcedAnswer";
    const rawDepth = (body.depth ?? provider.default_body?.depth ?? "standard").toString().toLowerCase();
    const depthMap: Record<string, string> = {
      auto: "standard", standard: "standard", normal: "standard", medium: "standard",
      deep: "deep", thorough: "deep", high: "deep",
      fast: "fast", quick: "fast", shallow: "fast", low: "fast",
    };
    const depth = depthMap[rawDepth] ?? "standard";
    const includeImages = body.includeImages ?? provider.default_body?.includeImages ?? false;

    // Build request
    const headers: Record<string, string> = {
      ...(provider.default_headers ?? { "Content-Type": "application/json" }),
      [provider.auth_header_name || "Authorization"]: `${provider.auth_header_prefix || "Bearer "}${apiKey}`,
    };

    let payload: Record<string, unknown>;
    if (provider.provider_kind === "linkup") {
      payload = {
        q: query,
        depth,
        outputType,
        includeImages: !!includeImages,
      };
      if (Array.isArray(body.includeDomains)) payload.includeDomains = body.includeDomains;
      if (Array.isArray(body.excludeDomains)) payload.excludeDomains = body.excludeDomains;
    } else {
      // custom_http: merge default body and put query into configured field
      payload = { ...(provider.default_body ?? {}) };
      payload[provider.query_field || "q"] = query;
      if (body.extra && typeof body.extra === "object") Object.assign(payload, body.extra);
    }

    const t0 = Date.now();
    const resp = await fetch(provider.endpoint_url, {
      method: provider.http_method || "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const duration_ms = Date.now() - t0;
    const text = await resp.text();
    let raw: any;
    try { raw = JSON.parse(text); } catch { raw = { _raw: text }; }

    if (!resp.ok) {
      await supabase.from("social_search_queries").insert({
        user_id: user.id, provider_id: provider.id, query,
        output_type: outputType, depth, status: "error",
        raw_response: raw, error: `HTTP ${resp.status}: ${text.slice(0, 500)}`,
        duration_ms,
      });
      return json({ error: `Search provider returned ${resp.status}`, details: raw }, 502);
    }

    // Normalize response
    const answer: string | null = raw?.answer ?? raw?.sourcedAnswer ?? raw?.output ?? null;
    const results = raw?.results ?? raw?.sources ?? raw?.data ?? null;

    const { data: saved } = await supabase.from("social_search_queries").insert({
      user_id: user.id, provider_id: provider.id, query,
      output_type: outputType, depth, status: "success",
      answer, results, raw_response: raw, duration_ms,
    }).select().single();

    return json({ ok: true, id: saved?.id, answer, results, raw, provider: { id: provider.id, name: provider.name, kind: provider.provider_kind } });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function optimizePrompt(query: string, outputType: string, depth: string, apiKey: string): Promise<string> {
  if (!apiKey || !query.trim()) return query;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You rewrite vague user queries into a single, specific, search-engine-friendly query. Reply with ONLY the rewritten query, no quotes, no preamble. Keep it under 200 characters. Preserve the user's intent and named entities. Add precision (timeframe, region, type of source) when obviously useful." },
          { role: "user", content: `Output type: ${outputType}\nDepth: ${depth}\nUser query: ${query}` },
        ],
        temperature: 0.2,
      }),
    });
    const j = await r.json();
    const out = j?.choices?.[0]?.message?.content?.trim();
    return out || query;
  } catch {
    return query;
  }
}