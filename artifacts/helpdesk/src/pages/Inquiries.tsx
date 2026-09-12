/**
 * V7 — the Inquiries screen: the messages the assistant took, the follow-up
 * workflow (New / In progress / Resolved), and honest delivery status for the
 * emails that announced them.
 *
 * Copy lives in `pages/inquiries/inquiriesContract.ts`. Mobile-first: the list
 * is a single column of cards that stays readable at 360px, and the status
 * actions are full-width buttons rather than a dropdown that needs precision.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useSession } from "@/hooks/useSession";
import {
  useInquiries,
  useNotificationStatus,
  useUpdateInquiryStatus,
} from "@/hooks/useInquiries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { ROUTES } from "@/lib/routes";
import type { Inquiry, InquiryStatus } from "@/lib/inquiriesApi";
import { COPY, PAGE, TABS, followUpLabel, notificationLabel } from "@/pages/inquiries/inquiriesContract";
import "@/styles/v2-dashboard.css";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function callDetailHref(callId: string): string {
  return ROUTES.callDetail.replace(":id", encodeURIComponent(callId));
}

const NEXT_ACTIONS: ReadonlyArray<{ status: InquiryStatus; label: string }> = [
  { status: "new", label: COPY.markNew },
  { status: "in_progress", label: COPY.markInProgress },
  { status: "resolved", label: COPY.markResolved },
];

export default function Inquiries() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const [tab, setTab] = useState<InquiryStatus | "all">("all");
  const inquiriesQuery = useInquiries(tab);
  const notificationsQuery = useNotificationStatus();
  const updateStatus = useUpdateInquiryStatus();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);

  if (sessionLoading || inquiriesQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} list />;
  }
  if (!me) return null;

  const items = inquiriesQuery.data?.items ?? [];
  const counts = inquiriesQuery.data?.counts ?? { new: 0, in_progress: 0, resolved: 0 };
  const notifications = notificationsQuery.data?.items ?? [];

  const handleStatus = async (inquiry: Inquiry, status: InquiryStatus) => {
    setPendingId(inquiry.id);
    setFailedId(null);
    try {
      await updateStatus.mutateAsync({ id: inquiry.id, status });
    } catch {
      setFailedId(inquiry.id);
    } finally {
      setPendingId(null);
    }
  };

  const tabCount = (key: InquiryStatus | "all"): number =>
    key === "all" ? counts.new + counts.in_progress + counts.resolved : counts[key];

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={PAGE.title}>
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => setTab(entry.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              tab === entry.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-card-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.label}
            <span className="ml-1.5 opacity-70">{tabCount(entry.key)}</span>
          </button>
        ))}
      </div>

      {inquiriesQuery.isError && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{COPY.errorTitle}</span>
            <p className="sd-error__detail">{COPY.errorDetail}</p>
          </div>
          <button
            type="button"
            className="sd-error__action"
            onClick={() => inquiriesQuery.refetch()}
            disabled={inquiriesQuery.isRefetching}
          >
            {inquiriesQuery.isRefetching ? COPY.retryingLabel : COPY.retryLabel}
          </button>
        </section>
      )}

      {!inquiriesQuery.isError && items.length === 0 && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{tab === "all" ? COPY.emptyTitle : COPY.emptyFilteredTitle}</h3>
          <p className="sd-empty__detail">{tab === "all" ? COPY.emptyDetail : COPY.emptyFilteredDetail}</p>
        </div>
      )}

      {!inquiriesQuery.isError && items.length > 0 && (
        <ul className="sd-list">
          {items.map((inquiry) => (
            <li className="sd-list__item" key={inquiry.id}>
              <div className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {inquiry.urgency === "urgent" && <Badge variant="destructive">{COPY.urgentBadge}</Badge>}
                  <Badge variant={inquiry.followUpStatus === "resolved" ? "outline" : "secondary"}>
                    {followUpLabel(inquiry.followUpStatus)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {COPY.receivedLabel} {formatWhen(inquiry.createdAt)}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-foreground">{inquiry.topic}</h3>
                  <p className="text-sm text-muted-foreground">
                    {COPY.callerLabel} {inquiry.callerName}
                  </p>
                </div>

                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{COPY.phoneLabel}</dt>
                    <dd className="text-foreground">{inquiry.callbackPhone ?? COPY.noPhone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{COPY.emailLabel}</dt>
                    <dd className="break-words text-foreground">{inquiry.callbackEmail ?? COPY.noEmail}</dd>
                  </div>
                </dl>

                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{COPY.detailsLabel}</dt>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{inquiry.details}</p>
                </div>

                {inquiry.emailAckRequested && (
                  <p className="text-xs text-muted-foreground">{COPY.ackRequestedNote}</p>
                )}

                {failedId === inquiry.id && (
                  <div className="sd-error" role="alert">
                    <div className="sd-error__body">
                      <span className="sd-error__title">{COPY.updateFailedTitle}</span>
                      <p className="sd-error__detail">{COPY.updateFailedDetail}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {NEXT_ACTIONS.filter((action) => action.status !== inquiry.followUpStatus).map((action) => (
                    <Button
                      key={action.status}
                      type="button"
                      variant={action.status === "resolved" ? "default" : "outline"}
                      size="sm"
                      disabled={pendingId === inquiry.id}
                      onClick={() => handleStatus(inquiry, action.status)}
                    >
                      {pendingId === inquiry.id ? COPY.savingLabel : action.label}
                    </Button>
                  ))}
                  <Link href={callDetailHref(inquiry.callId)} className="text-sm underline sm:ml-auto">
                    {COPY.viewCallLabel}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">{COPY.notificationsTitle}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{COPY.notificationsDetail}</p>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{COPY.notificationsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="rounded-lg border border-card-border bg-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      notification.state === "accepted"
                        ? "secondary"
                        : notification.state === "abandoned"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {notificationLabel(notification.state)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatWhen(notification.createdAt)}</span>
                </div>
                <p className="mt-1 break-words text-foreground">{notification.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {COPY.notificationRecipientLabel} {notification.recipient} · {COPY.notificationAttemptsLabel}{" "}
                  {notification.attempts}
                </p>
                {notification.lastErrorCode && (
                  <p className="text-xs text-muted-foreground">
                    {COPY.notificationErrorLabel} {notification.lastErrorCode}
                    {notification.state === "failed" ? ` · ${COPY.notificationRetryNote}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
