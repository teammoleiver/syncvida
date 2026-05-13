import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Download, Plus, Trash2, ChevronLeft as PrevIcon, ChevronRight as NextIcon, Loader2, Link2, Image as ImageIcon, Sparkles, Check, LayoutGrid, Layers, Square as SquareIcon } from "lucide-react";
import EditorActions from "@/components/designer/EditorActions";
import { toast } from "sonner";
import {
  CheatSheetCanvas, CarouselCanvas, SquareCanvas,
  ACCENT_KEYS, SECTION_KINDS, CAROUSEL_LAYOUTS,
  type CheatSheetData, type CarouselData, type SquareData,
  type AccentKey, type SectionKind, type SheetSection, type CarouselSlide, type CarouselLayout,
  type Overlay,
} from "@/components/designer/linkedin/LinkedInCanvas";
import {
  SEED_CHEAT_SHEET, SEED_CAROUSEL, SEED_SQUARE, exportCanvasAsPng,
  saveCanvasAsAsset, linkAssetToPlan, getPlanEntry,
  saveCarouselAsPdf, linkPdfToPlan, renderNodeToDataUrl,
} from "@/components/designer/linkedin/editorHelpers";
import { createLinkedInTemplate, updateLinkedInTemplate, getDesign, listAssets, type DesignAsset } from "@/lib/designer-queries";
import { detectMentionedLogos, type DetectedLogo } from "@/components/designer/linkedin/detectLogos";

type TemplateKey = "cheatsheet" | "carousel" | "square";

const KIND_BY_TEMPLATE: Record<TemplateKey, "linkedin_cheatsheet" | "linkedin_carousel" | "linkedin_square"> = {
  cheatsheet: "linkedin_cheatsheet",
  carousel: "linkedin_carousel",
  square: "linkedin_square",
};

const DIMENSIONS: Record<TemplateKey, { w: number; h: number }> = {
  cheatsheet: { w: 1280, h: 1820 },
  carousel: { w: 1080, h: 1350 },
  square: { w: 1200, h: 1200 },
};

export default function LinkedInTemplatesPage() {
  const [params, setParams] = useSearchParams();
  const planId = params.get("planId") || null;
  const designIdFromUrl = params.get("id") || null;
  const presetTemplate = (params.get("preset") as TemplateKey) || "cheatsheet";

  const [active, setActive] = useState<TemplateKey>(presetTemplate);
  const [cheatData, setCheatData] = useState<CheatSheetData>(SEED_CHEAT_SHEET);
  const [carouselData, setCarouselData] = useState<CarouselData>(SEED_CAROUSEL);
  const [squareData, setSquareData] = useState<SquareData>(SEED_SQUARE);
  const [title, setTitle] = useState<string>("");
  const [designId, setDesignId] = useState<string | null>(designIdFromUrl);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [exporting, setExporting] = useState(false);
  const [savingToAssets, setSavingToAssets] = useState(false);
  const [planMeta, setPlanMeta] = useState<{ id: string; hook?: string; body?: string } | null>(null);
  const [detected, setDetected] = useState<DetectedLogo[]>([]);
  const [lastSaved, setLastSaved] = useState<{ kind: "image" | "pdf"; url: string; filename?: string; pageCount?: number } | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!designIdFromUrl);
  // Tracks whether the user has actually edited anything yet. Without this,
  // the autosave effect would create a brand-new SEED design every time the
  // editor mounts without an `?id=` — flooding the library with identical
  // copies of the cheat sheet seed and making it look like every design is
  // the same one.
  const [dirty, setDirty] = useState(false);
  // Carousel state lifted here so the center preview, the right-panel form,
  // and the action buttons in the top header all share the same slide index.
  const [slideIdx, setSlideIdx] = useState(0);
  const [savingPdf, setSavingPdf] = useState(false);
  const [zoom, setZoom] = useState(0.4);
  // Overlay editing state
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  // Load existing design (?id=xxx) — restores the form into the editor.
  useEffect(() => {
    if (!designIdFromUrl) return;
    setLoadingExisting(true);
    setDirty(false);
    (async () => {
      try {
        const d = await getDesign(designIdFromUrl);
        if (!d) { setLoadingExisting(false); return; }
        setTitle(d.title || "");
        const data = (d as any).template_data;
        if (d.kind === "linkedin_cheatsheet" && data) {
          setCheatData({ ...SEED_CHEAT_SHEET, ...data, sections: data.sections ?? SEED_CHEAT_SHEET.sections });
          setActive("cheatsheet");
        } else if (d.kind === "linkedin_carousel" && data) {
          setCarouselData({ ...SEED_CAROUSEL, ...data, slides: data.slides ?? SEED_CAROUSEL.slides });
          setActive("carousel");
        } else if (d.kind === "linkedin_square" && data) {
          setSquareData({ ...SEED_SQUARE, ...data });
          setActive("square");
        }
      } finally { setLoadingExisting(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designIdFromUrl]);

  // Seed from query params (?hook=&body=) on first mount — only when not loading an existing design.
  useEffect(() => {
    if (designIdFromUrl) return;
    const hookParam = params.get("hook");
    const bodyParam = params.get("body");
    if (hookParam || bodyParam) {
      const hook = hookParam ?? "";
      const body = bodyParam ?? "";
      setCheatData((d) => ({ ...d, title: hook || d.title, subtitle: body || d.subtitle }));
      setSquareData((d) => ({ ...d, statement: hook || d.statement, support: body || d.support }));
      setCarouselData((d) => ({
        ...d,
        slides: [
          { ...(d.slides[0] ?? {}), eyebrow: "Hook", title: hook || d.slides[0]?.title || "" },
          ...(body ? [{ eyebrow: "Body", title: body.slice(0, 80), body, accent: "teal" as AccentKey }] : []),
          ...d.slides.slice(1),
        ],
      }));
    }
    if (planId) {
      void getPlanEntry(planId).then((p) => {
        if (!p) return;
        setPlanMeta({ id: p.id, hook: p.hook, body: p.body });
        if (!hookParam && !bodyParam) {
          // Seed from the plan if not already in URL
          setCheatData((d) => ({ ...d, title: p.hook || d.title, subtitle: p.body || d.subtitle }));
          setSquareData((d) => ({ ...d, statement: p.hook || d.statement, support: p.body || d.support }));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run logo detection whenever the relevant text changes
  const watchedText = useMemo(() => {
    const cheatSections = (cheatData?.sections ?? []).map(
      (s) => `${s.title ?? ""} ${s.subtitle ?? ""} ${(s.items ?? []).join(" ")}`
    ).join(" ");
    const cheat = `${cheatData?.title ?? ""} ${cheatData?.subtitle ?? ""} ${cheatSections}`;
    const carousel = (carouselData?.slides ?? []).map((s) => `${s.title ?? ""} ${s.body ?? ""}`).join(" ");
    const square = `${squareData?.statement ?? ""} ${squareData?.support ?? ""}`;
    const planText = planMeta ? `${planMeta.hook ?? ""} ${planMeta.body ?? ""}` : "";
    return [cheat, carousel, square, planText].join(" ");
  }, [cheatData, carouselData, squareData, planMeta]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void detectMentionedLogos(watchedText).then((list) => {
        if (!cancelled) setDetected(list);
      }).catch(() => { /* */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [watchedText]);

  /**
   * Returns the active template's data, default title, and dimensions.
   */
  function activeSnapshot() {
    if (active === "cheatsheet") return { data: cheatData, title: title || cheatData.title || "Cheat sheet", dims: DIMENSIONS.cheatsheet };
    if (active === "carousel") return { data: carouselData, title: title || carouselData.slides?.[0]?.title || "Carousel", dims: DIMENSIONS.carousel };
    return { data: squareData, title: title || squareData.statement?.slice(0, 60) || "Hot take", dims: DIMENSIONS.square };
  }

  /**
   * Persist the current template into the designs table — creates a new row
   * the first time, then updates it on every subsequent change. Called by
   * the debounced autosave effect and by the explicit Save button.
   */
  async function persist(): Promise<string | null> {
    if (loadingExisting) return designId;
    const snap = activeSnapshot();
    setSaveStatus("saving");
    try {
      if (designId) {
        await updateLinkedInTemplate(designId, { title: snap.title, template_data: snap.data });
      } else {
        const created = await createLinkedInTemplate({
          kind: KIND_BY_TEMPLATE[active],
          title: snap.title,
          template_data: snap.data,
          width: snap.dims.w,
          height: snap.dims.h,
          type: active === "carousel" ? "carousel" : "single",
          planner_entry_id: planId,
        });
        setDesignId(created.id);
        // Keep the URL in sync so refresh / share works.
        const next = new URLSearchParams(params);
        next.set("id", created.id);
        setParams(next, { replace: true });
        setSaveStatus("saved");
        return created.id;
      }
      setSaveStatus("saved");
      return designId;
    } catch {
      setSaveStatus("error");
      return designId;
    }
  }

  // Debounced autosave: 1.2s after the last edit.
  useEffect(() => {
    if (loadingExisting) return;
    // Don't auto-create a new design from the seed — wait until the user
    // actually edits something. Existing designs (have an id) still autosave.
    if (!designId && !dirty) return;
    const t = setTimeout(() => { void persist(); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheatData, carouselData, squareData, title, active, loadingExisting, designId, dirty]);

  async function exportCurrent(extra = "") {
    setExporting(true);
    try {
      const fname = `linkedin-${active}${extra ? "-" + extra : ""}-${Date.now()}`;
      await exportCanvasAsPng(fname);
      toast.success("Exported PNG");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setExporting(false); }
  }

  /**
   * Save the current canvas to the user's Asset Library, and (if a planId is
   * present) update the post's image_url so the visual is wired to the post.
   */
  async function saveAndLinkCurrent(extra = "") {
    setSavingToAssets(true);
    try {
      const name = `LinkedIn ${active}${extra ? " " + extra : ""}`;
      const asset = await saveCanvasAsAsset(name);
      if (planId) {
        await linkAssetToPlan(planId, asset.public_url);
        toast.success("Saved to assets and linked to post");
      } else {
        toast.success("Saved to Asset Library");
      }
      setLastSaved({ kind: "image", url: asset.public_url });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSavingToAssets(false); }
  }

  function notePdfSaved(info: { url: string; filename: string; pageCount: number }) {
    setLastSaved({ kind: "pdf", ...info });
  }

  function backToPost() {
    // Try to close the tab if we were opened with window.open (window.opener exists),
    // otherwise navigate to the planner so the user lands on the post.
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      window.close();
    } else {
      window.location.href = "/content-planner";
    }
  }

  function injectToolsIntoCheatSheet(names: string[]) {
    const existing = cheatData.sections.find((s) => s.kind === "tools");
    if (existing) {
      const merged = Array.from(new Set([...(existing.items ?? []), ...names]));
      setCheatData({
        ...cheatData,
        sections: cheatData.sections.map((s) => s === existing ? { ...s, items: merged } : s),
      });
    } else {
      setCheatData({
        ...cheatData,
        sections: [
          ...cheatData.sections,
          { tag: "Stack", accent: "sky", title: "Tools in the loop.", kind: "tools", items: names },
        ],
      });
    }
    toast.success(`Added ${names.length} tool${names.length === 1 ? "" : "s"} to the Cheat Sheet`);
  }

  /** Read the overlays array for the active preset+slide. */
  function getOverlays(): Overlay[] {
    if (active === "cheatsheet") return cheatData.overlays ?? [];
    if (active === "square") return squareData.overlays ?? [];
    return carouselData.overlays?.[slideIdx] ?? [];
  }

  /** Persist a new overlays array back into whichever data shape is active. */
  function setOverlays(next: Overlay[]) {
    if (active === "cheatsheet") setCheatData({ ...cheatData, overlays: next });
    else if (active === "square") setSquareData({ ...squareData, overlays: next });
    else setCarouselData({
      ...carouselData,
      overlays: { ...(carouselData.overlays ?? {}), [slideIdx]: next },
    });
  }

  function addOverlay(o: Overlay) {
    setOverlays([...getOverlays(), o]);
    setSelectedOverlayId(o.id);
  }

  function updateSelectedOverlay(patch: Partial<Overlay>) {
    if (!selectedOverlayId) return;
    setOverlays(getOverlays().map((o) => o.id === selectedOverlayId ? ({ ...o, ...patch } as Overlay) : o));
  }

  function deleteSelectedOverlay() {
    if (!selectedOverlayId) return;
    setOverlays(getOverlays().filter((o) => o.id !== selectedOverlayId));
    setSelectedOverlayId(null);
  }

  function addImageFromAsset(asset: DesignAsset) {
    addOverlay({ id: crypto.randomUUID(), type: "image", x: 100, y: 100, w: 240, h: 240, src: asset.public_url, objectFit: "contain" });
    setAssetPickerOpen(false);
  }

  function addTextOverlay() {
    addOverlay({ id: crypto.randomUUID(), type: "text", x: 100, y: 100, w: 480, h: 80, text: "New text", fontSize: 36, fontWeight: 700, color: "#F5F1E8", align: "left" });
  }

  function addShapeOverlay(shape: "rect" | "circle") {
    addOverlay({ id: crypto.randomUUID(), type: "shape", x: 100, y: 100, w: 200, h: 200, shape, fill: shape === "circle" ? "#E8654A" : "#141928", radius: shape === "rect" ? 12 : 0, stroke: "#FFFFFF14", strokeWidth: 1 });
  }

  /** Export current preview (single slide for carousel) as PNG download. */
  async function exportCurrentPng() {
    setExporting(true);
    try {
      const fname = `linkedin-${active}-${active === "carousel" ? `slide-${String(slideIdx + 1).padStart(2, "0")}-` : ""}${Date.now()}`;
      await exportCanvasAsPng(fname);
      toast.success("Exported PNG");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setExporting(false); }
  }

  /** Carousel-only: render every slide → PDF → upload → link to plan as document. */
  async function saveCarouselPdfAndLink() {
    setSavingPdf(true);
    try {
      const renderSlide = async (i: number): Promise<string> => {
        setSlideIdx(i);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
        return renderNodeToDataUrl("canvas-export");
      };
      const pdf = await saveCarouselAsPdf(carouselData.slides.length, renderSlide, "linkedin-carousel");
      setSlideIdx(0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
      const cover = await saveCanvasAsAsset("LinkedIn carousel cover");
      if (planId) {
        await linkPdfToPlan(planId, pdf.public_url, pdf.filename, cover.public_url);
        toast.success(`Saved ${pdf.pageCount}-page PDF and linked to post`);
      } else {
        toast.success(`Saved ${pdf.pageCount}-page PDF to assets · ${pdf.filename}`);
      }
      setLastSaved({ kind: "pdf", url: pdf.public_url, filename: pdf.filename, pageCount: pdf.pageCount });
    } catch (e: any) {
      toast.error(e?.message ?? "PDF export failed");
    } finally { setSavingPdf(false); }
  }

  /** Export every carousel slide as separate PNG downloads. */
  async function exportAllSlidesPng() {
    for (let i = 0; i < carouselData.slides.length; i++) {
      setSlideIdx(i);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
      await exportCanvasAsPng(`linkedin-carousel-${String(i + 1).padStart(2, "0")}-${Date.now()}`);
    }
    toast.success(`Exported ${carouselData.slides.length} slides`);
  }

  const dims = DIMENSIONS[active];

  return (
    <section className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top header — same shell as the canvas DesignEditor */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to="/designer"><ChevronLeft className="w-4 h-4" /></Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={designId ? "Untitled template" : "New LinkedIn template"}
            className="max-w-xs h-8"
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {dims.w}×{dims.h} · linkedin
          </span>
          <SaveStatusBadge status={saveStatus} />
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.1, z * 0.85))} title="Zoom out">−</Button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z * 1.15))} title="Zoom in">+</Button>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {planMeta && (
            <a
              href="/content-planner"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              title={`Linked to: ${planMeta.hook}`}
            >
              <Link2 className="w-3 h-3" /> Linked to post
            </a>
          )}
          <EditorActions
            onExportImage={exportCurrentPng}
            onSecondary={active === "carousel" ? { label: "Export all slides", onClick: exportAllSlidesPng } : undefined}
            onSaveImage={() => saveAndLinkCurrent(active === "carousel" ? `slide-${String(slideIdx + 1).padStart(2, "0")}` : "")}
            onSavePdf={active === "carousel" ? saveCarouselPdfAndLink : undefined}
            hasPlan={!!planId}
            exporting={exporting}
            saving={savingToAssets}
            savingPdf={savingPdf}
          />
        </div>
      </header>

      {/* Optional banners stack — non-overlapping, above the main editor */}
      {(detected.length > 0 || lastSaved) && (
        <div className="px-3 py-2 border-b border-border space-y-2 max-h-44 overflow-auto">
          {lastSaved && (
            <Card className="p-3 border-emerald-500/60 bg-emerald-500/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-semibold">
                  {lastSaved.kind === "pdf"
                    ? `PDF carousel saved — ${lastSaved.pageCount} pages${planId ? " · linked to post" : ""}`
                    : `Image saved${planId ? " · linked to post" : ""}`}
                </span>
                <span className="text-[11px] text-muted-foreground ml-2 truncate">{lastSaved.filename ?? lastSaved.url}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button asChild size="sm" variant="ghost"><a href={lastSaved.url} target="_blank" rel="noreferrer">View</a></Button>
                {planId && <Button size="sm" onClick={backToPost} className="bg-emerald-600 hover:bg-emerald-700 text-white">Back to post →</Button>}
                <Button size="sm" variant="ghost" onClick={() => setLastSaved(null)}>×</Button>
              </div>
            </Card>
          )}
          {detected.length > 0 && (
            <Card className="p-2.5 flex items-center gap-2 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium">Detected:</span>
              <div className="flex flex-wrap gap-1">
                {detected.map((d) => (
                  <span key={d.name} className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border text-[11px] ${d.hasAsset ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"}`}>
                    {d.asset?.public_url ? <img src={d.asset.public_url} className="w-4 h-4 rounded-full object-cover" alt={d.name} /> : <ImageIcon className="w-2.5 h-2.5 ml-0.5 text-muted-foreground" />}
                    {d.name}
                    {d.hasAsset && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                  </span>
                ))}
              </div>
              <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => injectToolsIntoCheatSheet(detected.map((d) => d.name))}>
                <Plus className="w-3 h-3 mr-1" /> Add to sheet
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* Main grid: left preset sidebar | center preview | right form panel */}
      <div className="flex-1 grid grid-cols-[80px_1fr_360px] min-h-0">
        {/* Left: preset selector */}
        <div className="border-r border-border p-2 flex flex-col gap-1 overflow-auto">
          <PresetTile active={active === "cheatsheet"} onClick={() => setActive("cheatsheet")} icon={<LayoutGrid className="w-4 h-4" />} label="Sheet" />
          <PresetTile active={active === "carousel"} onClick={() => setActive("carousel")} icon={<Layers className="w-4 h-4" />} label="Slides" />
          <PresetTile active={active === "square"} onClick={() => setActive("square")} icon={<SquareIcon className="w-4 h-4" />} label="Square" />
        </div>

        {/* Center: live preview */}
        <div className="overflow-auto bg-muted/30 flex items-start justify-center p-8">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
            {active === "cheatsheet" && (
              <CheatSheetCanvas
                data={cheatData}
                editableOverlays
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
                onChangeOverlays={(next) => setCheatData({ ...cheatData, overlays: next })}
                zoom={zoom}
              />
            )}
            {active === "carousel" && (
              <CarouselCanvas
                data={carouselData}
                slideIndex={slideIdx}
                editableOverlays
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
                onChangeOverlays={(next) => setCarouselData({ ...carouselData, overlays: { ...(carouselData.overlays ?? {}), [slideIdx]: next } })}
                zoom={zoom}
              />
            )}
            {active === "square" && (
              <SquareCanvas
                data={squareData}
                editableOverlays
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
                onChangeOverlays={(next) => setSquareData({ ...squareData, overlays: next })}
                zoom={zoom}
              />
            )}
          </div>
        </div>

        {/* Right: form fields + elements layer for the active preset */}
        <div className="border-l border-border overflow-auto p-3 space-y-3">
          <ElementsPanel
            overlays={getOverlays()}
            selectedId={selectedOverlayId}
            onSelect={setSelectedOverlayId}
            onAddImage={() => setAssetPickerOpen(true)}
            onAddText={addTextOverlay}
            onAddShape={addShapeOverlay}
            onUpdate={updateSelectedOverlay}
            onDelete={deleteSelectedOverlay}
          />
          <div className="border-t border-border pt-3">
            {active === "cheatsheet" && <CheatSheetForm data={cheatData} setData={setCheatData} />}
            {active === "carousel" && <CarouselForm data={carouselData} setData={setCarouselData} slideIdx={slideIdx} setSlideIdx={setSlideIdx} />}
            {active === "square" && <SquareForm data={squareData} setData={setSquareData} />}
          </div>
        </div>
      </div>

      <AssetPickerDialog open={assetPickerOpen} onClose={() => setAssetPickerOpen(false)} onPick={addImageFromAsset} />
    </section>
  );
}

function PresetTile({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] gap-1 transition ${
        active ? "bg-primary/15 text-primary border border-primary/40" : "hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------- Shared form bits ---------- */

function FieldText({ label, value, onChange, placeholder, multiline, max, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; max?: number; rows?: number }) {
  const len = (value ?? "").length;
  const over = typeof max === "number" && len > max;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {typeof max === "number" && (
          <span className={`text-[10px] tabular-nums ${over ? "text-destructive font-semibold" : len > max * 0.85 ? "text-amber-500" : "text-muted-foreground/60"}`}>
            {len} / {max}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea rows={rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full text-sm p-2 rounded-md border bg-background ${over ? "border-destructive/60" : "border-border"}`} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={over ? "border-destructive/60" : undefined} />
      )}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, hint }: { items: string[]; onChange: (next: string[]) => void; placeholder?: string; hint?: string }) {
  const update = (i: number, v: string) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1">
          <Input value={it} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} className="text-xs" />
          <Button size="icon" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...items, ""])}>
        <Plus className="w-3 h-3 mr-1" /> Add item
      </Button>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PreviewWrap({ children, scale = 0.5 }: { children: React.ReactNode; scale?: number }) {
  return (
    <div className="bg-muted/40 rounded-md p-4 overflow-auto max-h-[80vh]">
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Cheat Sheet editor ---------- */

function CheatSheetForm({ data, setData }: { data: CheatSheetData; setData: (d: CheatSheetData) => void }) {
  const update = (patch: Partial<CheatSheetData>) => setData({ ...data, ...patch });
  const updateSection = (i: number, patch: Partial<SheetSection>) =>
    setData({ ...data, sections: data.sections.map((s, j) => j === i ? { ...s, ...patch } : s) });

  return (
    <>
        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Header</h3>
          <FieldText label="Author" value={data.author} onChange={(v) => update({ author: v })} />
          <FieldText label="Handle (without @)" value={data.handleShort ?? ""} onChange={(v) => update({ handleShort: v })} />
          <FieldText label="Type label" value={data.typeLabel ?? "Cheat Sheet"} onChange={(v) => update({ typeLabel: v })} />
          <FieldText label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => update({ eyebrow: v })} />
          <FieldText label="Title" value={data.title} onChange={(v) => update({ title: v })} multiline />
          <FieldText label="Subtitle" value={data.subtitle ?? ""} onChange={(v) => update({ subtitle: v })} multiline />
        </Card>

        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sections</h3>
            <Button size="sm" variant="outline" onClick={() => setData({ ...data, sections: [...data.sections, { tag: "New", title: "", kind: "bullets", items: [] }] })}>
              <Plus className="w-3 h-3 mr-1" /> Add section
            </Button>
          </div>
          {data.sections.map((s, i) => (
            <div key={i} className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">SECTION {String(i + 1).padStart(2, "0")}</span>
                <Button size="icon" variant="ghost" onClick={() => setData({ ...data, sections: data.sections.filter((_, j) => j !== i) })}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldText label="Tag" value={s.tag} onChange={(v) => updateSection(i, { tag: v })} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Accent</label>
                  <Select value={s.accent ?? "coral"} onValueChange={(v) => updateSection(i, { accent: v as AccentKey })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCENT_KEYS.slice(0, 7).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <FieldText label="Title" value={s.title} onChange={(v) => updateSection(i, { title: v })} />
              <FieldText label="Subtitle" value={s.subtitle ?? ""} onChange={(v) => updateSection(i, { subtitle: v })} multiline />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Kind</label>
                <Select value={s.kind} onValueChange={(v) => updateSection(i, { kind: v as SectionKind })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{SECTION_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {s.kind !== "table" && (
                <ListEditor
                  items={s.items ?? []}
                  onChange={(next) => updateSection(i, { items: next })}
                  placeholder={kindHint(s.kind)}
                  hint={kindHelp(s.kind)}
                />
              )}
              {s.kind === "table" && (
                <TableEditor table={s.table ?? { headers: ["", ""], rows: [["", ""]] }} onChange={(t) => updateSection(i, { table: t })} />
              )}
            </div>
          ))}
        </Card>

        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Footer</h3>
          <FieldText label="Closer" value={data.closer ?? ""} onChange={(v) => update({ closer: v })} />
          <FieldText label="Attribution" value={data.attribution ?? ""} onChange={(v) => update({ attribution: v })} />
        </Card>
    </>
  );
}

function kindHint(kind: SectionKind): string {
  switch (kind) {
    case "stats": return 'value :: label :: description  (e.g. "70% :: workflow gain :: time saved")';
    case "tools": return 'tool name (e.g. "Clay") or "Name :: Mono :: #color :: #fg"';
    case "bars": return 'label :: value :: suffix  (e.g. "Manual :: 42 :: m")';
    case "donut": return 'label :: value';
    default: return "Item text";
  }
}

function kindHelp(kind: SectionKind): string {
  if (["stats", "tools", "bars", "donut"].includes(kind)) {
    return "Use :: to separate fields per item.";
  }
  return "";
}

function TableEditor({ table, onChange }: { table: { headers: string[]; rows: string[][] }; onChange: (t: { headers: string[]; rows: string[][] }) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Table</div>
      <div className="grid grid-cols-2 gap-1">
        {table.headers.map((h, i) => (
          <Input key={i} value={h} onChange={(e) => onChange({ ...table, headers: table.headers.map((x, j) => j === i ? e.target.value : x) })} placeholder={`Header ${i + 1}`} className="text-xs" />
        ))}
      </div>
      {table.rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-2 gap-1">
          {row.map((cell, ci) => (
            <Input key={ci} value={cell} onChange={(e) => {
              const next = table.rows.map((r, j) => j === ri ? r.map((c, k) => k === ci ? e.target.value : c) : r);
              onChange({ ...table, rows: next });
            }} placeholder={`Row ${ri + 1}, col ${ci + 1}`} className="text-xs" />
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onChange({ ...table, rows: [...table.rows, table.headers.map(() => "")] })}>
          <Plus className="w-3 h-3 mr-1" /> Add row
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...table, rows: table.rows.slice(0, -1) })} disabled={table.rows.length <= 1}>
          Remove last
        </Button>
      </div>
    </div>
  );
}

/* ---------- Carousel editor ---------- */

const LAYOUT_LABEL: Record<CarouselLayout, string> = {
  text: "Text — title + body",
  cover: "Cover — hook slide",
  stat: "Stat — giant number",
  quote: "Quote — pull quote",
  bullets: "Bullets — 3–5 punchy items",
  comparison: "Comparison — before / after",
};

function CarouselForm({ data, setData, slideIdx, setSlideIdx }: { data: CarouselData; setData: (d: CarouselData) => void; slideIdx: number; setSlideIdx: (n: number) => void }) {
  const update = (patch: Partial<CarouselData>) => setData({ ...data, ...patch });
  const updateSlide = (i: number, patch: Partial<CarouselSlide>) =>
    setData({ ...data, slides: data.slides.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const slide = data.slides[slideIdx] ?? data.slides[0];
  const layout: CarouselLayout = slide?.layout || "text";

  return (
    <>
        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Header</h3>
          <FieldText label="Author" value={data.author} onChange={(v) => update({ author: v })} />
          <FieldText label="Handle" value={data.handleShort ?? ""} onChange={(v) => update({ handleShort: v })} />
          <FieldText label="Type label" value={data.typeLabel ?? "Carousel"} onChange={(v) => update({ typeLabel: v })} />
        </Card>

        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Slides ({data.slides.length})</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))}><PrevIcon className="w-3 h-3" /></Button>
              <span className="text-xs text-muted-foreground self-center">{slideIdx + 1} / {data.slides.length}</span>
              <Button size="sm" variant="ghost" onClick={() => setSlideIdx(Math.min(data.slides.length - 1, slideIdx + 1))}><NextIcon className="w-3 h-3" /></Button>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => { setData({ ...data, slides: [...data.slides, { title: "New slide", body: "", accent: "coral", layout: "text" }] }); setSlideIdx(data.slides.length); }}>
              <Plus className="w-3 h-3 mr-1" /> Add slide
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              if (data.slides.length <= 1) return;
              setData({ ...data, slides: data.slides.filter((_, j) => j !== slideIdx) });
              setSlideIdx(Math.max(0, slideIdx - 1));
            }} disabled={data.slides.length <= 1}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
          {slide && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Layout</label>
                <Select value={layout} onValueChange={(v) => updateSlide(slideIdx, { layout: v as CarouselLayout })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAROUSEL_LAYOUTS.map((k) => <SelectItem key={k} value={k}>{LAYOUT_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <FieldText label="Eyebrow" value={slide.eyebrow ?? ""} onChange={(v) => updateSlide(slideIdx, { eyebrow: v })} max={20} />

              {layout === "text" && (
                <>
                  <FieldText label="Title" value={slide.title} onChange={(v) => updateSlide(slideIdx, { title: v })} multiline max={100} />
                  <FieldText label="Body" value={slide.body ?? ""} onChange={(v) => updateSlide(slideIdx, { body: v })} multiline max={220} rows={4} />
                </>
              )}

              {layout === "cover" && (
                <>
                  <FieldText label="Title (hook)" value={slide.title} onChange={(v) => updateSlide(slideIdx, { title: v })} multiline max={120} rows={3} />
                  <FieldText label="Subtitle (optional)" value={slide.body ?? ""} onChange={(v) => updateSlide(slideIdx, { body: v })} multiline max={120} />
                </>
              )}

              {layout === "stat" && (
                <>
                  <FieldText label="Stat value (e.g. 80%, 3x, $2M)" value={slide.statValue ?? ""} onChange={(v) => updateSlide(slideIdx, { statValue: v })} max={12} />
                  <FieldText label="Stat label" value={slide.statLabel ?? ""} onChange={(v) => updateSlide(slideIdx, { statLabel: v })} multiline max={80} />
                  <FieldText label="Context (optional)" value={slide.body ?? ""} onChange={(v) => updateSlide(slideIdx, { body: v })} multiline max={80} />
                </>
              )}

              {layout === "quote" && (
                <>
                  <FieldText label="Quote" value={slide.quote ?? slide.title} onChange={(v) => updateSlide(slideIdx, { quote: v, title: v })} multiline max={180} rows={4} />
                  <FieldText label="Attribution (optional)" value={slide.quoteAuthor ?? ""} onChange={(v) => updateSlide(slideIdx, { quoteAuthor: v })} max={40} />
                </>
              )}

              {layout === "bullets" && (
                <>
                  <FieldText label="Title" value={slide.title} onChange={(v) => updateSlide(slideIdx, { title: v })} multiline max={80} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Bullets (3–5 max)</label>
                    <ListEditor
                      items={slide.bullets ?? []}
                      onChange={(next) => updateSlide(slideIdx, { bullets: next.slice(0, 5) })}
                      placeholder="Short, punchy line (≤ 70 chars)"
                      hint="Keep each bullet to one tight idea. Long bullets get truncated."
                    />
                  </div>
                </>
              )}

              {layout === "comparison" && (
                <>
                  <FieldText label="Title" value={slide.title} onChange={(v) => updateSlide(slideIdx, { title: v })} multiline max={70} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <FieldText label="Left label" value={slide.leftLabel ?? "Before"} onChange={(v) => updateSlide(slideIdx, { leftLabel: v })} max={20} />
                    </div>
                    <div className="space-y-1">
                      <FieldText label="Right label" value={slide.rightLabel ?? "After"} onChange={(v) => updateSlide(slideIdx, { rightLabel: v })} max={20} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Left items</label>
                    <ListEditor
                      items={slide.leftItems ?? []}
                      onChange={(next) => updateSlide(slideIdx, { leftItems: next.slice(0, 4) })}
                      placeholder="Old-way item (≤ 50 chars)"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Right items</label>
                    <ListEditor
                      items={slide.rightItems ?? []}
                      onChange={(next) => updateSlide(slideIdx, { rightItems: next.slice(0, 4) })}
                      placeholder="New-way item (≤ 50 chars)"
                    />
                  </div>
                </>
              )}

              <FieldText label="Closer" value={slide.closer ?? ""} onChange={(v) => updateSlide(slideIdx, { closer: v })} max={30} />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Accent</label>
                <Select value={slide.accent ?? "coral"} onValueChange={(v) => updateSlide(slideIdx, { accent: v as AccentKey })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCENT_KEYS.slice(0, 7).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>
    </>
  );
}

/* ---------- Square editor ---------- */

function SquareForm({ data, setData }: { data: SquareData; setData: (d: SquareData) => void }) {
  const update = (patch: Partial<SquareData>) => setData({ ...data, ...patch });
  return (
    <>
        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Header</h3>
          <FieldText label="Author" value={data.author} onChange={(v) => update({ author: v })} />
          <FieldText label="Handle" value={data.handleShort ?? ""} onChange={(v) => update({ handleShort: v })} />
          <FieldText label="Type label" value={data.typeLabel ?? "Hot Take"} onChange={(v) => update({ typeLabel: v })} />
        </Card>

        <Card className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Statement</h3>
          <FieldText label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => update({ eyebrow: v })} />
          <FieldText
            label="Statement (wrap *highlights* in single asterisks for coral)"
            value={data.statement} onChange={(v) => update({ statement: v })}
            multiline placeholder={`e.g. "If you're still doing X, you're *18 months behind*."`}
          />
          <FieldText label="Support" value={data.support ?? ""} onChange={(v) => update({ support: v })} multiline />
          <FieldText label="Closer" value={data.closer ?? ""} onChange={(v) => update({ closer: v })} />
          <FieldText label="Attribution" value={data.attribution ?? ""} onChange={(v) => update({ attribution: v })} />
        </Card>
    </>
  );
}

function SaveStatusBadge({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border ${
      status === "saving" ? "border-border text-muted-foreground"
      : status === "saved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-destructive/40 bg-destructive/10 text-destructive"
    }`}>
      {status === "saving" ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving</> : status === "saved" ? <><Check className="w-3 h-3" /> Saved</> : <>Save failed</>}
    </span>
  );
}

/* ---------- Elements panel (overlay manager) ---------- */

function ElementsPanel({
  overlays, selectedId, onSelect,
  onAddImage, onAddText, onAddShape,
  onUpdate, onDelete,
}: {
  overlays: Overlay[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddImage: () => void;
  onAddText: () => void;
  onAddShape: (s: "rect" | "circle") => void;
  onUpdate: (patch: Partial<Overlay>) => void;
  onDelete: () => void;
}) {
  const sel = overlays.find((o) => o.id === selectedId) ?? null;
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Elements</h3>
        {overlays.length > 0 && <Badge variant="secondary" className="text-[10px]">{overlays.length}</Badge>}
      </div>
      <p className="text-[10px] text-muted-foreground">Add free-position layers on top of the template — logos, text labels, shapes. Click to select, drag to move, drag the corner handle to resize.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" onClick={onAddImage}><ImageIcon className="w-3 h-3 mr-1" /> Image</Button>
        <Button size="sm" variant="outline" onClick={onAddText}>Aa Text</Button>
        <Button size="sm" variant="outline" onClick={() => onAddShape("rect")}>Rect</Button>
        <Button size="sm" variant="outline" onClick={() => onAddShape("circle")}>Circle</Button>
      </div>

      {overlays.length > 0 && (
        <div className="border-t border-border pt-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Layers</div>
          {overlays.map((o, i) => (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                o.id === selectedId ? "bg-primary/15 border border-primary/40" : "hover:bg-muted border border-transparent"
              }`}
            >
              <span className="text-[10px] font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="capitalize">{o.type}</span>
              {o.type === "text" && <span className="text-muted-foreground truncate flex-1">{(o as any).text?.slice(0, 30)}</span>}
              {o.type === "image" && <span className="text-muted-foreground truncate flex-1">{(o as any).src?.split("/").pop()?.slice(0, 30)}</span>}
              {o.type === "shape" && <span className="text-muted-foreground flex-1">{(o as any).shape}</span>}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="border-t border-border pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Selected · {sel.type}</div>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumField label="X" value={sel.x} onChange={(v) => onUpdate({ x: v })} />
            <NumField label="Y" value={sel.y} onChange={(v) => onUpdate({ y: v })} />
            <NumField label="W" value={sel.w} onChange={(v) => onUpdate({ w: v })} />
            <NumField label="H" value={sel.h} onChange={(v) => onUpdate({ h: v })} />
          </div>
          {sel.type === "text" && (
            <>
              <FieldText label="Text" value={(sel as any).text} onChange={(v) => onUpdate({ text: v } as any)} multiline />
              <div className="grid grid-cols-2 gap-1.5">
                <NumField label="Size" value={(sel as any).fontSize} onChange={(v) => onUpdate({ fontSize: v } as any)} />
                <NumField label="Weight" value={(sel as any).fontWeight ?? 600} onChange={(v) => onUpdate({ fontWeight: v } as any)} />
              </div>
              <FieldText label="Color (#hex)" value={(sel as any).color ?? ""} onChange={(v) => onUpdate({ color: v } as any)} />
            </>
          )}
          {sel.type === "image" && (
            <>
              <FieldText label="Image URL" value={(sel as any).src ?? ""} onChange={(v) => onUpdate({ src: v } as any)} />
              <NumField label="Corner radius" value={(sel as any).radius ?? 0} onChange={(v) => onUpdate({ radius: v } as any)} />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fit</label>
                <Select value={(sel as any).objectFit ?? "contain"} onValueChange={(v) => onUpdate({ objectFit: v as any } as any)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contain">contain (full logo visible)</SelectItem>
                    <SelectItem value="cover">cover (fill the box)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {sel.type === "shape" && (
            <>
              <FieldText label="Fill (#hex)" value={(sel as any).fill ?? ""} onChange={(v) => onUpdate({ fill: v } as any)} />
              <NumField label="Corner radius" value={(sel as any).radius ?? 0} onChange={(v) => onUpdate({ radius: v } as any)} />
              <FieldText label="Stroke (#hex, optional)" value={(sel as any).stroke ?? ""} onChange={(v) => onUpdate({ stroke: v } as any)} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="text-xs h-8" />
    </div>
  );
}

/* ---------- Asset picker dialog ---------- */

function AssetPickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: DesignAsset) => void }) {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAssets().then((a) => setAssets(a)).finally(() => setLoading(false));
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-background rounded-lg border border-border w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Pick an asset</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No assets yet. Upload some at <code>/designer/assets</code> first.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {assets.map((a) => (
                <button key={a.id} onClick={() => onPick(a)} className="aspect-square rounded-md border border-border overflow-hidden hover:border-primary transition">
                  <img src={a.public_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
