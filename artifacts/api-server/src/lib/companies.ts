// ── M7: companies — the matching keys and the suggestion rules, stated once ──
//
// Everything here is pure: no database, no request. The routes in
// routes/crmCompanies.ts and the contact PATCH in routes/crm.ts call it, and
// companies.test.ts holds it to its word without a database.
//
// Why the keys are computed HERE rather than in SQL: `lower()` follows the
// database's locale while JavaScript's `toLowerCase()` follows Unicode, so a
// key computed on both sides can disagree about the same name on some installs
// (the same reason M6's owner key is stated in TypeScript). `normalized_name` is
// written by this module at write time and compared as an exact value; the
// suggestion groups are formed by this module too.

/** Longest accepted value per field, in characters. */
export const COMPANY_FIELD_LIMITS = {
  name: 200,
  website: 500,
  phone: 50,
  industry: 120,
  addressLine1: 200,
  addressLine2: 200,
  city: 120,
  region: 120,
  postalCode: 40,
  country: 120,
  notes: 10_000,
} as const;

/** Plain optional text fields, in the order the record shows them. */
export const COMPANY_TEXT_FIELDS = [
  "website", "phone", "industry", "addressLine1", "addressLine2",
  "city", "region", "postalCode", "country", "notes",
] as const;
export type CompanyTextField = (typeof COMPANY_TEXT_FIELDS)[number];

// ── The two matching keys ───────────────────────────────────────────────────

/**
 * A company name's comparison key: trimmed, internal whitespace collapsed to
 * one space, lower-cased. Nothing else — punctuation, accents and legal
 * suffixes ("Ltd", "Inc") are compared as written, because stripping them
 * invents matches ("A.C.M.E." is not obviously "ACME").
 */
export function normalizeCompanyName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A host name with at least one dot, made only of letters, digits and hyphens. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type DomainResult = { ok: true; domain: string | null } | { ok: false; error: string };

/**
 * A company's web domain: lower-case host, no scheme, no leading "www.", no
 * port, no path.
 *
 *   "https://www.Acme.com/about"  → "acme.com"
 *   "acme.com:8443"               → "acme.com"
 *   "sales@acme.com"              → "acme.com"   (an address pasted in)
 *   ""  / null / undefined        → null         (no domain)
 *
 * International names come back in their ASCII (punycode) form, which is what
 * an email address carries. An IP address, a bare word, and anything that is not
 * a host are refused with a sentence a person can act on.
 */
export function normalizeDomain(value: unknown): DomainResult {
  if (value === null || value === undefined) return { ok: true, domain: null };
  if (typeof value !== "string") return { ok: false, error: "The domain must be text, like acme.com." };
  const typed = value.trim();
  if (typed === "") return { ok: true, domain: null };
  if (typed.length > 2048) return { ok: false, error: "That domain is too long." };

  let raw = typed;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (!hasScheme && /^mailto:/i.test(raw)) raw = raw.slice("mailto:".length);
  // An email address typed into the domain field names its domain after the "@".
  if (!hasScheme && raw.includes("@") && !raw.includes("/")) raw = raw.slice(raw.lastIndexOf("@") + 1);

  let host: string;
  try {
    host = new URL(hasScheme ? raw : `http://${raw}`).hostname;
  } catch {
    return { ok: false, error: `"${typed}" is not a web domain. Enter it like acme.com.` };
  }
  host = host.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice("www.".length);

  if (host.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return { ok: false, error: "An IP address is not a company domain. Enter the name, like acme.com." };
  }
  if (!HOSTNAME.test(host)) {
    return { ok: false, error: `"${typed}" is not a web domain. Enter it like acme.com.` };
  }
  return { ok: true, domain: host };
}

/** The domain of a website address, when it has a usable one; otherwise null. */
export function domainFromWebsite(website: unknown): string | null {
  const result = normalizeDomain(website);
  return result.ok ? result.domain : null;
}

/**
 * A website is stored as typed, but only an http(s) address — or a bare host,
 * which the UI opens as https — is accepted. A `javascript:` or `data:` value
 * would become a live link on the company record.
 */
export function websiteProblem(website: string): string | null {
  const scheme = website.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https" && !/^[a-z0-9.-]+:\d+/i.test(website)) {
    return "The website must be a web address starting with http:// or https://, or just the domain.";
  }
  return null;
}

// ── Email domains, and the providers that say nothing about an employer ─────

/** Consumer mailbox providers, matched exactly. */
export const FREE_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "live.com", "icloud.com",
  "me.com", "aol.com", "proton.me", "protonmail.com", "zoho.com", "mail.com",
] as const;

/**
 * Providers excluded under every country domain they operate
 * (yahoo.com, yahoo.co.uk, hotmail.fr, gmx.de, yandex.ru …): the first label
 * is the provider.
 */
export const FREE_MAIL_FAMILIES = ["yahoo", "hotmail", "gmx", "yandex"] as const;

export function isFreeMailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if ((FREE_MAIL_DOMAINS as readonly string[]).includes(d)) return true;
  const labels = d.split(".");
  return labels.length >= 2 && (FREE_MAIL_FAMILIES as readonly string[]).includes(labels[0]);
}

/**
 * Addresses the CRM minted itself rather than received: an import derives
 * `phone-…@import.invalid` for a row with only a phone number (older imports
 * used `@imported.local`). They name no employer.
 */
export function isPlaceholderEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  return d === "invalid" || d.endsWith(".invalid") || d === "imported.local";
}

/** The lower-cased domain of an email address, or null when it has no usable one. */
export function emailDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return HOSTNAME.test(d) ? d : null;
}

// ── Input parsing ───────────────────────────────────────────────────────────

/** Escapes LIKE wildcards, so a search for "50%_off" means exactly that text. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** A positive integer id from a JSON number or a digit string; null when it is not one. */
export function positiveId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

export type CompanyIdChange =
  | { kind: "absent" }
  | { kind: "set"; companyId: number | null }
  | { kind: "invalid"; error: string };

/**
 * `companyId` on a contact update: absent (no change), null or "" (unlink), or a
 * positive integer (link). Anything else is refused rather than coerced — a
 * `companyId: "acme"` must not quietly unlink somebody.
 */
export function readCompanyIdChange(body: Record<string, unknown>): CompanyIdChange {
  if (!Object.prototype.hasOwnProperty.call(body, "companyId") || body["companyId"] === undefined) {
    return { kind: "absent" };
  }
  const raw = body["companyId"];
  if (raw === null || raw === "") return { kind: "set", companyId: null };
  const id = positiveId(raw);
  if (id === null) return { kind: "invalid", error: "companyId must be a company's id, or null to unlink the contact." };
  return { kind: "set", companyId: id };
}

/** The columns a create or update may write. */
export interface CompanyValues {
  name?: string;
  normalizedName?: string;
  domain?: string | null;
  website?: string | null;
  phone?: string | null;
  industry?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
  ownerStaffId?: number | null;
}

export type ParsedCompany =
  | { ok: true; values: CompanyValues; changed: string[] }
  | { ok: false; field: string; error: string };

const FIELD_LABEL: Record<string, string> = {
  name: "Name", website: "Website", phone: "Phone", industry: "Industry",
  addressLine1: "Address line 1", addressLine2: "Address line 2", city: "City",
  region: "State or region", postalCode: "Postal code", country: "Country", notes: "Notes",
};

/**
 * Validate a create (`mode: "create"`) or a partial update (`mode: "update"`).
 *
 * Keys that are absent are left alone on an update; `null` or blank text clears
 * an optional field. Unknown keys are ignored. The domain rule, stated once:
 *
 *   - a domain that is given is normalised, and a blank one clears it;
 *   - when no domain is given, a website that is given supplies it — on a
 *     create always, on an update only while the company has no domain, so
 *     editing the website never silently rewrites a domain somebody recorded.
 *
 * The owner id is checked for shape only; whether that person exists and may
 * take new work is the route's question, because it needs the database.
 */
export function parseCompanyInput(
  body: Record<string, unknown>,
  mode: "create" | "update",
  existing?: { domain: string | null },
): ParsedCompany {
  const values: CompanyValues = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;

  if (mode === "create" || has("name")) {
    const raw = body["name"];
    if (typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, field: "name", error: "A company needs a name." };
    }
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length > COMPANY_FIELD_LIMITS.name) {
      return { ok: false, field: "name", error: `Name must be ${COMPANY_FIELD_LIMITS.name} characters or fewer.` };
    }
    values.name = name;
    values.normalizedName = normalizeCompanyName(name);
  }

  for (const field of COMPANY_TEXT_FIELDS) {
    if (!has(field)) continue;
    const raw = body[field];
    if (raw === null) { values[field] = null; continue; }
    if (typeof raw !== "string") return { ok: false, field, error: `${FIELD_LABEL[field]} must be text.` };
    const text = raw.trim();
    if (text.length > COMPANY_FIELD_LIMITS[field]) {
      return { ok: false, field, error: `${FIELD_LABEL[field]} must be ${COMPANY_FIELD_LIMITS[field]} characters or fewer.` };
    }
    values[field] = text === "" ? null : text;
  }

  if (typeof values.website === "string") {
    const problem = websiteProblem(values.website);
    if (problem) return { ok: false, field: "website", error: problem };
  }

  if (has("domain")) {
    const result = normalizeDomain(body["domain"]);
    if (!result.ok) return { ok: false, field: "domain", error: result.error };
    values.domain = result.domain;
  }
  const domainGiven = has("domain") && values.domain !== null;
  if (!domainGiven && typeof values.website === "string") {
    const derived = domainFromWebsite(values.website);
    const mayDerive = mode === "create" ? !has("domain") || values.domain === null : !has("domain") && !existing?.domain;
    if (derived && mayDerive) values.domain = derived;
  }

  if (has("ownerStaffId")) {
    const raw = body["ownerStaffId"];
    if (raw === null || raw === "") values.ownerStaffId = null;
    else {
      const id = positiveId(raw);
      if (id === null) return { ok: false, field: "ownerStaffId", error: "Choose the person who looks after this company." };
      values.ownerStaffId = id;
    }
  }

  const changed = Object.keys(values).filter((k) => k !== "normalizedName");
  return { ok: true, values, changed };
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export interface SuggestionContact {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  status: string;
}

export interface CompanyRef {
  id: number;
  name: string;
  normalizedName: string;
  domain: string | null;
  archivedAt: Date | string | null;
}

export interface SuggestionMatch {
  id: number;
  name: string;
  domain: string | null;
  archived: boolean;
}

export interface SuggestionGroup {
  /** `company_name:<normalized text>` or `email_domain:<domain>` — stable across reloads. */
  key: string;
  kind: "company_name" | "email_domain";
  /** What the group is: the most common spelling of the company text, or the domain. */
  label: string;
  /** A name to propose if a person chooses to create a company for this group. */
  proposedName: string;
  /** A domain to propose with it, when the group has one. */
  proposedDomain: string | null;
  contacts: SuggestionContact[];
  /** Existing companies this group matches — by normalised name, or by domain. */
  matches: SuggestionMatch[];
  /** True when a matching company exists that is not archived, so linking is possible. */
  companyExists: boolean;
}

export interface Suggestions {
  byCompanyName: SuggestionGroup[];
  byEmailDomain: SuggestionGroup[];
  counts: {
    unlinkedContacts: number;
    withCompanyText: number;
    withWorkEmailDomain: number;
    freeMailExcluded: number;
    placeholderExcluded: number;
  };
  truncated: { byCompanyName: boolean; byEmailDomain: boolean };
}

function byCountThenLabel(a: SuggestionGroup, b: SuggestionGroup): number {
  return b.contacts.length - a.contacts.length || a.label.localeCompare(b.label, "en") || a.key.localeCompare(b.key, "en");
}

function matchesFor(companies: CompanyRef[], predicate: (c: CompanyRef) => boolean): SuggestionMatch[] {
  return companies
    .filter(predicate)
    .map((c) => ({ id: c.id, name: c.name, domain: c.domain, archived: c.archivedAt !== null }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.id - b.id);
}

/** "acme.com" → "Acme" — only ever a proposal a person can edit. */
function nameFromDomain(domain: string): string {
  const first = domain.split(".")[0] ?? domain;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Group contacts that are NOT linked to a company, two independent ways.
 *
 * The caller passes only unlinked, non-merged contacts; this function does not
 * re-check, so the caller's query is the one place that rule lives. A contact
 * can appear in both lists — by its company text and by its email domain — and
 * applying both is safe: the second finds it already linked and says so.
 *
 *   byCompanyName  normalised `crm_leads.company`. Blank text is not a group.
 *   byEmailDomain  the email's domain, excluding the free-mail providers and the
 *                  placeholder addresses an import mints.
 *
 * A group of one is still a suggestion: a single contact at "Acme Ltd" is
 * exactly the record that should become a company.
 */
export function buildCompanySuggestions(
  contacts: SuggestionContact[],
  companies: CompanyRef[],
  maxGroups = 200,
): Suggestions {
  const nameGroups = new Map<string, SuggestionContact[]>();
  const domainGroups = new Map<string, SuggestionContact[]>();
  let freeMailExcluded = 0;
  let placeholderExcluded = 0;
  let withCompanyText = 0;
  let withWorkEmailDomain = 0;

  const ordered = [...contacts].sort((a, b) => a.id - b.id);
  for (const contact of ordered) {
    const key = normalizeCompanyName(contact.company);
    if (key) {
      withCompanyText++;
      nameGroups.set(key, [...(nameGroups.get(key) ?? []), contact]);
    }
    const domain = emailDomain(contact.email);
    if (!domain) continue;
    if (isPlaceholderEmailDomain(domain)) { placeholderExcluded++; continue; }
    if (isFreeMailDomain(domain)) { freeMailExcluded++; continue; }
    withWorkEmailDomain++;
    domainGroups.set(domain, [...(domainGroups.get(domain) ?? []), contact]);
  }

  const sortContacts = (list: SuggestionContact[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id);

  const byCompanyName: SuggestionGroup[] = [...nameGroups.entries()].map(([key, members]) => {
    // The most common spelling, as people typed it (whitespace tidied); on a
    // tie, the earliest contact's spelling.
    const spellings = new Map<string, number>();
    for (const m of members) {
      const s = String(m.company).trim().replace(/\s+/g, " ");
      spellings.set(s, (spellings.get(s) ?? 0) + 1);
    }
    const label = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const domains = new Set(members.map((m) => emailDomain(m.email)).filter((d): d is string =>
      !!d && !isFreeMailDomain(d) && !isPlaceholderEmailDomain(d)));
    const matches = matchesFor(companies, (c) => c.normalizedName === key);
    return {
      key: `company_name:${key}`,
      kind: "company_name" as const,
      label,
      proposedName: label,
      proposedDomain: domains.size === 1 ? [...domains][0] : null,
      contacts: sortContacts(members),
      matches,
      companyExists: matches.some((m) => !m.archived),
    };
  }).sort(byCountThenLabel);

  const byEmailDomain: SuggestionGroup[] = [...domainGroups.entries()].map(([domain, members]) => {
    const texts = new Map<string, number>();
    for (const m of members) {
      const s = typeof m.company === "string" ? m.company.trim().replace(/\s+/g, " ") : "";
      if (s) texts.set(s, (texts.get(s) ?? 0) + 1);
    }
    const commonText = [...texts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const matches = matchesFor(companies, (c) => c.domain === domain);
    return {
      key: `email_domain:${domain}`,
      kind: "email_domain" as const,
      label: domain,
      proposedName: commonText ?? nameFromDomain(domain),
      proposedDomain: domain,
      contacts: sortContacts(members),
      matches,
      companyExists: matches.some((m) => !m.archived),
    };
  }).sort(byCountThenLabel);

  return {
    byCompanyName: byCompanyName.slice(0, maxGroups),
    byEmailDomain: byEmailDomain.slice(0, maxGroups),
    counts: {
      unlinkedContacts: contacts.length,
      withCompanyText,
      withWorkEmailDomain,
      freeMailExcluded,
      placeholderExcluded,
    },
    truncated: {
      byCompanyName: byCompanyName.length > maxGroups,
      byEmailDomain: byEmailDomain.length > maxGroups,
    },
  };
}

// ── Applying chosen suggestions ─────────────────────────────────────────────

export const MAX_APPLY_GROUPS = 100;
export const MAX_CONTACTS_PER_GROUP = 500;

export type ApplyGroup =
  | { action: "create"; contactIds: number[]; company: CompanyValues & { name: string; normalizedName: string }; confirmDuplicate: boolean }
  | { action: "link"; contactIds: number[]; companyId: number };

export type ParsedApply =
  | { ok: true; groups: ApplyGroup[] }
  | { ok: false; error: string; groupIndex?: number; field?: string };

/**
 * Validate the whole request before anything is written. Every group names the
 * contacts to link explicitly — there is no "the rest of the suggestion" — so
 * the route can only ever link a contact the caller listed.
 */
export function parseApplyRequest(body: unknown): ParsedApply {
  const groupsRaw = (body as { groups?: unknown } | null)?.groups;
  if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
    return { ok: false, error: "Choose at least one suggestion to apply." };
  }
  if (groupsRaw.length > MAX_APPLY_GROUPS) {
    return { ok: false, error: `Apply at most ${MAX_APPLY_GROUPS} suggestions at a time.` };
  }

  const groups: ApplyGroup[] = [];
  for (let i = 0; i < groupsRaw.length; i++) {
    const g = groupsRaw[i] as Record<string, unknown> | null;
    if (!g || typeof g !== "object") return { ok: false, groupIndex: i, error: `Suggestion ${i + 1} is not readable.` };

    const idsRaw = g["contactIds"];
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return { ok: false, groupIndex: i, field: "contactIds", error: `Suggestion ${i + 1} lists no contacts.` };
    }
    if (idsRaw.length > MAX_CONTACTS_PER_GROUP) {
      return { ok: false, groupIndex: i, field: "contactIds", error: `Suggestion ${i + 1} lists more than ${MAX_CONTACTS_PER_GROUP} contacts.` };
    }
    const ids: number[] = [];
    for (const raw of idsRaw) {
      const id = positiveId(raw);
      if (id === null) return { ok: false, groupIndex: i, field: "contactIds", error: `Suggestion ${i + 1} lists a contact id that is not a number.` };
      if (!ids.includes(id)) ids.push(id);
    }

    if (g["action"] === "link") {
      const companyId = positiveId(g["companyId"]);
      if (companyId === null) return { ok: false, groupIndex: i, field: "companyId", error: `Suggestion ${i + 1}: choose the company to link these contacts to.` };
      groups.push({ action: "link", contactIds: ids, companyId });
    } else if (g["action"] === "create") {
      const parsed = parseCompanyInput((g["company"] ?? {}) as Record<string, unknown>, "create");
      if (!parsed.ok) return { ok: false, groupIndex: i, field: parsed.field, error: `Suggestion ${i + 1}: ${parsed.error}` };
      const { name, normalizedName } = parsed.values;
      groups.push({
        action: "create",
        contactIds: ids,
        company: { ...parsed.values, name: name as string, normalizedName: normalizedName as string },
        confirmDuplicate: g["confirmDuplicate"] === true,
      });
    } else {
      return { ok: false, groupIndex: i, field: "action", error: `Suggestion ${i + 1}: say whether to create a company or link to an existing one.` };
    }
  }
  return { ok: true, groups };
}
