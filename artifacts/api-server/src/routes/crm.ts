import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmLeads, crmActivities, crmTasks, crmEmailTemplates, discoverySubmissions, crmDeals, crmTransactions, TRANSACTION_METHODS, TRANSACTION_RECEIVED_STATUS, crmCampaigns, crmCampaignRecipients, crmCampaignEvents, crmMessages, crmBehavioralEvents, crmCampaignSteps, crmCampaignScheduledMessages, CRM_STATUSES, intakeFirms, isCrmTaskDueKind, crmContactMerges, crmCompanies } from "@workspace/db";
import { voiceSignupJobs } from "@workspace/db/schema/voice";
import type { InsertCrmBehavioralEvent } from "@workspace/db";
import type { CrmLead, DiscoverySubmission } from "@workspace/db";
import { eq, desc, and, gte, lte, lt, or, ilike, isNull, sql, inArray, getTableColumns, type SQL } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { loadOwnerCandidates, resolveAssignmentFields } from "../lib/leadAssignee.js";
import { explainOwnerMatch, matchOwner, ownerKey, trimOwnerValue } from "../lib/leadOwnerRules.js";
import { positiveId, readCompanyIdChange } from "../lib/companies.js";
import { fireAutomation } from "../lib/automationTriggers.js";
import { syncTaskReminder } from "../lib/crmScheduler.js";
import { isOverdueInZone, AUTOMATION_FALLBACK_TIMEZONE } from "../lib/automationSweep.js";
import { getResend } from "../lib/email.js";
// Every CRM send goes through this seam. It is what keeps a test run out of a
// real mailbox — while CRM_EMAIL_TEST_MODE is anything but the exact string
// "false", nothing is handed to the provider at all — and it is what classifies
// an outcome honestly, including the unknown one that must never be retried.
import { staffMailBlockedReason, trySendStaffMail } from "../lib/staffMail.js";
import { emailRef, emailRefTags } from "../lib/emailRefs.js";
import { generateProposal, generateSOW } from "../lib/generators.js";
import { normalizePhone } from "../lib/twilio.js";
import { getSchedulerStatus, processScheduledMessages } from "../lib/campaignScheduler.js";
import { getUncachableStripeClient } from "../lib/stripeClient.js";

const router: IRouter = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
// Every route below names the permission it needs — `requireCrmAuth("…")` —
// rather than sharing one gate that asked only "is this a staff session".
//
// It used to share one. `const requireAdmin = requireCrmAuth()` guarded 56
// routes here, and holding a session was the whole test. Measured in a browser
// on 2026-09-16 with `leads.read` revoked on the signed-in account, GET
// /crm/leads still returned every contact; so did /crm/deals. The unguarded set
// also included /crm/campaigns/:id/test-send, /crm/campaigns/queue/:id/send-now,
// /crm/campaigns/scheduler/run and /crm/deals/:id/transactions/stripe-checkout —
// bulk customer contact and money, reachable by anyone who could sign in.
//
// The permission names follow what the newer files already decided: money is
// deals.read / deals.write (crmBilling.ts treats quotes, invoices and payments
// that way), automation is settings.*, customer contact is communications.*,
// and reading the team's task queue is tasks.read.team. `campaigns.send` is the
// line the operations_manager role deliberately does not cross.
//
// `requireCrmAuth` still accepts a per-person staff session first and falls back
// to the legacy shared bearer while CRM_LEGACY_BEARER_ENABLED is not "false";
// the route-security manifest still classes these routes "admin", because that
// records WHICH credential may reach them, not what it may then do.
// Held by routes/crmPermissionEnforcement.test.ts, which crosses each line.

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * The label a timeline entry is attributed to.
 *
 * A staff session names the person. The legacy shared bearer token genuinely
 * is an anonymous administrator, so "admin" there is accurate rather than a
 * placeholder — and it disappears on its own once the shared token is retired.
 */
function actorLabel(req: Request): string {
  const s = req.staffAuth?.staff;
  return s ? (s.displayName || s.email) : "admin";
}

/**
 * Writes one lead-timeline entry, attributed to whoever is actually signed in.
 *
 * `created_by` has a column default of the literal string "admin" and nothing
 * ever overrode it, so every note, status change, task and email on every lead
 * was recorded as having been done by "admin". With three people sharing the
 * CRM that makes the timeline unable to answer the one question it exists to
 * answer. The request is a parameter for exactly this reason: there is no
 * ambient actor, so it has to be passed.
 */
async function logActivity(
  req: Request, leadId: number, type: string, title: string,
  description?: string, metadata?: Record<string, unknown>,
) {
  await db.insert(crmActivities).values({
    leadId, type, title, description, metadata, createdBy: actorLabel(req),
  });
}

/**
 * True when a Postgres foreign-key violation names this constraint.
 *
 * Walks the `cause` chain because drizzle wraps the driver error in a
 * `DrizzleQueryError` whose own message is the SQL, not the violation — the
 * same shape `isUniqueViolation` in crmMarketing.ts handles.
 */
function violatesForeignKey(err: unknown, constraint: string): boolean {
  let cursor: unknown = err;
  for (let depth = 0; cursor && typeof cursor === "object" && depth < 6; depth += 1) {
    const e = cursor as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "23503" && (e.constraint === constraint || String(e.message ?? "").includes(constraint))) return true;
    cursor = e.cause;
  }
  return false;
}

// ── Settings status ───────────────────────────────────────────────────────────
// Read-only truth for the Settings page. Email test mode lives only in the
// CRM_EMAIL_TEST_MODE env var (every send path checks it directly); the UI
// must display the server's value, never a client-side toggle.
router.get("/crm/settings/status", requireCrmAuth("settings.read"), (_req: Request, res: Response) => {
  res.json({ emailTestMode: process.env.CRM_EMAIL_TEST_MODE !== "false" });
});

// ── Receptionist signup-job visibility (read-only) ───────────────────────────
// The registration → CRM pipeline (integration-owned, lib/signupPipeline) can
// permanently fail a job after 5 attempts, and until now nothing surfaced
// that: a firm whose CRM link failed simply never appeared in the CRM. This
// route only SELECTs — retrying/fixing jobs stays with the pipeline owner.
//
// Permission: `settings.read`, not this file's bare signed-in check. It is a
// job queue's health (attempts, retry state, last error) — the same class of
// operational read as `/crm/operations/jobs` — and it renders on the
// Receptionist Accounts page beside `/admin/receptionist-accounts`, which asks
// for the same grant, so the two halves of one page cannot disagree about who
// may see them. Every role holds it; the legacy bearer is unaffected.
router.get("/crm/receptionist-signup-jobs", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: voiceSignupJobs.id,
        firmId: voiceSignupJobs.firmId,
        firmName: intakeFirms.name,
        kind: voiceSignupJobs.kind,
        status: voiceSignupJobs.status,
        attempts: voiceSignupJobs.attempts,
        maxAttempts: voiceSignupJobs.maxAttempts,
        lastError: voiceSignupJobs.lastError,
        nextAttemptAt: voiceSignupJobs.nextAttemptAt,
        createdAt: voiceSignupJobs.createdAt,
        updatedAt: voiceSignupJobs.updatedAt,
        crmLeadId: sql<number | null>`(${voiceSignupJobs.result} ->> 'crmLeadId')::int`,
      })
      .from(voiceSignupJobs)
      .leftJoin(intakeFirms, eq(voiceSignupJobs.firmId, intakeFirms.id))
      .orderBy(desc(voiceSignupJobs.updatedAt))
      .limit(200);

    const failed = rows.filter(r => r.status === "permanently_failed");
    res.json({
      jobs: rows,
      summary: {
        total: rows.length,
        permanentlyFailed: failed.length,
        retryScheduled: rows.filter(r => r.status === "retry_scheduled").length,
        pending: rows.filter(r => r.status === "pending" || r.status === "processing").length,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching receptionist signup jobs");
    res.status(500).json({ error: "Failed to fetch signup jobs" });
  }
});

// ── Dashboard Stats ───────────────────────────────────────────────────────────
router.get("/crm/stats", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, newLeads, hotLeads, won, lost, followUpToday, overdue, smsSent30d, smsDelivered30d] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "New Inquiry")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.priority, "High")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Won")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(eq(crmLeads.status, "Lost")).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(and(gte(crmLeads.nextFollowUpAt, todayStart), lt(crmLeads.nextFollowUpAt, todayEnd))).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmLeads).where(lt(crmLeads.nextFollowUpAt, todayStart)).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmMessages)
        .where(and(eq(crmMessages.direction, "outbound"), eq(crmMessages.channel, "sms"), gte(crmMessages.createdAt, thirtyDaysAgo)))
        .then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(crmMessages)
        .where(and(eq(crmMessages.direction, "outbound"), eq(crmMessages.channel, "sms"), eq(crmMessages.status, "delivered"), gte(crmMessages.createdAt, thirtyDaysAgo)))
        .then(r => Number(r[0].count)),
    ]);

    const recentActivity = await db.select({
      id: crmActivities.id,
      type: crmActivities.type,
      title: crmActivities.title,
      description: crmActivities.description,
      createdAt: crmActivities.createdAt,
      leadId: crmActivities.leadId,
    }).from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(15);

    res.json({ stats: { total, newLeads, hotLeads, won, lost, followUpToday, overdue, smsSent30d, smsDelivered30d }, recentActivity });
  } catch (err) {
    req.log.error({ err }, "Error fetching CRM stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ── Automation Queue — org-wide, read-only ────────────────────────────────────

// GET /crm/intelligence/automation-queue
// Bulk data feed for the Automation Queue page: every lead's fields needed by
// workflowEngine.ts, all activities/tasks (grouped client-side), plus in-flight
// campaign scheduled messages. The engine itself is not touched — this route
// only supplies its inputs; step computation happens client-side via the
// existing pure computeWorkflowSteps(). Static route — must stay above the
// "/crm/leads/:id" route group.
router.get("/crm/intelligence/automation-queue", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const leads = await db
      .select({
        id: crmLeads.id,
        name: crmLeads.name,
        company: crmLeads.company,
        status: crmLeads.status,
        source: crmLeads.source,
        proposalStatus: crmLeads.proposalStatus,
        sowStatus: crmLeads.sowStatus,
        generatedProposal: crmLeads.generatedProposal,
        generatedSow: crmLeads.generatedSow,
        discoverySubmissionId: crmLeads.discoverySubmissionId,
        lastContactedAt: crmLeads.lastContactedAt,
        nextFollowUpAt: crmLeads.nextFollowUpAt,
        estimatedValue: crmLeads.estimatedValue,
        createdAt: crmLeads.createdAt,
        updatedAt: crmLeads.updatedAt,
      })
      .from(crmLeads)
      .orderBy(desc(crmLeads.updatedAt));

    const [activities, tasks, scheduledMessages] = await Promise.all([
      db.select({
        id: crmActivities.id, leadId: crmActivities.leadId, type: crmActivities.type,
        title: crmActivities.title, description: crmActivities.description, createdAt: crmActivities.createdAt,
      }).from(crmActivities).orderBy(desc(crmActivities.createdAt)),
      db.select({
        id: crmTasks.id, leadId: crmTasks.leadId, type: crmTasks.type, title: crmTasks.title,
        status: crmTasks.status, dueDate: crmTasks.dueDate, completedAt: crmTasks.completedAt, createdAt: crmTasks.createdAt,
      }).from(crmTasks),
      db.select({
        id: crmCampaignScheduledMessages.id,
        campaignId: crmCampaignScheduledMessages.campaignId,
        leadId: crmCampaignScheduledMessages.leadId,
        channel: crmCampaignScheduledMessages.channel,
        subject: crmCampaignScheduledMessages.subject,
        status: crmCampaignScheduledMessages.status,
        scheduledAt: crmCampaignScheduledMessages.scheduledAt,
        sentAt: crmCampaignScheduledMessages.sentAt,
        leadName: crmLeads.name,
        campaignName: crmCampaigns.name,
      })
        .from(crmCampaignScheduledMessages)
        .innerJoin(crmLeads, eq(crmCampaignScheduledMessages.leadId, crmLeads.id))
        .innerJoin(crmCampaigns, eq(crmCampaignScheduledMessages.campaignId, crmCampaigns.id))
        .where(inArray(crmCampaignScheduledMessages.status, ["scheduled", "queued", "sent"]))
        .orderBy(desc(crmCampaignScheduledMessages.scheduledAt))
        .limit(500),
    ]);

    res.json({ leads, activities, tasks, scheduledMessages });
  } catch (err) {
    req.log.error({ err }, "Error fetching automation queue");
    res.status(500).json({ error: "Failed to fetch automation queue" });
  }
});

// ── Leads list ────────────────────────────────────────────────────────────────
router.get("/crm/leads", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const { search, status, priority, source, companyId } = req.query as Record<string, string>;
    // A contact that has been merged into another one is not part of the book
    // any more. It is RETAINED rather than deleted (destroying a contact needs
    // `leads.delete`, which is owner-only), so the list has to exclude it here
    // or a merge would visibly do nothing. `crm_contact_merges.merged_lead_id`
    // is unique, which is what keeps this a plain NOT EXISTS.
    const conditions: SQL[] = [
      sql`NOT EXISTS (SELECT 1 FROM ${crmContactMerges} m WHERE m.merged_lead_id = ${crmLeads.id})`,
    ];
    if (search) {
      conditions.push(or(
        ilike(crmLeads.name, `%${search}%`),
        ilike(crmLeads.email, `%${search}%`),
        ilike(crmLeads.company, `%${search}%`),
        ilike(crmLeads.phone, `%${search}%`),
        // M7: a contact whose own company text is blank is still findable by
        // the company they are linked to.
        ilike(crmCompanies.name, `%${search}%`),
      )!);
    }
    if (status) conditions.push(eq(crmLeads.status, status));
    if (priority) conditions.push(eq(crmLeads.priority, priority));
    if (source) conditions.push(eq(crmLeads.source, source));
    // M7: "who works at this company", and its negation. A value that is
    // neither an id nor "none" is refused rather than ignored — silently
    // returning the whole book for a bad filter is how a list lies.
    if (companyId !== undefined && companyId !== "") {
      if (companyId === "none") {
        conditions.push(isNull(crmLeads.companyId));
      } else {
        const linkedTo = positiveId(companyId);
        if (linkedTo === null) {
          res.status(400).json({ error: "companyId must be a company's id, or \"none\" for contacts with no company." });
          return;
        }
        conditions.push(eq(crmLeads.companyId, linkedTo));
      }
    }

    // The company's NAME travels with every contact, so the list can show the
    // company record rather than only the typed text.
    const leads = await db.select({
      ...getTableColumns(crmLeads),
      companyName: crmCompanies.name,
      companyArchivedAt: crmCompanies.archivedAt,
    }).from(crmLeads)
      .leftJoin(crmCompanies, eq(crmCompanies.id, crmLeads.companyId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(crmLeads.createdAt));
    res.json({ leads });
  } catch (err) {
    req.log.error({ err }, "Error fetching CRM leads");
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// ── Create lead ───────────────────────────────────────────────────────────────
router.post("/crm/leads", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, unknown>;
    if (!data.name || !data.email) { res.status(400).json({ error: "Name and email are required" }); return; }

    // M6: the owner is written as both columns, decided in one place — the
    // picker's staff id, or a name resolved once through the matching rules.
    const owner = await resolveAssignmentFields(data);
    if (owner.kind === "error") { res.status(400).json({ error: owner.error }); return; }

    const [lead] = await db.insert(crmLeads).values({
      name: String(data.name),
      email: String(data.email),
      company: data.company ? String(data.company) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      website: data.website ? String(data.website) : undefined,
      source: data.source ? String(data.source) : "Manual Entry",
      serviceInterest: data.serviceInterest ? String(data.serviceInterest) : undefined,
      status: data.status ? String(data.status) : "New Inquiry",
      priority: data.priority ? String(data.priority) : "Medium",
      assignedTo: owner.kind === "set" ? owner.assignedTo : undefined,
      assignedToStaffId: owner.kind === "set" ? owner.assignedToStaffId : undefined,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      notes: data.notes ? String(data.notes) : undefined,
      estimatedValue: data.estimatedValue ? String(data.estimatedValue) : undefined,
      packageType: data.packageType ? String(data.packageType) : undefined,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(String(data.nextFollowUpAt)) : undefined,
    }).returning();

    await logActivity(req, lead.id, "lead_created", `Lead created: ${lead.name}`, `Source: ${lead.source}`);
    // Best-effort; a rule fault must never fail the capture itself.
    fireAutomation({ trigger: "lead_created", payload: { recordId: lead.id } });
    res.status(201).json({ lead });
  } catch (err) {
    req.log.error({ err }, "Error creating lead");
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// ── Get lead ──────────────────────────────────────────────────────────────────
router.get("/crm/leads/:id", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    // M7: the linked company travels with the contact, so the record shows the
    // company as a link rather than an id. `companyName` is the same field the
    // contact list carries, so both surfaces read it the same way.
    const [row] = await db.select({
      ...getTableColumns(crmLeads),
      companyName: crmCompanies.name,
      companyDomain: crmCompanies.domain,
      companyWebsite: crmCompanies.website,
      companyArchivedAt: crmCompanies.archivedAt,
    }).from(crmLeads)
      .leftJoin(crmCompanies, eq(crmCompanies.id, crmLeads.companyId))
      .where(eq(crmLeads.id, id));
    if (!row) { res.status(404).json({ error: "Lead not found" }); return; }
    const { companyDomain, companyWebsite, ...lead } = row;
    const linkedCompany = lead.companyId != null
      ? {
        id: lead.companyId, name: lead.companyName, domain: companyDomain,
        website: companyWebsite, archivedAt: lead.companyArchivedAt,
      }
      : null;

    const [activities, tasks, mergedInto] = await Promise.all([
      db.select().from(crmActivities).where(eq(crmActivities.leadId, id)).orderBy(desc(crmActivities.createdAt)),
      db.select().from(crmTasks).where(eq(crmTasks.leadId, id)).orderBy(desc(crmTasks.createdAt)),
      // A merged-away contact is hidden from the list but still reachable by
      // id, because old links, bookmarks and audit entries point at it. Saying
      // so beats a page that looks like an ordinary contact whose history has
      // mysteriously moved somewhere else.
      db.select({ primaryLeadId: crmContactMerges.primaryLeadId, mergedAt: crmContactMerges.createdAt,
        mergedByLabel: crmContactMerges.mergedByLabel })
        .from(crmContactMerges).where(eq(crmContactMerges.mergedLeadId, id)).limit(1),
    ]);

    res.json({ lead, activities, tasks, mergedInto: mergedInto[0] ?? null, linkedCompany });
  } catch (err) {
    req.log.error({ err }, "Error fetching lead");
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// ── Update lead ───────────────────────────────────────────────────────────────
router.patch("/crm/leads/:id", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [existing] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

    const data = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ["name","company","email","website","source","serviceInterest",
      "priority","notes","estimatedValue","packageType",
      "discoveryFormStatus","proposalStatus","sowStatus"];
    for (const f of fields) {
      if (data[f] !== undefined) updates[f] = data[f];
    }

    // ── M7: the company link ────────────────────────────────────────────────
    //
    // Decided and validated before anything is written. `leads.write` is
    // asserted here rather than on the route, because this route's legacy gate
    // is signed-in-only and every other field keeps that behaviour; the legacy
    // shared bearer carries no grants to check and keeps the access it had.
    // `company` (the typed text) is untouched by this: a contact can be linked
    // to "Acme Ltd" while its text still says whatever was recorded.
    const companyChange = readCompanyIdChange(data);
    if (companyChange.kind === "invalid") {
      res.status(400).json({ error: companyChange.error, field: "companyId" });
      return;
    }
    const companyChanging = companyChange.kind === "set" && companyChange.companyId !== existing.companyId;
    let nextCompany: { id: number; name: string } | null = null;
    let previousCompanyName: string | null = null;
    if (companyChanging && companyChange.kind === "set") {
      if (req.staffAuth && !req.staffAuth.permissions.has("leads.write")) {
        res.status(403).json({ error: "You do not have permission to change contacts.", permission: "leads.write" });
        return;
      }
      if (companyChange.companyId !== null) {
        const [target] = await db.select({
          id: crmCompanies.id, name: crmCompanies.name, archivedAt: crmCompanies.archivedAt,
        }).from(crmCompanies).where(eq(crmCompanies.id, companyChange.companyId)).limit(1);
        if (!target) { res.status(400).json({ error: "That company does not exist.", field: "companyId" }); return; }
        if (target.archivedAt) {
          res.status(409).json({
            code: "company_archived",
            error: `${target.name} is archived. Restore it before linking people to it.`,
            field: "companyId",
          });
          return;
        }
        nextCompany = { id: target.id, name: target.name };
      }
      if (existing.companyId !== null) {
        const [before] = await db.select({ name: crmCompanies.name })
          .from(crmCompanies).where(eq(crmCompanies.id, existing.companyId)).limit(1);
        previousCompanyName = before?.name ?? null;
      }
      updates["companyId"] = companyChange.companyId;
    }
    // M6: the owner is never copied from the body as a bare column. Both owner
    // columns come from one decision — the picker's staff id, or a name resolved
    // through the matching rules — so they cannot drift apart, and a new name
    // never leaves the previous owner's id behind.
    const owner = await resolveAssignmentFields(data, existing);
    if (owner.kind === "error") { res.status(400).json({ error: owner.error }); return; }
    if (owner.kind === "set") {
      updates["assignedTo"] = owner.assignedTo;
      updates["assignedToStaffId"] = owner.assignedToStaffId;
    }
    // Normalize phone to E.164 before storing; preserve null/empty as-is
    if (data.phone !== undefined) {
      const rawPhone = data.phone as string | null | undefined;
      updates.phone = rawPhone ? normalizePhone(rawPhone) : rawPhone ?? null;
    }
    if (data.tags !== undefined) updates.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    if (data.nextFollowUpAt !== undefined) updates.nextFollowUpAt = data.nextFollowUpAt ? new Date(String(data.nextFollowUpAt)) : null;
    if (data.lastContactedAt !== undefined) updates.lastContactedAt = data.lastContactedAt ? new Date(String(data.lastContactedAt)) : null;

    const prevStatus = existing.status;
    if (data.status !== undefined && data.status !== prevStatus) {
      updates.status = data.status;
      await logActivity(req, id, "status_changed", `Status changed to ${data.status}`, `From: ${prevStatus} → To: ${data.status}`, { from: prevStatus, to: data.status });
      fireAutomation({ trigger: "lead_status_changed", payload: { recordId: id, from: prevStatus ?? null, to: String(data.status) } });
    }
    if (data.nextFollowUpAt !== undefined && String(data.nextFollowUpAt) !== String(existing.nextFollowUpAt)) {
      await logActivity(req, id, "follow_up_changed", `Follow-up set for ${new Date(String(data.nextFollowUpAt)).toLocaleDateString()}`);
    }

    const [updated] = await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id)).returning();

    // M7: linking somebody to their employer is a change worth seeing on the
    // contact's own timeline and in the audit trail — it is how the company
    // record came to have the people it has.
    if (companyChanging) {
      const linked = nextCompany !== null;
      await logActivity(
        req, id,
        linked ? "company_linked" : "company_unlinked",
        linked ? `Linked to ${nextCompany!.name}` : `Unlinked from ${previousCompanyName ?? `company #${existing.companyId}`}`,
        linked && previousCompanyName ? `Previously linked to ${previousCompanyName}.` : undefined,
        { companyId: nextCompany?.id ?? null, previousCompanyId: existing.companyId },
      );
      await auditAction(
        req,
        linked ? "contact.company.linked" : "contact.company.unlinked",
        `lead:${id} company:${linked ? nextCompany!.id : existing.companyId}`,
      );
    }

    res.json({ lead: updated });
  } catch (err) {
    // The company was deleted between the check above and this write. It is a
    // stale screen, not a server fault, and it says which.
    if (violatesForeignKey(err, "crm_leads_company_id_crm_companies_id_fk")) {
      res.status(409).json({
        code: "company_gone",
        error: "That company was deleted while you were editing this contact. Reload and choose another.",
      });
      return;
    }
    req.log.error({ err }, "Error updating lead");
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// ── Delete lead ───────────────────────────────────────────────────────────────
router.delete("/crm/leads/:id", requireCrmAuth("leads.delete"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmTasks).where(eq(crmTasks.leadId, id));
    await db.delete(crmActivities).where(eq(crmActivities.leadId, id));
    const [deleted] = await db.delete(crmLeads).where(eq(crmLeads.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Lead not found" }); return; }
    // Full access is still logged access: record who destroyed the record.
    await auditAction(req, "lead.deleted", `lead:${id} ${deleted.name ?? ""}`.trim());
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting lead");
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// ── Add note ──────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/notes", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { note } = req.body as { note?: string };
    if (!note?.trim()) { res.status(400).json({ error: "Note is required" }); return; }

    const [existing] = await db.select({ notes: crmLeads.notes }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

    const timestamp = new Date().toLocaleString();
    const appended = existing.notes ? `${existing.notes}\n\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`;
    await db.update(crmLeads).set({ notes: appended, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(req, id, "note_added", "Note added", note.substring(0, 120));
    res.json({ ok: true, notes: appended });
  } catch (err) {
    req.log.error({ err }, "Error adding note");
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── Activities (manual creation) ──────────────────────────────────────────────
router.post("/crm/leads/:id/activities", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { type, title, description, metadata } = req.body as {
      type?: string; title?: string; description?: string; metadata?: Record<string, unknown>;
    };
    if (!type?.trim()) { res.status(400).json({ error: "type is required" }); return; }
    if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }

    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const [activity] = await db.insert(crmActivities).values({
      leadId: id,
      type: type.trim(),
      title: title.trim(),
      description: description?.trim() || undefined,
      metadata: metadata ?? undefined,
    }).returning();

    res.json({ activity });
  } catch (err) {
    req.log.error({ err }, "Error creating activity");
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ── Tasks ──────────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/tasks", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const data = req.body as Record<string, unknown>;
    if (!data.title) { res.status(400).json({ error: "Title is required" }); return; }

    // M2: same task system as Operations/My Day — a task raised from a lead is
    // assigned to a real person and gets a reminder, rather than landing in a
    // queue nobody owns.
    const staff = req.staffAuth?.staff;
    const assignedToStaffId = Number.isFinite(Number(data.assignedToStaffId))
      ? Number(data.assignedToStaffId)
      : staff?.id ?? null;

    // Same two words the Operations route accepts, refused the same way. The
    // lead screen only ever collects a day, so it says nothing and gets the
    // column default; a client that does say something must mean one of them.
    if (data.dueKind !== undefined && !isCrmTaskDueKind(data.dueKind)) {
      res.status(400).json({ error: 'A due date is either "date" (a day) or "time" (a moment). Nothing else.' });
      return;
    }

    const [task] = await db.insert(crmTasks).values({
      leadId: id,
      type: data.type ? String(data.type) : "Follow Up",
      title: String(data.title),
      description: data.description ? String(data.description) : undefined,
      dueDate: data.dueDate ? new Date(String(data.dueDate)) : undefined,
      dueKind: isCrmTaskDueKind(data.dueKind) ? data.dueKind : undefined,
      remindAt: data.remindAt ? new Date(String(data.remindAt)) : undefined,
      priority: data.priority ? String(data.priority) : undefined,
      assignedToStaffId,
      createdByStaffId: staff?.id ?? null,
      createdBy: staff?.displayName ?? staff?.email ?? "admin",
      status: "pending",
    }).returning();

    await syncTaskReminder(task.id);
    await logActivity(req, id, "task_created", `Task created: ${task.title}`, `Type: ${task.type}`);
    res.status(201).json({ task });
  } catch (err) {
    req.log.error({ err }, "Error creating task");
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/crm/tasks/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const data = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "completed") {
        updates.completedAt = new Date();
        // M2: record WHO completed it, not just that it happened.
        updates.completedByStaffId = req.staffAuth?.staff.id ?? null;
      } else {
        updates.completedAt = null;
        updates.completedByStaffId = null;
      }
    }
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? new Date(String(data.dueDate)) : null;
    if (data.dueKind !== undefined) {
      // The column is NOT NULL, so there is no "clear it" here — only the two
      // meanings, or a refusal.
      if (!isCrmTaskDueKind(data.dueKind)) {
        res.status(400).json({ error: 'A due date is either "date" (a day) or "time" (a moment). Nothing else.' });
        return;
      }
      updates.dueKind = data.dueKind;
    }
    if (data.remindAt !== undefined) updates.remindAt = data.remindAt ? new Date(String(data.remindAt)) : null;
    if (data.type !== undefined) updates.type = data.type;

    const [updated] = await db.update(crmTasks).set(updates).where(eq(crmTasks.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Task not found" }); return; }

    // Completing or rescheduling here must cancel/move the pending reminder,
    // exactly as it does on the Operations route — one task system, one
    // reconcile.
    await syncTaskReminder(id);

    if (data.status === "completed" && updated.leadId != null) {
      await logActivity(req, updated.leadId, "task_completed", `Task completed: ${updated.title}`);
    }
    res.json({ task: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating task");
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/crm/tasks/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(crmTasks).where(eq(crmTasks.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ── All tasks (for tasks page) ────────────────────────────────────────────────
router.get("/crm/tasks", requireCrmAuth("tasks.read.team"), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const tasks = await db.select({
      id: crmTasks.id, leadId: crmTasks.leadId, type: crmTasks.type,
      title: crmTasks.title, description: crmTasks.description,
      dueDate: crmTasks.dueDate, dueKind: crmTasks.dueKind, status: crmTasks.status,
      completedAt: crmTasks.completedAt, createdAt: crmTasks.createdAt,
      leadName: crmLeads.name, leadCompany: crmLeads.company,
    }).from(crmTasks).leftJoin(crmLeads, eq(crmTasks.leadId, crmLeads.id))
      .orderBy(crmTasks.dueDate);

    // Auto-mark overdue, by the one shared rule rather than a bare `due_date <
    // now()`. That comparison stamped every date-only task "overdue" one minute
    // into the day it was due — the false alarm this whole distinction exists
    // to stop — and it stamped it on a GET, so the label stuck.
    //
    // This list has no person in it, so the zone is the same fallback the sweep
    // names when a record has no owner. My Day, which does know whose task it
    // is, answers in that person's zone and is the surface to believe.
    const overdueIds = tasks
      .filter(t => t.status === "pending" && t.dueDate
        && isOverdueInZone(AUTOMATION_FALLBACK_TIMEZONE, t.dueDate, t.dueKind, now))
      .map(t => t.id);
    if (overdueIds.length) {
      await db.update(crmTasks).set({ status: "overdue" })
        .where(inArray(crmTasks.id, overdueIds));
      for (const t of tasks) if (overdueIds.includes(t.id)) t.status = "overdue";
    }

    res.json({ tasks });
  } catch (err) {
    req.log.error({ err }, "Error fetching tasks");
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ── Send email ────────────────────────────────────────────────────────────────
router.post("/crm/leads/:id/email", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { subject, body, testMode, cc, bcc } = req.body as {
      subject?: string; body?: string; testMode?: boolean;
      cc?: string | string[]; bcc?: string | string[];
    };
    if (!subject || !body) { res.status(400).json({ error: "Subject and body are required" }); return; }

    // The compose modal has had working CC and BCC inputs all along and posted
    // what was typed into them. Nothing here read those fields, so the sender
    // was told "Email sent!" while the people they copied were never on it.
    // Honour them, and refuse an address that is not one rather than dropping
    // it silently — which is the failure being fixed.
    const parseRecipients = (v: string | string[] | undefined): string[] =>
      (Array.isArray(v) ? v : String(v ?? "").split(/[,;]/))
        .map((s) => s.trim()).filter(Boolean);
    const ccList = parseRecipients(cc);
    const bccList = parseRecipients(bcc);
    const invalid = [...ccList, ...bccList].filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Not a valid email address: ${invalid.join(", ")}` });
      return;
    }

    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const {
      isSuppressed, replyToAddress, recordOutboundForLoopControl,
    } = await import("../lib/inboundEmail.js");
    const { ensureConversation, refreshConversationRollups } = await import("../lib/conversations.js");

    // Somebody who hard-bounced or reported us as spam must not be mailed
    // again. Continuing to send to a complainer damages deliverability for
    // every other client, so this is refused rather than warned about.
    const blocked = await isSuppressed(lead.email);
    if (blocked.suppressed) {
      res.status(409).json({ error: blocked.reason, suppressed: true });
      return;
    }

    // The conversation this belongs to, so the sent message is part of a
    // thread rather than a loose activity row, and so the reply has somewhere
    // to come back to.
    const conversation = await ensureConversation({
      channel: "email", provider: "resend",
      contactId: lead.id, externalAddress: lead.email, externalName: lead.name,
      subject,
    });

    if (conversation) {
      const loop = await recordOutboundForLoopControl(conversation.id);
      if (!loop.allowed) {
        res.status(429).json({ error: loop.reason, loopProtection: true });
        return;
      }
    }

    // Replies come back to an address carrying this conversation's token,
    // which is what makes an inbound reply attributable to a thread without
    // trusting the sender header.
    const replyTo = conversation ? await replyToAddress(conversation.id) : null;

    // Test mode is the SERVER's decision, not the caller's.
    //
    // The old rule was `testMode !== false && CRM_EMAIL_TEST_MODE !== "false"`,
    // so a request that simply said `testMode: false` reached a real mailbox on
    // a server whose test mode was still on. `trySendStaffMail` hands nothing
    // to the provider while test mode is on, whatever the body asks for, and
    // `testMode` in the request is now ignored rather than obeyed.
    void testMode;
    const simulating = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";

    // The message row is written BEFORE the send and settled after it. Two
    // reasons, and the second is the important one: a process that dies
    // mid-send leaves a visible "Sending" rather than no record at all, and the
    // send can carry a tag naming this row — which is what lets a later
    // delivery event reach it even when the outcome is never learned here.
    const who = actorLabel(req);
    const [recorded] = conversation
      ? await db.insert(crmMessages).values({
          leadId: lead.id,
          conversationId: conversation.id,
          direction: "outbound",
          channel: "email",
          subject,
          body,
          fromNumber: process.env.RESEND_FROM_EMAIL ?? null,
          toNumber: lead.email,
          sentByStaffId: req.staffAuth?.staff.id ?? null,
          sentByLabel: req.staffAuth?.staff ? who : null,
          origin: req.staffAuth?.staff ? "staff" : "legacy",
          status: "sending",
          metadata: { cc: ccList, bcc: bccList, replyTo },
        }).returning()
      : [undefined];

    const outcome = await trySendStaffMail({
      to: lead.email,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      ...(ccList.length ? { cc: ccList } : {}),
      ...(bccList.length ? { bcc: bccList } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(recorded ? { tags: emailRefTags(emailRef("message", recorded.id)) } : {}),
    });

    // `uncertain` is its own state and is never written as a failure: the
    // message may be in their inbox, and a thread that says "not sent" is how a
    // second copy gets sent.
    const messageStatus = outcome.sent ? "sent"
      : outcome.failure === "not_configured" ? (simulating ? "test_mode" : "not_sent")
      : outcome.failure === "uncertain" ? "uncertain"
      : "failed";

    if (recorded && conversation) {
      await db.update(crmMessages).set({
        status: messageStatus,
        providerMessageId: outcome.sent ? outcome.providerId : null,
        metadata: {
          cc: ccList, bcc: bccList, replyTo,
          testMode: simulating,
          ...(outcome.sent ? {} : { failure: outcome.failure, reason: outcome.reason.slice(0, 300) }),
        },
      }).where(eq(crmMessages.id, recorded.id));
      await refreshConversationRollups(conversation.id);
    }

    if (!outcome.sent && !simulating) {
      // Not sent, and which of the two reasons it was decides what the sender
      // should do next — so it is said rather than flattened into one 500.
      res.status(outcome.failure === "not_configured" ? 503 : 502).json({
        ok: false,
        error: outcome.failure === "uncertain"
          ? "The mail provider never confirmed this message, so whether it arrived is genuinely unknown. Check with them before sending it again — a second attempt may put a second copy in their inbox."
          : outcome.reason,
        failure: outcome.failure,
        uncertain: outcome.failure === "uncertain",
        messageId: recorded?.id ?? null,
      });
      return;
    }

    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, id));
    // The body used to be discarded, so the Email Activity tab could show that
    // an email happened but never what it said. Keep it with the entry.
    await logActivity(
      req, id, "email_sent", `Email sent: ${subject}`,
      simulating ? "[TEST MODE - not actually sent]" : `To: ${lead.email}`,
      {
        subject, body, testMode: simulating,
        to: lead.email,
        // BCC is recorded internally because the team needs to know who was
        // copied; it is never echoed to a recipient.
        ...(ccList.length ? { cc: ccList } : {}),
        ...(bccList.length ? { bcc: bccList } : {}),
      },
    );

    res.json({ ok: true, testMode: simulating, cc: ccList, bcc: bccList, messageId: recorded?.id ?? null });
  } catch (err) {
    req.log.error({ err }, "Error sending email");
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── Email Templates ───────────────────────────────────────────────────────────
router.get("/crm/email-templates", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  try {
    const templates = await db.select().from(crmEmailTemplates).orderBy(crmEmailTemplates.name);
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/crm/email-templates", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  try {
    const { name, type, subject, body } = req.body as Record<string, string>;
    if (!name || !subject || !body) { res.status(400).json({ error: "Name, subject, and body are required" }); return; }
    const [template] = await db.insert(crmEmailTemplates).values({ name, type: type || "Other", subject, body }).returning();
    res.status(201).json({ template });
  } catch (err) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/crm/email-templates/:id", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { name, type, subject, body } = req.body as Record<string, string>;
    const [updated] = await db.update(crmEmailTemplates)
      .set({ name, type, subject, body, updatedAt: new Date() })
      .where(eq(crmEmailTemplates.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
    res.json({ template: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/crm/email-templates/:id", requireCrmAuth("communications.send"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmEmailTemplates).where(eq(crmEmailTemplates.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ── Communications — Email Activity ──────────────────────────────────────────
router.get("/crm/communications/email-activity", requireCrmAuth("communications.read"), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const activities = await db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.type, "email_sent"))
      .orderBy(desc(crmActivities.createdAt))
      .limit(limit);

    // Batch-fetch leads for all activity leadIds
    const leadIds = [...new Set(activities.map(a => a.leadId).filter((id): id is number => id != null))];
    const leads = leadIds.length > 0
      ? await db.select({ id: crmLeads.id, name: crmLeads.name, email: crmLeads.email })
          .from(crmLeads).where(inArray(crmLeads.id, leadIds))
      : [];
    const leadMap = new Map(leads.map(l => [l.id, l]));

    const emails = activities.map(a => {
      const lead = a.leadId != null ? leadMap.get(a.leadId) : undefined;
      const subject = a.title.startsWith("Email sent: ") ? a.title.slice(12) : a.title;
      return {
        id: a.id,
        leadId: a.leadId,
        leadName: lead?.name ?? "Unknown",
        leadEmail: lead?.email ?? "",
        subject,
        description: a.description,
        createdAt: a.createdAt,
        metadata: a.metadata,
      };
    });

    res.json({ emails, total: emails.length });
  } catch (err) {
    req.log.error({ err }, "Error fetching email activity");
    res.status(500).json({ error: "Failed to fetch email activity" });
  }
});

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

router.get("/crm/campaigns", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const list = await db.select().from(crmCampaigns).orderBy(desc(crmCampaigns.updatedAt));
    // Attach recipient counts
    const counts = await db
      .select({ campaignId: crmCampaignRecipients.campaignId, count: sql<number>`count(*)::int` })
      .from(crmCampaignRecipients)
      .groupBy(crmCampaignRecipients.campaignId);
    const countMap = new Map(counts.map(c => [c.campaignId, c.count]));
    const campaigns = list.map(c => ({ ...c, recipientCount: countMap.get(c.id) ?? 0 }));
    res.json({ campaigns });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaigns");
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.post("/crm/campaigns", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const { name, subject, body, status, type, objective, toneProfile, description, stopOnReply, autoSend } = req.body as Record<string, unknown>;
    if (!name || !subject || !body) {
      res.status(400).json({ error: "name, subject, and body are required" }); return;
    }
    const allowedStatus = ["draft","ready","archived"];
    const allowedType   = ["broadcast","nurture","drip"];
    const safeStatus = allowedStatus.includes(String(status)) ? String(status) : "draft";
    const safeType   = allowedType.includes(String(type)) ? String(type) : "broadcast";
    const [campaign] = await db.insert(crmCampaigns)
      .values({
        name: String(name), subject: String(subject), body: String(body),
        status: safeStatus, type: safeType,
        objective:   objective   !== undefined ? String(objective)   : undefined,
        toneProfile: toneProfile !== undefined ? String(toneProfile) : undefined,
        description: description !== undefined ? String(description) : undefined,
        stopOnReply: stopOnReply !== undefined ? Boolean(stopOnReply) : true,
        autoSend:    autoSend    !== undefined ? Boolean(autoSend)    : false,
      })
      .returning();
    res.status(201).json({ campaign });
  } catch (err) {
    req.log.error({ err }, "Error creating campaign");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// ── Scheduler status & manual trigger (static — before /:id) ─────────────────

router.get("/crm/campaigns/scheduler/status", requireCrmAuth("campaigns.read"), (_req: Request, res: Response) => {
  res.json(getSchedulerStatus());
});

router.post("/crm/campaigns/scheduler/run", requireCrmAuth("campaigns.send"), async (_req: Request, res: Response) => {
  try {
    const result = await processScheduledMessages();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Scheduler run failed" });
  }
});

// ── Campaign Scheduled Message Queue (static routes — must come before /:id) ──

router.get("/crm/campaigns/queue", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const { status, campaignId } = req.query as Record<string, string>;
    const conditions = [];
    if (status)     conditions.push(eq(crmCampaignScheduledMessages.status, status));
    if (campaignId) conditions.push(eq(crmCampaignScheduledMessages.campaignId, Number(campaignId)));
    const msgs = await db
      .select({
        id:          crmCampaignScheduledMessages.id,
        campaignId:  crmCampaignScheduledMessages.campaignId,
        recipientId: crmCampaignScheduledMessages.recipientId,
        stepId:      crmCampaignScheduledMessages.stepId,
        leadId:      crmCampaignScheduledMessages.leadId,
        channel:     crmCampaignScheduledMessages.channel,
        subject:     crmCampaignScheduledMessages.subject,
        body:        crmCampaignScheduledMessages.body,
        status:      crmCampaignScheduledMessages.status,
        scheduledAt: crmCampaignScheduledMessages.scheduledAt,
        sentAt:      crmCampaignScheduledMessages.sentAt,
        lastError:   crmCampaignScheduledMessages.lastError,
        createdAt:   crmCampaignScheduledMessages.createdAt,
        leadName:    crmLeads.name,
        leadEmail:   crmLeads.email,
        campaignName: crmCampaigns.name,
      })
      .from(crmCampaignScheduledMessages)
      .innerJoin(crmLeads,     eq(crmCampaignScheduledMessages.leadId,     crmLeads.id))
      .innerJoin(crmCampaigns, eq(crmCampaignScheduledMessages.campaignId, crmCampaigns.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(crmCampaignScheduledMessages.scheduledAt));
    res.json({ messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Error fetching scheduled message queue");
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

router.patch("/crm/campaigns/queue/:messageId", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { subject, body, scheduledAt, status } = req.body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (subject !== undefined)     updates.subject     = subject;
    if (body !== undefined)        updates.body        = body;
    if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
    if (status !== undefined) {
      const allowed = ["scheduled","queued","canceled","skipped"];
      if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
      updates.status = status;
    }
    if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }

    // Releasing a HELD message is a person deciding to send something the
    // scheduler deliberately stopped — a backlog too old to go out on its own.
    // The decision is stamped, so the next tick sends it instead of holding it
    // again, which would make the release appear to do nothing.
    const [current] = await db.select().from(crmCampaignScheduledMessages)
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    if (!current) { res.status(404).json({ error: "Message not found" }); return; }
    if (current.status === "held" && (status === "scheduled" || status === "queued")) {
      updates.metadata = {
        ...(current.metadata ?? {}),
        releasedFromHoldAt: new Date().toISOString(),
        releasedBy: actorLabel(req),
      };
      updates.lastError = null;
    }

    const [msg] = await db.update(crmCampaignScheduledMessages)
      .set(updates)
      .where(eq(crmCampaignScheduledMessages.id, messageId))
      .returning();
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Error updating scheduled message");
    res.status(500).json({ error: "Failed to update message" });
  }
});

router.post("/crm/campaigns/queue/:messageId/send-now", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [msg] = await db
      .select()
      .from(crmCampaignScheduledMessages)
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    // `held` is sendable from here on purpose: a person pressing Send Now on a
    // message the scheduler held IS the review the hold was asking for.
    if (!["scheduled","queued","held"].includes(msg.status)) {
      res.status(400).json({ error: "Message is not in a sendable state" }); return;
    }
    if (msg.channel !== "email") {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(crmCampaignScheduledMessages.id, messageId));
      res.json({ ok: true, note: "Non-email channel marked sent" }); return;
    }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, msg.leadId));
    if (!lead?.email || lead.email.includes("@imported.local")) {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: "failed", lastError: "No valid email address" })
        .where(eq(crmCampaignScheduledMessages.id, messageId));
      res.status(400).json({ error: "No valid email address" }); return;
    }
    // Claim it first. Without this, the scheduler tick can pick up the same
    // due message while this request is sending it, and the recipient gets two.
    const claimed = await db.update(crmCampaignScheduledMessages)
      .set({ status: "sending" })
      .where(and(
        eq(crmCampaignScheduledMessages.id, messageId),
        inArray(crmCampaignScheduledMessages.status, ["scheduled", "queued", "held"]),
      ))
      .returning({ id: crmCampaignScheduledMessages.id });
    if (claimed.length === 0) {
      res.status(409).json({ error: "This message is already being sent." });
      return;
    }

    const simulating = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";
    const outcome = await trySendStaffMail({
      to: lead.email,
      subject: msg.subject ?? "(no subject)",
      text: msg.body ?? "",
      html: (msg.body ?? "").replace(/\n/g, "<br>"),
      tags: emailRefTags(emailRef("sequence_message", msg.id)),
    });

    if (outcome.sent || simulating) {
      await db.update(crmCampaignScheduledMessages)
        .set({
          status: "sent", sentAt: new Date(), lastError: null,
          resendEmailId: outcome.sent ? outcome.providerId : null,
        })
        .where(eq(crmCampaignScheduledMessages.id, messageId));
      res.json({ ok: true, testMode: simulating });
      return;
    }

    // Recorded under the class the answer actually supports. An `uncertain:`
    // prefix is what stops anybody re-queuing a message that may already have
    // arrived, and it is what a later `delivered` event upgrades.
    await db.update(crmCampaignScheduledMessages)
      .set({ status: "failed", lastError: `${outcome.failure}: ${outcome.reason}`.slice(0, 500) })
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    res.status(outcome.failure === "not_configured" ? 503 : 502).json({
      ok: false, error: outcome.reason, failure: outcome.failure,
      uncertain: outcome.failure === "uncertain",
    });
  } catch (err) {
    req.log.error({ err }, "Error sending scheduled message");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.delete("/crm/campaigns/queue/:messageId", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.update(crmCampaignScheduledMessages)
      .set({ status: "canceled" })
      .where(eq(crmCampaignScheduledMessages.id, messageId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error canceling scheduled message");
    res.status(500).json({ error: "Failed to cancel message" });
  }
});

// ── Bulk reschedule: shift all scheduled/queued messages for a lead ───────────
// Static path (/leads/:leadId/reschedule) — placed before /:id group per rule #8
router.post("/crm/campaigns/leads/:leadId/reschedule", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const leadId = Number(req.params.leadId);
    if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

    const { shiftDays } = req.body as { shiftDays?: number };
    if (shiftDays === undefined || !Number.isFinite(shiftDays)) {
      res.status(400).json({ error: "shiftDays (number) is required" }); return;
    }

    const shiftMs = Math.round(shiftDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(crmCampaignScheduledMessages)
      .where(
        and(
          eq(crmCampaignScheduledMessages.leadId, leadId),
          inArray(crmCampaignScheduledMessages.status, ["scheduled", "queued"]),
        ),
      );

    if (!rows.length) { res.json({ updated: 0, messages: [] }); return; }

    const updated = await Promise.all(
      rows.map(r => {
        const newAt = new Date((r.scheduledAt ?? new Date()).getTime() + shiftMs);
        return db
          .update(crmCampaignScheduledMessages)
          .set({ scheduledAt: newAt })
          .where(eq(crmCampaignScheduledMessages.id, r.id))
          .returning()
          .then(([m]) => m);
      }),
    );

    req.log.info({ leadId, shiftDays, count: updated.length }, "Bulk rescheduled lead messages");
    res.json({ updated: updated.length, messages: updated.filter(Boolean) });
  } catch (err) {
    req.log.error({ err }, "Error bulk-rescheduling lead messages");
    res.status(500).json({ error: "Failed to reschedule messages" });
  }
});

// ── Campaign CRUD (parameterized routes) ──────────────────────────────────────

router.get("/crm/campaigns/:id", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
    const recipients = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        discStyleUsed: crmCampaignRecipients.discStyleUsed,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        sentAt: crmCampaignRecipients.sentAt,
        leadName: crmLeads.name,
        leadEmail: crmLeads.email,
        leadCompany: crmLeads.company,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id));
    res.json({ campaign, recipients });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign");
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.patch("/crm/campaigns/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { name, subject, body, status, type, objective, toneProfile, description, stopOnReply, autoSend } = req.body as Record<string, unknown>;
    const allowedStatus = ["draft","ready","archived"];
    const allowedType   = ["broadcast","nurture","drip"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name    !== undefined) updates.name    = String(name);
    if (subject !== undefined) updates.subject = String(subject);
    if (body    !== undefined) updates.body    = String(body);
    if (status  !== undefined && allowedStatus.includes(String(status))) updates.status = String(status);
    if (type    !== undefined && allowedType.includes(String(type)))     updates.type   = String(type);
    if (objective   !== undefined) updates.objective   = objective   ? String(objective)   : null;
    if (toneProfile !== undefined) updates.toneProfile = toneProfile ? String(toneProfile) : null;
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (stopOnReply !== undefined) updates.stopOnReply = Boolean(stopOnReply);
    if (autoSend    !== undefined) updates.autoSend    = Boolean(autoSend);
    const [updated] = await db.update(crmCampaigns).set(updates).where(eq(crmCampaigns.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Campaign not found" }); return; }
    res.json({ campaign: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating campaign");
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/crm/campaigns/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmCampaigns).where(eq(crmCampaigns.id, id)); // cascade deletes recipients
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign");
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// Replace all recipients for a campaign (upsert pattern)
router.post("/crm/campaigns/:id/recipients", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { recipients } = req.body as {
      recipients: Array<{
        leadId: number;
        discStyleUsed?: string;
        personalizedSubject?: string;
        personalizedBody?: string;
      }>;
    };
    if (!Array.isArray(recipients)) {
      res.status(400).json({ error: "recipients array required" }); return;
    }
    // Delete existing then re-insert
    await db.delete(crmCampaignRecipients).where(eq(crmCampaignRecipients.campaignId, id));
    if (recipients.length > 0) {
      await db.insert(crmCampaignRecipients).values(
        recipients.map(r => ({
          campaignId: id,
          leadId: r.leadId,
          status: "selected" as const,
          discStyleUsed: r.discStyleUsed ?? null,
          personalizedSubject: r.personalizedSubject ?? null,
          personalizedBody: r.personalizedBody ?? null,
        })),
      );
    }
    // Bump campaign updatedAt
    await db.update(crmCampaigns).set({ updatedAt: new Date() }).where(eq(crmCampaigns.id, id));
    res.json({ ok: true, count: recipients.length });
  } catch (err) {
    req.log.error({ err }, "Error saving campaign recipients");
    res.status(500).json({ error: "Failed to save recipients" });
  }
});

// Per-campaign test send (uses persisted campaign data)
router.post("/crm/campaigns/:id/test-send", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { to } = req.body as { to?: string };
    if (!to) { res.status(400).json({ error: "to is required" }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: "Invalid test email address" }); return;
    }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const simulating = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";
    const outcome = await trySendStaffMail({
      to,
      subject: `[TEST] ${campaign.subject}`,
      text: campaign.body,
      html: campaign.body.replace(/\n/g, "<br>"),
    });

    if (!outcome.sent && !simulating) {
      req.log.warn({ to, campaignId: id, failure: outcome.failure }, "Campaign test email not sent");
      res.status(outcome.failure === "not_configured" ? 503 : 502).json({
        ok: false, error: outcome.reason, failure: outcome.failure, to,
      });
      return;
    }

    req.log.info({ to, campaignId: id, testMode: simulating }, "Campaign test email dispatched");
    res.json({ ok: true, testMode: simulating, to });
  } catch (err) {
    req.log.error({ err }, "Error sending campaign test email");
    res.status(500).json({ error: "Failed to send test email" });
  }
});

// ── Campaign Test Send ────────────────────────────────────────────────────────
// Sends a single test email to a manually specified address — NOT to leads.
router.post("/crm/campaigns/test-send", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  try {
    const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
    if (!to || !subject || !body) {
      res.status(400).json({ error: "to, subject, and body are required" }); return;
    }
    // Basic email format guard
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: "Invalid test email address" }); return;
    }

    const simulating = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";
    const outcome = await trySendStaffMail({
      to,
      subject: `[TEST] ${subject}`,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });

    if (!outcome.sent && !simulating) {
      req.log.warn({ to, failure: outcome.failure }, "Campaign test email not sent");
      res.status(outcome.failure === "not_configured" ? 503 : 502).json({
        ok: false, error: outcome.reason, failure: outcome.failure, to,
      });
      return;
    }

    req.log.info({ to, testMode: simulating }, "Campaign test email dispatched");
    res.json({ ok: true, testMode: simulating, to });
  } catch (err) {
    req.log.error({ err }, "Error sending campaign test email");
    res.status(500).json({ error: "Failed to send test email" });
  }
});

// ── Campaign Analytics ────────────────────────────────────────────────────────
router.get("/crm/campaigns/:id/analytics", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    // All recipients with lead info
    const recipients = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        discStyleUsed: crmCampaignRecipients.discStyleUsed,
        sentAt: crmCampaignRecipients.sentAt,
        lastError: crmCampaignRecipients.lastError,
        leadName: crmLeads.name,
        leadEmail: crmLeads.email,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id))
      .orderBy(desc(crmCampaignRecipients.createdAt));

    // Totals
    const total    = recipients.length;
    const sent     = recipients.filter(r => r.status === "sent").length;
    const failed   = recipients.filter(r => r.status === "failed").length;
    const skipped  = recipients.filter(r => r.status === "skipped").length;
    const selected = recipients.filter(r => r.status === "selected").length;
    const sendRate    = total > 0 ? Math.round((sent / total) * 100)   : 0;
    const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

    // DISC breakdown
    const DISC_STYLES = ["Driver", "Expressive", "Amiable", "Analytical"];
    const discBreakdown = DISC_STYLES.map(style => {
      const group = recipients.filter(r => r.discStyleUsed === style);
      return {
        style,
        count:   group.length,
        sent:    group.filter(r => r.status === "sent").length,
        failed:  group.filter(r => r.status === "failed").length,
        skipped: group.filter(r => r.status === "skipped").length,
      };
    });

    // Reply estimate — inbound CRM messages from recipient leads after their sentAt
    const sentRecipients = recipients.filter(r => r.status === "sent" && r.sentAt);
    let replyEstimate = { count: 0, total: sentRecipients.length, rate: 0 };
    if (sentRecipients.length > 0) {
      const sentLeadIds = sentRecipients.map(r => r.leadId);
      const inboundMsgs = await db
        .select({ leadId: crmMessages.leadId, createdAt: crmMessages.createdAt })
        .from(crmMessages)
        .where(and(
          eq(crmMessages.direction, "inbound"),
          inArray(crmMessages.leadId, sentLeadIds),
        ));
      const repliedLeads = new Set<number>();
      for (const msg of inboundMsgs) {
        if (msg.leadId) {
          const rec = sentRecipients.find(r => r.leadId === msg.leadId);
          if (rec?.sentAt && new Date(msg.createdAt) > new Date(rec.sentAt)) {
            repliedLeads.add(msg.leadId);
          }
        }
      }
      const count = repliedLeads.size;
      replyEstimate = {
        count,
        total: sentRecipients.length,
        rate: sentRecipients.length > 0 ? Math.round((count / sentRecipients.length) * 100) : 0,
      };
    }

    // Event metrics from crm_campaign_events (opened, clicked, bounced, failed via webhook)
    const recipientIds = recipients.map(r => r.id);
    let eventMetrics = { hasEvents: false, opened: 0, clicked: 0, bounced: 0, deliveryFailed: 0, uniqueOpeners: 0, uniqueClickers: 0, openRate: 0, clickRate: 0, bounceRate: 0 };
    if (recipientIds.length > 0) {
      const events = await db
        .select({ eventType: crmCampaignEvents.eventType, campaignRecipientId: crmCampaignEvents.campaignRecipientId })
        .from(crmCampaignEvents)
        .where(inArray(crmCampaignEvents.campaignRecipientId, recipientIds));
      if (events.length > 0) {
        const openedEvents  = events.filter(e => e.eventType === "opened");
        const clickedEvents = events.filter(e => e.eventType === "clicked");
        const opened        = openedEvents.length;
        const clicked       = clickedEvents.length;
        const bounced       = events.filter(e => e.eventType === "bounced").length;
        const deliveryFailed = events.filter(e => e.eventType === "failed").length;
        // Unique counts — distinct recipient per event type (what rates are based on)
        const uniqueOpeners  = new Set(openedEvents.map(e => e.campaignRecipientId)).size;
        const uniqueClickers = new Set(clickedEvents.map(e => e.campaignRecipientId)).size;
        const sentCount = sent > 0 ? sent : 1; // avoid div/0
        eventMetrics = {
          hasEvents:    true,
          opened,
          clicked,
          bounced,
          deliveryFailed,
          uniqueOpeners,
          uniqueClickers,
          openRate:    Math.round((uniqueOpeners  / sentCount) * 100),
          clickRate:   Math.round((uniqueClickers / sentCount) * 100),
          bounceRate:  Math.round((bounced        / sentCount) * 100),
        };
      }
    }

    res.json({
      campaign,
      totals: { recipients: total, sent, failed, skipped, selected, sendRate, failureRate },
      discBreakdown,
      recentRecipients: recipients.map(r => ({
        leadId:       r.leadId,
        name:         r.leadName,
        email:        r.leadEmail,
        discStyleUsed: r.discStyleUsed,
        status:       r.status,
        sentAt:       r.sentAt,
        lastError:    r.lastError,
      })),
      replyEstimate,
      eventMetrics,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign analytics");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ── Campaign Sequence Funnel ──────────────────────────────────────────────────
// Per-step delivery funnel for nurture/drip campaigns.
// Works for broadcast too (returns empty steps array).
router.get("/crm/campaigns/:id/funnel", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    // Enrollment status breakdown from recipients
    const recipients = await db
      .select({
        enrollmentStatus: crmCampaignRecipients.enrollmentStatus,
      })
      .from(crmCampaignRecipients)
      .where(eq(crmCampaignRecipients.campaignId, id));

    const enrollmentStats = {
      total:     recipients.length,
      active:    recipients.filter(r => r.enrollmentStatus === "active").length,
      completed: recipients.filter(r => r.enrollmentStatus === "completed").length,
      stopped:   recipients.filter(r => r.enrollmentStatus === "stopped").length,
      paused:    recipients.filter(r => r.enrollmentStatus === "paused").length,
    };

    // Fetch steps in order
    const steps = await db
      .select()
      .from(crmCampaignSteps)
      .where(eq(crmCampaignSteps.campaignId, id))
      .orderBy(crmCampaignSteps.stepNumber);

    // Fetch all scheduled messages for this campaign
    const messages = await db
      .select({
        stepId: crmCampaignScheduledMessages.stepId,
        status: crmCampaignScheduledMessages.status,
      })
      .from(crmCampaignScheduledMessages)
      .where(eq(crmCampaignScheduledMessages.campaignId, id));

    // Group messages by stepId
    const msgByStep = new Map<number | null, typeof messages>();
    for (const msg of messages) {
      const key = msg.stepId;
      if (!msgByStep.has(key)) msgByStep.set(key, []);
      msgByStep.get(key)!.push(msg);
    }

    const enrolled = enrollmentStats.total || 1; // avoid div/0

    const stepFunnel = steps.map(step => {
      const stepMsgs = msgByStep.get(step.id) ?? [];
      const sent      = stepMsgs.filter(m => m.status === "sent").length;
      const failed    = stepMsgs.filter(m => m.status === "failed").length;
      const skipped   = stepMsgs.filter(m => m.status === "skipped").length;
      const pending   = stepMsgs.filter(m => m.status === "scheduled" || m.status === "queued").length;
      const canceled  = stepMsgs.filter(m => m.status === "canceled").length;
      const total     = stepMsgs.length;
      return {
        stepId:      step.id,
        stepNumber:  step.stepNumber,
        dayOffset:   step.dayOffset,
        channel:     step.channel,
        subject:     step.subject,
        sendTime:    step.sendTime,
        sent,
        failed,
        skipped,
        pending,
        canceled,
        total,
        reachRate:   Math.round((sent / enrolled) * 100),
        sentRate:    total > 0 ? Math.round((sent / total) * 100) : 0,
      };
    });

    res.json({
      campaignType: campaign.type,
      enrollmentStats,
      steps: stepFunnel,
      stopOnReply: campaign.stopOnReply,
      autoSend:    campaign.autoSend,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign funnel");
    res.status(500).json({ error: "Failed to load funnel" });
  }
});

// ── Campaign Send Execution ───────────────────────────────────────────────────
// Sends to all selected recipients one at a time, tracks status per recipient.
router.post("/crm/campaigns/:id/send", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const recipientsWithLeads = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        status: crmCampaignRecipients.status,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        leadEmail: crmLeads.email,
        leadName: crmLeads.name,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(eq(crmCampaignRecipients.campaignId, id));

    if (recipientsWithLeads.length === 0) {
      res.status(400).json({ error: "No recipients saved for this campaign" }); return;
    }

    // Decided by the seam, not by this route: while CRM_EMAIL_TEST_MODE is
    // anything other than the exact string "false", nothing is handed over.
    const isTestMode = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";
    const results: Array<{ recipientId: number; leadId: number; email: string; status: string; error?: string }> = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const r of recipientsWithLeads) {
      // Skip already-sent recipients
      if (r.status === "sent") {
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail ?? "", status: "skipped", error: "Already sent" });
        skipped++;
        continue;
      }
      // Skip recipients with no valid email
      if (!r.leadEmail || r.leadEmail.includes("@imported.local")) {
        await db.update(crmCampaignRecipients)
          .set({ status: "skipped", lastError: "No valid email address" })
          .where(eq(crmCampaignRecipients.id, r.id));
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail ?? "", status: "skipped", error: "No valid email address" });
        skipped++;
        continue;
      }

      const subject = r.personalizedSubject ?? campaign.subject;
      const body    = r.personalizedBody   ?? campaign.body;

      const outcome = await trySendStaffMail({
        to: r.leadEmail,
        subject,
        text: body,
        html: body.replace(/\n/g, "<br>"),
        tags: emailRefTags(emailRef("campaign_recipient", r.id)),
      });
      // The same 200 ms gap between live sends as before: the provider rate
      // limits, and a burst is what trips it.
      if (outcome.sent) await new Promise(resolve => setTimeout(resolve, 200));

      if (outcome.sent || isTestMode) {
        await db.update(crmCampaignRecipients)
          .set({
            status: "sent", sentAt: new Date(), lastError: null,
            resendEmailId: outcome.sent ? outcome.providerId : null,
          })
          .where(eq(crmCampaignRecipients.id, r.id));
        results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail, status: "sent" });
        sent++;
        continue;
      }

      // Stored under the class the answer actually supports. An `uncertain:`
      // outcome may already be in somebody's inbox, so it is never described
      // as not sent, and nothing re-queues it by itself — a later `delivered`
      // event is what resolves it.
      const recordedError = `${outcome.failure}: ${outcome.reason}`.slice(0, 500);
      await db.update(crmCampaignRecipients)
        .set({ status: "failed", lastError: recordedError })
        .where(eq(crmCampaignRecipients.id, r.id));
      results.push({ recipientId: r.id, leadId: r.leadId, email: r.leadEmail, status: "failed", error: recordedError });
      failed++;
    }

    // Mark campaign as archived if fully sent
    if (failed === 0 && sent > 0) {
      await db.update(crmCampaigns).set({ status: "archived", updatedAt: new Date() }).where(eq(crmCampaigns.id, id));
    }

    req.log.info({ campaignId: id, sent, failed, skipped, testMode: isTestMode }, "Campaign send complete");
    res.json({ sent, failed, skipped, results, testMode: isTestMode });
  } catch (err) {
    req.log.error({ err }, "Error executing campaign send");
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

// Resend to a single failed or skipped recipient
router.post("/crm/campaigns/:id/recipients/:recipientId/resend", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  try {
    const id          = Number(req.params.id);
    const recipientId = Number(req.params.recipientId);
    if (isNaN(id) || isNaN(recipientId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const [r] = await db
      .select({
        id: crmCampaignRecipients.id,
        leadId: crmCampaignRecipients.leadId,
        personalizedSubject: crmCampaignRecipients.personalizedSubject,
        personalizedBody: crmCampaignRecipients.personalizedBody,
        leadEmail: crmLeads.email,
      })
      .from(crmCampaignRecipients)
      .innerJoin(crmLeads, eq(crmCampaignRecipients.leadId, crmLeads.id))
      .where(and(
        eq(crmCampaignRecipients.id, recipientId),
        eq(crmCampaignRecipients.campaignId, id),
      ));

    if (!r) { res.status(404).json({ error: "Recipient not found" }); return; }
    if (!r.leadEmail || r.leadEmail.includes("@imported.local")) {
      res.status(400).json({ error: "No valid email address for this recipient" }); return;
    }

    const subject = r.personalizedSubject ?? campaign.subject;
    const body    = r.personalizedBody   ?? campaign.body;
    const isTestMode = staffMailBlockedReason() !== null
      && process.env.CRM_EMAIL_TEST_MODE !== "false";

    const outcome = await trySendStaffMail({
      to: r.leadEmail,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      tags: emailRefTags(emailRef("campaign_recipient", r.id)),
    });

    if (outcome.sent || isTestMode) {
      await db.update(crmCampaignRecipients)
        .set({
          status: "sent", sentAt: new Date(), lastError: null,
          resendEmailId: outcome.sent ? outcome.providerId : null,
        })
        .where(eq(crmCampaignRecipients.id, recipientId));
      req.log.info({ campaignId: id, recipientId, testMode: isTestMode }, "Recipient resent");
      res.json({ ok: true, status: "sent", testMode: isTestMode, email: r.leadEmail });
      return;
    }

    const recordedError = `${outcome.failure}: ${outcome.reason}`.slice(0, 500);
    await db.update(crmCampaignRecipients)
      .set({ status: "failed", lastError: recordedError })
      .where(eq(crmCampaignRecipients.id, recipientId));
    res.status(outcome.failure === "not_configured" ? 503 : 502).json({
      ok: false, status: "failed", error: outcome.reason, failure: outcome.failure,
      uncertain: outcome.failure === "uncertain",
    });
  } catch (err) {
    req.log.error({ err }, "Error resending to recipient");
    res.status(500).json({ error: "Failed to resend" });
  }
});

// ── CSV Import ────────────────────────────────────────────────────────────────
router.post("/crm/import", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "No rows provided" }); return; }

    const VALID_STS = new Set<string>(CRM_STATUSES);
    const LEGACY_ST: Record<string, string> = {
      "new": "New Inquiry", "contacted": "Follow-Up Needed", "follow-up": "Follow-Up Needed",
      "negotiating": "Qualified", "nurture": "On Hold",
    };
    const VALID_PRI = new Set(["Low","Medium","High"]);
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normSt = (s?: string) => { const c = s?.trim(); if (!c) return "New Inquiry"; if (VALID_STS.has(c)) return c; const l = c.toLowerCase(); if (LEGACY_ST[l]) return LEGACY_ST[l]; return [...VALID_STS].find(x => x.toLowerCase() === l) ?? "New Inquiry"; };
    const normPr = (p?: string) => { const c = p?.trim(); if (!c) return "Medium"; if (VALID_PRI.has(c)) return c; const l = c.toLowerCase(); return [...VALID_PRI].find(x => x.toLowerCase() === l) ?? "Medium"; };

    let created = 0, skippedDuplicates = 0, invalid = 0;
    const errors: { rowIndex: number; message: string }[] = [];

    // M6: owner names resolve through the same rules as every other write
    // (lib/leadOwnerRules.ts) — staff read once, each name decided once — and a
    // name that resolves to nobody is REPORTED in the response, never guessed.
    const ownerCandidates = await loadOwnerCandidates();
    const unresolvedOwners = new Map<string, {
      value: string; rows: number; reason: "no_match" | "ambiguous"; explanation: string;
    }>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.name || row.Name || "").trim();
      const email = (row.email || row.Email || "").trim().toLowerCase();
      const phone = (row.phone || row.Phone || "").trim();

      if (!name) { invalid++; errors.push({ rowIndex: i, message: "Name is required" }); continue; }
      if (email && !EMAIL_RE.test(email)) { invalid++; errors.push({ rowIndex: i, message: `Invalid email: ${email}` }); continue; }

      if (email) {
        const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.email, email)).limit(1);
        if (existing) { skippedDuplicates++; continue; }
      }

      const finalEmail = email || (phone ? `${phone.replace(/\D/g, "")}@imported.local` : `import-${i}-${Date.now()}@imported.local`);
      const rawEv = (row.estimatedValue || row.estimated_value || row["Estimated Value"] || "").replace(/[^0-9.]/g, "");
      const estimatedValue = rawEv && !isNaN(parseFloat(rawEv)) ? String(parseFloat(rawEv)) : null;
      const rawTags = (row.tags || row.Tags || "").trim();
      const tags = rawTags ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
      const ownerText = trimOwnerValue(row.assignedTo || row.assigned_to || row["Assigned To"] || "");
      const ownerMatch = ownerText ? matchOwner(ownerText, ownerCandidates) : null;

      try {
        const [lead] = await db.insert(crmLeads).values({
          name,
          email: finalEmail,
          company: (row.company || row.Company || "").trim() || undefined,
          phone: phone || undefined,
          website: (row.website || row.Website || "").trim() || undefined,
          source: "CSV Import",
          serviceInterest: (row.serviceInterest || row.service_interest || row["Service Interest"] || "").trim() || undefined,
          status: normSt(row.status || row.Status),
          priority: normPr(row.priority || row.Priority),
          assignedTo: ownerText || undefined,
          assignedToStaffId: ownerMatch?.outcome === "matched" ? ownerMatch.staffId : undefined,
          notes: (row.notes || row.Notes || "").trim() || undefined,
          tags,
          estimatedValue,
        }).returning();
        await logActivity(req, lead.id, "lead_imported", `Imported from CSV: ${lead.name}`, "Lead imported through CRM Import page.");
        created++;
        if (ownerMatch && ownerMatch.outcome !== "matched") {
          const key = ownerKey(ownerText);
          const seen = unresolvedOwners.get(key);
          if (seen) seen.rows += 1;
          else unresolvedOwners.set(key, {
            value: ownerText, rows: 1,
            reason: ownerMatch.outcome === "ambiguous" ? "ambiguous" : "no_match",
            explanation: explainOwnerMatch(ownerText, ownerMatch, ownerCandidates),
          });
        }
      } catch (e) {
        invalid++;
        errors.push({ rowIndex: i, message: `Insert failed: ${String(e).slice(0, 80)}` });
      }
    }

    res.json({
      created, skippedDuplicates, invalid, errors: errors.slice(0, 20),
      // Contacts created carrying an owner name that matched nobody, or more
      // than one person. They have no person as owner until somebody decides,
      // on Admin → Unmapped lead owners.
      unresolvedOwners: [...unresolvedOwners.values()],
    });
  } catch (err) {
    req.log.error({ err }, "Error importing CSV");
    res.status(500).json({ error: "Failed to import" });
  }
});

// ── Import from discovery submissions ─────────────────────────────────────────
router.post("/crm/import-discovery", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const submissions = await db.select().from(discoverySubmissions);
    let imported = 0, skipped = 0;

    for (const sub of submissions) {
      const [existing] = await db.select({ id: crmLeads.id }).from(crmLeads)
        .where(or(eq(crmLeads.email, sub.email), eq(crmLeads.discoverySubmissionId, sub.id))).limit(1);
      if (existing) { skipped++; continue; }

      const score = sub.leadScore ?? 1;
      const priority = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

      const [lead] = await db.insert(crmLeads).values({
        name: sub.contactName,
        email: sub.email,
        company: sub.companyName,
        phone: sub.phone ?? undefined,
        source: "Discovery Form",
        serviceInterest: sub.serviceInterest ?? undefined,
        status: sub.status === "New" ? "New Inquiry" : sub.status,
        priority,
        tags: sub.tags,
        notes: sub.internalNotes ?? undefined,
        packageType: sub.recommendedPackage ?? undefined,
        discoverySubmissionId: sub.id,
        discoveryFormStatus: "Completed",
      }).returning();

      await logActivity(req, lead.id, "lead_imported", `Imported from discovery form`, `Original submission ID: ${sub.id}`);
      imported++;
    }

    res.json({ imported, skipped });
  } catch (err) {
    req.log.error({ err }, "Error importing discovery submissions");
    res.status(500).json({ error: "Failed to import" });
  }
});

// ── Single submission import ───────────────────────────────────────────────────
router.post("/crm/import-discovery/:id", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const subId = Number(req.params.id);
    if (!subId) { res.status(400).json({ error: "Invalid submission id" }); return; }

    const [sub] = await db.select().from(discoverySubmissions)
      .where(eq(discoverySubmissions.id, subId)).limit(1);
    if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }

    // Check for existing lead by discoverySubmissionId OR email
    const [existing] = await db.select({ id: crmLeads.id })
      .from(crmLeads)
      .where(or(eq(crmLeads.discoverySubmissionId, subId), eq(crmLeads.email, sub.email)))
      .limit(1);

    if (existing) {
      res.json({
        imported: false,
        existing: true,
        leadId: existing.id,
        message: "Submission is already connected to a CRM lead.",
      });
      return;
    }

    const score = sub.leadScore ?? 1;
    const priority = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

    const [lead] = await db.insert(crmLeads).values({
      name: sub.contactName,
      email: sub.email,
      company: sub.companyName,
      phone: sub.phone ?? undefined,
      source: "Discovery Form",
      serviceInterest: sub.serviceInterest ?? undefined,
      status: "New Inquiry",
      priority,
      tags: sub.tags,
      notes: sub.internalNotes ?? undefined,
      packageType: sub.recommendedPackage ?? undefined,
      discoverySubmissionId: sub.id,
      discoveryFormStatus: "Completed",
    }).returning();

    await logActivity(
      req,
      lead.id,
      "lead_imported",
      "Imported from Discovery Portal",
      `${sub.companyName} — ${sub.contactName}${sub.serviceInterest ? ` · ${sub.serviceInterest}` : ""}`,
    );

    res.json({
      imported: true,
      existing: false,
      leadId: lead.id,
      message: `${sub.contactName} from ${sub.companyName} added to CRM.`,
    });
  } catch (err) {
    req.log.error({ err }, "Error importing single discovery submission");
    res.status(500).json({ error: "Failed to import submission" });
  }
});

// ── Deals ─────────────────────────────────────────────────────────────────────
router.get("/crm/deals/stats", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  try {
    const deals = await db.select().from(crmDeals);
    const wonDeals = deals.filter(d => d.stage === "Won");
    const lostDeals = deals.filter(d => d.stage === "Lost");
    const openDeals = deals.filter(d => !["Won", "Lost"].includes(d.stage));
    const winRate = (wonDeals.length + lostDeals.length) > 0
      ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
      : 0;

    // Total Revenue reflects real money in (crm_transactions), not the deal
    // stage flip — a deal marked "Won" with no completed transaction contributes $0.
    const completedTxns = await db.select().from(crmTransactions).where(eq(crmTransactions.status, TRANSACTION_RECEIVED_STATUS));
    const totalRevenue = completedTxns.reduce((s, t) => s + Number(t.amount), 0);

    const stageOrder = ["Lead", "Qualified", "Proposal", "Won", "Lost"];
    const pipeline = stageOrder.map(stage => {
      const stageDeals = deals.filter(d => d.stage === stage);
      const total = stageDeals.reduce((s, d) => s + Number(d.value), 0);
      return { stage, count: stageDeals.length, total };
    });

    const monthlyMap = new Map<string, number>();
    completedTxns.forEach(t => {
      const at = t.receivedAt ?? t.createdAt;
      const m = new Date(at).toISOString().substring(0, 7);
      monthlyMap.set(m, (monthlyMap.get(m) || 0) + Number(t.amount));
    });
    const now = new Date();
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = d.toISOString().substring(0, 7);
      return { month: d.toLocaleString("en-US", { month: "short" }), revenue: monthlyMap.get(key) || 0 };
    });

    const activeLeads = await db.select({ count: sql<number>`count(*)` }).from(crmLeads)
      .where(sql`status NOT IN ('Won', 'Lost')`).then(r => Number(r[0].count));

    res.json({
      totalRevenue, winRate, activeLeads,
      openDeals: openDeals.length, wonDeals: wonDeals.length, lostDeals: lostDeals.length,
      pipeline, monthly,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching deals stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/crm/deals", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  try {
    const deals = await db.select().from(crmDeals).orderBy(desc(crmDeals.createdAt));
    const leadsMap = new Map<number, string>();
    const leads = await db.select({ id: crmLeads.id, name: crmLeads.name }).from(crmLeads);
    leads.forEach(l => leadsMap.set(l.id, l.name));
    const enriched = deals.map(d => ({
      ...d,
      leadName: d.leadId ? leadsMap.get(d.leadId) ?? null : null,
    }));
    res.json({ deals: enriched });
  } catch (err) {
    req.log.error({ err }, "Error fetching deals");
    res.status(500).json({ error: "Failed to fetch deals" });
  }
});

router.post("/crm/deals", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  try {
    const { name, value, stage, closeDate, notes, leadId } = req.body as Record<string, string | number>;
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const [deal] = await db.insert(crmDeals).values({
      name: String(name),
      value: value ? String(value) : "0",
      stage: String(stage || "Lead"),
      closeDate: closeDate ? String(closeDate) : null,
      notes: notes ? String(notes) : null,
      leadId: leadId ? Number(leadId) : null,
    }).returning();
    res.json({ deal });
  } catch (err) {
    req.log.error({ err }, "Error creating deal");
    res.status(500).json({ error: "Failed to create deal" });
  }
});

router.patch("/crm/deals/:id", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, value, stage, closeDate, notes, leadId } = req.body as Record<string, string | number | null>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (value !== undefined) updates.value = String(value);
    if (stage !== undefined) updates.stage = stage;
    if (closeDate !== undefined) updates.closeDate = closeDate || null;
    if (notes !== undefined) updates.notes = notes;
    if (leadId !== undefined) updates.leadId = leadId ? Number(leadId) : null;
    const [deal] = await db.update(crmDeals).set(updates).where(eq(crmDeals.id, id)).returning();
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json({ deal });
  } catch (err) {
    req.log.error({ err }, "Error updating deal");
    res.status(500).json({ error: "Failed to update deal" });
  }
});

router.delete("/crm/deals/:id", requireCrmAuth("deals.delete"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(crmDeals).where(eq(crmDeals.id, id));
    await auditAction(req, "deal.deleted", `deal:${id}`);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting deal");
    res.status(500).json({ error: "Failed to delete deal" });
  }
});

// ── Deal Transactions (real money in — never inferred from stage) ────────────

/**
 * Every transaction in one query, with its deal and client joined and paged
 * server-side.
 *
 * The Transactions screen previously fetched all deals and then issued one
 * request per deal — a fan-out that grew with the business and re-sorted the
 * whole history in the browser. Filtering and paging belong here.
 */
router.get("/crm/transactions", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q["limit"]) || 50, 1), 200);
    const offset = Math.max(Number(q["offset"]) || 0, 0);

    const conditions = [
      ...(q["status"] ? [eq(crmTransactions.status, q["status"])] : []),
      ...(q["method"] ? [eq(crmTransactions.method, q["method"])] : []),
      ...(q["from"] ? [gte(crmTransactions.receivedAt, new Date(q["from"]))] : []),
      ...(q["to"] ? [lte(crmTransactions.receivedAt, new Date(`${q["to"]}T23:59:59.999Z`))] : []),
    ];
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [countRow], [totals]] = await Promise.all([
      db.select({
        transaction: crmTransactions,
        dealName: crmDeals.name,
        dealStage: crmDeals.stage,
        leadId: crmDeals.leadId,
        clientName: crmLeads.name,
        clientCompany: crmLeads.company,
      })
        .from(crmTransactions)
        .leftJoin(crmDeals, eq(crmTransactions.dealId, crmDeals.id))
        .leftJoin(crmLeads, eq(crmDeals.leadId, crmLeads.id))
        .where(where)
        .orderBy(desc(crmTransactions.receivedAt), desc(crmTransactions.id))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(crmTransactions).where(where),
      // Totals are computed across the whole filtered set, not just this page —
      // a page total would be a different and misleading number.
      db.select({
        received: sql<string>`coalesce(sum(${crmTransactions.amount}) filter (where ${crmTransactions.status} = ${TRANSACTION_RECEIVED_STATUS}), 0)`,
        pending: sql<string>`coalesce(sum(${crmTransactions.amount}) filter (where ${crmTransactions.status} = 'pending'), 0)`,
      }).from(crmTransactions).where(where),
    ]);

    res.json({
      transactions: rows.map((r) => ({
        ...r.transaction,
        dealName: r.dealName, dealStage: r.dealStage, leadId: r.leadId,
        clientName: r.clientName, clientCompany: r.clientCompany,
      })),
      total: Number(countRow?.count ?? 0),
      totals: {
        received: Number(totals?.received ?? 0),
        pending: Number(totals?.pending ?? 0),
        basis: "Sums cover every transaction matching the current filters, not only the visible page.",
      },
      limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching transactions");
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

const MANUAL_METHODS = TRANSACTION_METHODS.filter(m => m !== "stripe");

router.post("/crm/deals/:id/transactions/manual", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  try {
    const dealId = Number(req.params.id);
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }

    const { amount, method, receivedAt, notes } = req.body as Record<string, string | number | undefined>;
    if (!amount || Number(amount) <= 0) { res.status(400).json({ error: "A positive amount is required" }); return; }
    if (!method || !MANUAL_METHODS.includes(method as (typeof MANUAL_METHODS)[number])) {
      res.status(400).json({ error: `method must be one of: ${MANUAL_METHODS.join(", ")}` });
      return;
    }

    const [txn] = await db.insert(crmTransactions).values({
      dealId,
      leadId: deal.leadId ?? null,
      amount: String(amount),
      method: String(method),
      status: "completed",
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      notes: notes ? String(notes) : null,
    }).returning();

    res.json({ transaction: txn });
  } catch (err) {
    req.log.error({ err }, "Error recording manual transaction");
    res.status(500).json({ error: "Failed to record transaction" });
  }
});

router.post("/crm/deals/:id/transactions/stripe-checkout", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  try {
    const dealId = Number(req.params.id);
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }

    const { amount } = req.body as Record<string, string | number | undefined>;
    const chargeAmount = amount ? Number(amount) : Number(deal.value);
    if (!chargeAmount || chargeAmount <= 0) { res.status(400).json({ error: "A positive amount is required" }); return; }

    const stripe = await getUncachableStripeClient();
    const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    const baseUrl = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(chargeAmount * 100),
          product_data: { name: `${deal.name} — payment` },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/admin/crm/deals/${dealId}?payment=success`,
      cancel_url: `${baseUrl}/admin/crm/deals/${dealId}?payment=cancelled`,
      metadata: { dealId: String(dealId) },
    });

    if (!session.url) { throw new Error("Stripe did not return a checkout URL"); }

    const [txn] = await db.insert(crmTransactions).values({
      dealId,
      leadId: deal.leadId ?? null,
      amount: chargeAmount.toFixed(2),
      method: "stripe",
      status: "pending",
      stripePaymentIntentId: session.id,
    }).returning();

    res.json({ url: session.url, transaction: txn });
  } catch (err) {
    req.log.error({ err }, "Error creating deal checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/crm/deals/:id/transactions", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  try {
    const dealId = Number(req.params.id);
    const transactions = await db.select().from(crmTransactions)
      .where(eq(crmTransactions.dealId, dealId))
      .orderBy(desc(crmTransactions.createdAt));
    res.json({ transactions });
  } catch (err) {
    req.log.error({ err }, "Error fetching deal transactions");
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ── Pipeline (same as leads but grouped by status) ────────────────────────────
router.get("/crm/pipeline", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const leads = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt));
    const pipeline = Object.fromEntries(CRM_STATUSES.map(s => [s, leads.filter(l => l.status === s)]));
    res.json({ pipeline });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pipeline" });
  }
});

// ── Sales Workspace: helpers ───────────────────────────────────────────────────

function crmLeadToSubmission(lead: CrmLead): DiscoverySubmission {
  const VALID_SERVICES = [
    "new-website", "redesign", "web-app", "crm", "seo",
    "blog", "maintenance", "automation", "consultation",
  ];
  const serviceKey = (lead.serviceInterest || "new-website")
    .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "");
  const services = VALID_SERVICES.includes(serviceKey) ? [serviceKey] : ["new-website"];

  return {
    id: 0,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    contactName: lead.name,
    companyName: lead.company || lead.name,
    email: lead.email,
    phone: lead.phone ?? null,
    industry: null,
    serviceInterest: lead.serviceInterest ?? null,
    // These were hardcoded to "5k-10k" / "flexible" / "just-me" / 5, which put
    // invented budget, timeline, decision-maker and lead-score figures into a
    // document sent to a client. A lead carries none of that information, so it
    // stays unspecified and the generator renders it as "Not specified" rather
    // than guessing on the client's behalf.
    budget: null,
    timeline: null,
    decisionMaker: null,
    leadScore: 0,
    tags: lead.tags,
    status: "CRM Lead",
    recommendedPackage: lead.packageType ?? null,
    formData: {
      services,
      budget: "5k-10k",
      timeline: "flexible",
      decisionMaker: "just-me",
      projectGoals: ["grow-online-presence", "generate-leads"],
      marketingFeatures: [],
      salesFeatures: [],
      membershipFeatures: [],
      automationFeatures: [],
      otherFeatures: [],
      integrations: [],
      specificRequirements: lead.notes || "",
    },
    generatedProposal: null,
    generatedSow: null,
    internalNotes: lead.notes ?? null,
  } as unknown as DiscoverySubmission;
}

// ── Sales Workspace: Proposal ─────────────────────────────────────────────────

router.post("/crm/leads/:id/proposal/generate", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    let html: string;
    if (lead.discoverySubmissionId) {
      const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, lead.discoverySubmissionId));
      html = sub ? generateProposal(sub) : generateProposal(crmLeadToSubmission(lead));
    } else {
      html = generateProposal(crmLeadToSubmission(lead));
    }

    const newStatus = lead.proposalStatus === "Not Started" ? "Draft" : lead.proposalStatus;
    await db.update(crmLeads).set({ generatedProposal: html, proposalStatus: newStatus, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(req, id, "proposal_generated", "Proposal generated", lead.discoverySubmissionId ? "Generated from discovery submission" : "Generated from CRM lead data");
    req.log.info({ id }, "Proposal generated for CRM lead");
    res.json({ proposal: html });
  } catch (err) {
    req.log.error({ err }, "Error generating proposal");
    res.status(500).json({ error: "Failed to generate proposal" });
  }
});

router.patch("/crm/leads/:id/proposal", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { html, status } = req.body as { html?: string; status?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (html !== undefined) updates.generatedProposal = html;
    if (status !== undefined) updates.proposalStatus = status;
    await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving proposal");
    res.status(500).json({ error: "Failed to save proposal" });
  }
});

// ── Sales Workspace: Scope of Work ────────────────────────────────────────────

router.post("/crm/leads/:id/sow/generate", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    let html: string;
    if (lead.discoverySubmissionId) {
      const [sub] = await db.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, lead.discoverySubmissionId));
      html = sub ? generateSOW(sub) : generateSOW(crmLeadToSubmission(lead));
    } else {
      html = generateSOW(crmLeadToSubmission(lead));
    }

    const newStatus = lead.sowStatus === "Not Started" ? "Draft" : lead.sowStatus;
    await db.update(crmLeads).set({ generatedSow: html, sowStatus: newStatus, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logActivity(req, id, "sow_generated", "Scope of Work generated", lead.discoverySubmissionId ? "Generated from discovery submission" : "Generated from CRM lead data");
    req.log.info({ id }, "SOW generated for CRM lead");
    res.json({ sow: html });
  } catch (err) {
    req.log.error({ err }, "Error generating SOW");
    res.status(500).json({ error: "Failed to generate SOW" });
  }
});

router.patch("/crm/leads/:id/sow", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { html, status } = req.body as { html?: string; status?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (html !== undefined) updates.generatedSow = html;
    if (status !== undefined) updates.sowStatus = status;
    await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving SOW");
    res.status(500).json({ error: "Failed to save SOW" });
  }
});

// ── Behavioral Intelligence — Phase 24A ───────────────────────────────────────

// GET /crm/behavioral-events
// Org-wide feed of recent behavioral events across all leads, for the
// Behavioral Intelligence dashboard. Static route — must stay above
// the "/crm/leads/:id/behavioral-events" route group.
router.get("/crm/behavioral-events", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 1000, 2000);
    const events = await db
      .select()
      .from(crmBehavioralEvents)
      .orderBy(desc(crmBehavioralEvents.occurredAt))
      .limit(limit);

    const leadIds = Array.from(new Set(events.map(e => e.leadId)));
    const leads = leadIds.length
      ? await db
          .select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company, status: crmLeads.status })
          .from(crmLeads)
          .where(inArray(crmLeads.id, leadIds))
      : [];

    res.json({ events, leads });
  } catch (err) {
    req.log.error({ err }, "Error fetching org-wide behavioral events");
    res.status(500).json({ error: "Failed to fetch behavioral events" });
  }
});

// GET /crm/leads/:id/behavioral-events
// Returns all behavioral events for a lead, newest first.
router.get("/crm/leads/:id/behavioral-events", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    const events = await db
      .select()
      .from(crmBehavioralEvents)
      .where(eq(crmBehavioralEvents.leadId, id))
      .orderBy(desc(crmBehavioralEvents.occurredAt));
    res.json({ events });
  } catch (err) {
    req.log.error({ err }, "Error fetching behavioral events");
    res.status(500).json({ error: "Failed to fetch behavioral events" });
  }
});

// POST /crm/leads/:id/behavioral-events
// Records a new behavioral event for a lead.
// Body: { eventType, label?, dClientIntent?, dUrgency?, dTrust?,
//         dProjectReadiness?, dBudgetConfidence?, dCommunicationScore?,
//         dReferralProbability?, metadata?, occurredAt? }
router.post("/crm/leads/:id/behavioral-events", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

    const {
      eventType, label, occurredAt,
      dClientIntent, dUrgency, dTrust,
      dProjectReadiness, dBudgetConfidence,
      dCommunicationScore, dReferralProbability,
      metadata,
    } = req.body as Partial<InsertCrmBehavioralEvent> & { occurredAt?: string };

    if (!eventType) { res.status(400).json({ error: "eventType is required" }); return; }

    const row: InsertCrmBehavioralEvent = {
      leadId: id,
      eventType,
      ...(label              !== undefined && { label }),
      ...(occurredAt         !== undefined && { occurredAt: new Date(occurredAt) }),
      ...(dClientIntent      !== undefined && { dClientIntent }),
      ...(dUrgency           !== undefined && { dUrgency }),
      ...(dTrust             !== undefined && { dTrust }),
      ...(dProjectReadiness  !== undefined && { dProjectReadiness }),
      ...(dBudgetConfidence  !== undefined && { dBudgetConfidence }),
      ...(dCommunicationScore!== undefined && { dCommunicationScore }),
      ...(dReferralProbability!==undefined && { dReferralProbability }),
      ...(metadata           !== undefined && { metadata }),
    };

    const [inserted] = await db.insert(crmBehavioralEvents).values(row).returning();
    req.log.info({ leadId: id, eventType }, "Behavioral event recorded");
    res.status(201).json({ event: inserted });
  } catch (err) {
    req.log.error({ err }, "Error recording behavioral event");
    res.status(500).json({ error: "Failed to record behavioral event" });
  }
});

// DELETE /crm/leads/:id/behavioral-events/:eventId
// Removes a single behavioral event (manual correction).
router.delete("/crm/leads/:id/behavioral-events/:eventId", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const leadId  = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    if (isNaN(leadId) || isNaN(eventId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .delete(crmBehavioralEvents)
      .where(and(eq(crmBehavioralEvents.id, eventId), eq(crmBehavioralEvents.leadId, leadId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting behavioral event");
    res.status(500).json({ error: "Failed to delete behavioral event" });
  }
});

// ── Campaign Steps CRUD ───────────────────────────────────────────────────────

router.get("/crm/campaigns/:id/steps", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const steps = await db
      .select()
      .from(crmCampaignSteps)
      .where(eq(crmCampaignSteps.campaignId, id))
      .orderBy(crmCampaignSteps.stepNumber);
    res.json({ steps });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign steps");
    res.status(500).json({ error: "Failed to fetch steps" });
  }
});

router.post("/crm/campaigns/:id/steps", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const {
      stepNumber, dayOffset, channel, subject, body, callPrompt, taskDescription, sendTime, businessDaysOnly,
      intentLabel, branchOnEvent, branchWindowHours, branchTrueNextStepId, branchFalseNextStepId,
    } = req.body as Record<string, unknown>;
    const allowedChannels  = ["email","sms","call_prompt","task"];
    const allowedSendTimes = ["immediate","morning","afternoon","evening"];
    const allowedBranchEvents = ["opened","clicked","no_reply"];
    if (!channel || !allowedChannels.includes(String(channel))) {
      res.status(400).json({ error: "channel must be one of: email, sms, call_prompt, task" }); return;
    }

    const [step] = await db.insert(crmCampaignSteps).values({
      campaignId:      id,
      stepNumber:      stepNumber      !== undefined ? Number(stepNumber) : 1,
      dayOffset:       dayOffset       !== undefined ? Number(dayOffset)  : 0,
      channel:         String(channel),
      subject:         subject         ? String(subject)         : null,
      body:            body            ? String(body)            : null,
      callPrompt:      callPrompt      ? String(callPrompt)      : null,
      taskDescription: taskDescription ? String(taskDescription) : null,
      sendTime:        sendTime && allowedSendTimes.includes(String(sendTime)) ? String(sendTime) : "immediate",
      businessDaysOnly: businessDaysOnly !== undefined ? Boolean(businessDaysOnly) : true,
      intentLabel:      intentLabel ? String(intentLabel) : null,
      branchOnEvent:    branchOnEvent && allowedBranchEvents.includes(String(branchOnEvent)) ? String(branchOnEvent) : null,
      branchWindowHours: branchWindowHours !== undefined && branchWindowHours !== null ? Number(branchWindowHours) : null,
      branchTrueNextStepId: branchTrueNextStepId !== undefined && branchTrueNextStepId !== null ? Number(branchTrueNextStepId) : null,
      branchFalseNextStepId: branchFalseNextStepId !== undefined && branchFalseNextStepId !== null ? Number(branchFalseNextStepId) : null,
    }).returning();
    res.status(201).json({ step });
  } catch (err) {
    req.log.error({ err }, "Error creating campaign step");
    res.status(500).json({ error: "Failed to create step" });
  }
});

router.patch("/crm/campaigns/:id/steps/:stepId", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (isNaN(id) || isNaN(stepId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const {
      stepNumber, dayOffset, channel, subject, body, callPrompt, taskDescription, sendTime, businessDaysOnly,
      intentLabel, branchOnEvent, branchWindowHours, branchTrueNextStepId, branchFalseNextStepId,
    } = req.body as Record<string, unknown>;
    const allowedChannels  = ["email","sms","call_prompt","task"];
    const allowedSendTimes = ["immediate","morning","afternoon","evening"];
    const allowedBranchEvents = ["opened","clicked","no_reply"];
    const updates: Record<string, unknown> = {};
    if (stepNumber      !== undefined) updates.stepNumber      = Number(stepNumber);
    if (dayOffset       !== undefined) updates.dayOffset       = Number(dayOffset);
    if (channel         !== undefined && allowedChannels.includes(String(channel)))   updates.channel  = String(channel);
    if (sendTime        !== undefined && allowedSendTimes.includes(String(sendTime))) updates.sendTime = String(sendTime);
    if (subject         !== undefined) updates.subject         = subject         ? String(subject)         : null;
    if (body            !== undefined) updates.body            = body            ? String(body)            : null;
    if (callPrompt      !== undefined) updates.callPrompt      = callPrompt      ? String(callPrompt)      : null;
    if (taskDescription !== undefined) updates.taskDescription = taskDescription ? String(taskDescription) : null;
    if (businessDaysOnly !== undefined) updates.businessDaysOnly = Boolean(businessDaysOnly);
    if (intentLabel      !== undefined) updates.intentLabel      = intentLabel ? String(intentLabel) : null;
    if (branchOnEvent    !== undefined) updates.branchOnEvent    = branchOnEvent && allowedBranchEvents.includes(String(branchOnEvent)) ? String(branchOnEvent) : null;
    if (branchWindowHours !== undefined) updates.branchWindowHours = branchWindowHours !== null ? Number(branchWindowHours) : null;
    if (branchTrueNextStepId !== undefined) updates.branchTrueNextStepId = branchTrueNextStepId !== null ? Number(branchTrueNextStepId) : null;
    if (branchFalseNextStepId !== undefined) updates.branchFalseNextStepId = branchFalseNextStepId !== null ? Number(branchFalseNextStepId) : null;
    if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }
    const [step] = await db.update(crmCampaignSteps)
      .set(updates)
      .where(and(eq(crmCampaignSteps.id, stepId), eq(crmCampaignSteps.campaignId, id)))
      .returning();
    if (!step) { res.status(404).json({ error: "Step not found" }); return; }
    res.json({ step });
  } catch (err) {
    req.log.error({ err }, "Error updating campaign step");
    res.status(500).json({ error: "Failed to update step" });
  }
});

router.delete("/crm/campaigns/:id/steps/:stepId", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (isNaN(id) || isNaN(stepId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(crmCampaignSteps)
      .where(and(eq(crmCampaignSteps.id, stepId), eq(crmCampaignSteps.campaignId, id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting campaign step");
    res.status(500).json({ error: "Failed to delete step" });
  }
});

// ── Campaign Sequence Enrollment ──────────────────────────────────────────────

router.post("/crm/campaigns/:id/enroll", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const steps = await db
      .select()
      .from(crmCampaignSteps)
      .where(eq(crmCampaignSteps.campaignId, id))
      .orderBy(crmCampaignSteps.stepNumber);
    if (!steps.length) {
      res.status(400).json({ error: "Campaign has no steps. Add steps before enrolling contacts." }); return;
    }

    const { leadIds } = req.body as { leadIds: number[] };
    if (!Array.isArray(leadIds) || !leadIds.length) {
      res.status(400).json({ error: "leadIds array is required" }); return;
    }

    const leads = await db.select().from(crmLeads).where(inArray(crmLeads.id, leadIds));
    const enrolledAt = new Date();
    let enrolledCount = 0;
    const scheduledMessages: { recipientId: number; stepId: number; leadId: number; subject: string | null; body: string | null; channel: string; scheduledAt: Date; campaignId: number }[] = [];

    for (const lead of leads) {
      // Upsert enrollment — update status if already enrolled
      const [existing] = await db
        .select()
        .from(crmCampaignRecipients)
        .where(and(eq(crmCampaignRecipients.campaignId, id), eq(crmCampaignRecipients.leadId, lead.id)));

      let recipientId: number;
      if (existing) {
        await db.update(crmCampaignRecipients)
          .set({ enrollmentStatus: "active", currentStep: 0, enrolledAt })
          .where(eq(crmCampaignRecipients.id, existing.id));
        recipientId = existing.id;
      } else {
        const [rec] = await db.insert(crmCampaignRecipients)
          .values({ campaignId: id, leadId: lead.id, status: "selected", enrollmentStatus: "active", enrolledAt, currentStep: 0 })
          .returning();
        recipientId = rec.id;
        enrolledCount++;
      }

      // Schedule one message per step
      for (const step of steps) {
        const scheduledAt = new Date(enrolledAt);
        scheduledAt.setDate(scheduledAt.getDate() + step.dayOffset);
        scheduledMessages.push({
          campaignId: id,
          recipientId,
          stepId: step.id,
          leadId: lead.id,
          channel: step.channel,
          subject: step.subject,
          body: step.body,
          scheduledAt,
        });
      }
    }

    if (scheduledMessages.length) {
      await db.insert(crmCampaignScheduledMessages).values(
        scheduledMessages.map(m => ({ ...m, status: "scheduled" }))
      );
    }

    res.json({ ok: true, enrolled: enrolledCount, scheduled: scheduledMessages.length });
  } catch (err) {
    req.log.error({ err }, "Error enrolling leads in campaign");
    res.status(500).json({ error: "Failed to enroll leads" });
  }
});

// ── Campaign Recipient Enrollment Status ──────────────────────────────────────

router.patch("/crm/campaigns/:id/recipients/:rid/status", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  try {
    const id  = Number(req.params.id);
    const rid = Number(req.params.rid);
    if (isNaN(id) || isNaN(rid)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const { enrollmentStatus } = req.body as { enrollmentStatus: string };
    const allowed = ["active","paused","completed","stopped"];
    if (!allowed.includes(enrollmentStatus)) {
      res.status(400).json({ error: "enrollmentStatus must be one of: active, paused, completed, stopped" }); return;
    }
    const [updated] = await db.update(crmCampaignRecipients)
      .set({ enrollmentStatus })
      .where(and(eq(crmCampaignRecipients.id, rid), eq(crmCampaignRecipients.campaignId, id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Recipient not found" }); return; }

    // Cancel pending scheduled messages if stopped or paused
    if (enrollmentStatus === "stopped" || enrollmentStatus === "paused") {
      await db.update(crmCampaignScheduledMessages)
        .set({ status: enrollmentStatus === "stopped" ? "canceled" : "scheduled" })
        .where(and(
          eq(crmCampaignScheduledMessages.recipientId, rid),
          eq(crmCampaignScheduledMessages.status, "scheduled"),
        ));
    }
    res.json({ ok: true, recipient: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating recipient enrollment status");
    res.status(500).json({ error: "Failed to update enrollment status" });
  }
});

// ── Campaign Activity Feed ────────────────────────────────────────────────────

router.get("/crm/campaigns/:id/activity", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, id));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const messages = await db
      .select({
        id:          crmCampaignScheduledMessages.id,
        channel:     crmCampaignScheduledMessages.channel,
        subject:     crmCampaignScheduledMessages.subject,
        status:      crmCampaignScheduledMessages.status,
        scheduledAt: crmCampaignScheduledMessages.scheduledAt,
        sentAt:      crmCampaignScheduledMessages.sentAt,
        lastError:   crmCampaignScheduledMessages.lastError,
        stepId:      crmCampaignScheduledMessages.stepId,
        leadId:      crmCampaignScheduledMessages.leadId,
        leadName:    crmLeads.name,
        leadEmail:   crmLeads.email,
      })
      .from(crmCampaignScheduledMessages)
      .innerJoin(crmLeads, eq(crmCampaignScheduledMessages.leadId, crmLeads.id))
      .where(eq(crmCampaignScheduledMessages.campaignId, id))
      .orderBy(desc(crmCampaignScheduledMessages.scheduledAt));

    const events = await db
      .select()
      .from(crmCampaignEvents)
      .where(
        inArray(
          crmCampaignEvents.campaignRecipientId,
          db.select({ id: crmCampaignRecipients.id })
            .from(crmCampaignRecipients)
            .where(eq(crmCampaignRecipients.campaignId, id))
        )
      )
      .orderBy(desc(crmCampaignEvents.occurredAt));

    res.json({ messages, events });
  } catch (err) {
    req.log.error({ err }, "Error fetching campaign activity");
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

export default router;
