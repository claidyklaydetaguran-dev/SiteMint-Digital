// V5 PR-5: read-only, firm-scoped contact list/detail for the dashboard.
// Derived entirely from existing tables (voice_contacts, voice_call_links,
// voice_call_reviews, voice_sms_consents, intake_conversations,
// scheduling_appointment_requests) via the existing repositories'
// conventions — this module performs NO writes anywhere, and does not
// import or touch lib/voiceContacts/contactLinker.ts (the P5 call-linking
// module), which stays exactly as it is.

import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceContacts, voiceCallLinks, voiceCallReviews, voiceSmsConsents } from "@workspace/db/schema/voice";
import { intakeConversations } from "@workspace/db/schema";
import { schedulingAppointmentRequests } from "@workspace/db/schema/scheduling";
import { listRealCallsForFirm } from "../voice/webhooks/realCallsRepository.js";

export interface ContactListItem {
  id: number;
  name: string | null;
  phone: string;
  /** Always "voice" today — this list is sourced from voice_contacts. "sms" and "manual" are reserved for future data sources and never emitted yet. */
  source: "voice" | "sms" | "manual";
  lastInteractionAt: string;
  disposition: string | null;
  nextAppointmentAt: string | null;
  optedOut: boolean;
  callCount: number;
  conversationCount: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function listContactsForFirm(
  firmId: number,
  query: string | undefined,
  limit: number | undefined,
): Promise<ContactListItem[]> {
  const boundedLimit = Number.isInteger(limit) && (limit as number) > 0 ? Math.min(limit as number, MAX_LIMIT) : DEFAULT_LIMIT;
  const trimmedQuery = typeof query === "string" ? query.trim() : "";

  const whereClauses = [eq(voiceContacts.firmId, firmId)];
  if (trimmedQuery.length > 0) {
    const like = `%${trimmedQuery}%`;
    whereClauses.push(or(ilike(voiceContacts.displayName, like), ilike(voiceContacts.phoneE164, like))!);
  }

  const rows = await db
    .select({
      id: voiceContacts.id,
      name: voiceContacts.displayName,
      phone: voiceContacts.phoneE164,
      lastInteractionAt: voiceContacts.lastSeenAt,
      lastCallId: voiceContacts.lastCallId,
      callCount: sql<number>`(SELECT COUNT(*) FROM ${voiceCallLinks} WHERE ${voiceCallLinks.contactId} = ${voiceContacts.id})::int`,
      conversationCount: sql<number>`(
        SELECT COUNT(*) FROM ${intakeConversations}
        WHERE ${intakeConversations.firmId} = ${voiceContacts.firmId} AND ${intakeConversations.callerPhone} = ${voiceContacts.phoneE164}
      )::int`,
      optedOut: sql<boolean>`EXISTS (
        SELECT 1 FROM ${voiceSmsConsents}
        WHERE ${voiceSmsConsents.firmId} = ${voiceContacts.firmId}
          AND ${voiceSmsConsents.phoneE164} = ${voiceContacts.phoneE164}
          AND ${voiceSmsConsents.status} = 'stopped'
      )`,
      disposition: sql<string | null>`(
        SELECT ${voiceCallReviews.reviewState} FROM ${voiceCallReviews}
        WHERE ${voiceCallReviews.firmId} = ${voiceContacts.firmId} AND ${voiceCallReviews.callId} = ${voiceContacts.lastCallId}
        LIMIT 1
      )`,
      nextAppointmentAt: sql<string | null>`(
        SELECT ${schedulingAppointmentRequests.requestedStartAt} FROM ${schedulingAppointmentRequests}
        WHERE ${schedulingAppointmentRequests.firmId} = ${voiceContacts.firmId}
          AND ${schedulingAppointmentRequests.customerPhone} = ${voiceContacts.phoneE164}
          AND ${schedulingAppointmentRequests.status} = 'booked'
          AND ${schedulingAppointmentRequests.requestedStartAt} > now()
        ORDER BY ${schedulingAppointmentRequests.requestedStartAt} ASC
        LIMIT 1
      )`,
    })
    .from(voiceContacts)
    .where(and(...whereClauses))
    .orderBy(desc(voiceContacts.lastSeenAt))
    .limit(boundedLimit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    source: "voice" as const,
    lastInteractionAt: r.lastInteractionAt.toISOString(),
    disposition: r.disposition,
    nextAppointmentAt: r.nextAppointmentAt,
    optedOut: r.optedOut,
    callCount: r.callCount,
    conversationCount: r.conversationCount,
  }));
}

export interface ContactCallSummary {
  callId: string;
  startedAt: string;
  state: string;
}

export interface ContactConversationSummary {
  id: number;
  lastMessageAt: string;
  status: string;
}

export interface ContactDetail extends ContactListItem {
  createdAt: string;
}

export interface ContactDetailResult {
  contact: ContactDetail;
  calls: ContactCallSummary[];
  conversations: ContactConversationSummary[];
}

/** Firm-scoped by construction: a contact belonging to another firm never matches, so the caller sees undefined and answers 404 — never a cross-firm leak. */
export async function getContactDetailForFirm(firmId: number, contactId: number): Promise<ContactDetailResult | undefined> {
  const [contact] = await db
    .select()
    .from(voiceContacts)
    .where(and(eq(voiceContacts.id, contactId), eq(voiceContacts.firmId, firmId)))
    .limit(1);
  if (!contact) return undefined;

  const [callCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceCallLinks)
    .where(eq(voiceCallLinks.contactId, contact.id));
  const [conversationRows, optedOutRow, dispositionRow, nextAppointmentRow, callLinkRows] = await Promise.all([
    db
      .select({ id: intakeConversations.id, lastMessageAt: intakeConversations.lastMessageAt, status: intakeConversations.status })
      .from(intakeConversations)
      .where(and(eq(intakeConversations.firmId, firmId), eq(intakeConversations.callerPhone, contact.phoneE164)))
      .orderBy(desc(intakeConversations.lastMessageAt))
      .limit(20),
    db
      .select({ status: voiceSmsConsents.status })
      .from(voiceSmsConsents)
      .where(and(eq(voiceSmsConsents.firmId, firmId), eq(voiceSmsConsents.phoneE164, contact.phoneE164), eq(voiceSmsConsents.status, "stopped")))
      .limit(1),
    contact.lastCallId
      ? db
          .select({ reviewState: voiceCallReviews.reviewState })
          .from(voiceCallReviews)
          .where(and(eq(voiceCallReviews.firmId, firmId), eq(voiceCallReviews.callId, contact.lastCallId)))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ requestedStartAt: schedulingAppointmentRequests.requestedStartAt })
      .from(schedulingAppointmentRequests)
      .where(
        and(
          eq(schedulingAppointmentRequests.firmId, firmId),
          eq(schedulingAppointmentRequests.customerPhone, contact.phoneE164),
          eq(schedulingAppointmentRequests.status, "booked"),
          gte(schedulingAppointmentRequests.requestedStartAt, new Date()),
        ),
      )
      .orderBy(schedulingAppointmentRequests.requestedStartAt)
      .limit(1),
    db.select({ callId: voiceCallLinks.callId, createdAt: voiceCallLinks.createdAt }).from(voiceCallLinks).where(eq(voiceCallLinks.contactId, contact.id)).orderBy(desc(voiceCallLinks.createdAt)).limit(50),
  ]);

  // Call STATE is derived (provider_webhook_events is the source of truth —
  // there is no calls table, see voiceMonitoring.ts's schema comment); this
  // is a read-only join against the same repository the customer-facing
  // /receptionist/voice/calls route already uses.
  let callStateById = new Map<string, string>();
  try {
    const realCalls = await listRealCallsForFirm(firmId);
    callStateById = new Map(realCalls.map((c) => [c.callId, c.state]));
  } catch {
    // Call-state enrichment is best-effort; the linkage rows above still stand.
  }

  return {
    contact: {
      id: contact.id,
      name: contact.displayName,
      phone: contact.phoneE164,
      source: "voice",
      lastInteractionAt: contact.lastSeenAt.toISOString(),
      disposition: dispositionRow[0]?.reviewState ?? null,
      nextAppointmentAt: nextAppointmentRow[0]?.requestedStartAt.toISOString() ?? null,
      optedOut: optedOutRow.length > 0,
      callCount: callCountRow?.count ?? 0,
      conversationCount: conversationRows.length,
      createdAt: contact.createdAt.toISOString(),
    },
    calls: callLinkRows.map((c) => ({ callId: c.callId, startedAt: c.createdAt.toISOString(), state: callStateById.get(c.callId) ?? "unknown" })),
    conversations: conversationRows.map((c) => ({ id: c.id, lastMessageAt: c.lastMessageAt.toISOString(), status: c.status })),
  };
}
