import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Info, Sparkles, Wand2, History as HistoryIcon, Loader2, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { CarouselSlide } from "@/components/designer/linkedin/LinkedInCanvas";
import { validateAiFill, type SlideIssue } from "@/lib/linkedin-fill-validation";
import { aiFixSlideIssue, listFillHistory, type FillHistoryRow } from "@/lib/linkedin-template-ai";
import { toast } from "sonner";

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
  /** When true, hashtag-only slides are allowed (user-opted style). */
  hashtagFirst?: boolean;
  onHashtagFirstChange?: (v: boolean) => void;
  /** Replace the live preview slides (used by per-issue AI fix). */
  onSlidesChange?: (slides: CarouselSlide[], iconHints: (string | null)[]) => void;
  /** Source post — passed to the targeted AI fix endpoint for context. */
  hook?: string;
  body?: string;
}) {
  const validation = useMemo(
    () => validateAiFill(props.slides ?? [], { hashtagFirst: props.hashtagFirst }),
    [props.slides, props.hashtagFirst],
  );
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

  // Per-issue fix state — slideIdx#code → loading.
  const [fixing, setFixing] = useState<string | null>(null);
  const [history, setHistory] = useState<FillHistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    listFillHistory(10).then(setHistory).catch(() => setHistory([]));
  }, [props.open]);

  async function fixIssue(issue: SlideIssue) {
    if (!props.onSlidesChange) return;
    const key = `${issue.slideIndex}#${issue.code}`;
    setFixing(key);
    try {
      const res = await aiFixSlideIssue({
        slides: props.slides, slideIndex: issue.slideIndex,
        issueCode: issue.code, issueMessage: issue.message,
        hook: props.hook ?? "", body: props.body ?? "",
        hashtagFirst: props.hashtagFirst,
      });
      if (!res.slide) { toast.error("AI returned no fix"); return; }
      const drop = (res.slide as any).drop === true;
      let nextSlides = props.slides.slice();
      let nextIcons = (props.iconHints ?? []).slice();
      if (drop) {
        nextSlides.splice(issue.slideIndex, 1);
        nextIcons.splice(issue.slideIndex, 1);
        toast.success(`Removed slide ${issue.slideIndex + 1}`);
      } else {
        nextSlides[issue.slideIndex] = { ...nextSlides[issue.slideIndex], ...res.slide } as CarouselSlide;
        toast.success(`Fixed slide ${issue.slideIndex + 1}`);
      }
      props.onSlidesChange(nextSlides, nextIcons);
    } catch (e: any) {
      toast.error(e?.message ?? "Fix failed");
    } finally {
      setFixing(null);
    }
  }

  function removeSlide(i: number) {
    if (!props.onSlidesChange) return;
    const ns = props.slides.slice(); ns.splice(i, 1);
    const ni = (props.iconHints ?? []).slice(); ni.splice(i, 1);
    props.onSlidesChange(ns, ni);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI slide plan preview
          </DialogTitle>
          <DialogDescription>
            Review the generated slides and validation results before applying them to your carousel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Badge variant={validation.score >= 80 ? "default" : validation.score >= 60 ? "secondary" : "destructive"}>
            Quality {validation.score}/100
          </Badge>
          {errorCount > 0 && <Badge variant="destructive">{errorCount} error{errorCount > 1 ? "s" : ""}</Badge>}
          {warnCount > 0 && <Badge variant="secondary">{warnCount} warning{warnCount > 1 ? "s" : ""}</Badge>}
          {errorCount === 0 && warnCount === 0 && (
            <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Looks premium</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {props.onHashtagFirstChange && (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Switch checked={!!props.hashtagFirst} onCheckedChange={props.onHashtagFirstChange} />
                Hashtag-first
              </label>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHistoryOpen((v) => !v)}>
              <HistoryIcon className="w-3.5 h-3.5 mr-1" /> History ({history.length})
            </Button>
            {props.usedMemories ? (
              <span className="text-muted-foreground text-xs">Learned from {props.usedMemories} edits</span>
            ) : null}
          </div>
        </div>

        {historyOpen && (
          <div className="rounded-md border bg-muted/30 p-2 max-h-48 overflow-auto">
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">No previous generations yet.</div>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-xs">
                    <Badge variant={h.score >= 80 ? "default" : h.score >= 60 ? "secondary" : "destructive"} className="w-12 justify-center">{h.score}</Badge>
                    <span className="text-muted-foreground tabular-nums w-32 shrink-0">{new Date(h.created_at).toLocaleString()}</span>
                    <span className="text-muted-foreground shrink-0">E{h.errors} W{h.warnings}</span>
                    {h.hashtag_first && <Badge variant="outline" className="text-[10px]">#-first</Badge>}
                    {h.applied && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">applied</Badge>}
                    <span className="truncate min-w-0">{h.post_hook}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
                    <div className="flex items-center gap-1">
                      {props.onSlidesChange && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSlide(i)} title="Remove slide">
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {hasErr ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        : hasWarn ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
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
                          <span className={`flex-1 ${iss.severity === "error" ? "text-destructive" : "text-muted-foreground"}`}>{iss.message}</span>
                          {props.onSlidesChange && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-5 px-1.5 text-[10px] gap-1 shrink-0"
                              disabled={fixing === `${iss.slideIndex}#${iss.code}`}
                              onClick={() => fixIssue(iss)}
                            >
                              {fixing === `${iss.slideIndex}#${iss.code}`
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Wand2 className="w-3 h-3" />}
                              Fix with AI
                            </Button>
                          )}
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