import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckSquare, FolderKanban, Circle, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getTasks, getProjects } from "@/lib/supabase-queries";

// ── Types ──
interface DayData {
  date: string; // YYYY-MM-DD
  tasksDue: any[];
  tasksCompleted: any[];
  projectsDue: any[];
  milestoneDue: boolean;
}
type ViewMode = "month" | "week";

// ── Date helpers ──
function fmt(d: Date): string { return d.toISOString().split("T")[0]; }
function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
  return days;
}
function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) { const dd = new Date(d); dd.setDate(dd.getDate() + i); days.push(dd); }
  return days;
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const title = (x: any) => x?.title ?? x?.name ?? "Untitled";

// ── Day detail panel ──
function DayDetailPanel({ dayData, date, onClose, onNavigate }: {
  dayData: DayData | null; date: Date; onClose: () => void; onNavigate: (path: string) => void;
}) {
  const dateStr = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const isToday = fmt(date) === fmt(new Date());
  const d = dayData;

  const Section = ({ icon: Icon, label, color, count, path, children }: any) => (
    <div className="py-3 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {count !== undefined && <span className="text-[12px] text-muted-foreground">{count}</span>}
        {path && <button onClick={() => onNavigate(path)} className="ml-auto text-[11px] text-primary hover:underline">Open</button>}
      </div>
      {children}
    </div>
  );

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
    >
      <div className="px-5 py-4 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{dateStr}</h2>
          {isToday && <span className="text-[11px] text-primary font-medium">Today</span>}
        </div>
        <button onClick={onClose} className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {(!d || (d.tasksDue.length === 0 && d.tasksCompleted.length === 0 && d.projectsDue.length === 0)) && (
          <p className="text-sm text-muted-foreground italic py-8 text-center">Nothing scheduled this day.</p>
        )}
        {d && d.tasksDue.length > 0 && (
          <Section icon={CheckSquare} label="Tasks due" color="#ef4444" count={d.tasksDue.length} path="/tasks">
            <div className="space-y-1.5">
              {d.tasksDue.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {title(t)}
                </div>
              ))}
            </div>
          </Section>
        )}
        {d && d.tasksCompleted.length > 0 && (
          <Section icon={Check} label="Completed" color="#22c55e" count={d.tasksCompleted.length} path="/tasks">
            <div className="space-y-1.5">
              {d.tasksCompleted.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground line-through">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {title(t)}
                </div>
              ))}
            </div>
          </Section>
        )}
        {d && d.projectsDue.length > 0 && (
          <Section icon={FolderKanban} label="Projects due" color="#6366f1" count={d.projectsDue.length} path="/projects">
            <div className="space-y-1.5">
              {d.projectsDue.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-foreground">
                  <FolderKanban className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> {title(p)}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </motion.div>
  );
}

export default function CalendarModule() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [tk, pj] = await Promise.all([getTasks(), getProjects()]);
      setTasks(tk || []); setProjects(pj || []);
      setLoading(false);
    })();
  }, []);

  const dayDataMap = useMemo(() => {
    const map: Record<string, DayData> = {};
    const ensure = (date: string): DayData => {
      if (!map[date]) map[date] = { date, tasksDue: [], tasksCompleted: [], projectsDue: [], milestoneDue: false };
      return map[date];
    };
    tasks.forEach((t) => {
      if (t.due_date) ensure(String(t.due_date).split("T")[0]).tasksDue.push(t);
      if (t.completed_at) ensure(String(t.completed_at).split("T")[0]).tasksCompleted.push(t);
    });
    projects.forEach((p) => {
      if (p.due_date) ensure(String(p.due_date).split("T")[0]).projectsDue.push(p);
      if (p.milestones) {
        try {
          const ms = typeof p.milestones === "string" ? JSON.parse(p.milestones) : p.milestones;
          (ms as any[]).forEach((m) => { if (m?.dueDate && !m?.completed) ensure(String(m.dueDate).split("T")[0]).milestoneDue = true; });
        } catch { /* ignore */ }
      }
    });
    return map;
  }, [tasks, projects]);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => { const d = new Date(currentDate); viewMode === "month" ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7); setCurrentDate(d); };
  const goNext = () => { const d = new Date(currentDate); viewMode === "month" ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7); setCurrentDate(d); };

  const days = useMemo(() => viewMode === "month"
    ? getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
    : getWeekDays(currentDate), [currentDate, viewMode]);

  const todayStr = fmt(new Date());
  const currentMonth = currentDate.getMonth();

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Calendar</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Tasks & projects across your schedule.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-secondary p-0.5">
            {(["month", "week"] as ViewMode[]).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${viewMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary">Today</button>
        </div>
      </header>

      <div className="flex items-center justify-between">
        <button onClick={goPrev} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-semibold">
          {viewMode === "month" ? `${MONTH_NAMES[currentMonth]} ${currentDate.getFullYear()}` : `Week of ${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </h2>
        <button onClick={goNext} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES.map((d) => <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>)}
          {days.map((day) => {
            const ds = fmt(day);
            const dd = dayDataMap[ds];
            const inMonth = viewMode === "week" || day.getMonth() === currentMonth;
            const isToday = ds === todayStr;
            const dueCount = (dd?.tasksDue.length ?? 0) + (dd?.projectsDue.length ?? 0);
            const doneCount = dd?.tasksCompleted.length ?? 0;
            return (
              <button
                key={ds}
                onClick={() => setSelectedDate(day)}
                className={`min-h-[78px] rounded-lg border p-1.5 text-left transition hover:border-primary/50 ${
                  inMonth ? "bg-card border-border" : "bg-muted/30 border-transparent text-muted-foreground"
                } ${isToday ? "ring-2 ring-primary" : ""}`}
              >
                <div className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>{day.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {dueCount > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {dueCount} due</div>
                  )}
                  {dd?.milestoneDue && (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-500"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> milestone</div>
                  )}
                  {doneCount > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {doneCount} done</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selectedDate && (
          <>
            <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedDate(null)} />
            <DayDetailPanel
              dayData={dayDataMap[fmt(selectedDate)] ?? null}
              date={selectedDate}
              onClose={() => setSelectedDate(null)}
              onNavigate={(p) => { setSelectedDate(null); navigate(p); }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
