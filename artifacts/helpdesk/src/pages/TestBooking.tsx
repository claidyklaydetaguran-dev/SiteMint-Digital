/**
 * V5 PR-7 — the Test Booking screen: the client-facing request form, usable
 * without creating anything a client would see. See
 * `pages/test-booking/testBookingContract.ts`.
 */

import { useSession } from "@/hooks/useSession";
import { useAvailabilityConfig, useCalendarStatus } from "@/hooks/useAvailability";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import {
  BOUNDARY,
  CALENDAR_NOTE,
  PAGE,
  calendarReadiness,
} from "@/pages/test-booking/testBookingContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-appointments.css";

export default function TestBooking() {
  const { data: me, isLoading } = useSession();
  const configQuery = useAvailabilityConfig();
  const calendarQuery = useCalendarStatus();

  if (isLoading) {
    return (
      <div className="sa-page">
        <p className="sa-loading" role="status" aria-live="polite">{PAGE.loading}</p>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="sa-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sa-lede">{PAGE.detail}</p>
        </div>
      </div>

      {/*
        Stated before the form, not after it. "The test worked" and "a real
        booking would reach my calendar" are different claims, and a business
        deciding it is ready to take bookings acts on the second one.
      */}
      <section className="sa-section sa-boundary" aria-labelledby="sa-boundary-h">
        <h2 className="sa-section__title" id="sa-boundary-h">{BOUNDARY.heading}</h2>
        <div className="sa-boundary__cols">
          <div>
            <h3 className="sa-boundary__sub">{BOUNDARY.doesHeading}</h3>
            <ul className="sa-boundary__list">
              {BOUNDARY.does.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="sa-boundary__sub">{BOUNDARY.doesNotHeading}</h3>
            <ul className="sa-boundary__list" data-negative="true">
              {BOUNDARY.doesNot.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>
        {(() => {
          const note = CALENDAR_NOTE[calendarReadiness(calendarQuery.data, calendarQuery.isError)];
          return (
            <div className="sa-notice" data-tone={note.tone === "warn" ? "neutral" : note.tone} role="status">
              <p className="sa-notice__title">{note.title}</p>
              <p className="sa-notice__detail">{note.detail}</p>
            </div>
          );
        })()}
      </section>

      <div className="sa-panel">
        <BookingCalendar
          config={configQuery.data?.config}
          isLoading={configQuery.isLoading}
          isError={configQuery.isError}
        />
      </div>
    </div>
  );
}
