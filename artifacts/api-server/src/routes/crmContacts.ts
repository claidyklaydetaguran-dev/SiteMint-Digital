// ── Contacts: import, export, and duplicate review ──────────────────────────
//
// Registered BEFORE `crmRouter` in routes/index.ts, for the same reason the
// portal, history, reports and marketing routers are: `crm.ts` carries a pile
// of parameterised `/crm/:something/...` routes, and a literal path registered
// after them is resolved as a parameter value instead of as itself. That is
// exactly the defect fixed in 3508a43, where `GET /admin/submissions/export/csv`
// was registered after `/admin/submissions/:id` and every request for it came
// back 400 with `id = "export"`.
//
// Two things keep it fixed rather than merely fixed-once:
//   · every path here lives under `/crm/contacts/`, a prefix `crm.ts` has no
//     parameterised route for; and
//   · `crmContacts.test.ts` asserts the literal export path resolves to CSV
//     through the real app, not to a 400 from somebody else's `:id` handler.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, ilike, or, sql } from "drizzle-orm";
import {
  db, crmLeads, crmActivities, crmContactMerges, crmDuplicateDismissals,
  CRM_STATUSES, CRM_PRIORITIES, CRM_SOURCES,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { canMapLeadOwners, loadOwnerCandidates } from "../lib/leadAssignee.js";
import { explainOwnerMatch, matchOwner, ownerKey, toOwnerPerson, trimOwnerValue } from "../lib/leadOwnerRules.js";
import {
  MAX_CSV_BYTES, MAX_CSV_ROWS, TARGET_FIELDS, DEFAULT_PLAN_OPTIONS,
  buildPlan, hashPlan, normaliseEmail, normalisePhoneKey, parseCsv,
  suggestMapping, unmappedHeaders, validateMapping,
  type ExistingContact, type Mapping, type OwnerResolver, type Plan, type PlanOptions,
  type PlanOwnerResolution, type PlannedRow,
} from "../lib/contactImport.js";
import {
  MERGEABLE_FIELDS, REPOINTS, canonicalPair, findDuplicateCandidates,
  mergeNoteBlock, repointAll, resolveFields,
  type FieldChoice, type MergeableField,
} from "../lib/contactMerge.js";

const router: IRouter = Router();

/** Who is acting, for attribution on activities and merge records. */
function actorLabel(req: Request): string {
  const s = req.staffAuth?.staff;
  return s ? (s.displayName || s.email) : "admin";
}
function actorStaffId(req: Request): number | null {
  return req.staffAuth?.staff.id ?? null;
}

// ── CSV writing ─────────────────────────────────────────────────────────────

/**
 * One CSV field, escaped.
 *
 * The leading-quote case is not cosmetic. A cell whose text begins with `=`,
 * `+`, `-` or `@` is executed as a formula the moment the export is opened in
 * Excel, Numbers or Sheets — so an attacker who can get text into a contact's
 * name (an inbound form, a discovery submission) can get code into whatever the
 * operator downloads. Prefixing a single quote neutralises it while leaving the
 * value readable.
 */
export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (Array.isArray(value)) s = value.join(", ");
  if (value instanceof Date) s = value.toISOString();
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  // A BOM so Excel reads it as UTF-8 rather than the local code page, which is
  // what turns an accented client name into mojibake in the one place the
  // operator is most likely to notice and least able to fix.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ── Import: the field catalogue ─────────────────────────────────────────────

router.get("/crm/contacts/import/fields", requireCrmAuth("leads.write"), (_req: Request, res: Response) => {
  res.json({
    fields: TARGET_FIELDS,
    statuses: CRM_STATUSES,
    priorities: CRM_PRIORITIES,
    sources: CRM_SOURCES,
    limits: { maxBytes: MAX_CSV_BYTES, maxRows: MAX_CSV_ROWS },
    matching: {
      rule: "A row matches an existing contact on its email address first, and on the last ten digits of its phone number when it has no email. A row with neither is refused, because it could never be matched — not now, and not on a re-import.",
      idempotence: "Importing the same file twice creates nothing the second time: every row matches what the first run created and is reported as already-existing or unchanged.",
    },
  });
});

// ── Import: preview and commit ──────────────────────────────────────────────

interface ImportBody {
  csv?: unknown;
  mapping?: unknown;
  options?: unknown;
  planHash?: unknown;
}

function readOptions(raw: unknown): PlanOptions {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    updateExisting: o["updateExisting"] === true,
    updateMode: o["updateMode"] === "overwrite" ? "overwrite" : "fill_blanks",
  };
}

/**
 * Load every existing contact a file's rows could match, in two queries.
 *
 * Deliberately not "one query per row": a thousand-row file would be a thousand
 * round trips, and the preview would be slower than the import it is previewing.
 */
async function loadExisting(rows: string[][], mapping: Mapping): Promise<{
  byEmail: Map<string, ExistingContact>; byPhone: Map<string, ExistingContact>;
}> {
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const emailIdx = mapping["email"] ? headers.indexOf(mapping["email"]) : -1;
  const phoneIdx = mapping["phone"] ? headers.indexOf(mapping["phone"]) : -1;

  const emails = new Set<string>();
  const phoneKeys = new Set<string>();
  for (const row of rows.slice(1)) {
    if (emailIdx >= 0) {
      const e = normaliseEmail(row[emailIdx]);
      if (e) emails.add(e);
    }
    if (phoneIdx >= 0) {
      const p = normalisePhoneKey(row[phoneIdx]);
      if (p) phoneKeys.add(p);
    }
  }

  const byEmail = new Map<string, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  if (emails.size === 0 && phoneKeys.size === 0) return { byEmail, byPhone };

  // Merged-away contacts are excluded from matching on purpose: an import must
  // not resurrect a contact somebody deliberately folded into another one.
  const notMerged = sql`NOT EXISTS (SELECT 1 FROM ${crmContactMerges} m WHERE m.merged_lead_id = ${crmLeads.id})`;

  if (emails.size > 0) {
    const found = await db.select().from(crmLeads)
      .where(and(inArray(sql`lower(btrim(${crmLeads.email}))`, [...emails]), notMerged));
    for (const lead of found) {
      const key = normaliseEmail(lead.email);
      if (key && !byEmail.has(key)) byEmail.set(key, lead as unknown as ExistingContact);
    }
  }
  if (phoneKeys.size > 0) {
    const found = await db.select().from(crmLeads).where(and(
      inArray(
        sql`CASE WHEN length(regexp_replace(coalesce(${crmLeads.phone}, ''), '\\D', '', 'g')) >= 7
                 THEN right(regexp_replace(${crmLeads.phone}, '\\D', '', 'g'), 10) ELSE NULL END`,
        [...phoneKeys],
      ),
      notMerged,
    ));
    for (const lead of found) {
      const key = normalisePhoneKey(lead.phone);
      if (key && !byPhone.has(key)) byPhone.set(key, lead as unknown as ExistingContact);
    }
  }
  return { byEmail, byPhone };
}

/** Shared by preview and commit so the two can never diverge. */
async function planFromRequest(req: Request, res: Response): Promise<Plan | null> {
  const body = req.body as ImportBody;
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    res.status(400).json({ error: "No CSV content was sent." });
    return null;
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    res.status(413).json({ error: `That file is larger than ${Math.round(MAX_CSV_BYTES / (1024 * 1024))}MB. Split it and import the parts.` });
    return null;
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    res.status(400).json({ error: "That file has no rows." });
    return null;
  }
  const headers = rows[0].map((h) => h.trim());
  if (rows.length - 1 > MAX_CSV_ROWS) {
    res.status(413).json({ error: `That file has ${rows.length - 1} rows; the limit is ${MAX_CSV_ROWS}. Split it and import the parts.` });
    return null;
  }

  const mapping: Mapping = (body.mapping && typeof body.mapping === "object")
    ? body.mapping as Mapping
    : suggestMapping(headers);

  const problems = validateMapping(headers, mapping);
  if (problems.length > 0) {
    res.status(400).json({ error: "The column mapping is not usable.", problems, headers, suggested: suggestMapping(headers) });
    return null;
  }

  const options = readOptions(body.options);
  const { byEmail, byPhone } = await loadExisting(rows, mapping);
  const resolveOwner = await ownerResolver();
  return buildPlan({ rows, mapping, options, existingByEmail: byEmail, existingByPhone: byPhone, resolveOwner });
}

/**
 * M6: the file's owner names, resolved through exactly the rules every other
 * write uses (lib/leadOwnerRules.ts). The staff table is read once per request
 * and each distinct name is decided once, so a 5,000-row file asks one
 * question, not 5,000 — and an unresolved name is reported, never guessed.
 */
async function ownerResolver(): Promise<OwnerResolver> {
  const staff = await loadOwnerCandidates();
  const decided = new Map<string, PlanOwnerResolution>();
  return (raw: string) => {
    const key = ownerKey(raw);
    const known = decided.get(key);
    if (known) return known;
    const match = matchOwner(key, staff);
    const who = match.outcome === "matched" ? staff.find((s) => s.id === match.staffId) : undefined;
    const resolution: PlanOwnerResolution = {
      key,
      value: trimOwnerValue(raw),
      outcome: match.outcome,
      staffId: match.outcome === "matched" ? match.staffId : null,
      staffName: who?.displayName ?? null,
      rule: match.outcome === "none" ? null : match.rule,
      candidates: match.outcome === "ambiguous" ? match.candidates : who ? [toOwnerPerson(who)] : [],
      explanation: explainOwnerMatch(raw, match, staff),
    };
    decided.set(key, resolution);
    return resolution;
  };
}

/**
 * Show exactly what the import would do, before it does any of it.
 *
 * Nothing is written here. The response carries a per-row verdict with its
 * reason, the columns that are being ignored, and a hash of the whole decision
 * — which the commit then demands back, so the operator cannot approve one plan
 * and get another.
 */
router.post("/crm/contacts/import/preview", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const plan = await planFromRequest(req, res);
    if (!plan) return;
    res.json({
      headers: plan.headers,
      mapping: plan.mapping,
      suggestedMapping: suggestMapping(plan.headers),
      ignoredColumns: plan.ignoredColumns,
      options: plan.options,
      totals: plan.totals,
      rows: plan.rows,
      // M6: every owner name the import would write and what the matching
      // rules decided about it — so an unresolved name is seen before commit
      // and can be mapped by somebody allowed to, instead of being guessed.
      owners: plan.owners,
      canMapOwners: canMapLeadOwners(req),
      planHash: plan.hash,
      note: "Nothing has been written. Send this planHash back to /import/commit to apply exactly this plan.",
    });
  } catch (err) {
    req.log.error({ err }, "contact import preview failed");
    res.status(500).json({ error: "Could not read that file." });
  }
});

/**
 * Apply a previewed plan.
 *
 * Each row is applied inside its own try/catch. A row that fails at the
 * database — a constraint nobody predicted, a value the driver rejects — is
 * recorded as a failure with its message and the file carries on. The whole
 * file is not a transaction on purpose: refusing 900 good contacts because row
 * 431 has something odd in it is the behaviour people paste into spreadsheets
 * to avoid.
 */
router.post("/crm/contacts/import/commit", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const plan = await planFromRequest(req, res);
    if (!plan) return;

    const approved = (req.body as ImportBody).planHash;
    if (typeof approved !== "string" || approved.length === 0) {
      res.status(400).json({ error: "Preview the import first — commit needs the planHash the preview returned." });
      return;
    }
    if (approved !== plan.hash) {
      res.status(409).json({
        error: "This file no longer produces the import you approved — the file or the contacts it matches have changed since the preview. Review the new preview and try again.",
        approvedHash: approved,
        currentHash: plan.hash,
        totals: plan.totals,
        rows: plan.rows,
      });
      return;
    }

    const results: Array<{ rowNumber: number; outcome: string; leadId: number | null; detail: string }> = [];
    let created = 0, updated = 0, skipped = 0, failed = 0;

    for (const row of plan.rows) {
      if (row.action === "error") {
        failed++;
        results.push({ rowNumber: row.rowNumber, outcome: "error", leadId: null, detail: row.explain });
        continue;
      }
      if (row.action === "skip") {
        skipped++;
        results.push({ rowNumber: row.rowNumber, outcome: `skipped:${row.reason}`, leadId: row.matchedLeadId, detail: row.explain });
        continue;
      }
      try {
        if (row.action === "create") {
          const leadId = await applyCreate(req, row);
          created++;
          results.push({ rowNumber: row.rowNumber, outcome: "created", leadId, detail: `Created contact #${leadId}.` });
        } else {
          await applyUpdate(req, row);
          updated++;
          results.push({
            rowNumber: row.rowNumber, outcome: "updated", leadId: row.matchedLeadId,
            detail: `Updated ${Object.keys(row.changes).join(", ")}.`,
          });
        }
      } catch (err) {
        failed++;
        req.log.error({ err, rowNumber: row.rowNumber }, "import row failed");
        results.push({
          rowNumber: row.rowNumber, outcome: "error", leadId: row.matchedLeadId,
          detail: `This row could not be written: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}. Every other row was still applied.`,
        });
      }
    }

    await auditAction(req, "contacts.imported", `created=${created} updated=${updated} skipped=${skipped} failed=${failed}`);

    res.json({
      created, updated, skipped, failed,
      planHash: plan.hash,
      rows: results,
      note: "Rows are applied one at a time. A row that fails costs that row only — everything else in the file was still applied.",
    });
  } catch (err) {
    req.log.error({ err }, "contact import commit failed");
    res.status(500).json({ error: "The import could not be run." });
  }
});

function notesForCreate(row: PlannedRow): string | undefined {
  const parts: string[] = [];
  if (typeof row.values["notes"] === "string") parts.push(row.values["notes"] as string);
  const unmappedStatus = row.values["__unmappedStatus"];
  if (typeof unmappedStatus === "string") parts.push(`Imported status from the file: "${unmappedStatus}".`);
  const unmappedSource = row.values["__unmappedSource"];
  if (typeof unmappedSource === "string") parts.push(`Imported source from the file: "${unmappedSource}".`);
  return parts.length ? parts.join("\n\n") : undefined;
}

async function applyCreate(req: Request, row: PlannedRow): Promise<number> {
  const v = row.values;
  const [lead] = await db.insert(crmLeads).values({
    name: String(v["name"]),
    email: String(v["email"]),
    company: typeof v["company"] === "string" ? v["company"] : undefined,
    phone: typeof v["phone"] === "string" ? v["phone"] : undefined,
    website: typeof v["website"] === "string" ? v["website"] : undefined,
    source: typeof v["source"] === "string" ? v["source"] : "CSV Import",
    serviceInterest: typeof v["serviceInterest"] === "string" ? v["serviceInterest"] : undefined,
    packageType: typeof v["packageType"] === "string" ? v["packageType"] : undefined,
    status: typeof v["status"] === "string" ? v["status"] : "New Inquiry",
    priority: typeof v["priority"] === "string" ? v["priority"] : "Medium",
    assignedTo: typeof v["assignedTo"] === "string" ? v["assignedTo"] : undefined,
    // M6: the id the PLAN resolved, not a fresh lookup. The plan hash covers it,
    // so if who the name resolves to changed after the preview, the commit was
    // already refused with the new plan.
    assignedToStaffId: typeof v["assignedToStaffId"] === "number" ? v["assignedToStaffId"] : undefined,
    tags: Array.isArray(v["tags"]) ? (v["tags"] as unknown[]).map(String) : [],
    notes: notesForCreate(row),
    estimatedValue: typeof v["estimatedValue"] === "number" ? String(v["estimatedValue"]) : undefined,
    nextFollowUpAt: typeof v["nextFollowUpAt"] === "string" ? new Date(v["nextFollowUpAt"]) : undefined,
  }).returning();

  await db.insert(crmActivities).values({
    leadId: lead.id, type: "lead_imported",
    title: `Imported from CSV: ${lead.name}`,
    description: `Row ${row.rowNumber} of the uploaded file.`,
    metadata: { rowNumber: row.rowNumber, notices: row.notices },
    createdBy: actorLabel(req),
  });
  return lead.id;
}

async function applyUpdate(req: Request, row: PlannedRow): Promise<void> {
  const id = row.matchedLeadId;
  if (!id) throw new Error("no matched contact");
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const [field, change] of Object.entries(row.changes)) {
    if (field === "notes") continue;
    if (field === "tags") { updates["tags"] = (change.to as unknown[]).map(String); continue; }
    if (field === "nextFollowUpAt") { updates["nextFollowUpAt"] = new Date(String(change.to)); continue; }
    if (field === "estimatedValue") { updates["estimatedValue"] = String(change.to); continue; }
    updates[field] = change.to;
  }

  // M6: a CSV may rewrite the owner NAME on an existing contact. The staff
  // reference moves with it — an id left pointing at the previous owner would
  // attribute the contact to somebody who was never given it. The id is the one
  // the PLAN resolved (and hashed) through the rules every write uses; a name
  // that matched nobody, or more than one person, writes NULL and appears under
  // Admin → Unmapped lead owners.
  if (row.changes["assignedTo"]) {
    const planned = row.values["assignedToStaffId"];
    updates["assignedToStaffId"] = typeof planned === "number" ? planned : null;
  }

  if (row.changes["notes"]) {
    const [existing] = await db.select({ notes: crmLeads.notes }).from(crmLeads).where(eq(crmLeads.id, id));
    const stamp = new Date().toLocaleString();
    const block = `[${stamp}] From CSV import (row ${row.rowNumber}):\n${String(row.changes["notes"].to)}`;
    updates["notes"] = existing?.notes ? `${existing.notes}\n\n${block}` : block;
  }

  await db.update(crmLeads).set(updates).where(eq(crmLeads.id, id));
  await db.insert(crmActivities).values({
    leadId: id, type: "lead_imported",
    title: "Updated from CSV import",
    description: `Row ${row.rowNumber}: ${Object.keys(row.changes).join(", ")}.`,
    metadata: { rowNumber: row.rowNumber, changes: row.changes },
    createdBy: actorLabel(req),
  });
}

// ── Export ──────────────────────────────────────────────────────────────────

const EXPORT_COLUMNS: ReadonlyArray<{ key: string; header: string }> = [
  { key: "id", header: "id" },
  { key: "name", header: "name" },
  { key: "email", header: "email" },
  { key: "phone", header: "phone" },
  { key: "company", header: "company" },
  { key: "website", header: "website" },
  { key: "status", header: "status" },
  { key: "priority", header: "priority" },
  { key: "source", header: "source" },
  { key: "assignedTo", header: "assignedTo" },
  { key: "serviceInterest", header: "serviceInterest" },
  { key: "packageType", header: "packageType" },
  { key: "tags", header: "tags" },
  { key: "estimatedValue", header: "estimatedValue" },
  { key: "lastContactedAt", header: "lastContactedAt" },
  { key: "nextFollowUpAt", header: "nextFollowUpAt" },
  { key: "createdAt", header: "createdAt" },
  { key: "notes", header: "notes" },
];

/** `?ids=` — the exact rows on the operator's screen. */
function parseIds(raw: unknown): number[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ids = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? [...new Set(ids)].slice(0, MAX_CSV_ROWS) : [];
}

/**
 * Export the contact list the operator is actually looking at.
 *
 * Two ways to say what "looking at" means, and both are honoured:
 *
 *   · the server-expressible filters (`search`, `status`, `priority`, `source`,
 *     `tag`), which are the same predicates `GET /crm/leads` uses; and
 *   · `ids`, the exact set of rows on screen — which is the only way to export
 *     a smart list whose rule is computed in the browser from the lead score.
 *     Exporting "everything with status X" when the operator is looking at
 *     "score ≥ 80" would be a different list wearing the right filename.
 *
 * Gated on `data.export`, not on `leads.read`. Reading a contact and walking
 * out with the whole book are different acts, and only the second one is bulk
 * egress of customer data — so an operations manager, who may read every
 * contact, cannot export them. Every export is audited with its row count.
 */
router.get("/crm/contacts/export.csv", requireCrmAuth("data.export"), async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;
    const ids = parseIds(q["ids"]);
    const search = typeof q["search"] === "string" ? q["search"].trim() : "";
    const status = typeof q["status"] === "string" ? q["status"].trim() : "";
    const priority = typeof q["priority"] === "string" ? q["priority"].trim() : "";
    const source = typeof q["source"] === "string" ? q["source"].trim() : "";
    const tag = typeof q["tag"] === "string" ? q["tag"].trim() : "";

    const conditions = [
      // A merged-away contact is not part of the book any more, so it is not in
      // an export of the book either.
      sql`NOT EXISTS (SELECT 1 FROM ${crmContactMerges} m WHERE m.merged_lead_id = ${crmLeads.id})`,
    ];
    if (ids !== null) {
      if (ids.length === 0) { conditions.push(sql`false`); }
      else conditions.push(inArray(crmLeads.id, ids));
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(crmLeads.name, like), ilike(crmLeads.email, like),
        ilike(crmLeads.company, like), ilike(crmLeads.phone, like),
      )!);
    }
    if (status) conditions.push(eq(crmLeads.status, status));
    if (priority) conditions.push(eq(crmLeads.priority, priority));
    if (source) conditions.push(eq(crmLeads.source, source));
    if (tag) conditions.push(sql`${tag} = ANY(${crmLeads.tags})`);

    const leads = await db.select().from(crmLeads)
      .where(and(...conditions))
      .orderBy(desc(crmLeads.createdAt))
      .limit(MAX_CSV_ROWS);

    const body = toCsv(
      EXPORT_COLUMNS.map((c) => c.header),
      leads.map((lead) => EXPORT_COLUMNS.map((c) => (lead as unknown as Record<string, unknown>)[c.key])),
    );

    const applied = [
      ids !== null ? `ids=${ids.length}` : null,
      search ? `search=${search}` : null,
      status ? `status=${status}` : null,
      priority ? `priority=${priority}` : null,
      source ? `source=${source}` : null,
      tag ? `tag=${tag}` : null,
    ].filter(Boolean).join(" ");
    await auditAction(req, "contacts.exported", `rows=${leads.length} ${applied || "no filter"}`.trim());

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sitemint-contacts-${stamp}.csv"`);
    // The filters that produced this file, so a downloaded CSV can be traced
    // back to the list it came from without opening it.
    res.setHeader("X-Export-Rows", String(leads.length));
    res.setHeader("X-Export-Filters", applied || "none");
    res.send(body);
  } catch (err) {
    req.log.error({ err }, "contact export failed");
    res.status(500).json({ error: "The export could not be produced." });
  }
});

// ── Duplicate review ────────────────────────────────────────────────────────

router.get("/crm/contacts/duplicates", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const limitRaw = Number((req.query as Record<string, unknown>)["limit"]);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 100;
    const candidates = await findDuplicateCandidates(limit);
    const [dismissed] = await db.select({ n: sql<number>`count(*)::int` }).from(crmDuplicateDismissals);
    const [merges] = await db.select({ n: sql<number>`count(*)::int` }).from(crmContactMerges);

    res.json({
      candidates,
      counts: {
        pairs: candidates.length,
        strong: candidates.filter((c) => c.confidence === "strong").length,
        weak: candidates.filter((c) => c.confidence === "weak").length,
        dismissed: Number(dismissed?.n ?? 0),
        merged: Number(merges?.n ?? 0),
      },
      signals: {
        email: "Identical email address. Strong: an address is an account, and two contacts sharing one are almost always one person. Placeholder addresses minted by an import are excluded so a phone match is not reported twice.",
        name_phone: "Identical name AND identical phone number (last ten digits). Weak, and shown as weak: colleagues share a switchboard and strangers share names, so this is a suggestion for a person to judge — never grounds to merge unattended.",
      },
      note: "Pairs somebody has dismissed, and contacts already merged away, are not offered again.",
    });
  } catch (err) {
    req.log.error({ err }, "duplicate scan failed");
    res.status(500).json({ error: "Could not scan for duplicates." });
  }
});

router.get("/crm/contacts/merges", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(crmContactMerges).orderBy(desc(crmContactMerges.id)).limit(100);
    res.json({
      merges: rows,
      note: "A merge retains the merged-away contact row and everything it held. The contact list hides it; this record says exactly what moved and what was kept.",
    });
  } catch (err) {
    req.log.error({ err }, "merge history failed");
    res.status(500).json({ error: "Could not read the merge history." });
  }
});

/**
 * "These two are not the same person."
 *
 * Stored canonically (smaller id first) so the pair cannot be re-offered by
 * presenting it the other way round, and upserted so a second dismissal of the
 * same pair is not an error.
 */
router.post("/crm/contacts/duplicates/dismiss", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const body = req.body as { leadIdA?: unknown; leadIdB?: unknown; signal?: unknown; reason?: unknown };
    const a = Number(body.leadIdA);
    const b = Number(body.leadIdB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) {
      res.status(400).json({ error: "Two different contacts are needed." });
      return;
    }
    const found = await db.select({ id: crmLeads.id }).from(crmLeads).where(inArray(crmLeads.id, [a, b]));
    if (found.length !== 2) { res.status(404).json({ error: "One of those contacts no longer exists." }); return; }

    const { low, high } = canonicalPair(a, b);
    const signal = body.signal === "email" ? "email" : "name_phone";
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;

    const [row] = await db.insert(crmDuplicateDismissals).values({
      leadIdLow: low, leadIdHigh: high, signal, reason,
      dismissedByStaffId: actorStaffId(req), dismissedByLabel: actorLabel(req),
    }).onConflictDoUpdate({
      target: [crmDuplicateDismissals.leadIdLow, crmDuplicateDismissals.leadIdHigh],
      set: { signal, reason, dismissedByStaffId: actorStaffId(req), dismissedByLabel: actorLabel(req) },
    }).returning();

    await auditAction(req, "contacts.duplicate.dismissed", `lead:${low}+lead:${high}`);
    res.json({ dismissal: row, note: "This pair will not be offered again." });
  } catch (err) {
    req.log.error({ err }, "duplicate dismiss failed");
    res.status(500).json({ error: "Could not record that." });
  }
});

/**
 * Merge two contacts into one.
 *
 * Order of operations matters and is deliberate: related rows move FIRST, so
 * if anything fails the surviving contact has not yet been told it absorbed a
 * record it did not get. The merge record is written last, and it is the row
 * that makes the merge visible to the contact list — so a half-finished merge
 * leaves both contacts listed rather than one silently disappearing.
 */
router.post("/crm/contacts/duplicates/merge", requireCrmAuth("leads.write"), async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      primaryId?: unknown; duplicateId?: unknown; signal?: unknown;
      fieldChoices?: unknown;
    };
    const primaryId = Number(body.primaryId);
    const duplicateId = Number(body.duplicateId);
    if (!Number.isInteger(primaryId) || !Number.isInteger(duplicateId) || primaryId <= 0 || duplicateId <= 0) {
      res.status(400).json({ error: "Two contacts are needed." });
      return;
    }
    if (primaryId === duplicateId) {
      res.status(400).json({ error: "A contact cannot be merged into itself." });
      return;
    }

    const [primary] = await db.select().from(crmLeads).where(eq(crmLeads.id, primaryId)).limit(1);
    const [duplicate] = await db.select().from(crmLeads).where(eq(crmLeads.id, duplicateId)).limit(1);
    if (!primary || !duplicate) { res.status(404).json({ error: "One of those contacts no longer exists." }); return; }

    const prior = await db.select().from(crmContactMerges)
      .where(or(eq(crmContactMerges.mergedLeadId, duplicateId), eq(crmContactMerges.mergedLeadId, primaryId)));
    const alreadyMerged = prior.find((m) => m.mergedLeadId === duplicateId || m.mergedLeadId === primaryId);
    if (alreadyMerged) {
      res.status(409).json({
        error: `Contact #${alreadyMerged.mergedLeadId} has already been merged into #${alreadyMerged.primaryLeadId}.`,
        merge: alreadyMerged,
      });
      return;
    }

    const choices: Partial<Record<MergeableField, FieldChoice>> = {};
    if (body.fieldChoices && typeof body.fieldChoices === "object") {
      for (const [field, choice] of Object.entries(body.fieldChoices as Record<string, unknown>)) {
        if ((MERGEABLE_FIELDS as readonly string[]).includes(field) && (choice === "primary" || choice === "duplicate")) {
          choices[field as MergeableField] = choice;
        }
      }
    }

    const primarySnapshot = JSON.parse(JSON.stringify(primary)) as Record<string, unknown>;
    const mergedSnapshot = JSON.parse(JSON.stringify(duplicate)) as Record<string, unknown>;

    // 1. Everything that points at the duplicate now points at the survivor.
    const { moves, conversationIdentitiesRewritten } = await repointAll(primaryId, duplicateId);

    // 2. Field-level resolution, then the survivor's own row.
    const resolution = resolveFields(
      primary as unknown as Record<string, unknown>,
      duplicate as unknown as Record<string, unknown>,
      choices,
    );
    const when = new Date();
    const noteBlock = mergeNoteBlock({
      duplicate: mergedSnapshot, conflicts: resolution.conflicts,
      actorLabel: actorLabel(req), when,
    });
    const updates: Record<string, unknown> = { ...resolution.updates, updatedAt: when };
    // M6: a merge can hand the survivor the duplicate's owner NAME. The two
    // owner columns move together or not at all, so the duplicate's staff
    // reference comes with it. Carried, not re-resolved: the duplicate's id may
    // record a person's decision about an ambiguous name, which the rules alone
    // would drop.
    if ("assignedTo" in resolution.updates) {
      updates["assignedToStaffId"] = duplicate.assignedToStaffId ?? null;
    }
    updates["notes"] = primary.notes ? `${primary.notes}\n\n${noteBlock}` : noteBlock;
    await db.update(crmLeads).set(updates).where(eq(crmLeads.id, primaryId));

    // 3. The merge itself, on the survivor's timeline.
    await db.insert(crmActivities).values({
      leadId: primaryId, type: "contact_merged",
      title: `Merged in duplicate contact #${duplicateId}`,
      description: `${duplicate.name} · ${duplicate.email}. `
        + `${moves.reduce((n, m) => n + m.moved, 0)} related record(s) moved onto this contact.`,
      metadata: { duplicateId, moves, conflicts: resolution.conflicts },
      createdBy: actorLabel(req),
    });

    // 4. The record that makes it durable — and that hides the merged contact.
    const [record] = await db.insert(crmContactMerges).values({
      primaryLeadId: primaryId,
      mergedLeadId: duplicateId,
      signal: body.signal === "email" ? "email" : "name_phone",
      primarySnapshot,
      mergedSnapshot,
      fieldsFilled: resolution.fieldsFilled,
      conflicts: resolution.conflicts,
      moved: moves as unknown as Array<Record<string, unknown>>,
      mergedByStaffId: actorStaffId(req),
      mergedByLabel: actorLabel(req),
    }).returning();

    // A dismissal for this pair is now meaningless; drop it so review stays clean.
    const { low, high } = canonicalPair(primaryId, duplicateId);
    await db.delete(crmDuplicateDismissals).where(and(
      eq(crmDuplicateDismissals.leadIdLow, low), eq(crmDuplicateDismissals.leadIdHigh, high),
    ));

    await auditAction(req, "contacts.merged", `lead:${duplicateId} into lead:${primaryId}`);

    const [survivor] = await db.select().from(crmLeads).where(eq(crmLeads.id, primaryId)).limit(1);
    res.json({
      merge: record,
      survivor,
      moves,
      conversationIdentitiesRewritten,
      fieldsFilled: resolution.fieldsFilled,
      conflicts: resolution.conflicts,
      tagsAdded: resolution.tagsAdded,
      guarantee: {
        history: "Every table the customer timeline reads was repointed onto the surviving contact before anything else changed, so the survivor's history now contains both sides.",
        retention: "The merged contact's row is retained, not deleted — deleting a contact needs leads.delete, which is owner-only. The contact list hides it; this merge record holds both rows exactly as they were.",
        conflicts: "Where both contacts held a different value, the surviving contact kept its own unless you chose otherwise. The other value is in this record and in the contact's notes — it is not gone.",
        leftBehind: moves.filter((m) => m.leftBehind > 0).map((m) => ({ table: m.table, rows: m.leftBehind, why: m.note })),
      },
    });
  } catch (err) {
    req.log.error({ err }, "contact merge failed");
    res.status(500).json({ error: "The merge could not be completed." });
  }
});

/** What a merge does, as data — so the documentation cannot drift from the code. */
router.get("/crm/contacts/merge-effects", requireCrmAuth("leads.read"), (_req: Request, res: Response) => {
  res.json({
    repoints: REPOINTS.map((r) => ({
      table: r.table,
      column: r.column,
      scopedBy: r.where ?? null,
      inCustomerTimeline: r.historyCritical,
      uniquePairGuard: r.uniqueWith ? [r.column, ...r.uniqueWith] : null,
      effect: r.describe,
    })),
    contactRow: "Retained. The merged contact is hidden from the contact list by a NOT EXISTS join against crm_contact_merges, never deleted.",
    fields: "The surviving contact keeps every value it already had; only its empty fields are filled from the duplicate, unless the operator explicitly hands a field to the duplicate. Tags are unioned. Notes are appended with a dated merge block.",
  });
});

export default router;
