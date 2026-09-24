// P5: consent ledger + outbound SMS outbox for the VOICE number.
//
// Sending discipline:
//   nothing sends without a row;
//   a row sends at most once (queued→sending claim is a guarded UPDATE);
//   consent is checked at SEND time against the voice channel's own ledger
//   (STOP always wins, whatever a booking form once said);
//   the whole path is inert unless VOICE_SMS_ENABLED and a valid, distinct
//   credential set exist.
//
// Missed-call recovery ships as architecture: enqueueMissedCallFollowup
// creates the row, but under the default policy a number with no explicit
// consent lands as 'blocked_no_consent' — turning that into a live text-back
// is an owner policy decision (documented hard stop), not a code path that
// can happen by accident.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceSmsConsents, voiceSmsOutbox, type VoiceSmsOutboxRow } from "@workspace/db/schema/voice";
import {
  isVoiceSmsEnabled,
  loadVoiceSmsConfig,
  loadVoiceSmsCaps,
  resolveVoiceSmsPublicOrigin,
  defaultSmsTransport,
  type VoiceSmsCaps,
  type SmsTransport,
  type VoiceSmsConfig,
} from "./smsCore.js";
import { normalizePhoneE164 } from "../voiceContacts/contactLinker.js";

export type ConsentStatus = "granted" | "stopped";

export async function getConsent(firmId: number, phoneE164: string): Promise<ConsentStatus | undefined> {
  const [row] = await db
    .select({ status: voiceSmsConsents.status })
    .from(voiceSmsConsents)
    .where(and(eq(voiceSmsConsents.firmId, firmId), eq(voiceSmsConsents.phoneE164, phoneE164)))
    .limit(1);
  return row?.status as ConsentStatus | undefined;
}

export async function recordConsent(
  firmId: number,
  phoneE164: string,
  status: ConsentStatus,
  source: "booking_consent" | "sms_start" | "sms_stop" | "operator",
): Promise<void> {
  const now = new Date();
  await db
    .insert(voiceSmsConsents)
    .values({ firmId, phoneE164, status, source, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [voiceSmsConsents.firmId, voiceSmsConsents.phoneE164],
      set: { status, source, updatedAt: now },
    });
}

// ── enqueue ──────────────────────────────────────────────────────────────────

export interface EnqueueResult {
  enqueued: boolean;
  reason?: "duplicate" | "unusable_number";
}

async function enqueue(
  firmId: number,
  toE164: string,
  kind: "booking_confirmation" | "missed_call_followup" | "appointment_update",
  body: string,
  dedupeKey: string,
  initialStatus: "queued" | "blocked_no_consent",
): Promise<EnqueueResult> {
  const rows = await db
    .insert(voiceSmsOutbox)
    .values({ firmId, toE164, kind, body: body.slice(0, 640), dedupeKey, status: initialStatus })
    .onConflictDoNothing({ target: voiceSmsOutbox.dedupeKey })
    .returning({ id: voiceSmsOutbox.id });
  return rows.length > 0 ? { enqueued: true } : { enqueued: false, reason: "duplicate" };
}

/** Booking confirmations require the caller's explicit in-call consent; without it, no row is created at all. */
export async function enqueueBookingConfirmation(input: {
  firmId: number;
  rawPhone: string | null | undefined;
  requestPublicId: string;
  spokenSummary: string;
  callerConsented: boolean;
}): Promise<EnqueueResult> {
  if (!input.callerConsented) return { enqueued: false, reason: "duplicate" };
  const normalized = normalizePhoneE164(input.rawPhone);
  if (!normalized) return { enqueued: false, reason: "unusable_number" };
  await recordConsent(input.firmId, normalized.e164, "granted", "booking_consent");
  return enqueue(
    input.firmId,
    normalized.e164,
    "booking_confirmation",
    input.spokenSummary,
    `booking_confirmation:${input.requestPublicId}`,
    "queued",
  );
}

/**
 * A text telling the caller the business approved, declined, cancelled or
 * moved their appointment from the dashboard. Only for a request whose row
 * records the caller's text consent. A STOP recorded since always wins: this
 * never re-grants consent over a stop, and the send loop re-checks at send
 * time. When no ledger row exists yet (the consent was recorded on the
 * request itself, not by an earlier text), the request's consent is written
 * to the ledger so the send loop can honour it.
 */
export async function enqueueAppointmentUpdate(input: {
  firmId: number;
  rawPhone: string | null | undefined;
  requestConsented: boolean;
  dedupeKey: string;
  body: string;
}): Promise<EnqueueResult & { skipped?: "no_consent" | "stopped" }> {
  if (!input.requestConsented) return { enqueued: false, skipped: "no_consent" };
  const normalized = normalizePhoneE164(input.rawPhone);
  if (!normalized) return { enqueued: false, reason: "unusable_number" };
  const consent = await getConsent(input.firmId, normalized.e164);
  if (consent === "stopped") return { enqueued: false, skipped: "stopped" };
  if (consent === undefined) await recordConsent(input.firmId, normalized.e164, "granted", "booking_consent");
  return enqueue(input.firmId, normalized.e164, "appointment_update", input.body, input.dedupeKey, "queued");
}

/**
 * Missed-call recovery ARCHITECTURE: creates the follow-up row, but a number
 * without explicit granted consent is stored as blocked_no_consent. The
 * policy that would queue such numbers for real sending is an owner
 * decision at activation — no default exists here.
 */
export async function enqueueMissedCallFollowup(input: {
  firmId: number;
  rawPhone: string | null | undefined;
  callId: string;
  body: string;
}): Promise<EnqueueResult> {
  const normalized = normalizePhoneE164(input.rawPhone);
  if (!normalized) return { enqueued: false, reason: "unusable_number" };
  const consent = await getConsent(input.firmId, normalized.e164);
  return enqueue(
    input.firmId,
    normalized.e164,
    "missed_call_followup",
    input.body,
    `missed_call_followup:${input.callId}`,
    consent === "granted" ? "queued" : "blocked_no_consent",
  );
}

// ── send loop ────────────────────────────────────────────────────────────────

export interface SendBatchDeps {
  isEnabled?: () => boolean;
  loadConfig?: () => VoiceSmsConfig;
  loadCaps?: () => VoiceSmsCaps;
  /** Texts already sent today (UTC), per firm and in total. */
  countSentToday?: (dayStart: Date) => Promise<{ total: number; byFirm: Map<number, number> }>;
  statusCallbackUrl?: string | null;
  transport?: SmsTransport;
  now?: () => Date;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export interface SendBatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  blocked: number;
}

const MAX_ATTEMPTS = 3;

/**
 * Processes up to `limit` queued messages. Claim-first (queued→sending via a
 * guarded UPDATE ... RETURNING) so two overlapping workers can never send
 * the same row; consent is re-checked at send time; the feature flag and a
 * valid distinct credential set are required or the batch is a no-op that
 * leaves every row queued.
 */
export async function sendQueuedVoiceSms(limit = 10, deps: SendBatchDeps = {}): Promise<SendBatchSummary> {
  const summary: SendBatchSummary = { claimed: 0, sent: 0, failed: 0, blocked: 0 };
  if (!(deps.isEnabled ?? isVoiceSmsEnabled)()) return summary;
  let config: VoiceSmsConfig;
  try {
    config = (deps.loadConfig ?? loadVoiceSmsConfig)();
  } catch {
    return summary; // misconfigured => inert, never a partial send
  }
  let caps: VoiceSmsCaps;
  try {
    caps = (deps.loadCaps ?? loadVoiceSmsCaps)();
  } catch {
    return summary; // a cap the operator believes is set must exist: inert, never uncapped
  }
  const transport = deps.transport ?? defaultSmsTransport;
  const now = deps.now?.() ?? new Date();
  const origin = deps.statusCallbackUrl !== undefined ? null : resolveVoiceSmsPublicOrigin();
  const statusCallbackUrl = deps.statusCallbackUrl ?? (origin ? `${origin}/api/voice/sms/status` : null);

  // A row left in 'sending' by a crash may or may not have gone out. Sending
  // it again could text the caller twice, so it is closed as failed with a
  // reason the office can see, never retried.
  if (!deps.transport) {
    await db
      .update(voiceSmsOutbox)
      .set({ status: "failed", errorCode: "interrupted", updatedAt: now })
      .where(sql`${voiceSmsOutbox.status} = 'sending' AND ${voiceSmsOutbox.updatedAt} < ${new Date(now.getTime() - 10 * 60_000)}`);
  }

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sentToday = await (deps.countSentToday ?? countSentTodayInDb)(dayStart);

  const claimed = await db
    .update(voiceSmsOutbox)
    .set({ status: "sending", attempts: sql`${voiceSmsOutbox.attempts} + 1`, updatedAt: now })
    .where(
      sql`${voiceSmsOutbox.id} IN (
        SELECT id FROM ${voiceSmsOutbox}
        WHERE ${voiceSmsOutbox.status} = 'queued'
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning();
  summary.claimed = claimed.length;

  for (const row of claimed as VoiceSmsOutboxRow[]) {
    // Spending caps, checked before consent so a capped row costs nothing.
    // A confirmation that cannot go today is closed, not held: arriving
    // tomorrow it would read as a new message about a stale appointment.
    const firmCount = sentToday.byFirm.get(row.firmId) ?? 0;
    if (sentToday.total >= caps.totalPerDay || firmCount >= caps.perFirmPerDay) {
      await db
        .update(voiceSmsOutbox)
        .set({ status: "failed", errorCode: "daily_cap_reached", updatedAt: new Date() })
        .where(eq(voiceSmsOutbox.id, row.id));
      summary.failed += 1;
      deps.logger?.("voice_sms_cap_reached", { firmId: row.firmId, firmCount, total: sentToday.total });
      continue;
    }
    const consent = await getConsent(row.firmId, row.toE164);
    if (consent !== "granted") {
      await db
        .update(voiceSmsOutbox)
        .set({ status: "blocked_no_consent", updatedAt: new Date() })
        .where(eq(voiceSmsOutbox.id, row.id));
      summary.blocked += 1;
      continue;
    }
    const result = await transport(config, row.toE164, row.body, statusCallbackUrl ? { statusCallbackUrl } : undefined);
    if (result.ok) {
      sentToday.total += 1;
      sentToday.byFirm.set(row.firmId, firmCount + 1);
      await db
        .update(voiceSmsOutbox)
        .set({ status: "sent", providerMessageSid: result.providerMessageSid, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(voiceSmsOutbox.id, row.id));
      summary.sent += 1;
    } else {
      const exhausted = row.attempts >= MAX_ATTEMPTS || !result.retryable;
      await db
        .update(voiceSmsOutbox)
        .set({ status: exhausted ? "failed" : "queued", errorCode: result.errorCode.slice(0, 40), updatedAt: new Date() })
        .where(eq(voiceSmsOutbox.id, row.id));
      summary.failed += 1;
    }
  }
  deps.logger?.("voice_sms_batch", { ...summary });
  return summary;
}

// ── worker ───────────────────────────────────────────────────────────────────

/** How often the sender looks for queued messages. */
export const VOICE_SMS_WORKER_TICK_MS = 30_000;

let smsWorkerStarted = false;

/**
 * Starts the sender.
 *
 * Until this existed, `sendQueuedVoiceSms` had no caller anywhere: a booking
 * confirmation the caller had consented to was written to the outbox and then
 * sat there for ever, which is worse than not offering it — the caller was told
 * a text was coming.
 *
 * It is safe to start unconditionally, and deliberately is: the batch function
 * returns immediately while `VOICE_SMS_ENABLED` is not "true" or the credential
 * set is incomplete, so an idle tick is one indexed SELECT and nothing can be
 * sent by accident. Starting it always is also what makes turning the flag on
 * deliver the backlog rather than requiring a restart — the same reasoning as
 * the post-call notification worker.
 */
export function startVoiceSmsWorker(log: {
  info: (o: object, m: string) => void;
  error: (o: object, m: string) => void;
}): void {
  if (smsWorkerStarted) return;
  smsWorkerStarted = true;
  const tick = async () => {
    try {
      const summary = await sendQueuedVoiceSms();
      if (summary.claimed > 0) log.info({ ...summary }, "[voice-sms] batch processed");
    } catch (err) {
      log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[voice-sms] tick failed");
    }
  };
  setInterval(tick, VOICE_SMS_WORKER_TICK_MS).unref?.();
  void tick();
}

async function countSentTodayInDb(dayStart: Date): Promise<{ total: number; byFirm: Map<number, number> }> {
  const rows = await db
    .select({ firmId: voiceSmsOutbox.firmId, n: sql<number>`count(*)::int` })
    .from(voiceSmsOutbox)
    .where(sql`${voiceSmsOutbox.status} = 'sent' AND ${voiceSmsOutbox.sentAt} >= ${dayStart}`)
    .groupBy(voiceSmsOutbox.firmId);
  const byFirm = new Map<number, number>();
  let total = 0;
  for (const r of rows) {
    byFirm.set(r.firmId, Number(r.n));
    total += Number(r.n);
  }
  return { total, byFirm };
}

/**
 * Twilio's delivery states in the order they happen. Callbacks can arrive out
 * of order, so a later-arriving "sent" must never overwrite "delivered".
 * Terminal states (delivered/undelivered/failed) are never replaced.
 */
const DELIVERY_RANK: Record<string, number> = {
  accepted: 1,
  queued: 2,
  sending: 3,
  sent: 4,
  delivered: 10,
  undelivered: 10,
  failed: 10,
  read: 11,
};

export function shouldReplaceDeliveryStatus(current: string | null | undefined, next: string): boolean {
  const nextRank = DELIVERY_RANK[next];
  if (nextRank === undefined) return false;
  if (!current) return true;
  const currentRank = DELIVERY_RANK[current] ?? 0;
  if (currentRank >= 10 && nextRank < 11) return false;
  return nextRank > currentRank;
}

/** Delivery-status callback: updates the row owning this provider sid. Unknown sids are ignored (never an error path an attacker can probe). */
export async function recordDeliveryStatus(providerMessageSid: string, deliveryStatus: string): Promise<void> {
  const next = deliveryStatus.slice(0, 32).toLowerCase();
  const [row] = await db
    .select({ id: voiceSmsOutbox.id, deliveryStatus: voiceSmsOutbox.deliveryStatus })
    .from(voiceSmsOutbox)
    .where(eq(voiceSmsOutbox.providerMessageSid, providerMessageSid))
    .limit(1);
  if (!row || !shouldReplaceDeliveryStatus(row.deliveryStatus, next)) return;
  await db
    .update(voiceSmsOutbox)
    .set({ deliveryStatus: next, updatedAt: new Date() })
    .where(eq(voiceSmsOutbox.id, row.id));
}
