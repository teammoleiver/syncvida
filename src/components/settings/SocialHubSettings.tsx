import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Linkedin, Search as SearchIcon, Youtube, Newspaper, Bot, Plus, Trash2, Star, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SocialMediaModule, { ApifyTab } from "@/pages/SocialMediaModule";
import {
  listRssFeeds, createRssFeed, updateRssFeed, deleteRssFeed, fetchRssNow,
} from "@/lib/social-queries";
import { listYouTubeChannels, addYouTubeChannel, deleteYouTubeChannel } from "@/lib/youtube-queries";

type Sub = "linkedin" | "search" | "youtube" | "news" | "apify";

const SUBS: { id: Sub; label: string; icon: React.ComponentType<any> }[] = [
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "news", label: "News & RSS", icon: Newspaper },
  { id: "apify", label: "Apify", icon: Bot },
];

/**
 * One settings home for every Social Hub channel. LinkedIn shows the writer
 * voice/persona; the others manage each channel's sources + config. All in the
 * central Settings page — the Social Hub itself stays a clean workspace.
 */
export default function SocialHubSettings({ sub }: { sub?: string }) {
  const navigate = useNavigate();
  // Each sub-tab is its own URL: /settings/social-hub/<sub>.
  const active: Sub = (SUBS.some((s) => s.id === sub) ? sub : "linkedin") as Sub;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit max-w-full flex-wrap">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/settings/social-hub/${s.id}`)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              active === s.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {active === "linkedin" && <SocialMediaModule embedded />}
      {active === "search" && <SearchSettings />}
      {active === "youtube" && <YouTubeSettings />}
      {active === "news" && <NewsSettings />}
      {active === "apify" && <ApifyTab />}
    </div>
  );
}

/* ───────────── Search ───────────── */
function SearchSettings() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("linkup");
  const [endpoint, setEndpoint] = useState("");
  const [queryField, setQueryField] = useState("q");
  const [makeDefault, setMakeDefault] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  async function load() {
    const { data } = await supabase.from("social_search_providers" as any)
      .select("*").order("is_default", { ascending: false });
    setProviders((data as any[]) ?? []);
    setPage(1);
    setLoading(false);
  }

  const totalPages = Math.max(1, Math.ceil(providers.length / PAGE_SIZE));
  const pageProviders = providers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!name.trim()) { toast.error("Name the provider"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    try {
      if (makeDefault) await supabase.from("social_search_providers" as any).update({ is_default: false } as any).eq("user_id", user.id);
      const { error } = await supabase.from("social_search_providers" as any).insert({
        user_id: user.id, name: name.trim(), provider_kind: kind,
        endpoint_url: endpoint.trim() || null, query_field: queryField.trim() || "q",
        is_default: makeDefault, is_active: true,
      } as any);
      if (error) throw error;
      setName(""); setEndpoint(""); setMakeDefault(false);
      toast.success("Provider added");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  async function setDefault(p: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("social_search_providers" as any).update({ is_default: false } as any).eq("user_id", user.id);
    await supabase.from("social_search_providers" as any).update({ is_default: true } as any).eq("id", p.id);
    await load();
  }
  async function toggleActive(p: any) {
    await supabase.from("social_search_providers" as any).update({ is_active: !p.is_active } as any).eq("id", p.id);
    await load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this search provider?")) return;
    await supabase.from("social_search_providers" as any).delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold">Search providers</h3>
        <p className="text-xs text-muted-foreground">The web-search backends used by Social Hub → Search. Mark one as default; the AI prompt optimizer runs on top. Linkup uses the platform key; custom HTTP providers carry their own endpoint config.</p>
        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading…</div>
        ) : providers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No providers yet — add one below (Linkup is the simplest).</p>
        ) : (
          <>
          <div className="space-y-2">
            {pageProviders.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">{p.provider_kind}</Badge>
                    {p.is_default && <Badge variant="secondary" className="gap-1 text-[10px]"><Star className="w-3 h-3" /> Default</Badge>}
                    {!p.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Off</Badge>}
                  </div>
                  {p.endpoint_url && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{p.endpoint_url}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!p.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(p)} title="Make default"><Star className="w-3.5 h-3.5" /></Button>}
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)} title="Delete"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
          {providers.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, providers.length)} of {providers.length}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-3.5 h-3.5" /> Prev</Button>
                <span className="text-xs text-muted-foreground tabular-nums px-1">{page} / {totalPages}</span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next <ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          )}
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold text-sm">Add a provider</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Linkup" /></div>
          <div>
            <label className="text-xs font-medium">Kind</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linkup">Linkup (web search)</SelectItem>
                <SelectItem value="http">Custom HTTP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "http" && (
            <>
              <div className="sm:col-span-2"><label className="text-xs font-medium">Endpoint URL</label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/search" /></div>
              <div><label className="text-xs font-medium">Query field</label><Input value={queryField} onChange={(e) => setQueryField(e.target.value)} placeholder="q" /></div>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Set as default provider</label>
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add provider</Button>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── YouTube ───────────── */
function YouTubeSettings() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() { setChannels(await listYouTubeChannels().catch(() => [])); setLoading(false); }
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!url.trim()) { toast.error("Paste a channel URL or @handle"); return; }
    setBusy(true);
    try {
      const r = await addYouTubeChannel(url.trim());
      setUrl("");
      toast.success(`Added ${r.channel?.title ?? "channel"} · ${r.videos_inserted ?? 0} videos`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Couldn't add channel"); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Stop tracking this channel?")) return;
    await deleteYouTubeChannel(id); await load();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold">Tracked YouTube creators</h3>
        <p className="text-xs text-muted-foreground">Channels Social Hub → YouTube fetches videos from. The transcript scraper actor and Apify accounts are configured under the <strong>LinkedIn</strong> tab (Apify section).</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/@channel  or  @handle" className="flex-1" />
          <Button onClick={add} disabled={busy} className="shrink-0">{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add channel</Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading…</div>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No channels tracked yet.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {c.avatar_url && <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />}
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.title || c.handle || c.channel_id}</div>
                    {c.subscriber_count != null && <div className="text-[11px] text-muted-foreground">{Number(c.subscriber_count).toLocaleString()} subscribers</div>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(c.id)} title="Remove"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────────── News & RSS ───────────── */
const CADENCES = ["hourly", "daily", "weekly"];
function NewsSettings() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [busy, setBusy] = useState(false);

  async function load() { setFeeds(await listRssFeeds()); setLoading(false); }
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!url.trim()) { toast.error("Paste a feed URL"); return; }
    setBusy(true);
    try {
      await createRssFeed({ feed_url: url, label, cadence });
      setUrl(""); setLabel("");
      toast.success("Feed added · cron fetches on its cadence");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  async function toggle(f: any) { await updateRssFeed(f.id, { active: !f.active }); await load(); }
  async function changeCadence(f: any, c: string) { await updateRssFeed(f.id, { cadence: c }); await load(); }
  async function remove(id: string) { if (!confirm("Remove this feed?")) return; await deleteRssFeed(id); await load(); }
  async function fetchNow(id: string) {
    try { await fetchRssNow(id); toast.success("Fetching…"); setTimeout(load, 1500); }
    catch (e: any) { toast.error(e?.message ?? "Fetch failed"); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold">RSS feeds</h3>
        <p className="text-xs text-muted-foreground">Sources for Social Hub → News &amp; RSS. A cron fetches each feed on its cadence; new articles feed Hot News topics.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed.xml" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="sm:w-44" />
          <Select value={cadence} onValueChange={setCadence}>
            <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{CADENCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add feed</Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading…</div>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No feeds yet.</p>
        ) : (
          <div className="space-y-2 pt-1">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{f.label || f.feed_url}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{f.feed_url}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {f.articles_count ?? 0} articles{f.last_fetch_status ? ` · ${f.last_fetch_status}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={f.cadence ?? "daily"} onValueChange={(c) => changeCadence(f, c)}>
                    <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CADENCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => fetchNow(f.id)} title="Fetch now"><RefreshCw className="w-3.5 h-3.5" /></Button>
                  <Switch checked={f.active !== false} onCheckedChange={() => toggle(f)} />
                  <Button size="sm" variant="ghost" onClick={() => remove(f.id)} title="Remove"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
