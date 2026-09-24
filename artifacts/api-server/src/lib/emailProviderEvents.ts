// ── Provider delivery and engagement events ─────────────────────────────────
//
// One intake for everything the mail provider says about mail we sent, and one
// place that decides what each event means for the record it belongs to.
//
// The shape is store-then-process, and the reason is that the provider's
// patience is finite: Resend retries a failed delivery eight times over about
// a day and then the event is gone forever. So the webhook's only job is to
// verify the signature and write the row; interpreting it — suppression,
// matching, upgrading an unknown local outcome — happens against the stored
// row and can be retried by this server as often as it needs to, without ever
// asking the provider to send it again.
//
// Three rules hold everything else up:
//
//  1. ONE ROW PER svix-id. A provider retry or a dashboard replay is the same
//     event arriving twice, and counting it twice turns every engagement
//     figure into a multiple of the truth.
//  2. DELIVERY STATE IS DERIVED, never stored beside the events. See
//     lib/emailDeliveryState.ts — out-of-order arrival is normal, and a stored
//     state updated in arrival order eventually says "Delivered" about a
//     message that bounced.
//  3. AN UNKNOWN LOCAL OUTCOME IS ONLY EVER IMPROVED, never worsened.
//     `docs/crm-ops/DELIVERY-GUARANTEE.md` is binding: a send whose outcome we
//     could not observe is never retried automatically and never recorded as a
//     failure. A provider `delivered` event is the one thing that resolves it,
//     because it is evidence of arrival rather than an inference. Nothing else
//     an event says changes a local record's retry behaviour.

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  crmEmailProviderEvents,
  crmMessages,
  crmMarketingRecipients,
  crmSupportMessages,
  crmReminderDeliveries,
  crmAppointmentAttendees,
  crmStaffTokens,
  crmPortalInvitations,
  crmCampaignRecipients,
  crmCampaignScheduledMessages,
  crmCampaignEvents,
} from "@workspace/db";
import type { CrmEmailEventMatch, CrmEmailProviderEvent } from "@workspace/db";
import { logger } from "./logger.js";
import { suppressAddress } from "./inboundEmail.js";
import { stampReplyAndStop } from "./sequenceReply.js";
import { parseEmailRef, refFromTags, type EmailRecordKind } from "./emailRefs.js";
import {
  CLICKED_EVENT_TYPE, DELIVERY_EVENT_TYPES, OPENED_EVENT_TYPE,
  emailDomainOf, isKnownEmailEventType, summariseProviderDelivery,
  type EngagementEvidence, type ProviderDelivery, type ProviderDeliveryFacts,
} from "./emailDeliveryState.js";

// ── Configuration ───────────────────────────────────────────────────────────

export const DELIVERY_WEBHOOK_SECRET_VAR = "RESEND_WEBHOOK_SECRET";

/**
 * The signing secret for the DELIVERY-event endpoint.
 *
 * Deliberately its own variable and deliberately no fallback to the inbound
 * one: a Resend signing secret is per ENDPOINT, so sharing a value between two
 * endpoints means one of them refuses every request it receives.
 */
export function deliveryWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[DELIVERY_WEBHOOK_SECRET_VAR];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const DEFAULT_FROM_ADDRESS = "SiteMint Digital Solutions <noreply@sitemintdigital.com>";

/** The domain this server sends from — where open/click tracking is configured. */
export function sendingDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  return emailDomainOf(env["RESEND_FROM_EMAIL"] ?? DEFAULT_FROM_ADDRESS);
}

const MAX_PROCESSING_ATTEMPTS = 8;
/** Backoff for an interpretation that could not finish yet. */
const RETRY_BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000, 2 * 3600_000, 6 * 3600_000];
/** After this, a `processing` row belonged to a worker that is gone. */
const CLAIM_LEASE_MS = 5 * 60_000;

// ── Reading a payload ───────────────────────────────────────────────────────

export interface ProviderEventFacts {
  eventType: string;
  providerEmailId: string | null;
  crmRef: string | null;
  recipient: string | null;
  recipients: string[];
  senderDomain: string | null;
  occurredAt: Date;
  clickLink: string | null;
  bounceType: string | null;
  detail: string | null;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

function asDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function recipientsOf(data: Record<string, unknown>): string[] {
  const to = data["to"];
  if (Array.isArray(to)) return to.filter((v): v is string => typeof v === "string");
  return typeof to === "string" ? [to] : [];
}

/** The provider's own words about a failure, kept short enough to display. */
function detailOf(eventType: string, data: Record<string, unknown>): { detail: string | null; bounceType: string | null } {
  const object = (key: string) => (data[key] ?? null) as Record<string, unknown> | null;
  if (eventType === "email.bounced") {
    const bounce = object("bounce");
    const parts = [asString(bounce?.["type"]), asString(bounce?.["subType"]), asString(bounce?.["message"])]
      .filter((v): v is string => v != null);
    return { detail: parts.length ? parts.join(" · ").slice(0, 500) : null, bounceType: asString(bounce?.["type"]) };
  }
  if (eventType === "email.failed" || eventType === "email.delivery_failed") {
    const failed = object("failed");
    return { detail: (asString(failed?.["reason"]) ?? asString(data["reason"]))?.slice(0, 500) ?? null, bounceType: null };
  }
  if (eventType === "email.suppressed") {
    const suppressed = object("suppressed");
    const parts = [asString(suppressed?.["type"]), asString(suppressed?.["message"])].filter((v): v is string => v != null);
    return { detail: parts.length ? parts.join(" · ").slice(0, 500) : null, bounceType: null };
  }
  return { detail: null, bounceType: null };
}

/**
 * Everything worth indexing out of one payload.
 *
 * `occurredAt` comes from the payload's TOP-LEVEL `created_at` — the event's
 * own time. `data.created_at` is when the EMAIL was created, and reading that
 * as the event time stamps every open with the moment the message was sent,
 * which silently destroys any question about when people actually read things.
 */
export function readEventFacts(
  payload: Record<string, unknown>,
  receivedAt: Date = new Date(),
): ProviderEventFacts {
  const eventType = asString(payload["type"]) ?? "";
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const click = (data["click"] ?? null) as Record<string, unknown> | null;
  const recipients = recipientsOf(data);
  const { detail, bounceType } = detailOf(eventType, data);

  return {
    eventType,
    providerEmailId: asString(data["email_id"]),
    crmRef: refFromTags(data["tags"]),
    recipient: recipients[0]?.toLowerCase() ?? null,
    recipients,
    senderDomain: emailDomainOf(asString(data["from"])),
    occurredAt: asDate(payload["created_at"]) ?? asDate(click?.["timestamp"]) ?? receivedAt,
    clickLink: eventType === CLICKED_EVENT_TYPE ? asString(click?.["link"]) : null,
    bounceType,
    detail,
  };
}

// ── Intake ──────────────────────────────────────────────────────────────────

export type EventIntake =
  | { status: "accepted"; eventId: number; facts: ProviderEventFacts }
  | { status: "duplicate"; eventId: number | null; reason: string }
  | { status: "ignored"; eventId: number | null; reason: string };

const MISROUTED_RECEIVED =
  "email.received belongs to the inbound endpoint (/api/crm/webhooks/resend/inbound). It is recorded here as evidence of the subscription, and nothing was done with it.";

/**
 * Records a verified event, exactly once, and does no interpretation.
 *
 * Two duplicate checks, because they catch different things. The unique key on
 * `svix_id` catches the provider's automatic retries. The second check catches
 * the same event arriving under a NEW delivery id — which is what a dashboard
 * replay can look like — by asking whether this exact event (same message,
 * same type, same instant, same link) is already recorded.
 */
export async function recordProviderEvent(args: {
  svixId: string;
  payload: Record<string, unknown>;
  receivedAt?: Date;
}): Promise<EventIntake> {
  const receivedAt = args.receivedAt ?? new Date();
  const facts = readEventFacts(args.payload, receivedAt);
  const known = isKnownEmailEventType(facts.eventType);

  if (known && facts.providerEmailId) {
    const [seen] = await db.select({ id: crmEmailProviderEvents.id })
      .from(crmEmailProviderEvents)
      .where(and(
        eq(crmEmailProviderEvents.providerEmailId, facts.providerEmailId),
        eq(crmEmailProviderEvents.eventType, facts.eventType),
        eq(crmEmailProviderEvents.occurredAt, facts.occurredAt),
        sql`coalesce(${crmEmailProviderEvents.clickLink}, '') = ${facts.clickLink ?? ""}`,
      ))
      .limit(1);
    if (seen) {
      return { status: "duplicate", eventId: seen.id, reason: "this event is already recorded under another delivery id" };
    }
  }

  const inserted = await db.insert(crmEmailProviderEvents).values({
    svixId: args.svixId,
    eventType: facts.eventType,
    providerEmailId: facts.providerEmailId,
    crmRef: facts.crmRef,
    recipient: facts.recipient,
    senderDomain: facts.senderDomain,
    occurredAt: facts.occurredAt,
    clickLink: facts.clickLink,
    bounceType: facts.bounceType,
    detail: facts.detail,
    payload: args.payload,
    receivedAt,
    state: known ? "received" : "ignored",
    matchStatus: known ? null : "not_applicable",
    processedAt: known ? null : receivedAt,
    lastError: known ? null : facts.eventType === "email.received" ? MISROUTED_RECEIVED : null,
  }).onConflictDoNothing({ target: crmEmailProviderEvents.svixId }).returning({ id: crmEmailProviderEvents.id });

  if (!inserted[0]) {
    const [raced] = await db.select({ id: crmEmailProviderEvents.id })
      .from(crmEmailProviderEvents)
      .where(eq(crmEmailProviderEvents.svixId, args.svixId)).limit(1);
    return { status: "duplicate", eventId: raced?.id ?? null, reason: "this delivery was already recorded" };
  }

  if (!known) {
    return {
      status: "ignored",
      eventId: inserted[0].id,
      reason: facts.eventType === "email.received"
        ? MISROUTED_RECEIVED
        : `${facts.eventType || "an unnamed event"} is not a delivery or engagement event; it is recorded and nothing was done with it`,
    };
  }

  return { status: "accepted", eventId: inserted[0].id, facts };
}

// ── Matching an event to a record ───────────────────────────────────────────

type MessageRow = typeof crmMessages.$inferSelect;
type MarketingRecipientRow = typeof crmMarketingRecipients.$inferSelect;
type SupportMessageRow = typeof crmSupportMessages.$inferSelect;
type ReminderDeliveryRow = typeof crmReminderDeliveries.$inferSelect;
type AttendeeRow = typeof crmAppointmentAttendees.$inferSelect;
type StaffTokenRow = typeof crmStaffTokens.$inferSelect;
type PortalInvitationRow = typeof crmPortalInvitations.$inferSelect;
type CampaignRecipientRow = typeof crmCampaignRecipients.$inferSelect;
type SequenceMessageRow = typeof crmCampaignScheduledMessages.$inferSelect;

export type MatchedEmailRecord =
  | { kind: "message"; id: number; row: MessageRow; qualifiers: string[] }
  | { kind: "marketing_recipient"; id: number; row: MarketingRecipientRow; qualifiers: string[] }
  | { kind: "support_message"; id: number; row: SupportMessageRow; qualifiers: string[] }
  | { kind: "reminder_delivery"; id: number; row: ReminderDeliveryRow; qualifiers: string[] }
  | { kind: "appointment_attendee"; id: number; row: AttendeeRow; qualifiers: string[] }
  | { kind: "staff_token"; id: number; row: StaffTokenRow; qualifiers: string[] }
  | { kind: "portal_invitation"; id: number; row: PortalInvitationRow; qualifiers: string[] }
  | { kind: "campaign_recipient"; id: number; row: CampaignRecipientRow; qualifiers: string[] }
  | { kind: "sequence_message"; id: number; row: SequenceMessageRow; qualifiers: string[] };

async function loadByRef(kind: EmailRecordKind, id: number, qualifiers: string[]): Promise<MatchedEmailRecord | null> {
  const one = async <T>(rows: Promise<T[]>): Promise<T | null> => (await rows)[0] ?? null;
  switch (kind) {
    case "message": {
      const row = await one(db.select().from(crmMessages).where(eq(crmMessages.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "marketing_recipient": {
      const row = await one(db.select().from(crmMarketingRecipients).where(eq(crmMarketingRecipients.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "support_message": {
      const row = await one(db.select().from(crmSupportMessages).where(eq(crmSupportMessages.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "reminder_delivery": {
      const row = await one(db.select().from(crmReminderDeliveries).where(eq(crmReminderDeliveries.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "appointment_attendee": {
      const row = await one(db.select().from(crmAppointmentAttendees).where(eq(crmAppointmentAttendees.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "staff_token": {
      const row = await one(db.select().from(crmStaffTokens).where(eq(crmStaffTokens.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "portal_invitation": {
      const row = await one(db.select().from(crmPortalInvitations).where(eq(crmPortalInvitations.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "campaign_recipient": {
      const row = await one(db.select().from(crmCampaignRecipients).where(eq(crmCampaignRecipients.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    case "sequence_message": {
      const row = await one(db.select().from(crmCampaignScheduledMessages).where(eq(crmCampaignScheduledMessages.id, id)).limit(1));
      return row ? { kind, id, row, qualifiers } : null;
    }
    default:
      return null;
  }
}

/** Every record that stored this provider id, across all the places one lands. */
async function loadByProviderId(providerEmailId: string): Promise<MatchedEmailRecord[]> {
  const [messages, marketing, support, reminders, attendees, campaign, sequence] = await Promise.all([
    db.select().from(crmMessages).where(eq(crmMessages.providerMessageId, providerEmailId)).limit(5),
    db.select().from(crmMarketingRecipients).where(eq(crmMarketingRecipients.providerMessageId, providerEmailId)).limit(5),
    db.select().from(crmSupportMessages).where(eq(crmSupportMessages.deliveryProviderRef, providerEmailId)).limit(5),
    db.select().from(crmReminderDeliveries).where(eq(crmReminderDeliveries.providerRef, providerEmailId)).limit(5),
    db.select().from(crmAppointmentAttendees).where(eq(crmAppointmentAttendees.invitationProviderId, providerEmailId)).limit(5),
    db.select().from(crmCampaignRecipients).where(eq(crmCampaignRecipients.resendEmailId, providerEmailId)).limit(5),
    db.select().from(crmCampaignScheduledMessages).where(eq(crmCampaignScheduledMessages.resendEmailId, providerEmailId)).limit(5),
  ]);

  const found: MatchedEmailRecord[] = [];
  // An inbound message stores the sender's Message-ID in the same column, so
  // only outbound rows can be about mail WE sent.
  for (const row of messages) {
    if (row.direction !== "inbound") found.push({ kind: "message", id: row.id, row, qualifiers: [] });
  }
  for (const row of marketing) found.push({ kind: "marketing_recipient", id: row.id, row, qualifiers: [] });
  for (const row of support) found.push({ kind: "support_message", id: row.id, row, qualifiers: [] });
  for (const row of reminders) found.push({ kind: "reminder_delivery", id: row.id, row, qualifiers: [] });
  for (const row of attendees) found.push({ kind: "appointment_attendee", id: row.id, row, qualifiers: [] });
  for (const row of campaign) found.push({ kind: "campaign_recipient", id: row.id, row, qualifiers: [] });
  for (const row of sequence) found.push({ kind: "sequence_message", id: row.id, row, qualifiers: [] });
  return found;
}

/**
 * Which records this event is about.
 *
 * Our own tag is preferred where the provider echoed one back: it is exact,
 * and it is the ONLY path to a record whose send outcome was uncertain — those
 * sends never learned a provider id. The provider id is the fallback, and the
 * only path for messages sent before tagging existed.
 */
export async function findMatches(args: {
  providerEmailId: string | null;
  ref: string | null;
}): Promise<MatchedEmailRecord[]> {
  const parsed = parseEmailRef(args.ref);
  if (parsed) {
    const matched = await loadByRef(parsed.kind, parsed.id, parsed.qualifiers);
    if (matched) return [matched];
  }
  if (args.providerEmailId) return await loadByProviderId(args.providerEmailId);
  return [];
}

// ── Applying an event ───────────────────────────────────────────────────────

/** A record whose own send is still in flight; the event waits for it to settle. */
class RecordInFlight extends Error {}

/** The in-flight marker `crmMarketing.ts` writes before it asks the provider. */
const MARKETING_IN_FLIGHT = /^uncertain: attempt [0-9a-f]+ started /;

const LEGACY_EVENT_TYPE: Readonly<Record<string, string>> = {
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.delivery_failed": "failed",
};

function recordKey(match: MatchedEmailRecord): string {
  return `${match.kind}-${match.id}`;
}

/**
 * Records one legacy campaign event, keeping the vocabulary and the shape the
 * sequence branch gates and the legacy analytics already read.
 *
 * Opens and clicks keep their original "first one per recipient" semantics:
 * the branch evaluator asks whether an open exists, and the legacy analytics
 * counts rows, so writing every open would silently redefine both. Full counts
 * live in `crm_email_provider_events`, which is what the new figures read.
 */
async function recordLegacyCampaignEvent(args: {
  campaignRecipientId: number;
  legacyType: string;
  event: CrmEmailProviderEvent;
  occurredAt: Date;
}): Promise<boolean> {
  const firstOnly = args.legacyType === "opened" || args.legacyType === "clicked";
  const existing = firstOnly
    ? await db.select({ id: crmCampaignEvents.id }).from(crmCampaignEvents).where(and(
        eq(crmCampaignEvents.campaignRecipientId, args.campaignRecipientId),
        eq(crmCampaignEvents.eventType, args.legacyType),
      )).limit(1)
    : await db.select({ id: crmCampaignEvents.id }).from(crmCampaignEvents).where(and(
        eq(crmCampaignEvents.campaignRecipientId, args.campaignRecipientId),
        eq(crmCampaignEvents.eventType, args.legacyType),
        sql`${crmCampaignEvents.metadata} ->> 'svixId' = ${args.event.svixId}`,
      )).limit(1);
  if (existing[0]) return false;

  await db.insert(crmCampaignEvents).values({
    campaignRecipientId: args.campaignRecipientId,
    eventType: args.legacyType,
    occurredAt: args.occurredAt,
    metadata: {
      svixId: args.event.svixId,
      resendEventType: args.event.eventType,
      resendEmailId: args.event.providerEmailId,
      detail: args.event.detail,
    },
  });
  return true;
}

/**
 * The one state change an event may make to a local record.
 *
 * A `delivered` event is proof the message reached the recipient's mail
 * server. For a record whose own send outcome was UNCERTAIN — the provider
 * never answered, so nothing here knows whether it went — that is exactly the
 * evidence a person would otherwise have to chase by hand, and applying it is
 * what takes the row off the operator's list. Nothing else is touched: a
 * refused send stays refused, a pending retry keeps its schedule, and no event
 * ever turns an uncertain outcome into a failure.
 */
async function upgradeUncertain(match: MatchedEmailRecord, event: CrmEmailProviderEvent, now: Date): Promise<string | null> {
  const providerId = event.providerEmailId;
  const note = `provider reported delivered at ${event.occurredAt.toISOString()}`;

  switch (match.kind) {
    case "message": {
      if (match.row.status === "sending") throw new RecordInFlight("the send is still in flight");
      if (match.row.status !== "uncertain") return null;
      await db.update(crmMessages).set({
        status: "sent",
        providerMessageId: match.row.providerMessageId ?? providerId,
        metadata: { ...(match.row.metadata ?? {}), deliveryConfirmedAt: event.occurredAt.toISOString(), upgradedFrom: "uncertain" },
      }).where(and(eq(crmMessages.id, match.id), eq(crmMessages.status, "uncertain")));
      return `message.status uncertain → sent (${note})`;
    }
    case "marketing_recipient": {
      const lastError = match.row.lastError ?? "";
      if (MARKETING_IN_FLIGHT.test(lastError)) throw new RecordInFlight("the send is still in flight");
      if (match.row.status !== "failed" || !lastError.startsWith("uncertain:")) return null;
      await db.update(crmMarketingRecipients).set({
        status: "sent",
        providerMessageId: match.row.providerMessageId ?? providerId,
        sentAt: match.row.sentAt ?? event.occurredAt,
        lastError: null,
      }).where(and(
        eq(crmMarketingRecipients.id, match.id),
        eq(crmMarketingRecipients.status, "failed"),
        eq(crmMarketingRecipients.lastError, lastError),
      ));
      return `marketing recipient unconfirmed → sent (${note})`;
    }
    case "support_message": {
      if (match.row.deliveryState === "attempting") throw new RecordInFlight("the send is still in flight");
      if (match.row.deliveryState !== "uncertain") return null;
      await db.update(crmSupportMessages).set({
        deliveryState: "accepted",
        deliveryProviderRef: match.row.deliveryProviderRef ?? providerId,
        deliveryFailureReason: null,
        deliveryFailureDetail: null,
      }).where(and(eq(crmSupportMessages.id, match.id), eq(crmSupportMessages.deliveryState, "uncertain")));
      return `support delivery uncertain → accepted (${note})`;
    }
    case "reminder_delivery": {
      if (match.row.state === "attempting") throw new RecordInFlight("the send is still in flight");
      if (match.row.state !== "uncertain") return null;
      await db.update(crmReminderDeliveries).set({
        state: "accepted",
        providerRef: match.row.providerRef ?? providerId,
        failureReason: null,
        failureDetail: null,
        nextAttemptAt: null,
        updatedAt: now,
      }).where(and(eq(crmReminderDeliveries.id, match.id), eq(crmReminderDeliveries.state, "uncertain")));
      return `reminder delivery uncertain → accepted (${note})`;
    }
    case "appointment_attendee": {
      // The row holds only its LATEST invitation's outcome, so an event about
      // an older revision must not be read as evidence about the current one.
      const [method, sequence] = match.qualifiers;
      if (method && match.row.invitationMethod && method !== match.row.invitationMethod) return null;
      if (sequence && match.row.invitationSequence != null && Number(sequence) !== match.row.invitationSequence) return null;
      if (match.row.invitationOutcome !== "uncertain") return null;
      await db.update(crmAppointmentAttendees).set({
        invitationOutcome: "sent",
        invitationReason: null,
        invitationProviderId: match.row.invitationProviderId ?? providerId,
      }).where(and(
        eq(crmAppointmentAttendees.id, match.id),
        eq(crmAppointmentAttendees.invitationOutcome, "uncertain"),
      ));
      return `invitation uncertain → sent (${note})`;
    }
    case "staff_token": {
      // `delivery` records how the link reached the person, and it decides what
      // consuming it proves: a link the SERVER emailed to an address
      // demonstrates control of that address. A delivered event is that proof.
      if (match.row.delivery !== "manual") return null;
      await db.update(crmStaffTokens).set({ delivery: "email" })
        .where(and(eq(crmStaffTokens.id, match.id), eq(crmStaffTokens.delivery, "manual")));
      return `staff token delivery manual → email (${note})`;
    }
    case "portal_invitation": {
      if (match.row.deliveryState !== "uncertain") return null;
      await db.update(crmPortalInvitations).set({ deliveryState: "sent" })
        .where(and(eq(crmPortalInvitations.id, match.id), eq(crmPortalInvitations.deliveryState, "uncertain")));
      return `portal invitation uncertain → sent (${note})`;
    }
    case "campaign_recipient": {
      const lastError = match.row.lastError ?? "";
      if (match.row.status !== "failed" || !lastError.startsWith("uncertain:")) return null;
      await db.update(crmCampaignRecipients).set({
        status: "sent",
        sentAt: match.row.sentAt ?? event.occurredAt,
        resendEmailId: match.row.resendEmailId ?? providerId,
        lastError: null,
      }).where(and(eq(crmCampaignRecipients.id, match.id), eq(crmCampaignRecipients.status, "failed")));
      return `campaign recipient unconfirmed → sent (${note})`;
    }
    case "sequence_message": {
      const lastError = match.row.lastError ?? "";
      if (match.row.status !== "failed" || !lastError.startsWith("uncertain:")) return null;
      await db.update(crmCampaignScheduledMessages).set({
        status: "sent",
        sentAt: match.row.sentAt ?? event.occurredAt,
        resendEmailId: match.row.resendEmailId ?? providerId,
        lastError: null,
      }).where(and(eq(crmCampaignScheduledMessages.id, match.id), eq(crmCampaignScheduledMessages.status, "failed")));
      return `sequence message unconfirmed → sent (${note})`;
    }
    default:
      return null;
  }
}

/** Everything one event does, beyond being recorded. */
async function applyEffects(
  event: CrmEmailProviderEvent,
  facts: ProviderEventFacts,
  matches: MatchedEmailRecord[],
  now: Date,
): Promise<Map<string, string[]>> {
  const applied = new Map<string, string[]>();
  const note = (match: MatchedEmailRecord, text: string | null) => {
    if (!text) return;
    const key = recordKey(match);
    applied.set(key, [...(applied.get(key) ?? []), text]);
  };

  const deliveryState = DELIVERY_EVENT_TYPES[facts.eventType];

  // 1. Suppression, for EVERY bounce and complaint, whether or not it matched
  //    a record of ours. An address that hard-bounced is unmailable no matter
  //    which part of the system sent to it.
  if (deliveryState === "bounced" || deliveryState === "complained") {
    for (const address of facts.recipients) {
      await suppressAddress({
        address,
        reason: deliveryState === "complained" ? "complaint" : "bounce",
        // Only a permanent bounce suppresses; a full mailbox empties again.
        bounceType: facts.bounceType ?? "Permanent",
        detail: facts.detail,
        source: "provider",
      });
    }
  }

  const legacyType = LEGACY_EVENT_TYPE[facts.eventType];

  for (const match of matches) {
    // 2. The legacy campaign ledger, which the sequence branch gates and the
    //    legacy analytics screen read.
    if (legacyType && (match.kind === "campaign_recipient" || match.kind === "sequence_message")) {
      const campaignRecipientId = match.kind === "campaign_recipient" ? match.id : match.row.recipientId;
      const leadId = match.row.leadId;
      if (campaignRecipientId) {
        const wrote = await recordLegacyCampaignEvent({
          campaignRecipientId, legacyType, event, occurredAt: facts.occurredAt,
        });
        if (wrote) note(match, `crm_campaign_events += ${legacyType}`);
      }

      if (match.kind === "campaign_recipient"
        && (legacyType === "bounced" || legacyType === "failed" || legacyType === "complained")) {
        await db.update(crmCampaignRecipients).set({
          status: "failed",
          lastError: (facts.detail ?? `${facts.eventType} via webhook`).slice(0, 500),
        }).where(eq(crmCampaignRecipients.id, match.id));
        note(match, `campaign recipient → failed (${legacyType})`);
      }

      // A spam complaint stops every active sequence for that contact at once.
      if (legacyType === "complained" && leadId) {
        await stampReplyAndStop(leadId, "email", {
          resendEventType: facts.eventType,
          resendEmailId: facts.providerEmailId,
        });
        note(match, "active sequences stopped (spam complaint)");
      }
    }

    // 3. The one improvement an event may make to a local outcome.
    if (deliveryState === "delivered") {
      note(match, await upgradeUncertain(match, event, now));
    }
  }

  return applied;
}

// ── Processing ──────────────────────────────────────────────────────────────

export interface ProcessResult {
  state: string;
  matchStatus: "matched" | "unmatched" | "not_applicable" | null;
  matched: CrmEmailEventMatch[];
  reason?: string;
}

function backoffMs(attempts: number): number {
  return RETRY_BACKOFF_MS[Math.min(Math.max(attempts, 1) - 1, RETRY_BACKOFF_MS.length - 1)]!;
}

/**
 * Interprets one stored event.
 *
 * The claim is a single conditional UPDATE, so two workers — or a worker and
 * the webhook request that stored it — cannot both apply the same event: the
 * loser matches nothing. A claim older than the lease belonged to a process
 * that is gone and is reclaimable, which is what stops one dead worker parking
 * an event forever.
 */
export async function processProviderEvent(
  eventId: number,
  opts: { now?: Date } = {},
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);

  const [claimed] = await db.update(crmEmailProviderEvents).set({
    state: "processing",
    attempts: sql`${crmEmailProviderEvents.attempts} + 1`,
    claimedAt: now,
    nextAttemptAt: null,
  }).where(and(
    eq(crmEmailProviderEvents.id, eventId),
    or(
      and(
        inArray(crmEmailProviderEvents.state, ["received", "failed"]),
        or(isNull(crmEmailProviderEvents.nextAttemptAt), lte(crmEmailProviderEvents.nextAttemptAt, now)),
      ),
      and(
        eq(crmEmailProviderEvents.state, "processing"),
        lte(crmEmailProviderEvents.claimedAt, staleBefore),
      ),
    ),
  )).returning();

  if (!claimed) {
    const [row] = await db.select().from(crmEmailProviderEvents)
      .where(eq(crmEmailProviderEvents.id, eventId)).limit(1);
    return {
      state: row?.state ?? "missing",
      matchStatus: (row?.matchStatus as ProcessResult["matchStatus"]) ?? null,
      matched: row?.matchedRecords ?? [],
      reason: row ? "not due for processing" : "no such event",
    };
  }

  try {
    const facts = readEventFacts(claimed.payload ?? {}, claimed.receivedAt);
    const matches = await findMatches({ providerEmailId: claimed.providerEmailId, ref: claimed.crmRef });
    const applied = await applyEffects(claimed, facts, matches, now);

    const matched: CrmEmailEventMatch[] = matches.map((match) => ({
      kind: match.kind,
      id: match.id,
      applied: applied.get(recordKey(match)) ?? [],
    }));
    const matchStatus = matches.length > 0 ? "matched" as const : "unmatched" as const;

    await db.update(crmEmailProviderEvents).set({
      state: "processed",
      processedAt: now,
      matchStatus,
      matchedRecords: matched,
      lastError: null,
      nextAttemptAt: null,
      claimedAt: null,
    }).where(eq(crmEmailProviderEvents.id, eventId));

    return { state: "processed", matchStatus, matched };
  } catch (err) {
    const waiting = err instanceof RecordInFlight;
    const attempts = claimed.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = attempts >= MAX_PROCESSING_ATTEMPTS;

    await db.update(crmEmailProviderEvents).set({
      // A record still in flight is not a failure: the event is fine and the
      // send it is about simply has not settled yet, so it goes back to
      // `received` with a time to try again.
      state: waiting && !exhausted ? "received" : "failed",
      lastError: (waiting ? `waiting: ${message}` : message).slice(0, 500),
      nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffMs(attempts)),
      claimedAt: null,
    }).where(eq(crmEmailProviderEvents.id, eventId));

    if (!waiting) logger.error({ err, eventId }, "provider email event processing failed");
    return {
      state: waiting && !exhausted ? "received" : "failed",
      matchStatus: null,
      matched: [],
      reason: message,
    };
  }
}

/**
 * One pass over events that still need interpreting.
 *
 * This is what makes "store then process" a guarantee rather than an
 * intention: the webhook can answer 200 with the row safely written even when
 * interpreting it fails, because this pass comes back for it.
 */
export async function processPendingEmailEvents(
  limit = 50,
  now: Date = new Date(),
): Promise<{ attempted: number; processed: number; failed: number; deferred: number }> {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  const due = await db.select({ id: crmEmailProviderEvents.id })
    .from(crmEmailProviderEvents)
    .where(or(
      and(
        inArray(crmEmailProviderEvents.state, ["received", "failed"]),
        sql`${crmEmailProviderEvents.attempts} < ${MAX_PROCESSING_ATTEMPTS}`,
        or(isNull(crmEmailProviderEvents.nextAttemptAt), lte(crmEmailProviderEvents.nextAttemptAt, now)),
      ),
      and(
        eq(crmEmailProviderEvents.state, "processing"),
        lte(crmEmailProviderEvents.claimedAt, staleBefore),
      ),
    ))
    .orderBy(crmEmailProviderEvents.id)
    .limit(Math.min(Math.max(limit, 1), 500));

  let processed = 0, failed = 0, deferred = 0;
  for (const row of due) {
    const result = await processProviderEvent(row.id, { now });
    if (result.state === "processed") processed += 1;
    else if (result.state === "failed") failed += 1;
    else deferred += 1;
  }
  return { attempted: due.length, processed, failed, deferred };
}

// ── Reading what the provider said ──────────────────────────────────────────

interface AggregateRow {
  provider_email_id: string;
  crm_ref: string | null;
  recipient: string | null;
  sender_domain: string | null;
  sent_at: string | null;
  delayed_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  failed_at: string | null;
  suppressed_at: string | null;
  bounce_type: string | null;
  detail: string | null;
  opens: string | number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  clicks: string | number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  last_event_at: string | null;
}

const date = (value: string | null): Date | null => (value ? new Date(value) : null);

function factsFromRow(row: AggregateRow): ProviderDeliveryFacts {
  return {
    providerEmailId: row.provider_email_id,
    crmRef: row.crm_ref,
    recipient: row.recipient,
    senderDomain: row.sender_domain,
    sentAt: date(row.sent_at),
    delayedAt: date(row.delayed_at),
    deliveredAt: date(row.delivered_at),
    bouncedAt: date(row.bounced_at),
    complainedAt: date(row.complained_at),
    failedAt: date(row.failed_at),
    suppressedAt: date(row.suppressed_at),
    bounceType: row.bounce_type,
    detail: row.detail,
    opens: Number(row.opens ?? 0),
    firstOpenedAt: date(row.first_opened_at),
    lastOpenedAt: date(row.last_opened_at),
    clicks: Number(row.clicks ?? 0),
    firstClickedAt: date(row.first_clicked_at),
    lastClickedAt: date(row.last_clicked_at),
    lastEventAt: date(row.last_event_at),
  };
}

export interface ProviderDeliveryLookup {
  /** Keyed on the provider's message id. */
  byProviderId: Map<string, ProviderDelivery>;
  /** Keyed on our own `crm_ref` — the path for sends that never learned an id. */
  byRef: Map<string, ProviderDelivery>;
  /** How many provider messages were found at all. */
  size: number;
}

const EMPTY_LOOKUP: ProviderDeliveryLookup = { byProviderId: new Map(), byRef: new Map(), size: 0 };

/**
 * What the provider has said about a set of messages.
 *
 * Aggregated in SQL, per provider message id, from the event rows themselves —
 * so the answer is recomputed from the facts on every read and no summary can
 * go stale behind a late event.
 */
export async function loadProviderDeliveries(args: {
  providerIds?: Array<string | null | undefined>;
  refs?: Array<string | null | undefined>;
}): Promise<ProviderDeliveryLookup> {
  const ids = [...new Set((args.providerIds ?? []).filter((v): v is string => typeof v === "string" && v.length > 0))];
  const refs = [...new Set((args.refs ?? []).filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0 && refs.length === 0) return EMPTY_LOOKUP;

  // Written as an explicit parameter list rather than `= ANY(${ids})`: an
  // array interpolated into a template becomes a COMMA-SEPARATED set of
  // placeholders, which turns `ANY($1)` into `ANY($1, $2)` and fails to parse.
  const anyOf = (column: string, values: string[]) => (values.length === 0
    ? sql`false`
    : sql`${sql.raw(column)} IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`);

  const result = await db.execute(sql`
    SELECT provider_email_id,
           max(crm_ref)       AS crm_ref,
           max(recipient)     AS recipient,
           max(sender_domain) AS sender_domain,
           min(occurred_at) FILTER (WHERE event_type = 'email.sent')             AS sent_at,
           min(occurred_at) FILTER (WHERE event_type = 'email.delivery_delayed') AS delayed_at,
           min(occurred_at) FILTER (WHERE event_type = 'email.delivered')        AS delivered_at,
           min(occurred_at) FILTER (WHERE event_type = 'email.bounced')          AS bounced_at,
           min(occurred_at) FILTER (WHERE event_type = 'email.complained')       AS complained_at,
           min(occurred_at) FILTER (WHERE event_type IN ('email.failed', 'email.delivery_failed')) AS failed_at,
           min(occurred_at) FILTER (WHERE event_type = 'email.suppressed')       AS suppressed_at,
           (array_agg(bounce_type ORDER BY occurred_at) FILTER (WHERE bounce_type IS NOT NULL))[1] AS bounce_type,
           (array_agg(detail ORDER BY occurred_at) FILTER (WHERE detail IS NOT NULL))[1]           AS detail,
           (count(*) FILTER (WHERE event_type = 'email.opened'))::int  AS opens,
           min(occurred_at) FILTER (WHERE event_type = 'email.opened')  AS first_opened_at,
           max(occurred_at) FILTER (WHERE event_type = 'email.opened')  AS last_opened_at,
           (count(*) FILTER (WHERE event_type = 'email.clicked'))::int AS clicks,
           min(occurred_at) FILTER (WHERE event_type = 'email.clicked') AS first_clicked_at,
           max(occurred_at) FILTER (WHERE event_type = 'email.clicked') AS last_clicked_at,
           max(occurred_at) AS last_event_at
      FROM crm_email_provider_events
     WHERE provider_email_id IS NOT NULL
       AND (${anyOf("provider_email_id", ids)} OR ${anyOf("crm_ref", refs)})
     GROUP BY provider_email_id`);

  const byProviderId = new Map<string, ProviderDelivery>();
  const byRef = new Map<string, ProviderDelivery>();
  for (const raw of result.rows as unknown as AggregateRow[]) {
    // Kept even when no DELIVERY event has arrived: a message whose only
    // events are opens is exactly what a domain with tracking on and delivery
    // events unsubscribed produces, and dropping it would throw away the only
    // engagement evidence there is.
    const summary = summariseProviderDelivery(factsFromRow(raw));
    byProviderId.set(summary.providerEmailId!, summary);
    if (summary.crmRef) {
      const existing = byRef.get(summary.crmRef);
      // One record can produce several provider messages over time (a retry
      // collapses, a deliberate re-send does not). The most recent one is what
      // the record's own state is about.
      const newer = !existing
        || (summary.lastEventAt?.getTime() ?? 0) > (existing.lastEventAt?.getTime() ?? 0);
      if (newer) byRef.set(summary.crmRef, summary);
    }
  }
  return { byProviderId, byRef, size: byProviderId.size };
}

/** One record's provider delivery, by its stored id first and its tag second. */
export function deliveryFor(
  lookup: ProviderDeliveryLookup,
  providerId: string | null | undefined,
  ref: string | null | undefined,
): ProviderDelivery | null {
  if (providerId) {
    const byId = lookup.byProviderId.get(providerId);
    if (byId) return byId;
  }
  return ref ? lookup.byRef.get(ref) ?? null : null;
}

/** Links a set of messages were clicked on, most-clicked first. */
export async function clickedLinks(
  providerIds: Array<string | null | undefined>,
  limit = 25,
): Promise<Array<{ url: string; clicks: number; recipients: number }>> {
  const ids = [...new Set(providerIds.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return [];
  const result = await db.execute(sql`
    SELECT click_link AS url,
           count(*)::int AS clicks,
           count(DISTINCT provider_email_id)::int AS recipients
      FROM crm_email_provider_events
     WHERE event_type = 'email.clicked'
       AND click_link IS NOT NULL
       AND provider_email_id IN (${sql.join(ids.map((v) => sql`${v}`), sql`, `)})
     GROUP BY click_link
     ORDER BY 2 DESC, 1 ASC
     LIMIT ${Math.min(Math.max(limit, 1), 100)}`);
  return (result.rows as unknown as Array<{ url: string; clicks: number; recipients: number }>)
    .map((row) => ({ url: row.url, clicks: Number(row.clicks), recipients: Number(row.recipients) }));
}

/**
 * Whether engagement has ever been measured for this sending domain.
 *
 * Tracking is enabled per domain in Resend and needs a verified tracking
 * subdomain, so "is it on?" is not a question this server can answer from its
 * own configuration — but "has it ever produced an event here?" is a fact, and
 * it is the honest basis for showing a figure at all.
 */
export async function engagementEvidence(env: NodeJS.ProcessEnv = process.env): Promise<EngagementEvidence> {
  const domain = sendingDomain(env);
  const result = await db.execute(sql`
    SELECT min(occurred_at) FILTER (WHERE event_type = 'email.opened')  AS opens_since,
           min(occurred_at) FILTER (WHERE event_type = 'email.clicked') AS clicks_since
      FROM crm_email_provider_events
     WHERE ${domain ? sql`sender_domain = ${domain}` : sql`true`}`);
  const row = (result.rows as unknown as Array<{ opens_since: string | null; clicks_since: string | null }>)[0];
  return {
    webhookConfigured: deliveryWebhookSecret(env) !== null,
    sendingDomain: domain,
    opensSince: date(row?.opens_since ?? null),
    clicksSince: date(row?.clicks_since ?? null),
  };
}

/** What an operator needs to answer "is this wired up, and is it working?". */
export async function emailEventStatus(env: NodeJS.ProcessEnv = process.env): Promise<Record<string, unknown>> {
  const [totals, work, evidence] = await Promise.all([
    db.execute(sql`
      SELECT event_type, count(*)::int AS events,
             min(occurred_at) AS first_at, max(occurred_at) AS last_at,
             (count(*) FILTER (WHERE match_status = 'unmatched'))::int AS unmatched
        FROM crm_email_provider_events
       GROUP BY event_type ORDER BY 2 DESC`),
    db.execute(sql`
      SELECT (count(*) FILTER (WHERE state = 'received'))::int   AS waiting,
             (count(*) FILTER (WHERE state = 'processing'))::int AS in_progress,
             (count(*) FILTER (WHERE state = 'failed'))::int     AS failed,
             (count(*) FILTER (WHERE state = 'ignored'))::int    AS ignored,
             (count(*) FILTER (WHERE match_status = 'unmatched'))::int AS unmatched,
             max(received_at) AS last_received_at
        FROM crm_email_provider_events`),
    engagementEvidence(env),
  ]);

  const byType = (totals.rows as unknown as Array<{
    event_type: string; events: number; first_at: string | null; last_at: string | null; unmatched: number;
  }>).map((row) => ({
    eventType: row.event_type,
    events: Number(row.events),
    firstAt: row.first_at,
    lastAt: row.last_at,
    unmatched: Number(row.unmatched),
  }));
  const counts = (work.rows as unknown as Array<Record<string, unknown>>)[0] ?? {};

  return {
    configured: deliveryWebhookSecret(env) !== null,
    secretVariable: DELIVERY_WEBHOOK_SECRET_VAR,
    endpoint: "/api/crm/webhooks/resend",
    sendingDomain: sendingDomain(env),
    eventsByType: byType,
    eventsReceived: byType.reduce((sum, row) => sum + row.events, 0),
    lastReceivedAt: counts["last_received_at"] ?? null,
    processing: {
      waiting: Number(counts["waiting"] ?? 0),
      inProgress: Number(counts["in_progress"] ?? 0),
      failed: Number(counts["failed"] ?? 0),
      ignored: Number(counts["ignored"] ?? 0),
    },
    unmatched: Number(counts["unmatched"] ?? 0),
    tracking: {
      opensMeasuredSince: evidence.opensSince?.toISOString() ?? null,
      clicksMeasuredSince: evidence.clicksSince?.toISOString() ?? null,
    },
    definitions: {
      unmatched: "An event that reached no record here. Normal in small numbers — mail sent from another system on this domain, or a record deleted since — and not an error.",
      ignored: "A signed event this system does not act on, kept as evidence that the subscription is live.",
      failed: "An event whose interpretation failed. The payload is intact and it is retried; nothing is lost.",
      tracking: "Open and click tracking is configured per domain in Resend and needs a verified tracking subdomain. These dates are the first event ever recorded for this sending domain — the evidence that decides whether engagement figures are shown at all.",
    },
  };
}
