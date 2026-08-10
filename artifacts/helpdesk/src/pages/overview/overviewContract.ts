/**
 * Frontend V2 Phase 7 — the dashboard overview's facts, as pure functions.
 *
 * Everything the overview asserts about a firm is derived here, so that what
 * the page claims can be executed and asserted without a DOM, a renderer, or
 * any new dependency — exactly the arrangement Phases 5 and 6 established for
 * `signupContract.ts` and `loginContract.ts`.
 *
 * **The rule this module exists to enforce:** the overview states only what the
 * three authenticated endpoints actually prove. No value here has a fabricated
 * fallback — where a fact is unknown the functions return `null` and the page
 * renders an empty state, never a zero dressed up as a measurement.
 *
 * Three endpoints feed it, all pre-existing and unchanged:
 *
 *  - `GET /api/receptionist/auth/me`          → firm identity, plan, usage
 *  - `GET /api/receptionist/conversations`    → the real SMS conversation list
 *  - `GET /api/receptionist/agent-config`     → the receptionist's configuration
 *
 * A note on the third. The server answers agent-config with the configuration
 * **wrapped in a `firm` object** (`res.json({ firm: { … } })` in the protected
 * `receptionistAgentConfig.ts`, read and not modified). The previous overview
 * read those fields off the top level, so every field was `undefined` and the
 * setup checklist reported "0 of 3 steps completed" for firms that had in fact
 * completed all three. `readAgentConfig` below reads the documented shape, and
 * tolerates the flat one, so the page reports real configuration state. This
 * corrects a **frontend misread only** — the request, the endpoint, and the
 * response are untouched.
 *
 * No imports, so the module stays trivially portable into a plain `tsx` test
 * process with no path-alias resolution.
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

/** The agent configuration, flattened out of the server's `{ firm: … }` wrapper. */
export interface AgentConfigFields {
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

/**
 * Read the agent-config response. The documented shape is `{ firm: { … } }`;
 * a flat body is accepted too so the page cannot silently regress to reporting
 * "not configured" if that wrapper ever moves. An unrecognised body yields
 * `null`, which the page renders as "configuration unavailable" — never as
 * "nothing is set up".
 */
export function readAgentConfig(body: unknown): AgentConfigFields | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const source =
    record["firm"] && typeof record["firm"] === "object"
      ? (record["firm"] as Record<string, unknown>)
      : record;

  const has =
    "greetingMessage" in source ||
    "businessDescription" in source ||
    "qualifyingQuestions" in source;
  if (!has) return null;

  const questions = source["qualifyingQuestions"];
  return {
    greetingMessage: typeof source["greetingMessage"] === "string" ? source["greetingMessage"] : null,
    businessDescription:
      typeof source["businessDescription"] === "string" ? source["businessDescription"] : null,
    qualifyingQuestions: Array.isArray(questions)
      ? questions.filter((q): q is string => typeof q === "string")
      : [],
  };
}

// ─── Setup readiness — the page's spine ────────────────────────────────────

export interface SetupStep {
  key: "business" | "greeting" | "questions";
  label: string;
  /** Why it matters, in the owner's terms. */
  detail: string;
  done: boolean;
  href: string;
}

/**
 * The three configuration facts that decide whether the SMS receptionist can
 * answer usefully. Each is read from the firm's own saved configuration; none
 * is inferred, defaulted, or assumed.
 */
export function buildSetupSteps(config: AgentConfigFields): SetupStep[] {
  return [
    {
      key: "business",
      label: "Describe your business",
      detail: "What the receptionist tells people you do.",
      done: Boolean(config.businessDescription?.trim()),
      href: "/receptionist",
    },
    {
      key: "greeting",
      label: "Write the first reply",
      detail: "The opening text sent when someone messages your number.",
      done: Boolean(config.greetingMessage?.trim()),
      href: "/receptionist",
    },
    {
      key: "questions",
      label: "Add qualifying questions",
      detail: "What the receptionist asks before handing a lead to you.",
      done: config.qualifyingQuestions.some((q) => q.trim().length > 0),
      href: "/receptionist",
    },
  ];
}

export type ReadinessState =
  /** Configuration could not be read. Neither "ready" nor "not set up". */
  | "unknown"
  /** One or more configuration steps are outstanding. */
  | "incomplete"
  /** Configured, and a real inbound conversation proves the pipeline works. */
  | "answering"
  /** Configured, but nothing has ever come in — a true and different state. */
  | "configured";

export interface Readiness {
  state: ReadinessState;
  steps: SetupStep[];
  completed: number;
  total: number;
  /** ISO timestamp of the most recent inbound activity, or null if none. */
  lastActivityAt: string | null;
  /**
   * False when the conversation request failed. "No conversations yet" and
   * "we could not load your conversations" are different statements, and the
   * page must not print the first when it only knows the second.
   */
  activityKnown: boolean;
}

/**
 * Derive the receptionist's readiness.
 *
 * The distinction between `answering` and `configured` is the whole point. The
 * dashboard has no endpoint that reports whether a Twilio number is live, so
 * "your receptionist is active" would be an assertion. A real inbound
 * conversation is *evidence*, and evidence is what the page shows instead.
 */
export function deriveReadiness(
  config: AgentConfigFields | null,
  conversations: OverviewConversation[],
  activityKnown = true,
): Readiness {
  const lastActivityAt = activityKnown ? latestActivity(conversations) : null;

  if (!config) {
    return { state: "unknown", steps: [], completed: 0, total: 3, lastActivityAt, activityKnown };
  }

  const steps = buildSetupSteps(config);
  const completed = steps.filter((s) => s.done).length;

  if (completed < steps.length) {
    return { state: "incomplete", steps, completed, total: steps.length, lastActivityAt, activityKnown };
  }
  return {
    state: lastActivityAt ? "answering" : "configured",
    steps,
    completed,
    total: steps.length,
    lastActivityAt,
    activityKnown,
  };
}

function latestActivity(conversations: OverviewConversation[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const c of conversations) {
    const t = new Date(c.lastMessageAt).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestIso = c.lastMessageAt;
    }
  }
  return bestIso;
}

// ─── Activity figures — counts of real rows, or nothing ────────────────────

export interface ActivityFigure {
  key: "week" | "hot" | "open";
  /** The number, or null when there is no conversation history to count. */
  value: number | null;
  label: string;
  /** Where this figure's rows can actually be read. */
  href: string;
  /** Only `hot` carries emphasis; the rest stay neutral. */
  emphasis: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Three counts, each a plain tally of rows the firm owns. When there are no
 * conversations at all the values are `null`, not `0`: "nothing has happened
 * yet" and "zero of the things I measured" are different statements, and the
 * page renders them differently.
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

// ─── Things that genuinely need the owner's attention ──────────────────────

export interface AttentionItem {
  key: "over-cap" | "needs-review";
  title: string;
  detail: string;
  href: string;
  action: string;
}

/**
 * Only real, actionable problems. Both are computed from fields the API
 * already returns, and both disappear entirely when they do not apply — this
 * list is empty far more often than not, and that is the intended behaviour.
 */
export function buildAttention(conversations: OverviewConversation[], isPaid: boolean): AttentionItem[] {
  const items: AttentionItem[] = [];

  const overCap = conversations.filter((c) => c.isOverCap === true).length;
  if (!isPaid && overCap > 0) {
    items.push({
      key: "over-cap",
      title: `${overCap} conversation${overCap === 1 ? "" : "s"} past your trial limit`,
      detail: "Conversations beyond the trial limit are not handled. Upgrading resumes them.",
      href: "/billing",
      action: "Review plan",
    });
  }

  const review = conversations.filter((c) => c.tier === "Needs Review").length;
  if (review > 0) {
    items.push({
      key: "needs-review",
      title: `${review} conversation${review === 1 ? "" : "s"} need${review === 1 ? "s" : ""} review`,
      detail: "The receptionist could not score these on its own.",
      href: "/conversations",
      action: "Open conversations",
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

// ─── Recent conversations ──────────────────────────────────────────────────

/** Most recently active first. Never padded to a fixed length. */
export function recentConversations(
  conversations: OverviewConversation[],
  limit = 5,
): OverviewConversation[] {
  return [...conversations]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, limit);
}
