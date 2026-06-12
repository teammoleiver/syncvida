import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { bulkCreateContacts, findOrCreateCompanyByName } from "@/lib/crm-queries";

const TEMPLATE = "first_name,last_name,email,phone,title,company,linkedin_url,notes\nJane,Doe,jane@acme.com,+15551234567,VP Sales,Acme,https://linkedin.com/in/jane,";

export default function CsvImporter({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contacts-template.csv";
    a.click();
  }

  function pick() { inp.current?.click(); }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        try {
          const rows = res.data as any[];
          // Resolve company names → ids
          const cache = new Map<string, string | null>();
          const prepared: any[] = [];
          for (const r of rows) {
            const cname = (r.company || "").trim();
            let company_id: string | null = null;
            if (cname) {
              if (!cache.has(cname.toLowerCase())) {
                const c = await findOrCreateCompanyByName(cname);
                cache.set(cname.toLowerCase(), c?.id ?? null);
              }
              company_id = cache.get(cname.toLowerCase()) ?? null;
            }
            prepared.push({
              first_name: r.first_name?.trim() || null,
              last_name: r.last_name?.trim() || null,
              email: r.email?.trim() || null,
              phone: r.phone?.trim() || null,
              title: r.title?.trim() || null,
              company_id,
              linkedin_url: r.linkedin_url?.trim() || null,
              notes: r.notes?.trim() || null,
              source: "csv",
            });
          }
          const n = await bulkCreateContacts(prepared);
          toast.success(`Imported ${n} contacts`);
          onImported();
        } catch (err: any) { toast.error(err?.message || "Import failed"); }
        finally { setBusy(false); if (inp.current) inp.current.value = ""; }
      },
      error: (err) => { toast.error(err.message); setBusy(false); },
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">CSV import</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Bulk import contacts. Use the template for column names.</p>
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="w-4 h-4 mr-2" />Template</Button>
        <Button size="sm" onClick={pick} disabled={busy}>
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : <>Upload CSV</>}
        </Button>
        <input ref={inp} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>
    </Card>
  );
}