// Daily cron entrypoint: triggers scrape for all active profiles for ALL users.
// Called by pg_cron via pg_net.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Cron-only: require the service role key as the bearer token.
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer || bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    const defaultActor = Deno.env.get("APIFY_LINKEDIN_ACTOR_ID") ?? "94SdiE9JwTx0RNyfS";
    if (!apifyToken) return new Response(JSON.stringify({ error: "APIFY_API_TOKEN not configured" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date();
    const dow = today.getDay(); // 0=Sun … 1=Mon
    const isMonday = dow === 1;

    const { data: profiles, error } = await admin.from("social_profiles")
      .select("*")
      .eq("active", true)
      .in("scrape_cadence", isMonday ? ["daily", "weekly"] : ["daily"]);
    if (error) throw error;

    let total = 0;
    for (const profile of profiles ?? []) {
      try {
        const actorId = profile.apify_actor_id || defaultActor;
        const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;
        const apifyRes = await fetch(runUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: profile.profile_url,
            urls: [profile.profile_url],
            profileUrls: [profile.profile_url],
            startUrls: [{ url: profile.profile_url }],
            username: profile.username,
            usernames: profile.username ? [profile.username] : undefined,
            limit: 30, postsLimit: 30, maxPosts: 30, maxItems: 30,
          }),
        });
        if (!apifyRes.ok) {
          await admin.from("social_profiles").update({
            last_scraped_at: new Date().toISOString(), last_scrape_status: "error",
            last_scrape_error: `cron Apify ${apifyRes.status}`,
          }).eq("id", profile.id);
          continue;
        }
        const items: any[] = await apifyRes.json();
        for (const item of items.slice(0, 30)) {
          const postUrl = item.linkedinUrl ?? item.linkedInUrl ?? item.linkedin_url ?? item.postLink ?? item.url ?? item.postUrl ?? item.link ?? null;
          const externalId = String(item.urn ?? item.id ?? item.postId ?? postUrl ?? "");
          const postText = item.text ?? item.postText ?? item.content ?? item.commentary ?? "";
          if (!externalId && !postText) continue;
          await admin.from("social_posts").upsert({
            user_id: profile.user_id, profile_id: profile.id,
            external_id: externalId || null,
            author: item.authorName ?? item.author ?? profile.display_name ?? profile.username,
            company: item.authorCompany ?? item.company ?? profile.company,
            post_text: postText, post_type: item.type ?? item.postType ?? "post",
            post_url: postUrl,
            posted_at: (item.postedAt ?? item.publishedAt ?? item.date ?? item.timestamp) ? new Date(item.postedAt ?? item.publishedAt ?? item.date ?? item.timestamp).toISOString() : null,
            likes: Number(item.likes ?? item.numLikes ?? item.likeCount ?? 0),
            comments: Number(item.comments ?? item.numComments ?? item.commentCount ?? 0),
            shares: Number(item.shares ?? item.numShares ?? item.shareCount ?? 0),
            raw_payload: item,
          }, { onConflict: "user_id,profile_id,external_id", ignoreDuplicates: false });
          total++;
        }
        await admin.from("social_profiles").update({
          last_scraped_at: new Date().toISOString(), last_scrape_status: "success", last_scrape_error: null,
        }).eq("id", profile.id);
      } catch (e: any) {
        await admin.from("social_profiles").update({
          last_scraped_at: new Date().toISOString(), last_scrape_status: "error",
          last_scrape_error: String(e?.message ?? e).slice(0, 500),
        }).eq("id", profile.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, profiles: profiles?.length ?? 0, posts: total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
