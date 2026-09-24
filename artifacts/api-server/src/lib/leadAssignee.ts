// ── M6: lead owners, resolved onto real members of staff ────────────────────
//
// `crm_leads.assigned_to` has always been free text. `crm_leads
// .assigned_to_staff_id` is the reference that replaces it as the thing the
// product reads; the text column is kept as the audit trail of what was
// recorded (lib/db/src/schema/crmLeads.ts, docs/crm-ops/schema/M6-lead-assignee.sql).
//
// This is the database half. The RULES live in ./leadOwnerRules.ts and nowhere
// else; this module applies them to rows:
//
//   resolveAssignmentFields  what a lead create/patch body asks for, as the two
//                            owner columns — which are always written together
//   resolveOwnerStaffId      a free-text name → an id, at WRITE time only
//   listUnresolvedOwners     every name still waiting for a person, and why
//   recordOwnerMapping       a person's decision: point those contacts at
//                            somebody, and record who decided, when and how
//   backfillLeadAssignees    the rules over every unresolved row — exactly what
//                            docs/crm-ops/schema/M6-lead-assignee.sql does, and
//                            what crmLeadAssignment.test.ts compares it with
//
// Nothing here derives an owner at READ time. A lookup repeated on every query
// is a guess that silently changes answer when somebody is renamed or a second
// person shares a name — the defect the id exists to remove.

import type { Request } from "express";
import { and, asc, desc, eq, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  db, crmLeads, crmStaff, crmLeadOwnerMappings, type CrmLeadOwnerMappingRule,
} from "@workspace/db";
import {
  describeOwnerPeople, explainOwnerMatch, matchOwner, ownerKey, toOwnerPerson, trimOwnerValue,
  OWNER_RULE_LABEL,
  type OwnerCandidate, type OwnerMatch, type OwnerMatchRule, type OwnerPerson,
} from "./leadOwnerRules.js";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Runner = Db | Tx;

// ── Who may map ─────────────────────────────────────────────────────────────

/**
 * The grants `POST /crm/lead-assignment/map` checks, asked in one place so the
 * review panel and the import preview can tell the screen the truth about
 * whether to offer the action. A personal sign-in is required: the decision is
 * recorded against a person, and the legacy shared bearer is nobody.
 */
export function canMapLeadOwners(req: Request): boolean {
  const granted = req.staffAuth?.permissions;
  return !!granted && granted.has("staff.read") && granted.has("leads.write");
}

export const MAP_LEAD_OWNERS_REQUIRES =
  "A personal sign-in holding staff.read and leads.write — an owner or a technical administrator, by default.";

// ── The key, in SQL ─────────────────────────────────────────────────────────

const TRIM_SET = sql.raw(`' ' || chr(9) || chr(10) || chr(13)`);
const ASCII_UPPER = sql.raw(`'ABCDEFGHIJKLMNOPQRSTUVWXYZ'`);
const ASCII_LOWER = sql.raw(`'abcdefghijklmnopqrstuvwxyz'`);

/** `trimOwnerValue`, in SQL. */
export function ownerValueSql(value: SQLWrapper): SQL<string> {
  return sql<string>`btrim(${value}, ${TRIM_SET})`;
}

/** `ownerKey`, in SQL — the expression M6-lead-assignee.sql spells out. */
export function ownerKeySql(value: SQLWrapper): SQL<string> {
  return sql<string>`translate(btrim(${value}, ${TRIM_SET}), ${ASCII_UPPER}, ${ASCII_LOWER})`;
}

/**
 * Taken by every mapping write and by the SQL backfill. Two people mapping one
 * name to two different people at the same moment would each see "matches
 * nobody", each record it as a legacy name, and leave behind exactly the
 * ambiguity this work exists to remove.
 */
const MAPPING_LOCK = sql`SELECT pg_advisory_xact_lock(hashtext('crm_lead_owner_mappings'))`;

/** Who "decided" a mapping the backfill made. The SQL file writes the identical string. */
export const BACKFILL_DECIDED_BY_LABEL = "Automatic backfill (the M6 matching rules)";

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) ?? [];
}

// ── Candidates ──────────────────────────────────────────────────────────────

/**
 * Everyone a name may resolve TO — every status, on purpose (see the header of
 * leadOwnerRules.ts). The picker's list of people new work may be handed to is
 * a different question, answered by `GET /crm/operations/assignees`.
 */
export async function loadOwnerCandidates(runner: Runner = db): Promise<OwnerCandidate[]> {
  return runner
    .select({
      id: crmStaff.id,
      displayName: crmStaff.displayName,
      email: crmStaff.email,
      status: crmStaff.status,
      legacyNames: crmStaff.legacyNames,
    })
    .from(crmStaff)
    .orderBy(asc(crmStaff.displayName), asc(crmStaff.id));
}

/**
 * The id for a free-text owner name, or null when the rules do not name exactly
 * one person.
 *
 * WRITE time only — when a name arrives without an id (an older client, an
 * automation's `set_field`, the legacy import) — so a value somebody has
 * already mapped resolves by itself from then on.
 */
export async function resolveOwnerStaffId(
  value: unknown, staff?: readonly OwnerCandidate[],
): Promise<number | null> {
  if (!ownerKey(value)) return null;
  const match = matchOwner(value, staff ?? await loadOwnerCandidates());
  return match.outcome === "matched" ? match.staffId : null;
}

// ── Lead create / patch ─────────────────────────────────────────────────────

export type AssignmentFields =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "set"; assignedTo: string | null; assignedToStaffId: number | null };

/**
 * What a lead create/patch body is asking for, as the two columns to write.
 *
 * The two columns are ALWAYS written together. A body that moves one and leaves
 * the other is how they drift apart, and a stale id is worse than no id — it
 * attributes a contact to somebody who was never given it.
 *
 *   `assignedToStaffId` present  the picker. The staff row decides both: the id
 *                                is the reference, and the display name is
 *                                copied into the text as the record of the name
 *                                on the day it was assigned. Only an ACTIVE
 *                                person may be given new work. null clears both.
 *                                Re-sending the id a contact already has is not
 *                                a new assignment and is not re-checked, so a
 *                                contact owned by somebody who has since left
 *                                can still have its status saved.
 *
 *   `assignedTo` alone           a name from somewhere else. The text is stored
 *                                and the id is resolved through the rules ONCE,
 *                                here. No match, or an ambiguous one, stores
 *                                NULL and the name appears in the unmapped-owners
 *                                panel. It is never left pointing at the
 *                                previous owner.
 */
export async function resolveAssignmentFields(
  body: Record<string, unknown>,
  existing?: { assignedTo: string | null; assignedToStaffId: number | null } | null,
): Promise<AssignmentFields> {
  if ("assignedToStaffId" in body) {
    const raw = body["assignedToStaffId"];
    if (raw === null || raw === undefined || raw === "") {
      return { kind: "set", assignedTo: null, assignedToStaffId: null };
    }
    const id = typeof raw === "number" ? raw
      : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim())
      : Number.NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { kind: "error", error: "Choose a person from the list, or Unassigned." };
    }
    if (existing && existing.assignedToStaffId === id) return { kind: "none" };

    const [staff] = await db.select({
      id: crmStaff.id, displayName: crmStaff.displayName, status: crmStaff.status,
    }).from(crmStaff).where(eq(crmStaff.id, id)).limit(1);
    if (!staff) return { kind: "error", error: "That person is not in this CRM." };
    if (staff.status !== "active") {
      return {
        kind: "error",
        error: `${staff.displayName}'s account is ${staff.status}, so new work cannot be assigned to them.`,
      };
    }
    return { kind: "set", assignedTo: staff.displayName, assignedToStaffId: staff.id };
  }

  if ("assignedTo" in body) {
    const raw = body["assignedTo"];
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return { kind: "error", error: "An owner name must be text." };
    }
    const text = trimOwnerValue(raw);
    // The same name sent back unchanged is not a new decision. Re-resolving it
    // would quietly undo a person's mapping of an ambiguous name the moment an
    // older screen saved some other field of the contact.
    if (existing && text === trimOwnerValue(existing.assignedTo)) return { kind: "none" };
    if (!text) return { kind: "set", assignedTo: null, assignedToStaffId: null };
    return { kind: "set", assignedTo: text, assignedToStaffId: await resolveOwnerStaffId(text) };
  }

  return { kind: "none" };
}

// ── The unresolved list ─────────────────────────────────────────────────────

/**
 *   no_match             no rule names anybody
 *   ambiguous            the deciding rule names two or more people
 *   matched_not_applied  the rules name one person, but these contacts still
 *                        point at nobody — they were recorded before the
 *                        backfill ran, or before a rename or a legacy name made
 *                        the value resolve. A person confirms it; the app does
 *                        not quietly apply it on read.
 */
export type UnresolvedReason = "no_match" | "ambiguous" | "matched_not_applied";

export interface UnresolvedOwner {
  /** The value as recorded (edge whitespace removed) — what the owner sees and maps. */
  value: string;
  /** The comparison key. Two spellings with one key are one entry. */
  key: string;
  /** How many contacts carry it with no person resolved. */
  leads: number;
  reason: UnresolvedReason;
  /** The rule behind an ambiguity or a not-yet-applied match. */
  rule: OwnerMatchRule | null;
  /** The people it could be. Empty when nothing matched. */
  candidates: OwnerPerson[];
  /** Plain wording for the panel, so the UI does not re-derive the reason. */
  explanation: string;
}

export interface OwnerAssignmentSummary {
  unresolved: UnresolvedOwner[];
  /** Contacts that point at a person. */
  resolvedLeads: number;
  /** Contacts carrying a name that points at nobody. */
  unresolvedLeads: number;
  /** Contacts with no owner recorded at all. */
  unassignedLeads: number;
}

/**
 * Every distinct owner name that is NOT resolved to a person, with how many
 * contacts carry it and why it was left alone.
 *
 * Computed from the rows, not from a stored queue, so it cannot go stale:
 * mapping a value, or renaming somebody so that it now matches, changes the
 * answer by itself. A row here is never a failure — it is the system declining
 * to make somebody else's decision.
 */
export async function listUnresolvedOwners(
  staff?: readonly OwnerCandidate[],
): Promise<OwnerAssignmentSummary> {
  const people = staff ?? await loadOwnerCandidates();
  const key = ownerKeySql(crmLeads.assignedTo);
  const value = ownerValueSql(crmLeads.assignedTo);

  const rows = await db
    .select({ key, value: sql<string>`min(${value})`, leads: sql<number>`count(*)::int` })
    .from(crmLeads)
    .where(and(isNull(crmLeads.assignedToStaffId), sql`${value} <> ''`))
    .groupBy(key);

  const [totals] = await db.select({
    resolved: sql<number>`(count(*) FILTER (WHERE ${crmLeads.assignedToStaffId} IS NOT NULL))::int`,
    unresolved: sql<number>`(count(*) FILTER (WHERE ${crmLeads.assignedToStaffId} IS NULL AND coalesce(${value}, '') <> ''))::int`,
    unassigned: sql<number>`(count(*) FILTER (WHERE ${crmLeads.assignedToStaffId} IS NULL AND coalesce(${value}, '') = ''))::int`,
  }).from(crmLeads);

  const unresolved = rows.map((row): UnresolvedOwner => {
    const match = matchOwner(row.key, people);
    const base = { value: row.value, key: row.key, leads: Number(row.leads) };
    if (match.outcome === "matched") {
      const who = people.find((p) => p.id === match.staffId);
      const person = who ? toOwnerPerson(who) : null;
      return {
        ...base,
        reason: "matched_not_applied",
        rule: match.rule,
        candidates: person ? [person] : [],
        explanation: `“${row.value}” matches ${person ? describeOwnerPeople([person])[0] : "a member of staff"} `
          + `by ${OWNER_RULE_LABEL[match.rule]}, but these contacts were recorded before that was true and `
          + "still point at nobody. Confirm it to finish the job.",
      };
    }
    return {
      ...base,
      reason: match.outcome === "ambiguous" ? "ambiguous" : "no_match",
      rule: match.outcome === "ambiguous" ? match.rule : null,
      candidates: match.outcome === "ambiguous" ? match.candidates : [],
      explanation: explainOwnerMatch(row.value, match, people),
    };
  });

  unresolved.sort((a, b) => b.leads - a.leads || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));

  return {
    unresolved,
    resolvedLeads: Number(totals?.resolved ?? 0),
    unresolvedLeads: Number(totals?.unresolved ?? 0),
    unassignedLeads: Number(totals?.unassigned ?? 0),
  };
}

// ── The record of decisions ─────────────────────────────────────────────────

export interface OwnerMappingRecord {
  id: number;
  value: string;
  staff: OwnerPerson;
  rule: CrmLeadOwnerMappingRule;
  leadsUpdated: number;
  legacyNameAdded: boolean;
  decidedByStaffId: number | null;
  decidedBy: string;
  createdAt: Date;
}

/** The most recent mapping decisions, newest first. */
export async function listRecentOwnerMappings(limit = 25): Promise<OwnerMappingRecord[]> {
  const rows = await db.select({
    id: crmLeadOwnerMappings.id,
    value: crmLeadOwnerMappings.valueLabel,
    staffId: crmStaff.id,
    staffName: crmStaff.displayName,
    staffEmail: crmStaff.email,
    staffStatus: crmStaff.status,
    rule: crmLeadOwnerMappings.rule,
    leadsUpdated: crmLeadOwnerMappings.leadsUpdated,
    legacyNameAdded: crmLeadOwnerMappings.legacyNameAdded,
    decidedByStaffId: crmLeadOwnerMappings.decidedByStaffId,
    decidedBy: crmLeadOwnerMappings.decidedByLabel,
    createdAt: crmLeadOwnerMappings.createdAt,
  })
    .from(crmLeadOwnerMappings)
    .innerJoin(crmStaff, eq(crmStaff.id, crmLeadOwnerMappings.staffId))
    .orderBy(desc(crmLeadOwnerMappings.createdAt), desc(crmLeadOwnerMappings.id))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((r) => ({
    id: r.id,
    value: r.value,
    staff: { id: r.staffId, displayName: r.staffName, email: r.staffEmail, status: r.staffStatus },
    rule: r.rule as CrmLeadOwnerMappingRule,
    leadsUpdated: r.leadsUpdated,
    legacyNameAdded: r.legacyNameAdded,
    decidedByStaffId: r.decidedByStaffId,
    decidedBy: r.decidedBy,
    createdAt: r.createdAt,
  }));
}

// ── A person's decision ─────────────────────────────────────────────────────

export type OwnerFutureOutcome = "resolves_to_them" | "still_ambiguous" | "resolves_to_someone_else";

export type OwnerMappingOutcome =
  | {
      ok: true;
      mappingId: number;
      value: string;
      staff: OwnerPerson;
      rule: CrmLeadOwnerMappingRule;
      leadsUpdated: number;
      legacyNameAdded: boolean;
      future: { outcome: OwnerFutureOutcome; note: string };
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

function describeFuture(
  value: string, target: OwnerPerson, after: OwnerMatch, legacyNameAdded: boolean,
  people: readonly OwnerPerson[],
): { outcome: OwnerFutureOutcome; note: string } {
  const name = describeOwnerPeople([target])[0];
  if (after.outcome === "matched" && after.staffId === target.id) {
    return {
      outcome: "resolves_to_them",
      note: legacyNameAdded
        ? `“${value}” is now recorded on ${name}'s account, so anything that records that name later — an import, an automation, an older screen — finds them by itself.`
        : `“${value}” already matches ${OWNER_RULE_LABEL[after.rule]} for ${name}, so anything recorded with it later finds them by itself.`,
    };
  }
  if (after.outcome === "ambiguous") {
    return {
      outcome: "still_ambiguous",
      note: `This covered the contacts listed. Anything recorded later as “${value}” still matches `
        + `${describeOwnerPeople(after.candidates).join(" and ")}, so it will be listed here again — `
        + "renaming one of them makes it resolve by itself.",
    };
  }
  const other = after.outcome === "matched" ? people.find((p) => p.id === after.staffId) : undefined;
  return {
    outcome: "resolves_to_someone_else",
    note: after.outcome === "matched"
      ? `This covered the contacts listed. Anything recorded later as “${value}” still resolves to `
        + `${other ? describeOwnerPeople([other])[0] : "somebody else"}, because it matches ${OWNER_RULE_LABEL[after.rule]}.`
      : `This covered the contacts listed. “${value}” was not recorded on anybody's account.`,
  };
}

/**
 * Point every unresolved contact carrying `value` at `staffId`, and record the
 * decision: who made it, when, which rule supported it (or that none did), and
 * how many contacts it moved.
 *
 * Any member of staff may be chosen, including a disabled one — this attributes
 * history; it is not new work.
 *
 * The name is ALSO recorded in that person's `legacy_names` — so it resolves by
 * itself next time — but only when no rule names anybody for it today. When a
 * rule already names somebody (even ambiguously), adding the name to one more
 * account would silently change how it resolves for everybody else, so the
 * decision covers the contacts listed and the response says so.
 *
 * Only rows whose id is still NULL are touched: a mapping never overwrites an
 * assignment somebody made deliberately. `updated_at` is not bumped, for the
 * reason the SQL file gives.
 */
export async function recordOwnerMapping(args: {
  value: unknown;
  staffId: number;
  decidedBy: { staffId: number | null; label: string };
}): Promise<OwnerMappingOutcome> {
  const value = trimOwnerValue(args.value);
  const key = ownerKey(args.value);
  if (!key) return { ok: false, status: 400, error: "Say which owner name you are mapping." };

  return db.transaction(async (tx): Promise<OwnerMappingOutcome> => {
    await tx.execute(MAPPING_LOCK);

    const staff = await loadOwnerCandidates(tx);
    const target = staff.find((s) => s.id === args.staffId);
    if (!target) return { ok: false, status: 404, error: "That person is not in this CRM." };

    const before = matchOwner(key, staff);
    const rule: CrmLeadOwnerMappingRule =
      before.outcome === "matched" && before.staffId === target.id ? before.rule : "manual";
    const legacyNameAdded = before.outcome === "none";

    const moved = await tx.update(crmLeads)
      .set({ assignedToStaffId: target.id })
      .where(and(eq(ownerKeySql(crmLeads.assignedTo), key), isNull(crmLeads.assignedToStaffId)))
      .returning({ id: crmLeads.id });

    if (moved.length === 0 && !legacyNameAdded) {
      return {
        ok: false,
        status: 409,
        error: before.outcome === "matched" && before.staffId === target.id
          ? `“${value}” already belongs to ${target.displayName}, and no contact is waiting for it.`
          : `No contact carries “${value}” without a person any more — somebody may have just mapped it.`,
      };
    }

    if (legacyNameAdded) {
      await tx.update(crmStaff)
        .set({ legacyNames: sql`array_append(${crmStaff.legacyNames}, ${value}::text)`, updatedAt: new Date() })
        .where(eq(crmStaff.id, target.id));
    }

    const after = legacyNameAdded
      ? matchOwner(key, staff.map((s) => (s.id === target.id
        ? { ...s, legacyNames: [...(s.legacyNames ?? []), value] }
        : s)))
      : before;

    const [row] = await tx.insert(crmLeadOwnerMappings).values({
      valueKey: key,
      valueLabel: value,
      staffId: target.id,
      rule,
      leadsUpdated: moved.length,
      legacyNameAdded,
      decidedByStaffId: args.decidedBy.staffId,
      decidedByLabel: args.decidedBy.label,
    }).returning({ id: crmLeadOwnerMappings.id });

    return {
      ok: true,
      mappingId: row.id,
      value,
      staff: toOwnerPerson(target),
      rule,
      leadsUpdated: moved.length,
      legacyNameAdded,
      future: describeFuture(value, toOwnerPerson(target), after, legacyNameAdded, staff),
    };
  });
}

// ── The backfill ────────────────────────────────────────────────────────────

/**
 * Run the three rules over every unresolved row, exactly as
 * docs/crm-ops/schema/M6-lead-assignee.sql does, recording one decision per
 * value in `crm_lead_owner_mappings` with the rule that made it.
 *
 * Its whole contract is that a second run claims NOTHING: it only ever touches
 * rows whose id is NULL, so it can neither undo a decision a person made by
 * hand nor re-decide one it already made.
 */
export async function backfillLeadAssignees(): Promise<{
  updated: number;
  decisions: Array<{ key: string; staffId: number; rule: OwnerMatchRule; leads: number }>;
}> {
  return db.transaction(async (tx) => {
    await tx.execute(MAPPING_LOCK);

    const staff = await loadOwnerCandidates(tx);
    const keyExpr = ownerKeySql(crmLeads.assignedTo);
    const valueExpr = ownerValueSql(crmLeads.assignedTo);

    const targets = await tx.selectDistinct({ key: keyExpr })
      .from(crmLeads)
      .where(and(isNull(crmLeads.assignedToStaffId), sql`${valueExpr} <> ''`));

    const decisions: Array<{ key: string; staffId: number; rule: OwnerMatchRule; leads: number }> = [];
    let updated = 0;

    for (const key of targets.map((t) => t.key).sort()) {
      const match = matchOwner(key, staff);
      if (match.outcome !== "matched") continue;

      const result = await tx.execute(sql`
        WITH updated AS (
          UPDATE ${crmLeads}
             SET assigned_to_staff_id = ${match.staffId}::integer
           WHERE ${keyExpr} = ${key}::text
             AND ${crmLeads.assignedToStaffId} IS NULL
          RETURNING ${valueExpr} AS label
        )
        INSERT INTO ${crmLeadOwnerMappings}
               (value_key, value_label, staff_id, rule, leads_updated,
                legacy_name_added, decided_by_staff_id, decided_by_label)
        SELECT ${key}::text, min(label), ${match.staffId}::integer, ${match.rule}::text, count(*)::int,
               false, NULL::integer, ${BACKFILL_DECIDED_BY_LABEL}::text
          FROM updated
        HAVING count(*) > 0
        RETURNING leads_updated`);

      const [inserted] = rowsOf<{ leads_updated: number }>(result);
      if (!inserted) continue;
      const leads = Number(inserted.leads_updated);
      decisions.push({ key, staffId: match.staffId, rule: match.rule, leads });
      updated += leads;
    }
    return { updated, decisions };
  });
}
