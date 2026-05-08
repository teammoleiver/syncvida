import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, Type, Image as ImageIcon, Square as SquareIcon, Circle as CircleIcon, Trash2, Copy, ArrowUp, ArrowDown, Wand2, Download, Send, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { getDesign, updateDesign, getBrandKit, listAssets, editAssetImage,
  type Design, type Slide, type DesignElement, type BrandKit, type DesignAsset } from "@/lib/designer-queries";

const PALETTE_KEYS = ["primary", "secondary", "accent", "bg", "text"] as const;

function newId() { return crypto.randomUUID(); }

export default function DesignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [design, setDesign] = useState<Design | null>(null);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState<{ assetId: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { (async () => {
    if (!id) return;
    const [d, b] = await Promise.all([getDesign(id), getBrandKit()]);
    setDesign(d); setBrand(b);
  })(); }, [id]);

  const slide = design?.slides[activeIdx];
  const selected = slide?.elements.find((e) => e.id === selectedId) ?? null;

  function patch(updater: (d: Design) => Design) { setDesign((cur) => cur ? updater(structuredClone(cur)) : cur); }
  function patchSlide(updater: (s: Slide) => Slide) {
    patch((d) => { d.slides[activeIdx] = updater(d.slides[activeIdx]); return d; });
  }
  function patchElement(elId: string, updater: (e: DesignElement) => DesignElement) {
    patchSlide((s) => { s.elements = s.elements.map((e) => e.id === elId ? updater(e) : e); return s; });
  }

  async function save() {
    if (!design) return;
    setSaving(true);
    try { await updateDesign(design.id, { title: design.title, slides: design.slides }); toast.success("Saved"); }
    catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(false); }
  }

  function addText() {
    patchSlide((s) => { s.elements.push({ id: newId(), type: "text", x: 80, y: 80, w: 920, h: 200, text: "Your headline", font: "heading", size: 96, weight: 800, color: brand?.colors.text ?? "#000", align: "left" }); return s; });
  }
  function addShape(shape: "rect" | "circle") {
    patchSlide((s) => { s.elements.push({ id: newId(), type: "shape", shape, x: 100, y: 100, w: 300, h: 300, fill: brand?.colors.primary ?? "#1D9E75", radius: shape === "rect" ? 24 : 999 }); return s; });
  }
  function addLogo() {
    if (!brand?.logo_light_url && !brand?.logo_dark_url) { toast.error("Upload a logo in Brand kit first"); return; }
    patchSlide((s) => { s.elements.push({ id: newId(), type: "logo", x: 80, y: 1180, w: 200, h: 80, variant: "light" }); return s; });
  }
  function pickAsset(a: DesignAsset) {
    patchSlide((s) => { s.elements.push({ id: newId(), type: "image", x: 80, y: 80, w: 920, h: 920, src: a.public_url, fit: "cover", radius: 16, assetId: a.id }); return s; });
    setPickerOpen(false);
  }

  function dup() {
    if (!selected) return;
    patchSlide((s) => { s.elements.push({ ...structuredClone(selected), id: newId(), x: selected.x + 40, y: selected.y + 40 }); return s; });
  }
  function del() {
    if (!selected) return;
    patchSlide((s) => { s.elements = s.elements.filter((e) => e.id !== selected.id); return s; });
    setSelectedId(null);
  }
  function moveZ(dir: 1 | -1) {
    if (!selected || !slide) return;
    const i = slide.elements.findIndex((e) => e.id === selected.id);
    const j = i + dir;
    if (j < 0 || j >= slide.elements.length) return;
    patchSlide((s) => { const arr = s.elements; [arr[i], arr[j]] = [arr[j], arr[i]]; return s; });
  }

  async function exportPng() {
    if (!design) return;
    setExporting(true);
    try {
      for (let i = 0; i < design.slides.length; i++) {
        setActiveIdx(i);
        await new Promise((r) => setTimeout(r, 60));
        const node = document.getElementById("design-canvas-export");
        if (!node) throw new Error("Canvas not ready");
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1 });
        const a = document.createElement("a");
        a.href = dataUrl; a.download = `${design.title.replace(/\s+/g, "_")}-${i + 1}.png`; a.click();
      }
      toast.success("PNG(s) downloaded");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); } finally { setExporting(false); }
  }

  async function exportPdf() {
    if (!design) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: design.height >= design.width ? "p" : "l", unit: "px", format: [design.width, design.height] });
      for (let i = 0; i < design.slides.length; i++) {
        setActiveIdx(i);
        await new Promise((r) => setTimeout(r, 80));
        const node = document.getElementById("design-canvas-export");
        if (!node) throw new Error("Canvas not ready");
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1 });
        if (i > 0) pdf.addPage([design.width, design.height], design.height >= design.width ? "p" : "l");
        pdf.addImage(dataUrl, "PNG", 0, 0, design.width, design.height);
      }
      pdf.save(`${design.title.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); } finally { setExporting(false); }
  }

  if (!design || !slide) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <section className="h-[calc(100vh-4rem)] flex flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="sm"><Link to="/designer"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <Input value={design.title} onChange={(e) => setDesign({ ...design, title: e.target.value })} className="max-w-xs" />
          <span className="text-xs text-muted-foreground hidden sm:inline">{design.width}×{design.height} · {design.platform}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPng} disabled={exporting}><Download className="w-4 h-4 mr-1" /> PNG</Button>
          {design.type === "carousel" && <Button variant="outline" size="sm" onClick={exportPdf} disabled={exporting}><Download className="w-4 h-4 mr-1" /> PDF</Button>}
          <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save</Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[60px_1fr_320px] min-h-0">
        {/* Left toolbar */}
        <div className="border-r border-border p-2 flex flex-col gap-2">
          <ToolBtn icon={Type} label="Text" onClick={addText} />
          <ToolBtn icon={ImageIcon} label="Image" onClick={() => setPickerOpen(true)} />
          <ToolBtn icon={SquareIcon} label="Rect" onClick={() => addShape("rect")} />
          <ToolBtn icon={CircleIcon} label="Circle" onClick={() => addShape("circle")} />
          <ToolBtn icon={Sparkles} label="Logo" onClick={addLogo} />
        </div>

        {/* Canvas */}
        <div className="overflow-auto bg-muted/30 p-6 flex flex-col items-center gap-4">
          <div className="flex-1 flex items-center justify-center w-full">
            <CanvasFrame design={design} slide={slide} brand={brand} selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={(elId, dx, dy) => patchElement(elId, (e) => ({ ...e, x: e.x + dx, y: e.y + dy }))}
              onResize={(elId, dw, dh) => patchElement(elId, (e) => ({ ...e, w: Math.max(20, e.w + dw), h: Math.max(20, e.h + dh) }))} />
          </div>
          {/* Slides ribbon */}
          {design.type === "carousel" && (
            <div className="flex gap-2 items-center flex-wrap justify-center">
              {design.slides.map((s, i) => (
                <button key={s.id} onClick={() => { setActiveIdx(i); setSelectedId(null); }}
                  className={`w-16 h-20 rounded border text-xs flex items-center justify-center ${i === activeIdx ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                  {i + 1}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => {
                patch((d) => { d.slides.push({ id: newId(), bg: "#FFFFFF", elements: [] }); return d; });
                setActiveIdx(design.slides.length);
              }}><Plus className="w-3.5 h-3.5" /></Button>
              {design.slides.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => {
                  if (!confirm("Delete this slide?")) return;
                  patch((d) => { d.slides.splice(activeIdx, 1); return d; });
                  setActiveIdx(Math.max(0, activeIdx - 1));
                }}><Trash2 className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          )}
        </div>

        {/* Inspector */}
        <div className="border-l border-border p-3 overflow-auto space-y-4">
          <div>
            <Label>Slide background</Label>
            <ColorRow brand={brand} value={slide.bg} onChange={(v) => patchSlide((s) => ({ ...s, bg: v }))} />
          </div>
          {selected ? (
            <Card className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-muted-foreground">{selected.type}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => moveZ(1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => moveZ(-1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={dup}><Copy className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={del}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <Inspector element={selected} brand={brand}
                onChange={(p) => patchElement(selected.id, (e) => ({ ...e, ...p } as DesignElement))}
                onAiEdit={(assetId) => setAiEditOpen({ assetId })} />
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">Select an element to edit it.</p>
          )}
        </div>
      </div>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickAsset} />
      <AiEditDialog state={aiEditOpen} onClose={() => setAiEditOpen(null)} onSaved={(newAsset) => {
        // replace selected image element src
        if (!selected || selected.type !== "image") return;
        patchElement(selected.id, (e) => ({ ...(e as any), src: newAsset.public_url, assetId: newAsset.id }));
        setAiEditOpen(null);
      }} />
    </section>
  );
}

function ToolBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="aspect-square rounded-md hover:bg-muted flex flex-col items-center justify-center text-[10px] gap-1 text-muted-foreground hover:text-foreground">
    <Icon className="w-4 h-4" /> {label}
  </button>;
}

function ColorRow({ brand, value, onChange }: { brand: BrandKit | null; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      {brand && PALETTE_KEYS.map((k) => (
        <button key={k} title={k} onClick={() => onChange(brand.colors[k])}
          className="w-7 h-7 rounded-full border border-border" style={{ background: brand.colors[k] }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-border" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-24 text-xs" />
    </div>
  );
}

function Inspector({ element, brand, onChange, onAiEdit }: { element: DesignElement; brand: BrandKit | null; onChange: (p: any) => void; onAiEdit: (assetId: string) => void }) {
  if (element.type === "text") {
    return (
      <div className="space-y-2">
        <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={3}
          value={element.text} onChange={(e) => onChange({ text: e.target.value })} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><Label className="text-xs">Size</Label><Input type="number" value={element.size} onChange={(e) => onChange({ size: Number(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Weight</Label>
            <Select value={String(element.weight)} onValueChange={(v) => onChange({ weight: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[300, 400, 500, 600, 700, 800, 900].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label className="text-xs">Align</Label>
          <Select value={element.align} onValueChange={(v) => onChange({ align: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Color</Label><ColorRow brand={brand} value={element.color} onChange={(v) => onChange({ color: v })} /></div>
      </div>
    );
  }
  if (element.type === "shape") {
    return (
      <div className="space-y-2">
        <div><Label className="text-xs">Fill</Label><ColorRow brand={brand} value={element.fill} onChange={(v) => onChange({ fill: v })} /></div>
        {element.shape === "rect" && <div><Label className="text-xs">Corner radius</Label>
          <Input type="number" value={element.radius ?? 0} onChange={(e) => onChange({ radius: Number(e.target.value) || 0 })} /></div>}
      </div>
    );
  }
  if (element.type === "image") {
    return (
      <div className="space-y-2">
        <img src={element.src} alt="" className="w-full rounded border border-border" />
        <div><Label className="text-xs">Fit</Label>
          <Select value={element.fit} onValueChange={(v) => onChange({ fit: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cover">Cover</SelectItem><SelectItem value="contain">Contain</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Corner radius</Label>
          <Input type="number" value={element.radius ?? 0} onChange={(e) => onChange({ radius: Number(e.target.value) || 0 })} /></div>
        {element.assetId && <Button size="sm" variant="outline" className="w-full" onClick={() => onAiEdit(element.assetId!)}>
          <Wand2 className="w-3.5 h-3.5 mr-1" /> Edit with AI
        </Button>}
      </div>
    );
  }
  if (element.type === "logo") {
    return (
      <Select value={element.variant} onValueChange={(v) => onChange({ variant: v })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="light">Logo (light bg)</SelectItem><SelectItem value="dark">Logo (dark bg)</SelectItem></SelectContent>
      </Select>
    );
  }
  return null;
}

function CanvasFrame({ design, slide, brand, selectedId, onSelect, onMove, onResize }:
  { design: Design; slide: Slide; brand: BrandKit | null; selectedId: string | null;
    onSelect: (id: string | null) => void; onMove: (id: string, dx: number, dy: number) => void; onResize: (id: string, dw: number, dh: number) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calc = () => {
      if (!wrapperRef.current) return;
      const w = wrapperRef.current.clientWidth;
      const h = wrapperRef.current.clientHeight;
      const s = Math.min(w / design.width, h / design.height, 1);
      setScale(Math.max(0.1, s));
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [design.width, design.height]);

  return (
    <div ref={wrapperRef} className="w-full max-w-3xl flex-1 flex items-center justify-center" style={{ minHeight: 400 }}>
      <div style={{ width: design.width * scale, height: design.height * scale }}>
        <div id="design-canvas-export" className="origin-top-left shadow-xl"
          style={{ width: design.width, height: design.height, background: slide.bg, position: "relative", transform: `scale(${scale})`, overflow: "hidden" }}
          onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
          {slide.elements.map((el) => (
            <ElementView key={el.id} el={el} brand={brand} selected={el.id === selectedId} scale={scale}
              onSelect={() => onSelect(el.id)} onMove={(dx, dy) => onMove(el.id, dx, dy)} onResize={(dw, dh) => onResize(el.id, dw, dh)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ElementView({ el, brand, selected, scale, onSelect, onMove, onResize }:
  { el: DesignElement; brand: BrandKit | null; selected: boolean; scale: number;
    onSelect: () => void; onMove: (dx: number, dy: number) => void; onResize: (dw: number, dh: number) => void }) {
  const baseStyle: React.CSSProperties = {
    position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    outline: selected ? "2px solid hsl(var(--primary))" : undefined, outlineOffset: 2,
  };

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation(); onSelect();
    const startX = e.clientX, startY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      // Only apply incremental changes
    };
    let lastX = startX, lastY = startY;
    const onPointerMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - lastX) / scale;
      const dy = (ev.clientY - lastY) / scale;
      lastX = ev.clientX; lastY = ev.clientY;
      if (mode === "move") onMove(dx, dy); else onResize(dx, dy);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  }

  let inner: any = null;
  if (el.type === "text") {
    const family = el.font === "heading" ? brand?.fonts.heading : brand?.fonts.body;
    inner = (
      <div style={{ width: "100%", height: "100%", color: el.color, fontFamily: `"${family ?? "Inter"}", system-ui, sans-serif`,
        fontSize: el.size, fontWeight: el.weight, textAlign: el.align, lineHeight: 1.1, whiteSpace: "pre-wrap", overflow: "hidden", padding: 4 }}>
        {el.text}
      </div>
    );
  } else if (el.type === "image") {
    inner = <img src={el.src} alt="" draggable={false}
      style={{ width: "100%", height: "100%", objectFit: el.fit, borderRadius: el.radius ?? 0, pointerEvents: "none" }} />;
  } else if (el.type === "shape") {
    inner = <div style={{ width: "100%", height: "100%", background: el.fill, borderRadius: el.shape === "circle" ? "50%" : (el.radius ?? 0) }} />;
  } else if (el.type === "logo") {
    const url = el.variant === "dark" ? brand?.logo_dark_url : brand?.logo_light_url;
    inner = url ? <img src={url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} draggable={false} />
      : <div style={{ width: "100%", height: "100%", border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>logo</div>;
  }

  return (
    <div style={baseStyle} onPointerDown={(e) => startDrag(e, "move")}>
      {inner}
      {selected && (
        <div onPointerDown={(e) => startDrag(e, "resize")}
          style={{ position: "absolute", right: -8, bottom: -8, width: 16, height: 16, background: "hsl(var(--primary))", cursor: "nwse-resize", borderRadius: 4 }} />
      )}
    </div>
  );
}

function AssetPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: DesignAsset) => void }) {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setLoading(true); listAssets().then((a) => { setAssets(a); setLoading(false); }); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pick an image</DialogTitle></DialogHeader>
        {loading ? <p className="text-muted-foreground">Loading…</p>
          : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets yet. <Link to="/designer/assets" className="underline text-primary">Add some</Link>.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((a) => (
                <button key={a.id} onClick={() => onPick(a)} className="overflow-hidden rounded-md border border-border hover:border-primary">
                  <img src={a.public_url} className="w-full aspect-square object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}

function AiEditDialog({ state, onClose, onSaved }: { state: { assetId: string } | null; onClose: () => void; onSaved: (a: DesignAsset) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!state || !prompt.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await editAssetImage(state.assetId, prompt);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      toast.success("Edited");
      onSaved(d.asset as DesignAsset);
      setPrompt("");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit image with AI</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Replace background with deep emerald gradient" />
          <Button onClick={go} disabled={busy} className="w-full">{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}Apply</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}