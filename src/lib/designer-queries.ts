import { supabase } from "@/integrations/supabase/client";

export type BrandColors = { primary: string; secondary: string; accent: string; bg: string; text: string };
export type BrandFonts = { heading: string; body: string };
export type BrandKit = {
  id: string; user_id: string; brand_name: string | null; website_url: string | null;
  colors: BrandColors; fonts: BrandFonts;
  logo_light_url: string | null; logo_dark_url: string | null; avatar_url: string | null;
  footer_text: string | null; tone: string | null; extracted_at: string | null;
};

export type Shadow = { x: number; y: number; blur: number; color: string };
export type GradientStop = { offset: number; color: string };
export type Gradient = { kind: "linear" | "radial"; angle?: number; stops: GradientStop[] };
export type Fill = string | Gradient;

export type ElementBase = {
  id: string; x: number; y: number; w: number; h: number;
  rotation?: number; z?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  shadow?: Shadow | null;
  groupId?: string | null;
};

export type MaskShape = "none" | "circle" | "rounded" | "squircle" | "hexagon" | "blob";
export type TextElement = ElementBase & {
  type: "text";
  text: string;
  font?: "heading" | "body" | string;
  size: number;
  weight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  underline?: boolean;
};
export type ImageElement = ElementBase & {
  type: "image"; src: string; fit: "cover" | "contain"; radius?: number; assetId?: string;
  brightness?: number;   // 0..2, default 1
  contrast?: number;     // 0..2, default 1
  saturation?: number;   // 0..2, default 1
  blur?: number;         // 0..40 px, default 0
  mask?: MaskShape;      // default "none"
};
export type ShapeElement = ElementBase & {
  type: "shape";
  shape: "rect" | "circle" | "triangle";
  fill: Fill;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
};
export type LineElement = ElementBase & {
  type: "line";
  stroke: string;
  strokeWidth: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
};
export type IconElement = ElementBase & {
  type: "icon"; name: string; color: string; strokeWidth?: number;
};
export type LogoElement = ElementBase & { type: "logo"; variant: "light" | "dark" };

export type DesignElement =
  | TextElement | ImageElement | ShapeElement | LineElement | IconElement | LogoElement;

export type Slide = { id: string; bg: Fill; elements: DesignElement[] };

export type Design = {
  id: string; user_id: string; type: "single" | "carousel";
  platform: "linkedin" | "instagram" | "facebook" | "x" | "multi";
  title: string; width: number; height: number; slides: Slide[];
  thumbnail_url: string | null; planner_entry_id: string | null;
  created_at: string; updated_at: string;
  showPageNumbers?: boolean;
  pageNumberStyle?: { color: string; position: "br" | "bl" | "tr" | "tl" };
};

export type DesignAsset = {
  id: string; user_id: string; kind: "upload" | "ai_generated" | "ai_edited" | "url_import" | "bg_removed";
  storage_path: string; public_url: string; prompt: string | null;
  parent_asset_id: string | null; width: number | null; height: number | null;
  mime: string | null; created_at: string;
  name?: string | null;
};

export type DesignTemplate = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  platform: Design["platform"];
  type: "single" | "carousel";
  width: number;
  height: number;
  slides: Slide[];
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

// ── Brand kit ──
export async function getBrandKit(): Promise<BrandKit | null> {
  const u = await uid();
  const { data } = await supabase.from("brand_kits" as any).select("*").eq("user_id", u).maybeSingle();
  return (data as any) ?? null;
}
export async function upsertBrandKit(patch: Partial<BrandKit>): Promise<BrandKit> {
  const u = await uid();
  const existing = await getBrandKit();
  if (existing) {
    const { data, error } = await supabase.from("brand_kits" as any).update(patch).eq("user_id", u).select().single();
    if (error) throw error;
    return data as any;
  }
  const { data, error } = await supabase.from("brand_kits" as any).insert({ ...patch, user_id: u } as any).select().single();
  if (error) throw error;
  return data as any;
}
export async function uploadBrandFile(file: File, slot: "logo_light" | "logo_dark" | "avatar"): Promise<string> {
  const u = await uid();
  const ext = file.name.split(".").pop() || "png";
  const path = `${u}/${slot}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("brand-assets").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = await supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? "";
}
export async function extractBrandFromUrl(url: string) {
  return supabase.functions.invoke("extract-brand-from-url", { body: { url } });
}

// ── Assets ──
export async function listAssets(): Promise<DesignAsset[]> {
  const u = await uid();
  const { data } = await supabase.from("design_assets" as any).select("*").eq("user_id", u).order("created_at", { ascending: false });
  return (data as any) ?? [];
}
/**
 * Upload a design's rendered PNG thumbnail to the (public) design-exports bucket
 * and return a clean public URL — safe to send to LinkedIn / Zapier / n8n without
 * auth tokens. Falls back to the original data URL if upload fails.
 */
export async function uploadDesignThumbnail(designId: string, dataUrl: string): Promise<string> {
  try {
    const u = await uid();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${u}/${designId}-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from("design-exports")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from("design-exports").getPublicUrl(path);
    return data?.publicUrl ?? dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function uploadAsset(file: File): Promise<DesignAsset> {
  const u = await uid();
  const ext = file.name.split(".").pop() || "png";
  const path = `${u}/upload-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("design-assets").upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("design-assets").getPublicUrl(path);
  const { data, error } = await supabase.from("design_assets" as any).insert({
    user_id: u, kind: "upload", storage_path: path, public_url: pub?.publicUrl ?? "",
    mime: file.type,
  } as any).select().single();
  if (error) throw error;
  return data as any;
}
export async function generateAssetImage(prompt: string, aspect: "1:1" | "4:5" | "9:16" = "1:1") {
  return generateAssetImageWithRefs(prompt, aspect, []);
}
export async function generateAssetImageWithRefs(prompt: string, aspect: "1:1" | "4:5" | "9:16", reference_asset_ids: string[]) {
  return supabase.functions.invoke("generate-design-image", { body: { prompt, aspect, reference_asset_ids } });
}
export async function importAssetFromUrl(url: string, name?: string) {
  return supabase.functions.invoke("import-asset-from-url", { body: { url, name } });
}
export async function suggestAssetName(asset_id: string) {
  return supabase.functions.invoke("suggest-asset-name", { body: { asset_id } });
}
export async function removeAssetBackground(asset_id: string) {
  return supabase.functions.invoke("remove-asset-background", { body: { asset_id } });
}
export async function renameAsset(asset_id: string, name: string) {
  const { data, error } = await supabase.from("design_assets" as any)
    .update({ name } as any).eq("id", asset_id).select().single();
  if (error) throw error;
  return data as any;
}
export async function editAssetImage(asset_id: string, prompt: string) {
  return supabase.functions.invoke("edit-design-image", { body: { asset_id, prompt } });
}
export async function deleteAsset(asset: DesignAsset) {
  await supabase.storage.from("design-assets").remove([asset.storage_path]);
  await supabase.from("design_assets" as any).delete().eq("id", asset.id);
}

// ── Designs ──
export async function listDesigns(): Promise<Design[]> {
  const u = await uid();
  const { data } = await supabase.from("designs" as any).select("*").eq("user_id", u).order("updated_at", { ascending: false });
  return (data as any) ?? [];
}
export async function getDesign(id: string): Promise<Design | null> {
  const { data } = await supabase.from("designs" as any).select("*").eq("id", id).maybeSingle();
  return (data as any) ?? null;
}
export async function createDesign(input: { type: "single" | "carousel"; platform: Design["platform"]; title?: string; width?: number; height?: number; slides?: Slide[] }): Promise<Design> {
  const u = await uid();
  const { data, error } = await supabase.from("designs" as any).insert({
    user_id: u, type: input.type, platform: input.platform,
    title: input.title ?? "Untitled design",
    width: input.width ?? 1080, height: input.height ?? (input.type === "carousel" ? 1350 : 1080),
    slides: input.slides ?? [{ id: crypto.randomUUID(), bg: "#FFFFFF", elements: [] }],
  } as any).select().single();
  if (error) throw error;
  return data as any;
}
export async function updateDesign(id: string, patch: Partial<Design>) {
  const { error } = await supabase.from("designs" as any).update(patch as any).eq("id", id);
  if (error) throw error;
}
export async function deleteDesign(id: string) {
  await supabase.from("designs" as any).delete().eq("id", id);
}
export async function generateDesignFromPrompt(args: { prompt: string; type: "single" | "carousel"; platform: Design["platform"]; slideCount?: number }) {
  return supabase.functions.invoke("generate-design-from-prompt", { body: args });
}

// ── Templates ──
export async function listTemplates(filter?: { platform?: Design["platform"]; type?: "single" | "carousel"; q?: string }): Promise<DesignTemplate[]> {
  const u = await uid();
  let q = supabase.from("design_templates" as any).select("*").eq("user_id", u).order("updated_at", { ascending: false });
  if (filter?.platform && filter.platform !== "multi") q = q.eq("platform", filter.platform);
  if (filter?.type) q = q.eq("type", filter.type);
  if (filter?.q) q = q.ilike("title", `%${filter.q}%`);
  const { data } = await q;
  return (data as any) ?? [];
}
export async function saveAsTemplate(args: {
  title: string; category?: string | null;
  platform: Design["platform"]; type: "single" | "carousel";
  width: number; height: number; slides: Slide[]; thumbnail_url?: string | null;
}): Promise<DesignTemplate> {
  const u = await uid();
  const { data, error } = await supabase.from("design_templates" as any).insert({
    user_id: u, title: args.title, category: args.category ?? null,
    platform: args.platform, type: args.type,
    width: args.width, height: args.height, slides: args.slides,
    thumbnail_url: args.thumbnail_url ?? null,
  } as any).select().single();
  if (error) throw error;
  return data as any;
}
export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("design_templates" as any).delete().eq("id", id);
  if (error) throw error;
}
export async function createDesignFromTemplate(t: DesignTemplate, override?: Partial<Pick<Design, "title">>): Promise<Design> {
  // Re-generate slide/element ids so duplicates aren't tied to the template
  const slides = (t.slides as any[]).map((s) => ({
    ...s, id: crypto.randomUUID(),
    elements: (s.elements ?? []).map((e: any) => ({ ...e, id: crypto.randomUUID() })),
  }));
  return createDesign({
    type: t.type, platform: t.platform,
    title: override?.title ?? t.title,
    width: t.width, height: t.height, slides,
  });
}

// ── In-editor AI ──
export async function aiEditDesign(args: {
  designId: string;
  slideIndex: number;
  message: string;
  selectedIds?: string[];
}) {
  return supabase.functions.invoke("design-ai-chat", { body: args });
}

// ── Magic resize: scale the entire design to a new canvas ──
export async function resizeDesign(id: string, newWidth: number, newHeight: number) {
  const d = await getDesign(id);
  if (!d) throw new Error("Design not found");
  const sx = newWidth / d.width;
  const sy = newHeight / d.height;
  const slides = d.slides.map((s) => ({
    ...s,
    elements: s.elements.map((e) => {
      const next: any = {
        ...e,
        x: Math.round(e.x * sx),
        y: Math.round(e.y * sy),
        w: Math.round(e.w * sx),
        h: Math.round(e.h * sy),
      };
      if (e.type === "text") next.size = Math.max(8, Math.round((e as any).size * Math.min(sx, sy)));
      return next;
    }),
  }));
  await updateDesign(id, { width: newWidth, height: newHeight, slides });
  return getDesign(id);
}
