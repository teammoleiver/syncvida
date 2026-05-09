import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Palette, Plus, FileText, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  listCanvaTemplates, listCanvaDesigns, createCanvaDesign,
  type CanvaTemplate, type CanvaDesign,
} from "@/lib/social-connections";

type Mode = "blank" | "templates" | "existing";

export function CanvaDesignPicker({
  open, onClose, planId, hook, body, onLinked,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  hook: string;
  body: string;
  /** Called once a design is created/picked. Receives the Canva edit URL so
   *  the editor can open it in a new tab and the design id so the planner
   *  knows what to export later. */
  onLinked: (args: { design_id: string; edit_url: string | null }) => void;
}) {
  const [mode, setMode] = useState<Mode>("blank");
  const [busy, setBusy] = useState(false);
  const [blankSize, setBlankSize] = useState("linkedin_post");

  const SIZES: { key: string; label: string; w: number; h: number }[] = [
    { key: "linkedin_post", label: "LinkedIn post (1200×627)", w: 1200, h: 627 },
    { key: "linkedin_square", label: "LinkedIn square (1080×1080)", w: 1080, h: 1080 },
    { key: "linkedin_carousel", label: "LinkedIn carousel slide (1080×1350)", w: 1080, h: 1350 },
    { key: "instagram_post", label: "Instagram post (1080×1080)", w: 1080, h: 1080 },
    { key: "instagram_portrait", label: "Instagram portrait (1080×1350)", w: 1080, h: 1350 },
    { key: "instagram_story", label: "Instagram story (1080×1920)", w: 1080, h: 1920 },
    { key: "facebook_post", label: "Facebook post (1200×630)", w: 1200, h: 630 },
    { key: "twitter_post", label: "Twitter / X (1600×900)", w: 1600, h: 900 },
  ];

  async function createBlank() {
    setBusy(true);
    try {
      const r = await createCanvaDesign({
        plan_id: planId,
        kind: "blank",
        design_type: blankSize,
        title: hook?.slice(0, 60) || "Syncvida design",
      });
      if (!r.design_id) throw new Error("No design id returned");
      toast.success("Canva design created");
      onLinked({ design_id: r.design_id, edit_url: r.edit_url });
      if (r.edit_url) window.open(r.edit_url, "_blank", "noopener");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-400" /> Design in Canva
          </DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="blank"><Plus className="w-3.5 h-3.5 mr-1" /> Blank</TabsTrigger>
            <TabsTrigger value="templates"><Sparkles className="w-3.5 h-3.5 mr-1" /> Brand template</TabsTrigger>
            <TabsTrigger value="existing"><FileText className="w-3.5 h-3.5 mr-1" /> Pick existing</TabsTrigger>
          </TabsList>

          <TabsContent value="blank" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Creates an empty design in your Canva account, opens it in a new tab,
              and links it to this calendar entry. When you're done designing, come back and click
              <strong> "Pull from Canva"</strong> on the post to import the PNG.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Canvas size</label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {SIZES.map((s) => (
                  <button key={s.key} onClick={() => setBlankSize(s.key)}
                    className={`text-left px-2.5 py-2 rounded border text-xs transition-colors ${blankSize === s.key ? "border-purple-500 bg-purple-500/10 text-purple-200" : "border-border hover:border-purple-400 text-muted-foreground hover:text-foreground"}`}>
                    <div className="font-medium">{s.label.split(" (")[0]}</div>
                    <div className="text-[10px] opacity-70">{s.w} × {s.h}</div>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createBlank} disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Palette className="w-4 h-4 mr-1" />}
              Open empty design in Canva
            </Button>
          </TabsContent>

          <TabsContent value="templates" className="pt-4">
            <BrandTemplatesTab planId={planId} hook={hook} body={body} onLinked={(x) => { onLinked(x); onClose(); }} />
          </TabsContent>

          <TabsContent value="existing" className="pt-4">
            <ExistingDesignsTab planId={planId} onLinked={(x) => { onLinked(x); onClose(); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function BrandTemplatesTab({
  planId, hook, body, onLinked,
}: {
  planId: string; hook: string; body: string;
  onLinked: (args: { design_id: string; edit_url: string | null }) => void;
}) {
  const [items, setItems] = useState<CanvaTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CanvaTemplate | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCanvaTemplates().then(setItems).catch((e) => { setError(e?.message ?? "Failed to load templates"); setItems([]); });
  }, []);

  // Has the template been configured with autofill placeholder fields in Canva?
  const hasAutofillFields = !!picked?.dataset && Object.keys(picked.dataset?.fields ?? picked.dataset ?? {}).length > 0;

  // When user picks a template, prefill any text placeholders that look like hook/body
  useEffect(() => {
    if (!hasAutofillFields) { setFields({}); return; }
    const dataset = picked!.dataset.fields ?? picked!.dataset;
    const init: Record<string, string> = {};
    for (const key of Object.keys(dataset)) {
      const lower = key.toLowerCase();
      if (lower.includes("hook") || lower.includes("title") || lower.includes("headline")) init[key] = hook;
      else if (lower.includes("body") || lower.includes("text") || lower.includes("subtitle")) init[key] = body.slice(0, 500);
      else init[key] = "";
    }
    setFields(init);
  }, [picked, hook, body, hasAutofillFields]);

  async function autofill() {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await createCanvaDesign({
        plan_id: planId, kind: "autofill",
        brand_template_id: picked.id,
        fields,
        title: hook?.slice(0, 60) || "Syncvida autofill",
      });
      if (!r.design_id) throw new Error("Autofill failed (no design id)");
      toast.success("Template autofilled — opening in Canva");
      onLinked({ design_id: r.design_id, edit_url: r.edit_url });
      if (r.edit_url) window.open(r.edit_url, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Autofill failed"); }
    finally { setBusy(false); }
  }

  function openTemplateInCanva() {
    if (!picked?.view_url) { toast.error("This template has no view URL"); return; }
    window.open(picked.view_url, "_blank", "noopener");
    toast.info("Click 'Use this template' in Canva to make a copy, then return and use 'Pick existing' to link it.");
  }

  if (error) return <div className="text-xs text-destructive">{error}</div>;
  if (!items) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…</div>;
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground space-y-2">
        <p>No brand templates found in your Canva account.</p>
        <p className="text-xs">Brand Templates require Canva Pro. Create one in Canva, mark it as a Brand Template, then come back.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {!picked ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
          {items.map((t) => (
            <button key={t.id} onClick={() => setPicked(t)}
              className="text-left rounded-md border border-border hover:border-primary overflow-hidden">
              {t.thumbnail_url
                ? <img src={t.thumbnail_url} alt="" className="w-full aspect-square object-cover" />
                : <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground"><Sparkles className="w-6 h-6" /></div>}
              <div className="p-2 text-xs font-medium truncate">{t.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {picked.thumbnail_url && <img src={picked.thumbnail_url} className="w-20 h-20 rounded object-cover" />}
            <div className="flex-1">
              <div className="text-sm font-medium">{picked.title}</div>
              <button onClick={() => setPicked(null)} className="text-xs text-primary underline">choose a different template</button>
            </div>
          </div>
          {hasAutofillFields ? (
            <>
              <div className="space-y-2">
                {Object.entries(fields).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] uppercase text-muted-foreground">{key}</label>
                    <Input value={value} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={autofill} disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Autofill & open in Canva
                </Button>
              </div>
            </>
          ) : (
            <Card className="p-3 border-amber-500/30 bg-amber-500/5 space-y-2 text-xs">
              <p className="text-amber-300 font-medium">This template has no autofill placeholders.</p>
              <p className="text-muted-foreground">
                To use autofill, open this template in Canva, select a text/image element, click <strong>"Add to dataset"</strong> in the toolbar to mark it as an autofill field, then come back here.
              </p>
              <p className="text-muted-foreground">
                Or just open it directly and design manually:
              </p>
              <Button onClick={openTemplateInCanva} variant="outline" className="w-full">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open template in Canva
              </Button>
              <p className="text-[10px] text-muted-foreground">
                After Canva creates a copy, come back and use the <strong>Pick existing</strong> tab to link it.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ExistingDesignsTab({
  planId, onLinked,
}: { planId: string; onLinked: (args: { design_id: string; edit_url: string | null }) => void }) {
  const [items, setItems] = useState<CanvaDesign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setItems(null); setError(null);
    try { setItems(await listCanvaDesigns(q || undefined)); }
    catch (e: any) { setError(e?.message ?? "Failed to load"); setItems([]); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function pick(d: CanvaDesign) {
    setBusy(d.id);
    try {
      const r = await createCanvaDesign({
        plan_id: planId, kind: "from_design", source_design_id: d.id,
      });
      onLinked({ design_id: d.id, edit_url: r.edit_url ?? d.edit_url });
      if ((r.edit_url ?? d.edit_url)) window.open((r.edit_url ?? d.edit_url)!, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  if (error) return <div className="text-xs text-destructive">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search your Canva designs" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        <Button variant="outline" onClick={load} disabled={!items}>Search</Button>
      </div>
      {!items ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No designs found.</Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto">
          {items.map((d) => (
            <button key={d.id} onClick={() => pick(d)} disabled={busy === d.id}
              className="text-left rounded-md border border-border hover:border-primary overflow-hidden">
              {d.thumbnail_url
                ? <img src={d.thumbnail_url} className="w-full aspect-square object-cover" />
                : <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground"><FileText className="w-6 h-6" /></div>}
              <div className="p-2 text-xs font-medium truncate flex items-center gap-1">
                {busy === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                {d.title}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
