import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, and, sql } from "drizzle-orm";
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

router.get("/helpdesk/tickets", async (req, res): Promise<void> => {
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
    conditions.push(eq(helpdeskTicketsTable.assigneeId, 1));
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

router.post("/helpdesk/tickets", async (req, res): Promise<void> => {
  const parsed = CreateHelpdeskTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const contact = await db.select().from(helpdeskContactsTable).where(eq(helpdeskContactsTable.id, ticket.contactId)).then((r) => r[0]);

  await db
    .update(helpdeskContactsTable)
    .set({ totalTickets: sql`${helpdeskContactsTable.totalTickets} + 1`, openTickets: sql`${helpdeskContactsTable.openTickets} + 1` })
    .where(eq(helpdeskContactsTable.id, ticket.contactId));

  res.status(201).json(ticketWithContact(ticket, contact, undefined));
});

router.get("/helpdesk/tickets/:id", async (req, res): Promise<void> => {
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

router.patch("/helpdesk/tickets/:id", async (req, res): Promise<void> => {
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

  const updateData: Record<string, unknown> = {};
  if (body.data.status !== undefined) updateData.status = body.data.status;
  if (body.data.priority !== undefined) updateData.priority = body.data.priority;
  if (body.data.assigneeId !== undefined) updateData.assigneeId = body.data.assigneeId;
  if (body.data.tags !== undefined) updateData.tags = body.data.tags;
  if (body.data.status === "resolved" || body.data.status === "closed") {
    updateData.closedAt = new Date();
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

  const [contact] = await db.select().from(helpdeskContactsTable).where(eq(helpdeskContactsTable.id, ticket.contactId));
  const assignee = ticket.assigneeId
    ? await db.select().from(helpdeskAgentsTable).where(eq(helpdeskAgentsTable.id, ticket.assigneeId)).then((r) => r[0])
    : undefined;

  res.json(ticketWithContact(ticket, contact, assignee));
});

// ── Messages ─────────────────────────────────────────────────────────────────

router.get("/helpdesk/tickets/:ticketId/messages", async (req, res): Promise<void> => {
  const params = ListHelpdeskMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(helpdeskMessagesTable)
    .where(eq(helpdeskMessagesTable.ticketId, params.data.ticketId))
    .orderBy(helpdeskMessagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

router.post("/helpdesk/tickets/:ticketId/messages", async (req, res): Promise<void> => {
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

  const [message] = await db
    .insert(helpdeskMessagesTable)
    .values({
      ticketId: params.data.ticketId,
      authorType: body.data.authorType,
      authorName: body.data.authorName,
      authorInitials: initials(body.data.authorName),
      authorAvatarColor: "#6366f1",
      body: body.data.body,
      isInternalNote: body.data.isInternalNote ?? false,
      attachmentName: body.data.attachmentName ?? null,
    })
    .returning();

  await db
    .update(helpdeskTicketsTable)
    .set({ snippetText: body.data.body.slice(0, 120) })
    .where(eq(helpdeskTicketsTable.id, params.data.ticketId));

  const [ticketForContact] = await db
    .select({ contactId: helpdeskTicketsTable.contactId })
    .from(helpdeskTicketsTable)
    .where(eq(helpdeskTicketsTable.id, params.data.ticketId));
  if (ticketForContact) {
    await db
      .update(helpdeskContactsTable)
      .set({ lastContactedAt: new Date() })
      .where(eq(helpdeskContactsTable.id, ticketForContact.contactId));
  }

  res.status(201).json({
    ...message,
    createdAt: message.createdAt.toISOString(),
  });
});

// ── Contacts ─────────────────────────────────────────────────────────────────

router.get("/helpdesk/contacts", async (req, res): Promise<void> => {
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

router.post("/helpdesk/contacts", async (req, res): Promise<void> => {
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

  res.status(201).json({
    ...contact,
    phone: contact.phone ?? null,
    company: contact.company ?? null,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
  });
});

router.get("/helpdesk/contacts/:id", async (req, res): Promise<void> => {
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

router.patch("/helpdesk/contacts/:id", async (req, res): Promise<void> => {
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

  const [contact] = await db
    .update(helpdeskContactsTable)
    .set(updateData)
    .where(eq(helpdeskContactsTable.id, params.data.id))
    .returning();

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

// ── Agents ────────────────────────────────────────────────────────────────────

router.get("/helpdesk/agents", async (_req, res): Promise<void> => {
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

router.get("/helpdesk/stats", async (_req, res): Promise<void> => {
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

  res.json({
    allOpen: allOpen?.count ?? 0,
    assignedToMe: 3,
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
