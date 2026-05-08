import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function rel(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CarouselHistory() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);

  useEffect(() => { (async () => {
    const { data } = await supabase.from("carousels" as any).select("*").order("created_at", { ascending: false });
    setRows((data as any[]) ?? []); setLoading(false);
  })(); }, []);

  return (
    <section className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Carousel history</h1>
          <p className="text-sm text-muted-foreground">All your generated carousels.</p>
        </div>
        <Button asChild><Link to="/carousel-generator"><Plus className="w-4 h-4 mr-1" /> New carousel</Link></Button>
      </header>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : rows.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No carousels yet. <Link to="/carousel-generator" className="text-primary underline">Generate your first one.</Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rows.map((r) => (
              <button key={r.id} onClick={() => setOpen(r)} className="text-left">
                <Card className="overflow-hidden hover:border-primary/40 transition-colors">
                  {r.image_url
                    ? <img src={r.image_url} className="w-full aspect-square object-cover" alt="" />
                    : <div className="w-full aspect-square bg-muted" />}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant={r.status === "ready" ? "outline" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{rel(r.created_at)}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{r.copy?.title_of_the_post || "Untitled"}</div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open?.copy?.title_of_the_post || "Carousel"}</DialogTitle></DialogHeader>
          {open?.image_url && <img src={open.image_url} alt="" className="w-full rounded-lg border" />}
          {open?.copy && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{open.copy.heres_why}</p>
              {[1, 2, 3, 4].map((n) => {
                const title = open.copy[`page_${n}_title`];
                const body = open.copy[`page_${n}_body`] ?? open.copy[`page_${n}_text`];
                return (
                  <div key={n} className="border-t border-border pt-2">
                    <div className="text-xs uppercase text-muted-foreground">Page {n}</div>
                    {title && <div className="font-medium">{title}</div>}
                    {body && <p className="whitespace-pre-wrap">{body}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}