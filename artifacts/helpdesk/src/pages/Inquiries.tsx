/**
 * V7 — the Inquiries screen: the messages the assistant took, the follow-up
 * workflow (New / In progress / Resolved), and honest delivery status for the
 * emails that announced them.
 *
 * Copy lives in `pages/inquiries/inquiriesContract.ts`. Mobile-first: the list
 * is a single column of cards that stays readable at 360px, and the status
 * actions are full-width buttons rather than a dropdown that needs precision.
 *
 * ── What this pass adds ───────────────────────────────────────────────────
 * Each notification now says what is actually known about it, separating a
 * provider's acceptance from the provider's own later delivery evidence — and
 * naming the one state that will not be retried on its own.
 *
 * Each message carries the two follow-up actions a business actually takes
 * next, built from the details the CALLER gave. They hand off to the reader's
 * own phone or mail app; nothing here sends anything.
 *
 * And when message-taking is not attached for this business, the screen says
 * so. A silent empty list was the worst possible answer: it reads as "nobody
 * called" when the truth is the assistant could never have saved a message.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useSession } from "@/hooks/useSession";
import {
  useAssistantCapabilities,
  useInquiries,
  useNotificationStatus,
  useUpdateInquiryStatus,
} from "@/hooks/useInquiries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { ROUTES } from "@/lib/routes";
import type { Inquiry, InquiryStatus } from "@/lib/inquiriesApi";
import {
  ACTIONS,
  CAPABILITY,
  COPY,
  DELIVERY,
  PAGE,
  TABS,
  URGENCY_FILTERS,
  URGENCY_FILTER_LABEL,
  deliveryLine,
  followUpLabel,
  mailtoHref,
  matchesUrgency,
  notificationLabel,
  telHref,
  type UrgencyFilter,
} from "@/pages/inquiries/inquiriesContract";
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
  const [urgency, setUrgency] = useState<UrgencyFilter>("all");
  const inquiriesQuery = useInquiries(tab);
  const notificationsQuery = useNotificationStatus();
  const capabilitiesQuery = useAssistantCapabilities();
  const updateStatus = useUpdateInquiryStatus();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);

  if (sessionLoading || inquiriesQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} list />;
  }
  if (!me) return null;

  const allItems = inquiriesQuery.data?.items ?? [];
  const items = allItems.filter((inquiry) => matchesUrgency(inquiry, urgency));
  const counts = inquiriesQuery.data?.counts ?? { new: 0, in_progress: 0, resolved: 0 };
  const notifications = notificationsQuery.data?.items ?? [];

  // The server's own capability resolution — the same one the publish payload
  // uses — so "not attached" here means exactly what it means there.
  const messagesCapability = capabilitiesQuery.data?.items.find((c) => c.key === "messages");
  const messageTakingOff = messagesCapability?.state === "blocked";

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

  // These count customer messages. The list below already refuses to render on
  // a failed read; the counts beside it used to keep saying 0.
  const tabCount = (key: InquiryStatus | "all"): string => {
    if (inquiriesQuery.isError) return "—";
    return String(key === "all" ? counts.new + counts.in_progress + counts.resolved : counts[key]);
  };

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

      <label className="mb-4 flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {URGENCY_FILTER_LABEL}
        </span>
        <select
          className="w-fit rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as UrgencyFilter)}
        >
          {URGENCY_FILTERS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

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

      {/* An account whose assistant cannot save a message at all is told that,
          rather than being shown a list that looks like nobody called. */}
      {!inquiriesQuery.isError && allItems.length === 0 && messageTakingOff && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{CAPABILITY.offTitle}</h3>
          <p className="sd-empty__detail">
            {messagesCapability?.detail && messagesCapability.detail.trim() !== ""
              ? messagesCapability.detail
              : CAPABILITY.offFallback}
          </p>
        </div>
      )}

      {!inquiriesQuery.isError && allItems.length === 0 && !messageTakingOff && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{tab === "all" ? COPY.emptyTitle : COPY.emptyFilteredTitle}</h3>
          <p className="sd-empty__detail">{tab === "all" ? COPY.emptyDetail : COPY.emptyFilteredDetail}</p>
        </div>
      )}

      {!inquiriesQuery.isError && allItems.length > 0 && items.length === 0 && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{COPY.emptyFilteredTitle}</h3>
          <p className="sd-empty__detail">{COPY.emptyFilteredDetail}</p>
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

                {/* Built from the details the caller gave, and handed to the
                    reader's own phone or mail app. Nothing is sent from here. */}
                <div className="flex flex-wrap items-center gap-3">
                  {inquiry.callbackPhone ? (
                    <a className="text-sm underline" href={telHref(inquiry.callbackPhone)}>
                      {ACTIONS.callLabel}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{ACTIONS.noPhone}</span>
                  )}
                  {inquiry.callbackEmail ? (
                    <a className="text-sm underline" href={mailtoHref(inquiry.callbackEmail, inquiry.topic)}>
                      {ACTIONS.emailLabel}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{ACTIONS.noEmail}</span>
                  )}
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
        {notificationsQuery.isError ? (
          <p className="text-sm text-muted-foreground" role="alert">
            {COPY.notificationsFailed}
          </p>
        ) : notifications.length === 0 ? (
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

                {/* What is actually known. Acceptance and the provider's later
                    delivery evidence are different claims and stay apart. */}
                <p className="mt-1 text-foreground">{deliveryLine(notification)}</p>
                {notification.deliveryEventAt && (
                  <p className="text-xs text-muted-foreground">{formatWhen(notification.deliveryEventAt)}</p>
                )}
                {notification.state === "abandoned" && notification.lastErrorCode && (
                  <p className="text-xs text-muted-foreground">
                    {DELIVERY.abandonedReasonLabel}: {notification.lastErrorCode}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {COPY.notificationRecipientLabel} {notification.recipient} · {COPY.notificationAttemptsLabel}{" "}
                  {notification.attempts}
                </p>
                {notification.lastErrorCode && notification.state !== "abandoned" && (
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
