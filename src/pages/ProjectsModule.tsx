import { useState, useMemo, useEffect } from "react";
import {
  getProjects as dbGetProjects,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
} from "@/lib/supabase-queries";
import {
  FolderKanban, Plus, LayoutGrid, List, Layers, AlertTriangle,
  ChevronDown, ChevronRight, X, Calendar, Tag, Link2, Trash2,
  Check, CheckCircle2, Circle, GripVertical, StickyNote, Brain,
  Target, Lightbulb, Eye, Compass, Heart, Briefcase, User,
  Wallet, BookOpen, Home, Dumbbell as DumbbellIcon, Folder,
  HeartPulse, Globe, Search, MoreVertical, Pause, Archive,
  Play, Clock, Edit3, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AREA_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#84cc16", "#6b7280"];
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// DATA STRUCTURES
// ============================================================

export type ProjectStatus =
  | "active"
  | "on_hold"
  | "someday_maybe"
  | "completed"
  | "cancelled";

export type ProjectArea =
  | "health"
  | "work"
  | "personal"
  | "finance"
  | "learning"
  | "home"
  | "fitness"
  | "custom";

export type HorizonLevel =
  | "ground"
  | "horizon_1"
  | "horizon_2"
  | "horizon_3"
  | "horizon_4"
  | "horizon_5";

export interface Milestone {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
}

export interface ProjectNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  outcomeStatement: string;
  purpose: string;
  status: ProjectStatus;
  area: string; // a built-in ProjectArea key or a user's custom area key
  horizon: HorizonLevel;
  color: string;
  icon: string;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  milestones: Milestone[];
  notes: ProjectNote[];
  tags: string[];
  taskIds: string[];
  nextActionId: string | null;
  isStuck: boolean;
  healthModuleLink:
    | "nutrition" | "exercise" | "sleep"
    | "health" | "body" | "fasting" | null;
  brainstormNotes: string;
  successCriteria: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// HORIZON LEVEL DESCRIPTIONS
// ============================================================

export const HORIZON_DESCRIPTIONS: Record<HorizonLevel, {
  label: string; sublabel: string; description: string; color: string;
}> = {
  ground: {
    label: "Ground Level",
    sublabel: "Day-to-day actions",
    description: "The immediate actions you are doing right now. Not managed here — managed in /tasks.",
    color: "#6b7280",
  },
  horizon_1: {
    label: "Horizon 1",
    sublabel: "Current projects",
    description: "Outcomes you are committed to completing within days to months. These live here.",
    color: "#1D9E75",
  },
  horizon_2: {
    label: "Horizon 2",
    sublabel: "Areas of responsibility",
    description: "Ongoing roles and responsibilities you maintain. Health, fitness, work, family.",
    color: "#f59e0b",
  },
  horizon_3: {
    label: "Horizon 3",
    sublabel: "Goals — 1 to 2 years",
    description: "Where you want to be in one to two years. Projects that serve these goals.",
    color: "#6366f1",
  },
  horizon_4: {
    label: "Horizon 4",
    sublabel: "Vision — 3 to 5 years",
    description: "The bigger picture of where your life and work are heading.",
    color: "#8b5cf6",
  },
  horizon_5: {
    label: "Horizon 5",
    sublabel: "Purpose and values",
    description: "Why you do what you do. Your core principles.",
    color: "#ec4899",
  },
};

const AREA_CONFIG: Record<ProjectArea, { label: string; icon: React.ComponentType<any>; color: string }> = {
  health:   { label: "Health",   icon: HeartPulse,   color: "#ef4444" },
  work:     { label: "Work",     icon: Briefcase,    color: "#6366f1" },
  personal: { label: "Personal", icon: User,         color: "#8b5cf6" },
  finance:  { label: "Finance",  icon: Wallet,       color: "#f59e0b" },
  learning: { label: "Learning", icon: BookOpen,     color: "#06b6d4" },
  home:     { label: "Home",     icon: Home,         color: "#84cc16" },
  fitness:  { label: "Fitness",  icon: DumbbellIcon, color: "#1D9E75" },
  custom:   { label: "Custom",   icon: Sparkles,     color: "#6b7280" },
};

type AreaConf = { label: string; icon: React.ComponentType<any>; color: string };
// User-defined areas, filled at runtime from the project_areas table. Kept as a
// module registry so every card/list/form resolves an area key without prop drilling.
let CUSTOM_AREAS: Record<string, { label: string; color: string }> = {};

function getAreaConf(key: string): AreaConf {
  const builtin = (AREA_CONFIG as Record<string, AreaConf>)[key];
  if (builtin) return builtin;
  const c = CUSTOM_AREAS[key];
  if (c) return { label: c.label, icon: Tag, color: c.color };
  return { label: key || "—", icon: Tag, color: "#6b7280" };
}

function areaEntries(): { key: string; conf: AreaConf }[] {
  return [
    ...Object.keys(AREA_CONFIG).map((k) => ({ key: k, conf: getAreaConf(k) })),
    ...Object.keys(CUSTOM_AREAS).map((k) => ({ key: k, conf: getAreaConf(k) })),
  ];
}

const slugifyArea = (label: string) =>
  label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  active:       { label: "Active",        color: "#1D9E75", bg: "bg-emerald-500/10 text-emerald-400" },
  on_hold:      { label: "On Hold",       color: "#f59e0b", bg: "bg-amber-500/10 text-amber-400" },
  someday_maybe:{ label: "Someday/Maybe", color: "#6b7280", bg: "bg-gray-500/10 text-gray-400" },
  completed:    { label: "Completed",     color: "#22c55e", bg: "bg-green-500/10 text-green-400" },
  cancelled:    { label: "Cancelled",     color: "#ef4444", bg: "bg-red-500/10 text-red-400" },
};

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  HeartPulse, Globe, Folder, Target, Lightbulb, Eye, Compass,
  Heart, Briefcase, User, Wallet, BookOpen, Home,
  Dumbbell: DumbbellIcon, FolderKanban, Brain, Sparkles,
};

// ============================================================
// SAMPLE PROJECTS
// ============================================================

const SAMPLE_PROJECTS: Project[] = [
  {
    id: "proj_health_2026",
    title: "Liver Recovery & ALT Normalization",
    outcomeStatement: "ALT blood marker below 49 UI/L confirmed in follow-up blood test. Weight at 84kg.",
    purpose: "Reverse the liver stress trend before it progresses to more serious damage.",
    status: "active",
    area: "health",
    horizon: "horizon_1",
    color: "#ef4444",
    icon: "HeartPulse",
    dueDate: "2026-07-01",
    startDate: "2026-03-31",
    completedAt: null,
    milestones: [
      { id: "m1", title: "Book Dr. Pujol Ruiz follow-up appointment", dueDate: "2026-04-07", completed: false, completedAt: null },
      { id: "m2", title: "First repeat blood test — ALT check", dueDate: "2026-05-15", completed: false, completedAt: null },
      { id: "m3", title: "ALT below 70 UI/L confirmed", dueDate: "2026-06-01", completed: false, completedAt: null },
      { id: "m4", title: "ALT below 49 UI/L — project complete", dueDate: "2026-07-01", completed: false, completedAt: null },
    ],
    notes: [],
    tags: ["liver", "blood-test", "urgent"],
    taskIds: [],
    nextActionId: null,
    isStuck: false,
    healthModuleLink: "health",
    brainstormNotes: "Need to: stop alcohol, add omega-3 fish 3x/week, IF 16:8 strict, morning walk.",
    successCriteria: [
      "ALT confirmed below 49 UI/L in blood test",
      "Weight at or below 84kg",
      "No alcohol for 90 consecutive days",
      "Consistent IF 16:8 for 60 days",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj_bioage",
    title: "Reduce BioAge from 48 to below 40",
    outcomeStatement: "EGYM BioAge overall score below 40. Lower body BioAge below 55.",
    purpose: "Body functions 15 years older than real age. Reverse this through consistent training.",
    status: "active",
    area: "fitness",
    horizon: "horizon_3",
    color: "#1D9E75",
    icon: "Dumbbell",
    dueDate: "2026-12-31",
    startDate: "2026-03-31",
    completedAt: null,
    milestones: [
      { id: "m5", title: "Complete 30-day gym plan", dueDate: "2026-04-30", completed: false, completedAt: null },
      { id: "m6", title: "EGYM BioAge below 45", dueDate: "2026-07-01", completed: false, completedAt: null },
      { id: "m7", title: "EGYM BioAge below 40", dueDate: "2026-12-31", completed: false, completedAt: null },
    ],
    notes: [],
    tags: ["bioage", "gym", "egym"],
    taskIds: [],
    nextActionId: null,
    isStuck: false,
    healthModuleLink: "exercise",
    brainstormNotes: "4 sessions per week. Lower body priority — currently age 70. Fix imbalances.",
    successCriteria: [
      "Overall BioAge below 40 in EGYM assessment",
      "Lower body BioAge below 55",
      "Leg Curl above 50kg",
      "Bicep Curl above 20kg",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj_instaleadsync",
    title: "Launch Instaleadsync.io",
    outcomeStatement: "Instaleadsync health OS live at instaleadsync.com with Supabase connected and all modules functional.",
    purpose: "Build a personal health operating system that integrates all health data in one place.",
    status: "active",
    area: "work",
    horizon: "horizon_1",
    color: "#6366f1",
    icon: "Globe",
    dueDate: null,
    startDate: "2026-03-01",
    completedAt: null,
    milestones: [
      { id: "m8", title: "Supabase schema complete", dueDate: null, completed: false, completedAt: null },
      { id: "m9", title: "All modules functional", dueDate: null, completed: false, completedAt: null },
      { id: "m10", title: "Domain live at instaleadsync.com", dueDate: null, completed: false, completedAt: null },
    ],
    notes: [],
    tags: ["dev", "startup", "product"],
    taskIds: [],
    nextActionId: null,
    isStuck: false,
    healthModuleLink: null,
    brainstormNotes: "Built in Lovable + Claude Code. Supabase backend. Domain: instaleadsync.com",
    successCriteria: [
      "instaleadsync.com resolves and loads correctly",
      "Supabase tables all seeded with real data",
      "All 9 modules navigable and functional",
      "Sleep, Tasks, Projects pages live",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============================================================
// HELPER: get Lucide icon component from name
// ============================================================
function getIcon(name: string) {
  return ICON_MAP[name] || Folder;
}

// ============================================================
// HELPER: due date display
// ============================================================
function dueDateLabel(dueDate: string | null) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < 0) return { text: `Overdue — ${formatted}`, className: "text-red-400" };
  if (diff <= 7) return { text: formatted, className: "text-amber-400" };
  return { text: formatted, className: "text-muted-foreground" };
}

// ============================================================
// SUB-COMPONENT: ProjectCard
// ============================================================
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const IconComp = getIcon(project.icon);
  const completedMilestones = project.milestones.filter(m => m.completed).length;
  const totalMilestones = project.milestones.length;
  const milestonePercent = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;
  const due = dueDateLabel(project.dueDate);
  const hDesc = HORIZON_DESCRIPTIONS[project.horizon];
  const areaConf = getAreaConf(project.area);
  const statusConf = STATUS_CONFIG[project.status];
  const isStuck = project.status === "active" && !project.nextActionId && project.taskIds.length === 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className="group relative bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
    >
      {/* Color strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: project.color }} />

      <div className="p-4 pl-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: project.color + "20" }}>
              <IconComp className="w-4 h-4" style={{ color: project.color }} />
            </div>
            <h3 className="font-semibold text-sm text-foreground truncate">{project.title}</h3>
          </div>
          {project.healthModuleLink && (
            <Link2 className="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConf.bg}`}>
            {statusConf.label}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ backgroundColor: hDesc.color + "18", color: hDesc.color }}
          >
            {hDesc.label.replace("Horizon ", "H")}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ backgroundColor: areaConf.color + "18", color: areaConf.color }}
          >
            <areaConf.icon className="w-3 h-3" /> {areaConf.label}
          </span>
        </div>

        {/* Outcome (truncated) */}
        {project.outcomeStatement && (
          <p className="text-xs text-muted-foreground line-clamp-1">{project.outcomeStatement}</p>
        )}

        {/* Milestones progress */}
        {totalMilestones > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Milestones</span>
              <span className="text-[10px] font-medium text-foreground">{completedMilestones}/{totalMilestones}</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: project.color }}
                initial={false}
                animate={{ width: `${milestonePercent}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            </div>
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            {project.taskIds.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{project.taskIds.length} tasks</span>
            )}
            {due && (
              <span className={`text-[10px] font-medium flex items-center gap-1 ${due.className}`}>
                <Calendar className="w-3 h-3" />
                {due.text}
              </span>
            )}
          </div>
        </div>

        {/* Stuck warning */}
        {isStuck && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[10px] font-medium text-red-400">No next action — stuck</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// SUB-COMPONENT: ProjectDetailPanel
// ============================================================
// Hoisted out of ProjectDetailPanel so its identity stays stable across keystrokes —
// otherwise inputs inside lose focus on every change.
function CollapsibleSection({
  isOpen, onToggle, icon: SIcon, title, children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/50 transition"
      >
        <SIcon className="w-4 h-4 text-muted-foreground" />
        <span className="flex-1 text-left">{title}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectDetailPanel({
  project,
  onClose,
  onUpdate,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onUpdate: (updated: Project) => void;
  onDelete: (id: string) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project.title);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newCriterion, setNewCriterion] = useState("");
  const [newTag, setNewTag] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const isStuck = project.status === "active" && !project.nextActionId && project.taskIds.length === 0;
  const hDesc = HORIZON_DESCRIPTIONS[project.horizon];
  const IconComp = getIcon(project.icon);

  const update = (partial: Partial<Project>) => {
    onUpdate({ ...project, ...partial, updatedAt: new Date().toISOString() });
  };

  const toggleMilestone = (mId: string) => {
    const milestones = project.milestones.map(m =>
      m.id === mId ? { ...m, completed: !m.completed, completedAt: !m.completed ? new Date().toISOString() : null } : m
    );
    update({ milestones });
  };

  const addMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    const milestones = [...project.milestones, {
      id: crypto.randomUUID(), title: newMilestoneTitle.trim(), dueDate: null, completed: false, completedAt: null,
    }];
    update({ milestones });
    setNewMilestoneTitle("");
  };

  const deleteMilestone = (mId: string) => {
    update({ milestones: project.milestones.filter(m => m.id !== mId) });
  };

  const addNote = () => {
    if (!newNoteContent.trim()) return;
    const notes = [...project.notes, { id: crypto.randomUUID(), content: newNoteContent.trim(), createdAt: new Date().toISOString() }];
    update({ notes });
    setNewNoteContent("");
  };

  const addCriterion = () => {
    if (!newCriterion.trim()) return;
    update({ successCriteria: [...project.successCriteria, newCriterion.trim()] });
    setNewCriterion("");
  };

  const removeCriterion = (idx: number) => {
    update({ successCriteria: project.successCriteria.filter((_, i) => i !== idx) });
  };

  const addTag = () => {
    if (!newTag.trim() || project.tags.includes(newTag.trim())) return;
    update({ tags: [...project.tags, newTag.trim()] });
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    update({ tags: project.tags.filter(t => t !== tag) });
  };

  const completedMilestones = project.milestones.filter(m => m.completed).length;
  const totalMilestones = project.milestones.length;

  // Section component is hoisted below the parent (see CollapsibleSection)

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
    >
      {/* Panel header */}
      <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: project.color + "20" }}>
          <IconComp className="w-5 h-5" style={{ color: project.color }} />
        </div>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={() => { update({ title: titleValue }); setEditingTitle(false); }}
              onKeyDown={e => { if (e.key === "Enter") { update({ title: titleValue }); setEditingTitle(false); } }}
              className="w-full bg-transparent text-foreground font-semibold text-base outline-none border-b border-primary"
            />
          ) : (
            <h2
              className="font-semibold text-base text-foreground truncate cursor-pointer hover:text-primary transition"
              onClick={() => setEditingTitle(true)}
            >
              {project.title}
              <Edit3 className="w-3 h-3 inline ml-1.5 opacity-40" />
            </h2>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: hDesc.color + "18", color: hDesc.color }}
            >
              {hDesc.sublabel}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CONFIG[project.status].bg}`}>
              {STATUS_CONFIG[project.status].label}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stuck warning */}
      {isStuck && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs font-medium text-red-400">This project is stuck — assign a next action.</span>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Outcome & Purpose (always visible) */}
        <div className="p-4 space-y-3 border-b border-border">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">What does DONE look like?</label>
            <textarea
              value={project.outcomeStatement}
              onChange={e => update({ outcomeStatement: e.target.value })}
              rows={2}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Describe the desired outcome..."
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Why does this matter?</label>
            <textarea
              value={project.purpose}
              onChange={e => update({ purpose: e.target.value })}
              rows={2}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Why are you doing this project?"
            />
          </div>
        </div>

        {/* Planning section */}
        <CollapsibleSection isOpen={activeSection === "planning" || (activeSection !== "criteria" && activeSection !== "milestones" && activeSection !== "tasks" && activeSection !== "brainstorm" && activeSection !== "notes")} onToggle={() => setActiveSection(activeSection === "planning" ? null : "planning")} icon={Compass} title="Planning">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Horizon</label>
              <select
                value={project.horizon}
                onChange={e => update({ horizon: e.target.value as HorizonLevel })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              >
                {(Object.keys(HORIZON_DESCRIPTIONS) as HorizonLevel[]).map(h => (
                  <option key={h} value={h}>{HORIZON_DESCRIPTIONS[h].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Area</label>
              <select
                value={project.area}
                onChange={e => update({ area: e.target.value })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              >
                {areaEntries().map(({ key, conf }) => (
                  <option key={key} value={key}>{conf.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Start Date</label>
              <input
                type="date"
                value={project.startDate || ""}
                onChange={e => update({ startDate: e.target.value || null })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Due Date</label>
              <input
                type="date"
                value={project.dueDate || ""}
                onChange={e => update({ dueDate: e.target.value || null })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Health Module Link</label>
            <select
              value={project.healthModuleLink || ""}
              onChange={e => update({ healthModuleLink: (e.target.value || null) as Project["healthModuleLink"] })}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
            >
              <option value="">None</option>
              <option value="nutrition">Nutrition</option>
              <option value="exercise">Exercise</option>
              <option value="sleep">Sleep</option>
              <option value="health">Health Records</option>
              <option value="body">Body Metrics</option>
              <option value="fasting">Fasting</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Color</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {["#ef4444","#f59e0b","#22c55e","#1D9E75","#06b6d4","#6366f1","#8b5cf6","#ec4899","#6b7280"].map(c => (
                <button
                  key={c}
                  onClick={() => update({ color: c })}
                  className={`w-6 h-6 rounded-full border-2 transition ${project.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {project.tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-xs text-foreground">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTag()}
                  placeholder="Add tag"
                  className="bg-transparent text-xs text-foreground outline-none w-16"
                />
                <button onClick={addTag} className="text-primary hover:text-primary/80 transition">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Success Criteria */}
        <CollapsibleSection isOpen={activeSection === "criteria"} onToggle={() => setActiveSection(activeSection === "criteria" ? null : "criteria")} icon={Target} title="Success Criteria">
          <div className="space-y-2">
            {project.successCriteria.map((c, i) => (
              <div key={i} className="flex items-start gap-2 group/c">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span className="text-xs text-foreground flex-1">{c}</span>
                <button onClick={() => removeCriterion(i)} className="opacity-0 group-hover/c:opacity-100 text-red-400 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newCriterion}
                onChange={e => setNewCriterion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCriterion()}
                placeholder="Add success criterion..."
                className="flex-1 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none"
              />
              <button onClick={addCriterion} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition">
                Add
              </button>
            </div>
          </div>
        </CollapsibleSection>

        {/* Milestones */}
        <CollapsibleSection isOpen={activeSection === "milestones"} onToggle={() => setActiveSection(activeSection === "milestones" ? null : "milestones")} icon={Target} title={`Milestones ${totalMilestones > 0 ? `(${completedMilestones}/${totalMilestones})` : ""}`}>
          {totalMilestones > 0 && (
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0}%`, backgroundColor: project.color }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            {project.milestones.map(m => (
              <div key={m.id} className="flex items-center gap-2 group/m">
                <button onClick={() => toggleMilestone(m.id)} className="shrink-0">
                  {m.completed
                    ? <CheckCircle2 className="w-4 h-4 text-primary" />
                    : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition" />
                  }
                </button>
                <span className={`text-xs flex-1 ${m.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{m.title}</span>
                {m.dueDate && (
                  <span className="text-[10px] text-muted-foreground">{new Date(m.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                <button onClick={() => deleteMilestone(m.id)} className="opacity-0 group-hover/m:opacity-100 text-red-400 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={newMilestoneTitle}
              onChange={e => setNewMilestoneTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMilestone()}
              placeholder="Add milestone..."
              className="flex-1 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none"
            />
            <button onClick={addMilestone} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition">
              Add
            </button>
          </div>
        </CollapsibleSection>

        {/* Linked Tasks */}
        <CollapsibleSection isOpen={activeSection === "tasks"} onToggle={() => setActiveSection(activeSection === "tasks" ? null : "tasks")} icon={Check} title={`Linked Tasks (${project.taskIds.length})`}>
          {project.taskIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tasks linked yet. Create tasks in the Tasks module and assign them to this project.</p>
          ) : (
            <div className="space-y-1.5">
              {project.taskIds.map(tid => (
                <div key={tid} className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground flex-1">{tid}</span>
                </div>
              ))}
            </div>
          )}
          {/* Next Action */}
          <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <label className="text-[10px] uppercase tracking-wider text-primary font-medium">Next Action</label>
            {project.nextActionId ? (
              <div className="mt-1 flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-foreground">{project.nextActionId}</span>
                <button onClick={() => update({ nextActionId: null })} className="text-red-400 ml-auto">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No next action assigned — this project is stuck.
              </p>
            )}
          </div>
        </CollapsibleSection>

        {/* Brainstorm Pad */}
        <CollapsibleSection isOpen={activeSection === "brainstorm"} onToggle={() => setActiveSection(activeSection === "brainstorm" ? null : "brainstorm")} icon={Brain} title="Brainstorm Pad">
          <textarea
            value={project.brainstormNotes}
            onChange={e => update({ brainstormNotes: e.target.value })}
            rows={5}
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Brain dump ideas, concerns, thoughts about this project..."
          />
        </CollapsibleSection>

        {/* Notes */}
        <CollapsibleSection isOpen={activeSection === "notes"} onToggle={() => setActiveSection(activeSection === "notes" ? null : "notes")} icon={StickyNote} title={`Notes (${project.notes.length})`}>
          <div className="space-y-2">
            {project.notes.map(n => (
              <div key={n.id} className="px-3 py-2 bg-secondary/50 rounded-lg">
                <p className="text-xs text-foreground">{n.content}</p>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addNote()}
              placeholder="Add a note..."
              className="flex-1 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none"
            />
            <button onClick={addNote} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition">
              Add
            </button>
          </div>
        </CollapsibleSection>
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-border flex flex-wrap gap-2 shrink-0">
        {project.status === "active" && (
          <>
            <button
              onClick={() => { update({ status: "completed", completedAt: new Date().toISOString() }); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition"
            >
              <Check className="w-3.5 h-3.5" /> Complete
            </button>
            <button
              onClick={() => { update({ status: "on_hold" }); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition"
            >
              <Pause className="w-3.5 h-3.5" /> Hold
            </button>
            <button
              onClick={() => { update({ status: "someday_maybe" }); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-muted-foreground rounded-lg text-xs font-medium hover:bg-secondary/80 transition"
            >
              <Archive className="w-3.5 h-3.5" /> Someday
            </button>
          </>
        )}
        {project.status === "on_hold" && (
          <button
            onClick={() => update({ status: "active" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition"
          >
            <Play className="w-3.5 h-3.5" /> Reactivate
          </button>
        )}
        {project.status === "someday_maybe" && (
          <button
            onClick={() => update({ status: "active" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition"
          >
            <Play className="w-3.5 h-3.5" /> Activate
          </button>
        )}
        {project.status === "completed" && (
          <button
            onClick={() => update({ status: "active", completedAt: null })}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-muted-foreground rounded-lg text-xs font-medium hover:bg-secondary/80 transition"
          >
            <Play className="w-3.5 h-3.5" /> Reopen
          </button>
        )}
        <button
          onClick={() => { onDelete(project.id); onClose(); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================
// SUB-COMPONENT: HorizonMapView
// ============================================================
function HorizonMapView({ projects, onSelect }: { projects: Project[]; onSelect: (p: Project) => void }) {
  const horizons = (Object.keys(HORIZON_DESCRIPTIONS) as HorizonLevel[]).filter(h => h !== "ground");

  return (
    <div className="space-y-4">
      {horizons.map(h => {
        const hProjects = projects.filter(p => p.horizon === h && p.status !== "someday_maybe");
        const hDesc = HORIZON_DESCRIPTIONS[h];
        return (
          <div key={h} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hDesc.color }} />
              <div>
                <span className="text-sm font-semibold text-foreground">{hDesc.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{hDesc.sublabel}</span>
              </div>
              <span className="text-xs text-muted-foreground ml-auto">{hProjects.length} projects</span>
            </div>
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/50">{hDesc.description}</p>
            {hProjects.length === 0 ? (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground/60 italic">No projects at this level</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {hProjects.map(p => {
                  const IconC = getIcon(p.icon);
                  const statusC = STATUS_CONFIG[p.status];
                  const cm = p.milestones.filter(m => m.completed).length;
                  const tm = p.milestones.length;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition text-left"
                    >
                      <div className="w-2 h-8 rounded-full" style={{ backgroundColor: p.color }} />
                      <IconC className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                      <span className="text-sm text-foreground flex-1 truncate">{p.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusC.bg}`}>{statusC.label}</span>
                      {tm > 0 && <span className="text-[10px] text-muted-foreground">{cm}/{tm}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: ListView
// ============================================================
function ListView({ projects, onSelect }: { projects: Project[]; onSelect: (p: Project) => void }) {
  const [sortBy, setSortBy] = useState<"title" | "status" | "area" | "horizon" | "dueDate">("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = [...projects].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "title") cmp = a.title.localeCompare(b.title);
    else if (sortBy === "status") cmp = a.status.localeCompare(b.status);
    else if (sortBy === "area") cmp = a.area.localeCompare(b.area);
    else if (sortBy === "horizon") cmp = a.horizon.localeCompare(b.horizon);
    else if (sortBy === "dueDate") cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortHeader = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <button onClick={() => toggleSort(col)} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition">
      {label}
      {sortBy === col && <span>{sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px_80px_80px_60px_90px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/30">
        <SortHeader col="title" label="Title" />
        <SortHeader col="status" label="Status" />
        <SortHeader col="area" label="Area" />
        <SortHeader col="horizon" label="Horizon" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tasks</span>
        <SortHeader col="dueDate" label="Due Date" />
      </div>
      {/* Rows */}
      <div className="divide-y divide-border/50">
        {sorted.map(p => {
          const IconC = getIcon(p.icon);
          const statusC = STATUS_CONFIG[p.status];
          const hDesc = HORIZON_DESCRIPTIONS[p.horizon];
          const areaConf = getAreaConf(p.area);
          const due = dueDateLabel(p.dueDate);
          const isStuck = p.status === "active" && !p.nextActionId && p.taskIds.length === 0;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full grid grid-cols-[1fr_80px_80px_80px_60px_90px] gap-3 px-4 py-2.5 hover:bg-secondary/30 transition text-left items-center"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <IconC className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                <span className="text-sm text-foreground truncate">{p.title}</span>
                {isStuck && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium text-center ${statusC.bg}`}>{statusC.label}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><areaConf.icon className="w-3 h-3" /> {areaConf.label}</span>
              <span className="text-xs" style={{ color: hDesc.color }}>{hDesc.label.replace("Horizon ", "H")}</span>
              <span className="text-xs text-muted-foreground text-center">{p.taskIds.length}</span>
              {due ? <span className={`text-xs ${due.className}`}>{due.text}</span> : <span className="text-xs text-muted-foreground">-</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
// Helper: convert frontend Project to Supabase row
function projectToRow(p: Project) {
  return {
    title: p.title,
    outcome_statement: p.outcomeStatement,
    purpose: p.purpose,
    status: p.status,
    area: p.area,
    horizon: p.horizon,
    color: p.color,
    icon: p.icon,
    due_date: p.dueDate || undefined,
    start_date: p.startDate || undefined,
    completed_at: p.completedAt || undefined,
    milestones: p.milestones as any,
    notes: p.notes as any,
    tags: p.tags,
    task_ids: p.taskIds,
    next_action_id: p.nextActionId || undefined,
    is_stuck: p.isStuck,
    health_module_link: p.healthModuleLink || undefined,
    brainstorm_notes: p.brainstormNotes,
    success_criteria: p.successCriteria,
  };
}

// Helper: convert Supabase row to frontend Project
function rowToProject(r: any): Project {
  return {
    id: r.id,
    title: r.title,
    outcomeStatement: r.outcome_statement || "",
    purpose: r.purpose || "",
    status: r.status || "active",
    area: r.area || "personal",
    horizon: r.horizon || "horizon_1",
    color: r.color || "#1D9E75",
    icon: r.icon || "Folder",
    dueDate: r.due_date || null,
    startDate: r.start_date || null,
    completedAt: r.completed_at || null,
    milestones: (typeof r.milestones === "string" ? JSON.parse(r.milestones) : r.milestones) || [],
    notes: (typeof r.notes === "string" ? JSON.parse(r.notes) : r.notes) || [],
    tags: r.tags || [],
    taskIds: r.task_ids || [],
    nextActionId: r.next_action_id || null,
    isStuck: r.is_stuck ?? true,
    healthModuleLink: r.health_module_link || null,
    brainstormNotes: r.brainstorm_notes || "",
    successCriteria: r.success_criteria || [],
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString(),
  };
}

export default function ProjectsModule() {
  const [projects, setProjects] = useState<Project[]>(SAMPLE_PROJECTS);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list" | "horizon">("cards");
  const [filterHorizon, setFilterHorizon] = useState<HorizonLevel | "all">("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [stuckBannerDismissed, setStuckBannerDismissed] = useState(false);
  const [somedayOpen, setSomedayOpen] = useState(false);

  // Custom (user-defined) areas
  const [customAreas, setCustomAreas] = useState<{ id: string; key: string; label: string; color: string }[]>([]);
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [newAreaLabel, setNewAreaLabel] = useState("");
  const [newAreaColor, setNewAreaColor] = useState(AREA_COLORS[0]);
  const [savingArea, setSavingArea] = useState(false);

  async function loadAreas() {
    const { data } = await supabase.from("project_areas" as any).select("*").order("created_at");
    const rows = ((data as any[]) ?? []) as { id: string; key: string; label: string; color: string }[];
    CUSTOM_AREAS = Object.fromEntries(rows.map((r) => [r.key, { label: r.label, color: r.color }]));
    setCustomAreas(rows);
  }

  async function createArea() {
    const label = newAreaLabel.trim();
    if (!label) return;
    const key = slugifyArea(label) || `area-${Date.now()}`;
    if ((AREA_CONFIG as Record<string, unknown>)[key]) { toast.error("That name matches a built-in area — pick another."); return; }
    setSavingArea(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("project_areas" as any).insert({ user_id: user.id, key, label, color: newAreaColor } as any);
      if (error) throw error;
      setNewAreaLabel("");
      await loadAreas();
      toast.success("Area added");
    } catch (e: any) { toast.error(e?.message ?? "Couldn't add area"); } finally { setSavingArea(false); }
  }

  async function deleteArea(id: string) {
    await supabase.from("project_areas" as any).delete().eq("id", id);
    await loadAreas();
  }

  // Load projects + custom areas from Supabase
  useEffect(() => {
    dbGetProjects().then(rows => {
      if (rows && rows.length > 0) {
        setProjects(rows.map(rowToProject));
      }
    });
    void loadAreas();
  }, []);

  const stuckProjects = useMemo(() =>
    projects.filter(p => p.status === "active" && p.taskIds.length === 0 && !p.nextActionId),
    [projects]
  );

  const filteredProjects = useMemo(() =>
    projects.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterHorizon !== "all" && p.horizon !== filterHorizon) return false;
      if (filterArea !== "all" && p.area !== filterArea) return false;
      if (p.status === "someday_maybe") return false;
      if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }),
    [projects, filterStatus, filterHorizon, filterArea, searchQuery]
  );

  const somedayProjects = useMemo(() =>
    projects.filter(p => p.status === "someday_maybe"),
    [projects]
  );

  const activeCount = useMemo(() => projects.filter(p => p.status === "active").length, [projects]);

  const addProject = () => {
    const blank: Project = {
      id: crypto.randomUUID(),
      title: "New Project",
      outcomeStatement: "",
      purpose: "",
      status: "active",
      area: "personal",
      horizon: "horizon_1",
      color: "#1D9E75",
      icon: "Folder",
      dueDate: null,
      startDate: new Date().toISOString().split("T")[0],
      completedAt: null,
      milestones: [],
      notes: [],
      tags: [],
      taskIds: [],
      nextActionId: null,
      isStuck: true,
      healthModuleLink: null,
      brainstormNotes: "",
      successCriteria: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProjects(prev => [...prev, blank]);
    setSelectedProject(blank);
    // Persist to Supabase
    dbCreateProject(projectToRow(blank)).then(row => {
      if (row) {
        const realId = row.id;
        setProjects(prev => prev.map(p => p.id === blank.id ? { ...p, id: realId } : p));
        setSelectedProject(prev => prev?.id === blank.id ? { ...prev, id: realId } : prev);
      }
    });
  };

  const updateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedProject(updated);
    // Persist to Supabase
    dbUpdateProject(updated.id, projectToRow(updated));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
    // Persist to Supabase
    dbDeleteProject(id);
  };

  // Horizon filter counts
  const horizonCounts = useMemo(() => {
    const counts: Record<string, number> = { all: projects.filter(p => p.status !== "someday_maybe").length };
    for (const h of Object.keys(HORIZON_DESCRIPTIONS)) {
      counts[h] = projects.filter(p => p.horizon === h && p.status !== "someday_maybe").length;
    }
    return counts;
  }, [projects]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* TOP BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderKanban className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Projects</h1>
            <p className="text-xs text-muted-foreground">GTD-based project management</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {/* Stuck badge */}
          {stuckProjects.length > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {stuckProjects.length} stuck
            </span>
          )}

          {/* Active count */}
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-xs font-medium text-emerald-400">
            {activeCount} active
          </span>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-secondary/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground outline-none w-36 focus:w-48 transition-all focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-secondary/50 rounded-lg p-0.5">
            {([
              { mode: "cards" as const, icon: LayoutGrid, label: "Cards" },
              { mode: "list" as const, icon: List, label: "List" },
              { mode: "horizon" as const, icon: Layers, label: "Horizon" },
            ]).map(v => (
              <button
                key={v.mode}
                onClick={() => setViewMode(v.mode)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                  viewMode === v.mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <v.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* New project */}
          <button
            onClick={addProject}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>
        </div>
      </div>

      {/* STUCK BANNER */}
      {stuckProjects.length > 0 && !stuckBannerDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20"
        >
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">
              {stuckProjects.length} project{stuckProjects.length > 1 ? "s are" : " is"} stuck — no next action assigned.
            </p>
            <p className="text-xs text-red-400/70 mt-0.5">Without a next action, these projects will not move forward.</p>
          </div>
          <button
            onClick={() => { setFilterStatus("active"); setStuckBannerDismissed(true); }}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition shrink-0"
          >
            Review stuck projects
          </button>
          <button onClick={() => setStuckBannerDismissed(true)} className="text-red-400/50 hover:text-red-400 transition">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* HORIZON FILTER STRIP */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setFilterHorizon("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
            filterHorizon === "all" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          All <span className="opacity-70">({horizonCounts.all})</span>
        </button>
        {(Object.keys(HORIZON_DESCRIPTIONS) as HorizonLevel[]).filter(h => h !== "ground").map(h => {
          const hd = HORIZON_DESCRIPTIONS[h];
          return (
            <button
              key={h}
              onClick={() => setFilterHorizon(filterHorizon === h ? "all" : h)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
                filterHorizon === h ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hd.color }} />
              {hd.sublabel}
              <span className="opacity-70">({horizonCounts[h] || 0})</span>
            </button>
          );
        })}
      </div>

      {/* AREA FILTER ROW */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setFilterArea("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
            filterArea === "all" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          All areas
        </button>
        {areaEntries().map(({ key, conf }) => (
          <button
            key={key}
            onClick={() => setFilterArea(filterArea === key ? "all" : key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
              filterArea === key ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <conf.icon className="w-3.5 h-3.5" /> {conf.label}
          </button>
        ))}
        <button
          onClick={() => setAreaDialogOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary"
        >
          <Plus className="w-3.5 h-3.5" /> New area
        </button>
      </div>

      {/* CUSTOM AREA DIALOG */}
      {areaDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAreaDialogOpen(false)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">Custom areas</h3>
              <button onClick={() => setAreaDialogOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            {customAreas.length > 0 && (
              <div className="space-y-1.5">
                {customAreas.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full" style={{ background: a.color }} /> {a.label}</span>
                    <button onClick={() => deleteArea(a.id)} className="text-muted-foreground hover:text-destructive" title="Delete area"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">New area name</label>
              <input
                value={newAreaLabel}
                onChange={e => setNewAreaLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createArea(); }}
                placeholder="e.g. Side Hustle"
                className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none"
                autoFocus
              />
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {AREA_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewAreaColor(c)}
                    className={`w-6 h-6 rounded-full transition ${newAreaColor === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAreaDialogOpen(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">Close</button>
              <button onClick={createArea} disabled={!newAreaLabel.trim() || savingArea} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground disabled:opacity-50">
                {savingArea ? "Adding…" : "Add area"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS FILTER */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {(["all", "active", "on_hold", "completed", "cancelled"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
              filterStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All statuses" : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* MAIN VIEW */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredProjects.map(p => (
              <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} />
            ))}
          </AnimatePresence>
          {filteredProjects.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <FolderKanban className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No projects match the current filters.</p>
            </div>
          )}
        </div>
      )}

      {viewMode === "list" && <ListView projects={filteredProjects} onSelect={setSelectedProject} />}
      {viewMode === "horizon" && <HorizonMapView projects={projects} onSelect={setSelectedProject} />}

      {/* SOMEDAY / MAYBE SECTION */}
      {somedayProjects.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <button
            onClick={() => setSomedayOpen(!somedayOpen)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-secondary/30 transition"
          >
            {somedayOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <Archive className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Someday / Maybe</span>
            <span className="text-xs text-muted-foreground ml-1">({somedayProjects.length})</span>
          </button>
          <AnimatePresence>
            {somedayOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 pt-0 space-y-2">
                  <p className="text-xs text-muted-foreground pb-2">These are parked ideas — not active, just captured for possible future activation.</p>
                  {somedayProjects.map(p => {
                    const IconC = getIcon(p.icon);
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition">
                        <IconC className="w-4 h-4" style={{ color: p.color }} />
                        <span className="text-sm text-foreground flex-1 truncate">{p.title}</span>
                        <button
                          onClick={() => updateProject({ ...p, status: "active", updatedAt: new Date().toISOString() })}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-medium hover:bg-emerald-500/20 transition"
                        >
                          <Play className="w-3 h-3" /> Activate
                        </button>
                        <button
                          onClick={() => setSelectedProject(p)}
                          className="text-muted-foreground hover:text-foreground transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Weekly Review Banner */}
      {new Date().getDay() === 1 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
          <Clock className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Time for your weekly review</p>
            <p className="text-xs text-muted-foreground">Review all projects, clear stuck items, update milestones.</p>
          </div>
          <button className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition">
            Start review
          </button>
        </div>
      )}

      {/* PROJECT DETAIL PANEL */}
      <AnimatePresence>
        {selectedProject && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSelectedProject(null)}
            />
            <ProjectDetailPanel
              project={selectedProject}
              onClose={() => setSelectedProject(null)}
              onUpdate={updateProject}
              onDelete={deleteProject}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
