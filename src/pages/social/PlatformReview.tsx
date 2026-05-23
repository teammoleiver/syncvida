import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Check, X, Sparkles, Loader2, Eye, EyeOff, Zap, Trash2,
  Save, MessageSquare, Minimize2, Maximize2, Feather, Languages,
  BarChart3, Calendar, Download, RotateCcw, Copy, CalendarDays,
  Plus, Facebook, Instagram, Twitter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listPlatformPosts, listPlatformStates, upsertPlatformState, clearAllPlatformStates,
  createPlatformPost, updatePlatformPost, deletePlatformPost, generatePlatformPost,
  PLATFORM_CONFIG,
  type PlatformPost, type Platform,
} from "@/lib/platform-review";
import {
  pillarColor, POST_TYPE_LABELS, rewritePost,
  type PostState, type PostStatus,
} from "@/lib/linkedin-review";
import { supabase } from "@/integrations/supabase/client";
import { createPlannerPost } from "@/lib/social-queries";

/* ─── helpers (mirror LinkedInReview) ─── */
function parsePostDate(s: string): string | null {
  if (!s) return null;
  const cleaned = s.replace(/^[A-Za-z]+,\s*/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function isIsoDate(s: string | null | undefined): s is string { return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function effectiveDate(post: PlatformPost, state?: PostState): string | null {
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

/* ─── Sync to calendar with appropriate platform + source_kind ─── */
async function syncToCalendar(platform: Platform, post: PlatformPost, status: PostStatus, edited?: string | null, overrideDate?: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const sourceKind = `${platform}_review`;
  const calPlatform = platform === "twitter" ? "twitter" : platform; // twitter → twitter is fine
  const marker = `[${sourceKind}:${post.id}]`;
  const { data: existingRaw } = await supabase
    .from("social_content_plan" as any)
    .select("id")
    .eq("user_id", user.id)
    .eq("source_kind", sourceKind)
    .ilike("notes", `${marker}%`)
    .maybeSingle();
  const existing = existingRaw as unknown as { id: string } | null;
  if (status === "kept") {
    const date = overrideDate ?? parsePostDate(post.date);
    const lines = (edited ?? post.body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const hook = lines[0]?.slice(0, 200) || post.topic;
    const body = edited ?? post.body;
    if (existing?.id) {
      await supabase.from("social_content_plan" as any)
        .update({ hook, body, scheduled_date: date, notes: `${marker} ${post.topic}` } as any)
        .eq("id", existing.id);
    } else {
      await createPlannerPost({
        hook, body, scheduled_date: date ?? undefined,
        platforms: [calPlatform], status: "ready",
        source_kind: sourceKind,
      } as any);
      await supabase.from("social_content_plan" as any)
        .update({ notes: `${marker} ${post.topic}` } as any)
        .eq("user_id", user.id)
        .eq("source_kind", sourceKind)
        .eq("scheduled_date", date)
        .eq("hook", hook)
        .is("notes", null);
    }
  } else if (existing?.id) {
    await supabase.from("social_content_plan" as any).delete().eq("id", existing.id);
  }
}

const PLATFORM_ICON: Record<Platform, any> = {
  facebook: Facebook, instagram: Instagram, twitter: Twitter,
};

type Filter = {
  search: string; status: "all" | PostStatus; pillar: string;
  year: number | null; monthIdx: number | null; hideRejected: boolean;
};

export default function PlatformReview({ platform }: { platform: Platform }) {
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = PLATFORM_ICON[platform];
  const [posts, setPosts] = useState<PlatformPost[]>([]);
  const [states, setStates] = useState<Record<string, PostState>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth();
  const [filter, setFilter] = useState<Filter>({
    search: "", status: "all", pillar: "all",
    year: nowYear, monthIdx: null, hideRejected: false,
  });

  async function reload() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([listPlatformPosts(platform), listPlatformStates(platform)]);
      setPosts(p); setStates(s);
    } finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [platform]);

  const pillars = useMemo(() => Array.from(new Set(posts.map((p) => p.pillar))), [posts]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of posts) {
      const d = effectiveDate(p, states[p.id]);
      if (d) ys.add(parseInt(d.slice(0, 4), 10));
    }
    ys.add(nowYear); ys.add(nowYear + 1);
    return Array.from(ys).sort((a, b) => a - b);
  }, [posts, states, nowYear]);

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
      if (q && !(p.topic.toLowerCase().includes(q) || p.body.toLowerCase().includes(q) || (p.date ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [posts, states, filter]);

  async function setStatus(post_id: string, status: PostStatus) {
    const prev = states[post_id];
    setStates((s) => ({ ...s, [post_id]: { ...(prev ?? { post_id, edited_body: null, notes: null, updated_at: "" }), status, post_id, updated_at: new Date().toISOString() } as PostState }));
    try {
      await upsertPlatformState(platform, post_id, { status });
      const post = posts.find((p) => p.id === post_id);
      if (post) {
        await syncToCalendar(platform, post, status, prev?.edited_body ?? null, isIsoDate(prev?.notes) ? prev!.notes : null);
        if (status === "kept") toast.success("Added to Calendar");
      }
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function saveEdit(post_id: string, edited_body: string | null) {
    setStates((s) => ({ ...s, [post_id]: { ...(s[post_id] ?? { post_id, status: "pending", notes: null, updated_at: "" }), edited_body, post_id, updated_at: new Date().toISOString() } as PostState }));
    try {
      await upsertPlatformState(platform, post_id, { edited_body });
      const post = posts.find((p) => p.id === post_id);
      const cur = states[post_id];
      if (post && cur?.status === "kept") {
        await syncToCalendar(platform, post, "kept", edited_body, isIsoDate(cur?.notes) ? cur!.notes : null);
      }
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function changeDate(post_id: string, newDate: string | null) {
    const prev = states[post_id];
    const next: PostState = {
      post_id,
      status: prev?.status ?? "pending",
      edited_body: prev?.edited_body ?? null,
      notes: newDate,
      updated_at: new Date().toISOString(),
    };
    setStates((s) => ({ ...s, [post_id]: next }));
    try {
      await upsertPlatformState(platform, post_id, { notes: newDate });
      const post = posts.find((p) => p.id === post_id);
      if (post && next.status === "kept") {
        await syncToCalendar(platform, post, "kept", next.edited_body, newDate);
      }
      toast.success(newDate ? `Moved to ${formatLongDate(newDate)}` : "Date reset");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); reload(); }
  }

  async function reset(post_id: string) {
    if (!confirm("Reset this post? Edits and status will be cleared.")) return;
    setStates((s) => { const n = { ...s }; delete n[post_id]; return n; });
    try { await upsertPlatformState(platform, post_id, { status: "pending", edited_body: null, notes: null }); }
    catch (e: any) { toast.error(e?.message); reload(); }
  }

  async function clearAll() {
    if (!confirm(`Clear ALL review state for every ${cfg.label} post?`)) return;
    await clearAllPlatformStates(platform); setStates({}); toast.success("Cleared");
  }

  async function deletePost(id: string) {
    if (!confirm(`Delete this ${cfg.label} post permanently?`)) return;
    await deletePlatformPost(id);
    try {
      await supabase.from("social_content_plan" as any)
        .delete()
        .eq("source_kind", `${platform}_review`)
        .ilike("notes", `[${platform}_review:${id}]%`);
    } catch { /* ignore */ }
    toast.success("Deleted");
    reload();
  }

  function doExport() {
    const grouped: Record<string, PlatformPost[]> = {};
    for (const p of posts) {
      const s = states[p.id];
      if (!s || s.status !== "kept") continue;
      (grouped[p.month || "Unscheduled"] ||= []).push(p);
    }
    const lines: string[] = [];
    lines.push(`# ${cfg.label} Content Plan`);
    lines.push(`# Reviewed export · ${new Date().toISOString()}`);
    lines.push("");
    for (const month of Object.keys(grouped)) {
      lines.push(`## ${month}`); lines.push("");
      for (const p of grouped[month]) {
        const s = states[p.id];
        lines.push("---");
        lines.push(`**${p.date}**  ·  **${p.post_type}**  ·  ${p.pillar}  ·  *${p.topic}*`);
        lines.push("[✓ KEPT]");
        if (s?.edited_body) lines.push("[✎ EDITED]");
        lines.push("");
        lines.push(s?.edited_body ?? p.body);
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${platform}-plan-reviewed-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const editingPost = editingId ? posts.find((p) => p.id === editingId) ?? null : null;

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
        <div className="flex items-start gap-2">
          <Icon className="w-6 h-6 mt-1" style={{ color: cfg.hex }} />
          <div>
            <h2 className="font-display text-xl font-semibold">{cfg.label} Content Review</h2>
            <p className="text-xs text-muted-foreground">Triage, edit and AI-rewrite {cfg.label} posts before they hit the calendar.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="Total" value={stats.total} tone="zinc" />
          <StatPill label="Kept" value={stats.kept} tone="emerald" />
          <StatPill label="Rejected" value={stats.rejected} tone="red" />
          <StatPill label="Edited" value={stats.edited} tone="amber" />
          <StatPill label="Pending" value={stats.pending} tone="zinc-light" />
          <Button size="sm" variant="outline" onClick={() => setGenerating(true)}
            style={{ borderColor: cfg.hex, color: cfg.hex }}>
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Generate with AI
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New post
          </Button>
          <Button size="sm" variant="outline" onClick={doExport}><Download className="w-3.5 h-3.5 mr-1" /> Export</Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={clearAll} title="Clear all review state">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Year + Month grid */}
      <div className="space-y-2 sticky top-[58px] z-[9] bg-background/95 backdrop-blur pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Year</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {years.map((y) => (
              <button key={y}
                onClick={() => setFilter({ ...filter, year: y, monthIdx: null })}
                className={`px-2.5 py-1 text-xs ${filter.year === y ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                {y}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setFilter({ ...filter, monthIdx: null })}>
            All months · {monthCounts.reduce((a, c) => a + c.total, 0)}
          </Button>
          {filter.year === nowYear && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-primary/40 text-primary"
              onClick={() => setFilter({ ...filter, year: nowYear, monthIdx: nowMonth })}>
              Jump to current month
            </Button>
          )}
        </div>
        <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
          {MONTH_NAMES.map((name, i) => {
            const c = monthCounts[i];
            const isCurrent = filter.year === nowYear && i === nowMonth;
            const isActive = filter.monthIdx === i;
            const isPast = filter.year !== null && (filter.year < nowYear || (filter.year === nowYear && i < nowMonth));
            const empty = c.total === 0;
            return (
              <button key={name}
                onClick={() => setFilter({ ...filter, monthIdx: isActive ? null : i })}
                className={[
                  "relative px-2 py-2 rounded-md border text-xs flex flex-col items-center gap-0.5 transition-colors",
                  isActive ? "bg-primary text-primary-foreground border-primary"
                    : isCurrent ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/40"
                    : empty ? "border-dashed border-border/60 text-muted-foreground/60"
                    : "border-border hover:border-primary/40 text-foreground",
                  isPast && empty && !isActive ? "opacity-50" : "",
                ].join(" ")}>
                <span className="font-medium tracking-wide uppercase text-[11px]">{name}</span>
                <span className="flex items-center gap-1 text-[10px] opacity-80">
                  <span>{c.total}</span>
                  {c.kept > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
                  {c.rejected > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                </span>
                {isCurrent && !isActive && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="Search topic, body, date" className="pl-8 h-9" />
        </div>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v as any })}>
          <SelectTrigger className="w-[48%] sm:w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="kept">Kept</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.pillar} onValueChange={(v) => setFilter({ ...filter, pillar: v })}>
          <SelectTrigger className="w-[48%] sm:w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pillars</SelectItem>
            {pillars.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setFilter({ ...filter, hideRejected: !filter.hideRejected })}>
          {filter.hideRejected ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
          {filter.hideRejected ? "Show rejected" : "Hide rejected"}
        </Button>
        <div className="hidden sm:block flex-1" />
        <span className="text-xs text-muted-foreground">{filtered.length} post{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground space-y-3">
          {posts.length === 0 ? (
            <>
              <Icon className="w-10 h-10 mx-auto" style={{ color: cfg.hex }} />
              <h3 className="font-display text-lg font-semibold text-foreground">No {cfg.label} posts yet</h3>
              <p className="text-sm">Create one manually, generate with AI, or duplicate from LinkedIn Review.</p>
              <div className="flex justify-center gap-2 pt-1">
                <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-3.5 h-3.5 mr-1" /> New post</Button>
                <Button size="sm" variant="outline" onClick={() => setGenerating(true)} style={{ borderColor: cfg.hex, color: cfg.hex }}>
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Generate with AI
                </Button>
              </div>
            </>
          ) : "No posts match these filters."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <PostCard key={p.id} post={p} state={states[p.id]} platform={platform}
              onOpen={() => setEditingId(p.id)}
              onKeep={() => setStatus(p.id, "kept")}
              onReject={() => setStatus(p.id, "rejected")}
              onDelete={() => deletePost(p.id)}
            />
          ))}
        </div>
      )}

      {editingPost && (
        <PostEditorModal
          post={editingPost}
          state={states[editingPost.id]}
          platform={platform}
          onClose={() => setEditingId(null)}
          onSetStatus={(s) => setStatus(editingPost.id, s)}
          onSaveEdit={(b) => saveEdit(editingPost.id, b)}
          onReset={() => { reset(editingPost.id); setEditingId(null); }}
          onChangeDate={(d) => changeDate(editingPost.id, d)}
          onUpdateMeta={async (patch) => { await updatePlatformPost(editingPost.id, patch); toast.success("Saved"); reload(); }}
          onDelete={() => { deletePost(editingPost.id); setEditingId(null); }}
        />
      )}

      {creating && <NewPostDialog platform={platform} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {generating && <GenerateDialog platform={platform} onClose={() => setGenerating(false)} onCreated={() => { setGenerating(false); reload(); }} />}
    </div>
  );
}

/* ─── New / Generate dialogs ─── */

function NewPostDialog({ platform, onClose, onCreated }: { platform: Platform; onClose: () => void; onCreated: () => void }) {
  const cfg = PLATFORM_CONFIG[platform];
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState("");
  const [pillar, setPillar] = useState("P1");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!topic.trim()) { toast.error("Topic required"); return; }
    setBusy(true);
    try {
      const isoDate = date || new Date().toISOString().slice(0, 10);
      const d = new Date(isoDate + "T00:00:00");
      const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
      const niceDate = `${wd}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
      const month = `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
      await createPlatformPost({ platform, topic: topic.trim(), body, date: niceDate, month, pillar, source_kind: "manual" });
      toast.success("Created"); onCreated();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New {cfg.label} post</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Topic</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="One-line description" /></div>
          <div><Label>Body</Label>
            <textarea rows={8} className="w-full text-sm p-2 rounded-md border border-border bg-background"
              value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Write the ${cfg.label} post body…`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Schedule date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Pillar</Label>
              <Select value={pillar} onValueChange={setPillar}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["P1","P2","P3","P4","P5","P6"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ platform, onClose, onCreated }: { platform: Platform; onClose: () => void; onCreated: () => void }) {
  const cfg = PLATFORM_CONFIG[platform];
  const defaultInstructions: Record<Platform, string> = {
    facebook: "Write a 4–6 line conversational Facebook post that hooks the reader and ends with a question.",
    instagram: "Write an Instagram caption — bold first line, line breaks, ends with 5–7 hashtags.",
    twitter: "Write a single sharp tweet under 280 chars. No filler, no hashtags.",
  };
  const [topic, setTopic] = useState("");
  const [instructions, setInstructions] = useState(defaultInstructions[platform]);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function gen() {
    if (!topic.trim()) { toast.error("Topic required"); return; }
    setBusy(true); setPreview(null);
    try {
      const r = await generatePlatformPost({ platform, topic, customText: instructions });
      if (r.error) throw new Error(r.error);
      if (!r.rewrite) throw new Error("No content returned");
      setPreview(r.rewrite);
    } catch (e: any) { toast.error(e?.message ?? "Generation failed"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    try {
      const isoDate = date || new Date().toISOString().slice(0, 10);
      const d = new Date(isoDate + "T00:00:00");
      const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
      const niceDate = `${wd}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
      const month = `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
      await createPlatformPost({ platform, topic: topic.trim(), body: preview, date: niceDate, month, source_kind: "ai" });
      toast.success(`Added to ${cfg.label} Review`); onCreated();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: cfg.hex }} /> Generate {cfg.label} post
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Topic / hook idea</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. why most B2B teams over-invest in tools" /></div>
          <div><Label>Instructions to Claude</Label>
            <textarea rows={3} className="w-full text-sm p-2 rounded-md border border-border bg-background"
              value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Schedule date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="flex items-end">
              <Button onClick={gen} disabled={busy} className="w-full text-white"
                style={{ background: cfg.hex, color: cfg.hexText }}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Generate
              </Button>
            </div>
          </div>
          {preview && (
            <Card className="p-3 space-y-2" style={{ borderColor: cfg.hex, background: `${cfg.hex}11` }}>
              <div className="text-xs font-medium" style={{ color: cfg.hex }}>Preview</div>
              <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed bg-background/40 rounded p-2 border border-border max-h-72 overflow-y-auto">{preview}</pre>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={save} disabled={busy}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Save to Review
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={gen}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Regenerate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Cards / status / editor ─── */

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

function PostCard({ post, state, platform, onOpen, onKeep, onReject, onDelete }: {
  post: PlatformPost; state?: PostState; platform: Platform;
  onOpen: () => void; onKeep: () => void; onReject: () => void; onDelete: () => void;
}) {
  const cfg = PLATFORM_CONFIG[platform];
  const status = state?.status ?? "pending";
  const pc = pillarColor(post.pillar);
  const body = state?.edited_body ?? post.body;
  const eff = effectiveDate(post, state);
  const orig = parsePostDate(post.date);
  const moved = eff && orig && eff !== orig;
  const borderClass = status === "kept" ? "border-emerald-500/50"
    : status === "rejected" ? "border-red-500/50 opacity-60"
    : post.source_kind === "duplicate" ? "border-violet-500/40"
    : "border-border";
  const sourceBadge = post.source_kind === "duplicate"
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">from LinkedIn</span>
    : post.source_kind === "ai"
    ? <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ background: `${cfg.hex}22`, color: cfg.hex, borderColor: `${cfg.hex}55` }}>AI</span>
    : null;
  return (
    <Card className={`p-3 flex flex-col gap-2 border ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pc.chip} ${pc.border} ${pc.text}`}>{post.pillar}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title={POST_TYPE_LABELS[post.post_type] ?? ""}>{post.post_type}</span>
          {state?.edited_body && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">edited</span>}
          {sourceBadge}
        </div>
        <StatusDot status={status} />
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Calendar className="w-3 h-3" /> {eff ? formatLongDate(eff) : (post.date || "no date")}
        {moved && <span className="text-amber-300">· moved</span>}
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
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete} title="Delete post">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
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

type Mode = "custom" | "topic" | "remove" | "rewrite" | "shorter" | "longer" | "hook" | "proof" | "less-corporate" | "polish" | "translate-es" | "translate-ar";

function PostEditorModal({ post, state, platform, onClose, onSetStatus, onSaveEdit, onReset, onChangeDate, onUpdateMeta, onDelete }: {
  post: PlatformPost; state?: PostState; platform: Platform;
  onClose: () => void;
  onSetStatus: (s: PostStatus) => void;
  onSaveEdit: (body: string | null) => void;
  onReset: () => void;
  onChangeDate: (date: string | null) => void;
  onUpdateMeta: (patch: Partial<Pick<PlatformPost, "topic" | "pillar" | "post_type">>) => void;
  onDelete: () => void;
}) {
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = PLATFORM_ICON[platform];
  const [body, setBody] = useState<string>(state?.edited_body ?? post.body);
  const [topic, setTopic] = useState(post.topic);
  const [pillar, setPillar] = useState(post.pillar);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<any>(null);
  const customRef = useRef<HTMLTextAreaElement>(null);

  const original = post.body;
  const modified = body !== original;
  const metaModified = topic !== post.topic || pillar !== post.pillar;

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
  function firePreset(mode: Mode, extra: any = {}) { callRewrite({ mode, ...extra }); }
  function quickFill(text: string) {
    setCustomText((c) => (c ? c + " " : "") + text);
    setTimeout(() => customRef.current?.focus(), 0);
  }

  const pc = pillarColor(pillar);
  const originalIso = parsePostDate(post.date);
  const currentIso = effectiveDate(post, state);
  const [dateDraft, setDateDraft] = useState<string>(currentIso ?? "");
  useEffect(() => { setDateDraft(currentIso ?? ""); }, [currentIso]);
  const dateChanged = dateDraft && dateDraft !== currentIso;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-5 border-b border-border space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="w-4 h-4" style={{ color: cfg.hex }} />
            <span className={`text-[11px] px-1.5 py-0.5 rounded border ${pc.chip} ${pc.border} ${pc.text}`}>{pillar}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{post.post_type} · {POST_TYPE_LABELS[post.post_type] ?? "Post"}</span>
            <span className="text-[11px] text-muted-foreground">
              <Calendar className="w-3 h-3 inline mr-1" />
              {currentIso ? formatLongDate(currentIso) : (post.date || "no date")}
              {currentIso && originalIso && currentIso !== originalIso && (
                <span className="ml-1 text-amber-300">(moved from {formatLongDate(originalIso)})</span>
              )}
            </span>
            {post.source_kind === "duplicate" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">duplicated from LinkedIn</span>
            )}
          </div>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="text-lg font-semibold leading-tight" />
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Pillar</Label>
            <Select value={pillar} onValueChange={setPillar}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["P1","P2","P3","P4","P5","P6"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!metaModified}
              onClick={() => onUpdateMeta({ topic, pillar })}>
              <Save className="w-3.5 h-3.5 mr-1" /> Save meta
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Schedule on</span>
            <input type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)}
              className="text-xs h-8 px-2 rounded-md border border-border bg-background" />
            <Button size="sm" variant="outline" disabled={!dateChanged} onClick={() => onChangeDate(dateDraft)} className="h-8">
              <Save className="w-3.5 h-3.5 mr-1" /> Update date
            </Button>
            {currentIso && originalIso && currentIso !== originalIso && (
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => onChangeDate(null)}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset date
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Post body</label>
            <span className="text-[11px] text-muted-foreground">
              {body.length} chars {modified && <span className="ml-2 text-amber-300">· modified</span>}
            </span>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)}
            rows={Math.min(20, Math.max(8, body.split("\n").length + 2))}
            className="w-full text-sm p-3 rounded-md border border-border bg-background font-mono leading-relaxed resize-y" />
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

        {/* Rewrite */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: cfg.hex }} />
            <h3 className="text-sm font-semibold">Rewrite with Claude</h3>
          </div>
          <Card className="p-3 space-y-2" style={{ borderColor: `${cfg.hex}55`, background: `${cfg.hex}0d` }}>
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg.hex }}>
              <MessageSquare className="w-3.5 h-3.5" /> Tell Claude what to do
            </div>
            <textarea ref={customRef} value={customText} onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fireCustom(); } }}
              rows={3} placeholder={`e.g. "Rewrite this for ${cfg.label} — friendlier, less B2B jargon."`}
              className="w-full text-sm p-2 rounded-md border border-border bg-background" />
            <div className="flex flex-wrap gap-1">
              {cfg.quickFills.map((t) => (
                <button key={t} onClick={() => quickFill(t)}
                  className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-primary text-muted-foreground hover:text-foreground">
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Tip: Cmd/Ctrl+Enter to send.</span>
              <Button size="sm" disabled={busy || !customText.trim()} onClick={fireCustom}
                style={{ background: cfg.hex, color: cfg.hexText }}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Rewrite
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            <PresetBtn icon={Minimize2} label="Make shorter" onClick={() => firePreset("shorter")} disabled={busy} />
            <PresetBtn icon={Maximize2} label="Make longer" onClick={() => firePreset("longer")} disabled={busy} />
            <PresetBtn icon={Zap} label="Stronger hook" onClick={() => firePreset("hook")} disabled={busy} />
            <PresetBtn icon={BarChart3} label="Add proof" onClick={() => firePreset("proof")} disabled={busy} />
            <PresetBtn icon={Trash2} label="Less corporate" onClick={() => firePreset("less-corporate")} disabled={busy} />
            <PresetBtn icon={Feather} label="Polish only" onClick={() => firePreset("polish")} disabled={busy} />
            <PresetBtn icon={Languages} label="Spanish" onClick={() => firePreset("translate-es")} disabled={busy} />
            <PresetBtn icon={Languages} label="Arabic" onClick={() => firePreset("translate-ar")} disabled={busy} />
          </div>

          {preview && (
            <Card className="p-3 space-y-2" style={{ borderColor: cfg.hex, background: `${cfg.hex}0d` }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium" style={{ color: cfg.hex }}>Rewrite preview</div>
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
      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-[11px] transition-colors disabled:opacity-50 ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"}`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
