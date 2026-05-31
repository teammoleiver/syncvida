import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Droplets, Utensils, Dumbbell, Scale,
  TrendingUp, TrendingDown, ArrowRight, Heart, Timer, Plus, Check,
} from "lucide-react";
import { onSync } from "@/lib/sync-events";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  BLOOD_TESTS, KEY_TRENDS, getHealthScore,
  getFastingStatus, getMotivationalMessage, computeKeyTrends,
  type BloodTest, type KeyTrend,
} from "@/lib/health-data";
import {
  getTodayWaterLog, getTodayMeals, getTodayExercise, getLatestWeight,
  getTodayChecklist, upsertChecklist, getAppliedBloodTestRecords, getProfile,
} from "@/lib/supabase-queries";
import { resolveAvatarUrl } from "@/lib/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import LogWaterModal from "@/components/modals/LogWaterModal";
import LogWeightModal from "@/components/modals/LogWeightModal";
import LogExerciseModal from "@/components/modals/LogExerciseModal";
import LogMealModal from "@/components/modals/LogMealModal";
import HealthInsights from "@/components/HealthInsights";

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return time;
}

type ChecklistKey = "water_goal_met" | "exercise_done" | "no_alcohol" | "no_fried_food" | "sunlight_done" | "bedtime_ok" | "healthy_breakfast";

const checklistItems: { key: ChecklistKey; label: string; emoji: string }[] = [
  { key: "water_goal_met", label: "Water goal (3L)", emoji: "💧" },
  { key: "exercise_done", label: "Exercise done", emoji: "🏋️" },
];

export default function Dashboard() {
  const time = useCurrentTime();
  const fasting = getFastingStatus();
  const { user } = useAuth();

  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState<number>(170);

  const [allTests, setAllTests] = useState<BloodTest[]>([]);
  const [trends, setTrends] = useState<KeyTrend[]>([]);
  const healthScore = getHealthScore(allTests);
  const motivation = getMotivationalMessage(allTests);

  const [waterGlasses, setWaterGlasses] = useState(0);
  const [mealsLogged, setMealsLogged] = useState(0);
  const [exerciseDone, setExerciseDone] = useState(false);
  const [exerciseCalories, setExerciseCalories] = useState(0);
  const [mealCalories, setMealCalories] = useState(0);
  const [weightLoggedToday, setWeightLoggedToday] = useState(false);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [checklistId, setChecklistId] = useState<string | null>(null);

  const [waterModal, setWaterModal] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [exerciseModal, setExerciseModal] = useState(false);
  const [mealModal, setMealModal] = useState(false);

  const loadProfile = useCallback(async () => {
    const profile = await getProfile();
    const fallbackName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "";

    setUserName((profile as any)?.name || (profile as any)?.full_name || fallbackName);
    setAvatarUrl(await resolveAvatarUrl({
      userId: user?.id,
      storedAvatar: (profile as any)?.avatar_url,
      oauthAvatarUrl: user?.user_metadata?.avatar_url || null,
    }));

    if ((profile as any)?.height_cm) setHeightCm((profile as any).height_cm);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load only APPLIED blood test records from DB
  useEffect(() => {
    (async () => {
      try {
        const records = await getAppliedBloodTestRecords();
        const dbTests: BloodTest[] = records.map((r: any) => ({
          id: r.id,
          date: r.test_date,
          source: r.source,
          weightKg: Number(r.weight_kg) || 0,
          bmi: Number(r.bmi) || 0,
          markers: (Array.isArray(r.markers) ? r.markers : []).map((m: any) => ({
            testName: m.testName,
            value: Number(m.value),
            unit: m.unit,
            referenceMin: m.referenceMin != null ? Number(m.referenceMin) : undefined,
            referenceMax: m.referenceMax != null ? Number(m.referenceMax) : undefined,
            status: m.status || "normal",
            category: m.category || "Other",
          })),
        }));
        setAllTests(dbTests);
        setTrends(computeKeyTrends(dbTests));
      } catch {
        // Table may not exist yet
      }
    })();
  }, []);

  const loadData = useCallback(async () => {
    const [water, meals, exercise, weight, cl] = await Promise.all([
      getTodayWaterLog(),
      getTodayMeals(),
      getTodayExercise(),
      getLatestWeight(),
      getTodayChecklist(),
    ]);
    setWaterGlasses(water?.glasses ?? 0);
    setMealsLogged(meals?.length ?? 0);
    setMealCalories((meals ?? []).reduce((s: number, m: any) => s + (m.calories ?? 0), 0));
    setExerciseDone(!!exercise);
    setExerciseCalories(exercise?.calories ?? 0);
    if (weight) {
      setCurrentWeight(Number(weight.weight_kg));
      const today = new Date().toISOString().split("T")[0];
      setWeightLoggedToday(weight.logged_at?.startsWith(today) ?? false);
    }
    if (cl) {
      setChecklistId(cl.id);
      setChecklist({
        water_goal_met: cl.water_goal_met ?? false,
        exercise_done: cl.exercise_done ?? false,
        no_alcohol: cl.no_alcohol ?? false,
        no_fried_food: cl.no_fried_food ?? false,
        sunlight_done: cl.sunlight_done ?? false,
        bedtime_ok: cl.bedtime_ok ?? false,
        healthy_breakfast: cl.healthy_breakfast ?? false,
      });
    } else {
      const newCl = await upsertChecklist({});
      if (newCl) setChecklistId(newCl.id);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    return onSync("sync:all", () => {
      loadData();
      loadProfile();
    });
  }, [loadData, loadProfile]);

  const toggleChecklist = async (key: ChecklistKey) => {
    const newVal = !checklist[key];
    setChecklist((prev) => ({ ...prev, [key]: newVal }));
    await upsertChecklist({ [key]: newVal });
  };

  const completedItems = Object.values(checklist).filter(Boolean).length;
  const checklistPct = Math.round((completedItems / checklistItems.length) * 100);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={userName}
            className="w-12 h-12 rounded-full object-cover border-2 border-primary"
            onError={() => {
              setAvatarUrl((current) => {
                const fallback = user?.user_metadata?.avatar_url || null;
                return current && fallback && current !== fallback ? fallback : null;
              });
            }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-lg font-bold text-primary">
            {userName?.charAt(0)?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
            Good {time.getHours() < 12 ? "morning" : time.getHours() < 18 ? "afternoon" : "evening"}, {userName?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-muted-foreground truncate">{motivation}</p>
        </div>
      </div>

      {/* Health Score + Fasting */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 text-center sm:text-left">
          <ProgressRing progress={healthScore} size={100} strokeWidth={10} color={healthScore < 50 ? "hsl(var(--destructive))" : healthScore < 70 ? "hsl(var(--warning))" : undefined} className="shrink-0">
            <div className="text-center">
              <div className="text-2xl font-display font-bold text-foreground">{healthScore}</div>
              <div className="text-[10px] text-muted-foreground">/ 100</div>
            </div>
          </ProgressRing>
          <div>
            <h3 className="font-display font-semibold text-foreground">Health Score</h3>
            <p className="text-xs text-muted-foreground mt-1">Based on blood work, body metrics, fitness data and lifestyle factors</p>
            {allTests.length > 0 && (
              <div className="flex gap-2 mt-3">
                {allTests[allTests.length - 1].markers.some(m => m.category === "Liver" && (m.status === "high" || m.status === "critical")) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Liver ⚠</span>
                )}
                {currentWeight && heightCm > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">BMI {(currentWeight / ((heightCm / 100) * (heightCm / 100))).toFixed(1)}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <Link to="/fasting" className="glass-card rounded-xl p-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 text-center sm:text-left hover:border-primary/30 transition">
          <ProgressRing progress={fasting.progressPct} size={100} strokeWidth={10} color={fasting.state === "fasting" ? "hsl(var(--warning))" : "hsl(var(--primary))"} className="shrink-0">
            <div className="text-center">
              <Timer className="w-5 h-5 mx-auto text-foreground mb-0.5" />
              <div className="text-[10px] text-muted-foreground">{fasting.state === "fasting" ? "16:8" : "EAT"}</div>
            </div>
          </ProgressRing>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${fasting.state === "fasting" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                {fasting.label}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground mt-1.5">{fasting.message}</p>
            <p className="text-xs text-muted-foreground mt-1">Next: {fasting.nextEvent}</p>
          </div>
        </Link>
      </div>

      {/* Today At a Glance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Droplets, label: "Water", value: `${(waterGlasses * 250 / 1000).toFixed(1)}L`, sub: "of 3L", done: waterGlasses * 250 >= 3000 },
          { icon: Utensils, label: "Meals", value: `${mealsLogged}/4`, sub: "logged", done: mealsLogged >= 4 },
          { icon: Dumbbell, label: "Exercise", value: exerciseDone ? "Done" : "Pending", sub: "today", done: exerciseDone },
          { icon: Scale, label: "Weight", value: currentWeight ? `${currentWeight}` : "—", sub: weightLoggedToday ? "logged today" : "kg", done: weightLoggedToday },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl p-4 text-center border-2 transition-all ${
            item.done
              ? "bg-success/10 border-success/30"
              : "glass-card border-transparent"
          }`}>
            <item.icon className={`w-5 h-5 mx-auto mb-2 ${item.done ? "text-success" : "text-muted-foreground"}`} />
            <div className={`text-lg font-display font-bold ${item.done ? "text-success" : "text-foreground"}`}>{item.value}</div>
            <div className={`text-xs ${item.done ? "text-success/70" : "text-muted-foreground"}`}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Today's Energy Balance */}
      {(mealCalories > 0 || exerciseCalories > 0) && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-3">Today's Energy Balance</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Eaten</div>
              <div className="text-lg font-display font-bold text-foreground">{mealCalories}</div>
              <div className="text-[10px] text-muted-foreground">kcal in</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Burned</div>
              <div className="text-lg font-display font-bold text-warning">{exerciseCalories}</div>
              <div className="text-[10px] text-muted-foreground">kcal out</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Net</div>
              <div className={`text-lg font-display font-bold ${mealCalories - exerciseCalories > 1800 ? "text-warning" : "text-success"}`}>
                {mealCalories - exerciseCalories}
              </div>
              <div className="text-[10px] text-muted-foreground">kcal net</div>
            </div>
          </div>
          {/* Progress bar: eaten vs target (BMR 1708) */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Net intake vs BMR (1708 kcal)</span>
              <span className={mealCalories - exerciseCalories <= 1708 ? "text-success" : "text-warning"}>
                {mealCalories - exerciseCalories <= 1708 ? "Deficit (losing weight)" : "Surplus"}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${mealCalories - exerciseCalories <= 1708 ? "bg-success" : "bg-warning"}`}
                style={{ width: `${Math.min(((mealCalories - exerciseCalories) / 1708) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Health Intelligence — Cross-module insights */}
      <HealthInsights />

      {/* Daily Checklist */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-foreground">Daily Checklist</h3>
          <span className="text-sm font-bold text-primary">{checklistPct}%</span>
        </div>
        <div className="space-y-2">
          {checklistItems.map((item) => (
            <button
              key={item.key}
              onClick={() => toggleChecklist(item.key)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition"
            >
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${checklist[item.key] ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                {checklist[item.key] && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground">{item.emoji} {item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Trend Comparison — dynamic */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-foreground">
            Trend{allTests.length >= 2 && (
              <span className="text-xs text-muted-foreground font-normal ml-1">
                {new Date(allTests[allTests.length - 2].date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → {new Date(allTests[allTests.length - 1].date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            )}
          </h3>
          <Link to="/health" className="text-xs text-primary flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <div className="space-y-3">
          {trends.map((t) => (
            <div key={t.marker} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
              <div className="flex items-center gap-3 min-w-0 self-start">
                {t.direction === "up" && t.severity === "critical" ? <TrendingUp className="w-4 h-4 text-destructive shrink-0" /> : t.direction === "down" ? <TrendingDown className="w-4 h-4 text-success shrink-0" /> : <TrendingUp className="w-4 h-4 text-warning shrink-0" />}
                <span className="text-sm text-foreground font-medium">{t.marker}</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
                <span className="text-xs text-muted-foreground">{t.from} → {t.to} {t.unit}</span>
                <StatusBadge status={t.severity === "critical" ? "critical" : t.severity === "improved" ? "improved" : "borderline"} />
                <span className={`text-xs font-medium ${t.changePct > 0 && t.severity === "critical" ? "text-destructive" : t.changePct < 0 ? "text-success" : "text-warning"}`}>
                  {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BioAge Alert — only show if user has data */}
      {allTests.length > 0 && (
        <div className="warning-gradient rounded-xl p-4 text-warning-foreground">
          <div className="flex items-start gap-3">
            <Heart className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Track your BioAge</p>
              <p className="text-xs opacity-90 mt-1">Upload blood test results and log exercises to calculate your biological age.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Log Water", icon: Droplets, color: "bg-blue-500/10 text-blue-500 border-blue-500/20", onClick: () => setWaterModal(true) },
          { label: "Log Meal", icon: Utensils, color: "bg-primary/10 text-primary border-primary/20", onClick: () => setMealModal(true) },
          { label: "Log Exercise", icon: Dumbbell, color: "bg-warning/10 text-warning border-warning/20", onClick: () => setExerciseModal(true) },
          { label: "Log Weight", icon: Scale, color: "bg-foreground/10 text-foreground border-foreground/20", onClick: () => setWeightModal(true) },
        ].map((action) => (
          <button key={action.label} onClick={action.onClick} className={`flex items-center gap-2 p-3 rounded-xl border transition hover:scale-[1.02] active:scale-[0.98] ${action.color}`}>
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Modals */}
      <LogWaterModal open={waterModal} onClose={() => setWaterModal(false)} currentGlasses={waterGlasses} onUpdated={(g) => { setWaterGlasses(g); if (g >= 12) upsertChecklist({ water_goal_met: true }); }} />
      <LogWeightModal open={weightModal} onClose={() => setWeightModal(false)} onLogged={loadData} />
      <LogExerciseModal open={exerciseModal} onClose={() => setExerciseModal(false)} onLogged={loadData} />
      <LogMealModal open={mealModal} onClose={() => setMealModal(false)} onLogged={loadData} />
    </div>
  );
}
