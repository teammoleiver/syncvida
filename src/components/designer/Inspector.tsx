import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Wand2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import type { BrandKit, DesignElement, Fill, Gradient } from "@/lib/designer-queries";
import { fillToCss } from "@/lib/designer-utils";

const PALETTE_KEYS = ["primary", "secondary", "accent", "bg", "text"] as const;

export function ColorRow({
  brand, value, onChange, allowGradient = false,
}: { brand: BrandKit | null; value: Fill; onChange: (v: Fill) => void; allowGradient?: boolean }) {
  const isStr = typeof value === "string";
  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        {brand && PALETTE_KEYS.map((k) => (
          <button key={k} title={k} onClick={() => onChange(brand.colors[k])}
            className="w-7 h-7 rounded-full border border-border" style={{ background: brand.colors[k] }} />
        ))}
        <input type="color" value={isStr ? (value as string) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-border" />
        <Input value={isStr ? (value as string) : "(gradient)"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-24 text-xs" />
        {allowGradient && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
            const g: Gradient = { kind: "linear", angle: 180, stops: [
              { offset: 0, color: brand?.colors.primary ?? "#1D9E75" },
              { offset: 1, color: brand?.colors.secondary ?? "#0F6E56" },
            ] };
            onChange(g);
          }}>Gradient</Button>
        )}
      </div>
      {!isStr && allowGradient && (
        <GradientEditor value={value as Gradient} onChange={(g) => onChange(g)} />
      )}
      {!isStr && (
        <div className="h-6 rounded border border-border" style={{ background: fillToCss(value) }} />
      )}
    </div>
  );
}

function GradientEditor({ value, onChange }: { value: Gradient; onChange: (g: Gradient) => void }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={value.kind} onValueChange={(v) => onChange({ ...value, kind: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.kind === "linear" && (
          <div>
            <Label className="text-xs">Angle ({value.angle ?? 180}°)</Label>
            <Slider min={0} max={360} step={1} value={[value.angle ?? 180]}
              onValueChange={(v) => onChange({ ...value, angle: v[0] })} />
          </div>
        )}
      </div>
      <div className="space-y-1">
        {value.stops.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="color" value={s.color}
              onChange={(e) => onChange({ ...value, stops: value.stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x) })}
              className="w-6 h-6 rounded border border-border" />
            <Slider min={0} max={1} step={0.01} value={[s.offset]}
              onValueChange={(v) => onChange({ ...value, stops: value.stops.map((x, j) => j === i ? { ...x, offset: v[0] } : x) })}
              className="flex-1" />
            <button className="text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => value.stops.length > 2 && onChange({ ...value, stops: value.stops.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="h-6 text-[11px] w-full"
          onClick={() => onChange({ ...value, stops: [...value.stops, { offset: 1, color: "#FFFFFF" }] })}>
          + Stop
        </Button>
      </div>
    </div>
  );
}

export function ElementInspector({
  element, brand, onChange, onAiEdit,
}: {
  element: DesignElement;
  brand: BrandKit | null;
  onChange: (props: Partial<DesignElement>) => void;
  onAiEdit?: () => void;
}) {
  return (
    <div className="space-y-3">
      <CommonSection element={element} onChange={onChange} />
      {element.type === "text" && <TextSection element={element} brand={brand} onChange={onChange} />}
      {element.type === "shape" && <ShapeSection element={element} brand={brand} onChange={onChange} />}
      {element.type === "line" && <LineSection element={element} brand={brand} onChange={onChange} />}
      {element.type === "icon" && <IconSection element={element} brand={brand} onChange={onChange} />}
      {element.type === "image" && <ImageSection element={element} onChange={onChange} onAiEdit={onAiEdit} />}
      {element.type === "logo" && (
        <Select value={element.variant} onValueChange={(v) => onChange({ variant: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light variant</SelectItem>
            <SelectItem value="dark">Dark variant</SelectItem>
          </SelectContent>
        </Select>
      )}
      <ShadowSection element={element} onChange={onChange} />
    </div>
  );
}

function CommonSection({ element, onChange }: { element: DesignElement; onChange: (p: Partial<DesignElement>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <NumField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumField label="W" value={element.w} onChange={(v) => onChange({ w: v })} />
        <NumField label="H" value={element.h} onChange={(v) => onChange({ h: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <NumField label="Rotation" value={element.rotation ?? 0} onChange={(v) => onChange({ rotation: v })} />
        <div>
          <Label className="text-xs">Opacity</Label>
          <Slider min={0} max={1} step={0.01} value={[element.opacity ?? 1]} onValueChange={(v) => onChange({ opacity: v[0] })} />
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
          onClick={() => onChange({ locked: !element.locked })}>
          {element.locked ? <><Unlock className="w-3.5 h-3.5 mr-1" /> Unlock</> : <><Lock className="w-3.5 h-3.5 mr-1" /> Lock</>}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
          onClick={() => onChange({ hidden: !element.hidden })}>
          {element.hidden ? <><Eye className="w-3.5 h-3.5 mr-1" /> Show</> : <><EyeOff className="w-3.5 h-3.5 mr-1" /> Hide</>}
        </Button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-7" />
    </div>
  );
}

function TextSection({ element, brand, onChange }: { element: any; brand: BrandKit | null; onChange: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={3}
        value={element.text} onChange={(e) => onChange({ text: e.target.value })} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><Label className="text-xs">Size</Label><Input type="number" value={element.size} onChange={(e) => onChange({ size: Number(e.target.value) || 0 })} className="h-7" /></div>
        <div><Label className="text-xs">Weight</Label>
          <Select value={String(element.weight)} onValueChange={(v) => onChange({ weight: Number(v) })}>
            <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
            <SelectContent>{[300, 400, 500, 600, 700, 800, 900].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Line height</Label>
          <Input type="number" step="0.05" value={element.lineHeight ?? 1.1} onChange={(e) => onChange({ lineHeight: Number(e.target.value) || 1.1 })} className="h-7" /></div>
        <div><Label className="text-xs">Letter spacing</Label>
          <Input type="number" step="0.5" value={element.letterSpacing ?? 0} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) || 0 })} className="h-7" /></div>
      </div>
      <div className="flex gap-1">
        {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Ic]) => (
          <Button key={v} size="sm" variant={element.align === v ? "default" : "outline"} className="flex-1 h-7"
            onClick={() => onChange({ align: v })}><Ic className="w-3.5 h-3.5" /></Button>
        ))}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant={element.weight >= 700 ? "default" : "outline"} className="flex-1 h-7"
          onClick={() => onChange({ weight: element.weight >= 700 ? 400 : 800 })}><Bold className="w-3.5 h-3.5" /></Button>
        <Button size="sm" variant={element.italic ? "default" : "outline"} className="flex-1 h-7"
          onClick={() => onChange({ italic: !element.italic })}><Italic className="w-3.5 h-3.5" /></Button>
        <Button size="sm" variant={element.underline ? "default" : "outline"} className="flex-1 h-7"
          onClick={() => onChange({ underline: !element.underline })}><Underline className="w-3.5 h-3.5" /></Button>
      </div>
      <div><Label className="text-xs">Color</Label><ColorRow brand={brand} value={element.color} onChange={(v) => onChange({ color: v })} /></div>
    </div>
  );
}

function ShapeSection({ element, brand, onChange }: { element: any; brand: BrandKit | null; onChange: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Fill</Label>
        <ColorRow brand={brand} value={element.fill} onChange={(v) => onChange({ fill: v })} allowGradient />
      </div>
      {element.shape === "rect" && (
        <div><Label className="text-xs">Corner radius</Label>
          <Input type="number" value={element.radius ?? 0} onChange={(e) => onChange({ radius: Number(e.target.value) || 0 })} className="h-7" />
        </div>
      )}
      <div><Label className="text-xs">Stroke</Label>
        <ColorRow brand={brand} value={element.stroke ?? "#000000"} onChange={(v) => onChange({ stroke: v as string })} />
      </div>
      <div><Label className="text-xs">Stroke width</Label>
        <Input type="number" value={element.strokeWidth ?? 0} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) || 0 })} className="h-7" />
      </div>
    </div>
  );
}

function LineSection({ element, brand, onChange }: { element: any; brand: BrandKit | null; onChange: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Color</Label>
        <ColorRow brand={brand} value={element.stroke} onChange={(v) => onChange({ stroke: v as string })} />
      </div>
      <div><Label className="text-xs">Thickness</Label>
        <Input type="number" value={element.strokeWidth} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) || 1 })} className="h-7" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant={element.arrowStart ? "default" : "outline"} className="flex-1 h-7 text-xs"
          onClick={() => onChange({ arrowStart: !element.arrowStart })}>↤ Start</Button>
        <Button size="sm" variant={element.arrowEnd ? "default" : "outline"} className="flex-1 h-7 text-xs"
          onClick={() => onChange({ arrowEnd: !element.arrowEnd })}>End ↦</Button>
      </div>
    </div>
  );
}

function IconSection({ element, brand, onChange }: { element: any; brand: BrandKit | null; onChange: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Icon name (lucide)</Label>
        <Input value={element.name} onChange={(e) => onChange({ name: e.target.value })} className="h-7" placeholder="Sparkles" />
        <p className="text-[10px] text-muted-foreground mt-1">Pick from lucide.dev/icons. Use the PascalCase name.</p>
      </div>
      <div><Label className="text-xs">Color</Label>
        <ColorRow brand={brand} value={element.color} onChange={(v) => onChange({ color: v as string })} />
      </div>
      <div><Label className="text-xs">Stroke width</Label>
        <Input type="number" step="0.25" value={element.strokeWidth ?? 1.75} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) || 1.75 })} className="h-7" />
      </div>
    </div>
  );
}

function ImageSection({ element, onChange, onAiEdit }: { element: any; onChange: (p: any) => void; onAiEdit?: () => void }) {
  return (
    <div className="space-y-2">
      <img src={element.src} alt="" className="w-full rounded border border-border" />
      <div><Label className="text-xs">Fit</Label>
        <Select value={element.fit} onValueChange={(v) => onChange({ fit: v })}>
          <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="cover">Cover</SelectItem><SelectItem value="contain">Contain</SelectItem></SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">Corner radius</Label>
        <Input type="number" value={element.radius ?? 0} onChange={(e) => onChange({ radius: Number(e.target.value) || 0 })} className="h-7" />
      </div>
      {element.assetId && onAiEdit && (
        <Button size="sm" variant="outline" className="w-full" onClick={onAiEdit}>
          <Wand2 className="w-3.5 h-3.5 mr-1" /> Edit image with AI
        </Button>
      )}
    </div>
  );
}

function ShadowSection({ element, onChange }: { element: DesignElement; onChange: (p: Partial<DesignElement>) => void }) {
  const sh = element.shadow ?? null;
  return (
    <div className="border-t border-border pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Shadow</Label>
        <Button size="sm" variant="outline" className="h-6 text-[11px]"
          onClick={() => onChange({ shadow: sh ? null : { x: 0, y: 8, blur: 24, color: "#00000040" } })}>
          {sh ? "Remove" : "Add"}
        </Button>
      </div>
      {sh && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <NumField label="X" value={sh.x} onChange={(v) => onChange({ shadow: { ...sh, x: v } })} />
          <NumField label="Y" value={sh.y} onChange={(v) => onChange({ shadow: { ...sh, y: v } })} />
          <NumField label="Blur" value={sh.blur} onChange={(v) => onChange({ shadow: { ...sh, blur: v } })} />
          <div>
            <Label className="text-xs">Color</Label>
            <input type="color" value={sh.color.length === 7 ? sh.color : sh.color.slice(0, 7)}
              onChange={(e) => onChange({ shadow: { ...sh, color: e.target.value + (sh.color.length === 9 ? sh.color.slice(7) : "") } })}
              className="h-7 w-full border border-border rounded" />
          </div>
        </div>
      )}
    </div>
  );
}
