import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, ChevronDown, TrendingUp, TrendingDown, AlertTriangle,
  FileText, Upload, Loader2, X, Brain, ShieldAlert, Lightbulb,
  CheckCircle2, Trash2, Check, XCircle, Clock, Eye,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BLOOD_TESTS, BloodTest, HealthMarker, computeKeyTrends } from "@/lib/health-data";
import { supabase } from "@/integrations/supabase/client";
import {
  getUserProfile, getBloodTestRecords, saveBloodTestRecord,
  deleteBloodTestRecord, applyBloodTestRecord, declineBloodTestRecord,
} from "@/lib/supabase-queries";
import { analyzePDF } from "@/lib/pdf-analyzer";
import { toast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

/* ─── Types ─── */

interface DBRecord {
  id: string;
  test_date: string;
  source: string;
  file_name: string | null;
  weight_kg: number | null;
  bmi: number | null;
  markers: any;
  summary: string | null;
  recommendations: any;
  risk_factors: any;
  pdf_storage_path: string | null;
  applied: boolean;
  uploaded_at: string;
  analyzed_at: string | null;
  created_at: string | null;
}

/* ─── Helpers ─── */

function dbRecordToBloodTest(r: DBRecord): BloodTest {
  return {
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
  };
}

function getAllAppliedTests(records: DBRecord[]): BloodTest[] {
  const applied = records.filter((r) => r.applied).map(dbRecordToBloodTest);
  applied.sort((a, b) => a.date.localeCompare(b.date));
  return applied;
}

function getMarkerDelta(allTests: BloodTest[], markerName: string): { from: number; to: number; change: number; pct: number } | null {
  if (allTests.length < 2) return null;
  const prev = allTests[allTests.length - 2].markers.find((m) => m.testName === markerName);
  const curr = allTests[allTests.length - 1].markers.find((m) => m.testName === markerName);
  if (!prev || !curr) return null;
  const change = curr.value - prev.value;
  const pct = prev.value !== 0 ? (change / prev.value) * 100 : 0;
  return { from: prev.value, to: curr.value, change, pct };
}

/* ─── Marker Trend Chart ─── */

function MarkerTrendChart({ markerName, allTests }: { markerName: string; allTests: BloodTest[] }) {
  const data = allTests.map((bt) => {
    const m = bt.markers.find((x) => x.testName === markerName);
    return m ? { date: bt.date.slice(5), value: m.value } : null;
  }).filter(Boolean) as { date: string; value: number }[];
  if (data.length < 2) return null;
  const latest = allTests[allTests.length - 1].markers.find((m) => m.testName === markerName) ?? allTests[0].markers.find((m) => m.testName === markerName);
  return (
    <div className="h-24 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis hide />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          {latest?.referenceMax && <ReferenceLine y={latest.referenceMax} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />}
          <Line type="monotone" dataKey="value" stroke={latest?.status === "critical" || latest?.status === "high" ? "hsl(var(--destructive))" : latest?.status === "borderline" || latest?.status === "low" ? "hsl(var(--warning))" : "hsl(var(--primary))"} strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Expandable Blood Test Card (for hardcoded + applied DB tests) ─── */

function TestDateCard({ test, allTests, isExpanded, onToggle }: {
  test: BloodTest; allTests: BloodTest[]; isExpanded: boolean; onToggle: () => void;
}) {
  const [filterCat, setFilterCat] = useState("All");
  const filtered = filterCat === "All" ? test.markers : test.markers.filter((m) => m.category === filterCat);
  const alertCount = test.markers.filter((m) => m.status === "critical" || m.status === "high").length;
  const testCats = [...new Set(test.markers.map((m) => m.category))];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full p-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-accent/50 transition">
        <div className="flex items-center gap-3 text-left">
          <Calendar className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-display font-semibold text-foreground text-sm sm:text-base">
              {new Date(test.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="text-xs text-muted-foreground">{test.source}</p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t border-border/40 pt-3 sm:pt-0 sm:border-t-0">
          <div className="flex items-center gap-2">
            {alertCount > 0 && <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">{alertCount} alert{alertCount > 1 ? "s" : ""}</span>}
            {test.bmi ? <span className="text-xs text-muted-foreground">BMI {test.bmi} · {test.weightKg}kg</span> : null}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {isExpanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border">
          <div className="p-3 flex gap-2 overflow-x-auto border-b border-border">
            {["All", ...testCats].map((cat) => (
              <button key={cat} onClick={() => setFilterCat(cat)} className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${filterCat === cat ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>{cat}</button>
            ))}
          </div>
          <div className="divide-y divide-border">
            {filtered.map((marker) => {
              const delta = getMarkerDelta(allTests, marker.testName);
              return (
                <div key={marker.testName} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{marker.testName}</span>
                      <StatusBadge status={marker.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-display font-bold text-foreground">{marker.value}</span>
                      <span className="text-xs text-muted-foreground">{marker.unit}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
                    <span>Ref: {marker.referenceMin ?? "—"} – {marker.referenceMax ?? "—"} {marker.unit}</span>
                    {delta && (
                      <span className={`flex items-center gap-1 font-medium ${delta.pct > 20 ? "text-destructive" : delta.pct < -10 ? "text-success" : "text-muted-foreground"}`}>
                        {delta.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {delta.change > 0 ? "+" : ""}{delta.change.toFixed(1)} ({delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <MarkerTrendChart markerName={marker.testName} allTests={allTests} />
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Uploaded Report Card (DB record — shows analysis, Accept/Decline) ─── */

function ReportCard({ record, onApply, onDecline, onDelete, onViewDetails, isExpanded, onToggle }: {
  record: DBRecord;
  onApply: () => void;
  onDecline: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const markers = Array.isArray(record.markers) ? record.markers : [];
  const criticalMarkers = markers.filter((m: any) => m.status === "critical" || m.status === "high");
  const recommendations = Array.isArray(record.recommendations) ? record.recommendations : [];
  const riskFactors = Array.isArray(record.risk_factors) ? record.risk_factors : [];
  const uploadDate = new Date(record.uploaded_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-xl overflow-hidden ${record.applied ? "border-l-4 border-l-primary" : "border-l-4 border-l-warning"}`}
    >
      {/* Header */}
      <button onClick={onToggle} className="w-full p-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-accent/50 transition">
        <div className="flex items-center gap-3 text-left">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${record.applied ? "bg-primary/10" : "bg-warning/10"}`}>
            <Brain className={`w-5 h-5 ${record.applied ? "text-primary" : "text-warning"}`} />
          </div>
          <div>
            <p className="font-display font-semibold text-foreground text-sm">
              {new Date(record.test_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="text-xs text-muted-foreground">{record.source}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Uploaded {uploadDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {uploadDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t border-border/40 pt-3 sm:pt-0 sm:border-t-0">
          <div className="flex items-center gap-2">
            {record.applied ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                <Check className="w-3 h-3" /> Applied
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Pending
              </span>
            )}
            <span className="text-xs text-muted-foreground">{markers.length} markers</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border"
          >
            <div className="p-4 space-y-4">
              {/* File info */}
              {record.file_name && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="w-3.5 h-3.5" />
                  {record.file_name}
                </div>
              )}

              {/* Summary */}
              {record.summary && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="w-4 h-4 text-primary" /> Summary
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{record.summary}</p>
                </div>
              )}

              {/* Critical markers */}
              {criticalMarkers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <AlertTriangle className="w-4 h-4 text-destructive" /> Flagged Markers
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {criticalMarkers.map((m: any) => (
                      <span key={m.testName} className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        {m.testName}: {m.value} {m.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Factors */}
              {riskFactors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldAlert className="w-4 h-4 text-destructive" /> Risk Factors
                  </div>
                  <div className="space-y-1">
                    {riskFactors.map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Lightbulb className="w-4 h-4 text-warning" /> Recommendations
                  </div>
                  <div className="space-y-1">
                    {recommendations.map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border">
                {!record.applied ? (
                  <>
                    <button
                      onClick={onApply}
                      className="w-full sm:flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Apply to System
                    </button>
                    <button
                      onClick={onDelete}
                      className="w-full sm:w-auto py-2 px-4 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Discard
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onDecline}
                      className="w-full sm:flex-1 py-2 rounded-lg bg-warning/10 text-warning text-sm font-medium hover:bg-warning/20 transition flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" /> Remove from System
                    </button>
                    <button
                      onClick={onDelete}
                      className="w-full sm:w-auto py-2 px-4 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Page ─── */

export default function HealthRecords() {
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [dbRecords, setDbRecords] = useState<DBRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load records from Supabase on mount
  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const records = await getBloodTestRecords();
      setDbRecords(records as DBRecord[]);
    } catch (err) {
      console.warn("Could not load blood test records:", err);
    } finally {
      setLoading(false);
    }
  };

  // Active tests = hardcoded + applied DB records
  const allAppliedTests = getAllAppliedTests(dbRecords);

  // Compute alerts from the two most recent applied tests
  const alerts: { marker: string; pct: number }[] = [];
  if (allAppliedTests.length >= 2) {
    const latest = allAppliedTests[allAppliedTests.length - 1];
    latest.markers.forEach((m) => {
      const delta = getMarkerDelta(allAppliedTests, m.testName);
      if (delta && delta.pct > 20) alerts.push({ marker: m.testName, pct: delta.pct });
    });
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
    } else {
      toast({ title: "Invalid file", description: "Please select a PDF file", variant: "destructive" });
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) return;

    const profile = await getUserProfile();
    if (!profile?.openai_api_key) {
      toast({ title: "API key required", description: "Configure your OpenAI API key in Settings first", variant: "destructive" });
      return;
    }

    setAnalyzing(true);

    try {
      // 1. Upload PDF to Supabase storage under the user's own folder so RLS allows it.
      setAnalysisProgress("Uploading PDF to storage...");
      const { data: { user } } = await supabase.auth.getUser();
      const storagePath = user?.id
        ? `${user.id}/${Date.now()}_${uploadedFile.name}`
        : `${Date.now()}_${uploadedFile.name}`;
      const { error: uploadError } = await supabase.storage.from("health-records").upload(storagePath, uploadedFile);
      if (uploadError) console.warn("Storage upload failed:", uploadError.message);

      // 2. Extract text and analyze with AI
      setAnalysisProgress("Extracting text from PDF...");
      await new Promise((r) => setTimeout(r, 200));

      setAnalysisProgress("Analyzing with AI — this may take 10-20 seconds...");
      const result = await analyzePDF(uploadedFile, profile.openai_api_key);

      // 3. Save to Supabase DB
      setAnalysisProgress("Saving results...");
      const saved = await saveBloodTestRecord({
        test_date: result.bloodTest.date,
        source: result.bloodTest.source,
        file_name: uploadedFile.name,
        weight_kg: result.bloodTest.weightKg || null,
        bmi: result.bloodTest.bmi || null,
        markers: result.bloodTest.markers,
        summary: result.summary,
        recommendations: result.recommendations,
        risk_factors: result.riskFactors,
        pdf_storage_path: storagePath,
      });

      // 4. Reload records and expand the new one
      await loadRecords();
      if (saved) setExpandedReport(saved.id);
      setUploadedFile(null);

      toast({
        title: "Report analyzed successfully",
        description: `${result.bloodTest.markers.length} markers extracted. Review and apply to your system.`,
      });
    } catch (err: any) {
      console.error("Analysis failed:", err);
      toast({ title: "Analysis failed", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress("");
    }
  };

  const handleApply = async (id: string) => {
    await applyBloodTestRecord(id);
    await loadRecords();
    toast({ title: "Report applied", description: "This data is now active across your dashboard and health system." });
  };

  const handleDecline = async (id: string) => {
    await declineBloodTestRecord(id);
    await loadRecords();
    toast({ title: "Report removed from system", description: "The data is no longer active but the report is kept." });
  };

  const handleDelete = async (id: string) => {
    await deleteBloodTestRecord(id);
    await loadRecords();
    toast({ title: "Report deleted" });
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Health Records</h1>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary-dark transition w-full sm:w-auto">
          <FileText className="w-4 h-4" /> Upload PDF
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Critical trend alerts */}
      {(() => {
        const trends = computeKeyTrends(allAppliedTests);
        const critical = trends.filter(t => t.severity === "critical" && t.direction === "up");
        if (critical.length === 0) return null;
        return (
          <div className="danger-gradient rounded-xl p-4 text-destructive-foreground">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                {critical.slice(0, 2).map(t => (
                  <div key={t.marker} className="mb-1 last:mb-0">
                    <p className="font-semibold text-sm">Critical: {t.marker} rose {Math.abs(t.changePct)}%</p>
                    <p className="text-xs opacity-90">{t.from} → {t.to} {t.unit}. Consult your doctor for follow-up testing.</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upload + Analyze */}
      <AnimatePresence>
        {uploadedFile && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              <button onClick={() => setUploadedFile(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {analysisProgress || "Analyzing..."}</>
                : <><Brain className="w-4 h-4" /> Upload &amp; Analyze with AI</>
              }
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Uploaded Reports Section ── */}
      {dbRecords.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wider">Uploaded Reports</h2>
          {[...dbRecords].reverse().map((record) => (
            <ReportCard
              key={record.id}
              record={record}
              onApply={() => handleApply(record.id)}
              onDecline={() => handleDecline(record.id)}
              onDelete={() => handleDelete(record.id)}
              onViewDetails={() => {}}
              isExpanded={expandedReport === record.id}
              onToggle={() => setExpandedReport(expandedReport === record.id ? null : record.id)}
            />
          ))}
        </div>
      )}

      {/* ── Auto-alerts (from applied tests) ── */}
      {alerts.length > 0 && (
        <div className="danger-gradient rounded-xl p-4 text-destructive-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Markers worsened &gt;20% since last test</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {alerts.map((a) => <span key={a.marker} className="text-xs px-2 py-0.5 rounded-full bg-white/20">{a.marker}: +{a.pct.toFixed(0)}%</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Blood Tests (hardcoded + applied DB) ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wider">Active Blood Tests</h2>
        {loading ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Loading records...</p>
          </div>
        ) : (
          [...allAppliedTests].reverse().map((test) => (
            <TestDateCard
              key={test.id}
              test={test}
              allTests={allAppliedTests}
              isExpanded={expandedTest === test.id}
              onToggle={() => setExpandedTest(expandedTest === test.id ? null : test.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
