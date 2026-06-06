import { useEffect, useRef, useState } from "react";
import type { Design } from "@/lib/designer-queries";
import { fillToCss } from "@/lib/designer-utils";
import type { DesignElement } from "@/lib/designer-queries";
import { CheatSheetCanvas, CarouselCanvas, SquareCanvas } from "@/components/designer/linkedin/LinkedInCanvas";

/**
 * Auto-scaling, read-only thumbnail of a Design's first slide. Measures its
 * own width with ResizeObserver and applies a CSS `transform: scale(...)` so
 * the original-resolution canvas (e.g. 1080×1350) fits cleanly into any card.
 *
 * Falls back to a placeholder background if the design has no elements yet.
 */
export default function DesignThumb({ design, className = "" }: { design: Design; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  // Only mount the (heavy) live canvas once the card is near the viewport.
  // Rendering every design's full canvas at once is what made the grid crawl.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0 && design.width > 0) setScale(w / design.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [design.width]);

  const td = (design as any).template_data;
  const isLinkedIn = design.kind && design.kind !== "canvas" && td;

  // LinkedIn template kinds render via their dedicated canvas components.
  if (isLinkedIn) {
    return (
      <div
        ref={wrapRef}
        className={`relative w-full overflow-hidden bg-muted ${className}`}
        style={{ aspectRatio: `${design.width} / ${design.height}` }}
      >
        {visible && (
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: design.width, height: design.height, transform: `scale(${scale})` }}
          >
            {design.kind === "linkedin_cheatsheet" && <CheatSheetCanvas data={td} idForExport={`thumb-${design.id}`} />}
            {design.kind === "linkedin_carousel" && <CarouselCanvas data={td} idForExport={`thumb-${design.id}`} />}
            {design.kind === "linkedin_square" && <SquareCanvas data={td} idForExport={`thumb-${design.id}`} />}
          </div>
        )}
      </div>
    );
  }

  const slide = Array.isArray(design.slides) ? design.slides[0] : undefined;
  const elements = Array.isArray(slide?.elements) ? slide!.elements : [];
  if (!slide) {
    return <div ref={wrapRef} className={`w-full h-full bg-muted ${className}`} />;
  }

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ aspectRatio: `${design.width} / ${design.height}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: design.width,
          height: design.height,
          background: fillToCss(slide.bg),
          transform: `scale(${scale})`,
        }}
      >
        {visible && elements.map((el) => (el.hidden ? null : <ElementView key={el.id} el={el} />))}
      </div>
    </div>
  );
}

function ElementView({ el }: { el: DesignElement }) {
  const base: React.CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: typeof (el as any).opacity === "number" ? (el as any).opacity : 1,
    pointerEvents: "none",
  };
  switch (el.type) {
    case "text": {
      const t = el as any;
      return (
        <div style={{
          ...base,
          color: t.color,
          fontSize: t.size,
          fontWeight: t.weight,
          textAlign: t.align,
          lineHeight: t.lineHeight ?? 1.2,
          letterSpacing: t.letterSpacing,
          fontStyle: t.italic ? "italic" : undefined,
          textDecoration: t.underline ? "underline" : undefined,
          fontFamily: t.font === "heading" ? "Inter, sans-serif" : "Inter, system-ui, sans-serif",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
        }}>
          {t.text}
        </div>
      );
    }
    case "image": {
      const i = el as any;
      const filters = [
        i.brightness != null ? `brightness(${i.brightness})` : "",
        i.contrast != null ? `contrast(${i.contrast})` : "",
        i.saturation != null ? `saturate(${i.saturation})` : "",
        i.blur ? `blur(${i.blur}px)` : "",
      ].filter(Boolean).join(" ");
      return (
        <img src={i.src} alt="" loading="lazy" style={{
          ...base,
          objectFit: i.fit ?? "cover",
          borderRadius: i.radius ?? 0,
          filter: filters || undefined,
        }} />
      );
    }
    case "shape": {
      const s = el as any;
      if (s.shape === "triangle") {
        return (
          <div style={base}>
            <div style={{
              width: 0, height: 0,
              borderLeft: `${el.w / 2}px solid transparent`,
              borderRight: `${el.w / 2}px solid transparent`,
              borderBottom: `${el.h}px solid ${typeof s.fill === "string" ? s.fill : "#000"}`,
            }} />
          </div>
        );
      }
      return (
        <div style={{
          ...base,
          background: fillToCss(s.fill),
          borderRadius: s.shape === "circle" ? "50%" : s.radius ?? 0,
          border: s.stroke ? `${s.strokeWidth ?? 1}px solid ${s.stroke}` : undefined,
        }} />
      );
    }
    case "line": {
      const l = el as any;
      return <div style={{ ...base, height: l.strokeWidth, background: l.stroke }} />;
    }
    case "icon":
    case "logo":
      return <div style={{ ...base, background: "rgba(127,127,127,0.18)", borderRadius: 4 }} />;
    default:
      return null;
  }
}
