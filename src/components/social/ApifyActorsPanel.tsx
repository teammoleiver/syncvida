import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Star, Pencil, Check, X, Bot } from "lucide-react";
import { toast } from "sonner";
import {
  listApifyActors, createApifyActor, updateApifyActor, deleteApifyActor, setDefaultApifyActor,
  parseApifyActorId,
  type ApifyActor, type ApifyActorKind,
} from "@/lib/social-queries";

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
        <strong>Optional / advanced.</strong> Syncvida ships with built-in default actors for YouTube and LinkedIn,
        so you only need to add an Apify <em>API account</em> above — no actor setup required. Add an actor here
        only if you want to <em>override</em> the built-in default for a kind (e.g. a faster or cheaper scraper).
      </p>

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
