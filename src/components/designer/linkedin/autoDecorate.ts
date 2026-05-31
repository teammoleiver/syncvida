import type { CarouselData, CarouselSlide, Overlay } from "./LinkedInCanvas";
import { detectMentionedLogos } from "./detectLogos";
import { BUILTIN_ASSETS, type BuiltinAsset } from "@/lib/builtin-assets";
import { removeWhiteBackground } from "@/lib/designer-utils";

/**
 * Auto art-director for LinkedIn carousels.
 *
 * Given a generated carousel, this reads each slide's copy and decorates the
 * correct slide with the brand logo(s) it mentions (e.g. a slide about "Clay"
 * gets the Clay logo) plus at most one contextual icon/chart that matches the
 * slide's intent (stat → growth arrow, comparison → quadrant matrix, quote →
 * quote mark, bullets → verified check, etc.).
 *
 * Placement is a clean, right-aligned strip across the top of the slide — a
 * zone that is empty in every layout (the eyebrow sits top-left, the title is
 * centered/left, the footer is pinned to the bottom), so decorations never
 * collide with text.
 */

type Canvas = { w: number; h: number };

export type DecorateOptions = {
  /** Strip white backgrounds on real logos so they sit cleanly on color. Default true. */
  removeBg?: boolean;
  /** Add a single contextual symbol/chart per slide when relevant. Default true. */
  addSymbols?: boolean;
  /** Hard cap of decorations per slide. Default 3. */
  maxPerSlide?: number;
};

/**
 * Brand names that are also extremely common English words. Even with
 * case-sensitive matching these false-fire at sentence starts ("Make sure…",
 * "Ready to…"), so they're excluded from automatic placement. The user can
 * still add them by hand from the asset picker. Edit freely to tune precision.
 */
const AMBIGUOUS_NAMES = new Set(
  ["make", "ready", "close", "front", "default", "live", "loop", "loops", "segment", "now", "later", "next"].map((s) => s),
);

/* ---------------------------------------------------------------- text ---- */

function slideText(s: CarouselSlide): string {
  return [
    s.eyebrow, s.title, s.body, s.statLabel, s.quote,
    ...(s.bullets ?? []),
    s.leftLabel, ...(s.leftItems ?? []),
    s.rightLabel, ...(s.rightItems ?? []),
    s.ctaPrompt,
  ].filter(Boolean).join("  ");
}

function fullText(c: CarouselData): string {
  // Skip the closing CTA slide — its generated "Follow…" copy is not a tool mention.
  return (c.slides ?? []).filter((s) => (s.layout || "text") !== "cta").map(slideText).join("  ");
}

/* ----------------------------------------------- contextual builtin pick -- */

const builtin = (id: string): BuiltinAsset | null => BUILTIN_ASSETS.find((a) => a.id === id) ?? null;

/**
 * Choose ONE contextual symbol/chart for a slide based on its layout and copy.
 * Returns null when nothing fits — a clean slide beats a forced icon.
 */
function pickContextualBuiltin(slide: CarouselSlide): BuiltinAsset | null {
  const t = slideText(slide).toLowerCase();
  const layout = slide.layout || "text";

  if (layout === "comparison") return builtin("builtin-chart-matrix");
  if (layout === "quote") return builtin("builtin-symbol-quotes");

  if (/\b(data|metric|metrics|dashboard|report|reports|analytics|funnel|pipeline|conversion)\b/.test(t))
    return builtin("builtin-chart-dashboard");

  if (layout === "stat" || /\d\s?%|\b\d+x\b|\b(grew|growth|grow|increase|increased|boost|boosted|faster|doubled|tripled|scale|scaled|roi|revenue|more)\b/.test(t))
    return builtin("builtin-symbol-growth-arrow");

  if (layout === "bullets" || /\b(checklist|step|steps|how\s*to|playbook|process|framework|guide)\b/.test(t))
    return builtin("builtin-symbol-verified");

  if (/\b(idea|insight|insights|lesson|lessons|learn|learned|tip|tips|secret|secrets|realiz)\b/.test(t))
    return builtin("builtin-symbol-lightbulb");

  if (/\b(viral|fast|instant|instantly|speed|launch|ship|shipped|quick|rapid)\b/.test(t))
    return builtin("builtin-symbol-lightning");

  if (/\b(fire|hot|trend|trending|explode|exploded|skyrocket|surge)\b/.test(t))
    return builtin("builtin-symbol-viral-fire");

  return null;
}

/* ------------------------------------------------------ image measuring -- */

const dimCache = new Map<string, { w: number; h: number }>();

function measure(url: string): Promise<{ w: number; h: number }> {
  const cached = dimCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (d: { w: number; h: number }) => {
      if (done) return;
      done = true;
      dimCache.set(url, d);
      resolve(d);
    };
    img.onload = () => finish({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => finish({ w: 1, h: 1 });
    setTimeout(() => finish({ w: 1, h: 1 }), 4000);
    img.src = url;
  });
}

/** Fit a natural size inside a square box, preserving aspect ratio (contain). */
function fitBox(natural: { w: number; h: number }, box: number): { w: number; h: number } {
  const ratio = natural.w / natural.h;
  if (!isFinite(ratio) || ratio <= 0) return { w: box, h: box };
  return ratio >= 1 ? { w: box, h: Math.round(box / ratio) } : { w: Math.round(box * ratio), h: box };
}

/* -------------------------------------------------- background removal ---- */

const bgCache = new Map<string, string>();

async function maybeStripBg(url: string, enabled: boolean): Promise<string> {
  if (!enabled) return url;
  const cached = bgCache.get(url);
  if (cached) return cached;
  try {
    const out = await removeWhiteBackground(url);
    bgCache.set(url, out);
    return out;
  } catch {
    bgCache.set(url, url); // remember the failure so we don't retry every slide
    return url;
  }
}

/* ----------------------------------------------------------- main entry -- */

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ov-${Math.abs(Math.round(performance.now() * 1000))}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/**
 * Build the per-slide overlay map for a carousel. Pure data in → data out;
 * the caller merges the result into `carousel.overlays`.
 */
export async function autoPlaceSlideAssets(
  carousel: CarouselData,
  canvas: Canvas,
  options: DecorateOptions = {},
): Promise<Record<number, Overlay[]>> {
  const removeBg = options.removeBg ?? true;
  const addSymbols = options.addSymbols ?? true;
  const maxPerSlide = options.maxPerSlide ?? 4;

  const slides = carousel.slides ?? [];
  if (slides.length === 0) return {};

  // Resolve every brand mentioned anywhere in the deck once (registry +
  // uploads). We only need the name → public_url mapping out of this.
  const detected = (await detectMentionedLogos(fullText(carousel)))
    .filter((d) => d.hasAsset && d.asset?.public_url)
    .filter((d) => !AMBIGUOUS_NAMES.has(d.name.trim().toLowerCase()));

  // Per-slide assignment uses CASE-SENSITIVE matching against the raw copy so
  // "Clay" (the tool) hits but "clay" (the material) and "Ready"/"make" don't.
  const matchers = detected.map((d) => ({
    name: d.name,
    url: d.asset!.public_url,
    re: new RegExp(`\\b${d.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`),
  }));

  const out: Record<number, Overlay[]> = {};

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const layout = slide.layout || "text";
    if (layout === "cta") continue; // closing slide stays clean (author photo is the hero)

    const text = slideText(slide);
    const seen = new Set<string>();
    let logos;

    if (layout === "cover") {
      // The cover carries the FULL tool stack the post covers — every detected
      // tool appears here at least once (a "tools in this post" rail).
      logos = matchers
        .filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))
        .slice(0, 5);
    } else {
      // Body slides: the tools named on THIS slide, ordered by first appearance.
      logos = matchers
        .map((m) => ({ m, idx: text.search(m.re) }))
        .filter((x) => x.idx >= 0)
        .sort((a, b) => a.idx - b.idx)
        .map((x) => x.m)
        .filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))
        .slice(0, maxPerSlide);
    }

    // One contextual icon — never on the cover (keep the hook pristine).
    const symbol = addSymbols && layout !== "cover" && logos.length < maxPerSlide
      ? pickContextualBuiltin(slide)
      : null;

    if (logos.length === 0 && !symbol) continue;

    // Cover packs more logos, so size them down a touch to fit a clean rail.
    const logoBox = Math.round(canvas.w * (layout === "cover" ? 0.1 : 0.12));
    const symBox = logoBox;

    // Resolve sources (bg removal for logos) + natural sizes for aspect ratio.
    const sized = await Promise.all([
      ...logos.map(async (l) => {
        const src = await maybeStripBg(l.url, removeBg);
        const fit = fitBox(await measure(src), logoBox);
        return { src, original: l.url, name: l.name, isLogo: true, ...fit };
      }),
      ...(symbol
        ? [Promise.resolve({
            src: symbol.public_url,
            original: symbol.public_url,
            name: symbol.name,
            isLogo: false,
            ...fitBox({ w: symbol.width, h: symbol.height }, symBox),
          })]
        : []),
    ]);

    // Top-LEFT "masthead" strip, aligned to the canvas's 64px padding. The
    // slide body is vertically centered (.carousel-body → justify-content:
    // center) and the type pill is pinned top-right, so the top-left band is
    // always empty. Placing the logos here mirrors the type pill and reads as
    // an intentional masthead — never clipped, never over the pill or text.
    const pad = Math.round(canvas.w * 0.0593); // ≈ 64px @ 1080, matches .canvas padding
    const gap = Math.round(canvas.w * 0.018);
    const bandH = Math.max(...sized.map((it) => it.h));
    let cursorX = pad;

    out[i] = sized.map((it) => {
      const overlay: Overlay = {
        id: uid(),
        type: "image",
        x: Math.round(cursorX),
        y: Math.round(pad + (bandH - it.h) / 2), // center each item in the band
        w: it.w,
        h: it.h,
        src: it.src,
        originalSrc: it.original,
        removeBg: it.isLogo ? removeBg : false,
        objectFit: "contain",
        radius: 0,
        name: it.name,
        auto: true,
      };
      cursorX += it.w + gap;
      return overlay;
    });
  }

  return out;
}

/**
 * Merge a freshly computed auto-overlay map into the carousel's existing
 * overlays: previous auto-placed items are dropped, user-added overlays are
 * kept (and rendered on top). Used by the manual "Auto-place" re-run so it's
 * idempotent and never clobbers hand-placed elements.
 */
export function mergeAutoOverlays(
  current: Record<number, Overlay[]> | undefined,
  auto: Record<number, Overlay[]>,
  slideCount: number,
): Record<number, Overlay[]> {
  const result: Record<number, Overlay[]> = {};
  for (let i = 0; i < slideCount; i++) {
    const userOnes = (current?.[i] ?? []).filter((o) => !(o as any).auto);
    const autoOnes = auto[i] ?? [];
    if (autoOnes.length || userOnes.length) result[i] = [...autoOnes, ...userOnes];
  }
  return result;
}

/** Count how many slides received at least one auto decoration. */
export function countDecoratedSlides(map: Record<number, Overlay[]>): number {
  return Object.values(map).filter((arr) => arr.some((o) => (o as any).auto)).length;
}
