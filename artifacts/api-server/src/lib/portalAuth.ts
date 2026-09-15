// ── M4: customer portal authentication and record scoping ───────────────────
//
// The THIRD authentication system in this server, and deliberately the smallest
// one. It shares no cookie, no table, no header and no helper with either of
// the other two.
//
//   CRM staff        `crm_staff_session`     → a crm_staff row + permissions
//   Receptionist     `receptionist_session`  → an intake_firms row
//   Customer portal  `crm_portal_session`    → ONE crm_leads row
//
// Two properties matter more than anything else here, and both are structural
// rather than remembered:
//
//  1. A portal session cannot reach a staff route. Not "is refused by" —
//     cannot. `resolveStaffSession` reads the cookie named
//     `crm_staff_session`; a portal holder does not have one, so every
//     `/api/crm/*` route answers 401 before any handler runs. Nothing in this
//     file is consulted by that path, and nothing in staffAuth.ts is consulted
//     by this one.
//
//  2. Record isolation happens at the data layer. Every read the portal
//     performs goes through one of the `scoped*` helpers below, each of which
//     builds `lead_id = <session's contact>` into the WHERE clause itself. A
//     route cannot forget the filter, because a route never writes the filter.
//     Anything not matched comes back as 404 via `refuse()` — never 403, which
//     would confirm the record exists.

import type { NextFunction, Request, Response } from "express";
import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  crmPortalAccounts, crmPortalSessions, crmPortalDocumentGrants,
  crmLeads, crmProjects, crmDeals, crmTransactions,
  crmAttachments, crmDocumentRequests,
  crmQuotes, crmQuoteLineItems, crmInvoices, crmInvoiceLineItems,
  crmSupportTickets, crmSupportMessages, crmStaffLoginAttempts,
  type CrmPortalAccount,
} from "@workspace/db";
import { generateToken, hashToken } from "./staffCredentials.js";
import { deriveClientIp } from "./staffAuth.js";
// The refusal wording and the re-issue checks are shared with the staff gate.
// That module holds no session state, reads no cookie and touches no table, so
// the separation above is unchanged: the portal still resolves only its own
// cookie and rotates only its own session row.
import {
  createReissueLimiter, refuseCrossSiteReissue, refuseInvalidCsrfToken, refuseTooManyReissues,
} from "./csrfRecovery.js";

// ── Cookie, header and clocks ───────────────────────────────────────────────

/** Distinct from `crm_staff_session` and `receptionist_session` by design. */
export const PORTAL_COOKIE_NAME = "crm_portal_session";

/**
 * Distinct from the staff CSRF header (`x-csrf-token`) too. Same reasoning one
 * level down: a value minted for one system should not be spendable in
 * another, even accidentally, even by our own code.
 */
export const PORTAL_CSRF_HEADER = "x-portal-csrf";

/**
 * The portal's own TTL, and shorter than the receptionist's 30 days.
 *
 * A customer signs in occasionally to check on work, read an invoice or send a
 * file — there is no all-day working session to preserve. 14 days absolute
 * keeps "stay signed in on my laptop" working across a fortnight; 72 hours idle
 * means a session abandoned on a borrowed machine stops being useful within
 * days rather than within a month.
 */
export const PORTAL_ABSOLUTE_MS = 14 * 24 * 60 * 60 * 1000;
export const PORTAL_IDLE_MS = 72 * 60 * 60 * 1000;

/** How long an invitation stays usable unless staff shorten it. */
export const PORTAL_INVITE_DEFAULT_HOURS = 168; // 7 days

export function portalCookieOptions(maxAgeMs = PORTAL_ABSOLUTE_MS) {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    // `lax` still sends the cookie when the customer follows a link back into
    // the portal, but not on cross-site subrequests; mutations additionally
    // require the CSRF header, which a cross-site caller cannot read.
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
  };
}

// ── Login throttling ────────────────────────────────────────────────────────
//
// The portal borrows the staff attempt ledger (`crm_staff_login_attempts`) —
// one table, namespaced subjects, no new schema — but NOT the staff limits,
// and the difference is a real availability decision rather than a tidiness
// one.
//
// `deriveClientIp` defaults to the socket address (TRUSTED_PROXY_HOPS = 0),
// which behind a proxy is the SAME address for every visitor. The staff limit
// of 20 failures per 15 minutes is fine for three people who know their own
// passwords. Applied to customers it is a self-inflicted outage: twenty fumbled
// logins anywhere in the customer base — or by one attacker — would lock out
// every client at once, and the lockout would look exactly like the site being
// broken.
//
// So the two buckets are given the jobs they are each actually good at:
//
//   account  8 per 15 minutes. This is what protects one customer's password,
//            and it stays as tight as the staff limit because guessing a
//            single password is what it defends against.
//   ip       60 per 15 minutes. This bounds spraying across many accounts from
//            one source without turning a shared NAT into a shared outage.
//
// Neither is access control, and neither is presented as such.

export const PORTAL_LOGIN_ACCOUNT_LIMIT = 8;
export const PORTAL_LOGIN_IP_LIMIT = 60;
export const PORTAL_LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Namespaced so the portal's counters can never collide with the staff ones. */
export const portalAttemptSubject = (scope: "ip" | "account", value: string): string =>
  `portal-${scope}:${value}`.slice(0, 200);

export async function recordPortalLoginAttempt(scope: "ip" | "account", value: string): Promise<void> {
  try {
    await db.insert(crmStaffLoginAttempts)
      .values({ scope, subject: portalAttemptSubject(scope, value) });
  } catch { /* throttling must never be the reason a request 500s */ }
}

/** True when the caller has exceeded the window and must be refused. */
export async function portalThrottled(scope: "ip" | "account", value: string): Promise<boolean> {
  const since = new Date(Date.now() - PORTAL_LOGIN_WINDOW_MS);
  const limit = scope === "ip" ? PORTAL_LOGIN_IP_LIMIT : PORTAL_LOGIN_ACCOUNT_LIMIT;
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(crmStaffLoginAttempts)
      .where(and(
        eq(crmStaffLoginAttempts.scope, scope),
        eq(crmStaffLoginAttempts.subject, portalAttemptSubject(scope, value)),
        gte(crmStaffLoginAttempts.createdAt, since),
      ));
    return Number(row?.count ?? 0) >= limit;
  } catch {
    // Cannot read the ledger: refuse rather than allow unlimited attempts.
    return true;
  }
}

export async function clearPortalLoginAttempts(scope: "ip" | "account", value: string): Promise<void> {
  try {
    await db.delete(crmStaffLoginAttempts).where(and(
      eq(crmStaffLoginAttempts.scope, scope),
      eq(crmStaffLoginAttempts.subject, portalAttemptSubject(scope, value)),
    ));
  } catch { /* best effort */ }
}

// ── The single refusal ──────────────────────────────────────────────────────

/**
 * Every "no" the portal says, for every reason.
 *
 * A record that belongs to somebody else, a record that does not exist, a
 * revoked invitation and a token that was never real all answer identically.
 * A 403 on somebody else's invoice confirms the invoice exists and that the
 * number was worth guessing; a 404 says nothing at all.
 */
export function refuse(res: Response): void {
  res.status(404).json({ error: "Not found." });
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface IssuedPortalSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  sessionId: number;
}

export async function createPortalSession(args: {
  account: Pick<CrmPortalAccount, "id" | "leadId" | "sessionEpoch">;
  ip: string | undefined;
  userAgent: string | undefined;
}): Promise<IssuedPortalSession> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + PORTAL_ABSOLUTE_MS);
  const [row] = await db.insert(crmPortalSessions).values({
    portalAccountId: args.account.id,
    leadId: args.account.leadId,
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrfToken),
    epoch: args.account.sessionEpoch,
    expiresAt,
    ip: args.ip ?? null,
    userAgent: args.userAgent?.slice(0, 500) ?? null,
  }).returning({ id: crmPortalSessions.id });
  return { token, csrfToken, expiresAt, sessionId: row.id };
}

/**
 * A resolved customer.
 *
 * `leadId` is the tenant key and the only scoping value the portal ever uses.
 * It comes off the SESSION row, not off a request parameter, not off a body
 * field, and not off anything a caller can influence.
 */
export interface ResolvedPortal {
  accountId: number;
  leadId: number;
  email: string;
  sessionId: number;
  csrfHash: string;
}

/**
 * Resolves the portal cookie to a live session and an active account.
 *
 * Returns undefined for every failure mode — unknown token, revoked,
 * idle-expired, absolutely expired, stale epoch, disabled account, missing
 * contact — so no caller can accidentally distinguish them.
 */
export async function resolvePortalSession(req: Request): Promise<ResolvedPortal | undefined> {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const raw = cookies?.[PORTAL_COOKIE_NAME];
  if (typeof raw !== "string" || raw.length === 0) return undefined;

  const now = new Date();
  try {
    const [row] = await db
      .select({ session: crmPortalSessions, account: crmPortalAccounts })
      .from(crmPortalSessions)
      .innerJoin(crmPortalAccounts, eq(crmPortalSessions.portalAccountId, crmPortalAccounts.id))
      .where(and(
        eq(crmPortalSessions.tokenHash, hashToken(raw)),
        isNull(crmPortalSessions.revokedAt),
        gt(crmPortalSessions.expiresAt, now),
      ))
      .limit(1);

    if (!row) return undefined;
    if (row.account.status !== "active") return undefined;
    if (row.session.epoch !== row.account.sessionEpoch) return undefined;
    if (now.getTime() - row.session.lastSeenAt.getTime() > PORTAL_IDLE_MS) return undefined;
    // The session's tenant and the account's tenant must agree. They are
    // written together and can only diverge through direct database surgery,
    // which is exactly when you want the session to stop working.
    if (row.session.leadId !== row.account.leadId) return undefined;

    try {
      await db.update(crmPortalSessions)
        .set({ lastSeenAt: now })
        .where(eq(crmPortalSessions.id, row.session.id));
    } catch { /* the session is still valid for THIS request */ }

    return {
      accountId: row.account.id,
      leadId: row.account.leadId,
      email: row.account.email,
      sessionId: row.session.id,
      csrfHash: row.session.csrfHash,
    };
  } catch {
    // Session storage unreachable: deny. Nothing sits behind this gate.
    return undefined;
  }
}

export async function destroyPortalSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  try {
    await db.update(crmPortalSessions)
      .set({ revokedAt: new Date() })
      .where(eq(crmPortalSessions.tokenHash, hashToken(rawToken)));
  } catch { /* best effort */ }
}

/** Ends every session an account holds, by bumping its epoch. */
export async function revokeAllPortalSessions(accountId: number): Promise<void> {
  await db.update(crmPortalAccounts)
    .set({ sessionEpoch: sql`${crmPortalAccounts.sessionEpoch} + 1`, updatedAt: new Date() })
    .where(eq(crmPortalAccounts.id, accountId));
}

// ── The gate ────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portalAuth?: ResolvedPortal;
    }
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function portalCsrfRejected(req: Request, resolved: ResolvedPortal): boolean {
  if (!MUTATING.has(req.method)) return false;
  const header = req.headers[PORTAL_CSRF_HEADER];
  const provided = Array.isArray(header) ? header[0] : header;
  if (typeof provided !== "string" || provided.length === 0) return true;
  return hashToken(provided) !== resolved.csrfHash;
}

/**
 * The portal gate. There is no permission argument and there never will be: a
 * portal session grants exactly one thing — the contact's own records — and
 * anything finer would be a role system for customers, which is a different
 * product.
 */
export function requirePortalAuth() {
  return async function portalGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const resolved = await resolvePortalSession(req);
    if (!resolved) {
      res.status(401).json({ error: "Sign in to see your account." });
      return;
    }
    if (portalCsrfRejected(req, resolved)) {
      refuseInvalidCsrfToken(res);
      return;
    }
    req.portalAuth = resolved;
    next();
  };
}

// ── Security-token re-issue ─────────────────────────────────────────────────
//
// The portal keeps its CSRF token in `sessionStorage`, which is per tab. A
// customer who opens the portal in a new tab — following an emailed link while
// still signed in, say — has a valid session cookie and no token, so every write
// was refused, and the refusal told them to refresh, which cannot put a token
// into that tab. `POST /api/portal/session/csrf` gives the live session a fresh
// one. lib/csrfRecovery.ts explains what stands in for the CSRF check there.

/**
 * Rotates the CSRF token of ONE live portal session and returns the new raw
 * value, or undefined when the session is gone. Stored exactly as sign-in stores
 * it — only the hash, on the session row — and the previous token stops working
 * at once.
 */
export async function reissuePortalCsrfToken(sessionId: number): Promise<string | undefined> {
  const csrfToken = generateToken();
  const rows = await db.update(crmPortalSessions)
    .set({ csrfHash: hashToken(csrfToken) })
    .where(and(eq(crmPortalSessions.id, sessionId), isNull(crmPortalSessions.revokedAt)))
    .returning({ id: crmPortalSessions.id });
  return rows.length > 0 ? csrfToken : undefined;
}

export interface PortalCsrfReissueContext {
  sessionId: number;
}

const portalCsrfReissueLimiter = createReissueLimiter();

/**
 * The gate for `POST /api/portal/session/csrf`, and deliberately not
 * `requirePortalAuth()`, which demands the very token the caller has lost.
 *
 * It requires a request from our own pages, then a LIVE portal session resolved
 * from the portal cookie by the same resolution every portal route uses. It sets
 * nothing on the request that a scoped read could mistake for authorisation:
 * the only thing the handler learns is which session row to rotate.
 */
export function requirePortalSessionForCsrfReissue() {
  return async function portalCsrfReissueGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (refuseCrossSiteReissue(req, res)) return;
    const resolved = await resolvePortalSession(req);
    if (!resolved) {
      res.status(401).json({ error: "Sign in to see your account." });
      return;
    }
    const key = `portal-session:${resolved.sessionId}`;
    if (portalCsrfReissueLimiter.isOverLimit(key)) {
      refuseTooManyReissues(res);
      return;
    }
    portalCsrfReissueLimiter.record(key);
    const context: PortalCsrfReissueContext = { sessionId: resolved.sessionId };
    res.locals["portalCsrfReissue"] = context;
    next();
  };
}

/**
 * The tenant key for this request.
 *
 * Throws rather than returning a default if it is ever called outside the gate.
 * A scoping helper that silently fell back to "no filter" is the single worst
 * failure this module can have, so it is made impossible to reach by accident.
 */
export function portalScope(req: Request): number {
  const leadId = req.portalAuth?.leadId;
  if (typeof leadId !== "number") {
    throw new Error("portalScope called outside requirePortalAuth");
  }
  return leadId;
}

export function portalClientIp(req: Request): string {
  return deriveClientIp(req);
}

// ── Scoped reads ────────────────────────────────────────────────────────────
//
// Everything below takes the tenant key FIRST and builds it into the query.
// There is no unscoped variant of any of these, and no route in crmPortal.ts
// queries these tables directly — which is what makes "the route might forget
// the filter" not a thing that can happen.

/** The contact themselves. Undefined if the row has since been deleted. */
export async function scopedContact(leadId: number) {
  const [row] = await db.select({
    id: crmLeads.id, name: crmLeads.name, company: crmLeads.company,
    email: crmLeads.email, phone: crmLeads.phone,
  }).from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  return row;
}

export async function scopedProjects(leadId: number) {
  return db.select().from(crmProjects)
    .where(and(eq(crmProjects.leadId, leadId), isNull(crmProjects.archivedAt)))
    .orderBy(desc(crmProjects.id));
}

export async function scopedProject(leadId: number, projectId: number) {
  const [row] = await db.select().from(crmProjects)
    .where(and(eq(crmProjects.id, projectId), eq(crmProjects.leadId, leadId)))
    .limit(1);
  return row;
}

export async function scopedDeals(leadId: number) {
  return db.select().from(crmDeals)
    .where(eq(crmDeals.leadId, leadId))
    .orderBy(desc(crmDeals.id));
}

export async function scopedDeal(leadId: number, dealId: number) {
  const [row] = await db.select().from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.leadId, leadId)))
    .limit(1);
  return row;
}

/**
 * Payments.
 *
 * `crm_transactions.lead_id` is nullable, and a row created from a deal may
 * carry only `deal_id`. Both branches are still contact-scoped: the deal id
 * list is itself derived from this contact, so widening the query cannot widen
 * the tenant.
 */
export async function scopedTransactions(leadId: number) {
  const deals = await db.select({ id: crmDeals.id }).from(crmDeals)
    .where(eq(crmDeals.leadId, leadId));
  const dealIds = deals.map((d) => d.id);
  const where = dealIds.length
    ? or(eq(crmTransactions.leadId, leadId), inArray(crmTransactions.dealId, dealIds))
    : eq(crmTransactions.leadId, leadId);
  return db.select().from(crmTransactions).where(where).orderBy(desc(crmTransactions.id));
}

/**
 * Documents the customer is allowed to see.
 *
 * The join to `crm_portal_document_grants` IS the authorisation. There is no
 * path in this module that reads `crm_attachments` without it.
 */
export async function scopedDocuments(leadId: number) {
  return db.select({
    id: crmAttachments.id,
    filename: crmAttachments.filename,
    mimeType: crmAttachments.mimeType,
    sizeBytes: crmAttachments.sizeBytes,
    createdAt: crmAttachments.createdAt,
    uploadedByLabel: crmAttachments.uploadedByLabel,
    uploadedByStaffId: crmAttachments.uploadedByStaffId,
    grantedAt: crmPortalDocumentGrants.createdAt,
  })
    .from(crmPortalDocumentGrants)
    .innerJoin(crmAttachments, eq(crmPortalDocumentGrants.attachmentId, crmAttachments.id))
    .where(and(
      eq(crmPortalDocumentGrants.leadId, leadId),
      isNull(crmPortalDocumentGrants.revokedAt),
      isNull(crmAttachments.deletedAt),
    ))
    .orderBy(desc(crmAttachments.id));
}

export async function scopedDocument(leadId: number, attachmentId: number) {
  const [row] = await db.select({ attachment: crmAttachments })
    .from(crmPortalDocumentGrants)
    .innerJoin(crmAttachments, eq(crmPortalDocumentGrants.attachmentId, crmAttachments.id))
    .where(and(
      eq(crmPortalDocumentGrants.leadId, leadId),
      eq(crmPortalDocumentGrants.attachmentId, attachmentId),
      isNull(crmPortalDocumentGrants.revokedAt),
      isNull(crmAttachments.deletedAt),
    ))
    .limit(1);
  return row?.attachment;
}

/**
 * Outstanding document requests addressed to this contact.
 *
 * Only `entity_type = 'lead'` requests are shown. A request hung off a project
 * or a deal is staff chasing something internally; surfacing it would put
 * internal chase notes ("get the margin sheet off Dan") in front of a customer.
 */
export async function scopedDocumentRequests(leadId: number) {
  return db.select({
    id: crmDocumentRequests.id,
    title: crmDocumentRequests.title,
    description: crmDocumentRequests.description,
    status: crmDocumentRequests.status,
    dueDate: crmDocumentRequests.dueDate,
    requestedAt: crmDocumentRequests.requestedAt,
  }).from(crmDocumentRequests)
    .where(and(
      eq(crmDocumentRequests.entityType, "lead"),
      eq(crmDocumentRequests.entityId, leadId),
    ))
    .orderBy(desc(crmDocumentRequests.id));
}

export async function scopedDocumentRequest(leadId: number, requestId: number) {
  const [row] = await db.select().from(crmDocumentRequests)
    .where(and(
      eq(crmDocumentRequests.id, requestId),
      eq(crmDocumentRequests.entityType, "lead"),
      eq(crmDocumentRequests.entityId, leadId),
    ))
    .limit(1);
  return row;
}

export async function scopedTickets(leadId: number) {
  return db.select().from(crmSupportTickets)
    .where(eq(crmSupportTickets.leadId, leadId))
    .orderBy(desc(crmSupportTickets.id));
}

export async function scopedTicket(leadId: number, ticketId: number) {
  const [row] = await db.select().from(crmSupportTickets)
    .where(and(eq(crmSupportTickets.id, ticketId), eq(crmSupportTickets.leadId, leadId)))
    .limit(1);
  return row;
}

/**
 * A ticket's thread as the customer may see it.
 *
 * TWO conditions, both required, and both here rather than in a route:
 * the ticket must belong to this contact, AND the message must be
 * `visibility = 'customer'`. There is no portal code path that selects
 * `crm_support_messages` without both, so an internal note cannot reach a
 * customer through a body, a count, a preview or an error — the rows are never
 * fetched in the first place.
 */
// ── M5: quotes and invoices ─────────────────────────────────────────────────
//
// TWO conditions on every one of these, both built into the query rather than
// left to a route: the record must belong to this contact, AND it must have
// left draft.
//
// The second is not a nicety. A draft is a figure somebody is still arguing
// about internally — a price that has not been agreed, a discount being
// considered, a line item about to be removed. Showing one to a customer would
// be worse than showing them nothing, and "the route remembers to filter on
// status" is exactly the guarantee that stops being true the day somebody adds
// a second route.

/** Quote statuses a customer may see. `draft` is deliberately absent. */
const PORTAL_VISIBLE_QUOTE_STATUSES = ["sent", "accepted", "declined", "expired"] as const;

/** Invoice statuses a customer may see. `draft` is deliberately absent. */
const PORTAL_VISIBLE_INVOICE_STATUSES = ["issued", "part_paid", "paid", "void"] as const;

export async function scopedQuotes(leadId: number) {
  return db.select().from(crmQuotes)
    .where(and(
      eq(crmQuotes.leadId, leadId),
      inArray(crmQuotes.status, [...PORTAL_VISIBLE_QUOTE_STATUSES]),
    ))
    .orderBy(desc(crmQuotes.id));
}

export async function scopedQuote(leadId: number, quoteId: number) {
  const [row] = await db.select().from(crmQuotes)
    .where(and(
      eq(crmQuotes.id, quoteId),
      eq(crmQuotes.leadId, leadId),
      inArray(crmQuotes.status, [...PORTAL_VISIBLE_QUOTE_STATUSES]),
    ))
    .limit(1);
  return row;
}

/**
 * Line items for this contact's quotes, fetched in one pass.
 *
 * The join to `crm_quotes` carries the tenant AND the visibility filter, so a
 * draft's lines are never selected even though the caller asked only for a
 * quote id list.
 */
export async function scopedQuoteLines(leadId: number, quoteIds: number[]) {
  if (quoteIds.length === 0) return [];
  return db.select({
    id: crmQuoteLineItems.id,
    quoteId: crmQuoteLineItems.quoteId,
    position: crmQuoteLineItems.position,
    description: crmQuoteLineItems.description,
    quantity: crmQuoteLineItems.quantity,
    unitPrice: crmQuoteLineItems.unitPrice,
    lineTotal: crmQuoteLineItems.lineTotal,
  })
    .from(crmQuoteLineItems)
    .innerJoin(crmQuotes, eq(crmQuoteLineItems.quoteId, crmQuotes.id))
    .where(and(
      inArray(crmQuoteLineItems.quoteId, quoteIds),
      eq(crmQuotes.leadId, leadId),
      inArray(crmQuotes.status, [...PORTAL_VISIBLE_QUOTE_STATUSES]),
    ))
    .orderBy(crmQuoteLineItems.position);
}

export async function scopedInvoices(leadId: number) {
  return db.select().from(crmInvoices)
    .where(and(
      eq(crmInvoices.leadId, leadId),
      inArray(crmInvoices.status, [...PORTAL_VISIBLE_INVOICE_STATUSES]),
    ))
    .orderBy(desc(crmInvoices.id));
}

export async function scopedInvoiceLines(leadId: number, invoiceIds: number[]) {
  if (invoiceIds.length === 0) return [];
  return db.select({
    id: crmInvoiceLineItems.id,
    invoiceId: crmInvoiceLineItems.invoiceId,
    position: crmInvoiceLineItems.position,
    description: crmInvoiceLineItems.description,
    quantity: crmInvoiceLineItems.quantity,
    unitPrice: crmInvoiceLineItems.unitPrice,
    lineTotal: crmInvoiceLineItems.lineTotal,
  })
    .from(crmInvoiceLineItems)
    .innerJoin(crmInvoices, eq(crmInvoiceLineItems.invoiceId, crmInvoices.id))
    .where(and(
      inArray(crmInvoiceLineItems.invoiceId, invoiceIds),
      eq(crmInvoices.leadId, leadId),
      inArray(crmInvoices.status, [...PORTAL_VISIBLE_INVOICE_STATUSES]),
    ))
    .orderBy(crmInvoiceLineItems.position);
}

export async function scopedTicketMessages(leadId: number, ticketId: number) {
  return db.select({
    id: crmSupportMessages.id,
    body: crmSupportMessages.body,
    origin: crmSupportMessages.origin,
    sentByLabel: crmSupportMessages.sentByLabel,
    createdAt: crmSupportMessages.createdAt,
  })
    .from(crmSupportMessages)
    .innerJoin(crmSupportTickets, eq(crmSupportMessages.ticketId, crmSupportTickets.id))
    .where(and(
      eq(crmSupportMessages.ticketId, ticketId),
      eq(crmSupportMessages.visibility, "customer"),
      eq(crmSupportTickets.leadId, leadId),
    ))
    .orderBy(crmSupportMessages.id);
}
