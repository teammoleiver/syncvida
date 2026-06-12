import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Users, Building2, Trello, Workflow } from "lucide-react";
import { listContacts, listCompanies, listDeals, listPipelines } from "@/lib/crm-queries";

export default function CrmDashboard() {
  const [stats, setStats] = useState({ contacts: 0, companies: 0, deals: 0, pipelines: 0, value: 0 });
  const [recentContacts, setRecentContacts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [contacts, companies, deals, pipelines] = await Promise.all([
        listContacts(), listCompanies(), listDeals(), listPipelines(),
      ]);
      const value = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
      setStats({ contacts: contacts.length, companies: companies.length, deals: deals.length, pipelines: pipelines.length, value });
      setRecentContacts(contacts.slice(0, 5));
    })();
  }, []);

  const cards = [
    { label: "Contacts", value: stats.contacts, icon: Users, to: "/crm/contacts" },
    { label: "Companies", value: stats.companies, icon: Building2, to: "/crm/companies" },
    { label: "Open Deals", value: stats.deals, icon: Trello, to: "/crm/deals" },
    { label: "Pipelines", value: stats.pipelines, icon: Workflow, to: "/crm/pipelines" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card className="p-4 hover:border-primary/40 transition">
              <div className="flex items-center justify-between">
                <c.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-2xl font-display font-bold">{c.value}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">{c.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold">Total pipeline value</h2>
        </div>
        <div className="text-3xl font-display font-bold">${stats.value.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-1">Across all open deals</div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold">Recent contacts</h2>
          <Link to="/crm/contacts" className="text-xs text-primary hover:underline">View all →</Link>
        </div>
        {recentContacts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No contacts yet. <Link to="/crm/contacts" className="text-primary hover:underline">Add your first contact</Link>.</div>
        ) : (
          <div className="divide-y divide-border">
            {recentContacts.map((c) => (
              <div key={c.id} className="py-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  {(c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.title} {c.company?.name ? `· ${c.company.name}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}