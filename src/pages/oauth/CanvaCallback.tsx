import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { exchangeCanvaCode } from "@/lib/social-connections";
import { toast } from "sonner";

export default function CanvaCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"working" | "ok" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");
    const errDesc = params.get("error_description");

    if (err) { setPhase("error"); setErrorMsg(errDesc ?? err); return; }
    if (!code || !state) { setPhase("error"); setErrorMsg("Missing code or state from Canva redirect."); return; }

    (async () => {
      try {
        const r = await exchangeCanvaCode(code, state);
        setProfile({ display_name: r.display_name });
        setPhase("ok");
        toast.success(`Canva connected as ${r.display_name ?? "you"}`);
        setTimeout(() => navigate(r.redirect_to || "/admin?tab=connections", { replace: true }), 1500);
      } catch (e: any) {
        setPhase("error");
        setErrorMsg(e?.message ?? "Failed to complete Canva connection.");
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-lg font-semibold">Canva connection</h1>
        </div>
        {phase === "working" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Completing Canva authorization…
          </div>
        )}
        {phase === "ok" && (
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <div>
              Connected as <span className="font-medium">{profile?.display_name ?? "Canva user"}</span>
              <div className="text-xs text-muted-foreground">Redirecting back…</div>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Canva connection failed</div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{errorMsg}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin?tab=connections")}>
              Back to settings
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
