import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Palette as PaletteIcon, Image as ImageIcon, Sparkles, Trash2, FileText, LayoutGrid,
  Loader2, BookOpen, Search, Linkedin,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listDesigns, createDesign, deleteDesign, generateDesignFromPrompt,
  listTemplates, deleteTemplate, createDesignFromTemplate, getBrandKit,
  type Design, type DesignTemplate,
} from "@/lib/designer-queries";
import { PLATFORM_SIZES } from "@/lib/designer-utils";
import { seedCoverTemplates } from "@/lib/designer-seed-templates";
import DesignThumb from "@/components/designer/DesignThumb";

export default function DesignerHome() {
  const navigate = useNavigate();
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
        </div>
      </header>

      <Tabs defaultValue="designs">
        <TabsList>
          <TabsTrigger value="designs"><LayoutGrid className="w-3.5 h-3.5 mr-1" /> My designs</TabsTrigger>
          <TabsTrigger value="templates"><BookOpen className="w-3.5 h-3.5 mr-1" /> Templates</TabsTrigger>
          <TabsTrigger value="new"><Plus className="w-3.5 h-3.5 mr-1" /> Create new</TabsTrigger>
        </TabsList>
        <TabsContent value="designs" className="pt-4">
          <DesignsList />
        </TabsContent>
        <TabsContent value="templates" className="pt-4">
          <TemplatesList onUse={(id) => navigate(`/designer/${id}`)} />
        </TabsContent>
        <TabsContent value="new" className="pt-4">
          <NewDesignSection onCreated={(id) => navigate(`/designer/${id}`)} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function DesignsList() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function reload() { setLoading(true); setDesigns(await listDesigns()); setLoading(false); }
  useEffect(() => { reload(); }, []);

  const filtered = designs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your designs" className="max-w-sm" />
      </div>
      {loading ? <p className="text-muted-foreground">Loading…</p>
        : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            {designs.length === 0 ? "No designs yet. Try the Templates tab or Create new." : "No designs match your search."}
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filtered.map((d) => (
              <Card key={d.id} className="overflow-hidden group relative">
                <button onClick={() => routeToDesign(d, navigate)} className="block w-full text-left">
                  <div className="bg-muted relative">
                    {d.thumbnail_url
                      ? <img src={d.thumbnail_url} className="w-full aspect-[4/5] object-cover" alt={d.title} />
                      : d.kind && d.kind !== "canvas" && (d as any).template_data
                        ? <DesignThumb design={d} />
                        : d.slides?.[0]?.elements?.length
                          ? <DesignThumb design={d} />
                          : (
                            <div className="aspect-[4/5] flex items-center justify-center">
                              {d.type === "carousel" ? <LayoutGrid className="w-8 h-8 text-muted-foreground" /> : <FileText className="w-8 h-8 text-muted-foreground" />}
                            </div>
                          )}
                    <KindBadge kind={d.kind} />
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {kindLabel(d)} · {d.platform}
                    </div>
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
    </div>
  );
}

function TemplatesList({ onUse }: { onUse: (id: string) => void }) {
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [type, setType] = useState<string>("all");

  async function reload() {
    setLoading(true);
    setTemplates(await listTemplates({
      platform: platform === "all" ? undefined : platform as any,
      type: type === "all" ? undefined : type as any,
      q: q || undefined,
    }));
    setLoading(false);
  }
  useEffect(() => { reload(); }, [platform, type]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={reload}
          placeholder="Search templates by title" className="max-w-xs" />
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="x">X</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="single">Single</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? <p className="text-muted-foreground">Loading…</p>
        : templates.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground space-y-3">
            <p>No templates yet. Add the LinkedIn starter pack or save your own from any design.</p>
            <Button onClick={async () => {
              const brand = await getBrandKit();
              const created = await seedCoverTemplates(brand);
              toast.success(`Added ${created.length} starter template${created.length === 1 ? "" : "s"}`);
              reload();
            }}>
              <Sparkles className="w-4 h-4 mr-1" /> Add LinkedIn starter pack
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {templates.map((t) => (
              <Card key={t.id} className="overflow-hidden group relative">
                <button onClick={async () => {
                  try {
                    const d = await createDesignFromTemplate(t);
                    toast.success("Template applied");
                    onUse(d.id);
                  } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }} className="block w-full text-left">
                  <div className="bg-muted">
                    {t.thumbnail_url
                      ? <img src={t.thumbnail_url} className="w-full aspect-[4/5] object-cover" alt={t.title} />
                      : (t.slides as any[])?.[0]?.elements?.length
                        ? <DesignThumb design={t as any} />
                        : (
                          <div className="aspect-[4/5] flex items-center justify-center">
                            {t.type === "carousel" ? <LayoutGrid className="w-8 h-8 text-muted-foreground" /> : <FileText className="w-8 h-8 text-muted-foreground" />}
                          </div>
                        )}
                  </div>
                  <div className="p-3 space-y-0.5">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.type === "carousel" ? `${(t.slides as any[]).length} slides` : "Single"} · {t.platform}
                      {t.category ? ` · ${t.category}` : ""}
                    </div>
                  </div>
                </button>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                  onClick={async () => { if (confirm("Delete this template?")) { await deleteTemplate(t.id); reload(); } }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}

function NewDesignSection({ onCreated }: { onCreated: (id: string) => void }) {
  const [openManual, setOpenManual] = useState(false);
  const [openAi, setOpenAi] = useState(false);
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-lg font-semibold"><Plus className="w-5 h-5" /> Blank canvas</div>
        <p className="text-sm text-muted-foreground">Pick a platform and size and start from scratch in the canvas editor.</p>
        <Button onClick={() => setOpenManual(true)}>Create blank</Button>
      </Card>
      <Card className="p-6 space-y-3 border-emerald-500/40">
        <div className="flex items-center gap-2 text-lg font-semibold"><Linkedin className="w-5 h-5 text-emerald-400" /> LinkedIn template</div>
        <p className="text-sm text-muted-foreground">Cheat sheet, carousel, or hot-take in your branded style. Autosaves to designs.</p>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Link to="/designer/linkedin-templates">Open template editor</Link>
        </Button>
      </Card>
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="w-5 h-5 text-primary" /> Generate with AI</div>
        <p className="text-sm text-muted-foreground">Describe the post and AI writes copy + generates background images.</p>
        <Button onClick={() => setOpenAi(true)}><Sparkles className="w-4 h-4 mr-1" /> Generate</Button>
      </Card>
      <NewDesignDialog open={openManual} onClose={() => setOpenManual(false)} onCreated={onCreated} />
      <AiGenerateDialog open={openAi} onClose={() => setOpenAi(false)} onCreated={onCreated} />
    </div>
  );
}

function NewDesignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<"single" | "carousel">("carousel");
  const [platform, setPlatform] = useState<Design["platform"]>("linkedin");
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState(4);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const sizes = PLATFORM_SIZES[platform]?.[type] ?? [{ w: 1080, h: 1350, label: "Default" }];
  const size = sizes[Math.min(sizeIdx, sizes.length - 1)];

  async function go() {
    setBusy(true);
    try {
      const d = await createDesign({
        type, platform,
        title: title || (type === "carousel" ? "New carousel" : "New post"),
        width: size.w, height: size.h,
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
              <Select value={platform} onValueChange={(v) => { setPlatform(v as any); setSizeIdx(0); }}>
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
          <div>
            <label className="text-sm">Size</label>
            <Select value={String(sizeIdx)} onValueChange={(v) => setSizeIdx(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{sizes.map((s, i) => <SelectItem key={i} value={String(i)}>{s.label} — {s.w}×{s.h}</SelectItem>)}</SelectContent>
            </Select>
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


function routeToDesign(d: Design, navigate: (path: string) => void) {
  if (d.kind && d.kind !== "canvas") {
    navigate(`/designer/linkedin-templates?id=${d.id}`);
  } else {
    navigate(`/designer/${d.id}`);
  }
}

function kindLabel(d: Design): string {
  switch (d.kind) {
    case "linkedin_cheatsheet": return "Cheat Sheet";
    case "linkedin_carousel": return "LinkedIn Carousel";
    case "linkedin_square": return "Hot Take";
    default: return d.type === "carousel" ? `${d.slides.length} slides` : "Single";
  }
}

function KindBadge({ kind }: { kind?: string | null }) {
  if (!kind || kind === "canvas") return null;
  const label = kind === "linkedin_cheatsheet" ? "Cheat Sheet"
    : kind === "linkedin_carousel" ? "Carousel"
    : kind === "linkedin_square" ? "Hot Take"
    : kind;
  return (
    <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/90 text-white shadow">
      <Linkedin className="w-3 h-3" /> {label}
    </span>
  );
}

