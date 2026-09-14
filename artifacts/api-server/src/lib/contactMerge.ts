// ── Duplicate detection and contact merge ───────────────────────────────────
//
// The merge contract, stated once so every reader and every test can hold it
// to the same standard:
//
//  1. **History survives, from both sides.** Area 12 (the unified customer
//     timeline) reads twenty-odd tables, every one of them scoped by the
//     contact id. A merge therefore REPOINTS those rows onto the surviving
//     contact before anything else happens, so after the merge the survivor's
//     timeline contains what both contacts had. `REPOINTS` below is the
//     complete list, and `historyCritical` marks the ones the timeline reads.
//  2. **Nothing is deleted.** Not the related rows, and not the losing contact
//     row either. The losing row is retained and recorded in
//     `crm_contact_merges`; the contact list hides it with a NOT EXISTS join.
//     Destroying a contact needs `leads.delete`, which is OWNER_ONLY, and a
//     merge must not become a way around that.
//  3. **Nothing is silently discarded.** Field-level, the survivor wins every
//     disagreement by default; the loser's value is not thrown away but written
//     into the merge record's `conflicts` and appended to the survivor's notes,
//     so it is visible on the contact rather than only in a table.
//  4. **A row that cannot move says so.** A few tables carry a natural unique
//     key that includes the contact (one portal account per contact; one
//     marketing recipient per campaign per contact). When the survivor already
//     holds the equivalent row, moving the loser's would violate that key. Such
//     rows stay where they are and are counted in `moved[].leftBehind` with the
//     reason — reported, never dropped.

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ── What a merge touches ────────────────────────────────────────────────────

export interface RepointSpec {
  table: string;
  /** Column holding the contact id. */
  column: string;
  /** Extra predicate for entity-generic tables. */
  where?: string;
  /**
   * Columns that, together with `column`, form a unique key. When set, the
   * move is guarded so an existing equivalent row on the survivor is not
   * violated — the loser's row stays put and is reported.
   */
  uniqueWith?: string[];
  /** Plain-English description used in the merge report. */
  describe: string;
  /** True when the unified customer timeline reads this table. */
  historyCritical: boolean;
}

/**
 * Every table that points at a contact, in the order a merge moves them.
 *
 * Derived by hand from `lib/db/src/schema/**` and cross-checked against
 * `lib/customerTimeline.ts`'s SOURCE_SPECS — the timeline is the thing that
 * must not lose rows, so its tables are all here and all flagged.
 */
export const REPOINTS: readonly RepointSpec[] = [
  // ── Timeline sources ──────────────────────────────────────────────────────
  { table: "crm_activities", column: "lead_id", historyCritical: true,
    describe: "Timeline entries: notes, status changes, logged calls and emails." },
  { table: "crm_messages", column: "lead_id", historyCritical: true,
    describe: "SMS and email messages recorded against the contact." },
  { table: "crm_conversations", column: "contact_id", historyCritical: true,
    describe: "Inbox threads. The thread's identity key is rewritten too, so future replies land on the survivor." },
  { table: "crm_tasks", column: "lead_id", historyCritical: true,
    describe: "Tasks and follow-ups." },
  { table: "crm_deals", column: "lead_id", historyCritical: true,
    describe: "Deals, including won/lost/converted history and their linked appointments and payments." },
  { table: "crm_projects", column: "lead_id", historyCritical: true,
    describe: "Projects and, through them, project updates." },
  { table: "crm_transactions", column: "lead_id", historyCritical: true,
    describe: "Payments recorded and received." },
  { table: "crm_support_tickets", column: "lead_id", historyCritical: true,
    describe: "Support tickets and their whole thread, internal messages included." },
  { table: "crm_appointments", column: "lead_id", historyCritical: true,
    describe: "Meetings: scheduled, held and cancelled." },
  { table: "crm_document_requests", column: "entity_id", where: "entity_type = 'lead'", historyCritical: true,
    describe: "Documents requested from the customer, and what came back." },
  { table: "crm_attachments", column: "entity_id", where: "entity_type = 'lead'", historyCritical: true,
    describe: "Files uploaded against the contact." },
  { table: "crm_comments", column: "entity_id", where: "entity_type = 'lead'", historyCritical: true,
    describe: "Internal comments left on the contact." },

  // ── Everything else that names a contact ──────────────────────────────────
  { table: "crm_behavioral_events", column: "lead_id", historyCritical: false,
    describe: "Behavioural signals feeding the lead score." },
  { table: "crm_campaign_recipients", column: "lead_id", uniqueWith: ["campaign_id"], historyCritical: false,
    describe: "Sequence enrolments and their send events." },
  { table: "crm_campaign_scheduled_messages", column: "lead_id", historyCritical: false,
    describe: "Queued sequence messages." },
  { table: "crm_marketing_recipients", column: "lead_id", uniqueWith: ["campaign_id"], historyCritical: false,
    describe: "Marketing campaign audiences." },
  { table: "crm_marketing_exclusions", column: "lead_id", uniqueWith: ["campaign_id"], historyCritical: false,
    describe: "Marketing suppressions — deliberately moved, so a contact who opted out stays opted out." },
  { table: "crm_portal_accounts", column: "lead_id", uniqueWith: [], historyCritical: false,
    describe: "The customer portal account. One per contact, so it moves only when the survivor has none." },
  { table: "crm_portal_invitations", column: "lead_id", historyCritical: false,
    describe: "Portal invitations." },
  { table: "crm_portal_sessions", column: "lead_id", historyCritical: false,
    describe: "Live portal sessions." },
  { table: "crm_portal_document_grants", column: "lead_id", uniqueWith: ["attachment_id"], historyCritical: false,
    describe: "Which files the customer may see in the portal." },
  { table: "crm_portal_proposal_acceptances", column: "lead_id", historyCritical: false,
    describe: "Proposals the customer accepted in the portal." },
  { table: "crm_approvals", column: "entity_id", where: "entity_type = 'lead'", historyCritical: false,
    describe: "Approval requests raised against the contact." },
  { table: "crm_notifications", column: "entity_id", where: "entity_type = 'lead'", historyCritical: false,
    describe: "In-app notifications pointing at the contact." },
  { table: "discovery_submissions", column: "lead_id", historyCritical: false,
    describe: "Discovery form submissions linked to the contact." },
];

export interface MoveResult {
  table: string;
  describe: string;
  historyCritical: boolean;
  moved: number;
  leftBehind: number;
  /** Set when rows could not move, or the table is not present. */
  note: string | null;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await db.execute(sql`select to_regclass(${`public.${table}`}) is not null as present`);
  const first = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | { present?: boolean } | undefined;
  return Boolean(first?.present);
}

async function countRows(spec: RepointSpec, leadId: number): Promise<number> {
  const where = spec.where ? sql`${sql.raw(spec.where)} AND ` : sql``;
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.raw(spec.table)} where ${where}${sql.raw(spec.column)} = ${leadId}`,
  );
  const first = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | { n?: number } | undefined;
  return Number(first?.n ?? 0);
}

/**
 * Move one table's rows from the duplicate onto the survivor.
 *
 * The guarded form is the interesting one. `uniqueWith: ["campaign_id"]` means
 * (lead_id, campaign_id) is unique, so the UPDATE additionally requires that no
 * row already exists on the survivor with the same campaign. `uniqueWith: []`
 * means the contact id alone is unique (the portal account), which is the same
 * predicate with no extra columns.
 */
async function repointOne(spec: RepointSpec, fromId: number, toId: number): Promise<MoveResult> {
  const base = {
    table: spec.table, describe: spec.describe, historyCritical: spec.historyCritical,
  };
  if (!(await tableExists(spec.table))) {
    return { ...base, moved: 0, leftBehind: 0, note: "This table is not present in this database; nothing to move." };
  }

  const t = sql.raw(spec.table);
  const col = sql.raw(spec.column);
  const extra = spec.where ? sql` AND ${sql.raw(spec.where)}` : sql``;

  let guard = sql``;
  if (spec.uniqueWith) {
    const keyEq = spec.uniqueWith.length
      ? sql.raw(spec.uniqueWith.map((c) => ` AND existing.${c} = target.${c}`).join(""))
      : sql.raw("");
    guard = sql` AND NOT EXISTS (
      SELECT 1 FROM ${t} existing
      WHERE existing.${col} = ${toId}${keyEq}
    )`;
  }

  const updated = await db.execute(sql`
    UPDATE ${t} AS target SET ${col} = ${toId}
    WHERE target.${col} = ${fromId}${extra}${guard}
    RETURNING target.id
  `);
  const movedRows = (Array.isArray(updated) ? updated : (updated as { rows?: unknown[] }).rows ?? []) as unknown[];
  const moved = movedRows.length;
  const leftBehind = await countRows(spec, fromId);

  return {
    ...base,
    moved,
    leftBehind,
    note: leftBehind > 0
      ? `${leftBehind} row(s) stayed on the merged contact because the surviving contact already holds an equivalent row and the pair is unique. They are retained, not deleted — open the merged contact to see them.`
      : null,
  };
}

/**
 * Rewrite inbox thread identity keys so a future reply threads onto the
 * survivor rather than opening a new conversation.
 *
 * `identity_key` is the canonical grouping key (`phone:lead:{id}` /
 * `email:lead:{id}`). Repointing `contact_id` alone fixes the timeline but
 * leaves the next inbound message computing the survivor's key, finding no
 * conversation, and starting a second thread beside the one we just merged.
 */
async function rewriteConversationIdentity(fromId: number, toId: number): Promise<number> {
  if (!(await tableExists("crm_conversations"))) return 0;
  const updated = await db.execute(sql`
    UPDATE crm_conversations AS target
    SET identity_key = regexp_replace(target.identity_key, ${`:lead:${fromId}$`}, ${`:lead:${toId}`})
    WHERE target.identity_key ~ ${`:lead:${fromId}$`}
      AND NOT EXISTS (
        SELECT 1 FROM crm_conversations other
        WHERE other.identity_key = regexp_replace(target.identity_key, ${`:lead:${fromId}$`}, ${`:lead:${toId}`})
      )
    RETURNING target.id
  `);
  const rows = (Array.isArray(updated) ? updated : (updated as { rows?: unknown[] }).rows ?? []) as unknown[];
  return rows.length;
}

// ── Field resolution ────────────────────────────────────────────────────────

/** Contact fields a merge considers. Identity and audit columns are excluded. */
export const MERGEABLE_FIELDS = [
  "name", "company", "phone", "email", "website", "source", "serviceInterest",
  "status", "priority", "assignedTo", "packageType", "estimatedValue",
  "lastContactedAt", "nextFollowUpAt", "discoverySubmissionId",
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];
export type FieldChoice = "primary" | "duplicate";

export interface FieldResolution {
  fieldsFilled: Record<string, { from: unknown }>;
  conflicts: Array<{ field: string; kept: unknown; discardedFromMerged: unknown; chosen: FieldChoice }>;
  updates: Record<string, unknown>;
  tagsAdded: string[];
}

function blank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * Decide what the surviving contact's fields become.
 *
 * Default: the survivor keeps everything it already has, and only its EMPTY
 * fields are filled from the duplicate. `choices` lets the operator hand a
 * specific field to the duplicate's value — which is the only way a non-empty
 * survivor field is ever replaced, and even then the replaced value is recorded
 * in `conflicts` rather than lost.
 */
export function resolveFields(
  primary: Record<string, unknown>,
  duplicate: Record<string, unknown>,
  choices: Partial<Record<MergeableField, FieldChoice>> = {},
): FieldResolution {
  const fieldsFilled: FieldResolution["fieldsFilled"] = {};
  const conflicts: FieldResolution["conflicts"] = [];
  const updates: Record<string, unknown> = {};

  for (const field of MERGEABLE_FIELDS) {
    const mine = primary[field];
    const theirs = duplicate[field];
    if (blank(theirs)) continue;

    const same = String(mine ?? "") === String(theirs ?? "");
    if (same) continue;

    if (blank(mine)) {
      updates[field] = theirs;
      fieldsFilled[field] = { from: theirs };
      continue;
    }

    const chosen: FieldChoice = choices[field] === "duplicate" ? "duplicate" : "primary";
    if (chosen === "duplicate") {
      updates[field] = theirs;
      conflicts.push({ field, kept: theirs, discardedFromMerged: mine, chosen });
    } else {
      conflicts.push({ field, kept: mine, discardedFromMerged: theirs, chosen });
    }
  }

  // Tags are unioned in every case. A merge must never be the reason a label
  // somebody applied on purpose disappears.
  const mineTags = Array.isArray(primary["tags"]) ? (primary["tags"] as unknown[]).map(String) : [];
  const theirTags = Array.isArray(duplicate["tags"]) ? (duplicate["tags"] as unknown[]).map(String) : [];
  const tagsAdded = theirTags.filter((t) => !mineTags.includes(t));
  if (tagsAdded.length > 0) updates["tags"] = [...mineTags, ...tagsAdded];

  return { fieldsFilled, conflicts, updates, tagsAdded };
}

/**
 * The block appended to the survivor's notes.
 *
 * The merge record holds the full machine-readable truth, but an operator
 * looking at the contact should not have to know that table exists to find out
 * that a second email address and a different company name once belonged to
 * this person. So the discarded side is written where they will actually see
 * it.
 */
export function mergeNoteBlock(args: {
  duplicate: Record<string, unknown>;
  conflicts: FieldResolution["conflicts"];
  actorLabel: string;
  when: Date;
}): string {
  const lines = [
    `[${args.when.toLocaleString()}] Merged in duplicate contact #${String(args.duplicate["id"])} `
    + `(${String(args.duplicate["name"] ?? "unnamed")} · ${String(args.duplicate["email"] ?? "no email")}) by ${args.actorLabel}.`,
  ];
  const discarded = args.conflicts.filter((c) => c.chosen === "primary");
  if (discarded.length > 0) {
    lines.push("Values kept from the merged record for reference (this contact's own values were kept):");
    for (const c of discarded) lines.push(`  · ${c.field}: ${String(c.discardedFromMerged)}`);
  }
  const theirNotes = typeof args.duplicate["notes"] === "string" ? (args.duplicate["notes"] as string).trim() : "";
  if (theirNotes) {
    lines.push("Notes from the merged record:");
    lines.push(theirNotes.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  return lines.join("\n");
}

// ── Executing the merge ─────────────────────────────────────────────────────

export interface MergeOutcome {
  moves: MoveResult[];
  conversationIdentitiesRewritten: number;
  resolution: FieldResolution;
}

/**
 * Repoint every related record from `duplicateId` onto `primaryId`.
 *
 * Deliberately sequential rather than parallel: these are UPDATEs on the same
 * two contact ids across two dozen tables, and running them concurrently on one
 * pooled connection buys nothing while making a partial failure much harder to
 * read.
 */
export async function repointAll(primaryId: number, duplicateId: number): Promise<{
  moves: MoveResult[]; conversationIdentitiesRewritten: number;
}> {
  const moves: MoveResult[] = [];
  for (const spec of REPOINTS) {
    moves.push(await repointOne(spec, duplicateId, primaryId));
  }
  const conversationIdentitiesRewritten = await rewriteConversationIdentity(duplicateId, primaryId);
  return { moves, conversationIdentitiesRewritten };
}

// ── Duplicate detection ─────────────────────────────────────────────────────

export interface DuplicateCandidate {
  signal: "email" | "name_phone";
  /** What actually matched, verbatim, so the operator can judge the evidence. */
  matchedOn: string;
  confidence: "strong" | "weak";
  a: DuplicateSide;
  b: DuplicateSide;
}

export interface DuplicateSide {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  createdAt: string;
  /** Rough weight of what would move if this side were merged away. */
  activityCount: number;
}

interface CandidateRow {
  signal: string;
  matched_on: string;
  a_id: number; a_name: string; a_email: string; a_phone: string | null;
  a_company: string | null; a_status: string; a_created: string; a_activities: number;
  b_id: number; b_name: string; b_email: string; b_phone: string | null;
  b_company: string | null; b_status: string; b_created: string; b_activities: number;
}

/**
 * Candidate duplicate pairs, strongest signal first.
 *
 * Two signals and they are not equals, which is why the response says which one
 * fired rather than handing back an undifferentiated list:
 *
 *   `email`      — identical normalised email. Strong: an email address is an
 *                  account, and two contacts holding one are almost always one
 *                  person. Placeholder addresses minted by an import
 *                  (`@import.invalid`, the older `@imported.local`) are excluded
 *                  from this signal, because they are derived from the phone
 *                  and would otherwise report the phone match twice.
 *   `name_phone` — identical normalised name AND identical last-ten-digits
 *                  phone. Weak, and labelled weak: a shared switchboard plus a
 *                  common name is a real false positive, so this is a
 *                  suggestion for a human, never grounds to merge unattended.
 *
 * Excluded from both: contacts already merged away, and pairs an operator has
 * already dismissed.
 */
export async function findDuplicateCandidates(limit = 100): Promise<DuplicateCandidate[]> {
  const rows = await db.execute(sql`
    WITH live AS (
      SELECT l.id, l.name, l.email, l.phone, l.company, l.status, l.created_at,
             lower(btrim(l.email)) AS email_key,
             CASE WHEN length(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g')) >= 7
                  THEN right(regexp_replace(l.phone, '\\D', '', 'g'), 10) ELSE NULL END AS phone_key,
             btrim(regexp_replace(regexp_replace(lower(l.name), '[^a-z0-9\\s]', ' ', 'g'), '\\s+', ' ', 'g')) AS name_key
      FROM crm_leads l
      WHERE NOT EXISTS (SELECT 1 FROM crm_contact_merges m WHERE m.merged_lead_id = l.id)
    ),
    counts AS (
      SELECT lead_id, count(*)::int AS n FROM crm_activities GROUP BY lead_id
    ),
    pairs AS (
      SELECT 'email'::text AS signal, a.email_key AS matched_on, a.id AS a_id, b.id AS b_id
      FROM live a JOIN live b ON b.email_key = a.email_key AND b.id > a.id
      WHERE a.email_key <> ''
        AND a.email_key NOT LIKE '%@import.invalid'
        AND a.email_key NOT LIKE '%@imported.local'
      UNION ALL
      SELECT 'name_phone'::text, a.name_key || ' · ' || a.phone_key, a.id, b.id
      FROM live a JOIN live b
        ON b.name_key = a.name_key AND b.phone_key = a.phone_key AND b.id > a.id
      WHERE a.name_key <> '' AND a.phone_key IS NOT NULL
    ),
    ranked AS (
      SELECT DISTINCT ON (a_id, b_id) signal, matched_on, a_id, b_id
      FROM pairs
      ORDER BY a_id, b_id, CASE signal WHEN 'email' THEN 0 ELSE 1 END
    )
    SELECT r.signal, r.matched_on,
           a.id AS a_id, a.name AS a_name, a.email AS a_email, a.phone AS a_phone,
           a.company AS a_company, a.status AS a_status, a.created_at AS a_created,
           coalesce(ca.n, 0) AS a_activities,
           b.id AS b_id, b.name AS b_name, b.email AS b_email, b.phone AS b_phone,
           b.company AS b_company, b.status AS b_status, b.created_at AS b_created,
           coalesce(cb.n, 0) AS b_activities
    FROM ranked r
    JOIN live a ON a.id = r.a_id
    JOIN live b ON b.id = r.b_id
    LEFT JOIN counts ca ON ca.lead_id = a.id
    LEFT JOIN counts cb ON cb.lead_id = b.id
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_duplicate_dismissals d
      WHERE d.lead_id_low = least(r.a_id, r.b_id) AND d.lead_id_high = greatest(r.a_id, r.b_id)
    )
    ORDER BY CASE r.signal WHEN 'email' THEN 0 ELSE 1 END, a.id
    LIMIT ${limit}
  `);

  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as CandidateRow[];
  return list.map((r) => ({
    signal: r.signal === "email" ? "email" : "name_phone",
    matchedOn: r.matched_on,
    confidence: r.signal === "email" ? "strong" : "weak",
    a: {
      id: Number(r.a_id), name: r.a_name, email: r.a_email, phone: r.a_phone,
      company: r.a_company, status: r.a_status, createdAt: new Date(r.a_created).toISOString(),
      activityCount: Number(r.a_activities),
    },
    b: {
      id: Number(r.b_id), name: r.b_name, email: r.b_email, phone: r.b_phone,
      company: r.b_company, status: r.b_status, createdAt: new Date(r.b_created).toISOString(),
      activityCount: Number(r.b_activities),
    },
  }));
}

/** The canonical, order-independent form of a pair. */
export function canonicalPair(a: number, b: number): { low: number; high: number } {
  return a <= b ? { low: a, high: b } : { low: b, high: a };
}
