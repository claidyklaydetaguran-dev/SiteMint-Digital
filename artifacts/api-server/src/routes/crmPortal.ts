// ── M4: the customer portal ─────────────────────────────────────────────────
//
// Two route families live here, and the split is the whole security model.
//
//   /api/crm/portal/*   STAFF routes. `requireCrmAuth`, a named permission,
//                       audited. They grant, revoke and list access.
//   /api/portal/*       CUSTOMER routes. `requirePortalAuth`, and every read
//                       goes through a `scoped*` helper in lib/portalAuth.ts
//                       that builds the contact's id into the WHERE clause.
//
// A portal session cannot reach the first family: those routes resolve
// `crm_staff_session`, and a customer does not have one. A staff session cannot
// reach the second: those routes resolve `crm_portal_session`, and a staff
// member does not have one. Neither statement depends on a check somebody
// remembered to write.
//
// ── What this deliberately does NOT claim ───────────────────────────────────
//
// Nothing here is a signature. A customer accepting a proposal has clicked a
// button while holding a session; a customer uploading a PDF has sent us bytes.
// Both are recorded as exactly that, and every payload that touches either
// carries `signatureStatus: "not_a_signature"` from a single shared helper so
// the wording cannot drift.

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  crmPortalAccounts, crmPortalInvitations, crmPortalDocumentGrants,
  crmPortalProposalAcceptances,
  crmAttachments, crmAttachmentBlobs, crmDocumentRequests,
  crmLeads, crmSupportTickets, crmSupportMessages,
  crmQuotes, crmActivities,
  CRM_SUPPORT_REQUEST_TYPES,
  TRANSACTION_RECEIVED_STATUS,
  PORTAL_ACCEPTANCE_LABEL,
  canTransitionQuote, invoiceReference, quoteReference,
  portalSignatureDisclosure, portalTicketReference,
} from "@workspace/db";
import { requireCrmAuth, auditAction, deriveClientIp } from "../lib/staffAuth.js";
import {
  generateToken, hashToken, hashPassword, verifyPassword, refusePassword,
} from "../lib/staffCredentials.js";
import { trySendStaffMail } from "../lib/staffMail.js";
import {
  PORTAL_COOKIE_NAME, PORTAL_INVITE_DEFAULT_HOURS,
  portalCookieOptions, createPortalSession, destroyPortalSession,
  requirePortalAuth, portalScope, refuse,
  portalThrottled, recordPortalLoginAttempt, clearPortalLoginAttempts,
  scopedContact, scopedProjects, scopedProject, scopedDeals, scopedDeal,
  scopedTransactions, scopedDocuments, scopedDocument,
  scopedDocumentRequests, scopedDocumentRequest,
  scopedQuotes, scopedQuote, scopedQuoteLines,
  scopedInvoices, scopedInvoiceLines,
  scopedTickets, scopedTicket, scopedTicketMessages,
} from "../lib/portalAuth.js";

const router: IRouter = Router();

// ── Limits ──────────────────────────────────────────────────────────────────

/**
 * 64 KiB per customer upload, and this number is a CONSTRAINT, not a policy.
 *
 * `app.ts` installs a global `express.json()` with the default 100 KB body
 * limit, and it runs before this router is mounted, so a larger base64 body is
 * rejected by the parser with a 413 that never reaches this file. Capping here
 * means the customer gets a readable message about a real limit instead of a
 * bare parser error about a limit nobody told them about.
 *
 * Raising it is an app.ts change — an `express.json({ limit })` registered for
 * `/api/portal/documents` ahead of the global parser, exactly as
 * `DISCOVERY_V1_PATH` already does. That file is not owned here; see
 * docs/crm-ops/PORTAL-AND-MOBILE.md.
 */
const PORTAL_UPLOAD_MAX_BYTES = 64 * 1024;

/**
 * What a customer may send us. Narrower than the staff document store's list:
 * no `application/zip` (an archive is an envelope whose contents nobody has
 * looked at) and no Office macro-capable legacy formats beyond what the staff
 * store already accepts. SVG is excluded for the same reason it is there — it
 * executes in a browser context.
 */
const PORTAL_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** Deal stages a customer is shown as a proposal. */
const PROPOSAL_STAGES = new Set(["Proposal", "Won"]);

// ── Small helpers ───────────────────────────────────────────────────────────

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : undefined;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const normalizeEmail = (v: unknown): string => str(v).toLowerCase();

function staffActor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName ?? s?.email ?? "admin" };
}

/**
 * Where an invitation link points. `CRM_PUBLIC_BASE_URL` is the deployment's
 * own address; without it a link would be built from whatever host happened to
 * make the request, which is attacker-controllable. Returns null rather than
 * guessing, and the caller reports that honestly.
 */
function portalAcceptUrl(token: string): string | null {
  const base = process.env["CRM_PUBLIC_BASE_URL"] ?? process.env["CRM_BASE_URL"];
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/portal/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Always an attachment, never inline. Serving customer- or staff-uploaded bytes
 * inline lets a crafted file execute in this origin; `attachment` plus
 * `nosniff` keeps the browser from being clever about it.
 */
function sendPortalFile(res: Response, filename: string, mimeType: string, bytes: Buffer): void {
  const safe = filename.replace(/[^\w. -]/g, "_");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  res.setHeader("Content-Length", String(bytes.length));
  res.end(bytes);
}

/**
 * The customer-visible shape of a support ticket.
 *
 * Everything staff-side is dropped rather than filtered: no assignee, no
 * internal `resolutionNote`, no `lastStaffMessageAt` (which an internal note
 * moves, and which would therefore leak that internal activity happened and
 * when), no `openedByLabel`. `lastUpdateAt` is recomputed from things the
 * customer can actually see, so the list cannot become a side channel for
 * "somebody wrote a note about you at 14:32".
 */
function customerTicket(
  t: typeof crmSupportTickets.$inferSelect,
  lastVisibleMessageAt: Date | null,
) {
  const candidates = [t.createdAt, lastVisibleMessageAt, t.resolvedAt, t.closedAt]
    .filter((d): d is Date => d instanceof Date);
  const lastUpdateAt = candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b), t.createdAt);
  return {
    id: t.id,
    reference: portalTicketReference(t.id),
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    requestType: t.requestType,
    // The closed resolution vocabulary only ("fixed", "answered", …). The free
    // text beside it is staff writing to staff and never leaves this server.
    resolution: t.resolution,
    createdAt: t.createdAt,
    lastUpdateAt,
  };
}

// ── M5: quotes and invoices, as the customer may see them ───────────────────
//
// Both serialisers DROP rather than filter, the same discipline `customerTicket`
// uses. `internalNotes` is the field that matters: it is staff writing to staff
// ("their budget is soft, hold the discount back"), and it must not be able to
// reach a customer through a body, a preview, a count or an error. It is not
// redacted here — it is simply never read into the payload.

const asMoney = (stored: string | null) => Number(stored ?? 0) || 0;

function customerLine(line: {
  id: number; position: number; description: string;
  quantity: string; unitPrice: string; lineTotal: string;
}) {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: asMoney(line.quantity),
    unitPrice: asMoney(line.unitPrice),
    lineTotal: asMoney(line.lineTotal),
  };
}

function customerQuote(
  quote: Awaited<ReturnType<typeof scopedQuotes>>[number],
  lines: Awaited<ReturnType<typeof scopedQuoteLines>>,
) {
  const expired = quote.status === "expired"
    || (quote.status === "sent" && quote.validUntil != null && quote.validUntil.getTime() < Date.now());
  return {
    id: quote.id,
    reference: quoteReference(quote.id),
    title: quote.title,
    status: quote.status,
    currency: quote.currency,
    subtotal: asMoney(quote.subtotal),
    discountAmount: asMoney(quote.discountAmount),
    total: asMoney(quote.total),
    // The customer-facing note only. `internalNotes` is not read.
    notes: quote.notes,
    validUntil: quote.validUntil,
    sentAt: quote.sentAt,
    lineItems: lines.filter((l) => l.quoteId === quote.id).map(customerLine),
    /** Only a live, unexpired, unanswered quote can be accepted. */
    canAccept: quote.status === "sent" && !expired,
    expired,
    acceptance: quote.acceptedAt
      ? {
          acceptedAt: quote.acceptedAt,
          typedName: quote.acceptedTypedName,
          // Never "signed", in any field, on any path.
          label: PORTAL_ACCEPTANCE_LABEL,
          ...portalSignatureDisclosure(),
        }
      : null,
    documentId: quote.documentAttachmentId,
  };
}

function customerInvoice(
  invoice: Awaited<ReturnType<typeof scopedInvoices>>[number],
  lines: Awaited<ReturnType<typeof scopedInvoiceLines>>,
) {
  const total = asMoney(invoice.total);
  const paid = asMoney(invoice.amountPaid);
  const outstanding = invoice.status === "void" ? 0 : Math.max(total - paid, 0);
  return {
    id: invoice.id,
    reference: invoiceReference(invoice.id),
    title: invoice.title,
    status: invoice.status,
    currency: invoice.currency,
    subtotal: asMoney(invoice.subtotal),
    discountAmount: asMoney(invoice.discountAmount),
    total,
    amountPaid: paid,
    amountOutstanding: outstanding,
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    overdue: outstanding > 0 && invoice.dueDate != null && invoice.dueDate.getTime() < Date.now(),
    lineItems: lines.filter((l) => l.invoiceId === invoice.id).map(customerLine),
    documentId: invoice.documentAttachmentId,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// STAFF ROUTES — /api/crm/portal/*
// ══════════════════════════════════════════════════════════════════════════
//
// Permission: `leads.write` to grant or revoke a customer's access,
// `leads.read` to see what has been granted. Granting a customer sight of
// their own file is a change to the relationship with that contact, which is
// what `leads.write` governs.
//
// A dedicated `portal.invite` permission would be a better fit than borrowing
// `leads.write`, and staffPermissions.ts is owned elsewhere — the request is
// recorded in docs/crm-ops/PORTAL-AND-MOBILE.md rather than made here.

router.post("/crm/portal/invitations", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const leadId = num(b["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Say which contact this is for." }); return; }

  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const email = normalizeEmail(b["email"] ?? lead.email);
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "That contact has no usable email address." }); return;
  }

  // An address already used by ANOTHER contact's portal account would make two
  // tenants share one login. Refuse rather than resolve it silently.
  const [clash] = await db.select({ id: crmPortalAccounts.id, leadId: crmPortalAccounts.leadId })
    .from(crmPortalAccounts).where(eq(crmPortalAccounts.email, email)).limit(1);
  if (clash && clash.leadId !== leadId) {
    res.status(409).json({ error: "Another contact already uses that email address for portal access." });
    return;
  }

  const hours = Math.min(Math.max(num(b["expiresInHours"]) ?? PORTAL_INVITE_DEFAULT_HOURS, 1), 24 * 30);
  const me = staffActor(req);
  const token = generateToken();

  // Outstanding invitations for this contact are superseded, so "send them
  // another one" cannot leave two live links to the same account.
  await db.update(crmPortalInvitations)
    .set({ revokedAt: new Date(), revokedByStaffId: me.id })
    .where(and(
      eq(crmPortalInvitations.leadId, leadId),
      isNull(crmPortalInvitations.acceptedAt),
      isNull(crmPortalInvitations.revokedAt),
    ));

  const [invitation] = await db.insert(crmPortalInvitations).values({
    leadId, email,
    tokenHash: hashToken(token),
    createdByStaffId: me.id,
    createdByLabel: me.label,
    expiresAt: new Date(Date.now() + hours * 3600_000),
  }).returning();

  const url = portalAcceptUrl(token);
  // `trySendStaffMail` is the seam that keeps a development or test run out of
  // a real mailbox: while CRM_EMAIL_TEST_MODE is anything but the exact string
  // "false", nothing is handed to the provider at all. It never throws.
  const outcome = url
    ? await trySendStaffMail({
        to: email,
        subject: "Your SiteMint project portal",
        text: [
          `Hello ${lead.name},`,
          "",
          "You can now see your projects, documents, invoices and support requests in one place.",
          "",
          `Set your password here: ${url}`,
          "",
          `This link works once and expires in ${hours} hours.`,
        ].join("\n"),
        idempotencyKey: `portal-invite-${invitation.id}`,
      })
    : { sent: false as const, failure: "not_configured" as const, reason: "CRM_PUBLIC_BASE_URL is not set, so no link could be built.", configured: false };

  await db.update(crmPortalInvitations).set({
    deliveryState: outcome.sent ? "sent" : outcome.failure,
    deliveryDetail: outcome.sent ? null : outcome.reason.slice(0, 500),
  }).where(eq(crmPortalInvitations.id, invitation.id));

  // The target names the contact and the invitation, never the token.
  await auditAction(req, "portal.invited", `lead:${leadId} invitation:${invitation.id}`);

  res.status(201).json({
    invitation: {
      id: invitation.id, leadId, email,
      expiresAt: invitation.expiresAt,
      delivery: outcome.sent ? "sent" : outcome.failure,
      deliveryDetail: outcome.sent ? null : outcome.reason,
    },
    // Returned exactly once, here, so a staff member can hand the link over
    // themselves when mail is not configured.
    inviteToken: token,
    invitePath: url ?? "/portal/accept?token=<token>",
  });
});

router.get("/crm/portal/invitations", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const leadId = num(req.query["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Say which contact to list." }); return; }
  const rows = await db.select({
    id: crmPortalInvitations.id,
    email: crmPortalInvitations.email,
    createdByLabel: crmPortalInvitations.createdByLabel,
    createdAt: crmPortalInvitations.createdAt,
    expiresAt: crmPortalInvitations.expiresAt,
    acceptedAt: crmPortalInvitations.acceptedAt,
    revokedAt: crmPortalInvitations.revokedAt,
    deliveryState: crmPortalInvitations.deliveryState,
    deliveryDetail: crmPortalInvitations.deliveryDetail,
  }).from(crmPortalInvitations)
    .where(eq(crmPortalInvitations.leadId, leadId))
    .orderBy(desc(crmPortalInvitations.id));

  const [account] = await db.select({
    id: crmPortalAccounts.id, email: crmPortalAccounts.email,
    status: crmPortalAccounts.status, lastSignInAt: crmPortalAccounts.lastSignInAt,
  }).from(crmPortalAccounts).where(eq(crmPortalAccounts.leadId, leadId)).limit(1);

  res.json({ invitations: rows, account: account ?? null });
});

router.post("/crm/portal/invitations/:id/revoke", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const me = staffActor(req);
  const [revoked] = await db.update(crmPortalInvitations)
    .set({ revokedAt: new Date(), revokedByStaffId: me.id })
    .where(and(eq(crmPortalInvitations.id, id), isNull(crmPortalInvitations.revokedAt)))
    .returning({ id: crmPortalInvitations.id, leadId: crmPortalInvitations.leadId });
  if (!revoked) { res.status(404).json({ error: "No active invitation with that id." }); return; }
  await auditAction(req, "portal.invitation_revoked", `invitation:${id} lead:${revoked.leadId}`);
  res.json({ ok: true });
});

/**
 * Shut a customer out.
 *
 * Disabling the account AND bumping its epoch, so every session already issued
 * dies on its next request rather than living out its fortnight.
 */
router.post("/crm/portal/accounts/:leadId/revoke", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid id." }); return; }
  const [account] = await db.update(crmPortalAccounts)
    .set({ status: "disabled", sessionEpoch: sql`${crmPortalAccounts.sessionEpoch} + 1`, updatedAt: new Date() })
    .where(eq(crmPortalAccounts.leadId, leadId))
    .returning({ id: crmPortalAccounts.id });
  if (!account) { res.status(404).json({ error: "That contact has no portal account." }); return; }
  await db.update(crmPortalInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(crmPortalInvitations.leadId, leadId), isNull(crmPortalInvitations.acceptedAt), isNull(crmPortalInvitations.revokedAt)));
  await auditAction(req, "portal.access_revoked", `lead:${leadId} account:${account.id}`);
  res.json({ ok: true });
});

/** Make one document visible to one contact's portal. Default-deny until this. */
router.post("/crm/portal/document-grants", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const leadId = num(b["leadId"]);
  const attachmentId = num(b["attachmentId"]);
  if (!leadId || !attachmentId) {
    res.status(400).json({ error: "Say which document and which contact." }); return;
  }
  const [attachment] = await db.select({ id: crmAttachments.id, filename: crmAttachments.filename })
    .from(crmAttachments)
    .where(and(eq(crmAttachments.id, attachmentId), isNull(crmAttachments.deletedAt))).limit(1);
  if (!attachment) { res.status(404).json({ error: "That document does not exist." }); return; }
  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const me = staffActor(req);
  const [grant] = await db.insert(crmPortalDocumentGrants).values({
    leadId, attachmentId,
    grantedByStaffId: me.id, grantedByLabel: me.label,
  }).onConflictDoUpdate({
    target: [crmPortalDocumentGrants.leadId, crmPortalDocumentGrants.attachmentId],
    set: { revokedAt: null, grantedByStaffId: me.id, grantedByLabel: me.label },
  }).returning();

  await auditAction(req, "portal.document_granted", `lead:${leadId} attachment:${attachmentId} ${attachment.filename}`);
  res.status(201).json({ grant });
});

router.delete("/crm/portal/document-grants/:id", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [revoked] = await db.update(crmPortalDocumentGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(crmPortalDocumentGrants.id, id), isNull(crmPortalDocumentGrants.revokedAt)))
    .returning({ id: crmPortalDocumentGrants.id, leadId: crmPortalDocumentGrants.leadId, attachmentId: crmPortalDocumentGrants.attachmentId });
  if (!revoked) { res.status(404).json({ error: "No active grant with that id." }); return; }
  await auditAction(req, "portal.document_grant_revoked", `lead:${revoked.leadId} attachment:${revoked.attachmentId}`);
  res.json({ ok: true });
});

router.get("/crm/portal/document-grants", requireCrmAuth("documents.read"), async (req: Request, res: Response) => {
  const leadId = num(req.query["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Say which contact to list." }); return; }
  const rows = await db.select({
    id: crmPortalDocumentGrants.id,
    attachmentId: crmPortalDocumentGrants.attachmentId,
    filename: crmAttachments.filename,
    grantedByLabel: crmPortalDocumentGrants.grantedByLabel,
    createdAt: crmPortalDocumentGrants.createdAt,
    revokedAt: crmPortalDocumentGrants.revokedAt,
  }).from(crmPortalDocumentGrants)
    .innerJoin(crmAttachments, eq(crmPortalDocumentGrants.attachmentId, crmAttachments.id))
    .where(eq(crmPortalDocumentGrants.leadId, leadId))
    .orderBy(desc(crmPortalDocumentGrants.id));
  res.json({ grants: rows });
});

// ══════════════════════════════════════════════════════════════════════════
// CUSTOMER ROUTES — /api/portal/*
// ══════════════════════════════════════════════════════════════════════════

// ── Getting in ──────────────────────────────────────────────────────────────

/**
 * Redeem a single-use invitation and set a password.
 *
 * Every refusal — expired, revoked, already used, never existed — answers
 * identically, so the endpoint cannot be used to learn which tokens are real.
 * The consuming UPDATE is conditional on the invitation still being unused, so
 * two simultaneous redemptions cannot both succeed.
 */
async function acceptInvitation(rawToken: string, password: string): Promise<
  | { ok: true; account: { id: number; leadId: number; sessionEpoch: number } }
  | { ok: false }
> {
  if (rawToken.length < 20) return { ok: false };

  const [invitation] = await db.select().from(crmPortalInvitations)
    .where(and(
      eq(crmPortalInvitations.tokenHash, hashToken(rawToken)),
      isNull(crmPortalInvitations.revokedAt),
      isNull(crmPortalInvitations.acceptedAt),
      sql`${crmPortalInvitations.expiresAt} > now()`,
    )).limit(1);
  if (!invitation) return { ok: false };

  // Single-use, enforced by the database rather than by the order of the reads
  // above: whichever request updates the row first is the one that redeems it.
  const [consumed] = await db.update(crmPortalInvitations)
    .set({ acceptedAt: new Date() })
    .where(and(
      eq(crmPortalInvitations.id, invitation.id),
      isNull(crmPortalInvitations.acceptedAt),
      isNull(crmPortalInvitations.revokedAt),
    ))
    .returning({ id: crmPortalInvitations.id });
  if (!consumed) return { ok: false };

  const passwordHash = await hashPassword(password);
  const [account] = await db.insert(crmPortalAccounts).values({
    leadId: invitation.leadId,
    email: invitation.email,
    passwordHash,
    status: "active",
  }).onConflictDoUpdate({
    target: crmPortalAccounts.leadId,
    // Re-inviting an existing customer resets the password and, through the
    // epoch bump, ends every session the previous holder had.
    set: {
      email: invitation.email,
      passwordHash,
      status: "active",
      sessionEpoch: sql`${crmPortalAccounts.sessionEpoch} + 1`,
      updatedAt: new Date(),
    },
  }).returning({ id: crmPortalAccounts.id, leadId: crmPortalAccounts.leadId, sessionEpoch: crmPortalAccounts.sessionEpoch });

  return { ok: true, account };
}

router.post("/portal/invitations/accept", async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const rawToken = str(b["token"]);
  const password = typeof b["password"] === "string" ? b["password"] : "";

  const weak = refusePassword(password);
  if (weak) { res.status(400).json({ error: weak }); return; }

  const result = await acceptInvitation(rawToken, password);
  if (!result.ok) { res.status(404).json({ error: "This link is not valid." }); return; }

  const issued = await createPortalSession({
    account: result.account,
    ip: deriveClientIp(req),
    userAgent: req.headers["user-agent"],
  });
  await db.update(crmPortalAccounts).set({ lastSignInAt: new Date() })
    .where(eq(crmPortalAccounts.id, result.account.id));

  res.cookie(PORTAL_COOKIE_NAME, issued.token, portalCookieOptions());
  const contact = await scopedContact(result.account.leadId);
  res.status(201).json({
    csrfToken: issued.csrfToken,
    expiresAt: issued.expiresAt,
    contact: contact ? { name: contact.name, company: contact.company, email: contact.email } : null,
  });
});

router.post("/portal/login", async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const email = normalizeEmail(b["email"]);
  const password = typeof b["password"] === "string" ? b["password"] : "";
  const ip = deriveClientIp(req);

  // Portal-specific limits over the shared ledger — see the reasoning in
  // portalAuth.ts. The account bucket protects one password; the IP bucket
  // bounds spraying without turning a shared NAT into a shared outage.
  if (await portalThrottled("ip", ip) || await portalThrottled("account", email)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const deny = async () => {
    await recordPortalLoginAttempt("ip", ip);
    await recordPortalLoginAttempt("account", email);
    // One answer for "no such account", "wrong password" and "access revoked".
    res.status(401).json({ error: "Those details did not match an account." });
  };

  if (!email || !password) { await deny(); return; }

  const [account] = await db.select().from(crmPortalAccounts)
    .where(eq(crmPortalAccounts.email, email)).limit(1);
  if (!account || account.status !== "active") { await deny(); return; }
  if (!(await verifyPassword(password, account.passwordHash))) { await deny(); return; }

  await clearPortalLoginAttempts("account", email);
  const issued = await createPortalSession({
    account, ip, userAgent: req.headers["user-agent"],
  });
  await db.update(crmPortalAccounts).set({ lastSignInAt: new Date() })
    .where(eq(crmPortalAccounts.id, account.id));

  res.cookie(PORTAL_COOKIE_NAME, issued.token, portalCookieOptions());
  const contact = await scopedContact(account.leadId);
  res.json({
    csrfToken: issued.csrfToken,
    expiresAt: issued.expiresAt,
    contact: contact ? { name: contact.name, company: contact.company, email: contact.email } : null,
  });
});

router.post("/portal/logout", requirePortalAuth(), async (req: Request, res: Response) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  await destroyPortalSession(cookies?.[PORTAL_COOKIE_NAME] ?? "");
  res.clearCookie(PORTAL_COOKIE_NAME, portalCookieOptions(0));
  res.json({ ok: true });
});

router.get("/portal/me", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const contact = await scopedContact(leadId);
  if (!contact) { refuse(res); return; }
  res.json({
    contact: { name: contact.name, company: contact.company, email: contact.email, phone: contact.phone },
    signedInAs: req.portalAuth?.email ?? null,
  });
});

// ── The dashboard ───────────────────────────────────────────────────────────

router.get("/portal/overview", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const contact = await scopedContact(leadId);
  if (!contact) { refuse(res); return; }

  const [projects, documents, requests, tickets, transactions, quotes, invoices] = await Promise.all([
    scopedProjects(leadId),
    scopedDocuments(leadId),
    scopedDocumentRequests(leadId),
    scopedTickets(leadId),
    scopedTransactions(leadId),
    scopedQuotes(leadId),
    scopedInvoices(leadId),
  ]);

  const outstanding = requests.filter((r) => r.status === "pending");
  const openTickets = tickets.filter((t) => ["new", "open", "waiting_on_customer"].includes(t.status));
  const received = transactions
    .filter((t) => t.status === TRANSACTION_RECEIVED_STATUS)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // M5. Only invoices that were actually issued count here — `scopedInvoices`
  // never returns a draft — so this is a balance somebody asked for, not a gap
  // inferred between a deal's value and the money received.
  const amountOutstanding = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + Math.max((Number(i.total) || 0) - (Number(i.amountPaid) || 0), 0), 0);
  const awaitingAnswer = quotes.filter(
    (q) => q.status === "sent" && (q.validUntil == null || q.validUntil.getTime() >= Date.now()),
  );

  res.json({
    contact: { name: contact.name, company: contact.company },
    counts: {
      projects: projects.length,
      documents: documents.length,
      documentsRequested: outstanding.length,
      openRequests: openTickets.length,
      quotesAwaitingYou: awaitingAnswer.length,
      invoicesOutstanding: invoices.filter((i) => ["issued", "part_paid"].includes(i.status)).length,
    },
    // Named for what it is. "Paid to date" is money that arrived, and it is not
    // netted against anything or presented as a balance the portal cannot know.
    paidToDate: received,
    amountOutstanding,
    definitions: {
      paidToDate: "Money we have actually received from you.",
      amountOutstanding: "Invoices issued to you, less what has arrived against them.",
    },
    // The one thing the customer is being asked to do, if there is one. A quote
    // waiting on them comes first: it is the item where nothing moves until
    // they answer.
    nextActionForYou: awaitingAnswer.length
      ? { kind: "quote", title: awaitingAnswer[0].title, id: awaitingAnswer[0].id }
      : outstanding.length
        ? { kind: "document", title: outstanding[0].title, id: outstanding[0].id }
        : null,
  });
});

// ── Projects ────────────────────────────────────────────────────────────────

function customerProject(p: Awaited<ReturnType<typeof scopedProjects>>[number]) {
  return {
    id: p.id,
    name: p.name,
    projectType: p.projectType,
    stage: p.stage,
    startDate: p.startDate,
    targetLaunchDate: p.targetLaunchDate,
    // `nextAction` is written by staff for staff; `blockedReason` and `notes`
    // likewise. None of the three are shown.
    updatedAt: p.updatedAt,
  };
}

router.get("/portal/projects", requirePortalAuth(), async (req: Request, res: Response) => {
  const rows = await scopedProjects(portalScope(req));
  res.json({ projects: rows.map(customerProject) });
});

router.get("/portal/projects/:id", requirePortalAuth(), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { refuse(res); return; }
  const project = await scopedProject(portalScope(req), id);
  if (!project) { refuse(res); return; }
  res.json({ project: customerProject(project) });
});

// ── Documents ───────────────────────────────────────────────────────────────

router.get("/portal/documents", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const [documents, requests] = await Promise.all([
    scopedDocuments(leadId),
    scopedDocumentRequests(leadId),
  ]);
  res.json({
    documents: documents.map((d) => ({
      id: d.id, filename: d.filename, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
      from: d.uploadedByStaffId ? "SiteMint" : "You",
      ...portalSignatureDisclosure(),
    })),
    requests: requests.map((r) => ({
      id: r.id, title: r.title, description: r.description,
      status: r.status, dueDate: r.dueDate, requestedAt: r.requestedAt,
      overdue: r.status === "pending" && r.dueDate != null && r.dueDate.getTime() < Date.now(),
    })),
  });
});

router.get("/portal/documents/:id/download", requirePortalAuth(), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { refuse(res); return; }
  const attachment = await scopedDocument(portalScope(req), id);
  if (!attachment) { refuse(res); return; }
  const [blob] = await db.select().from(crmAttachmentBlobs)
    .where(eq(crmAttachmentBlobs.attachmentId, attachment.id)).limit(1);
  if (!blob) { refuse(res); return; }
  sendPortalFile(res, attachment.filename, attachment.mimeType, blob.bytes);
});

/**
 * Upload a requested document.
 *
 * The upload must name a document request, and that request must belong to
 * this contact — the portal is not a general file drop. The attachment lands
 * against `lead:<contact>` and a grant is written in the same breath, so the
 * customer can see the thing they just sent.
 */
router.post("/portal/documents", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const b = req.body as Record<string, unknown>;
  const requestId = num(b["documentRequestId"]);
  const filename = str(b["filename"]);
  const mimeType = str(b["mimeType"]);
  const base64 = typeof b["contentBase64"] === "string" ? b["contentBase64"] : "";

  if (!requestId) { res.status(400).json({ error: "Say which request this answers." }); return; }
  const request = await scopedDocumentRequest(leadId, requestId);
  // Somebody else's request is indistinguishable from one that never existed.
  if (!request) { refuse(res); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: "That request is no longer open." }); return;
  }
  if (filename.length < 1 || filename.length > 255) {
    res.status(400).json({ error: "Give the file a name (1–255 characters)." }); return;
  }
  if (!PORTAL_ALLOWED_MIME.has(mimeType)) {
    res.status(415).json({
      error: `Files of type "${mimeType || "unknown"}" are not accepted.`,
      accepted: [...PORTAL_ALLOWED_MIME],
    });
    return;
  }
  if (!base64) { res.status(400).json({ error: "The file was empty." }); return; }

  let bytes: Buffer;
  try { bytes = Buffer.from(base64, "base64"); }
  catch { res.status(400).json({ error: "The file content could not be read." }); return; }
  if (bytes.length === 0) { res.status(400).json({ error: "The file was empty." }); return; }
  if (bytes.length > PORTAL_UPLOAD_MAX_BYTES) {
    res.status(413).json({
      error: `That file is ${(bytes.length / 1024).toFixed(0)} KB. The limit is ${PORTAL_UPLOAD_MAX_BYTES / 1024} KB.`,
    });
    return;
  }

  const contact = await scopedContact(leadId);
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const [previous] = await db.select().from(crmAttachments).where(and(
    eq(crmAttachments.entityType, "lead"),
    eq(crmAttachments.entityId, leadId),
    eq(crmAttachments.filename, filename),
    isNull(crmAttachments.deletedAt),
  )).orderBy(desc(crmAttachments.version)).limit(1);

  const [attachment] = await db.insert(crmAttachments).values({
    entityType: "lead", entityId: leadId, filename, mimeType,
    sizeBytes: bytes.length,
    storageKey: "db:crm_attachment_blobs",
    contentHash,
    version: previous ? previous.version + 1 : 1,
    supersedesId: previous?.id ?? null,
    // No staff id, and a label that says plainly who sent it. A file from a
    // customer must never read as a file from us.
    uploadedByStaffId: null,
    uploadedByLabel: `Customer: ${contact?.name ?? "portal"}`,
  }).returning();

  await db.insert(crmAttachmentBlobs).values({ attachmentId: attachment.id, bytes });
  await db.insert(crmPortalDocumentGrants).values({
    leadId, attachmentId: attachment.id,
    grantedByStaffId: null, grantedByLabel: "Uploaded by the customer",
  }).onConflictDoNothing();

  const [satisfied] = await db.update(crmDocumentRequests).set({
    status: "received", receivedAt: new Date(),
    receivedAttachmentId: attachment.id, updatedAt: new Date(),
  }).where(and(
    eq(crmDocumentRequests.id, requestId),
    eq(crmDocumentRequests.entityType, "lead"),
    eq(crmDocumentRequests.entityId, leadId),
    eq(crmDocumentRequests.status, "pending"),
  )).returning({ id: crmDocumentRequests.id });

  res.status(201).json({
    document: {
      id: attachment.id, filename: attachment.filename,
      mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt, from: "You",
      ...portalSignatureDisclosure(),
    },
    satisfiedRequestId: satisfied?.id ?? null,
  });
});

// ── Proposals ───────────────────────────────────────────────────────────────

router.get("/portal/proposals", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const deals = (await scopedDeals(leadId)).filter((d) => PROPOSAL_STAGES.has(d.stage));
  const acceptances = await db.select().from(crmPortalProposalAcceptances)
    .where(eq(crmPortalProposalAcceptances.leadId, leadId));
  const byDeal = new Map(acceptances.map((a) => [a.dealId, a]));

  // M5: quotes are the itemised version of the same conversation — a headline
  // deal value says what the work costs, a quote says what it is made of. They
  // are returned together rather than on a second page, because a customer
  // looking at "what have you offered me" wants one answer.
  const quotes = await scopedQuotes(leadId);
  const quoteLines = await scopedQuoteLines(leadId, quotes.map((q) => q.id));

  res.json({
    quotes: quotes.map((q) => customerQuote(q, quoteLines)),
    proposals: deals.map((d) => {
      const accepted = byDeal.get(d.id);
      return {
        id: d.id,
        name: d.name,
        value: Number(d.value),
        stage: d.stage,
        closeDate: d.closeDate,
        canAccept: d.stage === "Proposal" && !accepted,
        acceptance: accepted
          ? {
              acceptedAt: accepted.acceptedAt,
              typedName: accepted.typedName,
              // Never "signed", in any field, on any path.
              label: PORTAL_ACCEPTANCE_LABEL,
              ...portalSignatureDisclosure(),
            }
          : null,
      };
    }),
    // Said once, at the top, so it is on screen next to the button.
    disclosure: "Accepting records your agreement in writing. It is not an electronic signature and does not replace a signed contract.",
  });
});

router.post("/portal/proposals/:dealId/accept", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const dealId = num(req.params["dealId"]);
  if (!dealId) { refuse(res); return; }

  const deal = await scopedDeal(leadId, dealId);
  // Another contact's deal answers exactly as a deal that does not exist.
  if (!deal) { refuse(res); return; }
  if (deal.stage !== "Proposal") {
    res.status(409).json({ error: "That proposal is not open for acceptance." }); return;
  }

  const typedName = str((req.body as Record<string, unknown>)["typedName"]);
  if (typedName.length < 2) {
    res.status(400).json({ error: "Type your name to confirm." }); return;
  }

  const [acceptance] = await db.insert(crmPortalProposalAcceptances).values({
    leadId, dealId,
    portalAccountId: req.portalAuth?.accountId ?? null,
    typedName,
    acceptedFromIp: deriveClientIp(req),
    dealValueAtAcceptance: deal.value,
    dealNameAtAcceptance: deal.name,
  }).onConflictDoNothing().returning();

  // Already accepted: report the original, do not record a second agreement.
  const [current] = acceptance
    ? [acceptance]
    : await db.select().from(crmPortalProposalAcceptances)
        .where(eq(crmPortalProposalAcceptances.dealId, dealId)).limit(1);

  // The deal is NOT moved to Won here. Closing a deal is a staff act with its
  // own route, permission and audit entry; a customer's click does not get to
  // change what the business believes it has sold.
  res.status(acceptance ? 201 : 200).json({
    acceptance: {
      dealId,
      acceptedAt: current.acceptedAt,
      typedName: current.typedName,
      label: PORTAL_ACCEPTANCE_LABEL,
      ...portalSignatureDisclosure(),
    },
    created: Boolean(acceptance),
    note: "Your acceptance has been recorded. This is not an electronic signature.",
  });
});

/**
 * A customer accepting a QUOTE.
 *
 * Same act, same wording, same refusal to overstate it as accepting a proposal
 * — and two additional rules the quote carries that a bare deal cannot:
 *
 *  1. The transition goes through `canTransitionQuote`, the ONE declared state
 *     machine, so a customer cannot accept a draft, an expired quote, or one
 *     that has already been declined.
 *  2. The acceptance is bound to a deal. `crm_quotes` has a check constraint
 *     saying an accepted quote names one, so "which deal did they agree to"
 *     always has an answer.
 *
 * Like the proposal route, this does NOT move the deal to Won. Closing a deal
 * is a staff act with its own route, permission and audit entry.
 */
router.post("/portal/quotes/:id/accept", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const id = num(req.params["id"]);
  if (!id) { refuse(res); return; }

  // Somebody else's quote — and a draft nobody has sent — are indistinguishable
  // from a quote that does not exist, because `scopedQuote` never selects them.
  const quote = await scopedQuote(leadId, id);
  if (!quote) { refuse(res); return; }

  // A double-click is not two agreements, and it is not an error either. This
  // is checked BEFORE the state machine: `accepted → accepted` is correctly not
  // a transition, so the machine would refuse a second click with a 409 that
  // reads like something went wrong. Report the original instead, exactly as
  // the proposal route does.
  if (quote.status === "accepted") {
    res.status(200).json({
      acceptance: {
        quoteId: quote.id,
        dealId: quote.acceptedDealId,
        acceptedAt: quote.acceptedAt,
        typedName: quote.acceptedTypedName,
        label: PORTAL_ACCEPTANCE_LABEL,
        ...portalSignatureDisclosure(),
      },
      created: false,
      note: "You had already accepted this quote. Nothing was recorded twice.",
    });
    return;
  }

  if (!canTransitionQuote(quote.status as "sent", "accepted")) {
    res.status(409).json({ error: "That quote is not open for acceptance." }); return;
  }
  if (quote.validUntil != null && quote.validUntil.getTime() < Date.now()) {
    res.status(409).json({ error: "That quote has passed its expiry date. Ask us for a fresh one." }); return;
  }
  if (!quote.dealId) {
    // The check constraint would refuse the write anyway; saying so here gives
    // the customer an answer they can act on instead of a 500.
    res.status(409).json({
      error: "That quote is not ready to be accepted yet. Your SiteMint contact can sort it out.",
    });
    return;
  }

  const typedName = str((req.body as Record<string, unknown>)["typedName"]);
  if (typedName.length < 2) {
    res.status(400).json({ error: "Type your name to confirm." }); return;
  }

  const now = new Date();
  // Conditional on the quote still being `sent`, so two simultaneous clicks
  // cannot both record an acceptance.
  const [accepted] = await db.update(crmQuotes).set({
    status: "accepted",
    acceptedAt: now,
    acceptedDealId: quote.dealId,
    acceptedTypedName: typedName,
    acceptedFromIp: deriveClientIp(req),
    acceptedByPortalAccountId: req.portalAuth?.accountId ?? null,
    updatedAt: now,
  }).where(and(
    eq(crmQuotes.id, quote.id),
    eq(crmQuotes.leadId, leadId),
    eq(crmQuotes.status, "sent"),
  )).returning();

  if (!accepted) {
    const current = await scopedQuote(leadId, id);
    res.status(200).json({
      acceptance: current?.acceptedAt
        ? {
            quoteId: id,
            acceptedAt: current.acceptedAt,
            typedName: current.acceptedTypedName,
            label: PORTAL_ACCEPTANCE_LABEL,
            ...portalSignatureDisclosure(),
          }
        : null,
      created: false,
      note: "This quote had already been answered. Nothing was recorded twice.",
    });
    return;
  }

  await db.insert(crmActivities).values({
    leadId,
    type: "quote_accepted",
    title: `Quote ${quoteReference(accepted.id)} accepted by the customer: ${accepted.title}`,
    description: `${accepted.currency} ${accepted.total}. Recorded as agreement in writing, not as a signature.`,
    createdBy: `Customer: ${typedName}`,
  });

  res.status(201).json({
    acceptance: {
      quoteId: accepted.id,
      dealId: accepted.acceptedDealId,
      acceptedAt: accepted.acceptedAt,
      typedName: accepted.acceptedTypedName,
      label: PORTAL_ACCEPTANCE_LABEL,
      ...portalSignatureDisclosure(),
    },
    created: true,
    note: "Your acceptance has been recorded. This is not an electronic signature.",
  });
});

// ── Money ───────────────────────────────────────────────────────────────────

router.get("/portal/invoices", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const [transactions, deals] = await Promise.all([
    scopedTransactions(leadId),
    scopedDeals(leadId),
  ]);
  const dealNames = new Map(deals.map((d) => [d.id, d.name]));

  const payments = transactions.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    method: t.method,
    status: t.status,
    // The one status that means the money is actually in the bank, imported
    // rather than spelled out — the reason TRANSACTION_RECEIVED_STATUS exists.
    settled: t.status === TRANSACTION_RECEIVED_STATUS,
    receivedAt: t.receivedAt,
    createdAt: t.createdAt,
    forDeal: dealNames.get(t.dealId) ?? null,
  }));

  // M5: the invoices themselves, alongside the payments they were settled by.
  // Before this the page could only answer "what have you paid us"; a customer
  // asking "what do I owe" had to ring somebody.
  const invoices = await scopedInvoices(leadId);
  const invoiceLines = await scopedInvoiceLines(leadId, invoices.map((i) => i.id));
  const customerInvoices = invoices.map((i) => customerInvoice(i, invoiceLines));

  res.json({
    invoices: customerInvoices,
    payments,
    totals: {
      paidToDate: payments.filter((p) => p.settled).reduce((s, p) => s + p.amount, 0),
      pending: payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0),
      // Only now that invoices exist is this a figure anybody computed. It is
      // the sum of what was actually invoiced and not yet settled — not a guess
      // at the difference between a deal's value and the money received, which
      // is what a "balance" would have been before M5 and why the page refused
      // to show one.
      outstanding: customerInvoices.reduce((s, i) => s + i.amountOutstanding, 0),
      overdue: customerInvoices.filter((i) => i.overdue).reduce((s, i) => s + i.amountOutstanding, 0),
    },
    definitions: {
      paidToDate: "Money we have actually received from you.",
      pending: "Payments started but not yet settled. Not a balance owed.",
      outstanding: "Invoices we have issued to you, less what has arrived against them. Voided invoices are excluded.",
      overdue: "The part of that which is past its due date.",
    },
  });
});

// ── Support ─────────────────────────────────────────────────────────────────

router.get("/portal/tickets", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const tickets = await scopedTickets(leadId);
  const withTimes = await Promise.all(tickets.map(async (t) => {
    // Only customer-visible messages are ever fetched, so the timestamp cannot
    // be moved by an internal note.
    const messages = await scopedTicketMessages(leadId, t.id);
    const last = messages.length ? messages[messages.length - 1].createdAt : null;
    return { ...customerTicket(t, last), messageCount: messages.length };
  }));
  res.json({ tickets: withTimes });
});

router.get("/portal/tickets/:id", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const id = num(req.params["id"]);
  if (!id) { refuse(res); return; }
  const ticket = await scopedTicket(leadId, id);
  if (!ticket) { refuse(res); return; }

  const messages = await scopedTicketMessages(leadId, id);
  const last = messages.length ? messages[messages.length - 1].createdAt : null;
  res.json({
    ticket: customerTicket(ticket, last),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      from: m.origin === "customer" ? "You" : "SiteMint",
      // Staff display names are shown; staff ids and internal labels are not.
      author: m.origin === "customer" ? null : m.sentByLabel,
      createdAt: m.createdAt,
    })),
  });
});

router.post("/portal/tickets", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const b = req.body as Record<string, unknown>;
  const subject = str(b["subject"]);
  const body = str(b["body"]);
  const requestType = str(b["requestType"]) || "other";

  if (subject.length < 3) { res.status(400).json({ error: "Give your request a short title." }); return; }
  if (body.length < 3) { res.status(400).json({ error: "Tell us what you need." }); return; }
  if (!(CRM_SUPPORT_REQUEST_TYPES as readonly string[]).includes(requestType)) {
    res.status(400).json({ error: "Unknown request type.", accepted: CRM_SUPPORT_REQUEST_TYPES });
    return;
  }

  const projectId = num(b["projectId"]);
  // A project id from the body is checked against this contact before it is
  // stored — otherwise a customer could file their ticket against somebody
  // else's project and learn, from whether it worked, that the project exists.
  const project = projectId ? await scopedProject(leadId, projectId) : undefined;
  if (projectId && !project) { refuse(res); return; }

  const contact = await scopedContact(leadId);
  const [ticket] = await db.insert(crmSupportTickets).values({
    subject,
    description: body,
    status: "new",
    priority: "normal",
    source: "service_request",
    requestType,
    leadId,
    projectId: project?.id ?? null,
    openedByStaffId: null,
    openedByLabel: `Customer: ${contact?.name ?? "portal"}`,
    lastCustomerMessageAt: new Date(),
  }).returning();

  await db.insert(crmSupportMessages).values({
    ticketId: ticket.id,
    visibility: "customer",
    body,
    sentByStaffId: null,
    sentByLabel: contact?.name ?? "Customer",
    origin: "customer",
  });

  res.status(201).json({ ticket: customerTicket(ticket, ticket.createdAt) });
});

router.post("/portal/tickets/:id/messages", requirePortalAuth(), async (req: Request, res: Response) => {
  const leadId = portalScope(req);
  const id = num(req.params["id"]);
  if (!id) { refuse(res); return; }
  const ticket = await scopedTicket(leadId, id);
  if (!ticket) { refuse(res); return; }

  const body = str((req.body as Record<string, unknown>)["body"]);
  if (body.length < 1) { res.status(400).json({ error: "Write a message first." }); return; }

  const contact = await scopedContact(leadId);
  const [message] = await db.insert(crmSupportMessages).values({
    ticketId: ticket.id,
    // A customer cannot write an internal note. The value is a literal here,
    // never taken from the body — and the schema's own check constraint refuses
    // `internal` + `customer` anyway.
    visibility: "customer",
    body,
    sentByStaffId: null,
    sentByLabel: contact?.name ?? "Customer",
    origin: "customer",
  }).returning();

  // A customer coming back re-opens the SAME ticket rather than starting a new
  // one — the behaviour crmSupport.ts's state machine is explicitly shaped for.
  const reopening = ["resolved", "closed"].includes(ticket.status);
  await db.update(crmSupportTickets).set({
    status: reopening || ticket.status === "waiting_on_customer" ? "open" : ticket.status,
    ...(reopening ? { reopenedAt: new Date(), reopenCount: sql`${crmSupportTickets.reopenCount} + 1` } : {}),
    lastCustomerMessageAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(crmSupportTickets.id, ticket.id));

  res.status(201).json({
    message: {
      id: message.id, body: message.body, from: "You", author: null,
      createdAt: message.createdAt,
    },
    reopened: reopening,
  });
});

export default router;
