import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { CalendarClock } from "lucide-react";
import { useAppointmentRequests, useAvailabilityConfig, useCancelAppointmentRequest } from "@/hooks/useAvailability";
import type { AppointmentRequestState, AppointmentSource } from "@/lib/availabilityApi";

const STATE_LABEL: Record<AppointmentRequestState, string> = {
  requested: "Requested",
  held: "Held (temporary)",
  pending_review: "Pending review",
  booked: "Booked",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  failed: "Failed",
  expired: "Expired",
};

const STATE_TONE: Record<AppointmentRequestState, StatusTone> = {
  requested: "info",
  held: "info",
  pending_review: "warning",
  booked: "success",
  cancelled: "neutral",
  rescheduled: "info",
  failed: "destructive",
  expired: "neutral",
};

const SOURCE_LABEL: Record<AppointmentSource, string> = {
  website: "Website",
  ai_receptionist: "AI Receptionist",
  manual: "Manual",
};

export function AppointmentRequestsList() {
  const { data, isLoading, isError } = useAppointmentRequests();
  const configQuery = useAvailabilityConfig();
  const cancelMutation = useCancelAppointmentRequest();

  const typeNameById = new Map(configQuery.data?.config.appointmentTypes.map((t) => [t.id, t.name]) ?? []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading requests…
      </div>
    );
  }
  if (isError) {
    return <p className="p-6 text-sm text-statusbadge-danger-text">Temporarily unavailable — couldn't load requests.</p>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No appointment requests yet"
        description="Requests from the booking calendar or the AI receptionist will appear here as Pending review — never booked automatically."
        className="py-10"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_9rem_9rem_6rem] items-center gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Contact</span>
        <span>Type</span>
        <span>Date &amp; time</span>
        <span>Status</span>
        <span>Source</span>
      </div>
      {items.map((req) => (
        <div
          key={req.id}
          className="block gap-4 border-b border-border px-4 py-3.5 last:border-0 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_9rem_9rem_6rem] sm:items-center"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{req.contact?.name ?? "Unknown"}</div>
            {req.contact?.phone && <div className="truncate text-xs text-muted-foreground">{req.contact.phone}</div>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground sm:mt-0 sm:text-sm">{typeNameById.get(req.appointmentTypeId) ?? req.appointmentTypeId}</div>
          <div className="mt-1 text-xs text-muted-foreground sm:mt-0 sm:text-sm">
            {new Date(req.startUtc).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
          <div className="mt-2 sm:mt-0">
            <StatusBadge label={STATE_LABEL[req.state]} tone={STATE_TONE[req.state]} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0">
            <span className="text-xs text-muted-foreground">{SOURCE_LABEL[req.source]}</span>
            {req.state === "pending_review" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => cancelMutation.mutate(req.id)}
                disabled={cancelMutation.isPending}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
