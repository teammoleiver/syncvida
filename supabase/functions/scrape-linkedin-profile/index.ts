// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

function pickBestAccount(accounts: any[], usedAccountIdsThisWeek: Set<string>) {
  const eligible = accounts.filter((a) => a.active);
  // Refresh period if older than 30 days
  const now = Date.now();
  for (const a of eligible) {
    const start = new Date(a.period_start).getTime();
    if (now - start > 30 * 86400000) {
      a.posts_used_this_period = 0;
      a.period_start = new Date().toISOString().slice(0, 10);
      a._needsReset = true;
    }
  }
  // Prefer unused-this-week accounts, then fall back to the highest remaining balance.
  let best: any = null; let bestScore = -Infinity;
  for (const a of eligible) {
    const cost = (Number(a.posts_used_this_period ?? 0) / 10) * Number(a.cost_per_10_posts_usd ?? 0.5);
    const rem = Number(a.monthly_budget_usd ?? 5) - cost;
    const score = rem - (usedAccountIdsThisWeek.has(a.id) ? 1000 : 0);
    if (rem > 0 && score > bestScore) { best = a; bestScore = score; }
  }
  return best;
}

function normalizeActorId(input?: string | null): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const actorIndex = parts.indexOf("actors");
    if (actorIndex >= 0 && parts[actorIndex + 1]) return parts[actorIndex + 1];
    const storeIndex = parts.indexOf("store");
    if (storeIndex >= 0 && parts[storeIndex + 1] && parts[storeIndex + 2]) return `${parts[storeIndex + 1]}~${parts[storeIndex + 2]}`;
    if (parts.length >= 2 && url.hostname.includes("apify.com")) return `${parts[0]}~${parts[1]}`;
  } catch { /* raw id */ }
  const cleaned = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (cleaned.startsWith("actors/")) return cleaned.split("/")[1] ?? "";
  return cleaned.replace("/", "~");
}

function accountRemaining(a: any) {
  return Number(a.monthly_budget_usd ?? 5) - (Number(a.posts_used_this_period ?? 0) / 10) * Number(a.cost_per_10_posts_usd ?? 0.5);
}

function rankedAccounts(accounts: any[], usedAccountIdsThisWeek: Set<string>) {
  const now = Date.now();
  for (const a of accounts) {
    const start = new Date(a.period_start).getTime();
    if (now - start > 30 * 86400000) {
      a.posts_used_this_period = 0;
      a.period_start = new Date().toISOString().slice(0, 10);
      a._needsReset = true;
    }
  }
  return accounts.filter((a) => a.active && accountRemaining(a) > 0).sort((a, b) => {
    const usedDelta = Number(usedAccountIdsThisWeek.has(a.id)) - Number(usedAccountIdsThisWeek.has(b.id));
    return usedDelta || accountRemaining(b) - accountRemaining(a);
  });
}

function buildLinkedInInput(profile: any, limit: number) {
  const url = profile.profile_url;
  return { url, urls: [url], profileUrls: [url], startUrls: [{ url }], username: profile.username, usernames: profile.username ? [profile.username] : undefined, limit, postsLimit: limit, maxPosts: limit, maxItems: limit };
}

function flattenItems(rawItems: any[]) {
  const flat: any[] = [];
  for (const it of rawItems) {
    if (Array.isArray(it?.posts)) flat.push(...it.posts);
    else if (Array.isArray(it?.activity)) flat.push(...it.activity);
    else if (Array.isArray(it?.items)) flat.push(...it.items);
    else flat.push(it);
  }
  return flat;
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function sumReactions(reactions: any): number {
  if (!Array.isArray(reactions)) return 0;
  return reactions.reduce((sum, r) => sum + (Number(r?.count) || 0), 0);
}

function parseCount(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/([\d,.]+)\s*([kKmMbB])?/);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] ?? "").toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  const parsed = Math.round(base * multiplier);
  return parsed > 0 ? parsed : null;
}

function extractProfileMeta(items: any[], fallback: any) {
  const meta: Record<string, any> = {};
  const candidates: any[] = [];
  for (const item of items) candidates.push(item, item?.profile, item?.user, item?.author, item?.actor, item?.data);
  for (const c of candidates.filter(Boolean)) {
    meta.avatar_url ||= firstString(
      c.avatar_url, c.avatarUrl, c.profilePicture, c.profilePictureUrl, c.profile_picture_url,
      c.profileImage, c.profileImageUrl, c.image_url, c.imageUrl, c.picture, c.photo,
    );
    const followers = parseCount(
      c.followerCount ?? c.followersCount ?? c.followers_count ?? c.numFollowers ?? c.num_followers ?? c.followers,
    );
    if (meta.num_followers == null && followers != null) meta.num_followers = followers;
    meta.display_name ||= firstString(c.fullName, c.full_name, c.name, [c.firstName, c.lastName].filter(Boolean).join(" "));
    meta.title ||= firstString(c.headline, c.occupation, c.bio, c.subtitle);
    meta.location ||= firstString(c.location, c.locationName, c.geoLocationName, c.country);
    meta.info_summary ||= firstString(c.summary, c.about, c.description, c.bio);
  }
  if (!meta.display_name) meta.display_name = fallback.display_name;
  return meta;
}

async function scrapeProfileMeta(token: string, actorIdRaw: string, profile: any) {
  const actorId = normalizeActorId(actorIdRaw);
  const input = {
    profileUrls: [profile.profile_url],
    extractFullName: true,
    extractBio: true,
    extractFollowers: true,
    extractFollowing: true,
    extractPosts: true,
    maxConcurrency: 1,
    timeout: 90,
  };
  const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`Profile actor ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = await res.json();
  return extractProfileMeta(flattenItems(Array.isArray(raw) ? raw : [raw]), profile);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fallbackToken = Deno.env.get("APIFY_API_TOKEN");
    const defaultActor = Deno.env.get("APIFY_LINKEDIN_ACTOR_ID") ?? "94SdiE9JwTx0RNyfS";

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const { profile_id, all_active, limit = 5, force_rotate = false, account_id } = body as {
      profile_id?: string; all_active?: boolean; limit?: number; force_rotate?: boolean; account_id?: string;
    };

    let q = admin.from("social_profiles").select("*").eq("user_id", user.id);
    if (profile_id) q = q.eq("id", profile_id);
    else if (all_active) q = q.eq("active", true);
    else return new Response(JSON.stringify({ error: "profile_id or all_active required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: profiles, error: pErr } = await q;
    if (pErr) throw pErr;
    if (!profiles?.length) return new Response(JSON.stringify({ scraped: 0, message: "No profiles" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: accounts } = await admin.from("social_apify_accounts").select("*").eq("user_id", user.id).eq("active", true);

    const { week, year } = isoWeek(new Date());

    let total = 0;
    const results: any[] = [];

    for (const profile of profiles) {
      // Enforce: one scrape per profile per ISO week
      const { data: existingRuns } = await admin.from("social_scrape_runs").select("id, apify_account_id, status, posts_fetched")
        .eq("user_id", user.id).eq("profile_id", profile.id).eq("iso_year", year).eq("iso_week", week);
      const alreadySucceeded = (existingRuns ?? []).some((r: any) => r.status === "success" && Number(r.posts_fetched ?? 0) > 0);
      if (alreadySucceeded && !force_rotate && !account_id) {
        results.push({ profile_id: profile.id, status: "skipped", reason: "already scraped this week" });
        continue;
      }

      // Already-used accounts this week (for the user)
      const { data: weekRuns } = await admin.from("social_scrape_runs").select("apify_account_id")
        .eq("user_id", user.id).eq("iso_year", year).eq("iso_week", week);
      const usedSet = new Set<string>((weekRuns ?? []).map((r: any) => r.apify_account_id));

      let candidates = accounts && accounts.length > 0 ? rankedAccounts(accounts as any[], usedSet) : [];
      if (account_id && accounts) {
        // Manual retry of one specific account — pin it
        const pinned = (accounts as any[]).find((a) => a.id === account_id);
        if (pinned) candidates = [pinned];
      } else if (force_rotate && candidates.length > 1) {
        // Drop accounts already used this week, then any most-recently-used one to "rotate".
        const fresh = candidates.filter((a) => !usedSet.has(a.id));
        if (fresh.length > 0) candidates = fresh;
        else candidates = [...candidates].sort((a, b) => {
          const ta = new Date(a.last_used_at ?? 0).getTime();
          const tb = new Date(b.last_used_at ?? 0).getTime();
          return ta - tb; // oldest used first
        });
      }
      if (accounts && accounts.length > 0 && candidates.length === 0) {
        results.push({ profile_id: profile.id, status: "skipped", reason: "no account with remaining credit" });
        continue;
      }
      if (!fallbackToken && candidates.length === 0) {
        results.push({ profile_id: profile.id, status: "error", error: "No Apify token available" });
        continue;
      }

      let inserted = 0;
      let winningAccount: any = null;
      let lastError = "No results";
      const attempts = candidates.length > 0 ? candidates : [{ id: null, label: "env", api_token: fallbackToken, actor_id: profile.apify_actor_id || defaultActor, actor_input_defaults: {} }];

      for (const account of attempts) {
        const token = account.api_token;
        const actorId = normalizeActorId(account.actor_id || profile.apify_actor_id || defaultActor);
        if (!token || !actorId) continue;
        if (account._needsReset) {
          await admin.from("social_apify_accounts").update({ period_start: account.period_start, posts_used_this_period: 0 }).eq("id", account.id);
        }
        const polling: any[] = [];
        const startedAt = new Date();
        const baseInput = buildLinkedInInput(profile, limit);
        const actorInput = { ...baseInput, ...(account.actor_input_defaults ?? {}) };
        polling.push({ t: new Date().toISOString(), step: "request", account: account.label, actor: actorId });
        let runUrl: string | null = null;
        let responseExcerpt = "";
        let zeroReason: string | null = null;
        try {
        const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}`;
        const apifyRes = await fetch(apiUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(actorInput),
        });
        polling.push({ t: new Date().toISOString(), step: "response", status: apifyRes.status });
        const runIdHeader = apifyRes.headers.get("x-apify-run-id");
        if (runIdHeader) runUrl = `https://console.apify.com/actors/runs/${runIdHeader}`;

        if (!apifyRes.ok) {
          const txt = await apifyRes.text();
          lastError = `Apify ${apifyRes.status}: ${txt.slice(0, 300)}`;
          responseExcerpt = txt.slice(0, 2000);
          polling.push({ t: new Date().toISOString(), step: "error", message: lastError });
          if (account.id) {
            await admin.from("social_apify_accounts").update({ last_test_status: `scrape error ${apifyRes.status}`, last_test_at: new Date().toISOString() }).eq("id", account.id);
            const finishedAt = new Date();
            await admin.from("social_scrape_runs").insert({
              user_id: user.id, profile_id: profile.id, apify_account_id: account.id,
              iso_year: year, iso_week: week, posts_fetched: 0, cost_usd: 0,
              status: "error", error: lastError.slice(0, 500),
              actor_id: actorId, actor_input: actorInput, polling_steps: polling,
              response_excerpt: responseExcerpt, run_url: runUrl,
              started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
              duration_ms: finishedAt.getTime() - startedAt.getTime(),
              zero_post_reason: `HTTP ${apifyRes.status}`,
              forced_rotation: !!force_rotate,
            });
          }
          continue;
        }

        const rawItems: any[] = await apifyRes.json();
        const flat = flattenItems(rawItems);
        polling.push({ t: new Date().toISOString(), step: "parsed", raw: rawItems.length, flat: flat.length });
        responseExcerpt = JSON.stringify(rawItems).slice(0, 2000);
        const beforeInsert = inserted;

        const insertErrors: string[] = [];
        for (const [index, item] of flat.slice(0, limit).entries()) {
          const postUrl = firstString(item.url, item.postUrl, item.post_url, item.share_url, item.link, item.permalink, item.activity_url, item.activityUrl);
          const externalId = firstString(
            item.urn, item.id, item.postId, item.post_id, item.activityId, item.activity_id, item.shareUrn, item.share_urn,
            item.entity_urn, item.entityUrn, postUrl
          );
          const postText = firstString(
            item.post_text, item.text, item.postText, item.content, item.commentary,
            item.description, item.body, item.message, item.caption, item.shared_post?.text
          ) ?? "";
          if (!externalId && !postText) continue;
          const postedRaw = item.date_posted ?? item.posted_at ?? item.postedAt ?? item.publishedAt ?? item.published_at ?? item.date ?? item.timestamp ??
            item.postedAtIso ?? item.postedAtTimestamp ?? item.time ?? item.createdAt ?? item.created_at ?? null;
          let postedIso: string | null = null;
          if (postedRaw) {
            const d = typeof postedRaw === "number" ? new Date(postedRaw) : new Date(String(postedRaw));
            if (!isNaN(d.getTime())) postedIso = d.toISOString();
          }
          const author = item.user_name ?? item.authorName ?? item.author_name ?? item.author?.name ?? item.author?.fullName ?? item.author ??
            item.shared_post?.author?.title ?? item.actor?.name ?? profile.display_name ?? profile.username;
          const company = item.authorCompany ?? item.author_company ?? item.author?.company ?? item.company ?? profile.company;
          const row = {
            user_id: user.id, profile_id: profile.id,
            external_id: externalId || `${profile.id}-${index}-${Date.now()}`,
            author: typeof author === "string" ? author : (author?.name ?? null),
            company: typeof company === "string" ? company : (company?.name ?? null),
            post_text: postText, post_type: item.post_type ?? item.type ?? item.postType ?? "post",
            post_url: postUrl,
            posted_at: postedIso,
            likes: Number(item.num_likes ?? item.likes ?? item.numLikes ?? item.likeCount ?? item.totalReactionCount ?? sumReactions(item.reactions) ?? 0) || 0,
            comments: Number(item.num_comments ?? item.comments ?? item.numComments ?? item.commentCount ?? item.commentsCount ?? 0) || 0,
            shares: Number(item.num_shares ?? item.shares ?? item.numShares ?? item.shareCount ?? item.reposts ?? item.repostsCount ?? 0) || 0,
            raw_payload: item,
            apify_account_id: account.id ?? null,
            scraped_at: new Date().toISOString(),
          };
          // Dedupe by (user_id, post_url): update metrics if it exists, otherwise insert.
          if (postUrl) {
            const { error: upErr } = await admin.from("social_posts")
              .upsert(row, { onConflict: "user_id,post_url" });
            if (!upErr) inserted++;
            else insertErrors.push(upErr.message);
          } else {
            const { error: insErr } = await admin.from("social_posts").insert(row);
            if (!insErr) inserted++;
            else insertErrors.push(insErr.message);
          }
        }
        polling.push({ t: new Date().toISOString(), step: "inserted", count: inserted - beforeInsert, errors: insertErrors.slice(0, 5) });

        // ── For the user's own profile, try to extract avatar + followers from items.
        if (profile.is_self && flat.length) {
          let avatar: string | null = null;
          let followers: number | null = null;
          let displayName: string | null = null;
          let title: string | null = null;
          const matchHandle = (profile.username || "").toLowerCase();
          for (const it of flat) {
            // Prefer items that are not reposts so author === self.
            const isRepost = it?.is_repost || it?.activity_type === "Repost";
            if (isRepost) continue;
            const a = it?.author ?? it?.actor ?? {};
            const aUrl = String(a?.url ?? a?.profileUrl ?? "").toLowerCase();
            const aHandle = String(a?.public_identifier ?? a?.publicIdentifier ?? a?.username ?? "").toLowerCase();
            const looksSelf = (matchHandle && (aHandle === matchHandle || aUrl.includes(`/in/${matchHandle}`))) || !matchHandle;
            if (!looksSelf) continue;
            avatar = firstString(a?.profilePicture, a?.profile_picture, a?.image_url, a?.imageUrl, a?.photo, a?.picture, it?.authorImage, it?.authorPicture) || avatar;
            const fRaw = a?.followersCount ?? a?.numFollowers ?? a?.num_followers ?? a?.followers ?? it?.followersCount ?? it?.numFollowers ?? null;
            if (followers == null && fRaw != null) {
              const n = typeof fRaw === "number" ? fRaw : Number(String(fRaw).replace(/[,\s]/g, "").match(/\d+/)?.[0] ?? "");
              if (Number.isFinite(n) && n > 0) followers = n;
            }
            // Some actors return "occupation" like "12,345 followers"
            const occ = String(a?.occupation ?? a?.subtitle ?? "");
            if (followers == null && /follower/i.test(occ)) {
              const n = Number(occ.replace(/[,\s]/g, "").match(/\d+/)?.[0] ?? "");
              if (Number.isFinite(n) && n > 0) followers = n;
            }
            displayName = firstString(a?.name, a?.fullName, a?.full_name, a?.title) || displayName;
            title = firstString(a?.headline, a?.subtitle) || title;
            if (avatar && followers != null) break;
          }
          const selfPatch: Record<string, any> = {};
          if (avatar) selfPatch.avatar_url = avatar;
          if (followers != null) { selfPatch.num_followers = followers; selfPatch.followers = followers; }
          if (displayName && !profile.display_name) selfPatch.display_name = displayName;
          if (title && !profile.title) selfPatch.title = title;
          if (Object.keys(selfPatch).length) {
            await admin.from("social_profiles").update(selfPatch).eq("id", profile.id);
            polling.push({ t: new Date().toISOString(), step: "self_meta", patch: selfPatch });
          }
        }

        if (inserted === 0) {
          zeroReason = flat.length === 0 ? "Actor returned 0 items" : insertErrors.length ? `Database insert failed: ${insertErrors[0]}` : "Items returned but no usable text/id found";
          lastError = zeroReason;
          if (account.id) {
            await admin.from("social_apify_accounts").update({ last_test_status: "no results", last_test_at: new Date().toISOString() }).eq("id", account.id);
            const finishedAt = new Date();
            await admin.from("social_scrape_runs").insert({
              user_id: user.id, profile_id: profile.id, apify_account_id: account.id,
              iso_year: year, iso_week: week, posts_fetched: 0, cost_usd: 0,
              status: "error", error: lastError.slice(0, 500),
              actor_id: actorId, actor_input: actorInput, polling_steps: polling,
              response_excerpt: responseExcerpt, run_url: runUrl,
              started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
              duration_ms: finishedAt.getTime() - startedAt.getTime(),
              zero_post_reason: zeroReason,
              forced_rotation: !!force_rotate,
            });
          }
          continue;
        }

        winningAccount = account;
        break;
        } catch (e: any) {
          lastError = String(e?.message ?? e);
          polling.push({ t: new Date().toISOString(), step: "exception", message: lastError });
          if (account.id) {
            await admin.from("social_apify_accounts").update({ last_test_status: "scrape failed", last_test_at: new Date().toISOString() }).eq("id", account.id);
            const finishedAt = new Date();
            await admin.from("social_scrape_runs").insert({
              user_id: user.id, profile_id: profile.id, apify_account_id: account.id,
              iso_year: year, iso_week: week, posts_fetched: 0, cost_usd: 0,
              status: "error", error: lastError.slice(0, 500),
              actor_id: actorId, actor_input: actorInput, polling_steps: polling,
              response_excerpt: responseExcerpt, run_url: runUrl,
              started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
              duration_ms: finishedAt.getTime() - startedAt.getTime(),
              zero_post_reason: "exception",
              forced_rotation: !!force_rotate,
            });
          }
        }
      }

      if (inserted === 0) {
        await admin.from("social_profiles").update({
          last_scraped_at: new Date().toISOString(), last_scrape_status: "error",
          last_scrape_error: lastError.slice(0, 500),
        }).eq("id", profile.id);
        results.push({ profile_id: profile.id, status: "error", error: lastError });
        continue;
      }

        const cost = (inserted / 10) * 0.5;
        total += inserted;

        await admin.from("social_profiles").update({
          last_scraped_at: new Date().toISOString(), last_scrape_status: "success", last_scrape_error: null,
        }).eq("id", profile.id);

        if (winningAccount?.id) {
          await admin.from("social_apify_accounts").update({
            posts_used_this_period: Number(winningAccount.posts_used_this_period ?? 0) + inserted,
            last_used_at: new Date().toISOString(),
            last_test_status: "ok",
          }).eq("id", winningAccount.id);
          const finishedAt = new Date();
          const winActorId = normalizeActorId(winningAccount.actor_id || profile.apify_actor_id || defaultActor);
          await admin.from("social_scrape_runs").insert({
            user_id: user.id, profile_id: profile.id, apify_account_id: winningAccount.id,
            iso_year: year, iso_week: week, posts_fetched: inserted, cost_usd: cost, status: "success",
            actor_id: winActorId,
            actor_input: { ...buildLinkedInInput(profile, limit), ...(winningAccount.actor_input_defaults ?? {}) },
            polling_steps: [{ t: finishedAt.toISOString(), step: "success", inserted }],
            started_at: finishedAt.toISOString(), finished_at: finishedAt.toISOString(), duration_ms: 0,
            forced_rotation: !!force_rotate,
          });
        }

        results.push({ profile_id: profile.id, status: "success", posts: inserted, account: winningAccount?.label ?? "env" });
    }

    // Auto re-cluster Hot Topics from the full post history whenever any post was inserted/updated.
    let recluster: any = null;
    if (total > 0) {
      try {
        const clusterRes = await fetch(`${supabaseUrl}/functions/v1/cluster-hot-topics`, {
          method: "POST",
          headers: {
            Authorization: req.headers.get("Authorization") ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trigger: "post-scrape" }),
        });
        recluster = { status: clusterRes.status };
      } catch (e: any) {
        recluster = { error: String(e?.message ?? e) };
      }
    }

    return new Response(JSON.stringify({ scraped: total, results, recluster }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("scrape-linkedin-profile:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
