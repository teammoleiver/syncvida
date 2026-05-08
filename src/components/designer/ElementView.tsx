import * as Lucide from "lucide-react";
import type { BrandKit, DesignElement, MaskShape } from "@/lib/designer-queries";
import { fillToCss } from "@/lib/designer-utils";

const MASK_CLIP: Record<Exclude<MaskShape, "none" | "rounded">, string> = {
  circle: "circle(50% at 50% 50%)",
  squircle: "path('M 50,0 C 80,0 100,20 100,50 C 100,80 80,100 50,100 C 20,100 0,80 0,50 C 0,20 20,0 50,0 Z')",
  hexagon: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)",
  blob: "path('M 50,5 C 80,5 95,25 95,55 C 95,82 75,98 48,95 C 22,92 5,72 5,45 C 5,20 22,5 50,5 Z')",
};

export function ElementView({ el, brand, isExport }: { el: DesignElement; brand: BrandKit | null; isExport?: boolean }) {
  const filter = el.shadow ? `drop-shadow(${el.shadow.x}px ${el.shadow.y}px ${el.shadow.blur}px ${el.shadow.color})` : undefined;
  const opacity = el.opacity ?? 1;
  const baseStyle: React.CSSProperties = {
    width: "100%", height: "100%", filter, opacity,
  };
  if (el.type === "text") {
    const family = el.font === "heading" ? brand?.fonts.heading : el.font === "body" ? brand?.fonts.body : (el.font ?? brand?.fonts.body);
    return (
      <div style={{
        ...baseStyle, color: el.color,
        fontFamily: `"${family ?? "Inter"}", system-ui, sans-serif`,
        fontSize: el.size, fontWeight: el.weight, textAlign: el.align,
        lineHeight: el.lineHeight ?? 1.1,
        letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
        fontStyle: el.italic ? "italic" : undefined,
        textDecoration: el.underline ? "underline" : undefined,
        whiteSpace: "pre-wrap", overflow: "hidden", padding: 4,
      }}>
        {el.text}
      </div>
    );
  }
  if (el.type === "image") {
    const adjFilter: string[] = [];
    if (el.brightness !== undefined && el.brightness !== 1) adjFilter.push(`brightness(${el.brightness})`);
    if (el.contrast !== undefined && el.contrast !== 1) adjFilter.push(`contrast(${el.contrast})`);
    if (el.saturation !== undefined && el.saturation !== 1) adjFilter.push(`saturate(${el.saturation})`);
    if (el.blur && el.blur > 0) adjFilter.push(`blur(${el.blur}px)`);
    const mask = el.mask && el.mask !== "none" ? el.mask : null;
    const wrapStyle: React.CSSProperties = {
      ...baseStyle,
      borderRadius: mask === "rounded" ? (el.radius ?? 24) : (el.radius ?? 0),
      overflow: "hidden",
      ...(mask && mask !== "rounded" ? { clipPath: MASK_CLIP[mask] } : {}),
    };
    return (
      <div style={wrapStyle}>
        <img src={el.src} alt="" draggable={false}
          crossOrigin={isExport ? "anonymous" : undefined}
          style={{
            width: "100%", height: "100%", objectFit: el.fit,
            filter: adjFilter.length ? adjFilter.join(" ") : undefined,
            pointerEvents: "none",
          }} />
      </div>
    );
  }
  if (el.type === "shape") {
    const radius = el.shape === "circle" ? "50%" : el.shape === "triangle" ? 0 : (el.radius ?? 0);
    if (el.shape === "triangle") {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={baseStyle}>
          <polygon points="50,5 95,95 5,95" fill={typeof el.fill === "string" ? el.fill : "#000"}
            stroke={el.stroke} strokeWidth={el.strokeWidth ?? 0} />
        </svg>
      );
    }
    return (
      <div style={{
        ...baseStyle,
        background: fillToCss(el.fill),
        borderRadius: radius,
        border: el.stroke ? `${el.strokeWidth ?? 1}px solid ${el.stroke}` : undefined,
      }} />
    );
  }
  if (el.type === "line") {
    return (
      <svg viewBox={`0 0 ${Math.max(1, el.w)} ${Math.max(1, el.h)}`} preserveAspectRatio="none" style={baseStyle}>
        <defs>
          <marker id={`ah-${el.id}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={el.stroke} />
          </marker>
        </defs>
        <line x1="0" y1={el.h / 2} x2={el.w} y2={el.h / 2}
          stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round"
          markerStart={el.arrowStart ? `url(#ah-${el.id})` : undefined}
          markerEnd={el.arrowEnd ? `url(#ah-${el.id})` : undefined} />
      </svg>
    );
  }
  if (el.type === "icon") {
    const Icon = (Lucide as any)[el.name] ?? Lucide.HelpCircle;
    return (
      <div style={baseStyle}>
        <Icon style={{ width: "100%", height: "100%" }} color={el.color} strokeWidth={el.strokeWidth ?? 1.75} />
      </div>
    );
  }
  if (el.type === "logo") {
    const url = el.variant === "dark" ? brand?.logo_dark_url : brand?.logo_light_url;
    return url
      ? <img src={url} alt="logo" draggable={false}
          crossOrigin={isExport ? "anonymous" : undefined}
          style={{ ...baseStyle, objectFit: "contain", pointerEvents: "none" }} />
      : <div style={{ ...baseStyle, border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>logo</div>;
  }
  return null;
}
