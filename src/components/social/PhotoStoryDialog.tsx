import { useRef, useState } from "react";
import { Loader2, Upload, Sparkles, Wand2, Image as ImageIcon, X, Lightbulb } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  uploadPostImage,
  analyzePhotoPost,
  createPlannerPost,
  PLANNER_PLATFORMS,
} from "@/lib/social-queries";
import { Linkedin, Facebook, Instagram, Twitter, Youtube } from "lucide-react";

const PLATFORM_ICONS: Record<string, any> = {
  linkedin: Linkedin, facebook: Facebook, instagram: Instagram, twitter: Twitter, youtube: Youtube,
};

type Suggestion = {
  description?: string;
  themes?: string[];
  hooks?: string[];
  questions?: string[];
};

export default function PhotoStoryDialog({
  open,
  onClose,
  onSaved,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultDate?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [userNote, setUserNote] = useState("");
  const [writing, setWriting] = useState(false);

  const [scheduledDate, setScheduledDate] = useState(defaultDate ?? "");
  const [scheduledTime, setScheduledTime] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setImageUrl(""); setSuggestion(null); setHook(""); setBody(""); setUserNote("");
    setScheduledDate(defaultDate ?? ""); setScheduledTime(""); setPlatforms(["linkedin"]);
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    setUploading(true);
    try {
      const url = await uploadPostImage(file);
      setImageUrl(url);
      toast.success("Photo uploaded — asking AI for ideas…");
      runSuggest(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function runSuggest(url?: string) {
    const img = url ?? imageUrl;
    if (!img) { toast.error("Upload a photo first"); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await analyzePhotoPost({
        mode: "suggest",
        image_url: img,
        user_note: userNote,
        platform: platforms[0] ?? "linkedin",
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      setSuggestion(d);
    } catch (e: any) {
      toast.error(e?.message ?? "AI analysis failed");
    } finally { setAnalyzing(false); }
  }

  async function runWrite() {
    if (!imageUrl && !userNote.trim()) { toast.error("Upload a photo or add notes first"); return; }
    setWriting(true);
    try {
      const { data, error } = await analyzePhotoPost({
        mode: "write",
        image_url: imageUrl,
        user_note: userNote,
        hook: hook,
        current_draft: body,
        platform: platforms[0] ?? "linkedin",
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (d?.hook) setHook(d.hook);
      if (d?.body) setBody(d.body);
      toast.success("Draft generated in your voice");
    } catch (e: any) {
      toast.error(e?.message ?? "AI write failed");
    } finally { setWriting(false); }
  }

  function togglePlatform(p: string) {
    setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }

  async function save() {
    if (!hook.trim()) { toast.error("Add a hook / headline first"); return; }
    setSaving(true);
    try {
      await createPlannerPost({
        hook,
        body,
        image_url: imageUrl || undefined,
        scheduled_date: scheduledDate || undefined,
        scheduled_time: scheduledTime || undefined,
        platforms,
        status: scheduledDate ? "planned" : "drafting",
      });
      toast.success(scheduledDate ? "Saved to your planner" : "Saved as draft");
      reset();
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Photo → Post assistant
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a photo of a moment, experience, or idea. AI will read it and help you write a post in your voice.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-0 flex-1 overflow-hidden">
          {/* LEFT — photo + suggestions */}
          <div className="border-r border-border overflow-y-auto p-4 space-y-3 bg-muted/20">
            <Label>Photo</Label>
            {imageUrl ? (
              <div className="relative group">
                <img src={imageUrl} alt="" className="w-full aspect-square object-cover rounded-lg border border-border" />
                <button
                  onClick={() => { setImageUrl(""); setSuggestion(null); }}
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2 text-muted-foreground">
                {uploading
                  ? <Loader2 className="w-6 h-6 animate-spin" />
                  : <><Upload className="w-6 h-6" /><span className="text-xs">Tap to upload photo</span><span className="text-[10px]">JPG / PNG · max 10 MB</span></>}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            {imageUrl && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => runSuggest()} disabled={analyzing}>
                {analyzing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 mr-1" />}
                Re-analyze photo
              </Button>
            )}

            {suggestion && (
              <Card className="p-3 space-y-3 bg-background">
                {suggestion.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What AI sees</div>
                    <p className="text-xs leading-relaxed">{suggestion.description}</p>
                  </div>
                )}
                {!!suggestion.hooks?.length && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Hook ideas (tap to use)</div>
                    <div className="space-y-1">
                      {suggestion.hooks.map((h, i) => (
                        <button key={i} onClick={() => setHook(h)} className="w-full text-left text-xs px-2 py-1.5 rounded border border-border hover:border-primary hover:bg-primary/5">
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!!suggestion.themes?.length && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Angles to explore</div>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      {suggestion.themes.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                {!!suggestion.questions?.length && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ask yourself</div>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      {suggestion.questions.map((q, i) => <li key={i}>· {q}</li>)}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* RIGHT — editor */}
          <div className="overflow-y-auto p-4 sm:p-6 space-y-3">
            <div>
              <Label>Your notes (optional, but helps AI)</Label>
              <Textarea
                rows={3}
                placeholder="What's happening in this photo? What lesson, story or feeling do you want to share?"
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={runWrite} disabled={writing || (!imageUrl && !userNote.trim())}>
                {writing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                {body || hook ? "Rewrite in my voice" : "Write post with AI"}
              </Button>
              {imageUrl && (
                <Button size="sm" variant="outline" onClick={() => runSuggest()} disabled={analyzing}>
                  {analyzing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 mr-1" />}
                  Get fresh ideas
                </Button>
              )}
            </div>

            <div>
              <Label>Hook / headline</Label>
              <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="The first line — make it stop the scroll" />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="The rest of the post…" />
              <div className="text-[10px] text-muted-foreground mt-1">{body.trim().split(/\s+/).filter(Boolean).length} words</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date (optional)</Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <Label>Time (optional)</Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PLANNER_PLATFORMS.map((p) => {
                  const Ic = PLATFORM_ICONS[p] ?? ImageIcon;
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`text-xs px-2.5 py-1 rounded-md border inline-flex items-center gap-1.5 transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background hover:border-primary/40"}`}>
                      <Ic className="w-3 h-3" /> {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border shrink-0 flex-row justify-between gap-2">
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={save} disabled={saving || !hook.trim()}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Save to planner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
