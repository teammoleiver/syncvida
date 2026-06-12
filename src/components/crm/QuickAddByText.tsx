import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseCardText } from "@/lib/crm-card-ocr";

export default function QuickAddByText({ onParsed }: { onParsed: (parsed: any) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const local = parseCardText(text);
      const { data, error } = await supabase.functions.invoke("crm-parse-card-text", { body: { text } });
      const ai = (data as any)?.contact ?? {};
      if (error) console.warn(error);
      onParsed({
        first_name: ai.first_name || local.first_name,
        last_name: ai.last_name || local.last_name,
        email: ai.email || local.email,
        phone: ai.phone || local.phone,
        title: ai.title || local.title,
        company_name: ai.company || local.company,
        linkedin_url: ai.linkedin_url || local.linkedin_url,
        notes: text,
      });
      setText("");
      toast.success("Parsed");
    } catch (e: any) { toast.error(e?.message || "Parse failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Quick add by text</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Paste a note like "Jane Doe, VP Sales at Acme, jane@acme.com".</p>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type lead info…" />
      <Button size="sm" className="mt-2 w-full" onClick={go} disabled={busy || !text.trim()}>
        {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Parsing…</> : "Parse with AI"}
      </Button>
    </Card>
  );
}