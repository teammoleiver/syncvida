import type {
  Design, DesignElement, Fill, Gradient, IconElement, ImageElement,
  LineElement, LogoElement, ShapeElement, Slide, TextElement, BrandKit,
} from "./designer-queries";

export function newId() { return crypto.randomUUID(); }

export function clone<T>(v: T): T { return structuredClone(v); }

// ── Bounding box helpers ──
export type Box = { x: number; y: number; w: number; h: number };
export const bbox = (e: DesignElement): Box => ({ x: e.x, y: e.y, w: e.w, h: e.h });
export const right = (e: DesignElement) => e.x + e.w;
export const bottom = (e: DesignElement) => e.y + e.h;
export const cx = (e: DesignElement) => e.x + e.w / 2;
export const cy = (e: DesignElement) => e.y + e.h / 2;

export function boundsOf(els: DesignElement[]): Box | null {
  if (!els.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of els) {
    x1 = Math.min(x1, e.x);
    y1 = Math.min(y1, e.y);
    x2 = Math.max(x2, e.x + e.w);
    y2 = Math.max(y2, e.y + e.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ── Snapping ──
// During a drag, we snap by adjusting (dx, dy) so that the dragged box's edge/center
// aligns with another element's edge/center or with the canvas edges/center.
export type SnapGuide = {
  axis: "x" | "y";
  position: number; // canvas-space coord
  start: number;
  end: number;
};

export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] };

export function snapMove(
  current: Box, dx: number, dy: number,
  others: Box[], canvas: { w: number; h: number }, threshold = 6,
): SnapResult {
  const moved: Box = { x: current.x + dx, y: current.y + dy, w: current.w, h: current.h };
  const xCandidates: number[] = [
    0, canvas.w / 2, canvas.w,
    ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w]),
  ];
  const yCandidates: number[] = [
    0, canvas.h / 2, canvas.h,
    ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h]),
  ];

  let bestX: { delta: number; pos: number; via: "left" | "center" | "right" } | null = null;
  let bestY: { delta: number; pos: number; via: "top" | "center" | "bottom" } | null = null;
  for (const t of xCandidates) {
    const opts: [number, "left" | "center" | "right"][] = [
      [moved.x - t, "left"],
      [moved.x + moved.w / 2 - t, "center"],
      [moved.x + moved.w - t, "right"],
    ];
    for (const [delta, via] of opts) {
      if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
        bestX = { delta, pos: t, via };
      }
    }
  }
  for (const t of yCandidates) {
    const opts: [number, "top" | "center" | "bottom"][] = [
      [moved.y - t, "top"],
      [moved.y + moved.h / 2 - t, "center"],
      [moved.y + moved.h - t, "bottom"],
    ];
    for (const [delta, via] of opts) {
      if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
        bestY = { delta, pos: t, via };
      }
    }
  }

  let outDx = dx, outDy = dy;
  const guides: SnapGuide[] = [];
  if (bestX) {
    outDx -= bestX.delta;
    const finalBox = { ...moved, x: moved.x - bestX.delta };
    const mn = Math.min(finalBox.y, ...others.map((o) => o.y));
    const mx = Math.max(finalBox.y + finalBox.h, ...others.map((o) => o.y + o.h));
    guides.push({ axis: "x", position: bestX.pos, start: mn, end: mx });
  }
  if (bestY) {
    outDy -= bestY.delta;
    const finalBox = { ...moved, y: moved.y - bestY.delta };
    const mn = Math.min(finalBox.x, ...others.map((o) => o.x));
    const mx = Math.max(finalBox.x + finalBox.w, ...others.map((o) => o.x + o.w));
    guides.push({ axis: "y", position: bestY.pos, start: mn, end: mx });
  }
  return { dx: outDx, dy: outDy, guides };
}

// ── Fill rendering ──
export function fillToCss(fill: Fill | undefined): string {
  if (!fill) return "transparent";
  if (typeof fill === "string") return fill;
  return gradientToCss(fill);
}
export function gradientToCss(g: Gradient): string {
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
  if (g.kind === "radial") return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${g.angle ?? 180}deg, ${stops})`;
}

// ── Element factories ──
export function makeText(brand: BrandKit | null, partial?: Partial<TextElement>): TextElement {
  return {
    id: newId(), type: "text",
    x: 80, y: 80, w: 920, h: 220,
    text: "Your headline", font: "heading",
    size: 96, weight: 800,
    color: brand?.colors.text ?? "#0B0F0E",
    align: "left", lineHeight: 1.1, letterSpacing: 0,
    ...partial,
  };
}
export function makeShape(brand: BrandKit | null, shape: ShapeElement["shape"], partial?: Partial<ShapeElement>): ShapeElement {
  return {
    id: newId(), type: "shape", shape,
    x: 100, y: 100, w: 320, h: 320,
    fill: brand?.colors.primary ?? "#1D9E75",
    radius: shape === "rect" ? 24 : shape === "circle" ? 999 : 0,
    ...partial,
  };
}
export function makeLine(brand: BrandKit | null, partial?: Partial<LineElement>): LineElement {
  return {
    id: newId(), type: "line",
    x: 80, y: 200, w: 600, h: 6,
    stroke: brand?.colors.primary ?? "#1D9E75", strokeWidth: 6,
    arrowEnd: false, arrowStart: false,
    ...partial,
  };
}
export function makeIcon(brand: BrandKit | null, name: string, partial?: Partial<IconElement>): IconElement {
  return {
    id: newId(), type: "icon", name,
    x: 80, y: 80, w: 140, h: 140,
    color: brand?.colors.primary ?? "#0B0F0E", strokeWidth: 1.75,
    ...partial,
  };
}
export function makeImage(src: string, assetId?: string, partial?: Partial<ImageElement>): ImageElement {
  return {
    id: newId(), type: "image", src, assetId,
    x: 80, y: 80, w: 920, h: 920,
    fit: "cover", radius: 16,
    ...partial,
  };
}
export function makeLogo(partial?: Partial<LogoElement>): LogoElement {
  return {
    id: newId(), type: "logo", variant: "light",
    x: 80, y: 1180, w: 200, h: 80,
    ...partial,
  };
}

// ── Defaults / sizes ──
export const PLATFORM_SIZES: Record<string, { single: { w: number; h: number; label: string }[]; carousel: { w: number; h: number; label: string }[] }> = {
  linkedin: {
    single: [{ w: 1200, h: 628, label: "LinkedIn post (1200×628)" }, { w: 1080, h: 1080, label: "LinkedIn square" }],
    carousel: [{ w: 1080, h: 1350, label: "LinkedIn portrait carousel" }, { w: 1080, h: 1080, label: "LinkedIn square carousel" }],
  },
  instagram: {
    single: [{ w: 1080, h: 1080, label: "Instagram square" }, { w: 1080, h: 1350, label: "Instagram portrait" }, { w: 1080, h: 1920, label: "Instagram story" }],
    carousel: [{ w: 1080, h: 1350, label: "Instagram carousel portrait" }, { w: 1080, h: 1080, label: "Instagram carousel square" }],
  },
  facebook: {
    single: [{ w: 1200, h: 630, label: "Facebook post" }, { w: 1080, h: 1080, label: "Facebook square" }],
    carousel: [{ w: 1080, h: 1080, label: "Facebook carousel" }],
  },
  x: {
    single: [{ w: 1600, h: 900, label: "X post (16:9)" }, { w: 1200, h: 1200, label: "X square" }],
    carousel: [{ w: 1200, h: 1200, label: "X carousel" }],
  },
  multi: {
    single: [{ w: 1080, h: 1080, label: "Square" }],
    carousel: [{ w: 1080, h: 1080, label: "Square carousel" }],
  },
};

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── Patch operations from AI chat ──
export type DesignPatch =
  | { op: "add"; slideIndex: number; element: DesignElement }
  | { op: "update"; slideIndex: number; id: string; props: Partial<DesignElement> }
  | { op: "remove"; slideIndex: number; id: string }
  | { op: "set_bg"; slideIndex: number; bg: Fill }
  | { op: "add_slide"; index?: number; slide: Slide }
  | { op: "remove_slide"; index: number }
  | { op: "set_title"; title: string };

export function applyPatch(d: Design, patch: DesignPatch): Design {
  const next = clone(d);
  if (patch.op === "set_title") { next.title = patch.title; return next; }
  if (patch.op === "add_slide") {
    const i = patch.index ?? next.slides.length;
    next.slides.splice(i, 0, patch.slide);
    return next;
  }
  if (patch.op === "remove_slide") {
    next.slides.splice(patch.index, 1);
    if (next.slides.length === 0) next.slides.push({ id: newId(), bg: "#FFFFFF", elements: [] });
    return next;
  }
  const s = next.slides[patch.slideIndex];
  if (!s) return next;
  if (patch.op === "set_bg") { s.bg = patch.bg; return next; }
  if (patch.op === "add") { s.elements.push(patch.element); return next; }
  if (patch.op === "remove") { s.elements = s.elements.filter((e) => e.id !== patch.id); return next; }
  if (patch.op === "update") {
    s.elements = s.elements.map((e) => e.id === patch.id ? ({ ...e, ...patch.props } as DesignElement) : e);
    return next;
  }
  return next;
}

export function applyPatches(d: Design, patches: DesignPatch[]): Design {
  return patches.reduce((acc, p) => applyPatch(acc, p), d);
}

// ── Slide thumbnail (very rough; real one comes from html-to-image on save) ──
export function emptySlide(bg: Fill = "#FFFFFF"): Slide {
  return { id: newId(), bg, elements: [] };
}

// ── Export ergonomics ──
export function safeFilename(s: string) { return s.replace(/[^a-z0-9-_]+/gi, "_"); }

/**
 * Programmatically chroma-keys solid white backgrounds of brand logos on-the-fly.
 * Scans all canvas pixel buffers and switches close-to-white pixels (R/G/B > 240) to transparent.
 */
export async function removeWhiteBackground(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(imageUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Strip pixels that are very close to pure white
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Threshold of 240 out of 255
          if (r > 240 && g > 240 && b > 240) {
            data[i + 3] = 0; // Set alpha to 0 (fully transparent)
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(imageUrl);
      }
    };
    img.onerror = () => {
      resolve(imageUrl);
    };
    img.src = imageUrl;
  });
}

