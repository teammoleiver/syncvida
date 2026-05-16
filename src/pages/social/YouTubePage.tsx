import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, Youtube,
  ExternalLink, Bell, BellOff, Calendar, FileText, Heart, Combine, CheckSquare, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listYouTubeChannels, addYouTubeChannel, refreshYouTubeChannel, deleteYouTubeChannel,
  setNotifyNew, listYouTubeVideos, askYouTubeAi, markChannelSeen,
  type YouTubeChannel, type YouTubeVideo, type AskAnswer,
} from "@/lib/youtube-queries";
import VideoDetailDialog from "@/components/social/VideoDetailDialog";
import MultiVideoSynthDialog from "@/components/social/MultiVideoSynthDialog";

export default function YouTubePage() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [pickedChannels, setPickedChannels] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [transcriptFilter, setTranscriptFilter] = useState<"all" | "with" | "without">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [groupBy, setGroupBy] = useState<"none" | "month" | "year">("month");

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  const [openVideo, setOpenVideo] = useState<YouTubeVideo | null>(null);

  // Multi-select for cross-video synthesis. Holds video_id values (string).
  const [pickedVideos, setPickedVideos] = useState<Set<string>>(new Set());
  const [synthOpen, setSynthOpen] = useState(false);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [ch, vids] = await Promise.all([
        listYouTubeChannels(),
        listYouTubeVideos({ sort: "newest", limit: 300 }),
      ]);
      setChannels(ch);
      setVideos(vids);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally { setLoading(false); }
  }

  async function reloadVideos() {
    try {
      const vids = await listYouTubeVideos({
        channelPks: pickedChannels.size ? [...pickedChannels] : undefined,
        sort,
        limit: 500,
      });
      setVideos(vids);
    } catch (e: any) { toast.error(e?.message ?? "Filter failed"); }
  }

  // Re-fetch only when channels selection or sort changes; year/month/search filter on client.
  useEffect(() => {
    const t = setTimeout(() => void reloadVideos(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedChannels, sort]);

  async function add() {
    const url = newUrl.trim();
    if (!url) return;
    setAdding(true);
    try {
      const r = await addYouTubeChannel(url);
      toast.success(`Added ${r.channel.title ?? r.channel.handle ?? r.channel.channel_id} · ${r.videos_inserted} videos via ${r.source}`);
      setNewUrl("");
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Failed to add"); }
    finally { setAdding(false); }
  }

  async function refreshOne(id: string) {
    setRefreshingId(id);
    try {
      // Pull only the latest 15 videos — duplicates are skipped server-side, so
      // this catches everything new since last refresh while keeping the Apify
      // bill predictable.
      const r = await refreshYouTubeChannel(id, 15);
      toast.success(r.new_videos > 0
        ? `${r.new_videos} new video${r.new_videos === 1 ? "" : "s"}`
        : "Up to date — no new videos");
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Refresh failed"); }
    finally { setRefreshingId(null); }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      const r = await refreshYouTubeChannel(undefined, 15);
      toast.success(r.new_videos > 0
        ? `${r.new_videos} new video${r.new_videos === 1 ? "" : "s"} across ${r.channels} channels`
        : `Up to date across ${r.channels} channel${r.channels === 1 ? "" : "s"}`);
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Refresh failed"); }
    finally { setRefreshingAll(false); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}"? All cached videos will also be removed.`)) return;
    try {
      await deleteYouTubeChannel(id);
      toast.success("Channel removed");
      setPickedChannels((cur) => { const n = new Set(cur); n.delete(id); return n; });
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
  }

  async function toggleNotify(c: YouTubeChannel) {
    try {
      await setNotifyNew(c.id, !c.notify_new);
      setChannels((cur) => cur.map((x) => x.id === c.id ? { ...x, notify_new: !c.notify_new } : x));
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function ask() {
    const q = question.trim();
    if (!q) { toast.error("Type a question first"); return; }
    setAsking(true);
    setAnswer(null);
    try {
      const a = await askYouTubeAi(q, pickedChannels.size ? [...pickedChannels] : [], 80);
      setAnswer(a);
    } catch (e: any) { toast.error(e?.message ?? "AI failed"); }
    finally { setAsking(false); }
  }

  const channelTitleByPk = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of channels) m[c.id] = c.title ?? c.handle ?? c.channel_id;
    return m;
  }, [channels]);

  // Count videos fetched after the user last viewed this channel — the "unread" indicator.
  const newCountByChannel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of videos) {
      const ch = channels.find((c) => c.id === v.channel_pk);
      if (!ch || !ch.last_seen_at) continue;
      if (new Date(v.fetched_at).getTime() > new Date(ch.last_seen_at).getTime()) {
        m[v.channel_pk] = (m[v.channel_pk] ?? 0) + 1;
      }
    }
    return m;
  }, [videos, channels]);

  // Available years derived from loaded videos
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const v of videos) if (v.published_at) ys.add(new Date(v.published_at).getUTCFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [videos]);

  // Apply search + year + month filter on the client
  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter((v) => {
      if (q && !(`${v.title} ${v.description ?? ""}`.toLowerCase().includes(q))) return false;
      if (yearFilter !== "all") {
        if (!v.published_at) return false;
        if (new Date(v.published_at).getUTCFullYear() !== Number(yearFilter)) return false;
      }
      if (monthFilter !== "all") {
        if (!v.published_at) return false;
        if (new Date(v.published_at).getUTCMonth() + 1 !== Number(monthFilter)) return false;
      }
      if (transcriptFilter === "with" && !v.has_transcript) return false;
      if (transcriptFilter === "without" && v.has_transcript) return false;
      return true;
    });
  }, [videos, search, yearFilter, monthFilter, transcriptFilter]);

  // Group by month or year for sectioned display
  type Section = { key: string; label: string; items: YouTubeVideo[] };
  const sections: Section[] = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: filteredVideos }];
    const buckets = new Map<string, YouTubeVideo[]>();
    for (const v of filteredVideos) {
      let key: string;
      if (!v.published_at) key = "unknown";
      else if (groupBy === "year") key = String(new Date(v.published_at).getUTCFullYear());
      else {
        const d = new Date(v.published_at);
        key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(v);
    }
    const order = [...buckets.keys()].sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return sort === "newest" ? b.localeCompare(a) : a.localeCompare(b);
    });
    return order.map((k) => ({
      key: k,
      label: k === "unknown"
        ? "Unknown date"
        : groupBy === "year"
          ? k
          : new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      items: buckets.get(k)!,
    }));
  }, [filteredVideos, groupBy, sort]);

  function togglePickChannel(id: string) {
    setPickedChannels((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    // Reset the "new videos" badge for this channel — user has now looked at it.
    if ((newCountByChannel[id] ?? 0) > 0) {
      void markChannelSeen(id).catch(() => { /* non-critical */ });
      setChannels((cur) => cur.map((c) => c.id === id ? { ...c, last_seen_at: new Date().toISOString() } : c));
    }
  }

  function togglePickVideo(videoId: string) {
    setPickedVideos((cur) => {
      const n = new Set(cur);
      if (n.has(videoId)) n.delete(videoId); else n.add(videoId);
      return n;
    });
  }

  // Resolve picked video_ids to full video objects (preserving selection order).
  const pickedVideoObjs = useMemo(() => {
    const map = new Map(videos.map((v) => [v.video_id, v]));
    return [...pickedVideos].map((id) => map.get(id)).filter(Boolean) as YouTubeVideo[];
  }, [pickedVideos, videos]);
  const pickedTranscribedCount = pickedVideoObjs.filter((v) => v.has_transcript).length;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" /> YouTube Creators
          </h2>
          <p className="text-sm text-muted-foreground">
            Track creators you follow. Pull their videos, search across creators, and ask AI for content ideas.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={refreshingAll || channels.length === 0}>
          {refreshingAll ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Refresh all
        </Button>
      </div>

      {/* Add channel */}
      <Card className="p-4">
        <label className="text-xs font-medium text-muted-foreground">Add a YouTube channel</label>
        <div className="flex gap-2 mt-2">
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.youtube.com/@ericnowoslawski   or   @handle   or   UC… channel id"
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          />
          <Button onClick={add} disabled={adding || !newUrl.trim()}>
            {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Uses Apify Fast YouTube Channel Scraper for full backfill (up to 200 videos). Falls back to YouTube Data API or public RSS (latest 15) if Apify isn't configured.
        </p>
      </Card>

      {/* Channels list */}
      {loading && channels.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading channels…
        </div>
      ) : channels.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No channels yet. Paste a URL above to start tracking a creator.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {channels.map((c) => {
            const picked = pickedChannels.has(c.id);
            const newCount = newCountByChannel[c.id] ?? 0;
            return (
              <Card key={c.id}
                className={`p-3 transition-colors relative ${
                  picked ? "border-primary ring-1 ring-primary/40"
                  : newCount > 0 ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
                  : ""
                }`}>
                {newCount > 0 && (
                  <div className="absolute -top-2 -right-2 z-10">
                    <Badge className="bg-emerald-500 text-white border-0 gap-1 shadow-md">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                      </span>
                      {newCount} new
                    </Badge>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <button onClick={() => togglePickChannel(c.id)} className="shrink-0 relative">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center"><Youtube className="w-5 h-5" /></div>
                    )}
                  </button>
                  <button onClick={() => togglePickChannel(c.id)} className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">{c.title ?? c.handle ?? c.channel_id}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.handle ? `@${c.handle}` : c.channel_id}
                      {c.subscriber_count ? ` · ${formatCount(c.subscriber_count)} subs` : ""}
                      {c.video_count ? ` · ${c.video_count} videos` : ""}
                    </div>
                    {c.last_fetched_at && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Last fetched {timeAgo(c.last_fetched_at)}
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Notify when new videos appear (placeholder for cron)">
                    {c.notify_new ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    <Switch checked={c.notify_new} onCheckedChange={() => toggleNotify(c)} />
                  </label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => refreshOne(c.id)} disabled={refreshingId === c.id} title="Refresh videos">
                      {refreshingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={c.source_url} target="_blank" rel="noreferrer" title="Open on YouTube"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id, c.title ?? c.channel_id)} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* AI prompt */}
      <Card className="p-4 border-dashed">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-sm">Ask AI across these creators</h3>
          {pickedChannels.size > 0 && (
            <Badge variant="secondary" className="text-[10px]">scoped to {pickedChannels.size} channel{pickedChannels.size === 1 ? "" : "s"}</Badge>
          )}
        </div>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="What are 5 trending hooks I should steal? · What topics is everyone covering this month? · Give me 7 video ideas for a creator focused on outbound sales."
        />
        <div className="flex justify-between items-center mt-2">
          <p className="text-[10px] text-muted-foreground">Grounded in your most recent videos. Uses Gemini.</p>
          <Button onClick={ask} disabled={asking || !question.trim()}>
            {asking ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Ask
          </Button>
        </div>
        {answer && (
          <div className="mt-3 p-3 rounded-md bg-muted/40 border border-border space-y-3">
            <div className="text-sm whitespace-pre-wrap">{answer.answer}</div>
            {answer.sources?.length > 0 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">Sources ({answer.sources.length})</summary>
                <ol className="mt-1 space-y-0.5">
                  {answer.sources.map((s) => (
                    <li key={s.video_id} className="text-muted-foreground">
                      [{s.n}] <a href={s.url} target="_blank" rel="noreferrer" className="underline text-primary">{s.title}</a> — <span>{s.channel}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Filters */}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or description…" className="pl-7" />
          </div>
          <div className="md:col-span-2">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="text-xs"><Calendar className="w-3.5 h-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Flat grid</SelectItem>
                <SelectItem value="month">Group by month</SelectItem>
                <SelectItem value="year">Group by year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {(search || yearFilter !== "all" || monthFilter !== "all" || transcriptFilter !== "all" || pickedChannels.size > 0) && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filteredVideos.length} video{filteredVideos.length === 1 ? "" : "s"} matching</span>
            <button onClick={() => { setSearch(""); setYearFilter("all"); setMonthFilter("all"); setTranscriptFilter("all"); setPickedChannels(new Set()); }} className="underline">Clear filters</button>
          </div>
        )}
      </Card>

      {/* Video grid (optionally grouped) */}
      {filteredVideos.length === 0 && !loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No videos match your filters.</Card>
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => (
            <div key={sec.key} className="space-y-3">
              {sec.label && (
                <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-1">
                  <h3 className="font-display text-base font-semibold">{sec.label}</h3>
                  <Badge variant="secondary" className="text-[10px]">{sec.items.length}</Badge>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {sec.items.map((v) => {
                  const isPicked = pickedVideos.has(v.video_id);
                  return (
                  <div key={v.id} className="relative group">
                    {/* Selection checkbox — only meaningful when transcript is ready */}
                    {v.has_transcript && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePickVideo(v.video_id); }}
                        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-sm ${
                          isPicked
                            ? "bg-primary border-primary text-primary-foreground scale-110"
                            : "bg-background/90 border-border opacity-0 group-hover:opacity-100 hover:border-primary"
                        }`}
                        title={isPicked ? "Unselect" : "Select for multi-video synthesis"}
                      >
                        {isPicked && <CheckSquare className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => setOpenVideo(v)} className="text-left w-full">
                    <Card className={`overflow-hidden transition-all h-full flex flex-col ${
                      isPicked
                        ? "border-primary ring-2 ring-primary/40 shadow-md"
                        : v.has_transcript
                          ? "border-emerald-500/60 hover:border-emerald-400 ring-1 ring-emerald-500/20"
                          : "hover:border-primary/60"
                    }`}>
                      <div className="relative">
                        {v.thumbnail_url ? (
                          <img src={v.thumbnail_url} alt="" className="w-full aspect-video object-cover" />
                        ) : (
                          <div className="w-full aspect-video bg-muted flex items-center justify-center"><Youtube className="w-6 h-6 text-muted-foreground" /></div>
                        )}
                        {v.has_transcript && (
                          <Badge className="absolute top-1.5 right-1.5 bg-emerald-500/90 text-white border-0 gap-1 text-[10px] py-0.5 px-1.5">
                            <FileText className="w-2.5 h-2.5" /> Transcript
                          </Badge>
                        )}
                        {v.is_liked && (
                          <div className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md">
                            <Heart className="w-3.5 h-3.5 fill-current" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col">
                        <div className="text-xs font-medium line-clamp-2 group-hover:text-primary">{v.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 truncate">
                          {channelTitleByPk[v.channel_pk] ?? v.channel_id}
                          {v.published_at ? ` · ${new Date(v.published_at).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                    </Card>
                  </button>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <VideoDetailDialog
        open={openVideo !== null}
        onClose={() => setOpenVideo(null)}
        video={openVideo}
        channelTitle={openVideo ? (channelTitleByPk[openVideo.channel_pk] ?? openVideo.channel_id) : ""}
        onTranscriptFetched={(vid) => {
          setVideos((cur) => cur.map((v) => v.video_id === vid ? { ...v, has_transcript: true, transcript_fetched_at: new Date().toISOString() } : v));
        }}
        onLikeToggled={(vid, isLiked) => {
          setVideos((cur) => cur.map((v) => v.video_id === vid ? { ...v, is_liked: isLiked } : v));
        }}
      />

      {/* Floating multi-select action bar */}
      {pickedVideos.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full bg-foreground text-background shadow-2xl border border-border animate-in fade-in slide-in-from-bottom-4">
          <CheckSquare className="w-4 h-4" />
          <div className="text-sm font-medium">
            {pickedVideos.size} selected
            {pickedTranscribedCount !== pickedVideos.size && (
              <span className="text-xs opacity-70 ml-1">
                ({pickedTranscribedCount} with transcript)
              </span>
            )}
          </div>
          <div className="w-px h-5 bg-background/20" />
          <Button size="sm" variant="secondary" className="h-8 rounded-full"
            disabled={pickedTranscribedCount === 0}
            onClick={() => setSynthOpen(true)}>
            <Combine className="w-3.5 h-3.5 mr-1" /> Synthesize ideas + posts
          </Button>
          <button onClick={() => setPickedVideos(new Set())}
            className="opacity-70 hover:opacity-100 ml-1" title="Clear selection">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <MultiVideoSynthDialog
        open={synthOpen}
        onClose={() => setSynthOpen(false)}
        videos={pickedVideoObjs}
        channelTitleByPk={channelTitleByPk}
      />
    </section>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
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
