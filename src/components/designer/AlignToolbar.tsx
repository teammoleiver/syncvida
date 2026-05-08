import {
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Group, Ungroup,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesignElement, Slide } from "@/lib/designer-queries";
import { newId } from "@/lib/designer-utils";

type Op =
  | "left" | "centerH" | "right"
  | "top" | "centerV" | "bottom"
  | "distH" | "distV"
  | "group" | "ungroup";

export function AlignToolbar({ slide, selectedIds, onApply }: {
  slide: Slide;
  selectedIds: string[];
  onApply: (next: Slide) => void;
}) {
  const els = slide.elements.filter((e) => selectedIds.includes(e.id));
  if (els.length < 2) return null;

  function run(op: Op) {
    const copy: Slide = { ...slide, elements: slide.elements.map((e) => ({ ...e })) };
    const sel = copy.elements.filter((e) => selectedIds.includes(e.id));
    if (op === "left") { const m = Math.min(...sel.map((e) => e.x)); sel.forEach((e) => e.x = m); }
    else if (op === "right") { const m = Math.max(...sel.map((e) => e.x + e.w)); sel.forEach((e) => e.x = m - e.w); }
    else if (op === "centerH") {
      const minL = Math.min(...sel.map((e) => e.x)), maxR = Math.max(...sel.map((e) => e.x + e.w));
      const c = (minL + maxR) / 2; sel.forEach((e) => e.x = c - e.w / 2);
    } else if (op === "top") { const m = Math.min(...sel.map((e) => e.y)); sel.forEach((e) => e.y = m); }
    else if (op === "bottom") { const m = Math.max(...sel.map((e) => e.y + e.h)); sel.forEach((e) => e.y = m - e.h); }
    else if (op === "centerV") {
      const minT = Math.min(...sel.map((e) => e.y)), maxB = Math.max(...sel.map((e) => e.y + e.h));
      const c = (minT + maxB) / 2; sel.forEach((e) => e.y = c - e.h / 2);
    } else if (op === "distH" && sel.length >= 3) {
      const sorted = [...sel].sort((a, b) => a.x - b.x);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const totalW = sorted.reduce((s, e) => s + e.w, 0);
      const span = (last.x + last.w) - first.x;
      const gap = (span - totalW) / (sorted.length - 1);
      let cursor = first.x;
      for (const e of sorted) { e.x = cursor; cursor += e.w + gap; }
    } else if (op === "distV" && sel.length >= 3) {
      const sorted = [...sel].sort((a, b) => a.y - b.y);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const totalH = sorted.reduce((s, e) => s + e.h, 0);
      const span = (last.y + last.h) - first.y;
      const gap = (span - totalH) / (sorted.length - 1);
      let cursor = first.y;
      for (const e of sorted) { e.y = cursor; cursor += e.h + gap; }
    } else if (op === "group") {
      const gid = newId();
      sel.forEach((e) => e.groupId = gid);
    } else if (op === "ungroup") {
      sel.forEach((e) => e.groupId = null);
    }
    onApply(copy);
  }

  const Btn = ({ op, icon: Icon, title }: { op: Op; icon: any; title: string }) => (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => run(op)} title={title}>
      <Icon className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <div className="absolute z-10 left-1/2 -translate-x-1/2 top-2 bg-popover border border-border rounded-md shadow-md p-1 flex gap-0.5">
      <Btn op="left" icon={AlignLeft} title="Align left" />
      <Btn op="centerH" icon={AlignCenter} title="Align horizontal center" />
      <Btn op="right" icon={AlignRight} title="Align right" />
      <div className="w-px bg-border mx-0.5" />
      <Btn op="top" icon={AlignStartVertical} title="Align top" />
      <Btn op="centerV" icon={AlignCenterVertical} title="Align vertical center" />
      <Btn op="bottom" icon={AlignEndVertical} title="Align bottom" />
      <div className="w-px bg-border mx-0.5" />
      <Btn op="distH" icon={AlignHorizontalDistributeCenter} title="Distribute horizontally (3+)" />
      <Btn op="distV" icon={AlignVerticalDistributeCenter} title="Distribute vertically (3+)" />
      <div className="w-px bg-border mx-0.5" />
      <Btn op="group" icon={Group} title="Group (⌘G)" />
      <Btn op="ungroup" icon={Ungroup} title="Ungroup (⌘⇧G)" />
    </div>
  );
}
