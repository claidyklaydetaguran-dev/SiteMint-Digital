// V7: durable delivery for the emails a BUSINESS receives about its own calls.
//
// Why an outbox and not a direct send from the webhook. A webhook must answer
// the provider quickly and must not fail because an email provider is slow;
// equally, "we tried once and it failed" is not good enough for the one message
// that tells a business a customer is waiting. So the webhook records the intent
// and returns, and a worker delivers it with retries.
//
// The four properties the owner asked for, and where each lives:
//
//   NO DUPLICATES      (firm_id, dedupe_key) is UNIQUE, so the same call can be
//                      announced only once no matter how many times its events
//                      are redelivered, or in what order.
//   RETRYABLE          attempts + next_attempt_at + a lease, reclaimed exactly
//                      like the signup pipeline's jobs, so a crashed worker's
//                      row is picked up instead of stranded in 'sending'.
//   OBSERVABLE         state distinguishes queued / sending / accepted / failed /
//                      abandoned, and `accepted` means the provider accepted it.
//                      Nothing here claims inbox delivery, which we cannot see.
//   SANITIZED          last_error_code holds one of our own short codes. Provider
//                      bodies, recipients and credentials never reach it.
//
// Either-order safety. A call's facts are final at end-of-call, so that is the
// event that ENQUEUES. A message saved during the call is already persisted by
// then. If a tool-call event is redelivered LATE — after the announcement was
// already queued — `refreshQueuedPostCallNotification` recomposes the pending
// body. If the email has already been accepted, nothing is re-sent: the message
// is still in the dashboard, and a second email would be the worse outcome.
// A short grace delay before the first attempt makes the late case rare rather
// than merely handled.

import { and, eq, inArray, lte, or, isNull } from "drizzle-orm";
import type { AlertTransport } from "../voiceAlerts/alertTransport.js";
import {
  composePostCallEmail,
  type PostCallFacts,
  type PostCallMessageFacts,
} from "./postCallComposer.js";
import { resolveVerifiedBusinessRecipient } from "./recipient.js";

/** Give a late tool-call redelivery time to land before the first send. */
export const POST_CALL_GRACE_MS = 20_000;
export const NOTIFICATION_LEASE_MS = 120_000;
export const NOTIFICATION_MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const CLAIM_BATCH = 10;
const WORKER_TICK_MS = 15_000;

export function notificationBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export function postCallDedupeKey(providerCallId: string): string {
  return `post_call:${providerCallId}`;
}

export function callerAckDedupeKey(messageId: number): string {
  return `caller_ack:${messageId}`;
}

async function wdb() {
  const { db } = await import("@workspace/db");
  const schema = await import("@workspace/db/schema/voice");
  return { db, voiceNotifications: schema.voiceNotifications };
}

// ── enqueue ──────────────────────────────────────────────────────────────────

export interface EnqueueNotificationInput {
  firmId: number;
  kind: "post_call_summary" | "caller_acknowledgement";
  dedupeKey: string;
  recipient: string;
  subject: string;
  body: string;
  /** Delay before the first attempt. Defaults to none. */
  graceMs?: number;
}

export type EnqueueOutcome =
  | { ok: true; inserted: boolean; id: number }
  | { ok: false; reason: "duplicate_unreadable" };

/**
 * Records one notification, idempotently. A second call for the same dedupe key
 * inserts nothing and reports `inserted: false` — the caller has not failed, it
 * has simply already been recorded.
 */
export async function enqueueNotification(input: EnqueueNotificationInput): Promise<EnqueueOutcome> {
  const { db, voiceNotifications } = await wdb();
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + (input.graceMs ?? 0));

  const inserted = await db
    .insert(voiceNotifications)
    .values({
      firmId: input.firmId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      state: "queued",
      nextAttemptAt,
    })
    .onConflictDoNothing({ target: [voiceNotifications.firmId, voiceNotifications.dedupeKey] })
    .returning({ id: voiceNotifications.id });

  if (inserted.length > 0) return { ok: true, inserted: true, id: inserted[0]!.id };

  const [existing] = await db
    .select({ id: voiceNotifications.id })
    .from(voiceNotifications)
    .where(
      and(eq(voiceNotifications.firmId, input.firmId), eq(voiceNotifications.dedupeKey, input.dedupeKey)),
    )
    .limit(1);
  if (!existing) return { ok: false, reason: "duplicate_unreadable" };
  return { ok: true, inserted: false, id: existing.id };
}

/**
 * Recomposes a notification that has NOT been sent yet.
 *
 * This is the late-event repair: a tool-call redelivered after the call already
 * ended would otherwise be missing from an email still sitting in the queue.
 * Conditional on state='queued', so an already-accepted announcement is left
 * exactly as it was sent — the dashboard remains the complete record.
 */
export async function refreshQueuedNotification(
  firmId: number,
  dedupeKey: string,
  subject: string,
  body: string,
): Promise<boolean> {
  const { db, voiceNotifications } = await wdb();
  const updated = await db
    .update(voiceNotifications)
    .set({ subject, body, updatedAt: new Date() })
    .where(
      and(
        eq(voiceNotifications.firmId, firmId),
        eq(voiceNotifications.dedupeKey, dedupeKey),
        eq(voiceNotifications.state, "queued"),
      ),
    )
    .returning({ id: voiceNotifications.id });
  return updated.length > 0;
}

// ── composing the post-call announcement from persisted facts ────────────────

export interface PostCallSourceDeps {
  loadBusinessName: (firmId: number) => Promise<string>;
  loadCallFacts: (firmId: number, providerCallId: string) => Promise<PostCallFacts | undefined>;
  loadMessages: (firmId: number, providerCallId: string) => Promise<PostCallMessageFacts[]>;
  resolveRecipient: (firmId: number) => Promise<{ ok: true; email: string } | { ok: false; reason: string }>;
  dashboardUrl: (providerCallId: string) => string;
  timeZone: (firmId: number) => Promise<string>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export function dashboardCallUrl(providerCallId: string, env: Record<string, string | undefined> = process.env): string {
  const base = (env["VOICE_DASHBOARD_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const path = `/ai-receptionist/dashboard/calls/${encodeURIComponent(providerCallId)}`;
  return base.length > 0 ? `${base}${path}` : path;
}

async function productionSourceDeps(): Promise<PostCallSourceDeps> {
  const { db } = await import("@workspace/db");
  const { intakeFirms } = await import("@workspace/db/schema");
  const calls = await import("../voice/webhooks/realCallsRepository.js");
  const messages = await import("../voiceMessages/messageRepository.js");
  const scheduling = await import("../scheduling/schedulingRepository.js");

  return {
    loadBusinessName: async (firmId) => {
      const [row] = await db
        .select({ name: intakeFirms.name })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      return row?.name ?? "Your business";
    },
    loadCallFacts: async (firmId, providerCallId) => {
      const call = await calls.getRealCallForFirm(firmId, providerCallId);
      if (!call) return undefined;
      return {
        providerCallId: call.callId,
        // A browser test has no customer number and no inbound phone-number id.
        // Labelling it is not cosmetic: an unlabelled test call in a business
        // inbox is indistinguishable from a real customer being ignored.
        source: call.callerNumberDisplay ? "telephone" : "browser_test",
        startedAt: call.firstEventAt,
        endedAt: call.endedAt ?? null,
        durationSec: call.durationSec ?? null,
        callerNumberDisplay: call.callerNumberDisplay ?? null,
        endedReason: call.endedReason ?? null,
      };
    },
    loadMessages: async (firmId, providerCallId) => {
      const rows = await messages.listVoiceMessagesForCall(firmId, providerCallId);
      return rows.map((row) => ({
        callerName: row.callerName,
        topic: row.topic,
        details: row.details,
        callbackPhone: row.callbackPhone,
        callbackEmail: row.callbackEmail,
        urgency: row.urgency === "urgent" ? "urgent" : "normal",
        emailAckRequested: row.emailAckRequested,
      }));
    },
    resolveRecipient: (firmId) => resolveVerifiedBusinessRecipient(firmId),
    dashboardUrl: (providerCallId) => dashboardCallUrl(providerCallId),
    timeZone: async (firmId) => {
      try {
        const config = await scheduling.buildAvailabilityConfig(firmId);
        return config.timezone;
      } catch {
        return "UTC";
      }
    },
  };
}

export type AnnounceOutcome =
  | { ok: true; inserted: boolean }
  | { ok: false; reason: "call_not_found" | "no_verified_recipient" };

/**
 * Announces one finished call to its business. Called from the end-of-call
 * handler; safe to call again for the same call.
 */
export async function announceFinishedCall(
  firmId: number,
  providerCallId: string,
  deps?: PostCallSourceDeps,
): Promise<AnnounceOutcome> {
  const resolved = deps ?? (await productionSourceDeps());
  const facts = await resolved.loadCallFacts(firmId, providerCallId);
  if (!facts) return { ok: false, reason: "call_not_found" };

  const recipient = await resolved.resolveRecipient(firmId);
  if (!recipient.ok) {
    // Not an error to retry: there is nowhere legitimate to send it yet.
    resolved.logger?.("voice_post_call_no_recipient", { firmId, reason: recipient.reason });
    return { ok: false, reason: "no_verified_recipient" };
  }

  const [businessName, messages, timeZone] = await Promise.all([
    resolved.loadBusinessName(firmId),
    resolved.loadMessages(firmId, providerCallId),
    resolved.timeZone(firmId),
  ]);

  const composed = composePostCallEmail({
    businessName,
    facts,
    messages,
    dashboardUrl: resolved.dashboardUrl(providerCallId),
    timeZone,
  });

  const outcome = await enqueueNotification({
    firmId,
    kind: "post_call_summary",
    dedupeKey: postCallDedupeKey(providerCallId),
    recipient: recipient.email,
    subject: composed.subject,
    body: composed.body,
    graceMs: POST_CALL_GRACE_MS,
  });
  if (!outcome.ok) return { ok: false, reason: "call_not_found" };

  // Already queued from an earlier delivery of the same event: refresh it so a
  // message saved in between is included.
  if (!outcome.inserted) {
    await refreshQueuedNotification(
      firmId,
      postCallDedupeKey(providerCallId),
      composed.subject,
      composed.body,
    );
  }
  return { ok: true, inserted: outcome.inserted };
}

/**
 * Repairs a pending announcement after a late message save. Never inserts, so a
 * mid-call message cannot trigger an email before the call has ended.
 */
export async function refreshQueuedPostCallNotification(
  firmId: number,
  providerCallId: string,
  deps?: PostCallSourceDeps,
): Promise<boolean> {
  const resolved = deps ?? (await productionSourceDeps());
  const facts = await resolved.loadCallFacts(firmId, providerCallId);
  if (!facts) return false;
  const [businessName, messages, timeZone] = await Promise.all([
    resolved.loadBusinessName(firmId),
    resolved.loadMessages(firmId, providerCallId),
    resolved.timeZone(firmId),
  ]);
  const composed = composePostCallEmail({
    businessName,
    facts,
    messages,
    dashboardUrl: resolved.dashboardUrl(providerCallId),
    timeZone,
  });
  return refreshQueuedNotification(
    firmId,
    postCallDedupeKey(providerCallId),
    composed.subject,
    composed.body,
  );
}

// ── worker ───────────────────────────────────────────────────────────────────

export interface NotificationWorkerDeps {
  transport: AlertTransport;
  now: () => Date;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function productionWorkerDeps(): Promise<NotificationWorkerDeps> {
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  return { transport: createAlertTransportFromEnv(), now: () => new Date() };
}

interface ClaimedNotification {
  id: number;
  firmId: number;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
}

async function claimDueNotifications(now: Date): Promise<ClaimedNotification[]> {
  const { db, voiceNotifications } = await wdb();
  return db.transaction(async (tx) => {
    const leaseDeadline = new Date(now.getTime() - NOTIFICATION_LEASE_MS);
    const due = await tx
      .select({ id: voiceNotifications.id })
      .from(voiceNotifications)
      .where(
        or(
          and(
            inArray(voiceNotifications.state, ["queued", "failed"]),
            lte(voiceNotifications.nextAttemptAt, now),
          ),
          // Crash recovery: a lease that expired while 'sending'. SKIP LOCKED
          // leaves a still-running worker's row alone, so only a genuinely
          // abandoned attempt is reclaimed.
          and(
            eq(voiceNotifications.state, "sending"),
            or(
              isNull(voiceNotifications.leaseExpiresAt),
              lte(voiceNotifications.leaseExpiresAt, leaseDeadline),
            ),
          ),
        ),
      )
      .orderBy(voiceNotifications.id)
      .limit(CLAIM_BATCH)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const claimed = await tx
      .update(voiceNotifications)
      .set({ state: "sending", leaseExpiresAt: now, updatedAt: now })
      .where(
        inArray(
          voiceNotifications.id,
          due.map((row) => row.id),
        ),
      )
      .returning({
        id: voiceNotifications.id,
        firmId: voiceNotifications.firmId,
        recipient: voiceNotifications.recipient,
        subject: voiceNotifications.subject,
        body: voiceNotifications.body,
        attempts: voiceNotifications.attempts,
      });
    return claimed;
  });
}

async function settleNotification(
  row: ClaimedNotification,
  result: { ok: true; providerMessageId?: string } | { ok: false; reason: string },
  now: Date,
): Promise<void> {
  const { db, voiceNotifications } = await wdb();
  const attempts = row.attempts + 1;

  if (result.ok) {
    await db
      .update(voiceNotifications)
      .set({
        state: "accepted",
        acceptedAt: now,
        providerMessageId: result.providerMessageId ?? null,
        attempts,
        lastErrorCode: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(voiceNotifications.id, row.id));
    return;
  }

  // 'alerts_disabled' is a configuration state, not a transport failure: keep
  // retrying rather than burning attempts, so turning email on later delivers
  // the backlog instead of discarding it.
  const configurationHold = result.reason === "alerts_disabled";
  const exhausted = !configurationHold && attempts >= NOTIFICATION_MAX_ATTEMPTS;
  await db
    .update(voiceNotifications)
    .set({
      state: exhausted ? "abandoned" : "failed",
      attempts: configurationHold ? row.attempts : attempts,
      // Already one of our own short codes; bounded defensively regardless.
      lastErrorCode: result.reason.slice(0, 60),
      nextAttemptAt: new Date(
        now.getTime() + (configurationHold ? MAX_BACKOFF_MS : notificationBackoffMs(attempts)),
      ),
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(voiceNotifications.id, row.id));
}

export interface NotificationRunSummary {
  claimed: number;
  accepted: number;
  failed: number;
}

export async function processDueNotifications(
  deps?: NotificationWorkerDeps,
): Promise<NotificationRunSummary> {
  const resolved = deps ?? (await productionWorkerDeps());
  const now = resolved.now();
  const rows = await claimDueNotifications(now);
  let accepted = 0;
  let failed = 0;

  for (const row of rows) {
    let result: { ok: true; providerMessageId?: string } | { ok: false; reason: string };
    try {
      result = await resolved.transport.send({
        to: row.recipient,
        subject: row.subject,
        text: row.body,
      });
    } catch {
      result = { ok: false, reason: "transport_threw" };
    }
    await settleNotification(row, result, resolved.now());
    if (result.ok) accepted += 1;
    else failed += 1;
  }

  if (rows.length > 0) {
    resolved.logger?.("voice_notifications_processed", { claimed: rows.length, accepted, failed });
  }
  return { claimed: rows.length, accepted, failed };
}

let workerStarted = false;

/**
 * In-process worker, mirroring the signup pipeline: one indexed SELECT per tick
 * when idle, and started once from boot.
 */
export function startVoiceNotificationWorker(log: {
  info: (o: object, m: string) => void;
  error: (o: object, m: string) => void;
}): void {
  if (workerStarted) return;
  workerStarted = true;
  const tick = async () => {
    try {
      const summary = await processDueNotifications();
      if (summary.claimed > 0) log.info({ ...summary }, "[voice-notifications] processed");
    } catch (err) {
      log.error(
        { errorClass: err instanceof Error ? err.name : "unknown" },
        "[voice-notifications] tick failed",
      );
    }
  };
  setInterval(tick, WORKER_TICK_MS).unref?.();
  void tick();
}
