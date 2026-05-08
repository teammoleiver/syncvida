import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Save, Plus, Type, Image as ImageIcon, Square as SquareIcon, Circle as CircleIcon,
  Triangle as TriangleIcon, Trash2, Copy, ArrowUp, ArrowDown, Wand2, Download, Loader2, Sparkles,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Minus as LineIcon, Smile, BookmarkPlus, Layers as LayersIcon,
  MessageSquare, Upload as UploadIcon, FileImage,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import {
  getDesign, updateDesign, getBrandKit, listAssets, editAssetImage, uploadAsset,
  saveAsTemplate,
  type Design, type Slide, type DesignElement, type BrandKit, type DesignAsset,
} from "@/lib/designer-queries";
import { useHistory } from "@/lib/designer-history";
import {
  newId, makeText, makeShape, makeLine, makeIcon, makeImage, makeLogo,
  emptySlide, safeFilename, clone,
} from "@/lib/designer-utils";
import { Canvas } from "@/components/designer/Canvas";
import { ElementInspector, ColorRow } from "@/components/designer/Inspector";
import { LayersPanel } from "@/components/designer/LayersPanel";
import { AiChatPanel } from "@/components/designer/AiChatPanel";
import * as LucideIcons from "lucide-react";

export default function DesignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState<Design | null>(null);
  const { state: design, setLive, commit, commitNow, undo, redo, reset } = useHistory<Design>(initial);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(0.5);
  const [autoFit, setAutoFit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState<{ assetId: string } | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rightTab, setRightTab] = useState<"inspect" | "layers" | "ai">("inspect");
  const stageRef = useRef<HTMLDivElement>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [d, b] = await Promise.all([getDesign(id), getBrandKit()]);
      if (d) setInitial(d);
      setBrand(b);
    })();
  }, [id]);
  useEffect(() => { if (initial) reset(initial); }, [initial, reset]);

  // Auto-fit zoom
  useEffect(() => {
    if (!autoFit || !design || !stageRef.current) return;
    const calc = () => {
      const el = stageRef.current!;
      const w = el.clientWidth - 32;
      const h = el.clientHeight - 32;
      setZoom(Math.max(0.05, Math.min(1, Math.min(w / design.width, h / design.height))));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [design?.width, design?.height, autoFit, activeIdx]);

  const slide = design?.slides[activeIdx];
  const selectedFirst = slide?.elements.find((e) => selectedIds.has(e.id)) ?? null;

  // Helpers
  const patchSlide = useCallback((updater: (s: Slide) => Slide, live = false) => {
    const fn = (d: Design): Design => {
      const next = clone(d);
      next.slides[activeIdx] = updater(next.slides[activeIdx]);
      return next;
    };
    if (live) setLive(fn); else commit(fn);
  }, [activeIdx, setLive, commit]);

  const patchSelected = useCallback((props: Partial<DesignElement>) => {
    if (!selectedIds.size) return;
    commit((d) => {
      const next = clone(d);
      next.slides[activeIdx].elements = next.slides[activeIdx].elements.map((e) =>
        selectedIds.has(e.id) ? ({ ...e, ...props } as DesignElement) : e);
      return next;
    });
  }, [activeIdx, commit, selectedIds]);

  // Insert helpers
  const addElement = useCallback((el: DesignElement) => {
    commit((d) => {
      const next = clone(d);
      next.slides[activeIdx].elements.push(el);
      return next;
    });
    setSelectedIds(new Set([el.id]));
  }, [activeIdx, commit]);

  const addText = () => addElement(makeText(brand));
  const addShape = (s: "rect" | "circle" | "triangle") => addElement(makeShape(brand, s));
  const addLine = () => addElement(makeLine(brand));
  const addLogo = () => {
    if (!brand?.logo_light_url && !brand?.logo_dark_url) { toast.error("Upload a logo in Brand kit first"); return; }
    addElement(makeLogo());
  };
  const onPickAsset = (a: DesignAsset) => { addElement(makeImage(a.public_url, a.id)); setPickerOpen(false); };
  const onPickIcon = (name: string) => { addElement(makeIcon(brand, name)); setIconOpen(false); };

  // File import (PNG/JPG/SVG -> upload as asset, add to canvas)
  async function onFilesPicked(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        if (f.type.startsWith("image/")) {
          const a = await uploadAsset(f);
          addElement(makeImage(a.public_url, a.id, { x: 80, y: 80, w: 600, h: 600 }));
        } else {
          toast.error(`Unsupported file: ${f.name}`);
        }
      } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
    }
  }

  // Selection ops
  function dup() {
    if (!selectedIds.size) return;
    commit((d) => {
      const next = clone(d);
      const s = next.slides[activeIdx];
      const newIds: string[] = [];
      const dups = s.elements.filter((e) => selectedIds.has(e.id)).map((e) => {
        const c: any = clone(e); c.id = newId(); c.x += 40; c.y += 40; newIds.push(c.id);
        return c;
      });
      s.elements.push(...dups);
      // Switch selection to dupes
      queueMicrotask(() => setSelectedIds(new Set(newIds)));
      return next;
    });
  }
  function del() {
    if (!selectedIds.size) return;
    commit((d) => {
      const next = clone(d);
      next.slides[activeIdx].elements = next.slides[activeIdx].elements.filter((e) => !selectedIds.has(e.id));
      return next;
    });
    setSelectedIds(new Set());
  }
  function moveZ(dir: 1 | -1) {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    commit((d) => {
      const next = clone(d);
      const arr = next.slides[activeIdx].elements;
      const i = arr.findIndex((e) => e.id === id);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return next;
    });
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); return; }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (slide) setSelectedIds(new Set(slide.elements.filter((x) => !x.locked && !x.hidden).map((x) => x.id)));
        return;
      }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) { e.preventDefault(); del(); return; }
      if (e.key === "Escape") { setSelectedIds(new Set()); return; }
      // Arrow nudge
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      if (e.key === "ArrowRight") dx = step;
      if (e.key === "ArrowUp") dy = -step;
      if (e.key === "ArrowDown") dy = step;
      if ((dx || dy) && selectedIds.size) {
        e.preventDefault();
        commit((d) => {
          const next = clone(d);
          next.slides[activeIdx].elements = next.slides[activeIdx].elements.map((el) =>
            selectedIds.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, dup, del, selectedIds, activeIdx, commit, slide]);

  async function save() {
    if (!design) return;
    setSaving(true);
    try {
      // Quick thumbnail
      let thumb: string | null = design.thumbnail_url;
      try {
        const node = document.getElementById("design-canvas-export");
        if (node) {
          thumb = await toPng(node, { cacheBust: true, pixelRatio: 0.4, skipAutoScale: true });
        }
      } catch { /* ignore */ }
      await updateDesign(design.id, { title: design.title, slides: design.slides, thumbnail_url: thumb });
      toast.success("Saved");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  async function exportPng() {
    if (!design) return;
    setExporting(true);
    try {
      for (let i = 0; i < design.slides.length; i++) {
        setActiveIdx(i);
        await new Promise((r) => setTimeout(r, 80));
        const node = document.getElementById("design-canvas-export");
        if (!node) throw new Error("Canvas not ready");
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1, skipAutoScale: true });
        const a = document.createElement("a");
        a.href = dataUrl; a.download = `${safeFilename(design.title)}-${i + 1}.png`; a.click();
      }
      toast.success("PNG(s) downloaded");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setExporting(false); }
  }

  async function exportPdf() {
    if (!design) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: design.height >= design.width ? "p" : "l", unit: "px", format: [design.width, design.height] });
      for (let i = 0; i < design.slides.length; i++) {
        setActiveIdx(i);
        await new Promise((r) => setTimeout(r, 100));
        const node = document.getElementById("design-canvas-export");
        if (!node) throw new Error("Canvas not ready");
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1, skipAutoScale: true });
        if (i > 0) pdf.addPage([design.width, design.height], design.height >= design.width ? "p" : "l");
        pdf.addImage(dataUrl, "PNG", 0, 0, design.width, design.height);
      }
      pdf.save(`${safeFilename(design.title)}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setExporting(false); }
  }

  if (!design || !slide) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <section className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="sm"><Link to="/designer"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <Input value={design.title}
            onChange={(e) => setLive((d) => ({ ...d, title: e.target.value }))}
            onBlur={() => commitNow()}
            className="max-w-xs h-8" />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {design.width}×{design.height} · {design.platform}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={undo} title="Undo (⌘Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={redo} title="Redo (⌘⇧Z)"><Redo2 className="w-4 h-4" /></Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setAutoFit(false); setZoom((z) => Math.max(0.05, z * 0.85)); }}><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setAutoFit(false); setZoom((z) => Math.min(4, z * 1.15)); }}><ZoomIn className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAutoFit(true)} title="Fit"><Maximize className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setTplOpen(true)}><BookmarkPlus className="w-4 h-4 mr-1" /> Save as template</Button>
          <Button variant="outline" size="sm" onClick={exportPng} disabled={exporting}><Download className="w-4 h-4 mr-1" /> PNG</Button>
          {design.type === "carousel" && <Button variant="outline" size="sm" onClick={exportPdf} disabled={exporting}><Download className="w-4 h-4 mr-1" /> PDF</Button>}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save
          </Button>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[60px_1fr_340px] min-h-0">
        {/* Left toolbar */}
        <div className="border-r border-border p-2 flex flex-col gap-1 overflow-auto">
          <ToolBtn icon={Type} label="Text" onClick={addText} />
          <ToolBtn icon={ImageIcon} label="Image" onClick={() => setPickerOpen(true)} />
          <ToolBtn icon={UploadIcon} label="Upload" onClick={() => fileImportRef.current?.click()} />
          <ToolBtn icon={SquareIcon} label="Rect" onClick={() => addShape("rect")} />
          <ToolBtn icon={CircleIcon} label="Circle" onClick={() => addShape("circle")} />
          <ToolBtn icon={TriangleIcon} label="Tri" onClick={() => addShape("triangle")} />
          <ToolBtn icon={LineIcon} label="Line" onClick={addLine} />
          <ToolBtn icon={Smile} label="Icon" onClick={() => setIconOpen(true)} />
          <ToolBtn icon={Sparkles} label="Logo" onClick={addLogo} />
          <input ref={fileImportRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { onFilesPicked(e.target.files); e.currentTarget.value = ""; }} />
        </div>

        {/* Stage */}
        <div ref={stageRef} className="overflow-auto bg-muted/30 p-4 flex flex-col items-center gap-3 min-w-0">
          <div className="flex-1 flex items-center justify-center min-h-0">
            <Canvas
              design={design} slide={slide} brand={brand}
              selectedIds={selectedIds} onSelectionChange={setSelectedIds}
              onLiveUpdate={(u) => patchSlide(u, true)}
              onCommit={() => commitNow()}
              zoom={zoom} onZoom={(z) => { setAutoFit(false); setZoom(z); }}
            />
          </div>
          {/* Slide ribbon */}
          {design.type === "carousel" && (
            <div className="flex gap-2 items-center flex-wrap justify-center">
              {design.slides.map((s, i) => (
                <button key={s.id} onClick={() => { setActiveIdx(i); setSelectedIds(new Set()); }}
                  className={`w-16 h-20 rounded border text-xs flex items-center justify-center ${i === activeIdx ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}>
                  {i + 1}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => {
                commit((d) => { const n = clone(d); n.slides.push(emptySlide(brand?.colors.bg ?? "#FFFFFF")); return n; });
                setActiveIdx(design.slides.length);
              }}><Plus className="w-3.5 h-3.5" /></Button>
              {design.slides.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => {
                  if (!confirm("Delete this slide?")) return;
                  commit((d) => { const n = clone(d); n.slides.splice(activeIdx, 1); return n; });
                  setActiveIdx(Math.max(0, activeIdx - 1));
                }}><Trash2 className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          )}
        </div>

        {/* Right tabs */}
        <div className="border-l border-border flex flex-col min-h-0">
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as any)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-3 m-2">
              <TabsTrigger value="inspect"><Wand2 className="w-3.5 h-3.5 mr-1" />Inspect</TabsTrigger>
              <TabsTrigger value="layers"><LayersIcon className="w-3.5 h-3.5 mr-1" />Layers</TabsTrigger>
              <TabsTrigger value="ai"><MessageSquare className="w-3.5 h-3.5 mr-1" />AI</TabsTrigger>
            </TabsList>
            <TabsContent value="inspect" className="flex-1 overflow-auto px-3 pb-3 space-y-3 mt-0">
              <div>
                <Label>Slide background</Label>
                <ColorRow brand={brand} value={slide.bg} onChange={(v) => patchSlide((s) => ({ ...s, bg: v }))} allowGradient />
              </div>
              {selectedFirst ? (
                <Card className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase text-muted-foreground">{selectedFirst.type}{selectedIds.size > 1 ? ` (+${selectedIds.size - 1})` : ""}</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveZ(1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveZ(-1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={dup}><Copy className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={del}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <ElementInspector element={selectedFirst} brand={brand}
                    onChange={(p) => patchSelected(p)}
                    onAiEdit={selectedFirst.type === "image" && (selectedFirst as any).assetId
                      ? () => setAiEditOpen({ assetId: (selectedFirst as any).assetId }) : undefined} />
                </Card>
              ) : (
                <p className="text-xs text-muted-foreground">Click an element on the canvas to edit it. Shift-click to select multiple.</p>
              )}
            </TabsContent>
            <TabsContent value="layers" className="flex-1 overflow-auto px-3 pb-3 mt-0">
              <LayersPanel slide={slide} selectedIds={selectedIds}
                onSelect={(id, additive) => {
                  setSelectedIds((cur) => {
                    if (additive) { const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next; }
                    return new Set([id]);
                  });
                }}
                onReorder={(from, to) => commit((d) => {
                  const n = clone(d); const arr = n.slides[activeIdx].elements;
                  const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return n;
                })}
                onToggleVisibility={(id) => commit((d) => {
                  const n = clone(d); n.slides[activeIdx].elements = n.slides[activeIdx].elements.map((e) =>
                    e.id === id ? { ...e, hidden: !e.hidden } : e); return n;
                })}
                onToggleLock={(id) => commit((d) => {
                  const n = clone(d); n.slides[activeIdx].elements = n.slides[activeIdx].elements.map((e) =>
                    e.id === id ? { ...e, locked: !e.locked } : e); return n;
                })}
              />
            </TabsContent>
            <TabsContent value="ai" className="flex-1 overflow-hidden flex flex-col px-2 pb-2 mt-0">
              <AiChatPanel
                designId={design.id} slideIndex={activeIdx}
                selectedIds={[...selectedIds]}
                onApplied={(updated) => reset(updated)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPickAsset} />
      <IconPicker open={iconOpen} onClose={() => setIconOpen(false)} onPick={onPickIcon} />
      <AiEditDialog state={aiEditOpen} onClose={() => setAiEditOpen(null)} onSaved={(newAsset) => {
        if (!selectedFirst || selectedFirst.type !== "image") return;
        patchSelected({ src: newAsset.public_url, assetId: newAsset.id } as any);
        setAiEditOpen(null);
      }} />
      <SaveTemplateDialog open={tplOpen} onClose={() => setTplOpen(false)} design={design} />
    </section>
  );
}

function ToolBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="aspect-square rounded-md hover:bg-muted flex flex-col items-center justify-center text-[10px] gap-1 text-muted-foreground hover:text-foreground">
      <Icon className="w-4 h-4" /> {label}
    </button>
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

const POPULAR_ICONS = [
  "Sparkles", "Star", "Heart", "Check", "X", "Zap", "Flame", "Award", "TrendingUp", "Target",
  "Crown", "Lightbulb", "Rocket", "Gem", "Coffee", "BookOpen", "Brain", "BarChart", "PieChart", "Activity",
  "Bell", "Calendar", "Clock", "MessageCircle", "ThumbsUp", "Users", "User", "Globe", "Mail", "Phone",
  "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "ChevronRight", "Plus", "Minus", "Search", "Filter", "Settings",
];

function IconPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = POPULAR_ICONS.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pick an icon</DialogTitle></DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lucide icons (or type any name)" />
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-[55vh] overflow-y-auto">
          {filtered.map((n) => {
            const Icon = (LucideIcons as any)[n];
            return (
              <button key={n} onClick={() => onPick(n)}
                className="aspect-square rounded border border-border hover:border-primary flex flex-col items-center justify-center text-[9px] gap-1">
                {Icon ? <Icon className="w-5 h-5" /> : <span>?</span>}
                <span className="truncate w-full text-center">{n}</span>
              </button>
            );
          })}
        </div>
        {q && <Button onClick={() => onPick(q)} variant="outline" className="w-full mt-2">Use custom name "{q}"</Button>}
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
          <Button onClick={go} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateDialog({ open, onClose, design }: { open: boolean; onClose: () => void; design: Design }) {
  const [title, setTitle] = useState(design.title + " template");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      let thumb: string | null = null;
      try {
        const node = document.getElementById("design-canvas-export");
        if (node) thumb = await toPng(node, { cacheBust: true, pixelRatio: 0.4, skipAutoScale: true });
      } catch { /* ignore */ }
      await saveAsTemplate({
        title, category: category || null,
        platform: design.platform, type: design.type,
        width: design.width, height: design.height,
        slides: design.slides, thumbnail_url: thumb,
      });
      toast.success("Saved as template");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Save as template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Category (optional)</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. quote, listicle, intro" /></div>
          <Button onClick={go} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BookmarkPlus className="w-4 h-4 mr-1" />} Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
