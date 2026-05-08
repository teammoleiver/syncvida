import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Send, Linkedin, Facebook, Instagram, Twitter, Youtube, Image as ImageIcon, Calendar as CalendarIcon, List, Sparkles, Figma, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listContentPlan, createPlannerPost, updatePlanEntry, deletePlanEntry, pushSinglePost, PLANNER_PLATFORMS, generatePostImage, getWriterSettings } from "@/lib/social-queries";
import { getProfile } from "@/lib/supabase-queries";

const STATUSES = ["planned", "drafting", "ready", "scheduled", "posted", "failed"];
const PLATFORM_ICONS: Record<string, any> = { linkedin: Linkedin, facebook: Facebook, instagram: Instagram, twitter: Twitter, youtube: Youtube };
type View = "month" | "week" | "day" | "list";

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfWeek(d: Date) { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtMonth(d: Date) { return d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }

function statusColor(s: string) {
  return s === "posted" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : s === "scheduled" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
    : s === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";
}

export default function ContentPlannerPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<any | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  async function load() { setLoading(true); setEntries(await listContentPlan()); setLoading(false); }
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of entries) {
      const k = e.scheduled_date || "unscheduled";
      (m[k] ||= []).push(e);
    }
    return m;
  }, [entries]);

  function shift(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
          <span className="ml-2 text-sm font-medium">
            {view === "month" && fmtMonth(cursor)}
            {view === "week" && `Week of ${ymd(startOfWeek(cursor))}`}
            {view === "day" && cursor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            {view === "list" && "All entries"}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {(["month","week","day","list"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs px-2.5 py-1 rounded ${view === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
          <Button size="sm" className="ml-1" onClick={() => setCreatingFor(ymd(new Date()))}><Plus className="w-4 h-4 mr-1" /> New</Button>
        </div>
      </div>

      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
        view === "month" ? <MonthView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : view === "week" ? <WeekView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : view === "day" ? <DayView cursor={cursor} grouped={grouped} onPick={(d) => setCreatingFor(d)} onOpen={(e) => setEditing(e)} />
        : <ListView entries={entries} onOpen={(e) => setEditing(e)} />}

      {editing && <PostEditor entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {creatingFor && <PostEditor entry={{ scheduled_date: creatingFor, status: "planned", platforms: [] }} isNew onClose={() => setCreatingFor(null)} onSaved={() => { setCreatingFor(null); load(); }} />}
    </section>
  );
}

function EntryChip({ e, onClick }: { e: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-1.5 py-1 rounded text-[11px] border truncate hover:opacity-90 ${statusColor(e.status)}`}>
      <span className="font-medium">{e.scheduled_time?.slice(0,5) ?? ""}</span> {e.hook}
    </button>
  );
}

function MonthView({ cursor, grouped, onPick, onOpen }: { cursor: Date; grouped: Record<string, any[]>; onPick: (d: string) => void; onOpen: (e: any) => void }) {
  const first = startOfMonth(cursor);
  const start = startOfWeek(first);
  const today = ymd(new Date());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/40 text-[11px] uppercase text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="p-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
        {days.map((d) => {
          const k = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = grouped[k] ?? [];
          return (
            <div key={k} className={`border-t border-r border-border p-1.5 flex flex-col gap-1 ${inMonth ? "" : "bg-muted/20 text-muted-foreground"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${k === today ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold" : ""}`}>{d.getDate()}</span>
                <button onClick={() => onPick(k)} className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-primary"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="space-y-1 overflow-hidden">
                {items.slice(0, 3).map((e) => <EntryChip key={e.id} e={e} onClick={() => onOpen(e)} />)}
                {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekView({ cursor, grouped, onPick, onOpen }: any) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const k = ymd(d);
        const items = grouped[k] ?? [];
        return (
          <Card key={k} className="p-2 min-h-[200px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
              <button onClick={() => onPick(k)} className="text-muted-foreground hover:text-primary"><Plus className="w-3 h-3" /></button>
            </div>
            <div className="space-y-1">
              {items.map((e: any) => <EntryChip key={e.id} e={e} onClick={() => onOpen(e)} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DayView({ cursor, grouped, onPick, onOpen }: any) {
  const k = ymd(cursor);
  const items = grouped[k] ?? [];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">{cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        <Button size="sm" onClick={() => onPick(k)}><Plus className="w-4 h-4 mr-1" /> Add post</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No posts scheduled.</p> :
        <div className="space-y-2">
          {items.map((e: any) => (
            <button key={e.id} onClick={() => onOpen(e)} className={`w-full text-left p-3 rounded-lg border ${statusColor(e.status)}`}>
              <div className="text-xs">{e.scheduled_time?.slice(0,5) ?? "no time"} · {(e.platforms ?? []).join(", ") || "no platform"}</div>
              <div className="font-medium mt-1">{e.hook}</div>
              {e.body && <div className="text-xs opacity-80 mt-1 line-clamp-2">{e.body}</div>}
            </button>
          ))}
        </div>}
    </Card>
  );
}

function ListView({ entries, onOpen }: { entries: any[]; onOpen: (e: any) => void }) {
  if (!entries.length) return <Card className="p-8 text-center text-muted-foreground">No posts yet.</Card>;
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <button key={e.id} onClick={() => onOpen(e)} className="w-full text-left">
          <Card className="p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(e.status)}`}>{e.status}</Badge>
                  {e.scheduled_date && <span>📅 {e.scheduled_date}{e.scheduled_time ? ` · ${e.scheduled_time.slice(0,5)}` : ""}</span>}
                  {(e.platforms ?? []).map((p: string) => {
                    const Ic = PLATFORM_ICONS[p];
                    return Ic ? <Ic key={p} className="w-3 h-3" /> : null;
                  })}
                </div>
                <div className="font-medium text-sm">{e.hook}</div>
                {e.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{e.body}</p>}
              </div>
              {e.image_url && <img src={e.image_url} alt="" className="w-16 h-16 object-cover rounded-md" />}
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}

function PostEditor({ entry, isNew, onClose, onSaved }: { entry: any; isNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    hook: "", body: "", image_url: "", scheduled_date: "", scheduled_time: "",
    status: "planned", ...entry,
    platforms: entry?.platforms ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [figmaBrief, setFigmaBrief] = useState<string | null>(null);
  const [me, setMe] = useState<{ name?: string; linkedin_url?: string; style?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, w] = await Promise.all([getProfile(), getWriterSettings()]);
        setMe({
          name: (p as any)?.full_name || (p as any)?.name || "",
          linkedin_url: (w as any)?.linkedin_url || "",
          style: (w as any)?.image_style_prompt || "",
        });
      } catch { /* ignore */ }
    })();
  }, []);

  function togglePlatform(p: string) {
    const cur: string[] = form.platforms ?? [];
    setForm({ ...form, platforms: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  }

  async function save() {
    if (!form.hook?.trim()) { toast.error("Hook is required"); return; }
    setBusy(true);
    try {
      const payload: any = {
        hook: form.hook, body: form.body || null, image_url: form.image_url || null,
        scheduled_date: form.scheduled_date || null, scheduled_time: form.scheduled_time || null,
        platforms: form.platforms ?? [], status: form.status,
      };
      if (isNew) await createPlannerPost(payload);
      else await updatePlanEntry(entry.id, payload);
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  async function sendNow() {
    if (!entry?.id) { toast.error("Save first"); return; }
    if (!(form.platforms ?? []).length) { toast.error("Pick at least one platform"); return; }
    setBusy(true);
    try {
      const { data, error } = await pushSinglePost(entry.id);
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      toast.success(r?.status === "posted" ? "Posted via webhook ✓" : `Webhook: ${r?.status ?? "done"}`);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Send failed"); } finally { setBusy(false); }
  }

  async function remove() {
    if (!entry?.id) return onClose();
    if (!confirm("Delete this post?")) return;
    await deletePlanEntry(entry.id); toast.success("Deleted"); onSaved();
  }

  async function generateImage() {
    if (!form.hook?.trim()) { toast.error("Add a hook first"); return; }
    setGenBusy(true);
    try {
      const { data, error } = await generatePostImage({
        hook: form.hook,
        post_body: form.body ?? "",
        entry_id: entry?.id ?? null,
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (!d?.image_url) throw new Error("No image returned");
      setForm({ ...form, image_url: d.image_url });
      toast.success("Image generated with your style");
    } catch (e: any) {
      toast.error(e?.message ?? "Image generation failed");
    } finally { setGenBusy(false); }
  }

  function buildFigmaBrief() {
    const author = me?.name || "(your name)";
    const linkedin = me?.linkedin_url || "(your LinkedIn URL)";
    const style = me?.style?.trim() || "Modern, editorial, social-friendly. High-contrast display typography, plenty of negative space, brand colour accents.";
    const platforms = (form.platforms ?? []).join(", ") || "linkedin";
    const date = form.scheduled_date || "(unscheduled)";
    const brief = [
      `# Figma Design Prompt — ready to paste into Figma AI / Make`,
      ``,
      `## Author`,
      `- Name: ${author}`,
      `- LinkedIn: ${linkedin}`,
      `- Target platform(s): ${platforms}`,
      `- Scheduled: ${date}`,
      ``,
      `## Post content`,
      `Hook (headline):`,
      `> ${form.hook || "(no hook)"}`,
      ``,
      `Body / context:`,
      `> ${(form.body || "(no body)").slice(0, 1500)}`,
      ``,
      `## Design goal`,
      `Create a single 1080x1080 square social image that visually expresses the hook above and feels native to ${platforms}. The image must reinforce the message of the post — every visual choice (typography weight, colour, illustration, photo) should reflect the meaning and emotion of the hook and body.`,
      ``,
      `## Visual style guide (from my brand profile)`,
      style,
      ``,
      `## Layout`,
      `- Canvas: 1080 x 1080 px, safe margin 80 px on all sides.`,
      `- Top 60%: bold display headline distilled from the hook (max 8–10 words). Use 2 line breaks max.`,
      `- Bottom 40%: a supporting visual element (abstract shape, icon, illustration, or photo) that ties to the body's main idea.`,
      `- Footer (bottom 80 px): small handle "${author}" on the left, subtle brand accent shape on the right.`,
      `- No watermarks, no logos, no embedded body text other than the headline and footer name.`,
      ``,
      `## Typography`,
      `- Headline: display sans-serif, ExtraBold, 92–112 px, tight tracking.`,
      `- Footer name: sans-serif, Medium, 22 px, 70% opacity.`,
      ``,
      `## Deliverable`,
      `One Figma frame named "${(form.hook || "post").slice(0, 40)}" at 1080x1080, exportable as PNG @1x.`,
      ``,
      `## How to use`,
      `1. Open Figma → press "/" or open Figma AI / Make.`,
      `2. Paste this entire brief.`,
      `3. Adjust headline copy if needed and export as PNG.`,
    ].join("\n");
    setFigmaBrief(brief);
  }

  async function copyBrief() {
    if (!figmaBrief) return;
    try { await navigator.clipboard.writeText(figmaBrief); toast.success("Brief copied"); }
    catch { toast.error("Copy failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "New post" : "Edit post"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Hook / headline</Label><Input value={form.hook ?? ""} onChange={(e) => setForm({ ...form, hook: e.target.value })} /></div>
          <div><Label>Body</Label><Textarea rows={6} value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Visual</Label>
            <Input placeholder="Image URL — paste, or use the buttons below" value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="default" onClick={generateImage} disabled={genBusy}>
                {genBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Generate with AI
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={buildFigmaBrief}>
                <Figma className="w-4 h-4 mr-1" /> Design in Figma
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              "Generate with AI" → OpenAI <code>gpt-image-1</code> with your style prompt (Social Studio → Settings).
              "Design in Figma" → full prompt with your name + LinkedIn, ready to paste into Figma AI.
            </p>
            {form.image_url && <img src={form.image_url} alt="" className="max-h-48 rounded-md border border-border" />}
            {figmaBrief && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Figma design brief</span>
                  <Button type="button" size="sm" variant="ghost" onClick={copyBrief}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{figmaBrief}</pre>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Date</Label><Input type="date" value={form.scheduled_date ?? ""} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></div>
            <div><Label>Time</Label><Input type="time" value={(form.scheduled_time ?? "").slice(0,5)} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLANNER_PLATFORMS.map((p) => {
                const Ic = PLATFORM_ICONS[p];
                const on = (form.platforms ?? []).includes(p);
                return (
                  <button key={p} type="button" onClick={() => togglePlatform(p)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                    <Ic className="w-3 h-3" /> {p}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">When status = scheduled and date/time arrives, the cron sends this to each platform's webhook (configured in Settings → Webhooks).</p>
          </div>
          {entry?.webhook_response && (
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Webhook response</summary>
              <pre className="bg-muted/40 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(entry.webhook_response, null, 2)}</pre>
              {entry.webhook_error && <p className="text-destructive mt-1">{entry.webhook_error}</p>}
            </details>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {!isNew && <Button variant="ghost" onClick={remove} className="text-destructive"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!isNew && <Button variant="outline" onClick={sendNow} disabled={busy}><Send className="w-4 h-4 mr-1" /> Send now</Button>}
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}