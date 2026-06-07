import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Eye, EyeOff, Check, X, Loader2, Lock, KeyRound, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getWriterSettings, upsertWriterSettings } from "@/lib/social-queries";
import { AI_PROVIDERS, AI_PROVIDER_BY_ID, type AiProvider } from "@/lib/ai-providers";

/** One provider's key row: Active badge + masked key + Test / View (password) / Replace / Remove. */
function ProviderKeyRow({ provider, value, model, onChange, onModel, onSave, onRemove }: {
  provider: AiProvider; value: string; model: string;
  onChange: (v: string) => void; onModel: (v: string) => void;
  onSave: (keyVal: string, modelVal: string) => Promise<void>; onRemove: () => void;
}) {
  const saved = !!(value && value.trim());
  const [editing, setEditing] = useState(!saved);
  const [draft, setDraft] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Persist this provider's key to Supabase immediately (survives refresh/logout).
  async function saveKey() {
    const keyVal = (draft.trim() || value).trim();
    if (!keyVal) { setResult({ ok: false, msg: "Enter a key first" }); return; }
    setSaving(true);
    try { await onSave(keyVal, model); setEditing(false); setDraft(""); setResult({ ok: true, msg: "Saved" }); }
    catch (e: any) { setResult({ ok: false, msg: e?.message ?? "Save failed" }); }
    finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setResult(null);
    try {
      const key = editing && draft.trim() ? draft.trim() : value;
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { provider: provider.id, key, base_url: provider.kind === "compat" ? provider.baseUrl : undefined },
      });
      if (error) throw error;
      const r = data as any;
      setResult(r?.ok ? { ok: true, msg: r.detail || "Working" } : { ok: false, msg: r?.error || "Failed" });
    } catch (e: any) { setResult({ ok: false, msg: e?.message ?? "Test failed" }); }
    finally { setTesting(false); }
  }

  async function verifyPassword() {
    setVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No account email on file.");
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pw });
      if (error) throw new Error("Incorrect password.");
      setRevealed(true); setPwOpen(false); setPw("");
    } catch (e: any) { toast.error(e?.message ?? "Verification failed"); }
    finally { setVerifying(false); }
  }

  const masked = value ? `${value.slice(0, 6)}${"•".repeat(8)}${value.slice(-4)}` : "";

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{provider.name}</span>
          {saved && <Badge variant="secondary" className="gap-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active</Badge>}
          {provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5">Get a key <ExternalLink className="w-3 h-3" /></a>}
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRemove} title="Remove provider"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
      </div>

      {saved && !editing ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <code className="text-xs font-mono truncate flex-1">{revealed ? value : masked}</code>
          {revealed ? (
            <button type="button" onClick={() => setRevealed(false)} className="text-muted-foreground hover:text-foreground" title="Hide"><EyeOff className="w-4 h-4" /></button>
          ) : (
            <button type="button" onClick={() => setPwOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Unlock with your password"><Lock className="w-3.5 h-3.5" /> View</button>
          )}
        </div>
      ) : (
        <Input type="text" value={draft} autoComplete="off" placeholder={provider.placeholder}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); setResult(null); }}
          className="font-mono text-xs" />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Input value={model} onChange={(e) => onModel(e.target.value)} placeholder={`Model (default ${provider.defaultModel})`} className="h-8 text-xs flex-1 min-w-[160px]" />
        <Button type="button" size="sm" variant="outline" onClick={test} disabled={testing || (!saved && !draft.trim())}>
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
        </Button>
        <Button type="button" size="sm" onClick={saveKey} disabled={saving || (!draft.trim() && !value)}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
        </Button>
        {saved && !editing && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(true); setDraft(""); setRevealed(false); }}>Replace</Button>}
        {saved && editing && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(""); onChange(value); }}>Cancel</Button>}
      </div>
      {result && (
        <p className={`text-[11px] flex items-center gap-1 ${result.ok ? "text-emerald-600" : "text-red-500"}`}>
          {result.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {result.ok ? "" : "Failed — "}{result.msg}
        </p>
      )}

      <Dialog open={pwOpen} onOpenChange={(v) => { if (!v) { setPwOpen(false); setPw(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Confirm your password</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">For security, enter your Syncvida account password to reveal this API key.</p>
          <Input type="password" autoFocus value={pw} placeholder="Your account password"
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pw) verifyPassword(); }} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPwOpen(false); setPw(""); }}>Cancel</Button>
            <Button onClick={verifyPassword} disabled={!pw || verifying}>{verifying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />} Reveal key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Universal AI provider settings — the single source of AI credentials for the
 * WHOLE app. Supports 20 popular providers (OpenAI, Anthropic, Gemini, Grok,
 * Mistral, Groq, DeepSeek, …). Keys live in social_writer_settings.ai_provider_keys;
 * openai/anthropic also mirror to dedicated columns so existing functions work.
 */
export default function AiProviderSettings() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [preferred, setPreferred] = useState<string>("openai");
  const [addId, setAddId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const data: any = await getWriterSettings().catch(() => null);
      const map: Record<string, string> = { ...((data?.ai_provider_keys as any) ?? {}) };
      // Seed from legacy dedicated columns so existing users keep their keys.
      if (!map.openai && data?.openai_api_key) map.openai = data.openai_api_key;
      if (!map.anthropic && data?.anthropic_api_key) map.anthropic = data.anthropic_api_key;
      const mdl: Record<string, string> = { ...((data?.ai_provider_models as any) ?? {}) };
      if (!mdl.openai && data?.openai_model) mdl.openai = data.openai_model;
      if (!mdl.anthropic && data?.anthropic_model) mdl.anthropic = data.anthropic_model;
      setKeys(map); setModels(mdl);
      // Lovable is retired — default to OpenAI; migrate any old "lovable" pref.
      setPreferred(!data?.preferred_provider || data.preferred_provider === "lovable" ? "openai" : data.preferred_provider);
      setLoading(false);
    })();
  }, []);

  // Single writer to Supabase. Empty keys are dropped so nothing junk persists.
  async function persist(nextKeys: Record<string, string>, nextModels: Record<string, string>, nextPreferred: string) {
    const cleanKeys = Object.fromEntries(Object.entries(nextKeys).filter(([, v]) => v && String(v).trim()));
    await upsertWriterSettings({
      ai_provider_keys: cleanKeys,
      ai_provider_models: nextModels,
      preferred_provider: nextPreferred,
      // Mirror so the existing edge functions (which read these columns) work.
      openai_api_key: cleanKeys.openai ?? null,
      anthropic_api_key: cleanKeys.anthropic ?? null,
      openai_model: nextModels.openai ?? null,
      anthropic_model: nextModels.anthropic ?? null,
    });
  }

  async function save() {
    setBusy(true);
    try { await persist(keys, models, preferred); toast.success("AI settings saved — used across the whole app"); }
    catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setBusy(false); }
  }

  // Auto-save a single provider's key+model immediately (survives refresh/logout).
  async function saveProvider(id: string, keyVal: string, modelVal: string) {
    const nextKeys = { ...keys, [id]: keyVal };
    const nextModels = { ...models, [id]: modelVal };
    setKeys(nextKeys); setModels(nextModels);
    await persist(nextKeys, nextModels, preferred);
  }

  async function removeProvider(id: string) {
    const nextKeys = { ...keys }; delete nextKeys[id];
    const nextModels = { ...models }; delete nextModels[id];
    setKeys(nextKeys); setModels(nextModels);
    await persist(nextKeys, nextModels, preferred);
    toast.success("Provider removed");
  }

  async function changePreferred(v: string) {
    setPreferred(v);
    try { await persist(keys, models, v); } catch { /* saved on next action */ }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  // Providers that have a key (or the built-in) → shown as configured.
  // A provider is "configured" once it has a key entry (even an empty one being
  // typed); "available" providers are those with no entry yet.
  const configured = AI_PROVIDERS.filter((p) => p.builtin || keys[p.id] !== undefined);
  const available = AI_PROVIDERS.filter((p) => !p.builtin && keys[p.id] === undefined);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><h2 className="font-display font-semibold">AI provider — used everywhere</h2></div>
        <p className="text-xs text-muted-foreground">
          One place for your AI credentials, across <strong>20 providers</strong>. <strong>Every</strong> AI feature in Syncvida runs on
          these keys; leave them blank to use Syncvida's built-in keys. The preferred provider is tried first, then it falls back automatically.
        </p>

        <div>
          <label className="text-xs font-medium">Preferred provider</label>
          <Select value={preferred} onValueChange={changePreferred}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{(keys[p.id] || p.builtin) ? "" : " (no key)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-1">Backend execution runs OpenAI & Anthropic today; the other OpenAI-compatible providers roll out next — keys you add here are stored and testable now.</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save AI settings</Button>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-display font-semibold text-sm">Provider API keys</h3>
          <Select
            value={addId}
            onValueChange={(id) => { if (id) { setKeys((k) => (k[id] !== undefined ? k : { ...k, [id]: "" })); setAddId(""); } }}
          >
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="+ Add a provider…" /></SelectTrigger>
            <SelectContent>
              {available.length === 0
                ? <div className="px-2 py-1.5 text-xs text-muted-foreground">All providers added</div>
                : available.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {configured.length === 0 && (
          <p className="text-sm text-muted-foreground italic py-2">No provider keys yet — pick one from <strong>“+ Add a provider…”</strong> above, paste your key, then Save.</p>
        )}

        <div className="space-y-2">
          {configured.map((p) => p.builtin ? (
            <div key={p.id} className="rounded-md border border-border bg-muted/20 p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2"><span className="font-medium text-sm">{p.name}</span><Badge variant="secondary" className="text-[10px]">Built-in · no key needed</Badge></div>
              <span className="text-[11px] text-muted-foreground">Platform default ({p.defaultModel})</span>
            </div>
          ) : (
            <ProviderKeyRow
              key={p.id}
              provider={p}
              value={keys[p.id] ?? ""}
              model={models[p.id] ?? ""}
              onChange={(v) => setKeys((k) => ({ ...k, [p.id]: v }))}
              onModel={(v) => setModels((m) => ({ ...m, [p.id]: v }))}
              onSave={(keyVal, modelVal) => saveProvider(p.id, keyVal, modelVal)}
              onRemove={() => removeProvider(p.id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Each key is <strong>saved to your account</strong> the moment you click <strong>Save</strong> on its row — it persists across refresh and logout. Keys are hidden by default; <strong>View</strong> requires your account password.</p>
      </Card>
    </div>
  );
}
