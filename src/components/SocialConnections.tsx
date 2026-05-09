import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Linkedin, Loader2, CheckCircle2, AlertTriangle, LogOut, Plug, Palette } from "lucide-react";
import { toast } from "sonner";
import { listMyConnections, startLinkedInAuth, disconnectLinkedIn, startCanvaAuth, disconnectCanva, type SocialConnectionMeta } from "@/lib/social-connections";

export default function SocialConnections() {
  const [conns, setConns] = useState<SocialConnectionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try { setConns(await listMyConnections()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load connections"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const linkedin = conns.find((c) => c.provider === "linkedin");
  const isExpired = linkedin?.expires_at && new Date(linkedin.expires_at).getTime() < Date.now();
  const canva = conns.find((c) => c.provider === "canva");
  const canvaExpired = canva?.expires_at && new Date(canva.expires_at).getTime() < Date.now();

  async function connectLinkedIn() {
    setBusy("linkedin");
    try {
      const { authorize_url } = await startLinkedInAuth(window.location.pathname + window.location.search);
      window.location.href = authorize_url;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start LinkedIn auth");
      setBusy(null);
    }
  }

  async function dropLinkedIn() {
    if (!confirm("Disconnect LinkedIn? You'll need to re-authorize to post directly.")) return;
    setBusy("linkedin");
    try { await disconnectLinkedIn(); toast.success("LinkedIn disconnected"); reload(); }
    catch (e: any) { toast.error(e?.message ?? "Disconnect failed"); }
    finally { setBusy(null); }
  }

  async function connectCanva() {
    setBusy("canva");
    try {
      const { authorize_url } = await startCanvaAuth(window.location.pathname + window.location.search);
      window.location.href = authorize_url;
    } catch (e: any) { toast.error(e?.message ?? "Could not start Canva auth"); setBusy(null); }
  }
  async function dropCanva() {
    if (!confirm("Disconnect Canva?")) return;
    setBusy("canva");
    try { await disconnectCanva(); toast.success("Canva disconnected"); reload(); }
    catch (e: any) { toast.error(e?.message ?? "Disconnect failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <Card className="p-4 border-blue-500/30">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Linkedin className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="font-medium">LinkedIn</div>
                  {linkedin ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {isExpired ? <AlertTriangle className="w-3 h-3 text-amber-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      Connected as <span className="text-foreground">{linkedin.display_name ?? linkedin.provider_user_id}</span>
                      {isExpired && <span className="text-amber-300 ml-1">(token expired)</span>}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Not connected. Connect to post directly without Zapier / n8n.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {linkedin ? (
                  <>
                    {isExpired && (
                      <Button size="sm" onClick={connectLinkedIn} disabled={busy === "linkedin"}>
                        {busy === "linkedin" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                        Reconnect
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={dropLinkedIn} disabled={busy === "linkedin"}>
                      <LogOut className="w-3.5 h-3.5 mr-1" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={connectLinkedIn} disabled={busy === "linkedin"}>
                    {busy === "linkedin" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                    Connect LinkedIn
                  </Button>
                )}
              </div>
            </div>
            {linkedin?.scope && (
              <p className="text-[10px] text-muted-foreground mt-3">Scope: <code>{linkedin.scope}</code></p>
            )}
          </Card>

          <Card className="p-4 border-purple-500/30">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-purple-500/10 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <div className="font-medium">Canva</div>
                  {canva ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {canvaExpired ? <AlertTriangle className="w-3 h-3 text-amber-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      Connected as <span className="text-foreground">{canva.display_name ?? canva.email ?? canva.provider_user_id}</span>
                      {canvaExpired && <span className="text-amber-300 ml-1">(token expired)</span>}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Not connected. Connect to design directly in Canva and pull the result into your posts.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {canva ? (
                  <>
                    {canvaExpired && (
                      <Button size="sm" onClick={connectCanva} disabled={busy === "canva"}>
                        {busy === "canva" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                        Reconnect
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={dropCanva} disabled={busy === "canva"}>
                      <LogOut className="w-3.5 h-3.5 mr-1" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={connectCanva} disabled={busy === "canva"}>
                    {busy === "canva" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                    Connect Canva
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-4 opacity-60">
            <div className="text-xs text-muted-foreground">
              Facebook, Instagram and X direct connections will appear here once their integrations are wired in.
              For now those platforms still go through your webhook configuration.
            </div>
          </Card>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">LinkedIn — first-time setup checklist</summary>
            <ol className="mt-2 list-decimal list-inside space-y-1.5 pl-2">
              <li>Create a LinkedIn Developer App at <a className="text-primary underline" href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer">linkedin.com/developers/apps</a>.</li>
              <li>Under <em>Products</em>, request <strong>Sign In with LinkedIn using OpenID Connect</strong> and <strong>Share on LinkedIn</strong>. Both auto-approve.</li>
              <li>Under <em>Auth</em> → <em>Authorized redirect URLs</em>, add <code>{`${window.location.origin}/oauth/linkedin/callback`}</code>.</li>
              <li>Copy <em>Client ID</em> and <em>Client Secret</em>.</li>
              <li>In Supabase → Edge Functions → Secrets, set:
                <ul className="list-disc list-inside pl-4">
                  <li><code>LINKEDIN_CLIENT_ID</code></li>
                  <li><code>LINKEDIN_CLIENT_SECRET</code></li>
                  <li><code>LINKEDIN_REDIRECT_URI</code> = <code>{`${window.location.origin}/oauth/linkedin/callback`}</code></li>
                </ul>
              </li>
              <li>Click <em>Connect LinkedIn</em> above.</li>
            </ol>
          </details>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Canva — first-time setup checklist</summary>
            <ol className="mt-2 list-decimal list-inside space-y-1.5 pl-2">
              <li>Sign up at <a className="text-primary underline" href="https://www.canva.com/developers/" target="_blank" rel="noreferrer">canva.com/developers</a> (free).</li>
              <li>Create a new <strong>Integration</strong> at <a className="text-primary underline" href="https://www.canva.com/developers/integrations" target="_blank" rel="noreferrer">canva.com/developers/integrations</a>. Choose <em>Public</em> integration type.</li>
              <li>Under <em>Authentication</em>, add <strong>Authorized redirect URL</strong>: <code>{`${window.location.origin}/oauth/canva/callback`}</code>.</li>
              <li>Under <em>Scopes</em>, request:
                <ul className="list-disc list-inside pl-4 text-[10px]">
                  <li><code>profile:read</code></li>
                  <li><code>design:meta:read</code>, <code>design:content:read</code>, <code>design:content:write</code></li>
                  <li><code>asset:read</code>, <code>asset:write</code></li>
                  <li><code>brandtemplate:meta:read</code>, <code>brandtemplate:content:read</code></li>
                  <li><code>folder:read</code></li>
                </ul>
              </li>
              <li>Copy <em>Client ID</em> and <em>Client Secret</em> from the integration's auth page.</li>
              <li>In Supabase → Edge Functions → Secrets, set:
                <ul className="list-disc list-inside pl-4">
                  <li><code>CANVA_CLIENT_ID</code></li>
                  <li><code>CANVA_CLIENT_SECRET</code></li>
                  <li><code>CANVA_REDIRECT_URI</code> = <code>{`${window.location.origin}/oauth/canva/callback`}</code></li>
                </ul>
              </li>
              <li>Click <em>Connect Canva</em> above.</li>
            </ol>
          </details>
        </>
      )}
    </div>
  );
}
