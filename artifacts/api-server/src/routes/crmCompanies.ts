// ── M7: companies and accounts ──────────────────────────────────────────────
//
// A company is its own record, and the people who work there are contacts that
// point at it (`crm_leads.company_id`). Completeness criterion 1.7 — "a
// customer is still a lead with status Client" — is what this closes.
//
// Registered BEFORE `crmRouter` in routes/index.ts, for the reason the
// contacts, portal, history, reports and marketing routers are: `crm.ts`
// carries parameterised `/crm/:something/...` routes, and a literal path
// registered after them is resolved as a parameter value instead of as itself
// (the defect fixed in 3508a43). Inside this file the literal
// `/crm/companies/suggestions*` routes are likewise registered before
// `/crm/companies/:id`.
//
// Permissions: `leads.read` to look, `leads.write` to change, and
// `leads.delete` — owner-only — to destroy a company record. A company is part
// of the contact book, so it is governed by the contact book's grants rather
// than a new permission nobody has been given.
//
// Two rules worth stating once, because everything here follows from them:
//
//   1. NOTHING is linked that a person did not choose. There is no backfill and
//      no derivation from `crm_leads.company`; the suggestions endpoint groups
//      unlinked contacts and a person applies the groups they picked, by
//      explicit contact id.
//   2. A company's figures are DERIVED THROUGH ITS PEOPLE, and each summary
//      says so in its own `basis`. If a sub-query fails, the request fails —
//      a company page must never show a confident zero it could not read.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db, crmCompanies, crmLeads, crmStaff, crmContactMerges, crmActivities,
  crmDeals, crmProjects, crmSupportTickets, crmQuotes, crmInvoices,
  quoteReference, invoiceReference, supportTicketReference,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import {
  buildCompanySuggestions, escapeLike, parseApplyRequest, parseCompanyInput, positiveId,
  FREE_MAIL_DOMAINS, FREE_MAIL_FAMILIES, type ApplyGroup, type CompanyValues,
} from "../lib/companies.js";

const router: IRouter = Router();

/** Anything that can run a statement — the pool, or an open transaction. */
type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

const ownerStaff = alias(crmStaff, "company_owner");
const creatorStaff = alias(crmStaff, "company_creator");

/** Statuses a support ticket counts as open under. */
const OPEN_TICKET_STATUSES = ["new", "open", "waiting_on_customer"] as const;

function actorLabel(req: Request): string {
  const s = req.staffAuth?.staff;
  return s ? (s.displayName || s.email) : "admin";
}
function actorStaffId(req: Request): number | null {
  return req.staffAuth?.staff.id ?? null;
}

/** A merged-away contact is not part of the book, so it is not one of a company's people. */
const notMerged = sql`NOT EXISTS (SELECT 1 FROM ${crmContactMerges} cm WHERE cm.merged_lead_id = ${crmLeads.id})`;

/** How many people are linked to the company row being selected. */
const peopleCount = sql<number>`(
  SELECT count(*)::int FROM ${crmLeads} pl
   WHERE pl.company_id = ${crmCompanies.id}
     AND NOT EXISTS (SELECT 1 FROM ${crmContactMerges} pm WHERE pm.merged_lead_id = pl.id)
)`;

const LIST_COLUMNS = {
  id: crmCompanies.id,
  name: crmCompanies.name,
  domain: crmCompanies.domain,
  website: crmCompanies.website,
  phone: crmCompanies.phone,
  industry: crmCompanies.industry,
  city: crmCompanies.city,
  region: crmCompanies.region,
  country: crmCompanies.country,
  ownerStaffId: crmCompanies.ownerStaffId,
  archivedAt: crmCompanies.archivedAt,
  createdAt: crmCompanies.createdAt,
  updatedAt: crmCompanies.updatedAt,
  ownerName: ownerStaff.displayName,
  ownerEmail: ownerStaff.email,
  ownerStatus: ownerStaff.status,
  peopleCount,
};

const DETAIL_COLUMNS = {
  ...LIST_COLUMNS,
  normalizedName: crmCompanies.normalizedName,
  addressLine1: crmCompanies.addressLine1,
  addressLine2: crmCompanies.addressLine2,
  postalCode: crmCompanies.postalCode,
  notes: crmCompanies.notes,
  createdByStaffId: crmCompanies.createdByStaffId,
  createdByName: creatorStaff.displayName,
};

type CompanyRow = Record<string, unknown> & {
  ownerStaffId: number | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerStatus?: string | null;
  createdByStaffId?: number | null;
  createdByName?: string | null;
  peopleCount?: number | string | null;
};

/** The wire shape: the owner as a person rather than three loose columns. */
function shapeCompany(row: CompanyRow) {
  const { ownerName, ownerEmail, ownerStatus, createdByName, ...rest } = row;
  return {
    ...rest,
    peopleCount: Number(row.peopleCount ?? 0),
    owner: row.ownerStaffId != null
      ? { id: row.ownerStaffId, displayName: ownerName ?? null, email: ownerEmail ?? null, status: ownerStatus ?? null }
      : null,
    createdBy: row.createdByStaffId != null ? { id: row.createdByStaffId, displayName: createdByName ?? null } : null,
  };
}

async function loadCompany(id: number, exec: Executor = db) {
  const [row] = await exec.select(DETAIL_COLUMNS).from(crmCompanies)
    .leftJoin(ownerStaff, eq(ownerStaff.id, crmCompanies.ownerStaffId))
    .leftJoin(creatorStaff, eq(creatorStaff.id, crmCompanies.createdByStaffId))
    .where(eq(crmCompanies.id, id))
    .limit(1);
  return row ? shapeCompany(row as CompanyRow) : null;
}

/**
 * Whether this person may be given a company to look after.
 *
 * Only an ACTIVE account, and only when the owner is actually changing — a
 * company whose owner has since been disabled can still be edited without
 * being forced to change hands, which is the same rule the contact owner picker
 * follows (lib/leadAssignee.ts).
 */
async function ownerProblem(next: number | null | undefined, current: number | null): Promise<string | null> {
  if (next === undefined || next === null || next === current) return null;
  const [person] = await db.select({ id: crmStaff.id, status: crmStaff.status })
    .from(crmStaff).where(eq(crmStaff.id, next)).limit(1);
  if (!person) return "That person does not exist.";
  if (person.status !== "active") return "That account is not active, so it cannot be given new work.";
  return null;
}

export interface DuplicateCandidate {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  peopleCount: number;
  matchedOn: Array<"name" | "domain">;
}

/**
 * Companies that look like the one about to be created.
 *
 * Neither key is unique — two real businesses can share a name, and a group and
 * its subsidiary can share a domain — so this is a warning with its evidence,
 * never a refusal on its own. Archived companies are not offered: they cannot
 * be linked to, and suggesting one as "already exists" would be a dead end.
 */
async function duplicateCandidates(
  exec: Executor,
  match: { normalizedName?: string; domain?: string | null; excludeId?: number },
): Promise<DuplicateCandidate[]> {
  const tests: SQL[] = [];
  if (match.normalizedName) tests.push(eq(crmCompanies.normalizedName, match.normalizedName));
  if (match.domain) tests.push(eq(crmCompanies.domain, match.domain));
  if (tests.length === 0) return [];

  const rows = await exec.select({
    id: crmCompanies.id,
    name: crmCompanies.name,
    normalizedName: crmCompanies.normalizedName,
    domain: crmCompanies.domain,
    website: crmCompanies.website,
    peopleCount,
  }).from(crmCompanies)
    .where(and(
      isNull(crmCompanies.archivedAt),
      tests.length === 1 ? tests[0] : or(...tests)!,
      match.excludeId ? ne(crmCompanies.id, match.excludeId) : undefined,
    ))
    .orderBy(asc(crmCompanies.id))
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    website: r.website,
    peopleCount: Number(r.peopleCount ?? 0),
    matchedOn: [
      match.normalizedName && r.normalizedName === match.normalizedName ? ("name" as const) : null,
      match.domain && r.domain === match.domain ? ("domain" as const) : null,
    ].filter((x): x is "name" | "domain" => x !== null),
  }));
}

function duplicateMessage(candidates: DuplicateCandidate[]): string {
  const first = candidates[0];
  const byName = first.matchedOn.includes("name");
  return `${candidates.length === 1 ? "A company" : `${candidates.length} companies`} already ${candidates.length === 1 ? "matches" : "match"} `
    + `${byName ? "that name" : "that domain"} — ${first.name}${first.domain ? ` (${first.domain})` : ""}`
    + `${candidates.length > 1 ? ", among others" : ""}. Open it, or send confirmDuplicate to create this one anyway.`;
}

/** The advisory lock a create takes, so two identical creates queue rather than race. */
function nameLock(exec: Executor, normalizedName: string) {
  return exec.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crm_companies:${normalizedName}`}))`);
}

// ── List ────────────────────────────────────────────────────────────────────

router.get("/crm/companies", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;
    const search = typeof q["search"] === "string" ? q["search"].trim().slice(0, 200) : "";
    const ownerRaw = typeof q["ownerStaffId"] === "string" ? q["ownerStaffId"].trim() : "";
    const includeArchived = q["includeArchived"] === "true" || q["includeArchived"] === "1";
    const limitRaw = Number(q["limit"]);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 50;
    const offsetRaw = Number(q["offset"]);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

    const conditions: SQL[] = [];
    if (!includeArchived) conditions.push(isNull(crmCompanies.archivedAt));
    if (search) {
      const like = `%${escapeLike(search)}%`;
      conditions.push(or(ilike(crmCompanies.name, like), ilike(crmCompanies.domain, like))!);
    }
    if (ownerRaw === "none") {
      conditions.push(isNull(crmCompanies.ownerStaffId));
    } else if (ownerRaw) {
      const ownerId = positiveId(ownerRaw);
      if (ownerId === null) {
        res.status(400).json({ error: "ownerStaffId must be a person's id, or \"none\" for companies nobody looks after." });
        return;
      }
      conditions.push(eq(crmCompanies.ownerStaffId, ownerId));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [[totals], rows, [archived]] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(crmCompanies).where(where),
      db.select(LIST_COLUMNS).from(crmCompanies)
        .leftJoin(ownerStaff, eq(ownerStaff.id, crmCompanies.ownerStaffId))
        .where(where)
        .orderBy(asc(crmCompanies.normalizedName), asc(crmCompanies.id))
        .limit(limit).offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(crmCompanies).where(isNotNull(crmCompanies.archivedAt)),
    ]);

    res.json({
      companies: rows.map((r) => shapeCompany(r as CompanyRow)),
      total: Number(totals?.n ?? 0),
      limit,
      offset,
      archivedCount: Number(archived?.n ?? 0),
      peopleCountMeans: "People linked to the company. A contact merged into another one is not counted — it is not part of the contact book any more.",
    });
  } catch (err) {
    req.log.error({ err }, "company list failed");
    res.status(500).json({ error: "Couldn't load companies." });
  }
});

// ── Suggestions ─────────────────────────────────────────────────────────────
//
// Registered before `/crm/companies/:id` so "suggestions" is never read as an id.

const MAX_SUGGESTION_CONTACTS = 50_000;

router.get("/crm/companies/suggestions", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const [contacts, companies] = await Promise.all([
      db.select({
        id: crmLeads.id, name: crmLeads.name, email: crmLeads.email,
        company: crmLeads.company, phone: crmLeads.phone, status: crmLeads.status,
      }).from(crmLeads)
        .where(and(isNull(crmLeads.companyId), notMerged))
        .orderBy(asc(crmLeads.id))
        .limit(MAX_SUGGESTION_CONTACTS),
      db.select({
        id: crmCompanies.id, name: crmCompanies.name,
        normalizedName: crmCompanies.normalizedName, domain: crmCompanies.domain,
        archivedAt: crmCompanies.archivedAt,
      }).from(crmCompanies),
    ]);

    const suggestions = buildCompanySuggestions(contacts, companies);
    res.json({
      ...suggestions,
      contactsTruncated: contacts.length === MAX_SUGGESTION_CONTACTS,
      rules: {
        companyText: "Contacts not linked to a company, grouped by their company text with the case, the edge spaces and the repeated spaces ignored. The label is the most common spelling.",
        emailDomain: "The same contacts grouped by the domain of their email address, with consumer mailbox providers and the placeholder addresses an import mints left out — two people at gmail.com are not colleagues.",
        overlap: "A contact can appear in both lists. Applying both is safe: the second finds it already linked and says so.",
        nothingAutomatic: "This endpoint writes nothing. Contacts are linked only by /crm/companies/suggestions/apply, and only the ones you list.",
      },
      freeMailProviders: { exact: FREE_MAIL_DOMAINS, families: FREE_MAIL_FAMILIES },
    });
  } catch (err) {
    req.log.error({ err }, "company suggestions failed");
    res.status(500).json({ error: "Couldn't work out which contacts could become companies." });
  }
});

/** Thrown inside the apply transaction; every group is rolled back together. */
class ApplyRefusal extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body["error"] ?? "refused"));
  }
}

interface ApplyResult {
  groupIndex: number;
  action: ApplyGroup["action"];
  company: { id: number; name: string } | null;
  created: boolean;
  linked: Array<{ id: number; name: string }>;
  skipped: Array<{ id: number; name: string; reason: "already_linked" | "merged"; companyId?: number | null; mergedIntoId?: number }>;
  note: string | null;
}

router.post("/crm/companies/suggestions/apply", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const parsed = parseApplyRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, groupIndex: parsed.groupIndex, field: parsed.field });
    return;
  }

  // Owner ids are checked before the transaction opens: a refusal here has
  // written nothing, and does not need a rollback to say so.
  for (const [index, group] of parsed.groups.entries()) {
    if (group.action !== "create") continue;
    const problem = await ownerProblem(group.company.ownerStaffId, null);
    if (problem) {
      res.status(400).json({ error: `Suggestion ${index + 1}: ${problem}`, groupIndex: index, field: "ownerStaffId" });
      return;
    }
  }

  try {
    const results = await db.transaction(async (tx) => {
      const out: ApplyResult[] = [];
      for (const [index, group] of parsed.groups.entries()) {
        // The listed contacts, locked, so a concurrent apply cannot link the
        // same person twice and two requests cannot disagree about who was skipped.
        const listed = await tx.select({ id: crmLeads.id, name: crmLeads.name, companyId: crmLeads.companyId })
          .from(crmLeads).where(inArray(crmLeads.id, group.contactIds)).orderBy(asc(crmLeads.id)).for("update");
        const present = new Set(listed.map((r) => r.id));
        const missing = group.contactIds.filter((id) => !present.has(id));
        if (missing.length > 0) {
          throw new ApplyRefusal(404, {
            error: `Suggestion ${index + 1} lists ${missing.length === 1 ? "a contact that does not exist" : "contacts that do not exist"}: #${missing.join(", #")}.`,
            groupIndex: index,
            missingContactIds: missing,
          });
        }

        const mergedRows = await tx.select({
          id: crmContactMerges.mergedLeadId, into: crmContactMerges.primaryLeadId,
        }).from(crmContactMerges).where(inArray(crmContactMerges.mergedLeadId, group.contactIds));
        const mergedInto = new Map(mergedRows.map((m) => [m.id, m.into]));

        const skipped: ApplyResult["skipped"] = [];
        const linkable: Array<{ id: number; name: string }> = [];
        for (const row of listed) {
          if (mergedInto.has(row.id)) {
            skipped.push({ id: row.id, name: row.name, reason: "merged", mergedIntoId: mergedInto.get(row.id) });
          } else if (row.companyId !== null) {
            skipped.push({ id: row.id, name: row.name, reason: "already_linked", companyId: row.companyId });
          } else {
            linkable.push({ id: row.id, name: row.name });
          }
        }

        let company: { id: number; name: string } | null = null;
        let created = false;

        if (group.action === "link") {
          const [target] = await tx.select({ id: crmCompanies.id, name: crmCompanies.name, archivedAt: crmCompanies.archivedAt })
            .from(crmCompanies).where(eq(crmCompanies.id, group.companyId)).for("share");
          if (!target) {
            throw new ApplyRefusal(404, { error: `Suggestion ${index + 1}: company #${group.companyId} does not exist.`, groupIndex: index });
          }
          if (target.archivedAt) {
            throw new ApplyRefusal(409, {
              code: "company_archived",
              error: `Suggestion ${index + 1}: ${target.name} is archived. Restore it before linking people to it.`,
              groupIndex: index,
            });
          }
          company = { id: target.id, name: target.name };
        } else if (linkable.length > 0) {
          // A company is created ONLY when it would gain somebody. That is what
          // makes applying the same selection twice a no-op instead of a pile of
          // empty duplicates.
          await nameLock(tx, group.company.normalizedName);
          const candidates = await duplicateCandidates(tx, {
            normalizedName: group.company.normalizedName,
            domain: group.company.domain ?? null,
          });
          if (candidates.length > 0 && !group.confirmDuplicate) {
            throw new ApplyRefusal(409, {
              code: "possible_duplicate",
              error: `Suggestion ${index + 1}: ${duplicateMessage(candidates)}`,
              groupIndex: index,
              candidates,
            });
          }
          const [row] = await tx.insert(crmCompanies)
            .values({ ...(group.company as CompanyValues & { name: string; normalizedName: string }), createdByStaffId: actorStaffId(req) })
            .returning({ id: crmCompanies.id, name: crmCompanies.name });
          company = row;
          created = true;
        }

        let linked: Array<{ id: number; name: string }> = [];
        if (company && linkable.length > 0) {
          // `isNull(companyId)` as well as the id list: the rows are locked, so
          // this cannot lose a race, and it states the rule the route promises —
          // an already-linked contact is never re-pointed by a suggestion.
          //
          // `updated_at` is deliberately NOT bumped. Linking somebody to their
          // employer is filing, not working the contact, and bumping it would
          // make every contact in the book look freshly worked on the morning
          // somebody tidied the company list (the argument M6 makes about the
          // owner backfill).
          const updated = await tx.update(crmLeads)
            .set({ companyId: company.id })
            .where(and(inArray(crmLeads.id, linkable.map((r) => r.id)), isNull(crmLeads.companyId)))
            .returning({ id: crmLeads.id, name: crmLeads.name });
          linked = updated;
          if (updated.length > 0) {
            await tx.insert(crmActivities).values(updated.map((u) => ({
              leadId: u.id,
              type: "company_linked",
              title: `Linked to ${company!.name}`,
              description: "Applied from the reviewed company suggestions.",
              metadata: { companyId: company!.id, source: "company_suggestions" },
              createdBy: actorLabel(req),
            })));
          }
        }

        out.push({
          groupIndex: index,
          action: group.action,
          company,
          created,
          linked,
          skipped,
          note: group.action === "create" && !created
            ? "No company was created: every contact listed is already linked, or has been merged into another contact."
            : null,
        });
      }
      return out;
    });

    for (const result of results) {
      if (result.created && result.company) {
        await auditAction(req, "company.created", `company:${result.company.id} ${result.company.name} (from suggestions)`);
      }
      if (result.linked.length > 0 && result.company) {
        await auditAction(req, "company.people.linked",
          `company:${result.company.id} leads:${result.linked.slice(0, 25).map((l) => l.id).join(",")}${result.linked.length > 25 ? `+${result.linked.length - 25}` : ""}`);
      }
    }
    const totals = {
      companiesCreated: results.filter((r) => r.created).length,
      contactsLinked: results.reduce((n, r) => n + r.linked.length, 0),
      contactsSkipped: results.reduce((n, r) => n + r.skipped.length, 0),
    };
    await auditAction(req, "company.suggestions.applied",
      `groups=${results.length} created=${totals.companiesCreated} linked=${totals.contactsLinked} skipped=${totals.contactsSkipped}`);

    res.json({
      results,
      totals,
      note: "Only the contacts you listed were linked. A contact already linked to a company was left as it was and is reported above.",
    });
  } catch (err) {
    if (err instanceof ApplyRefusal) {
      res.status(err.status).json({
        ...err.body,
        applied: false,
        note: "Nothing was applied — every suggestion in this request was rolled back together.",
      });
      return;
    }
    req.log.error({ err }, "applying company suggestions failed");
    res.status(500).json({ error: "The suggestions could not be applied. Nothing was changed." });
  }
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post("/crm/companies", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parsed = parseCompanyInput(body, "create");
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, field: parsed.field });
    return;
  }
  const values = parsed.values as CompanyValues & { name: string; normalizedName: string };

  try {
    const problem = await ownerProblem(values.ownerStaffId, null);
    if (problem) { res.status(400).json({ error: problem, field: "ownerStaffId" }); return; }

    const outcome = await db.transaction(async (tx) => {
      await nameLock(tx, values.normalizedName);
      const candidates = await duplicateCandidates(tx, {
        normalizedName: values.normalizedName,
        domain: values.domain ?? null,
      });
      if (candidates.length > 0 && body["confirmDuplicate"] !== true) {
        return { duplicates: candidates, id: null as number | null };
      }
      const [row] = await tx.insert(crmCompanies)
        .values({ ...values, createdByStaffId: actorStaffId(req) })
        .returning({ id: crmCompanies.id });
      return { duplicates: candidates, id: row.id };
    });

    if (outcome.id === null) {
      res.status(409).json({
        code: "possible_duplicate",
        error: duplicateMessage(outcome.duplicates),
        candidates: outcome.duplicates,
        created: false,
      });
      return;
    }

    await auditAction(req, "company.created",
      `company:${outcome.id} ${values.name}${outcome.duplicates.length > 0 ? " (created despite a possible duplicate)" : ""}`);
    res.status(201).json({
      company: await loadCompany(outcome.id),
      createdDespiteDuplicates: outcome.duplicates.length > 0 ? outcome.duplicates : undefined,
    });
  } catch (err) {
    req.log.error({ err }, "company create failed");
    res.status(500).json({ error: "The company could not be created." });
  }
});

// ── One company, and everything reached through its people ──────────────────

router.get("/crm/companies/:id", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const id = positiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid company id." }); return; }
  try {
    const company = await loadCompany(id);
    if (!company) { res.status(404).json({ error: "Company not found." }); return; }

    const people = await db.select({
      id: crmLeads.id, name: crmLeads.name, email: crmLeads.email, phone: crmLeads.phone,
      company: crmLeads.company, status: crmLeads.status, priority: crmLeads.priority,
      assignedTo: crmLeads.assignedTo, assignedToStaffId: crmLeads.assignedToStaffId,
      lastContactedAt: crmLeads.lastContactedAt, nextFollowUpAt: crmLeads.nextFollowUpAt,
      createdAt: crmLeads.createdAt, updatedAt: crmLeads.updatedAt,
    }).from(crmLeads)
      .where(and(eq(crmLeads.companyId, id), notMerged))
      .orderBy(asc(sql`lower(${crmLeads.name})`), asc(crmLeads.id));

    const summaries = await loadSummaries(people);
    res.json({ company, people, summaries });
  } catch (err) {
    req.log.error({ err }, "company detail failed");
    res.status(500).json({
      error: "Couldn't load this company's records. Nothing is shown as zero when it could not be read — try again.",
    });
  }
});

/**
 * Everything a company has going on, reached THROUGH the contacts linked to it.
 *
 * Every summary carries its own `basis` for the same reason: a deal belongs to a
 * contact, not to a company, so "this company's deals" is a derivation and the
 * page has to say which one. A deal on a contact nobody has linked here is not
 * counted, and the sentence says so.
 *
 * Nothing here is caught: if a sub-query fails the whole request fails, because
 * a zero that is really "the query failed" is the worst thing this page could show.
 */
async function loadSummaries(people: Array<{ id: number; name: string }>) {
  const ids = people.map((p) => p.id);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const through = `the ${ids.length} ${ids.length === 1 ? "person" : "people"} linked to this company`;
  const none = "No contacts are linked to this company yet, so nothing is attributed to it.";

  if (ids.length === 0) {
    const empty = (what: string) => ({ basis: `${what} would be counted through the contacts linked to this company. ${none}`, count: 0, items: [], truncated: false });
    return {
      deals: { ...empty("Deals"), totals: { open: 0, openValue: "0", wonValue: "0" } },
      projects: empty("Projects"),
      supportTickets: { ...empty("Open support tickets"), openStatuses: OPEN_TICKET_STATUSES },
      quotes: empty("Quotes"),
      invoices: { ...empty("Invoices"), outstandingByCurrency: [], paidByCurrency: [] },
      activities: empty("Timeline entries"),
    };
  }

  const LIMIT = 50;
  const [deals, dealTotals, projects, projectCount, tickets, ticketCount, quotes, quoteCount, invoices, invoiceTotals, activities] =
    await Promise.all([
      db.select({
        id: crmDeals.id, name: crmDeals.name, value: crmDeals.value, stage: crmDeals.stage,
        leadId: crmDeals.leadId, closeDate: crmDeals.closeDate, updatedAt: crmDeals.updatedAt,
      }).from(crmDeals).where(inArray(crmDeals.leadId, ids)).orderBy(desc(crmDeals.updatedAt), desc(crmDeals.id)).limit(LIMIT),
      db.select({
        count: sql<number>`count(*)::int`,
        open: sql<number>`count(*) FILTER (WHERE ${crmDeals.stage} NOT IN ('Won', 'Lost'))::int`,
        openValue: sql<string>`coalesce(sum(${crmDeals.value}) FILTER (WHERE ${crmDeals.stage} NOT IN ('Won', 'Lost')), 0)::text`,
        wonValue: sql<string>`coalesce(sum(${crmDeals.value}) FILTER (WHERE ${crmDeals.stage} = 'Won'), 0)::text`,
      }).from(crmDeals).where(inArray(crmDeals.leadId, ids)),
      db.select({
        id: crmProjects.id, name: crmProjects.name, stage: crmProjects.stage,
        projectType: crmProjects.projectType, leadId: crmProjects.leadId,
        targetLaunchDate: crmProjects.targetLaunchDate, updatedAt: crmProjects.updatedAt,
      }).from(crmProjects).where(inArray(crmProjects.leadId, ids)).orderBy(desc(crmProjects.updatedAt), desc(crmProjects.id)).limit(LIMIT),
      db.select({ n: sql<number>`count(*)::int` }).from(crmProjects).where(inArray(crmProjects.leadId, ids)),
      db.select({
        id: crmSupportTickets.id, subject: crmSupportTickets.subject, status: crmSupportTickets.status,
        priority: crmSupportTickets.priority, leadId: crmSupportTickets.leadId,
        createdAt: crmSupportTickets.createdAt, updatedAt: crmSupportTickets.updatedAt,
      }).from(crmSupportTickets)
        .where(and(inArray(crmSupportTickets.leadId, ids), inArray(crmSupportTickets.status, [...OPEN_TICKET_STATUSES])))
        .orderBy(desc(crmSupportTickets.updatedAt), desc(crmSupportTickets.id)).limit(LIMIT),
      db.select({
        open: sql<number>`count(*) FILTER (WHERE ${crmSupportTickets.status} IN ('new', 'open', 'waiting_on_customer'))::int`,
        all: sql<number>`count(*)::int`,
      }).from(crmSupportTickets).where(inArray(crmSupportTickets.leadId, ids)),
      db.select({
        id: crmQuotes.id, title: crmQuotes.title, status: crmQuotes.status, total: crmQuotes.total,
        currency: crmQuotes.currency, leadId: crmQuotes.leadId, validUntil: crmQuotes.validUntil,
        sentAt: crmQuotes.sentAt, acceptedAt: crmQuotes.acceptedAt, createdAt: crmQuotes.createdAt,
      }).from(crmQuotes).where(inArray(crmQuotes.leadId, ids)).orderBy(desc(crmQuotes.createdAt), desc(crmQuotes.id)).limit(LIMIT),
      db.select({ n: sql<number>`count(*)::int` }).from(crmQuotes).where(inArray(crmQuotes.leadId, ids)),
      db.select({
        id: crmInvoices.id, title: crmInvoices.title, status: crmInvoices.status, total: crmInvoices.total,
        amountPaid: crmInvoices.amountPaid, currency: crmInvoices.currency, leadId: crmInvoices.leadId,
        dueDate: crmInvoices.dueDate, issuedAt: crmInvoices.issuedAt, createdAt: crmInvoices.createdAt,
      }).from(crmInvoices).where(inArray(crmInvoices.leadId, ids)).orderBy(desc(crmInvoices.createdAt), desc(crmInvoices.id)).limit(LIMIT),
      // Money is summed per currency and never across them.
      db.select({
        currency: crmInvoices.currency,
        count: sql<number>`count(*)::int`,
        outstanding: sql<string>`coalesce(sum(${crmInvoices.total} - ${crmInvoices.amountPaid}) FILTER (WHERE ${crmInvoices.status} IN ('issued', 'part_paid')), 0)::text`,
        paid: sql<string>`coalesce(sum(${crmInvoices.amountPaid}) FILTER (WHERE ${crmInvoices.status} <> 'void'), 0)::text`,
      }).from(crmInvoices).where(inArray(crmInvoices.leadId, ids)).groupBy(crmInvoices.currency).orderBy(asc(crmInvoices.currency)),
      db.select({
        id: crmActivities.id, leadId: crmActivities.leadId, type: crmActivities.type,
        title: crmActivities.title, description: crmActivities.description,
        createdAt: crmActivities.createdAt, createdBy: crmActivities.createdBy,
      }).from(crmActivities).where(inArray(crmActivities.leadId, ids))
        .orderBy(desc(crmActivities.createdAt), desc(crmActivities.id)).limit(25),
    ]);

  const named = <T extends { leadId: number | null }>(rows: T[]) =>
    rows.map((r) => ({ ...r, leadName: r.leadId != null ? who.get(r.leadId) ?? null : null }));

  return {
    deals: {
      basis: `Deals belonging to ${through}. A deal on a contact nobody has linked here is not counted, and a deal with no contact cannot be.`,
      count: Number(dealTotals[0]?.count ?? 0),
      totals: {
        open: Number(dealTotals[0]?.open ?? 0),
        openValue: dealTotals[0]?.openValue ?? "0",
        wonValue: dealTotals[0]?.wonValue ?? "0",
      },
      items: named(deals),
      truncated: Number(dealTotals[0]?.count ?? 0) > deals.length,
    },
    projects: {
      basis: `Projects belonging to ${through}.`,
      count: Number(projectCount[0]?.n ?? 0),
      items: named(projects),
      truncated: Number(projectCount[0]?.n ?? 0) > projects.length,
    },
    supportTickets: {
      basis: `Support tickets belonging to ${through} that are still open (${OPEN_TICKET_STATUSES.join(", ")}). Resolved and closed tickets are counted in "all" only.`,
      count: Number(ticketCount[0]?.open ?? 0),
      all: Number(ticketCount[0]?.all ?? 0),
      openStatuses: OPEN_TICKET_STATUSES,
      items: named(tickets).map((t) => ({ ...t, reference: supportTicketReference(t.id) })),
      truncated: Number(ticketCount[0]?.open ?? 0) > tickets.length,
    },
    quotes: {
      basis: `Quotes raised for ${through}.`,
      count: Number(quoteCount[0]?.n ?? 0),
      items: named(quotes).map((q) => ({ ...q, reference: quoteReference(q.id) })),
      truncated: Number(quoteCount[0]?.n ?? 0) > quotes.length,
    },
    invoices: {
      basis: `Invoices raised for ${through}. Money is totalled per currency and never added across currencies.`,
      count: invoiceTotals.reduce((n, r) => n + Number(r.count ?? 0), 0),
      outstandingByCurrency: invoiceTotals.map((r) => ({ currency: r.currency, amount: r.outstanding })),
      paidByCurrency: invoiceTotals.map((r) => ({ currency: r.currency, amount: r.paid })),
      items: named(invoices).map((i) => ({ ...i, reference: invoiceReference(i.id) })),
      truncated: invoiceTotals.reduce((n, r) => n + Number(r.count ?? 0), 0) > invoices.length,
    },
    activities: {
      basis: `The 25 most recent timeline entries on ${through}.`,
      count: activities.length,
      items: named(activities),
      truncated: activities.length === 25,
    },
  };
}

// ── Update ──────────────────────────────────────────────────────────────────

router.patch("/crm/companies/:id", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const id = positiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid company id." }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const [existing] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Company not found." }); return; }

    const parsed = parseCompanyInput(body, "update", { domain: existing.domain });
    if (!parsed.ok) { res.status(400).json({ error: parsed.error, field: parsed.field }); return; }

    // Only what actually differs is written, so an edit that changes nothing is
    // not recorded as a change in the audit trail.
    const record = existing as unknown as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.values)) {
      if (key === "normalizedName") continue;
      if (String(record[key] ?? "") !== String(value ?? "")) changes[key] = value;
    }
    if ("name" in changes) changes["normalizedName"] = parsed.values.normalizedName;

    if (Object.keys(changes).length === 0) {
      res.json({ company: await loadCompany(id), changed: [] });
      return;
    }

    if ("ownerStaffId" in changes) {
      const problem = await ownerProblem(changes["ownerStaffId"] as number | null, existing.ownerStaffId);
      if (problem) { res.status(400).json({ error: problem, field: "ownerStaffId" }); return; }
    }

    const nameChanged = typeof changes["normalizedName"] === "string";
    const domainChanged = "domain" in changes && changes["domain"] !== null;
    if ((nameChanged || domainChanged) && body["confirmDuplicate"] !== true) {
      const candidates = await duplicateCandidates(db, {
        normalizedName: nameChanged ? (changes["normalizedName"] as string) : undefined,
        domain: domainChanged ? (changes["domain"] as string) : null,
        excludeId: id,
      });
      if (candidates.length > 0) {
        res.status(409).json({ code: "possible_duplicate", error: duplicateMessage(candidates), candidates, saved: false });
        return;
      }
    }

    await db.update(crmCompanies).set({ ...changes, updatedAt: new Date() }).where(eq(crmCompanies.id, id));
    const fields = Object.keys(changes).filter((k) => k !== "normalizedName");
    await auditAction(req, "company.updated", `company:${id} ${existing.name} fields=${fields.join(",")}`);
    res.json({ company: await loadCompany(id), changed: fields });
  } catch (err) {
    req.log.error({ err }, "company update failed");
    res.status(500).json({ error: "The company could not be saved." });
  }
});

// ── Archive and restore ─────────────────────────────────────────────────────

router.post("/crm/companies/:id/archive", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const id = positiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid company id." }); return; }
  try {
    const [existing] = await db.select({ id: crmCompanies.id, name: crmCompanies.name, archivedAt: crmCompanies.archivedAt })
      .from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Company not found." }); return; }
    if (existing.archivedAt) {
      res.json({ company: await loadCompany(id), alreadyArchived: true });
      return;
    }
    await db.update(crmCompanies).set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crmCompanies.id, id), isNull(crmCompanies.archivedAt)));
    await auditAction(req, "company.archived", `company:${id} ${existing.name}`);
    res.json({
      company: await loadCompany(id),
      note: "Archived. The people already linked stay linked and keep their history; no new contact can be linked until it is restored.",
    });
  } catch (err) {
    req.log.error({ err }, "company archive failed");
    res.status(500).json({ error: "The company could not be archived." });
  }
});

router.post("/crm/companies/:id/restore", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  const id = positiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid company id." }); return; }
  try {
    const [existing] = await db.select({ id: crmCompanies.id, name: crmCompanies.name, archivedAt: crmCompanies.archivedAt })
      .from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Company not found." }); return; }
    if (!existing.archivedAt) {
      res.json({ company: await loadCompany(id), alreadyActive: true });
      return;
    }
    await db.update(crmCompanies).set({ archivedAt: null, updatedAt: new Date() }).where(eq(crmCompanies.id, id));
    await auditAction(req, "company.restored", `company:${id} ${existing.name}`);
    res.json({ company: await loadCompany(id) });
  } catch (err) {
    req.log.error({ err }, "company restore failed");
    res.status(500).json({ error: "The company could not be restored." });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────
//
// `leads.delete`, which is OWNER_ONLY: destroying a company record is the same
// class of act as destroying a contact. It is refused while any current contact
// is linked — unlink them or archive the company instead — so the only rows the
// foreign key's SET NULL ever clears are merged-away contacts, which are
// retained history rather than part of the book.

router.delete("/crm/companies/:id", requireCrmAuth("leads.delete"), async (req: Request, res: Response) => {
  const id = positiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid company id." }); return; }
  try {
    const outcome = await db.transaction(async (tx) => {
      // Locked first: a contact being linked in another request blocks on this
      // row's foreign-key check, so the count below cannot miss one.
      const [locked] = await tx.select({ id: crmCompanies.id, name: crmCompanies.name })
        .from(crmCompanies).where(eq(crmCompanies.id, id)).for("update");
      if (!locked) return { status: 404 as const, name: "", people: 0, mergedAway: 0 };

      const [{ n: people }] = await tx.select({ n: sql<number>`count(*)::int` })
        .from(crmLeads).where(and(eq(crmLeads.companyId, id), notMerged));
      const [{ n: mergedAway }] = await tx.select({ n: sql<number>`count(*)::int` })
        .from(crmLeads).where(and(eq(crmLeads.companyId, id), sql`NOT (${notMerged})`));
      if (Number(people) > 0) return { status: 409 as const, name: locked.name, people: Number(people), mergedAway: Number(mergedAway) };

      await tx.delete(crmCompanies).where(eq(crmCompanies.id, id));
      return { status: 200 as const, name: locked.name, people: 0, mergedAway: Number(mergedAway) };
    });

    if (outcome.status === 404) { res.status(404).json({ error: "Company not found." }); return; }
    if (outcome.status === 409) {
      res.status(409).json({
        code: "has_people",
        error: `${outcome.name} still has ${outcome.people} ${outcome.people === 1 ? "person" : "people"} linked to it. Unlink them, or archive the company instead.`,
        people: outcome.people,
        deleted: false,
      });
      return;
    }

    await auditAction(req, "company.deleted", `company:${id} ${outcome.name}`.trim());
    res.json({
      ok: true,
      note: outcome.mergedAway > 0
        ? `Deleted. ${outcome.mergedAway} merged-away contact row(s) that still named this company were unlinked; their records are retained.`
        : "Deleted.",
    });
  } catch (err) {
    req.log.error({ err }, "company delete failed");
    res.status(500).json({ error: "The company could not be deleted." });
  }
});

export default router;
