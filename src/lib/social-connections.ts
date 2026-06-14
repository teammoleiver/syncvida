import { supabase } from "@/integrations/supabase/client";

export type SocialProvider = "linkedin" | "facebook" | "instagram" | "twitter" | "canva";

export type SocialConnectionMeta = {
  provider: SocialProvider;
  provider_user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  expires_at: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
};

/** Loads the current user's social connections (metadata only — never tokens). */
export async function listMyConnections(): Promise<SocialConnectionMeta[]> {
  const { data, error } = await supabase.rpc("get_my_social_connections" as any);
  if (error) throw error;
  return ((data as any[]) ?? []) as SocialConnectionMeta[];
}

export async function getMyLinkedInConnection(): Promise<SocialConnectionMeta | null> {
  const all = await listMyConnections();
  return all.find((c) => c.provider === "linkedin") ?? null;
}

/**
 * Direct fetch wrapper around an edge function so we can surface the actual
 * error body when the function returns 4xx/5xx (Supabase's `functions.invoke`
 * collapses these to "Edge Function returned a non-2xx status code").
 */
async function callEdge<T>(fn: string, body: any): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL ?? "https://vpsaonpsidmuzufhlbis.supabase.co"}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = parsed?.error || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (parsed?.error) throw new Error(parsed.error);
  return (parsed as T) ?? ({} as T);
}

export async function startLinkedInAuth(redirectTo?: string): Promise<{ authorize_url: string; state: string }> {
  // Pass the current origin so the backend builds a redirect_uri that points
  // back to THIS deployment (localhost in dev, instaleadsync.com in prod) instead of
  // a single hardcoded URL.
  return callEdge("linkedin-oauth-start", { redirect_to: redirectTo ?? null, origin: window.location.origin });
}

export async function exchangeLinkedInCode(code: string, state: string) {
  return callEdge<{ ok: true; provider: "linkedin"; provider_user_id: string; display_name: string | null; avatar_url: string | null; redirect_to: string | null }>(
    "linkedin-oauth-exchange",
    { code, state },
  );
}

export async function disconnectLinkedIn(): Promise<void> {
  await callEdge<{ ok: true }>("linkedin-disconnect", {});
}

export async function postToLinkedIn(args: { plan_id?: string; text?: string; image_url?: string }) {
  return callEdge<{ ok: true; post_urn: string | null; status: number }>("post-to-linkedin", args);
}

/* ─── Canva ─── */

export async function getMyCanvaConnection(): Promise<SocialConnectionMeta | null> {
  const all = await listMyConnections();
  return all.find((c) => c.provider === "canva") ?? null;
}

export async function startCanvaAuth(redirectTo?: string): Promise<{ authorize_url: string; state: string }> {
  return callEdge("canva-oauth-start", { redirect_to: redirectTo ?? null });
}

export async function exchangeCanvaCode(code: string, state: string) {
  return callEdge<{ ok: true; provider: "canva"; provider_user_id: string; display_name: string | null; avatar_url: string | null; redirect_to: string | null }>(
    "canva-oauth-exchange", { code, state },
  );
}

export async function disconnectCanva(): Promise<void> {
  await callEdge<{ ok: true }>("canva-disconnect", {});
}

export type CanvaTemplate = { id: string; title: string; view_url: string | null; thumbnail_url: string | null; dataset: any | null };
export async function listCanvaTemplates(): Promise<CanvaTemplate[]> {
  const r = await callEdge<{ items: CanvaTemplate[] }>("canva-list-templates", {});
  return r.items ?? [];
}

export type CanvaDesign = { id: string; title: string; thumbnail_url: string | null; view_url: string | null; edit_url: string | null; updated_at?: string };
export async function listCanvaDesigns(q?: string): Promise<CanvaDesign[]> {
  const r = await callEdge<{ items: CanvaDesign[] }>("canva-list-designs", { q });
  return r.items ?? [];
}

export async function createCanvaDesign(args: {
  plan_id?: string;
  kind: "blank" | "from_design" | "autofill";
  source_design_id?: string;
  brand_template_id?: string;
  fields?: Record<string, any>;
  design_type?: string;
  title?: string;
}) {
  return callEdge<{ design_id: string | null; edit_url: string | null; view_url: string | null }>(
    "canva-create-design", args,
  );
}

export async function exportCanvaDesign(args: { design_id: string; plan_id?: string; format?: "png" | "pdf" }) {
  return callEdge<{ ok: true; image_url: string; design_id: string; format: string }>(
    "canva-export-design", args,
  );
}

/* ─── Meta (Facebook + Instagram, single OAuth) ─── */

export type MetaConnectionMeta = SocialConnectionMeta & {
  raw_profile?: {
    primary_page?: { id: string; name: string; instagram_business_account?: { id: string } };
    primary_ig?: { id: string; username: string; name?: string; profile_picture_url?: string };
  };
};

export async function getMyMetaConnection(): Promise<SocialConnectionMeta | null> {
  const all = await listMyConnections();
  return all.find((c) => c.provider === "meta" as any) ?? null;
}

export async function startMetaAuth(redirectTo?: string): Promise<{ authorize_url: string; state: string }> {
  return callEdge("meta-oauth-start", { redirect_to: redirectTo ?? null });
}

export async function exchangeMetaCode(code: string, state: string) {
  return callEdge<{
    ok: true; provider: "meta";
    provider_user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    page_name: string | null;
    ig_username: string | null;
    redirect_to: string | null;
  }>("meta-oauth-exchange", { code, state });
}

export async function disconnectMeta(): Promise<void> {
  await callEdge<{ ok: true }>("meta-disconnect", {});
}

export async function postToFacebook(args: { plan_id?: string; text?: string; image_url?: string }) {
  return callEdge<{ ok: true; post_id: string | null; status: number }>("post-to-facebook", args);
}

export async function postToInstagram(args: { plan_id?: string; text?: string; image_url?: string }) {
  return callEdge<{ ok: true; media_id: string | null; container_id: string; status: number }>(
    "post-to-instagram", args,
  );
}
