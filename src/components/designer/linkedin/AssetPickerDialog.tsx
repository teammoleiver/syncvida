import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Loader2, Image as ImageIcon, Search, X, Check, ArrowLeft, Pencil, RefreshCw, Layers } from "lucide-react";
import { toast } from "sonner";
import { listAssets, uploadAssetWithProgress, type DesignAsset } from "@/lib/designer-queries";
import { BUILTIN_ASSETS } from "@/lib/builtin-assets";
import { removeWhiteBackground } from "@/lib/designer-utils";

type SortKey = "newest" | "oldest" | "name";
type AspectKey = "1:1" | "4:5" | "16:9" | "free";
const ASPECT_VALUE: Record<AspectKey, number | undefined> = { "1:1": 1, "4:5": 4 / 5, "16:9": 16 / 9, "free": undefined };

type Stage = "browse" | "crop" | "caption" | "uploading";

/** Canvas size hint for smart sizing — pass the actual canvas pixel dimensions */
export interface CanvasSize { w: number; h: number }

/**
 * Compute the ideal w/h to place a logo/image on a canvas at ~15% width,
 * keeping aspect ratio and clamping to reasonable bounds.
 */
function idealSize(
  naturalW: number,
  naturalH: number,
  canvas: CanvasSize | undefined,
): { w: number; h: number } {
  // Target ~15% of canvas width for logos, fallback 200px
  const target = canvas ? Math.round(canvas.w * 0.15) : 200;
  const maxDim = Math.max(target, 120);
  let w = naturalW || maxDim;
  let h = naturalH || maxDim;
  const ratio = w / h;
  if (w > maxDim || h > maxDim) {
    if (ratio > 1) { w = maxDim; h = Math.round(maxDim / ratio); }
    else { h = maxDim; w = Math.round(maxDim * ratio); }
  }
  // Ensure minimum reasonable size
  if (w < 60) { const s = 60 / w; w = 60; h = Math.round(h * s); }
  if (h < 60) { const s = 60 / h; h = 60; w = Math.round(w * s); }
  return { w, h };
}

/** Load an image and resolve with element */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Logo detail/preview panel shown before inserting */
function LogoDetailPanel({
  item,
  canvasSize,
  onBack,
  onPick,
}: {
  item: any;
  canvasSize?: CanvasSize;
  onBack: () => void;
  onPick: (asset: DesignAsset & { removeBg?: boolean; customName?: string }) => void;
}) {
  const [removeBg, setRemoveBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transparentSrc, setTransparentSrc] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string>(item.name ?? "");
  const [editingName, setEditingName] = useState(false);

  const displaySrc = removeBg ? (transparentSrc ?? item.public_url) : item.public_url;

  const handleToggleBg = useCallback(async (on: boolean) => {
    setRemoveBg(on);
    if (on && !transparentSrc) {
      setProcessing(true);
      try {
        const result = await removeWhiteBackground(item.public_url);
        setTransparentSrc(result);
      } catch {
        toast.error("Could not remove background");
        setRemoveBg(false);
      } finally {
        setProcessing(false);
      }
    }
  }, [item.public_url, transparentSrc]);

  async function handleAdd() {
    const src = removeBg ? (transparentSrc ?? item.public_url) : item.public_url;
    // Compute ideal size
    try {
      const img = await loadImg(src);
      const { w, h } = idealSize(img.naturalWidth, img.naturalHeight, canvasSize);
      onPick({
        ...item,
        public_url: src,
        originalSrc: item.public_url,
        removeBg,
        customName: customName.trim() || item.name,
        _idealW: w,
        _idealH: h,
      } as any);
    } catch {
      onPick({
        ...item,
        public_url: src,
        originalSrc: item.public_url,
        removeBg,
        customName: customName.trim() || item.name,
      } as any);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Back button */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">Logo preview</span>
      </div>

      <div className="flex-1 overflow-auto p-5 flex flex-col gap-5">
        {/* Preview area */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div
            className="w-full flex items-center justify-center p-8 min-h-[180px] transition-colors"
            style={{ background: removeBg ? "repeating-conic-gradient(#888 0% 25%, #ccc 0% 50%) 0 / 20px 20px" : "#0E0E0E" }}
          >
            {processing ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <img
                key={displaySrc}
                src={displaySrc}
                alt={customName}
                className="max-h-40 max-w-full object-contain"
              />
            )}
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/10 border-t border-border gap-3">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingName(false); }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingName(false)}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 group w-full text-left"
                  onClick={() => setEditingName(true)}
                  title="Click to rename"
                >
                  <span className="text-sm font-semibold truncate">{customName || item.name}</span>
                  <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0" />
                </button>
              )}
              <span className="text-[10px] text-muted-foreground capitalize block mt-0.5">{item.category ?? "Logo"}</span>
            </div>
          </div>
        </div>

        {/* Background removal toggle */}
        <div className="rounded-lg border border-border bg-muted/10 p-3 flex items-start gap-3">
          <Layers className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Remove white background</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Makes solid white pixel areas transparent for a clean overlay on any slide color.
                </p>
              </div>
              <Switch
                checked={removeBg}
                onCheckedChange={handleToggleBg}
                disabled={processing}
              />
            </div>
            {removeBg && transparentSrc && (
              <p className="text-[10px] text-emerald-500 mt-1.5">✓ Background removed — transparent PNG ready</p>
            )}
          </div>
        </div>

        {/* Edit name hint */}
        <div className="rounded-lg border border-border bg-muted/10 p-3 flex items-start gap-3">
          <Pencil className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">Edit logo name</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Click the name above to rename this logo for this session (e.g. if the name in the library is abbreviated or incorrect).
            </p>
          </div>
        </div>

        {/* Size note */}
        {canvasSize && (
          <div className="rounded-lg border border-border bg-muted/10 p-3">
            <p className="text-xs font-semibold">Smart sizing</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Logo will be placed at the optimal size for your {canvasSize.w}×{canvasSize.h} canvas (~15% width) — crisp, non-pixelated, and proportional.
            </p>
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="p-4 border-t border-border shrink-0 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>Cancel</Button>
        <Button className="flex-1" onClick={handleAdd} disabled={processing}>
          {processing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
          Add to slide
        </Button>
      </div>
    </div>
  );
}

export default function AssetPickerDialog({
  open, onClose, onPick, defaultAspect = "1:1", canvasSize,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (a: DesignAsset & { _idealW?: number; _idealH?: number; removeBg?: boolean; originalSrc?: string }) => void;
  defaultAspect?: AspectKey;
  canvasSize?: CanvasSize;
}) {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [activeTab, setActiveTab] = useState<"uploads" | "logos" | "symbols" | "charts">("uploads");
  const [sectorLogos, setSectorLogos] = useState<any[]>([]);
  const [loadingLogos, setLoadingLogos] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload flow state
  const [stage, setStage] = useState<Stage>("browse");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectKey>(defaultAspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStage("browse");
    setQuery("");
    setActiveTab("uploads");
    setSelectedLogo(null);
    setLoading(true);
    listAssets().then((a) => setAssets(a)).finally(() => setLoading(false));

    setLoadingLogos(true);
    fetch("/logos-registry.json")
      .then((r) => r.json())
      .then((d) => setSectorLogos(d))
      .catch(() => setSectorLogos([]))
      .finally(() => setLoadingLogos(false));
  }, [open]);

  useEffect(() => () => { if (pickedUrl) URL.revokeObjectURL(pickedUrl); }, [pickedUrl]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = assets;
    if (q) list = list.filter((a) => (a.name ?? "").toLowerCase().includes(q) || a.storage_path.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      const da = new Date(a.created_at).getTime(), db = new Date(b.created_at).getTime();
      return sort === "oldest" ? da - db : db - da;
    });
    return list;
  }, [assets, query, sort]);

  const filteredBuiltin = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (activeTab === "logos") {
      let list = sectorLogos;
      if (q) list = list.filter((b) => b.name.toLowerCase().includes(q));
      return list;
    }
    const cat = activeTab === "symbols" ? "symbol" : "chart";
    let list = BUILTIN_ASSETS.filter((b) => b.category === cat);
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q));
    return list;
  }, [activeTab, query, sectorLogos]);

  function startUpload(file: File) {
    setPickedFile(file);
    setPickedUrl(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedArea(null);
    setCaption(file.name.replace(/\.[^.]+$/, ""));
    setAspect(defaultAspect);
    setStage("crop");
  }

  async function confirmCrop() { setStage("caption"); }

  async function doUpload() {
    if (!pickedFile || !pickedUrl) return;
    setStage("uploading");
    setProgress(0);
    try {
      const blob = aspect === "free" && !croppedArea
        ? pickedFile
        : await cropImageToBlob(pickedUrl, croppedArea, pickedFile.type || "image/jpeg");
      const name = caption.trim() || pickedFile.name.replace(/\.[^.]+$/, "");
      const asset = await uploadAssetWithProgress(blob, {
        filename: pickedFile.name,
        name,
        onProgress: (p) => setProgress(p),
      });
      toast.success("Uploaded to asset library");
      // Auto-size on upload pick too
      const img = new Image();
      img.src = asset.public_url;
      img.onload = () => {
        const { w, h } = idealSize(img.naturalWidth, img.naturalHeight, canvasSize);
        onPick({ ...asset, _idealW: w, _idealH: h } as any);
      };
      img.onerror = () => onPick(asset);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
      setStage("caption");
    }
  }

  // Pick from uploads with smart sizing
  async function pickUpload(a: DesignAsset) {
    try {
      const img = await loadImg(a.public_url);
      const { w, h } = idealSize(img.naturalWidth, img.naturalHeight, canvasSize);
      onPick({ ...a, _idealW: w, _idealH: h } as any);
    } catch {
      onPick(a);
    }
  }

  if (!open) return null;

  // Show logo detail panel
  if (selectedLogo) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
        <div
          className="bg-background rounded-lg border border-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border gap-2 shrink-0">
            <span className="font-semibold text-sm">Logo Options</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <LogoDetailPanel
            item={selectedLogo}
            canvasSize={canvasSize}
            onBack={() => setSelectedLogo(null)}
            onPick={(asset) => {
              onPick(asset as any);
              setSelectedLogo(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="bg-background rounded-lg border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {stage !== "browse" && stage !== "uploading" && (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setStage("browse")}><ArrowLeft className="w-4 h-4" /></Button>
            )}
            <h3 className="font-semibold truncate">
              {stage === "browse" && "Pick an asset"}
              {stage === "crop" && "Crop photo"}
              {stage === "caption" && "Add a caption"}
              {stage === "uploading" && "Uploading…"}
            </h3>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Tabs Trigger */}
        {stage === "browse" && (
          <div className="flex border-b border-border bg-muted/20 px-3 py-1.5 gap-1 shrink-0">
            {(["uploads", "logos", "symbols", "charts"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setActiveTab(t); setSelectedLogo(null); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeTab === t
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {t === "uploads" && "My Uploads"}
                {t === "logos" && "Sector Logos"}
                {t === "symbols" && "Growth Symbols"}
                {t === "charts" && "Data & Charts"}
              </button>
            ))}
          </div>
        )}

        {/* Browse */}
        {stage === "browse" && (
          <>
            <div className="p-3 sm:p-4 border-b border-border flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="pl-8 h-9"
                />
              </div>
              {activeTab === "uploads" && (
                <>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="name">Name A→Z</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) startUpload(f); e.currentTarget.value = ""; }}
                  />
                  <Button size="sm" className="h-9" onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="w-3.5 h-3.5 mr-1" /> Upload
                  </Button>
                </>
              )}
              {activeTab === "logos" && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground self-center">
                  <Layers className="w-3 h-3" />
                  Click logo to preview & choose background version
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-4">
              {activeTab === "uploads" ? (
                loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    {assets.length === 0 ? <>No assets yet — click <strong>Upload</strong> above to add one.</> : "No assets match your search."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filtered.map((a) => (
                      <button key={a.id} onClick={() => pickUpload(a)} className="group text-left rounded-md border border-border overflow-hidden hover:border-primary transition">
                        <div className="aspect-square bg-muted/30">
                          <img src={a.public_url} alt={a.name ?? ""} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="p-1.5">
                          <div className="text-xs font-medium truncate">{a.name || a.storage_path.split("/").pop()}</div>
                          <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                activeTab === "logos" && loadingLogos ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading logos…</div>
                ) : filteredBuiltin.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">No assets match your search.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredBuiltin.map((b) => {
                      // For logos: clicking opens detail panel; for symbols/charts: pick directly
                      const isLogo = activeTab === "logos";
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            if (isLogo) {
                              setSelectedLogo(b);
                            } else {
                              // For symbols/charts: pick directly with smart sizing
                              const img = new Image();
                              img.src = b.public_url;
                              img.onload = () => {
                                const { w, h } = idealSize(img.naturalWidth, img.naturalHeight, canvasSize);
                                onPick({ ...b, _idealW: w, _idealH: h } as any);
                              };
                              img.onerror = () => onPick(b as any);
                            }
                          }}
                          className="group text-left rounded-md border border-border overflow-hidden hover:border-primary transition relative"
                        >
                          <div className="aspect-square bg-[#0E0E0E] flex items-center justify-center p-4 relative">
                            <img src={b.public_url} alt={b.name} className="w-full h-full object-contain" loading="lazy" />
                            {isLogo && (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="text-[10px] text-white font-semibold bg-black/60 px-2 py-1 rounded-full">Edit &amp; add</span>
                              </div>
                            )}
                          </div>
                          <div className="p-1.5 bg-card">
                            <div className="text-xs font-medium truncate">{b.name}</div>
                            <div className="text-[10px] text-muted-foreground capitalize">{b.category}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* Crop */}
        {stage === "crop" && pickedUrl && (
          <>
            <div className="relative bg-black flex-1 min-h-[280px]">
              <Cropper
                image={pickedUrl}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT_VALUE[aspect]}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCroppedArea(area)}
              />
            </div>
            <div className="p-3 sm:p-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Aspect</span>
                <Select value={aspect} onValueChange={(v) => setAspect(v as AspectKey)}>
                  <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">Square 1:1</SelectItem>
                    <SelectItem value="4:5">Portrait 4:5</SelectItem>
                    <SelectItem value="16:9">Wide 16:9</SelectItem>
                    <SelectItem value="free">Free / original</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-muted-foreground">Zoom</span>
                <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
              </div>
              <Button size="sm" onClick={confirmCrop}><Check className="w-3.5 h-3.5 mr-1" /> Next</Button>
            </div>
          </>
        )}

        {/* Caption */}
        {stage === "caption" && pickedUrl && (
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex gap-4 items-start">
              <div className="w-24 h-24 rounded-md overflow-hidden border border-border bg-muted/30 shrink-0">
                <img src={pickedUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Caption / name</label>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="A short, searchable name" autoFocus />
                <p className="text-[11px] text-muted-foreground">Saved to your asset library so you can reuse this photo later. Searchable by this name.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setStage("crop")}>Back</Button>
              <Button size="sm" onClick={doUpload}>Save to library</Button>
            </div>
          </div>
        )}

        {/* Uploading */}
        {stage === "uploading" && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading photo…</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Crop the image to a Blob using a canvas. */
async function cropImageToBlob(
  src: string,
  area: { x: number; y: number; width: number; height: number } | null,
  mime: string,
): Promise<Blob> {
  const img = await loadImg(src);
  const a = area ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(a.width);
  canvas.height = Math.round(a.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, a.width, a.height);
  const outMime = mime && mime.startsWith("image/") && mime !== "image/gif" ? mime : "image/jpeg";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), outMime, 0.92);
  });
}