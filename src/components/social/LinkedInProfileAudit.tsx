import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, History, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Trash2, Target, Lightbulb, Calendar } from "lucide-react";
import { toast } from "sonner";
import { listProfileAudits, runProfileAudit, deleteProfileAudit, type ProfileAudit } from "@/lib/social-queries";

const SECTION_LABELS: Record<string, string> = {
  visual_identity: "Visual identity (photo + banner)",
  headline: "Headline",
  about: "About section",
  experience: "Experience",
  skills: "Skills",
  featured: "Featured",
  recommendations: "Recommendations",
  missing_sections: "Missing / underfilled sections",
};

function scoreColor(score?: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <Badge variant="outline" className="text-[10px] gap-1"><Minus className="w-3 h-3" />no change</Badge>;
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${positive ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10" : "border-rose-500/40 text-rose-600 bg-rose-500/10"}`}>
      <Icon className="w-3 h-3" />{positive ? "+" : ""}{delta}
    </Badge>
  );
}

function List({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function Section({ id, data, prevData }: { id: string; data: any; prevData?: any }) {
  const [open, setOpen] = useState(true);
  if (!data) return null;
  const delta = prevData?.score != null && data?.score != null ? data.score - prevData.score : null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-lg font-semibold tabular-nums ${scoreColor(data.score)}`}>{data.score ?? "—"}</span>
          <span className="text-sm font-medium truncate">{SECTION_LABELS[id] || id}</span>
          {delta != null && delta !== 0 && <DeltaBadge delta={delta} />}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 text-sm">
          {data.notes && <p className="text-foreground/80">{data.notes}</p>}
          {id === "visual_identity" && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Photo: <span className={scoreColor(data.photo_score)}>{data.photo_score ?? "—"}/100</span></span>
              <span>Banner: <span className={scoreColor(data.banner_score)}>{data.banner_score ?? "—"}/100</span></span>
              <span>Custom URL: {data.url_customized ? "yes" : "no"}</span>
            </div>
          )}
          {id === "headline" && (
            <div className="space-y-2">
              {data.current && <p className="text-xs text-muted-foreground">Current: <span className="text-foreground">{data.current}</span></p>}
              {data.options?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rewrite options</div>
                  {data.options.map((o: string, i: number) => (
                    <div key={i} className="rounded border border-border p-2 text-sm">{o}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {id === "about" && data.rewrite && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested rewrite</div>
              <div className="rounded border border-border p-2 whitespace-pre-wrap text-sm">{data.rewrite}</div>
            </div>
          )}
          {id === "experience" && data.rewrites?.length > 0 && (
            <div className="space-y-2">
              {data.rewrites.map((r: any, i: number) => (
                <div key={i} className="rounded border border-border p-2">
                  {r.role && <div className="text-xs font-semibold text-muted-foreground mb-1">{r.role}</div>}
                  <div className="text-sm whitespace-pre-wrap">{r.rewrite}</div>
                </div>
              ))}
            </div>
          )}
          {id === "skills" && (
            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              {data.add?.length > 0 && <div><div className="font-semibold text-emerald-600 mb-1">Add</div><List items={data.add} /></div>}
              {data.remove?.length > 0 && <div><div className="font-semibold text-rose-600 mb-1">Remove</div><List items={data.remove} /></div>}
              {data.reorder?.length > 0 && <div><div className="font-semibold text-amber-600 mb-1">Reorder</div><List items={data.reorder} /></div>}
            </div>
          )}
          {id === "featured" && <List items={data.suggestions} />}
          {id === "recommendations" && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Estimated count: {data.count_estimate ?? "—"}</div>
              {data.ask_targets?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Who to ask</div>
                  <List items={data.ask_targets} />
                </div>
              )}
            </div>
          )}
          {id === "missing_sections" && <List items={data.items} />}
          {data.improvements?.length > 0 && (
            <div className="rounded-md bg-primary/5 border border-primary/20 p-2 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary inline-flex items-center gap-1"><Lightbulb className="w-3 h-3" /> What to improve</div>
              <List items={data.improvements} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AuditView({ audit, previous }: { audit: ProfileAudit; previous: ProfileAudit | null }) {
  const r = audit.report || {};
  const prevR = previous?.report || null;
  return (
    <div className="space-y-4">
      {/* Overall + classification */}
      <div className="grid md:grid-cols-[auto_1fr] gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center justify-center min-w-[140px]">
          <div className={`text-4xl font-bold tabular-nums ${scoreColor(r.overall_score)}`}>{r.overall_score ?? "—"}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overall</div>
          {audit.diff?.overall_delta != null && audit.diff.overall_delta !== 0 && (
            <div className="mt-1"><DeltaBadge delta={audit.diff.overall_delta} /></div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {r.summary && <p className="text-sm text-foreground/90">{r.summary}</p>}
          {r.classification && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {r.classification.industry && <Badge variant="outline">Industry: {r.classification.industry}</Badge>}
              {r.classification.profile_type && <Badge variant="outline">Type: {r.classification.profile_type}</Badge>}
              {r.classification.target_audience && <Badge variant="outline">Audience: {r.classification.target_audience}</Badge>}
              {r.classification.geographic_focus && <Badge variant="outline">Geo: {r.classification.geographic_focus}</Badge>}
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile sections</h4>
        {Object.keys(SECTION_LABELS).map((key) => (
          <Section key={key} id={key} data={r.sections?.[key]} prevData={prevR?.sections?.[key]} />
        ))}
      </div>

      {/* Metrics */}
      {r.metrics && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-semibold inline-flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Metrics & benchmarks</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded border border-border p-2">
              <div className={`text-xl font-semibold ${scoreColor(r.metrics.ssi_estimated)}`}>{r.metrics.ssi_estimated ?? "—"}</div>
              <div className="text-[10px] uppercase text-muted-foreground">SSI (est.)</div>
            </div>
            {r.metrics.ssi_breakdown && Object.entries(r.metrics.ssi_breakdown).map(([k, v]) => (
              <div key={k} className="rounded border border-border p-2">
                <div className="text-xl font-semibold tabular-nums">{v as any}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          <div className="text-xs space-y-1">
            <div>Engagement rate: <span className="font-medium">{r.metrics.engagement_rate_pct ?? "—"}%</span> · {r.metrics.engagement_benchmark_note}</div>
            {r.metrics.visibility_notes && <div className="text-muted-foreground">{r.metrics.visibility_notes}</div>}
          </div>
        </div>
      )}

      {/* Strategy */}
      {r.strategy && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-semibold">Strategy</h4>
          {r.strategy.keywords && (
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div><div className="font-semibold mb-1">Primary keywords</div><div className="flex flex-wrap gap-1">{(r.strategy.keywords.primary || []).map((k: string, i: number) => <Badge key={i} variant="secondary">{k}</Badge>)}</div></div>
              <div><div className="font-semibold mb-1">Secondary</div><div className="flex flex-wrap gap-1">{(r.strategy.keywords.secondary || []).map((k: string, i: number) => <Badge key={i} variant="outline">{k}</Badge>)}</div></div>
              <div><div className="font-semibold mb-1">Long-tail</div><div className="flex flex-wrap gap-1">{(r.strategy.keywords.long_tail || []).map((k: string, i: number) => <Badge key={i} variant="outline">{k}</Badge>)}</div></div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div><div className="text-xs font-semibold mb-1 text-emerald-600">Quick wins (today)</div><List items={r.strategy.quick_wins} /></div>
            <div><div className="text-xs font-semibold mb-1 text-primary">Long-term (30–90d)</div><List items={r.strategy.long_term} /></div>
          </div>
          {r.strategy.content_pillars?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold">Content pillars</div>
              {r.strategy.content_pillars.map((p: any, i: number) => (
                <div key={i} className="rounded border border-border p-2">
                  <div className="text-sm font-medium">{p.name}</div>
                  <List items={p.ideas} />
                </div>
              ))}
            </div>
          )}
          {r.strategy.format_recommendations?.length > 0 && (
            <div><div className="text-xs font-semibold mb-1">Format recommendations</div><List items={r.strategy.format_recommendations} /></div>
          )}
        </div>
      )}

      {/* Growth plan */}
      {r.growth_plan && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-semibold inline-flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> 30 / 60 / 90 day plan</h4>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs font-semibold mb-1">Day 1–30</div><List items={r.growth_plan.day_1_30} /></div>
            <div><div className="text-xs font-semibold mb-1">Day 31–60</div><List items={r.growth_plan.day_31_60} /></div>
            <div><div className="text-xs font-semibold mb-1">Day 61–90</div><List items={r.growth_plan.day_61_90} /></div>
          </div>
        </div>
      )}

      {/* Multilingual */}
      {r.multilingual && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <span className="font-semibold">Multilingual: </span>
          {r.multilingual.has_secondary ? "Secondary-language profile detected. " : "No secondary-language profile. "}
          <span className="text-muted-foreground">{r.multilingual.recommendation}</span>
        </div>
      )}
    </div>
  );
}

export default function LinkedInProfileAudit() {
  const [audits, setAudits] = useState<ProfileAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await listProfileAudits(20);
      setAudits(list);
      if (list.length && !selectedId) setSelectedId(list[0].id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load audits");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function run() {
    setRunning(true);
    try {
      const { data, error } = await runProfileAudit();
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Audit complete");
      const a = (data as any)?.audit as ProfileAudit;
      setSelectedId(a?.id ?? null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to run audit");
    } finally { setRunning(false); }
  }

  async function remove(id: string) {
    try {
      await deleteProfileAudit(id);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to delete"); }
  }

  const current = audits.find((a) => a.id === selectedId) || audits[0] || null;
  const idx = current ? audits.findIndex((a) => a.id === current.id) : -1;
  const previous = idx >= 0 && idx < audits.length - 1 ? audits[idx + 1] : null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Profile optimization audit</h3>
          <p className="text-xs text-muted-foreground mt-0.5">AI-powered full audit of your LinkedIn profile. Re-run anytime to track what improved or got worse.</p>
        </div>
        <div className="flex gap-1.5">
          {audits.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setShowHistory((v) => !v)}>
              <History className="w-3.5 h-3.5" /> History ({audits.length})
            </Button>
          )}
          <Button size="sm" onClick={run} disabled={running} className="gap-1.5 h-8 text-xs">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {audits.length === 0 ? "Run my first audit" : "Run new audit"}
          </Button>
        </div>
      </div>

      {showHistory && audits.length > 0 && (
        <div className="rounded-lg border border-border p-2 space-y-1 max-h-56 overflow-auto">
          {audits.map((a) => {
            const isSel = a.id === selectedId;
            return (
              <div key={a.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded ${isSel ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                <button type="button" onClick={() => setSelectedId(a.id)} className="flex-1 text-left">
                  <div className="text-xs font-medium">{new Date(a.created_at).toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">Overall {a.overall_score ?? "—"}{a.diff?.overall_delta != null && a.diff.overall_delta !== 0 ? ` · Δ ${a.diff.overall_delta > 0 ? "+" : ""}${a.diff.overall_delta}` : ""}</div>
                </button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(a.id)} title="Delete audit">
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !current ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No audits yet. Click "Run my first audit" — we'll analyze your scraped profile + recent posts and produce a full optimization report. Re-run later to see what improved.
        </div>
      ) : (
        <AuditView audit={current} previous={previous} />
      )}
    </Card>
  );
}