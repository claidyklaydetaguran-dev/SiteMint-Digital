import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAvailabilityConfig, useUpdateAvailabilityConfig } from "@/hooks/useAvailability";
import type { AvailabilityConfig, AppointmentType, DayHours } from "@/lib/availabilityApi";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function cloneConfig(config: AvailabilityConfig): AvailabilityConfig {
  return {
    ...config,
    weeklyHours: { ...config.weeklyHours },
    appointmentTypes: config.appointmentTypes.map((t) => ({ ...t })),
    blockedDates: [...config.blockedDates],
  };
}

/**
 * Development-only settings editor: this saves to the same in-memory,
 * per-process store the booking calendar reads from — it is NOT yet a
 * durable per-firm database setting (that requires a reviewed migration
 * not yet approved). Values reset if the server restarts.
 */
export function AvailabilitySettingsForm() {
  const { toast } = useToast();
  const configQuery = useAvailabilityConfig();
  const updateMutation = useUpdateAvailabilityConfig();
  const [draft, setDraft] = useState<AvailabilityConfig | null>(null);

  useEffect(() => {
    if (configQuery.data && !draft) setDraft(cloneConfig(configQuery.data.config));
  }, [configQuery.data, draft]);

  if (configQuery.isLoading || !draft) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading settings…
      </div>
    );
  }

  function updateDayHours(day: number, hours: DayHours | null) {
    setDraft((d) => (d ? { ...d, weeklyHours: { ...d.weeklyHours, [day]: hours } } : d));
  }

  function updateType(index: number, patch: Partial<AppointmentType>) {
    setDraft((d) => {
      if (!d) return d;
      const types = [...d.appointmentTypes];
      types[index] = { ...types[index]!, ...patch };
      return { ...d, appointmentTypes: types };
    });
  }

  function addType() {
    setDraft((d) =>
      d
        ? { ...d, appointmentTypes: [...d.appointmentTypes, { id: `type-${Date.now()}`, name: "New appointment type", durationMin: 30 }] }
        : d,
    );
  }

  function removeType(index: number) {
    setDraft((d) => (d ? { ...d, appointmentTypes: d.appointmentTypes.filter((_, i) => i !== index) } : d));
  }

  function addBlockedDate(dateKey: string) {
    if (!dateKey) return;
    setDraft((d) => (d && !d.blockedDates.includes(dateKey) ? { ...d, blockedDates: [...d.blockedDates, dateKey].sort() } : d));
  }

  function removeBlockedDate(dateKey: string) {
    setDraft((d) => (d ? { ...d, blockedDates: d.blockedDates.filter((k) => k !== dateKey) } : d));
  }

  function handleSave() {
    if (!draft) return;
    updateMutation.mutate(draft, {
      onSuccess: () => toast({ title: "Saved", description: "Availability settings updated (Development preview)." }),
      onError: (err) => toast({ title: "Save failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" }),
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-statusbadge-info-bg bg-statusbadge-info-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-info-text">
        Development preview — these settings are stored in server memory for this session and are
        not yet a durable, database-backed setting.
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Timezone</h3>
        <Input
          value={draft.timezone}
          onChange={(e) => setDraft((d) => (d ? { ...d, timezone: e.target.value } : d))}
          placeholder="America/Los_Angeles"
          className="h-9 max-w-xs text-sm"
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Weekly hours</h3>
        <div className="space-y-2">
          {WEEKDAY_LABELS.map((label, day) => {
            const hours = draft.weeklyHours[day] ?? null;
            return (
              <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="w-24 flex-shrink-0 text-sm text-foreground">{label}</span>
                {hours ? (
                  <>
                    <Input type="time" value={hours.start} onChange={(e) => updateDayHours(day, { ...hours, start: e.target.value })} className="h-8 w-28 text-xs" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input type="time" value={hours.end} onChange={(e) => updateDayHours(day, { ...hours, end: e.target.value })} className="h-8 w-28 text-xs" />
                    <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => updateDayHours(day, null)}>Mark closed</Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">Closed</span>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => updateDayHours(day, { start: "09:00", end: "17:00" })}>
                      Set hours
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Appointment types</h3>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addType}>
            <Plus className="h-3.5 w-3.5" /> Add type
          </Button>
        </div>
        <div className="space-y-2">
          {draft.appointmentTypes.map((type, i) => (
            <div key={type.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Input value={type.name} onChange={(e) => updateType(i, { name: e.target.value })} className="h-8 flex-1 min-w-[10rem] text-xs" />
              <Input
                type="number"
                min={5}
                max={480}
                value={type.durationMin}
                onChange={(e) => updateType(i, { durationMin: Number(e.target.value) })}
                className="h-8 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">min</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeType(i)} aria-label="Remove type" disabled={draft.appointmentTypes.length <= 1}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Buffer before (min)</Label>
          <Input type="number" min={0} max={240} value={draft.bufferBeforeMin} onChange={(e) => setDraft((d) => (d ? { ...d, bufferBeforeMin: Number(e.target.value) } : d))} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Buffer after (min)</Label>
          <Input type="number" min={0} max={240} value={draft.bufferAfterMin} onChange={(e) => setDraft((d) => (d ? { ...d, bufferAfterMin: Number(e.target.value) } : d))} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Minimum notice (hours)</Label>
          <Input type="number" min={0} max={720} value={draft.minNoticeHours} onChange={(e) => setDraft((d) => (d ? { ...d, minNoticeHours: Number(e.target.value) } : d))} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Booking window (days ahead)</Label>
          <Input type="number" min={1} max={365} value={draft.maxAdvanceDays} onChange={(e) => setDraft((d) => (d ? { ...d, maxAdvanceDays: Number(e.target.value) } : d))} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Slot interval (min)</Label>
          <Input type="number" min={5} max={240} value={draft.slotIntervalMin} onChange={(e) => setDraft((d) => (d ? { ...d, slotIntervalMin: Number(e.target.value) } : d))} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Daily limit (optional)</Label>
          <Input
            type="number"
            min={0}
            max={200}
            value={draft.dailyLimit ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, dailyLimit: e.target.value === "" ? null : Number(e.target.value) } : d))}
            className="mt-1 h-9 text-sm"
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Blocked dates (holidays, time off)</h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {draft.blockedDates.map((dateKey) => (
            <span key={dateKey} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground">
              {dateKey}
              <button type="button" onClick={() => removeBlockedDate(dateKey)} aria-label={`Remove ${dateKey}`} className="text-muted-foreground hover:text-foreground">
                ×
              </button>
            </span>
          ))}
          {draft.blockedDates.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
        </div>
        <Input
          type="date"
          className="h-8 w-40 text-xs"
          onChange={(e) => {
            addBlockedDate(e.target.value);
            e.target.value = "";
          }}
        />
      </section>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save settings"}
        </Button>
        {updateMutation.isError && (
          <span className="text-xs text-statusbadge-danger-text">
            {updateMutation.error instanceof Error ? updateMutation.error.message : "Save failed."}
          </span>
        )}
      </div>
    </div>
  );
}
