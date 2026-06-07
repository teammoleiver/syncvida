import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Target, Linkedin, ChevronRight, ChevronLeft, Loader2, Check, Sparkles } from "lucide-react";
import { updateProfile } from "@/lib/supabase-queries";
import { upsertWriterSettings, analyzeSelfProfile } from "@/lib/social-queries";
import syncvidaLogo from "@/assets/syncvida-icon.png";

interface OnboardingWizardProps {
  onComplete: () => void;
  userName?: string;
}

const steps = [
  { id: "name", title: "Your name", icon: User },
  { id: "goal", title: "Your goal", icon: Target },
  { id: "linkedin", title: "Your LinkedIn", icon: Linkedin },
];

export default function OnboardingWizard({ onComplete, userName }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({
    name: userName || "",
    goal: "",
    linkedin_url: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.goal.trim().length > 0;
    return true; // LinkedIn URL optional
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      // 1) Name → profiles (and mark onboarded so the gate clears).
      await updateProfile({ name: form.name.trim(), full_name: form.name.trim(), onboarded: true });
      // 2) Goal + LinkedIn URL → Social Hub writer settings (feeds the AI persona).
      await upsertWriterSettings({
        goals: form.goal.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
      });
      // 3) If a LinkedIn URL was given, auto-analyze it (non-blocking — don't fail onboarding).
      if (form.linkedin_url.trim()) {
        setAnalyzing(true);
        analyzeSelfProfile(form.linkedin_url.trim()).catch(() => {}).finally(() => setAnalyzing(false));
      }
      onComplete();
    } catch (err) {
      console.error("Onboarding save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const StepIcon = steps[step].icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src={syncvidaLogo} alt="Syncvida" className="w-7 h-7 object-contain" />
          <span className="font-display font-bold text-lg">Syncvida</span>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-6 space-y-5">
          {/* Progress */}
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.id} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <StepIcon className="w-4 h-4 text-primary" /> {steps[step].title}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
              {step === 0 && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">What should we call you?</label>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="e.g. Alex"
                    onKeyDown={(e) => e.key === "Enter" && canNext() && setStep(1)}
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
              {step === 1 && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">What's your main goal on Syncvida?</label>
                  <textarea value={form.goal} onChange={(e) => set("goal", e.target.value)} autoFocus rows={3}
                    placeholder="e.g. Grow my LinkedIn presence and turn engagement into leads."
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
                  <p className="text-[11px] text-muted-foreground mt-1">This guides the AI when it writes in your voice.</p>
                </div>
              )}
              {step === 2 && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Your LinkedIn profile URL (optional)</label>
                  <input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} autoFocus
                    placeholder="https://www.linkedin.com/in/your-handle"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-primary" />
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" /> We'll analyze it to auto-fill your profile in Settings → Social Hub.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-0">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < steps.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Get started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
