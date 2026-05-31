import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { posts } = await req.json();
  if (!Array.isArray(posts) || posts.length !== 6) {
    return json({ error: "Need exactly 6 posts" }, 400);
  }

  // Fetch the user's learned memory rules — injected as negative constraints so
  // generated copy is already free of patterns flagged in past AI reviews.
  const { data: memoryRows } = await supabase
    .from("linkedin_design_memory")
    .select("rule")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  const memoryRules: string[] = (memoryRows ?? [])
    .map((r: any) => (r.rule ?? "").trim())
    .filter(Boolean);

  const { data: row, error: insertError } = await supabase
    .from("carousels").insert({ user_id: user.id, posts, status: "pending" })
    .select().single();
  if (insertError) return json({ error: insertError.message }, 500);

  processCarousel(supabase, row.id, posts, memoryRules).catch(async (err) => {
    console.error("processCarousel failed:", err);
    await supabase.from("carousels")
      .update({ status: "failed", error_message: String(err?.message || err) })
      .eq("id", row.id);
  });

  return json({ id: row.id }, 200);
});

async function processCarousel(supabase: any, rowId: string, posts: string[], memoryRules: string[]) {
  await update(supabase, rowId, { status: "writing_copy" });
  const copy = await generateCopy(posts, memoryRules);
  await update(supabase, rowId, { status: "ready", copy });
}

async function generateCopy(posts: string[], memoryRules: string[]) {
  const memoryBlock = memoryRules.length
    ? `\n\nCRITICAL — avoid these patterns flagged as weak in past carousels for this user:\n- ${memoryRules.join("\n- ")}\nWrite copy that is already free of these issues from the first word.`
    : "";

  const systemPrompt = `You are a viral content strategist for LinkedIn carousels. Given 6 LinkedIn posts, extract the strongest common theme and write copy for a 4-page carousel. Tone: professional but conversational and bold. No fluff, no jargon, no emojis, no hashtags. Active verbs, social-proof tone, slight urgency. Output ONLY valid JSON matching this exact schema with no extra keys:
{
  "title_of_the_post": "6-9 word bold headline",
  "heres_why": "one sentence why this matters, grounded in proof or transformation",
  "page_1_text": "page 1 body, one strong opening sentence",
  "page_2_title": "short title under 8 words",
  "page_2_body": "one sentence on the problem or pain",
  "page_3_title": "short title under 8 words",
  "page_3_body": "one sentence on the solution with specifics",
  "page_4_title": "short call to action title",
  "page_4_body": "conversational one sentence CTA"
}${memoryBlock}`;

  const userPrompt = JSON.stringify({
    post_1: posts[0], post_2: posts[1], post_3: posts[2],
    post_4: posts[3], post_5: posts[4], post_6: posts[5],
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function update(supabase: any, rowId: string, patch: any) {
  await supabase.from("carousels").update(patch).eq("id", rowId);
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}