/**
 * Adding an appointment the business took itself — on the phone, or at the
 * counter.
 *
 * Without this, a booking taken off-system held no time at all: the slot stayed
 * "available", and the receptionist could hand the same time to the next caller.
 *
 * Two properties this deliberately keeps:
 *
 *  1. The times offered come from the SAME availability endpoints a caller
 *     sees. A manual entry therefore obeys the same hours, buffers, notice,
 *     booking window and daily caps as every other way in — rather than being a
 *     back door that can write a time the rules forbid.
 *
 *  2. It reports what actually happened. Creating the row and writing a
 *     calendar event are two steps, and the second can fail on its own — no
 *     calendar connected, the write refused. Only "booked" means a calendar
 *     anywhere knows about this appointment, and anything else says so plainly
 *     instead of claiming a booking that did not happen.
 */

import { useEffect, useMemo, useState } from "react";
import { useAvailabilitySlots, useSubmitAppointmentRequest } from "@/hooks/useAvailability";
import { useApproveAppointmentRequest } from "@/hooks/useCalendar";
import { isCalendarActionError } from "@/lib/calendarApi";
import type { AvailabilityConfig } from "@/lib/availabilityApi";
import { slotTime, timezoneAbbreviation } from "@/lib/schedulingDates";
import {
  ADD,
  addOutcomeCopy,
  emptyAddForm,
  validateAddAppointment,
  type AddAppointmentForm,
  type AddFieldErrors,
} from "@/pages/appointments/appointmentsContract";

function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AddAppointmentPanel({
  config,
  onClose,
  onDone,
}: {
  config: AvailabilityConfig | undefined;
  onClose: () => void;
  onDone: (notice: { title: string; detail: string; tone: "ok" | "warn" }) => void;
}) {
  const types = config?.appointmentTypes ?? [];
  const [form, setForm] = useState<AddAppointmentForm>(() => emptyAddForm(types[0]?.id ?? "", todayKey(new Date())));
  const [errors, setErrors] = useState<AddFieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useSubmitAppointmentRequest();
  const approve = useApproveAppointmentRequest();

  // Seed the service once the config arrives, without overwriting a choice the
  // business has already made.
  useEffect(() => {
    if (form.appointmentTypeId === "" && types[0]) {
      setForm((f) => ({ ...f, appointmentTypeId: types[0]!.id }));
    }
  }, [types, form.appointmentTypeId]);

  const slotsQuery = useAvailabilitySlots(
    form.dateKey === "" ? undefined : form.dateKey,
    form.appointmentTypeId === "" ? undefined : form.appointmentTypeId,
  );
  const slots = slotsQuery.data?.slots ?? [];
  const zone = config?.timezone ?? "UTC";
  const zoneLabel = useMemo(() => timezoneAbbreviation(zone), [zone]);

  // A slot chosen on one day must not survive a change of day or service — it
  // would submit a time the business is no longer looking at.
  const setField = (next: Partial<AddAppointmentForm>) =>
    setForm((f) => {
      const changed = next.dateKey !== undefined || next.appointmentTypeId !== undefined;
      return { ...f, ...next, ...(changed ? { startUtc: "" } : {}) };
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const validation = validateAddAppointment(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await submit.mutateAsync({
        appointmentTypeId: validation.payload.appointmentTypeId,
        startUtc: validation.payload.startUtc,
        contact: { name: validation.payload.name, phone: validation.payload.phone, email: validation.payload.email },
        options: {
          source: "manual",
          phoneConsent: validation.payload.phoneConsent,
          smsConsent: validation.payload.smsConsent,
          emailConsent: validation.payload.emailConsent,
        },
      });

      // The row exists and holds the time from here on. Confirmation is a
      // separate step that may legitimately not complete, so its failure is
      // reported — never treated as a failure of the whole action.
      let outcome: string | null = null;
      try {
        await approve.mutateAsync(created.request.id);
        outcome = "booked";
      } catch (err) {
        outcome = isCalendarActionError(err) ? err.reason : null;
      }
      onDone(addOutcomeCopy(outcome));
      onClose();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setFailure(status === 409 ? ADD.slotTakenDetail : err instanceof Error ? err.message : ADD.failedTitle);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sa-section sa-add" aria-labelledby="sa-add-h">
      <h2 className="sa-section__title" id="sa-add-h">{ADD.heading}</h2>
      <p className="sa-section__help">{ADD.detail}</p>

      {failure !== null && (
        <div className="sa-notice" data-tone="error" role="alert">
          <p className="sa-notice__title">{ADD.failedTitle}</p>
          <p className="sa-notice__detail">{failure}</p>
        </div>
      )}

      <form className="sa-add__form" onSubmit={handleSubmit} noValidate>
        <div className="sa-grid">
          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-add-type">{ADD.typeLabel}</label>
            <select
              id="sa-add-type"
              className="sa-input"
              value={form.appointmentTypeId}
              aria-invalid={errors.appointmentTypeId !== undefined}
              onChange={(e) => setField({ appointmentTypeId: e.target.value })}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>{`${t.name} · ${t.durationMin} min`}</option>
              ))}
            </select>
            {errors.appointmentTypeId && <p className="sa-field__error">{errors.appointmentTypeId}</p>}
          </div>

          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-add-date">{ADD.dateLabel}</label>
            <input
              id="sa-add-date"
              className="sa-input sa-input--date"
              type="date"
              value={form.dateKey}
              onChange={(e) => setField({ dateKey: e.target.value })}
            />
          </div>
        </div>

        <fieldset className="sa-add__slots">
          <legend className="sa-field__label">{`${ADD.slotHeading} (${zoneLabel})`}</legend>
          {slotsQuery.isLoading && <p className="sa-status" role="status" aria-live="polite">{ADD.slotsLoading}</p>}
          {slotsQuery.isError && <p className="sa-field__error">{ADD.slotsFailed}</p>}
          {!slotsQuery.isLoading && !slotsQuery.isError && slots.length === 0 && (
            <p className="sa-muted">{ADD.slotsEmpty}</p>
          )}
          {slots.length > 0 && (
            <div className="sa-add__slotgrid">
              {slots.map((slot) => (
                <button
                  key={slot.startUtc}
                  type="button"
                  className="sa-button sa-add__slot"
                  aria-pressed={form.startUtc === slot.startUtc}
                  data-selected={form.startUtc === slot.startUtc}
                  onClick={() => setForm((f) => ({ ...f, startUtc: slot.startUtc }))}
                >
                  {slotTime(slot.startUtc, zone)}
                </button>
              ))}
            </div>
          )}
          {errors.startUtc && <p className="sa-field__error">{errors.startUtc}</p>}
        </fieldset>

        <div className="sa-grid">
          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-add-name">{ADD.nameLabel}</label>
            <input
              id="sa-add-name"
              className="sa-input"
              maxLength={200}
              value={form.name}
              aria-invalid={errors.name !== undefined}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {errors.name && <p className="sa-field__error">{errors.name}</p>}
          </div>
          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-add-phone">{ADD.phoneLabel}</label>
            <input id="sa-add-phone" className="sa-input" type="tel" maxLength={40} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-add-email">{ADD.emailLabel}</label>
            <input id="sa-add-email" className="sa-input" type="email" maxLength={200} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </div>

        <fieldset className="sa-add__consent">
          <legend className="sa-field__label">{ADD.consentHeading}</legend>
          <p className="sa-field__help">{ADD.consentHelp}</p>
          <label className="sa-check" htmlFor="sa-add-consent-phone">
            <input id="sa-add-consent-phone" type="checkbox" checked={form.phoneConsent} onChange={(e) => setForm((f) => ({ ...f, phoneConsent: e.target.checked }))} />
            <span>{ADD.phoneConsentLabel}</span>
          </label>
          <label className="sa-check" htmlFor="sa-add-consent-sms">
            <input id="sa-add-consent-sms" type="checkbox" checked={form.smsConsent} onChange={(e) => setForm((f) => ({ ...f, smsConsent: e.target.checked }))} />
            <span>{ADD.smsConsentLabel}</span>
          </label>
          <label className="sa-check" htmlFor="sa-add-consent-email">
            <input id="sa-add-consent-email" type="checkbox" checked={form.emailConsent} onChange={(e) => setForm((f) => ({ ...f, emailConsent: e.target.checked }))} />
            <span>{ADD.emailConsentLabel}</span>
          </label>
        </fieldset>

        <div className="sa-add__actions">
          <button type="submit" className="sa-button sa-button--primary" disabled={busy} aria-busy={busy}>
            {busy ? ADD.submitPendingLabel : ADD.submitLabel}
          </button>
          <button type="button" className="sa-button sa-button--quiet" onClick={onClose} disabled={busy}>
            {ADD.cancelLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
