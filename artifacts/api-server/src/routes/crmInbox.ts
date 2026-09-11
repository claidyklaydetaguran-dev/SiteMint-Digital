// ── Inbox read state ────────────────────────────────────────────────────────
//
// Real unread counts for the shared customer inbox.
//
// These routes live here rather than beside the thread listing in phone.ts
// because that file carries the registered Twilio webhooks and is protected.
// Nothing here sends, receives or touches a message — it only records which
// conversations a person has opened — so it is a clean addition rather than a
// reason to edit a protected file.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, crmMessages, crmThreadReads } from "@workspace/db";
import { requireCrmAuth } from "../lib/staffAuth.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Unread counts for the signed-in person, by conversation.
 *
 * A conversation is unread to the extent it has inbound messages newer than
 * the last time this person opened it. A conversation this person has never
 * opened counts all of its inbound messages, which is the honest answer.
 *
 * Requires a staff session: read state belongs to a person, and the legacy
 * shared bearer token is not one. It reports that plainly instead of inventing
 * a number or returning zeros that would read as "all caught up".
 */
router.get("/crm/inbox/unread", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) {
    res.json({
      available: false,
      reason: "Unread counts are per person. Sign in with your own staff account to see yours.",
      threads: [], total: 0,
    });
    return;
  }

  const reads = await db.select().from(crmThreadReads).where(eq(crmThreadReads.staffId, me.id));
  const readAt = new Map(reads.map((r) => [r.leadId, r.lastReadAt]));

  // Count inbound messages per lead, then subtract what this person has seen.
  // Done as one grouped query rather than per-thread so the cost does not grow
  // with the number of conversations.
  const rows = await db
    .select({
      leadId: crmMessages.leadId,
      total: sql<number>`count(*)`,
      newest: sql<Date>`max(${crmMessages.createdAt})`,
    })
    .from(crmMessages)
    .where(and(eq(crmMessages.direction, "inbound"), isNotNull(crmMessages.leadId)))
    .groupBy(crmMessages.leadId);

  const seenLeadIds = [...readAt.keys()];
  const seenCounts = new Map<number, number>();
  if (seenLeadIds.length > 0) {
    // For leads this person has opened, count only what arrived afterwards.
    for (const leadId of seenLeadIds) {
      const since = readAt.get(leadId)!;
      const [row] = await db
        .select({ n: sql<number>`count(*)` })
        .from(crmMessages)
        .where(and(
          eq(crmMessages.direction, "inbound"),
          eq(crmMessages.leadId, leadId),
          gt(crmMessages.createdAt, since),
        ));
      seenCounts.set(leadId, Number(row?.n ?? 0));
    }
  }

  const threads = rows
    .map((r) => {
      const leadId = r.leadId as number;
      const unread = readAt.has(leadId) ? seenCounts.get(leadId) ?? 0 : Number(r.total);
      return { leadId, unread, newestInboundAt: r.newest, everOpened: readAt.has(leadId) };
    })
    .filter((t) => t.unread > 0);

  res.json({
    available: true,
    staffId: me.id,
    threads,
    total: threads.reduce((sum, t) => sum + t.unread, 0),
    definition: "Inbound messages that arrived after you last opened the conversation. This is your own count, not the team's.",
  });
});

/** Marks one conversation read for the signed-in person, as of now. */
router.post("/crm/inbox/threads/:leadId/read", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) {
    res.status(403).json({
      error: "Marking a conversation read records who read it, so it needs your own staff account.",
    });
    return;
  }
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const now = new Date();
  await db.insert(crmThreadReads)
    .values({ staffId: me.id, leadId, lastReadAt: now })
    .onConflictDoUpdate({
      target: [crmThreadReads.staffId, crmThreadReads.leadId],
      set: { lastReadAt: now, updatedAt: now },
    });

  res.json({ ok: true, leadId, lastReadAt: now });
});

/**
 * Marks several conversations read at once — what "mark all read" needs, done
 * in one round trip instead of one request per thread.
 */
router.post("/crm/inbox/read", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) {
    res.status(403).json({ error: "Marking conversations read needs your own staff account." });
    return;
  }
  const raw = (req.body as { leadIds?: unknown })?.leadIds;
  const leadIds = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter(Number.isFinite))];
  if (leadIds.length === 0) { res.status(400).json({ error: "No conversations given." }); return; }
  if (leadIds.length > 500) { res.status(413).json({ error: "Too many conversations at once." }); return; }

  const now = new Date();
  await db.insert(crmThreadReads)
    .values(leadIds.map((leadId) => ({ staffId: me.id, leadId, lastReadAt: now })))
    .onConflictDoUpdate({
      target: [crmThreadReads.staffId, crmThreadReads.leadId],
      set: { lastReadAt: now, updatedAt: now },
    });

  res.json({ ok: true, marked: leadIds.length, lastReadAt: now });
});

/** Undoes a read, so a conversation can be put back on somebody's pile. */
router.post("/crm/inbox/threads/:leadId/unread", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const me = req.staffAuth?.staff;
  if (!me) {
    res.status(403).json({ error: "Marking a conversation unread needs your own staff account." });
    return;
  }
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid conversation." }); return; }

  await db.delete(crmThreadReads).where(and(
    eq(crmThreadReads.staffId, me.id),
    eq(crmThreadReads.leadId, leadId),
  ));
  res.json({ ok: true, leadId });
});

/**
 * Who else on the team has opened this conversation, and when.
 *
 * This is the thing a shared inbox actually needs and the session-state
 * version could never provide: before replying, you can see that somebody
 * else has already been in here.
 */
router.get("/crm/inbox/threads/:leadId/readers", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid conversation." }); return; }

  const { crmStaff } = await import("@workspace/db");
  const reads = await db.select().from(crmThreadReads).where(eq(crmThreadReads.leadId, leadId));
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

export default router;
