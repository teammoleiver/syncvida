import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Upload, ImagePlus, X, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  extractBrandFromUrl, getBrandKit, upsertBrandKit, uploadBrandFile,
  uploadAsset, listProfileAssets, setAssetProfile, deleteAsset,
  type BrandKit, type DesignAsset,
} from "@/lib/designer-queries";
import { resolveAvatarUrl } from "@/lib/avatar";
import { getProfile } from "@/lib/supabase-queries";
import { supabase } from "@/integrations/supabase/client";

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
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={kit.website_url ?? ""} placeholder="https://yoursite.com" onChange={(e) => setKit({ ...kit, website_url: e.target.value })} className="flex-1" />
            <Button onClick={extract} disabled={extracting} variant="outline" className="w-full sm:w-auto shrink-0">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            ["logo_light", "Logo (light bg)"],
            ["logo_dark", "Logo (dark bg)"],
            ["avatar", "Author avatar"],
          ] as const).map(([slot, label]) => {
            const url = (kit as any)[`${slot}_url`] as string | null;
            return <FileSlot key={slot} label={label} url={url} onPick={(file) => uploadFile(slot, file)} />;
          })}
        </div>
        <p className="text-xs text-muted-foreground">Logos here are for your company brand. For your own face in posts, use Profile photos below.</p>
      </Card>

      <ProfilePhotosSection />
    </section>
  );
}

/**
 * Profile photos = the user's own headshots used as the author face in designs.
 * Distinct from the company logos above. Pulls the photo from Settings as the
 * first option, and lets the user add as many of their own as they like — any
 * of which the generator can pick from at random.
 */
function ProfilePhotosSection() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [settingsAvatar, setSettingsAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setAssets(await listProfileAssets().catch(() => []));
  }

  useEffect(() => {
    (async () => {
      const [{ data: { user } }, prof] = await Promise.all([
        supabase.auth.getUser(),
        getProfile().catch(() => null),
      ]);
      const oauth = (user as any)?.user_metadata?.avatar_url || null;
      const resolved = await resolveAvatarUrl({
        userId: user?.id,
        storedAvatar: (prof as any)?.avatar_url,
        oauthAvatarUrl: oauth,
      }).catch(() => null);
      setSettingsAvatar(resolved ?? (prof as any)?.avatar_url ?? oauth ?? null);
      await reload();
      setLoading(false);
    })();
  }, []);

  // Has the Settings photo already been added to the profile-photo library?
  const settingsAdded = !!settingsAvatar && assets.some(
    (a) => a.public_url && settingsAvatar.split("?")[0].includes(a.storage_path.split("/").pop() || "\0"),
  );

  async function addSettingsPhoto() {
    if (!settingsAvatar) return;
    setBusy(true);
    try {
      const res = await fetch(settingsAvatar);
      if (!res.ok) throw new Error("Could not fetch your settings photo");
      const blob = await res.blob();
      const file = new File([blob], "profile-photo.jpg", { type: blob.type || "image/jpeg" });
      const asset = await uploadAsset(file);
      await setAssetProfile(asset.id, true);
      await reload();
      toast.success("Added your settings photo");
    } catch (e: any) { toast.error(e?.message ?? "Could not add photo"); } finally { setBusy(false); }
  }

  async function addFiles(files: FileList) {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadAsset(file);
        await setAssetProfile(asset.id, true);
      }
      await reload();
      toast.success(files.length > 1 ? `Added ${files.length} photos` : "Photo added");
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); } finally { setBusy(false); }
  }

  async function remove(a: DesignAsset) {
    setBusy(true);
    try { await deleteAsset(a); await reload(); toast.success("Removed"); }
    catch (e: any) { toast.error(e?.message ?? "Could not remove"); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <Label>Profile photos</Label>
          <p className="text-xs text-muted-foreground mt-1">Your own headshots. Designs use one of these as the author face — never the company logo.</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1" />}
            Add photos
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4">Loading…</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {settingsAvatar && !settingsAdded && (
            <div className="space-y-1">
              <div className="aspect-square rounded-md overflow-hidden border border-dashed border-border bg-muted/30 relative group">
                <img src={settingsAvatar} alt="Settings photo" className="w-full h-full object-cover opacity-80" />
                <button onClick={addSettingsPhoto} disabled={busy}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                  <Check className="w-4 h-4 mr-1" /> Use this
                </button>
              </div>
              <div className="text-[10px] text-center text-muted-foreground">From Settings</div>
            </div>
          )}
          {assets.map((a) => (
            <div key={a.id} className="space-y-1">
              <div className="aspect-square rounded-md overflow-hidden border border-border bg-muted/30 relative group">
                <img src={a.public_url} alt={a.name ?? "Profile photo"} className="w-full h-full object-cover" />
                <button onClick={() => remove(a)} disabled={busy} title="Remove"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {!assets.length && (!settingsAvatar || settingsAdded) && (
            <button onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-md border border-dashed border-border flex flex-col items-center justify-center bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors">
              <ImagePlus className="w-6 h-6 mb-1" />
              <span className="text-[10px]">Add</span>
            </button>
          )}
        </div>
      )}
    </Card>
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