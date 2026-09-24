/**
 * The workspace overview (SiteMint Workspace, 2026-09-24).
 *
 * Built for a busy owner and ordered by the four questions they arrive with:
 *
 *   1. What is working?          — one status card: overall state in words,
 *                                  setup progress, and every connection with
 *                                  its real state (connected, off, not checked)
 *   2. What should I do next?    — exactly one next step inside that card,
 *                                  named as an action, never as a check label
 *   3. What needs my attention?  — the needs-attention list, only when real
 *   4. What happened today?      — today's figures, recent activity, calls
 *
 * No fabricated metric: every value traces to a real response, an unknown
 * count is never shown as zero, and a disconnected calendar, inactive number
 * or unverified channel is never styled as active.
 *
 * Voice-platform data (assistant status, assigned number, open issues,
 * recent calls) is fetched only when `voicePlatformEnabled` is true, so this
 * page degrades to its SMS-only sections in the canonical build.
 */

import { lazy, Suspense, type ComponentType } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CalendarDays, Mail, Mic, Phone, PhoneForwarded, CalendarCheck } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/hooks/useSession";
import { relativeTime } from "@/lib/conversationUi";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { NextActionCard } from "@/components/common/NextActionCard";
import { StatusChip, type StatusTone } from "@/components/common/StatusChip";
import { PageHeader } from "@/components/common/PageHeader";
import {
  useOpenIssuesCount,
  usePendingAppointmentRequestsCount,
  useRecentCalls,
  countCallsToday,
} from "@/pages/overview/overviewApi";
// Readiness is measured once, on the server, and read here, by Setup and by
// the rail, so the three cannot disagree about whether an account is ready.
import { useReadiness, type Readiness, type ReadinessCheck } from "@/lib/readinessApi";
// The needs-attention email signal, the calendar connection and the assigned
// number come from the shared setup module.
import { useSetupData } from "@/pages/setup/setupApi";
import {
  buildActivityFigures,
  buildNeedsAttention,
  buildNextBestAction,
  buildTodayFigures,
  buildUsage,
  countToday,
  readinessHeadline,
  readinessNextStep,
  readinessProgress,
  recentConversations,
  type ReceptionistState,
} from "@/pages/overview/overviewContract";
import "@/styles/v2-dashboard.css";

// The receptionist panel is voice-platform content, so a build without the
// voice platform must not carry it: the ternary folds and the import is gone.
const DashboardPanel = voicePlatformEnabled
  ? lazy(() => import("@/components/dashboard/DashboardPanel").then((m) => ({ default: m.DashboardPanel })))
  : null;

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
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

// ─── Status ────────────────────────────────────────────────────────────────

type Tone = "live" | "progress" | "attention" | "off" | "neutral";

const CHIP_TONE: Record<Tone, StatusTone> = { live: "live", progress: "next", attention: "blocked", off: "pending", neutral: "neutral" };

function overallTone(r: Readiness | undefined): Tone {
  if (!r) return "neutral";
  if (r.state === "live_call_verified") return "live";
  if (r.state === "needs_attention" || r.state === "paused") return "attention";
  if (r.state === "not_checked") return "neutral";
  return "progress";
}

interface ConnectionRow {
  key: string;
  icon: ComponentType<{ "aria-hidden"?: boolean | "true" }>;
  label: string;
  state: string;
  tone: Tone;
  detail: string;
  href: string | null;
}

/** A check's state as a word and a tone. A word always carries the state. */
function checkWord(check: ReadinessCheck | undefined, words: { done: string; todo: string; off?: string }): { state: string; tone: Tone } {
  if (!check) return { state: "Not checked", tone: "neutral" };
  switch (check.state) {
    case "done":
      return { state: words.done, tone: "live" };
    case "attention":
      return { state: "Needs attention", tone: "attention" };
    case "off":
      return { state: words.off ?? "Off", tone: "off" };
    case "not_checked":
      return { state: "Not checked", tone: "neutral" };
    default:
      return { state: words.todo, tone: "off" };
  }
}

function connectionRows(
  r: Readiness | undefined,
  calendarReady: boolean | null,
  numberDisplay: string | null,
): ConnectionRow[] {
  const checks = r?.steps.flatMap((s) => s.checks) ?? [];
  const find = (key: string) => checks.find((c) => c.key === key);
  const published = find("published");
  const phone = find("phone");
  const booking = find("booking");
  const email = find("email");
  const transfer = find("transfer");

  const rows: ConnectionRow[] = [
    {
      key: "assistant",
      icon: Mic,
      label: "Voice receptionist",
      ...checkWord(published, { done: "Published", todo: "Draft" }),
      detail: published?.state === "done" ? "Callers reach the published version." : "Not published yet, so it can't answer calls.",
      href: "/assistants",
    },
    {
      key: "phone",
      icon: Phone,
      label: "Phone number",
      ...(numberDisplay ? { state: "Connected", tone: "live" as Tone } : checkWord(phone, { done: "Connected", todo: "Not connected" })),
      detail: numberDisplay ? numberDisplay : phone?.detail ?? "Not checked.",
      href: "/channels/phone-number",
    },
    {
      key: "calendar",
      icon: CalendarDays,
      label: "Google Calendar",
      state: calendarReady === true ? "Connected" : calendarReady === false ? "Not connected" : "Not checked",
      tone: calendarReady === true ? "live" : calendarReady === false ? "off" : "neutral",
      detail:
        calendarReady === true
          ? "Connected and working. Confirmed bookings can be added to it."
          : calendarReady === false
            ? "Connect a calendar so bookings land in it."
            : "SiteMint couldn't check your calendar just now.",
      href: "/scheduling/calendar",
    },
    {
      key: "booking",
      icon: CalendarCheck,
      label: "Booking by phone",
      ...checkWord(booking, { done: "On", todo: "Off" }),
      detail: booking?.detail ?? "Not checked.",
      href: booking?.fixPath ?? "/scheduling/appointment-types",
    },
    {
      key: "transfer",
      icon: PhoneForwarded,
      label: "Call transfers",
      ...checkWord(transfer, { done: "On", todo: "Off" }),
      detail: transfer?.detail ?? "Not checked.",
      href: "/channels/transfer-contacts",
    },
    {
      key: "email",
      icon: Mail,
      label: "Email summaries",
      ...checkWord(email, { done: "Email confirmed", todo: "Not confirmed" }),
      detail: email?.detail ?? "Not checked.",
      href: null,
    },
  ];
  return voicePlatformEnabled ? rows : rows.filter((row) => row.key === "calendar" || row.key === "email");
}

function StatusCard({
  readiness,
  calendarReady,
  numberDisplay,
  next,
}: {
  readiness: Readiness | undefined;
  calendarReady: boolean | null;
  numberDisplay: string | null;
  next: { title: string; detail: string; actionLabel: string; href: string };
}) {
  const tone = overallTone(readiness);
  const progress = readinessProgress(readiness);
  const rows = connectionRows(readiness, calendarReady, numberDisplay);

  return (
    <section className="ws-card ws-hero" aria-labelledby="sd-status-title">
      <div className="ws-hero__main">
        <StatusChip
          label={readiness ? readiness.label : "Not checked"}
          tone={CHIP_TONE[tone]}
          dot
          srPrefix="Receptionist status: "
        />
        <h2 className="ws-hero__title" id="sd-status-title">
          {readinessHeadline(readiness?.state)}
        </h2>
        <p className="ws-hero__detail">
          {readiness ? readiness.detail : "SiteMint couldn't read your setup just now."}{" "}
          {numberDisplay ? `Callers reach you on ${numberDisplay}.` : "No phone number is connected yet, so no real calls reach it."}
        </p>

        {readiness && progress && (
          <div>
            <ol className="ws-progress" style={{ ["--ws-steps" as string]: String(progress.total) }} aria-label={`Setup: ${progress.done} of ${progress.total} steps complete`}>
              {readiness.steps.map((step) => (
                <li key={step.key} className="ws-progress__step" data-state={step.state}>
                  <span className="ws-progress__bar" aria-hidden="true" />
                  <span className="ws-progress__label">
                    {step.title}
                    <span className="sd-sr">: {step.state === "done" ? "complete" : step.state === "current" ? "in progress" : step.state === "attention" ? "needs attention" : "not started"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <NextActionCard title={next.title} detail={next.detail} actionLabel={next.actionLabel} href={next.href} />
      </div>

      <div className="ws-hero__side">
        <div className="sd-section__head" style={{ marginBottom: 4 }}>
          <h2 className="ws-side-title">Connections</h2>
          <Link href="/setup" className="sd-link">
            Setup
            <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
          </Link>
        </div>
        <ul className="ws-connections">
          {rows.map(({ key, icon: Icon, label, state, tone: rowTone, detail, href }) => {
            const body = (
              <>
                <span className="ws-connection__icon">
                  <Icon aria-hidden="true" />
                </span>
                <span className="ws-connection__text">
                  <span className="ws-connection__label">{label}</span>
                  <span className="ws-connection__detail">{detail}</span>
                </span>
              </>
            );
            return (
              <li key={key} className="ws-connection">
                {href ? (
                  <Link href={href} className="ws-connection__main">
                    {body}
                  </Link>
                ) : (
                  <span className="ws-connection__main">{body}</span>
                )}
                <span className="ws-pill" data-tone={rowTone}>
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
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

  const setup = useSetupData();
  const readiness = useReadiness();
  const openIssuesCount = useOpenIssuesCount();
  const pendingRequests = usePendingAppointmentRequestsCount();
  const recentCallsQuery = useRecentCalls();

  if (sessionLoading || convsLoading || setup.loading || readiness.isLoading) {
    return <OverviewSkeleton />;
  }
  if (!session) return null;

  const convs = conversations ?? [];

  const canReceiveEmail = setup.signals.emailVerified;
  const r = readiness.data;
  const state: ReceptionistState = !r
    ? "setup_in_progress"
    : r.state === "live_call_verified"
      ? "live"
      : r.state === "phone_connected" || r.state === "ready_to_activate_phone" || r.state === "ready_to_test"
        ? "ready_for_activation"
        : r.state === "setting_up" && r.steps.every((step) => step.state !== "done")
          ? "not_set_up"
          : "setup_in_progress";

  const isPaid = session.firm.planTier === "paid";
  const attention = convsError
    ? []
    : buildNeedsAttention({
        overCapCount: isPaid ? 0 : convs.filter((c) => c.isOverCap === true).length,
        needsReviewCount: convs.filter((c) => c.tier === "Needs Review").length,
        openIssuesCount,
        pendingAppointmentRequestsCount: pendingRequests,
        canReceiveEmail,
      });

  const figures = buildActivityFigures(convs);
  const recent = recentConversations(convs);
  const usage = buildUsage(session);

  // A count is a claim about the business, so it may only be shown once the
  // data behind it actually arrived. On a failed read this figure shows an em
  // dash rather than "None yet".
  const callsSettled = !recentCallsQuery.isLoading && !recentCallsQuery.isError;

  const todayFigures = buildTodayFigures({
    callsToday: callsSettled ? countCallsToday(recentCallsQuery.items) : null,
    callsUnavailable: !callsSettled,
    conversationsToday: countToday(convs),
    pendingAppointmentRequests: pendingRequests,
  });

  // One next step. While setup is unfinished it is the first real action the
  // server's readiness asks for; once something needs attention, that wins.
  const fallback = buildNextBestAction({ receptionistState: state, attentionCount: attention.length });
  const setupStep = attention.length === 0 ? readinessNextStep(r) : null;
  const next = setupStep ?? fallback;

  const progress = readinessProgress(r);

  return (
    <div className="sd-page sd-enter">
      <PageHeader
        eyebrow={todayLabel()}
        title={greeting()}
        description={
          progress && progress.done < progress.total
            ? `Here is where ${session.firm.name}'s receptionist stands. ${progress.done} of ${progress.total} setup steps are complete.`
            : `Here is what is happening with ${session.firm.name}'s receptionist.`
        }
      />

      <div className="ws-overview">
        <StatusCard
          readiness={r}
          calendarReady={setup.signals.calendarReady}
          numberDisplay={setup.assignedNumberDisplay}
          next={next}
        />

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

        {DashboardPanel && (
          <Suspense fallback={<div className="sd-skel sd-skel--figures" aria-hidden="true" />}>
            <DashboardPanel readiness={r} />
          </Suspense>
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
            {!DashboardPanel && (
              <>
                <section className="sd-section" aria-labelledby="sd-today-title">
                  <h2 className="sd-h2" id="sd-today-title">
                    Today&rsquo;s activity
                  </h2>
                  <div className="ws-stats">
                    {todayFigures.map((figure) => (
                      <Link key={figure.key} href={figure.href} className="ws-stat">
                        <span
                          className="ws-stat__value"
                          data-empty={figure.value === null && !figure.unavailable ? "true" : "false"}
                          data-zero={figure.value === 0 ? "true" : "false"}
                        >
                          {figure.unavailable ? "—" : figure.value === null ? "None yet" : figure.value}
                        </span>
                        <span className="ws-stat__label">{figure.label}</span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="sd-section" aria-labelledby="sd-activity-title">
                  <h2 className="sd-h2" id="sd-activity-title">
                    Conversation activity
                  </h2>
                  <div className="ws-stats">
                    {figures.map((figure) => (
                      <Link key={figure.key} href={figure.href} className="ws-stat">
                        <span
                          className="ws-stat__value"
                          data-empty={figure.value === null && !figure.unavailable ? "true" : "false"}
                          data-zero={figure.value === 0 ? "true" : "false"}
                        >
                          {figure.unavailable ? "—" : figure.value === null ? "None yet" : figure.value}
                        </span>
                        <span className="ws-stat__label">{figure.label}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              </>
            )}

            {(!DashboardPanel || recent.length > 0) && (
              <section className="sd-section" aria-labelledby="sd-recent-title" style={{ marginTop: 0 }}>
                <div className="sd-section__head">
                  <h2 className="sd-h2" id="sd-recent-title">
                    Recent conversations
                  </h2>
                  {recent.length > 0 && (
                    <Link href="/activity/conversations" className="sd-link">
                      View all
                      <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
                    </Link>
                  )}
                </div>

                {recent.length === 0 ? (
                  <div className="sd-empty">
                    <h3 className="sd-empty__title">No conversations yet</h3>
                    <p className="sd-empty__detail">
                      Messages appear here when a supported messaging channel is configured.
                      Caller SMS is not included yet; review calls and
                      appointment requests in their own sections.
                    </p>
                  </div>
                ) : (
                  <ul className="sd-list">
                    {recent.map((conversation) => (
                      <li className="sd-list__item" key={conversation.id}>
                        <Link href="/activity/conversations" className="sd-row">
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
            )}
          </>
        )}

        {/* Compact usage line. Trial percentage only; a paid plan carries no
            percentage, per overviewContract.buildUsage. */}
        <section className="ws-note ws-usage-line" aria-labelledby="sd-usage-title">
          <h2 className="sd-sr" id="sd-usage-title">
            Usage
          </h2>
          <span>
            {/* Text-message (SMS) intake conversations, counted for the life of
                the account. Not calls, and not "this period" — voice minutes
                are a separate allowance shown on Usage. */}
            {usage.isPaid
              ? `${usage.used} SMS conversations recorded, all time.`
              : `Trial: ${usage.used} of ${usage.limit} SMS conversations used, all time${usage.percent !== null ? ` (${usage.percent}%)` : ""}.`}
          </span>
          <Link href="/account/billing" className="sd-link">
            View billing
          </Link>
        </section>
      </div>
    </div>
  );
}
