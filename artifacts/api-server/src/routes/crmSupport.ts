// ── M4: Support ─────────────────────────────────────────────────────────────
//
// Everything after the sale. A client writes in, somebody here owns it, the
// conversation is kept in one place, and the answer worth reusing is written
// down once.
//
// Three properties this module exists to hold, and the reasons they are worth
// holding:
//
//   Attribution   Every message records the staff member who wrote it. Three
//                 owners share this CRM; "who told the client that?" must have
//                 an answer. Historical rows stay `origin: 'legacy'` with a
//                 null author rather than being guessed into somebody.
//
//   Visibility    An internal note and a customer reply are different kinds of
//                 thing, separated by a column with no default — not by a
//                 convention and not by a boolean that falls customer-side when
//                 a caller forgets. `/customer-view` is the projection a
//                 customer-facing surface must read, and it filters in SQL, so
//                 an internal note is structurally absent rather than omitted
//                 by a template that somebody might change.
//
//   Honesty       A recorded reply is not a sent reply, and an ACCEPTED reply
//                 is not a delivered one. Every customer-visible message
//                 carries its real delivery state (M5), and the strongest
//                 thing this module will ever say is "accepted by the mail
//                 provider" — never "sent". Counts returned alongside a list
//                 are computed from the same filters as the list, so a queue
//                 badge and the queue cannot disagree.
//
// ── M5: delivery ────────────────────────────────────────────────────────────
//
// A customer reply is now actually sent, through `lib/supportDelivery.ts`,
// which reuses the shared pieces rather than growing a second delivery system:
// `staffMail` for the provider call and the test-mode boundary,
// `crmScheduler.classifyDeliveryOutcome` for the conservative verdict, and the
// existing reply-token machinery for correlating the customer's answer back
// onto this ticket.
//
// An internal note has NO delivery state at all — not "pending", not "n/a".
// The database refuses to let one carry a state, a key or a recipient
// (`ck_crm_support_messages_internal_never_sent`), so the guard cannot be
// forgotten by this route or a future one.
//
// The legacy `helpdesk_*` tables and routes are untouched; lib/db/src/schema/
// crmSupport.ts records why Support owns its own tables.

import { Router, type IRouter, type Request, type Response } from "express";
import { deliveryFor, loadProviderDeliveries } from "../lib/emailProviderEvents.js";
import { emailRef } from "../lib/emailRefs.js";
import type { ProviderDelivery } from "../lib/emailDeliveryState.js";
import type { SupportProviderDelivery } from "../lib/supportDelivery.js";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  db, crmSupportTickets, crmSupportMessages, crmKbArticles,
  crmLeads, crmProjects, crmStaff, crmActivities,
  CRM_SUPPORT_PRIORITIES, CRM_SUPPORT_STATUSES, CRM_SUPPORT_STATUS_TRANSITIONS,
  CRM_SUPPORT_ACTIVE_STATUSES, CRM_SUPPORT_RESOLUTIONS, CRM_SUPPORT_SOURCES,
  CRM_SUPPORT_REQUEST_TYPES, CRM_SUPPORT_VISIBILITIES, CRM_KB_STATUSES,
  CRM_SUPPORT_DELIVERY_ACTIONS,
  isSupportTransitionAllowed, supportTicketReference,
  type CrmSupportStatus, type CrmSupportTicket, type CrmSupportMessage,
  type CrmSupportDeliveryAction,
} from "@workspace/db";
import { requireCrmAuth, auditAction, staffCan } from "../lib/staffAuth.js";
import type { Permission } from "../lib/staffPermissions.js";
import {
  armDelivery, attemptSupportDelivery, contactForTicket, ingestSupportReplies,
  processDueSupportDeliveries, recoverSupportDelivery, supportDeliveryStatus,
  supportDeliveryView, supportResendRisk,
} from "../lib/supportDelivery.js";

const router: IRouter = Router();

/** One WHERE predicate. Drizzle's builders can return undefined for a no-op. */
type SQLish = SQL<unknown>;

// ── Small shared pieces ─────────────────────────────────────────────────────

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const inList = (v: unknown, list: readonly string[]): string | undefined =>
  typeof v === "string" && list.includes(v) ? v : undefined;

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName || s?.email || "admin" };
}

/**
 * A second, record-level permission check that still works mid-cutover.
 *
 * `requireCrmAuth` accepts EITHER a per-person staff session or, while
 * `CRM_LEGACY_BEARER_ENABLED` is not "false", the legacy shared bearer. The
 * bearer holder is the old shared-password admin, who already had unrestricted
 * access — so a request that reached here without a staff session has passed
 * the gate on that path and `staffCan` would refuse it purely for having no
 * person attached. This mirrors the transitional rule in staffAuth.ts. Delete
 * the first line when the legacy bearer is retired.
 */
function canOrLegacy(req: Request, permission: Permission): boolean {
  if (!req.staffAuth) return true;
  return staffCan(req, permission);
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function pageLimit(raw: unknown): number {
  const n = num(raw);
  if (n === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

/** "SUP-00042" / "#42" / "42" → 42. Used so a reference is searchable. */
function referenceToId(term: string): number | undefined {
  const digits = term.replace(/\D+/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── Shapes returned to the client ───────────────────────────────────────────

function ticketShape(t: CrmSupportTicket, extra: {
  contactName?: string | null;
  contactEmail?: string | null;
  contactCompany?: string | null;
  projectName?: string | null;
  assigneeName?: string | null;
} = {}) {
  return {
    ...t,
    reference: supportTicketReference(t.id),
    allowedTransitions: CRM_SUPPORT_STATUS_TRANSITIONS[t.status as CrmSupportStatus] ?? [],
    isActive: (CRM_SUPPORT_ACTIVE_STATUSES as readonly string[]).includes(t.status),
    contactName: extra.contactName ?? null,
    contactEmail: extra.contactEmail ?? null,
    contactCompany: extra.contactCompany ?? null,
    projectName: extra.projectName ?? null,
    assigneeName: extra.assigneeName ?? null,
  };
}

/**
 * A thread entry as staff see it — author included, visibility stated, and
 * what actually happened to it when it was meant to reach the customer.
 *
 * `authorKnown: false` is how a row with no recorded author is labelled. It is
 * never filled in from context.
 *
 * `delivery` is NULL for an internal note and for the customer's own words —
 * not a placeholder state, because no delivery exists for either. That is the
 * API half of the guarantee the check constraint holds in the database.
 */
/** The provider's own report for one reply, in the shape the thread renders. */
function providerReport(provider: ProviderDelivery | null): SupportProviderDelivery | null {
  if (!provider?.state) return null;
  return {
    state: provider.state,
    label: provider.label,
    tone: provider.tone,
    explanation: provider.explanation,
    at: provider.at?.toISOString() ?? null,
    detail: provider.detail,
  };
}

/**
 * What the provider said about each of these replies, keyed by message id.
 *
 * Only rows that were actually handed over are asked about — an internal note
 * and the client's own words have no delivery — and each is matched by the
 * provider id it recorded AND by the tag the send carried, because a reply
 * whose outcome was never learned has no id to match on.
 */
async function providerReportsFor(
  messages: CrmSupportMessage[],
): Promise<Map<number, SupportProviderDelivery | null>> {
  const handedOver = messages.filter((m) => m.deliveryState != null);
  if (handedOver.length === 0) return new Map();
  const lookup = await loadProviderDeliveries({
    providerIds: handedOver.map((m) => m.deliveryProviderRef),
    refs: handedOver.map((m) => emailRef("support_message", m.id)),
  });
  return new Map(handedOver.map((m) => [
    m.id,
    providerReport(deliveryFor(lookup, m.deliveryProviderRef, emailRef("support_message", m.id))),
  ]));
}

function messageShape(m: CrmSupportMessage, provider: SupportProviderDelivery | null = null) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    visibility: m.visibility,
    body: m.body,
    origin: m.origin,
    sentByStaffId: m.sentByStaffId,
    sentByLabel: m.sentByLabel,
    authorKnown: m.origin !== "legacy" && (m.sentByStaffId != null || m.origin === "customer"),
    /** True when the client's own words arrived here by email. */
    arrivedByEmail: m.inboundMessageId != null,
    delivery: supportDeliveryView(m, Date.now(), provider),
    createdAt: m.createdAt,
  };
}

// ── Vocabularies ────────────────────────────────────────────────────────────

/**
 * Every closed list this module enforces, plus the state machine itself.
 *
 * The UI reads these rather than hard-coding them, so a vocabulary can only
 * ever be changed in one place — and a screen can never offer a button the API
 * will refuse.
 */
router.get("/crm/support/vocabulary", requireCrmAuth("support.read"), async (_req: Request, res: Response) => {
  res.json({
    statuses: CRM_SUPPORT_STATUSES,
    activeStatuses: CRM_SUPPORT_ACTIVE_STATUSES,
    transitions: CRM_SUPPORT_STATUS_TRANSITIONS,
    priorities: CRM_SUPPORT_PRIORITIES,
    resolutions: CRM_SUPPORT_RESOLUTIONS,
    sources: CRM_SUPPORT_SOURCES,
    requestTypes: CRM_SUPPORT_REQUEST_TYPES,
    visibilities: CRM_SUPPORT_VISIBILITIES,
    kbStatuses: CRM_KB_STATUSES,
    deliveryActions: CRM_SUPPORT_DELIVERY_ACTIONS,
    definitions: {
      transitions: "Which status a ticket may move to from each status. Resolved and closed are NOT terminal — a customer coming back must land on the same ticket with its whole history.",
      resolutions: "A finished ticket must carry one of these. The database refuses a resolved or closed ticket with no reason, so the list can actually be counted.",
      visibilities: "'internal' never appears on a customer-facing surface. There is no default: every message must say which it is.",
      deliveryActions: "What a person may do about a reply that did not settle. A retry reuses the original idempotency key; a re-send deliberately asks for a second copy and gets a new one; acknowledging closes the case without sending anything.",
    },
  });
});

// ── The queue ───────────────────────────────────────────────────────────────

/**
 * The ticket queue: filtered, searchable, and paged on the immutable id.
 *
 * Keyset, not offset. Offset paging over a queue that is being worked reorders
 * under the reader: a ticket updated between page 1 and page 2 moves to the
 * front, and the row that was at the boundary is never shown. Older tickets
 * quietly disappear, which is the exact failure a support queue cannot have.
 * `id` is a serial, so `id DESC` is newest-first, total, and immutable — a
 * cursor into it stays valid no matter what anybody does to the rows.
 *
 * Sorting by "last updated" was considered and rejected for the same reason: it
 * is a mutable sort key, and a cursor into one cannot be stable.
 */
router.get("/crm/support/tickets", requireCrmAuth("support.read"), async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;

  const status = inList(q["status"], CRM_SUPPORT_STATUSES);
  const priority = inList(q["priority"], CRM_SUPPORT_PRIORITIES);
  const source = inList(q["source"], CRM_SUPPORT_SOURCES);
  const requestType = inList(q["requestType"], CRM_SUPPORT_REQUEST_TYPES);
  const leadId = num(q["leadId"]);
  const projectId = num(q["projectId"]);
  const assignee = q["assignedToStaffId"];
  const search = str(q["q"]);
  const limit = pageLimit(q["limit"]);
  const cursor = num(q["cursor"]);
  const activeOnly = q["activeOnly"] === "true";

  // Filters that define the SET of tickets — everything except the cursor,
  // which only says where in that set this page starts. The counts below are
  // computed from exactly these, so a badge cannot disagree with its list.
  //
  // The status predicate is held apart rather than mixed into one array,
  // because `byStatus` is the same query with only that one removed. Slicing a
  // positional array to drop it would break silently the first time somebody
  // reorders the filters above.
  const statusFilter = status
    ? eq(crmSupportTickets.status, status)
    : activeOnly
      ? inArray(crmSupportTickets.status, [...CRM_SUPPORT_ACTIVE_STATUSES])
      : undefined;

  const rest: SQLish[] = [];
  if (priority) rest.push(eq(crmSupportTickets.priority, priority));
  if (source) rest.push(eq(crmSupportTickets.source, source));
  if (requestType) rest.push(eq(crmSupportTickets.requestType, requestType));
  if (leadId) rest.push(eq(crmSupportTickets.leadId, leadId));
  if (projectId) rest.push(eq(crmSupportTickets.projectId, projectId));
  if (assignee === "unassigned") rest.push(isNull(crmSupportTickets.assignedToStaffId));
  else if (num(assignee) !== undefined) {
    rest.push(eq(crmSupportTickets.assignedToStaffId, num(assignee) as number));
  }
  if (search) {
    const refId = referenceToId(search);
    const like = `%${search}%`;
    const terms = [
      ilike(crmSupportTickets.subject, like),
      ilike(crmSupportTickets.description, like),
    ];
    if (refId !== undefined) terms.push(eq(crmSupportTickets.id, refId));
    rest.push(or(...terms)!);
  }

  const all = statusFilter ? [statusFilter, ...rest] : rest;
  const filtered = all.length ? and(...all) : undefined;
  const paged = cursor !== undefined
    ? and(...all, lt(crmSupportTickets.id, cursor))
    : filtered;

  // One extra row tells us whether another page exists without a second query
  // and without a count that could disagree with it.
  const rows = await db.select().from(crmSupportTickets)
    .where(paged)
    .orderBy(desc(crmSupportTickets.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Counts over the SAME filter set. `matchingFilters` is what walking every
  // page yields; `byStatus` drops only the status filter so the status tabs can
  // show what each one would return.
  const [total] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmSupportTickets).where(filtered);

  const statusRows = await db.select({
    status: crmSupportTickets.status, n: sql<number>`count(*)::int`,
  }).from(crmSupportTickets)
    .where(rest.length ? and(...rest) : undefined)
    .groupBy(crmSupportTickets.status);

  const byStatus: Record<string, number> = {};
  for (const s of CRM_SUPPORT_STATUSES) byStatus[s] = 0;
  for (const r of statusRows) byStatus[r.status] = r.n;

  // Names for the ids on this page only — a list query never drags the whole
  // contact table through memory.
  const leadIds = [...new Set(page.map((t) => t.leadId))];
  const staffIds = [...new Set(page.map((t) => t.assignedToStaffId).filter((v): v is number => v != null))];
  const projectIds = [...new Set(page.map((t) => t.projectId).filter((v): v is number => v != null))];

  const [leads, staff, projects] = await Promise.all([
    leadIds.length
      ? db.select({ id: crmLeads.id, name: crmLeads.name, email: crmLeads.email, company: crmLeads.company })
          .from(crmLeads).where(inArray(crmLeads.id, leadIds))
      : [],
    staffIds.length
      ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
          .from(crmStaff).where(inArray(crmStaff.id, staffIds))
      : [],
    projectIds.length
      ? db.select({ id: crmProjects.id, name: crmProjects.name })
          .from(crmProjects).where(inArray(crmProjects.id, projectIds))
      : [],
  ]);

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const staffById = new Map(staff.map((s) => [s.id, s.displayName]));
  const projectById = new Map(projects.map((p) => [p.id, p.name]));

  res.json({
    tickets: page.map((t) => ticketShape(t, {
      contactName: leadById.get(t.leadId)?.name ?? null,
      contactEmail: leadById.get(t.leadId)?.email ?? null,
      contactCompany: leadById.get(t.leadId)?.company ?? null,
      projectName: t.projectId != null ? projectById.get(t.projectId) ?? null : null,
      assigneeName: t.assignedToStaffId != null ? staffById.get(t.assignedToStaffId) ?? null : null,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    counts: {
      matchingFilters: total?.n ?? 0,
      byStatus,
      returnedOnThisPage: page.length,
    },
    definitions: {
      matchingFilters: "Tickets matching exactly the filters on this request, ignoring the page cursor. Walking every page returns this many rows.",
      byStatus: "The same filters with the status filter removed, so a status tab shows what selecting it would return.",
      paging: "Paged on the ticket id, newest first. The id never changes, so a cursor stays valid while the queue is being worked and no older ticket is skipped.",
    },
  });
});

// ── One ticket ──────────────────────────────────────────────────────────────

async function loadTicket(id: number): Promise<CrmSupportTicket | undefined> {
  const [t] = await db.select().from(crmSupportTickets)
    .where(eq(crmSupportTickets.id, id)).limit(1);
  return t;
}

/** The whole ticket as staff see it: both kinds of message, clearly labelled. */
router.get("/crm/support/tickets/:id", requireCrmAuth("support.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  let ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  // Anything the client emailed back is filed onto the thread before the
  // thread is read, so opening a ticket shows their reply rather than showing
  // it only after some later sweep runs. Scoped to this ticket, idempotent
  // through the UNIQUE index on `inbound_message_id`, and a no-op when nothing
  // has arrived. It never fails the read: a correlation problem must not make
  // a ticket unreadable.
  //
  // The ticket is re-read when something was filed, because filing a reply can
  // move the ticket back to `open` — rendering the row from before the write
  // would show a status the database no longer holds.
  if (ticket.conversationId) {
    try {
      const filed = await ingestSupportReplies({ ticketId: id });
      if (filed.filed > 0) ticket = (await loadTicket(id)) ?? ticket;
    } catch (err) {
      req.log?.warn({ err, ticketId: id }, "filing inbound support replies failed");
    }
  }

  const [messages, lead, project, assignee, article, resolver, opener] = await Promise.all([
    db.select().from(crmSupportMessages)
      .where(eq(crmSupportMessages.ticketId, id))
      .orderBy(asc(crmSupportMessages.id)),
    db.select().from(crmLeads).where(eq(crmLeads.id, ticket.leadId)).limit(1),
    ticket.projectId != null
      ? db.select({ id: crmProjects.id, name: crmProjects.name, stage: crmProjects.stage })
          .from(crmProjects).where(eq(crmProjects.id, ticket.projectId)).limit(1)
      : [],
    ticket.assignedToStaffId != null
      ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
          .from(crmStaff).where(eq(crmStaff.id, ticket.assignedToStaffId)).limit(1)
      : [],
    ticket.kbArticleId != null
      ? db.select({ id: crmKbArticles.id, slug: crmKbArticles.slug, title: crmKbArticles.title, status: crmKbArticles.status })
          .from(crmKbArticles).where(eq(crmKbArticles.id, ticket.kbArticleId)).limit(1)
      : [],
    ticket.resolvedByStaffId != null
      ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
          .from(crmStaff).where(eq(crmStaff.id, ticket.resolvedByStaffId)).limit(1)
      : [],
    ticket.openedByStaffId != null
      ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
          .from(crmStaff).where(eq(crmStaff.id, ticket.openedByStaffId)).limit(1)
      : [],
  ]);

  const reports = await providerReportsFor(messages);

  res.json({
    ticket: ticketShape(ticket, {
      contactName: lead[0]?.name ?? null,
      contactEmail: lead[0]?.email ?? null,
      contactCompany: lead[0]?.company ?? null,
      projectName: project[0]?.name ?? null,
      assigneeName: assignee[0]?.displayName ?? null,
    }),
    contact: lead[0] ?? null,
    project: project[0] ?? null,
    article: article[0] ?? null,
    resolvedByName: resolver[0]?.displayName ?? null,
    openedByName: opener[0]?.displayName ?? ticket.openedByLabel ?? null,
    messages: messages.map((m) => messageShape(m, reports.get(m.id) ?? null)),
    counts: {
      messages: messages.length,
      customerVisible: messages.filter((m) => m.visibility === "customer").length,
      internalNotes: messages.filter((m) => m.visibility === "internal").length,
      // Replies somebody here has to deal with. Counted from the same rows the
      // thread renders, so a badge cannot disagree with what is on screen.
      deliveriesNeedingAttention: messages
        .filter((m) => supportDeliveryView(m)?.needsAttention).length,
    },
    delivery: supportDeliveryStatus(),
    definitions: {
      delivery: "Per message. Null on an internal note and on the client's own words, because no delivery exists for either. 'Accepted by the mail provider' is the strongest thing recorded here — it is not proof the client received anything.",
    },
  });
});

/**
 * Exactly what the customer would see. Nothing else.
 *
 * This is the projection any customer-facing surface must read, and it is the
 * reason `visibility` is a column rather than a convention: the filter is in
 * the WHERE clause, so an internal note is not fetched at all. A template that
 * forgot to hide one would have nothing to forget.
 *
 * Staff use it too, as a "what does the client see?" check before replying.
 */
router.get("/crm/support/tickets/:id/customer-view", requireCrmAuth("support.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  const messages = await db.select({
    id: crmSupportMessages.id,
    body: crmSupportMessages.body,
    origin: crmSupportMessages.origin,
    createdAt: crmSupportMessages.createdAt,
    sentByLabel: crmSupportMessages.sentByLabel,
  }).from(crmSupportMessages)
    .where(and(
      eq(crmSupportMessages.ticketId, id),
      eq(crmSupportMessages.visibility, "customer"),
    ))
    .orderBy(asc(crmSupportMessages.id));

  res.json({
    // A deliberately narrow ticket shape: no assignee, no internal counts, no
    // resolution note. What the office says to itself is not the customer's.
    ticket: {
      reference: supportTicketReference(ticket.id),
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      from: m.origin === "customer" ? "you" : "SiteMint Digital",
      author: m.origin === "customer" ? null : m.sentByLabel,
      createdAt: m.createdAt,
    })),
    definitions: {
      scope: "Customer-visible messages only, filtered in SQL. Internal notes are not read by this route at all.",
    },
  });
});

// ── Raising a ticket ────────────────────────────────────────────────────────

async function createTicket(req: Request, res: Response, defaults: {
  source: string;
  requireRequestType: boolean;
}): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const me = actor(req);

  const leadId = num(body["leadId"]);
  const subject = str(body["subject"]);
  if (!leadId) { res.status(400).json({ error: "Say which contact this is for." }); return; }
  if (!subject) { res.status(400).json({ error: "Give the ticket a subject." }); return; }

  const [lead] = await db.select({ id: crmLeads.id, name: crmLeads.name })
    .from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "No such contact." }); return; }

  const projectId = num(body["projectId"]);
  if (projectId) {
    const [project] = await db.select({ id: crmProjects.id })
      .from(crmProjects).where(eq(crmProjects.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "No such project." }); return; }
  }

  const source = defaults.source === "any"
    ? inList(body["source"], CRM_SUPPORT_SOURCES) ?? "staff"
    : defaults.source;

  const requestType = inList(body["requestType"], CRM_SUPPORT_REQUEST_TYPES);
  if (defaults.requireRequestType && !requestType) {
    res.status(400).json({
      error: "Say what the customer is asking for.",
      accepted: CRM_SUPPORT_REQUEST_TYPES,
    });
    return;
  }

  const priority = inList(body["priority"], CRM_SUPPORT_PRIORITIES) ?? "normal";

  const assignTo = num(body["assignedToStaffId"]);
  if (assignTo !== undefined && !canOrLegacy(req, "support.assign")) {
    res.status(403).json({
      error: "You do not have permission to assign a ticket to somebody.",
      permission: "support.assign",
    });
    return;
  }
  if (assignTo !== undefined) {
    const refusal = await refuseAssignee(assignTo);
    if (refusal) { res.status(refusal.status).json({ error: refusal.error }); return; }
  }

  const now = new Date();
  const [ticket] = await db.insert(crmSupportTickets).values({
    subject,
    description: str(body["description"]) ?? null,
    status: "new",
    priority,
    source,
    requestType: requestType ?? null,
    leadId,
    projectId: projectId ?? null,
    assignedToStaffId: assignTo ?? null,
    assignedAt: assignTo !== undefined ? now : null,
    openedByStaffId: me.id,
    openedByLabel: me.label,
  }).returning();

  // The customer's own description IS the first thing in the thread, recorded
  // as theirs. Leaving it only in a column would make the thread start with our
  // reply to something nobody can see.
  if (ticket.description) {
    await db.insert(crmSupportMessages).values({
      ticketId: ticket.id,
      visibility: "customer",
      body: ticket.description,
      origin: "customer",
      sentByStaffId: null,
      sentByLabel: null,
    });
    await db.update(crmSupportTickets)
      .set({ lastCustomerMessageAt: now, updatedAt: now })
      .where(eq(crmSupportTickets.id, ticket.id));
  }

  await db.insert(crmActivities).values({
    leadId,
    type: "support_ticket_opened",
    title: `Support ticket ${supportTicketReference(ticket.id)}: ${subject}`,
    description: `Priority ${priority}${requestType ? `, request type ${requestType}` : ""}.`,
    createdBy: me.label,
  });

  await auditAction(req, "support.ticket_opened", `ticket:${ticket.id} lead:${leadId}`);
  res.status(201).json({
    ticket: ticketShape(ticket, { contactName: lead.name }),
    nextStep: assignTo === undefined
      ? "Nobody owns this yet. Assign it so it has a name against it."
      : null,
  });
}

/** Raise a ticket from this side — somebody here noticed something. */
router.post("/crm/support/tickets", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  await createTicket(req, res, { source: "any", requireRequestType: false });
});

/**
 * A service request: the customer asked us for something.
 *
 * Deliberately the same record as a ticket, with `source = 'service_request'`
 * and a required request type. A separate "requests" table that converted
 * one-to-one into a ticket would carry no state of its own and would leave two
 * places to look for the same request.
 */
router.post("/crm/support/service-requests", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  await createTicket(req, res, { source: "service_request", requireRequestType: true });
});

// ── Ownership ───────────────────────────────────────────────────────────────

async function refuseAssignee(staffId: number): Promise<{ status: number; error: string } | undefined> {
  const [staff] = await db.select({ id: crmStaff.id, status: crmStaff.status })
    .from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff) return { status: 404, error: "No such staff account." };
  if (staff.status === "disabled") {
    return { status: 409, error: "That account is disabled, so tickets cannot be assigned to it." };
  }
  return undefined;
}

/** Put a ticket in somebody's name, or hand it back to the queue. */
router.post("/crm/support/tickets/:id/assign", requireCrmAuth("support.assign"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const target = (req.body as { staffId?: unknown })?.staffId;
  const staffId = target === null ? null : num(target);
  if (target !== null && staffId === undefined) {
    res.status(400).json({ error: "Say who to assign it to, or null to unassign." });
    return;
  }

  const ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  if (staffId != null) {
    const refusal = await refuseAssignee(staffId);
    if (refusal) { res.status(refusal.status).json({ error: refusal.error }); return; }
  }

  const now = new Date();
  const [updated] = await db.update(crmSupportTickets).set({
    assignedToStaffId: staffId,
    assignedAt: staffId != null ? now : null,
    updatedAt: now,
  }).where(eq(crmSupportTickets.id, id)).returning();

  const me = actor(req);
  await db.insert(crmActivities).values({
    leadId: ticket.leadId,
    type: "support_ticket_assigned",
    title: `Support ticket ${supportTicketReference(id)} ${staffId != null ? "assigned" : "unassigned"}`,
    description: staffId != null ? `Assigned to staff ${staffId}.` : "Returned to the unassigned queue.",
    createdBy: me.label,
  });
  await auditAction(req, "support.ticket_assigned", `ticket:${id} staff:${staffId ?? "none"}`);
  res.json({ ticket: ticketShape(updated) });
});

/** How urgent it is, from a closed list so urgency stays countable. */
router.post("/crm/support/tickets/:id/priority", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const priority = inList((req.body as Record<string, unknown>)["priority"], CRM_SUPPORT_PRIORITIES);
  if (!priority) {
    res.status(400).json({ error: "Give a priority from the accepted list.", accepted: CRM_SUPPORT_PRIORITIES });
    return;
  }

  const [updated] = await db.update(crmSupportTickets)
    .set({ priority, updatedAt: new Date() })
    .where(eq(crmSupportTickets.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, "support.ticket_priority", `ticket:${id} ${priority}`);
  res.json({ ticket: ticketShape(updated) });
});

// ── The state machine ───────────────────────────────────────────────────────

/**
 * Moves a ticket through its states, refusing moves the machine does not allow
 * and refusing to finish a ticket without saying why.
 *
 * The refusal names the moves that ARE allowed from here, so a caller is never
 * guessing — the same courtesy `POST /crm/deals/:id/close` extends with its
 * lost-reason vocabulary.
 */
router.post("/crm/support/tickets/:id/status", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const body = req.body as Record<string, unknown>;
  const next = inList(body["status"], CRM_SUPPORT_STATUSES) as CrmSupportStatus | undefined;
  if (!next) {
    res.status(400).json({ error: "Say which status to move to.", accepted: CRM_SUPPORT_STATUSES });
    return;
  }

  const ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  const from = ticket.status as CrmSupportStatus;
  if (from === next) {
    res.status(409).json({ error: `This ticket is already "${next}".` });
    return;
  }
  if (!isSupportTransitionAllowed(from, next)) {
    res.status(409).json({
      error: `A ticket at "${from}" cannot move to "${next}".`,
      from,
      allowed: CRM_SUPPORT_STATUS_TRANSITIONS[from],
    });
    return;
  }

  const finishing = next === "resolved" || next === "closed";
  const resolution = inList(body["resolution"], CRM_SUPPORT_RESOLUTIONS);
  // Finishing needs a reason. Closing a ticket that was already resolved
  // carries the reason it was resolved with rather than demanding it twice.
  if (finishing && !resolution && !ticket.resolution) {
    res.status(400).json({
      error: "Say why this ticket is finished.",
      accepted: CRM_SUPPORT_RESOLUTIONS,
    });
    return;
  }

  const now = new Date();
  const reopening = (from === "resolved" || from === "closed") && next === "open";

  const patch: Partial<typeof crmSupportTickets.$inferInsert> = {
    status: next,
    updatedAt: now,
  };
  if (finishing) {
    patch.resolution = resolution ?? ticket.resolution;
    if (str(body["resolutionNote"])) patch.resolutionNote = str(body["resolutionNote"]) as string;
    patch.resolvedByStaffId = actor(req).id;
    if (next === "resolved") patch.resolvedAt = now;
    if (next === "closed") {
      patch.closedAt = now;
      patch.resolvedAt = ticket.resolvedAt ?? now;
    }
  }
  if (reopening) {
    patch.reopenedAt = now;
    patch.reopenCount = ticket.reopenCount + 1;
    patch.closedAt = null;
    patch.resolvedAt = null;
    // The old resolution is deliberately kept on the row: it is what we
    // believed last time, and it is the most useful thing to read when a
    // ticket comes back. The check constraint only requires one while the
    // ticket is in a finished state.
  }

  const [updated] = await db.update(crmSupportTickets).set(patch)
    .where(eq(crmSupportTickets.id, id)).returning();

  const me = actor(req);
  await db.insert(crmActivities).values({
    leadId: ticket.leadId,
    type: "support_ticket_status",
    title: `Support ticket ${supportTicketReference(id)}: ${from} → ${next}`,
    description: finishing
      ? `Resolution: ${patch.resolution}${patch.resolutionNote ? ` — ${patch.resolutionNote}` : ""}`
      : reopening ? "Reopened." : null,
    createdBy: me.label,
  });
  await auditAction(req, "support.ticket_status", `ticket:${id} ${from}->${next}`);

  res.json({
    ticket: ticketShape(updated),
    reopened: reopening,
    note: reopening
      ? "Reopened on the same ticket, so its whole history stays in one place. The previous resolution is kept for reference."
      : null,
  });
});

// ── The thread ──────────────────────────────────────────────────────────────

/**
 * Adds a message to a ticket — a reply to the customer, or a note nobody
 * outside this office may see.
 *
 * `visibility` is required. There is no default and no inference: the one
 * mistake this feature must not make is a private note reaching a client, and
 * a route that quietly picks a side is how that mistake happens.
 *
 * A customer reply is recorded AND sent. An internal note is recorded and
 * never touches the delivery path at all — the branch below is guarded, and
 * the database refuses a deliverable internal note underneath it.
 */
router.post("/crm/support/tickets/:id/messages", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const body = req.body as Record<string, unknown>;
  const visibility = inList(body["visibility"], CRM_SUPPORT_VISIBILITIES);
  if (!visibility) {
    res.status(400).json({
      error: "Say whether this is a reply to the customer or an internal note. There is no default.",
      accepted: CRM_SUPPORT_VISIBILITIES,
    });
    return;
  }
  const text = str(body["body"]);
  if (!text) { res.status(400).json({ error: "The message is empty." }); return; }

  // Contacting a customer is a different act from writing a note to yourself,
  // and the CRM already draws that line with `communications.send`. Asserting
  // it now — before delivery is wired — means the boundary is correct on the
  // day it starts sending, rather than retrofitted onto a live route.
  if (visibility === "customer" && !canOrLegacy(req, "communications.send")) {
    res.status(403).json({
      error: "You do not have permission to reply to customers. You can still add an internal note.",
      permission: "communications.send",
    });
    return;
  }

  const ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  const me = actor(req);
  const now = new Date();

  const [message] = await db.insert(crmSupportMessages).values({
    ticketId: id,
    visibility,
    body: text,
    origin: "staff",
    sentByStaffId: me.id,
    sentByLabel: me.label,
  }).returning();

  const patch: Partial<typeof crmSupportTickets.$inferInsert> = { updatedAt: now };
  let statusMovedTo: string | null = null;

  if (visibility === "customer") {
    patch.lastStaffMessageAt = now;
    if (!ticket.firstResponseAt) patch.firstResponseAt = now;
    // A replied-to ticket is not "new" any more; leaving it there makes the
    // queue lie about what nobody has picked up. Only this one transition is
    // automatic, and the response says it happened.
    if (ticket.status === "new") { patch.status = "open"; statusMovedTo = "open"; }
  }
  await db.update(crmSupportTickets).set(patch).where(eq(crmSupportTickets.id, id));

  // ── Delivery ──────────────────────────────────────────────────────────────
  //
  // The single place a support message becomes an email, guarded by
  // `visibility === "customer"` and by nothing else reaching it. An internal
  // note leaves this block untouched, so it has no delivery row, no
  // idempotency key and no recipient — and the database would refuse it one
  // even if this branch were broken.
  //
  // The first attempt is made inline rather than left to a worker, because the
  // person who just pressed the button is entitled to know whether it went.
  // Every later attempt is the worker's, durably, off `next_attempt_at`.
  if (visibility === "customer") {
    const contact = await contactForTicket(ticket);
    const armed = await armDelivery({ ticket, message, contact });
    if (armed.armed) {
      await attemptSupportDelivery(message.id);
    }
  }

  const [settled] = await db.select().from(crmSupportMessages)
    .where(eq(crmSupportMessages.id, message.id)).limit(1);
  const view = supportDeliveryView(settled ?? message);

  if (visibility === "customer") {
    await db.insert(crmActivities).values({
      leadId: ticket.leadId,
      type: "support_reply_sent",
      title: `Reply to the client on support ticket ${supportTicketReference(id)}`,
      // The activity feed records the real state in the same words the ticket
      // shows, so a timeline and a thread can never tell two different stories.
      description: view ? `${view.label}. ${view.explanation}` : "Recorded on the ticket.",
      createdBy: me.label,
    });
  }

  await auditAction(req, `support.message_${visibility}`, `ticket:${id} message:${message.id}`);

  res.status(201).json({
    message: messageShape(settled ?? message),
    statusMovedTo,
    delivery: visibility === "customer"
      ? view
      : {
          state: null,
          label: "Internal note",
          tone: "waiting",
          explanation: "It stays in the CRM, is never delivered anywhere, and never appears on a customer-facing surface.",
          needsAttention: false,
        },
  });
});

/**
 * Records a message the customer sent us.
 *
 * Separate from the staff route because the author is different in kind: this
 * has no staff id, and its origin is 'customer'. Forcing both through one route
 * with a caller-supplied author is exactly how the legacy helpdesk ended up
 * letting the request body name whoever it liked.
 */
router.post("/crm/support/tickets/:id/customer-messages", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const text = str((req.body as Record<string, unknown>)["body"]);
  if (!text) { res.status(400).json({ error: "The message is empty." }); return; }

  const ticket = await loadTicket(id);
  if (!ticket) { res.status(404).json({ error: "Not found." }); return; }

  const now = new Date();
  const [message] = await db.insert(crmSupportMessages).values({
    ticketId: id,
    visibility: "customer",
    body: text,
    origin: "customer",
    sentByStaffId: null,
    sentByLabel: null,
  }).returning();

  const patch: Partial<typeof crmSupportTickets.$inferInsert> = {
    lastCustomerMessageAt: now, updatedAt: now,
  };
  // The customer has come back, so the ball is ours again.
  if (ticket.status === "waiting_on_customer") patch.status = "open";
  await db.update(crmSupportTickets).set(patch).where(eq(crmSupportTickets.id, id));

  await auditAction(req, "support.message_from_customer", `ticket:${id} message:${message.id}`);
  res.status(201).json({
    message: messageShape(message),
    statusMovedTo: patch.status ?? null,
  });
});

// ── Delivery ────────────────────────────────────────────────────────────────

/**
 * Whether Support can actually reach a client right now, and if not, what is
 * missing — in words an operator can act on.
 *
 * Sending and receiving are reported separately because they fail separately:
 * a server can send perfectly while no MX record exists, in which case every
 * reply the client writes goes nowhere.
 */
router.get("/crm/support/delivery/status", requireCrmAuth("support.read"), async (_req: Request, res: Response) => {
  const status = supportDeliveryStatus();
  res.json({
    ...status,
    definitions: {
      canSend: "Whether a reply written now would be handed to the mail provider. False means it is recorded and visibly marked as not sent — never silently dropped.",
      canReceiveReplies: "Whether outbound support mail carries a Reply-To that identifies the ticket. This also needs an MX record pointing the reply domain at the provider, which this server cannot check.",
      accepted: "The strongest outcome recorded anywhere in Support. It means the provider took the message, not that the client received it.",
    },
  });
});

/**
 * Replies that did not settle, newest first.
 *
 * The list a person works. Nothing is hidden by a limit that could bury an
 * unresolved case: the count is over every open row, and the response says so
 * when it returned fewer than that.
 */
router.get("/crm/support/deliveries", requireCrmAuth("support.read"), async (req: Request, res: Response) => {
  const limit = pageLimit(req.query["limit"]);

  const open = and(
    isNotNull(crmSupportMessages.deliveryState),
    isNull(crmSupportMessages.deliveryResolvedAt),
    inArray(crmSupportMessages.deliveryState, ["refused", "uncertain", "attempting"]),
  );
  // A `pending` row with no scheduled attempt is also somebody's problem — it
  // is the "mail is not configured" case, and it is waiting on a person, not a
  // timer.
  const stalled = and(
    eq(crmSupportMessages.deliveryState, "pending"),
    isNull(crmSupportMessages.nextAttemptAt),
    isNull(crmSupportMessages.deliveryResolvedAt),
  );
  const where = or(open, stalled);

  const [rows, [total]] = await Promise.all([
    db.select().from(crmSupportMessages).where(where)
      .orderBy(desc(crmSupportMessages.id)).limit(limit),
    db.select({ n: sql<number>`count(*)::int` }).from(crmSupportMessages).where(where),
  ]);

  const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
  const tickets = ticketIds.length
    ? await db.select({
        id: crmSupportTickets.id, subject: crmSupportTickets.subject,
        status: crmSupportTickets.status, leadId: crmSupportTickets.leadId,
      }).from(crmSupportTickets).where(inArray(crmSupportTickets.id, ticketIds))
    : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const reports = await providerReportsFor(rows);

  res.json({
    deliveries: rows.map((m) => ({
      messageId: m.id,
      ticketId: m.ticketId,
      reference: supportTicketReference(m.ticketId),
      subject: ticketById.get(m.ticketId)?.subject ?? null,
      ticketStatus: ticketById.get(m.ticketId)?.status ?? null,
      writtenBy: m.sentByLabel,
      writtenAt: m.createdAt,
      excerpt: m.body.slice(0, 200),
      delivery: supportDeliveryView(m, Date.now(), reports.get(m.id) ?? null),
      resendRisk: supportResendRisk(m),
    })),
    counts: { open: total?.n ?? 0, returnedOnThisPage: rows.length },
    truncated: (total?.n ?? 0) > rows.length,
    definitions: {
      open: "Every unresolved delivery, counted over all of them rather than over this page — a display limit must never hide a client who did not get an answer.",
      uncertain: "The message may or may not have gone out. It is never retried automatically, because a machine repeating it could send the client a second copy.",
    },
  });
});

/**
 * A person's decision about a delivery that did not settle.
 *
 * Gated on `communications.send` rather than `support.write`, because two of
 * the three actions put mail in front of a customer. `acknowledge` is gated
 * the same way deliberately: closing a case that says a client never got their
 * answer is a decision about the client, not a housekeeping task.
 *
 * A reason is required. An unexplained recovery is not a record of anything.
 */
router.post("/crm/support/messages/:id/delivery-recovery", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid message." }); return; }

  const body = req.body as Record<string, unknown>;
  const action = inList(body["action"], CRM_SUPPORT_DELIVERY_ACTIONS) as CrmSupportDeliveryAction | undefined;
  if (!action) {
    res.status(400).json({ error: "Say what to do about it.", accepted: CRM_SUPPORT_DELIVERY_ACTIONS });
    return;
  }
  const reason = str(body["reason"]);
  if (!reason || reason.length < 3) {
    res.status(400).json({ error: "Say why. A recovery with no reason is not a record." });
    return;
  }

  const me = actor(req);
  const result = await recoverSupportDelivery({ messageId: id, action, reason, staffId: me.id });
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

  // A retry or a re-send only ARMED the row. The send itself happens in the
  // worker pass, which is what makes the decision survive this request — but
  // it is run once here so the operator sees an answer rather than a promise.
  if (action !== "acknowledge") await attemptSupportDelivery(id);

  const [after] = await db.select().from(crmSupportMessages)
    .where(eq(crmSupportMessages.id, id)).limit(1);

  await auditAction(req, `support.delivery_${action}`, `message:${id} ${reason.slice(0, 120)}`);
  res.json({
    delivery: after ? supportDeliveryView(after) : null,
    note: result.note,
  });
});

/**
 * One pass of the delivery worker, run by hand.
 *
 * The same function the scheduler tick should call. Exposed so an operator can
 * push a backlog through after fixing mail, and so this path is exercisable
 * without waiting on a timer.
 */
router.post("/crm/support/deliveries/process", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const result = await processDueSupportDeliveries(pageLimit(req.body?.["limit"]));
  await auditAction(req, "support.deliveries_processed", `recovered:${result.recovered} attempted:${result.attempted}`);
  res.json({
    ...result,
    definitions: {
      recovered: "Attempts whose worker died. They become 'outcome unknown' for a person to decide — never re-sent by a machine.",
      attempted: "Deliveries that were due and were handed to the mail provider on this pass.",
    },
  });
});

/**
 * Files client replies that have already arrived onto the tickets they answer.
 *
 * Correlation is not done here: the inbound pipeline already matched each one
 * to a conversation by the unforgeable token in our own Reply-To. This only
 * moves rows carrying that proof onto the ticket that owns the conversation.
 * A message matched by sender address lands on a conversation no ticket owns
 * and is therefore unreachable from here.
 */
router.post("/crm/support/inbound/ingest", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const ticketId = num((req.body as Record<string, unknown>)?.["ticketId"]);
  const result = await ingestSupportReplies(ticketId ? { ticketId } : {});
  await auditAction(req, "support.inbound_ingested", `filed:${result.filed}`);
  res.json({
    ...result,
    definition: "Only messages the inbound pipeline matched on this ticket's reply token are filed. The sender's address is an unauthenticated claim and is never used to place a message on a ticket.",
  });
});

/** Point a ticket at the article that answers it, or unlink one. */
router.post("/crm/support/tickets/:id/article", requireCrmAuth("support.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid ticket." }); return; }

  const raw = (req.body as { articleId?: unknown })?.articleId;
  const articleId = raw === null ? null : num(raw);
  if (raw !== null && articleId === undefined) {
    res.status(400).json({ error: "Say which article, or null to unlink." });
    return;
  }

  if (articleId != null) {
    const [article] = await db.select({ id: crmKbArticles.id })
      .from(crmKbArticles).where(eq(crmKbArticles.id, articleId)).limit(1);
    if (!article) { res.status(404).json({ error: "No such article." }); return; }
  }

  const [updated] = await db.update(crmSupportTickets)
    .set({ kbArticleId: articleId, updatedAt: new Date() })
    .where(eq(crmSupportTickets.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, "support.ticket_article", `ticket:${id} article:${articleId ?? "none"}`);
  res.json({ ticket: ticketShape(updated) });
});

// ── Knowledge base ──────────────────────────────────────────────────────────

/**
 * Articles, searchable and keyset-paged on the same principle as the queue.
 *
 * `status` defaults to nothing — staff see drafts and published articles
 * together, because a half-written answer is still the answer somebody is
 * looking for. A customer-facing surface would pass `status=published`.
 */
router.get("/crm/support/kb", requireCrmAuth("kb.read"), async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const status = inList(q["status"], CRM_KB_STATUSES);
  const category = str(q["category"]);
  const search = str(q["q"]);
  const limit = pageLimit(q["limit"]);
  const cursor = num(q["cursor"]);

  const base = [];
  if (status) base.push(eq(crmKbArticles.status, status));
  if (category) base.push(eq(crmKbArticles.category, category));
  if (search) {
    const like = `%${search}%`;
    base.push(or(
      ilike(crmKbArticles.title, like),
      ilike(crmKbArticles.body, like),
      ilike(crmKbArticles.slug, like),
      ilike(crmKbArticles.category, like),
    )!);
  }

  const filtered = base.length ? and(...base) : undefined;
  const paged = cursor !== undefined
    ? (base.length ? and(...base, lt(crmKbArticles.id, cursor)) : lt(crmKbArticles.id, cursor))
    : filtered;

  const rows = await db.select({
    id: crmKbArticles.id, slug: crmKbArticles.slug, title: crmKbArticles.title,
    category: crmKbArticles.category, status: crmKbArticles.status,
    authorStaffId: crmKbArticles.authorStaffId, authorLabel: crmKbArticles.authorLabel,
    updatedByLabel: crmKbArticles.updatedByLabel,
    publishedAt: crmKbArticles.publishedAt,
    createdAt: crmKbArticles.createdAt, updatedAt: crmKbArticles.updatedAt,
    // A list of articles does not need every body; a preview is enough to
    // recognise one, and dragging full articles through memory to render a
    // list is how a knowledge base gets slow as it gets useful.
    preview: sql<string>`left(${crmKbArticles.body}, 240)`,
  }).from(crmKbArticles)
    .where(paged)
    .orderBy(desc(crmKbArticles.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const [total] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmKbArticles).where(filtered);

  const categoryRows = await db.select({
    category: crmKbArticles.category, n: sql<number>`count(*)::int`,
  }).from(crmKbArticles).groupBy(crmKbArticles.category);

  res.json({
    articles: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    counts: {
      matchingFilters: total?.n ?? 0,
      returnedOnThisPage: page.length,
    },
    categories: categoryRows
      .filter((c) => c.category)
      .map((c) => ({ category: c.category as string, count: c.n })),
    definitions: {
      matchingFilters: "Articles matching exactly the filters on this request. Walking every page returns this many.",
      categories: "Every category in use across ALL articles, not just this page — it is a picker, not a summary of the result.",
      preview: "The first 240 characters of the body. Open the article for the rest.",
    },
  });
});

/** One article, by numeric id or by slug. */
router.get("/crm/support/kb/:idOrSlug", requireCrmAuth("kb.read"), async (req: Request, res: Response) => {
  const key = String(req.params["idOrSlug"] ?? "");
  const id = num(key);

  // Try the id, then fall back to the slug. An all-digit slug ("2024-pricing"
  // trimmed to "2024") is rare but legal, and resolving it only as an id would
  // 404 an article that plainly exists.
  let article = id !== undefined
    ? (await db.select().from(crmKbArticles).where(eq(crmKbArticles.id, id)).limit(1))[0]
    : undefined;
  if (!article) {
    article = (await db.select().from(crmKbArticles)
      .where(eq(crmKbArticles.slug, key)).limit(1))[0];
  }
  if (!article) { res.status(404).json({ error: "Not found." }); return; }

  // What this article has actually been used to answer.
  const linked = await db.select({
    id: crmSupportTickets.id, subject: crmSupportTickets.subject, status: crmSupportTickets.status,
  }).from(crmSupportTickets)
    .where(eq(crmSupportTickets.kbArticleId, article.id))
    .orderBy(desc(crmSupportTickets.id))
    .limit(20);

  res.json({
    article,
    linkedTickets: linked.map((t) => ({ ...t, reference: supportTicketReference(t.id) })),
  });
});

router.post("/crm/support/kb", requireCrmAuth("kb.write"), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const title = str(body["title"]);
  const articleBody = str(body["body"]);
  if (!title) { res.status(400).json({ error: "Give the article a title." }); return; }
  if (!articleBody) { res.status(400).json({ error: "An article with no body answers nothing." }); return; }

  const slug = slugify(str(body["slug"]) ?? title);
  if (!slug) { res.status(400).json({ error: "That title does not produce a usable web address. Give a slug." }); return; }

  const [clash] = await db.select({ id: crmKbArticles.id })
    .from(crmKbArticles).where(eq(crmKbArticles.slug, slug)).limit(1);
  if (clash) {
    res.status(409).json({
      error: `An article already uses the address "${slug}". Give this one a different slug.`,
      existingId: clash.id,
    });
    return;
  }

  const status = inList(body["status"], CRM_KB_STATUSES) ?? "draft";
  const me = actor(req);
  const now = new Date();

  const [article] = await db.insert(crmKbArticles).values({
    slug, title, body: articleBody,
    category: str(body["category"]) ?? null,
    status,
    authorStaffId: me.id, authorLabel: me.label,
    updatedByStaffId: me.id, updatedByLabel: me.label,
    publishedAt: status === "published" ? now : null,
  }).returning();

  await auditAction(req, "support.kb_created", `article:${article.id} ${slug}`);
  res.status(201).json({ article });
});

router.patch("/crm/support/kb/:id", requireCrmAuth("kb.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid article." }); return; }

  const body = req.body as Record<string, unknown>;
  const me = actor(req);
  const patch: Partial<typeof crmKbArticles.$inferInsert> = {
    updatedAt: new Date(), updatedByStaffId: me.id, updatedByLabel: me.label,
  };
  if (str(body["title"])) patch.title = str(body["title"]) as string;
  if (str(body["body"])) patch.body = str(body["body"]) as string;
  if (body["category"] !== undefined) patch.category = str(body["category"]) ?? null;
  if (str(body["slug"])) {
    const slug = slugify(str(body["slug"]) as string);
    if (!slug) { res.status(400).json({ error: "That slug is not usable." }); return; }
    const [clash] = await db.select({ id: crmKbArticles.id })
      .from(crmKbArticles).where(eq(crmKbArticles.slug, slug)).limit(1);
    if (clash && clash.id !== id) {
      res.status(409).json({ error: `An article already uses the address "${slug}".` });
      return;
    }
    patch.slug = slug;
  }

  const [article] = await db.update(crmKbArticles).set(patch)
    .where(eq(crmKbArticles.id, id)).returning();
  if (!article) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, "support.kb_updated", `article:${id}`);
  res.json({ article });
});

/**
 * Publish or unpublish. A deliberate act with a timestamp — the database
 * refuses a published article that cannot say when it was published.
 */
router.post("/crm/support/kb/:id/publish", requireCrmAuth("kb.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid article." }); return; }

  const raw = (req.body as { published?: unknown })?.published;
  if (typeof raw !== "boolean") {
    res.status(400).json({ error: "Say whether to publish (true) or unpublish (false)." });
    return;
  }

  const [existing] = await db.select().from(crmKbArticles)
    .where(eq(crmKbArticles.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found." }); return; }

  const me = actor(req);
  const now = new Date();
  const [article] = await db.update(crmKbArticles).set({
    status: raw ? "published" : "draft",
    // Keep the original publication date across an unpublish/republish, so
    // "published since" does not reset every time somebody fixes a typo.
    publishedAt: raw ? existing.publishedAt ?? now : existing.publishedAt,
    updatedAt: now, updatedByStaffId: me.id, updatedByLabel: me.label,
  }).where(eq(crmKbArticles.id, id)).returning();

  await auditAction(req, raw ? "support.kb_published" : "support.kb_unpublished", `article:${id}`);
  res.json({ article });
});

// ── Queue health ────────────────────────────────────────────────────────────

/**
 * The numbers a person running support actually needs, each with its basis.
 *
 * Deliberately absent: an average resolution time. The legacy helpdesk returned
 * a hard-coded 4.2 hours and an "assigned to me" count of 3. A made-up number
 * on a dashboard is worse than a missing one, because somebody acts on it.
 */
router.get("/crm/support/overview", requireCrmAuth("support.read"), async (req: Request, res: Response) => {
  const me = actor(req);

  const statusRows = await db.select({
    status: crmSupportTickets.status, n: sql<number>`count(*)::int`,
  }).from(crmSupportTickets).groupBy(crmSupportTickets.status);

  const priorityRows = await db.select({
    priority: crmSupportTickets.priority, n: sql<number>`count(*)::int`,
  }).from(crmSupportTickets)
    .where(inArray(crmSupportTickets.status, [...CRM_SUPPORT_ACTIVE_STATUSES]))
    .groupBy(crmSupportTickets.priority);

  const [unassigned] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmSupportTickets)
    .where(and(
      inArray(crmSupportTickets.status, [...CRM_SUPPORT_ACTIVE_STATUSES]),
      isNull(crmSupportTickets.assignedToStaffId),
    ));

  const [awaitingFirstReply] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmSupportTickets)
    .where(and(
      inArray(crmSupportTickets.status, [...CRM_SUPPORT_ACTIVE_STATUSES]),
      isNull(crmSupportTickets.firstResponseAt),
    ));

  const mine = me.id != null
    ? await db.select({ n: sql<number>`count(*)::int` })
        .from(crmSupportTickets)
        .where(and(
          inArray(crmSupportTickets.status, [...CRM_SUPPORT_ACTIVE_STATUSES]),
          eq(crmSupportTickets.assignedToStaffId, me.id),
        ))
    : [];

  const byStatus: Record<string, number> = {};
  for (const s of CRM_SUPPORT_STATUSES) byStatus[s] = 0;
  for (const r of statusRows) byStatus[r.status] = r.n;

  const byPriority: Record<string, number> = {};
  for (const p of CRM_SUPPORT_PRIORITIES) byPriority[p] = 0;
  for (const r of priorityRows) byPriority[r.priority] = r.n;

  const [articles] = await db.select({ n: sql<number>`count(*)::int` }).from(crmKbArticles);
  const [published] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmKbArticles).where(eq(crmKbArticles.status, "published"));

  // Replies that were written and did not reach the client. The most important
  // number on this screen, because every one of them is somebody still waiting
  // for an answer they believe was sent.
  const [undelivered] = await db.select({ n: sql<number>`count(*)::int` })
    .from(crmSupportMessages)
    .where(and(
      isNull(crmSupportMessages.deliveryResolvedAt),
      or(
        inArray(crmSupportMessages.deliveryState, ["refused", "uncertain"]),
        and(
          eq(crmSupportMessages.deliveryState, "pending"),
          isNull(crmSupportMessages.nextAttemptAt),
        ),
      ),
    ));

  res.json({
    byStatus,
    activeByPriority: byPriority,
    unassignedActive: unassigned?.n ?? 0,
    awaitingFirstReply: awaitingFirstReply?.n ?? 0,
    assignedToMe: me.id != null ? mine[0]?.n ?? 0 : null,
    knowledgeBase: { total: articles?.n ?? 0, published: published?.n ?? 0 },
    deliveriesNeedingAttention: undelivered?.n ?? 0,
    delivery: supportDeliveryStatus(),
    definitions: {
      deliveriesNeedingAttention: "Replies written to a client that were refused, whose outcome is unknown, or that never reached a mail provider at all. Each one is a person still waiting.",
      activeByPriority: "Open work only — new, open and waiting on the customer. Resolved and closed tickets are excluded because their urgency is no longer a call on anybody's time.",
      awaitingFirstReply: "Active tickets where nobody here has yet sent the customer anything. An internal note does not count: it is not a reply to the person waiting.",
      assignedToMe: "Null when the request arrived on the legacy shared token, because that token is not a person and cannot own a ticket.",
      resolutionTime: "Not reported. Recording started with this release, so there is no history to average yet, and a made-up figure on a dashboard is worse than a missing one.",
    },
  });
});

export default router;
