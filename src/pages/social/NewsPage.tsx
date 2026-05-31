import { useEffect, useState } from "react";
import { Plus, Trash2, Play, Loader2, Rss, Newspaper, TrendingUp, ArrowUpRight, RefreshCw, Wand2, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listRssFeeds, createRssFeed, updateRssFeed, deleteRssFeed, fetchRssNow, fetchAllRssDue,
  listArticles, deleteArticle,
  listHotNews, clusterHotNews, deleteHotNews,
  createPlanEntry, generatePost, FRAMEWORK_OPTIONS,
} from "@/lib/social-queries";

type Tab = "feeds" | "articles" | "hot";
const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
  { id: "feeds", label: "RSS Feeds", icon: Rss },
  { id: "articles", label: "Articles", icon: Newspaper },
  { id: "hot", label: "Hot News", icon: TrendingUp },
];

export default function NewsPage() {
  const [tab, setTab] = useState<Tab>("feeds");
  return (
    <section className="space-y-4">
      <div className="border-b border-border flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === "feeds" && <FeedsTab />}
      {tab === "articles" && <ArticlesTab />}
      {tab === "hot" && <HotNewsTab />}
    </section>
  );
}

function FeedsTab() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const load = async () => { setLoading(true); setFeeds(await listRssFeeds()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const fetchOne = async (id: string) => {
    setBusyId(id);
    const { error, data } = await fetchRssNow(id);
    setBusyId(null);
    if (error) toast.error(error.message);
    else {
      const r = (data as any)?.results?.[0];
      if (r?.error) toast.error(`Fetch failed: ${r.error}`);
      else toast.success(`Fetched ${r?.fetched ?? 0} items · ${r?.inserted ?? 0} new`);
      load();
    }
  };

  const fetchAll = async () => {
    setBusyAll(true);
    const { error, data } = await fetchAllRssDue();
    setBusyAll(false);
    if (error) return toast.error(error.message);
    const total = ((data as any)?.results ?? []).reduce((s: number, r: any) => s + (r.inserted || 0), 0);
    toast.success(`Fetched all due feeds · ${total} new articles`);
    load();
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">{feeds.length} feeds</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={busyAll}>
            {busyAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Fetch all due
          </Button>
          <Dialog open={show} onOpenChange={setShow}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add RSS feed</Button></DialogTrigger>
            <AddFeedDialog onCreated={() => { setShow(false); load(); }} />
          </Dialog>
        </div>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        feeds.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No feeds yet. Add an RSS feed URL to start pulling news.</Card> :
        <>
        <div className="border border-border rounded-lg overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Label</th>
                <th className="text-left px-3 py-2">Feed URL</th>
                <th className="text-left px-3 py-2">Cadence</th>
                <th className="text-left px-3 py-2">Articles</th>
                <th className="text-left px-3 py-2">Last Fetch</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{f.label || "—"}</td>
                  <td className="px-3 py-2"><a href={f.feed_url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[260px] inline-flex items-center gap-1">{f.feed_url} <ArrowUpRight className="w-3 h-3" /></a></td>
                  <td className="px-3 py-2">
                    <Select value={f.cadence} onValueChange={async (v) => { await updateRssFeed(f.id, { cadence: v }); load(); }}>
                      <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">{f.articles_count ?? 0}</td>
                  <td className="px-3 py-2 text-xs">
                    {f.last_fetched_at ? new Date(f.last_fetched_at).toLocaleString() : "—"}
                    {f.last_fetch_status === "error" && <Badge variant="destructive" className="ml-1 text-[10px]" title={f.last_fetch_error || ""}>err</Badge>}
                  </td>
                  <td className="px-3 py-2"><Switch checked={f.active} onCheckedChange={async (v) => { await updateRssFeed(f.id, { active: v }); load(); }} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => fetchOne(f.id)} disabled={busyId === f.id}>
                      {busyId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete feed and its articles?")) { await deleteRssFeed(f.id); load(); } }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {feeds.map((f) => (
            <Card key={f.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm">{f.label || "—"}</span>
                <Switch checked={f.active} onCheckedChange={async (v) => { await updateRssFeed(f.id, { active: v }); load(); }} />
              </div>
              <div className="text-xs text-muted-foreground break-all">
                URL: <a href={f.feed_url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">{f.feed_url} <ArrowUpRight className="w-3 h-3" /></a>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                <span>Cadence: <span className="font-medium">{f.cadence}</span></span>
                <span>Articles: <span className="font-medium">{f.articles_count ?? 0}</span></span>
              </div>
              <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-2">
                <span className="text-[10px] text-muted-foreground">Last: {f.last_fetched_at ? new Date(f.last_fetched_at).toLocaleDateString() : "—"}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => fetchOne(f.id)} disabled={busyId === f.id}>
                    {busyId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete feed and its articles?")) { await deleteRssFeed(f.id); load(); } }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        </>
      }
    </section>
  );
}

function AddFeedDialog({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add RSS feed</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><label className="text-xs font-medium">RSS / Atom URL *</label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://techcrunch.com/feed/" /></div>
        <div><label className="text-xs font-medium">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="TechCrunch" /></div>
        <div>
          <label className="text-xs font-medium">Fetch cadence</label>
          <Select value={cadence} onValueChange={setCadence}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full" disabled={!url || busy} onClick={async () => {
          setBusy(true);
          try { await createRssFeed({ feed_url: url, label, cadence }); toast.success("Feed added · cron will fetch on its cadence"); onCreated(); }
          catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
        }}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Add feed</Button>
      </div>
    </DialogContent>
  );
}

function ArticlesTab() {
  const [articles, setArticles] = useState<any[]>([]);
  const [feeds, setFeeds] = useState<any[]>([]);
  const [feedFilter, setFeedFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [a, f] = await Promise.all([listArticles(feedFilter !== "all" ? { feed_id: feedFilter } : {}), listRssFeeds()]);
    setArticles(a); setFeeds(f); setLoading(false);
  };
  useEffect(() => { load(); }, [feedFilter]);

  const filtered = articles.filter((a) => !search || (a.title || "").toLowerCase().includes(search.toLowerCase()) || (a.snippet || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
        <Input placeholder="Search articles…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
        <Select value={feedFilter} onValueChange={setFeedFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="All feeds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All feeds</SelectItem>
            {feeds.map((f) => <SelectItem key={f.id} value={f.id}>{f.label || f.feed_url.slice(0, 30)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto">{filtered.length} articles</span>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No articles yet. Add a feed and click Fetch.</Card> :
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.id} className="p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    {a.source_label && <Badge variant="secondary" className="text-[10px]">{a.source_label}</Badge>}
                    {a.published_at && <span>{new Date(a.published_at).toLocaleString()}</span>}
                    {a.author && <span>· {a.author}</span>}
                  </div>
                  <a href={a.article_url} target="_blank" rel="noreferrer" className="font-medium text-sm hover:text-primary inline-flex items-start gap-1">
                    {a.title} <ArrowUpRight className="w-3 h-3 shrink-0 mt-1" />
                  </a>
                  {a.snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.snippet}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteArticle(a.id); load(); }}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      }
    </section>
  );
}

function HotNewsTab() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openTopic, setOpenTopic] = useState<any | null>(null);

  const load = async () => { setLoading(true); setTopics(await listHotNews()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const recluster = async () => {
    setBusy(true);
    const { error, data } = await clusterHotNews();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Generated ${(data as any)?.topics ?? 0} hot news topics`);
    load();
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{topics.length} hot news topics · auto-refreshed after each fetch</p>
        <Button size="sm" onClick={recluster} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}Re-analyze Hot News
        </Button>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        topics.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No hot news yet. Add feeds and fetch articles, then click Re-analyze.</Card> :
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topics.map((t) => (
            <Card key={t.id} className="p-4 cursor-pointer hover:border-primary/60 transition-colors" onClick={() => setOpenTopic(t)}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-sm">{t.title}</h3>
                <Badge variant="secondary">{t.score}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-4">{t.description}</p>
              <div className="text-[11px] text-muted-foreground mt-2 flex gap-3">
                <span>{t.article_count} articles</span>
                {t.timeframe && <span>· {t.timeframe}</span>}
              </div>
            </Card>
          ))}
        </div>
      }

      {openTopic && <HotNewsDialog topic={openTopic} onClose={() => { setOpenTopic(null); load(); }} />}
    </section>
  );
}

function HotNewsDialog({ topic, onClose }: { topic: any; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { body: string; loading: boolean }>>({});

  const generate = async (framework: string) => {
    setDrafts((d) => ({ ...d, [framework]: { body: "", loading: true } }));
    const { data, error } = await generatePost({ framework, idea: `Topic: ${topic.title}\n\n${topic.description ?? ""}` });
    if (error) { setDrafts((d) => ({ ...d, [framework]: { body: "", loading: false } })); return toast.error(error.message); }
    setDrafts((d) => ({ ...d, [framework]: { body: (data as any)?.draft?.body ?? "", loading: false } }));
  };

  const sendToPlanner = async (framework: string, body: string) => {
    const hookLine = body.split("\n").find((l) => l.trim()) || body.slice(0, 80);
    await createPlanEntry({
      hook: hookLine.slice(0, 140), body, framework,
      format: "insight", status: "planned",
      source_hotnews_id: topic.id, source_kind: "hot_news",
    } as any);
    toast.success("Added to Content Planner");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />{topic.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Card className="p-4 bg-muted/30 whitespace-pre-wrap text-sm">{topic.description}</Card>
          <div className="text-xs text-muted-foreground">{topic.article_count} articles · {topic.timeframe || "Recent"} · score {topic.score}</div>

          <div className="border-t border-border pt-4">
            <h3 className="font-medium text-sm flex items-center gap-2 mb-3"><Wand2 className="w-4 h-4" />Generate posts from this</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FRAMEWORK_OPTIONS.map((f) => (
                <Card key={f.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">{f.description}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => generate(f.id)} disabled={drafts[f.id]?.loading}>
                      {drafts[f.id]?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    </Button>
                  </div>
                  {drafts[f.id]?.body && (
                    <div className="mt-2 space-y-2">
                      <Textarea rows={8} value={drafts[f.id].body} onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: { ...d[f.id], body: e.target.value } }))} className="text-xs" />
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(drafts[f.id].body); toast.success("Copied"); }}><Copy className="w-3 h-3 mr-1" />Copy</Button>
                        <Button size="sm" onClick={() => sendToPlanner(f.id, drafts[f.id].body)}>Send to Planner</Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-between border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={async () => { await deleteHotNews(topic.id); toast.success("Deleted"); onClose(); }}>
              <Trash2 className="w-4 h-4 mr-1 text-destructive" />Delete topic
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}