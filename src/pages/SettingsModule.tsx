import { useState, useEffect, useRef } from "react";
import { User, Key, Globe, Bell, Download, Heart, Check, LogOut, Lock, Loader2, Camera, Sparkles, Pencil, Trash2, Plus, UserPlus, Mail, Copy, Send } from "lucide-react";
import { listDesignMemory, addDesignMemory, updateDesignMemory, deleteDesignMemory, type MemoryRow } from "@/lib/linkedin-ai-review";
import { listWritingMemory, addWritingMemory, updateWritingMemory, deleteWritingMemory, type WritingMemoryRow } from "@/lib/linkedin-review";
import { getUserProfile, getProfile, updateProfile } from "@/lib/supabase-queries";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ApiKeyModal from "@/components/modals/ApiKeyModal";
import { useToast } from "@/hooks/use-toast";
import { resolveAvatarUrl, uploadAvatar } from "@/lib/avatar";
import { emitSync } from "@/lib/sync-events";

export default function SettingsModule() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [apiKeyModal, setApiKeyModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [userProfile, appProfile] = await Promise.all([getUserProfile(), getProfile()]);
      if (cancelled) return;

      const profileData = appProfile as any;

      setHasApiKey(!!userProfile?.openai_api_key);
      setProfile(profileData);

      const resolvedAvatar = await resolveAvatarUrl({
        userId: user?.id,
        storedAvatar: profileData?.avatar_url,
        oauthAvatarUrl: user?.user_metadata?.avatar_url || null,
      });

      if (!cancelled) setAvatarUrl(resolvedAvatar);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 5MB.", variant: "destructive" });
      return;
    }

    setAvatarUploading(true);
    try {
      const uid = user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { filePath, signedUrl } = await uploadAvatar(file, uid);
      await updateProfile({ avatar_url: filePath });

      setProfile((current: any) => current ? { ...current, avatar_url: filePath } : current);
      setAvatarUrl(signedUrl);
      emitSync("sync:all");
      toast({ title: "Photo updated!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleChangePassword = async () => {
    if (!newPw || newPw.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast({ title: "Password updated!" });
      setNewPw("");
      setChangingPw(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Profile</h1>

      {/* Profile */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-4">
          {/* Avatar with upload */}
          <div className="relative group">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                onError={() => setAvatarUrl(user?.user_metadata?.avatar_url || null)}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary text-2xl font-bold text-primary">
                {(profile?.name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
            {/* Upload overlay */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 flex items-center justify-center transition-all cursor-pointer"
            >
              {avatarUploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">{profile?.name || "User"}</h3>
            <p className="text-xs text-muted-foreground">{profile?.full_name || ""}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Account Management */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="font-display font-semibold text-foreground">Account</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">Change your account password</p>
            </div>
          </div>
          <button
            onClick={() => setChangingPw(!changingPw)}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent transition font-medium"
          >
            {changingPw ? "Cancel" : "Change"}
          </button>
        </div>
        {changingPw && (
          <div className="flex gap-2 ml-12">
            <input
              type="password"
              placeholder="New password (min 6 chars)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleChangePassword}
              disabled={pwLoading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {pwLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sign Out</p>
              <p className="text-xs text-muted-foreground">Sign out of your account</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Settings Groups */}
      {[
        {
          icon: Key,
          title: "OpenAI API Key",
          desc: hasApiKey ? "Connected — Syncvida AI is ready" : "Required for Syncvida AI Assistant",
          action: hasApiKey ? "Connected" : "Configure",
          badge: hasApiKey,
          onClick: () => setApiKeyModal(true),
        },
        {
          icon: Heart,
          title: "Fasting Protocol",
          desc: "Manage in Fasting module",
          action: "Manage",
          onClick: () => window.location.href = "/fasting",
        },
        {
          icon: Globe,
          title: "Language",
          desc: "English / Spanish",
          action: "English",
        },
        {
          icon: Bell,
          title: "Notifications",
          desc: "Reminders for water, meals, fasting windows",
          action: "Configure",
        },
        {
          icon: Download,
          title: "Data Export",
          desc: "Export your health data as CSV or PDF",
          action: "Export",
        },
      ].map((item) => (
        <div key={item.title} className="glass-card rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <item.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {"badge" in item && item.badge && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
          <button
            onClick={"onClick" in item ? item.onClick : undefined}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent transition font-medium"
          >
            {item.action}
          </button>
        </div>
      ))}

      <InvitePeopleSettings />
      <LinkedInMemorySettings />
      <WritingMemorySettings />

      <ApiKeyModal open={apiKeyModal} onClose={() => { setApiKeyModal(false); getUserProfile().then((p) => setHasApiKey(!!p?.openai_api_key)); }} />
    </div>
  );
}

/**
 * Manage the LinkedIn design memory — the rules the AI review learned from
 * accepted fixes (plus any you add). Active rules are fed into every new
 * review so the same issues aren't repeated. View / edit / disable / delete.
 */
function LinkedInMemorySettings() {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function load() { setLoading(true); listDesignMemory().then(setRows).finally(() => setLoading(false)); }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newRule.trim()) return;
    await addDesignMemory(newRule, "user");
    setNewRule("");
    load();
  }
  async function toggle(r: MemoryRow) { await updateDesignMemory(r.id, { active: !r.active }); load(); }
  async function saveEdit(r: MemoryRow) { if (editText.trim()) await updateDesignMemory(r.id, { rule: editText.trim() }); setEditingId(null); load(); }
  async function remove(r: MemoryRow) { await deleteDesignMemory(r.id); load(); }

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-foreground">LinkedIn design memory</h3>
          <p className="text-xs text-muted-foreground">
            Rules the AI review learned from the fixes you accepted. They're applied to every new carousel so the same issues aren't repeated. Edit, disable, or delete any.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a rule, e.g. “Keep slide titles under 8 words”"
          className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button onClick={add} className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition font-medium flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No learned rules yet — accept a fix in an AI review, or add one above.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 rounded-lg border border-border p-2 ${r.active ? "" : "opacity-50"}`}>
              <button onClick={() => toggle(r)} title={r.active ? "Disable" : "Enable"} className={`shrink-0 w-8 h-5 rounded-full transition relative ${r.active ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.active ? "left-3.5" : "left-0.5"}`} />
              </button>
              {editingId === r.id ? (
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r); if (e.key === "Escape") setEditingId(null); }}
                  onBlur={() => saveEdit(r)}
                  autoFocus
                  className="flex-1 px-2 py-1 rounded bg-secondary border border-border text-foreground text-xs outline-none"
                />
              ) : (
                <span className={`flex-1 text-xs ${r.active ? "text-foreground" : "text-muted-foreground line-through"}`}>{r.rule}</span>
              )}
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{r.source.replace("_", " ")}</span>
              <button onClick={() => { setEditingId(r.id); setEditText(r.rule); }} title="Edit" className="shrink-0 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => remove(r)} title="Delete" className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Manage the writing-style memory — rules learned from posts you reject/delete
 * in LinkedIn Review (plus manual additions). Active rules are fed into the AI
 * rewrite/generation so it stops writing the kinds of posts you reject.
 */
function WritingMemorySettings() {
  const [rows, setRows] = useState<WritingMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function load() { setLoading(true); listWritingMemory().then(setRows).finally(() => setLoading(false)); }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newRule.trim()) return;
    await addWritingMemory(newRule, null, "user");
    setNewRule("");
    load();
  }
  async function toggle(r: WritingMemoryRow) { await updateWritingMemory(r.id, { active: !r.active }); load(); }
  async function saveEdit(r: WritingMemoryRow) { if (editText.trim()) await updateWritingMemory(r.id, { rule: editText.trim() }); setEditingId(null); load(); }
  async function remove(r: WritingMemoryRow) { await deleteWritingMemory(r.id); load(); }

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-foreground">Writing-style memory</h3>
          <p className="text-xs text-muted-foreground">
            Rules learned from the posts you reject or delete in LinkedIn Review. Active rules are fed into the AI rewrite/generation so it stops writing posts like the ones you didn't want.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a rule, e.g. “Never open with a question”"
          className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button onClick={add} className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition font-medium flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No learned rules yet — reject a post in LinkedIn Review with a reason, or add one above.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 rounded-lg border border-border p-2 ${r.active ? "" : "opacity-50"}`}>
              <button onClick={() => toggle(r)} title={r.active ? "Disable" : "Enable"} className={`shrink-0 w-8 h-5 rounded-full transition relative ${r.active ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.active ? "left-3.5" : "left-0.5"}`} />
              </button>
              {editingId === r.id ? (
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r); if (e.key === "Escape") setEditingId(null); }}
                  onBlur={() => saveEdit(r)}
                  autoFocus
                  className="flex-1 px-2 py-1 rounded bg-secondary border border-border text-foreground text-xs outline-none"
                />
              ) : (
                <span className={`flex-1 text-xs ${r.active ? "text-foreground" : "text-muted-foreground line-through"}`}>{r.rule}</span>
              )}
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{r.source}</span>
              <button onClick={() => { setEditingId(r.id); setEditText(r.rule); }} title="Edit" className="shrink-0 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => remove(r)} title="Delete" className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type InviteRow = { id: string; email: string; status: string; created_at: string };

/**
 * Invite people into the closed beta. Creates their account and returns a
 * one-time link to share by any channel — no public signup needed.
 */
function InvitePeopleSettings() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<InviteRow[]>([]);

  function load() {
    supabase.from("invites" as any).select("id,email,status,created_at").order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as any) ?? []));
  }
  useEffect(() => { load(); }, []);

  const loginUrl = `${window.location.origin}/auth`;
  const inviteMessage = lastInvite
    ? `You're invited to Syncvida (closed beta).\n\nSign in here: ${loginUrl}\nEmail: ${lastInvite.email}\nTemporary password: ${lastInvite.password}\n\nAfter you log in, change your password in Settings.`
    : "";

  async function sendInvite() {
    const e = email.trim();
    if (!e) return;
    setSending(true);
    setLastInvite(null);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", { body: { email: e } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.password) setLastInvite({ email: (data as any).email, password: (data as any).password });
      setEmail("");
      load();
      toast({ title: "Account created", description: `Share the credentials with ${e}.` });
    } catch (err: any) {
      toast({ title: "Couldn't invite", description: err?.message ?? "Failed", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function copyMessage() {
    if (!inviteMessage) return;
    await navigator.clipboard.writeText(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UserPlus className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-foreground">Invite people</h3>
          <p className="text-xs text-muted-foreground">
            Bring testers into the closed beta. We create their account and give you a temporary password to share — no public signup. They sign in and change it. (Use an email that isn't already a user.)
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendInvite(); }}
            placeholder="person@email.com"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button onClick={sendInvite} disabled={sending || !email.trim()}
          className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition font-medium flex items-center gap-1 disabled:opacity-50">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Invite
        </button>
      </div>

      {lastInvite && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-primary">Account created — send these credentials</div>
            <button onClick={copyMessage} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground font-medium flex items-center gap-1">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy message"}
            </button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] bg-background rounded border border-border p-2">
            <span className="text-muted-foreground">Sign in</span><span className="font-mono break-all">{loginUrl}</span>
            <span className="text-muted-foreground">Email</span><span className="font-mono break-all">{lastInvite.email}</span>
            <span className="text-muted-foreground">Temp password</span><span className="font-mono font-semibold">{lastInvite.password}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Send these however you like (email, WhatsApp, DM). They sign in and change the password in Settings.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Invited ({rows.length})</div>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{r.email}</span>
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{r.status}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
