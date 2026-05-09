import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Check, X, Sparkles, Loader2, Eye, EyeOff, Zap, Target, Trash2,
  Save, Wand2, MessageSquare, Minimize2, Maximize2, Feather, Languages,
  Hash, BarChart3, Calendar, Tag, FileText, Download, RotateCcw, Copy, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getPostsForUser, listStates, upsertState, clearAllStates, rewritePost,
  pillarColor, POST_TYPE_LABELS, exportMarkdown, isSeedUser,
  type LinkedInPost, type PostState, type PostStatus,
} from "@/lib/linkedin-review";
import { supabase } from "@/integrations/supabase/client";
import { createPlannerPost } from "@/lib/social-queries";

function parsePostDate(s: string): string | null {
  // e.g. "Tue, May 12 2026" -> "2026-05-12"
  const cleaned = s.replace(/^[A-Za-z]+,\s*/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Effective date = user override (stored in state.notes) ?? parsed from post.date */
function effectiveDate(post: LinkedInPost, state?: PostState): string | null {
  if (isIsoDate(state?.notes)) return state!.notes!;
  return parsePostDate(post.date);
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return `${wd}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

async function syncToCalendar(post: LinkedInPost, status: PostStatus, edited?: string | null, overrideDate?: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const marker = `[linkedin_review:${post.id}]`;
  const { data: existingRaw } = await supabase
    .from("social_content_plan" as any)
    .select("id")
    .eq("user_id", user.id)
    .eq("source_kind", "linkedin_review")
    .ilike("notes", `${marker}%`)
    .maybeSingle();
  const existing = existingRaw as unknown as { id: string } | null;
  if (status === "kept") {
    const date = overrideDate ?? parsePostDate(post.date);
    const lines = (edited ?? post.body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const hook = lines[0]?.slice(0, 200) || post.topic;
    const body = edited ?? post.body;
    if (existing?.id) {
      await supabase.from("social_content_plan" as any).update({ hook, body, scheduled_date: date, notes: `${marker} ${post.topic}` } as any).eq("id", existing.id);
    } else {
      await createPlannerPost({
        hook, body, scheduled_date: date ?? undefined,
        platforms: ["linkedin"], status: "ready",
        source_kind: "linkedin_review",
      } as any);
      // tag the just-created row with the marker so we can find it later
      await supabase.from("social_content_plan" as any)
        .update({ notes: `${marker} ${post.topic}` } as any)
        .eq("user_id", user.id)
        .eq("source_kind", "linkedin_review")
        .eq("scheduled_date", date)
        .eq("hook", hook)
        .is("notes", null);
    }
  } else {
    if (existing?.id) await supabase.from("social_content_plan" as any).delete().eq("id", existing.id);
  }
}

type Filter = {
  search: string; status: "all" | PostStatus; pillar: string;
  year: number | null;            // selected year (null = all years)
  monthIdx: number | null;        // 0..11, null = all months in year
  hideRejected: boolean;
};

export default function LinkedInReview() {
  const [posts, setPosts] = useState<LinkedInPost[]>([]);
  const [states, setStates] = useState<Record<string, PostState>>({});
  const [loading, setLoading] = useState(true);
  const [seedUser, setSeedUser] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth();
  const [filter, setFilter] = useState<Filter>({
    search: "", status: "all", pillar: "all",
    year: nowYear, monthIdx: null, hideRejected: false,
  });

  async function reload() {
    setLoading(true);
    try {
      const [p, s, isSeed] = await Promise.all([getPostsForUser(), listStates(), isSeedUser()]);
      setPosts(p); setStates(s); setSeedUser(isSeed);
    } finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const pillars = useMemo(() => Array.from(new Set(posts.map((p) => p.pillar))), [posts]);

  // All years that have at least one post (by effective date), plus current year + 1
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of posts) {
      const d = effectiveDate(p, states[p.id]);
      if (d) ys.add(parseInt(d.slice(0, 4), 10));
    }
    ys.add(nowYear);
    ys.add(nowYear + 1);
    return Array.from(ys).sort((a, b) => a - b);
  }, [posts, states, nowYear]);

  // Auto-pick a year that has posts on first load if current year is empty
  useEffect(() => {
    if (!posts.length) return;
    const hasInYear = posts.some((p) => {
      const d = effectiveDate(p, states[p.id]);
      return d && parseInt(d.slice(0, 4), 10) === filter.year;
    });
    if (!hasInYear) {
      const firstWith = years.find((y) => posts.some((p) => {
        const d = effectiveDate(p, states[p.id]);
        return d && parseInt(d.slice(0, 4), 10) === y;
      }));
      if (firstWith && firstWith !== filter.year) setFilter((f) => ({ ...f, year: firstWith }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  // Counts per month for the active year
  const monthCounts = useMemo(() => {
    const counts = Array.from({ length: 12 }, () => ({ total: 0, kept: 0, rejected: 0 }));
    for (const p of posts) {
      const d = effectiveDate(p, states[p.id]);
      if (!d) continue;
      const y = parseInt(d.slice(0, 4), 10);
      if (filter.year !== null && y !== filter.year) continue;
      const m = parseInt(d.slice(5, 7), 10) - 1;
      counts[m].total++;
      const st = states[p.id]?.status;
      if (st === "kept") counts[m].kept++;
      else if (st === "rejected") counts[m].rejected++;
    }
    return counts;
  }, [posts, states, filter.year]);

  const stats = useMemo(() => {
    let kept = 0, rejected = 0, edited = 0, pending = 0;
    for (const p of posts) {
      const s = states[p.id];
      if (!s || s.status === "pending") pending++;
      else if (s.status === "kept") kept++;
      else if (s.status === "rejected") rejected++;
      if (s?.edited_body) edited++;
    }
    return { total: posts.length, kept, rejected, edited, pending };
  }, [posts, states]);

  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return posts.filter((p) => {
      const d = effectiveDate(p, states[p.id]);
      if (filter.year !== null) {
        if (!d || parseInt(d.slice(0, 4), 10) !== filter.year) return false;
      }
      if (filter.monthIdx !== null) {
        if (!d || parseInt(d.slice(5, 7), 10) - 1 !== filter.monthIdx) return false;
      }
      if (filter.pillar !== "all" && p.pillar !== filter.pillar) return false;
      const status = states[p.id]?.status ?? "pending";
      if (filter.status !== "all" && status !== filter.status) return false;
      if (filter.hideRejected && status === "rejected") return false;
      if (q && !(p.topic.toLowerCase().includes(q) || p.body.toLowerCase().includes(q) || p.date.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [posts, states, filter]);

  async function setStatus(post_id: string, status: PostStatus) {
    const prev = states[post_id];
    setStates((s) => ({ ...s, [post_id]: { ...(prev ?? { post_id, edited_body: null, notes: null, updated_at: "" }), status, post_id, updated_at: new Date().toISOString() } }));
    try {
      await upsertState(post_id, { status });
      const post = posts.find((p) => p.id === post_id);
      if (post) {
        await syncToCalendar(post, status, prev?.edited_body ?? null, isIsoDate(prev?.notes) ? prev!.notes : null);
        if (status === "kept") toast.success("Added to Calendar");
      }
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function saveEdit(post_id: string, edited_body: string | null) {
    setStates((s) => ({ ...s, [post_id]: { ...(s[post_id] ?? { post_id, status: "pending", notes: null, updated_at: "" }), edited_body, post_id, updated_at: new Date().toISOString() } as PostState }));
    try {
      await upsertState(post_id, { edited_body });
      const post = posts.find((p) => p.id === post_id);
      const cur = states[post_id];
      if (post && cur?.status === "kept") await syncToCalendar(post, "kept", edited_body, isIsoDate(cur?.notes) ? cur!.notes : null);
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function changeDate(post_id: string, newDate: string | null) {
    const prev = states[post_id];
    const next: PostState = {
      post_id,
      status: prev?.status ?? "pending",
      edited_body: prev?.edited_body ?? null,
      notes: newDate, // store ISO date in notes (or null to clear override)
      updated_at: new Date().toISOString(),
    };
    setStates((s) => ({ ...s, [post_id]: next }));
    try {
      await upsertState(post_id, { notes: newDate });
      const post = posts.find((p) => p.id === post_id);
      if (post && next.status === "kept") {
        await syncToCalendar(post, "kept", next.edited_body, newDate);
      }
      toast.success(newDate ? `Moved to ${formatLongDate(newDate)}` : "Date reset");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function reset(post_id: string) {
    if (!confirm("Reset this post? Edits and status will be cleared.")) return;
    setStates((s) => { const n = { ...s }; delete n[post_id]; return n; });
    try { await upsertState(post_id, { status: "pending", edited_body: null, notes: null }); }
    catch (e: any) { toast.error(e?.message); reload(); }
  }

  async function clearAll() {
    if (!confirm("Clear ALL review state for every post?")) return;
    await clearAllStates(); setStates({}); toast.success("Cleared");
  }

  function doExport() {
    const md = exportMarkdown(posts, states);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkedin-plan-reviewed-${new Date().toISOString().slice(0,10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const editingPost = editingId ? posts.find((p) => p.id === editingId) ?? null : null;

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  if (!seedUser && posts.length === 0) {
    return (
      <Card className="p-12 text-center space-y-3 border-dashed">
        <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
        <h3 className="font-display text-xl font-semibold">LinkedIn Review</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          This workspace is ready but empty. The review module loads a curated content plan and lets you triage,
          edit and AI-rewrite posts. Importing your own plan will be available soon.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
        <div>
          <h2 className="font-display text-xl font-semibold">LinkedIn Content Review</h2>
          <p className="text-xs text-muted-foreground">Saleh Seddik · B2B GTM · May → Dec 2026</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="Total" value={stats.total} tone="zinc" />
          <StatPill label="Kept" value={stats.kept} tone="emerald" />
          <StatPill label="Rejected" value={stats.rejected} tone="red" />
          <StatPill label="Edited" value={stats.edited} tone="amber" />
          <StatPill label="Pending" value={stats.pending} tone="zinc-light" />
          <Button size="sm" variant="outline" onClick={doExport}><Download className="w-3.5 h-3.5 mr-1" /> Export</Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={clearAll} title="Clear all review state"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Month tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 sticky top-[58px] z-[9] bg-background/95 backdrop-blur">
        <MonthTab label="All" active={filter.month === "all"} onClick={() => setFilter({ ...filter, month: "all" })} count={posts.length} />
        {months.map((m) => {
          const monthPosts = posts.filter((p) => p.month === m);
          const k = monthPosts.filter((p) => states[p.id]?.status === "kept").length;
          const r = monthPosts.filter((p) => states[p.id]?.status === "rejected").length;
          const short = m.split(" — ")[0];
          return <MonthTab key={m} label={short} active={filter.month === m} onClick={() => setFilter({ ...filter, month: m })} count={monthPosts.length} kept={k} rejected={r} />;
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="Search topic, body, date" className="pl-8 h-9" />
        </div>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v as any })}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="kept">Kept</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.pillar} onValueChange={(v) => setFilter({ ...filter, pillar: v })}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pillars</SelectItem>
            {pillars.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setFilter({ ...filter, hideRejected: !filter.hideRejected })}>
          {filter.hideRejected ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
          {filter.hideRejected ? "Show rejected" : "Hide rejected"}
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{filtered.length} post{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No posts match these filters.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <PostCard key={p.id} post={p} state={states[p.id]}
              onOpen={() => setEditingId(p.id)}
              onKeep={() => setStatus(p.id, "kept")}
              onReject={() => setStatus(p.id, "rejected")} />
          ))}
        </div>
      )}

      {editingPost && (
        <PostEditorModal
          post={editingPost}
          state={states[editingPost.id]}
          onClose={() => setEditingId(null)}
          onSetStatus={(s) => setStatus(editingPost.id, s)}
          onSaveEdit={(b) => saveEdit(editingPost.id, b)}
          onReset={() => { reset(editingPost.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-muted text-foreground",
    emerald: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border border-red-500/30",
    amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    "zinc-light": "bg-muted/50 text-muted-foreground border border-border",
  };
  return (
    <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${tones[tone] ?? tones.zinc}`}>
      <span className="font-semibold">{value}</span><span className="opacity-80">{label}</span>
    </div>
  );
}

function MonthTab({ label, active, onClick, count, kept = 0, rejected = 0 }: { label: string; active: boolean; onClick: () => void; count: number; kept?: number; rejected?: number }) {
  return (
    <button onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-md border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
      <span className="font-medium">{label}</span>
      <span className="ml-1.5 opacity-70">{count}</span>
      {(kept > 0 || rejected > 0) && (
        <span className="ml-1.5 inline-flex gap-0.5">
          {kept > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
          {rejected > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
        </span>
      )}
    </button>
  );
}

function PostCard({ post, state, onOpen, onKeep, onReject }: {
  post: LinkedInPost; state?: PostState; onOpen: () => void; onKeep: () => void; onReject: () => void;
}) {
  const status = state?.status ?? "pending";
  const pc = pillarColor(post.pillar);
  const body = state?.edited_body ?? post.body;
  const borderClass = status === "kept" ? "border-emerald-500/50" : status === "rejected" ? "border-red-500/50 opacity-60" : "border-border";
  return (
    <Card className={`p-3 flex flex-col gap-2 border ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pc.chip} ${pc.border} ${pc.text}`}>{post.pillar}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title={POST_TYPE_LABELS[post.post_type] ?? ""}>{post.post_type}</span>
          {state?.edited_body && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">edited</span>}
        </div>
        <StatusDot status={status} />
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Calendar className="w-3 h-3" /> {post.date}
      </div>
      <button onClick={onOpen} className="text-left">
        <h3 className="text-sm font-semibold leading-snug">{post.topic}</h3>
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-6">{body}</p>
      </button>
      <div className="flex items-center gap-1 mt-auto pt-1">
        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={onOpen}>Open</Button>
        <Button size="sm" variant={status === "kept" ? "default" : "outline"}
          className={`h-8 ${status === "kept" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}`}
          onClick={onKeep}><Check className="w-3.5 h-3.5" /></Button>
        <Button size="sm" variant={status === "rejected" ? "destructive" : "outline"}
          className={`h-8 ${status === "rejected" ? "" : "border-red-500/40 text-red-300 hover:bg-red-500/10"}`}
          onClick={onReject}><X className="w-3.5 h-3.5" /></Button>
      </div>
    </Card>
  );
}

function StatusDot({ status }: { status: PostStatus }) {
  const cfg = status === "kept" ? { c: "bg-emerald-400", l: "Kept" }
    : status === "rejected" ? { c: "bg-red-400", l: "Rejected" }
    : { c: "bg-zinc-500", l: "Pending" };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${cfg.c}`} /> {cfg.l}
    </span>
  );
}

/* ---------- Editor modal ---------- */

type Mode = "custom" | "topic" | "remove" | "rewrite" | "shorter" | "longer" | "hook" | "proof" | "less-corporate" | "polish" | "translate-es" | "translate-ar";

const QUICK_FILLS = [
  "Speak less about ", "Add more about ", "Make the hook stronger",
  "Cut the last 3 lines", "Add a real number", "Reorder for impact",
  "Soften the tone", "Sharpen the ending",
];

const STYLE_CHIPS: { key: string; label: string }[] = [
  { key: "punchier", label: "Punchier" },
  { key: "contrarian", label: "More contrarian" },
  { key: "story", label: "As a story" },
  { key: "framework", label: "As a framework" },
  { key: "carousel", label: "As a carousel" },
  { key: "casual", label: "More casual" },
];

function PostEditorModal({ post, state, onClose, onSetStatus, onSaveEdit, onReset }: {
  post: LinkedInPost; state?: PostState;
  onClose: () => void;
  onSetStatus: (s: PostStatus) => void;
  onSaveEdit: (body: string | null) => void;
  onReset: () => void;
}) {
  const [body, setBody] = useState<string>(state?.edited_body ?? post.body);
  const [customText, setCustomText] = useState("");
  const [activePreset, setActivePreset] = useState<Mode | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [removeInput, setRemoveInput] = useState("");
  const [styleSel, setStyleSel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<any>(null);
  const customRef = useRef<HTMLTextAreaElement>(null);

  const original = post.body;
  const modified = body !== original;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function callRewrite(payload: any) {
    setBusy(true); setPreview(null); setLastCall(payload);
    try {
      const r = await rewritePost({ ...payload, postBody: body });
      if (r.error) throw new Error(r.error);
      if (!r.rewrite) throw new Error("No rewrite returned");
      setPreview(r.rewrite);
    } catch (e: any) { toast.error(e?.message ?? "Rewrite failed"); }
    finally { setBusy(false); }
  }

  function fireCustom() {
    const t = customText.trim();
    if (!t) { toast.error("Tell Claude what to do"); return; }
    callRewrite({ mode: "custom", customText: t });
  }

  function firePreset(mode: Mode, extra: any = {}) {
    callRewrite({ mode, ...extra });
  }

  function quickFill(text: string) {
    setCustomText((c) => (c ? c + " " : "") + text);
    setTimeout(() => customRef.current?.focus(), 0);
  }

  const pc = pillarColor(post.pillar);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-5 border-b border-border space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] px-1.5 py-0.5 rounded border ${pc.chip} ${pc.border} ${pc.text}`}>{post.pillar}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{post.post_type} · {POST_TYPE_LABELS[post.post_type] ?? "Post"}</span>
            <span className="text-[11px] text-muted-foreground"><Calendar className="w-3 h-3 inline mr-1" />{post.date}</span>
          </div>
          <h2 className="text-lg font-semibold leading-tight">{post.topic}</h2>
          <p className="text-xs text-muted-foreground">{post.month}</p>
        </div>

        {/* Body editor */}
        <div className="p-5 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Post body</label>
            <span className="text-[11px] text-muted-foreground">
              {body.length} chars {modified && <span className="ml-2 text-amber-300">· modified</span>}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={Math.min(20, Math.max(8, body.split("\n").length + 2))}
            className="w-full text-sm p-3 rounded-md border border-border bg-background font-mono leading-relaxed resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!modified} onClick={() => { onSaveEdit(body); toast.success("Edit saved"); }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50">
              <Save className="w-3.5 h-3.5 mr-1" /> Save edit
            </Button>
            <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(body); toast.success("Copied"); }}>
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300" onClick={() => onSetStatus("kept")}>
              <Check className="w-3.5 h-3.5 mr-1" /> Keep
            </Button>
            <Button size="sm" variant="outline" className="border-red-500/40 text-red-300" onClick={() => onSetStatus("rejected")}>
              <X className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          </div>
        </div>

        {/* Rewrite with Claude */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Rewrite with Claude</h3>
          </div>

          {/* Custom instruction */}
          <Card className="p-3 border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <MessageSquare className="w-3.5 h-3.5" /> Tell Claude what to do
            </div>
            <textarea ref={customRef}
              value={customText} onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fireCustom(); } }}
              rows={3}
              placeholder='e.g. "Speak less about Cairo and more about the marketing automation angle." or "Make the second paragraph more contrarian."'
              className="w-full text-sm p-2 rounded-md border border-border bg-background"
            />
            <div className="flex flex-wrap gap-1">
              {QUICK_FILLS.map((t) => (
                <button key={t} onClick={() => quickFill(t)}
                  className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-amber-400 text-muted-foreground hover:text-foreground">
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Tip: Cmd/Ctrl+Enter to send.</span>
              <Button size="sm" disabled={busy || !customText.trim()} onClick={fireCustom}
                className="bg-amber-500 hover:bg-amber-600 text-white">
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Rewrite
              </Button>
            </div>
          </Card>

          {/* Preset buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            <PresetBtn icon={Target} label="Refocus topic" onClick={() => setActivePreset(activePreset === "topic" ? null : "topic")} active={activePreset === "topic"} />
            <PresetBtn icon={Hash} label="Remove keywords" onClick={() => setActivePreset(activePreset === "remove" ? null : "remove")} active={activePreset === "remove"} />
            <PresetBtn icon={Wand2} label="Different style" onClick={() => setActivePreset(activePreset === "rewrite" ? null : "rewrite")} active={activePreset === "rewrite"} />
            <PresetBtn icon={Minimize2} label="Make shorter" onClick={() => firePreset("shorter")} disabled={busy} />
            <PresetBtn icon={Maximize2} label="Make longer" onClick={() => firePreset("longer")} disabled={busy} />
            <PresetBtn icon={Zap} label="Stronger hook" onClick={() => firePreset("hook")} disabled={busy} />
            <PresetBtn icon={BarChart3} label="Add proof" onClick={() => firePreset("proof")} disabled={busy} />
            <PresetBtn icon={Trash2} label="Less corporate" onClick={() => firePreset("less-corporate")} disabled={busy} />
            <PresetBtn icon={Feather} label="Polish only" onClick={() => firePreset("polish")} disabled={busy} />
            <PresetBtn icon={Languages} label="Translate" onClick={() => setActivePreset(activePreset === "translate-es" ? null : "translate-es")} active={activePreset === "translate-es" || activePreset === "translate-ar"} />
          </div>

          {activePreset === "topic" && (
            <Card className="p-3 space-y-2">
              <Input value={topicInput} onChange={(e) => setTopicInput(e.target.value)} placeholder="New topic to refocus on" />
              <Button size="sm" disabled={busy || !topicInput.trim()} onClick={() => firePreset("topic", { newTopic: topicInput.trim() })}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Refocus
              </Button>
            </Card>
          )}
          {activePreset === "remove" && (
            <Card className="p-3 space-y-2">
              <Input value={removeInput} onChange={(e) => setRemoveInput(e.target.value)} placeholder="comma, separated, terms" />
              <Button size="sm" disabled={busy || !removeInput.trim()} onClick={() => firePreset("remove", { keywords: removeInput.split(",").map((s) => s.trim()).filter(Boolean) })}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Rewrite without
              </Button>
            </Card>
          )}
          {activePreset === "rewrite" && (
            <Card className="p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {STYLE_CHIPS.map((s) => (
                  <button key={s.key} onClick={() => { setStyleSel(s.key); firePreset("rewrite", { style: s.key }); }}
                    className={`text-xs px-2.5 py-1 rounded-full border ${styleSel === s.key ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "border-border text-muted-foreground hover:border-amber-400"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {(activePreset === "translate-es" || activePreset === "translate-ar") && (
            <Card className="p-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => firePreset("translate-es")}>Spanish</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => firePreset("translate-ar")}>Arabic</Button>
            </Card>
          )}

          {/* Preview */}
          {preview && (
            <Card className="p-3 border-amber-500/40 bg-amber-500/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-amber-300">Rewrite preview</div>
                <span className="text-[11px] text-muted-foreground">{preview.length} chars</span>
              </div>
              <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed bg-background/40 rounded p-2 border border-border max-h-72 overflow-y-auto">{preview}</pre>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => { setBody(preview); setPreview(null); toast.success("Applied to editor"); }}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Use this version
                </Button>
                <Button size="sm" variant="outline" disabled={busy || !lastCall} onClick={() => callRewrite(lastCall)}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Try again
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
              </div>
            </Card>
          )}
        </div>

        {/* Original collapsible */}
        {modified && (
          <details className="px-5 pb-5">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View original</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap font-mono leading-relaxed bg-muted/40 p-3 rounded">{original}</pre>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PresetBtn({ icon: Icon, label, onClick, active, disabled }: { icon: any; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-[11px] transition-colors disabled:opacity-50 ${active ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-border hover:border-amber-400 text-muted-foreground hover:text-foreground"}`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}