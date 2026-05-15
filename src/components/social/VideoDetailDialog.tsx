import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, FileText, Sparkles, Plus, RefreshCw, Check, ChevronDown, ChevronUp, Copy, Clock, Linkedin, Twitter, Instagram, Send, Heart, ListChecks, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import {
  fetchVideoTranscript, generateVideoIdeas, generateVideoPosts, generateVideoSummary, getVideoDetail, addIdeaToPlanner, addPostToPlanner, addPointToTasks, toggleVideoLike,
  type YouTubeVideo, type VideoIdea, type VideoPost, type SummaryPoint, type Schedule,
} from "@/lib/youtube-queries";
import SchedulePicker from "@/components/social/SchedulePicker";

type SourceVideo = { video_id: string; title: string; channel: string };

export default function VideoDetailDialog({
  open, onClose, video, channelTitle, onTranscriptFetched, onLikeToggled,
}: {
  open: boolean;
  onClose: () => void;
  video: YouTubeVideo | null;
  channelTitle: string;
  onTranscriptFetched?: (videoId: string) => void;
  onLikeToggled?: (videoId: string, liked: boolean) => void;
}) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptFetchedAt, setTranscriptFetchedAt] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const [ideas, setIdeas] = useState<VideoIdea[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [transcriptDebug, setTranscriptDebug] = useState<any>(null);

  const [posts, setPosts] = useState<VideoPost[] | null>(null);
  const [generatingPosts, setGeneratingPosts] = useState(false);
  const [savedPostIds, setSavedPostIds] = useState<Set<number>>(new Set());
  const [savingPostIdx, setSavingPostIdx] = useState<number | null>(null);
  const [postLength, setPostLength] = useState<"short" | "long" | "both">("both");

  const [summary, setSummary] = useState<SummaryPoint[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [taskedPoints, setTaskedPoints] = useState<Set<number>>(new Set());
  const [savingTaskIdx, setSavingTaskIdx] = useState<number | null>(null);

  const [liked, setLiked] = useState(false);
  const [likingBusy, setLikingBusy] = useState(false);

  // Reset and load existing transcript when video changes
  useEffect(() => {
    if (!open || !video) return;
    setTranscript(null);
    setTranscriptFetchedAt(null);
    setIdeas(null);
    setPosts(null);
    setSummary(null);
    setSavedIds(new Set());
    setSavedPostIds(new Set());
    setTaskedPoints(new Set());
    setTranscriptOpen(false);
    setLiked(!!video.is_liked);
    setSource({
      video_id: video.video_id,
      title: video.title,
      channel: channelTitle || video.channel_id,
    });
    void getVideoDetail(video.video_id).then((d) => {
      if (d?.transcript) {
        setTranscript(d.transcript);
        setTranscriptFetchedAt((d as any).transcript_fetched_at ?? null);
      }
      const cachedSummary = (d as any)?.summary_points;
      if (Array.isArray(cachedSummary) && cachedSummary.length > 0) setSummary(cachedSummary);
      const cachedIdeas = (d as any)?.generated_ideas;
      if (Array.isArray(cachedIdeas) && cachedIdeas.length > 0) setIdeas(cachedIdeas);
      const cachedPosts = (d as any)?.generated_posts;
      if (Array.isArray(cachedPosts) && cachedPosts.length > 0) setPosts(cachedPosts);
      if (typeof (d as any)?.is_liked === "boolean") setLiked((d as any).is_liked);
    }).catch(() => { /* ignore */ });
  }, [open, video?.video_id, channelTitle]);

  if (!video) return null;

  const ytUrl = `https://www.youtube.com/watch?v=${video.video_id}`;

  async function getTranscript(refresh = false) {
    if (!video) return;
    setLoadingTranscript(true);
    setTranscriptDebug(null);
    try {
      const r = await fetchVideoTranscript(video.video_id, refresh);
      setTranscript(r.transcript);
      setTranscriptFetchedAt(new Date().toISOString());
      setTranscriptOpen(true);
      onTranscriptFetched?.(video.video_id);
      toast.success(r.cached ? "Loaded cached transcript" : "Transcript fetched");
    } catch (e: any) {
      toast.error(e?.message ?? "Transcript failed");
      if (e?.debug) setTranscriptDebug(e.debug);
    } finally { setLoadingTranscript(false); }
  }

  async function genIdeas(refresh = false) {
    if (!video) return;
    setGenerating(true);
    try {
      const r = await generateVideoIdeas(video.video_id, 7, refresh);
      setIdeas(r.ideas);
      setSource(r.source_video);
      setSavedIds(new Set());
      toast.success(r.cached ? `Loaded ${r.ideas.length} saved ideas` : `${r.ideas.length} ideas generated`);
    } catch (e: any) {
      toast.error(e?.message ?? "Ideas failed");
    } finally { setGenerating(false); }
  }

  async function saveIdea(i: number, schedule: Schedule) {
    if (!ideas || !source) return;
    setSavingIdx(i);
    try {
      await addIdeaToPlanner(ideas[i], source, schedule);
      setSavedIds((cur) => new Set(cur).add(i));
      toast.success(schedule.scheduled_date ? `Scheduled for ${schedule.scheduled_date}` : "Added to Content Planner");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally { setSavingIdx(null); }
  }

  async function saveAll(schedule: Schedule) {
    if (!ideas || !source) return;
    setSavingIdx(-1);
    let saved = 0;
    try {
      for (let i = 0; i < ideas.length; i++) {
        if (savedIds.has(i)) continue;
        try {
          await addIdeaToPlanner(ideas[i], source, schedule);
          setSavedIds((cur) => new Set(cur).add(i));
          saved++;
        } catch { /* continue */ }
      }
      toast.success(schedule.scheduled_date
        ? `Scheduled ${saved} idea${saved === 1 ? "" : "s"} for ${schedule.scheduled_date}`
        : `Added ${saved} idea${saved === 1 ? "" : "s"} to planner`);
    } finally { setSavingIdx(null); }
  }

  async function genPosts(refresh = false) {
    if (!video) return;
    setGeneratingPosts(true);
    try {
      const r = await generateVideoPosts(video.video_id, 3, ["linkedin", "twitter", "instagram"], refresh, postLength);
      setPosts(r.posts);
      setSource(r.source_video);
      setSavedPostIds(new Set());
      toast.success(r.cached ? `Loaded ${r.posts.length} saved posts` : `${r.posts.length} posts ready`);
    } catch (e: any) { toast.error(e?.message ?? "Posts failed"); }
    finally { setGeneratingPosts(false); }
  }

  async function savePost(i: number, schedule: Schedule) {
    if (!posts || !source) return;
    setSavingPostIdx(i);
    try {
      await addPostToPlanner(posts[i], source, schedule);
      setSavedPostIds((cur) => new Set(cur).add(i));
      toast.success(schedule.scheduled_date ? `Scheduled for ${schedule.scheduled_date}` : "Post added to planner");
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
    finally { setSavingPostIdx(null); }
  }

  async function copyPost(p: VideoPost) {
    const text = p.hashtags.length ? `${p.body}\n\n${p.hashtags.map((h) => `#${h}`).join(" ")}` : p.body;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Post copied");
    } catch { /* */ }
  }

  async function summarize(refresh = false) {
    if (!video) return;
    setSummarizing(true);
    try {
      const r = await generateVideoSummary(video.video_id, refresh);
      setSummary(r.points);
      setTaskedPoints(new Set());
      toast.success(r.cached ? "Loaded cached summary" : `${r.points.length} key points`);
    } catch (e: any) { toast.error(e?.message ?? "Summary failed"); }
    finally { setSummarizing(false); }
  }

  async function pointToTask(i: number) {
    if (!summary || !source) return;
    setSavingTaskIdx(i);
    try {
      await addPointToTasks(summary[i], source);
      setTaskedPoints((cur) => new Set(cur).add(i));
      toast.success("Added to Tasks → Inbox");
    } catch (e: any) { toast.error(e?.message ?? "Failed to add task"); }
    finally { setSavingTaskIdx(null); }
  }

  async function toggleLike() {
    if (!video) return;
    const next = !liked;
    setLikingBusy(true);
    setLiked(next); // optimistic
    try {
      await toggleVideoLike(video.video_id, next);
      onLikeToggled?.(video.video_id, next);
    } catch (e: any) {
      setLiked(!next);
      toast.error(e?.message ?? "Failed");
    } finally { setLikingBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <span className="line-clamp-2 text-base">{video.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a href={ytUrl} target="_blank" rel="noreferrer" className="sm:col-span-1 block">
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt="" className="w-full aspect-video object-cover rounded-md" />
              ) : (
                <div className="w-full aspect-video bg-muted rounded-md" />
              )}
            </a>
            <div className="sm:col-span-2 space-y-2 text-sm">
              <div className="text-muted-foreground">
                {channelTitle || video.channel_id}
                {video.published_at ? ` · ${new Date(video.published_at).toLocaleDateString()}` : ""}
              </div>
              {video.description && (
                <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{video.description}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant={liked ? "default" : "outline"}
                  onClick={toggleLike}
                  disabled={likingBusy}
                  className={liked ? "bg-rose-500 hover:bg-rose-600 text-white border-0" : ""}
                  title={liked ? "Unlike" : "Like"}
                >
                  <Heart className={`w-3.5 h-3.5 mr-1 ${liked ? "fill-current" : ""}`} />
                  {liked ? "Liked" : "Like"}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={ytUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Watch on YouTube</a>
                </Button>
                <Button size="sm" onClick={() => getTranscript(false)} disabled={loadingTranscript}>
                  {loadingTranscript ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
                  {transcript ? "View transcript" : "Get transcript"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => summarize(false)} disabled={summarizing}>
                  {summarizing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ListChecks className="w-3.5 h-3.5 mr-1" />}
                  {summary ? "View summary" : "Summarize"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => genIdeas(false)} disabled={generating}>
                  {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  {ideas && ideas.length > 0 ? "View ideas" : "Generate ideas"}
                </Button>
                <div className="flex items-center gap-1">
                  <Select value={postLength} onValueChange={(v) => setPostLength(v as any)}>
                    <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="both">Short + Long</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => genPosts(false)} disabled={generatingPosts}>
                    {generatingPosts ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                    {posts && posts.length > 0 ? "View posts" : "Generate social posts"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Transcript debug (when actor returned items but parser couldn't extract) */}
          {transcriptDebug && (
            <Card className="p-3 border-destructive/40 bg-destructive/5">
              <div className="text-xs font-medium text-destructive mb-1">Actor ran but no transcript text was found</div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Copy this and paste it back to me — I'll teach the parser this actor's output shape.
              </p>
              <pre className="text-[10px] bg-background/50 p-2 rounded border border-border overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(transcriptDebug, null, 2)}
              </pre>
            </Card>
          )}

          {/* Transcript */}
          {transcript && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button onClick={() => setTranscriptOpen((v) => !v)} className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="w-4 h-4 text-primary" />
                  Transcript
                  {transcriptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{readingMinutes(transcript)} min read · {wordCount(transcript).toLocaleString()} words</span>
                  {transcriptFetchedAt && <span>fetched {timeAgo(transcriptFetchedAt)}</span>}
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(transcript)} title="Copy">
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => getTranscript(true)} disabled={loadingTranscript} title="Re-fetch">
                    {loadingTranscript ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
              {transcriptOpen && (
                <div className="mt-3 max-h-[28rem] overflow-y-auto pr-2 -mr-1">
                  <article className="prose-sm max-w-prose text-sm leading-7 text-foreground/90 space-y-3">
                    {formatTranscript(transcript).map((para, i) => (
                      <p key={i} className="m-0">{para}</p>
                    ))}
                  </article>
                </div>
              )}
            </Card>
          )}

          {/* Summary points */}
          {summary && summary.length > 0 && (
            <Card className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Key points</h3>
                  <Badge variant="secondary" className="text-[10px]">{summary.length}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => summarize(true)} disabled={summarizing} title="Regenerate">
                  {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <ol className="space-y-2">
                {summary.map((p, i) => {
                  const tasked = taskedPoints.has(i);
                  return (
                    <li key={i} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono">{String(i + 1).padStart(2, "0")}</span>
                            <div className="text-sm font-medium">{p.headline}</div>
                          </div>
                          {p.detail && <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant={tasked ? "secondary" : "outline"}
                          onClick={() => pointToTask(i)}
                          disabled={tasked || savingTaskIdx === i}
                          title="Send to Tasks → Inbox"
                        >
                          {savingTaskIdx === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tasked ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <CheckSquare className="w-3.5 h-3.5" />}
                          {tasked ? " Added" : " To Tasks"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {/* Generated social posts */}
          {posts && posts.length > 0 && (
            <Card className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Ready-to-publish social posts</h3>
                  <Badge variant="secondary" className="text-[10px]">{posts.length}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => genPosts(true)} disabled={generatingPosts} title="Regenerate">
                  {generatingPosts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <div className="space-y-2">
                {posts.map((p, i) => {
                  const saved = savedPostIds.has(i);
                  const Icon = p.platform === "linkedin" ? Linkedin : p.platform === "twitter" ? Twitter : Instagram;
                  return (
                    <div key={i} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] gap-1 capitalize"><Icon className="w-3 h-3" />{p.platform}</Badge>
                          {p.variant && (
                            <Badge variant={p.variant === "long" ? "default" : "secondary"} className="text-[10px] capitalize">{p.variant}</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{p.length} chars</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => copyPost(p)} title="Copy">
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <SchedulePicker
                            busy={savingPostIdx === i}
                            saved={saved}
                            onSchedule={(s) => savePost(i, s)}
                          />
                        </div>
                      </div>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{p.body}</div>
                      {p.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {p.hashtags.map((h, j) => <span key={j} className="text-[11px] text-primary">#{h}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Ideas */}
          {ideas && ideas.length > 0 && (
            <Card className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Content ideas based on this video</h3>
                  <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => genIdeas(true)} disabled={generating} title="Regenerate">
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </Button>
                  <SchedulePicker
                    busy={savingIdx !== null}
                    saved={savedIds.size === ideas.length}
                    onSchedule={(s) => saveAll(s)}
                    trigger={
                      <Button size="sm" variant="outline" disabled={savingIdx !== null || savedIds.size === ideas.length}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add all to planner
                      </Button>
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                {ideas.map((it, i) => {
                  const saved = savedIds.has(i);
                  return (
                    <div key={i} className="rounded-md border border-border p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{it.hook}</div>
                          {it.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{it.body}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{it.format}</Badge>
                            {it.angle && <span className="text-[10px] text-muted-foreground italic line-clamp-1">{it.angle}</span>}
                          </div>
                        </div>
                        <SchedulePicker
                          busy={savingIdx === i}
                          saved={saved}
                          onSchedule={(s) => saveIdea(i, s)}
                          trigger={
                            <Button size="sm" variant={saved ? "secondary" : "outline"} disabled={saved || savingIdx === i}>
                              {savingIdx === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-primary" /> : <Plus className="w-3.5 h-3.5" />}
                              {saved ? " Saved" : " Add"}
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Break a flat transcript blob into readable paragraphs. Apify transcripts
 * arrive as one wall of text; we split on sentence boundaries and group ~4
 * sentences per paragraph, while collapsing speech disfluencies.
 */
function formatTranscript(raw: string): string[] {
  const cleaned = raw
    // Collapse common filler patterns: " uh, " " um, " " you know, "
    .replace(/\s+(uh|um|er|ah|hmm)[,.\s]/gi, " ")
    // Drop double spaces
    .replace(/\s+/g, " ")
    .trim();
  // Split on sentence terminators while keeping them attached.
  const sentences = cleaned.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [cleaned];
  const SENTENCES_PER_PARA = 4;
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    paras.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(" "));
  }
  return paras.filter((p) => p.length > 0);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function readingMinutes(s: string): number {
  return Math.max(1, Math.round(wordCount(s) / 220));
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    const { toast } = await import("sonner");
    toast.success("Transcript copied");
  } catch { /* no-op */ }
}
