import type { CarouselSlide } from "@/components/designer/linkedin/LinkedInCanvas";

/**
 * Pre-apply validation for AI-generated carousels.
 *
 * Checks three classes of problems before we ever touch the user's canvas:
 *  1. **Length / fit** — title, body and bullet character budgets that match
 *     the canvas typography so text never overflows or balloons.
 *  2. **Typography risk** — long titles that will force the canvas to shrink
 *     the display font below the "premium" floor.
 *  3. **Narrative continuity** — adjacent slides must share at least one
 *     meaningful keyword (or pick up the previous theme) so the deck reads
 *     as one connected story instead of 8 disconnected posters.
 */

export type ValidationSeverity = "error" | "warn" | "info";

export type SlideIssue = {
  slideIndex: number; // 0-based
  severity: ValidationSeverity;
  code:
    | "title-too-long"
    | "title-empty"
    | "body-too-long"
    | "bullet-too-long"
    | "duplicate-title"
    | "low-continuity"
    | "hashtag-slide"
    | "missing-cta"
    | "missing-cover";
  message: string;
};

export type ValidationResult = {
  ok: boolean;        // no errors
  score: number;       // 0–100, premium-readability score
  issues: SlideIssue[];
};

// Budgets tuned to canvas.css font-sizes (1080×1280 LinkedIn square).
export const FIT_BUDGETS = {
  coverTitle: 70,
  textTitle: 80,
  bulletsTitle: 80,
  compareTitle: 70,
  ctaPrompt: 70,
  quote: 150,
  body: 160,
  bullet: 56,
  compareItem: 48,
};

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","of","to","in","on","for","with",
  "is","are","was","were","be","been","being","this","that","these","those","it",
  "its","at","as","by","from","you","your","we","our","they","their","i","me",
  "so","not","no","yes","do","does","did","can","will","would","could","should",
  "have","has","had","just","more","most","new","one","two","three","into","via",
  "over","under","about","also","than","then","when","what","why","how","up","down",
]);

function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text || "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 4 || STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function budgetForTitle(layout: string): number {
  switch (layout) {
    case "cover": return FIT_BUDGETS.coverTitle;
    case "bullets": return FIT_BUDGETS.bulletsTitle;
    case "comparison": return FIT_BUDGETS.compareTitle;
    case "cta": return FIT_BUDGETS.ctaPrompt;
    default: return FIT_BUDGETS.textTitle;
  }
}

function isHashtagHeavy(s: CarouselSlide): boolean {
  const t = `${s.title ?? ""} ${s.body ?? ""}`;
  const hashes = (t.match(/#/g) || []).length;
  return hashes >= 3;
}

export function validateAiFill(slides: CarouselSlide[]): ValidationResult {
  const issues: SlideIssue[] = [];
  if (!Array.isArray(slides) || slides.length === 0) {
    return { ok: false, score: 0, issues: [{ slideIndex: 0, severity: "error", code: "title-empty", message: "AI returned no slides." }] };
  }

  const titles = new Set<string>();
  let hasCover = false;
  let hasCta = false;

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i] || ({} as CarouselSlide);
    const layout = (s as any).layout || "text";
    const title = String(s.title || "").trim();
    const body = String(s.body || "").trim();

    if (layout === "cover") hasCover = true;
    if (layout === "cta") hasCta = true;

    if (!title && layout !== "quote" && layout !== "cta") {
      issues.push({ slideIndex: i, severity: "error", code: "title-empty", message: `Slide ${i + 1} has no title.` });
    }

    const tBudget = budgetForTitle(layout);
    if (title.length > tBudget) {
      issues.push({
        slideIndex: i, severity: title.length > tBudget + 20 ? "error" : "warn",
        code: "title-too-long",
        message: `Slide ${i + 1} title is ${title.length} chars (recommended ≤ ${tBudget}). Long titles get auto-shrunk on the canvas.`,
      });
    }
    if (body.length > FIT_BUDGETS.body) {
      issues.push({
        slideIndex: i, severity: body.length > FIT_BUDGETS.body + 60 ? "error" : "warn",
        code: "body-too-long",
        message: `Slide ${i + 1} body is ${body.length} chars (≤ ${FIT_BUDGETS.body} reads premium).`,
      });
    }
    if (Array.isArray(s.bullets)) {
      for (const b of s.bullets) {
        if ((b ?? "").length > FIT_BUDGETS.bullet) {
          issues.push({
            slideIndex: i, severity: "warn", code: "bullet-too-long",
            message: `Slide ${i + 1} has a bullet of ${(b ?? "").length} chars (≤ ${FIT_BUDGETS.bullet}).`,
          });
          break;
        }
      }
    }
    if (isHashtagHeavy(s)) {
      issues.push({
        slideIndex: i, severity: "error", code: "hashtag-slide",
        message: `Slide ${i + 1} reads as a hashtag dump — these belong in the post caption, not the carousel.`,
      });
    }

    const titleKey = title.toLowerCase();
    if (titleKey) {
      if (titles.has(titleKey)) {
        issues.push({
          slideIndex: i, severity: "warn", code: "duplicate-title",
          message: `Slide ${i + 1} repeats a previous title — readers will feel the deck stalling.`,
        });
      }
      titles.add(titleKey);
    }

    // Continuity: every slide after the cover should share at least one
    // keyword with the previous slide so the story actually progresses.
    if (i > 0) {
      const prev = slides[i - 1] || ({} as CarouselSlide);
      const a = new Set([...keywords(prev.title), ...keywords(prev.body)]);
      const b = new Set([...keywords(s.title), ...keywords(s.body)]);
      let overlap = 0;
      for (const w of b) if (a.has(w)) overlap++;
      // CTA slides naturally pivot — don't penalize them.
      if (overlap === 0 && layout !== "cta" && b.size >= 2 && a.size >= 2) {
        issues.push({
          slideIndex: i, severity: "warn", code: "low-continuity",
          message: `Slide ${i + 1} doesn't reference anything from slide ${i}. The narrative breaks here.`,
        });
      }
    }
  }

  if (!hasCover) issues.push({ slideIndex: 0, severity: "warn", code: "missing-cover", message: "No cover/hook slide detected." });
  if (!hasCta) issues.push({ slideIndex: slides.length - 1, severity: "warn", code: "missing-cta", message: "No CTA slide — readers won't know what to do next." });

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  const score = Math.max(0, 100 - errorCount * 18 - warnCount * 6);
  return { ok: errorCount === 0, score, issues };
}

/**
 * Compute an inline font-size for canvas titles so longer text always fits
 * the 1080×1280 canvas. The canvas already scales via CSS transform, so we
 * only need to shrink relative to character count.
 */
export function fitTitleFontSize(text: string, opts: {
  base: number;          // base px font-size at "short" content
  min: number;           // minimum px before it looks weak
  breakpointChars: number; // length at which we start shrinking
}): React.CSSProperties {
  const len = (text || "").length;
  if (len <= opts.breakpointChars) return {};
  // Linear shrink: every char over the breakpoint shaves ~1% of size.
  const over = len - opts.breakpointChars;
  const scale = Math.max(opts.min / opts.base, 1 - over * 0.012);
  const size = Math.round(opts.base * scale);
  return { fontSize: `${size}px`, lineHeight: 1.05 };
}