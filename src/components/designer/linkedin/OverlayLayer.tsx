import { useRef } from "react";
import type { Overlay } from "./LinkedInCanvas";

/**
 * Renders free-position overlays (image / text / shape) on top of a LinkedIn
 * template canvas. Supports click-to-select, drag-to-move, and corner resize.
 *
 * The canvas is rendered inside a `transform: scale(zoom)` wrapper, so all
 * mouse-delta math divides by `zoom` to convert screen pixels back into
 * canvas pixels.
 */
export default function OverlayLayer({
  overlays,
  onChange,
  selectedId,
  onSelect,
  zoom,
  editable = true,
}: {
  overlays: Overlay[];
  onChange?: (next: Overlay[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  zoom: number;
  /** When false (e.g. for thumbnails), overlays render but don't accept events. */
  editable?: boolean;
}) {
  const safeOverlays = Array.isArray(overlays) ? overlays : [];
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; mode: "move" | "resize" } | null>(null);

  function startDrag(e: React.MouseEvent, o: Overlay, mode: "move" | "resize") {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(o.id);
    dragRef.current = { id: o.id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, mode };
    if (mode === "resize") {
      // store original w/h so resize is relative to start
      (dragRef.current as any).ow = o.w;
      (dragRef.current as any).oh = o.h;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onMove(e: MouseEvent) {
    const d = dragRef.current;
    if (!d || !onChange) return;
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    const next = safeOverlays.map((o) => {
      if (o.id !== d.id) return o;
      if (d.mode === "move") return { ...o, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) };
      const ow = (d as any).ow as number;
      const oh = (d as any).oh as number;
      return { ...o, w: Math.max(20, Math.round(ow + dx)), h: Math.max(20, Math.round(oh + dy)) };
    });
    onChange(next);
  }

  function onUp() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  return (
    // The root never captures pointer events — only the individual overlay
    // items do. This lets clicks fall through empty space to underlying canvas
    // content (e.g. the face-photo avatar, which opens the asset picker).
    <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}>
      {safeOverlays.map((o) => {
        const selected = o.id === selectedId;
        const baseStyle: React.CSSProperties = {
          position: "absolute",
          left: o.x,
          top: o.y,
          width: o.w,
          height: o.h,
          cursor: editable ? "move" : "default",
          outline: selected ? "2px solid #4FA8E8" : "none",
          outlineOffset: 2,
          userSelect: "none",
          pointerEvents: editable ? "auto" : "none",
        };
        const inner = renderOverlayBody(o);
        return (
          <div key={o.id} style={baseStyle} onMouseDown={(e) => startDrag(e, o, "move")}>
            {inner}
            {selected && editable && (
              <div
                onMouseDown={(e) => startDrag(e, o, "resize")}
                style={{
                  position: "absolute",
                  right: -6, bottom: -6,
                  width: 14, height: 14,
                  background: "#4FA8E8",
                  border: "2px solid #0B0F1A",
                  borderRadius: 3,
                  cursor: "nwse-resize",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderOverlayBody(o: Overlay): React.ReactNode {
  if (o.type === "image") {
    return (
      <img
        src={o.src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: o.objectFit ?? "contain",
          borderRadius: o.radius ?? 0,
          pointerEvents: "none",
        }}
      />
    );
  }
  if (o.type === "shape") {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        background: o.fill,
        borderRadius: o.shape === "circle" ? "50%" : o.radius ?? 0,
        border: o.stroke ? `${o.strokeWidth ?? 1}px solid ${o.stroke}` : undefined,
        pointerEvents: "none",
      }} />
    );
  }
  // text
  return (
    <div style={{
      width: "100%",
      height: "100%",
      color: o.color ?? "#F5F1E8",
      fontSize: o.fontSize,
      fontWeight: o.fontWeight ?? 600,
      textAlign: o.align ?? "left",
      fontStyle: o.italic ? "italic" : undefined,
      lineHeight: o.lineHeight ?? 1.2,
      letterSpacing: o.letterSpacing,
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      pointerEvents: "none",
    }}>
      {o.text}
    </div>
  );
}
