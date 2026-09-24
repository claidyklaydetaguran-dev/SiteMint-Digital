/**
 * Frontend V2 Phase 8 — derivation layer for the SMS Conversations workspace.
 *
 * Everything the workspace decides — what is filtered, what needs attention,
 * whether messaging is permitted, how messages group by day, what an error
 * says — is computed here as pure functions, so `conversationsContract.test.ts`
 * can execute the real logic instead of pattern-matching a component.
 *
 * ── The binding fact this module encodes ──────────────────────────────────
 *
 * **The dashboard cannot send an SMS.** `receptionistConversations.ts` exposes
 * exactly two routes and both are `GET`; there is no send endpoint anywhere in
 * the receptionist surface, and `intake_messages` has no delivery-status
 * column (`id / created_at / conversation_id / direction / body`). The only
 * outbound path in the product is the automated reply in `intakeAgent.ts`,
 * triggered by Twilio's inbound webhook — it is not operator-invokable.
 *
 * So this workspace has no composer control, no sending state, no delivery
 * badge, and no retry affordance. `messagingState()` reports the real reason
 * the operator cannot type a reply, and the UI renders that as information
 * rather than as a disabled text box, because a disabled text box implies a
 * capability that would light up under some other condition. None will.
 *
 * ── The other things deliberately not invented ────────────────────────────
 *
 *  • **Unread.** No column, no field, no endpoint. Attention is derived only
 *    from `status`, `isOverCap` and whether a case has been scored — all real.
 *  • **Contact names.** The API returns `callerPhone` and nothing else that
 *    identifies a person. The phone number is the identity; there is no
 *    fallback name, no initials-from-nothing, no generated avatar colour.
 *  • **Sentiment, summaries, scores.** `tier` and `disqualifyReason` are real
 *    rows from `intake_cases`; a null tier is reported as "not scored yet",
 *    which is a distinct true state, never defaulted to a tier.
 *  • **Pagination.** The list endpoint is unpaginated and returns the firm's
 *    whole set ordered by `last_message_at DESC`. Nothing here re-sorts it.
 */

// ─── Shapes (mirroring the server responses exactly) ───────────────────────

export type ConversationStatus = "in_progress" | "completed" | "opted_out";

export type ConversationTier =
  | "Hot"
  | "Warm"
  | "Cold"
  | "Disqualified"
  | "Needs Review";

export interface ContractConversation {
  id: number;
  createdAt: string;
  lastMessageAt: string;
  callerPhone: string;
  status: ConversationStatus;
  isOverCap?: boolean;
  tier: ConversationTier | null;
  disqualifyReason: string | null;
}

export interface ContractMessage {
  id: number;
  createdAt: string;
  conversationId: number;
  direction: "inbound" | "outbound";
  body: string;
}

/** The four views the list offers. Each maps to a real `status` value. */
export type StatusFilter = "all" | "active" | "completed" | "opted_out";

// ─── Counts and filtering ──────────────────────────────────────────────────

export interface StatusCounts {
  all: number;
  active: number;
  completed: number;
  opted_out: number;
}

export function statusCounts(list: readonly ContractConversation[]): StatusCounts {
  return {
    all: list.length,
    active: list.filter((c) => c.status === "in_progress").length,
    completed: list.filter((c) => c.status === "completed").length,
    opted_out: list.filter((c) => c.status === "opted_out").length,
  };
}

/**
 * Digits-only form of a phone string, so a typed `5551234` finds
 * `+1 (555) 123-4567`. This widens the previous raw-substring match rather
 * than replacing it — every query that matched before still matches — and it
 * is purely client-side: the request, its payload and its response are
 * untouched by searching.
 */
export function normalizePhoneQuery(value: string): string {
  return value.replace(/\D/g, "");
}

export function matchesQuery(conversation: ContractConversation, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (!query) return true;
  if (conversation.callerPhone.includes(query)) return true;
  const digits = normalizePhoneQuery(query);
  if (!digits) return false;
  return normalizePhoneQuery(conversation.callerPhone).includes(digits);
}

/**
 * Server order is the product's order. This filters and never sorts, so the
 * `last_message_at DESC` sequence the endpoint returns survives every view —
 * a conversation cannot jump position because a filter changed.
 */
export function filterConversations(
  list: readonly ContractConversation[],
  options: { status: StatusFilter; query: string },
): ContractConversation[] {
  return list.filter((c) => {
    if (options.status === "active" && c.status !== "in_progress") return false;
    if (options.status === "completed" && c.status !== "completed") return false;
    if (options.status === "opted_out" && c.status !== "opted_out") return false;
    return matchesQuery(c, options.query);
  });
}

// ─── Status presentation ───────────────────────────────────────────────────

export interface StatusPresentation {
  /** Drives styling. Never the sole carrier of meaning — `label` always shows. */
  tone: "active" | "neutral" | "stopped";
  label: string;
}

export function statusPresentation(status: ConversationStatus): StatusPresentation {
  switch (status) {
    case "in_progress":
      return { tone: "active", label: "Active" };
    case "opted_out":
      return { tone: "stopped", label: "Opted out" };
    case "completed":
    default:
      return { tone: "neutral", label: "Completed" };
  }
}

// ─── Attention ─────────────────────────────────────────────────────────────

export interface Attention {
  /** `true` only when something real is outstanding. */
  needsAttention: boolean;
  /** Genuine warnings — rendered amber. Empty unless a warning is real. */
  warnings: string[];
  /** Short reason shown beside the row. Empty when nothing is outstanding. */
  summary: string;
}

/**
 * Derived from verified fields only.
 *
 * There is no unread flag in this product, so "needs attention" cannot mean
 * "you have not looked at this". It means the conversation is still open:
 * `in_progress` is the receptionist's live set. The trial cap is the one
 * genuine warning the API reports, and an unscored case is a real, distinct
 * state rather than an assumed tier.
 */
export function attentionOf(conversation: ContractConversation): Attention {
  const warnings: string[] = [];
  if (conversation.isOverCap) {
    warnings.push("Past your trial conversation limit");
  }

  const open = conversation.status === "in_progress";
  const unscored = conversation.tier === null && conversation.status !== "opted_out";

  let summary = "";
  if (open && unscored) summary = "In progress, not scored yet";
  else if (open) summary = "In progress";
  else if (unscored) summary = "Not scored yet";

  return { needsAttention: open, warnings, summary };
}

/** Tier chip text, including the honest null case. */
export function tierLabel(tier: ConversationTier | null): string {
  return tier ?? "Not scored";
}

// ─── Messaging availability ────────────────────────────────────────────────

export type MessagingStateKey = "automatic" | "opted-out";

export interface MessagingState {
  key: MessagingStateKey;
  /** `false` for every state. The dashboard has no send endpoint to call. */
  canSend: false;
  tone: "neutral" | "stopped";
  title: string;
  detail: string;
}

/**
 * What the operator may do in this conversation right now.
 *
 * `canSend` is a literal `false` type, not a runtime flag: there is no branch
 * in this product where a dashboard user may send an SMS, so the type system
 * forbids a caller from rendering an enabled send control. When a real send
 * endpoint exists, this is the one place that has to change.
 */
export function messagingState(conversation: ContractConversation): MessagingState {
  if (conversation.status === "opted_out") {
    return {
      key: "opted-out",
      canSend: false,
      tone: "stopped",
      title: "This contact opted out",
      detail:
        "They replied STOP, so no further messages are sent to this number. Your receptionist resumes only if they text START.",
    };
  }

  return {
    key: "automatic",
    canSend: false,
    tone: "neutral",
    title: "Replies are sent automatically",
    detail:
      "Your SMS receptionist answers this conversation on its own. Replying by hand from the dashboard is not available yet.",
  };
}

// ─── Message grouping ──────────────────────────────────────────────────────

export interface MessageDayGroup {
  /** Stable key for React — the calendar day, not an array index. */
  key: string;
  label: string;
  messages: ContractMessage[];
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Groups by calendar day, preserving the server's ascending `created_at`
 * order both across groups and inside them. A `Map` keeps insertion order, so
 * this never reorders and never merges two non-adjacent days.
 */
export function groupMessagesByDay(
  messages: readonly ContractMessage[],
  now: Date = new Date(),
): MessageDayGroup[] {
  const groups = new Map<string, ContractMessage[]>();
  for (const message of messages) {
    const key = new Date(message.createdAt).toDateString();
    const bucket = groups.get(key);
    if (bucket) bucket.push(message);
    else groups.set(key, [message]);
  }
  return Array.from(groups, ([key, group]) => ({
    key,
    label: dayLabel(group[0]!.createdAt, now),
    messages: group,
  }));
}

/**
 * Who sent a message. `outbound` is the automated receptionist — the only
 * thing that sends on the business's behalf — and `inbound` is the contact,
 * named by their number because no other identity exists in the data.
 */
export function senderLabel(
  message: ContractMessage,
  conversation: ContractConversation,
): string {
  return message.direction === "outbound" ? "AI Receptionist" : conversation.callerPhone;
}

// ─── Timestamps ────────────────────────────────────────────────────────────

/** Machine-readable value for `<time datetime>`; empty for an unusable date. */
export function isoAttribute(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatAbsolute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeOfDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Errors ────────────────────────────────────────────────────────────────

export interface RequestFailure {
  title: string;
  detail: string;
  /** `true` when the session is the cause; the shell owns the redirect. */
  isSession: boolean;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const value = (error as { status?: unknown }).status;
    if (typeof value === "number") return value;
  }
  return undefined;
}

/**
 * A failed request must never be presented as an empty inbox — the previous
 * workspace rendered "No conversations found" for a 500, which told an owner
 * their business had no leads. Every failure says so, and says what is still
 * true.
 */
export function listFailure(error: unknown): RequestFailure {
  if (statusOf(error) === 401) {
    return {
      title: "Your session has expired",
      detail: "Sign in again to load your conversations.",
      isSession: true,
    };
  }
  return {
    title: "Conversations could not be loaded",
    detail: "This is a problem reaching your dashboard, not a change to your conversations.",
    isSession: false,
  };
}

export function detailFailure(error: unknown): RequestFailure {
  const status = statusOf(error);
  if (status === 401) {
    return {
      title: "Your session has expired",
      detail: "Sign in again to open this conversation.",
      isSession: true,
    };
  }
  if (status === 404) {
    return {
      title: "Conversation not available",
      detail: "It may have been removed, or it belongs to another workspace.",
      isSession: false,
    };
  }
  return {
    title: "Messages could not be loaded",
    detail: "The conversation itself is unchanged. Retry to load its messages again.",
    isSession: false,
  };
}

// ─── Empty states ──────────────────────────────────────────────────────────

export interface EmptyCopy {
  title: string;
  detail: string;
}

/**
 * Distinguishes "you have no conversations" from "this filter matched none",
 * so an owner never reads a filtered view as an empty business.
 */
export function emptyCopy(options: {
  status: StatusFilter;
  query: string;
  totalCount: number;
}): EmptyCopy {
  if (options.totalCount === 0) {
    return {
      title: "No conversations yet",
      detail:
        "The first one appears here as soon as someone texts your business number.",
    };
  }
  if (options.query.trim()) {
    return {
      title: "No matches for that number",
      detail: "Clear the search to see all conversations again.",
    };
  }
  switch (options.status) {
    case "active":
      return {
        title: "Nothing in progress",
        detail: "Conversations move here while your receptionist is still working them.",
      };
    case "completed":
      return {
        title: "No completed conversations",
        detail: "Finished conversations collect here.",
      };
    case "opted_out":
      return {
        title: "No one has opted out",
        detail: "Contacts who reply STOP appear here.",
      };
    case "all":
    default:
      return {
        title: "No conversations to show",
        detail: "Adjust the filter to see more.",
      };
  }
}
