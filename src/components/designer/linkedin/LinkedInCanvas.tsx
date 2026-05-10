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
};

export type CarouselSlide = {
  eyebrow?: string;
  title: string;
  body?: string;
  closer?: string;
  accent?: AccentKey;
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
};

function pickPhoto(data: any): string {
  if (data.avatarUrl) return data.avatarUrl;
  if (data.photoKey && ACCENT_PHOTO[data.photoKey]) return ACCENT_PHOTO[data.photoKey];
  const accent: AccentKey | undefined = data.sections?.[0]?.accent || data.slides?.[0]?.accent || "coral";
  return (accent && ACCENT_PHOTO[accent]) || ACCENT_PHOTO.coral;
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
  const rows = (items || []).map((it) => {
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
  const rows = (items || []).map((it) => {
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
          {(items || []).map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}

      {kind === "pills" && (
        <div className={`cnv-pills${(items || []).length <= 3 ? " single" : ""}`}>
          {(items || []).map((it, i) => <div key={i} className="pill">{it}</div>)}
        </div>
      )}

      {kind === "checklist" && (
        <ol className="cnv-checklist">
          {(items || []).map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      )}

      {kind === "stats" && (
        <div className="cnv-stats">
          {(items || []).map((it, i) => {
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
          {(items || []).map((it, i) => (
            <li key={i}><span className="x">✗</span><span>{it}</span></li>
          ))}
        </ul>
      )}

      {kind === "bars" && <BarChart items={items} />}
      {kind === "donut" && <DonutChart items={items} />}

      {kind === "tools" && (
        <div className="cnv-tools">
          {(items || []).map((it, i) => <ToolChip key={i} raw={it} />)}
        </div>
      )}

      {kind === "table" && table && (
        <table className="cnv-table">
          <thead>
            <tr>{(table.headers || []).map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {(table.rows || []).map((row, r) => (
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
  return (
    <div className="canvas" data-format="cheatsheet" id={idForExport}>
      <TopChrome typeLabel={data.typeLabel || "Cheat Sheet"} />
      <div className="cnv-hero">
        {data.eyebrow && <div className="eyebrow">{data.eyebrow}</div>}
        <h1>{data.title}</h1>
        {data.subtitle && <div className="sub">{data.subtitle}</div>}
      </div>
      <div className="cnv-divider" />
      <div className="cnv-grid">
        {(data.sections || []).map((section, idx) => {
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
        overlays={data.overlays ?? []}
        editable={editableOverlays}
        selectedId={selectedOverlayId}
        onSelect={onSelectOverlay}
        onChange={onChangeOverlays}
        zoom={zoom}
      />
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
  const slide = data.slides?.[slideIndex] || data.slides?.[0] || ({ title: "" } as CarouselSlide);
  const total = data.slides?.length ?? 0;
  return (
    <div className="canvas" data-format="carousel" id={idForExport}>
      <TopChrome typeLabel={data.typeLabel || "Carousel"} />
      <div className="carousel-body">
        {slide.eyebrow && <span className="carousel-eyebrow">{slide.eyebrow}</span>}
        <h1 className="carousel-title">{slide.title}</h1>
        {slide.body && <p>{slide.body}</p>}
      </div>
      <div className="cnv-footer cnv-footer-sig">
        <Signature data={data} size="md" />
        <div className="cnv-footer-right">
          {slide.closer && <div className="closer">{slide.closer}</div>}
          <div className="attribution">{`${String(slideIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</div>
        </div>
      </div>
      <OverlayLayer
        overlays={data.overlays?.[slideIndex] ?? []}
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
    <div className="canvas" data-format="square" id={idForExport}>
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
        overlays={data.overlays ?? []}
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
