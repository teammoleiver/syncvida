import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import type { CarouselSlide } from "@/components/designer/linkedin/LinkedInCanvas";
import { validateAiFill, type SlideIssue } from "@/lib/linkedin-fill-validation";

/**
 * AI Preview mode — shows the generated slide plan (titles, bodies, icons,
 * validation flags) so the user can review and either apply or discard
 * before we ever touch the canvas.
 */
export function AiFillPreviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: CarouselSlide[];
  iconHints: (string | null)[];
  rationale?: string | null;
  usedMemories?: number;
  onApply: () => void;
  applying?: boolean;
}) {
  const validation = useMemo(() => validateAiFill(props.slides ?? []), [props.slides]);
  const issuesByIdx = useMemo(() => {
    const m = new Map<number, SlideIssue[]>();
    for (const i of validation.issues) {
      const arr = m.get(i.slideIndex) ?? [];
      arr.push(i);
      m.set(i.slideIndex, arr);
    }
    return m;
  }, [validation]);

  const errorCount = validation.issues.filter((i) => i.severity === "error").length;
  const warnCount = validation.issues.filter((i) => i.severity === "warn").length;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI slide plan preview
          </DialogTitle>
          <DialogDescription>
            Review the generated slides and validation results before applying them to your carousel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant={validation.score >= 80 ? "default" : validation.score >= 60 ? "secondary" : "destructive"}>
            Quality {validation.score}/100
          </Badge>
          {errorCount > 0 && <Badge variant="destructive">{errorCount} error{errorCount > 1 ? "s" : ""}</Badge>}
          {warnCount > 0 && <Badge variant="secondary">{warnCount} warning{warnCount > 1 ? "s" : ""}</Badge>}
          {errorCount === 0 && warnCount === 0 && (
            <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Looks premium</span>
          )}
          {props.usedMemories ? (
            <span className="text-muted-foreground ml-auto text-xs">Learned from {props.usedMemories} past edits</span>
          ) : null}
        </div>

        {props.rationale && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{props.rationale}</p>
        )}

        <ScrollArea className="h-[420px] pr-3 -mr-3">
          <ol className="space-y-3">
            {props.slides.map((s, i) => {
              const issues = issuesByIdx.get(i) ?? [];
              const hasErr = issues.some((x) => x.severity === "error");
              const hasWarn = issues.some((x) => x.severity === "warn");
              return (
                <li
                  key={i}
                  className={`rounded-lg border p-3 ${
                    hasErr ? "border-destructive/50 bg-destructive/5"
                      : hasWarn ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{(s as any).layout || "text"}</Badge>
                      {props.iconHints?.[i] && (
                        <Badge variant="secondary" className="text-[10px]">icon: {props.iconHints[i]}</Badge>
                      )}
                    </div>
                    {hasErr ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                      : hasWarn ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  {s.eyebrow && <div className="text-[10px] tracking-widest uppercase text-muted-foreground">{s.eyebrow}</div>}
                  <div className="font-semibold text-sm leading-snug break-words">{s.title || <span className="text-muted-foreground italic">(no title)</span>}</div>
                  {s.body && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.body}</p>}
                  {Array.isArray(s.bullets) && s.bullets.length > 0 && (
                    <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside space-y-0.5">
                      {s.bullets.slice(0, 5).map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  )}
                  {issues.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {issues.map((iss, j) => (
                        <li key={j} className="text-[11px] flex items-start gap-1.5">
                          {iss.severity === "error" ? <AlertTriangle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                            : iss.severity === "warn" ? <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                            : <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                          <span className={iss.severity === "error" ? "text-destructive" : "text-muted-foreground"}>{iss.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={props.applying}>Discard</Button>
          <Button onClick={props.onApply} disabled={props.applying}>
            {props.applying ? "Applying…" : errorCount > 0 ? "Apply anyway" : "Apply to carousel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}