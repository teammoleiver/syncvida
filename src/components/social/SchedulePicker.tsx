import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Check, CalendarDays } from "lucide-react";

export type ScheduleResult = {
  scheduled_date: string | null;  // YYYY-MM-DD
  scheduled_time: string | null;  // HH:MM (24h)
};

/**
 * Compact popover that lets the user pick a date + optional time before
 * sending an item to the Content Planner. Quick-pick chips cover the
 * 90% case (Today, Tomorrow, Next Monday) and a calendar handles the rest.
 */
export default function SchedulePicker({
  trigger,
  onSchedule,
  busy,
  saved,
  defaultTime = "09:00",
}: {
  trigger?: React.ReactNode;
  onSchedule: (r: ScheduleResult) => Promise<void> | void;
  busy?: boolean;
  saved?: boolean;
  defaultTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>(defaultTime);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextMonday = (() => {
    const d = new Date(today);
    const days = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + days);
    return d;
  })();

  async function submit(d: Date | null) {
    const r: ScheduleResult = {
      scheduled_date: d ? toIsoDate(d) : null,
      scheduled_time: d ? time : null,
    };
    await onSchedule(r);
    setOpen(false);
    setDate(undefined);
    setTime(defaultTime);
  }

  return (
    <Popover open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant={saved ? "secondary" : "outline"} disabled={busy || saved}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-primary" /> : <Plus className="w-3.5 h-3.5" />}
            {saved ? " Scheduled" : " Add to planner"}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="w-4 h-4 text-primary" /> Schedule on the planner
        </div>

        {/* Quick picks */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => submit(today)} disabled={busy}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => submit(tomorrow)} disabled={busy}>Tomorrow</Button>
          <Button size="sm" variant="outline" onClick={() => submit(nextMonday)} disabled={busy}>Next Monday</Button>
          <Button size="sm" variant="ghost" onClick={() => submit(null)} disabled={busy} title="Add without a date">No date</Button>
        </div>

        <div className="border-t border-border pt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-2">Pick a custom date</div>
          <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border border-border" />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Time</label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-xs" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => submit(date ?? null)} disabled={busy || !date}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            Add to planner
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toIsoDate(d: Date): string {
  // Local date in YYYY-MM-DD (no UTC shift, since planner uses date-only)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
