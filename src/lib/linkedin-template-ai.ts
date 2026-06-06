import { supabase } from "@/integrations/supabase/client";
import type { CarouselData, CarouselSlide, AccentKey } from "@/components/designer/linkedin/LinkedInCanvas";

export type AiFillResult = {
  slides: CarouselSlide[];
  iconHints: (string | null)[];
  rationale: string | null;
  usedMemories: number;
};

/** Call the edge function and return AI-generated slides for the carousel. */
export async function aiFillCarouselTemplate(args: {
  hook: string; body: string; current: CarouselData; hashtagFirst?: boolean;
}): Promise<AiFillResult> {
  const { data, error } = await supabase.functions.invoke("ai-fill-carousel-template", {
    body: {
      hook: args.hook,
      body: args.body,
      author: args.current.author,
      handleShort: args.current.handleShort,
      themeKey: args.current.themeKey ?? "figma-template",
      hashtagFirst: !!args.hashtagFirst,
    },
  });
  if (error) throw new Error(error.message || "AI fill failed");
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  return {
    slides: (d?.slides ?? []) as CarouselSlide[],
    iconHints: (d?.iconHints ?? []) as (string | null)[],
    rationale: d?.rationale ?? null,
    usedMemories: Number(d?.usedMemories ?? 0),
  };
}

/** Apply AI-returned slides on top of the existing carousel data. */
export function applyAiSlidesToCarousel(
  current: CarouselData,
  result: AiFillResult,
  defaultAccent: AccentKey = "teal",
): CarouselData {
  const slides = result.slides.map((s) => ({ accent: defaultAccent, ...s }));
  return { ...current, slides, overlays: {} };
}

/** Persist an accepted run so future calls can learn from it. */
export async function saveTemplateFillMemory(args: {
  hook: string; body: string; themeKey?: string;
  slides: CarouselSlide[]; iconHints: (string | null)[];
  rating?: number; notes?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("linkedin_template_fill_memory" as any).insert({
    user_id: user.id,
    theme_key: args.themeKey ?? null,
    post_hook: args.hook,
    post_body: args.body,
    slides: args.slides as any,
    icon_hints: args.iconHints as any,
    rating: args.rating ?? 1,
    notes: args.notes ?? null,
  } as any);
}

/** Targeted AI rewrite for one slide that's failing a validation rule. */
export async function aiFixSlideIssue(args: {
  slides: CarouselSlide[]; slideIndex: number;
  issueCode: string; issueMessage: string;
  hook: string; body: string; hashtagFirst?: boolean;
}): Promise<{ slide: (CarouselSlide & { drop?: boolean }) | null; rationale: string | null }> {
  const { data, error } = await supabase.functions.invoke("ai-fix-slide-issue", {
    body: {
      slides: args.slides,
      slideIndex: args.slideIndex,
      issueCode: args.issueCode,
      issueMessage: args.issueMessage,
      hook: args.hook, body: args.body,
      hashtagFirst: !!args.hashtagFirst,
    },
  });
  if (error) throw new Error(error.message || "AI fix failed");
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  return { slide: d?.slide ?? null, rationale: d?.rationale ?? null };
}

/** Persist every preview run + score so the user can see quality trends. */
export async function saveFillHistory(args: {
  hook: string; body: string; themeKey?: string; hashtagFirst?: boolean;
  slides: CarouselSlide[]; iconHints: (string | null)[];
  score: number; errors: number; warnings: number; applied?: boolean;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("linkedin_template_fill_history" as any).insert({
    user_id: user.id,
    theme_key: args.themeKey ?? null,
    hashtag_first: !!args.hashtagFirst,
    post_hook: args.hook, post_body: args.body,
    slides: args.slides as any, icon_hints: args.iconHints as any,
    score: args.score, errors: args.errors, warnings: args.warnings,
    applied: !!args.applied,
  } as any).select("id").maybeSingle();
  return (data as any)?.id ?? null;
}

/** Mark a history row as applied (called after the user clicks Apply). */
export async function markFillHistoryApplied(id: string) {
  await supabase.from("linkedin_template_fill_history" as any).update({ applied: true } as any).eq("id", id);
}

export type FillHistoryRow = {
  id: string;
  created_at: string;
  theme_key: string | null;
  hashtag_first: boolean;
  post_hook: string | null;
  score: number;
  errors: number;
  warnings: number;
  applied: boolean;
};

/** Recent history rows for the current user (most recent first). */
export async function listFillHistory(limit = 10): Promise<FillHistoryRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("linkedin_template_fill_history" as any)
    .select("id, created_at, theme_key, hashtag_first, post_hook, score, errors, warnings, applied")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as any[]) ?? [];
}