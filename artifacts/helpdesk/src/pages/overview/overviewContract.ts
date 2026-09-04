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
  /** A phone number is assigned to this firm (from `voice/numbers`). */
  numberAssigned: boolean;
  /** The assistant's own status is "published" (from `voice/assistants`). */
  assistantPublished: boolean;
}

/**
 * "Live" requires both an assigned number and a published assistant — either
 * one alone is not enough to answer a real call. Short of that, completed
 * setup reads as "ready for activation" (S-3: activation itself only ever
 * happens with SiteMint, never automatically), any progress reads as
 * "in progress", and a blank slate reads as "not set up".
 */
export function deriveReceptionistState(input: ReceptionistStateInput): ReceptionistState {
  if (input.numberAssigned && input.assistantPublished) return "live";
  if (input.setupComplete) return "ready_for_activation";
  if (input.anyStepDone) return "setup_in_progress";
  return "not_set_up";
}

// ─── Activity figures — counts of real rows, or nothing ────────────────────

export interface ActivityFigure {
  key: string;
  /** The number, or null when there is nothing to count yet. */
  value: number | null;
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
    { key: "week", value: empty ? null : week, label: "Conversations this week", href: "/conversations", emphasis: false },
    { key: "hot", value: empty ? null : hot, label: "Hot leads", href: "/conversations", emphasis: true },
    { key: "open", value: empty ? null : open, label: "Still open", href: "/conversations", emphasis: false },
  ];
}

/** D-1 "today's activity": calls today, conversations today, pending appointment requests. */
export interface TodayActivityInput {
  /** null when the voice platform is unavailable or the query failed — never coerced to 0. */
  callsToday: number | null;
  conversationsToday: number | null;
  pendingAppointmentRequests: number | null;
}

export function buildTodayFigures(input: TodayActivityInput): ActivityFigure[] {
  return [
    { key: "calls-today", value: input.callsToday, label: "Calls today", href: "/logs", emphasis: false },
    { key: "conversations-today", value: input.conversationsToday, label: "Conversations today", href: "/conversations", emphasis: false },
    { key: "requests-pending", value: input.pendingAppointmentRequests, label: "Appointment requests pending", href: "/appointments", emphasis: true },
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

  if (input.openIssuesCount !== null && input.openIssuesCount > 0) {
    items.push({
      key: "open-issues",
      title: `${input.openIssuesCount} open issue${input.openIssuesCount === 1 ? "" : "s"}`,
      detail: "Something about your receptionist needs a look.",
      href: "/logs",
      action: "Review issues",
    });
  }

  if (input.overCapCount > 0) {
    items.push({
      key: "over-cap",
      title: `${input.overCapCount} conversation${input.overCapCount === 1 ? "" : "s"} past your trial limit`,
      detail: "Conversations beyond the trial limit are not handled. Upgrading resumes them.",
      href: "/billing",
      action: "Review plan",
    });
  }

  if (input.needsReviewCount > 0) {
    items.push({
      key: "needs-review",
      title: `${input.needsReviewCount} conversation${input.needsReviewCount === 1 ? "" : "s"} need${input.needsReviewCount === 1 ? "s" : ""} review`,
      detail: "The receptionist could not score these on its own.",
      href: "/conversations",
      action: "Open conversations",
    });
  }

  if (input.pendingAppointmentRequestsCount !== null && input.pendingAppointmentRequestsCount > 0) {
    items.push({
      key: "pending-requests",
      title: `${input.pendingAppointmentRequestsCount} appointment request${input.pendingAppointmentRequestsCount === 1 ? "" : "s"} pending`,
      detail: "A caller is waiting on a decision.",
      href: "/appointments",
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
      href: "/conversations",
    };
  }
  return {
    title: "Everything looks good",
    detail: "No open issues right now. Here's what happened recently.",
    actionLabel: "View recent activity",
    href: "/conversations",
  };
}

export interface PageCopy {
  eyebrow: string;
  title: string;
}

export function pageCopy(): PageCopy {
  return { eyebrow: "Dashboard", title: "Overview" };
}
