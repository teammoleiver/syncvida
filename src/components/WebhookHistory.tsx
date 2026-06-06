import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, RefreshCw, Trash2, Check, X, Clock, Search,
  Linkedin, Facebook, Instagram, Twitter, Youtube, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listWebhookLogs, deleteWebhookLog, clearWebhookLogs,
  type WebhookLog,
} from "@/lib/social-queries";

const PLATFORM_ICONS: Record<string, any> = {
  linkedin: Linkedin, facebook: Facebook, instagram: Instagram, twitter: Twitter, youtube: Youtube,
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#1877F2",
  facebook: "#90D5FF",
  instagram: "#d62976",
  twitter: "#000000",
  youtube: "#FF0000",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtAbs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Pull the LinkedIn post URN out of a webhook log and build a feed URL. */
function linkedinUrlFromLog(l: WebhookLog): { url: string; urn: string } | null {
  if (l.platform !== "linkedin" || !l.ok) return null;
  const headers = (l.response_headers ?? {}) as Record<string, string>;
  let urn: string | null = headers["x-restli-id"] ?? headers["X-RestLi-Id"] ?? headers["x-linkedin-id"] ?? null;
  if (!urn && l.response_body) {
    try {
      const j = JSON.parse(l.response_body);
      if (typeof j?.post_urn === "string") urn = j.post_urn;
      else if (typeof j?.id === "string" && j.id.startsWith("urn:li:")) urn = j.id;
    } catch { /* not JSON */ }
  }
  if (!urn || !urn.startsWith("urn:li:")) return null;
  return { urn, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/` };
}

export default function WebhookHistory() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "ok" | "error">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function reload() {
    setLoading(true);
    try {
      const data = await listWebhookLogs({ platform, status, limit: 500 });
      setLogs(data);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load logs"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [platform, status]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      l.webhook_url.toLowerCase().includes(q)
      || (l.error ?? "").toLowerCase().includes(q)
      || (l.response_body ?? "").toLowerCase().includes(q)
      || (l.plan_id ?? "").toLowerCase().includes(q));
  }, [logs, search]);

  const stats = useMemo(() => {
    let ok = 0, err = 0;
    for (const l of logs) (l.ok ? ok++ : err++);
    return { total: logs.length, ok, err };
  }, [logs]);

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function clearOld() {
    if (!confirm("Delete webhook logs older than 30 days?")) return;
    const n = await clearWebhookLogs({ olderThanDays: 30 });
    toast.success(`Deleted ${n} log${n === 1 ? "" : "s"}`);
    reload();
  }
  async function clearAll() {
    if (!confirm("Delete ALL webhook logs? This cannot be undone.")) return;
    const n = await clearWebhookLogs({});
    toast.success(`Deleted ${n} log${n === 1 ? "" : "s"}`);
    reload();
  }
  async function deleteOne(id: string) {
    await deleteWebhookLog(id);
    setLogs((l) => l.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-3">
      {/* Stats + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">{stats.total} total</Badge>
        <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-300">{stats.ok} ok</Badge>
        <Badge variant="outline" className="text-xs border-red-500/40 text-red-300">{stats.err} errored</Badge>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={clearOld}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear &gt; 30d
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={clearAll}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear all
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search URL, error, response, plan_id" className="pl-8 h-9" />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="twitter">Twitter / X</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">Success</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No webhook attempts logged{logs.length === 0 ? " yet" : " match these filters"}.
          {logs.length === 0 && <p className="text-xs mt-1">Send a post via the Calendar's "Send now" or wait for a scheduled post to fire.</p>}
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((l) => {
            const Icon = PLATFORM_ICONS[l.platform] ?? Clock;
            const color = PLATFORM_COLORS[l.platform] ?? "#888";
            const isOpen = expanded.has(l.id);
            return (
              <Card key={l.id} className={`overflow-hidden ${l.ok ? "border-emerald-500/30" : "border-red-500/30"}`}>
                <button onClick={() => toggle(l.id)}
                  className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/30">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `${color}22`, color }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${l.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                        {l.ok ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                        {" "}{l.status_code ?? (l.error ? "ERR" : "—")}
                      </span>
                      <span className="text-xs capitalize">{l.platform}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{l.trigger_kind}</span>
                      {l.duration_ms != null && (
                        <span className="text-[10px] text-muted-foreground">{l.duration_ms}ms</span>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto" title={fmtAbs(l.attempted_at)}>{fmtTime(l.attempted_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {l.webhook_url || <span className="italic">no URL configured</span>}
                    </div>
                    {!l.ok && l.error && (
                      <div className="text-[11px] text-red-400 truncate mt-0.5">↳ {l.error}</div>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); deleteOne(l.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-3 py-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Attempted:</span> {fmtAbs(l.attempted_at)}</div>
                      <div><span className="text-muted-foreground">Plan ID:</span> <code className="text-[10px]">{l.plan_id ?? "—"}</code></div>
                    </div>
                    {l.request_payload && (
                      <details className="bg-background/50 rounded p-2">
                        <summary className="cursor-pointer text-[11px] font-medium">Request payload</summary>
                        <pre className="mt-2 text-[10px] whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">{JSON.stringify(l.request_payload, null, 2)}</pre>
                      </details>
                    )}
                    {l.response_body !== null && l.response_body !== undefined && (
                      <details className="bg-background/50 rounded p-2" open={!l.ok}>
                        <summary className="cursor-pointer text-[11px] font-medium">
                          Response body {l.status_code != null && <span className="text-muted-foreground">({l.status_code})</span>}
                        </summary>
                        <pre className="mt-2 text-[10px] whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">{l.response_body || "<empty>"}</pre>
                      </details>
                    )}
                    {l.response_headers && Object.keys(l.response_headers).length > 0 && (
                      <details className="bg-background/50 rounded p-2">
                        <summary className="cursor-pointer text-[11px] font-medium">Response headers</summary>
                        <pre className="mt-2 text-[10px] whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">{JSON.stringify(l.response_headers, null, 2)}</pre>
                      </details>
                    )}
                    {l.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-[11px] text-red-300">
                        <strong>Error:</strong> {l.error}
                        {l.error === "no_webhook_configured" && (
                          <p className="text-[10px] mt-1 text-red-200/80">No webhook URL is set for this platform — configure one above and try again.</p>
                        )}
                        {l.error === "webhook_inactive" && (
                          <p className="text-[10px] mt-1 text-red-200/80">The webhook is configured but the Active toggle is off — flip it on to send.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
