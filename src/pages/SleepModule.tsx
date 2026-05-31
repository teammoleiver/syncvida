import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  Moon, Sun, Clock, Coffee, Utensils, Monitor, Thermometer,
  ChevronDown, ChevronUp, Check, X, Plus, Minus, Star,
  AlertTriangle, Brain, Dumbbell, Weight, Activity, Heart,
  BookOpen,
} from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { toast } from "@/hooks/use-toast";
import { getSleepLogs, saveSleepLog } from "@/lib/supabase-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SleepLog {
  id: string;
  date: string;
  bedtime: string;
  wakeTime: string;
  totalHours: number;
  quality: number;
  wakeUps: number;
  notes: string;
  lateEating: boolean;
  exerciseToday: boolean;
  screenBeforeBed: boolean;
  caffeineAfter2pm: boolean;
  stressLevel: number;
  morningFeeling: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Sample data – 7 days
// ---------------------------------------------------------------------------
const SAMPLE_SLEEP_LOGS: SleepLog[] = [
  { id: "sl_1", date: daysAgo(6), bedtime: "23:30", wakeTime: "07:00", totalHours: 7.5, quality: 3, wakeUps: 2, notes: "Woke up around 3am", lateEating: true, exerciseToday: true, screenBeforeBed: true, caffeineAfter2pm: false, stressLevel: 3, morningFeeling: 3 },
  { id: "sl_2", date: daysAgo(5), bedtime: "00:15", wakeTime: "07:30", totalHours: 7.25, quality: 2, wakeUps: 3, notes: "Stayed up late working", lateEating: true, exerciseToday: false, screenBeforeBed: true, caffeineAfter2pm: true, stressLevel: 4, morningFeeling: 2 },
  { id: "sl_3", date: daysAgo(4), bedtime: "23:00", wakeTime: "07:00", totalHours: 8.0, quality: 4, wakeUps: 1, notes: "Good sleep — trained in morning", lateEating: false, exerciseToday: true, screenBeforeBed: false, caffeineAfter2pm: false, stressLevel: 2, morningFeeling: 4 },
  { id: "sl_4", date: daysAgo(3), bedtime: "23:45", wakeTime: "06:45", totalHours: 7.0, quality: 3, wakeUps: 2, notes: "", lateEating: false, exerciseToday: true, screenBeforeBed: true, caffeineAfter2pm: false, stressLevel: 3, morningFeeling: 3 },
  { id: "sl_5", date: daysAgo(2), bedtime: "22:45", wakeTime: "07:00", totalHours: 8.25, quality: 5, wakeUps: 0, notes: "Best sleep in weeks", lateEating: false, exerciseToday: true, screenBeforeBed: false, caffeineAfter2pm: false, stressLevel: 1, morningFeeling: 5 },
  { id: "sl_6", date: daysAgo(1), bedtime: "00:00", wakeTime: "07:15", totalHours: 7.25, quality: 2, wakeUps: 3, notes: "Weekend — stayed up later", lateEating: true, exerciseToday: false, screenBeforeBed: true, caffeineAfter2pm: true, stressLevel: 2, morningFeeling: 2 },
  { id: "sl_7", date: daysAgo(0), bedtime: "23:15", wakeTime: "07:00", totalHours: 7.75, quality: 3, wakeUps: 1, notes: "", lateEating: false, exerciseToday: true, screenBeforeBed: false, caffeineAfter2pm: false, stressLevel: 2, morningFeeling: 3 },
];

// ---------------------------------------------------------------------------
// Sleep score calculation
// ---------------------------------------------------------------------------
function calculateSleepScore(logs: SleepLog[]): number {
  if (logs.length === 0) return 0;
  const avgHours = logs.reduce((s, l) => s + l.totalHours, 0) / logs.length;
  const hoursScore = Math.min(30, avgHours >= 8 ? 30 : avgHours >= 7.5 ? 25 : avgHours >= 7 ? 18 : avgHours >= 6 ? 6 : 2);
  const avgQuality = logs.reduce((s, l) => s + l.quality, 0) / logs.length;
  const qualityScore = Math.round((avgQuality / 5) * 25);
  const bedtimeMins = logs.map(l => {
    const [h, m] = l.bedtime.split(":").map(Number);
    return (h < 12 ? h + 24 : h) * 60 + m;
  });
  const avgBt = bedtimeMins.reduce((s, m) => s + m, 0) / bedtimeMins.length;
  const variance = Math.sqrt(bedtimeMins.reduce((s, m) => s + Math.pow(m - avgBt, 2), 0) / bedtimeMins.length);
  const consistencyScore = Math.max(0, 20 - Math.round(variance / 5));
  const total = logs.length;
  const noScreen = logs.filter(l => !l.screenBeforeBed).length;
  const noLateEat = logs.filter(l => !l.lateEating).length;
  const noCaff = logs.filter(l => !l.caffeineAfter2pm).length;
  const complianceScore = Math.round(((noScreen + noLateEat + noCaff) / (total * 3)) * 25);
  return Math.min(100, hoursScore + qualityScore + consistencyScore + complianceScore);
}

// ---------------------------------------------------------------------------
// Tonight's targets helpers
// ---------------------------------------------------------------------------
interface TargetTime {
  label: string;
  hour: number;
  minute: number;
  icon: React.ReactNode;
}

const TONIGHT_TARGETS: TargetTime[] = [
  { label: "Eating stops", hour: 20, minute: 0, icon: <Utensils size={16} /> },
  { label: "Screen-free from", hour: 22, minute: 0, icon: <Monitor size={16} /> },
  { label: "Bedtime", hour: 23, minute: 0, icon: <Moon size={16} /> },
  { label: "Wake time", hour: 7, minute: 0, icon: <Sun size={16} /> },
];

function getCountdownText(target: TargetTime, now: Date): { text: string; status: "green" | "amber" | "red" } {
  const todayTarget = new Date(now);
  todayTarget.setHours(target.hour, target.minute, 0, 0);

  // Wake time is next morning
  if (target.hour < 12) {
    todayTarget.setDate(todayTarget.getDate() + 1);
  }

  const diffMs = todayTarget.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin <= 0) {
    if (target.label === "Eating stops") return { text: "CLOSED", status: "red" };
    if (target.label === "Screen-free from") return { text: "ACTIVE", status: "green" };
    if (target.label === "Bedtime") return { text: "Time for bed!", status: "red" };
    return { text: `${target.hour.toString().padStart(2, "0")}:${target.minute.toString().padStart(2, "0")}`, status: "green" };
  }

  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const text = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  if (diffMin <= 60) return { text, status: "amber" };
  return { text, status: "green" };
}

// ---------------------------------------------------------------------------
// Factor analysis
// ---------------------------------------------------------------------------
interface FactorResult {
  label: string;
  withAvg: number;
  withoutAvg: number;
  diff: number;
  positive: boolean;
  icon: React.ReactNode;
}

function analyzeFactors(logs: SleepLog[]): FactorResult[] {
  const factors: { key: keyof SleepLog; label: string; invert: boolean; icon: React.ReactNode }[] = [
    { key: "exerciseToday", label: "Exercise during the day", invert: false, icon: <Dumbbell size={16} /> },
    { key: "screenBeforeBed", label: "Screen before bed", invert: true, icon: <Monitor size={16} /> },
    { key: "lateEating", label: "Late eating (after 8pm)", invert: true, icon: <Utensils size={16} /> },
    { key: "caffeineAfter2pm", label: "Caffeine after 2pm", invert: true, icon: <Coffee size={16} /> },
  ];

  return factors.map(f => {
    const withFactor = logs.filter(l => l[f.key] === true);
    const withoutFactor = logs.filter(l => l[f.key] === false);
    const withAvg = withFactor.length > 0 ? withFactor.reduce((s, l) => s + l.quality, 0) / withFactor.length : 0;
    const withoutAvg = withoutFactor.length > 0 ? withoutFactor.reduce((s, l) => s + l.quality, 0) / withoutFactor.length : 0;
    const diff = f.invert ? withoutAvg - withAvg : withAvg - withoutAvg;
    return {
      label: f.label,
      withAvg: Math.round(withAvg * 10) / 10,
      withoutAvg: Math.round(withoutAvg * 10) / 10,
      diff: Math.round(diff * 10) / 10,
      positive: !f.invert,
      icon: f.icon,
    };
  });
}

// ---------------------------------------------------------------------------
// Walker insights data
// ---------------------------------------------------------------------------
const WALKER_INSIGHTS = [
  {
    id: 1,
    title: "Poor sleep doubles liver stress",
    category: "liver",
    critical: true,
    color: "hsl(var(--destructive))",
    bgClass: "bg-destructive/10",
    icon: <Activity size={20} />,
    content: "Sleep deprivation elevates ALT levels and increases liver inflammation. Studies show a 40% higher risk of fatty liver disease with chronic short sleep. Your elevated ALT of 68 U/L may be directly connected to sleep quality.",
    quote: "\"The shorter your sleep, the shorter your life. The leading causes of disease and death in developed nations all have recognized causal links to a lack of sleep.\" — Matthew Walker",
    action: "Prioritize 8 hours to give your liver recovery time.",
  },
  {
    id: 2,
    title: "Sleep drives your BioAge gap",
    category: "bioage",
    critical: true,
    color: "hsl(var(--warning))",
    bgClass: "bg-warning/10",
    icon: <Clock size={20} />,
    content: "Your biological age gap of 15 years is strongly influenced by sleep quality. During deep sleep, cellular repair mechanisms activate and inflammatory markers decrease. Poor sleep accelerates epigenetic aging.",
    quote: "\"Sleep is the single most effective thing we can do to reset our brain and body health each day.\" — Matthew Walker",
    action: "Consistent 11pm-7am schedule to maximize deep sleep phases.",
  },
  {
    id: 3,
    title: "Gym results depend on sleep",
    category: "muscle",
    critical: true,
    color: "hsl(var(--primary))",
    bgClass: "bg-primary/10",
    icon: <Dumbbell size={20} />,
    content: "70% of human growth hormone (HGH) is released during deep sleep. With only 6 hours of sleep, muscle protein synthesis drops by 19%. Your gym progress is capped by your sleep quality.",
    quote: "\"Sleep is the greatest legal performance-enhancing drug that most people are probably neglecting.\" — Matthew Walker",
    action: "Sleep 8 hours on training days — non-negotiable for muscle growth.",
  },
  {
    id: 4,
    title: "Sleep deprivation blocks weight loss",
    category: "weight",
    critical: true,
    color: "hsl(var(--success))",
    bgClass: "bg-success/10",
    icon: <Weight size={20} />,
    content: "Sleep-deprived individuals show a 24% increase in ghrelin (hunger hormone) and a significant decrease in leptin (satiety hormone). This makes calorie control nearly impossible regardless of willpower.",
    quote: "\"When sleep was lacking, the weights lost came from lean body mass, not fat.\" — Matthew Walker",
    action: "Fix sleep before optimizing diet — hormones must cooperate.",
  },
];

// ---------------------------------------------------------------------------
// Sleep rules
// ---------------------------------------------------------------------------
interface SleepRule {
  id: number;
  title: string;
  description: string;
  defaultChecked: boolean;
  icon: React.ReactNode;
}

const SLEEP_RULES: SleepRule[] = [
  { id: 1, title: "Consistent schedule (11pm-7am)", description: "Go to bed and wake up at the same time every day, including weekends. This anchors your circadian rhythm and improves sleep efficiency over time.", defaultChecked: false, icon: <Clock size={16} /> },
  { id: 2, title: "No screens 60min before bed", description: "Blue light from screens suppresses melatonin production by up to 50%. Use the last hour for reading, stretching, or journaling instead.", defaultChecked: false, icon: <Monitor size={16} /> },
  { id: 3, title: "Stop eating at 8pm", description: "Late meals force digestion during sleep, raising core body temperature and fragmenting deep sleep stages. Allow 3 hours between last meal and bedtime.", defaultChecked: true, icon: <Utensils size={16} /> },
  { id: 4, title: "No caffeine after 2pm", description: "Caffeine has a half-life of 5-7 hours. A coffee at 3pm still has 50% of its caffeine circulating at 9pm, enough to block adenosine receptors and delay sleep onset.", defaultChecked: false, icon: <Coffee size={16} /> },
  { id: 5, title: "Cool bedroom 18-19\u00B0C", description: "Your core body temperature needs to drop 1\u00B0C to initiate sleep. A cool room facilitates this. Walker calls bedroom temperature the most underappreciated sleep aid.", defaultChecked: false, icon: <Thermometer size={16} /> },
  { id: 6, title: "Morning sunlight 30min after waking", description: "Bright morning light resets your suprachiasmatic nucleus (master clock) and triggers cortisol release at the right time, which improves both alertness and evening melatonin production.", defaultChecked: false, icon: <Sun size={16} /> },
  { id: 7, title: "Zero alcohol", description: "Alcohol is a sedative, not a sleep aid. It fragments sleep architecture, blocks REM sleep, and causes micro-awakenings you may not even remember. Even one drink measurably impairs sleep quality.", defaultChecked: true, icon: <AlertTriangle size={16} /> },
  { id: 8, title: "Exercise by 7pm", description: "Regular exercise improves deep sleep duration by up to 25%, but exercising too close to bedtime raises core temperature and adrenaline. Finish intense workouts at least 4 hours before sleep.", defaultChecked: false, icon: <Dumbbell size={16} /> },
];

// ---------------------------------------------------------------------------
// Walker facts
// ---------------------------------------------------------------------------
const WALKER_FACTS = [
  { stat: "70%", label: "Growth hormone released in deep sleep", relevance: "Your gym gains happen while you sleep, not in the gym." },
  { stat: "24%", label: "Hunger increase from poor sleep", relevance: "Ghrelin spikes make calorie control almost impossible." },
  { stat: "700", label: "Genes altered after 1 week of 6hr nights", relevance: "Including genes linked to inflammation and tumor growth." },
  { stat: "40%", label: "Higher fatty liver risk with sleep deprivation", relevance: "Directly relevant to your elevated ALT of 68 U/L." },
  { stat: "60%", label: "REM sleep lost cutting 8 to 6 hours", relevance: "REM is disproportionately in the last 2 hours of sleep." },
  { stat: "19%", label: "Muscle synthesis reduction (6 vs 8 hours)", relevance: "Sleep-deprived training is partially wasted effort." },
];

// ---------------------------------------------------------------------------
// Morning feeling emojis
// ---------------------------------------------------------------------------
const MORNING_EMOJIS = [
  { value: 1, emoji: "\uD83D\uDE2B" },
  { value: 2, emoji: "\uD83D\uDE15" },
  { value: 3, emoji: "\uD83D\uDE10" },
  { value: 4, emoji: "\uD83D\uDE42" },
  { value: 5, emoji: "\uD83D\uDE04" },
];

function getMorningEmoji(value: number): string {
  return MORNING_EMOJIS.find(e => e.value === value)?.emoji ?? "\uD83D\uDE10";
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

// ---------------------------------------------------------------------------
// Custom Tooltip for chart
// ---------------------------------------------------------------------------
function SleepChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="glass-card p-3 text-sm space-y-1">
      <p className="font-semibold text-foreground">{data.fullDate}</p>
      <p className="text-foreground">Hours: <span className="font-medium">{data.totalHours}h</span></p>
      <p className="text-foreground">Quality: <span className="font-medium">{data.quality}/5</span></p>
      <p className="text-foreground">Wake-ups: <span className="font-medium">{data.wakeUps}</span></p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SleepModule() {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [logs, setLogs] = useState<SleepLog[]>(SAMPLE_SLEEP_LOGS);
  const [now, setNow] = useState(new Date());
  const [sleepMode, setSleepMode] = useState<"off" | "countdown" | "sleeping">("off");
  const [sleepStartedAt, setSleepStartedAt] = useState<Date | null>(null);
  const [countdownSec, setCountdownSec] = useState(600); // 10 minutes = 600s
  const [dbLoaded, setDbLoaded] = useState(false);
  const [rulesChecked, setRulesChecked] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    SLEEP_RULES.forEach(r => { init[r.id] = r.defaultChecked; });
    return init;
  });
  const [expandedRule, setExpandedRule] = useState<number | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [sleepView, setSleepView] = useState<"main" | "history">("main");

  // Form state
  const [formDate, setFormDate] = useState(daysAgo(0));
  const [formBedtime, setFormBedtime] = useState("23:00");
  const [formWakeTime, setFormWakeTime] = useState("07:00");
  const [formQuality, setFormQuality] = useState(3);
  const [formMorningFeeling, setFormMorningFeeling] = useState(3);
  const [formWakeUps, setFormWakeUps] = useState(0);
  const [formLateEating, setFormLateEating] = useState(false);
  const [formScreen, setFormScreen] = useState(false);
  const [formCaffeine, setFormCaffeine] = useState(false);
  const [formExercise, setFormExercise] = useState(false);
  const [formStress, setFormStress] = useState(2);
  const [formNotes, setFormNotes] = useState("");

  // -----------------------------------------------------------------------
  // Countdown timer – updates every 30s
  // -----------------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load sleep logs from Supabase
  useEffect(() => {
    getSleepLogs(30).then((dbLogs) => {
      if (dbLogs.length > 0) {
        const mapped: SleepLog[] = dbLogs.map((r: any) => ({
          id: r.id,
          date: r.date,
          bedtime: r.bedtime?.slice(0, 5) || "23:00",
          wakeTime: r.wake_time?.slice(0, 5) || "07:00",
          totalHours: Number(r.total_hours) || 0,
          quality: r.quality || 3,
          wakeUps: r.wake_ups || 0,
          notes: r.notes || "",
          lateEating: r.late_eating || false,
          exerciseToday: r.exercise_today || false,
          screenBeforeBed: r.screen_before_bed || false,
          caffeineAfter2pm: r.caffeine_after_2pm || false,
          stressLevel: r.stress_level || 2,
          morningFeeling: r.morning_feeling || 3,
        }));
        setLogs(mapped);
      }
      setDbLoaded(true);
    }).catch(() => setDbLoaded(true));
  }, []);

  // Restore sleep mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ht-sleep-mode");
    if (saved) {
      try {
        const { mode, startedAt } = JSON.parse(saved);
        if (mode === "sleeping" && startedAt) {
          setSleepMode("sleeping");
          setSleepStartedAt(new Date(startedAt));
        }
      } catch {}
    }
  }, []);

  // Sleep countdown timer
  useEffect(() => {
    if (sleepMode !== "countdown") return;
    if (countdownSec <= 0) {
      // Countdown finished → enter sleeping mode
      setSleepMode("sleeping");
      const sleepTime = new Date();
      setSleepStartedAt(sleepTime);
      localStorage.setItem("ht-sleep-mode", JSON.stringify({ mode: "sleeping", startedAt: sleepTime.toISOString() }));
      toast({ title: "Good night!", description: "Sleep tracking started. See you in the morning." });
      return;
    }
    const id = setTimeout(() => setCountdownSec((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [sleepMode, countdownSec]);

  const handleGoingToSleep = () => {
    setSleepMode("countdown");
    setCountdownSec(600); // 10 minutes
    toast({ title: "Getting ready for bed", description: "Sleep will start in 10 minutes. Put your phone away!" });
  };

  // Wake-up review modal state
  const [showWakeReview, setShowWakeReview] = useState(false);
  const [wakeReviewData, setWakeReviewData] = useState<{ bedtimeStr: string; wakeTimeStr: string; totalHours: number; dateStr: string } | null>(null);
  const [wkQuality, setWkQuality] = useState(3);
  const [wkFeeling, setWkFeeling] = useState(3);
  const [wkWakeUps, setWkWakeUps] = useState(0);
  const [wkStress, setWkStress] = useState(2);
  const [wkNotes, setWkNotes] = useState("");
  const [wkSaving, setWkSaving] = useState(false);

  const handleStopSleep = () => {
    // Stop from countdown or sleeping → open review modal
    const wakeTime = new Date();
    const startTime = sleepMode === "sleeping" && sleepStartedAt ? sleepStartedAt : new Date();
    const totalMs = wakeTime.getTime() - startTime.getTime();
    const totalHours = parseFloat(Math.max(0, totalMs / 3600000).toFixed(2));
    const bedtimeStr = `${startTime.getHours().toString().padStart(2, "0")}:${startTime.getMinutes().toString().padStart(2, "0")}`;
    const wakeTimeStr = `${wakeTime.getHours().toString().padStart(2, "0")}:${wakeTime.getMinutes().toString().padStart(2, "0")}`;
    const dateStr = startTime.toISOString().split("T")[0];

    setWakeReviewData({ bedtimeStr, wakeTimeStr, totalHours, dateStr });
    setWkQuality(3);
    setWkFeeling(3);
    setWkWakeUps(0);
    setWkStress(2);
    setWkNotes("");
    setShowWakeReview(true);
  };

  const handleSubmitWakeReview = async () => {
    if (!wakeReviewData) return;
    setWkSaving(true);
    const { bedtimeStr, wakeTimeStr, totalHours, dateStr } = wakeReviewData;

    await saveSleepLog({
      date: dateStr,
      bedtime: bedtimeStr,
      wake_time: wakeTimeStr,
      total_hours: totalHours,
      quality: wkQuality,
      wake_ups: wkWakeUps,
      notes: wkNotes,
      late_eating: false,
      exercise_today: false,
      screen_before_bed: false,
      caffeine_after_2pm: false,
      stress_level: wkStress,
      morning_feeling: wkFeeling,
    });

    const newLog: SleepLog = {
      id: `sl_${Date.now()}`,
      date: dateStr,
      bedtime: bedtimeStr,
      wakeTime: wakeTimeStr,
      totalHours,
      quality: wkQuality,
      wakeUps: wkWakeUps,
      notes: wkNotes,
      lateEating: false,
      exerciseToday: false,
      screenBeforeBed: false,
      caffeineAfter2pm: false,
      stressLevel: wkStress,
      morningFeeling: wkFeeling,
    };
    setLogs((prev) => [newLog, ...prev.filter((l) => l.date !== dateStr)]);

    setSleepMode("off");
    setSleepStartedAt(null);
    setCountdownSec(600);
    localStorage.removeItem("ht-sleep-mode");
    setShowWakeReview(false);
    setWakeReviewData(null);
    setWkSaving(false);
    toast({ title: "Good morning! Sleep logged.", description: `${totalHours.toFixed(1)} hours (${bedtimeStr} → ${wakeTimeStr}) · Quality ${wkQuality}/5` });
  };

  // -----------------------------------------------------------------------
  // Computed values
  // -----------------------------------------------------------------------
  const sleepScore = useMemo(() => calculateSleepScore(logs), [logs]);
  const avgHours = useMemo(() => logs.length ? Math.round((logs.reduce((s, l) => s + l.totalHours, 0) / logs.length) * 10) / 10 : 0, [logs]);
  const avgQuality = useMemo(() => logs.length ? Math.round((logs.reduce((s, l) => s + l.quality, 0) / logs.length) * 10) / 10 : 0, [logs]);

  const bedtimeVariance = useMemo(() => {
    if (logs.length === 0) return 0;
    const mins = logs.map(l => {
      const [h, m] = l.bedtime.split(":").map(Number);
      return (h < 12 ? h + 24 : h) * 60 + m;
    });
    const avg = mins.reduce((s, m) => s + m, 0) / mins.length;
    return Math.round(Math.sqrt(mins.reduce((s, m) => s + Math.pow(m - avg, 2), 0) / mins.length));
  }, [logs]);

  const scoreColor = sleepScore > 75 ? "hsl(var(--success))" : sleepScore > 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  const chartData = useMemo(() => logs.map(l => ({
    day: shortDay(l.date),
    fullDate: formatDate(l.date),
    totalHours: l.totalHours,
    quality: l.quality,
    qualityScaled: l.quality * 1.5,
    wakeUps: l.wakeUps,
  })), [logs]);

  const factors = useMemo(() => analyzeFactors(logs), [logs]);

  const radarData = useMemo(() => {
    const base = sleepScore / 100;
    return [
      { axis: "Liver", value: Math.round(base * 90) },
      { axis: "BioAge", value: Math.round(base * 85) },
      { axis: "Muscle", value: Math.round(base * 80) },
      { axis: "Weight", value: Math.round(base * 75) },
      { axis: "Fasting", value: Math.round(base * 70) },
      { axis: "Brain", value: Math.round(base * 95) },
    ];
  }, [sleepScore]);

  // -----------------------------------------------------------------------
  // Form submit
  // -----------------------------------------------------------------------
  async function handleLogSleep() {
    const [bh, bm] = formBedtime.split(":").map(Number);
    const [wh, wm] = formWakeTime.split(":").map(Number);
    let hours = wh - bh + (wm - bm) / 60;
    if (hours < 0) hours += 24;
    const totalHours = Math.round(hours * 100) / 100;

    // Save to Supabase
    await saveSleepLog({
      date: formDate,
      bedtime: formBedtime,
      wake_time: formWakeTime,
      total_hours: totalHours,
      quality: formQuality,
      wake_ups: formWakeUps,
      notes: formNotes,
      late_eating: formLateEating,
      exercise_today: formExercise,
      screen_before_bed: formScreen,
      caffeine_after_2pm: formCaffeine,
      stress_level: formStress,
      morning_feeling: formMorningFeeling,
    });

    const newLog: SleepLog = {
      id: `sl_${Date.now()}`,
      date: formDate,
      bedtime: formBedtime,
      wakeTime: formWakeTime,
      totalHours,
      quality: formQuality,
      wakeUps: formWakeUps,
      notes: formNotes,
      lateEating: formLateEating,
      exerciseToday: formExercise,
      screenBeforeBed: formScreen,
      caffeineAfter2pm: formCaffeine,
      stressLevel: formStress,
      morningFeeling: formMorningFeeling,
    };

    setLogs(prev => [newLog, ...prev.filter(l => l.date !== formDate)]);
    setShowLogForm(false);
    setFormQuality(3);
    setFormMorningFeeling(3);
    setFormWakeUps(0);
    setFormLateEating(false);
    setFormScreen(false);
    setFormCaffeine(false);
    setFormExercise(false);
    setFormStress(2);
    setFormNotes("");

    toast({ title: "Sleep logged & saved", description: `${totalHours}h recorded for ${formatDate(formDate)}` });
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  let sectionIndex = 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* ================================================================= */}
      {/* 1. HEADER + SLEEP SCORE */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Moon size={24} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Sleep Analytics</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
              <BookOpen size={12} />
              Why We Sleep
            </span>
            <button
              onClick={() => setSleepView(sleepView === "main" ? "history" : "main")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${sleepView === "history" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {sleepView === "history" ? "Back" : "Sleep History"}
            </button>
          </div>
        </div>

        {sleepView === "main" && (
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 mt-6">
            <ProgressRing progress={sleepScore} size={140} strokeWidth={10} color={scoreColor}>
              <div className="text-center">
                <span className="text-3xl font-bold text-foreground">{sleepScore}</span>
                <p className="text-xs text-muted-foreground">Sleep Score</p>
              </div>
            </ProgressRing>

            <div className="flex-1 grid grid-cols-3 gap-2 sm:gap-4 w-full">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{avgHours}h</p>
                <p className="text-xs text-muted-foreground">Avg Hours</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{avgQuality}/5</p>
                <p className="text-xs text-muted-foreground">Avg Quality</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{"\u00B1"}{bedtimeVariance}m</p>
                <p className="text-xs text-muted-foreground">Bedtime Variance</p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {sleepView === "main" && (<>
      {/* ================================================================= */}
      {/* 2. TONIGHT'S TARGETS */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-5"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock size={18} className="text-primary" />
          Tonight's Targets
        </h2>
        <div className="space-y-3">
          {TONIGHT_TARGETS.map(target => {
            const { text, status } = getCountdownText(target, now);
            const statusColor = status === "green" ? "text-green-500" : status === "amber" ? "text-amber-500" : "text-red-500";
            const bgColor = status === "green" ? "bg-success/10" : status === "amber" ? "bg-warning/10" : "bg-destructive/10";
            return (
              <div key={target.label} className={`flex items-center justify-between p-3 rounded-lg ${bgColor}`}>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{target.icon}</span>
                  <span className="text-sm font-medium text-foreground">{target.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {target.hour.toString().padStart(2, "0")}:{target.minute.toString().padStart(2, "0")}
                  </span>
                  <span className={`text-sm font-bold ${statusColor}`}>{text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* SLEEP TIMER BUTTON                                               */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="wait">
          {sleepMode === "off" && (
            <motion.button
              key="go-to-sleep"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={handleGoingToSleep}
              className="w-full py-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-display font-bold text-lg flex items-center justify-center gap-3 hover:opacity-90 transition shadow-lg shadow-indigo-500/20"
            >
              <Moon size={24} /> Going to Sleep
            </motion.button>
          )}

          {sleepMode === "countdown" && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-900 to-purple-900 border-2 border-indigo-500/30 p-6 text-center space-y-3"
            >
              <p className="text-indigo-300 text-sm">Sleep starts in...</p>
              <div className="text-5xl font-display font-bold text-white">
                {Math.floor(countdownSec / 60)}:{(countdownSec % 60).toString().padStart(2, "0")}
              </div>
              <p className="text-indigo-400 text-xs">Put your phone down. Relax. Breathe slowly.</p>
              <div className="relative h-2 bg-indigo-800 rounded-full overflow-hidden mt-3">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-indigo-400"
                  initial={false}
                  animate={{ width: `${((600 - countdownSec) / 600) * 100}%` }}
                />
              </div>
              <button
                onClick={handleStopSleep}
                className="text-xs text-indigo-400 hover:text-white transition mt-2 px-4 py-1.5 rounded-lg bg-indigo-800 hover:bg-indigo-700"
              >
                Stop
              </button>
            </motion.div>
          )}

          {sleepMode === "sleeping" && (
            <motion.div
              key="sleeping"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-900 to-slate-900 border-2 border-indigo-500/20 p-6 text-center space-y-3"
            >
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Moon size={32} className="text-indigo-400 mx-auto" />
              </motion.div>
              <p className="text-indigo-300 text-sm">Sleeping since {sleepStartedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
              <div className="text-3xl font-display font-bold text-white">
                {sleepStartedAt ? (() => {
                  const elapsed = Math.floor((now.getTime() - sleepStartedAt.getTime()) / 1000);
                  const h = Math.floor(elapsed / 3600);
                  const m = Math.floor((elapsed % 3600) / 60);
                  return `${h}h ${m}m`;
                })() : "—"}
              </div>
              <p className="text-indigo-400/70 text-[10px]">Tap when you wake up to log your sleep</p>
              <button
                onClick={handleStopSleep}
                className="mt-2 px-6 py-3 rounded-xl bg-amber-500 text-amber-950 font-bold text-sm hover:bg-amber-400 transition flex items-center justify-center gap-2 mx-auto"
              >
                <Sun size={18} /> I'm Awake
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ================================================================= */}
      {/* 3. 7-DAY SLEEP CHART */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-5"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">7-Day Sleep Trend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<SleepChartTooltip />} />
              <ReferenceLine y={8} stroke="hsl(var(--success))" strokeDasharray="6 3" label={{ value: "Target", fill: "hsl(var(--success))", fontSize: 11 }} />
              <ReferenceLine y={7} stroke="hsl(var(--destructive))" strokeDasharray="6 3" label={{ value: "Minimum", fill: "hsl(var(--destructive))", fontSize: 11 }} />
              <Line type="monotone" dataKey="totalHours" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4 }} name="Hours" />
              <Line type="monotone" dataKey="qualityScaled" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 4 }} name="Quality (scaled)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center p-3 rounded-lg bg-secondary">
            <p className="text-lg font-bold text-foreground">{avgHours}h</p>
            <p className="text-xs text-muted-foreground">Average Hours</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary">
            <p className="text-lg font-bold text-foreground">{avgQuality}/5</p>
            <p className="text-xs text-muted-foreground">Average Quality</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary">
            <p className="text-lg font-bold text-foreground">{"\u00B1"}{bedtimeVariance}m</p>
            <p className="text-xs text-muted-foreground">Bedtime Variance</p>
          </div>
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 4. SLEEP QUALITY FACTORS */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-5"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Sleep Quality Factors</h2>
        <div className="space-y-3">
          {factors.map(f => {
            const isGood = f.diff > 0;
            return (
              <div key={f.label} className={`flex items-center justify-between p-3 rounded-lg ${isGood ? "bg-success/10" : "bg-destructive/10"}`}>
                <div className="flex items-center gap-3">
                  {isGood ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <X size={16} className="text-red-500" />
                  )}
                  <span className="text-muted-foreground">{f.icon}</span>
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${isGood ? "text-green-500" : "text-red-500"}`}>
                    {isGood ? "+" : ""}{f.diff} quality
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {f.positive
                      ? `With: ${f.withAvg} / Without: ${f.withoutAvg}`
                      : `Without: ${f.withoutAvg} / With: ${f.withAvg}`
                    }
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 5. WALKER INSIGHTS (horizontal scroll) */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain size={18} className="text-primary" />
          Walker Insights
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
          {WALKER_INSIGHTS.map(insight => (
            <div
              key={insight.id}
              className={`glass-card p-5 min-w-[320px] max-w-[360px] flex-shrink-0 border-l-4`}
              style={{ borderLeftColor: insight.color }}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`${insight.bgClass} p-2 rounded-lg`} style={{ color: insight.color }}>
                  {insight.icon}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-red-500 font-medium">
                  CRITICAL
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground mt-3 mb-2">{insight.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{insight.content}</p>
              <p className="text-xs italic text-muted-foreground mb-3">{insight.quote}</p>
              <div className="flex items-center gap-2 mt-auto">
                <Star size={12} className="text-primary" />
                <p className="text-xs font-medium text-primary">{insight.action}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 6. SLEEP RULES CHECKLIST */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-5"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Sleep Rules Checklist</h2>
        <div className="space-y-2">
          {SLEEP_RULES.map(rule => {
            const checked = rulesChecked[rule.id] ?? false;
            const expanded = expandedRule === rule.id;
            return (
              <div key={rule.id} className="rounded-lg bg-secondary/50">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center">{rule.id}</span>
                    <span className="text-muted-foreground">{rule.icon}</span>
                    <span className={`text-sm font-medium ${checked ? "text-green-500" : "text-foreground"}`}>
                      {rule.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedRule(expanded ? null : rule.id)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground"
                    >
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => setRulesChecked(prev => ({ ...prev, [rule.id]: !prev[rule.id] }))}
                      className={`w-8 h-5 rounded-full transition-colors flex items-center ${
                        checked ? "bg-green-500 justify-end" : "bg-secondary justify-start"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full mx-0.5 transition-colors ${
                        checked ? "bg-white" : "bg-muted-foreground/40"
                      }`} />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed ml-8">
                        {rule.description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 7. WALKER FACTS GRID */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Key Sleep Facts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {WALKER_FACTS.map((fact, idx) => (
            <div key={idx} className="glass-card p-4">
              <p className="text-3xl font-bold text-primary mb-1">{fact.stat}</p>
              <p className="text-sm font-medium text-foreground mb-1">{fact.label}</p>
              <p className="text-xs text-muted-foreground">{fact.relevance}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 8. SLEEP-HEALTH CONNECTIONS (Radar Chart) */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card p-5"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Heart size={18} className="text-primary" />
          Sleep-Health Connections
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--muted-foreground))" strokeOpacity={0.2} />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Radar
                name="Impact"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* ================================================================= */}
      {/* 9. LOG SLEEP FORM */}
      {/* ================================================================= */}
      <motion.div
        custom={sectionIndex++}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="glass-card overflow-hidden"
      >
        <button
          onClick={() => setShowLogForm(prev => !prev)}
          className="w-full p-5 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Moon size={18} className="text-primary" />
            <span className="text-lg font-semibold text-foreground">Log Tonight's Sleep</span>
          </div>
          {showLogForm ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {showLogForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-4">
                {/* Date */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full p-2 rounded-lg bg-secondary text-foreground text-sm border-none outline-none"
                  />
                </div>

                {/* Bedtime & Wake time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Bedtime</label>
                    <input
                      type="time"
                      value={formBedtime}
                      onChange={e => setFormBedtime(e.target.value)}
                      className="w-full p-2 rounded-lg bg-secondary text-foreground text-sm border-none outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Wake Time</label>
                    <input
                      type="time"
                      value={formWakeTime}
                      onChange={e => setFormWakeTime(e.target.value)}
                      className="w-full p-2 rounded-lg bg-secondary text-foreground text-sm border-none outline-none"
                    />
                  </div>
                </div>

                {/* Quality stars */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Sleep Quality</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        onClick={() => setFormQuality(v)}
                        className={`text-2xl transition-colors ${v <= formQuality ? "text-amber-400" : "text-muted-foreground/30"}`}
                      >
                        {"\u2605"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Morning feeling */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Morning Feeling</label>
                  <div className="flex gap-2">
                    {MORNING_EMOJIS.map(e => (
                      <button
                        key={e.value}
                        onClick={() => setFormMorningFeeling(e.value)}
                        className={`text-2xl p-1 rounded-lg transition-all ${
                          formMorningFeeling === e.value ? "bg-primary/20 scale-110" : "opacity-50 hover:opacity-80"
                        }`}
                      >
                        {e.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wake-ups */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Wake-ups</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setFormWakeUps(Math.max(0, formWakeUps - 1))}
                      className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-lg font-bold text-foreground w-8 text-center">{formWakeUps}</span>
                    <button
                      onClick={() => setFormWakeUps(Math.min(5, formWakeUps + 1))}
                      className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Late eating", value: formLateEating, setter: setFormLateEating },
                    { label: "Screen before bed", value: formScreen, setter: setFormScreen },
                    { label: "Caffeine after 2pm", value: formCaffeine, setter: setFormCaffeine },
                    { label: "Exercised today", value: formExercise, setter: setFormExercise },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={() => item.setter(!item.value)}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm text-left transition-colors ${
                        item.value ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                        item.value ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}>
                        {item.value && <Check size={10} className="text-white" />}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Stress level */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Stress Level</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        onClick={() => setFormStress(v)}
                        className={`w-8 h-8 rounded-full text-sm font-bold transition-all ${
                          v <= formStress
                            ? v <= 2 ? "bg-green-500 text-white" : v <= 3 ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="How was your sleep?"
                    rows={2}
                    className="w-full p-2 rounded-lg bg-secondary text-foreground text-sm border-none outline-none resize-none placeholder:text-muted-foreground/50"
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleLogSleep}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Log Sleep
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      </>)}

      {sleepView === "history" && (
        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Sleep History</h2>
          <div className="overflow-y-auto space-y-2">
            {[...logs]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(log => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-foreground font-medium w-20">{formatDate(log.date)}</span>
                    <span className="text-muted-foreground">
                      {log.bedtime} → {log.wakeTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-foreground font-medium">{log.totalHours}h</span>
                    <span className="text-amber-400 text-xs tracking-wide">
                      {Array.from({ length: 5 }, (_, i) => i < log.quality ? "\u2605" : "\u2606").join("")}
                    </span>
                    <span className="text-base">{getMorningEmoji(log.morningFeeling)}</span>
                    <span className="text-muted-foreground text-xs w-16 text-right">
                      {log.wakeUps === 0 ? "No wakes" : `${log.wakeUps} wake${log.wakeUps > 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* WAKE-UP REVIEW MODAL                                              */}
      {/* ================================================================= */}
      <AnimatePresence>
        {showWakeReview && wakeReviewData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center mb-5">
                <Sun size={32} className="text-amber-500 mx-auto mb-2" />
                <h3 className="font-display font-bold text-foreground text-lg">Good Morning!</h3>
                <p className="text-sm text-muted-foreground mt-1">How was your sleep?</p>
              </div>

              {/* Sleep summary */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 mb-5">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Bedtime</p>
                  <p className="text-sm font-bold text-foreground">{wakeReviewData.bedtimeStr}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Wake</p>
                  <p className="text-sm font-bold text-foreground">{wakeReviewData.wakeTimeStr}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="text-sm font-bold text-primary">{wakeReviewData.totalHours.toFixed(1)}h</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Sleep Quality */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Sleep Quality</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(v => (
                      <button key={v} onClick={() => setWkQuality(v)} className="text-2xl transition-transform hover:scale-110">
                        {v <= wkQuality ? "★" : "☆"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Morning Feeling */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">How do you feel?</label>
                  <div className="flex gap-3">
                    {["😫","😕","😐","🙂","😄"].map((emoji, i) => (
                      <button
                        key={i}
                        onClick={() => setWkFeeling(i + 1)}
                        className={`text-2xl p-1.5 rounded-lg transition-all ${wkFeeling === i + 1 ? "bg-primary/20 scale-110 ring-2 ring-primary/30" : "hover:bg-accent"}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wake-ups */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Times woke up during the night</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setWkWakeUps(Math.max(0, wkWakeUps - 1))} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-accent"><Minus size={14} /></button>
                    <span className="text-lg font-bold text-foreground w-6 text-center">{wkWakeUps}</span>
                    <button onClick={() => setWkWakeUps(Math.min(10, wkWakeUps + 1))} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-accent"><Plus size={14} /></button>
                  </div>
                </div>

                {/* Stress Level */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Stress level</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(v => (
                      <button
                        key={v}
                        onClick={() => setWkStress(v)}
                        className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${v <= wkStress ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes / Dreams */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Notes, dreams, or thoughts</label>
                  <textarea
                    value={wkNotes}
                    onChange={(e) => setWkNotes(e.target.value)}
                    placeholder="Any dreams? How do you feel? Anything on your mind..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmitWakeReview}
                disabled={wkSaving}
                className="w-full mt-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {wkSaving ? "Saving..." : <><Check size={16} /> Log Sleep</>}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
