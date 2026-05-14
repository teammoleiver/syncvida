import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { THEMES, type ThemeKey } from "./LinkedInCanvas";

/**
 * Modal that lets the user pick the visual style/theme for their LinkedIn
 * design. Auto-opens on first generation and is reachable from the editor
 * via the "Change style" button.
 */
export default function TemplateStylePicker({
  open, current, onPick, onClose,
}: {
  open: boolean;
  current?: ThemeKey;
  onPick: (k: ThemeKey) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick a template style</DialogTitle>
          <DialogDescription>
            Eight battle-tested LinkedIn carousel looks. Pick one — you can change it any time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          {THEMES.map((t) => {
            const selected = current === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { onPick(t.key); onClose(); }}
                className={`group relative rounded-lg border overflow-hidden text-left transition ${selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/60"}`}
              >
                <div className="aspect-[4/5] p-3 flex flex-col justify-between" style={{ background: t.preview.bg, color: t.preview.fg }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">Carousel</div>
                  <div>
                    <div className="text-[15px] font-extrabold leading-tight">Stop guessing.</div>
                    <div className="text-[10px] mt-1 opacity-70">Swipe →</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full" style={{ background: t.preview.accent }} />
                    <div className="text-[9px] opacity-80">{t.preview.accent}</div>
                  </div>
                </div>
                <div className="p-2 bg-card">
                  <div className="text-xs font-semibold flex items-center justify-between">
                    {t.label}
                    {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Skip for now</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
