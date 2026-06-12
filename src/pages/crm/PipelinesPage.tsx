import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listPipelines, createPipeline, deletePipeline, listStages, createStage, deleteStage, updateStage, updatePipeline } from "@/lib/crm-queries";

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<string, any[]>>({});
  const [newName, setNewName] = useState("");

  async function load() {
    const ps = await listPipelines();
    setPipelines(ps);
    const map: Record<string, any[]> = {};
    for (const p of ps) map[p.id] = await listStages(p.id);
    setStagesMap(map);
  }
  useEffect(() => { load(); }, []);

  async function addPipeline() {
    if (!newName.trim()) return;
    await createPipeline(newName.trim());
    setNewName(""); toast.success("Pipeline created"); load();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Input placeholder="New pipeline name…" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
          <Button size="sm" onClick={addPipeline}><Plus className="w-4 h-4 mr-1" />Create pipeline</Button>
        </div>
      </Card>

      {pipelines.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
              <Input className="max-w-[260px] font-semibold" value={p.name} onChange={(e) => setPipelines((arr) => arr.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))}
                onBlur={(e) => updatePipeline(p.id, { name: e.target.value })} />
              {p.is_default && <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">default</span>}
            </div>
            {!p.is_default && (
              <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete pipeline and all its deals?")) { await deletePipeline(p.id); load(); } }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            )}
          </div>
          <div className="space-y-1.5">
            {(stagesMap[p.id] ?? []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5">
                <input type="color" value={s.color} onChange={(e) => updateStage(s.id, { color: e.target.value }).then(load)} className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent" />
                <Input className="h-7 flex-1" defaultValue={s.name} onBlur={(e) => updateStage(s.id, { name: e.target.value })} />
                <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!s.is_won} onChange={(e) => updateStage(s.id, { is_won: e.target.checked }).then(load)} />Won</label>
                <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!s.is_lost} onChange={(e) => updateStage(s.id, { is_lost: e.target.checked }).then(load)} />Lost</label>
                <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete stage?")) { await deleteStage(s.id); load(); } }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={async () => { const name = prompt("Stage name?"); if (name) { await createStage(p.id, name); load(); } }}><Plus className="w-3 h-3 mr-1" />Add stage</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}