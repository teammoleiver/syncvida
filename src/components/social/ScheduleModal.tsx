import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

/** LinkedIn-style "Schedule post" modal. Returns chosen date (YYYY-MM-DD)
 *  and time (HH:MM, 24h) via onConfirm. */
export default function ScheduleModal({
  open,
  onClose,
  onConfirm,
  initialDate,
  initialTime,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (date: string, time: string) => void | Promise<void>;
  initialDate?: string;
  initialTime?: string;
  busy?: boolean;
}) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("13:00");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialDate) {
      const [y, m, d] = initialDate.split("-").map(Number);
      setDate(new Date(y, (m ?? 1) - 1, d ?? 1));
    } else {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      setDate(t);
    }
    setTime((initialTime || "13:00").slice(0, 5));
  }, [open, initialDate, initialTime]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const headerLine = (() => {
    if (!date) return "";
    const d = new Date(date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (tz ? ` ${tz}` : "");
  })();

  // 15-minute slot list
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) for (let m of [0, 15, 30, 45]) slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

  function submit() {
    if (!date) return;
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const da = String(date.getDate()).padStart(2, "0");
    onConfirm(`${y}-${mo}-${da}`, time);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-lg font-semibold">Schedule post</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">{headerLine}, based on your location</p>

          <div className="space-y-1.5">
            <Label className="text-sm">Date</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span>{date ? date.toLocaleDateString() : "Pick a date"}</span>
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setPickerOpen(false); }}
                  disabled={(d) => { const x = new Date(); x.setHours(0,0,0,0); return d < x; }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Time</Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span>{formatTime12(time)}</span>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-0">
                <div className="max-h-64 overflow-y-auto">
                  {slots.map((s) => (
                    <button
                      key={s}
                      onClick={() => setTime(s)}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${s === time ? "bg-muted font-medium" : ""}`}
                    >
                      {formatTime12(s)}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div className="pt-1">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-xs h-8" />
            </div>
          </div>

          <Link to="/content-planner" onClick={onClose} className="block text-sm text-primary hover:underline pt-1">
            View all scheduled posts →
          </Link>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" className="rounded-full px-5" onClick={onClose} disabled={busy}>Back</Button>
          <Button className="rounded-full px-5" onClick={submit} disabled={busy || !date}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}