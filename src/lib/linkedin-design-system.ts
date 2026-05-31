import type { CarouselData, CarouselSlide } from "@/components/designer/linkedin/LinkedInCanvas";

/**
 * LinkedIn Visual Design System — in-code source of truth.
 *
 * Encodes the FIXED, non-negotiable rules from
 * `linkedin_visual_design_system.md` so the generator, the editor, and the
 * validator all read from one place. Brand *values* (colors, fonts, face
 * photo, name) live per-user in the Brand Kit / profile and are resolved at
 * runtime; only the rules and the org-level defaults live here.
 *
 * Do not loosen these without documented performance evidence — they map 1:1
 * to the spec's [REQUIRED] / [ALGORITHM] / [AB-TESTED] rules.
 */

export const LINKEDIN_DESIGN_SYSTEM = {
  carousel: {
    width: 1080,
    height: 1280, // spec Section 4.1 (Section 4 calls it 4:5; we follow the explicit pixel value)
    minSlides: 8,
    maxSlides: 16,
    targetSlides: 12,
    maxWordsPerSlide: 50, // [ALGORITHM] one idea per slide; >50 = reach penalty
    minFontPt: 24,
    coverFaceRequired: true, // [REQUIRED] a headshot stops scrolls, a logo does not
    closingCtas: ["follow", "bell"] as const, // [AB-TESTED] both, always
  },
  postText: {
    maxCharsAboveCarousel: 500, // [ALGORITHM]
    hookMaxChars: 140, // one feed line before truncation
    teasedSlideMin: 7, // curiosity tease must reference a slide 7–10 [ALGORITHM]
    teasedSlideMax: 10,
  },
  scheduling: {
    days: [2, 4] as const, // Tuesday, Thursday (JS getDay: Sun=0)
    times: ["09:00", "13:30"] as const,
    maxCarouselsPerWeek: 2,
  },
  filename: {
    // [REQUIRED] professional, public-facing. Reject version markers / timestamps.
    forbidden: [/\bv\d+\b/i, /\bfinal\b/i, /\bdraft\b/i, /\d{8,}/],
  },
} as const;

/**
 * Org brand_profile defaults. Per-user values (colors, fonts, face photo,
 * display name) come from the Brand Kit + profile at runtime; this holds the
 * values the spec asks for that aren't in those tables yet.
 */
export const BRAND_PROFILE_DEFAULTS = {
  posting_timezone: "Europe/Madrid",
  product_or_service: "", // optional closing-slide plug
  banner_case_study: "", // for the LinkedIn banner (Section 8.2)
} as const;

/* ----------------------------------------------------------------- words -- */

export function countWords(text: string | undefined | null): number {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/** Visible content words on a slide (chrome like eyebrow/closer excluded). */
export function slideWordCount(slide: CarouselSlide): number {
  const parts = [
    slide.title, slide.body, slide.statValue, slide.statLabel, slide.quote,
    ...(slide.bullets ?? []),
    slide.leftLabel, ...(slide.leftItems ?? []),
    slide.rightLabel, ...(slide.rightItems ?? []),
    slide.ctaPrompt, slide.ctaAction,
  ].filter(Boolean);
  return countWords(parts.join(" "));
}

/* -------------------------------------------------------------- filename -- */

/**
 * Turn a carousel title into a clean, public-facing PDF filename
 * (`Title-Of-Carousel.pdf`) — Title-Case-Hyphenated, no version markers, no
 * timestamp. This is what LinkedIn shows viewers, so it must read well.
 */
export function sanitizeCarouselFilename(title: string | undefined): string {
  const base = (title || "LinkedIn Carousel")
    .replace(/[`'"]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => !LINKEDIN_DESIGN_SYSTEM.filename.forbidden.some((re) => re.test(w)))
    .slice(0, 9) // keep it descriptive but not a sentence
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return `${base || "LinkedIn-Carousel"}.pdf`;
}

export function isFilenameValid(name: string): boolean {
  return !LINKEDIN_DESIGN_SYSTEM.filename.forbidden.some((re) => re.test(name));
}

/* ------------------------------------------------------------ validation -- */

export type ValidationIssue = {
  rule: string;
  message: string;
  severity: "error" | "warning";
  slide?: number; // 0-based index when slide-specific
};

export type ValidationResult = {
  passed: boolean; // false when any `error` exists → blocks PDF export
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

/**
 * Validate a carousel against the Section 4.6 checklist + Section 11
 * anti-patterns. `errors` are [REQUIRED] failures that hard-gate export;
 * `warnings` are advisory (e.g. off the 12-slide target).
 */
export function validateCarousel(
  data: CarouselData,
  opts: { filename?: string } = {},
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const C = LINKEDIN_DESIGN_SYSTEM.carousel;
  const slides = data.slides ?? [];

  // --- slide count ---
  if (slides.length < C.minSlides) {
    errors.push({ rule: "slide-count", severity: "error",
      message: `Only ${slides.length} slides — add ${C.minSlides - slides.length} more (minimum ${C.minSlides}).` });
  } else if (slides.length > C.maxSlides) {
    errors.push({ rule: "slide-count", severity: "error",
      message: `${slides.length} slides — remove ${slides.length - C.maxSlides} (maximum ${C.maxSlides}).` });
  } else if (slides.length !== C.targetSlides) {
    warnings.push({ rule: "slide-count", severity: "warning",
      message: `${slides.length} slides — the documented sweet spot is ${C.targetSlides}.` });
  }

  // --- cover: face photo + title is the hook ---
  const cover = slides[0];
  if (!cover || cover.layout !== "cover") {
    errors.push({ rule: "cover", severity: "error", slide: 0,
      message: "First slide must be a cover (hook) slide." });
  }
  if (C.coverFaceRequired && !data.avatarUrl) {
    errors.push({ rule: "cover-face", severity: "error", slide: 0,
      message: "Cover face photo missing — add your headshot in Profile / Brand kit (a logo does not stop the scroll)." });
  }
  if (cover && !cover.title?.trim()) {
    errors.push({ rule: "cover-title", severity: "error", slide: 0,
      message: "Cover title (the hook) is empty." });
  }

  // --- body slides: ≤ 50 words ---
  slides.forEach((s, i) => {
    if (i === 0 || s.layout === "cta") return; // cover + closing handled separately
    const wc = slideWordCount(s);
    if (wc > C.maxWordsPerSlide) {
      errors.push({ rule: "word-count", severity: "error", slide: i,
        message: `Slide ${i + 1} has ${wc} words — trim to ≤ ${C.maxWordsPerSlide} (one idea per slide).` });
    }
  });

  // --- closing slide: both CTAs ---
  const last = slides[slides.length - 1];
  if (!last || last.layout !== "cta") {
    errors.push({ rule: "closing", severity: "error",
      message: "Last slide must be a closing CTA slide." });
  } else {
    const ctaText = `${last.ctaPrompt ?? ""} ${last.ctaAction ?? ""} ${last.body ?? ""}`.toLowerCase();
    if (!/follow/.test(ctaText)) {
      errors.push({ rule: "cta-follow", severity: "error", slide: slides.length - 1,
        message: "Closing slide is missing the explicit ‘Follow’ CTA." });
    }
    if (!/bell|notification|notif/.test(ctaText)) {
      errors.push({ rule: "cta-bell", severity: "error", slide: slides.length - 1,
        message: "Closing slide is missing the ‘Turn on the bell’ CTA." });
    }
  }

  // --- filename ---
  if (opts.filename && !isFilenameValid(opts.filename)) {
    errors.push({ rule: "filename", severity: "error",
      message: `File name “${opts.filename}” contains a version marker or timestamp — use a clean descriptive name.` });
  }

  return { passed: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------ post text -- */

export type PostTextIssue = { message: string; severity: "error" | "warning" };

/**
 * Validate the post copy that sits ABOVE a carousel (Section 4.6 / Section 5).
 * Advisory — surfaced as hints in the planner, not a hard gate.
 */
export function validatePostText(hook: string, body: string): PostTextIssue[] {
  const issues: PostTextIssue[] = [];
  const P = LINKEDIN_DESIGN_SYSTEM.postText;
  const full = `${hook ?? ""}\n${body ?? ""}`.trim();
  const firstLine = (hook?.trim() || body?.trim()?.split(/\n/)[0] || "");

  if (full.length > P.maxCharsAboveCarousel) {
    issues.push({ severity: "warning",
      message: `Post text is ${full.length} chars — keep it ≤ ${P.maxCharsAboveCarousel} above a carousel so it complements, not competes.` });
  }
  if (firstLine.length > P.hookMaxChars) {
    issues.push({ severity: "warning",
      message: `Hook is ${firstLine.length} chars — keep the first line ≤ ${P.hookMaxChars} so it isn't truncated in the feed.` });
  }
  if (/^(i'm excited to share|in today's post|a lot of people ask me|today i want to)/i.test(firstLine)) {
    issues.push({ severity: "warning", message: "Generic opener — open with something specific, provocative, or counterintuitive." });
  }
  if (!hasCuriosityTease(full)) {
    issues.push({ severity: "warning",
      message: `No curiosity tease — reference a specific slide (${P.teasedSlideMin}–${P.teasedSlideMax}) to force the swipe, e.g. “Slide 8 is the one most people won't admit applies to them.”` });
  }
  return issues;
}

/** True when the copy references a slide number in the teased range. */
export function hasCuriosityTease(text: string): boolean {
  const P = LINKEDIN_DESIGN_SYSTEM.postText;
  const m = text.match(/\bslide\s*#?\s*(\d{1,2})\b/i);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= P.teasedSlideMin && n <= P.teasedSlideMax;
}

/** A ready-to-insert curiosity tease line pointing at a slide in range. */
export function suggestCuriosityTease(slideCount: number): string {
  const P = LINKEDIN_DESIGN_SYSTEM.postText;
  const target = Math.min(P.teasedSlideMax, Math.max(P.teasedSlideMin, Math.round(slideCount * 0.7)));
  return `Slide ${target} is the one most people don't want to admit applies to them.`;
}
