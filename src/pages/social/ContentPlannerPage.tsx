import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Send, Linkedin, Facebook, Instagram, Twitter, Youtube, Image as ImageIcon, Calendar as CalendarIcon, Sparkles, Figma, Copy, Palette, Linkedin as LinkedinIcon, Share2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { listContentPlan, createPlannerPost, updatePlanEntry, deletePlanEntry, pushSinglePost, PLANNER_PLATFORMS, generatePostImage, getWriterSettings } from "@/lib/social-queries";
import { generateDesignFromPrompt } from "@/lib/designer-queries";
import { getMyLinkedInConnection, postToLinkedIn, getMyCanvaConnection, exportCanvaDesign, getMyMetaConnection, postToFacebook, postToInstagram, type SocialConnectionMeta } from "@/lib/social-connections";
import { CanvaDesignPicker } from "@/components/CanvaDesignPicker";
import GenerateWithAIDialog from "@/components/GenerateWithAIDialog";
import { supabase } from "@/integrations/supabase/client";
import { getProfile } from "@/lib/supabase-queries";
import LinkedInReview from "./LinkedInReview";
import PlatformReview from "./PlatformReview";
import { PostPreview } from "@/components/social/PostPreview";
import { resolveAvatarUrl } from "@/lib/avatar";
import PhotoStoryDialog from "@/components/social/PhotoStoryDialog";

const STATUSES = ["planned", "drafting", "ready", "scheduled", "posted", "failed"];
const PLATFORM_ICONS: Record<string, any> = { linkedin: Linkedin, facebook: Facebook, instagram: Instagram, twitter: Twitter, youtube: Youtube };
type View = "month" | "week" | "day" | "list";

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfWeek(d: Date) { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtMonth(d: Date) { return d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }

function statusColor(s: string) {
  return s === "posted" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : s === "scheduled" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
    : s === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";
}

function formatScheduled(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (isNaN(d)) return null;
  const ms = d - Date.now();
  const abs = Math.abs(ms);
  const s = Math.round(abs / 1000);
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const days = Math.round(h / 24);
  let label: string;
  if (s < 60) label = `${s}s`;
  else if (m < 60) label = `${m}m`;
  else if (h < 24) label = `${h}h`;
  else label = `${days}d`;
  return ms > 0 ? `in ${label}` : `${label} ago`;
}

// Brand colors for posts on the calendar
const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  linkedin:  { bg: "#1877F2", text: "#ffffff", border: "#1877F2" },
  facebook:  { bg: "#90D5FF", text: "#0a2540", border: "#5cb8ec" },
  instagram: { bg: "#d62976", text: "#ffffff", border: "#d62976" },
  twitter:   { bg: "#000000", text: "#ffffff", border: "#000000" },
};
function primaryPlatform(e: any): string | null {
  const list: string[] = e?.platforms ?? [];
  for (const p of list) if (PLATFORM_COLORS[p]) return p;
  return null;
}
function isReviewSourced(e: any): boolean {
  const s = e?.source_kind ?? "";
  return s === "linkedin_review" || s === "facebook_review" || s === "instagram_review" || s === "twitter_review";
}

type PlannerMode = "calendar" | "linkedin-review" | "facebook-review" | "instagram-review" | "twitter-review";

export default function ContentPlannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawMode = (searchParams.get("mode") as string | null) ?? (typeof window !== "undefined" ? localStorage.getItem("planner_mode") : null);
  const mode: PlannerMode =
    rawMode === "linkedin-review" ? "linkedin-review"
    : rawMode === "facebook-review" ? "facebook-review"
    : rawMode === "instagram-review" ? "instagram-review"
    : rawMode === "twitter-review" ? "twitter-review"
    : "calendar";
  function setMode(m: PlannerMode) {
    const sp = new URLSearchParams(searchParams); sp.set("mode", m); setSearchParams(sp, { replace: true });
    try { localStorage.setItem("planner_mode", m); } catch { /* ignore */ }
  }

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<any | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [photoStoryOpen, setPhotoStoryOpen] = useState(false);

  async function load() { setLoading(true); setEntries(await listContentPlan()); setLoading(false); }
  useEffect(() => { if (mode === "calendar") load(); }, [mode]);

  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of entries) {
      const k = e.scheduled_date || "unscheduled";
      (m[k] ||= []).push(e);
    }
    return m;
  }, [entries]);

  function shift(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  return (
    <section className="space-y-4 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1400px] mx-auto w-full">
      {/* Mode switcher */}
      <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 w-fit flex-wrap">
        {([
          { v: "calendar", l: "Calendar", icon: CalendarIcon, color: undefined },
          { v: "linkedin-review", l: "LinkedIn Review", icon: LinkedinIcon, color: PLATFORM_COLORS.linkedin.bg },
          { v: "facebook-review", l: "Facebook Review", icon: Facebook, color: PLATFORM_COLORS.facebook.bg },
          { v: "instagram-review", l: "Instagram Review", icon: Instagram, color: PLATFORM_COLORS.instagram.bg },
          { v: "twitter-review", l: "Twitter X Review", icon: Twitter, color: PLATFORM_COLORS.twitter.bg },
        ] as const).map(({ v, l, icon: Ic, color }) => (
          <button key={v} onClick={() => setMode(v)}
            className={`text-xs px-3 py-1.5 rounded inline-flex items-center gap-1.5 ${mode === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <Ic className="w-3.5 h-3.5" style={color ? { color } : undefined} /> {l}
          </button>
        ))}
      </div>

      {mode === "linkedin-review" ? <LinkedInReview />
        : mode === "facebook-review" ? <PlatformReview platform="facebook" />
        : mode === "instagram-review" ? <PlatformReview platform="instagram" />
        : mode === "twitter-review" ? <PlatformReview platform="twitter" /> : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
          <span className="ml-2 text-sm font-medium">
            {view === "month" && fmtMonth(cursor)}
            {view === "week" && `Week of ${ymd(startOfWeek(cursor))}`}
            {view === "day" && cursor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            {view === "list" && "All entries"}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {(["month","week","day","list"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs px-2.5 py-1 rounded ${view === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
          <Button size="sm" className="ml-1" onClick={() => setCreatingFor(ymd(new Date()))}><Plus className="w-4 h-4 mr-1" /> New</Button>
          <Button size="sm" variant="secondary" className="ml-1" onClick={() => setPhotoStoryOpen(true)}>
            <ImageIcon className="w-4 h-4 mr-1" /> Photo → Post
          </Button>
        </div>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        view === "month" ? <MonthView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : view === "week" ? <WeekView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : view === "day" ? <DayView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : <ListView entries={entries} onOpen={(e) => setEditing(e)} />}

      {editing && <PostEditor entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {creatingFor && <PostEditor entry={{ scheduled_date: creatingFor, status: "planned", platforms: [] }} isNew onClose={() => setCreatingFor(null)} onSaved={() => { setCreatingFor(null); load(); }} />}
      <PhotoStoryDialog
        open={photoStoryOpen}
        onClose={() => setPhotoStoryOpen(false)}
        onSaved={() => { setPhotoStoryOpen(false); load(); }}
      />
      </>
      )}
    </section>
  );
}

function EntryChip({ e, onClick }: { e: any; onClick: () => void }) {
  const platform = primaryPlatform(e);
  const reviewSourced = isReviewSourced(e);
  const posted = e?.status === "posted";
  const failed = e?.status === "failed";

  if (platform) {
    const c = PLATFORM_COLORS[platform];
    // Posted = muted/strikethrough so it visually recedes once it's done.
    const style: React.CSSProperties = posted
      ? { background: `${c.bg}55`, color: c.text, borderColor: `${c.border}80`, opacity: 0.65 }
      : { background: c.bg, color: c.text, borderColor: c.border };
    return (
      <button onClick={onClick}
        className={`w-full text-left px-1.5 py-1 rounded text-[11px] border truncate hover:opacity-90 ${posted ? "line-through" : ""} ${failed ? "ring-1 ring-red-500" : ""}`}
        style={style}
        title={`${platform}${reviewSourced ? " · from review" : ""}${posted ? " · posted" : failed ? " · failed" : ""}`}>
        {posted ? <span className="mr-1 no-underline">✓</span>
          : failed ? <span className="mr-1 text-red-600">!</span>
          : reviewSourced ? <span className="mr-1">✓</span> : null}
        <span className="font-medium">{e.scheduled_time?.slice(0, 5) ?? ""}</span> {e.hook}
      </button>
    );
  }
  return (
    <button onClick={onClick}
      className={`w-full text-left px-1.5 py-1 rounded text-[11px] border truncate hover:opacity-90 ${statusColor(e.status)} ${posted ? "line-through opacity-60" : ""}`}>
      {posted ? <span className="mr-1 no-underline">✓ </span> : null}
      <span className="font-medium">{e.scheduled_time?.slice(0, 5) ?? ""}</span> {e.hook}
    </button>
  );
}

function MonthView({ cursor, grouped, onPick, onOpen }: { cursor: Date; grouped: Record<string, any[]>; onPick: (d: string) => void; onOpen: (e: any) => void }) {
  const first = startOfMonth(cursor);
  const start = startOfWeek(first);
  const today = ymd(new Date());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/40 text-[11px] uppercase text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="p-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
        {days.map((d) => {
          const k = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = grouped[k] ?? [];
          const hasReview = items.some(isReviewSourced);
          return (
            <div key={k} className={`border-t border-r border-border p-1.5 flex flex-col gap-1 ${inMonth ? "" : "bg-muted/20 text-muted-foreground"} ${hasReview ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${k === today ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold" : hasReview ? "text-primary font-semibold" : ""}`}>{d.getDate()}</span>
                <button onClick={() => onPick(k)} className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-primary"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="space-y-1 overflow-hidden">
                {items.slice(0, 3).map((e) => <EntryChip key={e.id} e={e} onClick={() => onOpen(e)} />)}
                {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekView({ cursor, grouped, onPick, onOpen }: any) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const k = ymd(d);
        const items = grouped[k] ?? [];
        return (
          <Card key={k} className="p-2 min-h-[200px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
              <button onClick={() => onPick(k)} className="text-muted-foreground hover:text-primary"><Plus className="w-3 h-3" /></button>
            </div>
            <div className="space-y-1">
              {items.map((e: any) => <EntryChip key={e.id} e={e} onClick={() => onOpen(e)} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DayView({ cursor, grouped, onPick, onOpen }: any) {
  const k = ymd(cursor);
  const items = grouped[k] ?? [];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">{cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        <Button size="sm" onClick={() => onPick(k)}><Plus className="w-4 h-4 mr-1" /> Add post</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No posts scheduled.</p> :
        <div className="space-y-2">
          {items.map((e: any) => {
            const posted = e?.status === "posted";
            return (
              <button key={e.id} onClick={() => onOpen(e)}
                className={`w-full text-left p-3 rounded-lg border ${statusColor(e.status)} ${posted ? "opacity-60" : ""}`}>
                <div className="text-xs flex items-center gap-1">
                  {posted && <span className="text-emerald-500">✓ posted</span>}
                  {posted && <span className="opacity-50">·</span>}
                  <span>{e.scheduled_time?.slice(0,5) ?? "no time"}</span>
                  <span>·</span>
                  <span>{(e.platforms ?? []).join(", ") || "no platform"}</span>
                </div>
                <div className={`font-medium mt-1 ${posted ? "line-through" : ""}`}>{e.hook}</div>
                {e.body && <div className={`text-xs opacity-80 mt-1 line-clamp-2 ${posted ? "line-through" : ""}`}>{e.body}</div>}
              </button>
            );
          })}
        </div>}
    </Card>
  );
}

function ListView({ entries, onOpen }: { entries: any[]; onOpen: (e: any) => void }) {
  if (!entries.length) return <Card className="p-8 text-center text-muted-foreground">No posts yet.</Card>;
  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const posted = e?.status === "posted";
        return (
        <button key={e.id} onClick={() => onOpen(e)} className="w-full text-left">
          <Card className={`p-4 hover:border-primary/40 transition-colors ${posted ? "opacity-60 bg-muted/20" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(e.status)}`}>{e.status}</Badge>
                  {e.scheduled_date && <span>📅 {e.scheduled_date}{e.scheduled_time ? ` · ${e.scheduled_time.slice(0,5)}` : ""}</span>}
                  {(e.platforms ?? []).map((p: string) => {
                    const Ic = PLATFORM_ICONS[p];
                    return Ic ? <Ic key={p} className="w-3 h-3" /> : null;
                  })}
                </div>
                <div className={`font-medium text-sm ${posted ? "line-through" : ""}`}>{e.hook}</div>
                {e.body && <p className={`text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap ${posted ? "line-through" : ""}`}>{e.body}</p>}
              </div>
              {e.image_url && <img src={e.image_url} alt="" className={`w-16 h-16 object-cover rounded-md ${posted ? "grayscale" : ""}`} />}
            </div>
          </Card>
        </button>
      );
      })}
    </div>
  );
}

function PostEditor({ entry, isNew, onClose, onSaved }: { entry: any; isNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    hook: "", body: "", image_url: "", scheduled_date: "", scheduled_time: "",
    status: "planned", figma_brief: "", ...entry,
    platforms: entry?.platforms ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [designBusy, setDesignBusy] = useState(false);
  const [linkedDesign, setLinkedDesign] = useState<{ id: string; thumbnail_url: string | null } | null>(null);
  const [linkedinConn, setLinkedinConn] = useState<SocialConnectionMeta | null>(null);
  const [postingToLinkedIn, setPostingToLinkedIn] = useState(false);
  const [canvaConn, setCanvaConn] = useState<SocialConnectionMeta | null>(null);
  const [canvaPickerOpen, setCanvaPickerOpen] = useState(false);
  const [pullingFromCanva, setPullingFromCanva] = useState(false);
  const [metaConn, setMetaConn] = useState<SocialConnectionMeta | null>(null);
  const [postingToFacebook, setPostingToFacebook] = useState(false);
  const [postingToInstagram, setPostingToInstagram] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [figmaBrief, setFigmaBrief] = useState<string | null>(entry?.figma_brief ?? null);
  const [me, setMe] = useState<{ name?: string; linkedin_url?: string; style?: string } | null>(null);
  const [profileMeta, setProfileMeta] = useState<{ name?: string; avatar_url?: string | null; headline?: string }>({});

  // Look up the linked Studio design (if any) so we can offer "Use design as image"
  useEffect(() => {
    if (!entry?.id) return;
    (async () => {
      const { data } = await supabase
        .from("designs" as any)
        .select("id,thumbnail_url")
        .eq("planner_entry_id", entry.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setLinkedDesign(data as any);
    })();
  }, [entry?.id]);

  // LinkedIn connection (drives the "Post directly" button)
  useEffect(() => {
    getMyLinkedInConnection().then(setLinkedinConn).catch(() => setLinkedinConn(null));
  }, []);
  // Canva connection (drives the "Design in Canva" + "Pull from Canva" buttons)
  useEffect(() => {
    getMyCanvaConnection().then(setCanvaConn).catch(() => setCanvaConn(null));
  }, []);
  // Meta connection (drives the "Post to Facebook" + "Post to Instagram" buttons)
  useEffect(() => {
    getMyMetaConnection().then(setMetaConn).catch(() => setMetaConn(null));
  }, []);

  // Re-fetch this entry when the window regains focus — covers the case where
  // the user attached a PDF carousel via LinkedIn Templates (opened in another
  // tab) and comes back here. Visual fields (image_url, document_url) update
  // live without forcing them to close + reopen the post.
  useEffect(() => {
    if (!entry?.id) return;
    const refresh = async () => {
      const { data } = await supabase
        .from("social_content_plan" as any)
        .select("image_url, document_url, document_filename")
        .eq("id", entry.id)
        .maybeSingle();
      if (!data) return;
      setForm((cur: any) => ({
        ...cur,
        image_url: (data as any).image_url ?? cur.image_url,
        document_url: (data as any).document_url ?? cur.document_url,
        document_filename: (data as any).document_filename ?? cur.document_filename,
      }));
    };
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [entry?.id]);

  async function postToFacebookNow() {
    if (!entry?.id) { toast.error("Save the post first"); return; }
    setPostingToFacebook(true);
    try {
      const r = await postToFacebook({ plan_id: entry.id });
      toast.success(`Posted to Facebook (${r.post_id ?? "ok"})`);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Facebook post failed"); }
    finally { setPostingToFacebook(false); }
  }
  async function postToInstagramNow() {
    if (!entry?.id) { toast.error("Save the post first"); return; }
    if (!form.image_url) { toast.error("Instagram requires an image — add one first"); return; }
    setPostingToInstagram(true);
    try {
      const r = await postToInstagram({ plan_id: entry.id });
      toast.success(`Posted to Instagram (${r.media_id ?? "ok"})`);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Instagram post failed"); }
    finally { setPostingToInstagram(false); }
  }

  async function pullFromCanva() {
    if (!entry?.canva_design_id) { toast.error("No Canva design linked yet"); return; }
    setPullingFromCanva(true);
    try {
      const r = await exportCanvaDesign({ design_id: entry.canva_design_id, plan_id: entry.id, format: "png" });
      setForm({ ...form, image_url: r.image_url });
      toast.success("Pulled latest export from Canva");
    } catch (e: any) { toast.error(e?.message ?? "Pull from Canva failed"); }
    finally { setPullingFromCanva(false); }
  }

  async function postToLinkedInNow() {
    if (!entry?.id) { toast.error("Save the post first"); return; }
    if (!form.hook?.trim()) { toast.error("Hook is required"); return; }
    setPostingToLinkedIn(true);
    try {
      const r = await postToLinkedIn({ plan_id: entry.id });
      toast.success(`Posted to LinkedIn (${r.post_urn ?? "ok"})`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "LinkedIn post failed");
    } finally {
      setPostingToLinkedIn(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [p, w] = await Promise.all([getProfile(), getWriterSettings()]);
        setMe({
          name: (p as any)?.full_name || (p as any)?.name || "",
          linkedin_url: (w as any)?.linkedin_url || "",
          style: (w as any)?.image_style_prompt || "",
        });
        const { data: { user } } = await supabase.auth.getUser();
        const avatar = await resolveAvatarUrl({
          userId: user?.id,
          storedAvatar: (p as any)?.avatar_url ?? null,
          oauthAvatarUrl: (user?.user_metadata as any)?.avatar_url ?? null,
        }).catch(() => null);
        setProfileMeta({
          name: (p as any)?.full_name || (p as any)?.name || user?.user_metadata?.full_name || "",
          avatar_url: avatar ?? (user?.user_metadata as any)?.avatar_url ?? null,
          headline: (w as any)?.headline || (p as any)?.headline || "",
        });
      } catch { /* ignore */ }
    })();
  }, []);

  function togglePlatform(p: string) {
    const cur: string[] = form.platforms ?? [];
    setForm({ ...form, platforms: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  }

  // Combine the user's local date + time into a UTC ISO timestamp so the
  // dispatcher fires at the right moment regardless of server timezone.
  function localDateTimeToUtcIso(date: string, time: string): string | null {
    if (!date) return null;
    const t = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "09:00";
    const local = new Date(`${date}T${t}:00`);
    if (isNaN(local.getTime())) return null;
    return local.toISOString();
  }

  async function save(overrideStatus?: string) {
    if (!form.hook?.trim()) { toast.error("Hook is required"); return; }
    setBusy(true);
    try {
      const status = overrideStatus ?? form.status;
      const scheduled_at = (status === "scheduled" || form.scheduled_date)
        ? localDateTimeToUtcIso(form.scheduled_date, form.scheduled_time)
        : null;
      const payload: any = {
        hook: form.hook, body: form.body || null, image_url: form.image_url || null,
        document_url: form.document_url || null, document_filename: form.document_filename || null,
        scheduled_date: form.scheduled_date || null, scheduled_time: form.scheduled_time || null,
        scheduled_at,
        platforms: form.platforms ?? [], status,
        figma_brief: figmaBrief ?? form.figma_brief ?? null,
      };
      if (isNew) await createPlannerPost(payload);
      else await updatePlanEntry(entry.id, payload);
      if (overrideStatus === "scheduled") toast.success(`Scheduled for ${formatScheduled(scheduled_at)}`);
      else toast.success("Saved");
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  function scheduleNow() {
    if (!form.scheduled_date) { toast.error("Pick a date first"); return; }
    if (!form.scheduled_time) { toast.error("Pick a time first"); return; }
    if (!(form.platforms ?? []).length) { toast.error("Pick at least one platform"); return; }
    const utc = localDateTimeToUtcIso(form.scheduled_date, form.scheduled_time);
    if (!utc) { toast.error("Invalid date/time"); return; }
    if (new Date(utc).getTime() <= Date.now()) { toast.error("Pick a future date/time"); return; }
    setForm({ ...form, status: "scheduled" });
    save("scheduled");
  }

  function useDesignAsImage() {
    if (!linkedDesign?.thumbnail_url) { toast.error("Save the design in Studio first"); return; }
    setForm({ ...form, image_url: linkedDesign.thumbnail_url });
    toast.success("Design thumbnail set as image");
  }

  async function sendNow() {
    if (!entry?.id) { toast.error("Save first"); return; }
    if (!(form.platforms ?? []).length) { toast.error("Pick at least one platform"); return; }
    setBusy(true);
    try {
      const { data, error } = await pushSinglePost(entry.id);
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      toast.success(r?.status === "posted" ? "Posted via webhook ✓" : `Webhook: ${r?.status ?? "done"}`);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Send failed"); } finally { setBusy(false); }
  }

  async function remove() {
    if (!entry?.id) return onClose();
    if (!confirm("Delete this post?")) return;
    await deletePlanEntry(entry.id); toast.success("Deleted"); onSaved();
  }

  async function generateImage() {
    if (!form.hook?.trim()) { toast.error("Add a hook first"); return; }
    setGenBusy(true);
    try {
      const { data, error } = await generatePostImage({
        hook: form.hook,
        post_body: form.body ?? "",
        entry_id: entry?.id ?? null,
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (!d?.image_url) throw new Error("No image returned");
      setForm({ ...form, image_url: d.image_url });
      toast.success("Image generated with your style");
    } catch (e: any) {
      toast.error(e?.message ?? "Image generation failed");
    } finally { setGenBusy(false); }
  }

  async function designInStudio() {
    if (!form.hook?.trim()) { toast.error("Add a hook first"); return; }
    setDesignBusy(true);
    try {
      const platforms: string[] = form.platforms ?? [];
      const platform = (["linkedin","instagram","facebook","x"].includes(platforms[0]) ? platforms[0] : "linkedin") as any;
      const prompt = `Hook: ${form.hook}\n\nBody: ${form.body ?? ""}`.trim();
      const { data, error } = await generateDesignFromPrompt({ prompt, type: "single", platform });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (!d?.id) throw new Error("No design returned");
      if (entry?.id) {
        try { await supabase.from("designs" as any).update({ planner_entry_id: entry.id } as any).eq("id", d.id); } catch { /* ignore */ }
      }
      toast.success("Design created — opening editor");
      navigate(`/designer/${d.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Design failed");
    } finally { setDesignBusy(false); }
  }

  function buildFigmaBrief() {
    const author = me?.name || "(your name)";
    const linkedin = me?.linkedin_url || "(your LinkedIn URL)";
    const style = me?.style?.trim() || "Modern, editorial, social-friendly. High-contrast display typography, plenty of negative space, brand colour accents.";
    const platforms = (form.platforms ?? []).join(", ") || "linkedin";
    const date = form.scheduled_date || "(unscheduled)";
    const brief = [
      `# Figma Design Prompt — ready to paste into Figma AI / Make`,
      ``,
      `## Author`,
      `- Name: ${author}`,
      `- LinkedIn: ${linkedin}`,
      `- Target platform(s): ${platforms}`,
      `- Scheduled: ${date}`,
      ``,
      `## Post content`,
      `Hook (headline):`,
      `> ${form.hook || "(no hook)"}`,
      ``,
      `Body / context:`,
      `> ${(form.body || "(no body)").slice(0, 1500)}`,
      ``,
      `## Design goal`,
      `Create a single 1080x1080 square social image that visually expresses the hook above and feels native to ${platforms}. The image must reinforce the message of the post — every visual choice (typography weight, colour, illustration, photo) should reflect the meaning and emotion of the hook and body.`,
      ``,
      `## Visual style guide (from my brand profile)`,
      style,
      ``,
      `## Layout`,
      `- Canvas: 1080 x 1080 px, safe margin 80 px on all sides.`,
      `- Top 60%: bold display headline distilled from the hook (max 8–10 words). Use 2 line breaks max.`,
      `- Bottom 40%: a supporting visual element (abstract shape, icon, illustration, or photo) that ties to the body's main idea.`,
      `- Footer (bottom 80 px): small handle "${author}" on the left, subtle brand accent shape on the right.`,
      `- No watermarks, no logos, no embedded body text other than the headline and footer name.`,
      ``,
      `## Typography`,
      `- Headline: display sans-serif, ExtraBold, 92–112 px, tight tracking.`,
      `- Footer name: sans-serif, Medium, 22 px, 70% opacity.`,
      ``,
      `## Deliverable`,
      `One Figma frame named "${(form.hook || "post").slice(0, 40)}" at 1080x1080, exportable as PNG @1x.`,
      ``,
      `## How to use`,
      `1. Open Figma → press "/" or open Figma AI / Make.`,
      `2. Paste this entire brief.`,
      `3. Adjust headline copy if needed and export as PNG.`,
    ].join("\n");
    setFigmaBrief(brief);
  }

  async function copyBrief() {
    if (!figmaBrief) return;
    try { await navigator.clipboard.writeText(figmaBrief); toast.success("Brief copied"); }
    catch { toast.error("Copy failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle>{isNew ? "New post" : "Edit post"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-0 flex-1 overflow-hidden">
        <div className="space-y-3 overflow-y-auto px-4 sm:px-6 py-4 lg:border-r border-border">
          <div><Label>Hook / headline</Label><Input value={form.hook ?? ""} onChange={(e) => setForm({ ...form, hook: e.target.value })} /></div>
          <div><Label>Body</Label><Textarea rows={6} value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Visual</Label>
            <Input placeholder="Image URL — paste, or use the buttons below" value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="default"
                onClick={() => {
                  if (!form.hook?.trim()) { toast.error("Add a hook first"); return; }
                  setAiDialogOpen(true);
                }} disabled={genBusy}>
                {genBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Generate with AI
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={buildFigmaBrief}>
                <Figma className="w-4 h-4 mr-1" /> Design in Figma
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={designInStudio} disabled={designBusy}>
                {designBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Palette className="w-4 h-4 mr-1" />}
                Design in Studio
              </Button>
              {entry?.id && (
                <Button type="button" size="sm" variant="outline"
                  className="border-emerald-500/40 text-emerald-300"
                  onClick={() => {
                    const params = new URLSearchParams({
                      planId: entry.id,
                      preset: "cheatsheet",
                    });
                    if (form.hook) params.set("hook", form.hook);
                    if (form.body) params.set("body", form.body);
                    navigate(`/designer/linkedin-templates?${params.toString()}`);
                  }}>
                  <Sparkles className="w-4 h-4 mr-1" /> LinkedIn Template
                </Button>
              )}
              {linkedDesign?.thumbnail_url && (
                <Button type="button" size="sm" variant="outline" onClick={useDesignAsImage}
                  className="border-emerald-500/40 text-emerald-300">
                  <Palette className="w-4 h-4 mr-1" /> Use Studio design as image
                </Button>
              )}
              {canvaConn && entry?.id && (
                <Button type="button" size="sm" variant="outline"
                  className="border-purple-500/40 text-purple-300"
                  onClick={() => setCanvaPickerOpen(true)}>
                  <Palette className="w-4 h-4 mr-1" /> Design in Canva
                </Button>
              )}
              {canvaConn && entry?.canva_design_id && (
                <Button type="button" size="sm" variant="outline"
                  className="border-purple-500/40 text-purple-300"
                  onClick={pullFromCanva} disabled={pullingFromCanva}>
                  {pullingFromCanva ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Palette className="w-4 h-4 mr-1" />}
                  Pull from Canva
                </Button>
              )}
            </div>
            {entry?.canva_design_id && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <Palette className="w-3 h-3" />
                Linked Canva design:
                <code className="text-[10px]">{entry.canva_design_id.slice(0, 12)}…</code>
                {entry.canva_design_url && (
                  <a href={entry.canva_design_url} target="_blank" rel="noreferrer" className="underline text-primary">
                    open in Canva
                  </a>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              "Generate with AI" → OpenAI <code>gpt-image-1</code> with your style prompt (Social Studio → Settings).
              "Design in Figma" → full prompt with your name + LinkedIn, ready to paste into Figma AI.
              "Design in Studio" → opens the in-app editor; saving there auto-updates this image.
            </p>
            {linkedDesign && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <Palette className="w-3 h-3" />
                Linked Studio design:
                <a href={`/designer/${linkedDesign.id}`} className="underline text-primary truncate max-w-[280px]">
                  {linkedDesign.id.slice(0, 8)}…
                </a>
                {linkedDesign.thumbnail_url && (
                  <a href={linkedDesign.thumbnail_url} target="_blank" rel="noreferrer" className="underline text-primary">open thumbnail</a>
                )}
              </div>
            )}
            {form.document_url ? (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 font-display font-bold text-xs">PDF</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">PDF carousel attached</div>
                    <div className="text-sm font-medium truncate">{form.document_filename ?? "Document"}</div>
                    <p className="text-[11px] text-muted-foreground">Will publish to LinkedIn as a native swipeable carousel — not a single image.</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <a href={form.document_url} target="_blank" rel="noreferrer">View PDF</a>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, document_url: "", document_filename: "" })}>
                      Remove
                    </Button>
                  </div>
                </div>
                {form.image_url && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Cover preview</span>
                    <img src={form.image_url} alt="" className="h-16 rounded-md border border-border" />
                  </div>
                )}
              </div>
            ) : (
              form.image_url && <img src={form.image_url} alt="" className="max-h-48 rounded-md border border-border" />
            )}
            {figmaBrief && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Figma design brief</span>
                  <Button type="button" size="sm" variant="ghost" onClick={copyBrief}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{figmaBrief}</pre>
              </div>
            )}
          </div>
          <ScheduleBlock
            date={form.scheduled_date ?? ""}
            time={(form.scheduled_time ?? "").slice(0, 5)}
            status={form.status}
            onChange={(p) => setForm({ ...form, ...p })}
            utcIso={localDateTimeToUtcIso(form.scheduled_date, form.scheduled_time)}
          />
          <div>
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLANNER_PLATFORMS.map((p) => {
                const Ic = PLATFORM_ICONS[p];
                const on = (form.platforms ?? []).includes(p);
                return (
                  <button key={p} type="button" onClick={() => togglePlatform(p)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                    <Ic className="w-3 h-3" /> {p}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">When status = scheduled and date/time arrives, the cron sends this to each platform's webhook (configured in Settings → Webhooks).</p>
          </div>
          {entry?.webhook_response && (
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Webhook response</summary>
              <pre className="bg-muted/40 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(entry.webhook_response, null, 2)}</pre>
              {entry.webhook_error && <p className="text-destructive mt-1">{entry.webhook_error}</p>}
            </details>
          )}
        </div>
        <aside className="hidden lg:flex flex-col bg-muted/20 px-4 py-4 overflow-hidden">
          <PostPreview
            hook={form.hook ?? ""}
            body={form.body ?? ""}
            image_url={form.image_url ?? null}
            document_filename={form.document_filename ?? null}
            author={profileMeta}
            selectedPlatforms={form.platforms ?? []}
          />
        </aside>
        </div>
        <DialogFooter className="flex-wrap gap-2 px-6 py-3 border-t border-border bg-background shrink-0">
          {!isNew && <Button variant="ghost" onClick={remove} className="text-destructive"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!isNew && <Button variant="outline" onClick={sendNow} disabled={busy}>
            <Send className="w-4 h-4 mr-1" /> Webhook send
          </Button>}
          {!isNew && linkedinConn && (form.platforms ?? []).includes("linkedin") && (
            <Button
              onClick={postToLinkedInNow}
              disabled={postingToLinkedIn || busy}
              style={{ background: "#1877F2", color: "#fff" }}
              title={`Post directly to LinkedIn as ${linkedinConn.display_name ?? "you"}`}>
              {postingToLinkedIn
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Linkedin className="w-4 h-4 mr-1" />}
              Post to LinkedIn
            </Button>
          )}
          {!isNew && metaConn && (form.platforms ?? []).includes("facebook") && (
            <Button
              onClick={postToFacebookNow}
              disabled={postingToFacebook || busy}
              style={{ background: "#1877F2", color: "#fff" }}
              title="Post directly to your Facebook Page">
              {postingToFacebook
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Facebook className="w-4 h-4 mr-1" />}
              Post to Facebook
            </Button>
          )}
          {!isNew && metaConn && (form.platforms ?? []).includes("instagram") && (
            <Button
              onClick={postToInstagramNow}
              disabled={postingToInstagram || busy || !form.image_url}
              style={{ background: "#d62976", color: "#fff" }}
              title={form.image_url ? "Post directly to your Instagram Business account" : "Add an image first — Instagram requires it"}>
              {postingToInstagram
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <Instagram className="w-4 h-4 mr-1" />}
              Post to Instagram
            </Button>
          )}
          <Button variant="outline" onClick={scheduleNow} disabled={busy}
            className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10"
            title="Save and queue this post to fire at the chosen date/time">
            <CalendarClock className="w-4 h-4 mr-1" /> Schedule
          </Button>
          <Button onClick={() => save()} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save</Button>
        </DialogFooter>

        {canvaConn && entry?.id && (
          <CanvaDesignPicker
            open={canvaPickerOpen}
            onClose={() => setCanvaPickerOpen(false)}
            planId={entry.id}
            hook={form.hook ?? ""}
            body={form.body ?? ""}
            onLinked={({ design_id, edit_url }) => {
              setForm({ ...form, canva_design_id: design_id, canva_design_url: edit_url ?? form.canva_design_url });
              onSaved();
            }}
          />
        )}

        <GenerateWithAIDialog
          open={aiDialogOpen}
          onClose={() => setAiDialogOpen(false)}
          hook={form.hook ?? ""}
          body={form.body ?? ""}
          planId={entry?.id ?? null}
          onGenerated={(image_url) => setForm({ ...form, image_url })}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleBlock — polished date / time / status picker
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; dot: string; ring: string }> = {
  planned:   { label: "Planned",   dot: "bg-slate-400",   ring: "data-[on=true]:bg-slate-500/15 data-[on=true]:text-slate-700 dark:data-[on=true]:text-slate-200 data-[on=true]:border-slate-400/40" },
  drafting:  { label: "Drafting",  dot: "bg-amber-400",   ring: "data-[on=true]:bg-amber-500/15 data-[on=true]:text-amber-700 dark:data-[on=true]:text-amber-300 data-[on=true]:border-amber-500/40" },
  ready:     { label: "Ready",     dot: "bg-violet-400",  ring: "data-[on=true]:bg-violet-500/15 data-[on=true]:text-violet-700 dark:data-[on=true]:text-violet-300 data-[on=true]:border-violet-500/40" },
  scheduled: { label: "Scheduled", dot: "bg-blue-500",    ring: "data-[on=true]:bg-blue-500/15 data-[on=true]:text-blue-700 dark:data-[on=true]:text-blue-300 data-[on=true]:border-blue-500/40" },
  posted:    { label: "Posted",    dot: "bg-emerald-500", ring: "data-[on=true]:bg-emerald-500/15 data-[on=true]:text-emerald-700 dark:data-[on=true]:text-emerald-300 data-[on=true]:border-emerald-500/40" },
  failed:    { label: "Failed",    dot: "bg-destructive", ring: "data-[on=true]:bg-destructive/15 data-[on=true]:text-destructive data-[on=true]:border-destructive/40" },
};

const TIME_PRESETS = ["08:00", "09:00", "12:00", "15:00", "18:00", "20:00"];

function toLocalYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ScheduleBlock({
  date, time, status, utcIso, onChange,
}: {
  date: string;
  time: string;
  status: string;
  utcIso: string | null;
  onChange: (p: Partial<{ scheduled_date: string; scheduled_time: string; status: string }>) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextMonday = (() => {
    const d = new Date(today);
    const days = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + days);
    return d;
  })();

  const dateObj = date ? new Date(`${date}T00:00:00`) : undefined;
  const past = utcIso ? new Date(utcIso).getTime() <= Date.now() : false;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const datePresets: { label: string; value: Date }[] = [
    { label: "Today",       value: today },
    { label: "Tomorrow",    value: tomorrow },
    { label: "Next Monday", value: nextMonday },
  ];

  const dateLabel = dateObj
    ? dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "Pick a date";

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground/80">Schedule</Label>
        {date && (
          <button
            type="button"
            onClick={() => onChange({ scheduled_date: "", scheduled_time: "" })}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Date + Time row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-11 justify-start font-normal text-sm",
                !date && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="w-4 h-4 mr-2 text-primary" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {datePresets.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => onChange({ scheduled_date: toLocalYmd(p.value) })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="single"
              selected={dateObj}
              onSelect={(d) => d && onChange({ scheduled_date: toLocalYmd(d) })}
              className={cn("p-0 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {/* Time picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-11 justify-start font-normal text-sm",
                !time && "text-muted-foreground",
              )}
            >
              <Clock className="w-4 h-4 mr-2 text-primary" />
              {time || "Pick a time"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {TIME_PRESETS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={time === t ? "default" : "secondary"}
                  className="h-8 text-xs"
                  onClick={() => onChange({ scheduled_time: t })}
                >
                  {t}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <Label className="text-[11px] text-muted-foreground shrink-0">Custom</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => onChange({ scheduled_time: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status segmented pills */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const meta = STATUS_META[s];
            const on = status === s;
            return (
              <button
                key={s}
                type="button"
                data-on={on}
                onClick={() => onChange({ status: s })}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border text-xs font-medium transition-all",
                  "border-border bg-background text-muted-foreground hover:text-foreground",
                  meta.ring,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                {meta.label}
                {on && <Check className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live hint */}
      {date && time && utcIso && (
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-[11px]",
            past
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : status === "scheduled"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {past
              ? <>In the past — pick a future moment to schedule</>
              : status === "scheduled"
                ? <>Will fire <strong>{relativeTime(utcIso)}</strong> · {formatScheduled(utcIso)} ({tz})</>
                : <>Set <strong>{relativeTime(utcIso)}</strong> · {formatScheduled(utcIso)} — click <strong>Schedule</strong> to confirm</>}
          </span>
        </div>
      )}
    </div>
  );
}