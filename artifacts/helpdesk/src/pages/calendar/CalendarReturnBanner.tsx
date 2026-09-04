/**
 * V5 PR-7 — self-contained banner for the Google Calendar OAuth return.
 *
 * The server's `GET /calendar/google/callback` redirects the browser back
 * into the dashboard with `?calendar=connected` or `?calendar=error`. This
 * component reads that query param itself (it takes no props) so it can be
 * mounted on either the Calendar screen or, per the lead's routing, on
 * Settings — wherever the callback's redirect target ends up — without
 * either owner having to thread the parsed state through.
 *
 * Renders nothing when no `calendar` param is present. The URL is cleaned
 * with `history.replaceState` once shown, so refreshing the page or sharing
 * the link doesn't re-show a stale banner.
 */

import { useEffect, useState } from "react";
import { calendarReturnCopy, parseCalendarReturn, RETURN_BANNER } from "@/pages/calendar/calendarContract";

export function CalendarReturnBanner() {
  const [status, setStatus] = useState<"connected" | "error" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseCalendarReturn(window.location.search);
    if (parsed === null) return;
    setStatus(parsed);
    const url = new URL(window.location.href);
    url.searchParams.delete("calendar");
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (status === null) return null;
  const copy = calendarReturnCopy(status);

  return (
    <div className="sd-status" data-state={status === "connected" ? "answering" : "unknown"} role="status">
      <div className="sd-status__head">
        <span className="sd-status__dot" aria-hidden="true" />
        <div className="sd-status__body">
          <h2 className="sd-status__title">{copy.title}</h2>
          <p className="sd-status__detail">{copy.detail}</p>
        </div>
        <button type="button" className="sd-link" onClick={() => setStatus(null)}>
          {RETURN_BANNER.dismiss}
        </button>
      </div>
    </div>
  );
}

export default CalendarReturnBanner;
