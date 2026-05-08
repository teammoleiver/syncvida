import { useEffect, useRef, useState } from "react";
import type { BrandKit, Design, DesignElement, Slide } from "@/lib/designer-queries";
import { ElementView } from "./ElementView";
import { bbox, fillToCss, snapMove, type Box, type SnapGuide } from "@/lib/designer-utils";

type DragMode =
  | { kind: "move"; ids: string[]; startBoxes: Map<string, Box>; startX: number; startY: number }
  | { kind: "resize"; id: string; handle: ResizeHandle; startBox: Box; startX: number; startY: number }
  | { kind: "rotate"; id: string; cx: number; cy: number; startAngle: number; startRotation: number }
  | { kind: "marquee"; startX: number; startY: number; x: number; y: number };

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function Canvas({
  design, slide, brand,
  selectedIds, onSelectionChange,
  onLiveUpdate, onCommit,
  zoom, onZoom,
  exportMode = false,
  pageNumber,
}: {
  design: Design;
  slide: Slide;
  brand: BrandKit | null;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onLiveUpdate: (updater: (slide: Slide) => Slide) => void;
  onCommit: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  exportMode?: boolean;
  pageNumber?: { current: number; total: number; color: string };
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  // wheel = zoom on Ctrl/Cmd, pan otherwise
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const next = Math.max(0.05, Math.min(4, zoom * (1 - e.deltaY * 0.0015)));
        onZoom(next);
      }
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [zoom, onZoom]);

  const onPointerDownCanvas = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    if (exportMode) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) onSelectionChange(new Set());
    setDrag({ kind: "marquee", startX: x, startY: y, x, y });
  };

  function startMove(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const el = slide.elements.find((x) => x.id === id);
    if (!el || el.locked) return;

    // Group expansion: clicking any element in a group selects the whole group,
    // unless Alt is held (then it acts on just the clicked element).
    const expandToGroup = (clickedId: string): string[] => {
      const clicked = slide.elements.find((x) => x.id === clickedId);
      if (!clicked?.groupId || e.altKey) return [clickedId];
      return slide.elements.filter((x) => x.groupId === clicked.groupId).map((x) => x.id);
    };

    let ids: string[];
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIds);
      const expanded = expandToGroup(id);
      const allInside = expanded.every((x) => next.has(x));
      if (allInside) expanded.forEach((x) => next.delete(x)); else expanded.forEach((x) => next.add(x));
      onSelectionChange(next);
      ids = [...next];
    } else if (selectedIds.has(id)) {
      ids = [...selectedIds];
    } else {
      const expanded = expandToGroup(id);
      onSelectionChange(new Set(expanded));
      ids = expanded;
    }
    if (!ids.length) return;
    const startBoxes = new Map<string, Box>();
    for (const k of ids) {
      const x = slide.elements.find((y) => y.id === k);
      if (x && !x.locked) startBoxes.set(k, bbox(x));
    }
    setDrag({ kind: "move", ids: [...startBoxes.keys()], startBoxes, startX: e.clientX, startY: e.clientY });
  }

  function startResize(e: React.PointerEvent, id: string, handle: ResizeHandle) {
    e.stopPropagation();
    const el = slide.elements.find((x) => x.id === id);
    if (!el || el.locked) return;
    setDrag({ kind: "resize", id, handle, startBox: bbox(el), startX: e.clientX, startY: e.clientY });
  }

  function startRotate(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const el = slide.elements.find((x) => x.id === id);
    if (!el || el.locked) return;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = (e.clientX - rect.left) / zoom;
    const py = (e.clientY - rect.top) / zoom;
    const startAngle = Math.atan2(py - cy, px - cx);
    setDrag({ kind: "rotate", id, cx, cy, startAngle, startRotation: el.rotation ?? 0 });
  }

  // Pointer move/up while dragging
  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (drag.kind === "move") {
        const dxRaw = (ev.clientX - drag.startX) / zoom;
        const dyRaw = (ev.clientY - drag.startY) / zoom;
        // Snap based on the bounding box of all selected elements
        const sel = drag.ids.map((id) => drag.startBoxes.get(id)).filter(Boolean) as Box[];
        const x1 = Math.min(...sel.map((b) => b.x));
        const y1 = Math.min(...sel.map((b) => b.y));
        const x2 = Math.max(...sel.map((b) => b.x + b.w));
        const y2 = Math.max(...sel.map((b) => b.y + b.h));
        const groupBox: Box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        const others = slide.elements.filter((e) => !drag.ids.includes(e.id) && !e.hidden).map(bbox);
        const snap = snapMove(groupBox, dxRaw, dyRaw, others, { w: design.width, h: design.height });
        setGuides(snap.guides);
        onLiveUpdate((s) => ({
          ...s,
          elements: s.elements.map((e) => {
            const b = drag.startBoxes.get(e.id);
            return b ? { ...e, x: b.x + snap.dx, y: b.y + snap.dy } : e;
          }),
        }));
      } else if (drag.kind === "resize") {
        const dx = (ev.clientX - drag.startX) / zoom;
        const dy = (ev.clientY - drag.startY) / zoom;
        const b = drag.startBox;
        const h = drag.handle;
        let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
        if (h.includes("e")) nw = Math.max(20, b.w + dx);
        if (h.includes("s")) nh = Math.max(20, b.h + dy);
        if (h.includes("w")) { nw = Math.max(20, b.w - dx); nx = b.x + (b.w - nw); }
        if (h.includes("n")) { nh = Math.max(20, b.h - dy); ny = b.y + (b.h - nh); }
        if (ev.shiftKey) {
          const ratio = b.w / b.h;
          if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
        }
        onLiveUpdate((s) => ({
          ...s,
          elements: s.elements.map((e) => e.id === drag.id ? { ...e, x: nx, y: ny, w: nw, h: nh } : e),
        }));
      } else if (drag.kind === "rotate" && rect) {
        const px = (ev.clientX - rect.left) / zoom;
        const py = (ev.clientY - rect.top) / zoom;
        const a = Math.atan2(py - drag.cy, px - drag.cx);
        let deg = (drag.startRotation + (a - drag.startAngle) * 180 / Math.PI);
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        onLiveUpdate((s) => ({
          ...s,
          elements: s.elements.map((e) => e.id === drag.id ? { ...e, rotation: deg } : e),
        }));
      } else if (drag.kind === "marquee" && rect) {
        const x = (ev.clientX - rect.left) / zoom;
        const y = (ev.clientY - rect.top) / zoom;
        setDrag({ ...drag, x, y });
      }
    };
    const onUp = () => {
      if (drag.kind === "marquee") {
        const x1 = Math.min(drag.startX, drag.x), y1 = Math.min(drag.startY, drag.y);
        const x2 = Math.max(drag.startX, drag.x), y2 = Math.max(drag.startY, drag.y);
        const hits = new Set<string>();
        for (const e of slide.elements) {
          if (e.hidden || e.locked) continue;
          if (e.x + e.w >= x1 && e.x <= x2 && e.y + e.h >= y1 && e.y <= y2) hits.add(e.id);
        }
        if (hits.size) onSelectionChange(hits);
      } else {
        onCommit();
      }
      setGuides([]);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, zoom, slide, design.width, design.height, onLiveUpdate, onCommit, onSelectionChange]);

  return (
    <div ref={wrapRef} className="relative" style={{ width: design.width * zoom, height: design.height * zoom }}>
      <div id="design-canvas-export" className="absolute origin-top-left shadow-xl"
        style={{
          width: design.width, height: design.height,
          background: fillToCss(slide.bg as any),
          transform: `scale(${zoom})`,
          overflow: "hidden",
          left: 0, top: 0,
        }}
        onPointerDown={onPointerDownCanvas}>
        {slide.elements.map((el) => {
          if (el.hidden) return null;
          return (
            <ElementWrapper key={el.id} el={el} brand={brand}
              selected={selectedIds.has(el.id)}
              exportMode={exportMode}
              onPointerDown={(e) => startMove(e, el.id)}
              onResizeDown={(e, h) => startResize(e, el.id, h)}
              onRotateDown={(e) => startRotate(e, el.id)}
            />
          );
        })}
        {/* Snap guides */}
        {guides.map((g, i) => (
          <div key={i} style={{
            position: "absolute",
            background: "magenta", opacity: 0.9,
            ...(g.axis === "x"
              ? { left: g.position - 0.5, top: Math.min(g.start, g.end), width: 1, height: Math.abs(g.end - g.start) }
              : { top: g.position - 0.5, left: Math.min(g.start, g.end), height: 1, width: Math.abs(g.end - g.start) }),
          }} />
        ))}
        {/* Auto page number (rendered inside the export node so it shows up in PNG/PDF) */}
        {pageNumber && (
          <div style={{
            position: "absolute",
            right: 32, bottom: 24,
            color: pageNumber.color,
            fontFamily: `"${brand?.fonts.body ?? "Inter"}", system-ui, sans-serif`,
            fontSize: 22, fontWeight: 600, letterSpacing: 0.5, opacity: 0.7,
            pointerEvents: "none",
          }}>
            {pageNumber.current} / {pageNumber.total}
          </div>
        )}
        {/* Marquee */}
        {drag?.kind === "marquee" && (
          <div style={{
            position: "absolute",
            left: Math.min(drag.startX, drag.x),
            top: Math.min(drag.startY, drag.y),
            width: Math.abs(drag.x - drag.startX),
            height: Math.abs(drag.y - drag.startY),
            border: "1px dashed hsl(var(--primary))",
            background: "hsl(var(--primary) / 0.08)",
          }} />
        )}
      </div>
    </div>
  );
}

function ElementWrapper({ el, brand, selected, exportMode, onPointerDown, onResizeDown, onRotateDown }: {
  el: DesignElement;
  brand: BrandKit | null;
  selected: boolean;
  exportMode?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onResizeDown: (e: React.PointerEvent, h: ResizeHandle) => void;
  onRotateDown: (e: React.PointerEvent) => void;
}) {
  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        outline: !exportMode && selected ? "2px solid hsl(var(--primary))" : undefined,
        outlineOffset: 2, cursor: el.locked ? "not-allowed" : "move",
      }}>
      <ElementView el={el} brand={brand} isExport={exportMode} />
      {!exportMode && selected && !el.locked && (
        <>
          {handles.map((h) => (
            <div key={h} onPointerDown={(e) => onResizeDown(e, h)}
              style={{
                position: "absolute", width: 10, height: 10, background: "hsl(var(--primary))", borderRadius: 2, border: "1px solid white",
                cursor: handleCursor(h),
                ...handlePosition(h),
              }} />
          ))}
          <div onPointerDown={onRotateDown}
            style={{
              position: "absolute", left: "50%", top: -28, width: 14, height: 14, background: "white",
              border: "2px solid hsl(var(--primary))", borderRadius: 999, transform: "translateX(-50%)", cursor: "grab",
            }} />
        </>
      )}
    </div>
  );
}

function handlePosition(h: ResizeHandle): React.CSSProperties {
  const off = -6;
  const c: React.CSSProperties = {};
  if (h.includes("n")) c.top = off; if (h.includes("s")) c.bottom = off;
  if (h.includes("w")) c.left = off; if (h.includes("e")) c.right = off;
  if (h === "n" || h === "s") { c.left = "50%"; c.transform = "translateX(-50%)"; }
  if (h === "e" || h === "w") { c.top = "50%"; c.transform = "translateY(-50%)"; }
  return c;
}
function handleCursor(h: ResizeHandle): string {
  if (h === "n" || h === "s") return "ns-resize";
  if (h === "e" || h === "w") return "ew-resize";
  if (h === "ne" || h === "sw") return "nesw-resize";
  return "nwse-resize";
}
