import { useState, useEffect } from "react";
import { Scale, TrendingDown, TrendingUp, Calendar, Sun, Clock, Sunset, Moon, ArrowRight, Target, Edit3, Save, X } from "lucide-react";
import { EGYM_DATA } from "@/lib/health-data";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { getWeightHistory, getAppliedBloodTestRecords, getProfile, updateProfile } from "@/lib/supabase-queries";
import type { BloodTest, HealthMarker } from "@/lib/health-data";
import { onSync } from "@/lib/sync-events";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  Area, ComposedChart, Dot,
} from "recharts";
import LogWeightModal from "@/components/modals/LogWeightModal";
import { Link } from "react-router-dom";

const bodyCompData = [
  { label: "BMR", value: `${EGYM_DATA.bodyComposition.bmr} kcal` },
  { label: "Body Fat", value: `${EGYM_DATA.bodyComposition.bodyFatKg}kg (${EGYM_DATA.bodyComposition.bodyFatPct}%)` },
  { label: "Fat-Free Mass", value: `${EGYM_DATA.bodyComposition.fatFreeMassKg}kg` },
  { label: "Muscle Mass", value: `${EGYM_DATA.bodyComposition.muscleMassKg}kg` },
  { label: "Body Water", value: `${EGYM_DATA.bodyComposition.bodyWaterL}L` },
  { label: "Body Protein", value: `${EGYM_DATA.bodyComposition.bodyProteinKg}kg` },
  { label: "Visceral Fat", value: `Level ${EGYM_DATA.bodyComposition.visceralFatLevel}` },
  { label: "Waist-to-Hip", value: `${EGYM_DATA.bodyComposition.waistToHipRatio}` },
];

type TimeOfDay = "Morning" | "Midday" | "Evening" | "Night" | "Unknown";

function getTimeOfDay(loggedAt: string, notes: string | null): TimeOfDay {
  // Try to get from notes first (more reliable since we store it there)
  if (notes) {
    const lower = notes.toLowerCase();
    if (lower.startsWith("morning")) return "Morning";
    if (lower.startsWith("midday")) return "Midday";
    if (lower.startsWith("evening")) return "Evening";
    if (lower.startsWith("night")) return "Night";
  }
  // Fallback to hour
  const h = new Date(loggedAt).getHours();
  if (h < 12) return "Morning";
  if (h < 15) return "Midday";
  if (h < 20) return "Evening";
  return "Night";
}

const timeIcon: Record<TimeOfDay, typeof Sun> = {
  Morning: Sun, Midday: Clock, Evening: Sunset, Night: Moon, Unknown: Clock,
};

const timeColor: Record<TimeOfDay, string> = {
  Morning: "text-warning", Midday: "text-blue-400", Evening: "text-orange-400", Night: "text-indigo-400", Unknown: "text-muted-foreground",
};

interface WeightEntry {
  date: string;
  fullDate: string;
  weight: number;
  bmi: number;
  waist: number | null;
  timeOfDay: TimeOfDay;
  notes: string | null;
  isProjection?: boolean;
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (payload.isProjection) {
    return <Dot cx={cx} cy={cy} r={5} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="3 3" />;
  }
  const colors: Record<TimeOfDay, string> = {
    Morning: "#f59e0b", Midday: "#60a5fa", Evening: "#f97316", Night: "#818cf8", Unknown: "#6b7280",
  };
  return <Dot cx={cx} cy={cy} r={5} fill={colors[payload.timeOfDay] || "#6b7280"} stroke="hsl(var(--card))" strokeWidth={2} />;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as WeightEntry;
  const Icon = timeIcon[d.timeOfDay];
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <div className="font-semibold text-foreground flex items-center gap-2">
        {d.isProjection ? <Target className="w-3.5 h-3.5 text-primary" /> : <Icon className={`w-3.5 h-3.5 ${timeColor[d.timeOfDay]}`} />}
        {d.date} {d.isProjection ? "(Projected)" : `— ${d.timeOfDay}`}
      </div>
      <div className="text-foreground"><strong>{d.weight}kg</strong> <span className="text-muted-foreground text-xs">BMI {d.bmi}</span></div>
      {d.waist && <div className="text-xs text-muted-foreground">Waist: {d.waist}cm</div>}
      {d.notes && !d.isProjection && <div className="text-xs text-muted-foreground italic">{d.notes}</div>}
    </div>
  );
}

export default function BodyMetrics() {
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [bodyView, setBodyView] = useState<"main" | "history" | "profile">("main");
  const [latestBmi, setLatestBmi] = useState<number | null>(null);
  const [profileHeight, setProfileHeight] = useState(170);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [targetWeightM1, setTargetWeightM1] = useState<number | null>(null);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [bloodTests, setBloodTests] = useState<BloodTest[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  // Edit form state
  const [editHeight, setEditHeight] = useState(170);
  const [editStartWeight, setEditStartWeight] = useState(0);
  const [editTargetFinal, setEditTargetFinal] = useState(0);
  const [editTargetM1, setEditTargetM1] = useState(0);

  // Load profile data
  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile) {
        const p = profile as any;
        if (p.height_cm) { setProfileHeight(p.height_cm); setEditHeight(p.height_cm); }
        if (p.target_weight_final_kg) { setTargetWeight(Number(p.target_weight_final_kg)); setEditTargetFinal(Number(p.target_weight_final_kg)); }
        if (p.target_weight_m1_kg) { setTargetWeightM1(Number(p.target_weight_m1_kg)); setEditTargetM1(Number(p.target_weight_m1_kg)); }
        if (p.starting_weight_kg) { setStartingWeight(Number(p.starting_weight_kg)); setEditStartWeight(Number(p.starting_weight_kg)); }
      }
      // Load blood tests from DB
      const records = await getAppliedBloodTestRecords();
      const tests: BloodTest[] = records.map((r: any) => ({
        id: r.id, date: r.test_date, source: r.source,
        weightKg: Number(r.weight_kg) || 0, bmi: Number(r.bmi) || 0,
        markers: (Array.isArray(r.markers) ? r.markers : []).map((m: any) => ({
          testName: m.testName, value: Number(m.value), unit: m.unit,
          referenceMin: m.referenceMin != null ? Number(m.referenceMin) : undefined,
          referenceMax: m.referenceMax != null ? Number(m.referenceMax) : undefined,
          status: m.status || "normal", category: m.category || "Other",
        })),
      }));
      setBloodTests(tests);
    })();
  }, []);

  const heightM = profileHeight / 100;
  const goalWeight = targetWeight ?? 78;
  const startWeight = startingWeight ?? 0;

  const loadWeights = async () => {
    const history = await getWeightHistory();
    const mapped: WeightEntry[] = history.map((w) => {
      const tod = getTimeOfDay(w.logged_at || "", w.notes);
      return {
        date: new Date(w.logged_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        fullDate: w.logged_at!,
        weight: Number(w.weight_kg),
        bmi: Number(w.bmi ?? (Number(w.weight_kg) / (heightM * heightM)).toFixed(1)),
        waist: w.waist_cm ? Number(w.waist_cm) : null,
        timeOfDay: tod,
        notes: w.notes,
      };
    });

    // Add projection line to goal
    if (mapped.length > 0 && goalWeight > 0) {
      const latest = mapped[mapped.length - 1];
      const weeksToGoal = (latest.weight - goalWeight) / 0.5;
      if (weeksToGoal > 0 && weeksToGoal < 52) {
        const projDate = new Date();
        projDate.setDate(projDate.getDate() + weeksToGoal * 7);
        mapped.push({
          date: projDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          fullDate: projDate.toISOString(),
          weight: goalWeight,
          bmi: parseFloat((goalWeight / (heightM * heightM)).toFixed(1)),
          waist: null,
          timeOfDay: "Unknown",
          notes: null,
          isProjection: true,
        });
      }
      setLatestBmi(latest.bmi);
    }
    setWeightData(mapped);
  };

  useEffect(() => { loadWeights(); }, [profileHeight, targetWeight]);
  useEffect(() => onSync("weight:logged", loadWeights), []);

  const realEntries = weightData.filter((w) => !w.isProjection);
  const latestWeight = realEntries.length > 0 ? realEntries[realEntries.length - 1].weight : startWeight;
  const firstWeight = realEntries.length > 0 ? realEntries[0].weight : startWeight;
  const totalChange = latestWeight - firstWeight;
  const toGoal = goalWeight > 0 ? latestWeight - goalWeight : 0;
  const progressPct = startWeight > goalWeight ? Math.max(0, Math.min(100, ((startWeight - latestWeight) / (startWeight - goalWeight)) * 100)) : 0;

  // Stats cards
  const stats = [
    {
      label: "Current",
      value: `${latestWeight}kg`,
      sub: `BMI ${latestBmi?.toFixed(1) ?? "—"}`,
      color: latestWeight > 88 ? "text-destructive" : latestWeight <= 84 ? "text-success" : "text-warning",
    },
    {
      label: "Change",
      value: `${totalChange > 0 ? "+" : ""}${totalChange.toFixed(1)}kg`,
      sub: `since ${realEntries[0]?.date ?? "start"}`,
      color: totalChange > 0 ? "text-destructive" : totalChange < 0 ? "text-success" : "text-muted-foreground",
    },
    {
      label: "To Goal",
      value: `${toGoal.toFixed(1)}kg`,
      sub: "to reach 78kg",
      color: toGoal > 5 ? "text-destructive" : toGoal > 0 ? "text-warning" : "text-success",
    },
    {
      label: "Entries",
      value: `${realEntries.length}`,
      sub: "weigh-ins",
      color: "text-foreground",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Body Metrics</h1>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {realEntries.length > 0 && bodyView === "main" && (
            <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-start">
              <Calendar className="w-3 h-3" /> Last: {realEntries[realEntries.length - 1].date}
            </span>
          )}
          {bodyView !== "main" ? (
            <button
              onClick={() => setBodyView("main")}
              className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium transition w-full sm:w-auto"
            >
              Back
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={() => setBodyView("history")}
                className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium transition flex-1 sm:flex-none text-center justify-center"
              >
                Weigh-ins
              </button>
              <button
                onClick={() => setBodyView("profile")}
                className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium transition flex items-center justify-center gap-1 flex-1 sm:flex-none"
              >
                <Edit3 className="w-3 h-3" /> Edit Goals
              </button>
              <button onClick={() => setModalOpen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-dark transition flex items-center justify-center gap-1 w-full sm:w-auto">
                <Scale className="w-3.5 h-3.5" /> Log Weight
              </button>
            </div>
          )}
        </div>
      </div>

      {bodyView === "history" ? (
        /* ── Weigh-in History View ── */
        <div className="glass-card rounded-xl overflow-hidden">
          {realEntries.length > 0 ? (
            <div className="divide-y divide-border/50">
              {[...realEntries].reverse().map((entry, i) => {
                const Icon = timeIcon[entry.timeOfDay];
                const prev = i < realEntries.length - 1 ? [...realEntries].reverse()[i + 1] : null;
                const diff = prev ? entry.weight - prev.weight : null;
                return (
                  <div key={entry.fullDate} className="flex items-center justify-between py-3 px-5 hover:bg-accent/20 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-secondary">
                        <Icon className={`w-4 h-4 ${timeColor[entry.timeOfDay]}`} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{entry.weight}kg</div>
                        <div className="text-[11px] text-muted-foreground">{entry.date} · {entry.timeOfDay}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.waist && <span className="text-xs text-muted-foreground">{entry.waist}cm waist</span>}
                      <span className="text-xs text-muted-foreground">BMI {entry.bmi}</span>
                      {diff !== null && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${diff > 0 ? "text-destructive" : diff < 0 ? "text-success" : "text-muted-foreground"}`}>
                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <Scale className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No weigh-ins logged yet</p>
            </div>
          )}
        </div>
      ) : bodyView === "profile" ? (
        /* ── Body Profile Editor ── */
        <div className="glass-card rounded-xl p-5 space-y-5">
          <h3 className="font-display font-semibold text-foreground">Body Profile & Goals</h3>
          <p className="text-xs text-muted-foreground">Edit your body details and weight goals. Changes are saved to your profile.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Height */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Height (cm)</label>
              <input
                type="number"
                value={editHeight}
                onChange={e => setEditHeight(Number(e.target.value))}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>

            {/* Starting Weight */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Starting Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={editStartWeight}
                onChange={e => setEditStartWeight(Number(e.target.value))}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>

            {/* Month 1 Target */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Month 1 Target (kg)</label>
              <input
                type="number"
                step="0.1"
                value={editTargetM1}
                onChange={e => setEditTargetM1(Number(e.target.value))}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Short-term milestone</p>
            </div>

            {/* Final Goal */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Final Goal Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={editTargetFinal}
                onChange={e => setEditTargetFinal(Number(e.target.value))}
                className="mt-1 w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/40"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Long-term target weight</p>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-secondary/30 p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">Preview</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
              <div>
                <div className="text-muted-foreground">Height</div>
                <div className="font-semibold text-foreground">{editHeight} cm</div>
              </div>
              <div>
                <div className="text-muted-foreground">Start</div>
                <div className="font-semibold text-foreground">{editStartWeight} kg</div>
              </div>
              <div>
                <div className="text-muted-foreground">M1 Target</div>
                <div className="font-semibold text-warning">{editTargetM1} kg</div>
              </div>
              <div>
                <div className="text-muted-foreground">Final Goal</div>
                <div className="font-semibold text-primary">{editTargetFinal} kg</div>
              </div>
            </div>
            {editStartWeight > 0 && editTargetFinal > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Total to lose: <span className="text-foreground font-medium">{(editStartWeight - editTargetFinal).toFixed(1)} kg</span>
                {latestWeight > 0 && <> — Remaining: <span className="text-foreground font-medium">{(latestWeight - editTargetFinal).toFixed(1)} kg</span></>}
              </p>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setProfileSaving(true);
                await updateProfile({
                  height_cm: editHeight,
                  starting_weight_kg: editStartWeight,
                  target_weight_m1_kg: editTargetM1,
                  target_weight_final_kg: editTargetFinal,
                });
                setProfileHeight(editHeight);
                setStartingWeight(editStartWeight);
                setTargetWeight(editTargetFinal);
                setTargetWeightM1(editTargetM1);
                setProfileSaving(false);
                setBodyView("main");
              }}
              disabled={profileSaving}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-dark transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {profileSaving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
            <button
              onClick={() => setBodyView("main")}
              className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-sm font-medium hover:text-foreground transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (<>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-lg font-display font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress to Goal */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground">Goal Progress</h3>
          <span className="text-xs text-muted-foreground">88kg → 78kg</span>
        </div>
        <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${
              progressPct >= 100 ? "bg-gradient-to-r from-success to-primary" :
              progressPct >= 50 ? "bg-gradient-to-r from-warning to-primary" :
              "bg-gradient-to-r from-destructive to-warning"
            }`}
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>88kg (start)</span>
          <span className="font-medium text-primary">{progressPct.toFixed(0)}%</span>
          <span>78kg (goal)</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Month 1 target: 84kg</span>
          <span className={`font-medium ${latestWeight <= 84 ? "text-success" : "text-warning"}`}>
            {latestWeight <= 84 ? "Reached!" : `${(latestWeight - 84).toFixed(1)}kg to go`}
          </span>
        </div>
      </div>

      {/* Weight Chart */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-semibold text-foreground">Weight Journey</h3>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-warning" /> AM</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" /> Mid</span>
            <span className="flex items-center gap-1"><Sunset className="w-3 h-3 text-orange-400" /> PM</span>
            <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> Night</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {latestWeight}kg → Target: 78kg · Dot color = time of day
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={weightData}>
              <defs>
                <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[75, "auto"]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={78} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: "Goal: 78kg", fill: "hsl(var(--primary))", fontSize: 10 }} />
              <ReferenceLine y={84} stroke="hsl(var(--warning))" strokeDasharray="3 3" label={{ value: "M1: 84kg", fill: "hsl(var(--warning))", fontSize: 10 }} />
              <Area type="monotone" dataKey="weight" fill="url(#weightFill)" stroke="none" />
              <Line type="monotone" dataKey="weight" stroke="hsl(var(--destructive))" strokeWidth={2} dot={<CustomDot />} activeDot={{ r: 7, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BMI Cross-reference with Health Records */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-foreground">BMI Across Blood Tests</h3>
          <Link to="/health" className="text-xs text-primary flex items-center gap-1 hover:underline">View records <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <div className="space-y-2">
          {[...bloodTests].reverse().map((bt) => (
            <div key={bt.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <div className="text-sm text-foreground">{new Date(bt.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                <div className="text-[10px] text-muted-foreground">{bt.source}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground">{bt.weightKg}kg</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  bt.bmi >= 30 ? "bg-destructive/10 text-destructive" :
                  bt.bmi >= 25 ? "bg-warning/10 text-warning" :
                  "bg-success/10 text-success"
                }`}>
                  BMI {bt.bmi}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body Composition */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-3">Body Composition (EGYM Jan 2026)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bodyCompData.map((item) => (
            <div key={item.label} className="p-3 bg-secondary/50 rounded-lg">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="text-sm font-semibold text-foreground mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      </>)}
      <LogWeightModal open={modalOpen} onClose={() => setModalOpen(false)} onLogged={loadWeights} />
    </div>
  );
}
