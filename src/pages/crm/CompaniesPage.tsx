import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Building2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { listCompanies, createCompany, updateCompany, deleteCompany } from "@/lib/crm-queries";

export default function CompaniesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", domain: "", industry: "", size: "", website: "", linkedin_url: "", notes: "" });

  async function load() { setRows(await listCompanies()); }
  useEffect(() => { load(); }, []);

  function startEdit(c?: any) { setEditing(c ?? null); setForm(c ?? { name: "", domain: "", industry: "", size: "", website: "", linkedin_url: "", notes: "" }); setOpen(true); }

  async function save() {
    if (!form.name?.trim()) { toast.error("Name required"); return; }
    if (editing) await updateCompany(editing.id, form); else await createCompany(form);
    toast.success("Saved"); setOpen(false); load();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /><h2 className="font-display font-semibold">Companies</h2><span className="text-xs text-muted-foreground">{rows.length}</span></div>
        <Button size="sm" onClick={() => startEdit()}><Plus className="w-4 h-4 mr-1" />Add company</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 px-2">Name</th><th className="py-2 px-2">Domain</th><th className="py-2 px-2">Industry</th><th className="py-2 px-2">Size</th><th className="py-2 px-2"></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No companies yet.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border hover:bg-accent/40">
                <td className="py-2 px-2 font-medium">{c.name}</td>
                <td className="py-2 px-2 text-muted-foreground">{c.domain || "—"}</td>
                <td className="py-2 px-2 text-muted-foreground">{c.industry || "—"}</td>
                <td className="py-2 px-2 text-muted-foreground">{c.size || "—"}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete company?")) { await deleteCompany(c.id); load(); } }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} company</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Name</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Domain</Label><Input value={form.domain ?? ""} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Industry</Label><Input value={form.industry ?? ""} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              <div><Label>Size</Label><Input value={form.size ?? ""} onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
            </div>
            <div><Label>LinkedIn URL</Label><Input value={form.linkedin_url ?? ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}