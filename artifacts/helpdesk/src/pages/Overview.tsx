/**
 * V5 customer-shell foundation — the redesigned dashboard overview (D-1).
 *
 * Answers four questions, in this order: is the receptionist live and
 * healthy? what happened recently? what needs attention? what's next? A
 * status header (state chip, assigned number, calendar connection), a setup
 * progress pointer while incomplete, a needs-attention list, today's
 * activity, recent calls and recent conversations, a compact usage tile, and
 * exactly one next-best-action button. No fabricated metric: every value
 * traces to a real response, and an unknown count is never shown as zero.
 *
 * Voice-platform data (assistant status, assigned number, open issues,
 * recent calls) is fetched only when `voicePlatformEnabled` is true — the
 * same gating pattern `useAssistantsList` already uses — so this page
 * degrades gracefully to its SMS-only sections in the canonical build.
 */

import { Link } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/hooks/useSession";
import { relativeTime } from "@/lib/conversationUi";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { StatusChip, type StatusTone } from "@/components/common/StatusChip";
import { NextActionCard } from "@/components/common/NextActionCard";
import { PageHeader } from "@/components/common/PageHeader";
import {
  useAssignedNumber,
  useAssistantPublished,
  useCalendarConnectedFlag,
  useOnboardingProgress,
  useOpenIssuesCount,
  usePendingAppointmentRequestsCount,
  useRecentCalls,
  countCallsToday,
} from "@/pages/overview/overviewApi";
import {
  buildActivityFigures,
  buildNeedsAttention,
  buildNextBestAction,
  buildTodayFigures,
  buildUsage,
  countToday,
  deriveReceptionistState,
  pageCopy,
  recentCalls as recentCallsOf,
  recentConversations,
  RECEPTIONIST_STATE_LABEL,
  type ReceptionistState,
} from "@/pages/overview/overviewContract";
import "@/styles/v2-dashboard.css";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Loading ───────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div className="sd-page" aria-busy="true">
      <p className="sd-sr" role="status">
        Loading your overview
      </p>
      <div className="sd-skel sd-skel--title" />
      <div className="sd-skel sd-skel--status" />
      <div className="sd-skel sd-skel--figures" />
      <div className="sd-skel sd-skel--list" />
    </div>
  );
}

const STATE_TONE: Record<ReceptionistState, StatusTone> = {
  not_set_up: "pending",
  setup_in_progress: "next",
  ready_for_activation: "warn",
  live: "live",
};

// ─── Status header ───────────────────────────────────────────────────────

function StatusHeader({
  state,
  numberDisplay,
  calendarConnected,
}: {
  state: ReceptionistState;
  numberDisplay: string | null;
  calendarConnected: boolean | null;
}) {
  return (
    <section className="sd-status" data-state={state === "live" ? "answering" : "incomplete"} aria-labelledby="sd-status-title">
      <div className="sd-status__head">
        <span className="sd-status__dot" aria-hidden="true" />
        <div className="sd-status__body">
          <h2 className="sd-status__title" id="sd-status-title">
            Receptionist status
          </h2>
          <p className="sd-status__detail">
            {numberDisplay ? `Number: ${numberDisplay}` : "No phone number assigned yet."}
            {" — "}
            {calendarConnected === null ? "Calendar status unavailable." : calendarConnected ? "Calendar connected." : "Calendar not connected."}
          </p>
        </div>
        <StatusChip label={RECEPTIONIST_STATE_LABEL[state]} tone={STATE_TONE[state]} />
      </div>
    </section>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function Overview() {
  const {
    data: conversations,
    isLoading: convsLoading,
    isError: convsError,
    refetch: refetchConversations,
  } = useConversations();

  const { data: session, isLoading: sessionLoading } = useSession();

  const onboarding = useOnboardingProgress();
  const assistantPublished = useAssistantPublished();
  const { data: numbers, isLoading: numbersLoading } = useAssignedNumber();
  const calendarConnected = useCalendarConnectedFlag();
  const openIssuesCount = useOpenIssuesCount();
  const pendingRequests = usePendingAppointmentRequestsCount();
  const recentCallsQuery = useRecentCalls();

  if (sessionLoading || convsLoading || onboarding.isLoading || (voicePlatformEnabled && numbersLoading)) {
    return <OverviewSkeleton />;
  }
  if (!session) return null;

  const convs = conversations ?? [];
  const numberAssigned = Boolean(numbers?.items && numbers.items.length > 0);
  const numberDisplay = numbers?.items?.[0]?.phoneNumberDisplay ?? null;

  const state = deriveReceptionistState({
    setupComplete: onboarding.setupComplete,
    anyStepDone: onboarding.anyStepDone,
    numberAssigned,
    assistantPublished,
  });

  const isPaid = session.firm.planTier === "paid";
  const attention = convsError
    ? []
    : buildNeedsAttention({
        overCapCount: isPaid ? 0 : convs.filter((c) => c.isOverCap === true).length,
        needsReviewCount: convs.filter((c) => c.tier === "Needs Review").length,
        openIssuesCount,
        pendingAppointmentRequestsCount: pendingRequests,
      });

  const figures = buildActivityFigures(convs);
  const recent = recentConversations(convs);
  const usage = buildUsage(session);

  const todayFigures = buildTodayFigures({
    callsToday: countCallsToday(recentCallsQuery.items),
    conversationsToday: countToday(convs),
    pendingAppointmentRequests: pendingRequests,
  });

  const nextAction = buildNextBestAction({ receptionistState: state, attentionCount: attention.length });
  const recentVoiceCalls = recentCallsOf(recentCallsQuery.items);
  const page = pageCopy();

  return (
    <div className="sd-page sd-enter">
      <PageHeader eyebrow={page.eyebrow} title={page.title} />
      <div className="sd-page__head" style={{ marginTop: "calc(-1 * var(--sd-space-4, 1rem))" }}>
        <span className="sd-page__meta">{todayLabel()}</span>
      </div>

      <StatusHeader state={state} numberDisplay={numberDisplay} calendarConnected={calendarConnected} />

      {/* Exactly one next-best-action control (D-1) — its content already
          covers every state (setup incomplete, ready for activation, live
          with attention, live and healthy), so it is rendered once rather
          than duplicated per branch. */}
      <div style={{ marginTop: "var(--sd-space-4, 1rem)" }}>
        <NextActionCard
          title={nextAction.title}
          detail={nextAction.detail}
          actionLabel={nextAction.actionLabel}
          href={nextAction.href}
        />
      </div>

      {attention.length > 0 && (
        <section className="sd-section" aria-labelledby="sd-attention-title">
          <h2 className="sd-h2" id="sd-attention-title">
            Needs your attention
          </h2>
          <ul className="sd-attention">
            {attention.map((item) => (
              <li className="sd-attention__item" key={item.key}>
                <AlertTriangle className="sd-attention__icon" aria-hidden="true" />
                <div className="sd-attention__body">
                  <span className="sd-attention__title">{item.title}</span>
                  <p className="sd-attention__detail">{item.detail}</p>
                </div>
                <Link href={item.href} className="sd-attention__action">
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {convsError ? (
        <section className="sd-error" role="alert" aria-labelledby="sd-error-title">
          <AlertTriangle className="sd-error__icon" aria-hidden="true" />
          <div className="sd-error__body">
            <span className="sd-error__title" id="sd-error-title">
              Conversations didn&rsquo;t load
            </span>
            <p className="sd-error__detail">
              The request failed. Nothing was lost — your conversations are still on the server.
            </p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => refetchConversations()}>
            Try again
          </button>
        </section>
      ) : (
        <>
          <section className="sd-section" aria-labelledby="sd-today-title">
            <h2 className="sd-h2" id="sd-today-title">
              Today&rsquo;s activity
            </h2>
            <div className="sd-figures">
              {todayFigures.map((figure) => (
                <Link
                  key={figure.key}
                  href={figure.href}
                  className="sd-figure"
                  data-emphasis={figure.emphasis ? "true" : "false"}
                  data-nonzero={figure.value ? "true" : "false"}
                >
                  <span className="sd-figure__value" data-empty={figure.value === null ? "true" : "false"}>
                    {figure.value === null ? "None yet" : figure.value}
                  </span>
                  <span className="sd-figure__label">{figure.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="sd-section" aria-labelledby="sd-activity-title">
            <h2 className="sd-h2 sd-sr" id="sd-activity-title">
              Conversation activity
            </h2>
            <div className="sd-figures">
              {figures.map((figure) => (
                <Link
                  key={figure.key}
                  href={figure.href}
                  className="sd-figure"
                  data-emphasis={figure.emphasis ? "true" : "false"}
                  data-nonzero={figure.value ? "true" : "false"}
                >
                  <span className="sd-figure__value" data-empty={figure.value === null ? "true" : "false"}>
                    {figure.value === null ? "None yet" : figure.value}
                  </span>
                  <span className="sd-figure__label">{figure.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {voicePlatformEnabled && (
            <section className="sd-section" aria-labelledby="sd-calls-title">
              <div className="sd-section__head">
                <h2 className="sd-h2" id="sd-calls-title">
                  Recent calls
                </h2>
                {recentVoiceCalls.length > 0 && (
                  <Link href="/logs" className="sd-link">
                    View all
                    <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
                  </Link>
                )}
              </div>
              {recentVoiceCalls.length === 0 ? (
                <div className="sd-empty">
                  <h3 className="sd-empty__title">No calls yet</h3>
                  <p className="sd-empty__detail">Calls to your assigned number will appear here.</p>
                </div>
              ) : (
                <ul className="sd-list">
                  {recentVoiceCalls.map((call) => (
                    <li className="sd-list__item" key={call.callId}>
                      <Link href="/logs" className="sd-row">
                        <span className="sd-row__who">{call.callerNumberDisplay}</span>
                        <span className="sd-chip">{call.stateLabel}</span>
                        <span className="sd-row__when">{relativeTime(call.startedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="sd-section" aria-labelledby="sd-recent-title">
            <div className="sd-section__head">
              <h2 className="sd-h2" id="sd-recent-title">
                Recent conversations
              </h2>
              {recent.length > 0 && (
                <Link href="/conversations" className="sd-link">
                  View all
                  <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
                </Link>
              )}
            </div>

            {recent.length === 0 ? (
              <div className="sd-empty">
                <h3 className="sd-empty__title">No conversations yet</h3>
                <p className="sd-empty__detail">
                  When someone texts your business number, the receptionist replies and the
                  conversation appears here. You can change what it says under Current SMS
                  Receptionist.
                </p>
              </div>
            ) : (
              <ul className="sd-list">
                {recent.map((conversation) => (
                  <li className="sd-list__item" key={conversation.id}>
                    <Link href="/conversations" className="sd-row">
                      <span className="sd-row__who">{conversation.callerPhone}</span>
                      {conversation.tier && (
                        <span className="sd-chip" data-tier={conversation.tier}>
                          {conversation.tier}
                        </span>
                      )}
                      <span className="sd-row__when">{relativeTime(conversation.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Compact usage tile (D-1). Trial percentage only; a paid plan carries
          no percentage, per overviewContract.buildUsage. */}
      <section className="sd-section" aria-labelledby="sd-usage-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sd-usage-title">
            Usage
          </h2>
          <Link href="/billing" className="sd-link">
            View billing
          </Link>
        </div>
        <p style={{ margin: 0, fontSize: "var(--sd-text-small, .8125rem)", color: "var(--sd-text-muted, #3b5265)" }}>
          {usage.isPaid
            ? `${usage.used} conversations recorded this period.`
            : `${usage.used} of ${usage.limit} trial conversations used${usage.percent !== null ? ` (${usage.percent}%)` : ""}.`}
        </p>
      </section>
    </div>
  );
}
