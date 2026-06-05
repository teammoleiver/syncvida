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
  hook: string; body: string; current: CarouselData;
}): Promise<AiFillResult> {
  const { data, error } = await supabase.functions.invoke("ai-fill-carousel-template", {
    body: {
      hook: args.hook,
      body: args.body,
      author: args.current.author,
      handleShort: args.current.handleShort,
      themeKey: args.current.themeKey ?? "figma-template",
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