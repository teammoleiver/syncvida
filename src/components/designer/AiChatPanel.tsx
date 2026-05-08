import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Sparkles } from "lucide-react";
import { aiEditDesign, type Design } from "@/lib/designer-queries";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string; status?: "ok" | "error" };

const SUGGESTIONS = [
  "Make the headline bigger and bolder",
  "Use a deep emerald gradient background",
  "Add a CTA slide at the end",
  "Replace the body text with something more punchy",
  "Center everything",
];

export function AiChatPanel({
  designId,
  slideIndex,
  selectedIds,
  onApplied,
}: {
  designId: string;
  slideIndex: number;
  selectedIds: string[];
  onApplied: (updated: Design) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Tell me what to change. I'll edit your design directly. Try: 'add a quote slide' or 'make the headline pop'." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const { data, error } = await aiEditDesign({ designId, slideIndex, selectedIds, message: text });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (d?.updated) onApplied(d.updated as Design);
      setMessages((m) => [...m, { role: "assistant", content: d?.summary ?? "Done.", status: "ok" }]);
    } catch (e: any) {
      const msg = e?.message ?? "AI edit failed";
      toast.error(msg);
      setMessages((m) => [...m, { role: "assistant", content: msg, status: "error" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-auto space-y-2 px-1 pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`text-xs rounded-md px-3 py-2 ${m.role === "user"
            ? "bg-primary text-primary-foreground ml-6"
            : m.status === "error"
            ? "bg-destructive/10 text-destructive border border-destructive/30 mr-6"
            : "bg-muted mr-6"}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Designing…
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-border pt-2">
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy}
              className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-primary text-muted-foreground hover:text-foreground">
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder="What should I change?"
            className="flex-1 rounded-md border border-border bg-background p-2 text-xs resize-none" />
          <Button size="icon" onClick={() => send()} disabled={busy || !input.trim()} className="self-stretch">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send. Selected layers: {selectedIds.length || "none"}.</p>
      </div>
    </div>
  );
}
