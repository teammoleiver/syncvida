import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { THEMES, type ThemeKey } from "./LinkedInCanvas";

/**
 * Mini layout previews — each renders a unique composition, not just a color
 * swatch. The goal is to show the user HOW text and elements are positioned
 * in each style before they commit.
 */
const LAYOUT_PREVIEWS: Partial<Record<ThemeKey, () => React.ReactNode>> = {
  "editorial-dark": () => (
    <div className="w-full h-full relative overflow-hidden" style={{ background: "#0B0F1A" }}>
      {/* Subtle gradient */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(232,101,74,0.08), transparent 60%)" }} />
      {/* Top chrome */}
      <div style={{ position: "absolute", top: 10, right: 12, fontSize: 7, color: "#5C6781", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>CAROUSEL</div>
      {/* Eyebrow */}
      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 7, color: "#E8654A", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>GTM</div>
      {/* Large hook */}
      <div style={{ position: "absolute", bottom: 40, left: 12, right: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#F5F1E8", lineHeight: 1.05, letterSpacing: "-0.03em" }}>Stop guessing.</div>
        <div style={{ fontSize: 8, color: "#E8654A", marginTop: 6, letterSpacing: 0.5 }}>Swipe →</div>
      </div>
      {/* Signature */}
      <div style={{ position: "absolute", bottom: 10, left: 12, display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#E8654A", flexShrink: 0 }} />
        <div style={{ fontSize: 7, color: "#9BA5BA" }}>Saleh Seddik</div>
      </div>
    </div>
  ),

  "figma-template": () => (
    <div className="w-full h-full relative overflow-hidden" style={{ background: "#0E0E0E" }}>
      {/* Mint eyebrow mono label */}
      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 7, color: "#00E18A", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>GTM</div>
      {/* Top-right carousel pill */}
      <div style={{ position: "absolute", top: 10, right: 12, fontSize: 7, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 1 }}>CAROUSEL</div>
      {/* Large centered hook */}
      <div style={{ position: "absolute", top: "28%", left: 12, right: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.0, letterSpacing: "-0.035em" }}>Stop guessing.</div>
        {/* Mint accent line */}
        <div style={{ width: 28, height: 2.5, background: "#00E18A", marginTop: 10, borderRadius: 1 }} />
      </div>
      {/* Sub text */}
      <div style={{ position: "absolute", bottom: 36, left: 12 }}>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>The full B2B playbook →</div>
      </div>
      {/* Mint signature dot */}
      <div style={{ position: "absolute", bottom: 10, left: 12, display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#00E18A", opacity: 0.9 }} />
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.45)" }}>@salehseddik</div>
      </div>
    </div>
  ),

  "split-insight": () => (
    <div className="w-full h-full relative overflow-hidden" style={{ background: "linear-gradient(160deg, #0A1628, #071020)", borderLeft: "4px solid #2D6BFF" }}>
      {/* Blue left accent bar at slide level — key differentiator */}
      <div style={{ position: "absolute", top: 10, left: 14, fontSize: 7, fontWeight: 800, color: "#2D6BFF", textTransform: "uppercase", letterSpacing: 1.5 }}>INSIGHT</div>
      {/* Large stat below eyebrow — shows data-forward feel */}
      <div style={{ position: "absolute", top: "26%", left: 14, right: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", lineHeight: 0.97, letterSpacing: "-0.04em" }}>87% close rate.</div>
        {/* Separator line */}
        <div style={{ width: "100%", height: 1, background: "rgba(45,107,255,0.3)", marginTop: 10, marginBottom: 10 }} />
        <div style={{ fontSize: 8, color: "#8A9BB5", lineHeight: 1.5, maxWidth: "90%" }}>Teams using AI-assisted outreach see results in week one</div>
      </div>
      {/* Signature */}
      <div style={{ position: "absolute", bottom: 10, left: 14, display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#2D6BFF" }} />
        <div style={{ fontSize: 7, color: "#8A9BB5" }}>Saleh Seddik</div>
      </div>
    </div>
  ),

  "minimal-line": () => (
    <div className="w-full h-full flex overflow-hidden" style={{ background: "#FAFAFA", borderLeft: "4px solid #FF4D1C" }}>
      <div style={{ flex: 1, padding: "12px 10px 12px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {/* Small caps eyebrow */}
        <div style={{ fontSize: 7, color: "#FF4D1C", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>INSIGHT</div>
        {/* Big sparse title */}
        <div style={{ fontSize: 19, fontWeight: 900, color: "#111111", lineHeight: 0.95, letterSpacing: "-0.04em" }}>Stop guessing.</div>
        {/* Body */}
        <div style={{ fontSize: 7.5, color: "#555555", lineHeight: 1.5 }}>Most founders miss the obvious signal hiding in plain sight.</div>
        {/* Footer divider + sig */}
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF4D1C" }} />
          <div style={{ fontSize: 7, color: "#999" }}>saleh seddik</div>
        </div>
      </div>
    </div>
  ),

  "big-statement": () => (
    <div className="w-full h-full relative overflow-hidden" style={{ background: "#0D0D0D" }}>
      {/* Mono eyebrow — tiny, almost invisible */}
      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 7, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1.5 }}>INSIGHT · 2024</div>
      {/* MASSIVE hook text — fills most of the slide */}
      <div style={{ position: "absolute", top: "18%", left: 12, right: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", lineHeight: 0.88, letterSpacing: "-0.055em" }}>Stop guessing.</div>
      </div>
      {/* Small supporting text, very faded */}
      <div style={{ position: "absolute", bottom: 32, left: 12, right: 20 }}>
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>The one habit separating top GTM teams</div>
      </div>
      {/* Signature — small, bottom right */}
      <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 7, color: "rgba(255,255,255,0.2)" }}>@salehseddik</div>
    </div>
  ),

  "quote-pull": () => (
    <div className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden" style={{ background: "#0F0F0F" }}>
      {/* Giant decorative quote mark — the signature element */}
      <div style={{ position: "absolute", top: -14, left: 6, fontSize: 90, color: "#2D6BFF", opacity: 0.1, fontFamily: "Georgia, serif", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>"</div>
      {/* Centered eyebrow */}
      <div style={{ fontSize: 7, color: "#2D6BFF", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>INSIGHT</div>
      {/* Centered italic quote */}
      <div style={{ position: "relative", textAlign: "center", padding: "0 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.35, fontStyle: "italic", letterSpacing: "-0.01em" }}>
          "The best GTM teams don't guess — they build systems."
        </div>
        {/* Blue attribution */}
        <div style={{ fontSize: 7, color: "#2D6BFF", marginTop: 8, fontWeight: 600 }}>— Saleh Seddik</div>
      </div>
    </div>
  ),
};

/** Fallback for themes that don't have a custom preview (color-only themes) */
function DefaultPreview({ t }: { t: typeof THEMES[number] }) {
  return (
    <div className="w-full h-full flex flex-col justify-between p-3 overflow-hidden" style={{ background: t.preview.bg, color: t.preview.fg }}>
      <div style={{ fontSize: 7, textTransform: "uppercase" as const, letterSpacing: 1, opacity: 0.55, fontWeight: 600 }}>CAROUSEL</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.025em" }}>Stop guessing.</div>
        <div style={{ fontSize: 8, marginTop: 5, opacity: 0.65 }}>Swipe →</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.preview.accent, flexShrink: 0 }} />
        <div style={{ fontSize: 7, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.preview.accent}</div>
      </div>
    </div>
  );
}

const LAYOUT_BADGES: Partial<Record<ThemeKey, { label: string; color: string }>> = {
  "split-insight":   { label: "left accent",    color: "#2D6BFF" },
  "minimal-line":    { label: "line + space",    color: "#FF4D1C" },
  "big-statement":   { label: "type-forward",    color: "#888888" },
  "quote-pull":      { label: "pull quote",      color: "#2D6BFF" },
  "figma-template":  { label: "personal brand",  color: "#00E18A" },
  "editorial-dark":  { label: "editorial",       color: "#E8654A" },
  "editorial-light": { label: "editorial",       color: "#E8654A" },
  "mono-minimal":    { label: "brutalist",       color: "#000000" },
  "bold-pop":        { label: "bold color",      color: "#E8654A" },
  "magazine-serif":  { label: "magazine",        color: "#A16A2C" },
  "tech-neon":       { label: "tech",            color: "#36F1A6" },
  "pastel-soft":     { label: "soft",            color: "#7C4DD1" },
  "corporate-clean": { label: "corporate",       color: "#1B5BFF" },
};

/**
 * Modal that lets the user pick the visual style/theme for their LinkedIn
 * carousel. Shows a rich layout preview for each style — not just color
 * swatches — so the user can see HOW text and elements will be positioned.
 * Auto-opens on first generation; reachable any time via the Style button.
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Pick a carousel style</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Each style has a unique layout composition — different text positioning, scale, and visual personality. Built for LinkedIn virality.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
          {THEMES.map((t) => {
            const selected = current === t.key;
            const PreviewComp = LAYOUT_PREVIEWS[t.key];
            const badge = LAYOUT_BADGES[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { onPick(t.key); onClose(); }}
                className={`group relative rounded-xl border overflow-hidden text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                  selected
                    ? "border-primary ring-2 ring-primary/40 shadow-lg -translate-y-0.5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {/* Rich layout preview */}
                <div className="aspect-[4/5] overflow-hidden relative bg-muted">
                  {PreviewComp ? <PreviewComp /> : <DefaultPreview t={t} />}

                  {/* Hover overlay with "Select" CTA */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all duration-150 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="bg-white text-black text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md">
                      {selected ? "Selected ✓" : "Use this style"}
                    </span>
                  </div>

                  {/* Layout badge */}
                  {badge && (
                    <div
                      className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44` }}
                    >
                      {badge.label}
                    </div>
                  )}

                  {/* Selected checkmark */}
                  {selected && (
                    <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* Name + description */}
                <div className="p-2 bg-card border-t border-border">
                  <div className="text-[11px] font-semibold text-foreground leading-tight">{t.label}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground">Style can be changed at any time from the Style button in the editor.</p>
          <Button variant="ghost" size="sm" onClick={onClose}>Skip for now</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
