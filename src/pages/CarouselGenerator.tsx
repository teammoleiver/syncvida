import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCarousel } from "@/lib/social-queries";

const STATUS_LABEL: Record<string, string> = {
  pending: "Starting…",
  writing_copy: "Writing copy…",
  ready: "Ready",
  failed: "Failed",
};

export default function CarouselGenerator() {
  const [posts, setPosts] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<any | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => () => { if (channelRef.current) supabase.removeChannel(channelRef.current); }, []);

  function reset() {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setRow(null); setPosts(Array(6).fill("")); setBusy(false);
  }

  async function generate() {
    for (const p of posts) {
      if (!p.trim() || p.trim().length < 20) {
        toast.error("Each post needs at least 20 characters"); return;
      }
    }
    setBusy(true);
    try {
      const { data, error } = await generateCarousel(posts);
      if (error) throw error;
      const id = (data as any)?.id;
      if (!id) throw new Error("No id returned");
      const { data: initial } = await supabase.from("carousels" as any).select("*").eq("id", id).maybeSingle();
      setRow(initial);
      const ch = supabase.channel(`carousel:${id}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "carousels", filter: `id=eq.${id}` },
          (payload) => setRow(payload.new))
        .subscribe();
      channelRef.current = ch;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed"); setBusy(false);
    }
  }

  const status: string = row?.status ?? "";
  const isWorking = busy && status !== "ready" && status !== "failed";

  return (
    <section className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Carousel Generator</h1>
          <p className="text-sm text-muted-foreground">Paste 6 LinkedIn posts. We turn them into a 4-page carousel copy outline.</p>
        </div>
        <Button variant="outline" asChild><Link to="/carousel-history"><History className="w-4 h-4 mr-1" /> History</Link></Button>
      </header>

      {!row && (
        <Card className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            {posts.map((v, i) => (
              <div key={i} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Post {i + 1}</label>
                <Textarea rows={6} value={v} placeholder="Paste a LinkedIn post (min 20 chars)…"
                  onChange={(e) => { const next = [...posts]; next[i] = e.target.value; setPosts(next); }} />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Generate carousel
            </Button>
          </div>
        </Card>
      )}

      {row && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={status === "failed" ? "destructive" : "outline"}>{STATUS_LABEL[status] ?? status}</Badge>
              {row.copy?.title_of_the_post && <span className="text-sm font-medium">{row.copy.title_of_the_post}</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><RefreshCw className="w-4 h-4 mr-1" /> Generate another</Button>
          </div>

          {isWorking && (
            <div className="space-y-3">
              <Skeleton className="w-full aspect-square max-w-xl mx-auto" />
              <p className="text-center text-sm text-muted-foreground animate-pulse">{STATUS_LABEL[status] ?? "Working…"}</p>
            </div>
          )}

          {status === "ready" && row.copy && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/30">
                <h3 className="font-display text-xl font-bold mb-1">{row.copy.title_of_the_post}</h3>
                <p className="text-sm text-muted-foreground mb-4">{row.copy.heres_why}</p>
                {[1, 2, 3, 4].map((n) => {
                  const title = row.copy[`page_${n}_title`];
                  const body = row.copy[`page_${n}_body`] ?? row.copy[`page_${n}_text`];
                  return (
                    <div key={n} className="border-t border-border pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
                      <div className="text-xs uppercase text-muted-foreground mb-1">Page {n}</div>
                      {title && <div className="font-medium">{title}</div>}
                      {body && <p className="text-sm whitespace-pre-wrap">{body}</p>}
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {status === "failed" && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{row.error_message || "Something went wrong."}</p>
              <Button onClick={reset} variant="outline">Try again</Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}