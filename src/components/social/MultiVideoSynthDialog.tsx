import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Sparkles, Combine, ListChecks, FileText, Send, Copy, Check,
  Linkedin, Twitter, Instagram, ExternalLink, Lightbulb, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateMultiVideoContent, addIdeaToPlanner, addPostToPlanner,
  type MultiVideoResult, type MultiVideoIdea, type MultiVideoPost,
  type YouTubeVideo,
} from "@/lib/youtube-queries";

/**
 * Right-side workspace that turns N selected, transcribed videos into a single
 * batch of cross-source ideas + ready-to-post drafts. Designed as a "synthesis
 * studio" — pick videos, set intent, generate, then push individual outputs
 * straight into the planner.
 */
export default function MultiVideoSynthDialog({
  open, onClose, videos, channelTitleByPk,
}: {
  open: boolean;
  onClose: () => void;
  videos: YouTubeVideo[];
  channelTitleByPk: Record<string, string>;
}) {
  const [intent, setIntent] = useState("");
  const [count, setCount] = useState(7);
  const [platforms, setPlatforms] = useState<string[]>(["linkedin", "twitter", "instagram"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MultiVideoResult | null>(null);
  const [tab, setTab] = useState<"ideas" | "posts" | "themes">("ideas");

  // Reset whenever the picked set changes meaningfully
  useEffect(() => { setResult(null); }, [videos.map((v) => v.video_id).join(",")]);

  const transcribed = useMemo(() => videos.filter((v) => v.has_transcript), [videos]);
  const missing = videos.length - transcribed.length;

  function togglePlatform(p: string) {
    setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }

  async function generate() {
    if (transcribed.length < 1) { toast.error("Select at least one transcribed video"); return; }
    setBusy(true);
    setResult(null);
    try {
      const r = await generateMultiVideoContent({
        video_ids: transcribed.slice(0, 10).map((v) => v.video_id),
        mode: "both",
        count,
        platforms,
        intent: intent.trim() || undefined,
      });
      setResult(r);
      setTab(r.ideas?.length ? "ideas" : r.posts?.length ? "posts" : "themes");
      if (r.ai_unavailable) toast.warning(r.warning ?? "AI unavailable — local drafts generated instead");
      else toast.success(`Synthesized ${r.ideas?.length ?? 0} ideas · ${r.posts?.length ?? 0} posts`);
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Combine className="w-5 h-5 text-primary" />
            Multi-video synthesis
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {transcribed.length} transcribed{missing > 0 ? ` · ${missing} skipped` : ""}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[280px_1fr] max-h-[80vh]">
          {/* Left rail: selected sources */}
          <aside className="border-r border-border bg-muted/30 overflow-y-auto p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sources ({videos.length})
            </div>
            {videos.map((v, i) => (
              <Card key={v.id} className={`p-2 text-[11px] ${v.has_transcript ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">S{i + 1}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium line-clamp-2">{v.title}</div>
                    <div className="text-muted-foreground truncate mt-0.5">
                      {channelTitleByPk[v.channel_pk] ?? v.channel_id}
                    </div>
                    {!v.has_transcript && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">No transcript — skipped</div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </aside>

          {/* Right: controls + output */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Your angle (optional)</label>
                <Textarea
                  rows={2}
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="e.g. Combine these into a contrarian POV for B2B founders. Avoid generic AI takes."
                  className="mt-1 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Count</span>
                  {[5, 7, 10].map((n) => (
                    <Button key={n} size="sm" variant={count === n ? "default" : "outline"}
                      onClick={() => setCount(n)} className="h-7 px-2 text-xs">
                      {n}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Platforms</span>
                  {[
                    { id: "linkedin", Icon: Linkedin },
                    { id: "twitter", Icon: Twitter },
                    { id: "instagram", Icon: Instagram },
                  ].map(({ id, Icon }) => (
                    <Button key={id} size="sm" variant={platforms.includes(id) ? "default" : "outline"}
                      onClick={() => togglePlatform(id)} className="h-7 px-2 text-xs gap-1 capitalize">
                      <Icon className="w-3 h-3" /> {id}
                    </Button>
                  ))}
                </div>
                <Button onClick={generate} disabled={busy || transcribed.length < 1} className="ml-auto">
                  {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  {result ? "Regenerate" : "Synthesize"}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!result && !busy && (
                <EmptyState transcribed={transcribed.length} />
              )}
              {busy && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <div className="text-sm">Reading {transcribed.length} transcript{transcribed.length === 1 ? "" : "s"}…</div>
                  <div className="text-[11px]">Looking for shared themes, contradictions, and angles you can own.</div>
                </div>
              )}
              {result && (
                <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                  {result.ai_unavailable && (
                    <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div>
                        <div className="font-medium text-foreground">AI credits are exhausted</div>
                        <div>{result.warning ?? "Showing local draft ideas so the workflow still works. Top up AI balance for deeper creative synthesis."}</div>
                      </div>
                    </div>
                  )}
                  <TabsList>
                    <TabsTrigger value="ideas"><Lightbulb className="w-3.5 h-3.5 mr-1" /> Ideas ({result.ideas.length})</TabsTrigger>
                    <TabsTrigger value="posts"><FileText className="w-3.5 h-3.5 mr-1" /> Posts ({result.posts.length})</TabsTrigger>
                    <TabsTrigger value="themes"><ListChecks className="w-3.5 h-3.5 mr-1" /> Themes ({result.themes.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="ideas" className="space-y-3 mt-3">
                    {result.ideas.map((idea, i) => <IdeaCard key={i} idea={idea} sources={result.sources} />)}
                    {result.next_steps?.length > 0 && (
                      <Card className="p-3 border-dashed">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Next steps</div>
                        <ul className="text-sm list-disc pl-5 space-y-0.5">
                          {result.next_steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </Card>
                    )}
                  </TabsContent>
                  <TabsContent value="posts" className="space-y-3 mt-3">
                    {result.posts.map((post, i) => <PostCard key={i} post={post} sources={result.sources} />)}
                  </TabsContent>
                  <TabsContent value="themes" className="space-y-2 mt-3">
                    {result.themes.map((t, i) => (
                      <Card key={i} className="p-3 flex items-start justify-between gap-3">
                        <div className="font-medium text-sm">{t.label}</div>
                        <div className="flex gap-1 flex-wrap">
                          {t.sources?.map((n) => (
                            <Badge key={n} variant="outline" className="text-[10px]">S{n}</Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                    <SourcesList sources={result.sources} />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ transcribed }: { transcribed: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
      <Combine className="w-10 h-10 text-primary/60" />
      <div className="text-sm font-medium text-foreground">Ready to synthesize {transcribed} video{transcribed === 1 ? "" : "s"}</div>
      <div className="text-xs max-w-md">
        Add an optional angle, choose how many ideas, then hit Synthesize. The AI will read all transcripts together and produce cross-source content you can push to the planner.
      </div>
    </div>
  );
}

function IdeaCard({ idea, sources }: { idea: MultiVideoIdea; sources: { n: number; title: string; url: string }[] }) {
  const [pushed, setPushed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function push() {
    setBusy(true);
    try {
      const first = sources.find((s) => idea.sources?.[0] === s.n) ?? sources[0];
      await addIdeaToPlanner(
        { hook: idea.hook, body: idea.body, angle: idea.angle, format: idea.format },
        { video_id: (first as any).video_id ?? "", title: first.title, channel: (first as any).channel ?? "" },
      );
      setPushed(true);
      toast.success("Added to Content Planner");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm leading-snug">{idea.hook}</div>
        <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{idea.format}</Badge>
      </div>
      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{idea.body}</div>
      {idea.angle && <div className="text-[11px] text-primary italic">↳ {idea.angle}</div>}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1 flex-wrap">
          {idea.sources?.map((n) => (
            <Badge key={n} variant="outline" className="text-[10px]">S{n}</Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <CopyBtn text={`${idea.hook}\n\n${idea.body}`} />
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pushed || busy} onClick={push}>
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              : pushed ? <Check className="w-3 h-3 mr-1" />
              : <Send className="w-3 h-3 mr-1" />}
            {pushed ? "Added" : "Add to planner"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PostCard({ post, sources }: { post: MultiVideoPost; sources: { n: number; title: string; video_id?: string; channel?: string }[] }) {
  const [pushed, setPushed] = useState(false);
  const [busy, setBusy] = useState(false);
  const Ic = post.platform === "twitter" ? Twitter : post.platform === "instagram" ? Instagram : Linkedin;
  async function push() {
    setBusy(true);
    try {
      const first = sources.find((s) => post.sources?.[0] === s.n) ?? sources[0];
      await addPostToPlanner(
        { platform: post.platform as any, hook: post.hook, body: post.body, hashtags: post.hashtags, length: post.body.length },
        { video_id: (first as any).video_id ?? "", title: first.title, channel: (first as any).channel ?? "" },
      );
      setPushed(true);
      toast.success("Scheduled in planner");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Ic className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs capitalize font-medium">{post.platform}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{post.body.length} chars</span>
      </div>
      <div className="font-medium text-sm">{post.hook}</div>
      <div className="text-xs whitespace-pre-wrap">{post.body}</div>
      {post.hashtags?.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {post.hashtags.map((h, i) => <Badge key={i} variant="secondary" className="text-[10px]">#{h.replace(/^#/, "")}</Badge>)}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1 flex-wrap">
          {post.sources?.map((n) => (
            <Badge key={n} variant="outline" className="text-[10px]">S{n}</Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <CopyBtn text={`${post.hook}\n\n${post.body}${post.hashtags?.length ? `\n\n${post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`} />
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pushed || busy} onClick={push}>
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              : pushed ? <Check className="w-3 h-3 mr-1" />
              : <Send className="w-3 h-3 mr-1" />}
            {pushed ? "Scheduled" : "Schedule"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }
        catch { toast.error("Copy failed"); }
      }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

function SourcesList({ sources }: { sources: { n: number; title: string; channel: string; url: string }[] }) {
  return (
    <Card className="p-3 mt-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Source map</div>
      <ol className="text-xs space-y-0.5">
        {sources.map((s) => (
          <li key={s.n}>
            <Badge variant="outline" className="text-[10px] mr-1">S{s.n}</Badge>
            <a href={s.url} target="_blank" rel="noreferrer" className="underline text-primary inline-flex items-center gap-1">
              {s.title} <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-muted-foreground"> — {s.channel}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}