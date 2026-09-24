// P7: the operator daily digest — yesterday's calls, minutes, outcomes of
// note, and the open-issue picture per firm, one plain-text email through
// the alert transport. Gated by VOICE_DIGEST_ENABLED ("true" exactly;
// default off), so building and rendering are fully testable while sending
// stays inert.

import {
  createAlertTransportFromEnv,
  type AlertMessage,
  type AlertTransport,
} from "./alertTransport.js";

export const VOICE_DIGEST_ENABLED_ENV_VAR = "VOICE_DIGEST_ENABLED";

export function isVoiceDigestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_DIGEST_ENABLED_ENV_VAR] === "true";
}

export interface FirmDigest {
  firmId: number;
  windowStart: Date;
  windowEnd: Date;
  callCount: number;
  totalSeconds: number;
  issuesOpened: number;
  issuesUnresolved: number;
  callsAwaitingReview: number;
}

export interface DigestDeps {
  /** Firms with any ledger or issue activity inside the window. */
  listActiveFirmIds: (windowStart: Date, windowEnd: Date) => Promise<number[]>;
  sumLedgerWindow: (firmId: number, windowStart: Date, windowEnd: Date) => Promise<{ callCount: number; totalSeconds: number }>;
  countIssuesOpened: (firmId: number, windowStart: Date, windowEnd: Date) => Promise<number>;
  countIssuesUnresolved: (firmId: number) => Promise<number>;
  countCallsAwaitingReview: (firmId: number) => Promise<number>;
  transport?: AlertTransport;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  logger?: (event: string, fields: Record<string, unknown>) => void;
}

async function productionDigestDeps(): Promise<
  Pick<
    DigestDeps,
    "listActiveFirmIds" | "sumLedgerWindow" | "countIssuesOpened" | "countIssuesUnresolved" | "countCallsAwaitingReview"
  >
> {
  const { db } = await import("@workspace/db");
  const { voiceUsageLedger, voiceIssues, providerWebhookEvents, voiceCallReviews } = await import(
    "@workspace/db/schema/voice"
  );
  const { and, eq, gte, isNull, like, lt, sql } = await import("drizzle-orm");
  return {
    listActiveFirmIds: async (windowStart, windowEnd) => {
      const ledgerFirms = await db
        .selectDistinct({ firmId: voiceUsageLedger.firmId })
        .from(voiceUsageLedger)
        .where(and(gte(voiceUsageLedger.createdAt, windowStart), lt(voiceUsageLedger.createdAt, windowEnd)));
      const issueFirms = await db
        .selectDistinct({ firmId: voiceIssues.firmId })
        .from(voiceIssues)
        .where(and(gte(voiceIssues.createdAt, windowStart), lt(voiceIssues.createdAt, windowEnd)));
      return [...new Set([...ledgerFirms, ...issueFirms].map((r) => r.firmId))].sort((a, b) => a - b);
    },
    sumLedgerWindow: async (firmId, windowStart, windowEnd) => {
      const [row] = await db
        .select({
          callCount: sql<number>`count(*)::int`,
          totalSeconds: sql<number>`coalesce(sum(${voiceUsageLedger.durationSec}), 0)::int`,
        })
        .from(voiceUsageLedger)
        .where(
          and(
            eq(voiceUsageLedger.firmId, firmId),
            gte(voiceUsageLedger.createdAt, windowStart),
            lt(voiceUsageLedger.createdAt, windowEnd),
          ),
        );
      return { callCount: row?.callCount ?? 0, totalSeconds: row?.totalSeconds ?? 0 };
    },
    countIssuesOpened: async (firmId, windowStart, windowEnd) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(voiceIssues)
        .where(
          and(eq(voiceIssues.firmId, firmId), gte(voiceIssues.createdAt, windowStart), lt(voiceIssues.createdAt, windowEnd)),
        );
      return row?.count ?? 0;
    },
    countIssuesUnresolved: async (firmId) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(voiceIssues)
        .where(and(eq(voiceIssues.firmId, firmId), isNull(voiceIssues.resolvedAt)));
      return row?.count ?? 0;
    },
    countCallsAwaitingReview: async (firmId) => {
      // End-of-call reports with no review row: the operator's inbox size.
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(providerWebhookEvents)
        .leftJoin(
          voiceCallReviews,
          and(
            eq(voiceCallReviews.firmId, providerWebhookEvents.firmId),
            eq(voiceCallReviews.provider, providerWebhookEvents.provider),
            eq(voiceCallReviews.callId, sql`split_part(${providerWebhookEvents.eventKey}, ':', 1)`),
          ),
        )
        .where(
          and(
            eq(providerWebhookEvents.firmId, firmId),
            eq(providerWebhookEvents.provider, "vapi"),
            like(providerWebhookEvents.eventKey, "%:end-of-call-report"),
            isNull(voiceCallReviews.id),
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export async function buildFirmDigest(
  firmId: number,
  windowStart: Date,
  windowEnd: Date,
  deps: Pick<
    DigestDeps,
    "sumLedgerWindow" | "countIssuesOpened" | "countIssuesUnresolved" | "countCallsAwaitingReview"
  >,
): Promise<FirmDigest> {
  const ledger = await deps.sumLedgerWindow(firmId, windowStart, windowEnd);
  return {
    firmId,
    windowStart,
    windowEnd,
    callCount: ledger.callCount,
    totalSeconds: ledger.totalSeconds,
    issuesOpened: await deps.countIssuesOpened(firmId, windowStart, windowEnd),
    issuesUnresolved: await deps.countIssuesUnresolved(firmId),
    callsAwaitingReview: await deps.countCallsAwaitingReview(firmId),
  };
}

export function renderFirmDigest(digest: FirmDigest): AlertMessage {
  const day = digest.windowStart.toISOString().slice(0, 10);
  const minutes = Math.round(digest.totalSeconds / 60);
  return {
    subject: `[SiteMint voice] Daily digest ${day} (firm ${digest.firmId})`,
    text: [
      `Voice activity for ${day} (UTC):`,
      ``,
      `Calls metered:         ${digest.callCount}`,
      `Minutes used:          ${minutes}`,
      `Issues opened:         ${digest.issuesOpened}`,
      `Issues unresolved:     ${digest.issuesUnresolved}`,
      `Calls awaiting review: ${digest.callsAwaitingReview}`,
      ``,
      `This digest carries counts only — no customer content by design.`,
    ].join("\n"),
  };
}

export interface DigestRunResult {
  ran: boolean;
  firms: number;
  sent: number;
}

/** One digest pass over yesterday's UTC day. Sending requires both gates (digest + alerts). */
export async function runDailyDigestOnce(deps: Partial<DigestDeps> = {}): Promise<DigestRunResult> {
  const env = deps.env ?? process.env;
  if (!isVoiceDigestEnabled(env)) return { ran: false, firms: 0, sent: 0 };

  const now = deps.now?.() ?? new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowStart = new Date(todayUtc - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(todayUtc);

  // Repo deps are all-or-none: tests inject the full set, production
  // resolves the full set lazily.
  const repos = deps.listActiveFirmIds !== undefined ? (deps as DigestDeps) : await productionDigestDeps();
  const transport = deps.transport ?? createAlertTransportFromEnv(env);
  const firmIds = await repos.listActiveFirmIds(windowStart, windowEnd);
  let sent = 0;
  for (const firmId of firmIds) {
    const digest = await buildFirmDigest(firmId, windowStart, windowEnd, repos);
    const result = await transport.send(renderFirmDigest(digest));
    if (result.ok) sent += 1;
    else deps.logger?.("voice_digest_send_failed", { firmId, reason: result.reason });
  }
  return { ran: true, firms: firmIds.length, sent };
}

/** 24h scheduler, same shape as the reconciliation sweep. Inert unless gated on. */
export function startVoiceDigestSchedule(
  intervalMs: number,
  deps: Partial<DigestDeps> = {},
): () => void {
  const env = deps.env ?? process.env;
  if (!isVoiceDigestEnabled(env)) {
    deps.logger?.("voice_digest_disabled", { flag: VOICE_DIGEST_ENABLED_ENV_VAR });
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runDailyDigestOnce(deps)
      .catch((err) => deps.logger?.("voice_digest_failed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
