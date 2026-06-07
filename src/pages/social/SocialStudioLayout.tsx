import { NavLink, Outlet } from "react-router-dom";
import { Linkedin, Newspaper, LayoutDashboard, Search, Youtube } from "lucide-react";

// Settings deliberately omitted — all settings now live in the central
// Settings page (/settings → Social Hub). The Social Hub is for working, not config.
const tabs = [
  { to: "/social", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/social/search", label: "Search", icon: Search },
  { to: "/social/linkedin", label: "LinkedIn", icon: Linkedin },
  { to: "/social/youtube", label: "YouTube", icon: Youtube },
  { to: "/social/news", label: "News & RSS", icon: Newspaper },
];

export default function SocialStudioLayout() {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 py-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-bold">S</div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Social Hub</h1>
          <p className="text-sm text-muted-foreground">LinkedIn intelligence · YouTube creators · news radar · content planning.</p>
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
