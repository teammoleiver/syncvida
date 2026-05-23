import { toPng } from "html-to-image";
import type { CheatSheetData, CarouselData, SquareData, CarouselSlide, SheetSection, AccentKey } from "./LinkedInCanvas";
import { supabase } from "@/integrations/supabase/client";

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
  const filename = `${baseName.replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}.pdf`;
  const storage_path = `${user.id}/${filename}`;
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
      eyebrow: "Hook",
      title: "Stop CSV-exporting Clay. Plug it into your LLM.",
      body: "A 4-slide field guide to MCP.",
      closer: "Swipe →",
      accent: "coral",
    },
    {
      layout: "stat",
      eyebrow: "Why now",
      title: "80% less research time",
      statValue: "80%",
      statLabel: "Less research time, per lead.",
      body: "Once Claude reads Clay live, the manual lookup loop dies.",
      closer: "Swipe →",
      accent: "teal",
    },
    {
      layout: "comparison",
      eyebrow: "The shift",
      title: "Old workflow vs. MCP.",
      leftLabel: "Old way",
      leftItems: [
        "Export Clay table to CSV",
        "Paste into LLM chat",
        "Re-export when data changes",
        "Stale within hours",
      ],
      rightLabel: "MCP way",
      rightItems: [
        "LLM queries Clay live",
        "One protocol, all tools",
        "Always current",
        "Zero context switching",
      ],
      closer: "Swipe →",
      accent: "amber",
    },
    {
      layout: "bullets",
      eyebrow: "Setup",
      title: "Three steps to wire it up.",
      bullets: [
        "Install the Clay MCP server",
        "Generate a table-read API key",
        "Register it in your Claude client",
      ],
      closer: "Swipe →",
      accent: "sky",
    },
    {
      layout: "quote",
      eyebrow: "Takeaway",
      quote: "Your LLM doesn't need your CSV. It needs your warehouse.",
      quoteAuthor: "Saleh Seddik",
      closer: "Follow for more",
      accent: "indigo",
      title: "Your LLM doesn't need your CSV. It needs your warehouse.",
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
  const cleanHook = (hook || "").trim();
  const cleanBody = (body || "").trim();

  const paragraphs = cleanBody
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Fall back to sentence chunks if the post has no paragraph breaks.
  let chunks = paragraphs;
  if (chunks.length < 2 && cleanBody) {
    const sents = cleanBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    chunks = [];
    for (let i = 0; i < sents.length; i += 2) {
      chunks.push(sents.slice(i, i + 2).join(" "));
    }
  }
  // Cap to 6 body chunks → max 8 slides total.
  chunks = chunks.slice(0, 6);

  const slides: CarouselSlide[] = [];

  // 1) Cover — title is the hook; subtitle is a SHORT promise of what's
  // inside the deck, never the same words as a body slide.
  const expectedSlideCount = Math.min(chunks.length + 2, 8);
  const coverSub = (() => {
    if (chunks.length === 0) return "A quick read.";
    return `${expectedSlideCount} slides. Save the ones that hit.`;
  })();
  slides.push({
    layout: "cover",
    eyebrow: "Read this",
    title: cleanHook || "Untitled post",
    body: coverSub,
    closer: "Swipe →",
    accent: ACCENTS[0],
  });

  // 2..N-1) Body chunks
  let pickedQuote = false;
  chunks.forEach((chunk, i) => {
    const accent = ACCENTS[(i + 1) % ACCENTS.length];
    const eyebrow = `${String(i + 1).padStart(2, "0")} / ${String(chunks.length).padStart(2, "0")}`;

    // Bullets
    const lines = chunk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l));
    if (bulletLines.length >= 2) {
      const headerLine = lines.find((l) => !/^([-•*]|\d+[.)])\s+/.test(l));
      const cleanBullets = bulletLines
        .map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, "").slice(0, 90))
        .slice(0, 5);
      slides.push({
        layout: "bullets",
        eyebrow,
        title: (headerLine || "Here's the playbook").slice(0, 70),
        bullets: cleanBullets,
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

    // Stat — value is the number, label is a SHORT crisp descriptor (max 6
    // words), body is OMITTED so the giant number isn't followed by a
    // paragraph that repeats the same words in smaller font.
    const statMatch = chunk.match(/\$?\d+(?:[.,]\d+)?[%xKMB+]?/);
    if (statMatch && statMatch[0].length <= 8 && /[%xKMB$]|\d{2,}/.test(statMatch[0])) {
      const sentenceWithStat = (chunk.split(/(?<=[.!?])\s+/).find((s) => s.includes(statMatch[0])) || chunk)
        .replace(statMatch[0], "")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s,;:.\-—]+|[\s,;:.\-—]+$/g, "")
        .trim();
      const labelWords = sentenceWithStat.split(/\s+/).slice(0, 7).join(" ");
      slides.push({
        layout: "stat",
        eyebrow,
        title: statMatch[0],
        statValue: statMatch[0],
        statLabel: labelWords || "The number that matters.",
        body: "",
        closer: "Swipe →",
        accent,
      });
      return;
    }

    // Quote (use the shortest punchy sentence once)
    const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
    const punchy = sentences.find((s) => s.length > 20 && s.length < 110);
    if (!pickedQuote && punchy && i === chunks.length - 1) {
      pickedQuote = true;
      slides.push({
        layout: "quote",
        eyebrow: "Takeaway",
        title: punchy,
        quote: punchy,
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
  slides.push({
    layout: "cta",
    eyebrow: "Let's talk",
    title: prompt,
    ctaPrompt: prompt,
    ctaAction: `Follow ${base.author ?? "me"} for more`,
    quoteAuthor: base.author ?? "",
    closer: "Follow + connect",
    accent: ACCENTS[(slides.length) % ACCENTS.length],
  });

  return {
    author: base.author ?? SEED_CAROUSEL.author,
    handleShort: base.handleShort ?? SEED_CAROUSEL.handleShort,
    avatarUrl: base.avatarUrl,
    photoKey: base.photoKey,
    typeLabel: base.typeLabel ?? "Carousel",
    attribution: base.attribution ?? `${(base.author ?? SEED_CAROUSEL.author).toLowerCase()} // ${new Date().getFullYear()}`,
    slides: slides.slice(0, 8),
    overlays: {},
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
  const cleanHook = (hook || "").trim();
  const cleanBody = (body || "").trim();

  const paragraphs = cleanBody.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  let chunks = paragraphs;
  if (chunks.length < 2 && cleanBody) {
    const sents = cleanBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    chunks = [];
    for (let i = 0; i < sents.length; i += 2) {
      chunks.push(sents.slice(i, i + 2).join(" "));
    }
  }
  chunks = chunks.slice(0, 6);

  const sections: SheetSection[] = chunks.map((chunk, i) => {
    const accent = ACCENTS[i % ACCENTS.length];
    const tag = TAGS[i % TAGS.length];
    const lines = chunk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l));
    const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
    const title = (lines[0] || sentences[0] || `Point ${i + 1}`)
      .replace(/^([-•*]|\d+[.)])\s+/, "")
      .slice(0, 70);

    // Stats heuristic — chunk loaded with %, $, x numbers
    const statMatches = chunk.match(/[\$<]?\d+(?:\.\d+)?[%xKMB+]?/g) || [];
    if (statMatches.length >= 2 && bulletLines.length === 0) {
      const items = statMatches.slice(0, 4).map((m) => {
        const ctx = chunk.split(m)[1]?.split(/[.!?\n]/)[0]?.trim() || "";
        return `${m} :: ${ctx.slice(0, 28) || "metric"} :: ${ctx.slice(0, 60) || ""}`;
      });
      return { tag, accent, title, kind: "stats", items };
    }

    if (bulletLines.length >= 2) {
      const items = bulletLines
        .map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, "").slice(0, 110))
        .slice(0, 5);
      const isOrdered = /^\d+[.)]/.test(bulletLines[0]);
      return { tag, accent, title, kind: isOrdered ? "checklist" : "bullets", items };
    }

    // Default: split sentences into bullets
    const items = sentences
      .filter((s) => s.length > 8)
      .slice(0, 4)
      .map((s) => s.trim().slice(0, 120));
    if (items.length >= 2) {
      return { tag, accent, title, kind: "bullets", items };
    }
    // Tiny chunk → render as pills (single thoughts)
    return {
      tag, accent, title,
      kind: "pills",
      items: [chunk.slice(0, 80)],
    };
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
  };
}
