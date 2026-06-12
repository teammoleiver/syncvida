import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield, Folder, Megaphone, Library, ClipboardList, Plus, Trash2, Loader2, FolderKanban, User as UserIcon, Webhook, Linkedin, Facebook, Instagram, Twitter, Youtube, Save, History, Plug, Workflow } from "lucide-react";
import WebhookHistory from "@/components/WebhookHistory";
import SocialConnections from "@/components/SocialConnections";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  listContentCategories, createContentCategory,
  updateContentCategory, deleteContentCategory, listContentItems,
  listWebhookSettings, upsertWebhookSetting, PLANNER_PLATFORMS,
} from "@/lib/social-queries";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import SettingsModule from "./SettingsModule";
import SocialHubSettings from "@/components/settings/SocialHubSettings";
import AiProviderSettings from "@/components/settings/AiProviderSettings";
import CrmSettingsPage from "./crm/CrmSettingsPage";
import { Sparkles } from "lucide-react";

type Cat = { id: string; name: string; slug: string; color?: string };
type Item = { id: string; category_id: string | null };

export default function AdminPanel() {
  // Each tab is a real URL: /settings/<section> (and /settings/social-hub/<sub>).
  const { section, sub } = useParams();
  const navigate = useNavigate();
  const activeTab = section ?? "profile";
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Centralized settings for every module in Syncvida.</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/settings/${v}`)} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="profile"><UserIcon className="w-4 h-4 mr-1.5" />Profile</TabsTrigger>
          <TabsTrigger value="content"><Library className="w-4 h-4 mr-1.5" />Content</TabsTrigger>
          <TabsTrigger value="connections"><Plug className="w-4 h-4 mr-1.5" />Connections</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="w-4 h-4 mr-1.5" />Webhooks</TabsTrigger>
          <TabsTrigger value="social-hub"><Megaphone className="w-4 h-4 mr-1.5" />Social Hub</TabsTrigger>
          <TabsTrigger value="content-planner"><ClipboardList className="w-4 h-4 mr-1.5" />Content Planner</TabsTrigger>
          <TabsTrigger value="productivity"><FolderKanban className="w-4 h-4 mr-1.5" />Productivity</TabsTrigger>
          <TabsTrigger value="crm"><Workflow className="w-4 h-4 mr-1.5" />CRM</TabsTrigger>
          <TabsTrigger value="ai-api"><Sparkles className="w-4 h-4 mr-1.5" />AI API</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-api">
          <AiProviderSettings />
        </TabsContent>

        <TabsContent value="profile" className="-mx-4 md:-mx-6">
          <SettingsModule />
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Plug className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold">Direct platform connections</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Connect a platform to post directly from Syncvida — no Zapier, no n8n. Tokens are stored
              server-side and never exposed to the browser.
            </p>
            <SocialConnections />
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Folder className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold">Content categories</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Shared across Content Studio, Content Planner, and Social Studio. Rename, add, or remove categories — changes propagate to every linked item.</p>
            <CategoriesAdmin />
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Webhook className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold">Posting webhooks</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Configure one webhook URL per platform. When a Content Planner post is scheduled and its time arrives,
              we POST the JSON template to that URL — works with Zapier, n8n, Make, or any HTTP endpoint.
            </p>
            <div className="text-xs text-muted-foreground mb-4 space-y-1.5 bg-muted/30 rounded p-3 border border-border">
              <div className="font-medium text-foreground">Available template variables</div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
                <li><code>{`{{hook}}`}</code> — headline / first line</li>
                <li><code>{`{{body}}`}</code> — full post body</li>
                <li><code>{`{{platform}}`}</code> — linkedin / facebook / etc.</li>
                <li><code>{`{{plan_id}}`}</code> — UUID of this planner entry</li>
                <li><code>{`{{scheduled_at}}`}</code> — ISO date/time</li>
                <li><code>{`{{image_url}}`}</code> — main image (auto-set by AI / Studio)</li>
                <li><code>{`{{figma_brief}}`}</code> — last Figma brief (when generated)</li>
                <li><code>{`{{design_id}}`}</code> — linked Studio design id</li>
                <li><code>{`{{design_url}}`}</code> — link to the Studio editor</li>
                <li><code>{`{{design_thumbnail_url}}`}</code> — rendered Studio thumbnail (sharable URL)</li>
              </ul>
            </div>
            <WebhooksAdmin />
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <History className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold">Webhook history</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Every webhook attempt is logged here — both manual "Send now" pushes and scheduled cron deliveries.
              Use this to verify what was sent to Zapier / n8n / Make and diagnose failures.
            </p>
            <WebhookHistory />
          </Card>
        </TabsContent>

        <TabsContent value="social-hub">
          <SocialHubSettings sub={sub} />
        </TabsContent>

        <TabsContent value="content-planner">
          <Card className="p-5 space-y-2">
            <h2 className="font-display font-semibold">Content Planner settings</h2>
            <p className="text-sm text-muted-foreground">Planner uses the shared content categories above. Additional planner-specific settings (default cadence, weekly view start day, etc.) will appear here.</p>
          </Card>
        </TabsContent>

        <TabsContent value="productivity">
          <ModuleSettingsPlaceholder
            title="Productivity modules"
            description="Manage Projects, Tasks, Calendar and Goals."
            links={[
              { to: "/projects", label: "Projects" },
              { to: "/tasks", label: "Tasks" },
              { to: "/calendar", label: "Calendar" },
              { to: "/goals", label: "Goals" },
            ]}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}

function ModuleSettingsPlaceholder({ title, description, links }: { title: string; description: string; links: { to: string; label: string }[] }) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <p className="text-xs text-muted-foreground">Per-module admin settings will be added here. For now, jump directly to a module:</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent transition font-medium">{l.label}</Link>
        ))}
      </div>
    </Card>
  );
}

function CategoriesAdmin() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [c, i] = await Promise.all([listContentCategories(), listContentItems({})]);
    setCats(c as Cat[]);
    setItems(i as Item[]);
    setEdits(Object.fromEntries((c as Cat[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function rename(id: string) {
    const name = edits[id]?.trim();
    if (!name) return;
    setBusy(id);
    try { await updateContentCategory(id, { name }); toast.success("Category renamed"); await refresh(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }
  async function remove(id: string) {
    const count = items.filter((i) => i.category_id === id).length;
    if (!confirm(`Delete this category? ${count} item(s) will become uncategorized.`)) return;
    setBusy(id);
    try { await deleteContentCategory(id); toast.success("Category deleted"); await refresh(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }
  async function add() {
    if (!newName.trim()) return;
    setBusy("__new");
    try { await createContentCategory({ name: newName.trim() }); setNewName(""); toast.success("Category added"); await refresh(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading categories…</div>;

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {cats.length === 0 && <p className="text-sm text-muted-foreground">No categories yet. Add one below.</p>}
        {cats.map((c) => {
          const count = items.filter((i) => i.category_id === c.id).length;
          const dirty = (edits[c.id] ?? c.name) !== c.name;
          return (
            <div key={c.id} className="flex items-center gap-2">
              <Input value={edits[c.id] ?? c.name} onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })} />
              <span className="text-xs text-muted-foreground w-16 text-right">{count} item{count === 1 ? "" : "s"}</span>
              <Button size="sm" variant="outline" disabled={busy === c.id || !dirty} onClick={() => rename(c.id)}>Save</Button>
              <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => remove(c.id)} aria-label="Delete category">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <Label className="text-xs">Add new category</Label>
        <div className="flex gap-2">
          <Input placeholder="e.g. Outbound Mastery" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={add} disabled={!newName.trim() || busy === "__new"}><Plus className="w-4 h-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}
const PLATFORM_ICONS: Record<string, any> = { linkedin: Linkedin, facebook: Facebook, instagram: Instagram, twitter: Twitter, youtube: Youtube };
const DEFAULT_TEMPLATE = {
  platform: "{{platform}}",
  plan_id: "{{plan_id}}",
  hook: "{{hook}}",
  body: "{{body}}",
  image_url: "{{image_url}}",
  scheduled_at: "{{scheduled_at}}",
  figma_brief: "{{figma_brief}}",
  design_id: "{{design_id}}",
  design_url: "{{design_url}}",
  design_thumbnail_url: "{{design_thumbnail_url}}",
};

function WebhooksAdmin() {
  const [rows, setRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const list = await listWebhookSettings();
    const map: Record<string, any> = {};
    for (const p of PLANNER_PLATFORMS) {
      const found = (list as any[]).find((r) => r.platform === p);
      map[p] = found ?? { platform: p, webhook_url: "", json_template: DEFAULT_TEMPLATE, active: true };
      map[p].__template_str = JSON.stringify(map[p].json_template ?? DEFAULT_TEMPLATE, null, 2);
    }
    setRows(map);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function save(platform: string) {
    const r = rows[platform];
    let parsed: any = DEFAULT_TEMPLATE;
    try { parsed = r.__template_str ? JSON.parse(r.__template_str) : DEFAULT_TEMPLATE; }
    catch { toast.error("JSON template is invalid"); return; }
    setSaving(platform);
    try {
      await upsertWebhookSetting({ platform: platform as any, webhook_url: r.webhook_url || null, json_template: parsed, active: r.active });
      toast.success(`${platform} saved`);
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(null); }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5">
      {PLANNER_PLATFORMS.map((p) => {
        const Ic = PLATFORM_ICONS[p];
        const r = rows[p] ?? {};
        return (
          <div key={p} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium capitalize"><Ic className="w-4 h-4" /> {p}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Active</span>
                <Switch checked={!!r.active} onCheckedChange={(v) => setRows({ ...rows, [p]: { ...r, active: v } })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Webhook URL</Label>
              <Input placeholder="https://hooks.zapier.com/... or https://n8n.example.com/webhook/..."
                value={r.webhook_url ?? ""} onChange={(e) => setRows({ ...rows, [p]: { ...r, webhook_url: e.target.value } })} />
            </div>
            <div>
              <Label className="text-xs">JSON payload template</Label>
              <Textarea rows={8} className="font-mono text-xs"
                value={r.__template_str ?? ""} onChange={(e) => setRows({ ...rows, [p]: { ...r, __template_str: e.target.value } })} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => save(p)} disabled={saving === p}>
                {saving === p ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save {p}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
