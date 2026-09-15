// ── M6: the lead-owner matching rules ───────────────────────────────────────
//
// `crm_leads.assigned_to` has always been free text. `crm_leads
// .assigned_to_staff_id` is the reference that replaces it as the thing the
// product reads, and turning the first into the second is a DECISION. This file
// is the one statement of how that decision is made.
//
// It is pure on purpose — no database, no request, no clock — so every place
// that decides applies literally the same function:
//
//   lib/leadAssignee.ts      lead create/patch, automations, the review panel's
//                            list and its mapping action, the backfill
//   routes/crmContacts.ts    the CSV import plan (through contactImport.ts)
//   docs/crm-ops/schema/M6-lead-assignee.sql
//                            the same rules said in SQL, for the one-time
//                            backfill an integration owner applies
//
// `routes/crmLeadAssignment.test.ts` runs the SQL file and the TypeScript
// backfill over the same fixtures and fails if they disagree about one contact.
//
// ── The comparison key ──────────────────────────────────────────────────────
//
//   1. Strip leading and trailing ASCII whitespace: space, tab, CR, LF.
//   2. Fold ASCII A-Z to a-z.
//   3. Nothing else. Inner spacing, punctuation, accents and the case of
//      non-ASCII letters are compared exactly as written.
//
// ASCII-only is deliberate: it is what makes the SQL and this file agree on
// EVERY database rather than on most. PostgreSQL's lower() follows the
// database's locale — under the C locale it leaves "É" alone — while
// JavaScript's toLowerCase() follows Unicode, so a key built on either would
// let the backfill and the application decide differently about one name.
// translate() over a fixed alphabet means the same thing everywhere. The cost
// is that "JOSÉ" and "José" are different values, which surfaces as an unmapped
// name for a person to decide once — never as a wrong owner.
//
// ── The rules, in order ─────────────────────────────────────────────────────
//
//   1. display name   the key equals the key of crm_staff.display_name
//   2. legacy names   the key equals the key of an entry in crm_staff.legacy_names
//   3. email address  the key equals the key of crm_staff.email
//
// The FIRST rule that matches anybody decides; later rules are not consulted.
// If the deciding rule matches more than one person, the value is AMBIGUOUS and
// resolves to nobody.
//
// There is no first-name match, no initials, no substring and no edit distance.
// Every one of those invents an answer that reads like a discovery. A value
// that does not resolve is shown to a person instead — Admin → "Unmapped lead
// owners" (/admin/crm/admin) — where the decision is made once and recorded.
//
// Disabled and invited staff ARE matchable. A contact legitimately belongs to
// somebody who has since left; staff rows are retained rather than deleted for
// exactly that reason, and refusing to resolve their name would leave real
// history unattributed. Handing NEW work to them is a different act, and the
// picker refuses it (resolveAssignmentFields in lib/leadAssignee.ts).

export const OWNER_MATCH_RULES = ["display_name", "legacy_name", "email"] as const;
export type OwnerMatchRule = (typeof OWNER_MATCH_RULES)[number];

/** How a recorded mapping was decided: by one of the rules, or by a person. */
export type OwnerMappingRule = OwnerMatchRule | "manual";

/** Plain wording for each rule, finishing the sentence "it matches …". */
export const OWNER_RULE_LABEL: Record<OwnerMatchRule, string> = {
  display_name: "their display name",
  legacy_name: "a legacy name recorded on their account",
  email: "their email address",
};

const EDGE_WHITESPACE = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/**
 * The value as it is shown and recorded: edge whitespace (space, tab, CR, LF)
 * removed, everything else exactly as written.
 *
 * The SQL spelling is `btrim(value, ' ' || chr(9) || chr(10) || chr(13))`.
 */
export function trimOwnerValue(value: unknown): string {
  return typeof value === "string" ? value.replace(EDGE_WHITESPACE, "") : "";
}

/**
 * The comparison key: the trimmed value with ASCII A-Z folded to a-z.
 *
 * The SQL spelling is `translate(<trimmed>, 'ABC…Z', 'abc…z')`. Every rule, the
 * backfill, the unresolved list and the mapping write compare through this, so
 * "Saisa Lorraigne", " saisa lorraigne\t" and "SAISA LORRAIGNE" are one value
 * everywhere rather than one value in some places and three in others.
 */
export function ownerKey(value: unknown): string {
  return trimOwnerValue(value).replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Everything a rule may look at. */
export interface OwnerCandidate {
  id: number;
  displayName: string;
  email: string;
  status: string;
  legacyNames: readonly string[] | null;
}

/** A person as the review surfaces show them: enough to tell two apart. */
export interface OwnerPerson {
  id: number;
  displayName: string;
  email: string;
  status: string;
}

export type OwnerMatch =
  | { outcome: "matched"; staffId: number; rule: OwnerMatchRule }
  | { outcome: "ambiguous"; rule: OwnerMatchRule; candidates: OwnerPerson[] }
  | { outcome: "none" };

export function toOwnerPerson(s: OwnerPerson): OwnerPerson {
  return { id: s.id, displayName: s.displayName, email: s.email, status: s.status };
}

/** The three rules, in order, applied to one value. */
export function matchOwner(value: unknown, staff: readonly OwnerCandidate[]): OwnerMatch {
  const key = ownerKey(value);
  if (!key) return { outcome: "none" };

  const rules: ReadonlyArray<readonly [OwnerMatchRule, (s: OwnerCandidate) => boolean]> = [
    ["display_name", (s) => ownerKey(s.displayName) === key],
    ["legacy_name", (s) => (s.legacyNames ?? []).some((n) => ownerKey(n) === key)],
    ["email", (s) => ownerKey(s.email) === key],
  ];

  for (const [rule, applies] of rules) {
    // Keyed by id: one person whose legacy names hold the same string twice,
    // or a list that repeats a row, is still one person — not an ambiguity.
    const hits = new Map<number, OwnerCandidate>();
    for (const s of staff) if (applies(s)) hits.set(s.id, s);
    if (hits.size === 0) continue;
    if (hits.size === 1) return { outcome: "matched", staffId: [...hits.keys()][0], rule };
    const candidates = [...hits.values()].map(toOwnerPerson).sort((a, b) =>
      a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id - b.id);
    return { outcome: "ambiguous", rule, candidates };
  }
  return { outcome: "none" };
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * How to name people so that two of them can be told apart: the email address
 * is added when display names collide, and a non-active account says so.
 */
export function describeOwnerPeople(people: readonly OwnerPerson[]): string[] {
  const seen = new Map<string, number>();
  for (const p of people) seen.set(p.displayName, (seen.get(p.displayName) ?? 0) + 1);
  return people.map((p) => {
    const tags: string[] = [];
    if ((seen.get(p.displayName) ?? 0) > 1) tags.push(p.email);
    if (p.status !== "active") tags.push(p.status);
    return tags.length ? `${p.displayName} (${tags.join(", ")})` : p.displayName;
  });
}

/** One sentence saying what the rules decided about a value, and why. */
export function explainOwnerMatch(value: unknown, match: OwnerMatch, staff: readonly OwnerPerson[]): string {
  const label = trimOwnerValue(value);
  switch (match.outcome) {
    case "matched": {
      const who = staff.find((s) => s.id === match.staffId);
      const name = who ? describeOwnerPeople([who])[0] : `staff member #${match.staffId}`;
      return `“${label}” is ${name}: it matches ${OWNER_RULE_LABEL[match.rule]}.`;
    }
    case "ambiguous":
      return `“${label}” could be ${joinOr(describeOwnerPeople(match.candidates))}: it matches `
        + `${OWNER_RULE_LABEL[match.rule]} for each of them. Nothing in the record says which, so nobody was assumed.`;
    case "none":
      return `Nobody in this CRM has “${label}” as their display name, a recorded legacy name or their `
        + "email address, so nobody was assumed.";
  }
}
