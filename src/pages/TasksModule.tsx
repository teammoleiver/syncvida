import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckSquare, Plus, Inbox, Zap, Play, Clock, Moon as MoonIcon,
  CheckCircle2, Circle, X, Calendar, Tag, Link2, Trash2,
  AlertTriangle, MoreVertical, ChevronDown, ChevronRight,
  Search, List, LayoutGrid, Star, ArrowRight, Edit3,
  Timer, Repeat, StickyNote, Heart, Dumbbell, Brain,
  Monitor, Phone, Mail, Users, Pill, ShoppingCart, Home,
  BookOpen, MapPin, Sparkles, Filter, Eye, Pause,
  ChevronLeft, GripVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getTasks as dbGetTasks,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
} from "@/lib/supabase-queries";

// ============================================================
// DATA STRUCTURES
// ============================================================

export type TaskStatus =
  | "inbox"
  | "next_action"
  | "in_progress"
  | "waiting_for"
  | "someday_maybe"
  | "done"
  | "cancelled";

export type TaskPriority = "critical" | "high" | "medium" | "low" | "none";

export type TaskContext =
  | "@computer"
  | "@phone"
  | "@email"
  | "@meeting"
  | "@gym"
  | "@doctor"
  | "@nutrition"
  | "@errands"
  | "@home"
  | "@anywhere"
  | "@reading"
  | string;

export type EnergyLevel = "high" | "medium" | "low";

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  wipLimit: number | null;
  order: number;
  icon: string;
  isDefault: boolean;
  statusMapping: TaskStatus;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  columnId: string;
  projectId: string | null;
  priority: TaskPriority;
  contexts: TaskContext[];
  dueDate: string | null;
  estimatedMinutes: number | null;
  isTwoMinuteTask: boolean;
  waitingFor: string | null;
  energyRequired: EnergyLevel;
  tags: string[];
  healthModuleLink:
    | "nutrition" | "exercise" | "sleep"
    | "health" | "body" | "fasting" | null;
  subtasks: Subtask[];
  notes: string;
  isRecurring: boolean;
  recurringPattern: "daily" | "weekly" | "monthly" | null;
  order: number;
  completedAt: string | null;
  createdAt: string;
}

// ============================================================
// CONFIGS
// ============================================================

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; border: string }> = {
  critical: { label: "Critical", color: "#ef4444", border: "border-l-red-500" },
  high:     { label: "High",     color: "#f97316", border: "border-l-orange-500" },
  medium:   { label: "Medium",   color: "#eab308", border: "border-l-yellow-500" },
  low:      { label: "Low",      color: "#3b82f6", border: "border-l-blue-500" },
  none:     { label: "None",     color: "#6b7280", border: "border-l-gray-500" },
};

const ENERGY_CONFIG: Record<EnergyLevel, { label: string; color: string; dot: string }> = {
  high:   { label: "High",   color: "#ef4444", dot: "bg-red-400" },
  medium: { label: "Medium", color: "#eab308", dot: "bg-yellow-400" },
  low:    { label: "Low",    color: "#22c55e", dot: "bg-green-400" },
};

const CONTEXT_ICONS: Record<string, React.ComponentType<any>> = {
  "@computer": Monitor,
  "@phone": Phone,
  "@email": Mail,
  "@meeting": Users,
  "@gym": Dumbbell,
  "@doctor": Pill,
  "@nutrition": Heart,
  "@errands": ShoppingCart,
  "@home": Home,
  "@anywhere": MapPin,
  "@reading": BookOpen,
};

const CONTEXT_COLORS: Record<string, string> = {
  "@computer": "#6366f1",
  "@phone": "#06b6d4",
  "@email": "#f59e0b",
  "@meeting": "#8b5cf6",
  "@gym": "#1D9E75",
  "@doctor": "#ef4444",
  "@nutrition": "#ec4899",
  "@errands": "#f97316",
  "@home": "#84cc16",
  "@anywhere": "#6b7280",
  "@reading": "#a855f7",
};

const ALL_CONTEXTS: TaskContext[] = [
  "@computer", "@phone", "@email", "@meeting", "@gym",
  "@doctor", "@nutrition", "@errands", "@home", "@anywhere", "@reading",
];

const COLUMN_ICON_MAP: Record<string, React.ComponentType<any>> = {
  Inbox, Zap, Play, Clock, Moon: MoonIcon, CheckCircle2, Circle, Star, Timer,
};

// Project name lookup for display purposes
const PROJECT_NAMES: Record<string, string> = {
  proj_health_2026: "Liver Recovery & ALT Normalization",
  proj_bioage: "Reduce BioAge from 48 to below 40",
  proj_syncvida: "Launch Syncvida.io",
};

// ============================================================
// DEFAULT COLUMNS
// ============================================================

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "col_inbox",   title: "Inbox",           color: "#6366f1", wipLimit: null, order: 0, icon: "Inbox",        isDefault: true,  statusMapping: "inbox" },
  { id: "col_next",    title: "Next Actions",    color: "#f59e0b", wipLimit: null, order: 1, icon: "Zap",          isDefault: true,  statusMapping: "next_action" },
  { id: "col_doing",   title: "In Progress",     color: "#1D9E75", wipLimit: 3,    order: 2, icon: "Play",         isDefault: true,  statusMapping: "in_progress" },
  { id: "col_waiting", title: "Waiting For",     color: "#ef4444", wipLimit: null, order: 3, icon: "Clock",        isDefault: true,  statusMapping: "waiting_for" },
  { id: "col_someday", title: "Someday / Maybe", color: "#8b5cf6", wipLimit: null, order: 4, icon: "Moon",         isDefault: false, statusMapping: "someday_maybe" },
  { id: "col_done",    title: "Done",            color: "#10b981", wipLimit: null, order: 5, icon: "CheckCircle2", isDefault: true,  statusMapping: "done" },
];

// ============================================================
// SAMPLE TASKS
// ============================================================

const SAMPLE_TASKS: Task[] = [
  {
    id: "task_1",
    title: "Call Dr. Pujol Ruiz \u2014 book ALT follow-up",
    description: "Book follow-up blood test. Ask for Hep B/C panel and Vitamin D test at the same time.",
    status: "next_action",
    columnId: "col_next",
    projectId: "proj_health_2026",
    priority: "critical",
    contexts: ["@phone"],
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
    estimatedMinutes: 5,
    isTwoMinuteTask: false,
    waitingFor: null,
    energyRequired: "low",
    tags: ["health", "liver"],
    healthModuleLink: "health",
    subtasks: [],
    notes: "EAP Horta 7D \u2014 93 274 60 00",
    isRecurring: false,
    recurringPattern: null,
    order: 0,
    completedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "task_2",
    title: "Lower Body 1 gym session",
    description: "6 exercises \u2014 Reverse Lunges, Leg Press, Calf Press, Leg Curl, Leg Extension, Abductor",
    status: "next_action",
    columnId: "col_next",
    projectId: "proj_bioage",
    priority: "high",
    contexts: ["@gym"],
    dueDate: new Date().toISOString().split("T")[0],
    estimatedMinutes: 60,
    isTwoMinuteTask: false,
    waitingFor: null,
    energyRequired: "high",
    tags: ["gym", "lower-body"],
    healthModuleLink: "exercise",
    subtasks: [
      { id: "st_1", title: "Reverse Lunges 2\u00d712", completed: false },
      { id: "st_2", title: "Plate Leg Press 1\u00d710", completed: false },
      { id: "st_3", title: "Calf Press 3\u00d712", completed: false },
      { id: "st_4", title: "EGYM Leg Curl 3\u00d710", completed: false },
      { id: "st_5", title: "EGYM Leg Extension 1\u00d712", completed: false },
      { id: "st_6", title: "EGYM Abductor 3\u00d710", completed: false },
    ],
    notes: "Best at 11:30am just before breaking fast",
    isRecurring: true,
    recurringPattern: "weekly",
    order: 1,
    completedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "task_3",
    title: "Run Supabase migrations for Syncvida",
    description: "Execute all SQL migration files in Supabase SQL editor.",
    status: "in_progress",
    columnId: "col_doing",
    projectId: "proj_syncvida",
    priority: "high",
    contexts: ["@computer"],
    dueDate: null,
    estimatedMinutes: 60,
    isTwoMinuteTask: false,
    waitingFor: null,
    energyRequired: "high",
    tags: ["dev", "supabase"],
    healthModuleLink: null,
    subtasks: [
      { id: "st_7", title: "Create user_profile table", completed: true },
      { id: "st_8", title: "Create weight_logs table", completed: false },
      { id: "st_9", title: "Create sleep_logs table", completed: false },
      { id: "st_10", title: "Create tasks table", completed: false },
      { id: "st_11", title: "Seed initial data", completed: false },
    ],
    notes: "",
    isRecurring: false,
    recurringPattern: null,
    order: 0,
    completedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "task_4",
    title: "DNS configured for syncvida.io",
    description: "Waiting for Namecheap DNS propagation after pointing to hosting.",
    status: "waiting_for",
    columnId: "col_waiting",
    projectId: "proj_syncvida",
    priority: "medium",
    contexts: ["@computer"],
    dueDate: null,
    estimatedMinutes: 10,
    isTwoMinuteTask: false,
    waitingFor: "Namecheap DNS propagation (24\u201348 hours)",
    energyRequired: "low",
    tags: ["domain", "hosting"],
    healthModuleLink: null,
    subtasks: [],
    notes: "",
    isRecurring: false,
    recurringPattern: null,
    order: 0,
    completedAt: null,
    createdAt: new Date().toISOString(),
  },
];

// ============================================================
// HELPERS
// ============================================================

function dueDateLabel(dueDate: string | null) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const fmt = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < 0) return { text: `Overdue \u2014 ${fmt}`, className: "text-red-400" };
  if (diff === 0) return { text: "Today", className: "text-amber-400" };
  if (diff <= 7) return { text: fmt, className: "text-amber-400" };
  return { text: fmt, className: "text-muted-foreground" };
}

function getColumnIcon(name: string) {
  return COLUMN_ICON_MAP[name] || Circle;
}

function getContextIcon(ctx: string) {
  return CONTEXT_ICONS[ctx] || Tag;
}

// ============================================================
// TOAST COMPONENT (minimal inline)
// ============================================================

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium shadow-lg"
    >
      {message}
    </motion.div>
  );
}

// ============================================================
// TASK CARD
// ============================================================

function TaskCard({
  task,
  columns,
  onSelect,
  onComplete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  columns: KanbanColumn[];
  onSelect: () => void;
  onComplete: () => void;
  onMove: (colId: string) => void;
  onDragStart?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const prioConf = PRIORITY_CONFIG[task.priority];
  const due = dueDateLabel(task.dueDate);
  const completedSubs = task.subtasks.filter(s => s.completed).length;
  const totalSubs = task.subtasks.length;
  const isDone = task.status === "done";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group relative rounded-md cursor-grab active:cursor-grabbing transition-shadow duration-150
        bg-card shadow-[0_1px_2px_rgba(0,0,0,0.15)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
    >
      <div className="px-3 py-2.5" onClick={onSelect}>
        {/* Title */}
        <div className="flex items-start gap-2.5">
          <button
            onClick={e => { e.stopPropagation(); onComplete(); }}
            className="mt-[2px] shrink-0"
          >
            {isDone
              ? <CheckCircle2 className="w-4 h-4 text-primary" />
              : <Circle className="w-4 h-4 text-muted-foreground/60 hover:text-primary transition" />
            }
          </button>
          <span className={`text-[13px] leading-relaxed flex-1 ${isDone ? "line-through text-muted-foreground/40" : "text-foreground"}`}>
            {task.title}
          </span>
          {/* Move menu — appears on hover */}
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
              className="p-1 rounded-md hover:bg-secondary/80 text-muted-foreground/0 group-hover:text-muted-foreground/40 hover:!text-foreground transition"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showMoveMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-7 z-30 bg-card border border-border rounded-md shadow-xl py-1 min-w-[150px]"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="px-3 py-1.5 text-[11px] text-muted-foreground/50">Move to...</p>
                  {columns.filter(c => c.id !== task.columnId).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onMove(c.id); setShowMoveMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-secondary/60 transition"
                    >
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
                      {c.title}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Tags row — only show if there's meaningful metadata */}
        {(task.contexts.length > 0 || due || task.priority !== "none" || totalSubs > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-[26px]">
            {/* Priority tag — only if not "none" */}
            {task.priority !== "none" && (
              <span
                className="px-1.5 py-[2px] rounded-sm text-[11px] font-medium"
                style={{ backgroundColor: prioConf.color + "18", color: prioConf.color }}
              >
                {prioConf.label}
              </span>
            )}
            {/* Context tags */}
            {task.contexts.map(ctx => (
              <span
                key={ctx}
                className="px-1.5 py-[2px] rounded-sm text-[11px] text-muted-foreground bg-secondary/80"
              >
                {ctx}
              </span>
            ))}
            {/* Due date */}
            {due && (
              <span className={`text-[11px] ${due.className}`}>{due.text}</span>
            )}
            {/* Subtask progress */}
            {totalSubs > 0 && (
              <span className="text-[11px] text-muted-foreground/50">{completedSubs}/{totalSubs}</span>
            )}
          </div>
        )}

        {/* Waiting info */}
        {task.status === "waiting_for" && task.waitingFor && (
          <p className="text-[11px] text-muted-foreground/50 mt-1.5 pl-[26px] truncate">
            Waiting: {task.waitingFor}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TASK DETAIL PANEL
// ============================================================

// Hoisted out of TaskDetailPanel so its identity doesn't change every render —
// otherwise each keystroke remounts every input inside and you lose focus.
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

function TaskDetailPanel({
  task: initialTask,
  columns,
  availableContexts,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  columns: KanbanColumn[];
  availableContexts: TaskContext[];
  onClose: () => void;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  // Fully local copy — all edits happen here, no parent re-renders while editing
  const [task, setTask] = useState<Task>(initialTask);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newTag, setNewTag] = useState("");

  // Push local changes to parent (used for actions that affect the board: column move, complete, delete)
  const syncToParent = (t: Task) => onUpdate(t);

  // Local update — does NOT trigger parent re-render
  const update = (partial: Partial<Task>) => {
    setTask(prev => ({ ...prev, ...partial }));
  };

  // Sync on close so parent gets all accumulated changes
  const handleClose = () => {
    syncToParent(task);
    onClose();
  };

  const completedSubs = task.subtasks.filter(s => s.completed).length;
  const totalSubs = task.subtasks.length;
  const prioConf = PRIORITY_CONFIG[task.priority];

  const toggleSubtask = (sId: string) => {
    update({ subtasks: task.subtasks.map(s => s.id === sId ? { ...s, completed: !s.completed } : s) });
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    update({ subtasks: [...task.subtasks, { id: crypto.randomUUID(), title: newSubtaskTitle.trim(), completed: false }] });
    setNewSubtaskTitle("");
  };

  const deleteSubtask = (sId: string) => {
    update({ subtasks: task.subtasks.filter(s => s.id !== sId) });
  };

  const addTag = () => {
    if (!newTag.trim() || task.tags.includes(newTag.trim())) return;
    update({ tags: [...task.tags, newTag.trim()] });
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    update({ tags: task.tags.filter(t => t !== tag) });
  };

  const toggleContext = (ctx: TaskContext) => {
    if (task.contexts.includes(ctx)) {
      update({ contexts: task.contexts.filter(c => c !== ctx) });
    } else {
      update({ contexts: [...task.contexts, ctx] });
    }
  };

  const moveToColumn = (colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (col) {
      const updated = { ...task, columnId: colId, status: col.statusMapping as Task["status"] };
      setTask(updated);
      syncToParent(updated);
    }
  };

  const completeTask = () => {
    const updated = { ...task, status: "done" as Task["status"], columnId: "col_done", completedAt: new Date().toISOString() };
    setTask(updated);
    syncToParent(updated);
  };

  // Collapsible section helper
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["clarify", "details", "subtasks"]));
  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: prioConf.color + "20" }}>
          <CheckSquare className="w-5 h-5" style={{ color: prioConf.color }} />
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
              {task.title}
              <Edit3 className="w-3 h-3 inline ml-1.5 opacity-40" />
            </h2>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: prioConf.color + "18", color: prioConf.color }}
            >
              {prioConf.label}
            </span>
            {task.projectId && PROJECT_NAMES[task.projectId] && (
              <span className="text-[10px] text-muted-foreground truncate">{PROJECT_NAMES[task.projectId]}</span>
            )}
          </div>
        </div>
        <button onClick={handleClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Column selector */}
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mr-1">Stage</span>
          {columns.map(c => {
            const active = task.columnId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => moveToColumn(c.id)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  active ? "text-white" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                {c.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Clarify */}
        <CollapsibleSection isOpen={openSections.has("clarify")} onToggle={() => toggleSection("clarify")} icon={Eye} title="Clarify">
          <div className="flex items-center gap-3">
            <label className="text-xs text-foreground">Two-minute task?</label>
            <button
              onClick={() => update({ isTwoMinuteTask: !task.isTwoMinuteTask })}
              className={`w-10 h-5 rounded-full transition-colors relative ${task.isTwoMinuteTask ? "bg-primary" : "bg-secondary"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${task.isTwoMinuteTask ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">What exactly needs to happen?</label>
            <textarea
              value={task.description}
              onChange={e => update({ description: e.target.value })}
              rows={3}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Be specific — what is the very next physical action?"
            />
          </div>
          {task.status === "waiting_for" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Waiting for whom / what?</label>
              <input
                value={task.waitingFor || ""}
                onChange={e => update({ waitingFor: e.target.value || null })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
                placeholder="Person or event you're waiting on..."
              />
            </div>
          )}
        </CollapsibleSection>

        {/* Details */}
        <CollapsibleSection isOpen={openSections.has("details")} onToggle={() => toggleSection("details")} icon={Filter} title="Details">
          {/* Project */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Project</label>
            <select
              value={task.projectId || ""}
              onChange={e => update({ projectId: e.target.value || null })}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
            >
              <option value="">No project</option>
              {Object.entries(PROJECT_NAMES).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Priority</label>
            <div className="flex gap-2 mt-1">
              {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => update({ priority: p })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    task.priority === p ? "text-white" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                  style={task.priority === p ? { backgroundColor: PRIORITY_CONFIG[p].color } : undefined}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Due Date</label>
              <input
                type="date"
                value={task.dueDate || ""}
                onChange={e => update({ dueDate: e.target.value || null })}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Estimated Time</label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {[15, 30, 60, 120].map(m => (
                  <button
                    key={m}
                    onClick={() => update({ estimatedMinutes: task.estimatedMinutes === m ? null : m })}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                      task.estimatedMinutes === m ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Energy */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Energy Required</label>
            <div className="flex gap-2 mt-1">
              {(Object.keys(ENERGY_CONFIG) as EnergyLevel[]).map(e => (
                <button
                  key={e}
                  onClick={() => update({ energyRequired: e })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    task.energyRequired === e ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${ENERGY_CONFIG[e].dot}`} />
                  {ENERGY_CONFIG[e].label}
                </button>
              ))}
            </div>
          </div>

          {/* Contexts */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contexts</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {availableContexts.map(ctx => {
                const CtxIcon = getContextIcon(ctx);
                const active = task.contexts.includes(ctx);
                return (
                  <button
                    key={ctx}
                    onClick={() => toggleContext(ctx)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition ${
                      active ? "text-white" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}
                    style={active ? { backgroundColor: CONTEXT_COLORS[ctx] || "#6b7280" } : undefined}
                  >
                    <CtxIcon className="w-3 h-3" />
                    {ctx}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {task.tags.map(t => (
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
                <button onClick={addTag} className="text-primary hover:text-primary/80 transition"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Health module link */}
        <CollapsibleSection isOpen={openSections.has("health")} onToggle={() => toggleSection("health")} icon={Heart} title="Health Module Link">
          <select
            value={task.healthModuleLink || ""}
            onChange={e => update({ healthModuleLink: (e.target.value || null) as Task["healthModuleLink"] })}
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
          >
            <option value="">None</option>
            <option value="nutrition">Nutrition</option>
            <option value="exercise">Exercise</option>
            <option value="sleep">Sleep</option>
            <option value="health">Health Records</option>
            <option value="body">Body Metrics</option>
            <option value="fasting">Fasting</option>
          </select>
        </CollapsibleSection>

        {/* Subtasks */}
        <CollapsibleSection isOpen={openSections.has("subtasks")} onToggle={() => toggleSection("subtasks")} icon={CheckSquare} title={`Subtasks ${totalSubs > 0 ? `(${completedSubs}/${totalSubs})` : ""}`}>
          {totalSubs > 0 && (
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(completedSubs / totalSubs) * 100}%` }} />
            </div>
          )}
          <div className="space-y-1">
            {task.subtasks.map(s => (
              <div key={s.id} className="flex items-center gap-2 group/s">
                <button onClick={() => toggleSubtask(s.id)} className="shrink-0">
                  {s.completed
                    ? <CheckCircle2 className="w-4 h-4 text-primary" />
                    : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition" />
                  }
                </button>
                <span className={`text-xs flex-1 ${s.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{s.title}</span>
                <button onClick={() => deleteSubtask(s.id)} className="opacity-0 group-hover/s:opacity-100 text-red-400 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={newSubtaskTitle}
              onChange={e => setNewSubtaskTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addSubtask()}
              placeholder="Add subtask..."
              className="flex-1 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none"
            />
            <button onClick={addSubtask} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition">Add</button>
          </div>
        </CollapsibleSection>

        {/* Notes */}
        <CollapsibleSection isOpen={openSections.has("notes")} onToggle={() => toggleSection("notes")} icon={StickyNote} title="Notes">
          <textarea
            value={task.notes}
            onChange={e => update({ notes: e.target.value })}
            rows={4}
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Any additional notes..."
          />
        </CollapsibleSection>

        {/* Recurring */}
        <CollapsibleSection isOpen={openSections.has("recurring")} onToggle={() => toggleSection("recurring")} icon={Repeat} title="Recurring">
          <div className="flex items-center gap-3">
            <label className="text-xs text-foreground">Recurring task?</label>
            <button
              onClick={() => update({ isRecurring: !task.isRecurring, recurringPattern: !task.isRecurring ? "weekly" : null })}
              className={`w-10 h-5 rounded-full transition-colors relative ${task.isRecurring ? "bg-primary" : "bg-secondary"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${task.isRecurring ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {task.isRecurring && (
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => update({ recurringPattern: p })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    task.recurringPattern === p ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Metadata */}
        <div className="px-4 py-3 border-t border-border text-[10px] text-muted-foreground space-y-1">
          <p>Created: {new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          {task.completedAt && <p>Completed: {new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex gap-2 shrink-0">
        {task.status !== "done" && (
          <button
            onClick={completeTask}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
          </button>
        )}
        {task.status === "done" && (
          <button
            onClick={() => {
              const updated = { ...task, status: "next_action" as Task["status"], columnId: "col_next", completedAt: null };
              setTask(updated);
              syncToParent(updated);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-muted-foreground rounded-lg text-xs font-medium hover:bg-secondary/80 transition"
          >
            <Play className="w-3.5 h-3.5" /> Reopen
          </button>
        )}
        <button
          onClick={() => { onDelete(task.id); handleClose(); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================
// INBOX PROCESSING FLOW
// ============================================================

function InboxProcessingFlow({
  tasks,
  columns,
  onUpdate,
  onDelete,
  onClose,
}: {
  tasks: Task[];
  columns: KanbanColumn[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const inboxTasks = tasks.filter(t => t.status === "inbox");
  const total = inboxTasks.length;
  const current = inboxTasks[index];

  if (!current || total === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md text-center"
          onClick={e => e.stopPropagation()}
        >
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Inbox clear!</h3>
          <p className="text-sm text-muted-foreground mb-4">All items have been processed.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">Done</button>
        </motion.div>
      </motion.div>
    );
  }

  const moveAndNext = (colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (col) onUpdate({ ...current, columnId: colId, status: col.statusMapping });
    if (index < total - 1) setIndex(i => i + 1);
    else onClose();
  };

  const deleteAndNext = () => {
    onDelete(current.id);
    if (index >= total - 1) onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Progress */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground">Processing {index + 1} of {total}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="h-1 bg-secondary rounded-full overflow-hidden mb-6">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        {/* Task */}
        <h3 className="text-lg font-semibold text-foreground mb-2">{current.title}</h3>
        {current.description && <p className="text-sm text-muted-foreground mb-4">{current.description}</p>}

        {/* Question 1: Still relevant? */}
        <p className="text-sm font-medium text-foreground mb-3">Is this still relevant?</p>
        <div className="flex gap-2 mb-4">
          <button onClick={deleteAndNext} className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition">
            No \u2014 delete it
          </button>
        </div>

        {/* Question 2: Actionable? Where? */}
        <p className="text-sm font-medium text-foreground mb-3">Yes \u2014 where does it go?</p>
        <div className="grid grid-cols-2 gap-2">
          {columns.filter(c => c.id !== "col_inbox" && c.id !== "col_done").map(c => {
            const ColIcon = getColumnIcon(c.icon);
            return (
              <button
                key={c.id}
                onClick={() => moveAndNext(c.id)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary/50 text-foreground text-xs font-medium hover:bg-secondary transition"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <ColIcon className="w-3.5 h-3.5" style={{ color: c.color }} />
                {c.title}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// WEEKLY REVIEW
// ============================================================

function WeeklyReviewModal({
  tasks,
  columns,
  onUpdate,
  onDelete,
  onAddTask,
  onClose,
}: {
  tasks: Task[];
  columns: KanbanColumn[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onAddTask: (title: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [captureInput, setCaptureInput] = useState("");

  const inboxTasks = tasks.filter(t => t.status === "inbox");
  const nextTasks = tasks.filter(t => t.status === "next_action");
  const waitingTasks = tasks.filter(t => t.status === "waiting_for");
  const somedayTasks = tasks.filter(t => t.status === "someday_maybe");

  const steps = [
    {
      title: "Step 1: Clear loose ends",
      description: "Capture anything still in your head right now.",
      content: (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={captureInput}
              onChange={e => setCaptureInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && captureInput.trim()) { onAddTask(captureInput.trim()); setCaptureInput(""); } }}
              placeholder="What\u2019s on your mind?"
              className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
            />
            <button
              onClick={() => { if (captureInput.trim()) { onAddTask(captureInput.trim()); setCaptureInput(""); } }}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{inboxTasks.length} items in inbox</p>
        </div>
      ),
    },
    {
      title: "Step 2: Review your Inbox",
      description: "Are all inbox items processed?",
      content: (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {inboxTasks.length === 0 ? (
            <p className="text-sm text-emerald-400">Inbox is clear!</p>
          ) : (
            inboxTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30">
                <Inbox className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                <button onClick={() => onDelete(t.id)} className="text-red-400 text-xs">Delete</button>
              </div>
            ))
          )}
        </div>
      ),
    },
    {
      title: "Step 3: Review Next Actions",
      description: "Are these still valid?",
      content: (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {nextTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No next actions.</p>
          ) : (
            nextTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                <button onClick={() => onUpdate({ ...t, status: "done", columnId: "col_done", completedAt: new Date().toISOString() })} className="text-emerald-400 text-xs">Done</button>
                <button onClick={() => onDelete(t.id)} className="text-red-400 text-xs">Delete</button>
              </div>
            ))
          )}
        </div>
      ),
    },
    {
      title: "Step 4: Review Waiting For",
      description: "Any of these need following up?",
      content: (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {waitingTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            waitingTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30">
                <Clock className="w-4 h-4 text-red-400" />
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground">{t.waitingFor}</span>
                <button
                  onClick={() => onAddTask(`Follow up: ${t.title}`)}
                  className="text-amber-400 text-xs"
                >
                  Follow up
                </button>
              </div>
            ))
          )}
        </div>
      ),
    },
    {
      title: "Step 5: Review Someday / Maybe",
      description: "Ready to activate any of these?",
      content: (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {somedayTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No someday items.</p>
          ) : (
            somedayTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30">
                <MoonIcon className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                <button
                  onClick={() => onUpdate({ ...t, status: "next_action", columnId: "col_next" })}
                  className="text-emerald-400 text-xs"
                >
                  Activate
                </button>
              </div>
            ))
          )}
        </div>
      ),
    },
  ];

  const isLast = step >= steps.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Weekly Review</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        <h4 className="text-sm font-semibold text-foreground mb-1">{steps[step].title}</h4>
        <p className="text-xs text-muted-foreground mb-4">{steps[step].description}</p>

        {steps[step].content}

        <div className="flex gap-2 mt-6">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-2 bg-secondary text-foreground rounded-lg text-xs font-medium">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <button
            onClick={() => { if (isLast) { localStorage.setItem("syncvida-last-review", new Date().toISOString()); onClose(); } else setStep(s => s + 1); }}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium ml-auto"
          >
            {isLast ? "Finish Review" : "Next"} {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// COLUMN EDITOR MODAL
// ============================================================

function ColumnEditorModal({
  column,
  onSave,
  onClose,
}: {
  column: KanbanColumn | null;
  onSave: (col: KanbanColumn) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(column?.title || "New Column");
  const [color, setColor] = useState(column?.color || "#1D9E75");
  const [wipLimit, setWipLimit] = useState<number | null>(column?.wipLimit ?? null);
  const [hasWipLimit, setHasWipLimit] = useState(column?.wipLimit !== null && column?.wipLimit !== undefined);

  const save = () => {
    onSave({
      id: column?.id || `col_${crypto.randomUUID().slice(0, 8)}`,
      title,
      color,
      wipLimit: hasWipLimit ? (wipLimit ?? 5) : null,
      order: column?.order ?? 99,
      icon: column?.icon || "Circle",
      isDefault: column?.isDefault || false,
      statusMapping: column?.statusMapping || "inbox",
    });
    onClose();
  };

  const PRESET_COLORS = ["#ef4444","#f97316","#f59e0b","#22c55e","#1D9E75","#06b6d4","#6366f1","#8b5cf6","#ec4899","#6b7280"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground mb-4">{column ? "Edit Column" : "Add Column"}</h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Column Name</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Color</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-foreground">WIP Limit?</label>
            <button
              onClick={() => { setHasWipLimit(!hasWipLimit); if (!hasWipLimit) setWipLimit(5); }}
              className={`w-10 h-5 rounded-full transition-colors relative ${hasWipLimit ? "bg-primary" : "bg-secondary"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${hasWipLimit ? "left-[22px]" : "left-0.5"}`} />
            </button>
            {hasWipLimit && (
              <input
                type="number"
                min={1}
                max={20}
                value={wipLimit ?? 5}
                onChange={e => setWipLimit(parseInt(e.target.value) || null)}
                className="w-16 bg-secondary/50 rounded-lg px-2 py-1 text-sm text-foreground outline-none"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-2 bg-secondary text-foreground rounded-lg text-xs font-medium">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium ml-auto">Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// LIST VIEW
// ============================================================

function TaskListView({
  tasks,
  columns,
  onSelect,
  onComplete,
  onMove,
}: {
  tasks: Task[];
  columns: KanbanColumn[];
  onSelect: (t: Task) => void;
  onComplete: (t: Task) => void;
  onMove: (t: Task, colId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"title" | "priority" | "status" | "dueDate">("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const prioOrder: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "title") cmp = a.title.localeCompare(b.title);
    else if (sortBy === "priority") cmp = prioOrder[a.priority] - prioOrder[b.priority];
    else if (sortBy === "status") cmp = a.status.localeCompare(b.status);
    else if (sortBy === "dueDate") cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortHeader = ({ col, label, className = "" }: { col: typeof sortBy; label: string; className?: string }) => (
    <button onClick={() => toggleSort(col)} className={`flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition ${className}`}>
      {label}
      {sortBy === col && <span>{sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[20px_1fr_70px_80px_80px_70px_60px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/30">
        <span />
        <SortHeader col="title" label="Title" />
        <SortHeader col="priority" label="Priority" />
        <SortHeader col="status" label="Status" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Context</span>
        <SortHeader col="dueDate" label="Due" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Energy</span>
      </div>
      <div className="divide-y divide-border/50 max-h-[calc(100vh-360px)] overflow-y-auto">
        {sorted.map(t => {
          const prioConf = PRIORITY_CONFIG[t.priority];
          const energyConf = ENERGY_CONFIG[t.energyRequired];
          const due = dueDateLabel(t.dueDate);
          const col = columns.find(c => c.id === t.columnId);
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full grid grid-cols-[20px_1fr_70px_80px_80px_70px_60px] gap-3 px-4 py-2.5 hover:bg-secondary/30 transition text-left items-center"
            >
              <button
                onClick={e => { e.stopPropagation(); onComplete(t); }}
                className="shrink-0"
              >
                {t.status === "done"
                  ? <CheckCircle2 className="w-4 h-4 text-primary" />
                  : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition" />
                }
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: prioConf.color }} />
                <span className={`text-sm truncate ${t.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</span>
                {t.projectId && PROJECT_NAMES[t.projectId] && (
                  <span className="text-[10px] text-muted-foreground truncate hidden xl:inline">{PROJECT_NAMES[t.projectId]}</span>
                )}
              </div>
              <span className="text-[10px] font-medium" style={{ color: prioConf.color }}>{prioConf.label}</span>
              {col ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: col.color + "18", color: col.color }}>
                  {col.title}
                </span>
              ) : <span />}
              <div className="flex gap-1 overflow-hidden">
                {t.contexts.slice(0, 2).map(ctx => (
                  <span key={ctx} className="text-[9px] font-medium truncate" style={{ color: CONTEXT_COLORS[ctx] || "#6b7280" }}>{ctx}</span>
                ))}
              </div>
              {due ? <span className={`text-[10px] ${due.className}`}>{due.text}</span> : <span className="text-[10px] text-muted-foreground">-</span>}
              <span className={`w-2 h-2 rounded-full ${energyConf.dot}`} />
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

export default function TasksModule() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [filterContext, setFilterContext] = useState<TaskContext | "all">("all");
  const [filterProject, setFilterProject] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [captureInput, setCaptureInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showInboxProcessing, setShowInboxProcessing] = useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null | "new">(null);
  const [inboxBannerDismissed, setInboxBannerDismissed] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [pinnedContexts, setPinnedContexts] = useState<TaskContext[]>([]);
  const [customContexts, setCustomContexts] = useState<TaskContext[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [newCustomContext, setNewCustomContext] = useState("");
  const captureRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // URL params
  useEffect(() => {
    const pProject = searchParams.get("project");
    const pContext = searchParams.get("context");
    const pColumn = searchParams.get("column");
    if (pProject) setFilterProject(pProject);
    if (pContext) setFilterContext(pContext as TaskContext);
    if (pColumn && boardRef.current) {
      setTimeout(() => {
        const el = document.getElementById(`column-${pColumn}`);
        if (el) el.scrollIntoView({ behavior: "smooth", inline: "start" });
      }, 300);
    }
  }, [searchParams]);

  // Load tasks from Supabase
  useEffect(() => {
    dbGetTasks().then((rows) => {
      if (rows && rows.length > 0) {
        const mapped: Task[] = rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description || "",
          status: r.status || "inbox",
          columnId: r.column_id || "col_inbox",
          projectId: r.project_id || null,
          priority: r.priority || "none",
          contexts: r.contexts || [],
          dueDate: r.due_date || null,
          estimatedMinutes: r.estimated_minutes || null,
          isTwoMinuteTask: r.is_two_minute_task || false,
          waitingFor: r.waiting_for || null,
          energyRequired: r.energy_required || "medium",
          tags: r.tags || [],
          healthModuleLink: r.health_module_link || null,
          subtasks: (typeof r.subtasks === "string" ? JSON.parse(r.subtasks) : r.subtasks) || [],
          notes: r.notes || "",
          isRecurring: r.is_recurring || false,
          recurringPattern: r.recurring_pattern || null,
          order: r.task_order || 0,
          completedAt: r.completed_at || null,
          createdAt: r.created_at || new Date().toISOString(),
        }));
        setTasks(mapped);
      }
      setDbLoaded(true);
    });
  }, []);

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilterPanel) return;
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilterPanel]);

  // All available contexts (built-in + custom)
  const allContexts = useMemo(() => [...ALL_CONTEXTS, ...customContexts], [customContexts]);

  // Global 'C' shortcut to focus capture bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
        e.preventDefault();
        captureRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Computed
  const inboxCount = useMemo(() => tasks.filter(t => t.status === "inbox").length, [tasks]);
  const overdueCount = useMemo(() => tasks.filter(t => {
    if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
    return new Date(t.dueDate) < new Date(new Date().toISOString().split("T")[0]);
  }).length, [tasks]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (filterContext !== "all" && !t.contexts.includes(filterContext)) return false;
    if (filterProject !== "all" && t.projectId !== filterProject) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [tasks, filterContext, filterProject, searchQuery]);

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.order - b.order), [columns]);

  // Actions
  // Helper: convert frontend Task to Supabase row
  const taskToRow = (t: Task) => ({
    title: t.title,
    description: t.description,
    status: t.status,
    column_id: t.columnId,
    project_id: t.projectId || undefined,
    priority: t.priority,
    contexts: t.contexts,
    due_date: t.dueDate || undefined,
    estimated_minutes: t.estimatedMinutes || undefined,
    is_two_minute_task: t.isTwoMinuteTask,
    waiting_for: t.waitingFor || undefined,
    energy_required: t.energyRequired,
    tags: t.tags,
    health_module_link: t.healthModuleLink || undefined,
    subtasks: t.subtasks as any,
    notes: t.notes,
    is_recurring: t.isRecurring,
    recurring_pattern: t.recurringPattern || undefined,
    task_order: t.order,
    completed_at: t.completedAt || undefined,
  });

  const addTaskToInbox = useCallback((title: string) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      description: "",
      status: "inbox",
      columnId: "col_inbox",
      projectId: null,
      priority: "none",
      contexts: [],
      dueDate: null,
      estimatedMinutes: null,
      isTwoMinuteTask: false,
      waitingFor: null,
      energyRequired: "medium",
      tags: [],
      healthModuleLink: null,
      subtasks: [],
      notes: "",
      isRecurring: false,
      recurringPattern: null,
      order: tasks.filter(t => t.columnId === "col_inbox").length,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [...prev, newTask]);
    setToast("Added to Inbox \u2713");
    // Persist to Supabase
    dbCreateTask(taskToRow(newTask)).then(row => {
      if (row) setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, id: row.id } : t));
    });
  }, [tasks]);

  const handleCapture = () => {
    if (!captureInput.trim()) return;
    addTaskToInbox(captureInput.trim());
    setCaptureInput("");
  };

  const updateTask = useCallback((updated: Task) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTask(prev => prev?.id === updated.id ? updated : prev);
    // Persist to Supabase
    dbUpdateTask(updated.id, taskToRow(updated));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
    // Persist to Supabase
    dbDeleteTask(id);
  }, [selectedTask]);

  const completeTask = useCallback((task: Task) => {
    if (task.status === "done") {
      updateTask({ ...task, status: "next_action", columnId: "col_next", completedAt: null });
    } else {
      updateTask({ ...task, status: "done", columnId: "col_done", completedAt: new Date().toISOString() });
    }
  }, [updateTask]);

  const moveTask = useCallback((task: Task, colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (col) updateTask({ ...task, columnId: colId, status: col.statusMapping });
  }, [columns, updateTask]);

  const addTaskToColumn = useCallback((colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: "New task",
      description: "",
      status: col.statusMapping,
      columnId: colId,
      projectId: filterProject !== "all" ? filterProject : null,
      priority: "none",
      contexts: filterContext !== "all" ? [filterContext] : [],
      dueDate: null,
      estimatedMinutes: null,
      isTwoMinuteTask: false,
      waitingFor: null,
      energyRequired: "medium",
      tags: [],
      healthModuleLink: null,
      subtasks: [],
      notes: "",
      isRecurring: false,
      recurringPattern: null,
      order: tasks.filter(t => t.columnId === colId).length,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [...prev, newTask]);
    setSelectedTask(newTask);
    // Persist to Supabase
    dbCreateTask(taskToRow(newTask)).then(row => {
      if (row) {
        setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, id: row.id } : t));
        setSelectedTask(prev => prev?.id === newTask.id ? { ...prev, id: row.id } : prev);
      }
    });
  }, [columns, tasks, filterProject, filterContext]);

  const saveColumn = useCallback((col: KanbanColumn) => {
    setColumns(prev => {
      const exists = prev.find(c => c.id === col.id);
      if (exists) return prev.map(c => c.id === col.id ? col : c);
      return [...prev, { ...col, order: prev.length }];
    });
  }, []);

  const deleteColumn = useCallback((colId: string) => {
    if (columns.length <= 1) return; // must keep at least one column
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    // Find a fallback column — prefer Inbox, then the first remaining column
    const remaining = columns.filter(c => c.id !== colId);
    const fallback = remaining.find(c => c.id === "col_inbox") || remaining[0];
    setTasks(prev => prev.map(t => t.columnId === colId ? { ...t, columnId: fallback.id, status: fallback.statusMapping } : t));
    setColumns(remaining);
  }, [columns]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    // Make the drag ghost semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedTaskId(null);
    setDragOverColId(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColId(colId);
  }, []);

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColId(null);
  }, []);

  const handleColumnDrop = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      const col = columns.find(c => c.id === colId);
      if (col) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, columnId: colId, status: col.statusMapping } : t
        ));
        // Persist to Supabase
        dbUpdateTask(taskId, { column_id: colId, status: col.statusMapping });
      }
    }
    setDraggedTaskId(null);
    setDragOverColId(null);
  }, [columns]);

  // Column empty states
  const emptyStates: Record<string, string> = {
    col_inbox: "Nothing captured yet — press C to add",
    col_next: "No next actions — process your Inbox",
    col_doing: "Nothing in progress — pick a next action",
    col_waiting: "Nothing waiting — good!",
    col_done: "Completed tasks will appear here",
    col_someday: "Park ideas here for future consideration",
  };

  // Active project filter banner
  const projectFilterName = filterProject !== "all" ? (PROJECT_NAMES[filterProject] || filterProject) : null;

  // Weekly review check
  const lastReview = localStorage.getItem("syncvida-last-review");
  const daysSinceReview = lastReview ? Math.floor((Date.now() - new Date(lastReview).getTime()) / 86400000) : 999;
  const showReviewBanner = daysSinceReview > 7 || new Date().getDay() === 0;

  return (
    <div className="p-4 md:px-6 md:py-5 space-y-3">
      {/* TOP BAR — Notion-style: title left, controls right */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">Tasks</h1>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* View tabs — Notion style */}
          {([
            { mode: "kanban" as const, icon: LayoutGrid, label: "Board" },
            { mode: "list" as const, icon: List, label: "List" },
          ] as const).map(v => (
            <button
              key={v.mode}
              onClick={() => setViewMode(v.mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] transition ${
                viewMode === v.mode
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          ))}

          <div className="w-px h-4 bg-border/50 mx-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent rounded-md pl-7 pr-2 py-1 text-[13px] text-foreground outline-none w-28 focus:w-44 focus:bg-secondary/50 transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Project filter */}
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="bg-transparent rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground outline-none cursor-pointer"
          >
            <option value="all">All projects</option>
            <option value="">No project</option>
            {Object.entries(PROJECT_NAMES).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* QUICK CAPTURE — minimal, Notion-style inline */}
      <div className="flex items-center gap-2.5 px-1 py-1">
        <Plus className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <input
          ref={captureRef}
          value={captureInput}
          onChange={e => setCaptureInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCapture()}
          placeholder="Type to add a task..."
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {captureInput && (
          <button
            onClick={handleCapture}
            className="px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-[12px] font-medium hover:bg-primary/90 transition shrink-0"
          >
            Add
          </button>
        )}
      </div>

      {/* Project filter banner — subtle inline */}
      {projectFilterName && (
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="text-[13px] text-muted-foreground">Filtered by:</span>
          <span className="text-[13px] text-foreground font-medium">{projectFilterName}</span>
          <button onClick={() => setFilterProject("all")} className="text-muted-foreground/40 hover:text-foreground transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* INBOX PROCESSING BANNER — minimal */}
      {inboxCount >= 5 && !inboxBannerDismissed && (
        <div className="flex items-center gap-2 px-1 py-1 text-[13px]">
          <span className="text-muted-foreground">{inboxCount} items in Inbox —</span>
          <button
            onClick={() => setShowInboxProcessing(true)}
            className="text-primary hover:underline"
          >
            Process now
          </button>
          <button onClick={() => setInboxBannerDismissed(true)} className="text-muted-foreground/60 hover:text-muted-foreground ml-1 transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* WEEKLY REVIEW BANNER — minimal */}
      {showReviewBanner && (
        <div className="flex items-center gap-2 px-1 py-1 text-[13px]">
          <span className="text-muted-foreground">Weekly review —</span>
          <button
            onClick={() => setShowWeeklyReview(true)}
            className="text-primary hover:underline"
          >
            Start review
          </button>
        </div>
      )}

      {/* FILTER BAR — pinned filters + filter menu */}
      <div className="flex items-center gap-1.5">
        {/* Active context filter indicator — shown when a filter is active */}
        {filterContext !== "all" && (
          <button
            onClick={() => setFilterContext("all")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-white transition"
            style={{ backgroundColor: CONTEXT_COLORS[filterContext] || "#6b7280" }}
          >
            {(() => { const I = getContextIcon(filterContext); return <I className="w-3 h-3" />; })()}
            {filterContext.replace("@", "")}
            <X className="w-3 h-3 opacity-60" />
          </button>
        )}

        {/* Pinned context quick-filters */}
        {pinnedContexts.filter(ctx => ctx !== filterContext).map(ctx => {
          const CtxIcon = getContextIcon(ctx);
          return (
            <button
              key={ctx}
              onClick={() => setFilterContext(ctx)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition"
            >
              <CtxIcon className="w-3 h-3" />
              {ctx.replace("@", "")}
            </button>
          );
        })}

        {/* Filter menu button */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition ${
              showFilterPanel ? "bg-secondary text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            <Filter className="w-3 h-3" />
            <span className="hidden sm:inline">Filters</span>
            {pinnedContexts.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>

          {/* Filter panel popover */}
          <AnimatePresence>
            {showFilterPanel && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-8 z-30 bg-card border border-border rounded-xl shadow-xl w-[280px]"
              >
                <div className="p-3 border-b border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">Context Filters</p>
                  <p className="text-[11px] text-muted-foreground/40">Click to filter. Pin to keep visible.</p>
                </div>

                <div className="p-2 max-h-[300px] overflow-y-auto space-y-0.5">
                  {allContexts.map(ctx => {
                    const CtxIcon = getContextIcon(ctx);
                    const isPinned = pinnedContexts.includes(ctx);
                    const isActive = filterContext === ctx;
                    const isCustom = customContexts.includes(ctx);
                    return (
                      <div
                        key={ctx}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition group/ctx ${
                          isActive ? "bg-secondary" : "hover:bg-secondary/50"
                        }`}
                      >
                        <button
                          onClick={() => setFilterContext(isActive ? "all" : ctx)}
                          className="flex items-center gap-2 flex-1 min-w-0"
                        >
                          <CtxIcon className="w-3.5 h-3.5 shrink-0" style={{ color: CONTEXT_COLORS[ctx] || "#6b7280" }} />
                          <span className={`text-xs truncate ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {ctx}
                          </span>
                          {isActive && <CheckCircle2 className="w-3 h-3 text-primary ml-auto shrink-0" />}
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {/* Pin toggle */}
                          <button
                            onClick={() => {
                              if (isPinned) setPinnedContexts(prev => prev.filter(c => c !== ctx));
                              else setPinnedContexts(prev => [...prev, ctx]);
                            }}
                            className={`p-0.5 rounded transition ${
                              isPinned ? "text-primary" : "text-muted-foreground/50 opacity-0 group-hover/ctx:opacity-100"
                            }`}
                            title={isPinned ? "Unpin from bar" : "Pin to bar"}
                          >
                            <Star className={`w-3 h-3 ${isPinned ? "fill-primary" : ""}`} />
                          </button>
                          {/* Delete custom context */}
                          {isCustom && (
                            <button
                              onClick={() => {
                                setCustomContexts(prev => prev.filter(c => c !== ctx));
                                setPinnedContexts(prev => prev.filter(c => c !== ctx));
                                if (filterContext === ctx) setFilterContext("all");
                              }}
                              className="p-0.5 rounded text-muted-foreground/50 opacity-0 group-hover/ctx:opacity-100 hover:text-red-400 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add custom context */}
                <div className="p-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <input
                      value={newCustomContext}
                      onChange={e => setNewCustomContext(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newCustomContext.trim()) {
                          const val = newCustomContext.trim().startsWith("@") ? newCustomContext.trim() : `@${newCustomContext.trim()}`;
                          if (!allContexts.includes(val)) {
                            setCustomContexts(prev => [...prev, val]);
                            setNewCustomContext("");
                          }
                        }
                      }}
                      placeholder="Create custom filter..."
                      className="flex-1 bg-secondary/50 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <button
                      onClick={() => {
                        if (newCustomContext.trim()) {
                          const val = newCustomContext.trim().startsWith("@") ? newCustomContext.trim() : `@${newCustomContext.trim()}`;
                          if (!allContexts.includes(val)) {
                            setCustomContexts(prev => [...prev, val]);
                            setNewCustomContext("");
                          }
                        }
                      }}
                      className="px-2.5 py-1.5 bg-primary/10 text-primary rounded-md text-xs font-medium hover:bg-primary/20 transition"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Clear all */}
                {filterContext !== "all" && (
                  <div className="px-2 pb-2">
                    <button
                      onClick={() => { setFilterContext("all"); setShowFilterPanel(false); }}
                      className="w-full py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition"
                    >
                      Clear filter
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* KANBAN BOARD — Notion-style: flat, clean, no heavy borders */}
      {viewMode === "kanban" && (
        <div ref={boardRef}>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${sortedColumns.length}, minmax(0, 1fr))`,
            }}
          >
            {sortedColumns.map(col => {
              const colTasks = filteredTasks.filter(t => t.columnId === col.id).sort((a, b) => a.order - b.order);
              const wipExceeded = col.wipLimit !== null && colTasks.length > col.wipLimit;

              return (
                <div
                  key={col.id}
                  id={`column-${col.id}`}
                  className="flex flex-col min-w-0"
                >
                  {/* Column header — Notion-style: colored pill + count */}
                  <div className="flex items-center gap-2 px-1 mb-2.5 group/colhdr">
                    <span
                      className="px-2 py-[2px] rounded-sm text-[12px] font-semibold tracking-wide uppercase"
                      style={{ backgroundColor: col.color + "20", color: col.color }}
                    >
                      {col.title}
                    </span>
                    <span className="text-[13px] text-muted-foreground/60 font-light">
                      {colTasks.length}
                      {col.wipLimit !== null && (
                        <span className={wipExceeded ? " text-red-400" : ""}> / {col.wipLimit}</span>
                      )}
                    </span>

                    {/* Menu — hidden until hover */}
                    <div className="relative ml-auto opacity-0 group-hover/colhdr:opacity-100 transition">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => addTaskToColumn(col.id)}
                          className="p-0.5 rounded hover:bg-secondary/60 text-muted-foreground/40 hover:text-foreground transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <div className="relative group/menu">
                          <button className="p-0.5 rounded hover:bg-secondary/60 text-muted-foreground/40 hover:text-foreground transition">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute right-0 top-6 hidden group-hover/menu:block bg-card border border-border rounded-md shadow-xl py-1 min-w-[130px] z-20">
                            <button
                              onClick={() => setEditingColumn(col)}
                              className="w-full text-left px-3 py-1.5 text-[13px] text-foreground hover:bg-secondary/60 transition"
                            >
                              Edit column
                            </button>
                            {columns.length > 1 && (
                              <button
                                onClick={() => deleteColumn(col.id)}
                                className="w-full text-left px-3 py-1.5 text-[13px] text-red-400 hover:bg-secondary/60 transition"
                              >
                                Delete column
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column body — drop zone */}
                  <div
                    className={`flex-1 space-y-1.5 overflow-y-auto pr-0.5 rounded-lg transition-colors duration-150 ${
                      dragOverColId === col.id ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
                    }`}
                    style={{ maxHeight: "calc(100vh - 280px)", minHeight: 60 }}
                    onDragOver={e => handleColumnDragOver(e, col.id)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={e => handleColumnDrop(e, col.id)}
                  >
                    {colTasks.length === 0 && !dragOverColId ? (
                      <p className="text-[13px] text-muted-foreground/50 py-8 px-1">
                        {emptyStates[col.id] || "No tasks"}
                      </p>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {colTasks.map(t => (
                          <TaskCard
                            key={t.id}
                            task={t}
                            columns={columns}
                            onSelect={() => setSelectedTask(t)}
                            onComplete={() => completeTask(t)}
                            onMove={colId => moveTask(t, colId)}
                            onDragStart={e => handleDragStart(e, t.id)}
                            onDragEnd={handleDragEnd}
                          />
                        ))}
                      </AnimatePresence>
                    )}
                    {/* Drop hint when dragging over empty area */}
                    {dragOverColId === col.id && colTasks.length === 0 && (
                      <div className="py-6 text-center text-[13px] text-primary/60">Drop here</div>
                    )}
                    {/* New page button */}
                    <button
                      onClick={() => addTaskToColumn(col.id)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/40 transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> New
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add group button — Notion style */}
            <div className="flex flex-col min-w-0">
              <button
                onClick={() => setEditingColumn("new")}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-muted-foreground/60 hover:text-muted-foreground/60 hover:bg-secondary/30 transition"
              >
                <Plus className="w-3.5 h-3.5" /> New group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <TaskListView
          tasks={filteredTasks}
          columns={columns}
          onSelect={setSelectedTask}
          onComplete={completeTask}
          onMove={moveTask}
        />
      )}

      {/* TASK DETAIL PANEL */}
      <AnimatePresence>
        {selectedTask && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSelectedTask(null)}
            />
            <TaskDetailPanel
              task={selectedTask}
              columns={columns}
              availableContexts={allContexts}
              onClose={() => setSelectedTask(null)}
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
          </>
        )}
      </AnimatePresence>

      {/* INBOX PROCESSING */}
      <AnimatePresence>
        {showInboxProcessing && (
          <InboxProcessingFlow
            tasks={tasks}
            columns={columns}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onClose={() => setShowInboxProcessing(false)}
          />
        )}
      </AnimatePresence>

      {/* WEEKLY REVIEW */}
      <AnimatePresence>
        {showWeeklyReview && (
          <WeeklyReviewModal
            tasks={tasks}
            columns={columns}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onAddTask={addTaskToInbox}
            onClose={() => setShowWeeklyReview(false)}
          />
        )}
      </AnimatePresence>

      {/* COLUMN EDITOR */}
      <AnimatePresence>
        {editingColumn && (
          <ColumnEditorModal
            column={editingColumn === "new" ? null : editingColumn}
            onSave={saveColumn}
            onClose={() => setEditingColumn(null)}
          />
        )}
      </AnimatePresence>

      {/* TOAST */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
