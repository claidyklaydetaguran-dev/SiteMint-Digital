// ── CSV contact import: parsing, explicit mapping, and the plan ─────────────
//
// The whole point of this module is that an import is DECIDED before it is
// applied, and decided in one place. `buildPlan` produces a per-row verdict —
// create, update, skip or error, each with a stated reason — and `commit`
// applies exactly that plan. The preview endpoint and the commit endpoint call
// the same function with the same input, and the commit refuses to run if the
// plan it recomputes does not hash to the plan the operator approved.
//
// Three properties this is built to hold:
//
//  1. **Nothing is guessed silently.** `suggestMapping` proposes a column
//     mapping; the operator sees it and can change it; the server then uses the
//     mapping it was GIVEN and never re-guesses. A column nobody mapped is
//     reported as ignored rather than quietly matched by fuzzy name.
//  2. **A bad row costs one row.** Validation is per row. A row that cannot be
//     imported is marked `error` with its own messages and the rest of the file
//     proceeds — a single malformed date has never been a reason to reject
//     eight hundred contacts.
//  3. **Re-importing the same file is not a second set of contacts.** Every row
//     is matched against the existing book on a normalised key (email first,
//     then phone), so the second run reports `already_exists` / `no_change`
//     rather than creating twins.

import { createHash } from "node:crypto";
import { CRM_STATUSES, CRM_PRIORITIES, CRM_SOURCES } from "@workspace/db";

// ── Limits ──────────────────────────────────────────────────────────────────

/** Bytes of CSV text accepted in one request. */
export const MAX_CSV_BYTES = 4 * 1024 * 1024;
/** Data rows accepted in one file. */
export const MAX_CSV_ROWS = 5000;

// ── CSV parsing ─────────────────────────────────────────────────────────────

/**
 * RFC4180-shaped parser: quoted fields may contain commas, CRLF and escaped
 * quotes. Written as a character scanner rather than a line split precisely
 * because a `notes` column with a newline in it is normal in exported CRM data
 * and a line-splitting parser silently shreds the file into short rows.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  // A UTF-8 BOM in front of the first header makes that header unmatchable.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      sawAnyChar = true;
      continue;
    }
    if (c === '"') { inQuotes = true; sawAnyChar = true; continue; }
    if (c === ",") { row.push(field); field = ""; sawAnyChar = true; continue; }
    if (c === "\r") { continue; }
    if (c === "\n") {
      row.push(field);
      // A blank line is not a row. Dropping it here means a trailing newline
      // does not produce a phantom "row 41: name is required".
      if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
      row = []; field = ""; sawAnyChar = false;
      continue;
    }
    field += c;
    sawAnyChar = true;
  }
  if (sawAnyChar || field !== "" || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
  }
  return rows;
}

// ── The importable fields ───────────────────────────────────────────────────

export interface TargetField {
  /** Column on crm_leads. */
  key: string;
  label: string;
  required: boolean;
  /** Header spellings recognised when SUGGESTING a mapping. Never applied on its own. */
  aliases: string[];
  note: string;
}

export const TARGET_FIELDS: readonly TargetField[] = [
  { key: "name", label: "Full name", required: true,
    aliases: ["name", "full name", "fullname", "contact", "contact name", "client", "client name"],
    note: "Required. The only field an import cannot supply a default for." },
  { key: "email", label: "Email", required: false,
    aliases: ["email", "e-mail", "email address", "mail"],
    note: "The strong matching key. A row with neither email nor phone cannot be matched, so it is refused." },
  { key: "phone", label: "Phone", required: false,
    aliases: ["phone", "telephone", "mobile", "cell", "phone number", "tel"],
    note: "Used as the fallback matching key when a row has no email." },
  { key: "company", label: "Company", required: false,
    aliases: ["company", "organisation", "organization", "business", "company name", "account"], note: "" },
  { key: "website", label: "Website", required: false,
    aliases: ["website", "url", "site", "web"], note: "" },
  { key: "source", label: "Source", required: false,
    aliases: ["source", "lead source", "channel"],
    note: `One of: ${CRM_SOURCES.join(" · ")}. Anything else is recorded as CSV Import and the original is kept in the notes.` },
  { key: "status", label: "Status", required: false,
    aliases: ["status", "stage", "lead status", "pipeline"],
    note: `One of: ${CRM_STATUSES.join(" · ")}. An unrecognised value is reported per row, never silently dropped.` },
  { key: "priority", label: "Priority", required: false,
    aliases: ["priority", "rating", "temperature"],
    note: `One of: ${CRM_PRIORITIES.join(" · ")}.` },
  { key: "assignedTo", label: "Assigned to", required: false,
    aliases: ["assignedto", "assigned to", "owner", "assigned", "rep"], note: "Free text today." },
  { key: "serviceInterest", label: "Service interest", required: false,
    aliases: ["serviceinterest", "service interest", "service", "interest", "product"], note: "" },
  { key: "packageType", label: "Package", required: false,
    aliases: ["packagetype", "package type", "package", "plan"], note: "" },
  { key: "tags", label: "Tags", required: false,
    aliases: ["tags", "tag", "labels", "keywords"],
    note: "Comma- or semicolon-separated inside the cell. Merged with existing tags — an import never removes a tag." },
  { key: "estimatedValue", label: "Estimated value", required: false,
    aliases: ["estimatedvalue", "estimated value", "value", "deal value", "amount", "budget"],
    note: "Currency symbols and thousands separators are tolerated." },
  { key: "notes", label: "Notes", required: false,
    aliases: ["notes", "note", "comments", "description", "remarks"],
    note: "Appended to existing notes with a dated header. Never overwritten." },
  { key: "nextFollowUpAt", label: "Next follow-up", required: false,
    aliases: ["nextfollowupat", "next follow-up", "next followup", "follow up", "follow-up date", "due"],
    note: "Any date the runtime can parse. An unparseable date is a row error, not a silent null." },
];

const TARGET_KEYS = new Set(TARGET_FIELDS.map((f) => f.key));

/** Fields an `update` is allowed to touch. Identity keys are not among them. */
const UPDATABLE_FIELDS = TARGET_FIELDS
  .map((f) => f.key)
  .filter((k) => k !== "email");

// ── Normalisers ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * The phone matching key: the last ten digits.
 *
 * Country prefixes, punctuation and a leading 1 are exactly the things that
 * differ between two spreadsheets describing the same person, and they are the
 * only things a raw string comparison would notice.
 */
export function normalisePhoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.slice(-10);
}

/** The name matching key: case-folded, punctuation-stripped, whitespace-collapsed. */
export function normaliseNameKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The address stored for a row that has a phone but no email.
 *
 * `crm_leads.email` is NOT NULL, so something has to go there. It is derived
 * from the phone rather than from the row number or the clock, which is what
 * makes the second import of the same file match the first one instead of
 * minting another contact. `.invalid` is the RFC 2606 reserved TLD — it can
 * never be a deliverable address, so no send path can mistake it for one.
 */
export function syntheticEmailFor(phoneKey: string): string {
  return `phone-${phoneKey}@import.invalid`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return /@import\.invalid$/i.test(email ?? "") || /@imported\.local$/i.test(email ?? "");
}

function canonical<T>(value: T): string {
  return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
}

// ── Mapping ─────────────────────────────────────────────────────────────────

export type Mapping = Record<string, string | null>;

/**
 * A PROPOSED mapping from target field → CSV header.
 *
 * Deliberately returns a proposal rather than applying one: the caller shows it
 * to the operator, who confirms or corrects it, and the confirmed mapping is
 * what both preview and commit use. A header nobody matched stays unmapped and
 * is reported as ignored.
 */
export function suggestMapping(headers: readonly string[]): Mapping {
  const taken = new Set<string>();
  const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const out: Mapping = {};
  for (const field of TARGET_FIELDS) {
    const hit = headers.find((h) => !taken.has(h) && field.aliases.includes(norm(h)));
    out[field.key] = hit ?? null;
    if (hit) taken.add(hit);
  }
  return out;
}

/** Headers present in the file that the confirmed mapping does not use. */
export function unmappedHeaders(headers: readonly string[], mapping: Mapping): string[] {
  const used = new Set(Object.values(mapping).filter((v): v is string => typeof v === "string"));
  return headers.filter((h) => h.trim() !== "" && !used.has(h));
}

export function validateMapping(headers: readonly string[], mapping: Mapping): string[] {
  const problems: string[] = [];
  const headerSet = new Set(headers);
  const seen = new Map<string, string>();
  for (const [field, header] of Object.entries(mapping)) {
    if (header === null || header === undefined) continue;
    if (!TARGET_KEYS.has(field)) { problems.push(`"${field}" is not a contact field.`); continue; }
    if (!headerSet.has(header)) { problems.push(`"${field}" is mapped to a column "${header}" that the file does not have.`); continue; }
    const already = seen.get(header);
    if (already) problems.push(`Column "${header}" is mapped to both "${already}" and "${field}". Pick one.`);
    else seen.set(header, field);
  }
  if (!mapping["name"]) problems.push(`"name" is required and is not mapped to any column.`);
  return problems;
}

// ── Value coercion ──────────────────────────────────────────────────────────

const STATUS_SET = new Set<string>(CRM_STATUSES);
const PRIORITY_SET = new Set<string>(CRM_PRIORITIES);
const SOURCE_SET = new Set<string>(CRM_SOURCES);

/**
 * Spellings older exports used, mapped onto the canonical lifecycle.
 *
 * These are conversions somebody decided once and wrote down, not guesses made
 * per row — and every application of one is reported in the row's `notices`.
 */
const LEGACY_STATUS: Record<string, string> = {
  "new": "New Inquiry",
  "contacted": "Follow-Up Needed",
  "follow-up": "Follow-Up Needed",
  "follow up": "Follow-Up Needed",
  "negotiating": "Qualified",
  "nurture": "On Hold",
  "customer": "Client",
  "closed won": "Won",
  "closed lost": "Lost",
};

function coerceEnum(
  raw: string, valid: Set<string>, legacy: Record<string, string> | null,
): { value: string | null; matched: "exact" | "case" | "legacy" | "none" } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, matched: "none" };
  if (valid.has(trimmed)) return { value: trimmed, matched: "exact" };
  const lower = trimmed.toLowerCase();
  const ci = [...valid].find((v) => v.toLowerCase() === lower);
  if (ci) return { value: ci, matched: "case" };
  if (legacy && legacy[lower]) return { value: legacy[lower], matched: "legacy" };
  return { value: null, matched: "none" };
}

export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function splitTags(raw: string): string[] {
  return raw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
}

// ── The plan ────────────────────────────────────────────────────────────────

export type RowAction = "create" | "update" | "skip" | "error";

export interface PlannedRow {
  /** 1-based row number as the operator sees it in a spreadsheet (header is 1). */
  rowNumber: number;
  action: RowAction;
  /** Machine-readable reason. Always present for skip and error. */
  reason: string | null;
  /** Human sentence for the reason, shown in the preview table. */
  explain: string;
  /** The matched existing contact, when there is one. */
  matchedLeadId: number | null;
  matchedOn: "email" | "phone" | null;
  /** Coerced values this row would write. */
  values: Record<string, unknown>;
  /** For `update`: field → { from, to }. Empty when nothing would change. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** Fatal, per row. */
  errors: string[];
  /** Non-fatal: a coercion that happened, stated rather than hidden. */
  notices: string[];
}

export interface ExistingContact {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  website: string | null;
  source: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  serviceInterest: string | null;
  packageType: string | null;
  tags: string[];
  estimatedValue: string | null;
  notes: string | null;
  nextFollowUpAt: Date | null;
}

export interface PlanOptions {
  /** When false, an existing contact is left alone and the row is skipped. */
  updateExisting: boolean;
  /**
   * `fill_blanks` (default) only writes fields the contact has left empty.
   * `overwrite` lets the file win on every mapped field.
   *
   * The default is the cautious one on purpose: a spreadsheet is usually older
   * and thinner than the CRM record it is being merged into, and an import that
   * quietly replaces a curated status with "New" is the classic way to lose a
   * week of pipeline work.
   */
  updateMode: "fill_blanks" | "overwrite";
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = { updateExisting: false, updateMode: "fill_blanks" };

export interface Plan {
  headers: string[];
  mapping: Mapping;
  options: PlanOptions;
  ignoredColumns: string[];
  rows: PlannedRow[];
  totals: Record<RowAction, number>;
  /** Stable over the same file + mapping + options + matched state. */
  hash: string;
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Turn a parsed file plus a confirmed mapping into a decided plan.
 *
 * `existingByEmail` / `existingByPhone` are supplied by the caller (the route
 * loads them in two queries), which keeps this function pure and directly
 * testable without a database.
 */
export function buildPlan(args: {
  rows: string[][];
  mapping: Mapping;
  options: PlanOptions;
  existingByEmail: Map<string, ExistingContact>;
  existingByPhone: Map<string, ExistingContact>;
}): Plan {
  const { rows, mapping, options, existingByEmail, existingByPhone } = args;
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const dataRows = rows.slice(1);

  const colIndex = new Map<string, number>();
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    const idx = headers.indexOf(header);
    if (idx >= 0) colIndex.set(field, idx);
  }

  const cell = (row: string[], field: string): string => {
    const idx = colIndex.get(field);
    if (idx === undefined) return "";
    return (row[idx] ?? "").trim();
  };

  // Keys already claimed by an EARLIER row of this same file. Two rows for one
  // person inside one upload is a property of the file, not of the CRM, and it
  // has to be caught here or the first row's insert makes the second row look
  // like a legitimate update of a contact that did not exist a second ago.
  const claimedEmail = new Map<string, number>();
  const claimedPhone = new Map<string, number>();

  const planned: PlannedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // header is spreadsheet row 1
    const errors: string[] = [];
    const notices: string[] = [];
    const values: Record<string, unknown> = {};

    const name = cell(row, "name");
    if (!name) errors.push("Name is required.");
    else values["name"] = name;

    const rawEmail = cell(row, "email");
    const email = normaliseEmail(rawEmail);
    if (rawEmail && !EMAIL_RE.test(email)) errors.push(`"${rawEmail}" is not a valid email address.`);

    const rawPhone = cell(row, "phone");
    const phoneKey = normalisePhoneKey(rawPhone);
    if (rawPhone && !phoneKey) notices.push(`Phone "${rawPhone}" has too few digits to match on; it is stored as given.`);
    if (rawPhone) values["phone"] = rawPhone;

    const hasUsableEmail = Boolean(email) && EMAIL_RE.test(email);
    if (!hasUsableEmail && !phoneKey && errors.length === 0) {
      errors.push("A contact needs an email address or a phone number — without one it cannot be matched to anybody, now or on a re-import.");
    }

    for (const field of ["company", "website", "assignedTo", "serviceInterest", "packageType"]) {
      const v = cell(row, field);
      if (v) values[field] = v;
    }

    const rawStatus = cell(row, "status");
    if (rawStatus) {
      const { value, matched } = coerceEnum(rawStatus, STATUS_SET, LEGACY_STATUS);
      if (value) {
        values["status"] = value;
        if (matched === "legacy") notices.push(`Status "${rawStatus}" recorded as "${value}".`);
        else if (matched === "case") notices.push(`Status "${rawStatus}" matched "${value}".`);
      } else {
        notices.push(`Status "${rawStatus}" is not a status this CRM uses; the contact is filed as "New Inquiry" and the original value is kept in the notes.`);
        values["status"] = "New Inquiry";
        values["__unmappedStatus"] = rawStatus;
      }
    }

    const rawPriority = cell(row, "priority");
    if (rawPriority) {
      const { value, matched } = coerceEnum(rawPriority, PRIORITY_SET, null);
      if (value) {
        values["priority"] = value;
        if (matched === "case") notices.push(`Priority "${rawPriority}" matched "${value}".`);
      } else {
        notices.push(`Priority "${rawPriority}" is not Low, Medium or High; recorded as Medium.`);
        values["priority"] = "Medium";
      }
    }

    const rawSource = cell(row, "source");
    if (rawSource) {
      const { value } = coerceEnum(rawSource, SOURCE_SET, null);
      if (value) values["source"] = value;
      else {
        notices.push(`Source "${rawSource}" is not one this CRM recognises; recorded as "CSV Import".`);
        values["source"] = "CSV Import";
        values["__unmappedSource"] = rawSource;
      }
    }

    const rawTags = cell(row, "tags");
    if (rawTags) values["tags"] = splitTags(rawTags);

    const rawValue = cell(row, "estimatedValue");
    if (rawValue) {
      const money = parseMoney(rawValue);
      if (money === null) errors.push(`Estimated value "${rawValue}" is not a number.`);
      else values["estimatedValue"] = money;
    }

    const rawNotes = cell(row, "notes");
    if (rawNotes) values["notes"] = rawNotes;

    const rawFollowUp = cell(row, "nextFollowUpAt");
    if (rawFollowUp) {
      const when = new Date(rawFollowUp);
      if (Number.isNaN(when.getTime())) errors.push(`Next follow-up "${rawFollowUp}" is not a date.`);
      else values["nextFollowUpAt"] = when.toISOString();
    }

    if (errors.length > 0) {
      planned.push({
        rowNumber, action: "error", reason: "invalid_row",
        explain: errors.join(" "),
        matchedLeadId: null, matchedOn: null, values, changes: {}, errors, notices,
      });
      continue;
    }

    values["email"] = hasUsableEmail ? email : syntheticEmailFor(phoneKey);
    if (!hasUsableEmail) {
      notices.push(`No email in this row. A placeholder derived from the phone number is stored so a re-import recognises this contact; it is not a deliverable address.`);
    }

    // ── Duplicate inside this same file ──────────────────────────────────────
    const fileEmailKey = hasUsableEmail ? email : "";
    if (fileEmailKey && claimedEmail.has(fileEmailKey)) {
      planned.push({
        rowNumber, action: "skip", reason: "duplicate_in_file",
        explain: `Row ${claimedEmail.get(fileEmailKey)} of this file already uses ${fileEmailKey}. Only the first row for a contact is applied.`,
        matchedLeadId: null, matchedOn: null, values, changes: {}, errors, notices,
      });
      continue;
    }
    if (!fileEmailKey && phoneKey && claimedPhone.has(phoneKey)) {
      planned.push({
        rowNumber, action: "skip", reason: "duplicate_in_file",
        explain: `Row ${claimedPhone.get(phoneKey)} of this file already uses this phone number. Only the first row for a contact is applied.`,
        matchedLeadId: null, matchedOn: null, values, changes: {}, errors, notices,
      });
      continue;
    }

    // ── Match against the existing book ──────────────────────────────────────
    let matched: ExistingContact | undefined;
    let matchedOn: "email" | "phone" | null = null;
    if (hasUsableEmail) {
      matched = existingByEmail.get(email);
      if (matched) matchedOn = "email";
    }
    if (!matched && phoneKey) {
      matched = existingByPhone.get(phoneKey);
      if (matched) matchedOn = "phone";
    }

    if (fileEmailKey) claimedEmail.set(fileEmailKey, rowNumber);
    if (phoneKey) claimedPhone.set(phoneKey, rowNumber);

    if (!matched) {
      planned.push({
        rowNumber, action: "create", reason: null,
        explain: "No existing contact matches this row.",
        matchedLeadId: null, matchedOn: null, values, changes: {}, errors, notices,
      });
      continue;
    }

    if (!options.updateExisting) {
      planned.push({
        rowNumber, action: "skip", reason: "already_exists",
        explain: `${matched.name} (#${matched.id}) already matches this row on ${matchedOn}. Turn on "update existing contacts" to apply the file's values.`,
        matchedLeadId: matched.id, matchedOn, values, changes: {}, errors, notices,
      });
      continue;
    }

    const changes = diffAgainst(matched, values, options.updateMode);
    if (Object.keys(changes).length === 0) {
      planned.push({
        rowNumber, action: "skip", reason: "no_change",
        explain: `${matched.name} (#${matched.id}) already holds everything this row provides.`,
        matchedLeadId: matched.id, matchedOn, values, changes: {}, errors, notices,
      });
      continue;
    }

    planned.push({
      rowNumber, action: "update", reason: null,
      explain: options.updateMode === "fill_blanks"
        ? `${matched.name} (#${matched.id}): ${Object.keys(changes).length} empty field(s) filled in. Nothing already recorded is replaced.`
        : `${matched.name} (#${matched.id}): ${Object.keys(changes).length} field(s) replaced by the file's values.`,
      matchedLeadId: matched.id, matchedOn, values, changes, errors, notices,
    });
  }

  const totals: Record<RowAction, number> = { create: 0, update: 0, skip: 0, error: 0 };
  for (const r of planned) totals[r.action]++;

  const plan: Omit<Plan, "hash"> = {
    headers,
    mapping,
    options,
    ignoredColumns: unmappedHeaders(headers, mapping),
    rows: planned,
    totals,
  };
  return { ...plan, hash: hashPlan(plan) };
}

/**
 * What an update would actually change.
 *
 * `fill_blanks` only proposes a change where the contact's field is empty, so
 * the CRM's own record always wins a disagreement. `tags` is a union in both
 * modes — an import that removes a tag somebody applied deliberately would be
 * destroying curation, and no mode of this importer does that.
 */
function diffAgainst(
  existing: ExistingContact, values: Record<string, unknown>, mode: PlanOptions["updateMode"],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const row = existing as unknown as Record<string, unknown>;

  for (const field of UPDATABLE_FIELDS) {
    if (!(field in values)) continue;
    const next = values[field];
    const current = row[field];

    if (field === "tags") {
      const currentTags = Array.isArray(current) ? current.map(String) : [];
      const incoming = Array.isArray(next) ? next.map(String) : [];
      const added = incoming.filter((t) => !currentTags.includes(t));
      if (added.length > 0) out[field] = { from: currentTags, to: [...currentTags, ...added] };
      continue;
    }

    if (field === "notes") {
      // Notes are appended, never replaced, so "is it blank" is the wrong
      // question — the only question is whether this text is already in there.
      const currentNotes = typeof current === "string" ? current : "";
      const incoming = String(next);
      if (!currentNotes.includes(incoming)) {
        out[field] = { from: currentNotes || null, to: incoming };
      }
      continue;
    }

    if (mode === "fill_blanks" && !isBlank(current)) continue;

    const a = current instanceof Date ? current.toISOString() : current;
    const b = next;
    const same = String(a ?? "") === String(b ?? "")
      || (typeof a === "string" && typeof b === "number" && Number.parseFloat(a) === b);
    if (!same) out[field] = { from: a ?? null, to: b };
  }
  return out;
}

/**
 * A fingerprint of the decided plan.
 *
 * The commit endpoint recomputes the plan from the file it is given and refuses
 * to proceed unless it hashes to the value the operator approved. That closes
 * the window between "I looked at the preview" and "I pressed import" — if the
 * file changed, or somebody else created one of the contacts in the meantime,
 * the operator is shown the new plan instead of silently getting a different
 * import from the one they read.
 */
export function hashPlan(plan: Omit<Plan, "hash">): string {
  const material = canonical({
    mapping: plan.mapping,
    options: plan.options,
    rows: plan.rows.map((r) => ({
      n: r.rowNumber, a: r.action, reason: r.reason,
      m: r.matchedLeadId, v: r.values, c: r.changes,
    })),
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}
