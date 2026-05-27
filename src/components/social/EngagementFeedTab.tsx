import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { Loader2, MessageCircle, ThumbsUp, ExternalLink, Sparkles, Copy, Check, Send, Search, X, Heart, Link2, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listSocialPosts, listSocialProfiles, deleteSocialPost,
  listEngagementComments, upsertEngagementComment, generateEngagementComment, suggestCommentTone, listCommentTones, previewAllTones,
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "draft" | "posted" | "liked">("all");
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

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return posts.filter((p) => {
      if (q && !((p.post_text || "").toLowerCase().includes(q) || (p.author || "").toLowerCase().includes(q))) return false;
      const e = engagement[p.id];
      if (statusFilter === "todo" && (e?.draft_text || e?.liked || e?.status === "posted")) return false;
      if (statusFilter === "draft" && e?.status !== "draft" && !e?.draft_text) return false;
      if (statusFilter === "posted" && e?.status !== "posted" && e?.status !== "copied") return false;
      if (statusFilter === "liked" && !e?.liked) return false;
      return true;
    });
  }, [posts, engagement, deferredSearch, statusFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, profileFilter]);

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
      <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground flex flex-wrap items-start gap-3 justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-foreground">LinkedIn-safe by design.</span> Comments and likes are drafted here, then opened on LinkedIn where you publish them manually in one click. LinkedIn's API does not allow third-party apps to post comments or likes on other users' posts — doing so would risk your account.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {linkedin ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <ShieldCheck className="w-3 h-3" /> LinkedIn connected{linkedin.display_name ? ` · ${linkedin.display_name}` : ""}
            </Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={connectLinkedIn} disabled={connecting} className="gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> {connecting ? "Connecting…" : "Connect LinkedIn"}
            </Button>
          )}
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input placeholder="Search posts or authors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-72" />
          </div>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All profiles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.full_name || p.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="todo">To engage</SelectItem>
              <SelectItem value="draft">Has draft</SelectItem>
              <SelectItem value="posted">Commented</SelectItem>
              <SelectItem value="liked">Liked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1.5 text-[11px]">
          <Pill label="Posts" value={stats.total} />
          <Pill label="Drafts" value={stats.drafts} tone="amber" />
          <Pill label="Commented" value={stats.posted} tone="emerald" />
          <Pill label="Liked" value={stats.liked} tone="rose" />
        </div>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground text-sm">No posts. Add profiles and scrape them in the Profiles tab.</Card> :
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {paginated.map((p) => {
            const e = engagement[p.id];
            const done = e?.status === "posted" || e?.status === "copied";
            const link = buildLinkedInPostUrl(p);
            return (
              <Card
                key={p.id}
                className={`p-3 cursor-pointer transition-colors flex flex-col gap-2 ${
                  done
                    ? "bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500/60"
                    : "hover:border-primary/40"
                }`}
                onClick={() => setOpenPost(p)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.author || "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.company || "—"} · {p.posted_at ? new Date(p.posted_at).toLocaleDateString() : ""}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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

function EngagementDialog({ post, row, tones, onClose, onUpdate }: { post: any; row?: EngagementRow; tones: CommentTone[]; onClose: () => void; onUpdate: (r: EngagementRow) => void }) {
  const [draft, setDraft] = useState(row?.draft_text ?? "");
  const [toneId, setToneId] = useState<string>(tones[0]?.id ?? "peer-sharp");
  const [suggestingTone, setSuggestingTone] = useState(false);
  const [suggestReason, setSuggestReason] = useState<string>("");
  const [extra, setExtra] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const liked = row?.liked ?? false;
  const status = row?.status ?? "draft";

  const link = buildLinkedInPostUrl(post);

  useEffect(() => {
    if (tones.length && !tones.find((t) => t.id === toneId)) setToneId(tones[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tones]);

  async function smartReply() {
    setGenerating(true);
    try {
      const r = await generateEngagementComment({ post_text: post.post_text || "", author: post.author, tone_id: toneId, instruction: extra });
      if (r.error) { toast.error(r.error); return; }
      if (r.comment) setDraft(r.comment);
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