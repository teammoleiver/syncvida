import { toPng } from "html-to-image";
import type { CheatSheetData, CarouselData, SquareData, CarouselSlide, SheetSection, AccentKey } from "./LinkedInCanvas";
import { supabase } from "@/integrations/supabase/client";
import { LINKEDIN_DESIGN_SYSTEM, countWords, slideWordCount, sanitizeCarouselFilename } from "@/lib/linkedin-design-system";

/** Closing-slide bell CTA — required alongside the follow CTA (AB-tested).
 *  No emoji — emojis read as AI-generated; keep the wording clean. */
const BELL_CTA = "Turn on the bell so you never miss a post";

/**
 * Strip slide-reference markers a writer may leave in the copy — "[S2]",
 * "[Slide 3]", "(slide 4)", "P2:" — plus hashtags. Hashtags belong in the post
 * text, never on a slide, so a "#SalesReports #AI #..." block must not become a
 * slide of its own.
 */
function stripSlideMarkers(s: string): string {
  return (s || "")
    .replace(/\[\s*(?:s|slide|p|page)\s*\d+\s*\]/gi, " ")
    .replace(/\(\s*(?:slide|page)\s*\d+\s*\)/gi, " ")
    .replace(/^\s*(?:slide|page)\s*\d+\s*[:.\-—]\s*/gim, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ") // drop hashtags — they live in the post, not slides
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Count words that are actual content (letters/digits), ignoring punctuation. */
function contentWordCount(s: string): number {
  return (s || "").replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/).filter(Boolean).length;
}

/** Clamp text to a maximum word count, adding an ellipsis when trimmed. */
function clampWords(text: string | undefined, max: number): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return (text || "").trim();
  return words.slice(0, Math.max(0, max)).join(" ").replace(/[\s,;:.\-—]+$/, "") + "…";
}

/**
 * Enforce the ≤50-words-per-slide rule [ALGORITHM] by trimming a slide's
 * content fields in priority order (body → bullets → comparison items →
 * title) until it fits. Mutates the slide in place.
 */
function trimSlideToWordLimit(s: CarouselSlide, max = LINKEDIN_DESIGN_SYSTEM.carousel.maxWordsPerSlide): void {
  if (s.body && slideWordCount(s) > max) {
    const others = slideWordCount({ ...s, body: "" });
    s.body = clampWords(s.body, Math.max(0, max - others));
  }
  if (s.bullets?.length) {
    s.bullets = s.bullets.slice(0, 4).map((b) => clampWords(b, 9));
    while (s.bullets.length > 2 && slideWordCount(s) > max) s.bullets.pop();
  }
  if (s.leftItems?.length || s.rightItems?.length) {
    s.leftItems = (s.leftItems ?? []).slice(0, 3).map((x) => clampWords(x, 7));
    s.rightItems = (s.rightItems ?? []).slice(0, 3).map((x) => clampWords(x, 7));
  }
  if (slideWordCount(s) > max && s.title) {
    const others = slideWordCount(s) - countWords(s.title);
    s.title = clampWords(s.title, Math.max(6, max - others));
  }
}

/** Split one dense slide into two (bullets in half, or sentences in half). */
function splitSlide(s: CarouselSlide): [CarouselSlide, CarouselSlide] | null {
  if ((s.layout || "text") === "bullets" && (s.bullets?.length ?? 0) >= 4) {
    const mid = Math.ceil(s.bullets!.length / 2);
    return [
      { ...s, bullets: s.bullets!.slice(0, mid) },
      { ...s, title: `${s.title} — continued`.slice(0, 70), bullets: s.bullets!.slice(mid) },
    ];
  }
  const sents = `${s.title ?? ""}. ${s.body ?? ""}`
    .split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (sents.length < 2) return null;
  const mid = Math.ceil(sents.length / 2);
  const a = sents.slice(0, mid), b = sents.slice(mid);
  return [
    { ...s, layout: "text", bullets: undefined, title: clampWords(a[0], 12), body: a.slice(1).join(" ") },
    { ...s, layout: "text", bullets: undefined, title: clampWords(b[0], 12), body: b.slice(1).join(" ") },
  ];
}

/**
 * Deterministically fix the design-system [REQUIRED] failures on a carousel:
 * ensure a cover first, a closing CTA last with both follow + bell CTAs, trim
 * any >50-word slide, and top up to the 8-slide minimum by splitting dense
 * slides. Returns the repaired deck plus a human list of what changed.
 */
export function autoFixCarousel(data: CarouselData): { data: CarouselData; fixes: string[] } {
  const fixes: string[] = [];
  const slides: CarouselSlide[] = (data.slides ?? []).map((s) => ({ ...s }));
  const author = data.author || "me";

  // 1. Cover must be first.
  if (slides[0] && slides[0].layout !== "cover") {
    slides[0] = { ...slides[0], layout: "cover" };
    fixes.push("Set slide 1 as the cover");
  }

  // 2. Closing CTA last, with both follow + bell.
  const last = slides[slides.length - 1];
  if (!last || last.layout !== "cta") {
    slides.push({
      layout: "cta", eyebrow: "Let's talk", title: "What would you add?",
      ctaPrompt: "What would you add?", ctaAction: `Follow ${author} for more\n${BELL_CTA}`,
      quoteAuthor: author, closer: "Follow + connect", accent: "indigo",
    });
    fixes.push("Added a closing CTA slide");
  } else {
    const t = `${last.ctaAction ?? ""}`.toLowerCase();
    if (!/follow/.test(t) || !/bell|notif/.test(t)) {
      const follow = /follow/.test(t) ? last.ctaAction!.split("\n")[0] : `Follow ${author} for more`;
      slides[slides.length - 1] = { ...last, ctaAction: `${follow}\n${BELL_CTA}` };
      fixes.push("Added the ‘Turn on the bell’ CTA");
    }
  }

  // 3. Trim any over-length body slide.
  let trimmed = 0;
  slides.forEach((s, i) => {
    if (i === 0 || s.layout === "cta") return;
    if (slideWordCount(s) > LINKEDIN_DESIGN_SYSTEM.carousel.maxWordsPerSlide) { trimSlideToWordLimit(s); trimmed++; }
  });
  if (trimmed) fixes.push(`Trimmed ${trimmed} slide${trimmed === 1 ? "" : "s"} to ≤ 50 words`);

  // 4. Top up to the minimum slide count by splitting the wordiest body slide.
  const min = LINKEDIN_DESIGN_SYSTEM.carousel.minSlides;
  let added = 0, guard = 0;
  while (slides.length < min && guard++ < 24) {
    const candidates = slides
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i !== 0 && s.layout !== "cta")
      .sort((a, b) => slideWordCount(b.s) - slideWordCount(a.s));
    const target = candidates[0];
    if (!target) break;
    const split = splitSlide(target.s);
    if (!split) break;
    slides.splice(target.i, 1, split[0], split[1]);
    added++;
  }
  if (added) fixes.push(`Split ${added} dense slide${added === 1 ? "" : "s"} to reach the ${min}-slide minimum`);

  return { data: { ...data, slides: slides.slice(0, LINKEDIN_DESIGN_SYSTEM.carousel.maxSlides) }, fixes };
}

/**
 * Render the live #canvas-export node as PNG and trigger a download.
 * Uses devicePixelRatio of 2 for crisp output regardless of viewport zoom.
 */
export async function exportCanvasAsPng(filename: string, nodeId = "canvas-export") {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error("Canvas not found");
  const dataUrl = await renderNodeAsDataUrl(node);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}.png`;
  a.click();
}

async function renderNodeAsDataUrl(node: HTMLElement): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    fetchRequestInit: { mode: "cors", cache: "no-cache" },
    // Editor-only chrome (the "CAROUSEL" / "Cheat Sheet" type pill, selection
    // outlines, resize handles) must not appear in the exported PNG/PDF.
    filter: (n: HTMLElement) => {
      if (!(n as any).classList) return true;
      const cl = (n as any).classList as DOMTokenList;
      if (cl.contains("cnv-type-pill")) return false;
      if (cl.contains("export-hide")) return false;
      return true;
    },
  });
}

/**
 * Render the canvas, upload to design-assets storage, insert a design_assets
 * row, and return the public URL + asset id. Used to save a template directly
 * into the user's Asset Library (visible in /designer/assets).
 */
export async function saveCanvasAsAsset(
  name: string,
  nodeId = "canvas-export",
): Promise<{ id: string; public_url: string }> {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error("Canvas not found");
  const dataUrl = await renderNodeAsDataUrl(node);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const blob = await (await fetch(dataUrl)).blob();
  const storage_path = `${user.id}/linkedin-template-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from("design-assets")
    .upload(storage_path, blob, { contentType: "image/png", upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("design-assets").getPublicUrl(storage_path);
  const public_url = pub?.publicUrl ?? "";
  const { data, error } = await supabase.from("design_assets" as any).insert({
    user_id: user.id,
    kind: "ai_generated",
    storage_path,
    public_url,
    mime: "image/png",
    name,
  } as any).select().single();
  if (error) throw error;
  return { id: (data as any).id as string, public_url };
}

/**
 * Update a content_plan row's image_url to point at an asset URL. Called
 * after `saveCanvasAsAsset` when the page is opened with ?planId=xxx.
 */
export async function linkAssetToPlan(planId: string, image_url: string): Promise<void> {
  const { error } = await supabase
    .from("social_content_plan" as any)
    .update({ image_url } as any)
    .eq("id", planId);
  if (error) throw error;
}

/**
 * Load a plan entry by id — used to seed the template form when opened
 * from the post editor with ?planId=xxx.
 */
export async function getPlanEntry(planId: string): Promise<any | null> {
  const { data } = await supabase
    .from("social_content_plan" as any)
    .select("id, hook, body, platforms")
    .eq("id", planId)
    .maybeSingle();
  return (data as any) ?? null;
}

/**
 * Render every slide of a carousel into a multi-page PDF, upload the PDF to
 * the design-assets bucket, and return a public URL. Used for LinkedIn
 * document posts (the native PDF carousel format that gets the swipe UI).
 *
 * `renderSlideToPng(i)` should advance the live preview to slide `i`, wait
 * for layout, and call `toPng` on the canvas. We accept a callback rather
 * than touching state directly so the editor controls the slide index.
 */
export async function saveCarouselAsPdf(
  slideCount: number,
  renderSlideToDataUrl: (i: number) => Promise<string>,
  baseName: string,
): Promise<{ public_url: string; storage_path: string; filename: string; pageCount: number }> {
  if (slideCount < 1) throw new Error("No slides to export");
  // Lazy-load jspdf so it doesn't bloat the initial chunk.
  const { jsPDF } = await import("jspdf");
  // First slide sets the page size; carousels use a uniform aspect ratio
  // (1080×1350 = 4:5 LinkedIn carousel) so all pages match.
  const firstUrl = await renderSlideToDataUrl(0);
  const firstDims = await imageDimensions(firstUrl);
  const pdf = new jsPDF({
    orientation: firstDims.h >= firstDims.w ? "portrait" : "landscape",
    unit: "px",
    format: [firstDims.w, firstDims.h],
    compress: true,
  });
  pdf.addImage(firstUrl, "PNG", 0, 0, firstDims.w, firstDims.h);
  for (let i = 1; i < slideCount; i++) {
    const url = await renderSlideToDataUrl(i);
    const dims = await imageDimensions(url);
    pdf.addPage([dims.w, dims.h], dims.h >= dims.w ? "portrait" : "landscape");
    pdf.addImage(url, "PNG", 0, 0, dims.w, dims.h);
  }
  const blob = pdf.output("blob");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Public-facing name is clean & descriptive (no timestamp / v# / "final" /
  // "draft") — it's visible to every LinkedIn viewer. The storage path stays
  // unique internally so uploads never collide.
  const filename = sanitizeCarouselFilename(baseName);
  const storage_path = `${user.id}/${filename.replace(/\.pdf$/i, "")}-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("design-assets")
    .upload(storage_path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("design-assets").getPublicUrl(storage_path);
  return { public_url: pub?.publicUrl ?? "", storage_path, filename, pageCount: slideCount };
}

function imageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Update a plan with the carousel PDF document. Sets `document_url` so
 * post-to-linkedin can upload it as a LinkedIn document (PDF carousel),
 * and also updates `image_url` to the PDF's first-page preview so the
 * planner thumbnail keeps working.
 */
export async function linkPdfToPlan(
  planId: string,
  document_url: string,
  document_filename: string,
  thumbnail_url?: string,
): Promise<void> {
  const patch: Record<string, any> = { document_url, document_filename };
  if (thumbnail_url) patch.image_url = thumbnail_url;
  const { error } = await supabase
    .from("social_content_plan" as any)
    .update(patch)
    .eq("id", planId);
  if (error) throw error;
}

/** Render a specific DOM node as a PNG data URL. */
export async function renderNodeToDataUrl(nodeId: string): Promise<string> {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error("Canvas not found");
  const { toPng } = await import("html-to-image");
  return toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    fetchRequestInit: { mode: "cors", cache: "no-cache" },
    filter: (n: HTMLElement) => {
      if (!(n as any).classList) return true;
      const cl = (n as any).classList as DOMTokenList;
      if (cl.contains("cnv-type-pill")) return false;
      if (cl.contains("export-hide")) return false;
      return true;
    },
  });
}

export const SEED_CHEAT_SHEET: CheatSheetData = {
  author: "Saleh Seddik",
  handleShort: "Salehseddik",
  typeLabel: "Cheat Sheet",
  eyebrow: "GTM × AI / Field notes",
  title: "Stop CSV-exporting Clay. Plug it into your LLM.",
  subtitle: "MCP turns your enrichment table into a live data source your model can query. No exports, no copy-paste, no stale snapshots.",
  closer: "Your LLM doesn't need your CSV. It needs your warehouse.",
  attribution: `saleh seddik // ${new Date().getFullYear()}`,
  sections: [
    {
      tag: "The Shift",
      accent: "coral",
      title: "Manual exports are dead.",
      subtitle: "MCP gives your LLM direct, real-time read access to Clay tables.",
      kind: "stats",
      items: [
        "70%  :: workflow gain :: less context-switching for outbound research",
        "<10m :: lead sprint :: 500-lead enrichment + research, end to end",
        "0    :: csv exports :: every query reads live from Clay",
      ],
    },
    {
      tag: "Definition",
      accent: "amber",
      title: "What MCP actually is.",
      subtitle: "Model Context Protocol — a standardized bridge between LLMs and tools.",
      kind: "bullets",
      items: [
        "Open protocol — any model, any tool. Not vendor-locked.",
        "Translation layer: model sends a query, server speaks Clay's API, results come back as structured data.",
        "Tools, resources, and prompts are exposed as named primitives the model can choose from.",
        "Runs locally or hosted. Auth is your problem, not the protocol's.",
      ],
    },
    {
      tag: "Setup",
      accent: "teal",
      title: "Connect Clay in 5 steps.",
      kind: "checklist",
      items: [
        "Install the Clay MCP server (npm or hosted).",
        "Generate a Clay API key with table-read scope.",
        "Register the server in Claude Desktop or your client config.",
        "Test with a sample table query — verify auth + schema.",
        "Iterate live in chat. No deploys, no pipelines.",
      ],
    },
    {
      tag: "The Stack",
      accent: "sky",
      title: "Tools in the loop.",
      subtitle: "The minimum viable MCP-ready outbound stack.",
      kind: "tools",
      items: ["Clay", "MCP", "Claude", "n8n", "Smartlead", "HubSpot"],
    },
  ],
};

export const SEED_CAROUSEL: CarouselData = {
  author: "Saleh Seddik",
  handleShort: "Salehseddik",
  typeLabel: "Carousel",
  attribution: `saleh seddik // ${new Date().getFullYear()}`,
  slides: [
    {
      layout: "cover",
      eyebrow: "GTM ENGINEERING / HOT TAKE",
      title: "Most GTM teams are querying dead data. Here's the fix.",
      body: "MCP connects your LLM directly to Clay. No exports. No stale snapshots.",
      closer: "Swipe →",
      accent: "coral",
    },
    {
      layout: "stat",
      eyebrow: "THE NUMBER",
      title: "80% faster per-lead research",
      statValue: "80%",
      statLabel: "Faster per-lead research. No manual lookup loop.",
      body: "When Claude reads Clay live, the tab-switching and copy-paste disappear. The analyst bottleneck moves to strategy, not data retrieval.",
      closer: "Swipe →",
      accent: "teal",
    },
    {
      layout: "comparison",
      eyebrow: "BEFORE THE FIX / AFTER THE FIX",
      title: "Old CSV pipeline versus live MCP query.",
      leftLabel: "Without MCP",
      leftItems: [
        "Export Clay table, wait for download",
        "Paste raw CSV into LLM chat window",
        "Re-export every time data refreshes",
        "Context window fills up fast",
      ],
      rightLabel: "With MCP",
      rightItems: [
        "LLM queries Clay table in real time",
        "One command pulls structured, live data",
        "Data is always current, zero re-exports",
        "Full context left for reasoning and copy",
      ],
      closer: "Swipe →",
      accent: "amber",
    },
    {
      layout: "bullets",
      eyebrow: "THE SETUP",
      title: "Wire Clay to your LLM in three moves.",
      bullets: [
        "Install the Clay MCP server via npm or hosted",
        "Generate a Clay API key with table-read scope",
        "Register the server in your Claude Desktop config",
      ],
      closer: "Swipe →",
      accent: "sky",
    },
    {
      layout: "quote",
      eyebrow: "THE THESIS",
      quote: "Your LLM doesn't need your CSV. It needs your warehouse.",
      quoteAuthor: "Me, shipping GTM systems at 11 PM",
      closer: "Follow for more",
      accent: "indigo",
      title: "Your LLM doesn't need your CSV. It needs your warehouse.",
    },
    {
      layout: "cta",
      eyebrow: "LET'S TALK GTM SYSTEMS",
      title: "Is your team still CSV-exporting enrichment data?",
      ctaPrompt: "Is your team still CSV-exporting enrichment data?",
      ctaAction: `Follow Saleh Seddik for more GTM systems\nTurn on the bell so you never miss a post`,
      quoteAuthor: "Saleh Seddik",
      closer: "Drop a comment · Follow + connect",
      accent: "indigo",
    },
  ],
};

export const SEED_SQUARE: SquareData = {
  author: "Saleh Seddik",
  handleShort: "Salehseddik",
  typeLabel: "Hot Take",
  eyebrow: "On AI in GTM",
  statement: "If you're still CSV-exporting from Clay, you're already *18 months behind*.",
  support: "MCP turned the warehouse → LLM gap into a connector. Use it before your competitors do.",
  closer: "Stop exporting. Start querying.",
  attribution: `saleh seddik // ${new Date().getFullYear()}`,
};

/**
 * Build a fully dynamic carousel from a LinkedIn post's hook + body. The number
 * of slides, their layouts (cover / stat / bullets / comparison / quote / text),
 * and content all come from the post itself — no fixed template.
 *
 * Heuristics:
 *  - Cover slide always uses the hook.
 *  - Body is split by blank lines → paragraphs. If too few, sentences are used.
 *  - A paragraph that looks like a list (`- `, `• `, `1.`) becomes a bullets slide.
 *  - A paragraph containing `vs` / `vs.` / `before` + `after` becomes comparison.
 *  - A paragraph leading with a stat (`80%`, `3x`, `$2M`) becomes a stat slide.
 *  - The shortest, punchiest sentence becomes the closing quote slide.
 *  - Slide count = clamp(2 cover/closer + body chunks, 3, 8).
 */
export function buildCarouselFromPost(
  hook: string,
  body: string,
  base: Partial<CarouselData> = {},
): CarouselData {
  const ACCENTS: AccentKey[] = ["coral", "teal", "amber", "sky", "indigo", "lime"];
  const cleanHook = stripSlideMarkers((hook || "").trim());
  const cleanBody = stripSlideMarkers((body || "").trim());

  // The cover hook must be a SHORT scroll-stopper — not the full post body.
  // Take the first sentence and clamp to ~110 chars / 14 words max.
  const shortHook = (() => {
    const src = cleanHook || cleanBody;
    if (!src) return "Untitled post";
    const firstSentence = (src.split(/(?<=[.!?])\s+/)[0] || src).trim();
    const words = firstSentence.split(/\s+/);
    let s = words.slice(0, 14).join(" ");
    if (s.length > 110) s = s.slice(0, 107).replace(/[\s,;:.\-—]+$/, "") + "…";
    return s.replace(/[.!?]+$/, "");
  })();

  const paragraphs = cleanBody
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Target 7 body chunks max — enough for an 8-10 slide deck (cover + 7 + CTA).
  // Going higher creates too many thin one-idea slides that weaken the narrative arc.
  const TARGET_BODY = Math.min(7, LINKEDIN_DESIGN_SYSTEM.carousel.targetSlides - 2);
  let chunks = paragraphs;
  if (chunks.length < TARGET_BODY && cleanBody) {
    const sents = cleanBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    if (sents.length > chunks.length) {
      const groupSize = Math.max(1, Math.ceil(sents.length / TARGET_BODY));
      chunks = [];
      for (let i = 0; i < sents.length; i += groupSize) {
        chunks.push(sents.slice(i, i + groupSize).join(" "));
      }
    }
  }
  // Drop near-empty fragments (stray markers, lone punctuation) so we never
  // emit a blank/abnormal slide — every slide must carry a real idea.
  chunks = chunks.map((c) => stripSlideMarkers(c)).filter((c) => contentWordCount(c) >= 3);
  // Merge adjacent tiny chunks (< 8 words) into the next to avoid one-sentence slides.
  const mergedChunks: string[] = [];
  for (let mi = 0; mi < chunks.length; mi++) {
    if (contentWordCount(chunks[mi]) < 8 && mi + 1 < chunks.length) {
      mergedChunks.push(chunks[mi] + " " + chunks[mi + 1]);
      mi++; // skip next — already merged
    } else {
      mergedChunks.push(chunks[mi]);
    }
  }
  chunks = mergedChunks;
  // Cap body chunks so the total stays within the 16-slide maximum.
  chunks = chunks.slice(0, LINKEDIN_DESIGN_SYSTEM.carousel.maxSlides - 2);

  const slides: CarouselSlide[] = [];

  // 1) Cover — title is the hook; subtitle is a SHORT promise of what's
  // inside the deck, never the same words as a body slide.
  const expectedSlideCount = Math.min(chunks.length + 2, LINKEDIN_DESIGN_SYSTEM.carousel.maxSlides);
  // Build a meaningful cover subtitle that teases what's inside — never
  // reflects back the user's own instructions or shows a raw slide count.
  const coverSub = (() => {
    if (chunks.length === 0) return "A quick read.";
    // Use the first sentence of body as a teaser if short enough, otherwise
    // fall back to a generic but relevant call-to-action for the deck.
    const firstChunk = (chunks[0] || "").trim();
    const firstSentence = firstChunk.split(/(?<=[.!?])\s+/)[0] || firstChunk;
    const teaser = clampWords(firstSentence.replace(/[.!?]+$/, ""), 10);
    return teaser.length >= 10 ? teaser : "Read every slide before you skip.";
  })();
  slides.push({
    layout: "cover",
    eyebrow: "Read this",
    title: shortHook,
    body: coverSub,
    closer: "Swipe →",
    accent: ACCENTS[0],
  });

  // Pre-scan ALL chunks to find the single best "quote" candidate — the most
  // standalone, insight-y sentence in the entire post. This is better than only
  // looking at the last chunk. Criteria: 25–100 chars, doesn’t start with
  // "I " / "We " (too personal for a pull quote), reads as a standalone truth.
  const bestQuoteSentence = (() => {
    for (const c of chunks) {
      const sents = c.split(/(?<=[.!?])\s+/).filter(Boolean);
      for (const s of sents) {
        const t = s.trim();
        if (t.length >= 25 && t.length <= 100 && !/^(I |We |My |Our )/i.test(t) && /[a-z]{3,}/i.test(t)) {
          return t;
        }
      }
    }
    return null;
  })();

  // 2..N-1) Body chunks
  let pickedQuote = false;
  chunks.forEach((chunk, i) => {
    const accent = ACCENTS[(i + 1) % ACCENTS.length];
    // Content-aware eyebrow — reflects what this chunk is actually about.
    // Never a page counter (the footer already shows ‘01 / 06’).
    const eyebrow = (() => {
      const c = chunk.toLowerCase();
      if (/%|\$\d|\dx\b|\d+x\b/.test(c)) return "THE DATA";
      if (/\bvs\.?\b|before[/ ]after|old way|new way/.test(c)) return "THE SHIFT";
      if (/^(i |we |my |our )|\b(worked|tried|tested|built|launched|shipped)\b/.test(c)) return "REAL TALK";
      if (/\b(step|checklist|process|system|workflow|framework|protocol)\b/.test(c)) return "THE SYSTEM";
      if (/\?/.test(c)) return "THE QUESTION";
      const fallbacks = ["THE INSIGHT", "WHAT CHANGED", "THE PLAYBOOK", "WHY IT WORKS", "THE PROOF", "FIELD NOTES"];
      return fallbacks[i % fallbacks.length];
    })();

    // Bullets — only use this layout when we have genuine list items with
    // real content (>= 4 words each). Single-word or abbreviation bullets
    // make the slide look broken.
    const lines = chunk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l));
    const cleanBulletCandidates = bulletLines
      .map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, "").trim().slice(0, 90))
      .filter((b) => contentWordCount(b) >= 4); // require ≥4 real words per bullet
    if (cleanBulletCandidates.length >= 2) {
      const headerLine = lines.find((l) => !/^([-•*]|\d+[.)])\s+/.test(l));
      const headerText = (headerLine || "").trim();
      // Header must be a real phrase, not a stray number or abbreviation
      const safeHeader = contentWordCount(headerText) >= 3 ? headerText : "Here's the playbook";
      slides.push({
        layout: "bullets",
        eyebrow,
        title: safeHeader.slice(0, 70),
        bullets: cleanBulletCandidates.slice(0, 5),
        closer: "Swipe →",
        accent,
      });
      return;
    }

    // Comparison
    if (/\b(vs\.?|before\s*\/?\s*after|old\s*(way|vs)|new\s*way)\b/i.test(chunk)) {
      const halves = chunk.split(/\bvs\.?\b|→|—/i).map((s) => s.trim()).filter(Boolean);
      const left = (halves[0] || "Before").split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
      const right = (halves[1] || "After").split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
      slides.push({
        layout: "comparison",
        eyebrow,
        title: lines[0].slice(0, 70),
        leftLabel: "Before", leftItems: left.length ? left : ["Manual work"],
        rightLabel: "After", rightItems: right.length ? right : ["Automated"],
        closer: "Swipe →",
        accent,
      });
      return;
    }

    // Stat — only use this layout when the number is unambiguous and meaningful:
    // - Must have an explicit unit (%  x  K  M  B  $  +) — not a bare number
    // - Must NOT be an abbreviation like "2B" from "B2B" (no letter immediately
    //   before the digit in the source text)
    // - Must be followed by a real label sentence (≥ 4 words) so the slide
    //   isn't just a giant number floating in space
    const statMatch = chunk.match(
      /(?<![A-Za-z])(\$?\d+(?:[.,]\d+)?(?:%|x|[KMBT]\b|\+|\$))/
    );
    const statVal = statMatch?.[1] ?? "";
    const hasExplicitUnit = /[%xKMBT$+]/.test(statVal);
    const isAbbrev = statMatch ? /[A-Za-z]/.test(chunk[Math.max(0, statMatch.index! - 1)] ?? "") : false;
    const statContext = statMatch
      ? (chunk.split(/(?<=[.!?])\s+/).find((s) => s.includes(statVal)) || chunk).trim()
      : "";
    const statContextWords = contentWordCount(statContext.replace(statVal, ""));

    if (statMatch && hasExplicitUnit && !isAbbrev && statContextWords >= 4 && statVal.length <= 8) {
      // Build label from the full sentence containing the stat — keeps context
      let label = statContext.replace(/[.!?]+$/, "");
      if (label.length > 80) label = label.slice(0, 77).replace(/[\s,;:.\-—]+$/, "") + "…";
      slides.push({
        layout: "stat",
        eyebrow,
        title: statVal,
        statValue: statVal,
        statLabel: label || "The number that matters.",
        body: "",
        closer: "Swipe →",
        accent,
      });
      return;
    }

    // Quote — use the best pre-selected sentence from any chunk (not just last).
    // Falls back to last-chunk logic if no pre-selected quote was found.
    const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunkHasBestQuote = bestQuoteSentence && chunk.includes(bestQuoteSentence);
    const punchy = sentences.find((s) => s.length > 20 && s.length < 110);
    if (!pickedQuote && (chunkHasBestQuote || (punchy && i === chunks.length - 1))) {
      pickedQuote = true;
      const quoteText = chunkHasBestQuote ? bestQuoteSentence! : punchy!;
      slides.push({
        layout: "quote",
        eyebrow: "TAKEAWAY",
        title: quoteText,
        quote: quoteText,
        quoteAuthor: base.author ?? "",
        closer: "Follow for more",
        accent,
      });
      return;
    }

    // Default — text slide. Title = first sentence; body = REMAINING
    // sentences, never a re-statement of the title.
    const firstSentence = (sentences[0] || chunk).trim();
    const restSentences = sentences.slice(1).join(" ").trim();
    const titleText = firstSentence.replace(/[.!?]+$/, "").slice(0, 80);

    // Quality guard: skip slides whose title is just a number, abbreviation,
    // or fewer than 4 meaningful words — these are always parsing artifacts.
    if (contentWordCount(titleText) < 4 && !restSentences) return;
    // Also skip if title looks like a bare stat / abbreviation (1-4 chars,
    // all digits+letters, no spaces) — e.g. "2B", "01", "GTM".
    if (/^[A-Z0-9]{1,4}$/.test(titleText.trim()) && contentWordCount(restSentences) < 3) return;

    slides.push({
      layout: "text",
      eyebrow,
      title: titleText,
      body: restSentences ? restSentences.slice(0, 220) : "",
      closer: "Swipe →",
      accent,
    });
  });

  // Always end with a dedicated CTA slide that highlights the author's photo
  // and prompts the reader to engage. Replaces any prior closing quote.
  const ctaPrompts = [
    "What would you add?",
    "Have you tried this?",
    "How does your team handle it?",
    "What's working for you?",
    "Agree or disagree?",
  ];
  const lastChunk = chunks[chunks.length - 1] || cleanHook;
  const prompt = (() => {
    const q = lastChunk.split(/(?<=[.!?])\s+/).find((s) => s.trim().endsWith("?"));
    if (q) return q.trim();
    return ctaPrompts[Math.floor(Math.random() * ctaPrompts.length)];
  })();
  // Closing slide — both CTAs (follow + bell) are required and AB-tested.
  slides.push({
    layout: "cta",
    eyebrow: "Let's talk",
    title: prompt,
    ctaPrompt: prompt,
    ctaAction: `Follow ${base.author ?? "me"} for more\n${BELL_CTA}`,
    quoteAuthor: base.author ?? "",
    closer: "Follow + connect",
    accent: ACCENTS[(slides.length) % ACCENTS.length],
  });

  // Enforce the ≤50-words-per-slide rule on body slides (cover hook + closing
  // CTA are exempt — they're chrome, not body copy).
  slides.forEach((s, i) => { if (i !== 0 && s.layout !== "cta") trimSlideToWordLimit(s); });

  return {
    author: base.author ?? SEED_CAROUSEL.author,
    handleShort: base.handleShort ?? SEED_CAROUSEL.handleShort,
    avatarUrl: base.avatarUrl,
    photoKey: base.photoKey,
    typeLabel: base.typeLabel ?? "Carousel",
    attribution: base.attribution ?? `${(base.author ?? SEED_CAROUSEL.author).toLowerCase()} // ${new Date().getFullYear()}`,
    slides: slides.slice(0, LINKEDIN_DESIGN_SYSTEM.carousel.maxSlides),
    overlays: {},
    themeKey: base.themeKey,
  };
}

/**
 * Build a CheatSheet dynamically from a LinkedIn post. Splits the body into
 * paragraphs / bullet groups and turns each into a section card. Section
 * count, kinds (bullets / stats / checklist / pills), titles, and items all
 * derive from the actual post content — no static template.
 */
export function buildCheatSheetFromPost(
  hook: string,
  body: string,
  base: Partial<CheatSheetData> = {},
): CheatSheetData {
  const ACCENTS: AccentKey[] = ["coral", "amber", "teal", "sky", "indigo", "olive"];
  const TAGS = ["The Shift", "Definition", "Setup", "The Stack", "Playbook", "Insight"];
  const cleanHook = stripSlideMarkers((hook || "").trim());
  const cleanBody = stripSlideMarkers((body || "").trim());

  const paragraphs = cleanBody.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  let chunks = paragraphs;
  if (chunks.length < 2 && cleanBody) {
    const sents = cleanBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    chunks = [];
    for (let i = 0; i < sents.length; i += 2) {
      chunks.push(sents.slice(i, i + 2).join(" "));
    }
  }
  // Drop near-empty fragments so a section is never one stray word ("The loops.").
  chunks = chunks.map((c) => stripSlideMarkers(c)).filter((c) => contentWordCount(c) >= 4).slice(0, 6);

  // A "strong" stat has a unit (%, $, x, K/M/B) or 2+ digits — never a bare
  // single digit (which would grab the "8" from "n8n" or "2" from "2 nights").
  const STRONG_STAT = /\$\d[\d.,]*|\d[\d.,]*\s?%|\b\d[\d.,]*x\b|\b\d[\d.,]*\s?[KMB]\b|\b\d{2,}\b/gi;

  const sections: SheetSection[] = chunks.map((chunk, i) => {
    const accent = ACCENTS[i % ACCENTS.length];
    const tag = TAGS[i % TAGS.length];
    const lines = chunk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l));
    const sentences = chunk.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const title = (lines[0] || sentences[0] || `Point ${i + 1}`)
      .replace(/^([-•*]|\d+[.)])\s+/, "")
      .slice(0, 70);

    // Explicit bullet / numbered list.
    if (bulletLines.length >= 2) {
      const items = bulletLines
        .map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, "").slice(0, 110))
        .slice(0, 5);
      return { tag, accent, title, kind: /^\d+[.)]/.test(bulletLines[0]) ? "checklist" : "bullets", items };
    }

    // Strong-stat section — only when there are ≥2 real metrics with a clean label.
    const stats = chunk.match(STRONG_STAT) || [];
    if (stats.length >= 2) {
      const items = stats.slice(0, 4).map((m) => {
        const sent = sentences.find((s) => s.includes(m)) || "";
        const label = sent.replace(m, "").replace(/\s{2,}/g, " ").replace(/[.!?]+$/, "").trim().slice(0, 44) || "metric";
        return `${m} :: ${label}`;
      });
      return { tag, accent, title, kind: "stats", items };
    }

    // Default: clean bullets from the remaining sentences — never repeat the title.
    const items = sentences
      .filter((s) => s.length > 12 && s.toLowerCase() !== title.toLowerCase())
      .slice(0, 4)
      .map((s) => s.replace(/[.!?]+$/, "").slice(0, 120));
    if (items.length >= 1) {
      return { tag, accent, title, kind: "bullets", items };
    }
    // The whole chunk is essentially the title — render it as one clean pill.
    return { tag, accent, title, kind: "pills", items: [chunk.replace(/[.!?]+$/, "").slice(0, 90)] };
  });

  // Always end with a single "Takeaway" closing card if room.
  if (sections.length < 6) {
    sections.push({
      tag: "Takeaway",
      accent: ACCENTS[(sections.length) % ACCENTS.length],
      title: cleanHook ? cleanHook.slice(0, 70) : "Worth remembering.",
      kind: "pills",
      items: [cleanHook ? cleanHook.slice(0, 90) : "Save & share."],
    });
  }

  return {
    author: base.author ?? SEED_CHEAT_SHEET.author,
    handleShort: base.handleShort ?? SEED_CHEAT_SHEET.handleShort,
    avatarUrl: base.avatarUrl,
    photoKey: base.photoKey,
    typeLabel: base.typeLabel ?? "Cheat Sheet",
    eyebrow: "Field notes",
    title: cleanHook || SEED_CHEAT_SHEET.title,
    subtitle: chunks[0]?.slice(0, 180) || "",
    closer: cleanHook ? `${cleanHook.split(/[.!?]/)[0].slice(0, 60)}.` : "Save this.",
    attribution: base.attribution ?? `${(base.author ?? SEED_CHEAT_SHEET.author).toLowerCase()} // ${new Date().getFullYear()}`,
    sections: sections.slice(0, 6),
    overlays: [],
    themeKey: base.themeKey,
  };
}

/**
 * Build a Square (Hot Take) dynamically from the post. Picks the punchiest
 * sentence as the headline statement and uses the rest as supporting body.
 */
export function buildSquareFromPost(
  hook: string,
  body: string,
  base: Partial<SquareData> = {},
): SquareData {
  const cleanHook = (hook || "").trim();
  const cleanBody = (body || "").trim();
  const sentences = `${cleanHook}. ${cleanBody}`.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const statement = (cleanHook || sentences[0] || "Hot take.").slice(0, 200);

  // Auto-emphasize the last 1-3 words as a *highlight* if not already.
  const emphasized = /\*[^*]+\*/.test(statement)
    ? statement
    : (() => {
        const words = statement.split(/\s+/);
        if (words.length < 4) return statement;
        const tail = words.slice(-3).join(" ").replace(/[.!?]$/, "");
        const head = words.slice(0, -3).join(" ");
        const punct = statement.match(/[.!?]$/)?.[0] || "";
        return `${head} *${tail}*${punct}`;
      })();

  const support = sentences
    .slice(1)
    .filter((s) => s.length > 12)
    .slice(0, 2)
    .join(" ")
    .slice(0, 220) || cleanBody.slice(0, 220);

  const closer = (() => {
    const q = sentences.find((s) => s.endsWith("?"));
    if (q) return q.slice(0, 80);
    const last = sentences[sentences.length - 1];
    return last ? last.slice(0, 80) : "What would you add?";
  })();

  return {
    author: base.author ?? SEED_SQUARE.author,
    handleShort: base.handleShort ?? SEED_SQUARE.handleShort,
    avatarUrl: base.avatarUrl,
    photoKey: base.photoKey,
    typeLabel: base.typeLabel ?? "Hot Take",
    eyebrow: "On the record",
    statement: emphasized,
    support,
    closer,
    attribution: base.attribution ?? `${(base.author ?? SEED_SQUARE.author).toLowerCase()} // ${new Date().getFullYear()}`,
    overlays: [],
    themeKey: base.themeKey,
  };
}

function compactCopy(value: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sentenceParts(value: unknown): string[] {
  return compactCopy(value)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^([-•*]|\d+[.)])\s+/, "").trim())
    .filter((s) => s.length > 0);
}

function smartText(value: unknown, max: number, fallback: string, punctuate = false): string {
  const clean = compactCopy(value).replace(/\s*\n\s*/g, " ");
  if (!clean) return fallback;
  if (clean.length <= max) return clean;
  const complete = sentenceParts(clean).find((s) => s.length >= 14 && s.length <= max);
  if (complete) return complete;
  const words = clean.split(/\s+/);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  out = (out || clean.slice(0, max)).replace(/[\s,;:—-]+$/, "").trim();
  if (punctuate && out && !/[.!?]$/.test(out)) out += ".";
  return out || fallback;
}

function uniqueThoughts(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => compactCopy(item).replace(/\s*\n\s*/g, " "))
    .filter((item) => item.length > 0)
    .filter((item) => !/^swipe\s*→?$/i.test(item) && !/^follow/i.test(item))
    .filter((item) => {
      const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function thoughtsFromCarousel(current: CarouselData): string[] {
  return uniqueThoughts((current.slides ?? []).flatMap((slide) => [
    slide.title,
    slide.body,
    slide.statLabel,
    slide.quote,
    ...(slide.bullets ?? []),
    ...(slide.leftItems ?? []),
    ...(slide.rightItems ?? []),
    slide.ctaPrompt,
  ].filter(Boolean) as string[]));
}

/**
 * Saleh's signature 8-slide LinkedIn carousel structure (per the
 * `saleh-linkedin-carousel` skill). Used when the user picks the
 * "Figma Template" theme — instead of just re-skinning the existing
 * slides, we rebuild the deck to the full template library:
 *   01 Cover · 02 Big Number · 03 Content · 04 Numbered List
 *   05 Code/Workflow (text) · 06 Quote · 07 Comparison · 08 CTA
 *
 * Preserves the user's current cover title / handle / author so they
 * don't lose their hook when switching theme.
 */
export function buildSalehFigmaCarousel(current: CarouselData): CarouselData {
  const author = current.author || "Saleh Seddik";
  const handle = current.handleShort || "Salehseddik";
  const coverSlide = current.slides?.find((s) => s.layout === "cover") || current.slides?.[0];
  const seedDefault = /Stop CSV-exporting Clay\. Plug it into your LLM/i.test(coverSlide?.title ?? "");
  const hook = smartText(
    seedDefault ? "" : coverSlide?.title,
    96,
    "Untitled LinkedIn carousel",
  );
  const sourceThoughts = seedDefault ? [] : thoughtsFromCarousel(current).filter((t) => !/^(read this|hook)$/i.test(t));
  const bodyThoughts = sourceThoughts.filter((t) => t.toLowerCase() !== hook.toLowerCase());
  const firstInsight = smartText(bodyThoughts[0], 82, `Why ${hook} matters now.`, true);
  const secondInsight = smartText(bodyThoughts[1], 170, "Turn the idea into a repeatable system, not a one-off post.", true);
  const existingBullets = current.slides?.find((s) => s.layout === "bullets" && s.bullets?.length)?.bullets ?? [];
  const playbook = uniqueThoughts(existingBullets.length ? existingBullets : bodyThoughts)
    .filter((item) => item.toLowerCase() !== hook.toLowerCase())
    .slice(0, 5)
    .map((item, i) => smartText(item, 72, [`Clarify the outcome`, `Map the workflow`, `Build the asset`, `Review the result`, `Ship and learn`][i], true));
  while (playbook.length < 5) playbook.push(["Clarify the outcome.", "Map the workflow.", "Build the asset.", "Review the result.", "Ship and learn."][playbook.length]);
  const quote = smartText(
    bodyThoughts.find((t) => t.length >= 24 && t.length <= 130) || hook,
    130,
    hook,
    true,
  );
  const comparison = current.slides?.find((s) => s.layout === "comparison");
  const leftItems = (comparison?.leftItems?.length ? comparison.leftItems : [
    "Manual research, one lead at a time.",
    "Generic templates sent to everyone.",
    "Tools that don't talk to each other.",
    "No signal on what drives replies.",
  ]).slice(0, 4).map((item) => smartText(item, 52, "Manual work.", true));
  const rightItems = (comparison?.rightItems?.length ? comparison.rightItems : [
    "AI-enriched context for every lead.",
    "Personalized outreach at real scale.",
    "One connected system, zero switching.",
    "Clear data on what works and why.",
  ]).slice(0, 4).map((item) => smartText(item, 52, "Repeatable system.", true));
  const question = smartText(
    bodyThoughts.find((t) => /\?$/.test(t)) || "What would you add?",
    64,
    "What would you add?",
  );

  const slides: CarouselSlide[] = [
    // 01 — Cover · Hook + curiosity-gap teaser
    {
      layout: "cover",
      eyebrow: "GTM ENGINEERING",
      title: hook,
      body: clampWords(firstInsight.replace(/[.!?]+$/, ""), 12) || "The system most teams miss.",
      closer: "Swipe →",
      accent: "teal",
    },
    // 02 — Context / Problem framing — reader recognition moment
    {
      layout: "text",
      eyebrow: "THE CONTEXT",
      title: smartText(firstInsight, 78, "Here is what most teams get wrong."),
      body: smartText(bodyThoughts[1] || secondInsight, 170, "The bottleneck is never the tool. It’s the system around the tool.", true),
      closer: "Swipe →",
      accent: "teal",
    },
    // 03 — The Insight / Diagnosis
    {
      layout: "text",
      eyebrow: "WHY THIS MATTERS",
      title: smartText(bodyThoughts[1] || firstInsight, 78, "The real bottleneck is the system."),
      body: secondInsight,
      closer: "Swipe →",
      accent: "teal",
    },
    // 04 — Numbered checklist
    {
      layout: "bullets",
      eyebrow: "THE OPERATING CHECKLIST",
      title: "Turn the idea into an operating checklist.",
      bullets: playbook,
      closer: "Swipe →",
      accent: "teal",
    },
    // 05 — The Proof — concrete result/example from the content
    {
      layout: "text",
      eyebrow: "THE PROOF",
      title: smartText(bodyThoughts[2] || bodyThoughts[1] || "Here is what this looks like in practice.", 78, "Here is what this looks like in practice."),
      body: smartText(bodyThoughts[3] || bodyThoughts[2] || "Apply the checklist to your next campaign. Review after each send and improve one step.", 170, "Apply the checklist to your next campaign. Review after each send and improve one step.", true),
      closer: "Swipe →",
      accent: "teal",
    },
    // 06 — Quote / The Thesis
    {
      layout: "quote",
      eyebrow: "THE THESIS",
      title: quote,
      quote,
      quoteAuthor: author,
      closer: "Swipe →",
      accent: "teal",
    },
    // 07 — Comparison — Old Way vs New Way
    {
      layout: "comparison",
      eyebrow: "OLD WAY / NEW WAY",
      title: "Two ways to handle this.",
      leftLabel: comparison?.leftLabel || "Before",
      leftItems,
      rightLabel: comparison?.rightLabel || "After",
      rightItems,
      closer: "Swipe →",
      accent: "teal",
    },
    // 08 — CTA (follow + bell both required)
    {
      layout: "cta",
      eyebrow: "FOLLOW FOR MORE SYSTEMS",
      title: question,
      ctaPrompt: question,
      ctaAction: `Follow @${handle} for more practical systems\n${BELL_CTA}`,
      quoteAuthor: author,
      closer: "DROP A COMMENT · FOLLOW + CONNECT",
      accent: "teal",
    },
  ];

  slides.forEach((s, i) => { if (i !== 0 && s.layout !== "cta") trimSlideToWordLimit(s); });

  return {
    ...current,
    author,
    handleShort: handle,
    typeLabel: current.typeLabel ?? "Carousel",
    themeKey: "figma-template",
    slides,
    overlays: {},
  };
}
