import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import instaleadsyncLogo from "@/assets/instaleadsync-icon.png";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "waitlist" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a password reset link." });
        setMode("login");
      } else if (mode === "waitlist") {
        const { error } = await supabase.from("waitlist").insert({ email });
        if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
        toast({ title: "You're on the list!", description: "We'll email you the moment signups open." });
        setEmail("");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <img src={instaleadsyncLogo} alt="Instaleadsync" className="w-14 h-14 mx-auto" />
          <h1 className="text-2xl font-display font-bold text-foreground">Instaleadsync</h1>
          <p className="text-sm text-muted-foreground">Your Health Operating System</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground text-center">
            {mode === "login" ? "Welcome back" : mode === "waitlist" ? "Join the waitlist" : "Reset password"}
          </h2>

          {mode === "waitlist" && (
            <p className="text-xs text-center text-muted-foreground -mt-2">
              New signups are currently paused. Leave your email and we'll notify you the moment Instaleadsync opens to new users.
            </p>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                required
              />
            </div>

            {mode === "login" && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}

            {mode === "login" && (
              <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline block ml-auto">
                Forgot password?
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Sign In" : mode === "waitlist" ? "Notify Me" : "Send Reset Link"}
            </button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            {mode === "login" ? (
              <>Don't have an account yet?{" "}<button onClick={() => setMode("waitlist")} className="text-primary hover:underline">Join the waitlist</button></>
            ) : mode === "waitlist" ? (
              <>Already have an account?{" "}<button onClick={() => setMode("login")} className="text-primary hover:underline">Sign in</button></>
            ) : (
              <button onClick={() => setMode("login")} className="text-primary hover:underline">Back to sign in</button>
            )}
          </p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          © {new Date().getFullYear()} Instaleadsync · instaleadsync.com
        </p>
      </div>
    </div>
  );
}
