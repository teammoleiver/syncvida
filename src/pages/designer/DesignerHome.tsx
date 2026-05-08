import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Palette as PaletteIcon, Image as ImageIcon, Sparkles, Trash2, FileText, LayoutGrid, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listDesigns, createDesign, deleteDesign, generateDesignFromPrompt, type Design } from "@/lib/designer-queries";

export default function DesignerHome() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [openAi, setOpenAi] = useState(false);
  const navigate = useNavigate();

  async function reload() { setLoading(true); setDesigns(await listDesigns()); setLoading(false); }
  useEffect(() => { reload(); }, []);

  return (
    <section className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Designer</h1>
          <p className="text-sm text-muted-foreground">Generate, edit and export branded social posts and carousels.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline"><Link to="/designer/brand"><PaletteIcon className="w-4 h-4 mr-1" /> Brand kit</Link></Button>
          <Button asChild variant="outline"><Link to="/designer/assets"><ImageIcon className="w-4 h-4 mr-1" /> Assets</Link></Button>
          <Button variant="outline" onClick={() => setOpenAi(true)}><Sparkles className="w-4 h-4 mr-1" /> Generate with AI</Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="w-4 h-4 mr-1" /> New design</Button>
        </div>
      </header>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : designs.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No designs yet. Click <span className="text-foreground">New design</span> or <span className="text-foreground">Generate with AI</span>.
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {designs.map((d) => (
              <Card key={d.id} className="overflow-hidden group relative">
                <button onClick={() => navigate(`/designer/${d.id}`)} className="block w-full text-left">
                  <div className="aspect-[4/5] bg-muted flex items-center justify-center">
                    {d.thumbnail_url
                      ? <img src={d.thumbnail_url} className="w-full h-full object-cover" alt={d.title} />
                      : (d.type === "carousel" ? <LayoutGrid className="w-8 h-8 text-muted-foreground" /> : <FileText className="w-8 h-8 text-muted-foreground" />)}
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground">{d.type === "carousel" ? `${d.slides.length} slides` : "Single"} · {d.platform}</div>
                  </div>
                </button>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                  onClick={async () => { if (confirm("Delete this design?")) { await deleteDesign(d.id); reload(); } }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}

      <NewDesignDialog open={openNew} onClose={() => setOpenNew(false)} onCreated={(id) => navigate(`/designer/${id}`)} />
      <AiGenerateDialog open={openAi} onClose={() => setOpenAi(false)} onCreated={(id) => navigate(`/designer/${id}`)} />
    </section>
  );
}

function NewDesignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<"single" | "carousel">("carousel");
  const [platform, setPlatform] = useState<Design["platform"]>("linkedin");
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState(4);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const d = await createDesign({
        type, platform, title: title || (type === "carousel" ? "New carousel" : "New post"),
        slides: type === "carousel"
          ? Array.from({ length: slides }, () => ({ id: crypto.randomUUID(), bg: "#FFFFFF", elements: [] }))
          : [{ id: crypto.randomUUID(), bg: "#FFFFFF", elements: [] }],
      });
      onCreated(d.id);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New design</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-sm">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="single">Single post</SelectItem><SelectItem value="carousel">Carousel</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm">Platform</label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="x">X / Twitter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === "carousel" && (
            <div><label className="text-sm">Slides ({slides})</label>
              <Input type="number" min={1} max={10} value={slides} onChange={(e) => setSlides(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          )}
          <Button onClick={go} disabled={busy} className="w-full">{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AiGenerateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"single" | "carousel">("carousel");
  const [platform, setPlatform] = useState<Design["platform"]>("linkedin");
  const [slideCount, setSlideCount] = useState(4);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!prompt.trim()) { toast.error("Describe the post first"); return; }
    setBusy(true);
    try {
      const { data, error } = await generateDesignFromPrompt({ prompt, type, platform, slideCount });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      onCreated(d.id);
      toast.success("Design ready");
    } catch (e: any) { toast.error(e?.message ?? "AI generation failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-sm">Describe the post</label>
            <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={4}
              value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A 4-slide LinkedIn carousel on the 3 fasting protocols backed by science, ending with a CTA to subscribe." />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="carousel">Carousel</SelectItem></SelectContent>
            </Select>
            <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="x">X</SelectItem>
              </SelectContent>
            </Select>
            {type === "carousel" && (
              <Input type="number" min={1} max={8} value={slideCount} onChange={(e) => setSlideCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))} />
            )}
          </div>
          <Button onClick={go} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {busy ? "Generating…" : "Generate"}
          </Button>
          <p className="text-xs text-muted-foreground">AI writes the copy and generates background images per slide using your brand kit colors and fonts.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}