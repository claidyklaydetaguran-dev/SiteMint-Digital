// P8: the voice subscription state machine.
//
// Stripe (or the grace-expiry sweep) produces EVENTS; this module owns the
// only legal transitions and their side effects, as pure decisions first
// (test-clock style: `now` is always injected in tests) and a thin
// persistence wrapper second.
//
// States: active → grace (payment failed, dunning window) → suspended
// (grace expired — a RECORDED state + critical issue; actually stopping
// service is owner-gated) | back to active (payment recovered);
// canceled ⇄ active (cancel / reactivate). Suspension never happens
// silently: entering it always opens a critical issue and an audit row.

export const SUBSCRIPTION_STATES = ["active", "grace", "suspended", "canceled"] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const SUBSCRIPTION_EVENTS = [
  "payment_succeeded",
  "payment_failed",
  "canceled",
  "reactivated",
  "grace_expired",
] as const;
export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

export const VOICE_BILLING_GRACE_DAYS_ENV_VAR = "VOICE_BILLING_GRACE_DAYS";
const DEFAULT_GRACE_DAYS = 7;

/** Bounded [1, 60]; default 7; malformed throws (a dunning window the operator believes exists must exist). */
export function loadGraceDaysFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env[VOICE_BILLING_GRACE_DAYS_ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_GRACE_DAYS;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 60) {
    throw new Error(`${VOICE_BILLING_GRACE_DAYS_ENV_VAR} must be an integer number of days in [1, 60].`);
  }
  return value;
}

export interface SubscriptionSnapshot {
  state: SubscriptionState;
  graceUntil: Date | null;
}

export type TransitionEffect =
  | { kind: "audit"; action: string }
  | { kind: "critical_issue"; code: "billing_suspended"; message: string };

export type TransitionDecision =
  | { changed: true; next: SubscriptionSnapshot; effects: TransitionEffect[] }
  | { changed: false; reason: "no_op" | "not_applicable" };

/**
 * The complete transition table. Anything not listed is refused as
 * not_applicable (e.g. grace_expired before graceUntil, payment_failed on
 * a canceled subscription). Idempotent by construction: re-delivering the
 * event that produced the current state is a no_op.
 */
export function applySubscriptionEvent(
  current: SubscriptionSnapshot,
  event: SubscriptionEvent,
  now: Date,
  graceDays: number,
): TransitionDecision {
  switch (event) {
    case "payment_succeeded": {
      if (current.state === "active") return { changed: false, reason: "no_op" };
      if (current.state === "canceled") return { changed: false, reason: "not_applicable" };
      // grace | suspended → recovered
      return {
        changed: true,
        next: { state: "active", graceUntil: null },
        effects: [{ kind: "audit", action: "subscription.payment_recovered" }],
      };
    }
    case "payment_failed": {
      if (current.state === "grace" || current.state === "suspended") return { changed: false, reason: "no_op" };
      if (current.state === "canceled") return { changed: false, reason: "not_applicable" };
      const graceUntil = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
      return {
        changed: true,
        next: { state: "grace", graceUntil },
        effects: [{ kind: "audit", action: "subscription.grace_entered" }],
      };
    }
    case "grace_expired": {
      if (current.state !== "grace") return { changed: false, reason: "not_applicable" };
      if (current.graceUntil === null || now.getTime() < current.graceUntil.getTime()) {
        return { changed: false, reason: "not_applicable" };
      }
      return {
        changed: true,
        next: { state: "suspended", graceUntil: null },
        effects: [
          { kind: "audit", action: "subscription.suspended" },
          {
            kind: "critical_issue",
            code: "billing_suspended",
            message: "The dunning window expired without payment; suspending service is requested (owner action).",
          },
        ],
      };
    }
    case "canceled": {
      if (current.state === "canceled") return { changed: false, reason: "no_op" };
      return {
        changed: true,
        next: { state: "canceled", graceUntil: null },
        effects: [{ kind: "audit", action: "subscription.canceled" }],
      };
    }
    case "reactivated": {
      if (current.state !== "canceled") return { changed: false, reason: "not_applicable" };
      return {
        changed: true,
        next: { state: "active", graceUntil: null },
        effects: [{ kind: "audit", action: "subscription.reactivated" }],
      };
    }
  }
}

// ── persistence wrapper ──────────────────────────────────────────────────────

export interface SubscriptionRow {
  firmId: number;
  planCode: string;
  state: SubscriptionState;
  graceUntil: Date | null;
}

export interface SubscriptionPersistenceDeps {
  findByStripeCustomerId: (stripeCustomerId: string) => Promise<SubscriptionRow | undefined>;
  findByFirmId: (firmId: number) => Promise<SubscriptionRow | undefined>;
  /** Guarded update: only applies while the row still holds `expectedState`. */
  updateState: (
    firmId: number,
    expectedState: SubscriptionState,
    next: SubscriptionSnapshot,
  ) => Promise<boolean>;
  listExpiredGrace: (now: Date) => Promise<SubscriptionRow[]>;
  /** Idempotency ledger write; false when the event was already recorded. */
  storeEventOnce: (firmId: number, provider: string, eventKey: string, eventType: string) => Promise<{ inserted: boolean }>;
  recordAudit: (firmId: number, action: string) => Promise<void>;
  openCriticalIssue: (firmId: number, code: "billing_suspended", message: string, dedupeKey: string) => Promise<void>;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

async function productionSubscriptionDeps(): Promise<SubscriptionPersistenceDeps> {
  const { db } = await import("@workspace/db");
  const { voiceSubscriptions } = await import("@workspace/db/schema/voice");
  const { and, eq, lt } = await import("drizzle-orm");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  const { openVoiceIssue } = await import("../voiceIssues/voiceIssueService.js");
  const toRow = (row: {
    firmId: number;
    planCode: string;
    state: string;
    graceUntil: Date | null;
  }): SubscriptionRow => ({
    firmId: row.firmId,
    planCode: row.planCode,
    state: row.state as SubscriptionState,
    graceUntil: row.graceUntil,
  });
  return {
    findByStripeCustomerId: async (stripeCustomerId) => {
      const [row] = await db
        .select()
        .from(voiceSubscriptions)
        .where(eq(voiceSubscriptions.stripeCustomerId, stripeCustomerId))
        .limit(1);
      return row ? toRow(row) : undefined;
    },
    findByFirmId: async (firmId) => {
      const [row] = await db.select().from(voiceSubscriptions).where(eq(voiceSubscriptions.firmId, firmId)).limit(1);
      return row ? toRow(row) : undefined;
    },
    updateState: async (firmId, expectedState, next) => {
      const rows = await db
        .update(voiceSubscriptions)
        .set({ state: next.state, graceUntil: next.graceUntil, updatedAt: new Date() })
        .where(and(eq(voiceSubscriptions.firmId, firmId), eq(voiceSubscriptions.state, expectedState)))
        .returning({ id: voiceSubscriptions.id });
      return rows.length > 0;
    },
    listExpiredGrace: async (now) => {
      const rows = await db
        .select()
        .from(voiceSubscriptions)
        .where(and(eq(voiceSubscriptions.state, "grace"), lt(voiceSubscriptions.graceUntil, now)))
        .limit(100);
      return rows.map(toRow);
    },
    storeEventOnce: async (firmId, provider, eventKey, eventType) => {
      const { providerWebhookEvents } = await import("@workspace/db/schema/voice");
      const result = await db
        .insert(providerWebhookEvents)
        .values({ firmId, provider, eventKey, payload: { eventType }, processedAt: new Date() })
        .onConflictDoNothing({ target: [providerWebhookEvents.provider, providerWebhookEvents.eventKey] })
        .returning({ id: providerWebhookEvents.id });
      return { inserted: result.length > 0 };
    },
    recordAudit: async (firmId, action) => {
      await recordAuditEvent({ firmId, actor: "system", action });
    },
    openCriticalIssue: async (firmId, code, message, dedupeKey) => {
      await openVoiceIssue({ firmId, level: "critical", code, message, dedupeKey });
    },
  };
}

export type ApplyOutcome =
  | { applied: true; next: SubscriptionSnapshot }
  | { applied: false; reason: "unknown_subscription" | "duplicate_event" | "no_op" | "not_applicable" | "concurrent_change" };

/**
 * Applies one event to the subscription found by Stripe customer id.
 * When `idempotency` is given, the event id is recorded in the
 * provider_webhook_events ledger first (after the firm is known) and a
 * redelivery becomes duplicate_event before any state is touched.
 */
export async function applyEventForStripeCustomer(
  stripeCustomerId: string,
  event: SubscriptionEvent,
  deps?: SubscriptionPersistenceDeps,
  idempotency?: { provider: string; eventKey: string },
): Promise<ApplyOutcome> {
  const resolved = deps ?? (await productionSubscriptionDeps());
  const row = await resolved.findByStripeCustomerId(stripeCustomerId);
  if (!row) return { applied: false, reason: "unknown_subscription" };
  if (idempotency) {
    const { inserted } = await resolved.storeEventOnce(row.firmId, idempotency.provider, idempotency.eventKey, event);
    if (!inserted) return { applied: false, reason: "duplicate_event" };
  }
  return applyEventToRow(row, event, resolved);
}

async function applyEventToRow(
  row: SubscriptionRow,
  event: SubscriptionEvent,
  resolved: SubscriptionPersistenceDeps,
): Promise<ApplyOutcome> {
  const now = resolved.now?.() ?? new Date();
  const graceDays = loadGraceDaysFromEnv(resolved.env ?? process.env);
  const decision = applySubscriptionEvent({ state: row.state, graceUntil: row.graceUntil }, event, now, graceDays);
  if (!decision.changed) return { applied: false, reason: decision.reason };
  const updated = await resolved.updateState(row.firmId, row.state, decision.next);
  if (!updated) return { applied: false, reason: "concurrent_change" };
  for (const effect of decision.effects) {
    try {
      if (effect.kind === "audit") await resolved.recordAudit(row.firmId, effect.action);
      else await resolved.openCriticalIssue(row.firmId, effect.code, effect.message, `${row.firmId}:billing`);
    } catch {
      // Effects are best-effort; the state change is the truth.
    }
  }
  return { applied: true, next: decision.next };
}

/** Gated by the same reconciliation flag as the other state-maintenance sweeps. */
export function startGraceExpirySweep(
  intervalMs: number,
  deps?: Partial<SubscriptionPersistenceDeps> & { logger?: (event: string, fields: Record<string, unknown>) => void },
): () => void {
  const env = deps?.env ?? process.env;
  if (env["VOICE_RECONCILIATION_ENABLED"] !== "true") {
    deps?.logger?.("grace_sweep_disabled", { flag: "VOICE_RECONCILIATION_ENABLED" });
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runGraceExpirySweepOnce(deps)
      .catch((err) => deps?.logger?.("grace_sweep_failed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export interface GraceSweepResult {
  scanned: number;
  suspended: number;
}

/** Suspends every subscription whose dunning window has expired. Test-clock friendly via deps.now. Repo deps are all-or-none. */
export async function runGraceExpirySweepOnce(deps?: Partial<SubscriptionPersistenceDeps>): Promise<GraceSweepResult> {
  const resolved = deps?.listExpiredGrace ? (deps as SubscriptionPersistenceDeps) : await productionSubscriptionDeps();
  const now = resolved.now?.() ?? new Date();
  const expired = await resolved.listExpiredGrace(now);
  let suspended = 0;
  for (const row of expired) {
    const outcome = await applyEventToRow(row, "grace_expired", resolved);
    if (outcome.applied) suspended += 1;
  }
  return { scanned: expired.length, suspended };
}
