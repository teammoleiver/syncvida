import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, Users, Building2, Trello } from "lucide-react";

const tabs = [
  { to: "/crm", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/crm/contacts", label: "Contacts", icon: Users },
  { to: "/crm/companies", label: "Companies", icon: Building2 },
  { to: "/crm/deals", label: "Deals", icon: Trello },
];

export default function CrmLayout() {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 py-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-bold">C</div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">CRM</h1>
          <p className="text-sm text-muted-foreground">Contacts, companies and deal pipelines — synced with your Social Hub.</p>
        </div>
      </header>
      <nav className="border-b border-border flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0 ${
                isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}