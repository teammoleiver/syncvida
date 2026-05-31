import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Upload, Image as ImageIcon, X, Check, User, Star } from "lucide-react";
import { toast } from "sonner";
import {
  listAssets, uploadAsset, generateAssetImageWithRefs, getBrandKit, createDesign,
  type DesignAsset, type BrandKit,
} from "@/lib/designer-queries";
import { supabase } from "@/integrations/supabase/client";
import { detectMentionedLogos } from "@/components/designer/linkedin/detectLogos";

type Aspect = "1:1" | "4:5" | "9:16";

/**
 * Rich "Generate with AI" dialog — lets the user pick reference assets
 * (logos, their photo, products) so the model incorporates them.
 *
 * Returns the generated image URL via onGenerated.
 */
export default function GenerateWithAIDialog({
  open, onClose, hook, body, planId, onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  hook: string;
  body: string;
  planId: string | null;
  onGenerated: (image_url: string, asset: DesignAsset) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [includeAvatar, setIncludeAvatar] = useState(false);
  const [includeName, setIncludeName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [me, setMe] = useState<{ name?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPrompt(suggestedPrompt(hook, body));
    setLoadingAssets(true);
    Promise.all([
      listAssets().catch(() => []),
      getBrandKit().catch(() => null),
      supabase.auth.getUser().then((u) => ({ name: u.data.user?.user_metadata?.full_name ?? u.data.user?.user_metadata?.name ?? u.data.user?.email?.split("@")[0] })),
      detectMentionedLogos(hook + "\n" + (body ?? "")).catch(() => []),
    ]).then(([a, b, u, detected]) => {
      const matchedAssets = detected
        .filter((d) => d.hasAsset && d.asset)
        .map((d) => d.asset as DesignAsset);
      
      const combined = [...matchedAssets, ...a];
      setAssets(combined);
      setBrand(b);
      setMe(u);

      // Auto-pre-check the tools spoken about in the post!
      const initialPicked = new Set<string>();
      matchedAssets.forEach((ma) => initialPicked.add(ma.id));
      setPicked(initialPicked);
    }).finally(() => setLoadingAssets(false));
  }, [open, hook, body]);

  function togglePick(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function onUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        const a = await uploadAsset(f);
        setAssets((cur) => [a, ...cur]);
        // Auto-select the freshly uploaded one
        setPicked((cur) => new Set(cur).add(a.id));
      }
      toast.success("Reference uploaded");
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }

  function buildFinalPrompt(): string {
    const lines: string[] = [prompt.trim()];
    if (includeAvatar || includeName || picked.size > 0) {
      lines.push("Style: clean, modern, professional, social-media editorial background. No embedded text, watermarks, faces, or names painted on the image itself. Leave the bottom area clean for layered overlays.");
    }
    return lines.filter(Boolean).join("\n\n");
  }

  async function generate() {
    if (!prompt.trim()) { toast.error("Describe the image first"); return; }
    setBusy(true);
    try {
      const ids = [...picked];
      // Pass the brand avatar as a raw URL reference so Gemini can actually
      // see the user's face — without needing to import it as a design asset first.
      const extraUrls: string[] = [];
      if (includeAvatar && brand?.avatar_url) extraUrls.push(brand.avatar_url);
      const { data, error } = await generateAssetImageWithRefs(buildFinalPrompt(), aspect, ids, extraUrls);
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      const asset: DesignAsset | undefined = d?.asset;
      if (!asset?.public_url) throw new Error("No image URL returned");

      let finalUrl = asset.public_url;

      // Composite creation: If avatar, name, or logos are requested, create a layered design
      if (includeAvatar || includeName || picked.size > 0) {
        const height = aspect === "1:1" ? 1080 : aspect === "4:5" ? 1350 : 1920;
        const slideElements: any[] = [
          {
            id: crypto.randomUUID(),
            type: "image",
            src: asset.public_url,
            fit: "cover",
            x: 0,
            y: 0,
            w: 1080,
            h: height,
          }
        ];

        // Avatar
        if (includeAvatar && brand?.avatar_url) {
          slideElements.push({
            id: crypto.randomUUID(),
            type: "image",
            src: brand.avatar_url,
            fit: "cover",
            radius: 999,
            x: 48,
            y: height - 168,
            w: 120,
            h: 120,
          });
        }

        // Name text
        if (includeName && me?.name) {
          slideElements.push({
            id: crypto.randomUUID(),
            type: "text",
            text: me.name,
            size: 28,
            weight: 700,
            color: "#FFFFFF",
            align: "left",
            x: includeAvatar && brand?.avatar_url ? 190 : 48,
            y: height - 124,
            w: 400,
            h: 40,
          });
        }

        // Sector logos
        if (picked.size > 0) {
          const pickedAssets = assets.filter((a) => picked.has(a.id));
          pickedAssets.forEach((pa, idx) => {
            slideElements.push({
              id: crypto.randomUUID(),
              type: "image",
              src: pa.public_url,
              fit: "contain",
              x: 1080 - 128 - (idx * 96), // perfectly spaced horizontally to prevent overlapping!
              y: height - 148,
              w: 80,
              h: 80,
            });
          });
        }

        // Create the composite design in our studio database
        const createdDesign = await createDesign({
          type: "single",
          platform: "linkedin",
          title: `Generated: ${prompt.slice(0, 30)}`,
          width: 1080,
          height: height,
          slides: [
            {
              id: crypto.randomUUID(),
              bg: "#0B0F1A",
              elements: slideElements,
            }
          ]
        });

        // Link directly to the planner post
        if (planId) {
          await supabase.from("designs" as any)
            .update({ planner_entry_id: planId } as any)
            .eq("id", createdDesign.id);
        }

        finalUrl = createdDesign.thumbnail_url || asset.public_url;
      } else {
        // Flat image fallback
        if (planId) {
          await supabase.from("social_content_plan" as any)
            .update({ image_url: asset.public_url } as any)
            .eq("id", planId);
        }
      }

      onGenerated(finalUrl, asset);
      toast.success("Image generated with your references");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Generate with AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Describe the image</label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full text-sm p-3 rounded-md border border-border bg-background"
              placeholder="A clean editorial illustration of a desk with a laptop showing a dashboard…"
            />
          </div>

          {/* Aspect */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Aspect ratio</label>
            <div className="flex gap-1.5">
              {(["1:1", "4:5", "9:16"] as Aspect[]).map((a) => (
                <button key={a} onClick={() => setAspect(a)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition ${
                    aspect === a ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>
                  {a === "1:1" ? "Square" : a === "4:5" ? "Portrait" : "Story"} <span className="opacity-60">{a}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Brand identity toggles */}
          <Card className="p-3 space-y-2 border-dashed">
            <div className="text-xs font-medium text-muted-foreground">Add my identity</div>
            <div className="flex flex-col gap-2">
              <label className={`flex items-center gap-2 text-xs ${brand?.avatar_url ? "" : "opacity-50"}`}>
                <Switch checked={includeAvatar} onCheckedChange={setIncludeAvatar} disabled={!brand?.avatar_url} />
                <User className="w-3.5 h-3.5" />
                <span>Include my photo as a small avatar in the corner</span>
                {!brand?.avatar_url && <span className="text-amber-300 text-[10px]">(set avatar in Brand kit)</span>}
              </label>
              <label className={`flex items-center gap-2 text-xs ${me?.name ? "" : "opacity-50"}`}>
                <Switch checked={includeName} onCheckedChange={setIncludeName} disabled={!me?.name} />
                <Star className="w-3.5 h-3.5" />
                <span>Add my name {me?.name ? <em>"{me.name}"</em> : ""} next to the avatar</span>
              </label>
            </div>
          </Card>

          {/* Reference assets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Reference images <span className="opacity-60">({picked.size} selected)</span>
              </label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Upload className="w-3.5 h-3.5 mr-1" /> Upload
                </Button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onUpload(e.target.files); e.currentTarget.value = ""; }} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Pick logos, products, or your photo. The AI uses them as references and tries to incorporate them faithfully.
            </p>
            {loadingAssets ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading assets…</div>
            ) : assets.length === 0 ? (
              <Card className="p-4 text-center text-xs text-muted-foreground">
                No assets yet. Click <strong>Upload</strong> above to add a logo or photo, or visit the <a className="underline text-primary" href="/designer/assets" target="_blank" rel="noreferrer">Asset library</a>.
              </Card>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto">
                {assets.map((a) => {
                  const isPicked = picked.has(a.id);
                  return (
                    <button key={a.id} onClick={() => togglePick(a.id)}
                      className={`relative aspect-square rounded-md border-2 overflow-hidden transition ${
                        isPicked ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40"
                      }`}>
                      <img src={a.public_url} alt="" className="w-full h-full object-cover" />
                      {isPicked && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                      {a.kind && a.kind !== "upload" && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] uppercase text-white py-0.5 text-center">
                          {a.kind.replace("_", " ")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              Up to 6 references. {picked.size > 6 && <span className="text-amber-300">Only the first 6 will be used.</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={generate} disabled={busy || !prompt.trim()}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Generate
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function suggestedPrompt(hook: string, body: string): string {
  const h = (hook ?? "").trim();
  const b = (body ?? "").trim().slice(0, 300);
  if (!h && !b) return "";
  return [
    `Create a clean, editorial social-media image illustrating this post:`,
    h ? `Headline: "${h}"` : "",
    b ? `Context: ${b}` : "",
    `Style: modern, high-contrast, professional. No embedded text or watermarks.`,
  ].filter(Boolean).join("\n");
}
