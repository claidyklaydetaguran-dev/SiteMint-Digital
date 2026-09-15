// ── M5: getting a support reply to the customer ─────────────────────────────
//
// Support could record a reply. It could not send one, so a client waiting for
// an answer never got it. This is the delivery half, and it is deliberately
// NOT a new delivery system.
//
// What is reused, and why reusing it is the whole point:
//
//   `staffMail.trySendStaffMail`   the one place that talks to the provider,
//                                  and the one place that is inert unless
//                                  CRM_EMAIL_TEST_MODE is exactly "false". A
//                                  second send path is a second way to email a
//                                  real customer from a test run.
//
//   `crmScheduler.classifyDeliveryOutcome`
//                                  the conservative mapping from a provider
//                                  answer to a state. Imported, not copied: a
//                                  5xx is UNKNOWN here for the same reason it
//                                  is unknown there, and if that judgement is
//                                  ever revised it must be revised once.
//
//   `inboundEmail.replyToAddress`  the unforgeable reply token. A support
//                                  reply's Reply-To is `c-<token>@<domain>`
//                                  on a conversation this ticket owns, so the
//                                  EXISTING inbound webhook correlates the
//                                  customer's answer without a second scheme
//                                  and without a line changing in
//                                  `inboundEmail.ts`.
//
// What is new is only the placement. A support reply has exactly ONE recipient
// and ONE occurrence — the message row itself — so the (occurrence, recipient)
// pair that earns `crm_reminder_deliveries` its own table collapses onto the
// message here. The state machine is identical: five states, `next_attempt_at`
// is the only thing a retry moves, and an unknown outcome is never retried by
// a machine.
//
// The honesty rule this file exists to hold: `accepted` means the provider
// took the message. It is not "delivered" and it is not "Sent". Nothing here
// returns the word "sent" for it, so no screen can render one.

import crypto from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  db, crmSupportTickets, crmSupportMessages, crmConversations, crmMessages,
  crmLeads, supportTicketReference,
  type CrmSupportTicket, type CrmSupportMessage, type CrmSupportDeliveryAction,
} from "@workspace/db";
import {
  trySendStaffMail, staffMailBlockedReason, staffMailConfigured,
  RESEND_IDEMPOTENCY_WINDOW_MS,
} from "./staffMail.js";
import { classifyDeliveryOutcome, DELIVERY_FAILURE_REASONS } from "./crmScheduler.js";
import { replyToAddress, inboundDomain, isSuppressed } from "./inboundEmail.js";

// ── Constants, matching the reminder engine ─────────────────────────────────

const WORKER_ID = `support-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** How long an `attempting` row may sit before it is presumed worker-lost. */
const LEASE_MS = 5 * 60 * 1000;

/**
 * Waits between AUTOMATIC attempts, and the cap on them. Durable, not an
 * in-process sleep: a worker that dies between attempts loses nothing.
 *
 * Only the one failure class that PROVES nothing was sent ever gets here.
 */
const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000];
const MAX_AUTO_ATTEMPTS = 3;

const BATCH = 50;

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * The provider idempotency key for one support reply.
 *
 * Stable across every retry of this message, because the message row IS the
 * occurrence. A deliberate re-send appends a suffix: a re-send is a request
 * for a second copy and must not be collapsed into the first.
 */
export function supportIdempotencyKey(ticketId: number, messageId: number): string {
  return `support:${ticketId}:${messageId}`;
}

export function supportResendKey(base: string, resendCount: number): string {
  return `${base}:resend:${resendCount}:${crypto.randomBytes(4).toString("hex")}`;
}

// ── The ticket's reply address ──────────────────────────────────────────────

/**
 * The conversation whose reply token addresses this ticket, creating it once.
 *
 * Its identity key lives in its own namespace — `email:support-ticket:<id>` —
 * rather than going through `ensureConversation`, which keys a known contact's
 * mail on `email:lead:<id>`. That distinction is the requirement: on the lead
 * key, every ticket for one client would share one token, and a reply could
 * not say which ticket it answered. The namespace cannot collide with the
 * inbox's own keys, and the unique constraint makes a concurrent create safe.
 */
export async function ensureTicketConversation(
  ticket: CrmSupportTicket,
  contact: { id: number; name?: string | null; email?: string | null } | null,
): Promise<number | null> {
  if (ticket.conversationId) return ticket.conversationId;
  const address = contact?.email?.trim().toLowerCase();
  if (!address) return null;

  const identityKey = `email:support-ticket:${ticket.id}`;
  await db.insert(crmConversations).values({
    channel: "email",
    provider: "resend",
    identityKey,
    contactId: contact?.id ?? null,
    externalAddress: address,
    externalName: contact?.name ?? null,
    subject: `${supportTicketReference(ticket.id)} ${ticket.subject}`,
    metadata: { surface: "support", supportTicketId: ticket.id },
  }).onConflictDoNothing({ target: crmConversations.identityKey });

  const [row] = await db.select({ id: crmConversations.id })
    .from(crmConversations).where(eq(crmConversations.identityKey, identityKey)).limit(1);
  if (!row) return null;

  await db.update(crmSupportTickets)
    .set({ conversationId: row.id, updatedAt: new Date() })
    .where(and(eq(crmSupportTickets.id, ticket.id), isNull(crmSupportTickets.conversationId)));
  return row.id;
}

// ── The message the customer reads ──────────────────────────────────────────

/**
 * The body of a support reply.
 *
 * The reference is in the subject so a client's mail client threads it and so
 * a person quoting it back gives us something to search on. The footer names
 * the reply address explicitly: a client who strips Reply-To, or forwards the
 * message from another account, still has a way back to the right ticket.
 */
export function composeSupportReply(args: {
  ticket: Pick<CrmSupportTicket, "id" | "subject">;
  body: string;
  authorLabel: string | null;
  replyTo: string | null;
}): { subject: string; text: string } {
  const reference = supportTicketReference(args.ticket.id);
  const signature = args.authorLabel ? `\n\n— ${args.authorLabel}\nSiteMint Digital Solutions` : "\n\nSiteMint Digital Solutions";
  const footer = args.replyTo
    ? `\n\nReply to this email and it lands straight back on ${reference}.`
    : "";
  return {
    subject: `[${reference}] ${args.ticket.subject}`,
    text: `${args.body}${signature}${footer}`,
  };
}

// ── Arming a message for delivery ───────────────────────────────────────────

export type ArmResult =
  | { armed: true; idempotencyKey: string; to: string }
  | { armed: false; state: "pending" | "refused"; reason: string; detail: string };

/**
 * Decides whether this reply can be handed to a provider at all, and writes
 * the answer onto the row.
 *
 * Three outcomes, and the difference between the first two is the whole
 * reason this is not a boolean:
 *
 *  - `refused`  there is no address, or the address is suppressed. Nothing was
 *               sent and nothing will be by retrying; a person must fix it.
 *  - `pending` with NO next attempt — mail is not configured on this server.
 *               Nothing reached a provider, so nothing can have been
 *               duplicated, and the row waits for a person rather than for a
 *               worker that would never be able to send it either. It is
 *               deliberately NOT left stateless: a reply nobody can see the
 *               status of is how "I thought we answered them" happens.
 *  - armed      a real attempt may now be made.
 */
export async function armDelivery(args: {
  ticket: CrmSupportTicket;
  message: CrmSupportMessage;
  contact: { id: number; name?: string | null; email?: string | null } | null;
}): Promise<ArmResult> {
  const { ticket, message } = args;
  const now = new Date();

  // Belt and braces over the database's own constraint. Reaching here with an
  // internal note would be a caller bug, and it must never become a send.
  if (message.visibility !== "customer" || message.origin === "customer") {
    return {
      armed: false, state: "refused",
      reason: DELIVERY_FAILURE_REASONS.recipientUnavailable,
      detail: "only a customer-visible message written by this office is ever delivered",
    };
  }

  const to = args.contact?.email?.trim();
  if (!to) {
    await settleUnsendable(message.id, DELIVERY_FAILURE_REASONS.recipientUnavailable,
      "this contact has no email address, so the reply has nowhere to go");
    return {
      armed: false, state: "refused",
      reason: DELIVERY_FAILURE_REASONS.recipientUnavailable,
      detail: "this contact has no email address, so the reply has nowhere to go",
    };
  }

  const suppression = await isSuppressed(to);
  if (suppression.suppressed) {
    await settleUnsendable(message.id, DELIVERY_FAILURE_REASONS.recipientUnavailable,
      suppression.reason ?? "this address is suppressed");
    return {
      armed: false, state: "refused",
      reason: DELIVERY_FAILURE_REASONS.recipientUnavailable,
      detail: suppression.reason ?? "this address is suppressed",
    };
  }

  const key = supportIdempotencyKey(ticket.id, message.id);
  const blocked = staffMailBlockedReason();

  // The ticket's conversation is deliberately NOT created here. It exists to
  // carry the reply token on an outbound message, so minting one before we
  // know a message is going out would leave a conversation — visible in the
  // Inbox — for mail that never left. It is created in `attemptSupportDelivery`
  // instead, at the moment there is something to put a Reply-To on.
  if (blocked) {
    // Nothing was constructed and nothing was handed over. `pending` with no
    // scheduled attempt is the honest state: waiting on a person, not on a
    // timer. An operator can retry it once mail works.
    await db.update(crmSupportMessages).set({
      deliveryState: "pending",
      deliveryAttempt: 0,
      nextAttemptAt: null,
      deliveryIdempotencyKey: key,
      deliveredTo: to,
      deliveryFailureReason: DELIVERY_FAILURE_REASONS.notConfigured,
      deliveryFailureDetail: blocked,
    }).where(eq(crmSupportMessages.id, message.id));
    return { armed: false, state: "pending", reason: DELIVERY_FAILURE_REASONS.notConfigured, detail: blocked };
  }

  await db.update(crmSupportMessages).set({
    deliveryState: "pending",
    deliveryAttempt: 0,
    nextAttemptAt: now,
    deliveryIdempotencyKey: key,
    deliveredTo: to,
    deliveryFailureReason: null,
    deliveryFailureDetail: null,
  }).where(eq(crmSupportMessages.id, message.id));

  return { armed: true, idempotencyKey: key, to };
}

/** A delivery that can never happen: recorded as refused, not left blank. */
async function settleUnsendable(messageId: number, reason: string, detail: string): Promise<void> {
  await db.update(crmSupportMessages).set({
    deliveryState: "refused",
    deliveryAttempt: 0,
    nextAttemptAt: null,
    deliveryFailureReason: reason,
    deliveryFailureDetail: detail.slice(0, 500),
  }).where(eq(crmSupportMessages.id, messageId));
}

// ── Claim, send, settle ─────────────────────────────────────────────────────

/**
 * Takes this delivery, or does not.
 *
 * One conditional UPDATE, so two workers cannot both take it: PostgreSQL
 * serialises the row, the loser re-evaluates its WHERE against the winner's
 * committed state, matches nothing, and returns empty. There is no window
 * between checking and claiming because there is no separate check.
 */
async function claim(messageId: number): Promise<CrmSupportMessage | undefined> {
  const [row] = await db.update(crmSupportMessages).set({
    deliveryState: "attempting",
    deliveryAttempt: sql`coalesce(${crmSupportMessages.deliveryAttempt}, 0) + 1`,
    attemptStartedAt: new Date(),
    attemptWorker: WORKER_ID,
    nextAttemptAt: null,
  }).where(and(
    eq(crmSupportMessages.id, messageId),
    eq(crmSupportMessages.deliveryState, "pending"),
    isNull(crmSupportMessages.deliveryResolvedAt),
    isNotNull(crmSupportMessages.nextAttemptAt),
    lte(crmSupportMessages.nextAttemptAt, new Date()),
  )).returning();
  return row;
}

/**
 * Writes down what the provider actually said, for the attempt THIS worker
 * made and no other.
 *
 * The guard matches the attempt number and the worker id, so a worker whose
 * lease expired — and whose in-flight row another worker has already promoted
 * to `uncertain` — may still improve its own guess to the real answer, and can
 * never overwrite a different attempt's verdict.
 */
async function settle(
  claimed: CrmSupportMessage,
  outcome: Awaited<ReturnType<typeof trySendStaffMail>>,
): Promise<void> {
  const verdict = classifyDeliveryOutcome(outcome);
  const now = new Date();
  const attempt = claimed.deliveryAttempt ?? 1;

  const nextAttemptAt = verdict.state === "pending" && verdict.autoRetryable
    && attempt < MAX_AUTO_ATTEMPTS
    ? new Date(now.getTime() + (RETRY_BACKOFF_MS[attempt - 1] ?? 0))
    : null;

  // A recovery a person asked for, which then succeeded, closes the case and
  // is attributed to them. An ordinary first-time success closes nothing,
  // because nobody had to do anything.
  const closes = verdict.state === "accepted"
    && claimed.deliveryResolvedAt === null
    && (claimed.lastRecoveryAction === "retry" || claimed.lastRecoveryAction === "resend");

  await db.update(crmSupportMessages).set({
    deliveryState: verdict.state,
    nextAttemptAt,
    attemptStartedAt: null,
    attemptWorker: null,
    deliveryProviderRef: verdict.providerRef ?? claimed.deliveryProviderRef,
    deliveryFailureReason: verdict.state === "accepted" ? null : verdict.reason,
    deliveryFailureDetail: verdict.state === "accepted" ? null : verdict.detail.slice(0, 500),
    ...(closes
      ? {
          deliveryResolution: claimed.lastRecoveryAction === "resend" ? "resent" as const : "accepted" as const,
          deliveryResolvedAt: now,
          deliveryResolvedByStaffId: claimed.lastRecoveryByStaffId,
          deliveryResolutionNote: claimed.lastRecoveryAction === "resend"
            ? "a deliberate new copy was accepted by the provider"
            : "a retry carrying the original idempotency key was accepted by the provider",
        }
      : {}),
  }).where(and(
    eq(crmSupportMessages.id, claimed.id),
    eq(crmSupportMessages.deliveryAttempt, attempt),
    eq(crmSupportMessages.attemptWorker, WORKER_ID),
    or(eq(crmSupportMessages.deliveryState, "attempting"), eq(crmSupportMessages.deliveryState, "uncertain")),
  ));
}

/** Claims, sends and settles one reply. Never throws. */
export async function attemptSupportDelivery(messageId: number): Promise<"attempted" | "skipped"> {
  if (staffMailBlockedReason()) return "skipped";

  const claimed = await claim(messageId);
  if (!claimed) return "skipped";

  // The row's own recorded recipient, not a freshly-read contact address: a
  // retry must send to where the original attempt was aimed, otherwise the
  // idempotency key stops matching the payload it was minted for.
  const to = claimed.deliveredTo;
  if (!to) {
    await settleUnsendable(claimed.id, DELIVERY_FAILURE_REASONS.recipientUnavailable,
      "no recipient address was recorded for this reply");
    return "skipped";
  }

  const [ticket] = await db.select().from(crmSupportTickets)
    .where(eq(crmSupportTickets.id, claimed.ticketId)).limit(1);
  if (!ticket) {
    await settleUnsendable(claimed.id, DELIVERY_FAILURE_REASONS.recipientUnavailable,
      "the ticket this reply belongs to no longer exists");
    return "skipped";
  }

  // Created here, at the one moment it earns its existence: a message is about
  // to go out and needs a Reply-To that identifies this ticket. Doing it any
  // earlier would leave conversations behind for replies that never left.
  const contact = await contactForTicket(ticket);
  const conversationId = await ensureTicketConversation(ticket, contact);
  const replyTo = conversationId ? await replyToAddress(conversationId) : null;
  const composed = composeSupportReply({
    ticket, body: claimed.body, authorLabel: claimed.sentByLabel, replyTo,
  });

  const outcome = await trySendStaffMail({
    to,
    subject: composed.subject,
    text: composed.text,
    ...(claimed.deliveryIdempotencyKey ? { idempotencyKey: claimed.deliveryIdempotencyKey } : {}),
  });
  await settle(claimed, outcome);
  return "attempted";
}

// ── The worker pass ─────────────────────────────────────────────────────────

/**
 * Promotes attempts whose worker is gone.
 *
 * A row left `attempting` by a killed process is the genuinely ambiguous case:
 * bytes may or may not have reached the provider. It is NOT re-sent and NOT
 * dropped — it becomes a visible `uncertain` row a person can act on.
 */
export async function recoverStaleSupportAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const rows = await db.update(crmSupportMessages).set({
    deliveryState: "uncertain",
    nextAttemptAt: null,
    attemptStartedAt: null,
    attemptWorker: null,
    deliveryFailureReason: DELIVERY_FAILURE_REASONS.workerLost,
    deliveryFailureDetail: "an attempt started and never resolved; the worker that made it is gone",
  }).where(and(
    eq(crmSupportMessages.deliveryState, "attempting"),
    isNotNull(crmSupportMessages.attemptStartedAt),
    lte(crmSupportMessages.attemptStartedAt, cutoff),
  )).returning({ id: crmSupportMessages.id });
  return rows.length;
}

/**
 * One pass over support replies that are due.
 *
 * This is what makes an operator retry durable: the recovery action moves
 * `next_attempt_at` and nothing else, and the send happens here — so a retry
 * survives the request that asked for it.
 */
export async function processDueSupportDeliveries(limit = BATCH): Promise<{
  recovered: number; attempted: number;
}> {
  const recovered = await recoverStaleSupportAttempts();

  const due = await db.select().from(crmSupportMessages).where(and(
    eq(crmSupportMessages.deliveryState, "pending"),
    isNull(crmSupportMessages.deliveryResolvedAt),
    isNotNull(crmSupportMessages.nextAttemptAt),
    lte(crmSupportMessages.nextAttemptAt, new Date()),
  )).orderBy(asc(crmSupportMessages.nextAttemptAt)).limit(Math.min(Math.max(limit, 1), 500));

  let attempted = 0;
  for (const row of due) {
    if (await attemptSupportDelivery(row.id) === "attempted") attempted += 1;
  }
  return { recovered, attempted };
}

// ── What an operator is shown ───────────────────────────────────────────────

/** True while the provider still collapses a repeat of this exact message. */
export function supportIdempotencyProtected(row: CrmSupportMessage, now = Date.now()): boolean {
  const started = row.attemptStartedAt ?? row.createdAt;
  return now - new Date(started).getTime() < RESEND_IDEMPOTENCY_WINDOW_MS;
}

export type SupportDeliveryView = {
  state: string;
  /** The words a screen may use. Deliberately never "Sent". */
  label: string;
  tone: "waiting" | "working" | "accepted" | "attention";
  explanation: string;
  needsAttention: boolean;
  attempt: number;
  nextAttemptAt: string | null;
  deliveredTo: string | null;
  providerRef: string | null;
  failureReason: string | null;
  failureDetail: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  availableActions: CrmSupportDeliveryAction[];
  retryCouldDuplicate: boolean;
};

/**
 * The delivery of one message, in words that do not overstate it.
 *
 * `accepted` renders as "Accepted by the mail provider", never "Sent". The
 * provider taking a message is not the message arriving, and a screen that
 * says "Sent" leaves somebody believing a client has read something that
 * bounced ten seconds later.
 *
 * Returns null when there is no delivery — an internal note, or the customer's
 * own words. Not a fabricated "n/a" state: no delivery exists, so none is
 * described.
 */
export function supportDeliveryView(
  row: CrmSupportMessage, now = Date.now(),
): SupportDeliveryView | null {
  if (!row.deliveryState) {
    if (row.visibility === "internal" || row.origin === "customer") return null;
    // A customer-visible reply written before M5, or one recorded while this
    // server had no mail at all. Saying nothing would imply it went.
    return {
      state: "not_attempted",
      label: "Not sent",
      tone: "attention",
      explanation: "This reply was recorded on the ticket and never handed to a mail provider. Nothing reached the client.",
      needsAttention: true,
      attempt: 0,
      nextAttemptAt: null, deliveredTo: null, providerRef: null,
      failureReason: null, failureDetail: null,
      resolvedAt: null, resolution: null, resolutionNote: null,
      availableActions: [],
      retryCouldDuplicate: false,
    };
  }

  const resolved = row.deliveryResolvedAt != null;
  const base = {
    attempt: row.deliveryAttempt ?? 0,
    nextAttemptAt: row.nextAttemptAt ? new Date(row.nextAttemptAt).toISOString() : null,
    deliveredTo: row.deliveredTo,
    providerRef: row.deliveryProviderRef,
    failureReason: row.deliveryFailureReason,
    failureDetail: row.deliveryFailureDetail,
    resolvedAt: row.deliveryResolvedAt ? new Date(row.deliveryResolvedAt).toISOString() : null,
    resolution: row.deliveryResolution,
    resolutionNote: row.deliveryResolutionNote,
    retryCouldDuplicate: !supportIdempotencyProtected(row, now),
  };

  switch (row.deliveryState) {
    case "pending":
      return row.nextAttemptAt
        ? {
            ...base, state: "pending", label: "Queued to send", tone: "waiting",
            explanation: "Nothing has been handed to the mail provider yet. The next attempt is scheduled.",
            needsAttention: false,
            availableActions: ["acknowledge"],
          }
        : {
            ...base, state: "pending", label: "Waiting — not sent", tone: "attention",
            explanation: row.deliveryFailureDetail
              ?? "Nothing reached a mail provider and no attempt is scheduled. Somebody has to act.",
            needsAttention: !resolved,
            availableActions: resolved ? [] : ["retry", "acknowledge"],
          };
    case "attempting":
      return {
        ...base, state: "attempting", label: "Sending now", tone: "working",
        explanation: "A request is in flight with the mail provider. The answer is not back yet.",
        needsAttention: false,
        availableActions: [],
      };
    case "accepted":
      return {
        ...base, state: "accepted", label: "Accepted by the mail provider", tone: "accepted",
        explanation: "The provider took the message. That is not the same as the client receiving it — a bounce, if there is one, arrives afterwards and shows up in the suppression list.",
        needsAttention: false,
        availableActions: [],
      };
    case "refused":
      return {
        ...base, state: "refused", label: "Refused — the client did not get this", tone: "attention",
        explanation: row.deliveryFailureDetail
          ?? "The mail provider looked at the message and would not take it. Sending the same thing again produces the same refusal.",
        needsAttention: !resolved,
        availableActions: resolved ? [] : ["retry", "resend", "acknowledge"],
      };
    case "uncertain":
      return {
        ...base, state: "uncertain", label: "Outcome unknown", tone: "attention",
        explanation: row.deliveryFailureDetail
          ? `${row.deliveryFailureDetail} The message may or may not have gone out, so nothing is retried automatically — a machine repeating this could send the client a second copy.`
          : "The message may or may not have gone out. Nothing is retried automatically, because repeating it could send the client a second copy.",
        needsAttention: !resolved,
        availableActions: resolved ? [] : ["retry", "resend", "acknowledge"],
      };
    default:
      return {
        ...base, state: row.deliveryState, label: "Unrecognised state", tone: "attention",
        explanation: "This delivery is in a state this version does not understand. It is shown rather than hidden.",
        needsAttention: true,
        availableActions: ["acknowledge"],
      };
  }
}

/** The sentence an operator is shown BEFORE they confirm a re-send. */
export function supportResendRisk(row: CrmSupportMessage, now = Date.now()): string {
  if (row.deliveryState === "refused") {
    return "The provider refused this message, so a second copy is very unlikely to be a duplicate — but it is still a new send.";
  }
  return supportIdempotencyProtected(row, now)
    ? "The first attempt may already have gone out. A deliberate re-send carries a NEW idempotency key, so the client can receive two copies."
    : "The provider's 24-hour idempotency window has passed, so nothing collapses a repeat now. If the first attempt did go out, the client gets two copies.";
}

// ── Operator recovery ───────────────────────────────────────────────────────

export type SupportRecoveryResult =
  | { ok: true; state: string; note: string }
  | { ok: false; status: number; error: string };

/**
 * A person's decision about a delivery that did not settle, recorded with the
 * reason they gave.
 *
 * `retry` and `resend` only ever ARM the row — they move `next_attempt_at` and
 * nothing else. The send itself happens in the worker pass, so the decision
 * survives the request that asked for it and a browser that closed.
 */
export async function recoverSupportDelivery(args: {
  messageId: number;
  action: CrmSupportDeliveryAction;
  reason: string;
  staffId: number | null;
}): Promise<SupportRecoveryResult> {
  const [row] = await db.select().from(crmSupportMessages)
    .where(eq(crmSupportMessages.id, args.messageId)).limit(1);
  if (!row) return { ok: false, status: 404, error: "No such message." };
  if (!row.deliveryState) {
    return {
      ok: false, status: 409,
      error: "This message has no delivery to recover. An internal note is never sent, and the customer's own words are not ours to deliver.",
    };
  }
  if (row.deliveryResolvedAt) {
    return { ok: false, status: 409, error: "This delivery has already been closed by somebody." };
  }

  const view = supportDeliveryView(row);
  if (!view?.availableActions.includes(args.action)) {
    return {
      ok: false, status: 409,
      error: `A delivery that is "${view?.label ?? row.deliveryState}" cannot be ${args.action === "acknowledge" ? "acknowledged" : args.action + "d"} right now.`,
    };
  }

  const now = new Date();

  if (args.action === "acknowledge") {
    await db.update(crmSupportMessages).set({
      nextAttemptAt: null,
      lastRecoveryAction: "acknowledge",
      lastRecoveryByStaffId: args.staffId,
      lastRecoveryAt: now,
      deliveryResolution: "acknowledged",
      deliveryResolvedAt: now,
      deliveryResolvedByStaffId: args.staffId,
      deliveryResolutionNote: args.reason.slice(0, 500),
    }).where(eq(crmSupportMessages.id, row.id));
    return {
      ok: true, state: row.deliveryState,
      note: "Closed without sending anything. The delivery's own state is left exactly as it was, because acknowledging it does not change what happened.",
    };
  }

  // A retry keeps the original key, so the provider collapses it into the
  // first send if that send did reach it. A re-send is a deliberate second
  // copy and therefore gets a new key — reusing the old one would have the
  // provider silently swallow the re-send and do nothing.
  const resending = args.action === "resend";
  const baseKey = row.deliveryIdempotencyKey ?? supportIdempotencyKey(row.ticketId, row.id);
  const resendCount = (row.deliveryResendCount ?? 0) + (resending ? 1 : 0);

  await db.update(crmSupportMessages).set({
    deliveryState: "pending",
    nextAttemptAt: now,
    attemptStartedAt: null,
    attemptWorker: null,
    deliveryIdempotencyKey: resending ? supportResendKey(baseKey, resendCount) : baseKey,
    deliveryResendCount: resendCount,
    lastRecoveryAction: args.action,
    lastRecoveryByStaffId: args.staffId,
    lastRecoveryAt: now,
  }).where(eq(crmSupportMessages.id, row.id));

  return {
    ok: true,
    state: "pending",
    note: resending
      ? "A new copy is queued with a new idempotency key, so the provider will not collapse it into the first send."
      : "Queued again with the ORIGINAL idempotency key, so the provider collapses it into the first send if that send did reach it.",
  };
}

// ── Inbound: the customer's reply lands on the ticket ───────────────────────

/**
 * Files inbound email onto the ticket it answers.
 *
 * The correlation is NOT done here and that is the point. The existing inbound
 * pipeline matched the message to a conversation by the unforgeable token in
 * our own Reply-To, and recorded `metadata.matchedBy = 'reply-token'` saying
 * so. This reads only rows carrying that proof, on a conversation a ticket
 * owns. Two independent barriers therefore stand between a spoofed `from` and
 * somebody's ticket:
 *
 *  1. a sender-address match lands on `email:lead:<id>` or `email:addr:<x>`,
 *     which no ticket owns, so it cannot reach a ticket at all; and
 *  2. even on a ticket's conversation, a row not matched by token is ignored.
 *
 * Idempotent through the UNIQUE index on `inbound_message_id`: running it
 * twice, or in two workers at once, files each received email exactly once.
 */
export async function ingestSupportReplies(opts: { ticketId?: number; limit?: number } = {}): Promise<{
  filed: number; ticketIds: number[];
}> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  const candidates = await db.select({
    messageId: crmMessages.id,
    ticketId: crmSupportTickets.id,
    ticketStatus: crmSupportTickets.status,
    leadId: crmSupportTickets.leadId,
    body: crmMessages.body,
    createdAt: crmMessages.createdAt,
  }).from(crmMessages)
    .innerJoin(crmSupportTickets, eq(crmSupportTickets.conversationId, crmMessages.conversationId))
    .where(and(
      eq(crmMessages.direction, "inbound"),
      // The proof. Written by `processInboundEvent` only when our own token
      // was present in a recipient address.
      sql`${crmMessages.metadata} ->> 'matchedBy' = 'reply-token'`,
      opts.ticketId ? eq(crmSupportTickets.id, opts.ticketId) : sql`true`,
      sql`NOT EXISTS (
        SELECT 1 FROM ${crmSupportMessages}
         WHERE ${crmSupportMessages.inboundMessageId} = ${crmMessages.id}
      )`,
    ))
    .orderBy(asc(crmMessages.id))
    .limit(limit);

  const touched = new Set<number>();
  let filed = 0;

  for (const row of candidates) {
    const body = (row.body ?? "").trim();
    const inserted = await db.insert(crmSupportMessages).values({
      ticketId: row.ticketId,
      visibility: "customer",
      body: body || "(The client replied with an empty message, or one this CRM could not read as text.)",
      origin: "customer",
      sentByStaffId: null,
      sentByLabel: null,
      inboundMessageId: row.messageId,
      // No conflict target: `uq_crm_support_messages_inbound` is PARTIAL, and
      // inferring a partial index needs its predicate restated on the ON
      // CONFLICT clause. An arbiter-less DO NOTHING covers it and every other
      // unique constraint on the table, which is exactly what is wanted here —
      // any collision means this email is already filed.
    }).onConflictDoNothing().returning({ id: crmSupportMessages.id });
    if (!inserted[0]) continue;

    filed += 1;
    touched.add(row.ticketId);

    const patch: Partial<typeof crmSupportTickets.$inferInsert> = {
      lastCustomerMessageAt: row.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    // The customer has come back, so the ball is ours again. Exactly the move
    // the hand-entry route already makes, and no more: a resolved ticket is
    // NOT reopened automatically, because that would undo a decision somebody
    // made deliberately. It still lands on the same ticket, with its history.
    if (row.ticketStatus === "waiting_on_customer") patch.status = "open";
    await db.update(crmSupportTickets).set(patch).where(eq(crmSupportTickets.id, row.ticketId));
  }

  return { filed, ticketIds: [...touched] };
}

// ── Configuration, reported honestly ────────────────────────────────────────

export function supportDeliveryStatus(env: NodeJS.ProcessEnv = process.env): {
  canSend: boolean;
  canReceiveReplies: boolean;
  replyDomain: string | null;
  blockedReason: string | null;
  inboundNote: string;
} {
  const domain = inboundDomain(env);
  return {
    canSend: staffMailConfigured(env),
    canReceiveReplies: Boolean(domain),
    replyDomain: domain,
    blockedReason: staffMailBlockedReason(env),
    inboundNote: domain
      ? `Replies come back to c-<token>@${domain} and are matched to the ticket by that token, never by the sender's address. This only works once an MX record points that domain at the mail provider.`
      : "CRM_INBOUND_EMAIL_DOMAIN is not set, so a support reply carries no Reply-To that identifies the ticket and a client's answer cannot be correlated to one.",
  };
}

/** Contact lookup shared by the routes, kept here so one query shape is used. */
export async function contactForTicket(ticket: CrmSupportTicket): Promise<{
  id: number; name: string | null; email: string | null;
} | null> {
  const [lead] = await db.select({ id: crmLeads.id, name: crmLeads.name, email: crmLeads.email })
    .from(crmLeads).where(eq(crmLeads.id, ticket.leadId)).limit(1);
  return lead ?? null;
}
