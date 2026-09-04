/**
 * V5 PR-7 — the Availability form: settings tab + appointment-types tab,
 * sharing one draft and one Save (`PUT .../availability/config`, unchanged).
 *
 * Split out of the Frontend V2 Phase 13 combined Appointments workspace. Two
 * changes from that version:
 *  1. The inline calendar-connection section is gone — connecting now writes
 *     real calendar events (PR-7), so that state and its controls moved to
 *     their own screen (`pages/Calendar.tsx`). This form shows a one-line
 *     pointer instead of duplicating connection wording.
 *  2. Buffers, minimum notice, the booking window, the daily limit and
 *     blocked dates sit behind an "Advanced" disclosure (owner decision B-1).
 *     Both tabs and the disclosure only change what's visible — `draft` and
 *     `save` are still one piece of state, and Save still writes the whole
 *     config in one PUT, exactly as before.
 *
 * There is no `<form>` element and every control is `type="button"`, so no
 * stray Enter keypress can submit. Saving happens only on explicit
 * activation. A rejected value is never silently rewritten — the 400's own
 * sentence is shown at the field it names when it names one, and moves the
 * operator to that field's tab.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useUpdateAvailabilityConfig, useSetPublicSchedulingLink } from "@/hooks/useAvailability";
import type { AvailabilityConfig, DayHours } from "@/lib/availabilityApi";
import { WEEKDAY_NAMES } from "@/lib/schedulingDates";
import {
  CALENDAR_POINTER,
  PAGE,
  PUBLIC_LINK,
  SETTINGS,
  TYPES,
  fieldForError,
  publicLinkActions,
  publicLinkUrlVisible,
  publicScheduleUrl,
  saveErrorDetail,
  tabForField,
  type AvailabilityTab,
  type ConfigField,
  type PublicLinkKnownState,
  type PublicLinkState,
} from "@/pages/availability/availabilityContract";

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
  activeTab,
  onFieldMoved,
}: {
  config: AvailabilityConfig | undefined;
  isLoading: boolean;
  isError: boolean;
  activeTab: AvailabilityTab;
  /** Called when a save error names a field that lives on the other tab. */
  onFieldMoved?: (tab: AvailabilityTab) => void;
}) {
  const updateMutation = useUpdateAvailabilityConfig();
  const [draft, setDraft] = useState<AvailabilityConfig | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const seeded = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!seeded.current && config) {
      seeded.current = true;
      setDraft(clone(config));
    }
  }, [config]);

  const patch = (next: Partial<AvailabilityConfig>) => setDraft((d) => (d ? { ...d, ...next } : d));

  const setDay = (day: number, hours: DayHours | null) =>
    setDraft((d) => (d ? { ...d, weeklyHours: { ...d.weeklyHours, [day]: hours } } : d));

  const setType = (index: number, key: "name" | "durationMin", value: string) =>
    setDraft((d) => {
      if (!d) return d;
      const types = [...d.appointmentTypes];
      const current = types[index]!;
      types[index] = key === "name" ? { ...current, name: value } : { ...current, durationMin: value === "" ? 0 : Number(value) };
      return { ...d, appointmentTypes: types };
    });

  const num = (value: string, fallback: number) => (value === "" ? fallback : Number(value));

  const handleSave = useCallback(async () => {
    if (!draft || save === "pending") return;
    setSave("pending");
    setErrorText(null);
    try {
      const res = await updateMutation.mutateAsync(draft);
      setDraft(clone(res.config));
      setSave("saved");
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : null;
      setErrorText(message);
      setSave(status === 400 ? "invalid" : "failed");
      const field = status === 400 ? fieldForError(message) : null;
      if (field) {
        if (field === "bufferBeforeMin" || field === "bufferAfterMin" || field === "minNoticeHours" || field === "maxAdvanceDays" || field === "blockedDates" || field === "dailyLimit") {
          setAdvancedOpen(true);
        }
        const tab = tabForField(field);
        if (tab !== activeTab) onFieldMoved?.(tab);
      }
    } finally {
      resultRef.current?.focus();
    }
  }, [draft, save, updateMutation, activeTab, onFieldMoved]);

  if (isLoading || (!draft && !isError)) {
    return <p className="sa-status" role="status" aria-live="polite">{PAGE.loading}</p>;
  }
  if (isError || !draft) {
    return (
      <div className="sa-notice" data-tone="error" role="alert">
        <p className="sa-notice__title">{PAGE.failed}</p>
      </div>
    );
  }

  const badField: ConfigField | null = save === "invalid" ? fieldForError(errorText) : null;
  const fieldError = (field: ConfigField) => (badField === field ? saveErrorDetail(errorText) : null);

  const saveBar = (
    <>
      <div className="sa-save">
        <button type="button" className="sa-button sa-button--primary" onClick={handleSave} disabled={save === "pending"} aria-busy={save === "pending"}>
          {save === "pending" ? SETTINGS.savePendingLabel : SETTINGS.saveLabel}
        </button>
      </div>
      <div className="sa-announce" ref={resultRef} tabIndex={-1} role="status" aria-live="polite" hidden={save === "idle" || save === "pending"}>
        {save === "saved" && (
          <div className="sa-notice" data-tone="ok">
            <p className="sa-notice__title">{SETTINGS.saveSuccessTitle}</p>
            <p className="sa-notice__detail">{SETTINGS.saveSuccessDetail}</p>
          </div>
        )}
        {save === "invalid" && (
          <div className="sa-notice" data-tone="error">
            <p className="sa-notice__title">{SETTINGS.saveInvalidTitle}</p>
            <p className="sa-notice__detail">{saveErrorDetail(errorText)}</p>
          </div>
        )}
        {save === "failed" && (
          <div className="sa-notice" data-tone="error">
            <p className="sa-notice__title">{SETTINGS.saveFailedTitle}</p>
            <p className="sa-notice__detail">{SETTINGS.saveFailedDetail}</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="sa-settings">
      <div hidden={activeTab !== "settings"}>
        <section className="sa-section" aria-labelledby="sa-tz-h">
          <h2 className="sa-section__title" id="sa-tz-h">{SETTINGS.timezoneHeading}</h2>
          <div className="sa-field">
            <label className="sa-field__label" htmlFor="sa-tz">{SETTINGS.timezoneLabel}</label>
            <input
              id="sa-tz" className="sa-input sa-input--wide" value={draft.timezone} maxLength={100}
              aria-invalid={fieldError("timezone") !== null}
              aria-describedby={fieldError("timezone") !== null ? "sa-tz-error" : "sa-tz-help"}
              onChange={(e) => patch({ timezone: e.target.value })}
            />
            {fieldError("timezone") !== null ? (
              <p className="sa-field__error" id="sa-tz-error">{fieldError("timezone")}</p>
            ) : (
              <p className="sa-field__help" id="sa-tz-help">{SETTINGS.timezoneHelp}</p>
            )}
          </div>
        </section>

        <section className="sa-section" aria-labelledby="sa-hours-h">
          <h2 className="sa-section__title" id="sa-hours-h">{SETTINGS.hoursHeading}</h2>
          <p className="sa-section__help">{SETTINGS.hoursHelp}</p>
          {fieldError("weeklyHours") !== null && <p className="sa-field__error">{fieldError("weeklyHours")}</p>}
          <div className="sa-days__legend" aria-hidden="true">
            <span /><span>{SETTINGS.startLabel}</span><span>{SETTINGS.endLabel}</span>
          </div>
          <ul className="sa-days">
            {WEEKDAY_NAMES.map((label, day) => {
              const hours = draft.weeklyHours[day] ?? null;
              return (
                <li key={label} className="sa-days__row">
                  <span className="sa-days__name">{label}</span>
                  {hours ? (
                    <div className="sa-days__hours">
                      <label className="sa-vh" htmlFor={`sa-start-${day}`}>{`${label} ${SETTINGS.startLabel}`}</label>
                      <input id={`sa-start-${day}`} className="sa-input sa-input--time" type="time" value={hours.start} onChange={(e) => setDay(day, { ...hours, start: e.target.value })} />
                      <label className="sa-vh" htmlFor={`sa-end-${day}`}>{`${label} ${SETTINGS.endLabel}`}</label>
                      <input id={`sa-end-${day}`} className="sa-input sa-input--time" type="time" value={hours.end} onChange={(e) => setDay(day, { ...hours, end: e.target.value })} />
                      <button type="button" className="sa-button sa-button--quiet" onClick={() => setDay(day, null)}>{SETTINGS.markClosed}</button>
                    </div>
                  ) : (
                    <div className="sa-days__hours">
                      <span className="sa-days__closed">{SETTINGS.closed}</span>
                      <button type="button" className="sa-button sa-button--quiet" onClick={() => setDay(day, { start: "09:00", end: "17:00" })}>{SETTINGS.setHours}</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sa-section sa-section--ruled" aria-labelledby="sa-cal-pointer-h">
          <h2 className="sa-section__title" id="sa-cal-pointer-h">{CALENDAR_POINTER.heading}</h2>
          <p className="sa-section__help">{CALENDAR_POINTER.detail}</p>
          <Link href={CALENDAR_POINTER.href} className="sd-link">{CALENDAR_POINTER.linkLabel}</Link>
        </section>

        <section className="sa-section sa-section--ruled" aria-labelledby="sa-advanced-h">
          <button
            type="button"
            className="sa-button"
            id="sa-advanced-h"
            aria-expanded={advancedOpen}
            aria-controls="sa-advanced-body"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? SETTINGS.advancedHide : SETTINGS.advancedShow}
          </button>
          <p className="sa-section__help">{SETTINGS.advancedHelp}</p>

          <div id="sa-advanced-body" hidden={!advancedOpen}>
            <h3 className="sa-section__title">{SETTINGS.limitsHeading}</h3>
            <div className="sa-grid">
              <NumberField id="sa-bb" label={SETTINGS.bufferBeforeLabel} value={draft.bufferBeforeMin} min={0} max={240} error={fieldError("bufferBeforeMin")} onChange={(v) => patch({ bufferBeforeMin: num(v, 0) })} />
              <NumberField id="sa-ba" label={SETTINGS.bufferAfterLabel} value={draft.bufferAfterMin} min={0} max={240} error={fieldError("bufferAfterMin")} onChange={(v) => patch({ bufferAfterMin: num(v, 0) })} />
              <NumberField id="sa-mn" label={SETTINGS.minNoticeLabel} value={draft.minNoticeHours} min={0} max={720} error={fieldError("minNoticeHours")} onChange={(v) => patch({ minNoticeHours: num(v, 0) })} />
              <NumberField id="sa-ma" label={SETTINGS.maxAdvanceLabel} value={draft.maxAdvanceDays} min={1} max={365} error={fieldError("maxAdvanceDays")} onChange={(v) => patch({ maxAdvanceDays: num(v, 1) })} />
              <NumberField id="sa-dl" label={SETTINGS.dailyLimitLabel} value={draft.dailyLimit ?? ""} min={0} max={200} help={SETTINGS.dailyLimitHelp} error={fieldError("dailyLimit")} onChange={(v) => patch({ dailyLimit: v === "" ? null : Number(v) })} />
            </div>

            <h3 className="sa-section__title">{SETTINGS.blockedHeading}</h3>
            <p className="sa-section__help">{SETTINGS.blockedHelp}</p>
            {fieldError("blockedDates") !== null && <p className="sa-field__error">{fieldError("blockedDates")}</p>}
            {draft.blockedDates.length === 0 ? (
              <p className="sa-muted">{SETTINGS.blockedNone}</p>
            ) : (
              <ul className="sa-blocked">
                {draft.blockedDates.map((key) => (
                  <li key={key} className="sa-blocked__item">
                    <span>{key}</span>
                    <button type="button" className="sa-blocked__remove" aria-label={`${SETTINGS.blockedRemove} ${key}`} onClick={() => patch({ blockedDates: draft.blockedDates.filter((d) => d !== key) })}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="sa-field sa-field--tight">
              <label className="sa-field__label" htmlFor="sa-blocked-add">{SETTINGS.blockedAdd}</label>
              <input
                id="sa-blocked-add" className="sa-input sa-input--date" type="date" value=""
                onChange={(e) => {
                  const key = e.target.value;
                  if (key && !draft.blockedDates.includes(key)) patch({ blockedDates: [...draft.blockedDates, key].sort() });
                }}
              />
            </div>
          </div>
        </section>

        {saveBar}
        <PublicLink />
      </div>

      <div hidden={activeTab !== "types"}>
        <section className="sa-section" aria-labelledby="sa-types-h">
          <h2 className="sa-section__title" id="sa-types-h">{TYPES.heading}</h2>
          <p className="sa-section__help">{TYPES.help}</p>
          {fieldError("appointmentTypes") !== null && <p className="sa-field__error">{fieldError("appointmentTypes")}</p>}
          <ul className="sa-types">
            {draft.appointmentTypes.map((type, i) => (
              <li key={type.id} className="sa-types__row">
                <div className="sa-field sa-field--grow">
                  <label className="sa-field__label" htmlFor={`sa-type-name-${i}`}>{TYPES.nameLabel}</label>
                  <input id={`sa-type-name-${i}`} className="sa-input" value={type.name} maxLength={100} onChange={(e) => setType(i, "name", e.target.value)} />
                </div>
                <div className="sa-field sa-field--tight">
                  <label className="sa-field__label" htmlFor={`sa-type-min-${i}`}>{TYPES.durationLabel}</label>
                  <input id={`sa-type-min-${i}`} className="sa-input sa-input--num" type="number" inputMode="numeric" min={5} max={480} value={type.durationMin} onChange={(e) => setType(i, "durationMin", e.target.value)} />
                </div>
                <button type="button" className="sa-button sa-button--quiet" onClick={() => patch({ appointmentTypes: draft.appointmentTypes.filter((_, n) => n !== i) })} disabled={draft.appointmentTypes.length <= 1}>{TYPES.remove}</button>
              </li>
            ))}
          </ul>
          <button
            type="button" className="sa-button"
            onClick={() => patch({ appointmentTypes: [...draft.appointmentTypes, { id: `new-${draft.appointmentTypes.length + 1}`, name: "", durationMin: 30 }] })}
          >
            {TYPES.add}
          </button>
        </section>

        {saveBar}
      </div>
    </div>
  );
}

function NumberField({ id, label, value, min, max, help, error, onChange }: {
  id: string; label: string; value: number | string; min: number; max: number; help?: string; error: string | null; onChange: (value: string) => void;
}) {
  const describedBy = error !== null ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className="sa-field">
      <label className="sa-field__label" htmlFor={id}>{label}</label>
      <input id={id} className="sa-input sa-input--num" type="number" inputMode="numeric" min={min} max={max} value={value} aria-invalid={error !== null} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} />
      {error !== null ? <p className="sa-field__error" id={`${id}-error`}>{error}</p> : help ? <p className="sa-field__help" id={`${id}-help`}>{help}</p> : null}
    </div>
  );
}

/**
 * `PUT .../public-link` is the only endpoint; there is no GET. Unchanged from
 * Phase 13 — see the original for the three-position rationale.
 */
function PublicLink() {
  const linkMutation = useSetPublicSchedulingLink();
  const [known, setKnown] = useState<PublicLinkKnownState>("unknown");
  const [slug, setSlug] = useState<string | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const set = useCallback(async (enabled: boolean) => {
    if (pending !== null) return;
    setPending(enabled);
    setFailed(false);
    try {
      const res = await linkMutation.mutateAsync(enabled);
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
  const url = !showUrl || typeof window === "undefined" ? null : publicScheduleUrl(window.location.origin, window.location.pathname, slug);
  const state: PublicLinkState = pending !== null ? "pending" : failed ? "failed" : known;

  return (
    <section className="sa-section sa-section--ruled" aria-labelledby="sa-link-h">
      <h2 className="sa-section__title" id="sa-link-h">{PUBLIC_LINK.heading}</h2>
      <p className="sa-section__help">{PUBLIC_LINK.detail}</p>
      {known === "unknown" && <p className="sa-section__help">{PUBLIC_LINK.unknownDetail}</p>}

      <div className="sa-link__actions" role="group" aria-label={PUBLIC_LINK.commandsLabel}>
        {actions.enable && (
          <button type="button" className="sa-button" onClick={() => set(true)} disabled={pending !== null} aria-busy={pending === true}>
            {pending === true ? PUBLIC_LINK.pendingLabel : PUBLIC_LINK.enableLabel}
          </button>
        )}
        {actions.disable && (
          <button type="button" className="sa-button" onClick={() => set(false)} disabled={pending !== null} aria-busy={pending === false}>
            {pending === false ? PUBLIC_LINK.pendingLabel : PUBLIC_LINK.disableLabel}
          </button>
        )}
      </div>

      <div className="sa-announce" role="status" aria-live="polite" hidden={state === "unknown" || state === "pending"}>
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
