import { ReactNode, useState, useEffect, Suspense } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard, Utensils, Dumbbell, HeartPulse,
  MessageCircle, Timer, BarChart3, Settings, Target, Moon, Sun,
  FolderKanban, CheckSquare, CalendarDays,
  PanelLeftClose, PanelLeft, Megaphone, Library, ClipboardList, Palette,
  Shield, User as UserIcon, Menu, MoreHorizontal,
} from "lucide-react";
import syncvidaLogo from "@/assets/syncvida-icon.png";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ── Grouped navigation ──
interface NavItem {
  path: string;
  icon: React.ComponentType<any>;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Content",
    items: [
      { path: "/social", icon: Megaphone, label: "Social Hub" },
      { path: "/content-studio", icon: Library, label: "Content Studio" },
      { path: "/content-planner", icon: ClipboardList, label: "Content Planner" },
      { path: "/designer", icon: Palette, label: "Designer" },
    ],
  },
  {
    label: "Productivity",
    items: [
      { path: "/projects", icon: FolderKanban, label: "Projects" },
      { path: "/tasks", icon: CheckSquare, label: "Tasks" },
      { path: "/calendar", icon: CalendarDays, label: "Calendar" },
      { path: "/goals", icon: Target, label: "Goals" },
    ],
  },
  {
    label: "Health",
    items: [
      { path: "/nutrition", icon: Utensils, label: "Nutrition" },
      { path: "/fasting", icon: Timer, label: "Fasting" },
      { path: "/exercise", icon: Dumbbell, label: "Exercise" },
      { path: "/sleep", icon: Moon, label: "Sleep" },
      { path: "/health", icon: HeartPulse, label: "Records" },
      { path: "/body", icon: BarChart3, label: "Body" },
    ],
  },
];

// Bottom-pinned items (always visible at the bottom of sidebar)
const bottomNavItems: NavItem[] = [
  { path: "/assistant", icon: MessageCircle, label: "Assistant" },
  { path: "/admin", icon: Shield, label: "Settings" },
  { path: "/settings", icon: UserIcon, label: "Profile" },
];

// Per-module accent colors for the sidebar icons (matches the design system).
const MODULE_COLORS: Record<string, string> = {
  "/": "#4F46E5",
  "/social": "#2B5DF0",
  "/content-studio": "#7B3FD8",
  "/content-planner": "#E8561A",
  "/designer": "#D9218A",
  "/projects": "#0E9B8A",
  "/tasks": "#1A6B47",
  "/calendar": "#E8561A",
  "/goals": "#1A6B47",
  "/nutrition": "#1A6B47",
  "/fasting": "#7B3FD8",
  "/exercise": "#E8561A",
  "/sleep": "#2B5DF0",
  "/health": "#D9218A",
  "/body": "#0E9B8A",
  "/assistant": "#E0A81C",
  "/admin": "#4A4A4A",
  "/settings": "#4A4A4A",
};
const moduleColor = (path: string) => MODULE_COLORS[path] ?? "#4F46E5";

// Sidebar nav item classes — soft tinted active state with a left indicator.
const navItemClass = (active: boolean, open: boolean) =>
  `relative flex items-center gap-2.5 px-3 py-[6px] rounded-lg transition-all text-[13px] leading-tight ${
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold before:absolute before:-left-2 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-r-full before:bg-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
  } ${!open ? "justify-center px-0" : ""}`;

// Flat list for lookups
const allNavItems = navGroups.flatMap(g => g.items);

// Mobile bottom nav: 4 key sections + More (opens full menu)
const mobileNavItems: NavItem[] = [
  allNavItems.find(i => i.path === "/") ?? { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  allNavItems.find(i => i.path === "/nutrition") ?? { path: "/nutrition", icon: Utensils, label: "Nutrition" },
  allNavItems.find(i => i.path === "/health") ?? { path: "/health", icon: HeartPulse, label: "Records" },
  allNavItems.find(i => i.path === "/goals") ?? { path: "/goals", icon: Target, label: "Goals" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Light-first: the redesigned Syncvida is light by default. Dark is opt-in via
  // the toggle. (New storage key so old OS-derived "dark" prefs don't stick.)
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("syncvida-theme") === "dark";
    }
    return false;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile sheet on route change
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("syncvida-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-full z-40 transition-all duration-300 ${
          sidebarOpen ? "w-56" : "w-16"
        }`}
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-sidebar-border">
          <img
            src={syncvidaLogo}
            alt="Syncvida"
            className="w-6 h-6 object-contain"
          />
          {sidebarOpen && (
            <span className="text-sidebar-foreground font-display font-bold text-sm">
              Syncvida
            </span>
          )}
        </div>

        {/* Navigation groups (includes bottom items + water widget so the
            whole list scrolls together on short viewports) */}
        <nav className="flex-1 min-h-0 py-1 px-2 overflow-y-auto scrollbar-none">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-1.5" : ""}>
              {/* Group label */}
              {group.label && sidebarOpen && (
                <div className="px-3 pt-1 pb-0.5">
                  <span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">
                    {group.label}
                  </span>
                </div>
              )}
              {/* Separator line for collapsed sidebar when group has label */}
              {group.label && !sidebarOpen && (
                <div className="mx-3 my-1.5 border-t border-sidebar-border/50" />
              )}

              <div className="space-y-[1px]">
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path} className={navItemClass(active, sidebarOpen)}>
                      <item.icon className="w-[17px] h-[17px] shrink-0" style={active ? undefined : { color: moduleColor(item.path) }} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bottom items kept inside the scroll area so nothing is hidden
              when the viewport is short */}
          <div className="mt-2 pt-1.5 space-y-[1px] border-t border-sidebar-border/50">
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={navItemClass(active, sidebarOpen)}>
                <item.icon className="w-[17px] h-[17px] shrink-0" style={active ? undefined : { color: moduleColor(item.path) }} />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
          </div>

        </nav>

        {/* Footer */}
        <div className="px-2 py-1 border-t border-sidebar-border flex items-center gap-1.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground p-1 rounded-md hover:bg-sidebar-accent transition"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
          {sidebarOpen && (
            <button
              onClick={() => setDark(!dark)}
              className="text-sidebar-foreground/40 hover:text-sidebar-foreground p-1 rounded-md hover:bg-sidebar-accent transition ml-auto"
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-300 pb-20 md:pb-0 ${
          sidebarOpen ? "md:ml-56" : "md:ml-16"
        }`}
      >
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  className="p-2 -ml-2 rounded-lg text-foreground hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col">
                <SheetHeader className="px-4 py-3 border-b border-border">
                  <SheetTitle className="flex items-center gap-2 text-left">
                    <img src={syncvidaLogo} alt="" className="w-6 h-6" />
                    <span className="font-display font-bold">Syncvida</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto py-2 px-2">
                  {navGroups.map((group, gi) => (
                    <div key={gi} className={gi > 0 ? "mt-3" : ""}>
                      {group.label && (
                        <div className="px-3 pt-1 pb-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            {group.label}
                          </span>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const active = location.pathname === item.path;
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm min-h-11 ${
                                active
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-foreground/80 hover:bg-accent"
                              }`}
                            >
                              <item.icon className="w-5 h-5 shrink-0" style={active ? undefined : { color: moduleColor(item.path) }} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="border-t border-border px-2 py-2 space-y-0.5">
                  {bottomNavItems.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm min-h-11 ${
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground/80 hover:bg-accent"
                        }`}
                      >
                        <item.icon className="w-5 h-5 shrink-0" style={active ? undefined : { color: moduleColor(item.path) }} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <img src={syncvidaLogo} alt="Syncvida" className="w-7 h-7" />
              <span className="font-display font-bold text-foreground">Syncvida</span>
            </div>
          </div>
          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg bg-secondary text-foreground min-h-11 min-w-11 flex items-center justify-center"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          }
        >
          {children}
        </Suspense>
      </main>

      {/* Mobile Bottom Nav — 5 key items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="flex items-center justify-around py-2 px-2">
          {mobileNavItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-0 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                <span className="text-[10px] font-medium truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-muted-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
