// P2: call-state reconciliation — the sweep that notices what webhooks
// failed to tell us.
//
// Two conditions are detected, both as pure classification over the folded
// RealCallRecord so every branch is unit-testable without a database:
//
//   stale_in_progress — a call still non-final long after its last event.
//     The provider either lost the terminal webhook or the call genuinely
//     hung; either way an operator should know, and metering (P7) must not
//     trust the open-ended duration.
//
//   missing_report — a call that reached a terminal state via status-update
//     but never received an end-of-call-report after a grace period. The
//     report carries transcript/summary/analysis and the authoritative
//     ended reason; its absence degrades outcomes silently unless flagged.
//
// The sweep writes voice_issues rows (deduplicated per call by the issue
// service) and NOTHING else — it never mutates the event ledger, never
// synthesizes call events, and never contacts a provider. Wiring into the
// process is gated by VOICE_RECONCILIATION_ENABLED ("true" exactly; default
// off) per the program's disabled-by-default rule.

import type { RealCallRecord } from "./callStateModel.js";
import { listRealCallsForFirm } from "./realCallsRepository.js";
import { db } from "@workspace/db";
import { providerWebhookEvents } from "@workspace/db/schema/voice";
import { and, eq, gt } from "drizzle-orm";
import { openVoiceIssue, type OpenVoiceIssueResult } from "../../voiceIssues/voiceIssueService.js";

export const VOICE_RECONCILIATION_ENABLED_ENV_VAR = "VOICE_RECONCILIATION_ENABLED";

export function isVoiceReconciliationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_RECONCILIATION_ENABLED_ENV_VAR] === "true";
}

/** How long a non-final call may sit without events before it is flagged. */
export const STALE_IN_PROGRESS_AFTER_MS = 30 * 60 * 1000;
/** Grace period for the end-of-call-report after a terminal status-update. */
export const MISSING_REPORT_AFTER_MS = 10 * 60 * 1000;
/** The sweep only examines calls with any event inside this window. */
export const RECONCILIATION_LOOKBACK_MS = 48 * 60 * 60 * 1000;

export type ReconciliationFinding =
  | { kind: "stale_in_progress"; callId: string; lastEventAt: Date }
  | { kind: "missing_report"; callId: string; endedAt: Date };

export interface ReconciliationThresholds {
  staleInProgressAfterMs?: number;
  missingReportAfterMs?: number;
}

/** Pure classifier for one folded call record. */
export function classifyCallForReconciliation(
  record: RealCallRecord,
  now: Date,
  thresholds: ReconciliationThresholds = {},
): ReconciliationFinding | undefined {
  const staleAfter = thresholds.staleInProgressAfterMs ?? STALE_IN_PROGRESS_AFTER_MS;
  const reportAfter = thresholds.missingReportAfterMs ?? MISSING_REPORT_AFTER_MS;

  if (!record.isFinal) {
    if (now.getTime() - record.lastEventAt.getTime() >= staleAfter) {
      return { kind: "stale_in_progress", callId: record.callId, lastEventAt: record.lastEventAt };
    }
    return undefined;
  }

  if (!record.hasEndOfCallReport && record.endedAt) {
    if (now.getTime() - record.endedAt.getTime() >= reportAfter) {
      return { kind: "missing_report", callId: record.callId, endedAt: record.endedAt };
    }
  }
  return undefined;
}

export interface SweepDeps {
  now?: () => Date;
  thresholds?: ReconciliationThresholds;
  /** Firm ids with recent voice events. Injectable for tests. */
  listActiveFirmIds?: (since: Date) => Promise<number[]>;
  /** Folded call records for one firm. Injectable for tests. */
  listCallsForFirm?: (firmId: number) => Promise<RealCallRecord[]>;
  /** Issue sink. Injectable for tests. */
  openIssue?: typeof openVoiceIssue;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function defaultListActiveFirmIds(since: Date): Promise<number[]> {
  const rows = await db
    .selectDistinct({ firmId: providerWebhookEvents.firmId })
    .from(providerWebhookEvents)
    .where(and(eq(providerWebhookEvents.provider, "vapi"), gt(providerWebhookEvents.createdAt, since)));
  return rows.map((r) => r.firmId);
}

export interface SweepSummary {
  firmsExamined: number;
  callsExamined: number;
  staleInProgress: number;
  missingReport: number;
  issuesCreated: number;
  issuesRepeated: number;
}

/** One reconciliation pass over every firm with recent voice events. */
export async function runVoiceReconciliationOnce(deps: SweepDeps = {}): Promise<SweepSummary> {
  const now = deps.now?.() ?? new Date();
  const listFirms = deps.listActiveFirmIds ?? defaultListActiveFirmIds;
  const listCalls = deps.listCallsForFirm ?? listRealCallsForFirm;
  const openIssue = deps.openIssue ?? openVoiceIssue;

  const since = new Date(now.getTime() - RECONCILIATION_LOOKBACK_MS);
  const firmIds = await listFirms(since);

  const summary: SweepSummary = {
    firmsExamined: firmIds.length,
    callsExamined: 0,
    staleInProgress: 0,
    missingReport: 0,
    issuesCreated: 0,
    issuesRepeated: 0,
  };

  for (const firmId of firmIds) {
    const calls = await listCalls(firmId);
    summary.callsExamined += calls.length;
    for (const call of calls) {
      const finding = classifyCallForReconciliation(call, now, deps.thresholds);
      if (!finding) continue;

      let result: OpenVoiceIssueResult;
      if (finding.kind === "stale_in_progress") {
        summary.staleInProgress += 1;
        result = await openIssue({
          firmId,
          level: "warning",
          code: "call_stale_in_progress",
          message: "A call has had no provider events for over the stale threshold and never reached a terminal state.",
          dedupeKey: finding.callId,
          context: { callId: finding.callId, lastEventAt: finding.lastEventAt.toISOString() },
        });
      } else {
        summary.missingReport += 1;
        result = await openIssue({
          firmId,
          level: "warning",
          code: "call_missing_report",
          message: "A call ended but its end-of-call-report never arrived within the grace period.",
          dedupeKey: finding.callId,
          context: { callId: finding.callId, endedAt: finding.endedAt.toISOString() },
        });
      }
      if (result.created) summary.issuesCreated += 1;
      else summary.issuesRepeated += 1;
    }
  }

  deps.logger?.("voice_reconciliation_sweep", { ...summary });
  return summary;
}

/**
 * Interval wiring, called from index.ts. Returns a stop function. Does
 * nothing (and logs why) when the flag is off — the process stays inert by
 * default per the program's global safety rules.
 */
export function startVoiceReconciliationSweep(
  intervalMs: number,
  deps: SweepDeps & { env?: Record<string, string | undefined> } = {},
): () => void {
  if (!isVoiceReconciliationEnabled(deps.env ?? process.env)) {
    deps.logger?.("voice_reconciliation_disabled", { flag: VOICE_RECONCILIATION_ENABLED_ENV_VAR });
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // never overlap sweeps
    running = true;
    void runVoiceReconciliationOnce(deps)
      .catch((err) => deps.logger?.("voice_reconciliation_failed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
