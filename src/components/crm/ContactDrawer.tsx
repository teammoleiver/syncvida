import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Linkedin, Search, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getContact, updateContact, pushContactToTrackedProfile,
  findTrackedProfileByLinkedInUrl, getPostsForContactLinkedInUrl, listActivities, createActivity,
} from "@/lib/crm-queries";
import ContactForm from "./ContactForm";
import { Textarea } from "@/components/ui/textarea";

export default function ContactDrawer({ contactId, open, onOpenChange, onChanged }: { contactId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const [c, setC] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [tracked, setTracked] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[] | null>(null);

  async function load() {
    if (!contactId) return;
    const data = await getContact(contactId);
    setC(data);
    if (data?.linkedin_url) {
      const [p, t] = await Promise.all([
        getPostsForContactLinkedInUrl(data.linkedin_url),
        findTrackedProfileByLinkedInUrl(data.linkedin_url),
      ]);
      setPosts(p); setTracked(t);
    } else { setPosts([]); setTracked(null); }
    setActs(await listActivities({ contactId }));
  }

  useEffect(() => { if (open && contactId) load(); }, [open, contactId]);

  async function findLinkedIn() {
    if (!c) return;
    setBusy("find"); setCandidates(null);
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const { data, error } = await supabase.functions.invoke("crm-find-linkedin-url", { body: { name, company: c.company?.name } });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const cands = (data as any)?.candidates ?? [];
    if (!cands.length) toast.info("No LinkedIn results");
    setCandidates(cands);
  }

  async function saveLinkedIn(url: string) {
    if (!c) return;
    await updateContact(c.id, { linkedin_url: url });
    setCandidates(null);
    await load(); onChanged();
    toast.success("LinkedIn URL saved");
  }

  async function pushToTracking() {
    if (!c) return;
    setBusy("push");
    try { await pushContactToTrackedProfile(c.id); toast.success("Added to Social Hub tracking"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function fetchPosts() {
    if (!c?.linkedin_url) return;
    if (!tracked?.id) {
      toast.error("Push to Social Hub tracking first");
      return;
    }
    setBusy("scrape");
    try {
      const { error } = await supabase.functions.invoke("scrape-linkedin-profile", {
        body: { profile_id: tracked.id, manual: true, limit: 10 },
      });
      if (error) throw error;
      toast.success("Scrape kicked off — refresh in a moment");
      setTimeout(load, 4000);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function addNote() {
    if (!note.trim() || !c) return;
    await createActivity({ contact_id: c.id, type: "note", content: note });
    setNote(""); setActs(await listActivities({ contactId: c.id }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{c ? ([c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Contact") : <Loader2 className="w-4 h-4 animate-spin" />}</SheetTitle>
        </SheetHeader>
        {c && (
          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="social" className="flex-1">Social Hub</TabsTrigger>
              <TabsTrigger value="posts" className="flex-1">Posts</TabsTrigger>
              <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <ContactForm initial={c} onSubmit={async (vals) => {
                await updateContact(c.id, {
                  first_name: vals.first_name, last_name: vals.last_name, email: vals.email, phone: vals.phone,
                  title: vals.title, linkedin_url: vals.linkedin_url, notes: vals.notes, company_id: vals.company_id,
                });
                toast.success("Saved"); onChanged(); await load();
              }} submitLabel="Save changes" />
            </TabsContent>

            <TabsContent value="social" className="mt-4 space-y-3">
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">LinkedIn URL</div>
                <div className="flex items-center gap-2 mt-1">
                  {c.linkedin_url ? (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-primary text-sm break-all underline flex items-center gap-1">
                      {c.linkedin_url} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : <span className="text-muted-foreground text-sm italic">Not set</span>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={findLinkedIn} disabled={busy === "find"}>
                {busy === "find" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Find LinkedIn URL with AI
              </Button>
              {candidates && (
                <div className="border border-border rounded-lg p-2 space-y-1.5">
                  {candidates.length === 0 ? <div className="text-xs text-muted-foreground p-2">No candidates</div> :
                    candidates.map((cand) => (
                      <button key={cand.url} onClick={() => saveLinkedIn(cand.url)} className="w-full text-left p-2 rounded hover:bg-accent text-xs">
                        <div className="font-medium">{cand.title}</div>
                        <div className="text-muted-foreground truncate">{cand.url}</div>
                      </button>
                    ))}
                </div>
              )}
              <div className="border-t border-border pt-3 space-y-2">
                {tracked ? (
                  <div className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded p-2">
                    ✓ Already tracked in Social Hub as <strong>{tracked.display_name}</strong>
                  </div>
                ) : (
                  <Button size="sm" onClick={pushToTracking} disabled={!c.linkedin_url || busy === "push"} className="w-full">
                    {busy === "push" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Linkedin className="w-4 h-4 mr-2" />}
                    Push to Social Hub tracking
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={fetchPosts} disabled={!c.linkedin_url || busy === "scrape"} className="w-full">
                  {busy === "scrape" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Fetch latest posts
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="mt-4">
              {posts.length === 0 ? <div className="text-sm text-muted-foreground p-6 text-center">No posts yet. Use the Social Hub tab to push this contact to tracking and fetch posts.</div> :
                <div className="space-y-3">
                  {posts.map((p) => (
                    <div key={p.id} className="border border-border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : "—"} · {p.likes ?? 0} likes</div>
                      <div className="text-sm whitespace-pre-wrap line-clamp-6">{p.post_text}</div>
                      {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">View on LinkedIn →</a>}
                    </div>
                  ))}
                </div>}
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-3">
              <Textarea rows={2} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" onClick={addNote} disabled={!note.trim()}>Add note</Button>
              <div className="divide-y divide-border">
                {acts.map((a) => (
                  <div key={a.id} className="py-2">
                    <div className="text-xs text-muted-foreground">{new Date(a.occurred_at).toLocaleString()} · {a.type}</div>
                    <div className="text-sm whitespace-pre-wrap">{a.content}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}