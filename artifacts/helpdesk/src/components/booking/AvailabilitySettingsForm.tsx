/**
 * Frontend V2 Phase 13 — the Availability view.
 *
 * The rules the server uses to compute availability, edited against the exact
 * existing `PUT .../availability/config` contract: the same field names, the
 * same shape, the whole config on every save. The server is the authority on
 * what is valid. A rejected value is never quietly rewritten into an accepted
 * one — the 400's own sentence is shown, at the field it names when it names
 * one and at the form otherwise, and the value the operator typed stays on
 * screen so they can see what was refused.
 *
 * There is no `<form>` element and every control is `type="button"`, so no
 * stray Enter keypress in a text field can submit the settings. Saving happens
 * only when the Save button is activated.
 *
 * Two sibling sections read their own state: the calendar connection
 * (`GET .../calendar-status`, one request when this view first opens) and the
 * public scheduling link, which has no read endpoint at all and therefore says
 * so instead of drawing a toggle in a guessed position.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCalendarStatus,
  useSetPublicSchedulingLink,
  useUpdateAvailabilityConfig,
} from "@/hooks/useAvailability";
import type { AvailabilityConfig, DayHours } from "@/lib/availabilityApi";
import {
  AVAILABILITY,
  CALENDAR,
  PUBLIC_LINK,
  WEEKDAY_NAMES,
  calendarCopy,
  fieldForError,
  publicLinkActions,
  publicLinkUrlVisible,
  publicScheduleUrl,
  saveErrorDetail,
  type CalendarState,
  type ConfigField,
  type PublicLinkKnownState,
  type PublicLinkState,
} from "@/pages/appointments/appointmentsContract";

type SaveState = "idle" | "pending" | "saved" | "invalid" | "failed";

function clone(config: AvailabilityConfig): AvailabilityConfig {
  return {
    ...config,
    weeklyHours: { ...config.weeklyHours },
    appointmentTypes: config.appointmentTypes.map((t) => ({ ...t })),
    blockedDates: [...config.blockedDates],
  };
}

export function AvailabilitySettingsForm({
  config,
  isLoading,
  isError,
}: {
  config: AvailabilityConfig | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const updateMutation = useUpdateAvailabilityConfig();
  const [draft, setDraft] = useState<AvailabilityConfig | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const seeded = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Seeded once, from the config the page already fetched. Later renders must
  // not overwrite edits in progress.
  useEffect(() => {
    if (!seeded.current && config) {
      seeded.current = true;
      setDraft(clone(config));
    }
  }, [config]);

  const patch = (next: Partial<AvailabilityConfig>) =>
    setDraft((d) => (d ? { ...d, ...next } : d));

  const setDay = (day: number, hours: DayHours | null) =>
    setDraft((d) => (d ? { ...d, weeklyHours: { ...d.weeklyHours, [day]: hours } } : d));

  const setType = (index: number, key: "name" | "durationMin", value: string) =>
    setDraft((d) => {
      if (!d) return d;
      const types = [...d.appointmentTypes];
      const current = types[index]!;
      types[index] = key === "name"
        ? { ...current, name: value }
        : { ...current, durationMin: value === "" ? 0 : Number(value) };
      return { ...d, appointmentTypes: types };
    });

  const num = (value: string, fallback: number) => (value === "" ? fallback : Number(value));

  /** One PUT per activation. Guarded, and the button is disabled while pending. */
  const handleSave = useCallback(async () => {
    if (!draft || save === "pending") return;
    setSave("pending");
    setErrorText(null);
    try {
      const res = await updateMutation.mutateAsync(draft);
      // Show what the server stored, so any normalisation is visible rather
      // than hidden behind the values that were typed.
      setDraft(clone(res.config));
      setSave("saved");
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : null;
      setErrorText(message);
      setSave(status === 400 ? "invalid" : "failed");
    } finally {
      resultRef.current?.focus();
    }
  }, [draft, save, updateMutation]);

  if (isLoading || (!draft && !isError)) {
    return <p className="sa-status" role="status" aria-live="polite">{AVAILABILITY.loading}</p>;
  }

  if (isError || !draft) {
    return (
      <div className="sa-notice" data-tone="error" role="alert">
        <p className="sa-notice__title">{AVAILABILITY.failed}</p>
      </div>
    );
  }

  const badField: ConfigField | null = save === "invalid" ? fieldForError(errorText) : null;
  const fieldError = (field: ConfigField) =>
    badField === field ? saveErrorDetail(errorText) : null;

  return (
    <div className="sa-settings">
      <p className="sa-settings__detail">{AVAILABILITY.detail}</p>

      {/* Time zone */}
      <section className="sa-section" aria-labelledby="sa-tz-h">
        <h2 className="sa-section__title" id="sa-tz-h">{AVAILABILITY.timezoneHeading}</h2>
        <div className="sa-field">
          <label className="sa-field__label" htmlFor="sa-tz">{AVAILABILITY.timezoneLabel}</label>
          <input
            id="sa-tz"
            className="sa-input sa-input--wide"
            value={draft.timezone}
            maxLength={100}
            aria-invalid={fieldError("timezone") !== null}
            aria-describedby={fieldError("timezone") !== null ? "sa-tz-error" : "sa-tz-help"}
            onChange={(e) => patch({ timezone: e.target.value })}
          />
          {fieldError("timezone") !== null ? (
            <p className="sa-field__error" id="sa-tz-error">{fieldError("timezone")}</p>
          ) : (
            <p className="sa-field__help" id="sa-tz-help">{AVAILABILITY.timezoneHelp}</p>
          )}
        </div>
      </section>

      {/* Weekly hours */}
      <section className="sa-section" aria-labelledby="sa-hours-h">
        <h2 className="sa-section__title" id="sa-hours-h">{AVAILABILITY.hoursHeading}</h2>
        <p className="sa-section__help">{AVAILABILITY.hoursHelp}</p>
        {fieldError("weeklyHours") !== null && (
          <p className="sa-field__error">{fieldError("weeklyHours")}</p>
        )}
        <div className="sa-days__legend" aria-hidden="true">
          <span />
          <span>{AVAILABILITY.startLabel}</span>
          <span>{AVAILABILITY.endLabel}</span>
        </div>
        <ul className="sa-days">
          {WEEKDAY_NAMES.map((label, day) => {
            const hours = draft.weeklyHours[day] ?? null;
            return (
              <li key={label} className="sa-days__row">
                <span className="sa-days__name">{label}</span>
                {hours ? (
                  <div className="sa-days__hours">
                    {/* Labelled once above; each input keeps its own label for
                        assistive technology, hidden visually rather than dropped. */}
                    <label className="sa-vh" htmlFor={`sa-start-${day}`}>{`${label} ${AVAILABILITY.startLabel}`}</label>
                    <input
                      id={`sa-start-${day}`}
                      className="sa-input sa-input--time"
                      type="time"
                      value={hours.start}
                      onChange={(e) => setDay(day, { ...hours, start: e.target.value })}
                    />
                    <label className="sa-vh" htmlFor={`sa-end-${day}`}>{`${label} ${AVAILABILITY.endLabel}`}</label>
                    <input
                      id={`sa-end-${day}`}
                      className="sa-input sa-input--time"
                      type="time"
                      value={hours.end}
                      onChange={(e) => setDay(day, { ...hours, end: e.target.value })}
                    />
                    <button type="button" className="sa-button sa-button--quiet" onClick={() => setDay(day, null)}>
                      {AVAILABILITY.markClosed}
                    </button>
                  </div>
                ) : (
                  <div className="sa-days__hours">
                    <span className="sa-days__closed">{AVAILABILITY.closed}</span>
                    <button type="button" className="sa-button sa-button--quiet" onClick={() => setDay(day, { start: "09:00", end: "17:00" })}>
                      {AVAILABILITY.setHours}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Appointment types */}
      <section className="sa-section" aria-labelledby="sa-types-h">
        <h2 className="sa-section__title" id="sa-types-h">{AVAILABILITY.typesHeading}</h2>
        <p className="sa-section__help">{AVAILABILITY.typesHelp}</p>
        {fieldError("appointmentTypes") !== null && (
          <p className="sa-field__error">{fieldError("appointmentTypes")}</p>
        )}
        <ul className="sa-types">
          {draft.appointmentTypes.map((type, i) => (
            <li key={type.id} className="sa-types__row">
              <div className="sa-field sa-field--grow">
                <label className="sa-field__label" htmlFor={`sa-type-name-${i}`}>{AVAILABILITY.typeNameLabel}</label>
                <input
                  id={`sa-type-name-${i}`}
                  className="sa-input"
                  value={type.name}
                  maxLength={100}
                  onChange={(e) => setType(i, "name", e.target.value)}
                />
              </div>
              <div className="sa-field sa-field--tight">
                <label className="sa-field__label" htmlFor={`sa-type-min-${i}`}>{AVAILABILITY.typeDurationLabel}</label>
                <input
                  id={`sa-type-min-${i}`}
                  className="sa-input sa-input--num"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={480}
                  value={type.durationMin}
                  onChange={(e) => setType(i, "durationMin", e.target.value)}
                />
              </div>
              <button
                type="button"
                className="sa-button sa-button--quiet"
                onClick={() => patch({ appointmentTypes: draft.appointmentTypes.filter((_, n) => n !== i) })}
                disabled={draft.appointmentTypes.length <= 1}
              >
                {AVAILABILITY.removeType}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="sa-button"
          onClick={() => patch({
            appointmentTypes: [...draft.appointmentTypes, { id: `new-${draft.appointmentTypes.length + 1}`, name: "", durationMin: 30 }],
          })}
        >
          {AVAILABILITY.addType}
        </button>
      </section>

      {/* Limits */}
      <section className="sa-section" aria-labelledby="sa-limits-h">
        <h2 className="sa-section__title" id="sa-limits-h">{AVAILABILITY.limitsHeading}</h2>
        <div className="sa-grid">
          <NumberField id="sa-bb" label={AVAILABILITY.bufferBeforeLabel} value={draft.bufferBeforeMin} min={0} max={240}
            error={fieldError("bufferBeforeMin")} onChange={(v) => patch({ bufferBeforeMin: num(v, 0) })} />
          <NumberField id="sa-ba" label={AVAILABILITY.bufferAfterLabel} value={draft.bufferAfterMin} min={0} max={240}
            error={fieldError("bufferAfterMin")} onChange={(v) => patch({ bufferAfterMin: num(v, 0) })} />
          <NumberField id="sa-mn" label={AVAILABILITY.minNoticeLabel} value={draft.minNoticeHours} min={0} max={720}
            error={fieldError("minNoticeHours")} onChange={(v) => patch({ minNoticeHours: num(v, 0) })} />
          <NumberField id="sa-ma" label={AVAILABILITY.maxAdvanceLabel} value={draft.maxAdvanceDays} min={1} max={365}
            error={fieldError("maxAdvanceDays")} onChange={(v) => patch({ maxAdvanceDays: num(v, 1) })} />
          <NumberField id="sa-dl" label={AVAILABILITY.dailyLimitLabel} value={draft.dailyLimit ?? ""} min={0} max={200}
            help={AVAILABILITY.dailyLimitHelp} error={fieldError("dailyLimit")}
            onChange={(v) => patch({ dailyLimit: v === "" ? null : Number(v) })} />
        </div>
      </section>

      {/* Blocked dates */}
      <section className="sa-section" aria-labelledby="sa-blocked-h">
        <h2 className="sa-section__title" id="sa-blocked-h">{AVAILABILITY.blockedHeading}</h2>
        <p className="sa-section__help">{AVAILABILITY.blockedHelp}</p>
        {fieldError("blockedDates") !== null && (
          <p className="sa-field__error">{fieldError("blockedDates")}</p>
        )}
        {draft.blockedDates.length === 0 ? (
          <p className="sa-muted">{AVAILABILITY.blockedNone}</p>
        ) : (
          <ul className="sa-blocked">
            {draft.blockedDates.map((key) => (
              <li key={key} className="sa-blocked__item">
                <span>{key}</span>
                <button
                  type="button"
                  className="sa-blocked__remove"
                  aria-label={`${AVAILABILITY.blockedRemove} ${key}`}
                  onClick={() => patch({ blockedDates: draft.blockedDates.filter((d) => d !== key) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sa-field sa-field--tight">
          <label className="sa-field__label" htmlFor="sa-blocked-add">{AVAILABILITY.blockedAdd}</label>
          <input
            id="sa-blocked-add"
            className="sa-input sa-input--date"
            type="date"
            value=""
            onChange={(e) => {
              const key = e.target.value;
              if (key && !draft.blockedDates.includes(key)) {
                patch({ blockedDates: [...draft.blockedDates, key].sort() });
              }
            }}
          />
        </div>
      </section>

      {/* Save */}
      <div className="sa-save">
        <button
          type="button"
          className="sa-button sa-button--primary"
          onClick={handleSave}
          disabled={save === "pending"}
          aria-busy={save === "pending"}
        >
          {save === "pending" ? AVAILABILITY.savePendingLabel : AVAILABILITY.saveLabel}
        </button>
      </div>

      <div className="sa-announce" ref={resultRef} tabIndex={-1} role="status" aria-live="polite" hidden={save === "idle" || save === "pending"}>
        {save === "saved" && (
          <div className="sa-notice" data-tone="ok">
            <p className="sa-notice__title">{AVAILABILITY.saveSuccessTitle}</p>
            <p className="sa-notice__detail">{AVAILABILITY.saveSuccessDetail}</p>
          </div>
        )}
        {save === "invalid" && (
          <div className="sa-notice" data-tone="error">
            <p className="sa-notice__title">{AVAILABILITY.saveInvalidTitle}</p>
            <p className="sa-notice__detail">{saveErrorDetail(errorText)}</p>
          </div>
        )}
        {save === "failed" && (
          <div className="sa-notice" data-tone="error">
            <p className="sa-notice__title">{AVAILABILITY.saveFailedTitle}</p>
            <p className="sa-notice__detail">{AVAILABILITY.saveFailedDetail}</p>
          </div>
        )}
      </div>

      <CalendarConnection />
      <PublicLink />
    </div>
  );
}

function NumberField({
  id, label, value, min, max, help, error, onChange,
}: {
  id: string;
  label: string;
  value: number | string;
  min: number;
  max: number;
  help?: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const describedBy = error !== null ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className="sa-field">
      <label className="sa-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="sa-input sa-input--num"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-invalid={error !== null}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {error !== null ? (
        <p className="sa-field__error" id={`${id}-error`}>{error}</p>
      ) : help ? (
        <p className="sa-field__help" id={`${id}-help`}>{help}</p>
      ) : null}
    </div>
  );
}

/**
 * `{ connected, provider }` and nothing else — the endpoint returns no calendar
 * id, no account email and no token, so there is none to leak. Connected means
 * busy times may be consulted while computing availability. It has never meant
 * writing an event, and is not worded as though it might.
 */
function CalendarConnection() {
  const statusQuery = useCalendarStatus();
  const state: CalendarState = statusQuery.isLoading
    ? "checking"
    : statusQuery.isError
      ? "failed"
      : statusQuery.data?.connected === true
        ? "connected"
        : "disconnected";
  const copy = calendarCopy(state);

  return (
    <section className="sa-section sa-section--ruled" aria-labelledby="sa-cal-h">
      <h2 className="sa-section__title" id="sa-cal-h">{CALENDAR.heading}</h2>
      <p className="sa-connection" data-state={state}>{copy.heading}</p>
      {copy.detail !== "" && <p className="sa-section__help">{copy.detail}</p>}
    </section>
  );
}

/**
 * `PUT .../public-link` is the only endpoint; there is no GET.
 *
 * So the section has three honest positions, not two. On arrival the state is
 * genuinely unknown: it says so, and offers both commands — each named for the
 * state it sets, neither drawn as a toggle sitting in a guessed position. Once
 * a response has established the state, that becomes the only thing shown, and
 * only the command that would change it remains.
 *
 * A failure does not become a fourth position. Nothing was observed to change,
 * so the last state the server established survives and is still displayed
 * beneath the failure sentence — losing it would turn a failed write into a
 * second, silent loss of knowledge.
 *
 * The slug is server-generated and is never invented, guessed or derived here.
 * It is dropped the moment the link is turned off, so a stale URL can never
 * outlive the state that made it real.
 */
function PublicLink() {
  const linkMutation = useSetPublicSchedulingLink();
  const [known, setKnown] = useState<PublicLinkKnownState>("unknown");
  const [slug, setSlug] = useState<string | null>(null);
  // The value being written, or null when nothing is in flight. Holding the
  // value rather than a boolean lets the pending label sit on the one command
  // that was activated.
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const set = useCallback(async (enabled: boolean) => {
    if (pending !== null) return;
    setPending(enabled);
    setFailed(false);
    try {
      const res = await linkMutation.mutateAsync(enabled);
      // The server's answer is the only thing that moves the known state.
      setSlug(res.enabled ? res.slug : null);
      setKnown(res.enabled ? "enabled" : "disabled");
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }, [linkMutation, pending]);

  const actions = publicLinkActions(known);
  const showUrl = publicLinkUrlVisible(known, slug);
  const url = !showUrl || typeof window === "undefined"
    ? null
    : publicScheduleUrl(window.location.origin, window.location.pathname, slug);

  const state: PublicLinkState = pending !== null ? "pending" : failed ? "failed" : known;

  return (
    <section className="sa-section sa-section--ruled" aria-labelledby="sa-link-h">
      <h2 className="sa-section__title" id="sa-link-h">{PUBLIC_LINK.heading}</h2>
      <p className="sa-section__help">{PUBLIC_LINK.detail}</p>
      {known === "unknown" && <p className="sa-section__help">{PUBLIC_LINK.unknownDetail}</p>}

      <div className="sa-link__actions" role="group" aria-label={PUBLIC_LINK.commandsLabel}>
        {actions.enable && (
          <button
            type="button"
            className="sa-button"
            onClick={() => set(true)}
            disabled={pending !== null}
            aria-busy={pending === true}
          >
            {pending === true ? PUBLIC_LINK.pendingLabel : PUBLIC_LINK.enableLabel}
          </button>
        )}
        {actions.disable && (
          <button
            type="button"
            /* Equal weight with the enable command, not the quiet variant it
               used to wear. Neither command is the recommended one — that is
               the whole point of a state this workspace cannot read — and once
               only one remains, a borderless button reads as a stray link and
               sits inset from the section's edge by its own padding. */
            className="sa-button"
            onClick={() => set(false)}
            disabled={pending !== null}
            aria-busy={pending === false}
          >
            {pending === false ? PUBLIC_LINK.pendingLabel : PUBLIC_LINK.disableLabel}
          </button>
        )}
      </div>

      <div
        className="sa-announce"
        role="status"
        aria-live="polite"
        hidden={state === "unknown" || state === "pending"}
      >
        {failed && (
          <div className="sa-notice" data-tone="error">
            <p className="sa-notice__title">{PUBLIC_LINK.failedTitle}</p>
            <p className="sa-notice__detail">{PUBLIC_LINK.failedDetail}</p>
          </div>
        )}
        {known === "enabled" && (
          <div className="sa-notice" data-tone="ok">
            <p className="sa-notice__title">{PUBLIC_LINK.enabledTitle}</p>
            <p className="sa-notice__detail">{PUBLIC_LINK.enabledDetail}</p>
            {url !== null && <p className="sa-link__url">{url}</p>}
          </div>
        )}
        {known === "disabled" && (
          <div className="sa-notice" data-tone="neutral">
            <p className="sa-notice__title">{PUBLIC_LINK.disabledTitle}</p>
            <p className="sa-notice__detail">{PUBLIC_LINK.disabledDetail}</p>
          </div>
        )}
      </div>
    </section>
  );
}
