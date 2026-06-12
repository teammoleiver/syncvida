import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { listContacts, createContact, deleteContact } from "@/lib/crm-queries";
import CardScanner from "@/components/crm/CardScanner";
import CsvImporter from "@/components/crm/CsvImporter";
import QuickAddByText from "@/components/crm/QuickAddByText";
import ContactForm from "@/components/crm/ContactForm";
import ContactDrawer from "@/components/crm/ContactDrawer";

export default function ContactsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  async function load() { setRows(await listContacts()); }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((c) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return [c.first_name, c.last_name, c.email, c.title, c.company?.name].filter(Boolean).join(" ").toLowerCase().includes(t);
  });

  function openAdd(pre?: any) { setPrefill(pre ?? null); setAddOpen(true); }

  async function onCreate(values: any) {
    await createContact({
      first_name: values.first_name, last_name: values.last_name, email: values.email, phone: values.phone,
      title: values.title, company_id: values.company_id, linkedin_url: values.linkedin_url, notes: values.notes,
      source: prefill?._source ?? "manual",
    });
    setAddOpen(false); setPrefill(null);
    toast.success("Contact added"); load();
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <CardScanner onParsed={(p) => openAdd({ ...p, _source: "card_scan" })} />
        <QuickAddByText onParsed={(p) => openAdd({ ...p, _source: "text" })} />
        <CsvImporter onImported={load} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="max-w-xs" />
            <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</span>
          </div>
          <Button size="sm" onClick={() => openAdd()}><Plus className="w-4 h-4 mr-1" />Add contact</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 px-2">Name</th><th className="py-2 px-2">Email</th><th className="py-2 px-2">Phone</th><th className="py-2 px-2">Title</th><th className="py-2 px-2">Company</th><th className="py-2 px-2">Source</th><th className="py-2 px-2"></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No contacts yet. Use the widgets above to capture your first one.</td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-accent/40">
                  <td className="py-2 px-2 font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="py-2 px-2 text-muted-foreground">{c.email || "—"}</td>
                  <td className="py-2 px-2 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="py-2 px-2 text-muted-foreground">{c.title || "—"}</td>
                  <td className="py-2 px-2 text-muted-foreground">{c.company?.name || "—"}</td>
                  <td className="py-2 px-2"><span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">{c.source}</span></td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setDrawerId(c.id)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete contact?")) { await deleteContact(c.id); load(); } }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setPrefill(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <ContactForm initial={prefill ?? undefined} onSubmit={onCreate} onCancel={() => setAddOpen(false)} submitLabel="Create" />
        </DialogContent>
      </Dialog>

      <ContactDrawer contactId={drawerId} open={!!drawerId} onOpenChange={(o) => { if (!o) setDrawerId(null); }} onChanged={load} />
    </div>
  );
}