/**
 * V5 PR-7/PR-8 — the Appointments screen: requests list + detail drawer.
 *
 * Split out of the Frontend V2 Phase 13 combined workspace (see
 * `pages/appointments/appointmentsContract.ts`). This is now the one screen
 * where a request's lifecycle actually moves — approve, reschedule, cancel —
 * through the calendar router. Reconcile is a workspace-level action (not
 * tied to one row) so it lives in an overflow menu at the page head.
 */

import { useCallback, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useAvailabilityConfig, useAppointmentRequests } from "@/hooks/useAvailability";
import { useReconcileCalendar } from "@/hooks/useCalendar";
import { isCalendarActionError } from "@/lib/calendarApi";
import { AppointmentRequestsList } from "@/components/booking/AppointmentRequestsList";
import { AppointmentDetailDrawer } from "@/components/booking/AppointmentDetailDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import type { AppointmentRequest } from "@/lib/availabilityApi";
import {
  PAGE,
  REQUESTS,
  reconcileReasonCopy,
  reconcileSummary,
} from "@/pages/appointments/appointmentsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-appointments.css";

export default function Appointments() {
  const { data: me, isLoading } = useSession();
  const configQuery = useAvailabilityConfig();
  const requestsQuery = useAppointmentRequests();
  const reconcileMutation = useReconcileCalendar();

  const [selected, setSelected] = useState<AppointmentRequest | null>(null);
  const [reconcileNotice, setReconcileNotice] = useState<{ title: string; detail: string; tone: "ok" | "error" } | null>(null);

  const handleReconcile = useCallback(async () => {
    if (reconcileMutation.isPending) return;
    setReconcileNotice(null);
    try {
      const res = await reconcileMutation.mutateAsync();
      setReconcileNotice({
        title: REQUESTS.reconcileSuccessTitle,
        detail: reconcileSummary(res.events_removed, res.failures),
        tone: "ok",
      });
    } catch (err) {
      const reason = isCalendarActionError(err) ? err.reason : null;
      const copy = reconcileReasonCopy(reason);
      setReconcileNotice({ title: copy.title, detail: copy.detail, tone: "error" });
    }
  }, [reconcileMutation]);

  if (isLoading) {
    return (
      <div className="sa-page">
        <p className="sa-loading" role="status" aria-live="polite">{PAGE.loading}</p>
      </div>
    );
  }
  if (!me) return null;

  const items = requestsQuery.data?.items ?? [];

  // Selection is re-derived from the live list on every render so an approve,
  // reschedule or cancel that changes the selected row's state is reflected
  // in the drawer immediately, without a second read.
  const selectedLive = selected ? items.find((r) => r.id === selected.id) ?? null : null;

  return (
    <div className="sa-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sa-lede">{PAGE.detail}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleReconcile(); }} disabled={reconcileMutation.isPending}>
              {reconcileMutation.isPending ? REQUESTS.reconcilePendingLabel : REQUESTS.reconcileLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {reconcileNotice && (
        <div className="sa-notice" data-tone={reconcileNotice.tone} role={reconcileNotice.tone === "error" ? "alert" : "status"}>
          <p className="sa-notice__title">{reconcileNotice.title}</p>
          <p className="sa-notice__detail">{reconcileNotice.detail}</p>
        </div>
      )}

      <div className="sa-requests">
        <p className="sa-requests__detail">{REQUESTS.detail}</p>

        {requestsQuery.isLoading && (
          <p className="sa-status" role="status" aria-live="polite">{REQUESTS.loading}</p>
        )}

        {requestsQuery.isError && (
          <div className="sa-notice" data-tone="error" role="alert">
            <p className="sa-notice__title">{REQUESTS.failed}</p>
          </div>
        )}

        {!requestsQuery.isLoading && !requestsQuery.isError && (
          <AppointmentRequestsList
            items={items}
            config={configQuery.data?.config}
            selectedId={selectedLive?.id ?? null}
            onSelect={setSelected}
          />
        )}
      </div>

      <AppointmentDetailDrawer
        request={selectedLive}
        config={configQuery.data?.config}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
