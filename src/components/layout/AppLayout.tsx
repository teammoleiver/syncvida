import { ReactNode, useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { onSync } from "@/lib/sync-events";
import {
  LayoutDashboard, Utensils, Dumbbell, HeartPulse,
  MessageCircle, Timer, BarChart3, Settings, Target, Moon, Sun,
  Droplets, FolderKanban, CheckSquare, CalendarDays,
  PanelLeftClose, PanelLeft, Megaphone, Library, ClipboardList,
  Shield, User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import syncvidaLogo from "@/assets/syncvida-icon.png";
import { getTodayWaterLog } from "@/lib/supabase-queries";

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
    label: "Content",
    items: [
      { path: "/social", icon: Megaphone, label: "Social Studio" },
      { path: "/content-studio", icon: Library, label: "Content Studio" },
      { path: "/content-planner", icon: ClipboardList, label: "Content Planner" },
      { path: "/designer", icon: Palette, label: "Designer" },
    ],
  },
];

// Bottom-pinned items (always visible at the bottom of sidebar)
const bottomNavItems: NavItem[] = [
  { path: "/assistant", icon: MessageCircle, label: "Assistant" },
  { path: "/admin", icon: Shield, label: "Settings" },
  { path: "/settings", icon: UserIcon, label: "Profile" },
];

// Flat list for lookups
const allNavItems = navGroups.flatMap(g => g.items);

// Mobile: show the most important 5 + a "more" concept via the 6 most used
const mobileNavItems = [
  allNavItems.find(i => i.path === "/")!,
  allNavItems.find(i => i.path === "/nutrition")!,
  allNavItems.find(i => i.path === "/exercise")!,
  allNavItems.find(i => i.path === "/tasks")!,
  allNavItems.find(i => i.path === "/calendar")!,
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ht-theme") === "dark" ||
        (!localStorage.getItem("ht-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [waterGlasses, setWaterGlasses] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ht-theme", dark ? "dark" : "light");
  }, [dark]);

  const [waterMl, setWaterMl] = useState(0);

  // Poll water intake for sidebar display + sync on water events
  useEffect(() => {
    const load = () => getTodayWaterLog().then((w) => {
      setWaterGlasses(w?.glasses ?? 0);
      setWaterMl(w?.ml_total ?? (w?.glasses ?? 0) * 250);
    });
    load();
    const id = setInterval(load, 10000);
    const unsub = onSync("water:updated", load);
    return () => { clearInterval(id); unsub(); };
  }, []);

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

        {/* Navigation groups */}
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
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-[5px] rounded-md transition-all text-[13px] leading-tight ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      } ${!sidebarOpen ? "justify-center px-0" : ""}`}
                    >
                      <item.icon className="w-[17px] h-[17px] shrink-0" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom-pinned: Assistant & Settings */}
        <div className="px-2 pt-1.5 pb-1 space-y-[1px] border-t border-sidebar-border/50">
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-[5px] rounded-md transition-all text-[13px] leading-tight ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                } ${!sidebarOpen ? "justify-center px-0" : ""}`}
              >
                <item.icon className="w-[17px] h-[17px] shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Water progress widget */}
        <Link
          to="/nutrition"
          className="mx-2 mt-1 mb-1 px-2.5 py-1.5 rounded-lg bg-sidebar-accent/40 hover:bg-sidebar-accent/70 transition block"
        >
          {sidebarOpen ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] font-medium text-sidebar-foreground/70">Water</span>
                </div>
                <span className={`text-[10px] font-bold ${waterMl >= 3000 ? "text-blue-400" : "text-sidebar-foreground/50"}`}>
                  {(waterMl / 1000).toFixed(1)}L
                </span>
              </div>
              <div className="h-[3px] bg-sidebar-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500"
                  initial={false}
                  animate={{ width: `${Math.min((waterMl / 3000) * 100, 100)}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <Droplets className={`w-3.5 h-3.5 ${waterMl >= 3000 ? "text-blue-400" : "text-sidebar-foreground/40"}`} />
              <span className="text-[8px] font-bold text-sidebar-foreground/50">{(waterMl / 1000).toFixed(1)}L</span>
            </div>
          )}
        </Link>

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
        className={`flex-1 transition-all duration-300 pb-20 md:pb-0 ${
          sidebarOpen ? "md:ml-56" : "md:ml-16"
        }`}
      >
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img src={syncvidaLogo} alt="Syncvida" className="w-7 h-7" />
            <span className="font-display font-bold text-foreground">Syncvida</span>
          </div>
          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg bg-secondary text-foreground"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
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
        </div>
      </nav>
    </div>
  );
}
