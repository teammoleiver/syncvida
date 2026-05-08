import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, Sparkles, Wand2, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listAssets, uploadAsset, generateAssetImage, editAssetImage, deleteAsset, type DesignAsset } from "@/lib/designer-queries";

export default function AssetLibraryPage() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<DesignAsset | null>(null);
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
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Upload</Button>
          <Button onClick={() => setGenOpen(true)}><Sparkles className="w-4 h-4 mr-1" /> Generate with AI</Button>
        </div>
      </header>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : assets.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No assets yet.</Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {assets.map((a) => (
              <Card key={a.id} className="overflow-hidden group relative">
                <img src={a.public_url} alt="" className="w-full aspect-square object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 flex justify-between">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(a)}><Wand2 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                  <Button size="icon" variant="destructive" onClick={async () => { if (confirm("Delete?")) { await deleteAsset(a); reload(); } }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="absolute top-1 left-1 text-[10px] uppercase bg-background/80 px-1.5 py-0.5 rounded">{a.kind.replace("_", " ")}</div>
              </Card>
            ))}
          </div>
        )}

      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} onCreated={reload} />
      <EditDialog asset={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </section>
  );
}

function GenerateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await generateAssetImage(prompt, aspect);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      onCreated(); onClose(); setPrompt("");
      toast.success("Image generated");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate image with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={4}
            value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image you want…" />
          <Select value={aspect} onValueChange={(v) => setAspect(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1:1">Square 1:1</SelectItem>
              <SelectItem value="4:5">Portrait 4:5</SelectItem>
              <SelectItem value="9:16">Story 9:16</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={go} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ asset, onClose, onSaved }: { asset: DesignAsset | null; onClose: () => void; onSaved: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit with AI</DialogTitle></DialogHeader>
        {asset && (
          <div className="space-y-3">
            <img src={asset.public_url} alt="" className="w-full max-h-72 object-contain rounded border border-border" />
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. make the background dark green and add subtle grain" />
            <Button onClick={go} disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}Apply edit
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}