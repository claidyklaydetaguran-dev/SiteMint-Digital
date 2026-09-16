// ── The canonical inbox ─────────────────────────────────────────────────────
//
// One implementation, backed by `crm_conversations`. Both the Inbox screen and
// the Conversations tab of the Communications Center use these routes, so they
// cannot drift into two different answers about the same customer.
//
// What this replaces: a per-request regrouping of the latest 200 messages in
// the whole database. That could not page (older conversations disappeared
// rather than paginating), could not be searched, and could not carry an
// owner, a status or a read position, because the thing being listed did not
// exist between requests.
//
// Three states are kept deliberately separate, because conflating them is how
// a shared inbox drops work:
//
//   read      one person has looked at it
//   assigned  one person has taken it on
//   resolved  the team is done with it
//
// Opening a conversation sets the first and neither of the others.
//
// These routes live here rather than in phone.ts — which holds the registered
// Twilio webhooks and is protected — because nothing here sends or receives a
// message.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db, crmConversations, crmConversationParticipants, crmConversationReads,
  crmMessageDrafts, crmMessages, crmLeads, crmStaff,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { attachConversationToContact, refreshConversationRollups } from "../lib/conversations.js";
import { deliveryFor, loadProviderDeliveries } from "../lib/emailProviderEvents.js";
import { emailDeliveryChip, type LocalSendOutcome } from "../lib/emailDeliveryState.js";
import { emailRef } from "../lib/emailRefs.js";

const router: IRouter = Router();

/**
 * `crm_messages.status` on an outbound email, in the delivery vocabulary.
 *
 * `uncertain` is the one that must survive the translation intact: the message
 * may be in somebody's inbox, and a thread that renders it as "not sent" is how
 * a second copy gets sent. Anything unrecognised — including every row written
 * before this column meant anything — reads as "no delivery record" rather than
 * being guessed into success.
 */
function localSendOutcome(status: string | null): LocalSendOutcome {
  switch (status) {
    case "sent": return "accepted";
    case "sending": return "in_flight";
    case "uncertain": return "uncertain";
    case "failed": return "refused";
    case "not_sent": return "not_sent";
    case "test_mode": return "test_mode";
    default: return "unknown";
  }
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const STATUSES = ["unassigned", "assigned", "awaiting_customer", "resolved"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (v: unknown): v is Status =>
  typeof v === "string" && (STATUSES as readonly string[]).includes(v);

/** The signed-in person, or null on the legacy shared bearer token. */
function me(req: Request) {
  return req.staffAuth?.staff ?? null;
}

/**
 * Read state belongs to a person. The shared token is not one, so anything
 * that depends on "who is asking" says so rather than inventing an answer.
 */
function requirePerson(req: Request, res: Response, action: string) {
  const person = me(req);
  if (!person) {
    res.status(403).json({
      error: `${action} records who did it, so it needs your own staff account rather than the shared token.`,
    });
    return null;
  }
  return person;
}

// ── Listing ─────────────────────────────────────────────────────────────────

/**
 * A page of conversations, newest activity first.
 *
 * Paginated with a keyset cursor on `(last_message_at, id)` rather than an
 * offset: an offset shifts under you every time a customer replies, which
 * silently skips or repeats rows while you are paging. Nothing falls off the
 * end — a quiet conversation from last year is on the last page, not missing.
 */
router.get("/crm/inbox/conversations", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = me(req);
  const limit = Math.min(Math.max(num(req.query["limit"]) ?? 25, 1), 100);
  const statusFilter = req.query["status"];
  const assignee = req.query["assignee"];
  const search = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  const cursor = typeof req.query["cursor"] === "string" ? req.query["cursor"] : "";

  const where = [];

  if (isStatus(statusFilter)) where.push(eq(crmConversations.status, statusFilter));
  else if (statusFilter === "open") {
    where.push(sql`${crmConversations.status} <> 'resolved'`);
  }

  if (assignee === "me" && person) where.push(eq(crmConversations.assignedToStaffId, person.id));
  else if (assignee === "unassigned") where.push(isNull(crmConversations.assignedToStaffId));
  else if (num(assignee)) where.push(eq(crmConversations.assignedToStaffId, num(assignee)!));

  // Search spans the customer's name and address, the subject, and message
  // bodies — so an old conversation is findable by something the person
  // actually remembers about it, not only by scrolling.
  if (search) {
    const like = `%${search}%`;
    const matchingIds = db.select({ id: crmMessages.conversationId })
      .from(crmMessages).where(ilike(crmMessages.body, like));
    const matchingContacts = db.select({ id: crmLeads.id })
      .from(crmLeads).where(or(ilike(crmLeads.name, like), ilike(crmLeads.company, like))!);
    where.push(or(
      ilike(crmConversations.subject, like),
      ilike(crmConversations.externalAddress, like),
      ilike(crmConversations.externalName, like),
      sql`${crmConversations.id} IN ${matchingIds}`,
      sql`${crmConversations.contactId} IN ${matchingContacts}`,
    )!);
  }

  // Keyset cursor: "<millis>:<id>".
  if (cursor) {
    const [ms, id] = cursor.split(":");
    const at = new Date(Number(ms));
    const cid = Number(id);
    if (Number.isFinite(at.getTime()) && Number.isFinite(cid)) {
      where.push(or(
        lt(crmConversations.lastMessageAt, at),
        and(eq(crmConversations.lastMessageAt, at), lt(crmConversations.id, cid)),
      )!);
    }
  }

  const rows = await db.select().from(crmConversations)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(crmConversations.lastMessageAt), desc(crmConversations.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last?.lastMessageAt
    ? `${last.lastMessageAt.getTime()}:${last.id}`
    : null;

  const enriched = await enrich(page, person?.id ?? null);

  res.json({
    conversations: enriched,
    nextCursor,
    hasMore,
    // A total across a keyset page is a separate question; answer it honestly
    // rather than implying the page length is the whole story.
    pageSize: limit,
    readStateAvailable: !!person,
    readStateReason: person ? null
      : "Unread counts are per person. Sign in with your own staff account to see yours.",
  });
});

/** Attaches contact, assignee, unread count and participants to a page of rows. */
async function enrich(rows: (typeof crmConversations.$inferSelect)[], staffId: number | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter((v): v is number => v != null))];
  const staffIds = [...new Set(rows.map((r) => r.assignedToStaffId).filter((v): v is number => v != null))];

  const [contacts, people, reads, lastMessages] = await Promise.all([
    contactIds.length
      ? db.select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company, email: crmLeads.email, phone: crmLeads.phone, smsOptOut: crmLeads.smsOptOut })
          .from(crmLeads).where(inArray(crmLeads.id, contactIds))
      : [],
    staffIds.length
      ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
          .from(crmStaff).where(inArray(crmStaff.id, staffIds))
      : [],
    staffId
      ? db.select().from(crmConversationReads).where(and(
          eq(crmConversationReads.staffId, staffId),
          inArray(crmConversationReads.conversationId, ids),
        ))
      : [],
    db.select({
      conversationId: crmMessages.conversationId,
      body: sql<string | null>`(array_agg(${crmMessages.body} ORDER BY ${crmMessages.createdAt} DESC))[1]`,
      direction: sql<string>`(array_agg(${crmMessages.direction} ORDER BY ${crmMessages.createdAt} DESC))[1]`,
    }).from(crmMessages)
      .where(inArray(crmMessages.conversationId, ids))
      .groupBy(crmMessages.conversationId),
  ]);

  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const staffMap = new Map(people.map((p) => [p.id, p.displayName]));
  const readMap = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));
  const previewMap = new Map(lastMessages.map((m) => [m.conversationId as number, m]));

  // Unread is counted per conversation against this person's read position.
  const unreadMap = new Map<number, number>();
  if (staffId) {
    const counts = await db.select({
      conversationId: crmMessages.conversationId,
      n: sql<number>`count(*)`,
    }).from(crmMessages)
      .where(and(
        inArray(crmMessages.conversationId, ids),
        eq(crmMessages.direction, "inbound"),
      ))
      .groupBy(crmMessages.conversationId);

    for (const row of counts) {
      const cid = row.conversationId as number;
      const since = readMap.get(cid);
      if (!since) { unreadMap.set(cid, Number(row.n)); continue; }
      const [after] = await db.select({ n: sql<number>`count(*)` })
        .from(crmMessages).where(and(
          eq(crmMessages.conversationId, cid),
          eq(crmMessages.direction, "inbound"),
          gt(crmMessages.createdAt, since),
        ));
      unreadMap.set(cid, Number(after?.n ?? 0));
    }
  }

  return rows.map((r) => ({
    ...r,
    contact: r.contactId ? contactMap.get(r.contactId) ?? null : null,
    assigneeName: r.assignedToStaffId ? staffMap.get(r.assignedToStaffId) ?? null : null,
    unread: staffId ? unreadMap.get(r.id) ?? 0 : 0,
    preview: previewMap.get(r.id)?.body ?? null,
    previewDirection: previewMap.get(r.id)?.direction ?? null,
  }));
}

// ── One conversation ────────────────────────────────────────────────────────

/** A conversation with a page of its messages, oldest-last. */
router.get("/crm/inbox/conversations/:id", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }
  const person = me(req);

  const [conversation] = await db.select().from(crmConversations)
    .where(eq(crmConversations.id, id)).limit(1);
  if (!conversation) { res.status(404).json({ error: "Not found." }); return; }

  const limit = Math.min(Math.max(num(req.query["limit"]) ?? 100, 1), 200);
  const before = num(req.query["before"]);

  const messages = await db.select().from(crmMessages)
    .where(and(
      eq(crmMessages.conversationId, id),
      ...(before ? [lt(crmMessages.id, before)] : []),
    ))
    .orderBy(desc(crmMessages.createdAt), desc(crmMessages.id))
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  const senderIds = [...new Set(page.map((m) => m.sentByStaffId).filter((v): v is number => v != null))];
  const senders = senderIds.length
    ? await db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
        .from(crmStaff).where(inArray(crmStaff.id, senderIds))
    : [];
  const senderMap = new Map(senders.map((s) => [s.id, s.displayName]));

  const [participants, enriched, draft] = await Promise.all([
    db.select().from(crmConversationParticipants)
      .where(eq(crmConversationParticipants.conversationId, id)),
    enrich([conversation], person?.id ?? null),
    person
      ? db.select().from(crmMessageDrafts).where(and(
          eq(crmMessageDrafts.conversationId, id),
          eq(crmMessageDrafts.staffId, person.id),
        )).limit(1)
      : Promise.resolve([]),
  ]);

  // What the provider has said about the outbound email on this thread. The
  // tag path matters as much as the id: a send whose outcome was never learned
  // has no provider id, and those are the messages a delivery report is worth
  // the most for.
  const outbound = page.filter((m) => m.direction === "outbound" && m.channel === "email");
  const deliveries = await loadProviderDeliveries({
    providerIds: outbound.map((m) => m.providerMessageId),
    refs: outbound.map((m) => emailRef("message", m.id)),
  });

  res.json({
    conversation: enriched[0],
    participants,
    draft: draft[0] ?? null,
    messages: page.map((m) => ({
      ...m,
      // A null sender is not a gap to be filled in — `origin` says whether it
      // was inbound, automated, or history that never recorded one.
      sentByName: m.sentByStaffId
        ? senderMap.get(m.sentByStaffId) ?? m.sentByLabel ?? null
        : m.sentByLabel ?? null,
      // Null on anything that is not an outbound email: an inbound message and
      // a text message have no delivery of ours to describe, and inventing an
      // "n/a" state for them would be a fifth word meaning nothing.
      delivery: m.direction === "outbound" && m.channel === "email"
        ? emailDeliveryChip(
            {
              outcome: localSendOutcome(m.status),
              at: m.createdAt,
              detail: typeof (m.metadata as Record<string, unknown> | null)?.["reason"] === "string"
                ? (m.metadata as Record<string, string>)["reason"]
                : null,
            },
            deliveryFor(deliveries, m.providerMessageId, emailRef("message", m.id)),
          )
        : null,
    })),
    hasMoreMessages: hasMore,
    olderCursor: hasMore && page[0] ? page[0].id : null,
  });
});

// ── Read position ───────────────────────────────────────────────────────────

/**
 * Marks a conversation read for the signed-in person, as of now.
 *
 * Reading is not handling. This deliberately does not assign, resolve, or
 * change status in any way.
 */
router.post("/crm/inbox/conversations/:id/read", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Marking a conversation read");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const [newest] = await db.select({ id: crmMessages.id }).from(crmMessages)
    .where(eq(crmMessages.conversationId, id))
    .orderBy(desc(crmMessages.createdAt)).limit(1);

  const now = new Date();
  await db.insert(crmConversationReads)
    .values({ staffId: person.id, conversationId: id, lastReadAt: now, lastReadMessageId: newest?.id ?? null })
    .onConflictDoUpdate({
      target: [crmConversationReads.staffId, crmConversationReads.conversationId],
      set: { lastReadAt: now, lastReadMessageId: newest?.id ?? null, updatedAt: now },
    });

  res.json({ ok: true, conversationId: id, lastReadAt: now });
});

/** Puts a conversation back on this person's pile. */
router.post("/crm/inbox/conversations/:id/unread", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Marking a conversation unread");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }
  await db.delete(crmConversationReads).where(and(
    eq(crmConversationReads.staffId, person.id),
    eq(crmConversationReads.conversationId, id),
  ));
  res.json({ ok: true, conversationId: id });
});

/** Marks many read in one request — what "mark all read" needs. */
router.post("/crm/inbox/read", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Marking conversations read");
  if (!person) return;
  const raw = (req.body as { conversationIds?: unknown })?.conversationIds;
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter(Number.isFinite))];
  if (ids.length === 0) { res.status(400).json({ error: "No conversations given." }); return; }
  if (ids.length > 500) { res.status(413).json({ error: "Too many conversations at once." }); return; }

  const now = new Date();
  await db.insert(crmConversationReads)
    .values(ids.map((conversationId) => ({ staffId: person.id, conversationId, lastReadAt: now })))
    .onConflictDoUpdate({
      target: [crmConversationReads.staffId, crmConversationReads.conversationId],
      set: { lastReadAt: now, updatedAt: now },
    });
  res.json({ ok: true, marked: ids.length, lastReadAt: now });
});

/** Who else has opened this, so you can see a colleague is already in it. */
router.get("/crm/inbox/conversations/:id/readers", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }
  const reads = await db.select().from(crmConversationReads)
    .where(eq(crmConversationReads.conversationId, id));
  if (reads.length === 0) { res.json({ readers: [] }); return; }
  const people = await db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
    .from(crmStaff).where(inArray(crmStaff.id, reads.map((r) => r.staffId)));
  const nameOf = new Map(people.map((p) => [p.id, p.displayName]));
  res.json({
    readers: reads
      .map((r) => ({ staffId: r.staffId, name: nameOf.get(r.staffId) ?? null, lastReadAt: r.lastReadAt }))
      .sort((a, b) => b.lastReadAt.getTime() - a.lastReadAt.getTime()),
  });
});

// ── Handling state ──────────────────────────────────────────────────────────

/**
 * Takes a conversation on, hands it to somebody, or puts it back.
 *
 * Assignment is a claim of responsibility, which is why it is a separate act
 * from reading and is audited.
 */
router.post("/crm/inbox/conversations/:id/assign", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Assigning a conversation");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const body = req.body as { staffId?: unknown };
  const target = body.staffId === null ? null : num(body.staffId) ?? person.id;

  if (target != null) {
    const [exists] = await db.select({ id: crmStaff.id, status: crmStaff.status })
      .from(crmStaff).where(eq(crmStaff.id, target)).limit(1);
    if (!exists) { res.status(404).json({ error: "No such staff account." }); return; }
    if (exists.status === "disabled") {
      res.status(409).json({ error: "That account is disabled, so work cannot be assigned to it." });
      return;
    }
  }

  const [updated] = await db.update(crmConversations).set({
    assignedToStaffId: target,
    assignedAt: target ? new Date() : null,
    // Taking something on moves it out of "nobody has this"; handing it back
    // returns it there — unless it is already resolved, which assignment does
    // not undo.
    status: sql`CASE WHEN ${crmConversations.status} = 'resolved' THEN ${crmConversations.status}
                     WHEN ${target === null ? sql`TRUE` : sql`FALSE`} THEN 'unassigned'
                     ELSE 'assigned' END`,
    updatedAt: new Date(),
  }).where(eq(crmConversations.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, target ? "conversation.assigned" : "conversation.unassigned",
    `conversation:${id}${target ? ` staff:${target}` : ""}`);
  res.json({ conversation: updated });
});

/** Moves a conversation between handling states. */
router.patch("/crm/inbox/conversations/:id", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Changing how a conversation is handled");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if ("status" in body) {
    if (!isStatus(body["status"])) {
      res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
      return;
    }
    updates["status"] = body["status"];
    updates["resolvedAt"] = body["status"] === "resolved" ? new Date() : null;
    updates["resolvedByStaffId"] = body["status"] === "resolved" ? person.id : null;
  }
  if ("subject" in body) {
    updates["subject"] = typeof body["subject"] === "string" && body["subject"] ? body["subject"] : null;
  }

  const [updated] = await db.update(crmConversations).set(updates)
    .where(eq(crmConversations.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }

  if (updates["status"]) {
    await auditAction(req, `conversation.${String(updates["status"])}`, `conversation:${id}`);
  }
  res.json({ conversation: updated });
});

/**
 * Attaches an unidentified conversation to a contact.
 *
 * This is how the quarantined and address-only conversations get resolved by a
 * person, rather than by the migration guessing.
 */
router.post("/crm/inbox/conversations/:id/attach", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const contactId = num((req.body as { contactId?: unknown })?.contactId);
  if (!id || !contactId) { res.status(400).json({ error: "Give both a conversation and a contact." }); return; }

  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads)
    .where(eq(crmLeads.id, contactId)).limit(1);
  if (!lead) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const resultId = await attachConversationToContact(id, contactId);
  await auditAction(req, "conversation.attached", `conversation:${id} contact:${contactId}`);
  const [conversation] = await db.select().from(crmConversations)
    .where(eq(crmConversations.id, resultId)).limit(1);
  res.json({ conversation, mergedInto: resultId !== id ? resultId : null });
});

// ── Drafts ──────────────────────────────────────────────────────────────────

/** Saves this person's unsent reply. Switching threads no longer loses it. */
router.put("/crm/inbox/conversations/:id/draft", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Saving a draft");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const body = req.body as { body?: unknown; subject?: unknown };
  const text = typeof body.body === "string" ? body.body : "";
  const subject = typeof body.subject === "string" ? body.subject : null;

  if (text.trim() === "" && !subject) {
    await db.delete(crmMessageDrafts).where(and(
      eq(crmMessageDrafts.conversationId, id),
      eq(crmMessageDrafts.staffId, person.id),
    ));
    res.json({ ok: true, draft: null });
    return;
  }

  const now = new Date();
  const [draft] = await db.insert(crmMessageDrafts)
    .values({ conversationId: id, staffId: person.id, body: text, subject })
    .onConflictDoUpdate({
      target: [crmMessageDrafts.conversationId, crmMessageDrafts.staffId],
      set: { body: text, subject, updatedAt: now },
    }).returning();
  res.json({ ok: true, draft });
});

router.delete("/crm/inbox/conversations/:id/draft", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = requirePerson(req, res, "Discarding a draft");
  if (!person) return;
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid conversation." }); return; }
  await db.delete(crmMessageDrafts).where(and(
    eq(crmMessageDrafts.conversationId, id),
    eq(crmMessageDrafts.staffId, person.id),
  ));
  res.json({ ok: true });
});

// ── Totals ──────────────────────────────────────────────────────────────────

/** Counts for the nav badges, in one query each rather than one per thread. */
router.get("/crm/inbox/summary", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const person = me(req);

  const byStatus = await db.select({
    status: crmConversations.status,
    n: sql<number>`count(*)`,
  }).from(crmConversations).groupBy(crmConversations.status);

  const [needsReview] = await db.select({ n: sql<number>`count(*)` })
    .from(crmConversations).where(eq(crmConversations.needsReview, true));

  let unreadConversations = 0;
  if (person) {
    const [row] = await db.select({ n: sql<number>`count(*)` })
      .from(crmConversations)
      .where(sql`EXISTS (
        SELECT 1 FROM ${crmMessages} m
        WHERE m.conversation_id = ${crmConversations.id}
          AND m.direction = 'inbound'
          AND m.created_at > COALESCE(
            (SELECT r.last_read_at FROM ${crmConversationReads} r
              WHERE r.conversation_id = ${crmConversations.id} AND r.staff_id = ${person.id}),
            '-infinity'::timestamptz)
      )`);
    unreadConversations = Number(row?.n ?? 0);
  }

  res.json({
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
    needsReview: Number(needsReview?.n ?? 0),
    unreadConversations,
    readStateAvailable: !!person,
    definitions: {
      unread: "Conversations with an inbound message newer than the last time you opened them. Yours, not the team's.",
      assigned: "Somebody has taken responsibility. Separate from whether anyone has read it.",
      resolved: "The team is done with it. Reading or replying does not set this.",
      needsReview: "Migrated history that could not be attributed to a contact, kept for a person to decide.",
    },
  });
});

// ── Maintenance ─────────────────────────────────────────────────────────────

/**
 * Runs the history backfill. Idempotent, so it is safe to re-run, and it
 * reports what it did rather than claiming success.
 */
router.post("/crm/inbox/backfill", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const { backfillConversations } = await import("../lib/conversations.js");
  const result = await backfillConversations();
  await auditAction(req, "conversation.backfill",
    `scanned:${result.scanned} linked:${result.linked} quarantined:${result.quarantined}`);
  res.json({
    ...result,
    note: result.quarantined > 0
      ? `${result.quarantined} message(s) had neither a contact nor a counterparty address. They are kept in a conversation flagged for review rather than being attached on a guess.`
      : "Every message was attributable to a contact or an address.",
  });
});

export default router;
