/**
 * V5 PR-7 — the Test Booking flow: browse → hold/continue → create a test
 * request. Split out of the Frontend V2 Phase 13 combined Appointments
 * workspace and relabelled for `pages/TestBooking.tsx` — see
 * `pages/test-booking/testBookingContract.ts`.
 *
 * The browser never decides whether a day or a time is available: it renders
 * the `reason` the days endpoint returned and the slot list the slots
 * endpoint returned. Hold and submit remain two independent activations, for
 * the same reason Phase 13 documented: a hold blocks its own slot server-side,
 * so chaining them into one flow could never succeed.
 *
 * The one behavioural change: the contact-details step always saves a
 * `TEST — `-prefixed name (`withTestPrefix`), and the button that submits is
 * labelled "Create test request" rather than "Submit request" — this route
 * can never produce a row a client would mistake as their own.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useAvailabilityDays, useAvailabilitySlots, useHoldSlot, useSubmitAppointmentRequest } from "@/hooks/useAvailability";
import type { AvailabilityConfig, DayReason } from "@/lib/availabilityApi";
import {
  LEGEND_TONE,
  WEEKDAY_INITIALS,
  dateKey as makeKey,
  dayLabel,
  dayLegend,
  dayReasonLabel,
  daysInMonth,
  firstWeekdayOfMonth,
  isSelectableDay,
  monthLabel,
  monthRange,
  shiftMonth,
  slotDateTime,
  slotTime,
  timezoneAbbreviation,
} from "@/lib/schedulingDates";
import { PREVIEW, activeAppointmentTypeId, withTestPrefix } from "@/pages/test-booking/testBookingContract";

type Step = "browse" | "contact" | "submitted" | "held";
type Outcome = null | "holdConflict" | "holdFailed" | "submitConflict" | "submitFailed";

export function BookingCalendar({
  config,
  isLoading,
  isError,
}: {
  config: AvailabilityConfig | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const now = new Date();
  const [typeId, setTypeId] = useState<string | undefined>(undefined);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<Step>("browse");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const activeTypeId = activeAppointmentTypeId(config, typeId);
  const timezone = config?.timezone ?? "UTC";
  const tzLabel = useMemo(() => timezoneAbbreviation(timezone), [timezone]);

  const { start, end } = monthRange(viewYear, viewMonth);
  const daysQuery = useAvailabilityDays(start, end, activeTypeId);
  const slotsQuery = useAvailabilitySlots(selectedDate, activeTypeId);
  const holdMutation = useHoldSlot();
  const submitMutation = useSubmitAppointmentRequest();

  const dayReasonByKey = useMemo(() => {
    const map = new Map<string, DayReason>();
    for (const d of daysQuery.data?.days ?? []) map.set(d.dateKey, d.reason);
    return map;
  }, [daysQuery.data]);

  const goToMonth = (delta: number) => {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    setSelectedDate(undefined);
    setSelectedSlot(undefined);
    setOutcome(null);
  };

  const handleHold = useCallback(async () => {
    if (!activeTypeId || !selectedSlot || holdMutation.isPending) return;
    setOutcome(null);
    try {
      const res = await holdMutation.mutateAsync({ appointmentTypeId: activeTypeId, startUtc: selectedSlot });
      setHeldUntil(res.request.holdExpiresAt);
      setStep("held");
    } catch (err) {
      const status = (err as { status?: number }).status;
      setOutcome(status === 409 ? "holdConflict" : "holdFailed");
      setSelectedSlot(undefined);
      outcomeRef.current?.focus();
    }
  }, [activeTypeId, selectedSlot, holdMutation]);

  const handleSubmit = useCallback(async () => {
    if (!activeTypeId || !selectedSlot || submitMutation.isPending) return;
    if (name.trim() === "") {
      setNameTouched(true);
      nameRef.current?.focus();
      return;
    }
    setOutcome(null);
    try {
      await submitMutation.mutateAsync({
        appointmentTypeId: activeTypeId,
        startUtc: selectedSlot,
        contact: { name: withTestPrefix(name), phone: phone.trim() || null, email: email.trim() || null },
      });
      setStep("submitted");
    } catch (err) {
      const status = (err as { status?: number }).status;
      setOutcome(status === 409 ? "submitConflict" : "submitFailed");
      if (status === 409) {
        setStep("browse");
        setSelectedSlot(undefined);
      }
      outcomeRef.current?.focus();
    }
  }, [activeTypeId, selectedSlot, name, phone, email, submitMutation]);

  const restart = () => {
    setStep("browse");
    setSelectedSlot(undefined);
    setSelectedDate(undefined);
    setOutcome(null);
    setHeldUntil(null);
    setName("");
    setPhone("");
    setEmail("");
    setNameTouched(false);
  };

  if (isLoading) {
    return <p className="sa-status" role="status" aria-live="polite">{PREVIEW.slotsLoading}</p>;
  }
  if (isError || !config) {
    return (
      <div className="sa-notice" data-tone="error" role="alert">
        <p className="sa-notice__title">{PREVIEW.readFailed}</p>
      </div>
    );
  }
  if (config.appointmentTypes.length === 0) {
    return (
      <section className="sa-empty" aria-labelledby="sa-no-types">
        <h2 className="sa-empty__title" id="sa-no-types">{PREVIEW.noTypesTitle}</h2>
        <p className="sa-empty__detail">{PREVIEW.noTypesDetail}</p>
      </section>
    );
  }

  if (step === "submitted" || step === "held") {
    const submitted = step === "submitted";
    return (
      <section className="sa-result" aria-labelledby="sa-result-title">
        <p className="sa-result__state" data-tone={submitted ? "attention" : "neutral"}>
          {submitted ? PREVIEW.resultState : PREVIEW.heldState}
        </p>
        <h2 className="sa-result__title" id="sa-result-title">{submitted ? PREVIEW.resultTitle : PREVIEW.heldTitle}</h2>
        <p className="sa-result__detail">{submitted ? PREVIEW.resultDetail : PREVIEW.heldDetail}</p>
        {!submitted && heldUntil !== null && (
          <p className="sa-result__meta">{PREVIEW.heldUntilPrefix} {slotDateTime(heldUntil, timezone)} ({tzLabel})</p>
        )}
        <button type="button" className="sa-button" onClick={restart}>{submitted ? PREVIEW.resultAgain : PREVIEW.resultAgain}</button>
      </section>
    );
  }

  return (
    <div className="sa-preview">
      <div className="sa-preview__head">
        <div className="sa-preview__controls">
          {config.appointmentTypes.length > 1 ? (
            <div className="sa-field sa-field--inline">
              <label className="sa-field__label" htmlFor="sa-type">{PREVIEW.typeLabel}</label>
              <select
                id="sa-type" className="sa-select" value={activeTypeId}
                onChange={(e) => { setTypeId(e.target.value); setSelectedDate(undefined); setSelectedSlot(undefined); setOutcome(null); }}
              >
                {config.appointmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.durationMin} min</option>)}
              </select>
            </div>
          ) : (
            <p className="sa-preview__type">{config.appointmentTypes[0]!.name} · {config.appointmentTypes[0]!.durationMin} min</p>
          )}
          <p className="sa-preview__tz">Times in {tzLabel}</p>
        </div>
      </div>

      <div className="sa-outcome" ref={outcomeRef} tabIndex={-1} role="alert" aria-live="assertive" hidden={outcome === null}>
        {outcome !== null && (
          <div className="sa-notice" data-tone={outcome === "holdConflict" || outcome === "submitConflict" ? "attention" : "error"}>
            <p className="sa-notice__title">
              {outcome === "holdConflict" ? PREVIEW.holdConflictTitle
                : outcome === "holdFailed" ? PREVIEW.holdFailedTitle
                : outcome === "submitConflict" ? PREVIEW.conflictTitle
                : PREVIEW.createFailedTitle}
            </p>
            <p className="sa-notice__detail">
              {outcome === "holdConflict" ? PREVIEW.holdConflictDetail
                : outcome === "holdFailed" ? PREVIEW.holdFailedDetail
                : outcome === "submitConflict" ? PREVIEW.conflictDetail
                : PREVIEW.createFailedDetail}
            </p>
          </div>
        )}
      </div>

      {step === "contact" ? (
        <section className="sa-form" aria-labelledby="sa-contact-title">
          <button type="button" className="sa-back" onClick={() => { setStep("browse"); setOutcome(null); }}>{PREVIEW.back}</button>
          <h2 className="sa-form__title" id="sa-contact-title">{PREVIEW.contactHeading}</h2>
          <p className="sa-form__slot">{selectedSlot ? slotDateTime(selectedSlot, timezone) : ""} ({tzLabel})</p>

          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-name">{PREVIEW.nameLabel}</label>
            <input
              id="sa-name" ref={nameRef} className="sa-input" value={name} maxLength={200} autoComplete="off"
              aria-invalid={nameTouched && name.trim() === ""}
              aria-describedby={nameTouched && name.trim() === "" ? "sa-name-error" : undefined}
              onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)}
            />
            {nameTouched && name.trim() === "" && <p className="sa-field__error" id="sa-name-error">{PREVIEW.nameRequired}</p>}
          </div>

          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-phone">{PREVIEW.phoneLabel}</label>
            <input id="sa-phone" className="sa-input" type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-email">{PREVIEW.emailLabel}</label>
            <input id="sa-email" className="sa-input" type="email" inputMode="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <p className="sa-disclosure">{PREVIEW.disclosure}</p>

          <button type="button" className="sa-button sa-button--primary" onClick={handleSubmit} disabled={submitMutation.isPending} aria-busy={submitMutation.isPending}>
            {submitMutation.isPending ? PREVIEW.createPendingLabel : PREVIEW.createLabel}
          </button>
        </section>
      ) : (
        <div className="sa-browse">
          <section className="sa-calendar" aria-labelledby="sa-month">
            <div className="sa-calendar__head">
              <button type="button" className="sa-step" onClick={() => goToMonth(-1)} aria-label="Previous month">‹</button>
              <h2 className="sa-calendar__month" id="sa-month">{monthLabel(viewYear, viewMonth)}</h2>
              <button type="button" className="sa-step" onClick={() => goToMonth(1)} aria-label="Next month">›</button>
            </div>

            <div className="sa-calendar__weekdays" aria-hidden="true">
              {WEEKDAY_INITIALS.map((d, i) => <span key={i}>{d}</span>)}
            </div>

            <div className="sa-calendar__grid" role="group" aria-label={`${monthLabel(viewYear, viewMonth)} availability`}>
              {Array.from({ length: firstWeekdayOfMonth(viewYear, viewMonth) }).map((_, i) => (
                <span key={`pad-${i}`} className="sa-day sa-day--pad" aria-hidden="true" />
              ))}
              {Array.from({ length: daysInMonth(viewYear, viewMonth) }, (_, i) => i + 1).map((day) => {
                const key = makeKey(viewYear, viewMonth, day);
                const reason = dayReasonByKey.get(key);
                const open = isSelectableDay(reason);
                const tone = reason ? LEGEND_TONE[reason] : "closed";
                return (
                  <button
                    key={key} type="button" className="sa-day" data-tone={tone} data-selected={key === selectedDate}
                    disabled={!open || daysQuery.isLoading} aria-pressed={key === selectedDate}
                    aria-label={`${dayLabel(key)} — ${dayReasonLabel(reason)}`}
                    onClick={() => { setSelectedDate(key); setSelectedSlot(undefined); setOutcome(null); }}
                  >
                    <span className="sa-day__num">{day}</span>
                    <span className="sa-day__mark" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <ul className="sa-legend">
              {dayLegend().map((item) => <li key={item.tone} className="sa-legend__item" data-tone={item.tone}>{item.label}</li>)}
            </ul>
          </section>

          <section className="sa-times" aria-labelledby="sa-times-title">
            <h2 className="sa-times__title" id="sa-times-title">{selectedDate ? dayLabel(selectedDate) : PREVIEW.pickDay}</h2>

            {!selectedDate ? (
              <p className="sa-times__hint">{PREVIEW.pickDayDetail}</p>
            ) : slotsQuery.isLoading ? (
              <p className="sa-status" role="status" aria-live="polite">{PREVIEW.slotsLoading}</p>
            ) : slotsQuery.isError ? (
              <div className="sa-notice" data-tone="error" role="alert"><p className="sa-notice__title">{PREVIEW.slotsFailed}</p></div>
            ) : (slotsQuery.data?.slots.length ?? 0) === 0 ? (
              <p className="sa-times__hint">{PREVIEW.slotsEmpty}</p>
            ) : (
              <>
                <ul className="sa-slots">
                  {slotsQuery.data!.slots.map((slot) => (
                    <li key={slot.startUtc}>
                      <button
                        type="button" className="sa-slot" data-selected={slot.startUtc === selectedSlot} aria-pressed={slot.startUtc === selectedSlot}
                        onClick={() => { setSelectedSlot(slot.startUtc); setOutcome(null); }}
                      >
                        {slotTime(slot.startUtc, timezone)}
                      </button>
                    </li>
                  ))}
                </ul>

                {selectedSlot !== undefined && (
                  <div className="sa-chosen">
                    <p className="sa-chosen__time">{slotDateTime(selectedSlot, timezone)}</p>
                    <div className="sa-chosen__actions">
                      <button type="button" className="sa-button sa-button--primary" onClick={() => { setStep("contact"); setOutcome(null); }}>{PREVIEW.continueLabel}</button>
                      <button type="button" className="sa-button" onClick={handleHold} disabled={holdMutation.isPending} aria-busy={holdMutation.isPending}>
                        {holdMutation.isPending ? PREVIEW.holdPendingLabel : PREVIEW.holdLabel}
                      </button>
                    </div>
                    <p className="sa-chosen__note">{PREVIEW.chooseNote}</p>
                    <p className="sa-chosen__note">{PREVIEW.holdNote}</p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
