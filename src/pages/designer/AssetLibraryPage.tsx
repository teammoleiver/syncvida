import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, Sparkles, Wand2, Loader2, Trash2, LinkIcon, Pencil, Eraser, Check, X, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listAssets, uploadAsset, generateAssetImageWithRefs, editAssetImage, deleteAsset,
  importAssetFromUrl, suggestAssetName, removeAssetBackground, renameAsset, setAssetProfile,
  type DesignAsset,
} from "@/lib/designer-queries";

export default function AssetLibraryPage() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [editing, setEditing] = useState<DesignAsset | null>(null);
  const [renamingAsset, setRenamingAsset] = useState<DesignAsset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() { setLoading(true); setAssets(await listAssets()); setLoading(false); }
  useEffect(() => { reload(); }, []);

  async function onUpload(file: File) {
    try { await uploadAsset(file); toast.success("Uploaded"); reload(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/designer"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Link></Button>
          <h1 className="font-display text-2xl font-bold">Asset library</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Upload</Button>
          <Button variant="outline" onClick={() => setUrlOpen(true)}><LinkIcon className="w-4 h-4 mr-1" /> Add by URL</Button>
          <Button onClick={() => setGenOpen(true)}><Sparkles className="w-4 h-4 mr-1" /> Generate with AI</Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground -mt-2">
        Tip: upload several headshots and mark them with the <User className="w-3 h-3 inline -mt-0.5" /> button as <strong>Profile photos</strong> — your LinkedIn carousel face is picked from those. Other assets are references for AI image generation.
      </p>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : assets.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No assets yet. Upload a file, paste an image URL, or generate one with AI.
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} onEdit={() => setEditing(a)} onRename={() => setRenamingAsset(a)} onChanged={reload} />
            ))}
          </div>
        )}

      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} onCreated={reload} assets={assets} />
      <UrlImportDialog open={urlOpen} onClose={() => setUrlOpen(false)} onCreated={reload} />
      <EditDialog asset={editing} onClose={() => setEditing(null)} onSaved={reload} onRename={(a) => { setEditing(null); setRenamingAsset(a); }} />
      <RenameDialog asset={renamingAsset} onClose={() => setRenamingAsset(null)} onSaved={reload} />
    </section>
  );
}

function AssetCard({ asset, onEdit, onRename, onChanged }: { asset: DesignAsset; onEdit: () => void; onRename: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const isProfile = !!asset.is_profile;

  async function aiName() {
    setBusy(true);
    try {
      const { data, error } = await suggestAssetName(asset.id);
      if (error) throw error;
      const d = data as any; if (d?.error) throw new Error(d.error);
      toast.success(`Named: ${d.name}`); onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  async function toggleProfile() {
    setBusy(true);
    try {
      await setAssetProfile(asset.id, !isProfile);
      toast.success(isProfile ? "Removed from profile photos" : "Marked as a profile photo");
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Card className={`overflow-hidden group relative ${isProfile ? "ring-2 ring-primary" : ""}`}>
      <img src={asset.public_url} alt={asset.name ?? ""} className="w-full aspect-square object-cover bg-muted" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 flex justify-between gap-1">
        <Button size="sm" variant="secondary" onClick={onEdit}><Wand2 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
        <Button size="icon" variant="destructive" onClick={async () => { if (confirm("Delete?")) { await deleteAsset(asset); onChanged(); } }}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="absolute top-1 left-1 text-[10px] uppercase bg-background/80 px-1.5 py-0.5 rounded">{asset.kind.replace("_", " ")}</div>
      {isProfile && (
        <div className="absolute top-1 right-1 text-[9px] uppercase font-bold tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <User className="w-2.5 h-2.5" /> Profile
        </div>
      )}
      <div className="p-2 border-t border-border flex items-center gap-1">
        <button className="text-xs truncate text-left flex-1 hover:underline flex items-center gap-1"
          title={`${asset.name ?? "Untitled"} — click to rename`} onClick={onRename}>
          <span className="truncate">{asset.name || <span className="text-muted-foreground italic">Untitled</span>}</span>
        </button>
        <Button size="icon" variant="ghost" className={`h-6 w-6 shrink-0 ${isProfile ? "text-primary" : ""}`}
          title={isProfile ? "Remove from profile photos" : "Use as a profile photo (carousel face)"} onClick={toggleProfile} disabled={busy}>
          <User className="w-3 h-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Rename" onClick={onRename}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Suggest name with AI" onClick={aiName} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        </Button>
      </div>
    </Card>
  );
}

function RenameDialog({ asset, onClose, onSaved }: { asset: DesignAsset | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => { setName(asset?.name ?? ""); }, [asset?.id]);

  async function save() {
    if (!asset) return;
    setBusy(true);
    try { await renameAsset(asset.id, name.trim()); toast.success("Renamed"); onSaved(); onClose(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  async function ai() {
    if (!asset) return;
    setAiBusy(true);
    try {
      const { data, error } = await suggestAssetName(asset.id);
      if (error) throw error;
      const d = data as any; if (d?.error) throw new Error(d.error);
      setName(d.name); toast.success("AI suggested a name");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setAiBusy(false); }
  }

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename asset</DialogTitle></DialogHeader>
        {asset && (
          <div className="space-y-3">
            <img src={asset.public_url} alt="" className="w-full max-h-48 object-contain rounded border border-border bg-muted" />
            <div>
              <label className="text-xs font-medium mb-1 block">Asset name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clay logo" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy || aiBusy} className="flex-1">
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}Save name
              </Button>
              <Button variant="outline" onClick={ai} disabled={busy || aiBusy} title="Let AI suggest a name based on the image">
                {aiBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}Suggest with AI
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Tip: a clear name helps AI pick the right reference when generating new images.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UrlImportDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await importAssetFromUrl(url.trim(), name.trim() || undefined);
      if (error) throw error;
      const d = data as any; if (d?.error) throw new Error(d.error);
      toast.success("Imported");
      setUrl(""); setName(""); onCreated(); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add asset by URL</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Paste a direct link to an image (logo, photo, icon…). It'll be downloaded and added to your library.</p>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/logo.png" autoFocus />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional name (e.g. Clay logo)" />
          <Button onClick={go} disabled={busy || !url.trim()} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ open, onClose, onCreated, assets }: { open: boolean; onClose: () => void; onCreated: () => void; assets: DesignAsset[] }) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [busy, setBusy] = useState(false);
  const [refIds, setRefIds] = useState<string[]>([]);

  const refOptions = useMemo(() => assets.slice(0, 60), [assets]);

  function toggleRef(id: string) {
    setRefIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length >= 6 ? cur : [...cur, id]));
  }

  async function go() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await generateAssetImageWithRefs(prompt, aspect, refIds);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      onCreated(); onClose(); setPrompt(""); setRefIds([]);
      toast.success("Image generated");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Generate image with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={4}
            value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image you want… e.g. 'Hero banner with my photo on a dark gradient, Clay logo in the corner'" />
          <Select value={aspect} onValueChange={(v) => setAspect(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1:1">Square 1:1</SelectItem>
              <SelectItem value="4:5">Portrait 4:5</SelectItem>
              <SelectItem value="9:16">Story 9:16</SelectItem>
            </SelectContent>
          </Select>

          {refOptions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Reference assets <span className="text-muted-foreground">({refIds.length}/6)</span></p>
                {refIds.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setRefIds([])}>Clear</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Pick logos, your photo, or any asset you want incorporated into the generated image.</p>
              <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto p-1 rounded border border-border bg-muted/30">
                {refOptions.map((a) => {
                  const sel = refIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => toggleRef(a.id)}
                      title={a.name ?? a.kind}
                      className={`relative aspect-square rounded overflow-hidden border-2 transition ${sel ? "border-primary ring-2 ring-primary/40" : "border-transparent hover:border-border"}`}>
                      <img src={a.public_url} alt="" className="w-full h-full object-cover" />
                      {sel && <div className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground rounded-full p-0.5"><Check className="w-2.5 h-2.5" /></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button onClick={go} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ asset, onClose, onSaved, onRename }: { asset: DesignAsset | null; onClose: () => void; onSaved: () => void; onRename: (a: DesignAsset) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);

  const presets = [
    "Remove all text from the image",
    "Change background to a clean dark gradient",
    "Make the colors more vibrant and modern",
    "Add subtle film grain and a warm tone",
  ];

  async function go() {
    if (!asset || !prompt.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await editAssetImage(asset.id, prompt);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      toast.success("Edited image saved");
      setPrompt(""); onSaved(); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  async function removeBg() {
    if (!asset) return;
    setBgBusy(true);
    try {
      const { data, error } = await removeAssetBackground(asset.id);
      if (error) throw error;
      const d = data as any; if (d?.error) throw new Error(d.error);
      toast.success("Background removed");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBgBusy(false); }
  }

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit with AI</DialogTitle></DialogHeader>
        {asset && (
          <div className="space-y-3">
            <img src={asset.public_url} alt={asset.name ?? ""} className="w-full max-h-72 object-contain rounded border border-border bg-muted" />
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">{asset.name || <span className="italic">Untitled</span>}</span>
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onRename(asset)}>
                <Pencil className="w-3 h-3 mr-1" /> Rename
              </Button>
            </div>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. make the background dark green and add subtle grain" />
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => setPrompt(p)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-accent transition">{p}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={go} disabled={busy || bgBusy} className="flex-1">
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}Apply edit
              </Button>
              <Button variant="outline" onClick={removeBg} disabled={busy || bgBusy}>
                {bgBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eraser className="w-4 h-4 mr-1" />}Remove background
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Edits and background removal create a new asset; the original is preserved.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}