import { supabase } from "@/integrations/supabase/client";

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Normalize a LinkedIn URL: lowercase, strip query/hash, drop trailing slash.
export function normalizeLinkedInUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes("linkedin.com")) return null;
    return `https://${host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

// ── Companies ──
export async function listCompanies() {
  const u = await uid(); if (!u) return [];
  const { data, error } = await supabase.from("crm_companies" as any).select("*").eq("user_id", u).order("created_at", { ascending: false });
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function createCompany(input: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_companies" as any).insert({ ...input, user_id: u }).select().single();
  if (error) { console.error(error); return null; }
  return data as any;
}
export async function updateCompany(id: string, updates: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_companies" as any).update(updates).eq("id", id).eq("user_id", u).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function deleteCompany(id: string) {
  const u = await uid(); if (!u) return;
  const { error } = await supabase.from("crm_companies" as any).delete().eq("id", id).eq("user_id", u);
  if (error) console.error(error);
}
export async function findOrCreateCompanyByName(name?: string | null) {
  if (!name) return null;
  const u = await uid(); if (!u) return null;
  const { data: existing } = await supabase.from("crm_companies" as any).select("*").eq("user_id", u).ilike("name", name).limit(1);
  if (existing && existing.length) return existing[0] as any;
  return createCompany({ name });
}

// ── Contacts ──
export async function listContacts() {
  const u = await uid(); if (!u) return [];
  const { data, error } = await supabase.from("crm_contacts" as any).select("*, company:crm_companies(id,name,domain,logo_url)").eq("user_id", u).order("created_at", { ascending: false });
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function getContact(id: string) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_contacts" as any).select("*, company:crm_companies(id,name,domain,logo_url)").eq("id", id).eq("user_id", u).single();
  if (error) console.error(error);
  return data as any;
}
export async function createContact(input: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const payload: any = { ...input, user_id: u };
  if (payload.linkedin_url) payload.linkedin_url = normalizeLinkedInUrl(payload.linkedin_url) ?? payload.linkedin_url;
  const { data, error } = await supabase.from("crm_contacts" as any).insert(payload).select().single();
  if (error) { console.error(error); return null; }
  return data as any;
}
export async function updateContact(id: string, updates: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  if (updates.linkedin_url !== undefined) {
    updates.linkedin_url = updates.linkedin_url ? (normalizeLinkedInUrl(updates.linkedin_url) ?? updates.linkedin_url) : null;
  }
  const { data, error } = await supabase.from("crm_contacts" as any).update(updates).eq("id", id).eq("user_id", u).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function deleteContact(id: string) {
  const u = await uid(); if (!u) return;
  const { error } = await supabase.from("crm_contacts" as any).delete().eq("id", id).eq("user_id", u);
  if (error) console.error(error);
}
export async function bulkCreateContacts(rows: Record<string, any>[]) {
  const u = await uid(); if (!u) return 0;
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    ...r,
    user_id: u,
    linkedin_url: r.linkedin_url ? (normalizeLinkedInUrl(r.linkedin_url) ?? r.linkedin_url) : null,
    source: r.source ?? "csv",
  }));
  const { error, count } = await supabase.from("crm_contacts" as any).insert(payload, { count: "exact" });
  if (error) console.error(error);
  return count ?? payload.length;
}

// ── Pipelines / Stages ──
export async function listPipelines() {
  const u = await uid(); if (!u) return [];
  const { data, error } = await supabase.from("crm_pipelines" as any).select("*").eq("user_id", u).order("position", { ascending: true });
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function createPipeline(name: string, color = "#1D9E75") {
  const u = await uid(); if (!u) return null;
  const existing = await listPipelines();
  const { data, error } = await supabase.from("crm_pipelines" as any).insert({ user_id: u, name, color, position: existing.length }).select().single();
  if (error) { console.error(error); return null; }
  // Seed default stages
  await supabase.from("crm_pipeline_stages" as any).insert([
    { user_id: u, pipeline_id: (data as any).id, name: "New", color: "#3b82f6", position: 0 },
    { user_id: u, pipeline_id: (data as any).id, name: "In Progress", color: "#f59e0b", position: 1 },
    { user_id: u, pipeline_id: (data as any).id, name: "Won", color: "#10b981", position: 2, is_won: true },
    { user_id: u, pipeline_id: (data as any).id, name: "Lost", color: "#94a3b8", position: 3, is_lost: true },
  ]);
  return data as any;
}
export async function updatePipeline(id: string, updates: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_pipelines" as any).update(updates).eq("id", id).eq("user_id", u).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function deletePipeline(id: string) {
  const u = await uid(); if (!u) return;
  await supabase.from("crm_pipelines" as any).delete().eq("id", id).eq("user_id", u);
}
export async function listStages(pipelineId: string) {
  const u = await uid(); if (!u) return [];
  const { data, error } = await supabase.from("crm_pipeline_stages" as any).select("*").eq("user_id", u).eq("pipeline_id", pipelineId).order("position", { ascending: true });
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function createStage(pipelineId: string, name: string, color = "#94a3b8") {
  const u = await uid(); if (!u) return null;
  const existing = await listStages(pipelineId);
  const { data, error } = await supabase.from("crm_pipeline_stages" as any).insert({ user_id: u, pipeline_id: pipelineId, name, color, position: existing.length }).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function updateStage(id: string, updates: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_pipeline_stages" as any).update(updates).eq("id", id).eq("user_id", u).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function deleteStage(id: string) {
  const u = await uid(); if (!u) return;
  await supabase.from("crm_pipeline_stages" as any).delete().eq("id", id).eq("user_id", u);
}

// ── Deals ──
export async function listDeals(pipelineId?: string) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("crm_deals" as any).select("*, contact:crm_contacts(id,first_name,last_name,email,avatar_url), company:crm_companies(id,name,logo_url)").eq("user_id", u);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { data, error } = await q.order("position", { ascending: true });
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function createDeal(input: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_deals" as any).insert({ ...input, user_id: u }).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function updateDeal(id: string, updates: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_deals" as any).update(updates).eq("id", id).eq("user_id", u).select().single();
  if (error) console.error(error);
  return data as any;
}
export async function deleteDeal(id: string) {
  const u = await uid(); if (!u) return;
  await supabase.from("crm_deals" as any).delete().eq("id", id).eq("user_id", u);
}

// ── Activities ──
export async function listActivities(opts: { contactId?: string; dealId?: string }) {
  const u = await uid(); if (!u) return [];
  let q = supabase.from("crm_activities" as any).select("*").eq("user_id", u);
  if (opts.contactId) q = q.eq("contact_id", opts.contactId);
  if (opts.dealId) q = q.eq("deal_id", opts.dealId);
  const { data, error } = await q.order("occurred_at", { ascending: false }).limit(100);
  if (error) console.error(error);
  return (data ?? []) as any[];
}
export async function createActivity(input: Record<string, any>) {
  const u = await uid(); if (!u) return null;
  const { data, error } = await supabase.from("crm_activities" as any).insert({ ...input, user_id: u }).select().single();
  if (error) console.error(error);
  return data as any;
}

// ── Social Hub sync ──
export async function findTrackedProfileByLinkedInUrl(url: string) {
  const u = await uid(); if (!u) return null;
  const norm = normalizeLinkedInUrl(url); if (!norm) return null;
  const { data } = await supabase.from("social_profiles").select("*").eq("user_id", u).ilike("profile_url", `%${norm.replace("https://", "")}%`).limit(1);
  return (data && data.length) ? data[0] : null;
}

export async function pushContactToTrackedProfile(contactId: string) {
  const u = await uid(); if (!u) throw new Error("Not signed in");
  const contact = await getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  const url = normalizeLinkedInUrl(contact.linkedin_url);
  if (!url) throw new Error("Contact has no LinkedIn URL");
  const existing = await findTrackedProfileByLinkedInUrl(url);
  if (existing) return existing;
  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || contact.email || "Untitled";
  const username = url.split("/in/")[1]?.replace(/\/$/, "") ?? null;
  const { data, error } = await supabase.from("social_profiles").insert({
    user_id: u,
    profile_url: url,
    username,
    display_name: displayName,
    company: contact.company?.name ?? null,
    headline: contact.title ?? null,
    avatar_url: contact.avatar_url ?? null,
    active: true,
    scrape_cadence: "weekly",
    source: "crm" as any,
  } as any).select().single();
  if (error) throw error;
  // Back-link
  await updateContact(contactId, { source_profile_id: (data as any)?.id });
  return data;
}

export async function createContactFromTrackedProfile(profile: any) {
  const u = await uid(); if (!u) throw new Error("Not signed in");
  const url = normalizeLinkedInUrl(profile.profile_url);
  // Check existing contact by linkedin url
  if (url) {
    const { data: existing } = await supabase.from("crm_contacts" as any).select("*").eq("user_id", u).eq("linkedin_url", url).limit(1);
    if (existing && existing.length) return existing[0] as any;
  }
  const company = profile.company ? await findOrCreateCompanyByName(profile.company) : null;
  const fullName = (profile.display_name || profile.username || "").trim();
  const [first, ...rest] = fullName.split(/\s+/);
  const contact = await createContact({
    first_name: first || null,
    last_name: rest.join(" ") || null,
    title: profile.headline ?? null,
    company_id: company?.id ?? null,
    linkedin_url: url,
    avatar_url: profile.avatar_url ?? null,
    source: "social_hub",
    source_profile_id: profile.id ?? null,
  });
  return contact;
}

export async function getPostsForContactLinkedInUrl(url: string) {
  const u = await uid(); if (!u) return [];
  const norm = normalizeLinkedInUrl(url); if (!norm) return [];
  // Match by profile_url on the joined profile
  const { data } = await supabase
    .from("social_posts")
    .select("*, profile:social_profiles!inner(profile_url)")
    .eq("user_id", u)
    .ilike("profile.profile_url", `%${norm.replace("https://", "")}%`)
    .order("posted_at", { ascending: false })
    .limit(20);
  return data ?? [];
}