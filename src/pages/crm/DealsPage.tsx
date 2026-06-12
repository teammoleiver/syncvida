import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listPipelines, listStages, listDeals, createDeal, updateDeal, deleteDeal,
  listContacts, listCompanies,
} from "@/lib/crm-queries";

export default function DealsPage() {
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stages, setStages] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  useEffect(() => { (async () => {
    const [ps, cs, cos] = await Promise.all([listPipelines(), listContacts(), listCompanies()]);
    setPipelines(ps); setContacts(cs); setCompanies(cos);
    const def = ps.find((p) => p.is_default) ?? ps[0];
    if (def) setPipelineId(def.id);
  })(); }, []);

  useEffect(() => { if (!pipelineId) return; (async () => {
    const [s, d] = await Promise.all([listStages(pipelineId), listDeals(pipelineId)]);
    setStages(s); setDeals(d);
  })(); }, [pipelineId]);

  async function reload() {
    if (!pipelineId) return;
    const [s, d] = await Promise.all([listStages(pipelineId), listDeals(pipelineId)]);
    setStages(s); setDeals(d);
  }

  function startNew(stageId?: string) {
    setEditing(null);
    setForm({ title: "", value: "", currency: "USD", stage_id: stageId ?? stages[0]?.id ?? "", contact_id: "", company_id: "", notes: "" });
    setOpen(true);
  }

  async function save() {
    if (!form.title?.trim() || !form.stage_id) { toast.error("Title and stage required"); return; }
    const payload = {
      title: form.title, value: form.value ? Number(form.value) : null, currency: form.currency || "USD",
      stage_id: form.stage_id, pipeline_id: pipelineId,
      contact_id: form.contact_id || null, company_id: form.company_id || null, notes: form.notes || null,
    };
    if (editing) await updateDeal(editing.id, payload); else await createDeal(payload);
    setOpen(false); toast.success("Saved"); reload();
  }

  async function moveDeal(dealId: string, stageId: string) {
    await updateDeal(dealId, { stage_id: stageId });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={pipelineId} onValueChange={setPipelineId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pipeline" /></SelectTrigger>
            <SelectContent>{pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => startNew()}><Plus className="w-4 h-4 mr-1" />New deal</Button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(240px, 1fr))` }}>
        {stages.map((s) => {
          const items = deals.filter((d) => d.stage_id === s.id);
          const total = items.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
          return (
            <Card key={s.id} className="p-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <h3 className="text-sm font-semibold">{s.name}</h3>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">${total.toLocaleString()}</span>
              </div>
              <div className="space-y-2 min-h-[60px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData("text/deal-id"); if (id) moveDeal(id, s.id); }}
              >
                {items.map((d) => (
                  <div key={d.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/deal-id", d.id)}
                    className="bg-background border border-border rounded-md p-2 text-sm cursor-grab hover:border-primary/40"
                    onClick={() => { setEditing(d); setForm({ ...d, value: d.value ?? "" }); setOpen(true); }}
                  >
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-between mt-0.5">
                      <span className="truncate">{d.contact ? [d.contact.first_name, d.contact.last_name].filter(Boolean).join(" ") : d.company?.name || "—"}</span>
                      {d.value != null && <span className="font-medium text-foreground">${Number(d.value).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-[11px] text-muted-foreground/50 text-center py-3">Drop here</div>}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit deal" : "New deal"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Title</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Value</Label><Input type="number" value={form.value ?? ""} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={form.currency ?? "USD"} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            </div>
            <div><Label>Stage</Label>
              <Select value={form.stage_id} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Contact</Label>
              <Select value={form.contact_id || "_none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                <SelectContent><SelectItem value="_none">(none)</SelectItem>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Company</Label>
              <Select value={form.company_id || "_none"} onValueChange={(v) => setForm({ ...form, company_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                <SelectContent><SelectItem value="_none">(none)</SelectItem>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-between pt-2">
              {editing ? <Button variant="ghost" className="text-destructive" onClick={async () => { if (confirm("Delete deal?")) { await deleteDeal(editing.id); setOpen(false); reload(); } }}><Trash2 className="w-4 h-4 mr-1" />Delete</Button> : <span />}
              <div className="flex gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}