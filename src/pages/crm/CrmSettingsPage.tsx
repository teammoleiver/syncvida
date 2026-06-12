import PipelinesPage from "./PipelinesPage";
import { Workflow } from "lucide-react";

export default function CrmSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Workflow className="w-5 h-5 text-primary" /> Pipelines
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create and customize the pipelines and stages used by your deals.
        </p>
      </div>
      <PipelinesPage />
    </div>
  );
}