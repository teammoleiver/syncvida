import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, Copy, Check, ExternalLink, Settings as SettingsIcon, Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Provider = {
  id: string; name: string; provider_kind: string; endpoint_url: string;
  http_method: string; auth_header_name: string; auth_header_prefix: string;
  api_key_secret_name: string; default_body: any; default_headers: any; query_field: string;
  is_default: boolean; is_active: boolean;
};
type HistoryRow = {
  id: string; query: string; answer: string | null; results: any; status: string;
  output_type: string | null; depth: string | null; created_at: string; duration_ms: number | null;
};

const OUTPUT_TYPES = [
  { id: "searchResults", label: "Search Results", desc: "Raw JSON" },
  { id: "sourcedAnswer", label: "Sourced Answer", desc: "Natural language" },
  { id: "structured", label: "Structured", desc: "Schema-driven" },
] as const;
const DEPTHS = [
  { id: "auto", label: "Auto", desc: "AI decides" },
  { id: "standard", label: "Standard", desc: "Fast" },
  { id: "deep", label: "Deep", desc: "Thorough" },
] as const;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [optimized, setOptimized] = useState("");
  const [outputType, setOutputType] = useState<string>("sourcedAnswer");
  const [depth, setDepth] = useState<string>("auto");
  const [running, setRunning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState<string>("");
  const resultRef = useRef<HTMLDivElement>(null);

  async function loadAll() {
    const [{ data: provs }, { data: hist }] = await Promise.all([
      supabase.from("social_search_providers" as any).select("*").order("is_default", { ascending: false }),
      supabase.from("social_search_queries" as any).select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setProviders((provs as any) ?? []);
    setHistory((hist as any) ?? []);
    if (provs && provs.length && !providerId) setProviderId((provs as any)[0].id);
  }
  useEffect(() => { loadAll(); }, []);

  async function ensureDefaultProvider() {
    if (providers.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("social_search_providers" as any).insert({
      user_id: user.id, name: "Linkup (default)", provider_kind: "linkup",
    } as any).select().single();
    if (data) { setProviders([data as any]); setProviderId((data as any).id); }
  }
  useEffect(() => { ensureDefaultProvider(); }, [providers.length]);

  async function runOptimize() {
    if (!query.trim()) return;
    setOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-search", {
        body: { action: "optimize", query, outputType, depth },
      });
      if (error) throw error;
      setOptimized((data as any)?.optimized ?? query);
      toast.success("Prompt optimized");
    } catch (e: any) {
      toast.error(e.message ?? "Optimize failed");
    } finally { setOptimizing(false); }
  }

  async function runSearch(useQuery?: string) {
    const q = (useQuery || optimized || query || "").trim();
    if (!q) { toast.error("Enter a query"); return; }
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-search", {
        body: { action: "search", query: q, outputType, depth, provider_id: providerId || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      loadAll();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e: any) {
      toast.error(e.message ?? "Search failed");
    } finally { setRunning(false); }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(""), 1500);
  }

  async function deleteHistory(id: string) {
    await supabase.from("social_search_queries" as any).delete().eq("id", id);
    setHistory((h) => h.filter((r) => r.id !== id));
  }

  function loadHistoryItem(row: HistoryRow) {
    setQuery(row.query);
    setOptimized("");
    setOutputType(row.output_type ?? "sourcedAnswer");
    setDepth(row.depth ?? "auto");
    setResult({ answer: row.answer, results: row.results, ok: true });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Search</h2>
          <p className="text-sm text-muted-foreground">Ask anything. Powered by Linkup (or any HTTP provider you configure).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)}>
          <SettingsIcon className="w-4 h-4 mr-1" /> Provider settings
        </Button>
      </div>

      {showSettings && <ProviderSettings providers={providers} onChange={loadAll} selectedId={providerId} setSelectedId={setProviderId} />}

      {/* Composer */}
      <Card className="p-5 space-y-4">
        <div>
          <Label htmlFor="q">Your query</Label>
          <Textarea
            id="q" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Find recent LinkedIn posts about recycling and optical sorting solutions"
            className="mt-1 min-h-[90px]"
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runSearch(); }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Output type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              {OUTPUT_TYPES.map((o) => (
                <button key={o.id} type="button" onClick={() => setOutputType(o.id)}
                  className={`text-left rounded-lg border p-2.5 text-xs transition-colors ${outputType === o.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <div className="font-medium text-foreground">{o.label}</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search depth</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              {DEPTHS.map((o) => (
                <button key={o.id} type="button" onClick={() => setDepth(o.id)}
                  className={`text-left rounded-lg border p-2.5 text-xs transition-colors ${depth === o.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <div className="font-medium text-foreground">{o.label}</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {optimized && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-xs font-medium text-primary flex items-center gap-1"><Sparkles className="w-3 h-3" /> Optimized prompt</div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => copyText(optimized, "opt")}>
                  {copied === "opt" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setQuery(optimized); setOptimized(""); }}>Use it</Button>
              </div>
            </div>
            <p className="text-sm">{optimized}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
          <div className="text-xs text-muted-foreground text-center sm:text-left order-2 sm:order-1">⌘ + Enter to search</div>
          <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
            <Button variant="outline" onClick={runOptimize} disabled={optimizing || !query.trim()} className="flex-1 sm:flex-initial">
              {optimizing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Optimize prompt
            </Button>
            <Button onClick={() => runSearch()} disabled={running || !query.trim()} className="flex-1 sm:flex-initial">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Search
            </Button>
          </div>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card ref={resultRef as any} className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Result</h3>
            {result.answer && (
              <Button size="sm" variant="ghost" onClick={() => copyText(result.answer, "ans")}>
                {copied === "ans" ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy
              </Button>
            )}
          </div>
          {result.answer && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{result.answer}</ReactMarkdown>
            </div>
          )}
          {Array.isArray(result.results) && result.results.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sources</div>
              {result.results.map((r: any, i: number) => (
                <div key={i} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                      {r.name || r.title || r.url} <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-sm text-muted-foreground line-clamp-3 mt-1">{r.content || r.snippet || r.description}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyText(`${r.name || r.title}\n${r.url}\n\n${r.content || r.snippet || ""}`, `r${i}`)}>
                    {copied === `r${i}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Raw JSON</summary>
            <pre className="mt-2 p-3 rounded bg-muted overflow-auto max-h-96 text-[11px]">{JSON.stringify(result.raw ?? result, null, 2)}</pre>
          </details>
        </Card>
      )}

      {/* History */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2"><History className="w-4 h-4" /> Recent searches</h3>
          <span className="text-xs text-muted-foreground">{history.length} item(s)</span>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your search history will appear here.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3 hover:border-primary/40 transition-colors">
                <button className="text-left flex-1 min-w-0" onClick={() => loadHistoryItem(h)}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant={h.status === "success" ? "secondary" : "destructive"} className="text-[10px]">{h.status}</Badge>
                    <span className="text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                    {h.duration_ms != null && <span className="text-[11px] text-muted-foreground">· {h.duration_ms}ms</span>}
                  </div>
                  <div className="text-sm truncate">{h.query}</div>
                  {h.answer && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{h.answer}</div>}
                </button>
                <Button size="sm" variant="ghost" onClick={() => deleteHistory(h.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function ProviderSettings({ providers, onChange, selectedId, setSelectedId }: { providers: Provider[]; onChange: () => void; selectedId: string; setSelectedId: (s: string) => void }) {
  const [editing, setEditing] = useState<Provider | null>(null);
  useEffect(() => { setEditing(providers.find((p) => p.id === selectedId) ?? providers[0] ?? null); }, [selectedId, providers]);

  async function save() {
    if (!editing) return;
    const { id, ...rest } = editing;
    const { error } = await supabase.from("social_search_providers" as any).update(rest as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); onChange();
  }
  async function addNew() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("social_search_providers" as any).insert({
      user_id: user.id, name: "New provider", provider_kind: "custom_http",
      endpoint_url: "https://api.example.com/search", api_key_secret_name: "LINKUP_API_KEY",
    } as any).select().single();
    if (error) { toast.error(error.message); return; }
    setSelectedId((data as any).id); onChange();
  }
  async function remove() {
    if (!editing) return;
    if (!confirm(`Delete provider "${editing.name}"?`)) return;
    await supabase.from("social_search_providers" as any).delete().eq("id", editing.id);
    onChange();
  }

  return (
    <Card className="p-5 space-y-4 border-primary/30">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Search providers</h3>
        <Button size="sm" variant="outline" onClick={addNew}>+ Add provider</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <button key={p.id} onClick={() => setSelectedId(p.id)}
            className={`text-xs rounded-full border px-3 py-1 ${selectedId === p.id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            {p.name} <span className="opacity-60">· {p.provider_kind}</span>
          </button>
        ))}
      </div>

      {editing && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <Label>Kind</Label>
            <select className="w-full rounded-md border border-border bg-background h-10 px-3 text-sm"
              value={editing.provider_kind} onChange={(e) => setEditing({ ...editing, provider_kind: e.target.value })}>
              <option value="linkup">linkup</option>
              <option value="custom_http">custom_http</option>
              <option value="apify">apify</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Endpoint URL</Label>
            <Input value={editing.endpoint_url} onChange={(e) => setEditing({ ...editing, endpoint_url: e.target.value })} />
          </div>
          <div>
            <Label>HTTP method</Label>
            <Input value={editing.http_method} onChange={(e) => setEditing({ ...editing, http_method: e.target.value })} />
          </div>
          <div>
            <Label>API key secret name</Label>
            <Input value={editing.api_key_secret_name} onChange={(e) => setEditing({ ...editing, api_key_secret_name: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Must exist in project secrets. Default: LINKUP_API_KEY</p>
          </div>
          <div>
            <Label>Auth header name</Label>
            <Input value={editing.auth_header_name} onChange={(e) => setEditing({ ...editing, auth_header_name: e.target.value })} />
          </div>
          <div>
            <Label>Auth header prefix</Label>
            <Input value={editing.auth_header_prefix} onChange={(e) => setEditing({ ...editing, auth_header_prefix: e.target.value })} />
          </div>
          <div>
            <Label>Query body field (custom_http only)</Label>
            <Input value={editing.query_field} onChange={(e) => setEditing({ ...editing, query_field: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Default headers (JSON)</Label>
            <Textarea className="font-mono text-xs" rows={3}
              value={JSON.stringify(editing.default_headers ?? {}, null, 2)}
              onChange={(e) => { try { setEditing({ ...editing, default_headers: JSON.parse(e.target.value) }); } catch {/* ignore */} }} />
          </div>
          <div className="md:col-span-2">
            <Label>Default body (JSON)</Label>
            <Textarea className="font-mono text-xs" rows={5}
              value={JSON.stringify(editing.default_body ?? {}, null, 2)}
              onChange={(e) => { try { setEditing({ ...editing, default_body: JSON.parse(e.target.value) }); } catch {/* ignore */} }} />
          </div>
          <div className="md:col-span-2 flex justify-between">
            <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
            <Button onClick={save}>Save provider</Button>
          </div>
        </div>
      )}
    </Card>
  );
}