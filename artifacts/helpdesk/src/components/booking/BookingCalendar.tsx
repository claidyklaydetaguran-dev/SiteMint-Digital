import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  useAvailabilityConfig,
  useAvailabilityDays,
  useAvailabilitySlots,
  useSubmitAppointmentRequest,
} from "@/hooks/useAvailability";
import type { DayReason } from "@/lib/availabilityApi";

type Step = "browse" | "contact" | "review" | "result";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKeyFor(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function todayDateKey(): string {
  const now = new Date();
  return dateKeyFor(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const DAY_LABELS: Record<DayReason, string> = {
  open: "Available",
  blocked: "Unavailable",
  outside_hours: "Outside business hours",
  fully_booked: "Fully booked",
  past_booking_window: "Too soon to book",
  beyond_advance_window: "Not yet open for booking",
};

const DAY_CELL_CLASSES: Record<DayReason, string> = {
  open: "border-primary/40 bg-surface-muted text-foreground hover:border-primary hover:bg-surface-muted/80 cursor-pointer",
  blocked: "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60",
  outside_hours: "border-border bg-background text-muted-foreground/60 cursor-not-allowed",
  fully_booked: "border-statusbadge-warning-bg bg-statusbadge-warning-bg/40 text-statusbadge-warning-text cursor-not-allowed",
  past_booking_window: "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50",
  beyond_advance_window: "border-border bg-background text-muted-foreground/40 cursor-not-allowed",
};

function formatSlotTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
}

function formatTimezoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * The customer-facing visual scheduling calendar (Checkpoint A). Sourced
 * from the same server-side availability engine the voice assistant will
 * use in a later checkpoint — this component never invents or assumes
 * availability; every state shown here came back from the API.
 */
export function BookingCalendar() {
  const configQuery = useAvailabilityConfig();
  const config = configQuery.data?.config;

  const [typeId, setTypeId] = useState<string | undefined>(undefined);
  const activeTypeId = typeId ?? config?.appointmentTypes[0]?.id;

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);

  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<Step>("browse");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [resultError, setResultError] = useState<string | null>(null);

  const monthStart = dateKeyFor(viewYear, viewMonth, 1);
  const monthEnd = dateKeyFor(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
  const daysQuery = useAvailabilityDays(monthStart, monthEnd, activeTypeId);
  const slotsQuery = useAvailabilitySlots(selectedDate, activeTypeId);
  const submitMutation = useSubmitAppointmentRequest();

  const dayByKey = useMemo(() => {
    const map = new Map<string, { reason: DayReason; slotCount: number }>();
    for (const d of daysQuery.data?.days ?? []) map.set(d.dateKey, { reason: d.reason, slotCount: d.slotCount });
    return map;
  }, [daysQuery.data]);

  const today = todayDateKey();
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).toLocaleDateString(undefined, {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  function goToMonth(delta: number) {
    const total = viewYear * 12 + (viewMonth - 1) + delta;
    setViewYear(Math.floor(total / 12));
    setViewMonth((total % 12) + 1);
    setSelectedDate(undefined);
    setSelectedSlot(undefined);
  }

  function selectDay(dateKey: string, reason: DayReason) {
    if (reason !== "open") return;
    setSelectedDate(dateKey);
    setSelectedSlot(undefined);
  }

  function selectSlot(startUtc: string) {
    setSelectedSlot(startUtc);
    setStep("contact");
  }

  async function handleSubmit() {
    if (!activeTypeId || !selectedSlot) return;
    setResultError(null);
    try {
      await submitMutation.mutateAsync({
        appointmentTypeId: activeTypeId,
        startUtc: selectedSlot,
        contact: { name: contactName.trim(), phone: contactPhone.trim() || null, email: contactEmail.trim() || null },
      });
      setStep("result");
    } catch (err) {
      const message = err instanceof Error ? err.message : "That slot is no longer available.";
      setResultError(message);
      setStep("browse");
      setSelectedSlot(undefined);
      // The slot list for this date is now stale (someone else likely took
      // it) — invalidate by re-selecting the same date to force a refetch.
      const d = selectedDate;
      setSelectedDate(undefined);
      requestAnimationFrame(() => setSelectedDate(d));
    }
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-2 text-sm text-muted-foreground">Loading availability…</span>
      </div>
    );
  }

  if (configQuery.isError || !config) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-statusbadge-danger-bg bg-statusbadge-danger-bg/30 p-6 text-sm text-statusbadge-danger-text">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        Temporarily unavailable — couldn't load availability. Please try again shortly.
      </div>
    );
  }

  if (step === "result") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-primary">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Request received</h3>
        <div className="mt-2 flex justify-center">
          <StatusBadge label="Pending review — not yet booked" tone="warning" />
        </div>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          Your preferred time has been sent to the business for review. This is not a confirmed
          appointment yet — you'll hear back to confirm the final time.
        </p>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={() => {
            setStep("browse");
            setSelectedDate(undefined);
            setSelectedSlot(undefined);
            setContactName("");
            setContactPhone("");
            setContactEmail("");
          }}
        >
          Book another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {config.appointmentTypes.length > 1 ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="appointment-type" className="text-xs text-muted-foreground">Appointment type</Label>
            <Select value={activeTypeId} onValueChange={(v) => { setTypeId(v); setSelectedDate(undefined); setSelectedSlot(undefined); }}>
              <SelectTrigger id="appointment-type" className="h-9 w-56 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.appointmentTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.durationMin} min)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-sm font-medium text-foreground">{config.appointmentTypes[0]?.name}</span>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Times shown in {formatTimezoneLabel(config.timezone)}
        </span>
      </div>

      {resultError && (
        <div className="flex items-center gap-2 rounded-lg border border-statusbadge-warning-bg bg-statusbadge-warning-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-warning-text">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {resultError}
        </div>
      )}

      {step === "contact" || step === "review" ? (
        <ContactAndReviewSteps
          step={step}
          setStep={setStep}
          typeName={config.appointmentTypes.find((t) => t.id === activeTypeId)?.name ?? ""}
          timezoneLabel={formatTimezoneLabel(config.timezone)}
          selectedSlot={selectedSlot}
          contactName={contactName}
          setContactName={setContactName}
          contactPhone={contactPhone}
          setContactPhone={setContactPhone}
          contactEmail={contactEmail}
          setContactEmail={setContactEmail}
          onSubmit={handleSubmit}
          submitting={submitMutation.isPending}
          onBack={() => { setStep("browse"); setSelectedSlot(undefined); }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Month calendar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekdayOfMonth(viewYear, viewMonth) }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth(viewYear, viewMonth) }, (_, i) => i + 1).map((day) => {
                const dateKey = dateKeyFor(viewYear, viewMonth, day);
                const info = dayByKey.get(dateKey);
                const isPast = dateKey < today;
                const reason: DayReason = isPast ? "past_booking_window" : info?.reason ?? "outside_hours";
                const isSelected = dateKey === selectedDate;
                const isLoadingDay = daysQuery.isLoading;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={reason !== "open" || isLoadingDay}
                    onClick={() => selectDay(dateKey, reason)}
                    title={DAY_LABELS[reason]}
                    aria-label={`${dateKey}: ${DAY_LABELS[reason]}`}
                    aria-pressed={isSelected}
                    className={`flex aspect-square min-h-11 items-center justify-center rounded-lg border text-sm transition-colors ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : isLoadingDay
                          ? "border-border bg-muted text-muted-foreground/40 animate-pulse"
                          : DAY_CELL_CLASSES[reason]
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <LegendDot className="bg-surface-muted border-primary/40" label="Available" />
              <LegendDot className="bg-statusbadge-warning-bg/40 border-statusbadge-warning-bg" label="Fully booked" />
              <LegendDot className="bg-muted border-border" label="Unavailable" />
            </div>
          </div>

          {/* Time slots */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {selectedDate
                ? new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
                : "Select a date"}
            </h3>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">Pick an available day on the calendar to see times.</p>
            ) : slotsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading times…
              </div>
            ) : slotsQuery.isError ? (
              <div className="flex items-center gap-2 text-sm text-statusbadge-danger-text">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> Temporarily unavailable.
              </div>
            ) : (slotsQuery.data?.slots.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No availability for this day.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                {slotsQuery.data!.slots.map((slot) => (
                  <button
                    key={slot.startUtc}
                    type="button"
                    onClick={() => selectSlot(slot.startUtc)}
                    className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-surface-muted"
                  >
                    {formatSlotTime(slot.startUtc, config.timezone)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full border ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function ContactAndReviewSteps({
  step,
  setStep,
  typeName,
  timezoneLabel,
  selectedSlot,
  contactName,
  setContactName,
  contactPhone,
  setContactPhone,
  contactEmail,
  setContactEmail,
  onSubmit,
  submitting,
  onBack,
}: {
  step: "contact" | "review";
  setStep: (s: Step) => void;
  typeName: string;
  timezoneLabel: string;
  selectedSlot: string | undefined;
  contactName: string;
  setContactName: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  onBack: () => void;
}) {
  const slotLabel = selectedSlot
    ? new Date(selectedSlot).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const canContinue = contactName.trim().length > 0;

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-5">
      <button type="button" onClick={onBack} className="mb-3 text-xs font-medium text-muted-foreground hover:text-foreground">
        ← Back to calendar
      </button>
      <div className="mb-4 rounded-lg bg-surface-muted p-3 text-sm">
        <div className="font-medium text-foreground">{typeName}</div>
        <div className="text-muted-foreground">{slotLabel} ({timezoneLabel})</div>
      </div>

      {step === "contact" ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="contact-name" className="text-xs">Name</Label>
            <Input id="contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={200} className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="contact-phone" className="text-xs">Phone (optional)</Label>
            <Input id="contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={40} className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="contact-email" className="text-xs">Email (optional)</Label>
            <Input id="contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200} className="mt-1 h-10" />
          </div>
          <Button className="mt-2 w-full" disabled={!canContinue} onClick={() => setStep("review")}>
            Review
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Name</dt><dd className="text-foreground">{contactName}</dd></div>
            {contactPhone && <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd className="text-foreground">{contactPhone}</dd></div>}
            {contactEmail && <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="text-foreground">{contactEmail}</dd></div>}
          </dl>
          <p className="text-xs text-muted-foreground">
            Submitting sends a request for this time — it is not confirmed until the business
            reviews and books it.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("contact")}>Edit</Button>
            <Button className="flex-1" onClick={onSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
