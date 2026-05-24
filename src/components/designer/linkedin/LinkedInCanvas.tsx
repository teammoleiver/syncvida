import "./canvas.css";
import { Fragment } from "react";
import OverlayLayer from "./OverlayLayer";

/**
 * Saleh Seddik LinkedIn brand canvases — ported from the standalone HTML
 * generator. Three formats: cheat sheet, carousel slide, square hot-take.
 *
 * All photo refs point to /linkedin-templates/photos/<color>.png in /public.
 */

const PHOTOS_BASE = "/linkedin-templates/photos";

const ACCENT_PHOTO: Record<string, string> = {
  coral: `${PHOTOS_BASE}/coral.png`,
  amber: `${PHOTOS_BASE}/coral.png`,
  teal: `${PHOTOS_BASE}/teal.png`,
  indigo: `${PHOTOS_BASE}/navy.png`,
  plum: `${PHOTOS_BASE}/slate.png`,
  olive: `${PHOTOS_BASE}/olive.png`,
  sky: `${PHOTOS_BASE}/sky.png`,
  green: `${PHOTOS_BASE}/green.png`,
  blue: `${PHOTOS_BASE}/blue.png`,
  white: `${PHOTOS_BASE}/white.png`,
  cream: `${PHOTOS_BASE}/cream.png`,
  light: `${PHOTOS_BASE}/light.png`,
  slate: `${PHOTOS_BASE}/slate.png`,
  navy: `${PHOTOS_BASE}/navy.png`,
};

export type AccentKey = keyof typeof ACCENT_PHOTO;

export type SectionKind = "bullets" | "pills" | "checklist" | "stats" | "flags" | "bars" | "donut" | "tools" | "table";

/**
 * Free-position elements that float on top of the structured layout. Used for
 * dropping logos from the asset library, custom text labels, shapes, etc.
 * Coordinates are in canvas pixels (the same coordinate system the canvas
 * itself renders in — e.g. 1280×1820 for the cheat sheet).
 */
export type Overlay =
  | {
      id: string;
      type: "image";
      x: number; y: number; w: number; h: number;
      src: string;
      radius?: number;
      objectFit?: "cover" | "contain";
    }
  | {
      id: string;
      type: "text";
      x: number; y: number; w: number; h: number;
      text: string;
      fontSize: number;
      fontWeight?: number;
      color?: string;
      align?: "left" | "center" | "right";
      italic?: boolean;
      letterSpacing?: number;
      lineHeight?: number;
    }
  | {
      id: string;
      type: "shape";
      x: number; y: number; w: number; h: number;
      shape: "rect" | "circle";
      fill: string;
      radius?: number;
      stroke?: string;
      strokeWidth?: number;
    };

export type SheetSection = {
  tag: string;
  accent?: AccentKey;
  title: string;
  subtitle?: string;
  kind: SectionKind;
  items?: string[];
  table?: { headers: string[]; rows: string[][] };
  callout?: { value: string; label: string };
};

export type CheatSheetData = {
  author: string;
  handleShort?: string;
  avatarUrl?: string;
  photoKey?: AccentKey;
  typeLabel?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  closer?: string;
  attribution?: string;
  sections: SheetSection[];
  overlays?: Overlay[];
  themeKey?: ThemeKey;
};

/**
 * A carousel slide can render in one of several layouts. The `layout` field
 * picks which renderer to use; each layout reads its own subset of fields.
 * Shared across all layouts: eyebrow, accent, closer.
 */
export type CarouselLayout = "text" | "cover" | "stat" | "quote" | "bullets" | "comparison" | "cta";

export type CarouselSlide = {
  layout?: CarouselLayout;
  eyebrow?: string;
  title: string;
  /** Body copy. For `text` layout the renderer hard-caps at ~220 chars to stop walls of text. */
  body?: string;
  closer?: string;
  accent?: AccentKey;
  // --- stat ---
  statValue?: string;
  statLabel?: string;
  // --- quote ---
  quote?: string;
  quoteAuthor?: string;
  // --- bullets ---
  bullets?: string[];
  // --- comparison ---
  leftLabel?: string;
  leftItems?: string[];
  rightLabel?: string;
  rightItems?: string[];
  // --- cta (closing slide with big author photo) ---
  ctaPrompt?: string;
  ctaAction?: string;
};

export type CarouselData = {
  author: string;
  handleShort?: string;
  avatarUrl?: string;
  photoKey?: AccentKey;
  typeLabel?: string;
  attribution?: string;
  slides: CarouselSlide[];
  /** Per-slide overlays: overlays[slideIndex] = Overlay[] */
  overlays?: Record<number, Overlay[]>;
  themeKey?: ThemeKey;
};

export type SquareData = {
  author: string;
  handleShort?: string;
  avatarUrl?: string;
  photoKey?: AccentKey;
  typeLabel?: string;
  eyebrow?: string;
  statement: string;
  support?: string;
  closer?: string;
  attribution?: string;
  overlays?: Overlay[];
  themeKey?: ThemeKey;
};

/**
 * Visual style themes — applied to the canvas root via `data-theme` so all
 * typography, colors, and surface tokens swap together. Picked once via the
 * Template Style dialog right after the post is generated.
 */
export type ThemeKey =
  | "editorial-dark"
  | "editorial-light"
  | "mono-minimal"
  | "bold-pop"
  | "magazine-serif"
  | "tech-neon"
  | "pastel-soft"
  | "corporate-clean"
  | "figma-template";

export const THEME_KEYS: ThemeKey[] = [
  "editorial-dark",
  "editorial-light",
  "mono-minimal",
  "bold-pop",
  "magazine-serif",
  "tech-neon",
  "pastel-soft",
  "corporate-clean",
  "figma-template",
];

export const THEMES: { key: ThemeKey; label: string; description: string; preview: { bg: string; fg: string; accent: string } }[] = [
  { key: "editorial-dark", label: "Editorial Dark", description: "Default — bold sans, deep navy, coral accent.", preview: { bg: "#0B0F1A", fg: "#F5F1E8", accent: "#E8654A" } },
  { key: "editorial-light", label: "Editorial Light", description: "Same energy, light paper background.", preview: { bg: "#F5F1E8", fg: "#0B0F1A", accent: "#E8654A" } },
  { key: "mono-minimal", label: "Mono Minimal", description: "Black & white, system mono, brutalist.", preview: { bg: "#FFFFFF", fg: "#000000", accent: "#000000" } },
  { key: "bold-pop", label: "Bold Pop", description: "Saturated coral background, white display type.", preview: { bg: "#E8654A", fg: "#FFFFFF", accent: "#0B0F1A" } },
  { key: "magazine-serif", label: "Magazine Serif", description: "Serif headlines, cream paper, gold accent.", preview: { bg: "#F3EAD8", fg: "#1A1410", accent: "#A16A2C" } },
  { key: "tech-neon", label: "Tech Neon", description: "Pure black, mint accent, mono labels.", preview: { bg: "#050507", fg: "#E8F8EE", accent: "#36F1A6" } },
  { key: "pastel-soft", label: "Pastel Soft", description: "Lavender background, deep plum text.", preview: { bg: "#F2EAF7", fg: "#3B1B5B", accent: "#7C4DD1" } },
  { key: "corporate-clean", label: "Corporate Clean", description: "Fresh white, navy text, sharp blue accent.", preview: { bg: "#FFFFFF", fg: "#0F1B3D", accent: "#1B5BFF" } },
  { key: "figma-template", label: "Figma Template", description: "Saleh personal-brand carousel — off-black #0E0E0E, mint #00E18A, Inter + JBM.", preview: { bg: "#0E0E0E", fg: "#FFFFFF", accent: "#00E18A" } },
];

function pickPhoto(data: any): string {
  if (data.avatarUrl) return data.avatarUrl;
  if (data.photoKey && ACCENT_PHOTO[data.photoKey]) return ACCENT_PHOTO[data.photoKey];
  const accent: AccentKey | undefined = data.sections?.[0]?.accent || data.slides?.[0]?.accent || "coral";
  return (accent && ACCENT_PHOTO[accent]) || ACCENT_PHOTO.coral;
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function safeSections(value: unknown): SheetSection[] {
  return Array.isArray(value) ? (value as SheetSection[]) : [];
}

function safeSlides(value: unknown): CarouselSlide[] {
  return Array.isArray(value) ? (value as CarouselSlide[]) : [];
}

function safeOverlays(value: unknown): Overlay[] {
  return Array.isArray(value) ? (value as Overlay[]) : [];
}

function safeRows(value: unknown): string[][] {
  return Array.isArray(value)
    ? value.map((row) => safeStringArray(row)).filter((row) => row.length > 0)
    : [];
}

function TopChrome({ typeLabel }: { typeLabel: string }) {
  return (
    <div className="cnv-header">
      <div style={{ width: 0 }} />
      <div className="cnv-type-pill">{typeLabel}</div>
    </div>
  );
}

function Signature({ data, size = "md" }: { data: any; size?: "sm" | "md" | "lg" }) {
  const photo = pickPhoto(data);
  const initial = (data.author || "S").trim().charAt(0).toUpperCase();
  const dim = size === "lg" ? 56 : size === "sm" ? 36 : 44;
  return (
    <div className="cnv-sig">
      <div
        className="cnv-sig-avatar"
        style={{
          width: dim,
          height: dim,
          backgroundImage: photo ? `url(${photo})` : undefined,
          backgroundColor: photo ? undefined : "var(--brand-coral)",
        }}
      >
        {!photo && initial}
      </div>
      <div className="cnv-sig-meta">
        <div className="cnv-sig-name">{data.author}</div>
        <div className="cnv-sig-handle">@{data.handleShort || "Salehseddik"}</div>
      </div>
    </div>
  );
}

const TOOL_REGISTRY: Record<string, { mono: string; bg: string; fg: string }> = {
  clay: { mono: "C", bg: "#34D399", fg: "#04201D" },
  n8n: { mono: "n8n", bg: "#EA4B71", fg: "#FFFFFF" },
  claude: { mono: "C", bg: "#D97757", fg: "#2A0E08" },
  chatgpt: { mono: "GPT", bg: "#10A37F", fg: "#FFFFFF" },
  openai: { mono: "AI", bg: "#000000", fg: "#FFFFFF" },
  hubspot: { mono: "H", bg: "#FF7A59", fg: "#2A0E08" },
  apollo: { mono: "A", bg: "#1B5BFF", fg: "#FFFFFF" },
  smartlead: { mono: "S", bg: "#0EA5E9", fg: "#04111F" },
  instantly: { mono: "i", bg: "#7C3AED", fg: "#FFFFFF" },
  airmail: { mono: "AM", bg: "#3B82F6", fg: "#FFFFFF" },
  zoominfo: { mono: "Z", bg: "#FF6D00", fg: "#FFFFFF" },
  findymail: { mono: "F", bg: "#22C55E", fg: "#04201D" },
  bettercontact: { mono: "BC", bg: "#6366F1", fg: "#FFFFFF" },
  linkedin: { mono: "in", bg: "#0A66C2", fg: "#FFFFFF" },
  salesnav: { mono: "Sn", bg: "#0A66C2", fg: "#FFFFFF" },
  google: { mono: "G", bg: "#4285F4", fg: "#FFFFFF" },
  microsoft: { mono: "M", bg: "#0078D4", fg: "#FFFFFF" },
  make: { mono: "M", bg: "#6D00CC", fg: "#FFFFFF" },
  zapier: { mono: "Z", bg: "#FF4F00", fg: "#FFFFFF" },
  slack: { mono: "S", bg: "#4A154B", fg: "#FFFFFF" },
  notion: { mono: "N", bg: "#FFFFFF", fg: "#000000" },
  airtable: { mono: "A", bg: "#FCB400", fg: "#0B0F1A" },
  segment: { mono: "S", bg: "#52BD95", fg: "#04201D" },
  mcp: { mono: "MCP", bg: "#E8654A", fg: "#2A0E08" },
};

function ToolChip({ raw }: { raw: string }) {
  const parts = String(raw || "").split("::").map((s) => s.trim());
  const name = parts[0] || "Tool";
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const reg = TOOL_REGISTRY[key];
  const mono = parts[1] || (reg && reg.mono) || name.charAt(0).toUpperCase();
  const bg = parts[2] || (reg && reg.bg) || "var(--accent-coral)";
  const fg = parts[3] || (reg && reg.fg) || "#0B0F1A";
  return (
    <div className="cnv-tool">
      <div className="cnv-tool-mark" style={{ background: bg, color: fg }}>{mono}</div>
      <div className="cnv-tool-name">{name}</div>
    </div>
  );
}

function BarChart({ items }: { items?: string[] }) {
  const rows = safeStringArray(items).map((it) => {
    const p = String(it).split("::").map((s) => s.trim());
    return { label: p[0] || "", value: parseFloat(p[1] || "0"), suffix: p[2] || "" };
  });
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="cnv-bars">
      {rows.map((r, i) => (
        <div key={i} className="cnv-bar-row">
          <div className="cnv-bar-label">{r.label}</div>
          <div className="cnv-bar-track">
            <div className="cnv-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="cnv-bar-val">{r.value}{r.suffix}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ items }: { items?: string[] }) {
  const rows = safeStringArray(items).map((it) => {
    const p = String(it).split("::").map((s) => s.trim());
    return { label: p[0] || "", value: parseFloat(p[1] || "0") };
  });
  const total = Math.max(1, rows.reduce((a, b) => a + b.value, 0));
  const palette = [
    "var(--accent)",
    "color-mix(in srgb, var(--accent) 60%, #1B2236)",
    "color-mix(in srgb, var(--accent) 30%, #1B2236)",
    "color-mix(in srgb, var(--accent) 75%, #5C6781)",
  ];
  let acc = 0;
  const R = 56;
  const C = 2 * Math.PI * R;
  return (
    <div className="cnv-donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1B2236" strokeWidth="18" />
        {rows.map((r, i) => {
          const frac = r.value / total;
          const len = frac * C;
          const off = -acc * C;
          acc += frac;
          return (
            <circle key={i} cx="70" cy="70" r={R} fill="none"
              stroke={palette[i % palette.length]} strokeWidth="18"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off}
              transform="rotate(-90 70 70)" strokeLinecap="butt" />
          );
        })}
      </svg>
      <div className="cnv-donut-legend">
        {rows.map((r, i) => (
          <div key={i} className="cnv-donut-item">
            <span className="dot" style={{ background: palette[i % palette.length] }} />
            <span className="lbl">{r.label}</span>
            <span className="val">{Math.round((r.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionContent({ section }: { section: SheetSection }) {
  const { kind, items, table, callout } = section;
  const itemList = safeStringArray(items);
  const tableHeaders = safeStringArray(table?.headers);
  const tableRows = safeRows(table?.rows);
  return (
    <>
      {callout && callout.value ? (
        <div className="cnv-callout">
          <div className="v">{callout.value}</div>
          <div className="l">{callout.label}</div>
        </div>
      ) : null}

      {kind === "bullets" && (
        <ul className="cnv-bullets">
          {itemList.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}

      {kind === "pills" && (
        <div className={`cnv-pills${itemList.length <= 3 ? " single" : ""}`}>
          {itemList.map((it, i) => <div key={i} className="pill">{it}</div>)}
        </div>
      )}

      {kind === "checklist" && (
        <ol className="cnv-checklist">
          {itemList.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      )}

      {kind === "stats" && (
        <div className="cnv-stats">
          {itemList.map((it, i) => {
            const parts = String(it).split("::").map((s) => s.trim());
            return (
              <div key={i} className="cnv-stat">
                <div className="num">{parts[0] || ""}</div>
                <div className="body">
                  {parts[1] && <span className="lbl">{parts[1]}</span>}
                  {parts[2] && <span className="desc">{parts[2]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {kind === "flags" && (
        <ul className="cnv-flags">
          {itemList.map((it, i) => (
            <li key={i}><span className="x">✗</span><span>{it}</span></li>
          ))}
        </ul>
      )}

      {kind === "bars" && <BarChart items={items} />}
      {kind === "donut" && <DonutChart items={items} />}

      {kind === "tools" && (
        <div className="cnv-tools">
          {itemList.map((it, i) => <ToolChip key={i} raw={it} />)}
        </div>
      )}

      {kind === "table" && table && (
        <table className="cnv-table">
          <thead>
            <tr>{tableHeaders.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function CheatSheetCanvas({
  data, idForExport = "canvas-export",
  editableOverlays = false, selectedOverlayId = null,
  onSelectOverlay, onChangeOverlays, zoom = 1,
}: {
  data: CheatSheetData; idForExport?: string;
  editableOverlays?: boolean; selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onChangeOverlays?: (next: Overlay[]) => void;
  zoom?: number;
}) {
  const accentOrder: AccentKey[] = ["coral", "amber", "teal", "indigo", "plum", "olive", "sky"];
  const sections = safeSections(data.sections);
  return (
    <div className="canvas" data-format="cheatsheet" data-theme={data.themeKey || undefined} id={idForExport}>
      <TopChrome typeLabel={data.typeLabel || "Cheat Sheet"} />
      <div className="cnv-hero">
        {data.eyebrow && <div className="eyebrow">{data.eyebrow}</div>}
        <h1>{data.title}</h1>
        {data.subtitle && <div className="sub">{data.subtitle}</div>}
      </div>
      <div className="cnv-divider" />
      <div className="cnv-grid">
        {sections.map((section, idx) => {
          const accent = section.accent || accentOrder[idx % accentOrder.length];
          const num = String(idx + 1).padStart(2, "0");
          return (
            <div key={idx} className="cnv-card" data-accent={accent}>
              <div className="meta-row">
                <span className="cnv-tag">{section.tag}</span>
                <span className="cnv-num">{num}</span>
              </div>
              <div>
                <h2>{section.title}</h2>
                {section.subtitle && <p className="cap" style={{ marginTop: 8 }}>{section.subtitle}</p>}
              </div>
              <SectionContent section={section} />
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div className="cnv-footer cnv-footer-sig">
        <Signature data={data} size="md" />
        <div className="cnv-footer-right">
          {data.closer && <div className="closer">{data.closer}</div>}
          <div className="attribution">{data.attribution || `saleh seddik // ${new Date().getFullYear()}`}</div>
        </div>
      </div>
      <OverlayLayer
        overlays={safeOverlays(data.overlays)}
        editable={editableOverlays}
        selectedId={selectedOverlayId}
        onSelect={onSelectOverlay}
        onChange={onChangeOverlays}
        zoom={zoom}
      />
    </div>
  );
}

/**
 * Hard char limits per layout, enforced at render time. The form also nudges
 * the user toward these limits with a char counter, but trimming here is the
 * last line of defense — overflow ruins the design more than truncation does.
 */
const TEXT_BODY_MAX = 220;
const STAT_BODY_MAX = 80;
const QUOTE_MAX = 180;
const BULLET_MAX = 70;
const COMP_ITEM_MAX = 50;

function clip(s: string | undefined, n: number): string {
  if (!s) return "";
  const clean = String(s).replace(/[ \t]+/g, " ").trim();
  if (clean.length <= n) return clean;
  const completeSentence = clean.split(/(?<=[.!?])\s+/).find((part) => part.length >= 12 && part.length <= n);
  if (completeSentence) return completeSentence;
  const words = clean.split(/\s+/);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > n - 1) break;
    out = next;
  }
  return (out || clean.slice(0, n - 1)).replace(/[\s,;:—-]+$/, "").trimEnd() + "…";
}

/**
 * True when `b` substantially repeats `a`. Used to suppress small-font
 * paragraphs that just restate the big headline above them. Compares on
 * lowercased word sets — duplicate when 60%+ of `b`'s words are also in
 * `a`, OR when one is a long prefix of the other.
 */
function isSameContent(a?: string, b?: string): boolean {
  const A = (a || "").trim().toLowerCase();
  const B = (b || "").trim().toLowerCase();
  if (!A || !B) return false;
  if (A === B) return true;
  const stripA = A.replace(/[^a-z0-9 ]/g, "");
  const stripB = B.replace(/[^a-z0-9 ]/g, "");
  if (stripA.startsWith(stripB.slice(0, 30)) || stripB.startsWith(stripA.slice(0, 30))) return true;
  const wordsA = new Set(stripA.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = stripB.split(/\s+/).filter((w) => w.length > 2);
  if (wordsB.length === 0) return false;
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / wordsB.length >= 0.6;
}

function CarouselBody({ slide, ctx }: { slide: CarouselSlide; ctx?: { author: string; handleShort?: string; avatarUrl?: string; photoKey?: AccentKey; } }) {
  const layout: CarouselLayout = slide.layout || "text";

  if (layout === "cover") {
    return (
      <div className="carousel-body carousel-cover">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <h1 className="carousel-cover-title">{clip(slide.title, 110)}</h1>
        {slide.body && !isSameContent(slide.title, slide.body) && (
          <p className="carousel-cover-sub">{clip(slide.body, 120)}</p>
        )}
      </div>
    );
  }

  if (layout === "stat") {
    return (
      <div className="carousel-body carousel-stat">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <div className="carousel-stat-value">{slide.statValue || "—"}</div>
        {slide.statLabel && <div className="carousel-stat-label">{clip(slide.statLabel, 90)}</div>}
        {slide.body && !isSameContent(slide.statLabel, slide.body) && (
          <p className="carousel-stat-body">{clip(slide.body, STAT_BODY_MAX)}</p>
        )}
      </div>
    );
  }

  if (layout === "quote") {
    return (
      <div className="carousel-body carousel-quote">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <div className="carousel-quote-mark" aria-hidden>“</div>
        <blockquote className="carousel-quote-text">{clip(slide.quote || slide.title, QUOTE_MAX)}</blockquote>
        {slide.quoteAuthor && <div className="carousel-quote-author">— {slide.quoteAuthor}</div>}
      </div>
    );
  }

  if (layout === "bullets") {
    const items = safeStringArray(slide.bullets);
    return (
      <div className="carousel-body carousel-bullets-layout">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <h2 className="carousel-bullets-title">{clip(slide.title, 92)}</h2>
        <ul className="carousel-bullets-list">
          {items.slice(0, 5).map((b, i) => (
            <li key={i}><span className="num">{String(i + 1).padStart(2, "0")}</span><span>{clip(b, BULLET_MAX)}</span></li>
          ))}
        </ul>
      </div>
    );
  }

  if (layout === "comparison") {
    const left = safeStringArray(slide.leftItems);
    const right = safeStringArray(slide.rightItems);
    return (
      <div className="carousel-body carousel-compare-layout">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <h2 className="carousel-compare-title">{clip(slide.title, 76)}</h2>
        <div className="carousel-compare-grid">
          <div className="carousel-compare-col" data-side="left">
            <div className="lbl">{slide.leftLabel || "Before"}</div>
            <ul>{left.slice(0, 4).map((it, i) => <li key={i}>{clip(it, COMP_ITEM_MAX)}</li>)}</ul>
          </div>
          <div className="carousel-compare-col" data-side="right">
            <div className="lbl">{slide.rightLabel || "After"}</div>
            <ul>{right.slice(0, 4).map((it, i) => <li key={i}>{clip(it, COMP_ITEM_MAX)}</li>)}</ul>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "cta") {
    const photo = ctx ? pickPhoto(ctx) : "";
    const initial = (ctx?.author || "S").trim().charAt(0).toUpperCase();
    return (
      <div className="carousel-body carousel-cta">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <div
          className="carousel-cta-avatar"
          style={{
            backgroundImage: photo ? `url(${photo})` : undefined,
            backgroundColor: photo ? undefined : "var(--brand-coral)",
          }}
        >
          {!photo && initial}
        </div>
        <div className="carousel-cta-name">{ctx?.author || slide.quoteAuthor || ""}</div>
        {ctx?.handleShort && <div className="carousel-cta-handle">@{ctx.handleShort}</div>}
        <h2 className="carousel-cta-prompt">{clip(slide.ctaPrompt || slide.title || "What would you add?", 80)}</h2>
        {slide.ctaAction && <p className="carousel-cta-action">{slide.ctaAction}</p>}
      </div>
    );
  }

  // text (default)
  return (
    <div className="carousel-body">
      {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
      <h1 className="carousel-title">{clip(slide.title, 92)}</h1>
      {slide.body && !isSameContent(slide.title, slide.body) && (
        <p>{clip(slide.body, TEXT_BODY_MAX)}</p>
      )}
    </div>
  );
}

export function CarouselCanvas({
  data, slideIndex = 0, idForExport = "canvas-export",
  editableOverlays = false, selectedOverlayId = null,
  onSelectOverlay, onChangeOverlays, zoom = 1,
}: {
  data: CarouselData; slideIndex?: number; idForExport?: string;
  editableOverlays?: boolean; selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onChangeOverlays?: (next: Overlay[]) => void;
  zoom?: number;
}) {
  const slides = safeSlides(data.slides);
  const slide = slides[slideIndex] || slides[0] || ({ title: "" } as CarouselSlide);
  const total = slides.length;
  const accent = slide.accent || "coral";
  return (
    <div className="canvas" data-format="carousel" data-accent={accent} data-theme={data.themeKey || undefined} id={idForExport}>
      <TopChrome typeLabel={data.typeLabel || "Carousel"} />
      <CarouselBody slide={slide} ctx={{ author: data.author, handleShort: data.handleShort, avatarUrl: data.avatarUrl, photoKey: data.photoKey }} />
      <div className="cnv-footer cnv-footer-sig">
        <Signature data={data} size="md" />
        <div className="cnv-footer-right">
          {slide.closer && <div className="closer">{slide.closer}</div>}
          <div className="attribution">{`${String(slideIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</div>
        </div>
      </div>
      <OverlayLayer
        overlays={safeOverlays(data.overlays?.[slideIndex])}
        editable={editableOverlays}
        selectedId={selectedOverlayId}
        onSelect={onSelectOverlay}
        onChange={onChangeOverlays}
        zoom={zoom}
      />
    </div>
  );
}

export function SquareCanvas({
  data, idForExport = "canvas-export",
  editableOverlays = false, selectedOverlayId = null,
  onSelectOverlay, onChangeOverlays, zoom = 1,
}: {
  data: SquareData; idForExport?: string;
  editableOverlays?: boolean; selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onChangeOverlays?: (next: Overlay[]) => void;
  zoom?: number;
}) {
  const renderStatement = (text: string) => {
    const parts = String(text || "").split(/(\*[^*]+\*)/g);
    return parts.map((p, i) => {
      if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
      return <Fragment key={i}>{p}</Fragment>;
    });
  };
  return (
    <div className="canvas" data-format="square" data-theme={data.themeKey || undefined} id={idForExport}>
      <TopChrome typeLabel={data.typeLabel || "Hot Take"} />
      <div className="square-body">
        {data.eyebrow && <span className="square-eyebrow">{data.eyebrow}</span>}
        <h1 className="square-statement">{renderStatement(data.statement)}</h1>
        {data.support && <p className="square-support">{data.support}</p>}
      </div>
      <div className="cnv-footer cnv-footer-sig">
        <Signature data={data} size="lg" />
        <div className="cnv-footer-right">
          {data.closer && <div className="closer">{data.closer}</div>}
          <div className="attribution">{data.attribution || `saleh seddik // ${new Date().getFullYear()}`}</div>
        </div>
      </div>
      <OverlayLayer
        overlays={safeOverlays(data.overlays)}
        editable={editableOverlays}
        selectedId={selectedOverlayId}
        onSelect={onSelectOverlay}
        onChange={onChangeOverlays}
        zoom={zoom}
      />
    </div>
  );
}

export const ACCENT_KEYS: AccentKey[] = ["coral", "amber", "teal", "indigo", "plum", "olive", "sky", "green", "blue", "white", "cream", "light", "slate", "navy"];

export const SECTION_KINDS: SectionKind[] = ["bullets", "pills", "checklist", "stats", "flags", "bars", "donut", "tools", "table"];

export const CAROUSEL_LAYOUTS: CarouselLayout[] = ["text", "cover", "stat", "quote", "bullets", "comparison"];
