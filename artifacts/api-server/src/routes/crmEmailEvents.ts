// ── Delivery and engagement events ──────────────────────────────────────────
//
// The webhook Resend calls to say what happened to mail we SENT, plus the two
// operator surfaces that make it answerable: what has arrived, and what is
// stuck.
//
// It lives in its own file rather than in crm.ts — where it used to sit next
// to the legacy campaign routes — because it is not a campaign feature. Every
// CRM email ends up here: a one-off note to a contact, a support reply, a
// calendar invitation, a staff invitation, a reminder, a marketing send. It
// also keeps its signing secret, its failure modes and its retry semantics
// apart from the INBOUND webhook next door, which receives mail somebody sent
// US and has its own endpoint and its own secret.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, crmEmailProviderEvents, CRM_EMAIL_EVENT_STATES } from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { verifySvixSignature } from "../lib/svixSignature.js";
import {
  DELIVERY_WEBHOOK_SECRET_VAR, deliveryWebhookSecret, emailEventStatus,
  processProviderEvent, recordProviderEvent,
} from "../lib/emailProviderEvents.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// ── The webhook ─────────────────────────────────────────────────────────────

/**
 * Every provider event about mail we sent.
 *
 * Unauthenticated in the session sense — the signature IS the authentication,
 * verified against the RAW bytes (`app.ts` mounts `express.raw` for this path)
 * because the signature covers the exact bytes and any re-serialisation
 * changes them.
 *
 * The answer codes are a contract with the provider's retry machinery, and
 * each one is deliberate:
 *
 *   200  stored — including a duplicate, which is the retry working as
 *        designed, and including an event we do not act on. Answering 4xx to
 *        a duplicate makes the provider keep retrying something we already
 *        have.
 *   400  the signature or the body is not acceptable. This is the only case
 *        where the provider should give up, because repeating it cannot help.
 *   503  this server is not configured to verify. Not a refusal of the event:
 *        the provider retries for about a day, so an endpoint enabled within
 *        that window still receives everything it missed.
 *   500  the event could not be STORED. The provider must retry, because
 *        nothing here has it.
 *
 * Interpretation runs after the row is safely written and never changes the
 * answer: if it fails, the row stays and the scheduler's sweep comes back for
 * it. That is the whole point of storing first — the provider's retries are
 * finite, and ours are not.
 */
router.post("/crm/webhooks/resend", async (req: Request, res: Response) => {
  const secret = deliveryWebhookSecret();
  if (!secret) {
    req.log.warn(`${DELIVERY_WEBHOOK_SECRET_VAR} is not set — the delivery-event webhook cannot verify anything`);
    res.status(503).json({
      error: "Delivery events are not configured on this server.",
      variable: DELIVERY_WEBHOOK_SECRET_VAR,
    });
    return;
  }

  // Not a Buffer means the raw-body mount did not run for this request — a
  // wrong content type, or a mounting mistake. Verifying a re-serialised body
  // would fail anyway; saying so is more useful than a signature error.
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Expected a raw application/json body." });
    return;
  }

  const verdict = verifySvixSignature({
    secret,
    body: req.body,
    headers: {
      id: req.headers["svix-id"],
      timestamp: req.headers["svix-timestamp"],
      signature: req.headers["svix-signature"],
    },
  });

  if (!verdict.ok) {
    if (verdict.failure === "unusable_secret" || verdict.failure === "no_secret") {
      req.log.error({ failure: verdict.failure }, "delivery webhook secret is not usable");
      res.status(503).json({ error: verdict.message, variable: DELIVERY_WEBHOOK_SECRET_VAR });
      return;
    }
    req.log.warn({ failure: verdict.failure }, "delivery webhook signature rejected");
    res.status(400).json({ error: verdict.message, reason: verdict.failure });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(req.body.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "The signed body is not a JSON object." });
    return;
  }
  if (typeof payload["type"] !== "string") {
    res.status(400).json({ error: "The event has no type." });
    return;
  }

  const intake = await recordProviderEvent({ svixId: verdict.id, payload });

  if (intake.status === "duplicate") {
    res.json({ ok: true, duplicate: true, eventId: intake.eventId, reason: intake.reason });
    return;
  }
  if (intake.status === "ignored") {
    res.json({ ok: true, ignored: true, eventId: intake.eventId, reason: intake.reason });
    return;
  }

  // Stored. Interpreting it is this server's problem from here on.
  let processing: Awaited<ReturnType<typeof processProviderEvent>> | null = null;
  try {
    processing = await processProviderEvent(intake.eventId);
  } catch (err) {
    req.log.error({ err, eventId: intake.eventId }, "delivery event stored but could not be interpreted");
  }

  res.json({
    ok: true,
    eventId: intake.eventId,
    type: intake.facts.eventType,
    processing: processing?.state ?? "received",
    match: processing?.matchStatus ?? null,
    matched: processing?.matched ?? [],
  });
});

// ── Operator surfaces ───────────────────────────────────────────────────────

/** Whether events are arriving, what has arrived, and what is stuck. */
router.get("/crm/email/events/status", requireCrmAuth("communications.read"), async (_req: Request, res: Response) => {
  res.json(await emailEventStatus());
});

/**
 * The events themselves, newest first.
 *
 * This is what makes the activation checklist checkable: a signed test event
 * appears here within seconds, a tampered one never does, and a replay adds no
 * row. `matchedRecords` says which CRM record each one reached and what it
 * changed, so "the webhook is live but nothing is updating" is answerable
 * without a database console.
 */
router.get("/crm/email/events", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(num(req.query["limit"]) ?? 50, 1), 200);
  const state = typeof req.query["state"] === "string"
    && (CRM_EMAIL_EVENT_STATES as readonly string[]).includes(req.query["state"])
    ? req.query["state"] as string
    : undefined;
  const unmatchedOnly = req.query["unmatched"] === "true";

  const filters = [
    ...(state ? [eq(crmEmailProviderEvents.state, state)] : []),
    ...(unmatchedOnly ? [eq(crmEmailProviderEvents.matchStatus, "unmatched")] : []),
  ];

  const rows = await db.select({
    id: crmEmailProviderEvents.id,
    eventType: crmEmailProviderEvents.eventType,
    providerEmailId: crmEmailProviderEvents.providerEmailId,
    crmRef: crmEmailProviderEvents.crmRef,
    recipient: crmEmailProviderEvents.recipient,
    senderDomain: crmEmailProviderEvents.senderDomain,
    occurredAt: crmEmailProviderEvents.occurredAt,
    clickLink: crmEmailProviderEvents.clickLink,
    detail: crmEmailProviderEvents.detail,
    state: crmEmailProviderEvents.state,
    attempts: crmEmailProviderEvents.attempts,
    lastError: crmEmailProviderEvents.lastError,
    matchStatus: crmEmailProviderEvents.matchStatus,
    matchedRecords: crmEmailProviderEvents.matchedRecords,
    receivedAt: crmEmailProviderEvents.receivedAt,
    processedAt: crmEmailProviderEvents.processedAt,
  }).from(crmEmailProviderEvents)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(crmEmailProviderEvents.id))
    .limit(limit);

  res.json({
    events: rows,
    definitions: {
      occurredAt: "When the provider says the event happened — its own timestamp, not when we received it.",
      matchStatus: "Whether the event reached a record here. `unmatched` is normal in small numbers and is not an error.",
      state: "Where this event is in OUR processing, never in the mail's delivery.",
    },
  });
});

/**
 * Interprets a stored event again.
 *
 * Nothing is re-verified and nothing is asked of the provider: the signature
 * was checked when the row was written, and the payload has been kept since.
 * This is the manual half of the sweep the scheduler runs, for an event whose
 * interpretation failed for a reason somebody has now fixed.
 */
router.post("/crm/email/events/:id/retry", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }

  const [row] = await db.select({ id: crmEmailProviderEvents.id })
    .from(crmEmailProviderEvents).where(eq(crmEmailProviderEvents.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "No event with that id." }); return; }

  // A retry asked for by a person is due NOW, whatever backoff the last
  // attempt set — otherwise the button does nothing and says it worked. This
  // covers both an interpretation that failed and one that is waiting for a
  // send to settle, which is the common case an operator actually hits.
  await db.update(crmEmailProviderEvents)
    .set({ nextAttemptAt: null })
    .where(and(
      eq(crmEmailProviderEvents.id, id),
      inArray(crmEmailProviderEvents.state, ["received", "failed"]),
    ));

  const result = await processProviderEvent(id);
  await auditAction(req, "email.event.retried", `event:${id} -> ${result.state}`);
  res.json(result);
});

export default router;
