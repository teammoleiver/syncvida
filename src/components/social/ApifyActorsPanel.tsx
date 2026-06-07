import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Star, Pencil, Check, X, Bot, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listApifyActors, createApifyActor, updateApifyActor, deleteApifyActor, setDefaultApifyActor,
  parseApifyActorId,
  type ApifyActor, type ApifyActorKind,
} from "@/lib/social-queries";

// The actors Syncvida actually runs by default across the system. Shown so you
// can see (and test) exactly what's scraping, even before registering your own.
const BUILTIN_ACTORS = [
  { label: "LinkedIn posts scraper", actor_id: "94SdiE9JwTx0RNyfS", usedBy: "LinkedIn → scrape posts (daily cron + on-demand)" },
  { label: "LinkedIn profile scraper", actor_id: "apivault_labs/linkedin-profile-scraper", usedBy: "LinkedIn → Analyze my profile" },
  { label: "YouTube channel scraper", actor_id: "67Q6fmd8iedTVcCwY", usedBy: "YouTube → fetch videos" },
  { label: "YouTube transcript scraper", actor_id: "faVsWy9VTSNVIhWpR", usedBy: "YouTube → video transcripts" },
];

// Build an Apify link from an id ("abc123" → console) or owner/name ("a/b" → store).
function actorUrl(id: string): string {
  const norm = id.replace("~", "/");
  if (norm.includes("/")) {
    const [owner, name] = norm.split("/");
    return `https://apify.com/${owner}/${name}`;
  }
  return `https://console.apify.com/actors/${id}`;
}

/** Tests an actor via the test-apify-actor function (GET only — no run cost). */
function ActorTestButton({ actorId }: { actorId: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  async function test() {
    setTesting(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-apify-actor", { body: { actor_id: actorId } });
      if (error) throw error;
      const r = data as any;
      setResult(r?.ok ? { ok: true, msg: r.title || r.name || "Working" } : { ok: false, msg: r?.error || "Failed" });
    } catch (e: any) { setResult({ ok: false, msg: e?.message ?? "Test failed" }); }
    finally { setTesting(false); }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-7" onClick={test} disabled={testing}>
        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
      </Button>
      {result && (
        <span className={`text-[11px] ${result.ok ? "text-emerald-600" : "text-red-500"}`} title={result.msg}>
          {result.ok ? "✓ " : "✗ "}{result.msg.slice(0, 30)}
        </span>
      )}
    </span>
  );
}

const KIND_LABELS: Record<ApifyActorKind, string> = {
  youtube_channel: "YouTube channel",
  youtube_video_transcript: "YouTube video transcript",
  linkedin_profile: "LinkedIn profile",
  linkedin_company: "LinkedIn company",
  twitter: "Twitter / X",
  instagram: "Instagram",
  tiktok: "TikTok",
  other: "Other",
};

const KINDS = Object.keys(KIND_LABELS) as ApifyActorKind[];

/**
 * Per-user Apify actor presets — lets the user register multiple actors and
 * mark one as default per kind. Edge functions look up the default for the
 * kind they need (e.g. youtube_channel) and call that actor.
 */
export default function ApifyActorsPanel() {
  const [actors, setActors] = useState<ApifyActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<ApifyActorKind>("youtube_channel");
  const [label, setLabel] = useState("");
  const [actor, setActor] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [notes, setNotes] = useState("");
  const [inputTemplate, setInputTemplate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ApifyActor> & { _inputTemplateText?: string }>({});

  async function load() {
    setLoading(true);
    try { setActors(await listApifyActors()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load actors"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!actor.trim()) { toast.error("Actor URL or ID required"); return; }
    let parsedTemplate: any = null;
    if (inputTemplate.trim()) {
      try { parsedTemplate = JSON.parse(inputTemplate); }
      catch { toast.error("Input template must be valid JSON"); return; }
    }
    setBusy(true);
    try {
      await createApifyActor({
        kind, label: label.trim() || KIND_LABELS[kind],
        actor_id: actor, is_default: isDefault, notes: notes.trim() || undefined,
        input_template: parsedTemplate,
      });
      toast.success("Actor saved");
      setLabel(""); setActor(""); setNotes(""); setInputTemplate(""); setIsDefault(true); setShowAdd(false);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  async function makeDefault(a: ApifyActor) {
    try { await setDefaultApifyActor(a.id, a.kind); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this actor preset?")) return;
    try { await deleteApifyActor(id); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  function startEdit(a: ApifyActor) {
    setEditingId(a.id);
    setEditDraft({
      label: a.label, actor_id: a.actor_id, notes: a.notes ?? "", kind: a.kind,
      _inputTemplateText: a.input_template ? JSON.stringify(a.input_template, null, 2) : "",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    let parsedTemplate: any = null;
    const tmplText = editDraft._inputTemplateText?.trim();
    if (tmplText) {
      try { parsedTemplate = JSON.parse(tmplText); }
      catch { toast.error("Input template must be valid JSON"); return; }
    }
    try {
      await updateApifyActor(editingId, {
        label: editDraft.label?.trim() || "Actor",
        actor_id: editDraft.actor_id?.trim() || "",
        notes: editDraft.notes ?? null,
        kind: editDraft.kind as ApifyActorKind,
        input_template: parsedTemplate,
      });
      toast.success("Actor updated");
      setEditingId(null); setEditDraft({});
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  // Group by kind for display
  const grouped: Record<string, ApifyActor[]> = {};
  for (const a of actors) {
    (grouped[a.kind] ??= []).push(a);
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="font-medium">Apify actors</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" /> Add actor
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong>Built-in</strong> actors (below) run by default and can't be deleted. Add your own only to <em>override</em> a
        default or scrape a new platform — those you can edit or delete. Click an ID to open it on Apify; <strong>Test</strong>
        confirms it's reachable with your token (no run cost).
      </p>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Built-in · always available</div>
        {BUILTIN_ACTORS.map((a) => (
          <div key={a.actor_id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 p-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
                <span className="font-medium text-sm">{a.label}</span>
                <a href={actorUrl(a.actor_id)} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 truncate max-w-[260px]">{a.actor_id} <ExternalLink className="w-3 h-3" /></a>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{a.usedBy}</div>
            </div>
            <ActorTestButton actorId={a.actor_id} />
          </div>
        ))}
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Your custom actors</div>

      {showAdd && (
        <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Kind</label>
              <Select value={kind} onValueChange={(v) => setKind(v as ApifyActorKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Label</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fast YouTube Channel Scraper" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Actor URL or ID</label>
            <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="https://console.apify.com/actors/67Q6fmd8iedTVcCwY  or  grown_armadillo/fast-youtube-channel-scraper" />
            {actor && <p className="text-xs text-muted-foreground mt-1">Will use actor: <code>{parseApifyActorId(actor) || actor}</code></p>}
          </div>
          <div>
            <label className="text-xs font-medium">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="When to use this one, cost notes, etc." />
          </div>
          <div>
            <label className="text-xs font-medium">Input template (optional JSON)</label>
            <textarea
              className="w-full text-xs font-mono p-2 rounded-md border border-border bg-background min-h-[90px]"
              value={inputTemplate}
              onChange={(e) => setInputTemplate(e.target.value)}
              placeholder={`{ "videoUrl": "{url}", "targetLanguage": "en" }   //  use {url}, {video_url}, {video_id} placeholders`}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Leave blank for sensible defaults. Placeholders <code>{"{url}"}</code>, <code>{"{video_url}"}</code>, <code>{"{video_id}"}</code> are substituted at runtime.</p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Set as default for {KIND_LABELS[kind]}
          </label>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={add} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Save
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : actors.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">
          Using Syncvida's built-in default actors (YouTube channel, YouTube transcript, LinkedIn profile). You don't need to add anything here —
          just make sure you have an Apify API account above. Add an actor only to override a built-in default.
        </div>
      ) : (
        <div className="space-y-3">
          {KINDS.filter((k) => grouped[k]?.length).map((k) => (
            <div key={k} className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{KIND_LABELS[k]}</div>
              {grouped[k].map((a) => {
                const isEditing = editingId === a.id;
                return (
                  <div key={a.id} className="rounded-md border border-border p-3 space-y-2">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium">Kind</label>
                            <Select value={editDraft.kind ?? a.kind} onValueChange={(v) => setEditDraft({ ...editDraft, kind: v as ApifyActorKind })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {KINDS.map((kk) => <SelectItem key={kk} value={kk}>{KIND_LABELS[kk]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Label</label>
                            <Input value={editDraft.label ?? ""} onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Actor URL or ID</label>
                          <Input value={editDraft.actor_id ?? ""} onChange={(e) => setEditDraft({ ...editDraft, actor_id: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Notes</label>
                          <Input value={editDraft.notes ?? ""} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Input template (optional JSON)</label>
                          <textarea
                            className="w-full text-xs font-mono p-2 rounded-md border border-border bg-background min-h-[90px]"
                            value={editDraft._inputTemplateText ?? ""}
                            onChange={(e) => setEditDraft({ ...editDraft, _inputTemplateText: e.target.value })}
                            placeholder={`{ "videoUrl": "{url}", "targetLanguage": "en" }`}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">Use <code>{"{url}"}</code>, <code>{"{video_url}"}</code>, <code>{"{video_id}"}</code> placeholders. Leave blank for defaults.</p>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditDraft({}); }}><X className="w-3 h-3 mr-1" />Cancel</Button>
                          <Button size="sm" onClick={saveEdit}><Check className="w-3 h-3 mr-1" />Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {a.is_default && <Badge variant="secondary" className="gap-1"><Star className="w-3 h-3" />Default</Badge>}
                          <span className="font-medium text-sm truncate">{a.label}</span>
                          <Badge variant="outline" className="font-mono text-[10px] truncate max-w-[260px]">{a.actor_id}</Badge>
                          {a.notes && <span className="text-[11px] text-muted-foreground italic truncate max-w-[300px]">{a.notes}</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <ActorTestButton actorId={a.actor_id} />
                          {!a.is_default && (
                            <Button size="sm" variant="ghost" onClick={() => makeDefault(a)} title="Make default for this kind">
                              <Star className="w-3 h-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => startEdit(a)} title="Edit">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(a.id)} title="Delete">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
