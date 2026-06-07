import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Share2, PenLine, CalendarClock, PenTool, FolderKanban, ListChecks, CalendarDays,
  MessageCircle, Users, FileText, Library, ArrowRight, Sparkles, Contact,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getProfile, getTasks, getProjects } from "@/lib/supabase-queries";
import { listSocialProfiles, listSocialPosts, listContentItems } from "@/lib/social-queries";

const CONTENT_HUBS = [
  { to: "/social", icon: Share2, label: "Social Hub", desc: "LinkedIn intelligence, scraping & engagement" },
  { to: "/content-studio", icon: PenLine, label: "Content Studio", desc: "Your content library & generation" },
  { to: "/content-planner", icon: CalendarClock, label: "Content Planner", desc: "Schedule and plan your posts" },
  { to: "/designer", icon: PenTool, label: "Designer", desc: "Carousels, posts & brand kit" },
];
const WORK_HUBS = [
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [stats, setStats] = useState({ profiles: 0, posts: 0, content: 0, tasks: 0 });

  useEffect(() => {
    getProfile().then((p: any) => {
      setName(p?.name || p?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there");
    });
    (async () => {
      const [profiles, posts, content, tasks] = await Promise.all([
        listSocialProfiles().catch(() => []),
        listSocialPosts({ limit: 1000 }).catch(() => []),
        listContentItems({ limit: 1000 }).catch(() => []),
        getTasks().catch(() => []),
      ]);
      setStats({
        profiles: profiles.length,
        posts: posts.length,
        content: content.length,
        tasks: (tasks as any[]).filter((t) => t.status !== "done" && !t.completed_at).length,
      });
    })();
  }, [user]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  const statCards = [
    { label: "Profiles tracked", value: stats.profiles, icon: Users, to: "/social/linkedin/profiles" },
    { label: "Scraped posts", value: stats.posts >= 1000 ? "1000+" : stats.posts, icon: FileText, to: "/social/linkedin/posts" },
    { label: "Content items", value: stats.content, icon: Library, to: "/content-studio" },
    { label: "Open tasks", value: stats.tasks, icon: ListChecks, to: "/tasks" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Greeting */}
      <header>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">{greeting}, {name} 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your Syncvida command center.</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Link key={s.label} to={s.to} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition group">
            <div className="flex items-center justify-between">
              <s.icon className="w-5 h-5 text-primary" />
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            <div className="text-2xl font-display font-bold mt-2 tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Content hubs */}
      <section>
        <h2 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wide mb-3">Content</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CONTENT_HUBS.map((h) => (
            <Link key={h.to} to={h.to} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 hover:border-primary/50 transition group">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <h.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-foreground flex items-center gap-1.5">{h.label} <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" /></div>
                <div className="text-xs text-muted-foreground">{h.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Productivity quick links */}
      <section>
        <h2 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wide mb-3">Productivity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {WORK_HUBS.map((h) => (
            <Link key={h.to} to={h.to} className="rounded-xl border border-border bg-card p-4 flex items-center gap-2.5 hover:border-primary/50 transition">
              <h.icon className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{h.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Leads / Pre-CRM — coming soon */}
      <section>
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Contact className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-display font-semibold flex items-center gap-2">Leads & Pre-CRM <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">Coming soon</span></div>
            <p className="text-sm text-muted-foreground">Turn your tracked profiles and engagement into a lightweight client pipeline — capture, qualify, and nurture leads inside Syncvida.</p>
          </div>
          <Sparkles className="w-5 h-5 text-muted-foreground" />
        </div>
      </section>
    </div>
  );
}
