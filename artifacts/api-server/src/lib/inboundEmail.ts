// ── Inbound email ───────────────────────────────────────────────────────────
//
// Turning a received message into a CRM conversation, safely.
//
// The shape of this file is dictated by three properties of Resend's inbound
// API, all verified against its current documentation:
//
//  1. `email.received` carries metadata only. The body, headers and
//     attachments need a second API call, so ingest is two-phase: acknowledge
//     the webhook immediately and durably, then fetch. A webhook handler that
//     did the fetch inline would time out and be retried, and every retry
//     would race the last.
//
//  2. Resend keeps inbound content for 30 days. A CRM that stored a reference
//     would quietly lose the client's own words after a month, so the body is
//     copied here at ingest.
//
//  3. There is no SPF, DKIM or spam verdict anywhere in the inbound payload.
//     `from` is an unauthenticated claim. Correlating a reply on the sender
//     address alone would let anyone drop a message into a client's thread by
//     setting a header, so the primary key is an unguessable token we minted
//     and put in our own Reply-To.

import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db, crmConversations, crmInboundEmailEvents, crmUnmatchedEmails,
  crmEmailSuppressions, crmEmailSendCounters, crmMessages, crmLeads,
} from "@workspace/db";
import { ensureConversation, refreshConversationRollups, normalizeAddress } from "./conversations.js";

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * The domain replies come back to.
 *
 * This must be a subdomain, not the apex. Inbound MX is exclusive — Resend's
 * own documentation is explicit that pointing it at the apex routes ALL mail
 * for the domain away from the existing provider. `reply.sitemintdigital.com`
 * leaves the company's ordinary mail untouched.
 */
export function inboundDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  return env["CRM_INBOUND_EMAIL_DOMAIN"] ?? null;
}

/**
 * The signing secret for the inbound webhook.
 *
 * Deliberately its own variable. A Resend signing secret is per ENDPOINT, so
 * an inbound endpoint added alongside the existing delivery-event one has a
 * different secret and the existing `RESEND_WEBHOOK_SECRET` will not verify
 * it. Falling back to the shared one supports the other valid setup —
 * subscribing `email.received` on the existing endpoint — without forcing it.
 */
export function inboundWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env["RESEND_INBOUND_WEBHOOK_SECRET"] ?? env["RESEND_WEBHOOK_SECRET"] ?? null;
}

export function inboundConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!inboundDomain(env) && !!inboundWebhookSecret(env) && !!env["RESEND_API_KEY"];
}

/** Why inbound cannot run, in words an operator can act on. */
export function inboundBlockedReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env["RESEND_API_KEY"]) return "RESEND_API_KEY is not set, so received mail cannot be fetched from the provider.";
  if (!inboundWebhookSecret(env)) {
    return "Neither RESEND_INBOUND_WEBHOOK_SECRET nor RESEND_WEBHOOK_SECRET is set, so inbound webhooks cannot be verified.";
  }
  if (!inboundDomain(env)) {
    return "CRM_INBOUND_EMAIL_DOMAIN is not set, so replies have no address to come back to and an MX record cannot be pointed anywhere.";
  }
  return null;
}

// ── Reply addressing ────────────────────────────────────────────────────────

/** A conversation's reply token, minted on first use. */
export async function replyTokenFor(conversationId: number): Promise<string | null> {
  const [existing] = await db.select({ token: crmConversations.replyToken })
    .from(crmConversations).where(eq(crmConversations.id, conversationId)).limit(1);
  if (existing?.token) return existing.token;

  // 160 bits, base32-ish via base64url. Long enough that guessing a token to
  // inject into somebody's thread is not a realistic attack.
  const token = crypto.randomBytes(20).toString("base64url");
  await db.update(crmConversations)
    .set({ replyToken: token, updatedAt: new Date() })
    .where(and(eq(crmConversations.id, conversationId), isNull(crmConversations.replyToken)));

  const [after] = await db.select({ token: crmConversations.replyToken })
    .from(crmConversations).where(eq(crmConversations.id, conversationId)).limit(1);
  return after?.token ?? null;
}

/** The Reply-To to put on outbound mail for this conversation. */
export async function replyToAddress(conversationId: number): Promise<string | null> {
  const domain = inboundDomain();
  if (!domain) return null;
  const token = await replyTokenFor(conversationId);
  return token ? `c-${token}@${domain}` : null;
}

/**
 * Extracts a conversation reply token from any of a message's recipients.
 *
 * Reads the local part WITHOUT lowercasing it. The token is base64url, so
 * `aB` and `Ab` are different tokens; folding case here would have silently
 * failed to match most replies, sending them down the weaker sender-address
 * path or into the unmatched queue. The domain is irrelevant to the lookup, so
 * its case is not considered either way.
 */
export function tokenFromRecipients(recipients: string[]): string | null {
  for (const raw of recipients) {
    const local = rawAddress(raw).split("@")[0] ?? "";
    if (local.startsWith("c-") && local.length > 6) return local.slice(2);
  }
  return null;
}

/** `"Dana <dana@example.com>"` → `"dana@example.com"`, case preserved. */
function rawAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim();
}

/**
 * The same, lowercased — for comparing one address to another.
 *
 * Address comparison folds case because mailbox providers do; token lookup
 * does not, because the token is a secret we generated. The two need different
 * treatment and used to share one function, which is how the token match
 * broke.
 */
export function extractAddress(raw: string): string {
  return rawAddress(raw).toLowerCase();
}

// ── Webhook intake (phase one) ──────────────────────────────────────────────

export interface InboundIntakeResult {
  status: "accepted" | "duplicate" | "ignored";
  eventId?: number;
  reason?: string;
}

/**
 * Records a verified webhook event, exactly once.
 *
 * Both unique keys matter and they catch different failures. `svix-id` stops
 * Resend's automatic retries from creating duplicates. `email_id` stops an
 * operator replaying an already-delivered event — which reuses the payload and
 * would otherwise create a second copy of a genuine customer email in the
 * client's thread.
 *
 * This does no interpretation and no network I/O, so it always finishes inside
 * the webhook timeout.
 */
export async function recordInboundEvent(args: {
  svixId: string;
  payload: Record<string, unknown>;
}): Promise<InboundIntakeResult> {
  const eventType = typeof args.payload["type"] === "string" ? args.payload["type"] : "";
  if (eventType !== "email.received") {
    return { status: "ignored", reason: `not an inbound event (${eventType || "unknown"})` };
  }

  const data = (args.payload["data"] ?? {}) as Record<string, unknown>;
  const emailId = typeof data["email_id"] === "string" ? data["email_id"] : null;

  if (emailId) {
    const [seen] = await db.select({ id: crmInboundEmailEvents.id })
      .from(crmInboundEmailEvents)
      .where(eq(crmInboundEmailEvents.emailId, emailId)).limit(1);
    if (seen) return { status: "duplicate", eventId: seen.id, reason: "this message was already received" };
  }

  const inserted = await db.insert(crmInboundEmailEvents).values({
    svixId: args.svixId,
    emailId,
    eventType,
    state: "received",
    payload: args.payload,
  }).onConflictDoNothing({ target: crmInboundEmailEvents.svixId }).returning();

  if (inserted[0]) return { status: "accepted", eventId: inserted[0].id };

  const [raced] = await db.select({ id: crmInboundEmailEvents.id })
    .from(crmInboundEmailEvents)
    .where(eq(crmInboundEmailEvents.svixId, args.svixId)).limit(1);
  return { status: "duplicate", eventId: raced?.id, reason: "this delivery was already recorded" };
}

// ── Content fetch and correlation (phase two) ───────────────────────────────

export interface FetchedEmail {
  html?: string | null;
  text?: string | null;
  headers?: Record<string, unknown> | null;
  messageId?: string | null;
  replyTo?: string | null;
  attachments?: { id: string; filename: string; content_type: string; size?: number }[];
}

/** Injected so tests never reach the network. */
export type EmailFetcher = (emailId: string) => Promise<FetchedEmail>;

async function defaultFetcher(emailId: string): Promise<FetchedEmail> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status} fetching the message body`);
  return await res.json() as FetchedEmail;
}

/**
 * Looks like something a machine sent, and so must not be replied to.
 *
 * Two auto-responders talking to each other is an infinite loop that bills
 * real money and floods a real person's inbox. These headers catch the
 * well-behaved cases; `recordOutboundForLoopControl` is the brake for the
 * badly-behaved ones.
 */
export function looksAutomated(headers: Record<string, unknown> | null | undefined): boolean {
  if (!headers) return false;
  const get = (name: string): string => {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key ? String(headers[key] ?? "").toLowerCase() : "";
  };
  if (get("auto-submitted") && get("auto-submitted") !== "no") return true;
  if (["bulk", "list", "junk", "auto_reply"].includes(get("precedence"))) return true;
  if (get("x-auto-response-suppress")) return true;
  if (get("list-unsubscribe")) return true;
  return false;
}

/**
 * Fetches a received message and files it.
 *
 * Correlation order, strongest evidence first:
 *   1. our own reply token in a recipient address — proof it is a reply to a
 *      specific conversation, and unforgeable without the token
 *   2. the sender address matching a known contact
 *   3. the sender address alone, as its own conversation
 *   4. nothing usable — quarantined for a person, never discarded
 */
export async function processInboundEvent(
  eventId: number,
  opts: { fetcher?: EmailFetcher } = {},
): Promise<{ state: string; conversationId?: number; messageId?: number; reason?: string }> {
  const fetcher = opts.fetcher ?? defaultFetcher;

  const [event] = await db.select().from(crmInboundEmailEvents)
    .where(eq(crmInboundEmailEvents.id, eventId)).limit(1);
  if (!event) return { state: "failed", reason: "no such event" };
  if (event.state === "stored") {
    return { state: "stored", conversationId: event.conversationId ?? undefined, messageId: event.messageId ?? undefined };
  }

  const data = (event.payload?.["data"] ?? {}) as Record<string, unknown>;
  const emailId = event.emailId ?? (typeof data["email_id"] === "string" ? data["email_id"] : null);
  if (!emailId) {
    await markEvent(eventId, "failed", "the payload named no message to fetch");
    return { state: "failed", reason: "no email id" };
  }

  await db.update(crmInboundEmailEvents)
    .set({ state: "fetching", attempts: sql`${crmInboundEmailEvents.attempts} + 1` })
    .where(eq(crmInboundEmailEvents.id, eventId));

  let fetched: FetchedEmail;
  try {
    fetched = await fetcher(emailId);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "the message body could not be fetched";
    // Left in `failed`, not deleted. Resend keeps content for 30 days, so a
    // retry is possible within that window and an operator can see what is
    // stuck.
    await markEvent(eventId, "failed", reason);
    return { state: "failed", reason };
  }

  const fromRaw = typeof data["from"] === "string" ? data["from"] : "";
  const from = extractAddress(fromRaw);
  const to = Array.isArray(data["to"]) ? (data["to"] as string[]) : [];
  const cc = Array.isArray(data["cc"]) ? (data["cc"] as string[]) : [];
  const receivedFor = Array.isArray(data["received_for"]) ? (data["received_for"] as string[]) : [];
  const subject = typeof data["subject"] === "string" ? data["subject"] : null;
  const providerMessageId = typeof data["message_id"] === "string" ? data["message_id"] : fetched.messageId ?? null;

  // 1. Our own token, from any recipient field.
  const token = tokenFromRecipients([...to, ...cc, ...receivedFor]);
  let conversation = null as typeof crmConversations.$inferSelect | null;
  if (token) {
    const [byToken] = await db.select().from(crmConversations)
      .where(eq(crmConversations.replyToken, token)).limit(1);
    conversation = byToken ?? null;
  }

  // 2 and 3. Fall back to the sender address, which is a claim rather than
  // proof — good enough to start a conversation, never good enough to join an
  // existing one that a token would have identified.
  if (!conversation && from) {
    const [lead] = await db.select({ id: crmLeads.id, name: crmLeads.name })
      .from(crmLeads).where(eq(crmLeads.email, from)).limit(1);
    conversation = await ensureConversation({
      channel: "email",
      provider: "resend",
      contactId: lead?.id ?? null,
      externalAddress: from,
      externalName: lead?.name ?? null,
      subject,
      providerThreadRef: providerMessageId,
    });
  }

  // 4. Nothing usable. Keep it where a person will see it.
  if (!conversation) {
    await db.insert(crmUnmatchedEmails).values({
      emailId,
      fromAddress: from || null,
      toAddress: to[0] ?? null,
      subject,
      bodyText: fetched.text ?? null,
      bodyHtml: fetched.html ?? null,
      headers: (fetched.headers ?? null) as Record<string, unknown> | null,
      reason: "No reply token matched and the sender address could not be read, so there is nothing to attribute this to.",
    });
    await markEvent(eventId, "stored", "kept as unmatched for review");
    return { state: "stored", reason: "unmatched" };
  }

  const automated = looksAutomated(fetched.headers);

  const [message] = await db.insert(crmMessages).values({
    leadId: conversation.contactId ?? null,
    conversationId: conversation.id,
    direction: "inbound",
    channel: "email",
    subject,
    body: fetched.text ?? stripHtml(fetched.html ?? "") ?? null,
    fromNumber: from || null,
    toNumber: to[0] ?? null,
    providerMessageId,
    origin: "inbound",
    status: "received",
    metadata: {
      automated,
      hasAttachments: (fetched.attachments?.length ?? 0) > 0,
      attachmentCount: fetched.attachments?.length ?? 0,
      matchedBy: token ? "reply-token" : "sender-address",
      // Recorded because the provider exposes no authentication verdict; the
      // sender is a claim and downstream code should treat it as one.
      senderAuthenticated: false,
    },
  }).returning();

  // Extend the References chain so our replies thread properly in the
  // customer's mail client — Resend does not do this for us.
  if (providerMessageId) {
    await db.update(crmConversations).set({
      referenceChain: sql`array_append(coalesce(${crmConversations.referenceChain}, '{}'), ${providerMessageId})`,
      // A customer message means the ball is back with us. A conversation
      // parked "awaiting customer" reopens; a resolved one is left resolved,
      // because reopening it automatically would erase a decision somebody
      // made deliberately.
      status: sql`CASE WHEN ${crmConversations.status} = 'awaiting_customer' THEN 'unassigned' ELSE ${crmConversations.status} END`,
      updatedAt: new Date(),
    }).where(eq(crmConversations.id, conversation.id));
  }

  await refreshConversationRollups(conversation.id);
  await db.update(crmInboundEmailEvents).set({
    state: "stored", processedAt: new Date(),
    messageId: message.id, conversationId: conversation.id, lastError: null,
  }).where(eq(crmInboundEmailEvents.id, eventId));

  return { state: "stored", conversationId: conversation.id, messageId: message.id };
}

async function markEvent(id: number, state: string, reason?: string): Promise<void> {
  await db.update(crmInboundEmailEvents)
    .set({ state, lastError: reason ?? null, processedAt: state === "stored" ? new Date() : null })
    .where(eq(crmInboundEmailEvents.id, id));
}

/** Crude but adequate: enough to give the list a readable preview. */
function stripHtml(html: string): string | null {
  if (!html) return null;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

// ── Suppression ─────────────────────────────────────────────────────────────

/** Records a bounce or complaint so we stop mailing that address. */
export async function suppressAddress(args: {
  address: string;
  reason: "bounce" | "complaint" | "manual";
  bounceType?: string | null;
  detail?: string | null;
  source?: string;
}): Promise<void> {
  const address = normalizeAddress("email", args.address);
  if (!address) return;
  // A transient (soft) bounce is not a reason to stop writing to somebody —
  // a full mailbox empties. Only permanent failures and complaints suppress.
  if (args.reason === "bounce" && args.bounceType && args.bounceType.toLowerCase() !== "permanent") return;

  await db.insert(crmEmailSuppressions).values({
    address, reason: args.reason,
    bounceType: args.bounceType ?? null,
    detail: args.detail ?? null,
    source: args.source ?? "provider",
  }).onConflictDoUpdate({
    target: crmEmailSuppressions.address,
    set: {
      reason: args.reason, bounceType: args.bounceType ?? null,
      detail: args.detail ?? null, releasedAt: null, updatedAt: new Date(),
    },
  });
}

/** True when we must not email this address. */
export async function isSuppressed(address: string): Promise<{ suppressed: boolean; reason?: string }> {
  const normalized = normalizeAddress("email", address);
  if (!normalized) return { suppressed: false };
  const [row] = await db.select().from(crmEmailSuppressions).where(and(
    eq(crmEmailSuppressions.address, normalized),
    isNull(crmEmailSuppressions.releasedAt),
  )).limit(1);
  if (!row) return { suppressed: false };
  return {
    suppressed: true,
    reason: row.reason === "complaint"
      ? "This address reported a previous message as spam. Mailing it again risks the whole domain's deliverability."
      : `This address hard-bounced${row.detail ? ` (${row.detail})` : ""}, so mail to it will not arrive.`,
  };
}

// ── Reply-loop protection ───────────────────────────────────────────────────

const LOOP_WINDOW_MS = 60 * 60 * 1000;
const LOOP_MAX_PER_WINDOW = 10;

/**
 * Counts an outbound message and reports whether the brake has engaged.
 *
 * The failure this prevents is mutual auto-response: their vacation responder
 * answers our automated reply, which answers it back, forever. Header
 * heuristics catch polite auto-responders; a hard cap per conversation per
 * hour catches the rest, and engaging it is recorded rather than silent.
 */
export async function recordOutboundForLoopControl(
  conversationId: number,
): Promise<{ allowed: boolean; reason?: string; sentInWindow: number }> {
  const windowStart = new Date(Math.floor(Date.now() / LOOP_WINDOW_MS) * LOOP_WINDOW_MS);

  const [row] = await db.insert(crmEmailSendCounters)
    .values({ conversationId, windowStart, sent: 1 })
    .onConflictDoUpdate({
      target: [crmEmailSendCounters.conversationId, crmEmailSendCounters.windowStart],
      set: { sent: sql`${crmEmailSendCounters.sent} + 1` },
    }).returning();

  const sent = row?.sent ?? 1;
  if (sent > LOOP_MAX_PER_WINDOW) {
    if (!row?.haltedAt) {
      await db.update(crmEmailSendCounters).set({
        haltedAt: new Date(),
        haltReason: `More than ${LOOP_MAX_PER_WINDOW} messages were sent on this conversation within an hour, which is the signature of a reply loop rather than a conversation.`,
      }).where(eq(crmEmailSendCounters.id, row!.id));
    }
    return {
      allowed: false,
      sentInWindow: sent,
      reason: `This conversation has already sent ${sent - 1} messages in the last hour. Sending was stopped to avoid a reply loop.`,
    };
  }
  return { allowed: true, sentInWindow: sent };
}
