/**
 * V5 PR-7 — the Availability screen: settings + appointment types.
 *
 * Split out of the Frontend V2 Phase 13 combined Appointments workspace (see
 * `pages/availability/availabilityContract.ts` for the full rationale). The
 * config is read once, here, and passed down — `AvailabilitySettingsForm`
 * owns no query of its own, so switching between the two tabs issues no
 * request.
 */

import { useSession } from "@/hooks/useSession";
import { useAvailabilityConfig } from "@/hooks/useAvailability";
import { AvailabilitySettingsForm } from "@/components/booking/AvailabilitySettingsForm";
import { PAGE, initialTabFromSearch, tabs, type AvailabilityTab } from "@/pages/availability/availabilityContract";
import { useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-appointments.css";

/**
 * Availability and Appointment types are two tabs of one page, and each tab
 * has its own address (`/scheduling/availability`, `/scheduling/appointment-types`)
 * so the navigation, the breadcrumb and the page title always name the tab
 * the owner is on. `?tab=types` is still honoured for old links.
 */
export default function Availability({ initialTab }: { initialTab?: AvailabilityTab } = {}) {
  const [, navigate] = useLocation();
  const { data: me, isLoading } = useSession();
  const configQuery = useAvailabilityConfig();
  // The "Appointment Types" nav entry deep-links here as `?tab=types`; read
  // once, on mount, exactly the way `AvailabilitySettingsForm` reads its seed
  // config once — a later navigation to the same route remounts the page.
  const [tab, setTabState] = useState<AvailabilityTab>(() =>
    initialTab ?? (typeof window === "undefined" ? "settings" : initialTabFromSearch(window.location.search)),
  );
  const setTab = (next: AvailabilityTab) => {
    setTabState(next);
    const path = next === "types" ? ROUTES.appointmentTypes : ROUTES.availability;
    if (typeof window !== "undefined" && !window.location.pathname.endsWith(path)) navigate(path, { replace: true });
  };

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
          <h1 className="sd-page__title">{tab === "types" ? "Appointment types" : PAGE.title}</h1>
          <p className="sa-lede">{PAGE.detail}</p>
        </div>
      </div>

      <div className="sa-views" role="tablist" aria-label="Availability views">
        {tabs().map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`av-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`av-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className="sa-view"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`av-panel-${tab}`} aria-labelledby={`av-tab-${tab}`} tabIndex={0} className="sa-panel">
        <AvailabilitySettingsForm
          config={configQuery.data?.config}
          isLoading={configQuery.isLoading}
          isError={configQuery.isError}
          activeTab={tab}
          onFieldMoved={setTab}
        />
      </div>
    </div>
  );
}
