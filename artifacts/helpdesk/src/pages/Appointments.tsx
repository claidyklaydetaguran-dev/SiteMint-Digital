/**
 * Frontend V2 Phase 13 — the Appointments workspace.
 *
 * Mounted at `ROUTES.appointments` (`/appointments`, base-relative) inside the
 * Phase 7 `DashboardShell`, and registered only when
 * `VITE_VOICE_PLATFORM_ENABLED` is true. That gate, the navigation entry
 * (`voiceGated: true`) and the feature-flag helper are untouched by this phase:
 * in a default production build this route does not exist.
 *
 * ── Product classification ────────────────────────────────────────────────
 * An operational **appointment-request capture** workspace. The supported
 * workflow ends with a request stored and pending review. There is no
 * confirmation step, no calendar write, no approval, no reschedule, no
 * notification and no message of any kind — because there is no endpoint for
 * any of those. `appointments/appointmentsContract.ts` owns every string the
 * route can display, and the contract tests beside it walk that surface
 * exhaustively to prove no stronger claim is reachable.
 *
 * ── Requests ──────────────────────────────────────────────────────────────
 * `useSession()` reads the same React Query entry the shell already fetched,
 * so this page issues no second `/auth/me`.
 *
 * The availability config is read **once, here**, and passed down as a prop.
 * The previous page called `useAvailabilityConfig()` inside each panel while
 * Radix unmounted the inactive ones, so every tab change remounted an observer
 * on a `staleTime: 0` query and refetched: measured at 1 config GET on arrival
 * and 4 after visiting all three views and returning. Panels here are mounted
 * on first visit and then kept mounted (hidden, not destroyed), and no panel
 * owns the config query, so switching views issues no request at all.
 *
 * The two remaining reads belong to the views that genuinely need them and are
 * made once, when that view is first opened: the request list under Requests,
 * and the calendar-connection status under Availability. There is no poll, no
 * refetch interval, no refetch on focus, no prefetch, and no request that any
 * animation, transition or tab change can cause.
 *
 * Every mutation — hold, submit, cancel, save, public link — happens only after
 * an explicit activation of the control that names it. None runs on mount, on
 * render, on a view change or on focus.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useAvailabilityConfig } from "@/hooks/useAvailability";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { AppointmentRequestsList } from "@/components/booking/AppointmentRequestsList";
import { AvailabilitySettingsForm } from "@/components/booking/AvailabilitySettingsForm";
import { PAGE, nextView, views, type ViewId } from "@/pages/appointments/appointmentsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-appointments.css";

export default function Appointments() {
  const { data: me, isLoading } = useSession();

  const [view, setView] = useState<ViewId>("preview");
  // Panels are created on first visit and then kept in the tree. Destroying an
  // inactive panel would refetch its data on every return and throw away a
  // half-completed request form.
  const [visited, setVisited] = useState<ViewId[]>(["preview"]);
  const tabRefs = useRef(new Map<ViewId, HTMLButtonElement | null>());

  const configQuery = useAvailabilityConfig();
  const config = configQuery.data?.config;

  const show = useCallback((id: ViewId) => {
    setView(id);
    setVisited((seen) => (seen.includes(id) ? seen : [...seen, id]));
  }, []);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const all = views();
    let target: ViewId | null = null;
    if (event.key === "ArrowRight") target = nextView(view, 1);
    else if (event.key === "ArrowLeft") target = nextView(view, -1);
    else if (event.key === "Home") target = all[0]!.id;
    else if (event.key === "End") target = all[all.length - 1]!.id;
    if (target === null) return;
    event.preventDefault();
    show(target);
    tabRefs.current.get(target)?.focus();
  };

  const panels = useMemo(() => views().filter((v) => visited.includes(v.id)), [visited]);

  if (isLoading) {
    return (
      <div className="sa-page">
        <p className="sa-loading" role="status" aria-live="polite">
          {PAGE.loading}
        </p>
      </div>
    );
  }

  // The shell redirects on a session error; rendering nothing keeps any
  // authenticated shape out of the frame until authorisation has resolved.
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

      <div className="sa-views" role="tablist" aria-label="Appointment views">
        {views().map((item) => (
          <button
            key={item.id}
            ref={(node) => { tabRefs.current.set(item.id, node); }}
            type="button"
            role="tab"
            id={`sa-tab-${item.id}`}
            aria-selected={view === item.id}
            aria-controls={`sa-panel-${item.id}`}
            tabIndex={view === item.id ? 0 : -1}
            className="sa-view"
            onClick={() => show(item.id)}
            onKeyDown={onTabKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>

      {panels.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`sa-panel-${item.id}`}
          aria-labelledby={`sa-tab-${item.id}`}
          tabIndex={0}
          className="sa-panel"
          hidden={view !== item.id}
        >
          {item.id === "preview" && (
            <BookingCalendar
              config={config}
              isLoading={configQuery.isLoading}
              isError={configQuery.isError}
            />
          )}
          {item.id === "requests" && (
            <AppointmentRequestsList config={config} />
          )}
          {item.id === "availability" && (
            <AvailabilitySettingsForm
              config={config}
              isLoading={configQuery.isLoading}
              isError={configQuery.isError}
            />
          )}
        </div>
      ))}
    </div>
  );
}
