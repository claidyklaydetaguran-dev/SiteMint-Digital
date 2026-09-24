/**
 * V5 customer-shell foundation — the dashboard overview's facts, as pure
 * functions (D-1: "is my receptionist live and healthy? what happened
 * recently? what needs attention? what next?").
 *
 * This module replaces the Phase 7 `readAgentConfig` / `buildSetupSteps` /
 * `deriveReadiness` trio. That trio answered a narrower question — "are the
 * three agent-config fields filled in?" — which the new Setup hub
 * (`pages/setup/setupContract.ts`, S-3) now owns in full, backed by the
 * persistent `GET/PUT /api/receptionist/onboarding` endpoint. Nothing here
 * duplicates that logic; Overview instead answers the four D-1 questions from
 * data it already has plus the same onboarding/assistant/number signals the
 * Setup hub reads, reduced to one status chip and one setup-progress pointer.
 * `readAgentConfig` is confirmed used nowhere else in the app (the
 * `/receptionist` "Current SMS Receptionist" page has its own copy in
 * `pages/receptionist/receptionistContract.ts`), so removing it here changes
 * no other route.
 *
 * Every value here still traces to a real, already-fetched response — no
 * fallback here is fabricated. Where a fact is unknown the functions return
 * `null` and the page renders an empty state, never a zero dressed up as a
 * measurement.
 */

// ─── Inputs, mirroring the live response shapes ────────────────────────────

export interface OverviewFirm {
  id: number;
  name: string;
  email: string | null;
  planTier: string;
  trialConversationsLimit: number;
  createdAt: string;
}

export interface OverviewSession {
  firm: OverviewFirm;
  conversationCount: number;
}

export type ConversationTier =
  | "Hot"
  | "Warm"
  | "Cold"
  | "Disqualified"
  | "Needs Review"
  | null;

export interface OverviewConversation {
  id: number;
  createdAt: string;
  lastMessageAt: string;
  callerPhone: string;
  status: "in_progress" | "completed" | "opted_out";
  isOverCap?: boolean;
  tier: ConversationTier;
  disqualifyReason: string | null;
}

// ─── Receptionist state — the D-1 status chip ──────────────────────────────

export type ReceptionistState = "not_set_up" | "setup_in_progress" | "ready_for_activation" | "live";

export const RECEPTIONIST_STATE_LABEL: Record<ReceptionistState, string> = {
  not_set_up: "Not set up",
  setup_in_progress: "Setup in progress",
  ready_for_activation: "Ready for activation",
  live: "Live",
};

export interface ReceptionistStateInput {
  /** Every non-review Setup step is done (`pages/setup/setupContract.ts` → `isSetupComplete`). */
  setupComplete: boolean;
  /** At least one Setup step is done — distinguishes "not started" from "in progress". */
  anyStepDone: boolean;
  /** A number whose state is exactly `assigned` (from `voice/numbers`). */
  numberAssigned: boolean;
  /** The assistant's own status is "published" (from `voice/assistants`). */
  assistantPublished: boolean;
  /**
   * The voice provider is running the configuration saved here
   * (`providerSyncState === "synchronized"`).
   */
  assistantSynchronized: boolean;
}

/**
 * "Live" is the strongest claim this dashboard makes, so it requires all three
 * things a real call actually depends on: a number in the `assigned` state, an
 * assistant whose status is `published`, and a provider that is running that
 * saved configuration.
 *
 * The third condition is the one that was missing. A published assistant whose
 * edits have not reached the provider is answering callers with an older
 * configuration — the provider keeps serving the last payload it confirmed —
 * so calling that "Live" tells a business its current setup is in use when it
 * demonstrably is not. Short of all three, completed setup reads as "ready for
 * activation" (S-3: activation itself only ever happens with SiteMint, never
 * automatically), any progress reads as "in progress", and a blank slate reads
 * as "not set up".
 */
export function deriveReceptionistState(input: ReceptionistStateInput): ReceptionistState {
  if (input.numberAssigned && input.assistantPublished && input.assistantSynchronized) {
    return "live";
  }
  if (input.setupComplete) return "ready_for_activation";
  if (input.anyStepDone) return "setup_in_progress";
  return "not_set_up";
}

// ─── Activity figures — counts of real rows, or nothing ────────────────────

export interface ActivityFigure {
  key: string;
  /** The number, or null when there is nothing to count yet. */
  value: number | null;
  /**
   * True when the figure could not be read at all — a failed or pending
   * request. Rendered as an em dash, never as "None yet": "no calls today" is
   * a claim about the business, and a request that did not arrive cannot
   * support it.
   */
  unavailable?: boolean;
  label: string;
  /** Where this figure's rows can actually be read. */
  href: string;
  emphasis: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Three counts, each a plain tally of rows the firm owns. When there are no
 * conversations at all the values are `null`, not `0`: "nothing has happened
 * yet" and "zero of the things I measured" are different statements.
 */
export function buildActivityFigures(
  conversations: OverviewConversation[],
  now: number = Date.now(),
): ActivityFigure[] {
  const empty = conversations.length === 0;
  const cutoff = now - WEEK_MS;

  const week = conversations.filter((c) => {
    const t = new Date(c.createdAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
  const hot = conversations.filter((c) => c.tier === "Hot").length;
  const open = conversations.filter((c) => c.status === "in_progress").length;

  return [
    { key: "week", value: empty ? null : week, label: "Conversations this week", href: "/activity/conversations", emphasis: false },
    { key: "hot", value: empty ? null : hot, label: "Hot leads", href: "/activity/conversations", emphasis: true },
    { key: "open", value: empty ? null : open, label: "Still open", href: "/activity/conversations", emphasis: false },
  ];
}

/** D-1 "today's activity": calls today, conversations today, pending appointment requests. */
export interface TodayActivityInput {
  /** null when the voice platform is unavailable or the query failed — never coerced to 0. */
  callsToday: number | null;
  conversationsToday: number | null;
  pendingAppointmentRequests: number | null;
  /** True when the calls request failed or has not arrived. */
  callsUnavailable?: boolean;
}

export function buildTodayFigures(input: TodayActivityInput): ActivityFigure[] {
  return [
    { key: "calls-today", value: input.callsToday, label: "Calls today", href: "/activity/calls", emphasis: false, unavailable: input.callsUnavailable === true },
    { key: "conversations-today", value: input.conversationsToday, label: "Conversations today", href: "/activity/conversations", emphasis: false },
    { key: "requests-pending", value: input.pendingAppointmentRequests, label: "Appointment requests pending", href: "/scheduling/appointments", emphasis: true },
  ];
}

/** How many real rows in `conversations` were created within the last 24 hours. */
export function countToday(conversations: OverviewConversation[], now: number = Date.now()): number | null {
  if (conversations.length === 0) return null;
  const cutoff = now - DAY_MS;
  return conversations.filter((c) => {
    const t = new Date(c.createdAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

// ─── Things that genuinely need the owner's attention ──────────────────────

export interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
}

export interface NeedsAttentionInput {
  overCapCount: number;
  needsReviewCount: number;
  /** null when the voice platform is off/unavailable — an unknown count is never shown as zero problems. */
  openIssuesCount: number | null;
  pendingAppointmentRequestsCount: number | null;
  /**
   * Whether the account can actually receive email, per the server's own
   * resolver. `null` when it could not be read — never shown as a problem,
   * and never shown as fine.
   */
  canReceiveEmail: boolean | null;
}

/**
 * D-1's needs-attention list: open issues, over-cap conversations, unscored
 * conversations, and pending appointment requests. Every entry is a real,
 * actionable problem computed from fields the API already returns; the list
 * is empty far more often than not, and that is the intended behaviour. A
 * `null` count (query failed or unavailable) never contributes an item —
 * "unknown" and "zero problems" must never be presented the same way, so the
 * page's own error/empty states carry that distinction instead of this list.
 */
export function buildNeedsAttention(input: NeedsAttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // First, because it is the one that silences everything else. Nothing is
  // ever sent to an unconfirmed address, so a business in this state receives
  // no call summary, no digest and no alert — and every other item on this
  // list is something it would otherwise have been told about.
  if (input.canReceiveEmail === false) {
    items.push({
      key: "email-unverified",
      title: "Your email address isn't confirmed",
      detail: "Nothing is sent to an unconfirmed address — no call summaries, no alerts, nothing.",
      href: "/verify-email",
      action: "Confirm email",
    });
  }

  if (input.openIssuesCount !== null && input.openIssuesCount > 0) {
    items.push({
      key: "open-issues",
      title: `${input.openIssuesCount} open issue${input.openIssuesCount === 1 ? "" : "s"}`,
      detail: "Something about your receptionist needs a look.",
      href: "/account/issues",
      action: "Review issues",
    });
  }

  if (input.overCapCount > 0) {
    items.push({
      key: "over-cap",
      title: `${input.overCapCount} conversation${input.overCapCount === 1 ? "" : "s"} past your trial limit`,
      detail: "Conversations beyond the trial limit are not handled. Upgrading resumes them.",
      href: "/account/billing",
      action: "Review plan",
    });
  }

  if (input.needsReviewCount > 0) {
    items.push({
      key: "needs-review",
      title: `${input.needsReviewCount} conversation${input.needsReviewCount === 1 ? "" : "s"} need${input.needsReviewCount === 1 ? "s" : ""} review`,
      detail: "The receptionist could not score these on its own.",
      href: "/activity/conversations",
      action: "Open conversations",
    });
  }

  if (input.pendingAppointmentRequestsCount !== null && input.pendingAppointmentRequestsCount > 0) {
    items.push({
      key: "pending-requests",
      title: `${input.pendingAppointmentRequestsCount} appointment request${input.pendingAppointmentRequestsCount === 1 ? "" : "s"} pending`,
      detail: "A caller is waiting on a decision.",
      href: "/scheduling/appointments",
      action: "Review requests",
    });
  }

  return items;
}

// ─── Trial usage ───────────────────────────────────────────────────────────

export interface UsageState {
  isPaid: boolean;
  used: number;
  limit: number;
  /** Whole percent, clamped 0–100. Meaningless for paid plans, hence null. */
  percent: number | null;
}

export function buildUsage(session: OverviewSession): UsageState {
  const isPaid = session.firm.planTier === "paid";
  const used = session.conversationCount;
  const limit = session.firm.trialConversationsLimit;
  if (isPaid) return { isPaid, used, limit, percent: null };
  const percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0;
  return { isPaid, used, limit, percent };
}

// ─── Recent activity ────────────────────────────────────────────────────────

/** Most recently active first. Never padded to a fixed length. */
export function recentConversations(
  conversations: OverviewConversation[],
  limit = 5,
): OverviewConversation[] {
  return [...conversations]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, limit);
}

export interface RecentCall {
  callId: string;
  stateLabel: string;
  callerNumberDisplay: string;
  startedAt: string;
}

/** Most recent first, capped at five — the recent-calls list (D-1). */
export function recentCalls(calls: RecentCall[], limit = 5): RecentCall[] {
  return [...calls]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

// ─── One next-best action ───────────────────────────────────────────────────

export interface NextBestAction {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

export interface NextBestActionInput {
  receptionistState: ReceptionistState;
  attentionCount: number;
}

/**
 * Exactly one action, per D-1: finish setup while it is incomplete;
 * otherwise, deal with the most pressing thing on the needs-attention list;
 * otherwise, there is nothing urgent and the action is simply to look at
 * what happened recently.
 */
export function buildNextBestAction(input: NextBestActionInput): NextBestAction {
  if (input.receptionistState !== "live" && input.receptionistState !== "ready_for_activation") {
    return {
      title: "Finish setting up your receptionist",
      detail: "Complete the remaining steps to get your receptionist ready.",
      actionLabel: "Continue setup",
      href: "/setup",
    };
  }
  if (input.receptionistState === "ready_for_activation") {
    return {
      title: "Setup is complete",
      detail: "Review everything and request activation with SiteMint.",
      actionLabel: "Go to setup review",
      href: "/setup",
    };
  }
  if (input.attentionCount > 0) {
    return {
      title: "Something needs your attention",
      detail: "Review the items below before they wait any longer.",
      actionLabel: "Review what needs attention",
      href: "/activity/conversations",
    };
  }
  return {
    title: "Everything looks good",
    detail: "No open issues right now. Here's what happened recently.",
    actionLabel: "View recent activity",
    href: "/activity/conversations",
  };
}

export interface PageCopy {
  eyebrow: string;
  title: string;
}

export function pageCopy(): PageCopy {
  return { eyebrow: "Dashboard", title: "Overview" };
}

// ─── Readiness → headline and next step (SiteMint Workspace, 2026-09-24) ──

/** The readiness shape these helpers need, kept structural so this module stays pure. */
export interface ReadinessLike {
  state: string;
  detail: string;
  next: { label: string; path: string } | null;
  steps: Array<{
    number: number;
    title: string;
    summary: string;
    state: string;
    checks: Array<{ key: string; label: string; state: string; detail: string; fixPath: string | null }>;
  }>;
}

export interface SetupNextStep {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

const ROUTE_ACTION: Array<[RegExp, string]> = [
  [/^\/assistants/, "Open your assistant"],
  [/^\/channels\/phone-number/, "Set up a phone number"],
  [/^\/channels\/transfer-contacts/, "Open transfer contacts"],
  [/^\/scheduling\/calendar/, "Open calendar"],
  [/^\/scheduling\//, "Open scheduling"],
  [/^\/activity\/calls/, "View calls"],
  [/^\/account\/settings/, "Open settings"],
  [/^\/verify-email/, "Confirm your email"],
  [/^\/setup/, "Continue setup"],
];

/** A verb phrase for the button that leads to `path`. */
export function actionLabelFor(path: string): string {
  return ROUTE_ACTION.find(([pattern]) => pattern.test(path))?.[1] ?? "Continue";
}

/**
 * The next thing to do, taken from the first unfinished check that has a
 * place to fix it — so the card names the action ("Publish your
 * receptionist") rather than the check ("Published"), which read as a state
 * that had already happened. Falls back to the server's own `next`.
 */
export function readinessNextStep(r: ReadinessLike | undefined): SetupNextStep | null {
  if (!r || !r.next) return null;
  for (const step of r.steps) {
    for (const c of step.checks) {
      if ((c.state === "todo" || c.state === "attention") && c.fixPath) {
        const [first, ...rest] = c.detail.split(/(?<=\.)\s+/);
        const title = (first ?? c.label).replace(/\.$/, "");
        const context = `Step ${step.number} of ${r.steps.length}: ${step.title}.`;
        return {
          title,
          detail: rest.length > 0 ? `${rest.join(" ")} ${context}` : context,
          actionLabel: actionLabelFor(c.fixPath),
          href: c.fixPath,
        };
      }
    }
  }
  return { title: r.next.label, detail: r.detail, actionLabel: actionLabelFor(r.next.path), href: r.next.path };
}

const HEADLINES: Record<string, string> = {
  setting_up: "Your receptionist is being set up",
  ready_to_test: "Ready for a test call",
  ready_to_activate_phone: "Tested and ready for a phone number",
  phone_connected: "Phone number connected",
  live_call_verified: "Answering calls",
  paused: "Your receptionist is paused",
  needs_attention: "Something needs your attention",
  not_checked: "Status not checked",
};

/** A plain-language headline for an overall readiness state. */
export function readinessHeadline(state: string | undefined): string {
  return (state && HEADLINES[state]) || "Status not checked";
}

/** Steps complete, for the progress bar and its text alternative. */
export function readinessProgress(r: ReadinessLike | undefined): { done: number; total: number } | null {
  if (!r || r.steps.length === 0) return null;
  return { done: r.steps.filter((s) => s.state === "done").length, total: r.steps.length };
}
