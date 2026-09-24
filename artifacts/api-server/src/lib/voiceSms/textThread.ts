// J4: the texts between a business's voice number and one caller, in order.
//
// Inbound texts are stored as they arrive (voice_sms_inbound, one row per
// provider message id, so a redelivered webhook stores nothing twice).
// Outbound texts already live in voice_sms_outbox with their send and
// delivery state. A thread is the two, merged by time, for one firm and one
// number — always filtered by firm, so another business's texts can never
// appear, even for the same caller.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceContacts, voiceSmsInbound, voiceSmsOutbox } from "@workspace/db/schema/voice";

export type InboundKeyword = "stop" | "start" | "help" | "other";

export async function storeInboundText(input: {
  firmId: number;
  fromE164: string;
  toE164: string;
  body: string;
  providerMessageSid: string;
  keyword: InboundKeyword;
}): Promise<{ inserted: boolean }> {
  const rows = await db
    .insert(voiceSmsInbound)
    .values({
      firmId: input.firmId,
      fromE164: input.fromE164,
      toE164: input.toE164,
      body: input.body.slice(0, 1600),
      providerMessageSid: input.providerMessageSid,
      keyword: input.keyword,
    })
    .onConflictDoNothing({ target: voiceSmsInbound.providerMessageSid })
    .returning({ id: voiceSmsInbound.id });
  return { inserted: rows.length > 0 };
}

/** Makes sure a texter has a contact to belong to; never renames or re-origins an existing one. */
export async function ensureTextContact(firmId: number, phoneE164: string): Promise<void> {
  const now = new Date();
  await db
    .insert(voiceContacts)
    .values({ firmId, phoneE164, origin: "text", firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [voiceContacts.firmId, voiceContacts.phoneE164], set: { lastSeenAt: now, updatedAt: now } });
}

export interface ThreadMessage {
  direction: "in" | "out";
  body: string;
  at: string;
  /** Outbound: queued | sending | sent | failed | blocked_no_consent. Inbound: received. */
  status: string;
  /** Outbound only: what the carrier reported (sent, delivered, undelivered, failed), when it did. */
  deliveryStatus: string | null;
  /** Outbound only: why a text did not go (e.g. daily_cap_reached, interrupted, a carrier code). */
  errorCode: string | null;
  /** Inbound only: stop | start | help | other. */
  keyword: InboundKeyword | null;
  unread: boolean;
}

export async function listTextThread(firmId: number, phoneE164: string, limit = 200): Promise<ThreadMessage[]> {
  const [inbound, outbound] = await Promise.all([
    db
      .select()
      .from(voiceSmsInbound)
      .where(and(eq(voiceSmsInbound.firmId, firmId), eq(voiceSmsInbound.fromE164, phoneE164)))
      .orderBy(desc(voiceSmsInbound.receivedAt))
      .limit(limit),
    db
      .select()
      .from(voiceSmsOutbox)
      .where(and(eq(voiceSmsOutbox.firmId, firmId), eq(voiceSmsOutbox.toE164, phoneE164)))
      .orderBy(desc(voiceSmsOutbox.createdAt))
      .limit(limit),
  ]);
  const messages: Array<ThreadMessage & { t: number }> = [
    ...inbound.map((m) => ({
      direction: "in" as const,
      body: m.body,
      at: m.receivedAt.toISOString(),
      t: m.receivedAt.getTime(),
      status: "received",
      deliveryStatus: null,
      errorCode: null,
      keyword: m.keyword as InboundKeyword,
      unread: m.readAt === null,
    })),
    ...outbound.map((m) => {
      const when = m.sentAt ?? m.createdAt;
      return {
        direction: "out" as const,
        body: m.body,
        at: when.toISOString(),
        t: when.getTime(),
        status: m.status,
        deliveryStatus: m.deliveryStatus,
        errorCode: m.errorCode,
        keyword: null,
        unread: false,
      };
    }),
  ];
  return messages
    .sort((a, b) => a.t - b.t)
    .slice(-limit)
    .map(({ t: _t, ...rest }) => rest);
}

export async function markTextThreadRead(firmId: number, phoneE164: string, at = new Date()): Promise<number> {
  const rows = await db
    .update(voiceSmsInbound)
    .set({ readAt: at, updatedAt: at })
    .where(and(eq(voiceSmsInbound.firmId, firmId), eq(voiceSmsInbound.fromE164, phoneE164), isNull(voiceSmsInbound.readAt)))
    .returning({ id: voiceSmsInbound.id });
  return rows.length;
}

/** Unread inbound texts per number, for one firm. */
export async function unreadTextCounts(firmId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({ from: voiceSmsInbound.fromE164, n: sql<number>`count(*)::int` })
    .from(voiceSmsInbound)
    .where(and(eq(voiceSmsInbound.firmId, firmId), isNull(voiceSmsInbound.readAt)))
    .groupBy(voiceSmsInbound.fromE164);
  return new Map(rows.map((r) => [r.from, Number(r.n)]));
}
