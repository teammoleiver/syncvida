import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { Loader2, MessageCircle, ThumbsUp, ExternalLink, Sparkles, Copy, Check, Send, Search, X, Heart, Link2, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, Trash2, Wand2, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listSocialPosts, listSocialProfiles, deleteSocialPost, deleteSocialPosts,
  listEngagementComments, upsertEngagementComment, generateEngagementComment, suggestCommentTone, listCommentTones, previewAllTones,
  scorePostRelevance,
  type EngagementRow, type CommentTone,
} from "@/lib/social-queries";
import { getMyLinkedInConnection, startLinkedInAuth, type SocialConnectionMeta } from "@/lib/social-connections";

function buildLinkedInPostUrl(post: any): string {
  // Try post_url first, then external_id, then raw_payload.url
  const candidates: (string | undefined | null)[] = [
    post?.post_url,
    post?.external_id,
    post?.raw_payload?.url,
    post?.raw_payload?.postUrl,
    post?.raw_payload?.shareUrl,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const url = String(raw).trim();
    if (!url) continue;
    // Build feed URL from any activity/share/ugcPost URN we can find.
    // LinkedIn requires the URN colons to be URL-encoded (%3A) or the page 404s.
    const m = url.match(/(?:activity|share|ugcPost)[:%-](\d{15,})/i);
    if (m) return `https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A${m[1]}/`;
    // Only accept actual post URLs (skip profile URLs like /in/username)
    if (/^https?:\/\/.*linkedin\.com\/(feed|posts|pulse)/i.test(url)) {
      // If colons inside the URN portion are unencoded, encode them
      return url.replace(/urn:li:(activity|share|ugcPost):(\d+)/i,
        (_m, k, id) => `urn%3Ali%3A${k}%3A${id}`);
    }
    if (/^https?:\/\//i.test(url) && /linkedin\.com/i.test(url) && !/\/in\//i.test(url)) return url;
  }
  return "";
}

export default function EngagementFeedTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [listFilter, setListFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "draft" | "posted" | "liked">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "1" | "7" | "30" | "90">("all");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [openPost, setOpenPost] = useState<any | null>(null);
  const [engagement, setEngagement] = useState<Record<string, EngagementRow>>({});
  const [linkedin, setLinkedin] = useState<SocialConnectionMeta | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [tones, setTones] = useState<CommentTone[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; author: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hideNoLink, setHideNoLink] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<null | { ids: string[]; reason: string }>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sortByRelevance, setSortByRelevance] = useState(false);
  const [scoring, setScoring] = useState<Set<string>>(new Set());
  const [scoringAll, setScoringAll] = useState(false);
  const [scoreAllProgress, setScoreAllProgress] = useState<{ done: number; total: number } | null>(null);
  const scoringAllRef = useRef(true);
  const [autoScore, setAutoScore] = useState<boolean>(() => {
    try { return localStorage.getItem("engagement.autoScore") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("engagement.autoScore", autoScore ? "1" : "0"); } catch {}
  }, [autoScore]);
  // Defer search input so typing stays smooth even on 1000+ posts
  const deferredSearch = useDeferredValue(search);

  const load = async () => {
    setLoading(true);
    try {
      const [pp, pr] = await Promise.all([
        listSocialPosts(profileFilter !== "all" ? { profile_id: profileFilter, limit: 500 } : { limit: 500 }),
        listSocialProfiles(),
      ]);
      setPosts(pp); setProfiles(pr);
      const eng = await listEngagementComments(pp.map((p: any) => p.id));
      setEngagement(eng);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profileFilter]);

  // Auto-score: when enabled, score any newly-loaded posts that don't yet have a relevance_score.
  // Runs after each load() and any time `posts` changes (e.g. after scraping).
  const autoScoreRunningRef = useRef(false);
  useEffect(() => {
    if (!autoScore || loading || scoringAll || autoScoreRunningRef.current) return;
    const unscored = posts.filter((p) => typeof p.relevance_score !== "number");
    if (unscored.length === 0) return;
    autoScoreRunningRef.current = true;
    scoringAllRef.current = true;
    scoreAllUnscored().finally(() => { autoScoreRunningRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScore, loading, posts]);

  useEffect(() => {
    getMyLinkedInConnection().then(setLinkedin).catch(() => setLinkedin(null));
    listCommentTones().then((r) => setTones(r.tones || [])).catch(() => {});
  }, []);

  async function connectLinkedIn() {
    setConnecting(true);
    try {
      const r = await startLinkedInAuth(window.location.href);
      window.location.href = r.authorize_url;
    } catch (e: any) { toast.error(e?.message ?? "Could not start LinkedIn auth"); setConnecting(false); }
  }

  // Pre-compute the link for every post once (used by filter + render)
  const linkByPost = useMemo(() => {
    const m = new Map<string, string>();
    posts.forEach((p) => m.set(p.id, buildLinkedInPostUrl(p)));
    return m;
  }, [posts]);

  const noLinkCount = useMemo(() => posts.filter((p) => !linkByPost.get(p.id)).length, [posts, linkByPost]);
  const [lowScoreThreshold, setLowScoreThreshold] = useState<number>(50);
  const lowScoreCount = useMemo(
    () => posts.filter((p) => typeof p.relevance_score === "number" && (p.relevance_score as number) < lowScoreThreshold).length,
    [posts, lowScoreThreshold],
  );

  const profileById = useMemo(() => new Map(profiles.map((p: any) => [p.id, p])), [profiles]);
  const allLists = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) for (const n of (p.lists ?? [])) if (n) s.add(String(n));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const cutoff = dateFilter === "all" ? null : Date.now() - parseInt(dateFilter, 10) * 86400000;
    const out = posts.filter((p) => {
      if (hideNoLink && !linkByPost.get(p.id)) return false;
      if (q && !((p.post_text || "").toLowerCase().includes(q) || (p.author || "").toLowerCase().includes(q))) return false;
      if (cutoff != null) {
        const t = p.posted_at ? new Date(p.posted_at).getTime() : NaN;
        if (!Number.isFinite(t) || t < cutoff) return false;
      }
      if (listFilter !== "all") {
        const prof: any = profileById.get(p.profile_id);
        if (!prof || !Array.isArray(prof.lists) || !prof.lists.includes(listFilter)) return false;
      }
      const e = engagement[p.id];
      if (statusFilter === "todo" && (e?.draft_text || e?.liked || e?.status === "posted")) return false;
      if (statusFilter === "draft" && e?.status !== "draft" && !e?.draft_text) return false;
      if (statusFilter === "posted" && e?.status !== "posted" && e?.status !== "copied") return false;
      if (statusFilter === "liked" && !e?.liked) return false;
      return true;
    });
    if (sortByRelevance) {
      return [...out].sort((a, b) => {
        const sa = typeof a.relevance_score === "number" ? a.relevance_score : -1;
        const sb = typeof b.relevance_score === "number" ? b.relevance_score : -1;
        return sb - sa;
      });
    }
    return out;
  }, [posts, engagement, deferredSearch, statusFilter, dateFilter, hideNoLink, linkByPost, listFilter, profileById, sortByRelevance]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFilter, profileFilter, listFilter, hideNoLink, sortByRelevance]);

  async function scoreOne(postId: string, force = false, silent = false): Promise<boolean> {
    if (scoring.has(postId)) return false;
    setScoring((s) => { const n = new Set(s); n.add(postId); return n; });
    try {
      const { data, error } = await scorePostRelevance(postId, force);
      if (error || typeof (data as any)?.score !== "number") {
        if (!silent) toast.error(error?.message || (data as any)?.error || "Failed to score");
        return false;
      }
      const score = (data as any)?.score;
      const fields = (data as any)?.fields ?? [];
      const reasoning = (data as any)?.reasoning ?? "";
      setPosts((ps) => ps.map((p) => p.id === postId ? {
        ...p,
        relevance_score: score,
        relevance_reasoning: reasoning,
        relevance_fields: { fields, matched_to_user: (data as any)?.matched_to_user ?? [] },
        relevance_computed_at: new Date().toISOString(),
      } : p));
      return true;
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Failed to score");
      return false;
    } finally {
      setScoring((s) => { const n = new Set(s); n.delete(postId); return n; });
    }
  }

  async function scoreAllUnscored() {
    return scoreMany(posts.filter((p) => typeof p.relevance_score !== "number").map((p) => p.id), { reScore: false });
  }

  async function scoreMany(targets: string[], opts: { reScore?: boolean } = {}) {
    if (!targets.length) { toast.info("All posts already have a relevance score"); return; }
    setScoringAll(true);
    setScoreAllProgress({ done: 0, total: targets.length });
    let done = 0, failed = 0;
    for (const id of targets) {
      if (!scoringAllRef.current) break;
      // silent per-post: collect failures and report once at the end (no toast spam)
      const ok = await scoreOne(id, !!opts.reScore, true);
      ok ? done++ : failed++;
      setScoreAllProgress({ done: done + failed, total: targets.length });
      // small gap to be gentle on the AI rate limit
      await new Promise((r) => setTimeout(r, 250));
    }
    setScoringAll(false);
    setScoreAllProgress(null);
    if (done === 0 && failed > 0) {
      toast.error(`Couldn't score ${failed} post${failed === 1 ? "" : "s"} — check your AI key in Settings → AI API.`);
    } else if (failed > 0) {
      toast.success(`Scored ${done} post${done === 1 ? "" : "s"} · ${failed} failed`);
    } else {
      toast.success(`Scored ${done} post${done === 1 ? "" : "s"}`);
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart]
  );

  const stats = useMemo(() => {
    let drafts = 0, posted = 0, liked = 0;
    Object.values(engagement).forEach((e) => {
      if (e.draft_text) drafts++;
      if (e.status === "posted" || e.status === "copied") posted++;
      if (e.liked) liked++;
    });
    return { total: posts.length, drafts, posted, liked };
  }, [engagement, posts]);

  // ── Selection helpers ──
  const pageIds = useMemo(() => paginated.map((p: any) => p.id), [paginated]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id)) && !allOnPageSelected;
  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAllOnPage() {
    setSelected((s) => {
      const n = new Set(s);
      if (allOnPageSelected) pageIds.forEach((id) => n.delete(id));
      else pageIds.forEach((id) => n.add(id));
      return n;
    });
  }
  function selectAllFiltered() {
    setSelected(new Set(filtered.map((p: any) => p.id)));
  }
  function clearSelection() { setSelected(new Set()); }

  async function runBulkDelete(ids: string[]) {
    if (!ids.length) return;
    setBulkDeleting(true);
    const idSet = new Set(ids);
    const prevPosts = posts;
    const prevEng = engagement;
    setPosts((p) => p.filter((x) => !idSet.has(x.id)));
    setEngagement((s) => { const n = { ...s }; ids.forEach((i) => delete n[i]); return n; });
    setSelected((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; });
    setBulkConfirm(null);
    try {
      const count = await deleteSocialPosts(ids);
      toast.success(`Deleted ${count} post${count === 1 ? "" : "s"}`);
    } catch (e: any) {
      setPosts(prevPosts);
      setEngagement(prevEng);
      toast.error(e?.message ?? "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  }

  const updateLocal = (postId: string, row: EngagementRow) => {
    setEngagement((s) => ({ ...s, [postId]: row }));
  };

  async function toggleLike(postId: string) {
    const cur = engagement[postId];
    const next = !(cur?.liked ?? false);
    try {
      const row = await upsertEngagementComment(postId, { liked: next });
      updateLocal(postId, row);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setDeleting(true);
    // Optimistic UI — remove from view instantly, restore on failure
    const prevPosts = posts;
    const prevEng = engagement;
    setPosts((p) => p.filter((x) => x.id !== id));
    setEngagement((s) => { const n = { ...s }; delete n[id]; return n; });
    setPendingDelete(null);
    try {
      await deleteSocialPost(id);
      toast.success("Post deleted");
    } catch (e: any) {
      setPosts(prevPosts);
      setEngagement(prevEng);
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-4">
      {/* Policy notice */}
      <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-foreground">LinkedIn-safe by design.</span> Comments and likes are drafted here, then opened on LinkedIn where you publish them manually in one click. LinkedIn's API does not allow third-party apps to post comments or likes on other users' posts — doing so would risk your account.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {linkedin ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10 w-full sm:w-auto justify-center">
              <ShieldCheck className="w-3 h-3" /> LinkedIn connected{linkedin.display_name ? ` · ${linkedin.display_name}` : ""}
            </Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={connectLinkedIn} disabled={connecting} className="gap-1 w-full sm:w-auto justify-center">
              <ShieldAlert className="w-3.5 h-3.5" /> {connecting ? "Connecting…" : "Connect LinkedIn"}
            </Button>
          )}
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 justify-between w-full">
        <div className="flex flex-col sm:flex-row gap-2 w-full items-stretch sm:items-center flex-wrap">
          <div className="relative w-full sm:w-[240px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input placeholder="Search posts or authors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full" />
          </div>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="All profiles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.full_name || p.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="w-full sm:w-[140px]" title="Filter by profile list">
              <div className="inline-flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /><SelectValue placeholder="All lists" /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {allLists.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              {allLists.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No lists yet</div>}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="todo">To engage</SelectItem>
              <SelectItem value="draft">Has draft</SelectItem>
              <SelectItem value="posted">Commented</SelectItem>
              <SelectItem value="liked">Liked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[130px]" title="Filter by post date"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any date</SelectItem>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center justify-between sm:justify-start gap-2 text-xs text-muted-foreground border border-border rounded-md px-2.5 h-9 w-full sm:w-auto" title="Hide posts that don't have a public LinkedIn URL">
            <Switch checked={hideNoLink} onCheckedChange={setHideNoLink} />
            <span>Only with link {noLinkCount > 0 && <span className="opacity-60">({noLinkCount} hidden)</span>}</span>
          </label>
          <label className="flex items-center justify-between sm:justify-start gap-2 text-xs text-muted-foreground border border-border rounded-md px-2.5 h-9 w-full sm:w-auto" title="Sort by AI relevance score (best matches first)">
            <Switch checked={sortByRelevance} onCheckedChange={setSortByRelevance} />
            <span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Sort by relevance</span>
          </label>
          <label
            className="flex items-center justify-between sm:justify-start gap-2 text-xs text-muted-foreground border border-border rounded-md px-2.5 h-9 w-full sm:w-auto"
            title="Automatically score every newly-scraped post against your persona"
          >
            <Switch checked={autoScore} onCheckedChange={setAutoScore} />
            <span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Auto-score new posts</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => {
              if (scoringAll) { scoringAllRef.current = false; return; }
              scoringAllRef.current = true;
              scoreAllUnscored();
            }}
            disabled={loading}
            title="Score every unscored post against your persona"
          >
            {scoringAll
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scoring {scoreAllProgress?.done}/{scoreAllProgress?.total} — click to stop</>
              : <><Sparkles className="w-3.5 h-3.5" /> Score all unscored ({posts.filter((p) => typeof p.relevance_score !== "number").length})</>}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] w-full justify-start sm:justify-end">
          <Pill label="Posts" value={stats.total} />
          <Pill label="Drafts" value={stats.drafts} tone="amber" />
          <Pill label="Commented" value={stats.posted} tone="emerald" />
          <Pill label="Liked" value={stats.liked} tone="rose" />
        </div>
      </div>

      {/* Bulk action bar */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={allOnPageSelected ? true : (someOnPageSelected ? "indeterminate" : false)}
                onCheckedChange={toggleAllOnPage}
                aria-label="Select all on this page"
              />
              <span className="text-muted-foreground">
                {selected.size > 0
                  ? <><span className="text-foreground font-medium">{selected.size}</span> selected</>
                  : "Select all on page"}
              </span>
            </label>
            {selected.size > 0 && selected.size < filtered.length && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAllFiltered}>
                Select all {filtered.length} in view
              </Button>
            )}
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearSelection}>
                Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {noLinkCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1.5"
                onClick={() => {
                  const ids = posts.filter((p) => !linkByPost.get(p.id)).map((p) => p.id);
                  setBulkConfirm({ ids, reason: `${ids.length} post${ids.length === 1 ? "" : "s"} without a public LinkedIn link` });
                }}
              >
                <Link2 className="w-3.5 h-3.5" /> Delete {noLinkCount} without link
              </Button>
            )}
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-0.5">
              <span className="text-muted-foreground">Score &lt;</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={lowScoreThreshold}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setLowScoreThreshold(v);
                }}
                className="h-6 w-14 px-1.5 text-xs"
              />
              <span className="text-muted-foreground">%</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1.5"
                disabled={lowScoreCount === 0}
                onClick={() => {
                  const ids = posts
                    .filter((p) => typeof p.relevance_score === "number" && (p.relevance_score as number) < lowScoreThreshold)
                    .map((p) => p.id);
                  setBulkConfirm({ ids, reason: `${ids.length} post${ids.length === 1 ? "" : "s"} scored below ${lowScoreThreshold}%` });
                }}
                title="Delete all scored posts below this threshold"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete {lowScoreCount} low-score
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              disabled={selected.size === 0 || scoringAll}
              onClick={() => {
                scoringAllRef.current = true;
                scoreMany(Array.from(selected), { reScore: true });
              }}
              title="Score (or re-score) only the selected posts"
            >
              <Sparkles className="w-3.5 h-3.5" /> Score selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              disabled={selected.size === 0}
              onClick={() => setBulkConfirm({ ids: Array.from(selected), reason: `${selected.size} selected post${selected.size === 1 ? "" : "s"}` })}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete selected
            </Button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground text-sm">No posts. Add profiles and scrape them in the Profiles tab.</Card> :
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {paginated.map((p) => {
            const e = engagement[p.id];
            const done = e?.status === "posted" || e?.status === "copied";
            const link = linkByPost.get(p.id) || "";
            const isSel = selected.has(p.id);
            return (
              <Card
                key={p.id}
                className={`p-3 cursor-pointer transition-colors flex flex-col gap-2 ${
                  isSel ? "ring-2 ring-primary border-primary/60 " : ""
                }${
                  done
                    ? "bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500/60"
                    : "hover:border-primary/40"
                }`}
                onClick={() => setOpenPost(p)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleOne(p.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      aria-label="Select post"
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{p.author || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.company || "—"} · {p.posted_at ? new Date(p.posted_at).toLocaleDateString() : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <RelevanceBadge
                      score={p.relevance_score}
                      reasoning={p.relevance_reasoning}
                      fields={p.relevance_fields?.fields}
                      loading={scoring.has(p.id)}
                      onScore={(ev) => { ev.stopPropagation(); scoreOne(p.id, typeof p.relevance_score === "number"); }}
                    />
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        title="Open original post on LinkedIn"
                        className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Link2 className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={(ev) => { ev.stopPropagation(); toggleLike(p.id); }}
                      title={e?.liked ? "Marked as liked" : "Mark as liked"}
                      className={`p-1.5 rounded-full transition-colors ${e?.liked ? "bg-rose-500/10 text-rose-500" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Heart className={`w-4 h-4 ${e?.liked ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setPendingDelete({ id: p.id, author: p.author || "this post" }); }}
                      title="Delete this post"
                      className="p-1.5 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{p.post_text}</p>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline w-fit"
                  >
                    <ExternalLink className="w-3 h-3" /> Open original post on LinkedIn
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 italic w-fit"
                    title="This post was scraped without a usable LinkedIn URL. Re-scrape the profile to capture the link."
                  >
                    <Link2 className="w-3 h-3" /> No public link — re-scrape to fetch
                  </span>
                )}
                <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${done ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-border/60 text-muted-foreground"}`}>
                  <span className="flex gap-3">
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{p.likes ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{p.comments ?? 0}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {e?.status === "posted" && <Badge className="h-4 text-[10px] px-1.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40">✓ Commented</Badge>}
                    {e?.status === "copied" && <Badge className="h-4 text-[10px] px-1.5 bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Copied</Badge>}
                    {e?.status !== "posted" && e?.status !== "copied" && e?.draft_text && <Badge className="h-4 text-[10px] px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30">Draft</Badge>}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span> of <span className="font-medium text-foreground">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={currentPage <= 1} className="h-8 px-2">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs px-2 tabular-nums">Page {currentPage} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={currentPage >= totalPages} className="h-8 px-2">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        </>
      }

      {openPost && (
        <EngagementDialog
          post={openPost}
          row={engagement[openPost.id]}
          tones={tones}
          onClose={() => setOpenPost(null)}
          onUpdate={(row) => updateLocal(openPost.id, row)}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes the post from <span className="font-medium text-foreground">{pendingDelete?.author}</span> and any draft comment you wrote — from this feed and from the database. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkConfirm} onOpenChange={(o) => { if (!o) setBulkConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkConfirm?.ids.length} posts?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes <span className="font-medium text-foreground">{bulkConfirm?.reason}</span> and any draft comments attached to them — from this feed and from the database. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkConfirm && runBulkDelete(bulkConfirm.ids)}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Pill({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "amber" | "emerald" | "rose" }) {
  const tones: Record<string, string> = {
    zinc: "bg-muted text-foreground",
    amber: "bg-amber-500/15 text-amber-600",
    emerald: "bg-emerald-500/15 text-emerald-600",
    rose: "bg-rose-500/15 text-rose-500",
  };
  return <span className={`px-2 py-1 rounded-md ${tones[tone]} inline-flex items-center gap-1`}><span>{value}</span><span className="opacity-70">{label}</span></span>;
}

function RelevanceBadge({
  score, reasoning, fields, loading, onScore,
}: {
  score?: number | null;
  reasoning?: string | null;
  fields?: string[] | null;
  loading?: boolean;
  onScore: (e: React.MouseEvent) => void;
}) {
  const has = typeof score === "number";
  const tone =
    !has ? "border-border text-muted-foreground hover:bg-muted"
      : score! >= 75 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
      : score! >= 50 ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
      : "border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20";
  const tip = has
    ? `Relevance ${score}% — ${reasoning || "AI scored against your persona"}${fields?.length ? `\nTopics: ${fields.join(", ")}` : ""}\nClick to re-score`
    : "Score this post's relevance to you";
  return (
    <button
      type="button"
      onClick={onScore}
      disabled={loading}
      title={tip}
      className={`h-6 px-1.5 rounded-md border text-[10px] font-semibold tabular-nums inline-flex items-center gap-1 transition-colors ${tone} disabled:opacity-60`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Sparkles className="w-3 h-3" />}
      {loading ? "…" : has ? `${score}%` : "Score"}
    </button>
  );
}

function EngagementDialog({ post, row, tones, onClose, onUpdate }: { post: any; row?: EngagementRow; tones: CommentTone[]; onClose: () => void; onUpdate: (r: EngagementRow) => void }) {
  const [draft, setDraft] = useState(row?.draft_text ?? "");
  const [toneId, setToneId] = useState<string>(tones[0]?.id ?? "peer-sharp");
  const [suggestingTone, setSuggestingTone] = useState(false);
  const [suggestReason, setSuggestReason] = useState<string>("");
  const [extra, setExtra] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [replyInOriginal, setReplyInOriginal] = useState(false); // reply in the post's own language
  const [translation, setTranslation] = useState("");            // English translation (display only)
  const liked = row?.liked ?? false;
  const status = row?.status ?? "draft";

  const link = buildLinkedInPostUrl(post);

  useEffect(() => {
    if (tones.length && !tones.find((t) => t.id === toneId)) setToneId(tones[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tones]);

  async function smartReply() {
    setGenerating(true);
    setTranslation("");
    try {
      const r = await generateEngagementComment({
        post_text: post.post_text || "", author: post.author, tone_id: toneId, instruction: extra,
        language: replyInOriginal ? "original" : "english",
      });
      if (r.error) { toast.error(r.error); return; }
      if (r.comment) setDraft(r.comment);
      setTranslation(r.translation || "");
    } finally { setGenerating(false); }
  }

  async function autoSuggestTone() {
    setSuggestingTone(true); setSuggestReason("");
    try {
      const r = await suggestCommentTone({ post_text: post.post_text || "" });
      if (r.error) { toast.error(r.error); return; }
      if (r.tone_id && tones.find((t) => t.id === r.tone_id)) {
        setToneId(r.tone_id);
        setSuggestReason(r.reason || "");
        toast.success(`Tone set to "${tones.find((t) => t.id === r.tone_id)?.label}"`);
      }
    } finally { setSuggestingTone(false); }
  }

  // ── Live preview: one example per tone for this exact post ──
  const [previews, setPreviews] = useState<{ tone_id: string; label: string; comment: string; error?: string }[] | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  async function loadPreviews() {
    setLoadingPreviews(true); setPreviews(null);
    try {
      const r = await previewAllTones({ post_text: post.post_text || "", author: post.author });
      if (r.error) { toast.error(r.error); return; }
      setPreviews(r.previews || []);
    } finally { setLoadingPreviews(false); }
  }

  async function save(nextStatus?: EngagementRow["status"], extras?: Partial<EngagementRow>) {
    setSaving(true);
    try {
      const updated = await upsertEngagementComment(post.id, {
        draft_text: draft,
        status: nextStatus ?? status,
        ...extras,
      });
      onUpdate(updated);
      if (nextStatus === "posted") toast.success("Marked as posted");
      else toast.success("Saved");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(false); }
  }

  async function copyAndOpen() {
    if (!draft.trim()) { toast.error("Write a comment first"); return; }
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
        toast.success("Comment copied — paste it on LinkedIn (Ctrl/Cmd+V).");
      } else {
        toast.message("Comment copied. Open the post on LinkedIn to paste it.");
      }
      // Auto-mark as commented after a short delay so the user sees the status update
      setTimeout(() => {
        save("posted", { posted_at: new Date().toISOString() }).catch(() => {});
      }, 2500);
    } catch { toast.error("Could not copy to clipboard"); }
  }

  async function toggleLike() {
    try {
      const r = await upsertEngagementComment(post.id, { liked: !liked });
      onUpdate(r);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4" /> Engage with {post.author || "this post"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Post */}
          <Card className="p-4 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
              <span className="font-medium text-foreground">{post.author || "—"}</span>
              {post.company && <span>· {post.company}</span>}
              {post.posted_at && <span>· {new Date(post.posted_at).toLocaleDateString()}</span>}
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary inline-flex items-center gap-1 hover:underline">
                  Open on LinkedIn <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="whitespace-pre-wrap text-sm max-h-64 overflow-y-auto">{post.post_text}</div>
            <div className="text-[11px] text-muted-foreground flex gap-4 mt-3 pt-2 border-t border-border/60">
              <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{post.likes ?? 0}</span>
              <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments ?? 0}</span>
            </div>
          </Card>

          {/* Like row */}
          <div className="flex items-center justify-between gap-2 bg-background border border-border rounded-md p-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Heart className={`w-4 h-4 ${liked ? "text-rose-500 fill-current" : "text-muted-foreground"}`} />
              <span className="text-muted-foreground">{liked ? "You marked this as liked." : "Like this post manually on LinkedIn?"}</span>
            </div>
            <Button size="sm" variant={liked ? "secondary" : "outline"} onClick={toggleLike}>
              {liked ? "Unmark like" : "Mark as liked"}
            </Button>
          </div>

          {/* AI controls */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_auto_1fr_auto] gap-2">
              <Select value={toneId} onValueChange={setToneId}>
                <SelectTrigger><SelectValue placeholder="Pick a tone" /></SelectTrigger>
                <SelectContent>
                  {tones.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex flex-col">
                        <span className="text-sm">{t.label}</span>
                        {t.description && <span className="text-[10px] text-muted-foreground">{t.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={autoSuggestTone} disabled={suggestingTone} className="gap-1.5" title="Pick the best tone based on this post">
                {suggestingTone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Suggest tone
              </Button>
              <Input placeholder="Optional: extra instruction (e.g. mention Clay, ask about ICP)" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <Button onClick={smartReply} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Smart Reply
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit">
              <input type="checkbox" checked={replyInOriginal} onChange={(e) => setReplyInOriginal(e.target.checked)} className="accent-primary" />
              Reply in the post's original language
              <span className="text-[10px]">(an English translation is shown below — for your reference only)</span>
            </label>
            {suggestReason && (
              <p className="text-[11px] text-muted-foreground italic">Why this tone: {suggestReason}</p>
            )}
          </div>

          {/* Live preview — one example per tone for THIS post */}
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Tone preview
                <span className="text-muted-foreground font-normal">— see how each tone would reply to this post</span>
              </div>
              <Button size="sm" variant="outline" onClick={loadPreviews} disabled={loadingPreviews} className="h-7 gap-1.5 text-xs">
                {loadingPreviews ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {previews ? "Regenerate" : "Preview all tones"}
              </Button>
            </div>
            {loadingPreviews && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-md bg-muted/40 animate-pulse" />
                ))}
              </div>
            )}
            {!loadingPreviews && previews && previews.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {previews.map((p) => {
                  const active = toneId === p.tone_id;
                  return (
                    <button
                      key={p.tone_id}
                      type="button"
                      onClick={() => { setToneId(p.tone_id); if (p.comment) setDraft(p.comment); }}
                      className={`text-left rounded-md border p-2.5 transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-background"}`}
                      title="Click to use this as your draft"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-medium">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.comment ? `${p.comment.split(/\s+/).filter(Boolean).length}w` : ""}</span>
                      </div>
                      {p.error ? (
                        <p className="text-[11px] text-destructive">Couldn't generate</p>
                      ) : (
                        <p className="text-xs leading-snug whitespace-pre-wrap line-clamp-3">{p.comment || "—"}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!loadingPreviews && !previews && (
              <p className="text-[11px] text-muted-foreground">Generates one short example per tone tailored to this post. Click any example to drop it into your draft.</p>
            )}
          </div>

          {/* Comment composer */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Your comment</span>
              <span>{draft.length} chars</span>
            </label>
            <Textarea
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your comment, or click Smart Reply to generate one. Keep it short, specific and human."
              className="resize-y"
            />
            {translation && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">English translation · reference only (not posted)</div>
                <p className="text-xs text-muted-foreground italic">{translation}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || !draft.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save draft
              </Button>
              <Button variant="outline" size="sm" onClick={() => save("skipped")} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Skip
              </Button>
              {status === "posted" && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Commented</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyAndOpen} disabled={!draft.trim()}>
                {copied ? <Check className="w-4 h-4 mr-1 text-emerald-500" /> : <Copy className="w-4 h-4 mr-1" />}
                Copy & open LinkedIn
              </Button>
              <Button size="sm" onClick={() => save("posted", { posted_at: new Date().toISOString() })} disabled={saving || !draft.trim()}>
                <Send className="w-4 h-4 mr-1" /> Mark as commented
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: Clicking <strong>Copy &amp; open LinkedIn</strong> copies your comment to the clipboard and opens the post in a new tab — just paste (Ctrl/Cmd+V) and hit comment. The post will auto-mark as <strong>Commented</strong> after a few seconds.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}