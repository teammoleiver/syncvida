import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScanLine, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ocrImage, parseCardText, type ParsedCard } from "@/lib/crm-card-ocr";
import { supabase } from "@/integrations/supabase/client";

export default function CardScanner({ onParsed }: { onParsed: (parsed: ParsedCard & { company_name?: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [progress, setProgress] = useState<ParsedCard | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      setStage("Reading text from card (OCR)…");
      const text = await ocrImage(file);
      if (!text.trim()) { toast.error("Couldn't read any text from that image"); return; }
      const local = parseCardText(text);
      setProgress(local);
      setStage("Structuring with AI…");
      // AI cleanup — cheap; uses Lovable AI Gateway behind edge function
      const { data, error } = await supabase.functions.invoke("crm-parse-card-text", { body: { text } });
      const ai = (data as any)?.contact ?? {};
      if (error) console.warn("AI parse failed, using local only", error);
      const merged: ParsedCard & { company_name?: string } = {
        raw_text: text,
        first_name: ai.first_name || local.first_name,
        last_name: ai.last_name || local.last_name,
        full_name: local.full_name,
        email: ai.email || local.email,
        phone: ai.phone || local.phone,
        title: ai.title || local.title,
        company: ai.company || local.company,
        company_name: ai.company || local.company,
        website: ai.website || local.website,
        linkedin_url: ai.linkedin_url || local.linkedin_url,
      };
      onParsed(merged);
      toast.success("Card scanned");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "OCR failed");
    } finally {
      setBusy(false); setStage(""); setProgress(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <ScanLine className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">AI Card Scan</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Free in-browser OCR + AI cleanup. No image leaves your browser for OCR.</p>
      <label className="block">
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
        <Button asChild variant="outline" disabled={busy} className="w-full cursor-pointer">
          <span>{busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{stage || "Working…"}</> : <><Sparkles className="w-4 h-4 mr-2" />Choose card image</>}</span>
        </Button>
      </label>
      {progress && (
        <div className="mt-3 text-[11px] text-muted-foreground space-y-0.5">
          {progress.full_name && <div>· {progress.full_name}</div>}
          {progress.email && <div>· {progress.email}</div>}
          {progress.company && <div>· {progress.company}</div>}
        </div>
      )}
    </Card>
  );
}