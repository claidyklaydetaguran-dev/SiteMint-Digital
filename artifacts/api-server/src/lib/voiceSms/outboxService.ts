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
  defaultSmsTransport,
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
  kind: "booking_confirmation" | "missed_call_followup",
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
  const transport = deps.transport ?? defaultSmsTransport;
  const now = deps.now?.() ?? new Date();

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
    const consent = await getConsent(row.firmId, row.toE164);
    if (consent !== "granted") {
      await db
        .update(voiceSmsOutbox)
        .set({ status: "blocked_no_consent", updatedAt: new Date() })
        .where(eq(voiceSmsOutbox.id, row.id));
      summary.blocked += 1;
      continue;
    }
    const result = await transport(config, row.toE164, row.body);
    if (result.ok) {
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

/** Delivery-status callback: updates the row owning this provider sid. Unknown sids are ignored (never an error path an attacker can probe). */
export async function recordDeliveryStatus(providerMessageSid: string, deliveryStatus: string): Promise<void> {
  await db
    .update(voiceSmsOutbox)
    .set({ deliveryStatus: deliveryStatus.slice(0, 32), updatedAt: new Date() })
    .where(eq(voiceSmsOutbox.providerMessageSid, providerMessageSid));
}
