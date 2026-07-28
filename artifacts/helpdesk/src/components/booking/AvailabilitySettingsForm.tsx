import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAvailabilityConfig, useUpdateAvailabilityConfig, useSetPublicSchedulingLink, useCalendarStatus } from "@/hooks/useAvailability";
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
 * Checkpoint B: saves to durable, firm-scoped Postgres records
 * (scheduling_availability_settings / _weekly_hours / _appointment_types) —
 * values persist across server restarts.
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
      onSuccess: () => toast({ title: "Saved", description: "Availability settings updated." }),
      onError: (err) => toast({ title: "Save failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" }),
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-lg border border-statusbadge-info-bg bg-statusbadge-info-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-info-text">
        Development database — these settings are saved to your firm's own durable record and
        persist across server restarts. No real calendar is connected until Google Calendar
        free/busy is enabled, and no appointment here can become "Booked" until then.
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
              <div key={day} className="rounded-lg border border-border px-3 py-2">
                {/* Day name + toggle button — always on one line */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {hours ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateDayHours(day, null)}>
                      Mark closed
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateDayHours(day, { start: "09:00", end: "17:00" })}>
                      Set hours
                    </Button>
                  )}
                </div>
                {/* Time pickers: stacked with Start/End labels on mobile, inline on sm+ */}
                {hours ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Start</span>
                      <Input
                        type="time"
                        value={hours.start}
                        onChange={(e) => updateDayHours(day, { ...hours, start: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">End</span>
                      <Input
                        type="time"
                        value={hours.end}
                        onChange={(e) => updateDayHours(day, { ...hours, end: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Closed</p>
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

      <CalendarStatusSection />

      <PublicLinkSection />

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

/**
 * Honest read-only-calendar connection status — never a calendar id or
 * account email, connected or not. Availability always falls back safely
 * (SiteMint rules only) when no calendar is connected.
 */
function CalendarStatusSection() {
  const statusQuery = useCalendarStatus();
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Google Calendar (read-only)</h3>
      {statusQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Checking connection…</p>
      ) : statusQuery.data?.connected ? (
        <p className="text-xs text-statusbadge-success-text">
          Connected — busy times from your Development calendar are combined with the rules
          below. SiteMint never creates, changes, or deletes a calendar event.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not connected. Availability is calculated from the rules below only. Connecting a
          calendar requires owner approval for a separate checkpoint.
        </p>
      )}
    </section>
  );
}

/**
 * Enables/disables the public scheduling page. The slug is server-generated
 * and opaque — never derived from the firm's internal id or name — so
 * disabling and re-enabling issues a brand-new, unguessable link rather than
 * reusing or predicting the previous one.
 */
function PublicLinkSection() {
  const { toast } = useToast();
  const linkMutation = useSetPublicSchedulingLink();
  const [slug, setSlug] = useState<string | null>(null);

  const publicUrl = slug ? `${window.location.origin}${window.location.pathname.replace(/\/appointments.*$/, "")}/schedule/${slug}` : null;

  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Public scheduling page</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Generates a link you can share or embed on your own website. Visitors don't need an
        account — every request they submit lands as Pending review, same as the preview above.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={linkMutation.isPending}
          onClick={() =>
            linkMutation.mutate(true, {
              onSuccess: (res) => {
                setSlug(res.slug);
                toast({ title: "Public link enabled" });
              },
              onError: (err) => toast({ title: "Failed to enable link", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
            })
          }
        >
          {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable public link"}
        </Button>
        {slug && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() =>
              linkMutation.mutate(false, {
                onSuccess: () => { setSlug(null); toast({ title: "Public link disabled" }); },
              })
            }
          >
            Disable
          </Button>
        )}
      </div>
      {publicUrl && (
        <div className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-xs text-foreground">{publicUrl}</div>
      )}
    </section>
  );
}
