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
import { ALERT_SEND_TIMEOUT_MS, type AlertTransport } from "../voiceAlerts/alertTransport.js";
import type { RealCallRecord } from "../voice/webhooks/callStateModel.js";
import {
  composePostCallEmail,
  type PostCallAppointmentFacts,
  type PostCallFacts,
  type PostCallMessageFacts,
} from "./postCallComposer.js";
import { resolveVerifiedBusinessRecipient } from "./recipient.js";

/** Give a late tool-call redelivery time to land before the first send. */
export const POST_CALL_GRACE_MS = 20_000;
export const NOTIFICATION_MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
export const NOTIFICATION_CLAIM_BATCH = 5;
const WORKER_TICK_MS = 15_000;

/**
 * How long one claim owns its rows. It must outlast the worst case of the whole
 * batch — every send in it running to the transport timeout — or a second
 * worker reclaims rows the first is still sending. It used to be 120 s against
 * a batch of ten 20 s sends, so a slow provider let the lease lapse mid-batch.
 */
export const NOTIFICATION_LEASE_MS = NOTIFICATION_CLAIM_BATCH * ALERT_SEND_TIMEOUT_MS + 60_000;

/**
 * The provider keeps an idempotency key for 24 hours from the first request
 * that used it. A row whose earlier attempt may have been accepted is resent
 * only while the key is certainly still held; the hour of margin covers clock
 * skew and a slow final attempt.
 */
export const NOTIFICATION_KEY_WINDOW_MS = 23 * 60 * 60_000;

export function notificationBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Whether a send result leaves it unknown if the provider accepted the message.
 * A timeout or dropped connection may have reached the provider, a 5xx may have
 * been processed, a lapsed lease means a worker stopped mid-send, and "in
 * progress" means the first request with this key has not finished. A 4xx, or a
 * hold that sent nothing, is a definite "not sent".
 */
export function outcomeIsUncertain(reason: string): boolean {
  return (
    reason === "transport_timeout" ||
    reason === "transport_error" ||
    reason === "transport_threw" ||
    reason === "lease_expired" ||
    reason === "provider_idempotency_in_progress" ||
    /^provider_status_5\d\d$/.test(reason)
  );
}

/** Results that sent nothing at all, so they neither start the key clock nor use an attempt. */
function isHold(reason: string): boolean {
  return reason === "alerts_disabled" || reason === "suppression_check_failed";
}

/** What a row remembers about the sends already tried for it. */
export interface AttemptHistory {
  attempts: number;
  firstAttemptAt: Date | null;
  outcomeUncertainAt: Date | null;
}

/**
 * True when sending again could email the business twice: an earlier attempt
 * may have been accepted, and the provider's key window — which began with the
 * first request — may have closed. Such a row is marked 'unconfirmed' for a
 * person to check instead of being sent again.
 */
export function resendWouldBeUnprotected(history: AttemptHistory, now: Date): boolean {
  return (
    history.outcomeUncertainAt !== null &&
    history.firstAttemptAt !== null &&
    now.getTime() - history.firstAttemptAt.getTime() >= NOTIFICATION_KEY_WINDOW_MS
  );
}

export type NotificationSendResult = { ok: true; providerMessageId?: string } | { ok: false; reason: string };

export interface Settlement extends AttemptHistory {
  state: "accepted" | "failed" | "abandoned" | "unconfirmed";
  providerMessageId: string | null;
  lastErrorCode: string | null;
  /** Null leaves the stored value alone (terminal states are never picked up again). */
  nextAttemptAt: Date | null;
}

/** A terminal decision made without sending. */
export function settleWithoutSending(
  history: AttemptHistory,
  code: string,
): Settlement {
  return {
    ...history,
    // Anything that might already have been sent is 'unconfirmed', never
    // 'abandoned' — abandoned claims nothing went out.
    state: history.outcomeUncertainAt !== null ? "unconfirmed" : "abandoned",
    providerMessageId: null,
    lastErrorCode: code,
    nextAttemptAt: null,
  };
}

/**
 * What one attempt's result does to its row. Pure, so every branch is tested
 * directly; the worker applies it only while its claim is still held.
 */
export function planSettlement(
  history: AttemptHistory,
  result: NotificationSendResult,
  attemptedAt: Date,
  now: Date,
): Settlement {
  if (result.ok) {
    return {
      state: "accepted",
      attempts: history.attempts + 1,
      firstAttemptAt: history.firstAttemptAt ?? attemptedAt,
      outcomeUncertainAt: history.outcomeUncertainAt,
      providerMessageId: result.providerMessageId ?? null,
      lastErrorCode: null,
      nextAttemptAt: null,
    };
  }
  // Already one of our own short codes; bounded defensively regardless.
  const reason = result.reason.slice(0, 60);
  if (isHold(reason)) {
    // Nothing left this process, so the attempt count and the key clock stay
    // as they were — turning email on later delivers the backlog instead of
    // discarding it.
    return {
      ...history,
      state: "failed",
      providerMessageId: null,
      lastErrorCode: reason,
      nextAttemptAt: new Date(now.getTime() + MAX_BACKOFF_MS),
    };
  }
  const next: AttemptHistory = {
    attempts: history.attempts + 1,
    firstAttemptAt: history.firstAttemptAt ?? attemptedAt,
    outcomeUncertainAt: history.outcomeUncertainAt ?? (outcomeIsUncertain(reason) ? attemptedAt : null),
  };
  if (reason === "provider_idempotency_conflict") {
    // The provider already processed this key with other content: something
    // went out under it. Never resend automatically.
    return {
      ...next,
      outcomeUncertainAt: next.outcomeUncertainAt ?? attemptedAt,
      state: "unconfirmed",
      providerMessageId: null,
      lastErrorCode: reason,
      nextAttemptAt: null,
    };
  }
  if (next.attempts >= NOTIFICATION_MAX_ATTEMPTS) return settleWithoutSending(next, reason);
  return {
    ...next,
    state: "failed",
    providerMessageId: null,
    lastErrorCode: reason,
    nextAttemptAt: new Date(now.getTime() + notificationBackoffMs(next.attempts)),
  };
}

/**
 * A row found still 'sending' after its lease ran out: the worker that claimed
 * it stopped mid-send. That attempt counts, and its outcome is unknown from the
 * moment it was claimed (the lease end minus its length — earlier than the real
 * request, which is the safe direction for the key window).
 */
export function planReclaim(history: AttemptHistory, lapsedLeaseExpiresAt: Date | null, now: Date): AttemptHistory {
  const claimedAt = lapsedLeaseExpiresAt
    ? new Date(lapsedLeaseExpiresAt.getTime() - NOTIFICATION_LEASE_MS)
    : now;
  return {
    attempts: history.attempts + 1,
    firstAttemptAt: history.firstAttemptAt ?? claimedAt,
    outcomeUncertainAt: history.outcomeUncertainAt ?? claimedAt,
  };
}

export function postCallDedupeKey(providerCallId: string): string {
  return `post_call:${providerCallId}`;
}

export function callerAckDedupeKey(messageId: number): string {
  return `caller_ack:${messageId}`;
}

/**
 * One key per appointment per OUTCOME, so the caller is emailed at most once
 * for "you asked for this" and at most once for "it is confirmed".
 *
 * Keyed on the request's durable public id rather than the call or the tool
 * call, because the things that repeat are the provider's events: a redelivered
 * end-of-call report, a retried tool call, a reconnect that replays the
 * conversation. All of them resolve to the same request, so all of them land on
 * the same key and insert nothing the second time.
 *
 * The stage is part of the key on purpose. A time that is requested and later
 * accepted is two different facts for the caller, and the second one is worth
 * an email; without the stage the confirmation would be swallowed as a
 * duplicate of the request.
 */
export function callerAppointmentAckDedupeKey(
  requestPublicId: string,
  stage: "pending" | "booked",
): string {
  return `caller_ack:appointment:${requestPublicId}:${stage}`;
}

/**
 * The provider-side idempotency key for one outbox row. Stable for the row's
 * whole life, so every retry of the same notification carries the same key.
 *
 * Found by exercising the staging deployment: a send that outlived the
 * transport timeout was recorded as failed although the provider had accepted
 * it, and the retry emailed the business a second copy 33 seconds later. The
 * dedupe key stops a second ROW; only this stops a second SEND. It is safe
 * because a row's subject and body can change only while it is still 'queued'
 * (refreshQueuedNotification), i.e. before any send was attempted — so a retry
 * always repeats the exact payload the key was first used with.
 *
 * The key only protects a retry for 24 hours. Six attempts with a 30-minute
 * backoff ceiling finish well inside that, but a row can also sit on a
 * configuration hold (email switched off) for days after an uncertain attempt;
 * `resendWouldBeUnprotected` is what stops that row being sent again blind.
 */
export function notificationIdempotencyKey(notificationId: number): string {
  return `voice-notification/${notificationId}`;
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
  /**
   * The appointments requested on this call. Optional so an existing caller
   * that supplies its own deps keeps working; absent means "none recorded",
   * which is what the composer already says.
   */
  loadAppointments?: (firmId: number, providerCallId: string) => Promise<PostCallAppointmentFacts[]>;
  resolveRecipient: (firmId: number) => Promise<{ ok: true; email: string } | { ok: false; reason: string }>;
  dashboardUrl: (providerCallId: string) => string;
  timeZone: (firmId: number) => Promise<string>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export function dashboardCallUrl(providerCallId: string, env: Record<string, string | undefined> = process.env): string {
  const base = (env["VOICE_DASHBOARD_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  // The dashboard mounts one call record at `/activity/calls/:id` (helpdesk
  // lib/routes.ts `callDetail`). The old `/calls/:id` shape here matched no
  // route, so every post-call email linked to a 404.
  const path = `/ai-receptionist/dashboard/activity/calls/${encodeURIComponent(providerCallId)}`;
  return base.length > 0 ? `${base}${path}` : path;
}

/**
 * The facts a post-call email may state, from a folded call record. Pure.
 *
 * Source used to be `callerNumberDisplay ? "telephone" : "browser_test"`. The
 * record's display value defaults to the placeholder "Unknown", which is
 * truthy, so every browser test was announced as a "Phone call" with no test
 * banner — exactly the mistake the composer's label exists to prevent. Found
 * by exercising the staging deployment with a labelled test event.
 *
 * - The label follows the call's channel (`deriveCallChannel`): the provider's
 *   own call type first, then a phone-number id or customer number. A withheld
 *   caller ID is still a telephone call, and a call with no evidence either way
 *   is 'unknown' — never presumed to be a test.
 * - A SiteMint QA event is labelled as one and never as a call.
 * - The caller's number is shown only when one was actually received; the
 *   placeholder never reaches the email as if it were data.
 * - Duration prefers the provider's own measurement over the receipt-time
 *   approximation, which reads 0s whenever only one event arrived.
 */
export function callFactsFromRecord(call: RealCallRecord): PostCallFacts {
  const source: PostCallFacts["source"] = call.synthetic
    ? "synthetic_qa"
    : call.channel === "browser"
      ? "browser_test"
      : call.channel === "telephone"
        ? "telephone"
        : "unknown";
  return {
    providerCallId: call.callId,
    source,
    startedAt: call.firstEventAt,
    endedAt: call.endedAt ?? null,
    durationSec: call.providerDurationSec ?? call.durationSec ?? null,
    callerNumberDisplay: call.callerNumberKnown ? call.callerNumberDisplay : null,
    endedReason: call.endedReason ?? null,
  };
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
      return call ? callFactsFromRecord(call) : undefined;
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
    loadAppointments: async (firmId, providerCallId) => {
      const rows = await scheduling.listAppointmentRequestsForCall(firmId, providerCallId);
      if (rows.length === 0) return [];
      // Types are resolved once, by id, so the email names the service the
      // caller chose rather than a number.
      let names = new Map<string, string>();
      try {
        const config = await scheduling.buildAvailabilityConfig(firmId);
        names = new Map(config.appointmentTypes.map((t) => [String(t.id), t.name]));
      } catch { /* an unreadable config must not lose the appointment */ }
      return rows.map((row) => ({
        customerName: row.customerName === "" ? "the caller" : row.customerName,
        appointmentTypeName: names.get(String(row.appointmentTypeId)) ?? "Appointment",
        startAt: row.requestedStartAt,
        status: row.status,
        customerEmail: row.customerEmail,
        customerPhone: row.customerPhone,
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

  const [businessName, messages, appointments, timeZone] = await Promise.all([
    resolved.loadBusinessName(firmId),
    resolved.loadMessages(firmId, providerCallId),
    resolved.loadAppointments?.(firmId, providerCallId) ?? Promise.resolve([]),
    resolved.timeZone(firmId),
  ]);

  const composed = composePostCallEmail({
    businessName,
    facts,
    messages,
    appointments,
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
  const [businessName, messages, appointments, timeZone] = await Promise.all([
    resolved.loadBusinessName(firmId),
    resolved.loadMessages(firmId, providerCallId),
    resolved.loadAppointments?.(firmId, providerCallId) ?? Promise.resolve([]),
    resolved.timeZone(firmId),
  ]);
  const composed = composePostCallEmail({
    businessName,
    facts,
    messages,
    appointments,
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
  /** True for an address a hard bounce or complaint has suppressed. */
  isSuppressed?: (address: string) => Promise<boolean>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function productionWorkerDeps(): Promise<NotificationWorkerDeps> {
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { isSuppressed } = await import("../inboundEmail.js");
  return {
    transport: createAlertTransportFromEnv(),
    now: () => new Date(),
    isSuppressed: async (address) => (await isSuppressed(address)).suppressed,
  };
}

interface ClaimedNotification extends AttemptHistory {
  id: number;
  firmId: number;
  recipient: string;
  subject: string;
  body: string;
  /** The claim token: a settlement lands only while the row still carries it. */
  leaseExpiresAt: Date;
}

/**
 * Claims up to a batch of due rows for this worker.
 *
 * The row lock is held only for this short transaction. What protects a send
 * that is still running is the LEASE: `lease_expires_at` is set to a real
 * expiry that outlasts the batch, a row is reclaimed only once that time has
 * passed, and every settlement is conditional on the lease value this claim
 * wrote. (The previous version stored the claim time as the "expiry" and
 * reclaimed 120 s later, while a batch could run for 200 s.)
 */
async function claimDueNotifications(now: Date): Promise<ClaimedNotification[]> {
  const { db, voiceNotifications } = await wdb();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: voiceNotifications.id,
        state: voiceNotifications.state,
        attempts: voiceNotifications.attempts,
        firstAttemptAt: voiceNotifications.firstAttemptAt,
        outcomeUncertainAt: voiceNotifications.outcomeUncertainAt,
        leaseExpiresAt: voiceNotifications.leaseExpiresAt,
      })
      .from(voiceNotifications)
      .where(
        or(
          and(
            inArray(voiceNotifications.state, ["queued", "failed"]),
            lte(voiceNotifications.nextAttemptAt, now),
          ),
          // A lease that has genuinely run out while 'sending': that worker
          // stopped mid-send.
          and(
            eq(voiceNotifications.state, "sending"),
            or(isNull(voiceNotifications.leaseExpiresAt), lte(voiceNotifications.leaseExpiresAt, now)),
          ),
        ),
      )
      .orderBy(voiceNotifications.id)
      .limit(NOTIFICATION_CLAIM_BATCH)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];

    const lease = new Date(now.getTime() + NOTIFICATION_LEASE_MS);
    const claimed: ClaimedNotification[] = [];
    for (const row of due) {
      const reclaimed = row.state === "sending";
      const history: AttemptHistory = reclaimed
        ? planReclaim(row, row.leaseExpiresAt, now)
        : { attempts: row.attempts, firstAttemptAt: row.firstAttemptAt, outcomeUncertainAt: row.outcomeUncertainAt };
      const [updated] = await tx
        .update(voiceNotifications)
        .set({
          state: "sending",
          leaseExpiresAt: lease,
          attempts: history.attempts,
          firstAttemptAt: history.firstAttemptAt,
          outcomeUncertainAt: history.outcomeUncertainAt,
          ...(reclaimed ? { lastErrorCode: "lease_expired" } : {}),
          updatedAt: now,
        })
        .where(eq(voiceNotifications.id, row.id))
        .returning({
          id: voiceNotifications.id,
          firmId: voiceNotifications.firmId,
          recipient: voiceNotifications.recipient,
          subject: voiceNotifications.subject,
          body: voiceNotifications.body,
        });
      if (updated) claimed.push({ ...updated, ...history, leaseExpiresAt: lease });
    }
    return claimed;
  });
}

/** Applies a settlement if, and only if, this worker still holds the claim. */
async function applySettlement(row: ClaimedNotification, settlement: Settlement, now: Date): Promise<boolean> {
  const { db, voiceNotifications } = await wdb();
  const updated = await db
    .update(voiceNotifications)
    .set({
      state: settlement.state,
      attempts: settlement.attempts,
      firstAttemptAt: settlement.firstAttemptAt,
      outcomeUncertainAt: settlement.outcomeUncertainAt,
      providerMessageId: settlement.providerMessageId,
      acceptedAt: settlement.state === "accepted" ? now : null,
      lastErrorCode: settlement.lastErrorCode,
      ...(settlement.nextAttemptAt ? { nextAttemptAt: settlement.nextAttemptAt } : {}),
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(voiceNotifications.id, row.id),
        eq(voiceNotifications.state, "sending"),
        eq(voiceNotifications.leaseExpiresAt, row.leaseExpiresAt),
      ),
    )
    .returning({ id: voiceNotifications.id });
  return updated.length > 0;
}

export interface NotificationRunSummary {
  claimed: number;
  accepted: number;
  failed: number;
  /** Terminal without a receipt: abandoned (nothing sent) or unconfirmed (may have been). */
  stopped: number;
  /** Rows this worker no longer owned when it came to send or settle them. */
  lostLease: number;
}

export async function processDueNotifications(
  deps?: NotificationWorkerDeps,
): Promise<NotificationRunSummary> {
  const resolved = deps ?? (await productionWorkerDeps());
  const rows = await claimDueNotifications(resolved.now());
  const summary: NotificationRunSummary = { claimed: rows.length, accepted: 0, failed: 0, stopped: 0, lostLease: 0 };

  for (const row of rows) {
    const now = resolved.now();
    // A claim that has already lapsed may belong to another worker by now.
    if (now.getTime() >= row.leaseExpiresAt.getTime()) {
      summary.lostLease += 1;
      continue;
    }

    let settlement: Settlement;
    if (resendWouldBeUnprotected(row, now)) {
      settlement = settleWithoutSending(row, "outcome_unknown_key_expired");
    } else if (row.attempts >= NOTIFICATION_MAX_ATTEMPTS) {
      // Only reachable when a reclaim used up the last attempt.
      settlement = settleWithoutSending(row, "lease_expired");
    } else {
      let suppressed = false;
      let suppressionUnknown = false;
      try {
        suppressed = resolved.isSuppressed ? await resolved.isSuppressed(row.recipient) : false;
      } catch {
        suppressionUnknown = true;
      }
      if (suppressionUnknown) {
        settlement = planSettlement(row, { ok: false, reason: "suppression_check_failed" }, now, now);
      } else if (suppressed) {
        settlement = settleWithoutSending(row, "recipient_suppressed");
      } else {
        let result: NotificationSendResult;
        try {
          result = await resolved.transport.send({
            to: row.recipient,
            subject: row.subject,
            text: row.body,
            idempotencyKey: notificationIdempotencyKey(row.id),
          });
        } catch {
          result = { ok: false, reason: "transport_threw" };
        }
        settlement = planSettlement(row, result, now, resolved.now());
      }
    }

    const applied = await applySettlement(row, settlement, resolved.now());
    if (!applied) {
      summary.lostLease += 1;
      resolved.logger?.("voice_notification_settle_lost_lease", { notificationId: row.id, state: settlement.state });
      continue;
    }
    if (settlement.state === "accepted") summary.accepted += 1;
    else if (settlement.state === "failed") summary.failed += 1;
    else summary.stopped += 1;
  }

  if (rows.length > 0) {
    resolved.logger?.("voice_notifications_processed", { ...summary });
  }
  return summary;
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
