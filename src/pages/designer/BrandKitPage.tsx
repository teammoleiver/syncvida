import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { extractBrandFromUrl, getBrandKit, upsertBrandKit, uploadBrandFile, type BrandKit } from "@/lib/designer-queries";

const FONT_OPTIONS = ["Inter", "Manrope", "Playfair Display", "Space Grotesk", "DM Sans", "Lora", "Source Serif 4", "Poppins", "Bebas Neue"];

export default function BrandKitPage() {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setKit(await getBrandKit() ?? blank()); setLoading(false); })(); }, []);

  function blank(): BrandKit {
    return { id: "", user_id: "", brand_name: "", website_url: "",
      colors: { primary: "#1D9E75", secondary: "#0F6E56", accent: "#F5C451", bg: "#FFFFFF", text: "#0B0F0E" },
      fonts: { heading: "Inter", body: "Inter" },
      logo_light_url: null, logo_dark_url: null, avatar_url: null, footer_text: "", tone: null, extracted_at: null };
  }

  async function save() {
    if (!kit) return;
    setBusy(true);
    try {
      const saved = await upsertBrandKit({
        brand_name: kit.brand_name, website_url: kit.website_url,
        colors: kit.colors, fonts: kit.fonts,
        logo_light_url: kit.logo_light_url, logo_dark_url: kit.logo_dark_url, avatar_url: kit.avatar_url,
        footer_text: kit.footer_text,
      });
      setKit(saved);
      toast.success("Brand kit saved");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setBusy(false); }
  }

  async function extract() {
    if (!kit?.website_url?.trim()) { toast.error("Enter a website URL first"); return; }
    setExtracting(true);
    try {
      const { data, error } = await extractBrandFromUrl(kit.website_url);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      setKit({
        ...kit,
        brand_name: d.brand_name ?? kit.brand_name,
        colors: { ...kit.colors, ...d.colors },
        fonts: { ...kit.fonts, ...d.fonts },
        tone: d.tone ?? kit.tone,
      });
      toast.success("Style extracted — review and save");
    } catch (e: any) { toast.error(e?.message ?? "Extraction failed"); } finally { setExtracting(false); }
  }

  async function uploadFile(slot: "logo_light" | "logo_dark" | "avatar", file: File) {
    if (!kit) return;
    try {
      const url = await uploadBrandFile(file, slot);
      setKit({ ...kit, [`${slot}_url`]: url } as any);
      toast.success("Uploaded");
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
  }

  if (loading || !kit) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <section className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/designer"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Link></Button>
          <h1 className="font-display text-2xl font-bold">Brand kit</h1>
        </div>
        <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save</Button>
      </header>

      <Card className="p-5 space-y-4">
        <div><Label>Brand name</Label><Input value={kit.brand_name ?? ""} onChange={(e) => setKit({ ...kit, brand_name: e.target.value })} /></div>
        <div className="space-y-2">
          <Label>Website</Label>
          <div className="flex gap-2">
            <Input value={kit.website_url ?? ""} placeholder="https://yoursite.com" onChange={(e) => setKit({ ...kit, website_url: e.target.value })} />
            <Button onClick={extract} disabled={extracting} variant="outline">
              {extracting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Match my website
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">AI will read your site and pre-fill colors, fonts, and tone.</p>
        </div>
        <div><Label>Default footer text</Label><Input value={kit.footer_text ?? ""} placeholder="@handle · yoursite.com" onChange={(e) => setKit({ ...kit, footer_text: e.target.value })} /></div>
      </Card>

      <Card className="p-5 space-y-3">
        <Label>Colors</Label>
        <div className="grid grid-cols-5 gap-3">
          {(["primary", "secondary", "accent", "bg", "text"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <div className="text-xs text-muted-foreground capitalize">{k}</div>
              <div className="flex items-center gap-2">
                <input type="color" className="w-10 h-10 rounded border border-border" value={kit.colors[k]}
                  onChange={(e) => setKit({ ...kit, colors: { ...kit.colors, [k]: e.target.value } })} />
                <Input value={kit.colors[k]} onChange={(e) => setKit({ ...kit, colors: { ...kit.colors, [k]: e.target.value } })} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <Label>Fonts</Label>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-muted-foreground">Heading</div>
            <Select value={kit.fonts.heading} onValueChange={(v) => setKit({ ...kit, fonts: { ...kit.fonts, heading: v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><div className="text-xs text-muted-foreground">Body</div>
            <Select value={kit.fonts.body} onValueChange={(v) => setKit({ ...kit, fonts: { ...kit.fonts, body: v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <Label>Logos & avatar</Label>
        <div className="grid grid-cols-3 gap-4">
          {([
            ["logo_light", "Logo (light bg)"],
            ["logo_dark", "Logo (dark bg)"],
            ["avatar", "Author avatar"],
          ] as const).map(([slot, label]) => {
            const url = (kit as any)[`${slot}_url`] as string | null;
            return <FileSlot key={slot} label={label} url={url} onPick={(file) => uploadFile(slot, file)} />;
          })}
        </div>
      </Card>
    </section>
  );
}

function FileSlot({ label, url, onPick }: { label: string; url: string | null; onPick: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="aspect-square border border-dashed border-border rounded-md flex items-center justify-center bg-muted/30 overflow-hidden">
        {url ? <img src={url} alt={label} className="w-full h-full object-contain p-2" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
      <Button size="sm" variant="outline" className="w-full" onClick={() => ref.current?.click()}>Upload</Button>
    </div>
  );
}