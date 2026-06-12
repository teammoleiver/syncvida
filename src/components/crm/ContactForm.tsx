import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listCompanies, findOrCreateCompanyByName } from "@/lib/crm-queries";

export interface ContactFormValues {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  company_name?: string;
  company_id?: string | null;
  linkedin_url?: string;
  notes?: string;
}

export default function ContactForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  initial?: Partial<ContactFormValues> & { company?: { id: string; name: string } | null };
  onSubmit: (values: ContactFormValues & { company_id: string | null }) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<ContactFormValues>({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    title: initial?.title ?? "",
    company_name: initial?.company?.name ?? initial?.company_name ?? "",
    linkedin_url: initial?.linkedin_url ?? "",
    notes: initial?.notes ?? "",
  });
  const [companies, setCompanies] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { listCompanies().then(setCompanies); }, []);

  async function handle() {
    setBusy(true);
    let company_id: string | null = initial?.company?.id ?? null;
    const name = v.company_name?.trim();
    if (name) {
      const existing = companies.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) company_id = existing.id;
      else {
        const created = await findOrCreateCompanyByName(name);
        company_id = created?.id ?? null;
      }
    } else company_id = null;
    await onSubmit({ ...v, company_id });
    setBusy(false);
  }

  const upd = (k: keyof ContactFormValues) => (e: any) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First name</Label><Input value={v.first_name ?? ""} onChange={upd("first_name")} /></div>
        <div><Label>Last name</Label><Input value={v.last_name ?? ""} onChange={upd("last_name")} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Email</Label><Input type="email" value={v.email ?? ""} onChange={upd("email")} /></div>
        <div><Label>Phone</Label><Input value={v.phone ?? ""} onChange={upd("phone")} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Title</Label><Input value={v.title ?? ""} onChange={upd("title")} /></div>
        <div><Label>Company</Label><Input list="crm-companies-dl" value={v.company_name ?? ""} onChange={upd("company_name")} placeholder="Type or pick…" /></div>
      </div>
      <datalist id="crm-companies-dl">
        {companies.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      <div><Label>LinkedIn URL</Label><Input value={v.linkedin_url ?? ""} onChange={upd("linkedin_url")} placeholder="https://linkedin.com/in/…" /></div>
      <div><Label>Notes</Label><Textarea rows={3} value={v.notes ?? ""} onChange={upd("notes")} /></div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button onClick={handle} disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </div>
  );
}