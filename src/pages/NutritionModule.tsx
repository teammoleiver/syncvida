import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Clock, Droplets, Plus, Minus, Trophy, Flame, Loader2, X, ArrowLeft } from "lucide-react";
import { getFastingStatus } from "@/lib/health-data";
import { getTodayWaterLog, upsertWaterLog, getTodayMeals, getAllMealLogs, upsertChecklist, logMeal } from "@/lib/supabase-queries";
import { onSync } from "@/lib/sync-events";
import { playWaterSound, playGoalReachedSound } from "@/lib/water-sound";
import { VossBottle, VossBottleMini } from "@/components/ui/VossBottle";
import { Celebration } from "@/components/ui/Celebration";
import LogMealModal from "@/components/modals/LogMealModal";
import NutritionPlanner from "@/components/NutritionPlanner";
import FoodSearchInput from "@/components/FoodSearchInput";
import type { FoodDbItem } from "@/lib/food-queries";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

const BOTTLE_ML = 800;
const GOAL_ML = 3000;
const SIP_ML = 400;

export default function NutritionModule() {
  const { toast } = useToast();
  const fasting = getFastingStatus();
  const [waterMl, setWaterMl] = useState(0);
  const [todayMeals, setTodayMeals] = useState<Tables<"meal_logs">[]>([]);
  const [mealHistory, setMealHistory] = useState<any[]>([]);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [view, setView] = useState<"main" | "history">("main");
  const [selectedFood, setSelectedFood] = useState<FoodDbItem | null>(null);
  const [mealTypePicker, setMealTypePicker] = useState(false);
  const now = new Date();
  const hour = now.getHours();
  const isPastWindow = hour >= 20;
  const isClosingSoon = hour >= 19 && hour < 20;

  useEffect(() => {
    getTodayWaterLog().then((w) => {
      setWaterMl(w?.ml_total ?? (w?.glasses ?? 0) * 250);
    });
    getTodayMeals().then(setTodayMeals);
    getAllMealLogs(60).then(setMealHistory);
  }, []);

  const [justDrank, setJustDrank] = useState(false);
  const [goalJustReached, setGoalJustReached] = useState(false);

  const completedBottles = Math.floor(waterMl / BOTTLE_ML);
  const currentBottleMl = waterMl % BOTTLE_ML;
  const currentBottleFill = currentBottleMl / BOTTLE_ML;
  const goalReached = waterMl >= GOAL_ML;

  const persistWater = useCallback(async (ml: number) => {
    const glasses = Math.round(ml / 250);
    await upsertWaterLog(glasses, ml);
    if (ml >= GOAL_ML) await upsertChecklist({ water_goal_met: true });
  }, []);

  const handleDrink = useCallback(async () => {
    const newMl = Math.min(waterMl + SIP_ML, 5000);
    setWaterMl(newMl);
    setJustDrank(true);
    playWaterSound();
    setTimeout(() => setJustDrank(false), 600);
    if (newMl >= GOAL_ML && waterMl < GOAL_ML) {
      setGoalJustReached(true);
      setTimeout(() => playGoalReachedSound(), 400);
    }
    await persistWater(newMl);
  }, [waterMl, persistWater]);

  const handleRemove = useCallback(async () => {
    if (waterMl <= 0) return;
    const newMl = Math.max(0, waterMl - SIP_ML);
    setWaterMl(newMl);
    await persistWater(newMl);
  }, [waterMl, persistWater]);

  const totalCalories = todayMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {view === "history" ? (
        /* ── Meal History View ── */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Meal History</h1>
            <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground ml-auto">{mealHistory.length} meals</span>
          </div>
          <div className="glass-card rounded-xl p-5">
            {mealHistory.length > 0 ? (
              <div className="space-y-1">
                {(() => {
                  const grouped: Record<string, any[]> = {};
                  mealHistory.forEach((m: any) => {
                    const d = new Date(m.logged_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                    if (!grouped[d]) grouped[d] = [];
                    grouped[d].push(m);
                  });
                  return Object.entries(grouped).map(([date, meals]) => (
                    <div key={date}>
                      <div className="sticky top-0 bg-card/95 backdrop-blur-sm py-2 px-1 z-10">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{date}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {meals.reduce((s: number, m: any) => s + (m.calories ?? 0), 0)} kcal total
                        </span>
                      </div>
                      {meals.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-accent/20 transition">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              m.quality === "good" ? "bg-success/15 text-success" : m.quality === "bad" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
                            }`}>{m.meal_type}</span>
                            <span className="text-sm text-foreground truncate">{m.food_name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                            {m.protein_g && <span>P: {m.protein_g}g</span>}
                            {m.carbs_g && <span>C: {m.carbs_g}g</span>}
                            {m.fat_g && <span>F: {m.fat_g}g</span>}
                            <span className="font-medium text-foreground">{m.calories ?? "—"} kcal</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No meals logged yet.</p>
            )}
          </div>
        </div>
      ) : (<>
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Nutrition</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("history")}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium transition"
          >
            Meal History
          </button>
          <button onClick={() => setMealModalOpen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-dark transition flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Log Meal
          </button>
        </div>
      </div>

      {/* Fasting warnings */}
      {isPastWindow && (
        <div className="danger-gradient rounded-xl p-3 text-destructive-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-semibold">Eating window is now closed — no more food tonight</span>
        </div>
      )}
      {isClosingSoon && !isPastWindow && (
        <div className="warning-gradient rounded-xl p-3 text-warning-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-semibold">Eating window closes in {60 - now.getMinutes()} minutes</span>
        </div>
      )}
      {fasting.state === "eating" && fasting.remainingMinutes <= 60 && fasting.remainingMinutes > 0 && !isPastWindow && !isClosingSoon && (
        <div className="warning-gradient rounded-xl p-3 text-warning-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-semibold">Eating window closes in {fasting.remainingMinutes} minutes</span>
        </div>
      )}

      {/* ── Water Tracker ── */}
      <div className="glass-card rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-500" /> Water Tracker
          </h3>
          <div className="text-right">
            <span className="text-sm font-medium text-foreground">{(waterMl / 1000).toFixed(1)}L</span>
            <span className="text-sm text-muted-foreground"> / {GOAL_ML / 1000}L</span>
          </div>
        </div>
        <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-400 to-blue-500" initial={false} animate={{ width: `${Math.min((waterMl / GOAL_ML) * 100, 100)}%` }} transition={{ type: "spring", stiffness: 300, damping: 25 }} />
          {goalReached && <motion.div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/30 to-blue-400/0" animate={{ x: ["-100%", "200%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />}
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <p className="text-[10px] text-muted-foreground font-medium">VOSS 800ml</p>
            <motion.button onClick={handleDrink} whileTap={{ scale: 0.95 }} className="relative cursor-pointer group">
              <VossBottle fillLevel={currentBottleFill} size={180} interactive />
              <AnimatePresence>{justDrank && <motion.div className="absolute inset-0 rounded-lg border-2 border-blue-400/50" initial={{ opacity: 0.8, scale: 0.9 }} animate={{ opacity: 0, scale: 1.15 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}</AnimatePresence>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-[10px] font-bold text-blue-300 bg-background/80 px-2 py-0.5 rounded-full">+{SIP_ML}ml</span></div>
            </motion.button>
            <div className="text-center"><p className="text-xs font-bold text-blue-400">{currentBottleMl}ml</p><p className="text-[10px] text-muted-foreground">of 800ml</p></div>
          </div>
          <div className="flex-1 space-y-3 w-full">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Bottles finished</p>
              <div className="flex items-end gap-1.5 flex-wrap min-h-[52px]">
                {completedBottles > 0 ? Array.from({ length: completedBottles }).map((_, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.5, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: i * 0.1, type: "spring" }}><VossBottleMini /></motion.div>
                )) : <span className="text-xs text-muted-foreground/50 italic">None yet — tap the bottle!</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded-lg p-2 text-center"><div className="text-lg font-display font-bold text-foreground">{completedBottles}</div><div className="text-[9px] text-muted-foreground">bottles</div></div>
              <div className="bg-secondary/50 rounded-lg p-2 text-center"><div className="text-lg font-display font-bold text-blue-400">{waterMl}</div><div className="text-[9px] text-muted-foreground">ml total</div></div>
              <div className="bg-secondary/50 rounded-lg p-2 text-center"><div className="text-lg font-display font-bold text-foreground">{Math.max(0, GOAL_ML - waterMl)}</div><div className="text-[9px] text-muted-foreground">ml left</div></div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleRemove} disabled={waterMl <= 0} className="w-9 h-9 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-accent transition disabled:opacity-30"><Minus className="w-4 h-4" /></button>
              <button onClick={handleDrink} className="flex-1 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center gap-2 hover:bg-blue-600 transition shadow-lg shadow-blue-500/20 font-medium text-sm"><Droplets className="w-4 h-4" /> +{SIP_ML}ml</button>
            </div>
          </div>
        </div>
        {goalReached && <div className="flex items-center justify-center gap-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium"><Trophy className="w-3.5 h-3.5" /> Daily goal complete</div>}
      </div>
      <Celebration show={goalJustReached} title="3L Goal Reached!" subtitle="Amazing hydration today! Your body thanks you." onClose={() => setGoalJustReached(false)} duration={5000} />

      {/* ── Today's Logged Meals ── */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Utensils className="w-5 h-5 text-primary" /> Today's Meals
          </h3>
          {todayMeals.length > 0 && (
            <span className="text-xs text-muted-foreground">{totalCalories} kcal total</span>
          )}
        </div>

        {todayMeals.length > 0 ? (
          <div className="space-y-2">
            {todayMeals.map((meal) => (
              <div key={meal.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-accent/30 transition">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold text-primary uppercase">{meal.meal_type}</span>
                  <p className="text-sm text-foreground truncate">{meal.food_name}</p>
                  {(meal.protein_g || meal.carbs_g || meal.fat_g) && (
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      {meal.protein_g && <span>P: {meal.protein_g}g</span>}
                      {meal.carbs_g && <span>C: {meal.carbs_g}g</span>}
                      {meal.fat_g && <span>F: {meal.fat_g}g</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {meal.calories && <span className="text-xs text-muted-foreground">{meal.calories} kcal</span>}
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${meal.quality === "good" ? "bg-success/15 text-success" : meal.quality === "bad" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                    {meal.quality === "good" ? "Healthy" : meal.quality === "bad" ? "Unhealthy" : "OK"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Utensils className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No meals logged today</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Tap "Log Meal" to start tracking your nutrition</p>
          </div>
        )}
      </div>

      <NutritionPlanner />

      {/* ── Food Database Search ── */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Flame className="w-5 h-5 text-primary" /> Food Database
        </h3>
        <p className="text-xs text-muted-foreground">Search {159}+ foods with full nutritional info — tap an item to log it</p>
        <FoodSearchInput
          onSelect={(food: FoodDbItem) => {
            setSelectedFood(food);
            setMealTypePicker(true);
          }}
          placeholder="Search foods... e.g. chicken, rice, salmon"
        />
      </div>

      {/* ── Meal Type Picker Dialog ── */}
      <AnimatePresence>
        {mealTypePicker && selectedFood && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setMealTypePicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-foreground">Log this food</h3>
                <button onClick={() => setMealTypePicker(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3">
                <p className="font-semibold text-foreground">{selectedFood.food_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-primary font-semibold">{selectedFood.kcal_per_serving ?? selectedFood.kcal_per_100g ?? "?"} kcal</span>
                  {selectedFood.serving_description && <span className="text-[10px] text-muted-foreground">({selectedFood.serving_description})</span>}
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                  {selectedFood.protein_g != null && <span>P: {selectedFood.protein_g}g</span>}
                  {selectedFood.carbs_g != null && <span>C: {selectedFood.carbs_g}g</span>}
                  {selectedFood.fat_g != null && <span>F: {selectedFood.fat_g}g</span>}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Which meal is this for?</p>
              <div className="grid grid-cols-2 gap-2">
                {["Breakfast", "Lunch", "Dinner", "Snack"].map((mealType) => (
                  <button
                    key={mealType}
                    onClick={async () => {
                      await logMeal({
                        food_name: selectedFood.food_name,
                        meal_type: mealType.toLowerCase(),
                        calories: selectedFood.kcal_per_serving ? Number(selectedFood.kcal_per_serving) : selectedFood.kcal_per_100g ? Number(selectedFood.kcal_per_100g) : null,
                        protein_g: selectedFood.protein_g ? Number(selectedFood.protein_g) : null,
                        carbs_g: selectedFood.carbs_g ? Number(selectedFood.carbs_g) : null,
                        fat_g: selectedFood.fat_g ? Number(selectedFood.fat_g) : null,
                        quality: "good",
                        is_healthy: true,
                      });
                      toast({ title: "Meal logged!", description: `${selectedFood.food_name} added to ${mealType}` });
                      setMealTypePicker(false);
                      setSelectedFood(null);
                      getTodayMeals().then(setTodayMeals);
                      getAllMealLogs(60).then(setMealHistory);
                    }}
                    className="py-3 rounded-xl bg-secondary hover:bg-accent text-foreground text-sm font-medium transition flex flex-col items-center gap-1"
                  >
                    <span>{mealType === "Breakfast" ? "🌅" : mealType === "Lunch" ? "☀️" : mealType === "Dinner" ? "🌙" : "🍎"}</span>
                    {mealType}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </>)}
      <LogMealModal open={mealModalOpen} onClose={() => setMealModalOpen(false)} onLogged={() => { getTodayMeals().then(setTodayMeals); getAllMealLogs(60).then(setMealHistory); }} />
    </div>
  );
}
