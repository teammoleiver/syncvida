import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Link as LinkIcon, Plus, Play, Trash2, Sparkles, Settings as SettingsIcon, TrendingUp, FileText, CalendarDays, Users, RefreshCw, Loader2, Wand2, ChevronRight, ChevronLeft, Copy, ArrowUpRight, Pencil, Check, X, History, Shuffle, Eye, EyeOff, Activity, Upload, Download, ArrowUp, ArrowDown, ChevronsUpDown, MessageCircle, Star, ListPlus, Tag, Folder, ChevronDown, BarChart3, Pin, PinOff, Search as SearchIcon, ThumbsUp, ThumbsDown, Brain, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listSocialProfiles, createSocialProfile, updateSocialProfile, deleteSocialProfile,
  bulkCreateSocialProfiles, listExistingProfileUrls, bulkUpdateSocialProfiles, bulkDeleteSocialProfiles, bulkMergeBlankSocialProfiles,
  setProfileFavorite, bulkSetProfileFavorite, addProfilesToList, removeProfilesFromList, renameProfileList, deleteProfileList,
  listSocialPosts, createManualSocialPost, deleteSocialPost,
  listHotTopics, clusterHotTopics, deleteHotTopic,
  listContentPlan, createPlanEntry, updatePlanEntry, deletePlanEntry,
  getWriterSettings, upsertWriterSettings,
  scrapeProfile, scrapeAllActive,
  generatePost, suggestFrameworks,
  FRAMEWORK_OPTIONS,
  listApifyAccounts, createApifyAccount, updateApifyAccount, deleteApifyAccount, testApifyAccount, computeAccountHealth, parseApifyActorId,
  listScrapeRuns, rotateNowScrape, retryWithAccount,
  listPostsForProfile,
  listFrameworkPrompts, saveFrameworkPrompt, suggestFrameworkPromptImprovement,
  analyzeSelfProfile, scrapeMyLastPosts, enrichVoiceFromPosts, enrichFromWebsites, listWebsiteEnrichments,
  listCommentTones, saveCommentTones, type CommentTone,
  listUsedSourcePostCounts, listDraftsForPost,
  listSocialPostsPaged, ignoreSocialPost, unignoreSocialPost, scorePostRelevance,
} from "@/lib/social-queries";
import ApifyActorsPanel from "@/components/social/ApifyActorsPanel";
import EngagementFeedTab from "@/components/social/EngagementFeedTab";
import LinkedInAnalyticsTab from "@/components/social/LinkedInAnalyticsTab";
import {
  POSITIVE_TAGS, NEGATIVE_TAGS,
  addScrapeMemory, listScrapeMemory, updateScrapeMemory, deleteScrapeMemory,
  type ScrapeMemoryRow, type ScrapeMemorySignal, type ScrapeMemorySource,
} from "@/lib/social-memory";
import { createContactFromTrackedProfile } from "@/lib/crm-queries";

async function pushProfileToCrm(p: any) {
  try {
    const c = await createContactFromTrackedProfile(p);
    if (c) toast.success("Added to CRM contacts");
    else toast.error("Could not create CRM contact");
  } catch (e: any) {
    toast.error(e?.message ?? "Failed to create CRM contact");
  }
}

/**
 * Masked, reveal-toggle input for a user's own API key. When a key is already
 * saved we don't pre-fill the raw value — we show a "Saved" state and only push
 * a change when the user actually types a new key (typing clears the saved
 * placeholder). Submitting empty leaves the existing key untouched.
 */
function ApiKeyInput({ label, placeholder, saved, onChange, hint, provider }: {
  label: string; placeholder: string; saved: boolean; onChange: (v: string) => void; hint?: string;
  provider: "openai" | "anthropic";
}) {
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function test() {
    setTesting(true); setResult(null);
    try {
      // Test the freshly-typed key if present; otherwise the server tests the saved one.
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { provider, key: touched && draft.trim() ? draft.trim() : undefined },
      });
      if (error) throw error;
      const r = data as any;
      setResult(r?.ok ? { ok: true, msg: r.detail || "Working" } : { ok: false, msg: r?.error || "Failed" });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message ?? "Test failed" });
    } finally { setTesting(false); }
  }

  const canTest = (touched && draft.trim().length > 0) || saved;
  return (
    <div>
      <label className="text-xs font-medium flex items-center gap-1.5">
        {label}
        {saved && !touched && <span className="inline-flex items-center gap-0.5 text-emerald-500"><Check className="w-3 h-3" /> Saved</span>}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={reveal ? "text" : "password"}
            value={draft}
            autoComplete="off"
            placeholder={saved && !touched ? "•••••••••••• (saved — type to replace)" : placeholder}
            onChange={(e) => { setTouched(true); setDraft(e.target.value); onChange(e.target.value); setResult(null); }}
            className="pr-9 font-mono text-xs"
          />
          <button type="button" onClick={() => setReveal((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={test} disabled={!canTest || testing} className="shrink-0">
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
        </Button>
      </div>
      {result && (
        <p className={`text-[11px] mt-1 flex items-center gap-1 ${result.ok ? "text-emerald-500" : "text-red-500"}`}>
          {result.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {result.ok ? "Connected — " : "Failed — "}{result.msg}
        </p>
      )}
      {hint && !result && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

type Tab = "profiles" | "posts" | "engagement" | "analytics" | "topics" | "planner" | "settings";

// ─── Pinned lists (persisted per-user in localStorage) ───
const PINNED_LISTS_KEY = "syncvida.social.pinnedLists";
function readPinnedLists(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_LISTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
function usePinnedLists() {
  const [pinned, setPinned] = useState<string[]>(() => readPinnedLists());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === PINNED_LISTS_KEY) setPinned(readPinnedLists()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggle = (name: string) => {
    setPinned((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      try { localStorage.setItem(PINNED_LISTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const isPinned = (name: string) => pinned.includes(name);
  return { pinned, toggle, isPinned };
}

// Build a clean LinkedIn post URL. Stored URLs sometimes contain raw `urn:li:activity:...`
// which Chrome can mangle (the colons are reserved). Rebuild from the activity id and
// route through LinkedIn's canonical `/posts/` permalink which works without auth-context.
function normalizeLinkedInUrl(raw?: string | null): string {
  if (!raw) return "";
  const url = String(raw).trim();
  if (!url) return "";
  const m = url.match(/(?:activity|share|ugcPost)[:%-](\d{15,})/i);
  if (m) return `https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A${m[1]}/`;
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
}

// Some users' networks (corporate filters, browser extensions) block direct
// navigation to linkedin.com with ERR_BLOCKED_BY_RESPONSE. Copy the URL to the
// clipboard instead of opening a new tab so they can paste it into a context
// where LinkedIn is allowed.
async function copyLinkedInUrl(raw?: string | null) {
  const url = normalizeLinkedInUrl(raw);
  if (!url) { toast.error("No LinkedIn URL available"); return; }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("LinkedIn link copied — paste it in a tab where LinkedIn isn't blocked.");
  } catch {
    toast.error("Could not copy link");
  }
}

const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
  { id: "profiles", label: "Profiles to Track", icon: Users },
  { id: "posts", label: "Scraped Posts", icon: FileText },
  { id: "engagement", label: "Engagement Feed", icon: MessageCircle },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "topics", label: "Hot Topics & Rewrites", icon: TrendingUp },
  { id: "planner", label: "Content Planner", icon: CalendarDays },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function SocialMediaModule({ defaultTab, hideHeader, embedded, basePath }: { defaultTab?: Tab; hideHeader?: boolean; embedded?: boolean; basePath?: string } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const [internalTab, setInternalTab] = useState<Tab>(defaultTab ?? "profiles");

  // Embedded inside the central Settings page → render ONLY the writer settings
  // (the single canonical home for these). No tab bar, no other Social Hub tabs.
  if (embedded) {
    return <div className="space-y-6"><SettingsTab /></div>;
  }

  // Standalone Social Hub → the "Settings" tab is removed; writer settings now
  // live in the central Settings page (/settings → Social Hub).
  const visibleTabs = TABS.filter((t) => t.id !== "settings");

  // When a basePath is given, each sub-tab is its own URL (/social/linkedin/<tab>);
  // otherwise fall back to internal state.
  const urlTab = basePath ? (params.tab as Tab | undefined) : undefined;
  const tab: Tab = (visibleTabs.some((t) => t.id === urlTab) ? urlTab : (basePath ? "profiles" : internalTab)) as Tab;
  const setTab = (id: Tab) => { if (basePath) navigate(`${basePath}/${id}`); else setInternalTab(id); };

  return (
    <div className={hideHeader ? "space-y-6" : "container max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6"}>
      {!hideHeader && <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-bold">S</div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Social Hub</h1>
          <p className="text-sm text-muted-foreground">Track LinkedIn voices · scrape posts · turn signal into your own content.</p>
        </div>
      </header>}

      <div className="border-b border-border flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5 -mx-4 px-4 md:mx-0 md:px-0">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0 ${
              tab === t.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profiles" && <ProfilesTab />}
      {tab === "posts" && <PostsTab />}
      {tab === "engagement" && <EngagementFeedTab />}
      {tab === "analytics" && <LinkedInAnalyticsTab />}
      {tab === "topics" && <TopicsTab />}
      {tab === "planner" && <PlannerTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ───────── Profiles tab ─────────
/**
 * User-facing scraping-capacity bar (no provider jargon). Reflects the real
 * remaining credit across the account pool as a simple % with a traffic-light
 * colour: green ≥75 · orange ≥50 · yellow ≥25 · red <25.
 */
function ScrapingCreditsBar() {
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => { listApifyAccounts().then(setAccounts).catch(() => {}); }, []);
  if (!accounts.length) return null;

  const totalLimit = accounts.reduce((s, a) => s + Number(a.apify_limit_usd ?? a.monthly_budget_usd ?? 5), 0);
  const totalRemaining = accounts.reduce((s, a) => s + (a.apify_limit_usd != null
    ? Math.max(0, Number(a.apify_limit_usd) - Number(a.apify_usage_usd || 0))
    : Number(a.monthly_budget_usd ?? 5)), 0);
  const pct = totalLimit > 0 ? Math.max(0, Math.min(100, (totalRemaining / totalLimit) * 100)) : 0;
  const scrapesLeft = Math.floor((totalRemaining / 0.5) * 10);

  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-orange-500" : pct >= 25 ? "bg-yellow-400" : "bg-red-500";
  const label = pct >= 75 ? "Healthy" : pct >= 50 ? "Good" : pct >= 25 ? "Running low" : "Almost out";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1.5"><Activity className="w-4 h-4 text-primary" /> Scraping credits</span>
        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(pct)}% left · {label} · ~{scrapesLeft.toLocaleString()} scrapes</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function ProfilesTab() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [scrapingAll, setScrapingAll] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detailProfile, setDetailProfile] = useState<any | null>(null);
  const [importPreview, setImportPreview] = useState<{ rows: Array<Record<string, any>>; headers: string[]; mapped: Record<number, string> } | null>(null);
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [listFilter, setListFilter] = useState<string>("all"); // "all" | listName
  const [manageOpen, setManageOpen] = useState(false);
  const [newListInput, setNewListInput] = useState("");
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [listMenuQuery, setListMenuQuery] = useState("");
  const { pinned: pinnedLists, toggle: togglePinList, isPinned: isListPinned } = usePinnedLists();

  const load = async () => { setLoading(true); setProfiles(await listSocialProfiles()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = profiles.filter((p) =>
    (!search || [p.username, p.display_name, p.full_name, p.first_name, p.last_name, p.company, p.location, p.profile_url, p.title, p.job_title, p.email, p.company_domain].some((f) => (f ?? "").toString().toLowerCase().includes(search.toLowerCase())))
    && (!favOnly || p.is_favorite)
    && (listFilter === "all" || (Array.isArray(p.lists) && p.lists.includes(listFilter)))
  );

  // All list names that exist on any profile (sorted, deduped)
  const allLists = (() => {
    const s = new Set<string>();
    for (const p of profiles) for (const n of (p.lists ?? [])) if (n) s.add(String(n));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  })();
  const favCount = profiles.filter((p) => p.is_favorite).length;
  const listCounts = new Map<string, number>();
  for (const p of profiles) for (const n of (p.lists ?? [])) listCounts.set(n, (listCounts.get(n) || 0) + 1);

  const nameOf = (p: any) => p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "";
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getter: Record<string, (p: any) => any> = {
      name: nameOf,
      job_title: (p) => p.job_title || p.title || "",
      company: (p) => p.company || "",
      gtm_relevance: (p) => p.gtm_relevance || "",
      decision_maker_score: (p) => p.decision_maker_score ?? -Infinity,
      num_followers: (p) => p.num_followers ?? -Infinity,
      scrape_cadence: (p) => p.scrape_cadence || "",
      last_scraped_at: (p) => p.last_scraped_at ? new Date(p.last_scraped_at).getTime() : 0,
      active: (p) => (p.active ? 1 : 0),
      created_at: (p) => p.created_at ? new Date(p.created_at).getTime() : 0,
    };
    const fn = getter[sortKey] ?? getter.created_at;
    const av = fn(a); const bv = fn(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, sortKey, sortDir, favOnly, listFilter]);
  useEffect(() => { setSelectedIds(new Set()); }, [search]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "job_title" || key === "company" || key === "gtm_relevance" || key === "scrape_cadence" ? "asc" : "desc"); }
  };

  const SortHeader = ({ k, label, align = "left" }: { k: string; label: string; align?: "left" | "right" }) => (
    <th className={`${align === "right" ? "text-right" : "text-left"} px-3 py-2 font-medium`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );

  const pageIds = paged.map((p: any) => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));
  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = async (label: string, fn: () => Promise<any>) => {
    setBulkBusy(true);
    try { await fn(); toast.success(label); setSelectedIds(new Set()); load(); }
    catch (err: any) { toast.error(err?.message ?? "Bulk action failed"); }
    finally { setBulkBusy(false); }
  };
  const selectAllFiltered = () => setSelectedIds(new Set(sorted.map((p: any) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const runOne = async (id: string) => {
    setScrapingId(id);
    const { error, data } = await scrapeProfile(id);
    setScrapingId(null);
    if (error) toast.error(error.message || "Scrape failed");
    else {
      const r = (data as any)?.results?.[0];
      if (r?.status === "error") toast.error(`Scrape failed: ${r.error ?? "unknown"}`);
      else if (r?.status === "skipped") toast.info(r.reason ?? "Skipped");
      else toast.success(`Scraped ${(data as any)?.scraped ?? 0} posts${r?.account ? ` via ${r.account}` : ""}`);
      load();
    }
  };

  const rotateOne = async (id: string) => {
    setRotatingId(id);
    const { error, data } = await rotateNowScrape(id);
    setRotatingId(null);
    if (error) toast.error(error.message || "Rotate failed");
    else {
      const r = (data as any)?.results?.[0];
      if (r?.status === "error") toast.error(`Rotate failed: ${r.error ?? "unknown"}`);
      else toast.success(`Rotated · ${r?.account ?? "?"} · ${(data as any)?.scraped ?? 0} posts`);
      load();
    }
  };

  const runAll = async () => {
    setScrapingAll(true);
    const { error, data } = await scrapeAllActive();
    setScrapingAll(false);
    if (error) toast.error(error.message || "Bulk scrape failed");
    else {
      const failures = ((data as any)?.results ?? []).filter((r: any) => r.status === "error");
      if (failures.length) toast.error(`${failures.length} scrape(s) failed: ${failures[0]?.error ?? "unknown"}`);
      else toast.success(`Scraped ${(data as any)?.scraped ?? 0} new posts across all active profiles`);
      load();
    }
  };

  return (
    <section className="space-y-4">
      <ScrapingCreditsBar />
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Input placeholder="Search name, URL, company, location…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={runAll} disabled={scrapingAll}>
            {scrapingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run All Active
          </Button>
          <Button variant="outline" onClick={() => downloadCsvTemplate()}>
            <Download className="w-4 h-4 mr-2" />Template
          </Button>
          <label className="inline-flex">
            <Button variant="outline" asChild disabled={importing}>
              <span className="cursor-pointer">
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Import CSV
              </span>
            </Button>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; e.currentTarget.value = "";
              if (!file) return;
              try {
                const text = await file.text();
                const parsed = parseProfilesCsvWithHeaders(text);
                if (!parsed.rows.length) { toast.error("No data rows found"); return; }
                setImportPreview(parsed);
              } catch (err: any) { toast.error(err?.message ?? "CSV parse failed"); }
            }} />
          </label>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Profile</Button></DialogTrigger>
            <AddProfileDialog onCreated={() => { setShowAdd(false); load(); }} />
          </Dialog>
        </div>
      </div>

      {/* Favorites + compact Lists menu + pinned list chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={favOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setFavOnly((v) => !v)}
          title="Show only favorites"
        >
          <Star className={`w-3.5 h-3.5 ${favOnly ? "fill-current" : ""}`} />
          Favorites {favCount > 0 && <span className="opacity-70">({favCount})</span>}
        </Button>
        <div className="h-6 w-px bg-border" />
        <Popover open={listMenuOpen} onOpenChange={setListMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={listFilter !== "all" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              title="Filter by list"
            >
              <Folder className="w-3.5 h-3.5" />
              {listFilter === "all" ? "Lists" : listFilter}
              {listFilter === "all" && allLists.length > 0 && <span className="opacity-60">({allLists.length})</span>}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={listMenuQuery}
                  onChange={(e) => setListMenuQuery(e.target.value)}
                  placeholder="Search lists…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-auto py-1">
              <button
                type="button"
                onClick={() => { setListFilter("all"); setListMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 ${listFilter === "all" ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">All lists</span>
                <span className="opacity-60">{profiles.length}</span>
              </button>
              {allLists
                .filter((n) => !listMenuQuery || n.toLowerCase().includes(listMenuQuery.toLowerCase()))
                .map((name) => {
                  const pinned = isListPinned(name);
                  const active = listFilter === name;
                  return (
                    <div key={name} className={`group flex items-center gap-1 px-2 py-0.5 ${active ? "bg-primary/10" : ""}`}>
                      <button
                        type="button"
                        onClick={() => { setListFilter(name); setListMenuOpen(false); }}
                        className="flex-1 inline-flex items-center gap-2 px-1 py-1 rounded text-xs text-left hover:bg-muted/50"
                      >
                        <Tag className="w-3 h-3" />
                        <span className="flex-1 truncate">{name}</span>
                        <span className="opacity-60">{listCounts.get(name) ?? 0}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePinList(name); }}
                        title={pinned ? "Unpin from toolbar" : "Pin to toolbar"}
                        className={`p-1.5 rounded hover:bg-muted/50 ${pinned ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                      >
                        {pinned ? <Pin className="w-3 h-3 fill-current" /> : <Pin className="w-3 h-3" />}
                      </button>
                    </div>
                  );
                })}
              {allLists.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No lists yet</div>
              )}
            </div>
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => { setListMenuOpen(false); setManageOpen(true); }}
                className="w-full inline-flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted/50 text-muted-foreground"
              >
                <ListPlus className="w-3.5 h-3.5" /> {allLists.length ? "Manage lists" : "Create list"}
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {/* Pinned lists shown inline for quick access */}
        {pinnedLists.filter((n) => allLists.includes(n)).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setListFilter(listFilter === name ? "all" : name)}
            className={`h-8 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5 transition-colors ${
              listFilter === name ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title="Click to filter · pinned"
          >
            <Pin className="w-3 h-3 fill-current opacity-70" />
            <span>{name}</span>
            <span className="opacity-60">{listCounts.get(name) ?? 0}</span>
          </button>
        ))}
        {listFilter !== "all" && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={() => setListFilter("all")}>
            <X className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAllFiltered}>Select all {sorted.length}</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>Clear</Button>
          <span className="mx-1 text-muted-foreground">·</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={bulkBusy}
            onClick={() => runBulk("Marked as favorite", () => bulkSetProfileFavorite(Array.from(selectedIds), true))}>
            <Star className="w-3 h-3 fill-current" /> Favorite
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={bulkBusy}
            onClick={() => runBulk("Removed from favorites", () => bulkSetProfileFavorite(Array.from(selectedIds), false))}>
            <Star className="w-3 h-3" /> Unfavorite
          </Button>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-muted-foreground">Add to list:</span>
          <Select onValueChange={(v) => runBulk(`Added to "${v}"`, () => addProfilesToList(Array.from(selectedIds), v))}>
            <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {allLists.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No lists yet</div>}
              {allLists.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <form className="flex items-center gap-1" onSubmit={(e) => {
            e.preventDefault();
            const name = newListInput.trim(); if (!name) return;
            runBulk(`Added to "${name}"`, () => addProfilesToList(Array.from(selectedIds), name));
            setNewListInput("");
          }}>
            <Input value={newListInput} onChange={(e) => setNewListInput(e.target.value)} placeholder="New list…" className="h-7 w-[120px] text-xs" />
            <Button type="submit" size="sm" variant="outline" className="h-7 text-xs px-2" disabled={bulkBusy || !newListInput.trim()}>+</Button>
          </form>
          {listFilter !== "all" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={bulkBusy}
              onClick={() => runBulk(`Removed from "${listFilter}"`, () => removeProfilesFromList(Array.from(selectedIds), listFilter))}>
              Remove from "{listFilter}"
            </Button>
          )}
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-muted-foreground">Cadence:</span>
          <Select onValueChange={(v) => runBulk(`Cadence set to ${v}`, () => bulkUpdateSocialProfiles(Array.from(selectedIds), { scrape_cadence: v }))}>
            <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Set…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Never (Off)</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulk("Activated", () => bulkUpdateSocialProfiles(Array.from(selectedIds), { active: true }))}>Activate</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulk("Deactivated", () => bulkUpdateSocialProfiles(Array.from(selectedIds), { active: false }))}>Deactivate</Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={bulkBusy} onClick={() => {
            if (!confirm(`Delete ${selectedIds.size} profile(s)? This cannot be undone.`)) return;
            runBulk("Deleted", () => bulkDeleteSocialProfiles(Array.from(selectedIds)));
          }}>Delete</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{filtered.length} profile{filtered.length === 1 ? "" : "s"}{search ? ` (filtered from ${profiles.length})` : ""}</span>
        <div className="flex items-center gap-2">
          <span>Sort:</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v)}>
            <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Date added</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="num_followers">Followers</SelectItem>
              <SelectItem value="decision_maker_score">DM Score</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="job_title">Job Title</SelectItem>
              <SelectItem value="gtm_relevance">GTM Relevance</SelectItem>
              <SelectItem value="last_scraped_at">Last Scrape</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
            {sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No profiles yet. Add a LinkedIn URL to start tracking.</Card> :
        <>
        <div className="hidden md:block border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col className="w-8" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[5%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead className="bg-muted/40 text-xs uppercase tracking-wide">
              <tr>
                <th className="w-8 px-2 py-2">
                  <div className="flex items-center gap-0.5">
                    <input
                      type="checkbox"
                      aria-label="Select page"
                      checked={allOnPageSelected}
                      ref={(el) => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected; }}
                      onChange={togglePageSelection}
                      className="cursor-pointer"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground p-0.5" aria-label="Selection options">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="text-xs">
                        <DropdownMenuItem onClick={() => setSelectedIds((prev) => { const n = new Set(prev); pageIds.forEach((id) => n.add(id)); return n; })}>
                          Select current page ({pageIds.length})
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={selectAllFiltered}>
                          Select all {sorted.length} {listFilter !== "all" || favOnly || search ? "(filtered)" : "profiles"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={clearSelection}>Clear selection</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <SortHeader k="name" label="Name" />
                <SortHeader k="job_title" label="Job Title" />
                <SortHeader k="company" label="Company" />
                <SortHeader k="gtm_relevance" label="GTM" />
                <SortHeader k="num_followers" label="Followers" />
                <SortHeader k="decision_maker_score" label="DM Score" />
                <SortHeader k="scrape_cadence" label="Cadence" />
                <SortHeader k="last_scraped_at" label="Last Scrape" />
                <SortHeader k="active" label="Active" />
                <th className="text-right px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => setDetailProfile(p)}>
                  <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleRowSelection(p.id)} className="cursor-pointer" />
                  </td>
                  <td className="px-2 py-2 font-medium truncate">
                    <div className="flex items-center gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = !p.is_favorite;
                          // optimistic
                          setProfiles((arr) => arr.map((x) => x.id === p.id ? { ...x, is_favorite: next } : x));
                          setProfileFavorite(p.id, next).catch((err) => {
                            setProfiles((arr) => arr.map((x) => x.id === p.id ? { ...x, is_favorite: !next } : x));
                            toast.error(err?.message ?? "Failed to update favorite");
                          });
                        }}
                        title={p.is_favorite ? "Remove from favorites" : "Add to favorites"}
                        className={`shrink-0 ${p.is_favorite ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500"}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${p.is_favorite ? "fill-current" : ""}`} />
                      </button>
                      <span className="truncate">{p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</span>
                      <a href={p.profile_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary shrink-0" title={p.profile_url}>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                    {Array.isArray(p.lists) && p.lists.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.lists.map((n: string) => (
                          <span key={n} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            <Tag className="w-2.5 h-2.5" /> {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 truncate" title={p.job_title || p.title || ""}>{p.job_title || p.title || "—"}</td>
                  <td className="px-2 py-2 truncate" title={p.company || ""}>{p.company || "—"}{p.company_domain && <span className="block text-[10px] text-muted-foreground truncate">{p.company_domain}</span>}</td>
                  <td className="px-2 py-2">{p.gtm_relevance ? <Badge variant="secondary" className="text-[10px]">{p.gtm_relevance}</Badge> : "—"}</td>
                  <td className="px-2 py-2 tabular-nums truncate">{typeof p.num_followers === "number" ? p.num_followers.toLocaleString() : "—"}</td>
                  <td className="px-2 py-2">{p.decision_maker_score ?? "—"}</td>
                  <td className="px-2 py-2">
                    <Select value={p.scrape_cadence ?? "daily"} onValueChange={async (v) => { await updateSocialProfile(p.id, { scrape_cadence: v }); load(); }}>
                      <SelectTrigger className="h-7 w-full text-xs px-2"><SelectValue /></SelectTrigger>
                      <SelectContent onClick={(e) => e.stopPropagation()}>
                        <SelectItem value="off">Never</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2 truncate" title={p.last_scraped_at ? new Date(p.last_scraped_at).toLocaleString() : ""}>
                    {p.last_scraped_at ? new Date(p.last_scraped_at).toLocaleDateString() : "—"}
                    {p.last_scrape_status === "error" && <Badge variant="destructive" className="ml-1 text-[10px]">err</Badge>}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><Switch checked={p.active} onCheckedChange={async (v) => { await updateSocialProfile(p.id, { active: v }); load(); }} /></td>
                  <td className="px-1 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => runOne(p.id)} disabled={scrapingId === p.id} title="Run scrape">
                      {scrapingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotateOne(p.id)} disabled={rotatingId === p.id} title="Rotate to next eligible Apify account">
                      {rotatingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                    </Button>
                    <ProfileHistoryButton profile={p} />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => pushProfileToCrm(p)} title="Create in CRM">
                      <UserPlus className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => { if (confirm("Delete profile?")) { await deleteSocialProfile(p.id); load(); } }} title="Delete">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden space-y-4">
          {paged.map((p) => (
            <div
              key={p.id}
              onClick={() => setDetailProfile(p)}
              className="p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-all space-y-3 cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleRowSelection(p.id)}
                    className="cursor-pointer shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = !p.is_favorite;
                      setProfiles((arr) => arr.map((x) => x.id === p.id ? { ...x, is_favorite: next } : x));
                      setProfileFavorite(p.id, next).catch((err) => {
                        setProfiles((arr) => arr.map((x) => x.id === p.id ? { ...x, is_favorite: !next } : x));
                        toast.error(err?.message ?? "Failed to update favorite");
                      });
                    }}
                    className={`shrink-0 ${p.is_favorite ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500"}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${p.is_favorite ? "fill-current" : ""}`} />
                  </button>
                  <span className="font-semibold text-foreground truncate">
                    {p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                  </span>
                  <a href={p.profile_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
                <Switch
                  checked={p.active}
                  onCheckedChange={async (v) => { await updateSocialProfile(p.id, { active: v }); load(); }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{p.job_title || p.title || "—"}</div>
                <div>{p.company || "—"}{p.company_domain && ` (${p.company_domain})`}</div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {p.gtm_relevance && <Badge variant="secondary" className="text-[10px]">{p.gtm_relevance} GTM</Badge>}
                {typeof p.num_followers === "number" && (
                  <Badge variant="outline" className="text-[10px]">
                    {p.num_followers.toLocaleString()} followers
                  </Badge>
                )}
                {p.decision_maker_score != null && (
                  <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                    DM Score: {p.decision_maker_score}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="opacity-70">Cadence:</span>
                    <Select value={p.scrape_cadence ?? "daily"} onValueChange={async (v) => { await updateSocialProfile(p.id, { scrape_cadence: v }); load(); }}>
                      <SelectTrigger className="h-6 w-20 text-[10px] px-1 ml-1 inline-flex"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Never</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="opacity-70">Last Scrape:</span>
                    <span className="ml-1 text-foreground">
                      {p.last_scraped_at ? new Date(p.last_scraped_at).toLocaleDateString() : "—"}
                    </span>
                    {p.last_scrape_status === "error" && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">err</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => runOne(p.id)} disabled={scrapingId === p.id} title="Run scrape">
                    {scrapingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotateOne(p.id)} disabled={rotatingId === p.id} title="Rotate Apify account">
                    {rotatingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                  </Button>
                  <ProfileHistoryButton profile={p} />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => { if (confirm("Delete profile?")) { await deleteSocialProfile(p.id); load(); } }} title="Delete">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              {Array.isArray(p.lists) && p.lists.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {p.lists.map((n: string) => (
                    <span key={n} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      <Tag className="w-2.5 h-2.5" /> {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      }

      {!loading && sorted.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" disabled={safePage <= 1} onClick={() => setPage(1)}>« First</Button>
            <Button size="sm" variant="outline" className="h-7" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <span className="px-2">Page {safePage} of {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            <Button size="sm" variant="outline" className="h-7" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>Last »</Button>
          </div>
        </div>
      )}

      <ProfileDetailDialog profile={detailProfile} onClose={() => setDetailProfile(null)} onSaved={() => { setDetailProfile(null); load(); }} />
      <ManageListsDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        lists={allLists}
        counts={listCounts}
        onChanged={load}
        onPickList={(name) => { setListFilter(name); setManageOpen(false); }}
      />
      <ImportPreviewDialog
        preview={importPreview}
        allLists={allLists}
        onClose={() => setImportPreview(null)}
        onConfirm={async (rowsToImport, mode) => {
          setImporting(true);
          try {
            if (mode === "merge") {
              const res = await bulkMergeBlankSocialProfiles(rowsToImport);
              toast.success(`Merged: ${res.updated} updated · ${res.unchanged} already complete · ${res.notFound} not in list`);
            } else {
              const res = await bulkCreateSocialProfiles(rowsToImport);
              const parts = [`Imported ${res.inserted}`];
              if (res.duplicates) parts.push(`${res.duplicates} duplicate(s) skipped`);
              if (res.skipped) parts.push(`${res.skipped} invalid skipped`);
              toast.success(parts.join(" · "));
            }
            setImportPreview(null);
            load();
          } catch (err: any) { toast.error(err?.message ?? "Import failed"); }
          finally { setImporting(false); }
        }}
      />
    </section>
  );
}

// ───────── CSV helpers + Detail dialog ─────────
const PROFILE_CSV_FIELDS: Array<{ key: string; label: string; aliases?: string[] }> = [
  { key: "full_name", label: "Full Name" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "job_title", label: "Job Title", aliases: ["title"] },
  { key: "job_category", label: "Job Category" },
  { key: "gtm_relevance", label: "GTM Relevance" },
  { key: "company", label: "Company" },
  { key: "company_domain", label: "Company Domain" },
  { key: "profile_url", label: "LinkedIn URL", aliases: ["linkedin", "url"] },
  { key: "location", label: "Location" },
  { key: "email", label: "Email" },
  { key: "company_industries", label: "Company Industries" },
  { key: "company_size", label: "Company Size" },
  { key: "enrich_person_summary", label: "Enrich person Summary", aliases: ["summary", "person summary"] },
  { key: "num_followers", label: "Num Followers", aliases: ["followers"] },
  { key: "country", label: "Country" },
  { key: "profile_completeness_score", label: "Profile Completeness Score" },
  { key: "shared_background", label: "Shared Background" },
  { key: "linkedin_activity_level", label: "LinkedIn Activity Level" },
  { key: "decision_maker_score", label: "Decision-Maker Score" },
  { key: "work_experience_summary", label: "Work Experience Summary" },
  { key: "education_summary", label: "Education Summary" },
  { key: "certifications_summary", label: "Certifications Summary" },
];

function downloadCsvTemplate() {
  const headers = PROFILE_CSV_FIELDS.map((f) => f.label);
  const csv = headers.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "linkedin-profiles-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ""; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseProfilesCsv(text: string): Array<Record<string, any>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const headerMap: Record<number, string> = {};
  headers.forEach((h, i) => {
    const f = PROFILE_CSV_FIELDS.find((f) => f.label.toLowerCase() === h || f.key === h || (f.aliases ?? []).some((a) => a.toLowerCase() === h));
    if (f) headerMap[i] = f.key;
  });
  const numeric = new Set(["num_followers", "profile_completeness_score", "decision_maker_score"]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, any> = {};
    cells.forEach((v, i) => {
      const k = headerMap[i]; if (!k) return;
      const val = v.trim();
      if (!val) return;
      row[k] = numeric.has(k) ? Number(val) : val;
    });
    if (row.full_name && !row.display_name) row.display_name = row.full_name;
    return row;
  }).filter((r) => r.profile_url);
}

function parseProfilesCsvWithHeaders(text: string): { rows: Array<Record<string, any>>; headers: string[]; mapped: Record<number, string> } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { rows: [], headers: [], mapped: {} };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const mapped: Record<number, string> = {};
  headers.forEach((h, i) => {
    const lower = h.toLowerCase();
    const f = PROFILE_CSV_FIELDS.find((f) => f.label.toLowerCase() === lower || f.key === lower || (f.aliases ?? []).some((a) => a.toLowerCase() === lower));
    if (f) mapped[i] = f.key;
  });
  const numeric = new Set(["num_followers", "profile_completeness_score", "decision_maker_score"]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, any> = {};
    cells.forEach((v, i) => {
      const k = mapped[i]; if (!k) return;
      const val = v.trim(); if (!val) return;
      row[k] = numeric.has(k) ? Number(val) : val;
    });
    if (row.full_name && !row.display_name) row.display_name = row.full_name;
    return row;
  });
  return { rows, headers, mapped };
}

function ImportPreviewDialog({ preview, allLists = [], onClose, onConfirm }: {
  preview: { rows: Array<Record<string, any>>; headers: string[]; mapped: Record<number, string> } | null;
  allLists?: string[];
  onClose: () => void;
  onConfirm: (rows: Array<Record<string, any>>, mode: "create" | "merge") => void;
}) {
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [ignoreDupes, setIgnoreDupes] = useState(true);
  const [mode, setMode] = useState<"create" | "merge">("create");
  const [listChoice, setListChoice] = useState<string>("__none__");
  const [newListName, setNewListName] = useState<string>("");

  useEffect(() => {
    setExcluded(new Set()); setExistingUrls(new Set());
    setListChoice("__none__"); setNewListName("");
    if (!preview) return;
    const urls = preview.rows.map((r) => r.profile_url).filter(Boolean);
    listExistingProfileUrls(urls).then((u) => setExistingUrls(new Set(u)));
  }, [preview]);

  if (!preview) return null;

  const seenInFile = new Map<string, number>();
  const issues = preview.rows.map((r, idx) => {
    const list: string[] = [];
    if (!r.profile_url) list.push("Missing LinkedIn URL");
    else {
      try { new URL(r.profile_url); } catch { list.push("Invalid URL"); }
      const prev = seenInFile.get(r.profile_url);
      if (prev !== undefined) list.push(`Duplicate of row ${prev + 1}`);
      else seenInFile.set(r.profile_url, idx);
      if (existingUrls.has(r.profile_url)) list.push("Already in your list");
    }
    if (!r.full_name && !r.display_name && !r.first_name) list.push("No name");
    return list;
  });

  const mappedFields = Array.from(new Set(Object.values(preview.mapped)));
  const unmapped = preview.headers.filter((_, i) => !preview.mapped[i]);
  const errorCount = issues.filter((i) => i.some((x) => x.startsWith("Missing") || x.startsWith("Invalid"))).length;
  const dupeCount = issues.filter((i) => i.some((x) => x.startsWith("Duplicate") || x.startsWith("Already"))).length;

  const finalRows = preview.rows.filter((_, i) => {
    if (excluded.has(i)) return false;
    const issueList = issues[i];
    if (issueList.some((x) => x.startsWith("Missing") || x.startsWith("Invalid"))) return false;
    if (mode === "create" && !ignoreDupes && issueList.some((x) => x.startsWith("Duplicate") || x.startsWith("Already"))) return false;
    return true;
  });
  // In merge mode, only rows already in the list make sense
  const rowsForMode = mode === "merge"
    ? finalRows.filter((r) => existingUrls.has(r.profile_url))
    : finalRows;

  const targetListName = mode === "create"
    ? (listChoice === "__new__" ? newListName.trim() : (listChoice === "__none__" ? "" : listChoice))
    : "";
  const rowsToSubmit = targetListName
    ? rowsForMode.map((r) => {
        const existing: string[] = Array.isArray(r.lists) ? r.lists : [];
        return { ...r, lists: existing.includes(targetListName) ? existing : [...existing, targetListName] };
      })
    : rowsForMode;
  const submitDisabled = !rowsForMode.length || (mode === "create" && listChoice === "__new__" && !newListName.trim());

  return (
    <Dialog open={!!preview} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review CSV import · {preview.rows.length} rows</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="p-3">
            <p className="text-xs font-medium mb-2">Field mapping</p>
            <div className="flex flex-wrap gap-1">
              {mappedFields.map((k) => {
                const f = PROFILE_CSV_FIELDS.find((f) => f.key === k);
                return <Badge key={k} variant="secondary" className="text-[10px]">✓ {f?.label ?? k}</Badge>;
              })}
              {unmapped.map((h) => <Badge key={h} variant="outline" className="text-[10px] text-muted-foreground">⊘ {h} (ignored)</Badge>)}
            </div>
          </Card>

          <div className="flex flex-wrap gap-3 items-center text-xs">
            <Badge variant={errorCount ? "destructive" : "secondary"}>{errorCount} error(s)</Badge>
            <Badge variant={dupeCount ? "default" : "secondary"}>{dupeCount} duplicate(s)</Badge>
            <Badge variant="secondary">{rowsForMode.length} will {mode === "merge" ? "merge" : "import"}</Badge>
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
                <button type="button" onClick={() => setMode("create")} className={`px-2 py-1 text-xs rounded ${mode === "create" ? "bg-primary text-primary-foreground" : ""}`}>Create new</button>
                <button type="button" onClick={() => setMode("merge")} className={`px-2 py-1 text-xs rounded ${mode === "merge" ? "bg-primary text-primary-foreground" : ""}`}>Merge into existing</button>
              </div>
              {mode === "create" && (
                <label className="flex items-center gap-2">
                  <Switch checked={ignoreDupes} onCheckedChange={setIgnoreDupes} />
                  <span>Ignore duplicates</span>
                </label>
              )}
            </div>
          </div>

          {mode === "merge" && (
            <Card className="p-3 bg-muted/40">
              <p className="text-xs text-muted-foreground">
                <strong>Merge mode:</strong> matches rows by LinkedIn URL and only fills fields that are currently empty
                on existing profiles. Existing values are never overwritten. Use this to enrich the ~840 profiles that
                are missing followers, country, scores, or summaries.
              </p>
            </Card>
          )}

          {mode === "create" && (
            <Card className="p-3 bg-muted/40 space-y-2">
              <p className="text-xs font-medium">Assign imported profiles to a list (optional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={listChoice}
                  onChange={(e) => setListChoice(e.target.value)}
                  className="text-xs h-8 rounded-md border border-border bg-background px-2"
                >
                  <option value="__none__">— No list —</option>
                  <option value="__new__">+ Create new list…</option>
                  {allLists.length > 0 && <option disabled>──────────</option>}
                  {allLists.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {listChoice === "__new__" && (
                  <Input
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name"
                    className="h-8 text-xs w-56"
                  />
                )}
                {targetListName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {rowsForMode.length} profile(s) → "{targetListName}"
                  </Badge>
                )}
              </div>
            </Card>
          )}

          {(errorCount > 0 || dupeCount > 0) && (
            <Card className="p-3 bg-muted/40">
              <p className="text-xs font-medium mb-1">Suggestions</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                {errorCount > 0 && <li>Fix or remove rows with missing/invalid LinkedIn URLs (rows are auto-skipped).</li>}
                {dupeCount > 0 && <li>Toggle "Ignore duplicates" off to block them, or leave on to skip silently.</li>}
                <li>Use the trash icon below to manually exclude any specific row.</li>
              </ul>
            </Card>
          )}

          <div className="border border-border rounded-lg overflow-x-auto max-h-[40vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">#</th>
                  <th className="text-left px-2 py-1">Name</th>
                  <th className="text-left px-2 py-1">LinkedIn URL</th>
                  <th className="text-left px-2 py-1">Company</th>
                  <th className="text-left px-2 py-1">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const issueList = issues[i];
                  const isExcluded = excluded.has(i);
                  const hasError = issueList.some((x) => x.startsWith("Missing") || x.startsWith("Invalid"));
                  return (
                    <tr key={i} className={`border-t border-border ${isExcluded ? "opacity-40" : ""}`}>
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1">{r.full_name || r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-2 py-1 truncate max-w-[200px]">{r.profile_url || "—"}</td>
                      <td className="px-2 py-1">{r.company || "—"}</td>
                      <td className="px-2 py-1">
                        {issueList.length === 0
                          ? <Badge variant="secondary" className="text-[10px]">OK</Badge>
                          : issueList.map((x, j) => (
                              <Badge key={j} variant={hasError ? "destructive" : "outline"} className="text-[10px] mr-1">{x}</Badge>
                            ))}
                      </td>
                      <td className="px-2 py-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setExcluded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
                        }}>
                          {isExcluded ? <Check className="w-3 h-3" /> : <Trash2 className="w-3 h-3 text-destructive" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={submitDisabled} onClick={() => onConfirm(rowsToSubmit, mode)}>
              {mode === "merge"
                ? `Merge ${rowsForMode.length} profile(s)`
                : `Import ${rowsForMode.length} profile(s)${targetListName ? ` into "${targetListName}"` : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDetailDialog({ profile, onClose, onSaved }: { profile: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"details" | "history">("details");
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  useEffect(() => { setForm(profile ?? {}); setTab("details"); setPosts([]); }, [profile]);
  useEffect(() => {
    if (!profile || tab !== "history") return;
    setPostsLoading(true);
    listPostsForProfile(profile.id).then((p) => { setPosts(p); setPostsLoading(false); });
  }, [tab, profile]);
  if (!profile) return null;
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.full_name || form.display_name || form.username || "Profile"}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 border-b border-border mb-3">
          <button type="button" onClick={() => setTab("details")} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Details</button>
          <button type="button" onClick={() => setTab("history")} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Scraped posts {posts.length ? `(${posts.length})` : ""}</button>
        </div>
        {tab === "details" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROFILE_CSV_FIELDS.map((f) => {
            const isLong = ["enrich_person_summary", "shared_background", "work_experience_summary", "education_summary", "certifications_summary"].includes(f.key);
            return (
              <div key={f.key} className={isLong ? "md:col-span-2" : ""}>
                <label className="text-xs font-medium flex items-center justify-between">
                  <span>{f.label}</span>
                  {(form[f.key] === null || form[f.key] === undefined || form[f.key] === "") && <span className="text-[10px] text-muted-foreground italic">no data yet</span>}
                </label>
                {isLong
                  ? <Textarea value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={3} />
                  : <Input value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
              </div>
            );
          })}
        </div>
        ) : (
          <div>
            {postsLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> :
              posts.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No posts scraped yet for this profile. The full history is preserved here once scraping starts.</p> :
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{posts.length} posts on file. Full history is kept and never deleted.</p>
                {posts.map((p) => (
                  <Card key={p.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : "—"}</span>
                      <span>👍 {p.likes ?? 0} · 💬 {p.comments ?? 0} · 🔁 {p.shares ?? 0}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap line-clamp-6">{p.post_text}</p>
                    {p.post_url && <button type="button" onClick={() => copyLinkedInUrl(p.post_url)} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">Copy LinkedIn link <Copy className="w-3 h-3" /></button>}
                  </Card>
                ))}
              </div>
            }
          </div>
        )}
        {tab === "details" && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const updates: Record<string, any> = {};
              PROFILE_CSV_FIELDS.forEach((f) => { updates[f.key] = form[f.key] === "" ? null : form[f.key]; });
              await updateSocialProfile(profile.id, updates);
              toast.success("Profile updated");
              onSaved();
            } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
            finally { setBusy(false); }
          }}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save</Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddProfileDialog({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [actor, setActor] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add LinkedIn profile</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><label className="text-xs font-medium">LinkedIn URL *</label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/username" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Display name</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs font-medium">Company</label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Scrape cadence</label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off (manual only)</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly (Mondays)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><label className="text-xs font-medium">Apify actor (optional)</label><Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="default actor" /></div>
        </div>
        <Button className="w-full" disabled={!url || busy} onClick={async () => {
          setBusy(true);
          try {
            await createSocialProfile({ profile_url: url.trim(), display_name: name || undefined, company: company || undefined, scrape_cadence: cadence, apify_actor_id: actor || undefined });
            toast.success("Profile added");
            onCreated();
          } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
        }}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Add profile</Button>
      </div>
    </DialogContent>
  );
}

// ───────── Posts tab ─────────
function PostsTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [listFilter, setListFilter] = useState<string>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [ignoredFilter, setIgnoredFilter] = useState<"exclude" | "only" | "all">("exclude");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<any | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [usage, setUsage] = useState<Record<string, { drafts: number; plans: number }>>({});
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [scoringAll, setScoringAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<"relevant" | "irrelevant">("relevant");
  const [deleteTags, setDeleteTags] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState("");
  const [staleFilter, setStaleFilter] = useState<"all" | "stale" | "fresh">("all");
  // Feedback dialog (used by ignore/like — captures memory tags + free-text reason)
  const [feedbackTarget, setFeedbackTarget] = useState<{ post: any; signal: ScrapeMemorySignal; source: ScrapeMemorySource; alsoIgnore?: boolean } | null>(null);
  // Bulk selection
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [bulkFeedback, setBulkFeedback] = useState<{ posts: any[]; signal: ScrapeMemorySignal; source: ScrapeMemorySource; alsoIgnore?: boolean } | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<any[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce search input → triggers server-side refetch
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);
  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [profileFilter, ignoredFilter, debouncedSearch]);
  // Clear selection whenever the visible page/filters change
  useEffect(() => { setSelectedPostIds(new Set()); }, [page, profileFilter, listFilter, usageFilter, ignoredFilter, staleFilter, debouncedSearch]);

  const load = async () => {
    setLoading(true);
    const [pageRes, pr, uu] = await Promise.all([
      listSocialPostsPaged({
        profile_id: profileFilter !== "all" ? profileFilter : undefined,
        page,
        pageSize,
        ignored: ignoredFilter,
        search: debouncedSearch || undefined,
      }),
      listSocialProfiles(),
      listUsedSourcePostCounts(),
    ]);
    setPosts(pageRes.rows); setTotal(pageRes.total);
    setProfiles(pr); setUsage(uu); setLoading(false);
  };
  const refreshUsage = async () => { try { setUsage(await listUsedSourcePostCounts()); } catch {} };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profileFilter, page, ignoredFilter, debouncedSearch]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const allLists = (() => {
    const s = new Set<string>();
    for (const p of profiles) for (const n of (p.lists ?? [])) if (n) s.add(String(n));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  })();
  // Age helpers — color-code rows + flag stale posts (declared before `filtered` so they're in scope)
  const postAgeDays = (p: any): number | null => {
    const raw = p.posted_at || p.created_at;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    if (!isFinite(t)) return null;
    return Math.floor((Date.now() - t) / 86_400_000);
  };
  const ageBucket = (d: number | null): "fresh" | "recent" | "aging" | "stale" => {
    if (d == null) return "recent";
    if (d <= 7) return "fresh";
    if (d <= 30) return "recent";
    if (d <= 60) return "aging";
    return "stale";
  };
  const ageRowTint = (b: "fresh" | "recent" | "aging" | "stale") =>
    b === "stale" ? "bg-rose-500/5 hover:bg-rose-500/10"
    : b === "aging" ? "bg-amber-500/5 hover:bg-amber-500/10"
    : "";
  const ageLabelClass = (b: "fresh" | "recent" | "aging" | "stale") =>
    b === "stale" ? "text-rose-500 font-medium"
    : b === "aging" ? "text-amber-600"
    : b === "fresh" ? "text-emerald-600"
    : "text-muted-foreground";
  const humanAge = (d: number | null) => {
    if (d == null) return "—";
    if (d < 1) return "today";
    if (d < 30) return `${d}d ago`;
    if (d < 60) return `${Math.floor(d / 7)}w ago`;
    return `${Math.floor(d / 30)}mo ago`;
  };
  // Client-side filters that apply on top of the current page (list + usage)
  const filtered = posts.filter((p) => {
    if (listFilter !== "all") {
      const prof = profileById.get(p.profile_id);
      if (!prof || !Array.isArray(prof.lists) || !prof.lists.includes(listFilter)) return false;
    }
    const used = !!usage[p.id];
    if (usageFilter === "used" && !used) return false;
    if (usageFilter === "unused" && used) return false;
    const bucket = ageBucket(postAgeDays(p));
    if (staleFilter === "stale" && bucket !== "stale") return false;
    if (staleFilter === "fresh" && (bucket === "stale" || bucket === "aging")) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const handleIgnore = async (p: any) => {
    // Open the feedback dialog so the AI can learn WHY this post isn't relevant.
    setFeedbackTarget({ post: p, signal: "negative", source: "ignore", alsoIgnore: true });
  };
  const handleLike = (p: any) => {
    // Capture a positive signal — what the user wants to see MORE of.
    setFeedbackTarget({ post: p, signal: "positive", source: "like" });
  };
  const submitFeedback = async (tags: string[], reason: string) => {
    const t = feedbackTarget;
    if (!t) return;
    setFeedbackTarget(null);
    setBusy((b) => ({ ...b, [t.post.id]: true }));
    try {
      await addScrapeMemory({
        signal: t.signal,
        tags,
        reason,
        source: t.source,
        source_post: { id: t.post.id, author: t.post.author, text: t.post.post_text },
      });
      if (t.alsoIgnore) {
        const note = [tags.join(", "), reason].filter(Boolean).join(" — ").slice(0, 280) || undefined;
        try { await ignoreSocialPost(t.post.id, note); } catch {}
      }
      toast.success(t.signal === "positive"
        ? "Saved — AI will surface more posts like this"
        : "Saved — AI will deprioritize similar posts");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy((b) => ({ ...b, [t.post.id]: false })); }
  };
  const handleUnignore = async (p: any) => {
    setBusy((b) => ({ ...b, [p.id]: true }));
    try { await unignoreSocialPost(p.id); toast.success("Restored"); load(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy((b) => ({ ...b, [p.id]: false })); }
  };
  const handleDelete = async (p: any) => {
    setDeleteIntent("relevant");
    setDeleteTags([]);
    setDeleteReason("");
    setDeleteTarget(p);
  };
  // ── Bulk selection helpers ──
  const togglePostSelection = (id: string) =>
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const visibleIds = filtered.map((p) => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedPostIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedPostIds.has(id));
  const togglePageSelection = () =>
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  const clearSelection = () => setSelectedPostIds(new Set());
  const selectedPosts = filtered.filter((p) => selectedPostIds.has(p.id));
  const startBulkIgnore = () => {
    if (selectedPosts.length === 0) return;
    setBulkFeedback({ posts: selectedPosts, signal: "negative", source: "ignore", alsoIgnore: true });
  };
  const startBulkLike = () => {
    if (selectedPosts.length === 0) return;
    setBulkFeedback({ posts: selectedPosts, signal: "positive", source: "like" });
  };
  const startBulkDelete = () => {
    if (selectedPosts.length === 0) return;
    setDeleteIntent("relevant");
    setDeleteTags([]);
    setDeleteReason("");
    setBulkDeleteTargets(selectedPosts);
  };
  const submitBulkFeedback = async (tags: string[], reason: string) => {
    const t = bulkFeedback;
    if (!t) return;
    setBulkFeedback(null);
    setBulkBusy(true);
    try {
      const note = [tags.join(", "), reason].filter(Boolean).join(" — ").slice(0, 280) || undefined;
      for (const p of t.posts) {
        try {
          await addScrapeMemory({
            signal: t.signal,
            tags,
            reason,
            source: t.source,
            source_post: { id: p.id, author: p.author, text: p.post_text },
          });
        } catch {}
        if (t.alsoIgnore) {
          try { await ignoreSocialPost(p.id, note); } catch {}
        }
      }
      toast.success(`${t.posts.length} post(s) saved — AI will ${t.signal === "positive" ? "surface more like these" : "deprioritize similar posts"}`);
      clearSelection();
      load();
    } catch (e: any) { toast.error(e?.message ?? "Bulk action failed"); }
    finally { setBulkBusy(false); }
  };
  const confirmBulkDelete = async () => {
    const list = bulkDeleteTargets;
    if (!list || list.length === 0) return;
    setBulkDeleteTargets(null);
    setBulkBusy(true);
    try {
      const note = [deleteTags.join(", "), deleteReason].filter(Boolean).join(" — ").slice(0, 280) || "Marked irrelevant on bulk delete";
      for (const p of list) {
        if (deleteIntent === "irrelevant") {
          try { await ignoreSocialPost(p.id, note); } catch {}
          try {
            await addScrapeMemory({
              signal: "negative",
              tags: deleteTags,
              reason: deleteReason,
              source: "delete",
              source_post: { id: p.id, author: p.author, text: p.post_text },
            });
          } catch {}
        }
        try { await deleteSocialPost(p.id); } catch {}
      }
      toast.success(`${list.length} post(s) deleted${deleteIntent === "irrelevant" ? " — AI will deprioritize similar posts" : ""}`);
      clearSelection();
      load();
    } catch (e: any) { toast.error(e?.message ?? "Bulk delete failed"); }
    finally { setBulkBusy(false); }
  };
  const confirmDelete = async () => {
    const p = deleteTarget;
    if (!p) return;
    setBusy((b) => ({ ...b, [p.id]: true }));
    setDeleteTarget(null);
    try {
      if (deleteIntent === "irrelevant") {
        const note = [deleteTags.join(", "), deleteReason].filter(Boolean).join(" — ").slice(0, 280) || "Marked irrelevant on delete";
        try { await ignoreSocialPost(p.id, note); } catch {}
        try {
          await addScrapeMemory({
            signal: "negative",
            tags: deleteTags,
            reason: deleteReason,
            source: "delete",
            source_post: { id: p.id, author: p.author, text: p.post_text },
          });
        } catch {}
      }
      await deleteSocialPost(p.id);
      toast.success(deleteIntent === "irrelevant" ? "Deleted — AI will deprioritize similar posts" : "Deleted");
      load();
    }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy((b) => ({ ...b, [p.id]: false })); }
  };

  const scoreColor = (s: number | null | undefined) => {
    if (s == null) return "bg-muted text-muted-foreground border-border";
    if (s >= 75) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    if (s >= 50) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    return "bg-rose-500/15 text-rose-500 border-rose-500/30";
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <Input placeholder="Search posts…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All profiles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="w-[180px]" title="Filter by list">
              <div className="inline-flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /><SelectValue placeholder="All lists" /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {allLists.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              {allLists.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No lists yet</div>}
            </SelectContent>
          </Select>
          <Select value={usageFilter} onValueChange={(v) => setUsageFilter(v as any)}>
            <SelectTrigger className="w-[170px]" title="Filter by generation status">
              <div className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /><SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All posts</SelectItem>
              <SelectItem value="unused">Not yet generated</SelectItem>
              <SelectItem value="used">Already generated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ignoredFilter} onValueChange={(v) => setIgnoredFilter(v as any)}>
            <SelectTrigger className="w-[160px]" title="Show ignored posts">
              <div className="inline-flex items-center gap-1.5"><X className="w-3.5 h-3.5" /><SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclude">Hide ignored</SelectItem>
              <SelectItem value="only">Only ignored</SelectItem>
              <SelectItem value="all">All (incl. ignored)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={staleFilter} onValueChange={(v) => setStaleFilter(v as any)}>
            <SelectTrigger className="w-[170px]" title="Filter by age">
              <div className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /><SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ages</SelectItem>
              <SelectItem value="fresh">Fresh (≤ 30d)</SelectItem>
              <SelectItem value="stale">Stale (&gt; 2 months)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{total} posts{listFilter !== "all" || usageFilter !== "all" ? ` · ${filtered.length} on page` : ""}</span>
          <Dialog open={showManual} onOpenChange={setShowManual}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />Add manually</Button></DialogTrigger>
            <ManualPostDialog profiles={profiles} onCreated={() => { setShowManual(false); load(); }} />
          </Dialog>
        </div>
      </div>

      {selectedPostIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selectedPostIds.size} selected</span>
          <span className="text-[11px] text-muted-foreground">·</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={startBulkLike}>
            <ThumbsUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />Like with reason
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={startBulkIgnore}>
            <X className="w-3.5 h-3.5 mr-1 text-amber-500" />Ignore with reason
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10" disabled={bulkBusy} onClick={startBulkDelete}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />Delete…
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" disabled={bulkBusy} onClick={clearSelection}>Clear</Button>
        </div>
      )}

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No posts. Run a scrape or add one manually.</Card> :
        <>
        <div className="hidden md:block border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                    onChange={togglePageSelection}
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left px-3 py-2">Author</th>
                <th className="text-left px-3 py-2">Company</th>
                <th className="text-left px-3 py-2">Post</th>
                <th className="text-left px-3 py-2">Relevance</th>
                <th className="text-left px-3 py-2">Likes</th>
                <th className="text-left px-3 py-2">Comments</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const ageDays = postAgeDays(p);
                const bucket = ageBucket(ageDays);
                const tint = usage[p.id] ? "bg-primary/5 hover:bg-primary/10" : (ageRowTint(bucket) || "hover:bg-muted/20");
                const isSelected = selectedPostIds.has(p.id);
                return (
                <tr key={p.id} className={`border-t border-border cursor-pointer ${p.ignored_at ? "opacity-50" : ""} ${isSelected ? "bg-primary/10" : tint}`} onClick={() => setOpenPost(p)}>
                  <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Select post"
                      checked={isSelected}
                      onChange={() => togglePostSelection(p.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      {usage[p.id] && <span title={`Generated ${usage[p.id].drafts} draft(s) · ${usage[p.id].plans} planner entry(ies)`} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary"><Sparkles className="w-3 h-3" /></span>}
                      <span>{p.author || "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.company || "—"}</td>
                  <td className="px-3 py-2 max-w-md">
                    <div className={`line-clamp-2 ${usage[p.id] ? "text-foreground/80" : "text-muted-foreground"}`}>{p.post_text}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {usage[p.id] && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-primary/15 text-primary border-primary/30">
                          {(usage[p.id].drafts + usage[p.id].plans)}× used
                        </Badge>
                      )}
                      {p.ignored_at && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-rose-500/15 text-rose-500 border-rose-500/30">Ignored</Badge>
                      )}
                      {bucket === "stale" && !p.ignored_at && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-rose-500/15 text-rose-500 border-rose-500/30" title="Posted more than 2 months ago — consider deleting to keep your view clean">Stale · suggest delete</Badge>
                      )}
                      {bucket === "aging" && !p.ignored_at && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-500/15 text-amber-600 border-amber-500/30" title="Posted over a month ago">Aging</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {p.relevance_score != null ? (
                      <Badge variant="outline" className={`text-[11px] ${scoreColor(p.relevance_score)}`}>{p.relevance_score}%</Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{p.likes}</td>
                  <td className="px-3 py-2">{p.comments}</td>
                  <td className={`px-3 py-2 text-xs ${ageLabelClass(bucket)}`} title={p.posted_at ? new Date(p.posted_at).toLocaleString() : ""}>
                    <div>{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : "—"}</div>
                    <div className="text-[10px] opacity-80">{humanAge(ageDays)}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {p.post_url && <a href={normalizeLinkedInUrl(p.post_url)} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex p-1 hover:bg-muted rounded" title="Open on LinkedIn"><ArrowUpRight className="w-4 h-4" /></a>}
                      <Button size="sm" variant="ghost" disabled={busy[p.id] || !!p.ignored_at} onClick={() => handleLike(p)} title="Relevant to me — AI will learn this topic IS my niche">
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />
                      </Button>
                      {p.ignored_at ? (
                        <Button size="sm" variant="ghost" disabled={busy[p.id]} onClick={() => handleUnignore(p)} title="Restore">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={busy[p.id]} onClick={() => handleIgnore(p)} title="Ignore — AI will learn this topic isn't relevant">
                          <X className="w-3.5 h-3.5 text-amber-500" />
                        </Button>
                      )}
                      <Button size="sm" variant={bucket === "stale" ? "outline" : "ghost"} disabled={busy[p.id]} onClick={() => handleDelete(p)} title={bucket === "stale" ? "Stale post — suggested to delete" : "Delete"} className={bucket === "stale" ? "border-rose-500/40 text-rose-500 hover:bg-rose-500/10 h-7 px-2" : ""}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden space-y-4">
          {filtered.map((p) => {
            const ageDays = postAgeDays(p);
            const bucket = ageBucket(ageDays);
            const tint = usage[p.id] ? "bg-primary/5 border-primary/20" : (bucket === "stale" ? "bg-rose-500/5 border-rose-500/10" : (bucket === "aging" ? "bg-amber-500/5 border-amber-500/10" : "bg-card border-border"));
            const isSelected = selectedPostIds.has(p.id);
            return (
              <div
                key={p.id}
                onClick={() => setOpenPost(p)}
                className={`p-4 rounded-xl border cursor-pointer hover:shadow-sm transition-all space-y-3 relative ${p.ignored_at ? "opacity-50" : ""} ${isSelected ? "bg-primary/10 border-primary/40" : tint}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      aria-label="Select post"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => togglePostSelection(p.id)}
                      className="cursor-pointer mt-1"
                    />
                    {usage[p.id] && (
                      <span title="Used" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary">
                        <Sparkles className="w-3 h-3" />
                      </span>
                    )}
                    <div>
                      <div className="font-semibold text-foreground">{p.author || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{p.company || "—"}</div>
                    </div>
                  </div>
                  {p.relevance_score != null ? (
                    <Badge variant="outline" className={`text-[10px] py-0 h-4.5 ${scoreColor(p.relevance_score)}`}>
                      {p.relevance_score}% Relevance
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>

                <p className={`text-xs line-clamp-3 leading-relaxed ${usage[p.id] ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {p.post_text}
                </p>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
                  <div className="flex items-center gap-3">
                    <span>{p.likes} likes</span>
                    <span>{p.comments} comments</span>
                    <span className={ageLabelClass(bucket)}>{humanAge(ageDays)}</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {p.post_url && (
                      <a
                        href={normalizeLinkedInUrl(p.post_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex p-1.5 hover:bg-muted rounded"
                        title="Open on LinkedIn"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy[p.id] || !!p.ignored_at} onClick={() => handleLike(p)} title="Relevant to me">
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />
                    </Button>
                    {p.ignored_at ? (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy[p.id]} onClick={() => handleUnignore(p)} title="Restore">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy[p.id]} onClick={() => handleIgnore(p)} title="Ignore">
                        <X className="w-3.5 h-3.5 text-amber-500" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={busy[p.id]}
                      onClick={() => handleDelete(p)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {usage[p.id] && (
                    <Badge variant="secondary" className="text-[9px] py-0 h-4.5 bg-primary/15 text-primary border-primary/30">
                      {usage[p.id].drafts + usage[p.id].plans}× used
                    </Badge>
                  )}
                  {p.ignored_at && (
                    <Badge variant="secondary" className="text-[9px] py-0 h-4.5 bg-rose-500/15 text-rose-500 border-rose-500/30">Ignored</Badge>
                  )}
                  {bucket === "stale" && !p.ignored_at && (
                    <Badge variant="secondary" className="text-[9px] py-0 h-4.5 bg-rose-500/15 text-rose-500 border-rose-500/30">Stale</Badge>
                  )}
                  {bucket === "aging" && !p.ignored_at && (
                    <Badge variant="secondary" className="text-[9px] py-0 h-4.5 bg-amber-500/15 text-amber-600 border-amber-500/30">Aging</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            Page {page} of {pageCount} · showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>« First</Button>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</Button>
            <span className="text-xs px-2">{page} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next ›</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>Last »</Button>
          </div>
        </div>
        </>
      }

      {openPost && <PostInspectorDialog post={openPost} onClose={() => { setOpenPost(null); refreshUsage(); load(); }} onGenerated={refreshUsage} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              Before we remove it from your view, tell us whether this post matches your tone & topics — that way the AI keeps learning even when you clean things up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={deleteIntent} onValueChange={(v) => setDeleteIntent(v as any)} className="space-y-2 py-2">
            <Label htmlFor="del-rel" className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem id="del-rel" value="relevant" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Yes — still relevant to me</div>
                <div className="text-xs text-muted-foreground">Just delete to clean my view. Don't teach the AI to avoid posts like this.</div>
              </div>
            </Label>
            <Label htmlFor="del-irr" className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem id="del-irr" value="irrelevant" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">No — not relevant to me</div>
                <div className="text-xs text-muted-foreground">Delete and remember this. The AI will deprioritize similar posts in the future.</div>
              </div>
            </Label>
          </RadioGroup>
          {deleteIntent === "irrelevant" && (
            <div className="space-y-2 px-1 pb-2">
              <div className="text-xs font-medium">Why isn't it relevant? <span className="text-muted-foreground font-normal">(your reasons train the AI)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {NEGATIVE_TAGS.map((t) => {
                  const on = deleteTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDeleteTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-rose-500/15 text-rose-500 border-rose-500/40" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                    >{t}</button>
                  );
                })}
              </div>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Anything else? (optional — e.g. 'not about marketing automation')"
                className="min-h-[70px] resize-y text-xs"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FeedbackDialog target={feedbackTarget} onClose={() => setFeedbackTarget(null)} onSubmit={submitFeedback} />

      {/* Bulk feedback (ignore/like with reason for many posts) */}
      <FeedbackDialog
        target={bulkFeedback ? {
          post: { post_text: `${bulkFeedback.posts.length} posts selected`, author: "Bulk action" },
          signal: bulkFeedback.signal,
          source: bulkFeedback.source,
          alsoIgnore: bulkFeedback.alsoIgnore,
        } : null}
        onClose={() => setBulkFeedback(null)}
        onSubmit={submitBulkFeedback}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={!!bulkDeleteTargets} onOpenChange={(o) => { if (!o) setBulkDeleteTargets(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteTargets?.length ?? 0} post(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Tell us whether these posts match your tone & topics — the AI keeps learning even when you bulk-clean your view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={deleteIntent} onValueChange={(v) => setDeleteIntent(v as any)} className="space-y-2 py-2">
            <Label htmlFor="bulk-del-rel" className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem id="bulk-del-rel" value="relevant" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Yes — still relevant to me</div>
                <div className="text-xs text-muted-foreground">Just delete to clean my view. Don't teach the AI to avoid posts like these.</div>
              </div>
            </Label>
            <Label htmlFor="bulk-del-irr" className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem id="bulk-del-irr" value="irrelevant" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">No — not relevant to me</div>
                <div className="text-xs text-muted-foreground">Delete and remember. The AI will deprioritize similar posts in the future.</div>
              </div>
            </Label>
          </RadioGroup>
          {deleteIntent === "irrelevant" && (
            <div className="space-y-2 px-1 pb-2">
              <div className="text-xs font-medium">Why aren't they relevant? <span className="text-muted-foreground font-normal">(your reasons train the AI)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {NEGATIVE_TAGS.map((t) => {
                  const on = deleteTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDeleteTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-rose-500/15 text-rose-500 border-rose-500/40" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                    >{t}</button>
                  );
                })}
              </div>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Anything else? (optional)"
                className="min-h-[70px] resize-y text-xs"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete {bulkDeleteTargets?.length ?? 0}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ───────── Feedback dialog (captures reasons → memory) ─────────
function FeedbackDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: { post: any; signal: ScrapeMemorySignal; source: ScrapeMemorySource; alsoIgnore?: boolean } | null;
  onClose: () => void;
  onSubmit: (tags: string[], reason: string) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  useEffect(() => { if (target) { setTags([]); setReason(""); } }, [target]);
  if (!target) return null;
  const positive = target.signal === "positive";
  const palette = positive ? POSITIVE_TAGS : NEGATIVE_TAGS;
  const accent = positive
    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/40"
    : "bg-rose-500/15 text-rose-500 border-rose-500/40";
  const cta = positive ? "bg-emerald-500 hover:bg-emerald-500/90 text-white" : "bg-rose-500 hover:bg-rose-500/90 text-white";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {positive ? <ThumbsUp className="w-4 h-4 text-emerald-500" /> : <ThumbsDown className="w-4 h-4 text-rose-500" />}
            {positive ? "What did you like about this post?" : "Why isn't this relevant to you?"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {positive
            ? "Your reasons train the AI to surface more posts like this."
            : "Your reasons train the AI to stop surfacing posts like this."}
        </p>
        {target.post?.post_text && (
          <div className="text-xs text-muted-foreground line-clamp-2 italic border-l-2 border-border pl-3">
            {target.post.author ? <span className="font-medium text-foreground/80">{target.post.author}: </span> : null}
            {target.post.post_text}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {palette.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? accent : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >{t}</button>
            );
          })}
        </div>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={positive ? "Anything else? (optional — e.g. 'great breakdown of B2B GTM stack')" : "Anything else? (optional — e.g. 'not about marketing automation')"}
          className="min-h-[80px] resize-y text-xs"
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className={cta}
            disabled={tags.length === 0 && !reason.trim()}
            onClick={() => onSubmit(tags, reason.trim())}
          >
            {positive ? <><ThumbsUp className="w-3.5 h-3.5 mr-1" />Save & learn</> : <><ThumbsDown className="w-3.5 h-3.5 mr-1" />{target.alsoIgnore ? "Ignore & learn" : "Save & learn"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualPostDialog({ profiles, onCreated }: { profiles: any[]; onCreated: () => void }) {
  const [profileId, setProfileId] = useState<string>("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add post manually</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger><SelectValue placeholder="Profile (optional)" /></SelectTrigger>
          <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.username}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Author name" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <Textarea rows={6} placeholder="Paste post text…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="w-full" disabled={!text || busy} onClick={async () => {
          setBusy(true);
          try { await createManualSocialPost({ profile_id: profileId || undefined, author: author || undefined, post_text: text }); toast.success("Added"); onCreated(); }
          catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
        }}>Add post</Button>
      </div>
    </DialogContent>
  );
}

function PostInspectorDialog({ post, onClose, onGenerated }: { post: any; onClose: () => void; onGenerated?: () => void }) {
  const [suggestions, setSuggestions] = useState<{ framework: string; reason: string }[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { body: string; loading: boolean }>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [existing, setExisting] = useState<any[]>([]);
  const initialFields: any = post.relevance_fields ?? {};
  const [relevance, setRelevance] = useState<{ score: number | null; fields: string[]; matched: string[]; reasoning: string; computed_at: string | null }>({
    score: post.relevance_score ?? null,
    fields: Array.isArray(initialFields?.fields) ? initialFields.fields : [],
    matched: Array.isArray(initialFields?.matched_to_user) ? initialFields.matched_to_user : [],
    reasoning: post.relevance_reasoning ?? "",
    computed_at: post.relevance_computed_at ?? null,
  });
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    let alive = true;
    listDraftsForPost(post.id).then((d) => { if (alive) setExisting(d); }).catch(() => {});
    return () => { alive = false; };
  }, [post.id]);

  const runScore = async (force = false) => {
    setScoring(true);
    const { data, error } = await scorePostRelevance(post.id, force);
    setScoring(false);
    if (error) return toast.error(error.message);
    const d: any = data;
    setRelevance({
      score: typeof d.score === "number" ? d.score : null,
      fields: Array.isArray(d.fields) ? d.fields : [],
      matched: Array.isArray(d.matched_to_user) ? d.matched_to_user : [],
      reasoning: d.reasoning ?? "",
      computed_at: d.computed_at ?? new Date().toISOString(),
    });
  };

  const suggest = async () => {
    setSuggesting(true);
    const { data, error } = await suggestFrameworks({ source_post_id: post.id });
    setSuggesting(false);
    if (error) return toast.error(error.message);
    setSuggestions((data as any)?.suggestions ?? []);
  };

  const generate = async (framework: string) => {
    setDrafts((d) => ({ ...d, [framework]: { body: "", loading: true } }));
    const { data, error } = await generatePost({ framework, source_post_id: post.id });
    if (error) { setDrafts((d) => ({ ...d, [framework]: { body: "", loading: false } })); return toast.error(error.message); }
    setDrafts((d) => ({ ...d, [framework]: { body: (data as any)?.draft?.body ?? "", loading: false } }));
    onGenerated?.();
    try { setExisting(await listDraftsForPost(post.id)); } catch {}
    // Implicit positive signal — the user chose to generate from this post.
    // Tag with detected post fields so the AI learns "more like this".
    try {
      const fields = Array.isArray((post as any)?.relevance_fields?.fields)
        ? (post as any).relevance_fields.fields.slice(0, 5) as string[]
        : [];
      await addScrapeMemory({
        signal: "positive",
        tags: fields.length ? fields : ["Inspired a draft"],
        reason: `Generated a "${framework}" draft from this post`,
        source: "generate",
        source_post: { id: post.id, author: post.author, text: post.post_text },
      });
    } catch {}
  };

  const sendToPlanner = async (framework: string, body: string) => {
    const hookLine = body.split("\n").find((l) => l.trim()) || body.slice(0, 80);
    await createPlanEntry({ hook: hookLine.slice(0, 140), body, framework, format: framework === "Listicle" ? "framework" : "insight", status: "planned", source_post_id: post.id });
    toast.success("Added to Content Planner");
    onGenerated?.();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Post by {post.author}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {existing.length > 0 && (
            <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/30 text-primary rounded-md px-3 py-2">
              <Sparkles className="w-3.5 h-3.5" />
              You've already generated <strong>{existing.length}</strong> draft{existing.length === 1 ? "" : "s"} from this post
              {existing[0]?.created_at && <span className="text-primary/70">· last {new Date(existing[0].created_at).toLocaleDateString()}</span>}
            </div>
          )}

          {/* Relevance panel */}
          <Card className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {relevance.score != null ? (
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-display text-lg font-semibold border-2 ${
                    relevance.score >= 75 ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/40"
                    : relevance.score >= 50 ? "bg-amber-500/15 text-amber-600 border-amber-500/40"
                    : "bg-rose-500/15 text-rose-500 border-rose-500/40"
                  }`}>{relevance.score}%</div>
                ) : (
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed border-border">—</div>
                )}
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">Relevance to you</div>
                  {relevance.score == null && <div className="text-xs text-muted-foreground">Get an AI estimate of how aligned this post is with your expertise & audience.</div>}
                  {relevance.reasoning && <div className="text-xs text-muted-foreground max-w-md">{relevance.reasoning}</div>}
                  {(relevance.fields.length > 0 || relevance.matched.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {relevance.fields.map((f, i) => (
                        <Badge key={`f-${i}`} variant="outline" className="text-[10px] py-0 h-5">{f}</Badge>
                      ))}
                      {relevance.matched.map((f, i) => (
                        <Badge key={`m-${i}`} variant="secondary" className="text-[10px] py-0 h-5 bg-emerald-500/15 text-emerald-600 border-emerald-500/30">✓ {f}</Badge>
                      ))}
                    </div>
                  )}
                  {relevance.computed_at && <div className="text-[10px] text-muted-foreground">Computed {new Date(relevance.computed_at).toLocaleString()}</div>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => runScore(relevance.score != null)} disabled={scoring}>
                {scoring ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
                {relevance.score == null ? "Analyze" : "Recompute"}
              </Button>
            </div>
          </Card>

          <Card className="p-4 bg-muted/30 whitespace-pre-wrap text-sm">{post.post_text}</Card>
          <div className="text-xs text-muted-foreground flex gap-3">
            <span>👍 {post.likes}</span><span>💬 {post.comments}</span><span>🔁 {post.shares}</span>
            {post.post_url && <button type="button" onClick={() => copyLinkedInUrl(post.post_url)} className="text-primary inline-flex items-center gap-1 hover:underline">Copy LinkedIn link <Copy className="w-3 h-3" /></button>}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2"><Wand2 className="w-4 h-4" />Generate posts from this</h3>
              <Button size="sm" variant="outline" onClick={suggest} disabled={suggesting}>
                {suggesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}Suggest best frameworks
              </Button>
            </div>
            {suggestions && suggestions.length > 0 && (
              <div className="mb-3 space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="text-xs flex gap-2 items-start bg-primary/5 border border-primary/20 rounded p-2">
                    <Badge variant="secondary" className="shrink-0">{s.framework}</Badge>
                    <span className="text-muted-foreground">{s.reason}</span>
                  </div>
                ))}
              </div>
            )}
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
                        <Button size="sm" onClick={() => sendToPlanner(f.id, drafts[f.id].body)}><ChevronRight className="w-3 h-3 mr-1" />To Planner</Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Topics tab ─────────
function TopicsTab() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);
  const [genTopic, setGenTopic] = useState<any | null>(null);

  const load = async () => { setLoading(true); setTopics(await listHotTopics()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const cluster = async () => {
    setClustering(true);
    const { error, data } = await clusterHotTopics();
    setClustering(false);
    if (error) toast.error(error.message);
    else { toast.success(`Generated ${(data as any)?.topics ?? 0} topics`); load(); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-xl flex items-center gap-2">🔥 Hot Topics</h2>
        <Button onClick={cluster} disabled={clustering} className="w-full sm:w-auto shrink-0">
          {clustering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Re-cluster from posts
        </Button>
      </div>
      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        topics.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No topics yet. Click "Re-cluster from posts" after scraping some profiles.</Card> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {topics.map((t) => (
            <Card key={t.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-tight">{t.title}</h3>
                <Badge variant="secondary">{t.score}/100</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">{t.description}</p>
              <div className="text-[11px] text-muted-foreground flex gap-3 flex-wrap">
                <span>{t.post_count} posts</span><span>{t.profile_count} profiles</span>{t.timeframe && <span>{t.timeframe}</span>}
              </div>
              <div className="flex gap-1 pt-2">
                <Button size="sm" variant="outline" onClick={() => setGenTopic(t)}><Sparkles className="w-3 h-3 mr-1" />Generate Rewrites</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteHotTopic(t.id); load(); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      }
      {genTopic && <TopicGenerateDialog topic={genTopic} onClose={() => setGenTopic(null)} />}
    </section>
  );
}

function TopicGenerateDialog({ topic, onClose }: { topic: any; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { body: string; loading: boolean }>>({});
  const generate = async (framework: string) => {
    setDrafts((d) => ({ ...d, [framework]: { body: "", loading: true } }));
    const { data, error } = await generatePost({ framework, source_topic_id: topic.id, idea: topic.title, significance: topic.description });
    if (error) { setDrafts((d) => ({ ...d, [framework]: { body: "", loading: false } })); return toast.error(error.message); }
    setDrafts((d) => ({ ...d, [framework]: { body: (data as any)?.draft?.body ?? "", loading: false } }));
  };
  const send = async (framework: string, body: string) => {
    const hookLine = body.split("\n").find((l) => l.trim()) || body.slice(0, 80);
    await createPlanEntry({ hook: hookLine.slice(0, 140), body, framework, status: "planned", source_topic_id: topic.id });
    toast.success("Added to Content Planner");
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{topic.title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{topic.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {FRAMEWORK_OPTIONS.map((f) => (
            <Card key={f.id} className="p-3">
              <div className="flex items-center justify-between">
                <div><div className="font-medium text-sm">{f.name}</div><div className="text-[11px] text-muted-foreground">{f.description}</div></div>
                <Button size="sm" variant="ghost" onClick={() => generate(f.id)} disabled={drafts[f.id]?.loading}>
                  {drafts[f.id]?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                </Button>
              </div>
              {drafts[f.id]?.body && (
                <div className="mt-2 space-y-2">
                  <Textarea rows={8} value={drafts[f.id].body} onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: { ...d[f.id], body: e.target.value } }))} className="text-xs" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(drafts[f.id].body); toast.success("Copied"); }}><Copy className="w-3 h-3 mr-1" />Copy</Button>
                    <Button size="sm" onClick={() => send(f.id, drafts[f.id].body)}><ChevronRight className="w-3 h-3 mr-1" />To Planner</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Planner tab ─────────
function PlannerTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => { setLoading(true); setEntries(await listContentPlan()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => (statusFilter === "all" || e.status === statusFilter) && (!search || (e.hook ?? "").toLowerCase().includes(search.toLowerCase())));

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center sm:justify-between w-full">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Input placeholder="Search planner…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="ready">Ready to Post</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setAdding(true)} className="w-full sm:w-auto shrink-0 shadow-sm"><Plus className="w-4 h-4 mr-1" />Add Entry</Button>
      </div>
      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No entries yet. Generate a post and send it to the planner.</Card> :
        <>
        <div className="hidden md:block border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Hook</th>
                <th className="text-left px-3 py-2">Format</th>
                <th className="text-left px-3 py-2">Framework</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => setEditing(e)}>
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 text-xs">{e.scheduled_date || "—"}</td>
                  <td className="px-3 py-2 max-w-md"><div className="line-clamp-2">{e.hook}</div></td>
                  <td className="px-3 py-2"><Badge variant="outline">{e.format}</Badge></td>
                  <td className="px-3 py-2 text-xs">{e.framework || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={e.status === "posted" ? "default" : e.status === "ready" ? "secondary" : "outline"} className="capitalize">{e.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); deletePlanEntry(e.id).then(load); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden space-y-4">
          {filtered.map((e, i) => (
            <div
              key={e.id}
              onClick={() => setEditing(e)}
              className="p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-all space-y-3 cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="text-xs font-semibold text-muted-foreground"># {i + 1}</div>
                <Badge variant={e.status === "posted" ? "default" : (e.status === "ready" ? "secondary" : "outline")} className="capitalize">
                  {e.status}
                </Badge>
              </div>

              <p className="text-sm font-medium text-foreground line-clamp-2">{e.hook}</p>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{e.format}</Badge>
                {e.framework && <Badge variant="secondary" className="text-[10px]">{e.framework}</Badge>}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40" onClick={(ev) => ev.stopPropagation()}>
                <div>
                  <span className="opacity-70">Scheduled:</span>
                  <span className="ml-1 text-foreground">{e.scheduled_date || "Not scheduled"}</span>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePlanEntry(e.id).then(load)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        </>
      }
      {(editing || adding) && <PlanEntryDialog entry={editing} onClose={() => { setEditing(null); setAdding(false); load(); }} />}
    </section>
  );
}

function PlanEntryDialog({ entry, onClose }: { entry: any | null; onClose: () => void }) {
  const [hook, setHook] = useState(entry?.hook ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [format, setFormat] = useState(entry?.format ?? "insight");
  const [status, setStatus] = useState(entry?.status ?? "planned");
  const [date, setDate] = useState(entry?.scheduled_date ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{entry ? "Edit entry" : "New entry"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Hook</label><Input value={hook} onChange={(e) => setHook(e.target.value)} /></div>
          <div><label className="text-xs font-medium">Body</label><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium">Format</label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot-take">hot-take</SelectItem>
                  <SelectItem value="story">story</SelectItem>
                  <SelectItem value="framework">framework</SelectItem>
                  <SelectItem value="insight">insight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="ready">Ready to Post</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium">Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <Button className="w-full" disabled={!hook || busy} onClick={async () => {
            setBusy(true);
            try {
              if (entry) await updatePlanEntry(entry.id, { hook, body, format, status, scheduled_date: date || null });
              else await createPlanEntry({ hook, body, format, status, scheduled_date: date || undefined });
              toast.success("Saved"); onClose();
            } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
          }}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Settings tab ─────────
function SettingsTab() {
  const [s, setS] = useState<any>({
    custom_system_prompt: "",
    banned_words: [],
    preferred_provider: "openai",
    anthropic_model: "claude-sonnet-4-20250514",
    openai_model: "gpt-5-mini",
    default_word_limit: 150,
    voice_notes: "",
    about_me: "",
    career_summary: "",
    expertise: "",
    target_audience: "",
    goals: "",
    writing_samples: "",
    linkedin_url: "",
    profile_actor_id: "",
    reference_websites: [] as string[],
    reference_web_context: "",
    last_websites_enriched_at: null as string | null,
  });
  const [bannedInput, setBannedInput] = useState("");
  const [websitesInput, setWebsitesInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scrapingMe, setScrapingMe] = useState(false);
  const [refining, setRefining] = useState(false);
  const [enrichingSites, setEnrichingSites] = useState(false);

  useEffect(() => {
    getWriterSettings().then((data: any) => {
      if (data) {
        setS({ ...s, ...data });
        setBannedInput((data.banned_words || []).join(", "));
        setWebsitesInput(((data.reference_websites as string[] | null) || []).join("\n"));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await upsertWriterSettings({
        ...s,
        banned_words: bannedInput.split(",").map((x) => x.trim()).filter(Boolean),
      });
      toast.success("Settings saved");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  };

  const analyzeMe = async () => {
    if (!s.linkedin_url?.trim()) { toast.error("Add your LinkedIn URL first"); return; }
    // "Analyze my LinkedIn" runs on Linkup web search — no Apify actor needed.
    // (Only "Scrape my last 50 posts" uses Apify.)
    setAnalyzing(true);
    try {
      // Persist the URL first so the analyze function reads it.
      await upsertWriterSettings({ linkedin_url: s.linkedin_url });
      const { data, error } = await analyzeSelfProfile(s.linkedin_url, s.profile_actor_id);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      // Refresh local form with AI-generated fields
      const fresh = await getWriterSettings();
      if (fresh) { setS({ ...s, ...(fresh as any) }); setBannedInput(((fresh as any).banned_words || []).join(", ")); }
      const sc = (data as any)?.scraped;
      const found = sc ? `Found: ${[sc.fullName, sc.headline].filter(Boolean).join(" · ") || "profile"} (skills:${sc.skillsCount ?? 0}, roles:${sc.experiencesCount ?? 0})` : "voice updated";
      toast.success(`LinkedIn analyzed — ${found}`);
    } catch (e: any) { toast.error(e?.message ?? "Analysis failed"); } finally { setAnalyzing(false); }
  };

  const scrapeMe = async () => {
    setScrapingMe(true);
    try {
      const { data, error } = await scrapeMyLastPosts(50);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const n = (data as any)?.scraped ?? (data as any)?.results?.[0]?.posts ?? 0;
      // Refresh form — enrich-voice-from-posts has run inside scrapeMyLastPosts
      const fresh = await getWriterSettings();
      if (fresh) { setS({ ...s, ...(fresh as any) }); }
      toast.success(`Scraped ${n} posts — voice refined from real content`);
    } catch (e: any) { toast.error(e?.message ?? "Scrape failed"); } finally { setScrapingMe(false); }
  };

  const refineFromPosts = async () => {
    setRefining(true);
    try {
      const { data, error } = await enrichVoiceFromPosts();
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const fresh = await getWriterSettings();
      if (fresh) { setS({ ...s, ...(fresh as any) }); }
      const d = data as any;
      const parts = [`Voice refined from ${d?.used_posts ?? 0} posts`];
      if (d?.generated_system_prompt) parts.push("Writer system prompt regenerated");
      if (d?.frameworks_rewritten) parts.push(`${d.frameworks_rewritten}/7 framework prompts rewritten in your voice`);
      toast.success(parts.join(" • "));
    } catch (e: any) { toast.error(e?.message ?? "Refine failed"); } finally { setRefining(false); }
  };

  const enrichWebsites = async () => {
    const list = websitesInput.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) { toast.error("Add at least one website URL"); return; }
    setEnrichingSites(true);
    try {
      const { data, error } = await enrichFromWebsites(list);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const fresh = await getWriterSettings();
      if (fresh) {
        setS({ ...s, ...(fresh as any) });
        setWebsitesInput((((fresh as any).reference_websites as string[]) || []).join("\n"));
      }
      const d = data as any;
      toast.success(`Enriched from ${d?.sites_used ?? 0}/${d?.sites_processed ?? list.length} websites — context appended to every prompt`);
    } catch (e: any) { toast.error(e?.message ?? "Website enrichment failed"); } finally { setEnrichingSites(false); }
  };

  return (
    <section className="space-y-6 max-w-5xl">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" /><h2 className="font-medium">About Me & Voice</h2></div>
        <p className="text-xs text-muted-foreground">Teach the AI who you are. These fields are injected into every post the writer produces — so the more specific, the more it sounds like you.</p>

        <div>
          <label className="text-xs font-medium">About me (bio)</label>
          <Textarea value={s.about_me ?? ""} onChange={(e) => setS({ ...s, about_me: e.target.value })}
            placeholder="2–3 sentences in first person. Who are you, what do you do, what's your edge."
            className="min-h-[120px] resize-y"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>
        <div>
          <label className="text-xs font-medium">Career summary</label>
          <Textarea value={s.career_summary ?? ""} onChange={(e) => setS({ ...s, career_summary: e.target.value })}
            placeholder="Roles, companies, achievements, years of experience."
            className="min-h-[120px] resize-y"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Expertise / specialties</label>
            <Input value={s.expertise ?? ""} onChange={(e) => setS({ ...s, expertise: e.target.value })}
              placeholder="cold email, n8n, deliverability, B2B GTM…" />
          </div>
          <div>
            <label className="text-xs font-medium">Target audience</label>
            <Input value={s.target_audience ?? ""} onChange={(e) => setS({ ...s, target_audience: e.target.value })}
              placeholder="Founders & RevOps leaders at 10–200 person B2B SaaS" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">Goals (what success looks like)</label>
          <Textarea value={s.goals ?? ""} onChange={(e) => setS({ ...s, goals: e.target.value })}
            placeholder="e.g. Position myself as the go-to person for AI-driven cold outbound. Hit 10k followers in 12 months. Drive 3 inbound leads/week."
            className="min-h-[100px] resize-y"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>
        <div>
          <label className="text-xs font-medium">Writing samples (paste 1–3 of your best posts)</label>
          <Textarea value={s.writing_samples ?? ""} onChange={(e) => setS({ ...s, writing_samples: e.target.value })}
            placeholder="The AI will mimic the rhythm, length, and structure of these samples."
            className="min-h-[200px] resize-y"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center gap-2"><LinkIcon className="w-4 h-4 text-primary" /><h3 className="text-sm font-medium">Auto-fill from my LinkedIn (via Linkup web search)</h3></div>
          <p className="text-xs text-muted-foreground">Paste your LinkedIn URL. We use <strong>Linkup</strong> to deep-search the public web for your profile, company, experience and recent posts, then AI-summarize everything into the fields above.</p>
          <div>
            <label className="text-xs font-medium">My LinkedIn URL</label>
            <Input value={s.linkedin_url ?? ""} onChange={(e) => setS({ ...s, linkedin_url: e.target.value })}
              placeholder="https://www.linkedin.com/in/your-handle" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={analyzeMe} disabled={analyzing} variant="default">
              {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Analyze my LinkedIn
            </Button>
            <Button onClick={scrapeMe} disabled={scrapingMe} variant="secondary">
              {scrapingMe ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <History className="w-4 h-4 mr-2" />}
              Scrape my last 50 posts
            </Button>
            <Button onClick={refineFromPosts} disabled={refining} variant="outline">
              {refining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Refine voice from my posts
            </Button>
          </div>
          {s.last_self_analyzed_at && (
            <p className="text-[11px] text-muted-foreground">Last analyzed: {new Date(s.last_self_analyzed_at).toLocaleString()}</p>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2"><LinkIcon className="w-5 h-5 text-primary" /><h2 className="font-medium">Reference websites (competitors & topics)</h2></div>
        <p className="text-xs text-muted-foreground">
          Add websites of competitors, thought leaders, or publications relevant to your space. We use <strong>Linkup</strong> to deep-scrape each site, then AI-distill a competitive context block that gets appended to your Writer system prompt — so every post you generate is informed by what others in your space are saying. The more websites you add, the smarter your prompts get.
        </p>
        <Tabs defaultValue="sites" className="w-full">
          <TabsList>
            <TabsTrigger value="sites">Sites & Context</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="sites" className="space-y-4 pt-3">
            <div>
              <label className="text-xs font-medium">Website URLs (one per line, or comma-separated)</label>
              <Textarea value={websitesInput} onChange={(e) => setWebsitesInput(e.target.value)}
                placeholder={"https://competitor.com\nhttps://blog.thoughtleader.io\nhttps://industry-publication.com"}
                className="min-h-[140px] resize-y"
                style={{ fieldSizing: "content" } as React.CSSProperties} />
              <p className="text-[11px] text-muted-foreground mt-1">Up to 100 sites. Each enrichment runs a web search per URL.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={enrichWebsites} disabled={enrichingSites} variant="default">
                {enrichingSites ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Enrich from websites
              </Button>
              {s.last_websites_enriched_at && (
                <span className="text-[11px] text-muted-foreground self-center">Last enriched: {new Date(s.last_websites_enriched_at).toLocaleString()}</span>
              )}
            </div>
            {s.reference_web_context && (
              <div>
                <label className="text-xs font-medium">Distilled web context (appended to every prompt)</label>
                <Textarea
                  value={s.reference_web_context ?? ""}
                  onChange={(e) => setS({ ...s, reference_web_context: e.target.value })}
                  placeholder="Auto-generated after you click 'Enrich from websites'."
                  className="min-h-[200px] resize-y"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <p className="text-[11px] text-muted-foreground mt-1">You can edit this manually. It is injected into the Writer system prompt and used when rewriting framework prompts.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="history" className="pt-3">
            <WebsiteEnrichmentHistory refreshKey={enrichingSites ? "loading" : (s.last_websites_enriched_at || "init")} />
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-primary" /><h2 className="font-medium">Writer system prompt</h2></div>
        <p className="text-xs text-muted-foreground">Sets the voice for ALL 7 framework writers. The frameworks define structure; this defines persona. Leave blank for the default B2B operator voice.</p>
        <Textarea
          value={s.custom_system_prompt ?? ""}
          onChange={(e) => setS({ ...s, custom_system_prompt: e.target.value })}
          placeholder="ROLE: You are a B2B LinkedIn copywriter writing in the voice of a marketing automation practitioner. Short, punchy sentences. Zero corporate filler. You sound like a real operator sharing a real insight, not a content machine."
          className="min-h-[200px] resize-y"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <div>
          <label className="text-xs font-medium">Voice notes (appended to every prompt)</label>
          <Textarea value={s.voice_notes ?? ""} onChange={(e) => setS({ ...s, voice_notes: e.target.value })} placeholder="e.g. I run a 65-domain cold email infra and build n8n + Supabase dashboards."
            className="min-h-[120px] resize-y"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>
        <div>
          <label className="text-xs font-medium">Banned words (comma separated)</label>
          <Input value={bannedInput} onChange={(e) => setBannedInput(e.target.value)} placeholder="leverage, synergy, unleash, game-changer" />
        </div>
        <div>
          <label className="text-xs font-medium">Default word limit</label>
          <Input type="number" min={50} max={300} value={s.default_word_limit ?? 150} onChange={(e) => setS({ ...s, default_word_limit: Number(e.target.value) })} className="max-w-[120px]" />
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><h2 className="font-medium">Image style prompt</h2></div>
        <p className="text-xs text-muted-foreground">
          Describe the visual style you want for AI-generated post images. This is auto-prepended to every image prompt when you click <strong>Generate image</strong> on a planned post (OpenAI <code>gpt-image-1</code>).
        </p>
        <Textarea
          value={s.image_style_prompt ?? ""}
          onChange={(e) => setS({ ...s, image_style_prompt: e.target.value })}
          placeholder={"e.g. Editorial flat illustration. Muted palette of deep green (#0F6E56), cream and charcoal. Soft geometric shapes, subtle grain, generous negative space. No text, no logos. Confident, modern, B2B-friendly."}
          className="min-h-[150px] resize-y"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
      </Card>

      <Card className="p-4 space-y-1 bg-muted/30">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><h2 className="font-medium text-sm">AI provider</h2></div>
        <p className="text-xs text-muted-foreground">Your AI keys & models now live in one universal place: <strong>Settings → AI API</strong>. They power every AI feature across Syncvida.</p>
      </Card>

      <FrameworkPromptsEditor />

      <CommentTonesEditor />

      <ScrapeMemoryPanel />

      <Button onClick={save} disabled={busy} className="w-full md:w-auto">{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save settings</Button>
    </section>
  );
}

// ───────── Scraped-post memory editor (Settings) ─────────
function ScrapeMemoryPanel() {
  const [rows, setRows] = useState<ScrapeMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const load = async () => { setLoading(true); try { setRows(await listScrapeMemory()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const visible = rows.filter((r) => filter === "all" || r.signal === filter);
  const toggle = async (r: ScrapeMemoryRow) => { await updateScrapeMemory(r.id, { active: !r.active }); load(); };
  const remove = async (r: ScrapeMemoryRow) => { if (!confirm("Delete this memory entry?")) return; await deleteScrapeMemory(r.id); load(); };
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /><h2 className="font-medium">Scraped-post memory</h2></div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All signals</SelectItem>
              <SelectItem value="positive">👍 Relevant</SelectItem>
              <SelectItem value="negative">👎 Not relevant</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Every time you like, ignore, or delete-as-irrelevant a scraped post, your reason is saved here.
        The relevance scorer reads this memory to keep getting smarter about what you actually want to see.
        Toggle off any rule that's no longer accurate.
      </p>
      {loading ? <p className="text-xs text-muted-foreground">Loading…</p> :
        visible.length === 0 ? <p className="text-xs text-muted-foreground py-3">No memory yet. Use the 👍 / ✕ / 🗑 buttons on scraped posts to teach the AI.</p> :
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {visible.map((r) => (
            <div key={r.id} className={`flex items-start gap-3 p-3 rounded-md border ${r.active ? "border-border" : "border-border/40 opacity-60"}`}>
              <div className={`shrink-0 mt-0.5 ${r.signal === "positive" ? "text-emerald-500" : "text-rose-500"}`}>
                {r.signal === "positive" ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.map((t, i) => (
                      <Badge key={i} variant="outline" className={`text-[10px] py-0 h-4.5 ${r.signal === "positive" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-500 border-rose-500/30"}`}>{t}</Badge>
                    ))}
                  </div>
                )}
                {r.reason && <p className="text-xs text-foreground/90">{r.reason}</p>}
                <p className="text-[10px] text-muted-foreground">
                  {r.source} · {new Date(r.created_at).toLocaleDateString()}
                  {r.source_post_author ? <> · re: <span className="font-medium">{r.source_post_author}</span></> : null}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(r)} title="Delete"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      }
    </Card>
  );
}

// ───────── Apify accounts pool (rotating fallback + health bar) ─────────
function ApifyAccountsPanel() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [actor, setActor] = useState("");
  const [budget, setBudget] = useState(5);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthId, setHealthId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState<string>("");

  const load = async () => { setLoading(true); setAccounts(await listApifyAccounts()); setLoading(false); };

  // Check each account's REAL Apify usage/limit via its token (no password needed).
  const verify = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-apify-accounts", { body: {} });
      if (error) throw error;
      const r = data as any;
      if (r?.approval_url) setApprovalUrl(r.approval_url);
      const list = (r?.accounts ?? []) as any[];
      const withCredit = list.filter((a) => a.ok).length;
      const detail = list.map((a) => `${a.label}: ${a.remainingUsd != null ? `$${Number(a.remainingUsd).toFixed(2)} left` : a.status}`).join(" · ");
      toast.success(`Checked ${list.length} account(s) · ${withCredit} have credit`, { description: detail.slice(0, 180) });
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Verify failed"); }
    finally { setVerifying(false); }
  };
  useEffect(() => { load(); }, []);

  // Pool totals: use REAL Apify numbers once verified, else our local estimate.
  const anyVerified = accounts.some((a) => a.apify_limit_usd != null);
  const totalBudget = accounts.reduce((s, a) => s + Number(a.apify_limit_usd ?? a.monthly_budget_usd ?? 5), 0);
  const totalRemaining = accounts.reduce((s, a) => s + (a.apify_limit_usd != null ? Math.max(0, Number(a.apify_limit_usd) - Number(a.apify_usage_usd || 0)) : computeAccountHealth(a).remaining), 0);
  const totalPct = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;
  const maxPostsPerMonth = Math.floor((totalRemaining / 0.5) * 10);

  // Pyramid order: most real credit on top (used first), drained at the bottom.
  const realRemainingOf = (a: any) => a.apify_limit_usd != null
    ? Math.max(0, Number(a.apify_limit_usd) - Number(a.apify_usage_usd || 0))
    : computeAccountHealth(a).remaining;
  const sortedAccounts = [...accounts].sort((a, b) => realRemainingOf(b) - realRemainingOf(a));

  const add = async () => {
    if (!label.trim() || !token.trim()) { toast.error("Label and token required"); return; }
    setBusy(true);
    try {
      const actorId = parseApifyActorId(actor);
      await createApifyAccount({ label: label.trim(), api_token: token.trim(), actor_id: actorId || undefined, monthly_budget_usd: budget });
      toast.success("Apify account added");
      setLabel(""); setToken(""); setActor(""); setBudget(5); setShowAdd(false);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  };

  const test = async (id: string, mode: "health" | "run" = "run") => {
    mode === "health" ? setHealthId(id) : setTestingId(id);
    try {
      const { data, error } = await testApifyAccount(id, mode);
      if (error || !data?.ok) {
        toast.error(`${mode === "health" ? "Health check" : "Test run"} failed: ${data?.error ?? error?.message ?? data?.status ?? "unknown"}`);
      } else {
        const url = data.info?.run_url;
        toast.success(mode === "health" ? `Token works · ${data.info?.username ?? "account"}` : `Test run finished · ${data.info?.item_count ?? 0} result(s)`);
        if (url) window.open(url, "_blank");
      }
      await load();
    } finally { mode === "health" ? setHealthId(null) : setTestingId(null); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this Apify account?")) return;
    await deleteApifyAccount(id); await load();
  };

  const resetPeriod = async (id: string) => {
    await updateApifyAccount(id, { period_start: new Date().toISOString().slice(0, 10), posts_used_this_period: 0 });
    await load();
  };

  const retryAccount = async (id: string) => {
    setRetryingId(id);
    try {
      // Find the most recent failed run for this account → replay against the same profile.
      const runs = await listScrapeRuns({ account_id: id, limit: 10 });
      const failed = runs.find((r: any) => r.status !== "success");
      const target = failed ?? runs[0];
      if (!target?.profile_id) {
        toast.error("No prior runs to retry. Run a profile first.");
        return;
      }
      const { error, data } = await retryWithAccount(target.profile_id, id);
      if (error) toast.error(error.message || "Retry failed");
      else {
        const r = (data as any)?.results?.[0];
        toast[r?.status === "success" ? "success" : "error"](
          r?.status === "success" ? `Retry OK · ${(data as any)?.scraped ?? 0} posts via ${r?.account}` : `Retry failed: ${r?.error ?? "unknown"}`
        );
      }
      await load();
    } finally { setRetryingId(null); }
  };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setEditDraft({
      label: a.label ?? "",
      api_token: a.api_token ?? "",
      actor_id: a.actor_id ?? "",
      monthly_budget_usd: Number(a.monthly_budget_usd ?? 5),
    });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateApifyAccount(editingId, {
        label: editDraft.label?.trim() || "Account",
        api_token: editDraft.api_token?.trim(),
        actor_id: parseApifyActorId(editDraft.actor_id || "") || null,
        monthly_budget_usd: Number(editDraft.monthly_budget_usd) || 5,
      });
      toast.success("Account updated");
      setEditingId(null); setEditDraft({});
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><LinkIcon className="w-5 h-5 text-primary" /><h2 className="font-medium">Apify account pool</h2></div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={verify} disabled={verifying} title="Read each account's real Apify usage + limit via its token">
            {verifying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Verify accounts
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}><Plus className="w-4 h-4 mr-1" />Add account</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Add up to 10 Apify tokens. LinkedIn scraping and YouTube transcript fetching rotate through this pool, trying the next account when one hits an Apify usage limit. Each account = $5 / 30 days (rolling). 10 posts cost ~$0.50.</p>

      {/* One-time actor approval — the #1 reason scraping fails on a fresh account. */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
        <div className="font-medium text-amber-700 dark:text-amber-400">⚠ One-time setup: approve the scraper actor for each account</div>
        <p className="text-muted-foreground">The built-in LinkedIn actor needs its permissions approved once per Apify account before it can run. Log into each Apify account, open the link below, and click <strong>Approve</strong>. Then scraping works.</p>
        <a href={approvalUrl || "https://console.apify.com/actors/94SdiE9JwTx0RNyfS?approvePermissions=true"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline font-medium">Open actor approval page <ArrowUpRight className="w-3 h-3" /></a>
      </div>

      {/* Health bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Pool health {anyVerified && <span className="text-[10px] font-normal text-emerald-600">· live from Apify</span>}</span>
          <span className="text-muted-foreground">${totalRemaining.toFixed(2)} / ${totalBudget.toFixed(2)} real credit · ~{maxPostsPerMonth} posts left</span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${totalPct < 15 ? "bg-destructive" : totalPct < 40 ? "bg-amber-500" : "bg-gradient-to-r from-primary to-primary/60"}`}
            style={{ width: `${Math.min(100, totalPct)}%` }}
          />
        </div>
      </div>

      {showAdd && (
        <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><label className="text-xs font-medium">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Apify #1 (gmail-1)" /></div>
            <div><label className="text-xs font-medium">Monthly budget (USD)</label><Input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></div>
          </div>
          <div>
            <label className="text-xs font-medium">Apify API token</label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="apify_api_xxx" />
            <p className="text-[11px] text-muted-foreground mt-1">That's all you need — the scraper actors are built in. <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline">Get your token</a>.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={add} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Add</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No accounts yet. Add one to power the rotating pool. Until then, the scraper falls back to the project-level <code>APIFY_API_TOKEN</code> secret.</div>
      ) : (
        <div className="space-y-2">
          {sortedAccounts.map((a) => {
            const h = computeAccountHealth(a);
            // Real Apify numbers (from "Verify accounts") override our local estimate.
            const hasReal = a.apify_limit_usd != null;
            const realRemaining = hasReal ? Math.max(0, Number(a.apify_limit_usd) - Number(a.apify_usage_usd || 0)) : null;
            const isEditing = editingId === a.id;
            return (
              <div key={a.id} className="rounded-md border border-border p-3 space-y-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div><label className="text-xs font-medium">Label</label><Input value={editDraft.label} onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })} /></div>
                      <div><label className="text-xs font-medium">Monthly budget (USD)</label><Input type="number" min={1} value={editDraft.monthly_budget_usd} onChange={(e) => setEditDraft({ ...editDraft, monthly_budget_usd: Number(e.target.value) })} /></div>
                    </div>
                    <div><label className="text-xs font-medium">Apify API token</label><Input value={editDraft.api_token} onChange={(e) => setEditDraft({ ...editDraft, api_token: e.target.value })} placeholder="apify_api_xxx" /></div>
                    <div>
                      <label className="text-xs font-medium">Actor URL or ID</label>
                      <Input value={editDraft.actor_id} onChange={(e) => setEditDraft({ ...editDraft, actor_id: e.target.value })} placeholder="https://console.apify.com/actors/<id>/ or blank" />
                      {editDraft.actor_id && <p className="text-xs text-muted-foreground mt-1">Will use actor: <code>{parseApifyActorId(editDraft.actor_id)}</code></p>}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditDraft({}); }}><X className="w-3 h-3 mr-1" />Cancel</Button>
                      <Button size="sm" onClick={saveEdit}><Check className="w-3 h-3 mr-1" />Save</Button>
                    </div>
                  </div>
                ) : (<>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.label}</span>
                    <Badge variant={(realRemaining ?? h.remaining) > 0 ? "secondary" : "destructive"}>
                      ${(realRemaining ?? h.remaining).toFixed(2)} left{hasReal ? " · live" : ""}
                    </Badge>
                    <Badge variant="outline">{h.daysLeft}d left in period</Badge>
                    {/out of credit|usage|402/i.test(a.last_test_status || "") ? (
                      <Badge variant="destructive" className="gap-1">⚠ Credits out</Badge>
                    ) : a.last_test_status ? (
                      <Badge variant={a.last_test_status === "ok" || a.last_test_status === "health ok" ? "secondary" : "destructive"}>test: {a.last_test_status}</Badge>
                    ) : null}
                    {a.actor_id && <Badge variant="outline" className="font-mono text-[10px]">{a.actor_id}</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => test(a.id, "health")} disabled={healthId === a.id} title="Validate this Apify token">
                      {healthId === a.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}Test token
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => retryAccount(a.id)} disabled={retryingId === a.id} title="Retry last failed profile through this account">
                      {retryingId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-primary" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(a)} title="Edit">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resetPeriod(a.id)} title="Reset 30-day period">
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${/out of credit|usage|402/i.test(a.last_test_status || "") ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${/out of credit|usage|402/i.test(a.last_test_status || "") ? 100 : (hasReal && Number(a.apify_limit_usd) > 0 ? Math.min(100, (Number(a.apify_usage_usd || 0) / Number(a.apify_limit_usd)) * 100) : Math.min(100, h.pct))}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                  {hasReal ? (
                    <span className="text-foreground font-medium">Apify (live): ${Number(a.apify_usage_usd || 0).toFixed(2)} / ${Number(a.apify_limit_usd).toFixed(2)} used</span>
                  ) : (
                    <span>Used {a.posts_used_this_period ?? 0} posts (~${h.cost.toFixed(2)})</span>
                  )}
                  {a.apify_cycle_end && <span>Credit renews {new Date(a.apify_cycle_end).toLocaleDateString()}</span>}
                  {a.apify_checked_at && <span>Checked {new Date(a.apify_checked_at).toLocaleString()}</span>}
                  {!hasReal && <span>Budget ${Number(a.monthly_budget_usd ?? 5).toFixed(2)}/30d</span>}
                  <span>Period since {new Date(a.period_start).toLocaleDateString()}</span>
                  {a.last_used_at && <span>Last used {new Date(a.last_used_at).toLocaleString()}</span>}
                </div>
                </>)}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ───────── Scrape history (per-account run log + run details) ─────────
function ScrapeHistoryPanel() {
  const [runs, setRuns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const load = async () => {
    setLoading(true);
    const [r, a, p] = await Promise.all([
      // Cap the fetch so a long history never loads everything at once.
      listScrapeRuns({ limit: 250, ...(filterAccount !== "all" ? { account_id: filterAccount } : {}) }),
      listApifyAccounts(),
      listSocialProfiles(),
    ]);
    setRuns(r); setAccounts(a); setProfiles(p); setPage(1); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterAccount]);

  const accLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? "—";
  const profLabel = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.display_name || p?.username || "—";
  };

  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const pageRuns = runs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><History className="w-5 h-5 text-primary" /><h2 className="font-medium">Scrape history</h2></div>
        <div className="flex items-center gap-2">
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Every scrape attempt is logged with the chosen Apify account, actor input, polling steps, response excerpt and zero-post reason.</p>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
        runs.length === 0 ? <div className="text-sm text-muted-foreground italic">No scrape runs yet.</div> :
        <div className="border border-border rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase tracking-wide">
              <tr>
                <th className="text-left px-2 py-2">When</th>
                <th className="text-left px-2 py-2">Profile</th>
                <th className="text-left px-2 py-2">Account</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-left px-2 py-2">Posts</th>
                <th className="text-left px-2 py-2">Cost</th>
                <th className="text-left px-2 py-2">Notes</th>
                <th className="text-right px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pageRuns.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.ran_at).toLocaleString()}</td>
                  <td className="px-2 py-1.5">{profLabel(r.profile_id)}</td>
                  <td className="px-2 py-1.5">{accLabel(r.apify_account_id)} {r.forced_rotation && <Badge variant="outline" className="ml-1 text-[9px]">rotated</Badge>}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={r.status === "success" ? "secondary" : "destructive"}>{r.status}</Badge>
                  </td>
                  <td className="px-2 py-1.5">{r.posts_fetched ?? 0}</td>
                  <td className="px-2 py-1.5">${Number(r.cost_usd ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1.5 max-w-[260px] truncate" title={r.error || r.zero_post_reason || ""}>
                    {r.error || r.zero_post_reason || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpenRun(r)}><Eye className="w-3 h-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }

      {!loading && runs.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, runs.length)} of {runs.length} runs
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">Page {page} / {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!openRun} onOpenChange={(v) => !v && setOpenRun(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {openRun && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> Run details</DialogTitle></DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Profile" value={profLabel(openRun.profile_id)} />
                  <Field label="Account" value={accLabel(openRun.apify_account_id)} />
                  <Field label="Status" value={openRun.status} />
                  <Field label="Posts fetched" value={String(openRun.posts_fetched ?? 0)} />
                  <Field label="Cost" value={`$${Number(openRun.cost_usd ?? 0).toFixed(2)}`} />
                  <Field label="Actor ID" value={openRun.actor_id || "—"} mono />
                  <Field label="Started" value={openRun.started_at ? new Date(openRun.started_at).toLocaleString() : "—"} />
                  <Field label="Duration" value={openRun.duration_ms != null ? `${openRun.duration_ms} ms` : "—"} />
                </div>
                {openRun.run_url && <a href={openRun.run_url} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline inline-flex items-center gap-1">Open in Apify console <ArrowUpRight className="w-3 h-3" /></a>}
                {openRun.zero_post_reason && (
                  <div>
                    <div className="text-xs font-medium mb-1">Zero-post reason</div>
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">{openRun.zero_post_reason}</div>
                  </div>
                )}
                {openRun.error && (
                  <div>
                    <div className="text-xs font-medium mb-1">Error</div>
                    <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap">{openRun.error}</pre>
                  </div>
                )}
                <div>
                  <div className="text-xs font-medium mb-1">Actor input</div>
                  <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-48">{JSON.stringify(openRun.actor_input ?? {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Polling steps</div>
                  <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-48">{JSON.stringify(openRun.polling_steps ?? [], null, 2)}</pre>
                </div>
                {openRun.response_excerpt && (
                  <div>
                    <div className="text-xs font-medium mb-1">API response excerpt</div>
                    <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap">{openRun.response_excerpt}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────── Apify credit health (combined month-to-date usage) ─────────
function ApifyCreditBar() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setAccounts(await listApifyAccounts().catch(() => [])); setLoading(false); })(); }, []);

  const totalBudget = accounts.reduce((s, a) => s + Number(a.monthly_budget_usd ?? 5), 0);
  const used = accounts.reduce((s, a) => s + (Number(a.posts_used_this_period ?? 0) / 10) * Number(a.cost_per_10_posts_usd ?? 0.5), 0);
  const remaining = Math.max(0, totalBudget - used);
  const pct = totalBudget > 0 ? Math.min(100, (used / totalBudget) * 100) : 0;
  const postsLeft = Math.round(remaining / 0.05);
  const activeCount = accounts.filter((a) => a.active).length;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /><h2 className="font-medium">Apify credit health</h2></div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {loading ? "…" : <>${used.toFixed(2)} / ${totalBudget.toFixed(2)} used · ~{postsLeft.toLocaleString()} posts left · {accounts.length} account{accounts.length !== 1 ? "s" : ""} ({activeCount} active)</>}
        </div>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct > 85 ? "bg-destructive" : pct > 60 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">Each account is ~$5 / 30 days (rolling). Scraping + transcripts rotate across active accounts; this is the combined month-to-date spend.</p>
    </Card>
  );
}

// ───────── Apify settings (accounts + actors + run history) ─────────
export function ApifyTab() {
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2"><LinkIcon className="w-5 h-5 text-primary" /><h2 className="font-medium">Apify</h2></div>
        <p className="text-xs text-muted-foreground">Your Apify API accounts (rotating pool), the scraper actors per platform, and the full history of every run. LinkedIn scraping and YouTube transcripts run through these.</p>
        <Badge variant="secondary">Daily cron at 06:00 UTC for active profiles</Badge>
      </Card>
      <ApifyCreditBar />
      <ApifyAccountsPanel />
      <ApifyActorsPanel />
      <ScrapeHistoryPanel />
    </div>
  );
}

// ───────── Manage Lists Dialog ─────────
function ManageListsDialog({
  open, onClose, lists, counts, onChanged, onPickList,
}: {
  open: boolean;
  onClose: () => void;
  lists: string[];
  counts: Map<string, number>;
  onChanged: () => void;
  onPickList: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function doRename(oldName: string) {
    const next = renameValue.trim();
    if (!next || next === oldName) { setRenaming(null); return; }
    setBusy(true);
    try {
      await renameProfileList(oldName, next);
      toast.success(`Renamed to "${next}"`);
      setRenaming(null);
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Rename failed"); }
    finally { setBusy(false); }
  }
  async function doDelete(name: string) {
    if (!confirm(`Delete list "${name}"? Profiles stay, but the list label will be removed from them.`)) return;
    setBusy(true);
    try {
      const n = await deleteProfileList(name);
      toast.success(`Removed "${name}" from ${n} profile${n === 1 ? "" : "s"}`);
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Manage lists</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Lists let you group tracked profiles (e.g. <em>Clay</em>, <em>Founders</em>, <em>GTM</em>). Add profiles to a list from the bulk action bar after selecting them.
        </p>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {lists.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No lists yet. Select some profiles in the table, then use the “New list…” field in the bulk action bar to create one.
            </p>
          )}
          {lists.map((name) => (
            <div key={name} className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {renaming === name ? (
                <Input
                  autoFocus value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doRename(name); if (e.key === "Escape") setRenaming(null); }}
                  className="h-7 text-xs flex-1"
                />
              ) : (
                <button
                  type="button"
                  className="text-sm font-medium flex-1 text-left truncate hover:text-primary"
                  onClick={() => onPickList(name)}
                  title="Filter by this list"
                >
                  {name}
                </button>
              )}
              <span className="text-[10px] text-muted-foreground tabular-nums">{counts.get(name) ?? 0}</span>
              {renaming === name ? (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => doRename(name)} title="Save"><Check className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => setRenaming(null)} title="Cancel"><X className="w-3.5 h-3.5" /></Button>
                </>
              ) : (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => { setRenaming(name); setRenameValue(name); }} title="Rename"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" disabled={busy} onClick={() => doDelete(name)} title="Delete list"><Trash2 className="w-3.5 h-3.5" /></Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WebsiteEnrichmentHistory({ refreshKey }: { refreshKey: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listWebsiteEnrichments().then((r) => { setRows(r); setLoading(false); });
  }, [refreshKey]);

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading history…</div>;
  if (!rows.length) return <p className="text-xs text-muted-foreground">No enrichments yet. Run "Enrich from websites" to build your first history entry.</p>;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Each run captures what Linkup pulled from your sites and the distilled context that was appended to your Writer system prompt and framework prompts.</p>
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="border rounded-md">
            <button onClick={() => setOpen(isOpen ? null : r.id)} className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40">
              <div>
                <div className="text-sm font-medium">{new Date(r.created_at).toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">{r.sites_used}/{r.sites_processed} sites used · context {r.reference_web_context?.length ?? 0} chars</div>
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
            {isOpen && (
              <div className="p-3 border-t space-y-3 bg-muted/20">
                <div>
                  <div className="text-xs font-medium mb-1">Sites scraped</div>
                  <div className="flex flex-wrap gap-1">
                    {(r.websites || []).map((u: string) => (
                      <Badge key={u} variant="secondary" className="text-[10px]">{u.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Badge>
                    ))}
                  </div>
                </div>
                {r.reference_web_context && (
                  <div>
                    <div className="text-xs font-medium mb-1">Distilled context (appended to your Writer prompt)</div>
                    <pre className="text-[11px] whitespace-pre-wrap p-2 bg-background rounded border max-h-60 overflow-auto">{r.reference_web_context}</pre>
                  </div>
                )}
                {Array.isArray(r.per_site) && r.per_site.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1">Per-site Linkup answers</div>
                    <div className="space-y-2 max-h-80 overflow-auto">
                      {r.per_site.map((p: any, i: number) => (
                        <details key={i} className="border rounded p-2 bg-background">
                          <summary className="text-xs cursor-pointer font-medium">{p.url}</summary>
                          <pre className="text-[11px] whitespace-pre-wrap mt-2 text-muted-foreground">{p.answer || "(no answer)"}</pre>
                          {Array.isArray(p.sources) && p.sources.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {p.sources.map((src: any, j: number) => (
                                <a key={j} href={src.url} target="_blank" rel="noreferrer" className="block text-[11px] text-primary truncate">↳ {src.name || src.url}</a>
                              ))}
                            </div>
                          )}
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{value}</div>
    </div>
  );
}

// ───────── Profile post-history button + dialog ─────────
function ProfileHistoryButton({ profile }: { profile: any }) {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listPostsForProfile(profile.id).then((p) => { setPosts(p); setLoading(false); });
  }, [open, profile.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="View all-time scraped post history for this profile">
          <History className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scraped post history · {profile.display_name || profile.username}</DialogTitle>
        </DialogHeader>
        {loading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> :
          posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts scraped yet.</p> :
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{posts.length} posts on file. The full history is kept and used for Hot Topics, voice learning, and prompt suggestions.</p>
            {posts.map((p) => (
              <Card key={p.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : "—"}</span>
                  <span>👍 {p.likes ?? 0} · 💬 {p.comments ?? 0} · 🔁 {p.shares ?? 0}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap line-clamp-6">{p.post_text}</p>
                {p.post_url && <button type="button" onClick={() => copyLinkedInUrl(p.post_url)} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">Copy LinkedIn link <Copy className="w-3 h-3" /></button>}
              </Card>
            ))}
          </div>
        }
      </DialogContent>
    </Dialog>
  );
}

// ───────── Editable framework prompts (with AI suggest from network) ─────────
function FrameworkPromptsEditor() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ improved_prompt?: string; change_summary?: string; sample_size?: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await listFrameworkPrompts()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load prompts"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const open = (id: string) => {
    const it = items.find((i) => i.id === id);
    setOpenId(id);
    setDraft(it?.custom_prompt ?? it?.default_prompt ?? "");
    setSuggestion(null);
  };

  const save = async () => {
    if (!openId) return;
    setSaving(true);
    const { error } = await saveFrameworkPrompt(openId, draft);
    setSaving(false);
    if (error) toast.error(error.message || "Save failed");
    else { toast.success("Prompt saved"); setOpenId(null); load(); }
  };

  const reset = async () => {
    if (!openId) return;
    if (!confirm("Revert to the default prompt for this framework?")) return;
    setSaving(true);
    const { error } = await saveFrameworkPrompt(openId, "");
    setSaving(false);
    if (error) toast.error(error.message || "Reset failed");
    else { toast.success("Reverted to default"); setOpenId(null); load(); }
  };

  const suggest = async () => {
    if (!openId) return;
    setSuggesting(true); setSuggestion(null);
    const { data, error } = await suggestFrameworkPromptImprovement(openId);
    setSuggesting(false);
    if (error) { toast.error(error.message || "Suggestion failed"); return; }
    const d = data as any;
    if (!d?.improved_prompt) { toast.error("No suggestion returned"); return; }
    setSuggestion(d);
  };

  const applySuggestion = () => {
    if (suggestion?.improved_prompt) { setDraft(suggestion.improved_prompt); setSuggestion(null); toast.success("Suggestion applied — review and Save."); }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-primary" /><h2 className="font-medium">Framework prompts (per writer style)</h2></div>
      <p className="text-xs text-muted-foreground">
        These are the system prompts each LinkedIn framework uses to write your post. Edit any of them, or click <em>Suggest improvement from my network</em> and the AI will rewrite the template based on the highest-engagement posts in your scraped history. Use <code>{"{{idea}} {{significance}} {{data}} {{description}} {{implications}} {{banned}} {{wordLimit}}"}</code> as placeholders.
      </p>

      {loading ? <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> :
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map((it) => (
            <button key={it.id} onClick={() => open(it.id)} className="text-left border border-border rounded p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{it.name}</span>
                {it.is_custom ? <Badge className="text-[10px]">Custom</Badge> : <Badge variant="secondary" className="text-[10px]">Default</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{it.description}</p>
            </button>
          ))}
        </div>
      }

      <Dialog open={!!openId} onOpenChange={(v) => { if (!v) { setOpenId(null); setSuggestion(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{items.find((i) => i.id === openId)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}Save</Button>
              <Button variant="outline" onClick={suggest} disabled={suggesting}>
                {suggesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Suggest improvement from my network
              </Button>
              <Button variant="ghost" onClick={reset} disabled={saving}>Reset to default</Button>
            </div>

            {suggestion?.improved_prompt && (
              <Card className="p-3 space-y-2 border-primary/40">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium flex items-center gap-2"><Sparkles className="w-3 h-3" /> AI suggestion (from {suggestion.sample_size} top posts in your network)</div>
                  <Button size="sm" onClick={applySuggestion}>Apply to editor</Button>
                </div>
                {suggestion.change_summary && <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{suggestion.change_summary}</pre>}
                <details>
                  <summary className="text-xs cursor-pointer text-primary">Preview improved prompt</summary>
                  <pre className="text-xs whitespace-pre-wrap mt-2 p-2 bg-muted/40 rounded">{suggestion.improved_prompt}</pre>
                </details>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────── Editable comment tones (used in Engagement Feed Smart Reply) ─────────
function CommentTonesEditor() {
  const [tones, setTones] = useState<CommentTone[]>([]);
  const [defaults, setDefaults] = useState<CommentTone[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listCommentTones();
      setTones(r.tones || []); setDefaults(r.defaults || []); setIsCustom(!!r.is_custom);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load tones"); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next: CommentTone[] | null) => {
    setSaving(true);
    try {
      await saveCommentTones(next);
      toast.success(next ? "Tones saved" : "Reverted to default tones");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(false); }
  };

  const updateTone = (id: string, patch: Partial<CommentTone>) => {
    setTones((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  };
  const addTone = () => {
    const id = `tone-${Date.now()}`;
    setTones((prev) => [...prev, { id, label: "New tone", description: "", prompt: "Tone: describe how the comment should feel..." }]);
    setOpenId(id);
  };
  const removeTone = (id: string) => {
    if (!confirm("Remove this tone?")) return;
    setTones((prev) => prev.filter((t) => t.id !== id));
  };
  const editing = tones.find((t) => t.id === openId);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" /><h2 className="font-medium">Comment tones (Engagement Feed)</h2></div>
        <div className="flex items-center gap-2">
          {isCustom ? <Badge>Custom</Badge> : <Badge variant="secondary">Defaults</Badge>}
          <Button size="sm" variant="outline" onClick={addTone}><Plus className="w-3.5 h-3.5 mr-1" /> Add tone</Button>
          <Button size="sm" onClick={() => persist(tones)} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Save tones
          </Button>
          {isCustom && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Revert to the default tones? Your custom tones will be lost.")) persist(null); }} disabled={saving}>
              Reset to defaults
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        These tones power <em>Smart Reply</em> in the Engagement Feed. Each one is combined with your <strong>About Me &amp; Voice</strong> so the generated comment still sounds like you. Click any tone to edit its label, description, or prompt instructions.
      </p>

      {loading ? <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> :
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {tones.map((t) => (
            <div key={t.id} className="border border-border rounded p-3 flex items-start justify-between gap-2 hover:bg-muted/30 transition-colors">
              <button onClick={() => setOpenId(t.id)} className="text-left flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{t.label}</div>
                {t.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>}
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeTone(t.id)} title="Remove tone">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {tones.length === 0 && <p className="text-xs text-muted-foreground col-span-2">No tones. Add one or reset to defaults.</p>}
        </div>
      }

      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit tone</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Label</label>
                  <Input value={editing.label} onChange={(e) => updateTone(editing.id, { label: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Short description</label>
                  <Input value={editing.description ?? ""} onChange={(e) => updateTone(editing.id, { description: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Prompt instructions (sent to the AI on top of your About Me &amp; Voice)</label>
                <Textarea rows={10} value={editing.prompt} onChange={(e) => updateTone(editing.id, { prompt: e.target.value })} className="font-mono text-xs" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpenId(null)}>Close</Button>
                <Button onClick={() => { setOpenId(null); toast.message("Click Save tones to persist your changes."); }}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
