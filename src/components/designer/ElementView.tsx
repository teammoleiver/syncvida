import * as Lucide from "lucide-react";
import type { BrandKit, DesignElement } from "@/lib/designer-queries";
import { fillToCss } from "@/lib/designer-utils";

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
    return (
      <img src={el.src} alt="" draggable={false}
        crossOrigin={isExport ? "anonymous" : undefined}
        style={{
          ...baseStyle, objectFit: el.fit, borderRadius: el.radius ?? 0,
          pointerEvents: "none",
        }} />
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
