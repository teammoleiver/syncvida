import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Timer, AlertTriangle, Check, Clock, Flame, Info,
} from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { getFastingStatus } from "@/lib/health-data";
import { getUserProfile, updateUserProfile, getFasting52Schedule, upsertFasting52Schedule, getWeekStartDate, getFastingLogs } from "@/lib/supabase-queries";

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function FastingModule() {
  const time = useCurrentTime();
  const fasting = getFastingStatus();
  const [is52Enabled, setIs52Enabled] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fastDays, setFastDays] = useState<number[]>([]);
  const [streak168, setStreak168] = useState(0);
  const [loading, setLoading] = useState(true);

  const hours = Math.floor(fasting.remainingMinutes / 60);
  const mins = fasting.remainingMinutes % 60;

  // Load persisted state
  useEffect(() => {
    const load = async () => {
      const [profile, schedule, logs] = await Promise.all([
        getUserProfile(),
        getFasting52Schedule(),
        getFastingLogs(30),
      ]);
      if (profile) setIs52Enabled(profile.fasting_52_enabled ?? false);
      if (schedule) {
        const days: number[] = [];
        if (schedule.fast_day_1) {
          const d = new Date(schedule.fast_day_1 + "T12:00:00");
          days.push(d.getDay() === 0 ? 6 : d.getDay() - 1);
        }
        if (schedule.fast_day_2) {
          const d = new Date(schedule.fast_day_2 + "T12:00:00");
          days.push(d.getDay() === 0 ? 6 : d.getDay() - 1);
        }
        setFastDays(days);
      }
      // Calculate streak from logs
      const completedLogs = logs.filter((l) => l.completed);
      setStreak168(completedLogs.length);
      setLoading(false);
    };
    load();
  }, []);

  const toggle52 = async (enable: boolean) => {
    setIs52Enabled(enable);
    await updateUserProfile({ fasting_52_enabled: enable });
    if (!enable) setFastDays([]);
  };

  const toggleDay = async (dayIdx: number) => {
    let newDays = [...fastDays];
    if (newDays.includes(dayIdx)) {
      newDays = newDays.filter((d) => d !== dayIdx);
    } else {
      for (const d of newDays) {
        if (Math.abs(d - dayIdx) === 1 || (d === 0 && dayIdx === 6) || (d === 6 && dayIdx === 0)) return;
      }
      if (newDays.length >= 2) return;
      newDays.push(dayIdx);
    }
    setFastDays(newDays);

    // Persist
    const weekStart = getWeekStartDate();
    const getDate = (idx: number) => {
      const [y, m, d] = weekStart.split("-").map(Number);
      const ws = new Date(y, m - 1, d);
      ws.setDate(ws.getDate() + idx);
      const year = ws.getFullYear();
      const month = String(ws.getMonth() + 1).padStart(2, "0");
      const date = String(ws.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    };
    await upsertFasting52Schedule({
      week_start_date: weekStart,
      fast_day_1: newDays[0] !== undefined ? getDate(newDays[0]) : null,
      fast_day_2: newDays[1] !== undefined ? getDate(newDays[1]) : null,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Fasting</h1>

      <div className="glass-card rounded-xl p-2 inline-flex gap-1">
        <span className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">16:8</span>
        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${is52Enabled ? "bg-fast-day text-fast-day-foreground" : "bg-secondary text-muted-foreground"}`}>
          5:2 {is52Enabled ? "ON" : "OFF"}
        </span>
      </div>

      {/* Live Fasting Clock */}
      <div className="glass-card rounded-xl p-6 flex flex-col items-center">
        <ProgressRing progress={fasting.progressPct} size={180} strokeWidth={12} color={fasting.state === "fasting" ? "hsl(var(--warning))" : "hsl(var(--primary))"}>
          <div className="text-center">
            <div className={`text-xs font-bold px-3 py-0.5 rounded-full mb-2 ${fasting.state === "fasting" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
              {fasting.label}
            </div>
            <div className="text-3xl font-display font-bold text-foreground tabular-nums">
              {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {fasting.state === "fasting" ? "until eating window" : "until window closes"}
            </div>
          </div>
        </ProgressRing>
        <div className="flex items-center gap-6 mt-5">
          <div className="text-center">
            <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">Window</div>
            <div className="text-sm font-semibold text-foreground">12:00 – 20:00</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <Timer className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">Protocol</div>
            <div className="text-sm font-semibold text-foreground">16:8 IF</div>
          </div>
        </div>
      </div>

      {/* 16:8 Streak */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-foreground">16:8 Streak</h3>
          <span className="text-2xl font-display font-bold text-primary">{streak168} days</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full ${i < streak168 % 7 || streak168 >= 7 ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          {daysOfWeek.map((d) => <span key={d}>{d}</span>)}
        </div>
      </div>

      {/* 5:2 Section */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-fast-day" />
            <h3 className="font-display font-semibold text-foreground">5:2 Protocol</h3>
          </div>
          <button
            onClick={() => { if (!is52Enabled) setShowConfirm(true); else toggle52(false); }}
            className={`relative w-11 h-6 rounded-full transition-colors ${is52Enabled ? "bg-fast-day" : "bg-muted"}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${is52Enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {is52Enabled && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="p-4 space-y-4">
            <div className="bg-fast-day/10 border border-fast-day/20 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-fast-day shrink-0 mt-0.5" />
              <p className="text-xs text-foreground"><strong>Adaptation phase:</strong> Your body may take 2–4 weeks to adapt.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Select 2 non-consecutive fast days:</p>
              <div className="grid grid-cols-7 gap-2">
                {daysOfWeek.map((day, i) => {
                  const selected = fastDays.includes(i);
                  const isBlocked = !selected && fastDays.some((d) => Math.abs(d - i) === 1 || (d === 0 && i === 6) || (d === 6 && i === 0));
                  return (
                    <button key={day} onClick={() => toggleDay(i)} disabled={isBlocked && fastDays.length < 2}
                      className={`p-2 rounded-lg text-center text-xs font-medium transition ${selected ? "bg-fast-day text-fast-day-foreground" : isBlocked ? "bg-muted/50 text-muted-foreground/40 cursor-not-allowed" : "bg-secondary text-foreground hover:bg-accent"}`}>
                      <span className="block sm:hidden text-[10px]">{day[0]}</span>
                      <span className="hidden sm:block">{day}</span>
                      {selected && <Check className="w-3 h-3 mx-auto mt-0.5" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Recommended pairs: Mon+Thu, Tue+Fri, Wed+Sat</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Weekly Deficit from 5:2</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">Normal day calories</span><p className="font-semibold text-foreground">~1,800 kcal × 5 = 9,000</p></div>
                <div><span className="text-muted-foreground">Fast day calories</span><p className="font-semibold text-foreground">500 kcal × 2 = 1,000</p></div>
                <div><span className="text-muted-foreground">Extra deficit/week</span><p className="font-bold text-fast-day">~1,300–1,500 kcal</p></div>
                <div><span className="text-muted-foreground">Est. extra monthly loss</span><p className="font-bold text-fast-day">~0.4–0.5 kg</p></div>
              </div>
            </div>
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-foreground"><strong>5:2 NOT recommended if:</strong> you feel dizzy, have intense workout, or feel unwell.</p>
            </div>
          </motion.div>
        )}
      </div>

      {is52Enabled && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="health-gradient rounded-xl p-5 text-primary-foreground">
          <h3 className="font-display font-semibold mb-2">Combined 16:8 + 5:2 Benefits</h3>
          <p className="text-sm opacity-90">By combining 16:8 + 5:2, you are fasting 16h every day AND restricting calories 2 days per week. Most effective for fatty liver reduction and metabolic reset.</p>
        </motion.div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-xl p-6 max-w-md w-full shadow-xl border border-border">
            <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-3" />
            <h3 className="font-display font-bold text-center text-foreground mb-2">Enable 5:2 Protocol?</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">5:2 fasting is an advanced protocol. It is recommended only from Week 3 onward. Your liver condition (ALT 101) means you should consult Dr. Pujol Ruiz before starting.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-accent transition">Cancel</button>
              <button onClick={() => { toggle52(true); setShowConfirm(false); }} className="flex-1 py-2.5 rounded-lg bg-fast-day text-fast-day-foreground text-sm font-semibold hover:opacity-90 transition">Enable 5:2</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
