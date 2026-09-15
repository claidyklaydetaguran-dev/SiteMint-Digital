/**
 * Choosing which calendar receives appointments.
 *
 * Kept as its own component because it has three states that have nothing to
 * do with each other: a normal list, a business whose grant predates the
 * listing scope (which needs a reconnect, not a repair), and a list that
 * simply could not be read right now. Folding those into the connected card
 * would have hidden the middle one, which is the state most businesses will
 * actually be in the first time they see this.
 */

import type React from "react";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchCalendarChoices, selectCalendar, isCalendarActionError } from "@/lib/calendarApi";
import { CALENDAR_PICKER } from "@/pages/calendar/calendarContract";
import { Button } from "@/components/ui/button";

export function CalendarPicker({ onReconnect }: { onReconnect: () => void }): React.ReactElement | null {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const choices = useQuery({
    queryKey: ["calendar", "choices"],
    queryFn: fetchCalendarChoices,
    retry: false,
  });

  // The server's selection is the truth until the business picks something;
  // seeding state from it avoids a control that starts on the wrong calendar.
  useEffect(() => {
    if (choices.data && chosen === null) setChosen(choices.data.selectedCalendarId);
  }, [choices.data, chosen]);

  const save = useMutation({
    mutationFn: (calendarId: string) => selectCalendar(calendarId),
    onSuccess: () => {
      setSaved(true);
      setFailure(null);
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (err) => {
      setSaved(false);
      // The server's sentence is shown as written: it knows whether the
      // calendar was unknown, read-only, or simply unlistable.
      setFailure(isCalendarActionError(err) ? err.message : CALENDAR_PICKER.failedTitle);
    },
  });

  if (choices.isLoading) {
    return <p className="sd-muted">{CALENDAR_PICKER.loading}</p>;
  }

  if (choices.isError) {
    const needsPermission = isCalendarActionError(choices.error) && choices.error.status === 403;
    return (
      <section className="sd-subsection">
        <h3 className="sd-subsection__title">
          {needsPermission ? CALENDAR_PICKER.needsPermissionTitle : CALENDAR_PICKER.unavailableTitle}
        </h3>
        <p className="sd-muted">
          {needsPermission ? CALENDAR_PICKER.needsPermissionDetail : CALENDAR_PICKER.unavailableDetail}
        </p>
        {needsPermission && (
          <Button type="button" variant="outline" onClick={onReconnect}>
            {CALENDAR_PICKER.needsPermissionAction}
          </Button>
        )}
      </section>
    );
  }

  const calendars = choices.data?.calendars ?? [];
  if (calendars.length === 0) return null;

  return (
    <section className="sd-subsection">
      <h3 className="sd-subsection__title">{CALENDAR_PICKER.heading}</h3>
      <p className="sd-muted">{CALENDAR_PICKER.detail}</p>

      <label className="si-label" htmlFor="calendar-picker">{CALENDAR_PICKER.label}</label>
      <select
        id="calendar-picker"
        className="si-input"
        value={chosen ?? ""}
        onChange={(e) => { setChosen(e.target.value); setSaved(false); setFailure(null); }}
        disabled={save.isPending}
      >
        {calendars.map((c) => (
          // A read-only calendar is listed but not selectable: choosing it
          // would produce a booking that failed at approval time.
          <option key={c.id} value={c.id} disabled={!c.writable}>
            {c.name}{c.writable ? "" : ` ${CALENDAR_PICKER.readOnlySuffix}`}
          </option>
        ))}
      </select>

      <Button
        type="button"
        onClick={() => { if (chosen) save.mutate(chosen); }}
        disabled={save.isPending || chosen === null || chosen === choices.data?.selectedCalendarId}
      >
        {save.isPending ? CALENDAR_PICKER.savePending : CALENDAR_PICKER.save}
      </Button>

      {saved && (
        <div className="sd-note" role="status">
          <strong>{CALENDAR_PICKER.saved}</strong>
          {/* Said out loud, because the alternative reading — that existing
              appointments move — would be alarming and is not true. */}
          <p className="sd-muted">{CALENDAR_PICKER.savedDetail}</p>
        </div>
      )}
      {failure !== null && (
        <div className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{CALENDAR_PICKER.failedTitle}</span>
            <p className="sd-error__detail">{failure}</p>
          </div>
        </div>
      )}
    </section>
  );
}
