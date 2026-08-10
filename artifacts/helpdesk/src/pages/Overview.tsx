/**
 * Frontend V2 Phase 7 — the default authenticated dashboard overview.
 *
 * The page answers one question: *is my SMS receptionist set up, and is
 * anything waiting on me?* Everything on it is derived from the three
 * authenticated endpoints the dashboard already called — no request, method,
 * payload, query key, or caching behaviour is changed by this file.
 *
 * ── What changed, and why ─────────────────────────────────────────────────
 *
 *  1. **The "Receptionist active" badge is gone.** No endpoint reports whether
 *     a number is live, so that badge was an assertion with nothing behind it.
 *     The page now shows evidence instead: configuration state (real, from
 *     agent-config) and the timestamp of the most recent real conversation.
 *
 *  2. **The setup checklist reports the truth.** The server sends agent-config
 *     wrapped in `{ firm: … }`; the previous page read the fields off the top
 *     level, so every field was `undefined` and a fully configured firm was
 *     told "0 of 3 steps completed". `readAgentConfig` reads the documented
 *     shape. Frontend misread only — see `overviewContract.ts`.
 *
 *  3. **The recharts bar chart is gone.** A seven-bar count of conversations
 *     cost 380 kB on the dashboard's own route chunk and told an owner less
 *     than the conversation list directly beneath it. The real counts remain,
 *     as figures.
 *
 *  4. **The three voice metric tiles are gone.** "Calls answered — Voice add-on
 *     required" implied a purchasable add-on that does not exist. Voice
 *     readiness is stated once, honestly, in the capability ladder.
 *
 * ── States ────────────────────────────────────────────────────────────────
 * Authentication loading is handled by `AppShell` before this renders.
 * This component covers: authenticated loading, empty account, populated,
 * partial data (agent-config failed but conversations loaded, and the
 * reverse), and request failure. A session expiry surfaces as a session error
 * and `AppShell` redirects — this page never renders authenticated content
 * without a resolved session.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Check, CircleDashed } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/hooks/useSession";
import { relativeTime } from "@/lib/conversationUi";
import { CAPABILITY_STATUS, READINESS } from "@/pages/login/readiness";
import {
  buildActivityFigures,
  buildAttention,
  deriveReadiness,
  readAgentConfig,
  recentConversations,
  type Readiness,
} from "@/pages/overview/overviewContract";
import "@/styles/v2-dashboard.css";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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

// ─── Status rail ───────────────────────────────────────────────────────────

function statusCopy(readiness: Readiness): { title: string; detail: string } {
  switch (readiness.state) {
    case "answering":
      return {
        title: "SMS receptionist configured",
        detail: `Most recent conversation activity ${relativeTime(readiness.lastActivityAt!)} ago.`,
      };
    case "configured":
      return {
        title: "SMS receptionist configured",
        detail: readiness.activityKnown
          ? "No conversations yet. The first one appears here once someone texts your business number."
          : "Setup is complete. Conversation activity could not be loaded just now.",
      };
    case "incomplete":
      // The count lives in the chip beside this copy, so it is not repeated
      // here — the sentence says what finishing the steps buys instead.
      return {
        title: "Finish setting up your receptionist",
        detail: "The receptionist answers with your own details once these are set.",
      };
    case "unknown":
    default:
      return {
        title: "Setup status unavailable",
        detail: "Your receptionist settings could not be loaded. Everything else on this page is current.",
      };
  }
}

function StatusRail({ readiness }: { readiness: Readiness }) {
  const { title, detail } = statusCopy(readiness);
  const showSteps = readiness.state === "incomplete";

  return (
    <section className="sd-status" data-state={readiness.state} aria-labelledby="sd-status-title">
      <div className="sd-status__head">
        <span className="sd-status__dot" aria-hidden="true" />
        <div className="sd-status__body">
          <h2 className="sd-status__title" id="sd-status-title">
            {title}
          </h2>
          <p className="sd-status__detail">{detail}</p>
        </div>
        {showSteps ? (
          <span className="sd-status__count">
            {readiness.completed}/{readiness.total} done
          </span>
        ) : (
          /* The capability whose status this card reports, stated in the same
             three-tier vocabulary the rest of the product uses. */
          <span className="sd-tier" data-tier="available">
            {READINESS.available.label}
          </span>
        )}
      </div>

      {showSteps && (
        <>
          <ul className="sd-steps">
            {readiness.steps.map((step) => (
              <li className="sd-step" key={step.key} data-done={step.done ? "true" : "false"}>
                {step.done ? (
                  <Check className="sd-step__mark" aria-hidden="true" />
                ) : (
                  <CircleDashed className="sd-step__mark" aria-hidden="true" />
                )}
                <div className="sd-step__body">
                  <span className="sd-step__label">
                    {step.label}
                    <span className="sd-sr">{step.done ? " — done" : " — not done yet"}</span>
                  </span>
                  <p className="sd-step__detail">{step.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {/* All three steps are edited on the same page, so there is one
              action rather than a repeated button on every row. */}
          <div className="sd-status__foot">
            <Link href={readiness.steps[0]!.href} className="sd-step__action">
              Open receptionist settings
            </Link>
          </div>
        </>
      )}
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

  // agent-config is partial data: its failure never blanks the page, and it is
  // never substituted with "nothing is configured".
  const { data: agentConfigBody, isLoading: configLoading, isError: configError } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => apiFetch<unknown>("/receptionist/agent-config"),
  });

  if (sessionLoading || convsLoading || configLoading) return <OverviewSkeleton />;
  if (!session) return null;

  const convs = conversations ?? [];
  const config = configError ? null : readAgentConfig(agentConfigBody);
  const readiness = deriveReadiness(config, convs, !convsError);
  const isPaid = session.firm.planTier === "paid";
  const attention = convsError ? [] : buildAttention(convs, isPaid);
  const figures = buildActivityFigures(convs);
  const recent = recentConversations(convs);

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <h1 className="sd-page__title">Overview</h1>
        <span className="sd-page__meta">{todayLabel()}</span>
      </div>

      <StatusRail readiness={readiness} />

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
                      <span className="sd-row__when">
                        {relativeTime(conversation.lastMessageAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Product readiness, stated once. The wording is the public site's,
          character-for-character — see pages/login/readiness.ts. */}
      <section className="sd-section" aria-labelledby="sd-ladder-title">
        <h2 className="sd-h2" id="sd-ladder-title">
          What&rsquo;s available
        </h2>
        <ul className="sd-ladder">
          {CAPABILITY_STATUS.map(({ capability, tier }) => (
            <li className="sd-ladder__item" key={capability} data-tier={tier}>
              <span className="sd-ladder__name">{capability}</span>
              <span className="sd-tier" data-tier={tier}>
                {READINESS[tier].label}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
