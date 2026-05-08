import { Eye, EyeOff, Lock, Unlock, GripVertical } from "lucide-react";
import * as Lucide from "lucide-react";
import type { DesignElement, Slide } from "@/lib/designer-queries";

const LABELS: Record<DesignElement["type"], string> = {
  text: "Text", image: "Image", shape: "Shape", line: "Line", icon: "Icon", logo: "Logo",
};

export function LayersPanel({
  slide,
  selectedIds,
  onSelect,
  onReorder,
  onToggleVisibility,
  onToggleLock,
}: {
  slide: Slide;
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  onReorder: (from: number, to: number) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {[...slide.elements].slice().reverse().map((el) => {
        const idx = slide.elements.indexOf(el);
        const top = slide.elements.length - 1 - idx;
        const isSel = selectedIds.has(el.id);
        const TypeIcon = el.type === "text" ? Lucide.Type
          : el.type === "image" ? Lucide.Image
          : el.type === "shape" ? (el.shape === "circle" ? Lucide.Circle : el.shape === "triangle" ? Lucide.Triangle : Lucide.Square)
          : el.type === "line" ? Lucide.Minus
          : el.type === "icon" ? ((Lucide as any)[el.name] ?? Lucide.Star)
          : Lucide.Sparkles;
        return (
          <div key={el.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData("text/plain")); if (!Number.isNaN(from) && from !== idx) onReorder(from, idx); }}
            onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs border ${isSel ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
            <GripVertical className="w-3 h-3 text-muted-foreground" />
            <TypeIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">
              {el.type === "text" ? (el as any).text.slice(0, 30) : LABELS[el.type]}
              <span className="text-muted-foreground"> · #{top + 1}</span>
            </span>
            <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(el.id); }}
              className="text-muted-foreground hover:text-foreground">
              {el.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }}
              className="text-muted-foreground hover:text-foreground">
              {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
        );
      })}
      {!slide.elements.length && <p className="text-xs text-muted-foreground p-2">No elements yet.</p>}
    </div>
  );
}
