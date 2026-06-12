// Uses Linkup search (already configured) to find a LinkedIn URL for a contact by name + company.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body { name: string; company?: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const linkupKey = Deno.env.get("LINKUP_API_KEY");
    if (!linkupKey) return new Response(JSON.stringify({ error: "LINKUP_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = (await req.json()) as Body;
    const name = (body?.name ?? "").trim();
    if (!name) return new Response(JSON.stringify({ error: "name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const q = `${name} ${body.company ?? ""} site:linkedin.com/in`.trim();
    const r = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${linkupKey}` },
      body: JSON.stringify({ q, depth: "standard", outputType: "searchResults" }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `linkup ${r.status}: ${t}` }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await r.json();
    const results: Array<{ url?: string; name?: string; content?: string }> = data?.results ?? [];
    const linkedinCandidates = results
      .filter((x) => x.url && /linkedin\.com\/in\//i.test(x.url))
      .slice(0, 5)
      .map((x) => ({ url: x.url, title: x.name, snippet: x.content }));

    return new Response(JSON.stringify({ candidates: linkedinCandidates }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});