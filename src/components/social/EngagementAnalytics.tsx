import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, Flame, TrendingUp, Pencil, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getCommentAnalytics, saveCommentTargets, type CommentAnalytics, type CommentTargets } from "@/lib/social-queries";

function pct(n: number, d: number) { if (!d) return 0; return Math.min(100, Math.round((n / d) * 100)); }

function Stat({ label, value, target, accent }: { label: string; value: number; target: number; accent: string }) {
  const p = pct(value, target);
  const hit = target > 0 && value >= target;
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        {hit && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10">Goal hit</Badge>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular-nums ${accent}`}>{value}</span>
        <span className="text-xs text-muted-foreground">/ {target || "—"}</span>
      </div>
      <Progress value={p} className="h-1.5" />
      <div className="text-[10px] text-muted-foreground">{target > 0 ? `${p}% of goal` : "No target set"}</div>
    </div>
  );
}

function Sparkline({ data, max }: { data: number[]; max: number }) {
  const w = 100, h = 28;
  if (!data.length) return null;
  const peak = Math.max(max, ...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / peak) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 overflow-visible" preserveAspectRatio="none">
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" points={pts} />
    </svg>
  );
}

function HeatStrip({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex gap-[3px]">
      {data.map((d) => {
        const intensity = d.count === 0 ? 0 : 0.2 + (d.count / max) * 0.8;
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="h-6 flex-1 rounded-[2px] border border-border/40"
            style={{ backgroundColor: d.count === 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${intensity})` }}
          />
        );
      })}
    </div>
  );
}

export default function EngagementAnalytics() {
  const [data, setData] = useState<CommentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CommentTargets>({ daily: 10, weekly: 50, monthly: 200 });

  async function load() {
    setLoading(true);
    try {
      const a = await getCommentAnalytics();
      setData(a);
      setForm(a.targets);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load analytics");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      await saveCommentTargets(form);
      toast.success("Targets saved");
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save targets");
    } finally { setSaving(false); }
  }

  const sparkData = useMemo(() => (data?.byDayLast30 || []).map((d) => d.count), [data]);
  const monthMax = useMemo(() => Math.max(0, ...(data?.byMonthLast12 || []).map((m) => m.count)), [data]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Engagement analytics</h3>
          {data && data.streakDays > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 bg-amber-500/10">
              <Flame className="w-3 h-3" /> {data.streakDays}-day streak
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {!editing ? (
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs gap-1.5" onClick={() => setEditing(true)}>
              <Target className="w-3.5 h-3.5" /> Edit targets
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={() => { setEditing(false); if (data) setForm(data.targets); }}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
              <Button size="sm" className="h-8 px-2 text-xs gap-1" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </Button>
            </>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : data ? (
        <>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
              {(["daily", "weekly", "monthly"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground capitalize">{k} target (comments)</span>
                  <Input
                    type="number" min={0} inputMode="numeric"
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value || 0) }))}
                    className="h-8"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Stat label="Today" value={data.today} target={data.targets.daily} accent="text-foreground" />
            <Stat label="This week" value={data.week} target={data.targets.weekly} accent="text-foreground" />
            <Stat label="This month" value={data.month} target={data.targets.monthly} accent="text-foreground" />
            <Stat label="This year" value={data.year} target={data.targets.monthly * 12} accent="text-foreground" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Last 30 days</span>
                <span className="text-muted-foreground tabular-nums">{sparkData.reduce((a, b) => a + b, 0)} comments</span>
              </div>
              <Sparkline data={sparkData} max={data.targets.daily} />
              <HeatStrip data={data.byDayLast30} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>30d ago</span><span>Today</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Last 12 months</span>
                <span className="text-muted-foreground tabular-nums">{data.byMonthLast12.reduce((a, b) => a + b.count, 0)} comments</span>
              </div>
              <div className="flex items-end gap-1 h-16">
                {data.byMonthLast12.map((m) => {
                  const h = monthMax ? Math.max(2, (m.count / monthMax) * 100) : 2;
                  const hitMonthly = m.count >= data.targets.monthly && data.targets.monthly > 0;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group" title={`${m.month}: ${m.count}`}>
                      <div
                        className={`w-full rounded-sm transition-colors ${hitMonthly ? "bg-emerald-500" : "bg-primary/70 group-hover:bg-primary"}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{data.byMonthLast12[0]?.month}</span>
                <span>{data.byMonthLast12[data.byMonthLast12.length - 1]?.month}</span>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}