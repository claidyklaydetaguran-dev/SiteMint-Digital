/**
 * V5 PR-7 — the Test Booking screen: the client-facing request form, usable
 * without creating anything a client would see. See
 * `pages/test-booking/testBookingContract.ts`.
 */

import { useSession } from "@/hooks/useSession";
import { useAvailabilityConfig } from "@/hooks/useAvailability";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { PAGE } from "@/pages/test-booking/testBookingContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-appointments.css";

export default function TestBooking() {
  const { data: me, isLoading } = useSession();
  const configQuery = useAvailabilityConfig();

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
