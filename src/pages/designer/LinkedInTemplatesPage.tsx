import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Download, Plus, Trash2, ChevronLeft as PrevIcon, ChevronRight as NextIcon, Loader2, Link2, Image as ImageIcon, Sparkles, Check, LayoutGrid, Layers, Square as SquareIcon, Palette, Pencil, Eye, User, Wand2, Ruler } from "lucide-react";
import EditorActions from "@/components/designer/EditorActions";
import { toast } from "sonner";
import {
  CheatSheetCanvas, CarouselCanvas, SquareCanvas,
  ACCENT_KEYS, SECTION_KINDS, CAROUSEL_LAYOUTS,
  type CheatSheetData, type CarouselData, type SquareData,
  type AccentKey, type SectionKind, type SheetSection, type CarouselSlide, type CarouselLayout, type ThemeKey,
  type Overlay,
} from "@/components/designer/linkedin/LinkedInCanvas";
import TemplateStylePicker from "@/components/designer/linkedin/TemplateStylePicker";
import AssetPickerDialog from "@/components/designer/linkedin/AssetPickerDialog";
import {
  SEED_CHEAT_SHEET, SEED_CAROUSEL, SEED_SQUARE, exportCanvasAsPng,
  saveCanvasAsAsset, linkAssetToPlan, getPlanEntry,
  saveCarouselAsPdf, linkPdfToPlan, renderNodeToDataUrl,
  buildCarouselFromPost, buildCheatSheetFromPost, buildSquareFromPost,
  buildSalehFigmaCarousel, autoFixCarousel,
} from "@/components/designer/linkedin/editorHelpers";
import { createLinkedInTemplate, updateLinkedInTemplate, getDesign, getBrandKit, type DesignAsset } from "@/lib/designer-queries";
import { detectMentionedLogos, type DetectedLogo } from "@/components/designer/linkedin/detectLogos";
import { autoPlaceSlideAssets, mergeAutoOverlays, countDecoratedSlides } from "@/components/designer/linkedin/autoDecorate";
import { LINKEDIN_DESIGN_SYSTEM, validateCarousel, sanitizeCarouselFilename, type ValidationResult } from "@/lib/linkedin-design-system";
import { getProfile } from "@/lib/supabase-queries";
import { supabase } from "@/integrations/supabase/client";
import { getAiReview, saveAiReview, getActiveMemoryRules, addDesignMemory } from "@/lib/linkedin-ai-review";
import { Switch } from "@/components/ui/switch";
import { removeWhiteBackground } from "@/lib/designer-utils";

type TemplateKey = "cheatsheet" | "carousel" | "square";

const KIND_BY_TEMPLATE: Record<TemplateKey, "linkedin_cheatsheet" | "linkedin_carousel" | "linkedin_square"> = {
  cheatsheet: "linkedin_cheatsheet",
  carousel: "linkedin_carousel",
  square: "linkedin_square",
};

const DIMENSIONS: Record<TemplateKey, { w: number; h: number }> = {
  cheatsheet: { w: 1280, h: 1820 },
  // Carousel size per the LinkedIn design system (Section 4.1).
  carousel: { w: LINKEDIN_DESIGN_SYSTEM.carousel.width, h: LINKEDIN_DESIGN_SYSTEM.carousel.height },
  square: { w: 1200, h: 1200 },
};

/** Resolve true only if the image URL actually loads (avoids broken avatars). */
function imageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

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
  const [mobileTab, setMobileTab] = useState<"edit" | "preview" | "style">("edit");
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
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 0.4;
    const w = window.innerWidth;
    if (w < 480) return Math.max(0.2, (w - 48) / 1080);
    if (w < 1024) return 0.45;
    return 0.5;
  });
  // Auto-fit zoom when viewport crosses mobile breakpoint
  useEffect(() => {
    function fit() {
      const w = window.innerWidth;
      if (w < 480) setZoom((z) => (z > 0.45 ? Math.max(0.2, (w - 48) / 1080) : z));
    }
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // Overlay editing state
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const handleSelectOverlay = (id: string | null) => {
    setSelectedOverlayId(id);
    if (id && window.innerWidth < 1024) {
      setMobileTab("style");
    }
  };
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  // True when the asset picker was opened by clicking the face photo — in this
  // mode picking an upload sets it as the photo (instead of adding an overlay).
  const [photoPickMode, setPhotoPickMode] = useState(false);
  const openPhotoPicker = () => { setPhotoPickMode(true); setAssetPickerOpen(true); };
  const closeAssetPicker = () => { setAssetPickerOpen(false); setPhotoPickMode(false); };
  // Style/theme picker — opens automatically on first generation (when the
  // editor is opened with hook/body params and no existing design id).
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  // True while the auto art-director is fetching/placing logos + icons.
  const [autoPlacing, setAutoPlacing] = useState(false);
  // AI review (LLM) of the whole deck.
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiReview, setAiReview] = useState<any | null>(null);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  // Indices (as strings) of slide-notes the user has accepted (shown green).
  const [appliedNotes, setAppliedNotes] = useState<string[]>([]);
  // The slide-note currently open in the correction popup + its editable fix.
  const [correction, setCorrection] = useState<{ idx: number; note: any; action: string; title: string; body: string } | null>(null);
  // Score delta tracking: score from the first/previous review run (for +/- display).
  const [baseScore, setBaseScore] = useState<number | null>(null);
  // True after remove/merge actions shift slide numbers — stale notes warn the user.
  const [staleReview, setStaleReview] = useState(false);
  // True while the silent background pre-review is running (new carousel load).
  const [silentReviewing, setSilentReviewing] = useState(false);
  // Fix Everything auto-loop state.
  const [fixingAll, setFixingAll] = useState(false);
  const [fixRound, setFixRound] = useState(0);
  // Active tab in review dialog: "copy" | "visual"
  const [reviewTab, setReviewTab] = useState<"copy" | "visual">("copy");
  // The user's real headshot — the design system makes a face photo MANDATORY
  // on the carousel cover (a logo does not stop the scroll).
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>(undefined);

  /**
   * Auto art-director: read each carousel slide and drop the brand logo(s) it
   * mentions + one contextual icon onto the matching slide. Runs on generation
   * (markDirty=false so it doesn't create a seed design before the user edits)
   * and from the manual "Auto-place" button (markDirty + merge so it keeps
   * hand-placed overlays and triggers autosave).
   */
  async function runAutoPlace(
    source: CarouselData,
    { markDirty = true, merge = false, toastResult = false }: { markDirty?: boolean; merge?: boolean; toastResult?: boolean } = {},
  ) {
    setAutoPlacing(true);
    try {
      const auto = await autoPlaceSlideAssets(source, DIMENSIONS.carousel);
      const apply = (d: CarouselData): CarouselData => {
        // The decorator is async — if the deck was rebuilt while it ran (e.g.
        // the user switched to the Figma template), don't overwrite the newer
        // slides/overlays with a stale result.
        if ((d.slides ?? []).length !== (source.slides ?? []).length) return d;
        return {
          ...d,
          overlays: merge ? mergeAutoOverlays(d.overlays, auto, (d.slides ?? []).length) : auto,
        };
      };
      if (markDirty) editCarouselData(apply);
      else setCarouselData(apply);
      if (toastResult) {
        const n = countDecoratedSlides(auto);
        toast.success(n > 0 ? `Placed logos & icons on ${n} slide${n === 1 ? "" : "s"}` : "No matching logos found in the slides");
      }
    } catch (e: any) {
      if (toastResult) toast.error(e?.message ?? "Auto-place failed");
    } finally {
      setAutoPlacing(false);
    }
  }

  // Wrapped setters that flip the dirty flag — used everywhere a user can
  // mutate the template (forms, overlay layer, title, preset switcher).
  const editCheatData = (next: CheatSheetData | ((d: CheatSheetData) => CheatSheetData)) => {
    setDirty(true);
    setCheatData((prev) => (typeof next === "function" ? (next as any)(prev) : next));
  };
  const editCarouselData = (next: CarouselData | ((d: CarouselData) => CarouselData)) => {
    setDirty(true);
    setCarouselData((prev) => (typeof next === "function" ? (next as any)(prev) : next));
  };
  const editSquareData = (next: SquareData | ((d: SquareData) => SquareData)) => {
    setDirty(true);
    setSquareData((prev) => (typeof next === "function" ? (next as any)(prev) : next));
  };
  const editTitle = (v: string) => { setDirty(true); setTitle(v); };
  const editActive = (v: TemplateKey) => { setDirty(true); setActive(v); };

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
          setCheatData({
            ...SEED_CHEAT_SHEET,
            ...data,
            sections: Array.isArray(data.sections) ? data.sections : SEED_CHEAT_SHEET.sections,
            overlays: Array.isArray(data.overlays) ? data.overlays : [],
          });
          setActive("cheatsheet");
        } else if (d.kind === "linkedin_carousel" && data) {
          setCarouselData({
            ...SEED_CAROUSEL,
            ...data,
            slides: Array.isArray(data.slides) ? data.slides : SEED_CAROUSEL.slides,
            overlays: Array.isArray(data.overlays) ? data.overlays : [],
          });
          setActive("carousel");
        } else if (d.kind === "linkedin_square" && data) {
          setSquareData({ ...SEED_SQUARE, ...data });
          setActive("square");
        }
      } finally { setLoadingExisting(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designIdFromUrl]);

  // Load the user's real headshot once. Prefer the PROFILE photo (a real human
  // headshot) over the brand-kit "avatar", which is often a logo — the cover
  // face must be a face, not a logo. Only use a URL that actually loads.
  useEffect(() => {
    void (async () => {
      const [prof, kit] = await Promise.all([
        getProfile().catch(() => null),
        getBrandKit().catch(() => null),
      ]);
      const candidates = [(prof as any)?.avatar_url, (kit as any)?.avatar_url].filter(Boolean) as string[];
      for (const url of candidates) {
        if (await imageLoads(url)) { setProfileAvatar(url); return; }
      }
    })();
  }, []);
  useEffect(() => {
    if (!profileAvatar || loadingExisting) return;
    setCarouselData((d) => (d.avatarUrl ? d : { ...d, avatarUrl: profileAvatar }));
    setCheatData((d) => (d.avatarUrl ? d : { ...d, avatarUrl: profileAvatar }));
    setSquareData((d) => (d.avatarUrl ? d : { ...d, avatarUrl: profileAvatar }));
  }, [profileAvatar, loadingExisting]);

  // Load any cached AI review for this design so it isn't re-run on every open.
  useEffect(() => {
    if (!designId) { setAiReview(null); setAppliedNotes([]); return; }
    void getAiReview(designId).then((r) => {
      if (r) { setAiReview(r.review); setAppliedNotes(r.applied ?? []); }
    }).catch(() => { /* */ });
  }, [designId]);

  // Seed from query params (?hook=&body=) on first mount — only when not loading an existing design.
  useEffect(() => {
    if (designIdFromUrl) return;
    const hookParam = params.get("hook");
    const bodyParam = params.get("body");
    if (hookParam || bodyParam) {
      const hook = hookParam ?? "";
      const body = bodyParam ?? "";
      setCheatData((d) => buildCheatSheetFromPost(hook, body, {
        author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
      }));
      setSquareData((d) => buildSquareFromPost(hook, body, {
        author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
      }));
      // Generate the entire carousel dynamically from the post — number of
      // slides, layouts, and content all come from `hook` + `body`, so
      // every post produces a different deck instead of the static template.
      const builtCarousel = buildCarouselFromPost(hook, body, {
        author: carouselData.author, handleShort: carouselData.handleShort,
        avatarUrl: carouselData.avatarUrl, photoKey: carouselData.photoKey,
      });
      setCarouselData(builtCarousel);
      // Auto art-director: drop the right logo + icon onto each slide based on
      // what that slide is about (e.g. a Clay slide gets the Clay logo).
      void runAutoPlace(builtCarousel, { markDirty: false });
      // First-time generation — prompt for a visual style.
      setStylePickerOpen(true);
      // Silent pre-review using learned memory rules so Fix Issues is pre-populated.
      // Delayed 1.5 s so the carousel renders first and the user sees the editor.
      setTimeout(() => void runSilentReview(builtCarousel), 1500);
    }
    if (planId) {
      void getPlanEntry(planId).then((p) => {
        if (!p) return;
        setPlanMeta({ id: p.id, hook: p.hook, body: p.body });
        if (!hookParam && !bodyParam) {
          // Seed from the plan if not already in URL
          setCheatData((d) => buildCheatSheetFromPost(p.hook ?? "", p.body ?? "", {
            author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
          }));
          setSquareData((d) => buildSquareFromPost(p.hook ?? "", p.body ?? "", {
            author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
          }));
          const builtFromPlan = buildCarouselFromPost(p.hook ?? "", p.body ?? "", {
            author: carouselData.author, handleShort: carouselData.handleShort,
            avatarUrl: carouselData.avatarUrl, photoKey: carouselData.photoKey,
          });
          setCarouselData(builtFromPlan);
          void runAutoPlace(builtFromPlan, { markDirty: false });
          // Silent pre-review using learned memory rules.
          setTimeout(() => void runSilentReview(builtFromPlan), 1500);
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
      editCheatData({
        ...cheatData,
        sections: cheatData.sections.map((s) => s === existing ? { ...s, items: merged } : s),
      });
    } else {
      editCheatData({
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
    if (active === "cheatsheet") editCheatData({ ...cheatData, overlays: next });
    else if (active === "square") editSquareData({ ...squareData, overlays: next });
    else editCarouselData({
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

  function addImageFromAsset(asset: DesignAsset & { _idealW?: number; _idealH?: number; removeBg?: boolean; originalSrc?: string }) {
    // If the picker already computed the ideal size, use it directly
    if (asset._idealW && asset._idealH) {
      addOverlay({
        id: crypto.randomUUID(),
        type: "image",
        x: 150,
        y: 150,
        w: asset._idealW,
        h: asset._idealH,
        src: asset.public_url,
        originalSrc: asset.originalSrc ?? asset.public_url,
        removeBg: asset.removeBg ?? false,
        objectFit: "contain",
        radius: 0,
        name: (asset as any).customName ?? (asset as any).name ?? undefined,
      } as any);
      setAssetPickerOpen(false);
      return;
    }
    // Fallback: compute size from image dimensions
    const dim = DIMENSIONS[active];
    const img = new Image();
    img.src = asset.public_url;
    img.onload = () => {
      let w = img.naturalWidth || 240;
      let h = img.naturalHeight || 240;
      // Target ~15% of canvas width
      const maxDim = Math.round(dim.w * 0.15);
      if (w > maxDim || h > maxDim) {
        const ratio = w / h;
        if (ratio > 1) { w = maxDim; h = Math.round(maxDim / ratio); }
        else { h = maxDim; w = Math.round(maxDim * ratio); }
      }
      addOverlay({
        id: crypto.randomUUID(),
        type: "image",
        x: 150,
        y: 150,
        w,
        h,
        src: asset.public_url,
        originalSrc: asset.originalSrc ?? asset.public_url,
        removeBg: asset.removeBg ?? false,
        objectFit: "contain",
        radius: 0,
      } as any);
    };
    img.onerror = () => {
      addOverlay({ id: crypto.randomUUID(), type: "image", x: 100, y: 100, w: Math.round(dim.w * 0.15), h: Math.round(dim.w * 0.15), src: asset.public_url, objectFit: "contain", radius: 0 } as any);
    };
    setAssetPickerOpen(false);
  }

  /**
   * Set a user-uploaded image as the design's face photo — used on the cover
   * (mandatory) and the footer signature across all three presets.
   */
  function useAssetAsPhoto(asset: DesignAsset) {
    const url = asset.public_url;
    editCarouselData((d) => ({ ...d, avatarUrl: url }));
    editCheatData((d) => ({ ...d, avatarUrl: url }));
    editSquareData((d) => ({ ...d, avatarUrl: url }));
    setProfileAvatar(url);
    closeAssetPicker();
    toast.success("Cover & footer photo updated");
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
  // The public-facing carousel name (used for the PDF + validation).
  const carouselTitle = title || carouselData.slides?.[0]?.title || "LinkedIn Carousel";

  // Live design-system validation (Section 4.6 + Section 11). `errors` hard-gate
  // the PDF export; `warnings` are advisory.
  const carouselValidation = useMemo<ValidationResult | null>(() => {
    if (active !== "carousel") return null;
    return validateCarousel(carouselData, { filename: sanitizeCarouselFilename(carouselTitle) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, carouselData, carouselTitle]);

  /** Jump the editor to a specific slide (used by clickable validation errors). */
  function goToSlide(i?: number) {
    if (i == null) return;
    setSlideIdx(Math.max(0, Math.min((carouselData.slides?.length ?? 1) - 1, i)));
    if (window.innerWidth < 1024) setMobileTab("preview");
  }

  /** Deterministically repair the design-system [REQUIRED] failures. */
  function fixIssues() {
    const { data, fixes } = autoFixCarousel(carouselData);
    if (!fixes.length) { toast.success("Nothing to fix — all required checks pass"); return; }
    editCarouselData(data);
    setSlideIdx(0);
    void runAutoPlace(data, { markDirty: true, merge: true });
    toast.success(`Fixed ${fixes.length}: ${fixes.join(" · ")}`);
  }

  /**
   * Silent background pre-review — runs automatically after a new carousel is
   * generated. Only fires when the user has at least one learned memory rule.
   * Caches the result but does NOT open the dialog; the AI review button badge
   * shows the count of pre-detected issues so the user knows to check.
   */
  async function runSilentReview(carousel: CarouselData) {
    try {
      const memory = await getActiveMemoryRules().catch(() => [] as string[]);
      if (!memory.length) return; // no rules learned yet — nothing to pre-check
      setSilentReviewing(true);
      const hook = params.get("hook") ?? carousel.slides?.[0]?.title ?? "";
      const body = params.get("body") ?? "";
      const slidesMeta = (carousel.slides ?? []).map((s, i) => ({
        n: i + 1,
        wordCount: (s.body ?? "").split(/\s+/).filter(Boolean).length,
        overlayCount: ((carousel.overlays as any)?.[i] ?? []).length,
        layout: s.layout ?? "text",
        hasContent: !!(s.title?.trim() || s.body?.trim() || s.quote?.trim() || (s.bullets ?? []).length),
      }));
      const { data, error } = await supabase.functions.invoke("review-carousel", {
        body: { slides: carousel.slides, hook, body, author: carousel.author, memory, slidesMeta },
      });
      if (error || (data as any)?.error) return;
      const review = (data as any).review;
      if (!review?.slideNotes?.length) return;
      // Store silently — don't open dialog, just pre-populate so Fix Issues is instant
      setAiReview(review);
      setAppliedNotes([]);
      setBaseScore(null);
      setStaleReview(false);
    } catch { /* silent — never surface errors from background review */ }
    finally { setSilentReviewing(false); }
  }

  /**
   * AI review. If a cached review already exists and we're not forcing a
   * re-run, just reopen it (no new LLM call, no lost feedback). Otherwise call
   * the LLM (passing the user's learned memory rules) and persist the result.
   */
  async function runAiReview(force = false) {
    if (!force && aiReview) { setAiReviewOpen(true); return; }
    setAiReviewing(true);
    try {
      const hook = planMeta?.hook ?? params.get("hook") ?? carouselData.slides?.[0]?.title ?? "";
      const body = planMeta?.body ?? params.get("body") ?? "";
      const memory = await getActiveMemoryRules().catch(() => [] as string[]);
      // Build the list of slide numbers that were already corrected in this session.
      const appliedFixes = appliedNotes
        .map((i) => String(aiReview?.slideNotes?.[Number(i)]?.n ?? ""))
        .filter(Boolean);
      const slidesMeta = (carouselData.slides ?? []).map((s, i) => ({
        n: i + 1,
        wordCount: (s.body ?? "").split(/\s+/).filter(Boolean).length,
        overlayCount: ((carouselData.overlays as any)?.[i] ?? []).length,
        layout: s.layout ?? "text",
        hasContent: !!(s.title?.trim() || s.body?.trim() || s.quote?.trim() || (s.bullets ?? []).length),
      }));
      const { data, error } = await supabase.functions.invoke("review-carousel", {
        body: { slides: carouselData.slides, hook, body, author: carouselData.author, memory, appliedFixes, slidesMeta },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const review = (data as any).review;
      // Score delta: remember the old score before overwriting.
      if (typeof aiReview?.score === "number") {
        setBaseScore(aiReview.score);
      } else if (typeof review?.score === "number") {
        setBaseScore(null); // first run — no delta yet
      }
      setAiReview(review);
      setAppliedNotes([]);
      setStaleReview(false);
      setAiReviewOpen(true);
      const id = designId ?? (await persist());
      if (id) await saveAiReview(id, review, []);
    } catch (e: any) {
      toast.error(e?.message ?? "AI review failed");
    } finally { setAiReviewing(false); }
  }

  /** Open the per-slide correction popup, prefilled with the AI's fix + action. */
  function openCorrection(idx: number, note: any) {
    const slide = carouselData.slides?.[(note?.n ?? 1) - 1];
    setCorrection({
      idx, note,
      action: note?.fix?.action ?? "rewrite",
      title: note?.fix?.title ?? slide?.title ?? "",
      body: note?.fix?.body ?? slide?.body ?? "",
    });
  }

  /**
   * Apply the (possibly edited) correction to its slide and mark it done.
   * Honors the AI's action: rewrite (title/body), remove (delete the slide), or
   * merge (fold it into the slide above). Structural actions actually change the
   * deck, so re-running the review reflects the improvement.
   */
  async function applyCorrection() {
    if (!correction) return;
    const { idx, note, action, title, body } = correction;
    const sIdx = (note?.n ?? 1) - 1;
    const slideCount = carouselData.slides?.length ?? 1;

    editCarouselData((d) => {
      const slides = [...(d.slides ?? [])];
      if (action === "remove") {
        if (slides.length > 1 && sIdx >= 0 && sIdx < slides.length) slides.splice(sIdx, 1);
      } else if (action === "merge" && sIdx > 0 && slides[sIdx]) {
        const prev = slides[sIdx - 1];
        const merged = [prev.body, body.trim() || slides[sIdx].body].filter(Boolean).join(" ").trim().slice(0, 300);
        slides[sIdx - 1] = { ...prev, title: title.trim() || prev.title, body: merged };
        slides.splice(sIdx, 1);
      } else if (slides[sIdx]) {
        // Guaranteed apply: if both title and body are empty, fall back to the
        // AI's raw suggestion text as the body so the accept is never a no-op.
        const resolvedBody = body.trim() || note?.suggestion || "";
        slides[sIdx] = { ...slides[sIdx], ...(title.trim() ? { title: title.trim() } : {}), ...(resolvedBody ? { body: resolvedBody } : {}) };
      }
      return { ...d, slides };
    });

    const nextApplied = Array.from(new Set([...appliedNotes, String(idx)]));
    setAppliedNotes(nextApplied);
    setCorrection(null);
    setSlideIdx(Math.max(0, Math.min(sIdx, slideCount - 2)));
    const id = designId ?? (await persist());
    if (id) await saveAiReview(id, aiReview, nextApplied);
    if (note?.reason) void addDesignMemory(note.reason, "ai_review");
    if (action === "remove" || action === "merge") {
      // Structural actions shift slide numbers — mark review as stale.
      setStaleReview(true);
      toast.success(`Slide ${note?.n} ${action === "remove" ? "removed" : "merged up"} — slide numbers shifted, Re-run for a fresh check`);
    } else {
      toast.success(`Slide ${note?.n} corrected`);
    }
  }

  /**
   * Batch-apply all high-severity rewrite notes in one click.
   * Skips remove/merge to avoid index shifting mid-loop.
   */
  async function applyAllHigh() {
    if (!aiReview?.slideNotes) return;
    const highRewrites = (aiReview.slideNotes as any[])
      .map((n: any, i: number) => ({ n, i }))
      .filter(({ n, i }) => n.severity === "high" && n.fix?.action === "rewrite" && !appliedNotes.includes(String(i)));
    if (highRewrites.length === 0) return;

    let applied = 0;
    editCarouselData((d) => {
      const slides = [...(d.slides ?? [])];
      for (const { n } of highRewrites) {
        const sIdx = (n.n ?? 1) - 1;
        if (!slides[sIdx]) continue;
        const newTitle = n.fix?.title?.trim() || "";
        const newBody = n.fix?.body?.trim() || n.suggestion || "";
        slides[sIdx] = { ...slides[sIdx], ...(newTitle ? { title: newTitle } : {}), ...(newBody ? { body: newBody } : {}) };
        applied++;
      }
      return { ...d, slides };
    });

    const newIdxs = highRewrites.map(({ i }) => String(i));
    const nextApplied = Array.from(new Set([...appliedNotes, ...newIdxs]));
    setAppliedNotes(nextApplied);
    const id = designId ?? (await persist());
    if (id) await saveAiReview(id, aiReview, nextApplied);
    toast.success(`Applied ${applied} high-severity rewrite${applied === 1 ? "" : "s"} — Re-run to check progress`);
  }

  /**
   * Fix Everything auto-loop: applies ALL unapplied notes in batches, then
   * re-runs the review, repeating up to 3 rounds until score >= 80 or no
   * new issues are found.
   */
  async function fixEverything() {
    if (!aiReview?.slideNotes || fixingAll) return;
    setFixingAll(true);
    setFixRound(0);
    const startScore = aiReview.score ?? 0;
    let currentReview = aiReview;
    let currentApplied: string[] = [...appliedNotes];
    let round = 0;

    try {
      while (round < 3) {
        round++;
        setFixRound(round);
        const notes = (currentReview.slideNotes as any[]) ?? [];
        const unapplied = notes.map((n: any, i: number) => ({ n, i }))
          .filter(({ i }) => !currentApplied.includes(String(i)));

        if (unapplied.length === 0) break;

        // Separate: rewrites first (safe batch), then structural (sorted reverse)
        const rewrites = unapplied.filter(({ n }) => n.fix?.action === "rewrite");
        const structural = unapplied
          .filter(({ n }) => n.fix?.action === "remove" || n.fix?.action === "merge")
          .sort((a, b) => (b.n.n ?? 0) - (a.n.n ?? 0)); // reverse order

        // Apply all rewrites in one batch
        if (rewrites.length > 0) {
          editCarouselData((d) => {
            const slides = [...(d.slides ?? [])];
            for (const { n } of rewrites) {
              const sIdx = (n.n ?? 1) - 1;
              if (!slides[sIdx]) continue;
              const t = n.fix?.title?.trim() || "";
              const b = n.fix?.body?.trim() || n.suggestion || "";
              slides[sIdx] = { ...slides[sIdx], ...(t ? { title: t } : {}), ...(b ? { body: b } : {}) };
            }
            return { ...d, slides };
          });
          for (const { n } of rewrites) {
            if (n.reason) void addDesignMemory(n.reason, "ai_review");
          }
        }

        // Apply structural notes one by one (already sorted in reverse)
        for (const { n } of structural) {
          editCarouselData((d) => {
            const slides = [...(d.slides ?? [])];
            const sIdx = (n.n ?? 1) - 1;
            if (n.fix?.action === "remove" && slides.length > 1 && sIdx >= 0 && sIdx < slides.length) {
              slides.splice(sIdx, 1);
            } else if (n.fix?.action === "merge" && sIdx > 0 && slides[sIdx]) {
              const prev = slides[sIdx - 1];
              const mergedBody = [prev.body, n.fix?.body?.trim() || slides[sIdx].body].filter(Boolean).join(" ").trim().slice(0, 300);
              slides[sIdx - 1] = { ...prev, title: n.fix?.title?.trim() || prev.title, body: mergedBody };
              slides.splice(sIdx, 1);
            }
            return { ...d, slides };
          });
          if (n.reason) void addDesignMemory(n.reason, "ai_review");
        }

        const allApplied = notes.map((_: any, i: number) => String(i));
        setAppliedNotes(allApplied);
        currentApplied = allApplied;

        toast(`Round ${round} — applied ${unapplied.length} fix${unapplied.length === 1 ? "" : "es"}, re-checking…`);

        // Re-run the review
        setAiReviewing(true);
        const memory = await getActiveMemoryRules().catch(() => [] as string[]);
        const slidesMeta = (carouselData.slides ?? []).map((s, i) => ({
          n: i + 1,
          wordCount: (s.body ?? "").split(/\s+/).filter(Boolean).length,
          overlayCount: ((carouselData.overlays as any)?.[i] ?? []).length,
          layout: s.layout ?? "text",
          hasContent: !!(s.title?.trim() || s.body?.trim() || s.quote?.trim() || (s.bullets ?? []).length),
        }));
        const { data, error } = await supabase.functions.invoke("review-carousel", {
          body: { slides: carouselData.slides, hook: "", body: "", author: carouselData.author, memory, slidesMeta },
        });
        setAiReviewing(false);

        if (error || (data as any)?.error) break;
        const newReview = (data as any).review;
        if (!newReview) break;

        setAiReview(newReview);
        setAppliedNotes([]);
        setStaleReview(false);
        currentReview = newReview;
        currentApplied = [];

        if ((newReview.score ?? 0) >= 80 || !newReview.slideNotes?.length) break;
      }

      const endScore = currentReview.score ?? 0;
      const delta = endScore - startScore;
      toast.success(`Done in ${round} round${round > 1 ? "s" : ""} — score ${delta >= 0 ? "+" : ""}${delta} (${endScore}/100)`);
    } finally {
      setFixingAll(false);
      setAiReviewOpen(true);
    }
  }

  async function saveCarouselPdfAndLink() {
    // Hard gate: a carousel that fails any REQUIRED rule must not be exported.
    const v = validateCarousel(carouselData, { filename: sanitizeCarouselFilename(carouselTitle) });
    if (!v.passed) {
      toast.error(`Fix ${v.errors.length} required issue${v.errors.length === 1 ? "" : "s"} before exporting — see the checklist above.`);
      if (window.innerWidth < 1024) setMobileTab("edit");
      return;
    }
    setSavingPdf(true);
    try {
      const renderSlide = async (i: number): Promise<string> => {
        setSlideIdx(i);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
        return renderNodeToDataUrl("canvas-export");
      };
      const pdf = await saveCarouselAsPdf(carouselData.slides.length, renderSlide, carouselTitle);
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

  /** Apply a visual theme to all three preset data shapes. */
  function applyTheme(k: ThemeKey) {
    editCheatData((d) => ({ ...d, themeKey: k }));
    editSquareData((d) => ({ ...d, themeKey: k }));
    if (k === "figma-template") {
      // "Figma Template" isn't just a recolor — it's Saleh's full 8-slide
      // template library (Cover · Big Number · Content · Numbered List ·
      // Code · Quote · Comparison · CTA). Rebuild the deck so the user
      // actually sees those distinctive middle slides, not just a re-skin.
      const rebuilt = buildSalehFigmaCarousel({ ...carouselData, themeKey: k });
      editCarouselData(rebuilt);
      setActive("carousel");
      setSlideIdx(0);
      toast.success("Saleh's 8-slide template loaded");
      // The rebuild resets overlays — re-run the auto art-director.
      void runAutoPlace(rebuilt, { markDirty: true });
    } else {
      editCarouselData((d) => ({ ...d, themeKey: k }));
      toast.success("Style applied");
    }
  }
  const currentTheme: ThemeKey | undefined =
    active === "carousel" ? carouselData.themeKey
    : active === "square" ? squareData.themeKey
    : cheatData.themeKey;

  return (
    <section className="h-[calc(100dvh-4rem)] flex flex-col">
      {/* Top header — same shell as the canvas DesignEditor */}
      <header className="flex items-center justify-between gap-1.5 px-3 py-2 border-b border-border flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link to="/designer"><ChevronLeft className="w-4 h-4" /></Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => editTitle(e.target.value)}
            placeholder={designId ? "Untitled template" : "New LinkedIn template"}
            className="w-[130px] xs:w-[170px] sm:w-auto sm:max-w-xs h-8 text-xs sm:text-sm"
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {dims.w}×{dims.h} · linkedin
          </span>
          <SaveStatusBadge status={saveStatus} />
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.1, z * 0.85))} title="Zoom out">−</Button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z * 1.15))} title="Zoom in">+</Button>
        </div>
        <div className="flex gap-1.5 items-center ml-auto shrink-0">
          <Button size="sm" variant="outline" onClick={() => setStylePickerOpen(true)} className="h-8 text-xs px-2">
            <Palette className="w-3.5 h-3.5 mr-1" /> <span className="hidden xs:inline">Style</span>
          </Button>
          {planMeta && (
            <a
              href="/content-planner"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              title={`Linked to: ${planMeta.hook}`}
            >
              <Link2 className="w-3 h-3" /> <span className="hidden sm:inline">Linked to post</span>
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
      {(detected.length > 0 || lastSaved || (active === "carousel" && carouselValidation)) && (
        <div className="px-3 py-2 border-b border-border space-y-2 max-h-60 overflow-auto">
          {active === "carousel" && carouselValidation && (
            <Card className={`p-2.5 ${carouselValidation.passed ? "border-amber-500/40 bg-amber-500/5" : "border-destructive/50 bg-destructive/5"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {carouselValidation.passed
                  ? <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  : <span className="w-4 h-4 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold flex items-center justify-center shrink-0">!</span>}
                <span className="text-xs font-semibold">
                  {carouselValidation.passed
                    ? "Design system — passes ✓ (optional tips below)"
                    : `Design system — ${carouselValidation.errors.length} to fix before you can export`}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {!carouselValidation.passed && (
                    <Button size="sm" className="h-6 text-[11px] px-2 bg-destructive/90 hover:bg-destructive text-white" onClick={fixIssues}>
                      <Sparkles className="w-3 h-3 mr-1" /> Fix issues
                    </Button>
                  )}
                  {/* AI Review button — shows pre-detected issue badge when memory found issues */}
                  {(() => {
                    const preHighCount = aiReview && !aiReviewOpen
                      ? (aiReview.slideNotes ?? []).filter((n: any) => n.severity === "high" && !appliedNotes.includes(String((aiReview.slideNotes ?? []).indexOf(n)))).length
                      : 0;
                    return (
                      <div className="relative">
                        <Button
                          size="sm"
                          variant={preHighCount > 0 ? "default" : "outline"}
                          className={`h-6 text-[11px] px-2 ${
                            preHighCount > 0 ? "bg-amber-500/90 hover:bg-amber-500 text-white border-amber-500" : ""
                          }`}
                          disabled={aiReviewing || silentReviewing}
                          onClick={() => runAiReview()}
                        >
                          {(aiReviewing || silentReviewing) ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                          {silentReviewing ? "Checking…" : aiReview ? "AI review ✓" : "AI review"}
                        </Button>
                        {preHighCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center px-0.5 shadow-sm animate-bounce">
                            {preHighCount}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  
                </div>
              </div>
              <ul className="text-[11px] space-y-0.5 pl-0.5">
                {carouselValidation.errors.map((e, i) => (
                  <li key={`e${i}`}>
                    <button
                      type="button"
                      onClick={() => goToSlide(e.slide)}
                      className={`text-destructive flex gap-1.5 text-left w-full ${e.slide != null ? "hover:underline" : "cursor-default"}`}
                      title={e.slide != null ? `Go to slide ${e.slide + 1}` : undefined}
                    >
                      <span className="shrink-0">✕</span>
                      <span>{e.message}</span>
                    </button>
                  </li>
                ))}
                {carouselValidation.warnings.map((w, i) => (
                  <li key={`w${i}`} className="text-amber-600 dark:text-amber-500 flex gap-1.5">
                    <span className="shrink-0">•</span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
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
                {detected.map((d) => {
                  const clickHandler = () => {
                    if (d.asset) {
                      addImageFromAsset(d.asset);
                      toast.success(`Injected ${d.name} logo onto canvas`);
                    }
                  };
                  return (
                    <button
                      key={d.name}
                      onClick={clickHandler}
                      type="button"
                      disabled={!d.hasAsset}
                      className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border text-[11px] transition ${
                        d.hasAsset 
                          ? "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/20 cursor-pointer" 
                          : "border-border opacity-65 cursor-not-allowed"
                      }`}
                      title={d.hasAsset ? `Click to inject ${d.name} logo onto active slide` : `${d.name} logo not found`}
                    >
                      {d.asset?.public_url ? (
                        <img src={d.asset.public_url} className="w-4 h-4 rounded-full object-contain" alt={d.name} />
                      ) : (
                        <ImageIcon className="w-2.5 h-2.5 ml-0.5 text-muted-foreground" />
                      )}
                      <span>{d.name}</span>
                      {d.hasAsset && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
              {active === "carousel" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px]"
                  disabled={autoPlacing}
                  onClick={() => void runAutoPlace(carouselData, { markDirty: true, merge: true, toastResult: true })}
                  title="Place the matching logo + a contextual icon onto every slide automatically"
                >
                  {autoPlacing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  Auto-place on slides
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => injectToolsIntoCheatSheet(detected.map((d) => d.name))}>
                  <Plus className="w-3 h-3 mr-1" /> Add to sheet
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Mobile view tabs switcher */}
      <div className="flex lg:hidden border-b border-border bg-background p-1 gap-1 shrink-0 justify-around">
        <button
          type="button"
          onClick={() => setMobileTab("edit")}
          className={`flex-1 py-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === "edit"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Content
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === "preview"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Live Canvas
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("style")}
          className={`flex-1 py-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === "style"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Style & Layers
        </button>
      </div>

      {/* Main grid: left preset sidebar | center preview | right form panel */}
      <div className="flex-1 flex flex-col min-h-0 lg:grid lg:grid-cols-[64px_1fr_360px]">
        {/* Left: preset selector — horizontal on mobile, vertical on lg */}
        <div className={`border-b lg:border-b-0 lg:border-r border-border p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto shrink-0 ${
          mobileTab === "edit" ? "flex" : "hidden lg:flex"
        }`}>
          <PresetTile active={active === "cheatsheet"} onClick={() => editActive("cheatsheet")} icon={<LayoutGrid className="w-4 h-4" />} label="Sheet" />
          <PresetTile active={active === "carousel"} onClick={() => editActive("carousel")} icon={<Layers className="w-4 h-4" />} label="Slides" />
          <PresetTile active={active === "square"} onClick={() => editActive("square")} icon={<SquareIcon className="w-4 h-4" />} label="Square" />
        </div>

        {/* Center: live preview */}
        <div className={`overflow-auto bg-muted/30 flex items-start justify-center p-4 sm:p-6 lg:p-8 flex-1 min-h-0 ${
          mobileTab === "preview" ? "flex" : "hidden lg:flex"
        }`}>
          <div style={{ width: dims.w * zoom, height: dims.h * zoom, position: "relative" }} className="shrink-0">
            <div style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: dims.w,
              height: dims.h,
              position: "absolute",
              top: 0,
              left: 0
            }}>
              {active === "cheatsheet" && (
                <CheatSheetCanvas
                  data={cheatData}
                  editableOverlays
                  selectedOverlayId={selectedOverlayId}
                  onSelectOverlay={handleSelectOverlay}
                  onChangeOverlays={(next) => editCheatData({ ...cheatData, overlays: next })}
                  zoom={zoom}
                  onPhotoClick={openPhotoPicker}
                />
              )}
              {active === "carousel" && (
                <CarouselCanvas
                  data={carouselData}
                  slideIndex={slideIdx}
                  editableOverlays
                  selectedOverlayId={selectedOverlayId}
                  onSelectOverlay={handleSelectOverlay}
                  onChangeOverlays={(next) => editCarouselData({ ...carouselData, overlays: { ...(carouselData.overlays ?? {}), [slideIdx]: next } })}
                  zoom={zoom}
                  onPhotoClick={openPhotoPicker}
                />
              )}
              {active === "square" && (
                <SquareCanvas
                  data={squareData}
                  editableOverlays
                  selectedOverlayId={selectedOverlayId}
                  onSelectOverlay={handleSelectOverlay}
                  onChangeOverlays={(next) => editSquareData({ ...squareData, overlays: next })}
                  zoom={zoom}
                  onPhotoClick={openPhotoPicker}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right: form fields + elements layer for the active preset */}
        <div className={`border-t lg:border-t-0 lg:border-l border-border overflow-auto p-3 sm:p-4 space-y-3 flex-1 min-h-0 lg:max-h-none ${
          mobileTab === "edit" || mobileTab === "style" ? "block" : "hidden lg:block"
        }`}>
          <div className={mobileTab === "style" ? "block" : "hidden lg:block"}>
            <ElementsPanel
              overlays={getOverlays()}
              selectedId={selectedOverlayId}
              onSelect={setSelectedOverlayId}
              onAddImage={() => setAssetPickerOpen(true)}
              onSetPhoto={openPhotoPicker}
              onAddText={addTextOverlay}
              onAddShape={addShapeOverlay}
              onUpdate={updateSelectedOverlay}
              onDelete={deleteSelectedOverlay}
            />
          </div>
          <div className={`border-t border-border pt-3 ${
            mobileTab === "edit" ? "block" : "hidden lg:block"
          }`}>
            {active === "cheatsheet" && (
              <>
                {(planMeta?.hook || planMeta?.body || params.get("hook") || params.get("body")) && (
                  <Button
                    type="button" size="sm" variant="outline" className="w-full mb-3"
                    onClick={() => {
                      const hook = planMeta?.hook ?? params.get("hook") ?? "";
                      const body = planMeta?.body ?? params.get("body") ?? "";
                      editCheatData((d) => buildCheatSheetFromPost(hook, body, {
                        author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
                      }));
                      toast.success("Cheat sheet regenerated from post");
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Regenerate sheet from post
                  </Button>
                )}
                <CheatSheetForm data={cheatData} setData={editCheatData} />
              </>
            )}
            {active === "carousel" && (
              <>
                {(planMeta?.hook || planMeta?.body || params.get("hook") || params.get("body")) && (
                  <Button
                    type="button" size="sm" variant="outline" className="w-full mb-3"
                    onClick={() => {
                      const hook = planMeta?.hook ?? params.get("hook") ?? "";
                      const body = planMeta?.body ?? params.get("body") ?? "";
                      const regenerated = buildCarouselFromPost(hook, body, {
                        author: carouselData.author, handleShort: carouselData.handleShort,
                        avatarUrl: carouselData.avatarUrl, photoKey: carouselData.photoKey, themeKey: carouselData.themeKey,
                      });
                      const next = carouselData.themeKey === "figma-template" ? buildSalehFigmaCarousel(regenerated) : regenerated;
                      editCarouselData(next);
                      setSlideIdx(0);
                      toast.success("Slides regenerated from post");
                      // Re-decorate the fresh slides with matching logos + icons.
                      void runAutoPlace(next, { markDirty: true });
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Regenerate slides from post
                  </Button>
                )}
                <CarouselForm data={carouselData} setData={editCarouselData} slideIdx={slideIdx} setSlideIdx={setSlideIdx} />
              </>
            )}
            {active === "square" && (
              <>
                {(planMeta?.hook || planMeta?.body || params.get("hook") || params.get("body")) && (
                  <Button
                    type="button" size="sm" variant="outline" className="w-full mb-3"
                    onClick={() => {
                      const hook = planMeta?.hook ?? params.get("hook") ?? "";
                      const body = planMeta?.body ?? params.get("body") ?? "";
                      editSquareData((d) => buildSquareFromPost(hook, body, {
                        author: d.author, handleShort: d.handleShort, avatarUrl: d.avatarUrl, photoKey: d.photoKey,
                      }));
                      toast.success("Hot take regenerated from post");
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Regenerate hot take from post
                  </Button>
                )}
                <SquareForm data={squareData} setData={editSquareData} />
              </>
            )}
          </div>
        </div>
      </div>

      <AssetPickerDialog
        open={assetPickerOpen}
        onClose={closeAssetPicker}
        onPick={(a) => { addImageFromAsset(a as any); closeAssetPicker(); }}
        onUsePhoto={useAssetAsPhoto}
        photoMode={photoPickMode}
        defaultAspect={active === "square" ? "1:1" : "4:5"}
        canvasSize={DIMENSIONS[active]}
      />
      <TemplateStylePicker
        open={stylePickerOpen}
        current={currentTheme}
        onPick={applyTheme}
        onClose={() => setStylePickerOpen(false)}
      />

      {aiReviewOpen && aiReview && (() => {
        const totalNotes = Array.isArray(aiReview.slideNotes) ? aiReview.slideNotes.length : 0;
        const doneCount = appliedNotes.filter((i) => Number(i) < totalNotes).length;
        const progressPct = totalNotes > 0 ? Math.round((doneCount / totalNotes) * 100) : 0;
        const allDone = totalNotes > 0 && doneCount >= totalNotes;
        const scoreDelta = typeof baseScore === "number" && typeof aiReview.score === "number" ? aiReview.score - baseScore : null;
        const highUnapplied = Array.isArray(aiReview.slideNotes)
          ? (aiReview.slideNotes as any[]).filter((n: any, i: number) => n.severity === "high" && n.fix?.action === "rewrite" && !appliedNotes.includes(String(i)))
          : [];
        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAiReviewOpen(false)}>
            <div className="bg-background rounded-lg border border-border w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">AI review</h3>
                  {typeof aiReview.score === "number" && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      aiReview.score >= 75 ? "bg-emerald-500/15 text-emerald-500"
                      : aiReview.score >= 50 ? "bg-amber-500/15 text-amber-600"
                      : "bg-destructive/15 text-destructive"}`}>
                      {aiReview.score}/100
                      {scoreDelta !== null && scoreDelta !== 0 && (
                        <span className={scoreDelta > 0 ? "text-emerald-400 ml-1" : "text-destructive ml-1"}>
                          {scoreDelta > 0 ? `+${scoreDelta} ↑` : `${scoreDelta} ↓`}
                        </span>
                      )}
                    </span>
                  )}
                  {highUnapplied.length > 0 && (
                    <button
                      type="button"
                      onClick={applyAllHigh}
                      disabled={fixingAll}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition disabled:opacity-50"
                      title="Batch-apply all high-severity rewrite fixes"
                    >
                      Apply all high ({highUnapplied.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fixEverything}
                    disabled={fixingAll || aiReviewing}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700 transition flex items-center gap-1 disabled:opacity-50"
                    title="Auto-apply all fixes and re-review until score ≥ 80 (up to 3 rounds)"
                  >
                    {fixingAll
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Fixing… round {fixRound}/3</>
                      : <><Wand2 className="w-3 h-3" />Fix Everything</>
                    }
                  </button>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAiReviewOpen(false)}>×</Button>
              </div>
              {staleReview && (
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-[12px] text-amber-600 dark:text-amber-400">
                  <span className="shrink-0">⚠</span>
                  <span className="flex-1">Slide structure changed — some note numbers may be stale.</span>
                  <button
                    type="button"
                    onClick={() => runAiReview(true)}
                    disabled={aiReviewing}
                    className="shrink-0 font-semibold underline underline-offset-2 animate-pulse hover:no-underline"
                  >
                    Re-run now
                  </button>
                </div>
              )}
              {totalNotes > 0 && (
                <div className="px-4 pt-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>{doneCount}/{totalNotes} fixes applied</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {allDone && (
                    <p className="text-[12px] text-emerald-500 font-medium mt-1.5">🎯 All fixes applied — Re-run for final score</p>
                  )}
                </div>
              )}
              {/* Copy / Visual tabs */}
              <div className="flex border-b border-border px-4 pt-3 gap-3">
                <button
                  type="button"
                  onClick={() => setReviewTab("copy")}
                  className={`text-[12px] font-semibold pb-1.5 transition ${reviewTab === "copy" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setReviewTab("visual")}
                  className={`text-[12px] font-semibold pb-1.5 transition flex items-center gap-1 ${reviewTab === "visual" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Ruler className="w-3 h-3" /> Visual
                  {Array.isArray(aiReview.designNotes) && aiReview.designNotes.length > 0 && (
                    <span className="ml-1 bg-sky-500/20 text-sky-600 text-[9px] font-bold px-1 rounded-full">{aiReview.designNotes.length}</span>
                  )}
                </button>
              </div>
              <div className="overflow-auto p-4 space-y-4 text-sm">
                {reviewTab === "copy" && (
                  <>
                    {aiReview.verdict && <p className="font-medium">{aiReview.verdict}</p>}
                    {aiReview.flow && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Narrative flow</div>
                        <p className="text-muted-foreground text-[13px] leading-relaxed">{aiReview.flow}</p>
                      </div>
                    )}
                    {Array.isArray(aiReview.slideNotes) && aiReview.slideNotes.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Per-slide notes</div>
                        <div className="space-y-1.5">
                          {aiReview.slideNotes.map((n: any, i: number) => {
                            const done = appliedNotes.includes(String(i));
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => openCorrection(i, n)}
                                className={`w-full text-left rounded-md border p-2 transition flex gap-2 ${
                                  done ? "border-emerald-500/50 bg-emerald-500/5" : "border-border hover:border-primary"}`}
                                title="Review the fix and accept or edit it"
                              >
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded h-fit ${
                                  done ? "bg-emerald-500/15 text-emerald-500"
                                  : n.severity === "high" ? "bg-destructive/15 text-destructive"
                                  : n.severity === "medium" ? "bg-amber-500/15 text-amber-600"
                                  : "bg-muted text-muted-foreground"}`}>
                                  {done ? "✓ " : ""}Slide {n.n}
                                </span>
                                <span className="text-[12px] flex-1">
                                  <span className={done ? "text-emerald-600 dark:text-emerald-500 line-through/0" : "text-foreground"}>{n.issue}</span>
                                  {n.suggestion && <span className="text-muted-foreground"> → {n.suggestion}</span>}
                                  <span className="block text-[10px] text-primary mt-0.5">{done ? "Applied · tap to revisit" : "Tap to fix →"}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {Array.isArray(aiReview.improvements) && aiReview.improvements.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Top improvements</div>
                        <ul className="space-y-1">
                          {aiReview.improvements.map((s: string, i: number) => (
                            <li key={i} className="flex gap-2 text-[13px]"><span className="text-primary shrink-0">{i + 1}.</span><span>{s}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {reviewTab === "visual" && (
                  <>
                    {Array.isArray(aiReview.designNotes) && aiReview.designNotes.length > 0 ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Visual / Design issues</div>
                        <div className="space-y-1.5">
                          {(aiReview.designNotes as any[]).map((dn: any, i: number) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                const slide = carouselData.slides?.[(dn.n ?? 1) - 1];
                                setCorrection({
                                  idx: -1,
                                  note: { ...dn, issue: dn.issue, reason: dn.issue },
                                  action: dn.fix?.action === "trim" ? "rewrite" : (dn.fix?.action ?? "rewrite"),
                                  title: slide?.title ?? "",
                                  body: dn.fix?.body ?? slide?.body ?? "",
                                });
                              }}
                              className="w-full text-left rounded-md border border-sky-500/40 bg-sky-500/5 p-2 transition hover:border-sky-500 flex gap-2"
                              title="Apply this visual fix"
                            >
                              <span className="shrink-0">
                                <Ruler className="w-3.5 h-3.5 text-sky-500 mt-0.5" />
                              </span>
                              <span className="text-[12px] flex-1">
                                <span className="text-foreground font-medium">Slide {dn.n} · {dn.type}</span>
                                <span className="block text-muted-foreground">{dn.issue}</span>
                                <span className="block text-[10px] text-sky-600 mt-0.5">Tap to fix →</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-emerald-500 font-medium">✓ No visual issues detected</p>
                    )}
                  </>
                )}
              </div>
              <div className="p-3 border-t border-border flex justify-between items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Saved — accepted fixes train future reviews.</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aiReviewing}
                    onClick={() => runAiReview(true)}
                    className={staleReview ? "animate-pulse ring-1 ring-amber-500/50" : ""}
                  >
                    {aiReviewing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Re-run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAiReviewOpen(false)}>Close</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {correction && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setCorrection(null)}>
          <div className="bg-background rounded-lg border border-border w-full max-w-md max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-sm">Fix slide {correction.note?.n}</h3>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCorrection(null)}>×</Button>
            </div>
            <div className="overflow-auto p-4 space-y-3 text-sm">
              <div className="rounded-md bg-destructive/5 border border-destructive/30 p-2.5">
                <div className="text-[11px] font-semibold text-destructive mb-0.5">The issue</div>
                <p className="text-[12px]">{correction.note?.issue}</p>
              </div>
              {correction.note?.reason && (
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-0.5">Why it matters</div>
                  <p className="text-[12px] text-muted-foreground">{correction.note.reason}</p>
                </div>
              )}
              {correction.action === "remove" ? (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/40 p-2.5 text-[12px]">
                  This slide is redundant. Accepting will <strong>remove slide {correction.note?.n}</strong> from the deck.
                </div>
              ) : (
                <>
                  {correction.action === "merge" && (
                    <div className="rounded-md bg-sky-500/10 border border-sky-500/40 p-2.5 text-[12px]">
                      Slide {correction.note?.n} will be <strong>merged into slide {(correction.note?.n ?? 2) - 1}</strong> using the combined copy below.
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">{correction.action === "merge" ? "Merged title (editable)" : "Corrected title (editable)"}</label>
                    <Input value={correction.title} onChange={(e) => setCorrection({ ...correction, title: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">{correction.action === "merge" ? "Merged body (editable)" : "Corrected body (editable)"}</label>
                    <textarea
                      rows={4}
                      value={correction.body}
                      onChange={(e) => setCorrection({ ...correction, body: e.target.value })}
                      className="w-full text-sm p-2 rounded-md border border-border bg-background"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="p-3 border-t border-border flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCorrection(null)}>Cancel</Button>
              <Button
                size="sm"
                className={correction.action === "remove" ? "bg-destructive hover:bg-destructive/90 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                onClick={applyCorrection}
              >
                {correction.action === "remove" ? <><Trash2 className="w-3.5 h-3.5 mr-1" /> Remove slide</>
                  : correction.action === "merge" ? <><Check className="w-3.5 h-3.5 mr-1" /> Merge &amp; apply</>
                  : <><Check className="w-3.5 h-3.5 mr-1" /> Accept &amp; apply</>}
              </Button>
            </div>
          </div>
        </div>
      )}
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
  cta: "CTA — closing follow / connect",
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
  onAddImage, onSetPhoto, onAddText, onAddShape,
  onUpdate, onDelete,
}: {
  overlays: Overlay[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddImage: () => void;
  onSetPhoto: () => void;
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
      <Button size="sm" variant="outline" className="w-full border-primary/40 text-primary hover:bg-primary/10" onClick={onSetPhoto}>
        <User className="w-3.5 h-3.5 mr-1" /> Profile picture
      </Button>
      <p className="text-[10px] text-muted-foreground">Sets the headshot used on the cover &amp; footer — pick from your uploads. You can also click the photo directly on the slide.</p>

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
              {o.type === "image" && <span className="text-muted-foreground truncate flex-1">{(o as any).name || (o as any).src?.split("/").pop()?.slice(0, 30)}</span>}
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
              <FieldText label="Layer Name / Label" value={(sel as any).name ?? ""} onChange={(v) => onUpdate({ name: v } as any)} placeholder="e.g. Logo layer" />
              <div className="flex items-center justify-between border border-border p-2 rounded-md bg-muted/20 my-1">
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold block">Remove white background</label>
                  <p className="text-[10px] text-muted-foreground leading-tight">Makes solid white pixel boundaries transparent.</p>
                </div>
                <Switch
                  checked={!!(sel as any).removeBg}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      const orig = (sel as any).originalSrc ?? (sel as any).src;
                      toast.loading("Removing background...", { id: "bg-remove" });
                      const transparent = await removeWhiteBackground(orig);
                      onUpdate({
                        src: transparent,
                        originalSrc: orig,
                        removeBg: true
                      } as any);
                      toast.success("Background removed", { id: "bg-remove" });
                    } else {
                      const orig = (sel as any).originalSrc ?? (sel as any).src;
                      onUpdate({
                        src: orig,
                        removeBg: false
                      } as any);
                      toast.success("Background restored");
                    }
                  }}
                />
              </div>
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
/* Implemented in components/designer/linkedin/AssetPickerDialog.tsx */
