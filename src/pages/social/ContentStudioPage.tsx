import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Search, Plus, Trash2, Pencil, Globe, Lightbulb, Combine, Send, Loader2, ExternalLink, Filter, Check, Settings2, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, X, Calendar } from "lucide-react";
import {
  listContentCategories, createContentCategory, deleteContentCategory,
  listContentItems, createContentItem, updateContentItem, deleteContentItem,
  seedContentLibrary, contentStudioAI, listContentChatMessages, pushIdeasToPlanner,
  updateContentCategory, bulkUpdateContentItems, bulkDeleteContentItems,
  createPlannerPost, PLANNER_PLATFORMS,
} from "@/lib/social-queries";
import { isSeedUser } from "@/lib/linkedin-review";

type Cat = { id: string; name: string; slug: string; color?: string };
type Item = {
  id: string; category_id: string | null; category_name: string | null;
  title: string; level: string | null; duration: string | null; source_url: string | null;
  key_topics: string | null; course_name: string | null; course_description: string | null;
  lesson_number: number | null; creator: string | null; published_label: string | null;
  target_platforms: string[] | null; status: string; item_type: string; origin: string;
  notes: string | null; created_at?: string;
};
type ChatMsg = { id: string; role: string; content: string; action_kind: string | null; payload: any };

const PLATFORMS = ["youtube", "linkedin", "instagram", "facebook"] as const;
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const STATUSES = ["idea", "in_progress", "scripted", "published"];
const PAGE_SIZE = 25;

type SortKey = "title" | "category_name" | "level" | "duration" | "status" | "created_at";
type SortDir = "asc" | "desc";

export default function ContentStudioPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [originFilter, setOriginFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // chat
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // edit modal
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingCats, setManagingCats] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [planning, setPlanning] = useState<Item | null>(null);

  // sort + pagination
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  async function refresh() {
    setLoading(true);
    const [c, i, m] = await Promise.all([listContentCategories(), listContentItems({}), listContentChatMessages(40)]);
    setCats(c as Cat[]); setItems(i as Item[]); setChat(m as ChatMsg[]);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);
  // The starter library is the app author's personal GTM catalog, so it must NOT
  // be auto-imported into every user's Studio. New users start empty and add
  // their own content (manually or via the AI). The "Seed starter library"
  // button is shown only to the author.
  const [canSeed, setCanSeed] = useState(false);
  useEffect(() => { void isSeedUser().then(setCanSeed).catch(() => setCanSeed(false)); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  async function handleSeed(force = false) {
    const t = toast.loading(force ? "Re-seeding library…" : "Seeding 557 lessons from your catalog…");
    try {
      const { data, error } = await seedContentLibrary(force);
      if (error) throw error;
      toast.success((data as any)?.skipped ? "Library already populated." : `Imported ${(data as any)?.items ?? 0} items.`, { id: t });
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Seed failed", { id: t });
    }
  }

  const filtered = useMemo(() => {
    const out = items.filter((i) => {
      if (activeCat && i.category_id !== activeCat) return false;
      if (levelFilter && i.level !== levelFilter) return false;
      if (platformFilter && !(i.target_platforms ?? []).includes(platformFilter)) return false;
      if (originFilter === "brainstorm" && i.origin !== "ai") return false;
      if (originFilter === "web_search" && i.origin !== "web_search") return false;
      if (originFilter === "manual" && !["manual", "seed"].includes(i.origin)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${i.title} ${i.key_topics ?? ""} ${i.course_name ?? ""} ${i.creator ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return out;
  }, [items, activeCat, levelFilter, platformFilter, originFilter, search, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [activeCat, levelFilter, platformFilter, originFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((i) => selected.has(i.id));
  function togglePageSelectAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allOnPageSelected) pageItems.forEach((i) => n.delete(i.id));
      else pageItems.forEach((i) => n.add(i.id));
      return n;
    });
  }
  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} item(s)?`)) return;
    await bulkDeleteContentItems(ids);
    toast.success(`Deleted ${ids.length} item(s).`);
    setSelected(new Set());
    refresh();
  }

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function runAI(action: "nl_filter" | "brainstorm" | "combine" | "web_search", message?: string) {
    setChatBusy(action);
    try {
      const body: any = { action, message: message ?? chatInput };
      if (action === "combine") body.item_ids = Array.from(selected);
      if (action === "web_search") body.query = message ?? chatInput;
      const { data, error } = await contentStudioAI(body);
      if (error) throw error;
      const p = (data as any)?.payload;
      if (action === "nl_filter" && p) {
        if (p.search !== undefined) setSearch(p.search ?? "");
        if (p.levels?.length) setLevelFilter(p.levels[0]);
        const matchCat = p.categories?.[0] && cats.find((c) => c.name.toLowerCase().includes((p.categories[0] as string).toLowerCase()));
        if (matchCat) setActiveCat(matchCat.id);
      }
      setChatInput("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "AI request failed");
    } finally {
      setChatBusy(null);
    }
  }

  async function ingestIdea(idea: any, sourceCatName?: string) {
    const cat = cats.find((c) => c.name === (idea.suggested_category || sourceCatName)) || cats[0];
    await createContentItem({
      category_id: cat?.id, category_name: cat?.name,
      title: idea.title, key_topics: idea.key_topics ?? idea.hook ?? null,
      source_url: idea.source_url ?? null, target_platforms: idea.target_platforms ?? [],
      item_type: "idea", origin: idea.source_url ? "web_search" : "ai", status: "idea",
    });
    toast.success(`Added "${idea.title}" to ${cat?.name ?? "library"}`);
    refresh();
  }

  async function pushSelectedToPlanner() {
    const picks = filtered.filter((f) => selected.has(f.id));
    if (!picks.length) return;
    await pushIdeasToPlanner(picks.map((p) => ({ title: p.title, hook: p.key_topics ?? "", key_topics: p.key_topics ?? "" })));
    toast.success(`Sent ${picks.length} to Content Planner.`);
    setSelected(new Set());
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Content Studio</h2>
          <p className="text-sm text-muted-foreground">Brainstorm, combine, and ship videos for YouTube, LinkedIn, Instagram & Facebook.</p>
        </div>
        <div className="flex gap-2">
          {canSeed && (cats.length === 0 || items.length === 0) && (
            <Button onClick={() => handleSeed(false)}><Sparkles className="w-4 h-4" /> Seed starter library</Button>
          )}
          <Button variant="outline" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New idea</Button>
        </div>
      </div>

      {/* AI chatbox */}
      <Card className="p-4 space-y-3 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="w-4 h-4 text-primary" /> AI Assistant</div>
        {chat.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-2 text-sm bg-background/60 rounded-md p-3">
            {chat.slice(-12).map((m) => (
              <ChatBubble key={m.id} msg={m} onIngest={ingestIdea} />
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
        <Textarea
          placeholder="Ask anything: 'show Clay beginner lessons under 15 min', 'brainstorm video ideas about cold email', 'search the web for HeyReach + Clay news'…"
          value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={2}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!chatInput.trim() || !!chatBusy} onClick={() => runAI("nl_filter")}>
            {chatBusy === "nl_filter" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} Filter library
          </Button>
          <Button size="sm" variant="outline" disabled={!!chatBusy} onClick={() => runAI("brainstorm")}>
            {chatBusy === "brainstorm" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />} Brainstorm new ideas
          </Button>
          <Button size="sm" variant="outline" disabled={selected.size < 2 || !!chatBusy} onClick={() => runAI("combine")}>
            {chatBusy === "combine" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />} Combine {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
          <Button size="sm" variant="outline" disabled={!chatInput.trim() || !!chatBusy} onClick={() => runAI("web_search")}>
            {chatBusy === "web_search" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Search the web
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="default" onClick={pushSelectedToPlanner}><Send className="w-4 h-4" /> Push {selected.size} to Planner</Button>
          )}
        </div>
      </Card>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1.5 md:pb-0 md:flex-wrap md:overflow-x-visible">
        <CatChip label={`All (${items.length})`} active={!activeCat} onClick={() => setActiveCat(null)} />
        {cats.map((c) => (
          <CatChip key={c.id} label={`${c.name} (${items.filter((i) => i.category_id === c.id).length})`} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search title, topics, course…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={levelFilter || "all"} onValueChange={(v) => setLevelFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[48%] sm:w-[160px]"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter || "all"} onValueChange={(v) => setPlatformFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[48%] sm:w-[160px]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={originFilter || "all"} onValueChange={(v) => setOriginFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="brainstorm">🧠 Brainstorm (AI)</SelectItem>
            <SelectItem value="web_search">🌐 Web search</SelectItem>
            <SelectItem value="manual">✍️ Manual / seed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground w-full sm:w-auto">{filtered.length} shown · {selected.size} selected</span>
        {selected.size > 0 && (
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setBulkEditing(true)}><Pencil className="w-4 h-4" /> <span className="hidden sm:inline">Bulk edit</span> ({selected.size})</Button>
            <Button size="sm" variant="outline" onClick={handleBulkDelete}><Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span> ({selected.size})</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {/* Table / Cards */}
      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={allOnPageSelected} onChange={togglePageSelectAll} />
                </th>
                <SortHeader label="Title" k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Category" k="category_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Level" k="level" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Duration" k="duration" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2">Platforms</th>
                <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Added" k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && pageItems.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {items.length === 0 ? "Empty library — click 'New idea' to add your own content, or use the AI to brainstorm ideas." : "No items match these filters."}
                </td></tr>
              )}
              {pageItems.map((it) => (
                <tr key={it.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2"><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} /></td>
                  <td className="p-2 align-top">
                    <div className="font-medium flex items-center gap-2">
                      {it.title}
                      {it.origin === "ai" && <Badge variant="secondary" className="text-[10px]">brainstorm</Badge>}
                      {it.origin === "web_search" && <Badge variant="secondary" className="text-[10px]">web</Badge>}
                    </div>
                    {it.key_topics && <div className="text-xs text-muted-foreground line-clamp-2">{it.key_topics}</div>}
                    {it.creator && <div className="text-xs text-muted-foreground">by {it.creator}</div>}
                  </td>
                  <td className="p-2 align-top text-xs">{it.category_name ?? "—"}</td>
                  <td className="p-2 align-top text-xs">{it.level ?? "—"}</td>
                  <td className="p-2 align-top text-xs">{it.duration ?? "—"}</td>
                  <td className="p-2 align-top text-xs">{(it.target_platforms ?? []).join(", ") || "—"}</td>
                  <td className="p-2 align-top"><Badge variant="outline" className="text-xs">{it.status}</Badge></td>
                  <td className="p-2 align-top text-xs text-muted-foreground whitespace-nowrap">
                    {it.created_at ? new Date(it.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex gap-1">
                      {it.source_url && <a href={it.source_url} target="_blank" rel="noreferrer" className="p-1 hover:text-primary" title="Open"><ExternalLink className="w-4 h-4" /></a>}
                      <button className="p-1 hover:text-primary" onClick={() => setPlanning(it)} title="Send to Content Planner"><Calendar className="w-4 h-4" /></button>
                      <button className="p-1 hover:text-primary" onClick={() => setEditing(it)} title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button className="p-1 hover:text-destructive" onClick={async () => { if (confirm("Delete this item?")) { await deleteContentItem(it.id); refresh(); } }} title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden p-4 space-y-4">
          {loading && <div className="p-6 text-center text-muted-foreground">Loading…</div>}
          {!loading && pageItems.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {items.length === 0 ? "Empty library — click 'Seed starter library' to import 557 lessons from your catalog." : "No items match these filters."}
            </div>
          )}
          {pageItems.map((it) => (
            <div key={it.id} className="p-4 rounded-xl border border-border bg-card/60 hover:bg-card transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggleSelect(it.id)}
                    className="mt-1 shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground leading-snug break-words">
                      {it.title}
                    </h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {it.origin === "ai" && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-primary/10 text-primary hover:bg-primary/20 border-transparent">brainstorm</Badge>}
                      {it.origin === "web_search" && <Badge variant="secondary" className="text-[9px] px-1 py-0">web</Badge>}
                      {it.level && <Badge variant="outline" className="text-[9px] px-1 py-0">{it.level}</Badge>}
                      {it.duration && <Badge variant="outline" className="text-[9px] px-1 py-0">{it.duration}</Badge>}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 select-none bg-muted/40">{it.status}</Badge>
              </div>

              {it.key_topics && (
                <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/20 p-2 rounded">
                  {it.key_topics}
                </p>
              )}

              {it.creator && (
                <div className="text-xs text-muted-foreground">
                  by <span className="font-medium text-foreground">{it.creator}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
                <div className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  {it.category_name && (
                    <span className="font-medium text-foreground bg-primary/5 px-2 py-0.5 rounded text-[11px]">
                      {it.category_name}
                    </span>
                  )}
                  {it.target_platforms && it.target_platforms.length > 0 && (
                    <span className="text-[11px]">
                      on {it.target_platforms.join(", ")}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {it.source_url && (
                    <a
                      href={it.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 hover:text-primary rounded-md hover:bg-muted"
                      title="Open"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    className="p-1.5 hover:text-primary rounded-md hover:bg-muted"
                    onClick={() => setPlanning(it)}
                    title="Send to Content Planner"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 hover:text-primary rounded-md hover:bg-muted"
                    onClick={() => setEditing(it)}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 hover:text-destructive rounded-md hover:bg-muted"
                    onClick={async () => {
                      if (confirm("Delete this item?")) {
                        await deleteContentItem(it.id);
                        refresh();
                      }
                    }}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-2 p-3 border-t border-border bg-muted/20 text-xs">
            <div className="text-muted-foreground">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(1)}>First</Button>
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="px-2">Page {page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(totalPages)}>Last</Button>
            </div>
          </div>
        )}
      </Card>

      {(editing || creating) && (
        <ItemEditor
          item={editing}
          cats={cats}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); refresh(); }}
        />
      )}

      {managingCats && (
        <CategoryManager cats={cats} items={items} onClose={() => setManagingCats(false)} onChanged={refresh} />
      )}

      {bulkEditing && (
        <BulkEditor
          count={selected.size}
          cats={cats}
          onClose={() => setBulkEditing(false)}
          onApply={async (updates) => {
            await bulkUpdateContentItems(Array.from(selected), updates);
            toast.success(`Updated ${selected.size} item(s).`);
            setBulkEditing(false);
            setSelected(new Set());
            refresh();
          }}
        />
      )}

      {planning && <SendToPlannerDialog item={planning} onClose={() => setPlanning(null)} onSent={() => setPlanning(null)} />}
    </div>
  );
}

function SortHeader({ label, k, sortKey, sortDir, onSort }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th className="p-2 select-none">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
        {label}
        {active ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

function CategoryManager({ cats, items, onClose, onChanged }: { cats: Cat[]; items: Item[]; onClose: () => void; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c.id, c.name])));
  const [busy, setBusy] = useState<string | null>(null);

  async function rename(id: string) {
    const name = edits[id]?.trim();
    if (!name) return;
    setBusy(id);
    try { await updateContentCategory(id, { name }); toast.success("Category renamed"); onChanged(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }
  async function remove(id: string) {
    const count = items.filter((i) => i.category_id === id).length;
    if (!confirm(`Delete this category? ${count} item(s) will become uncategorized.`)) return;
    setBusy(id);
    try { await deleteContentCategory(id); toast.success("Category deleted"); onChanged(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }
  async function add() {
    if (!newName.trim()) return;
    setBusy("__new");
    try { await createContentCategory({ name: newName.trim() }); setNewName(""); toast.success("Category added"); onChanged(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Manage categories</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {cats.map((c) => {
            const count = items.filter((i) => i.category_id === c.id).length;
            return (
              <div key={c.id} className="flex items-center gap-2">
                <Input value={edits[c.id] ?? c.name} onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })} />
                <span className="text-xs text-muted-foreground w-12 text-right">{count}</span>
                <Button size="sm" variant="outline" disabled={busy === c.id || (edits[c.id] ?? c.name) === c.name} onClick={() => rename(c.id)}>Save</Button>
                <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => remove(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          <Label className="text-xs">Add new category</Label>
          <div className="flex gap-2">
            <Input placeholder="e.g. Outbound Mastery" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button onClick={add} disabled={!newName.trim() || busy === "__new"}><Plus className="w-4 h-4" /> Add</Button>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkEditor({ count, cats, onClose, onApply }: { count: number; cats: Cat[]; onClose: () => void; onApply: (updates: Record<string, any>) => Promise<void> }) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [touchPlatforms, setTouchPlatforms] = useState(false);
  const [saving, setSaving] = useState(false);

  function togglePlatform(p: string) {
    setTouchPlatforms(true);
    setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }

  async function apply() {
    const updates: Record<string, any> = {};
    if (categoryId) {
      const cat = cats.find((c) => c.id === categoryId);
      updates.category_id = categoryId;
      updates.category_name = cat?.name ?? null;
    }
    if (level) updates.level = level;
    if (status) updates.status = status;
    if (touchPlatforms) updates.target_platforms = platforms;
    if (Object.keys(updates).length === 0) { toast.error("Pick at least one field to change"); return; }
    setSaving(true);
    try { await onApply(updates); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bulk edit {count} item(s)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Only fields you set will be applied.</p>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— leave unchanged —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— leave unchanged —</SelectItem>
                {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Level</Label>
            <Select value={level || "none"} onValueChange={(v) => setLevel(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— leave unchanged —</SelectItem>
                {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status || "none"} onValueChange={(v) => setStatus(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— leave unchanged —</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target platforms {touchPlatforms ? "(will overwrite)" : "(leave unchanged)"}</Label>
            <div className="flex gap-2 mt-1 items-center flex-wrap">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs rounded-full border ${platforms.includes(p) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {p}
                </button>
              ))}
              {touchPlatforms && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setTouchPlatforms(false); setPlatforms([]); }}>reset</button>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border text-muted-foreground"}`}>
      {label}
    </button>
  );
}

function ChatBubble({ msg, onIngest }: { msg: ChatMsg; onIngest: (idea: any, sourceCat?: string) => void }) {
  const allIdeas = msg.payload?.ideas as any[] | undefined;
  const combined = msg.payload?.combined as string | undefined;
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [hidden, setHidden] = useState(false);
  const ideas = allIdeas?.map((idea, i) => ({ idea, i })).filter(({ i }) => !dismissed.has(i));
  if (hidden) return null;
  return (
    <div className={`rounded-md p-2 ${msg.role === "user" ? "bg-primary/10" : "bg-muted/60"}`}>
      <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center justify-between">
        <span>{msg.role}{msg.action_kind ? ` · ${msg.action_kind}` : ""}</span>
        {msg.role !== "user" && (
          <button onClick={() => setHidden(true)} className="text-muted-foreground hover:text-foreground" title="Dismiss">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="whitespace-pre-wrap">{msg.content}</div>
      {combined && <div className="mt-2 p-2 rounded bg-background border border-border whitespace-pre-wrap text-xs">{combined}</div>}
      {ideas && ideas.length > 0 && (
        <div className="mt-2 space-y-2">
          {ideas.map(({ idea, i }) => (
            <div key={i} className="p-2 rounded bg-background border border-border flex items-start justify-between gap-2">
              <div className="text-xs">
                <div className="font-semibold">{idea.title}</div>
                {idea.hook && <div className="text-muted-foreground">{idea.hook}</div>}
                {idea.source_url && <a href={idea.source_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 mt-1"><ExternalLink className="w-3 h-3" />source</a>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => { onIngest(idea); setDismissed((s) => new Set(s).add(i)); }}>
                  <Check className="w-3 h-3" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed((s) => new Set(s).add(i))} title="Reject">
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
          {allIdeas && ideas.length === 0 && (
            <div className="text-xs text-muted-foreground italic">All ideas dismissed.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemEditor({ item, cats, onClose, onSaved }: { item: Item | null; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(item ?? { title: "", item_type: "idea", origin: "manual", status: "idea", target_platforms: [] });
  const [saving, setSaving] = useState(false);

  function togglePlatform(p: string) {
    const cur: string[] = form.target_platforms ?? [];
    setForm({ ...form, target_platforms: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  }

  async function save() {
    if (!form.title?.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const cat = cats.find((c) => c.id === form.category_id);
      const payload = { ...form, category_name: cat?.name ?? form.category_name };
      if (item) await updateContentItem(item.id, payload);
      else await createContentItem(payload);
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? "Edit item" : "New idea"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level</Label>
              <Select value={form.level ?? ""} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Duration</Label><Input value={form.duration ?? ""} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "idea"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Source URL</Label><Input value={form.source_url ?? ""} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></div>
          <div><Label>Key topics</Label><Textarea rows={2} value={form.key_topics ?? ""} onChange={(e) => setForm({ ...form, key_topics: e.target.value })} /></div>
          <div>
            <Label>Target platforms</Label>
            <div className="flex gap-2 mt-1">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs rounded-full border ${(form.target_platforms ?? []).includes(p) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function SendToPlannerDialog({ item, onClose, onSent }: { item: Item; onClose: () => void; onSent: () => void }) {
  const today = new Date();
  const dflt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const initialPlatforms = (item.target_platforms?.length ? item.target_platforms : ["youtube"]) as string[];
  const [date, setDate] = useState(dflt);
  const [time, setTime] = useState("09:00");
  const [platforms, setPlatforms] = useState<string[]>(initialPlatforms);
  const [status, setStatus] = useState("scheduled");
  const [busy, setBusy] = useState(false);
  function toggle(p: string) { setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]); }
  async function send() {
    if (!platforms.length) { toast.error("Pick at least one platform"); return; }
    setBusy(true);
    try {
      await createPlannerPost({
        hook: item.title,
        body: item.key_topics ?? item.notes ?? "",
        scheduled_date: date, scheduled_time: time + ":00",
        platforms, status,
        source_kind: "content_studio", source_content_item_id: item.id,
      });
      toast.success(`Scheduled in Planner for ${date} ${time}`);
      onSent();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Send to Content Planner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm font-medium">{item.title}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div>
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLANNER_PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => toggle(p)}
                  className={`px-3 py-1 text-xs rounded-full border capitalize ${platforms.includes(p) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">planned (no auto-post)</SelectItem>
                <SelectItem value="scheduled">scheduled (auto-post at date/time)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Scheduled posts fire to your platform webhooks (configure in Settings → Webhooks).</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Send to Planner</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
