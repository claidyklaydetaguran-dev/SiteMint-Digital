// ── Inbound email routes ────────────────────────────────────────────────────
//
// The webhook Resend calls when a client replies, plus the two operator
// surfaces that keep received mail from disappearing: the unmatched queue and
// the suppression list.
//
// These live in their own file rather than in crm.ts, which already holds the
// delivery-event webhook. That one reports what happened to mail we SENT; this
// one receives mail somebody sent US. Keeping them apart keeps their signing
// secrets, their failure modes and their retry semantics distinct.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db, crmInboundEmailEvents, crmUnmatchedEmails, crmEmailSuppressions,
  crmConversations, crmMessages, crmStaff, crmLeads,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import {
  recordInboundEvent, processInboundEvent, inboundWebhookSecret,
  inboundConfigured, inboundBlockedReason, inboundDomain,
  suppressAddress, extractAddress,
} from "../lib/inboundEmail.js";
import { ensureConversation, refreshConversationRollups } from "../lib/conversations.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// ── The webhook ─────────────────────────────────────────────────────────────

/**
 * `email.received` from Resend.
 *
 * Unauthenticated in the session sense — the signature IS the authentication.
 * Verification uses the raw body, because the signature covers the exact bytes
 * and any re-serialisation changes them.
 *
 * The handler records and acknowledges, then fetches the content afterwards.
 * The webhook payload deliberately carries no body, so the fetch is a second
 * network call; doing it inline would risk the webhook timing out, and every
 * timeout is retried, and every retry would race the one before it.
 */
router.post("/crm/webhooks/resend/inbound", async (req: Request, res: Response) => {
  const secret = inboundWebhookSecret();
  if (!secret) {
    req.log.warn("inbound email webhook called but no signing secret is configured");
    // 503, not 500: this is "not set up", and Resend's retry schedule will
    // redeliver once it is. A 4xx would make it give up.
    res.status(503).json({ error: "Inbound email is not configured on this server." });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);

  let payload: Record<string, unknown>;
  try {
    const { Webhook } = await import("svix");
    payload = new Webhook(secret).verify(rawBody, {
      "svix-id": req.headers["svix-id"] as string,
      "svix-timestamp": req.headers["svix-timestamp"] as string,
      "svix-signature": req.headers["svix-signature"] as string,
    }) as Record<string, unknown>;
  } catch (err) {
    req.log.warn({ err }, "inbound email webhook signature verification failed");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  const svixId = String(req.headers["svix-id"] ?? "");
  if (!svixId) { res.status(400).json({ error: "Missing svix-id" }); return; }

  const intake = await recordInboundEvent({ svixId, payload });

  if (intake.status === "duplicate") {
    // 200, deliberately. This is the retry working as designed, not an error,
    // and answering 4xx would make Resend keep retrying something we already
    // have.
    res.json({ ok: true, duplicate: true, reason: intake.reason });
    return;
  }
  if (intake.status === "ignored") {
    res.json({ ok: true, ignored: true, reason: intake.reason });
    return;
  }

  // Acknowledge first. The fetch runs after the response so a slow provider
  // cannot turn into a webhook timeout and a retry storm; if it fails the row
  // stays queryable in `failed` and can be retried by an operator.
  res.json({ ok: true, eventId: intake.eventId });

  if (intake.eventId) {
    void processInboundEvent(intake.eventId).catch((err) => {
      req.log.error({ err, eventId: intake.eventId }, "inbound email processing failed");
    });
  }
});

// ── Operator surfaces ───────────────────────────────────────────────────────

/** Whether inbound is wired up, and if not, exactly what is missing. */
router.get("/crm/email/inbound/status", requireCrmAuth("communications.read"), async (_req: Request, res: Response) => {
  const [pending] = await db.select({ n: sql<number>`count(*)` })
    .from(crmInboundEmailEvents).where(eq(crmInboundEmailEvents.state, "failed"));
  const [unmatched] = await db.select({ n: sql<number>`count(*)` })
    .from(crmUnmatchedEmails).where(eq(crmUnmatchedEmails.status, "pending"));

  res.json({
    configured: inboundConfigured(),
    reason: inboundBlockedReason(),
    replyDomain: inboundDomain(),
    failedEvents: Number(pending?.n ?? 0),
    unmatchedWaiting: Number(unmatched?.n ?? 0),
    note: inboundConfigured()
      ? "Replies come back to an address on the reply domain and are matched by the token in it."
      : "Until this is configured, a client replying by email reaches nothing. Nothing is lost silently — there is simply no intake yet.",
  });
});

/** Mail we received but could not place. Nothing here was discarded. */
router.get("/crm/email/unmatched", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : "pending";
  const rows = await db.select().from(crmUnmatchedEmails)
    .where(eq(crmUnmatchedEmails.status, status))
    .orderBy(desc(crmUnmatchedEmails.receivedAt))
    .limit(200);
  res.json({
    unmatched: rows,
    definition: "Received mail that matched no reply token and no known contact. It is kept here rather than discarded, because a real client writing from an unfamiliar address must not vanish.",
  });
});

/** Files an unmatched message against a contact, creating the conversation. */
router.post("/crm/email/unmatched/:id/attach", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const contactId = num((req.body as { contactId?: unknown })?.contactId);
  if (!id || !contactId) { res.status(400).json({ error: "Give both a message and a contact." }); return; }

  const [row] = await db.select().from(crmUnmatchedEmails)
    .where(and(eq(crmUnmatchedEmails.id, id), eq(crmUnmatchedEmails.status, "pending"))).limit(1);
  if (!row) { res.status(404).json({ error: "No pending message with that id." }); return; }

  const [lead] = await db.select({ id: crmLeads.id, name: crmLeads.name })
    .from(crmLeads).where(eq(crmLeads.id, contactId)).limit(1);
  if (!lead) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const conversation = await ensureConversation({
    channel: "email", provider: "resend",
    contactId: lead.id,
    externalAddress: row.fromAddress ?? `unknown-${row.id}@invalid`,
    externalName: lead.name,
    subject: row.subject,
  });
  if (!conversation) { res.status(500).json({ error: "The conversation could not be created." }); return; }

  const [message] = await db.insert(crmMessages).values({
    leadId: lead.id,
    conversationId: conversation.id,
    direction: "inbound",
    channel: "email",
    subject: row.subject,
    body: row.bodyText ?? null,
    fromNumber: row.fromAddress,
    toNumber: row.toAddress,
    providerMessageId: row.emailId,
    origin: "inbound",
    status: "received",
    metadata: { placedByHand: true, senderAuthenticated: false },
  }).returning();

  await refreshConversationRollups(conversation.id);
  await db.update(crmUnmatchedEmails).set({
    status: "attached",
    resolvedByStaffId: req.staffAuth?.staff.id ?? null,
    resolvedAt: new Date(),
    attachedConversationId: conversation.id,
  }).where(eq(crmUnmatchedEmails.id, id));

  await auditAction(req, "email.unmatched.attached", `unmatched:${id} contact:${contactId} conversation:${conversation.id}`);
  res.json({ conversation, messageId: message.id });
});

/**
 * Discards an unmatched message — spam, and nothing else.
 *
 * It is marked, not deleted, so "we threw this away" stays auditable.
 */
router.post("/crm/email/unmatched/:id/discard", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [updated] = await db.update(crmUnmatchedEmails).set({
    status: "discarded",
    resolvedByStaffId: req.staffAuth?.staff.id ?? null,
    resolvedAt: new Date(),
  }).where(and(eq(crmUnmatchedEmails.id, id), eq(crmUnmatchedEmails.status, "pending"))).returning();
  if (!updated) { res.status(404).json({ error: "No pending message with that id." }); return; }
  await auditAction(req, "email.unmatched.discarded", `unmatched:${id}`);
  res.json({ ok: true });
});

/** Addresses the CRM will refuse to email, and why. */
router.get("/crm/email/suppressions", requireCrmAuth("communications.read"), async (_req: Request, res: Response) => {
  const rows = await db.select().from(crmEmailSuppressions)
    .where(isNull(crmEmailSuppressions.releasedAt))
    .orderBy(desc(crmEmailSuppressions.suppressedAt)).limit(500);
  res.json({
    suppressions: rows,
    definitions: {
      bounce: "The address rejected mail permanently. Sending again will not arrive.",
      complaint: "Somebody at this address marked our mail as spam. Continuing to send damages deliverability for every other client too.",
      manual: "Somebody here added it deliberately.",
    },
  });
});

/** Adds an address by hand. */
router.post("/crm/email/suppressions", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const raw = (req.body as { address?: unknown })?.address;
  if (typeof raw !== "string" || !raw.includes("@")) {
    res.status(400).json({ error: "Give an email address." });
    return;
  }
  const address = extractAddress(raw);
  await suppressAddress({
    address, reason: "manual",
    detail: typeof (req.body as { detail?: unknown })?.detail === "string"
      ? (req.body as { detail: string }).detail : null,
    source: "staff",
  });
  await auditAction(req, "email.suppression.added", address);
  res.status(201).json({ ok: true, address });
});

/**
 * Releases an address.
 *
 * Deliberately owner-gated and audited. Releasing a complaint means mailing
 * somebody who told a mail provider we were spamming them, which risks every
 * other client's deliverability — that is a decision, not a housekeeping task.
 */
router.post("/crm/email/suppressions/release", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const raw = (req.body as { address?: unknown })?.address;
  if (typeof raw !== "string") { res.status(400).json({ error: "Give an email address." }); return; }
  const address = extractAddress(raw);

  const [row] = await db.select().from(crmEmailSuppressions)
    .where(and(eq(crmEmailSuppressions.address, address), isNull(crmEmailSuppressions.releasedAt))).limit(1);
  if (!row) { res.status(404).json({ error: "That address is not currently suppressed." }); return; }

  await db.update(crmEmailSuppressions).set({
    releasedAt: new Date(),
    releasedByStaffId: req.staffAuth?.staff.id ?? null,
    updatedAt: new Date(),
  }).where(eq(crmEmailSuppressions.id, row.id));

  await auditAction(req, "email.suppression.released", `${address} was:${row.reason}`);
  res.json({
    ok: true, address,
    warning: row.reason === "complaint"
      ? "This address had reported our mail as spam. Mailing it again can affect deliverability for every other client."
      : undefined,
  });
});

/** Retries an inbound message whose content fetch failed. */
router.post("/crm/email/inbound/events/:id/retry", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const result = await processInboundEvent(id);
  await auditAction(req, "email.inbound.retried", `event:${id} -> ${result.state}`);
  res.json(result);
});

/** Inbound events that are stuck, so "we lost an email" is answerable. */
router.get("/crm/email/inbound/failures", requireCrmAuth("communications.read"), async (_req: Request, res: Response) => {
  const rows = await db.select({
    id: crmInboundEmailEvents.id,
    emailId: crmInboundEmailEvents.emailId,
    state: crmInboundEmailEvents.state,
    attempts: crmInboundEmailEvents.attempts,
    lastError: crmInboundEmailEvents.lastError,
    receivedAt: crmInboundEmailEvents.receivedAt,
  }).from(crmInboundEmailEvents)
    .where(eq(crmInboundEmailEvents.state, "failed"))
    .orderBy(desc(crmInboundEmailEvents.receivedAt)).limit(100);
  res.json({
    failures: rows,
    note: "These messages arrived and were recorded, but their content could not be fetched from the provider. The provider keeps content for 30 days, so a retry can still succeed within that window.",
  });
});

export default router;
