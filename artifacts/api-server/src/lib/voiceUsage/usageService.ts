// P7: the immutable, idempotent voice usage ledger and the usage-cap state
// machine. Injectable repositories with lazy production defaults, matching
// the P2–P6 pattern.
//
// Two invariants this module owns:
//   1. One ledger row per (provider, callId), written once, never updated —
//      duplicate deliveries, replays, and the backfill sweep all collapse
//      into the same row via the unique index.
//   2. Exceeding the included-minutes cap only ever RECORDS a
//      pause_requested state and opens a critical issue. Nothing here (or
//      anywhere) pauses a number, assistant, or provider object — that is
//      an owner-gated action.

export const VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR = "VOICE_USAGE_INCLUDED_MINUTES";

/** UTC billing period for a call end time, e.g. "2026-08". */
export function computePeriodYm(at: Date): string {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Included minutes per firm per period. Null when unset (metering-only —
 * the ledger still accrues, no cap is evaluated). Throws on a malformed
 * value: a cap the operator believes exists must never silently not exist.
 */
export function loadUsageCapMinutesFromEnv(
  env: Record<string, string | undefined> = process.env,
): number | null {
  const raw = env[VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return null;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error(`${VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR} must be an integer number of minutes in [1, 1000000].`);
  }
  return value;
}

// ── recording ────────────────────────────────────────────────────────────────

export type UsageSource = "end_of_call_report" | "reconciliation";

export interface RecordUsageInput {
  firmId: number;
  provider: string;
  callId: string;
  durationSec: number;
  source: UsageSource;
  /** When the call ended — determines the billing period. */
  endedAt: Date;
}

export type RecordUsageResult =
  | { recorded: true }
  | { recorded: false; reason: "duplicate" | "invalid_duration" };

export interface UsageLedgerDeps {
  insertLedgerRow: (row: {
    firmId: number;
    provider: string;
    callId: string;
    durationSec: number;
    source: UsageSource;
    periodYm: string;
  }) => Promise<{ inserted: boolean }>;
  sumPeriod: (firmId: number, periodYm: string) => Promise<{ totalSeconds: number; callCount: number }>;
}

async function productionLedgerDeps(): Promise<UsageLedgerDeps> {
  const { db } = await import("@workspace/db");
  const { voiceUsageLedger } = await import("@workspace/db/schema/voice");
  const { and, eq, sql } = await import("drizzle-orm");
  return {
    insertLedgerRow: async (row) => {
      const result = await db
        .insert(voiceUsageLedger)
        .values(row)
        .onConflictDoNothing({ target: [voiceUsageLedger.provider, voiceUsageLedger.callId] })
        .returning({ id: voiceUsageLedger.id });
      return { inserted: result.length > 0 };
    },
    sumPeriod: async (firmId, periodYm) => {
      const [row] = await db
        .select({
          totalSeconds: sql<number>`coalesce(sum(${voiceUsageLedger.durationSec}), 0)::int`,
          callCount: sql<number>`count(*)::int`,
        })
        .from(voiceUsageLedger)
        .where(and(eq(voiceUsageLedger.firmId, firmId), eq(voiceUsageLedger.periodYm, periodYm)));
      return { totalSeconds: row?.totalSeconds ?? 0, callCount: row?.callCount ?? 0 };
    },
  };
}

/** Idempotent: the same call recorded twice (any source) is one row. */
export async function recordCallUsage(
  input: RecordUsageInput,
  deps?: UsageLedgerDeps,
): Promise<RecordUsageResult> {
  if (!Number.isFinite(input.durationSec) || input.durationSec < 0 || input.durationSec > 86_400) {
    return { recorded: false, reason: "invalid_duration" };
  }
  const resolved = deps ?? (await productionLedgerDeps());
  const { inserted } = await resolved.insertLedgerRow({
    firmId: input.firmId,
    provider: input.provider,
    callId: input.callId,
    durationSec: Math.round(input.durationSec),
    source: input.source,
    periodYm: computePeriodYm(input.endedAt),
  });
  return inserted ? { recorded: true } : { recorded: false, reason: "duplicate" };
}

export async function aggregateUsageForPeriod(
  firmId: number,
  periodYm: string,
  deps?: UsageLedgerDeps,
): Promise<{ totalSeconds: number; callCount: number }> {
  const resolved = deps ?? (await productionLedgerDeps());
  return resolved.sumPeriod(firmId, periodYm);
}

// ── cap evaluation ───────────────────────────────────────────────────────────

export interface UsageCapDeps {
  ledger?: UsageLedgerDeps;
  /** Inserts pause_requested for (firm, period) unless ANY row exists there. */
  insertCapState: (row: {
    firmId: number;
    periodYm: string;
    capMinutes: number;
    usedSecondsAtDetection: number;
  }) => Promise<{ inserted: boolean }>;
  openIssue: (input: {
    firmId: number;
    level: "critical";
    code: "usage_pause_requested";
    message: string;
    dedupeKey: string;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

async function productionCapDeps(): Promise<Pick<UsageCapDeps, "insertCapState" | "openIssue">> {
  const { db } = await import("@workspace/db");
  const { voiceUsageCapStates } = await import("@workspace/db/schema/voice");
  const issues = await import("../voiceIssues/voiceIssueService.js");
  return {
    insertCapState: async (row) => {
      const result = await db
        .insert(voiceUsageCapStates)
        .values({ ...row, state: "pause_requested" })
        .onConflictDoNothing({ target: [voiceUsageCapStates.firmId, voiceUsageCapStates.periodYm] })
        .returning({ id: voiceUsageCapStates.id });
      return { inserted: result.length > 0 };
    },
    openIssue: (input) => issues.openVoiceIssue(input),
  };
}

export type CapCheckResult =
  | { checked: false; reason: "no_cap_configured" }
  | { checked: true; exceeded: false; totalSeconds: number; capSeconds: number }
  | { checked: true; exceeded: true; requested: boolean; totalSeconds: number; capSeconds: number };

/**
 * Evaluates the current UTC period against the configured cap and, on first
 * detection for that (firm, period), records pause_requested + opens a
 * critical issue. A row already present — pause_requested (already asked)
 * or cleared (an operator explicitly decided to let the firm run on) —
 * suppresses re-detection for the rest of the period.
 */
export async function checkAndRecordUsageCap(
  firmId: number,
  deps: Partial<UsageCapDeps> = {},
): Promise<CapCheckResult> {
  const capMinutes = loadUsageCapMinutesFromEnv(deps.env ?? process.env);
  if (capMinutes === null) return { checked: false, reason: "no_cap_configured" };

  const ledger = deps.ledger ?? (await productionLedgerDeps());
  const now = deps.now?.() ?? new Date();
  const periodYm = computePeriodYm(now);
  const { totalSeconds } = await ledger.sumPeriod(firmId, periodYm);
  const capSeconds = capMinutes * 60;
  if (totalSeconds <= capSeconds) return { checked: true, exceeded: false, totalSeconds, capSeconds };

  const capDeps =
    deps.insertCapState && deps.openIssue
      ? { insertCapState: deps.insertCapState, openIssue: deps.openIssue }
      : await productionCapDeps();
  const { inserted } = await capDeps.insertCapState({
    firmId,
    periodYm,
    capMinutes,
    usedSecondsAtDetection: totalSeconds,
  });
  if (inserted) {
    await capDeps.openIssue({
      firmId,
      level: "critical",
      code: "usage_pause_requested",
      message: `Included voice minutes exceeded for ${periodYm}; pausing this firm's number is requested (owner action).`,
      dedupeKey: `${firmId}:${periodYm}`,
      context: { periodYm, capMinutes, usedSeconds: totalSeconds },
    });
  }
  return { checked: true, exceeded: true, requested: inserted, totalSeconds, capSeconds };
}

// ── backfill (reconciliation-side metering) ──────────────────────────────────

export interface UnmeteredReport {
  firmId: number;
  callId: string;
  durationSeconds: number;
  /** Stored event creation time — the period fallback when the report has no end time. */
  createdAt: Date;
}

export interface UsageBackfillDeps {
  listUnmeteredReports: (limit: number) => Promise<UnmeteredReport[]>;
  ledger?: UsageLedgerDeps;
  logger?: (event: string, fields: Record<string, unknown>) => void;
}

async function productionBackfillDeps(): Promise<Pick<UsageBackfillDeps, "listUnmeteredReports">> {
  const { db } = await import("@workspace/db");
  const { providerWebhookEvents, voiceUsageLedger } = await import("@workspace/db/schema/voice");
  const { and, eq, isNull, like, sql } = await import("drizzle-orm");
  return {
    listUnmeteredReports: async (limit) => {
      // End-of-call reports whose call has no ledger row yet. eventKey is
      // `${callId}:${type}` (see eventKey.ts), and the parsed payload keeps
      // durationSeconds top-level when the provider supplied one.
      const rows = await db
        .select({
          firmId: providerWebhookEvents.firmId,
          payload: providerWebhookEvents.payload,
          createdAt: providerWebhookEvents.createdAt,
        })
        .from(providerWebhookEvents)
        .leftJoin(
          voiceUsageLedger,
          and(
            eq(voiceUsageLedger.provider, providerWebhookEvents.provider),
            eq(voiceUsageLedger.callId, sql`split_part(${providerWebhookEvents.eventKey}, ':', 1)`),
          ),
        )
        .where(
          and(
            eq(providerWebhookEvents.provider, "vapi"),
            like(providerWebhookEvents.eventKey, "%:end-of-call-report"),
            isNull(voiceUsageLedger.id),
          ),
        )
        .limit(limit);
      const reports: UnmeteredReport[] = [];
      for (const row of rows) {
        const payload = row.payload as Record<string, unknown>;
        const call = payload["call"] as Record<string, unknown> | undefined;
        const callId = typeof call?.["id"] === "string" ? (call["id"] as string) : undefined;
        const duration = typeof payload["durationSeconds"] === "number" ? (payload["durationSeconds"] as number) : undefined;
        if (callId !== undefined && duration !== undefined) {
          reports.push({ firmId: row.firmId, callId, durationSeconds: duration, createdAt: row.createdAt });
        }
      }
      return reports;
    },
  };
}

export interface UsageBackfillResult {
  scanned: number;
  recorded: number;
}

/**
 * 15-minute metering backfill, gated by the SAME flag as call-state
 * reconciliation (metering backfill IS reconciliation). Inert by default.
 */
export function startUsageBackfillSweep(
  intervalMs: number,
  deps: Partial<UsageBackfillDeps> & { env?: Record<string, string | undefined> } = {},
): () => void {
  const env = deps.env ?? process.env;
  if (env["VOICE_RECONCILIATION_ENABLED"] !== "true") {
    deps.logger?.("usage_backfill_disabled", { flag: "VOICE_RECONCILIATION_ENABLED" });
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runUsageBackfillOnce(deps)
      .catch((err) => deps.logger?.("usage_backfill_failed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Meters reports whose live-path write was missed. Idempotent by construction. */
export async function runUsageBackfillOnce(deps: Partial<UsageBackfillDeps> = {}): Promise<UsageBackfillResult> {
  const listUnmetered = deps.listUnmeteredReports ?? (await productionBackfillDeps()).listUnmeteredReports;
  const reports = await listUnmetered(200);
  let recorded = 0;
  for (const report of reports) {
    const result = await recordCallUsage(
      {
        firmId: report.firmId,
        provider: "vapi",
        callId: report.callId,
        durationSec: report.durationSeconds,
        source: "reconciliation",
        endedAt: report.createdAt,
      },
      deps.ledger,
    );
    if (result.recorded) recorded += 1;
    else if (result.reason === "invalid_duration") {
      deps.logger?.("usage_backfill_invalid_duration", { callId: report.callId });
    }
  }
  return { scanned: reports.length, recorded };
}
