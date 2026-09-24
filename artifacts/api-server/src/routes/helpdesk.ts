import { Router, type IRouter, type Request } from "express";
import { eq, desc, ilike, or, and, sql } from "drizzle-orm";
import { requireCrmAuth, auditAction, staffCan } from "../lib/staffAuth.js";
import type { Permission } from "../lib/staffPermissions.js";
import { db } from "@workspace/db";
import {
  helpdeskContactsTable,
  helpdeskAgentsTable,
  helpdeskTicketsTable,
  helpdeskMessagesTable,
} from "@workspace/db";
import {
  ListHelpdeskTicketsQueryParams,
  CreateHelpdeskTicketBody,
  GetHelpdeskTicketParams,
  UpdateHelpdeskTicketParams,
  UpdateHelpdeskTicketBody,
  ListHelpdeskMessagesParams,
  CreateHelpdeskMessageParams,
  CreateHelpdeskMessageBody,
  ListHelpdeskContactsQueryParams,
  CreateHelpdeskContactBody,
  GetHelpdeskContactParams,
  UpdateHelpdeskContactParams,
  UpdateHelpdeskContactBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Authorization ───────────────────────────────────────────────────────────
//
// These are the LEGACY helpdesk routes. They predate the M4 Support feature
// (routes/crmSupport.ts) and their four tables are empty, but the router is
// mounted in routes/index.ts and every route below is therefore live and
// reachable. "No screen calls it" is not an access-control boundary, so the
// routes are gated on their merits rather than on who currently visits them.
//
// Until 2026-09-12 the whole router shared one `requireCrmAuth()` called with
// NO permission, which asserted only "some CRM staff member is signed in".
// Every route — reading the customer list, reassigning a ticket, writing into
// a ticket thread — was reachable by the most restricted role in the CRM.
// Each route now names the permission it actually needs, matching the
// vocabulary crmSupport.ts already uses:
//
//   support.read   reading tickets, threads, contacts, agents, counts
//   support.write  creating/editing tickets, contacts, and thread messages
//   support.assign deciding who is answerable for a ticket (a second check
//                  inside the handler, because it is only reached when the
//                  request actually names an assignee)
//   communications.send  recording a customer-VISIBLE message, as opposed to
//                  an internal note. Same line crmSupport.ts draws, drawn the
//                  same way, so the two support surfaces cannot disagree about
//                  who may talk to a client.
//
// `requireCrmAuth` is written inline on each route rather than hoisted into a
// shared const: lib/routeSecurity.ts re-derives the security class of every
// mutating route by parsing THIS source, and it reads the middleware chain
// literally. A hoisted alias would make these routes parse as unprotected.
//
// Nothing here is a customer-facing or webhook surface. There is no customer
// credential anywhere in the helpdesk spec (lib/api-spec/openapi.yaml) and no
// signature check, so staff authentication is the correct mechanism for all
// twelve routes — none of them is a customer path that staff auth would be
// wrongly stapled onto.

/**
 * Who is acting, from the SESSION — never from the request. Mirrors
 * `actor()` in crmSupport.ts.
 *
 * The legacy shared bearer carries no person, so it resolves to "admin": the
 * gap is recorded honestly rather than being filled in with whatever the
 * caller claimed.
 */
function actor(req: Request): { id: number | null; label: string } {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName || s?.email || "admin" };
}

/**
 * A second, record-level permission check that still works mid-cutover.
 *
 * Identical in shape and reasoning to `canOrLegacy` in crmSupport.ts: a
 * request that reached the handler with no `staffAuth` came in on the legacy
 * shared bearer, which already had unrestricted access, so refusing it here
 * would be a new denial rather than a closed hole. Delete the first line when
 * CRM_LEGACY_BEARER_ENABLED=false retires that path.
 */
function canOrLegacy(req: Request, permission: Permission): boolean {
  if (!req.staffAuth) return true;
  return staffCan(req, permission);
}

/**
 * The signed-in person's row in `helpdesk_agents`, matched on email.
 *
 * `helpdesk_agents` is a separate identity universe from `crm_staff` — there
 * is no foreign key between them — so "my queue" can only be resolved by
 * email, and resolves to nothing when the signed-in person has no agent row.
 *
 * This replaces a hardcoded `assigneeId = 1`. That constant meant the "mine"
 * view and the "assigned to me" count showed AGENT 1's workload to every
 * caller: one person's queue presented to everybody else as their own.
 * Returning null (and therefore an empty queue) is the honest answer for
 * somebody who is not an agent.
 */
async function sessionAgentId(req: Request): Promise<number | null> {
  const email = req.staffAuth?.staff.email;
  if (!email) return null;
  const [agent] = await db
    .select({ id: helpdeskAgentsTable.id })
    .from(helpdeskAgentsTable)
    .where(sql`lower(${helpdeskAgentsTable.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return agent?.id ?? null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ticketWithContact(
  ticket: typeof helpdeskTicketsTable.$inferSelect,
  contact: typeof helpdeskContactsTable.$inferSelect | undefined,
  assignee: typeof helpdeskAgentsTable.$inferSelect | undefined
) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    channel: ticket.channel,
    ticketNumber: ticket.ticketNumber,
    contactId: ticket.contactId,
    contactName: contact?.name ?? "Unknown",
    contactInitials: contact?.initials ?? "?",
    contactAvatarColor: contact?.avatarColor ?? "#6366f1",
    assigneeId: ticket.assigneeId ?? null,
    assigneeName: assignee?.name ?? null,
    assigneeInitials: assignee?.initials ?? null,
    teamName: ticket.teamName ?? null,
    tags: ticket.tags ?? [],
    firstReplySlaBreached: ticket.firstReplySlaBreached,
    resolutionSlaDeadline: ticket.resolutionSlaDeadline?.toISOString() ?? null,
    snippetText: ticket.snippetText ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
  };
}

// ── Tickets ──────────────────────────────────────────────────────────────────

router.get("/helpdesk/tickets", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const params = ListHelpdeskTicketsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { status, priority, assigneeId, search, view } = params.data;

  const conditions = [];
  if (status) conditions.push(eq(helpdeskTicketsTable.status, status));
  if (priority) conditions.push(eq(helpdeskTicketsTable.priority, priority));
  if (assigneeId != null) conditions.push(eq(helpdeskTicketsTable.assigneeId, assigneeId));
  if (view === "mine") {
    // "Mine" means the signed-in person's queue. It used to mean agent 1's.
    const mine = await sessionAgentId(req);
    if (mine === null) {
      res.json([]);
      return;
    }
    conditions.push(eq(helpdeskTicketsTable.assigneeId, mine));
  } else if (view === "unassigned") {
    conditions.push(sql`${helpdeskTicketsTable.assigneeId} IS NULL`);
  } else if (view === "snoozed") {
    conditions.push(eq(helpdeskTicketsTable.status, "snoozed"));
  }

  let tickets;
  if (search) {
    tickets = await db
      .select()
      .from(helpdeskTicketsTable)
      .where(
        and(...conditions, ilike(helpdeskTicketsTable.subject, `%${search}%`))
      )
      .orderBy(desc(helpdeskTicketsTable.updatedAt));
  } else {
    tickets = await db
      .select()
      .from(helpdeskTicketsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(helpdeskTicketsTable.updatedAt));
  }

  const contactIds = [...new Set(tickets.map((t) => t.contactId))];
  const assigneeIds = [...new Set(tickets.map((t) => t.assigneeId).filter((id): id is number => id != null))];

  const contacts = contactIds.length
    ? await db.select().from(helpdeskContactsTable).where(
        sql`${helpdeskContactsTable.id} = ANY(${sql.raw(`ARRAY[${contactIds.join(",")}]::int[]`)})`
      )
    : [];

  const agents = assigneeIds.length
    ? await db.select().from(helpdeskAgentsTable).where(
        sql`${helpdeskAgentsTable.id} = ANY(${sql.raw(`ARRAY[${assigneeIds.join(",")}]::int[]`)})`
      )
    : [];

  const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));

  res.json(tickets.map((t) => ticketWithContact(t, contactMap[t.contactId], t.assigneeId ? agentMap[t.assigneeId] : undefined)));
});

router.post("/helpdesk/tickets", requireCrmAuth("support.write"), async (req, res): Promise<void> => {
  const parsed = CreateHelpdeskTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Handing somebody work is a different act from raising a ticket, so it
  // carries its own grant — and creation must not be a way around it.
  if (parsed.data.assigneeId != null && !canOrLegacy(req, "support.assign")) {
    res.status(403).json({
      error: "You do not have permission to assign tickets. Raise it unassigned instead.",
      permission: "support.assign",
    });
    return;
  }

  // `helpdesk_tickets.contact_id` is NOT NULL but has no foreign key, so an
  // unchecked create silently produces a ticket about nobody — and then
  // increments the counters of a contact row that does not exist.
  const [contact] = await db
    .select()
    .from(helpdeskContactsTable)
    .where(eq(helpdeskContactsTable.id, parsed.data.contactId));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const count = await db.select({ c: sql<number>`count(*)::int` }).from(helpdeskTicketsTable);
  const nextNum = (count[0]?.c ?? 0) + 1;

  const [ticket] = await db
    .insert(helpdeskTicketsTable)
    .values({
      ...parsed.data,
      ticketNumber: `#${String(nextNum).padStart(4, "0")}`,
      tags: parsed.data.tags ?? [],
    })
    .returning();

  await db
    .update(helpdeskContactsTable)
    .set({ totalTickets: sql`${helpdeskContactsTable.totalTickets} + 1`, openTickets: sql`${helpdeskContactsTable.openTickets} + 1` })
    .where(eq(helpdeskContactsTable.id, ticket.contactId));

  await auditAction(req, "helpdesk.ticket_created", `ticket:${ticket.id} contact:${ticket.contactId}`);

  res.status(201).json(ticketWithContact(ticket, contact, undefined));
});

router.get("/helpdesk/tickets/:id", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const params = GetHelpdeskTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db
    .select()
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.id, params.data.id));

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [contact] = await db.select().from(helpdeskContactsTable).where(eq(helpdeskContactsTable.id, ticket.contactId));
  const assignee = ticket.assigneeId
    ? await db.select().from(helpdeskAgentsTable).where(eq(helpdeskAgentsTable.id, ticket.assigneeId)).then((r) => r[0])
    : undefined;
  const messages = await db
    .select()
    .from(helpdeskMessagesTable)
    .where(eq(helpdeskMessagesTable.ticketId, ticket.id))
    .orderBy(helpdeskMessagesTable.createdAt);

  res.json({
    ticket: ticketWithContact(ticket, contact, assignee),
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    contact: contact
      ? {
          ...contact,
          phone: contact.phone ?? null,
          company: contact.company ?? null,
          lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
          createdAt: contact.createdAt.toISOString(),
        }
      : null,
  });
});

router.patch("/helpdesk/tickets/:id", requireCrmAuth("support.write"), async (req, res): Promise<void> => {
  const params = UpdateHelpdeskTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateHelpdeskTicketBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Reassignment is the one field here that puts an obligation on somebody
  // else's day, so it needs `support.assign` even though the rest of the
  // patch only needs `support.write`.
  if (body.data.assigneeId !== undefined && !canOrLegacy(req, "support.assign")) {
    res.status(403).json({
      error: "You do not have permission to assign tickets.",
      permission: "support.assign",
    });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.status !== undefined) updateData.status = body.data.status;
  if (body.data.priority !== undefined) updateData.priority = body.data.priority;
  if (body.data.assigneeId !== undefined) updateData.assigneeId = body.data.assigneeId;
  if (body.data.tags !== undefined) updateData.tags = body.data.tags;
  if (body.data.status === "resolved" || body.data.status === "closed") {
    updateData.closedAt = new Date();
  }
  // An all-optional body can name no field at all; `.set({})` is a driver
  // error, not an update, so say so rather than returning a 500.
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  const [ticket] = await db
    .update(helpdeskTicketsTable)
    .set(updateData)
    .where(eq(helpdeskTicketsTable.id, params.data.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  await auditAction(req, "helpdesk.ticket_updated", `ticket:${ticket.id} ${Object.keys(updateData).join(",")}`);

  const [contact] = await db.select().from(helpdeskContactsTable).where(eq(helpdeskContactsTable.id, ticket.contactId));
  const assignee = ticket.assigneeId
    ? await db.select().from(helpdeskAgentsTable).where(eq(helpdeskAgentsTable.id, ticket.assigneeId)).then((r) => r[0])
    : undefined;

  res.json(ticketWithContact(ticket, contact, assignee));
});

// ── Messages ─────────────────────────────────────────────────────────────────

router.get("/helpdesk/tickets/:ticketId/messages", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const params = ListHelpdeskMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Record access: resolve the ticket before reading its thread. Without this
  // the route answers for any integer, and an empty array for a ticket that
  // exists is indistinguishable from one for a ticket that does not.
  const [ticket] = await db
    .select({ id: helpdeskTicketsTable.id })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.id, params.data.ticketId));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const messages = await db
    .select()
    .from(helpdeskMessagesTable)
    .where(eq(helpdeskMessagesTable.ticketId, ticket.id))
    .orderBy(helpdeskMessagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

/**
 * Record a message on a ticket.
 *
 * ── Attribution ────────────────────────────────────────────────────────────
 * The author used to come from the request BODY (`authorName`), so any signed
 * in caller could write into a ticket thread under anybody's name — including
 * a colleague's, or a customer's via `authorType`. Both fields are now derived
 * from the session and the body's copies are ignored outright.
 *
 * `authorName` and `authorType` remain REQUIRED by the published contract
 * (lib/api-spec/openapi.yaml → CreateHelpdeskMessageBody), so they are still
 * accepted and still validated — they are simply not believed. Dropping them
 * from the schema would be a breaking change to a generated client this router
 * does not own; ignoring them closes the hole without one.
 *
 * `authorType` is fixed at "agent" because only authenticated staff can reach
 * this route: every message recorded here IS written by the person in the
 * session. A caller-chosen "customer" would be a fabricated customer statement
 * in a support record.
 */
router.post("/helpdesk/tickets/:ticketId/messages", requireCrmAuth("support.write"), async (req, res): Promise<void> => {
  const params = CreateHelpdeskMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateHelpdeskMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const isInternalNote = body.data.isInternalNote ?? false;

  // The same line crmSupport.ts draws: writing a note to yourself is not the
  // same act as saying something to a client, and `communications.send` is the
  // permission that separates them. `support.write` alone buys internal notes.
  if (!isInternalNote && !canOrLegacy(req, "communications.send")) {
    res.status(403).json({
      error: "You do not have permission to reply to customers. You can still add an internal note.",
      permission: "communications.send",
    });
    return;
  }

  // Record access: no orphan messages against ticket ids that do not exist.
  const [ticket] = await db
    .select({ id: helpdeskTicketsTable.id, contactId: helpdeskTicketsTable.contactId })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.id, params.data.ticketId));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const me = actor(req);

  const [message] = await db
    .insert(helpdeskMessagesTable)
    .values({
      ticketId: ticket.id,
      // Derived from the session. `body.data.authorType` and
      // `body.data.authorName` are deliberately NOT read here.
      authorType: "agent",
      authorName: me.label,
      authorInitials: initials(me.label),
      authorAvatarColor: "#6366f1",
      body: body.data.body,
      isInternalNote,
      attachmentName: body.data.attachmentName ?? null,
    })
    .returning();

  // `is_internal_note` is the visibility flag this router already carries, and
  // nothing used to honour it on write. Both of the writes below make a claim
  // about the conversation with the CUSTOMER — the snippet that summarises the
  // thread, and the timestamp asserting we were last in touch — so an internal
  // note must leave them alone. An internal note that moved "last contacted"
  // is a note that silently says we replied when nobody did.
  if (!isInternalNote) {
    await db
      .update(helpdeskTicketsTable)
      .set({ snippetText: body.data.body.slice(0, 120) })
      .where(eq(helpdeskTicketsTable.id, ticket.id));

    await db
      .update(helpdeskContactsTable)
      .set({ lastContactedAt: new Date() })
      .where(eq(helpdeskContactsTable.id, ticket.contactId));
  }

  await auditAction(
    req,
    `helpdesk.message_${isInternalNote ? "internal" : "customer"}`,
    `ticket:${ticket.id} message:${message.id}`
  );

  res.status(201).json({
    ...message,
    createdAt: message.createdAt.toISOString(),
  });
});

// ── Contacts ─────────────────────────────────────────────────────────────────

router.get("/helpdesk/contacts", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const params = ListHelpdeskContactsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { search } = params.data;
  let contacts;
  if (search) {
    contacts = await db
      .select()
      .from(helpdeskContactsTable)
      .where(
        or(
          ilike(helpdeskContactsTable.name, `%${search}%`),
          ilike(helpdeskContactsTable.email, `%${search}%`),
          ilike(helpdeskContactsTable.company, `%${search}%`)
        )
      )
      .orderBy(desc(helpdeskContactsTable.totalTickets));
  } else {
    contacts = await db
      .select()
      .from(helpdeskContactsTable)
      .orderBy(desc(helpdeskContactsTable.totalTickets));
  }

  res.json(
    contacts.map((c) => ({
      ...c,
      phone: c.phone ?? null,
      company: c.company ?? null,
      lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.post("/helpdesk/contacts", requireCrmAuth("support.write"), async (req, res): Promise<void> => {
  const parsed = CreateHelpdeskContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const [contact] = await db
    .insert(helpdeskContactsTable)
    .values({
      ...parsed.data,
      initials: initials(parsed.data.name),
      avatarColor,
      tier: parsed.data.tier ?? "standard",
      phone: parsed.data.phone ?? null,
      company: parsed.data.company ?? null,
    })
    .returning();

  await auditAction(req, "helpdesk.contact_created", `contact:${contact.id}`);

  res.status(201).json({
    ...contact,
    phone: contact.phone ?? null,
    company: contact.company ?? null,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
  });
});

router.get("/helpdesk/contacts/:id", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const params = GetHelpdeskContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [contact] = await db
    .select()
    .from(helpdeskContactsTable)
    .where(eq(helpdeskContactsTable.id, params.data.id));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json({
    ...contact,
    phone: contact.phone ?? null,
    company: contact.company ?? null,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
  });
});

router.patch("/helpdesk/contacts/:id", requireCrmAuth("support.write"), async (req, res): Promise<void> => {
  const params = UpdateHelpdeskContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateHelpdeskContactBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.name !== undefined) {
    updateData.name = body.data.name;
    updateData.initials = initials(body.data.name);
  }
  if (body.data.email !== undefined) updateData.email = body.data.email;
  if (body.data.phone !== undefined) updateData.phone = body.data.phone;
  if (body.data.company !== undefined) updateData.company = body.data.company;
  if (body.data.tier !== undefined) updateData.tier = body.data.tier;
  // Same reason as the ticket patch: `.set({})` is a driver error, not a
  // no-op update.
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  const [contact] = await db
    .update(helpdeskContactsTable)
    .set(updateData)
    .where(eq(helpdeskContactsTable.id, params.data.id))
    .returning();

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  await auditAction(req, "helpdesk.contact_updated", `contact:${contact.id} ${Object.keys(updateData).join(",")}`);

  res.json({
    ...contact,
    phone: contact.phone ?? null,
    company: contact.company ?? null,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
  });
});

// ── Agents ────────────────────────────────────────────────────────────────────

router.get("/helpdesk/agents", requireCrmAuth("support.read"), async (_req, res): Promise<void> => {
  const agents = await db.select().from(helpdeskAgentsTable).orderBy(helpdeskAgentsTable.name);
  res.json(
    agents.map((a) => ({
      ...a,
      teamName: a.teamName ?? null,
      createdAt: undefined,
    }))
  );
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/helpdesk/stats", requireCrmAuth("support.read"), async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [allOpen] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.status, "open"));

  const [unassigned] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(and(eq(helpdeskTicketsTable.status, "open"), sql`${helpdeskTicketsTable.assigneeId} IS NULL`));

  const [snoozed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.status, "snoozed"));

  const [closed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.status, "closed"));

  const [slaBreached] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(and(eq(helpdeskTicketsTable.firstReplySlaBreached, true), eq(helpdeskTicketsTable.status, "open")));

  const [resolvedToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(helpdeskTicketsTable)
    .where(
      and(
        eq(helpdeskTicketsTable.status, "resolved"),
        sql`${helpdeskTicketsTable.closedAt} >= ${todayStart.toISOString()}`
      )
    );

  // "Assigned to me" was the literal 3 for every caller. It is now the
  // signed-in person's own open count, and 0 when they have no agent row —
  // which is at least true, where a constant never was.
  const mine = await sessionAgentId(req);
  const [assignedToMe] = mine === null
    ? [{ count: 0 }]
    : await db
        .select({ count: sql<number>`count(*)::int` })
        .from(helpdeskTicketsTable)
        .where(and(eq(helpdeskTicketsTable.status, "open"), eq(helpdeskTicketsTable.assigneeId, mine)));

  res.json({
    allOpen: allOpen?.count ?? 0,
    assignedToMe: assignedToMe?.count ?? 0,
    unassigned: unassigned?.count ?? 0,
    snoozed: snoozed?.count ?? 0,
    closed: closed?.count ?? 0,
    slaBreached: slaBreached?.count ?? 0,
    avgResolutionHours: 4.2,
    resolvedToday: resolvedToday?.count ?? 0,
  });
});

logger.info("Helpdesk routes registered");

export default router;
