/**
 * M7 companies — the shapes the API returns, and the calls the two pages make.
 *
 * The pages stay about what a person sees; the request/response contract lives
 * here once, so the list, the record, the suggestions dialog and the contact
 * record cannot drift apart about what a company is.
 */
import { adminFetch } from "@/lib/adminFetch";

export interface CompanyOwner {
  id: number;
  displayName: string | null;
  email: string | null;
  status: string | null;
}

export interface Company {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  phone: string | null;
  industry: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  ownerStaffId: number | null;
  owner: CompanyOwner | null;
  createdBy?: { id: number; displayName: string | null } | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  peopleCount: number;
}

export interface CompanyPerson {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  assignedToStaffId: number | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  updatedAt: string;
}

export interface Summary<T> {
  basis: string;
  count: number;
  items: T[];
  truncated: boolean;
}

export interface CompanySummaries {
  deals: Summary<{ id: number; name: string; value: string; stage: string; leadId: number | null; leadName: string | null; updatedAt: string }>
    & { totals: { open: number; openValue: string; wonValue: string } };
  projects: Summary<{ id: number; name: string; stage: string; projectType: string | null; leadId: number | null; leadName: string | null; targetLaunchDate: string | null }>;
  supportTickets: Summary<{ id: number; subject: string; status: string; priority: string; reference: string; leadId: number | null; leadName: string | null; updatedAt: string }>
    & { all: number; openStatuses: string[] };
  quotes: Summary<{ id: number; title: string; status: string; total: string; currency: string; reference: string; leadId: number | null; leadName: string | null; createdAt: string }>;
  invoices: Summary<{ id: number; title: string; status: string; total: string; amountPaid: string; currency: string; reference: string; dueDate: string | null; leadId: number | null; leadName: string | null }>
    & { outstandingByCurrency: Array<{ currency: string; amount: string }>; paidByCurrency: Array<{ currency: string; amount: string }> };
  activities: Summary<{ id: number; type: string; title: string; description: string | null; createdAt: string; createdBy: string; leadId: number | null; leadName: string | null }>;
}

export interface SuggestionMatch { id: number; name: string; domain: string | null; archived: boolean }

export interface SuggestionGroup {
  key: string;
  kind: "company_name" | "email_domain";
  label: string;
  proposedName: string;
  proposedDomain: string | null;
  contacts: Array<{ id: number; name: string; email: string; company: string | null; status: string }>;
  matches: SuggestionMatch[];
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
  rules: Record<string, string>;
}

export interface DuplicateCandidate {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  peopleCount: number;
  matchedOn: Array<"name" | "domain">;
}

/** What a failed call gives a page to show. `candidates` is the duplicate warning. */
export interface CompanyRequestError {
  status: number;
  message: string;
  code?: string;
  field?: string;
  candidates?: DuplicateCandidate[];
  groupIndex?: number;
}

export class CompanyError extends Error implements CompanyRequestError {
  status: number;
  code?: string;
  field?: string;
  candidates?: DuplicateCandidate[];
  groupIndex?: number;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body["error"] === "string" ? body["error"] : "That could not be done.");
    this.name = "CompanyError";
    this.status = status;
    this.code = typeof body["code"] === "string" ? body["code"] : undefined;
    this.field = typeof body["field"] === "string" ? body["field"] : undefined;
    this.candidates = Array.isArray(body["candidates"]) ? body["candidates"] as DuplicateCandidate[] : undefined;
    this.groupIndex = typeof body["groupIndex"] === "number" ? body["groupIndex"] : undefined;
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await adminFetch(path, init?.body === undefined
    ? { method: init?.method ?? "GET" }
    : { method: init?.method ?? "POST", body: JSON.stringify(init.body) });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* not JSON */ }
  if (!res.ok) throw new CompanyError(res.status, body);
  return body as T;
}

export interface CompanyListQuery {
  search?: string;
  ownerStaffId?: number | "none" | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export function companyListPath(query: CompanyListQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.ownerStaffId === "none") params.set("ownerStaffId", "none");
  else if (typeof query.ownerStaffId === "number") params.set("ownerStaffId", String(query.ownerStaffId));
  if (query.includeArchived) params.set("includeArchived", "true");
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const qs = params.toString();
  return `/api/crm/companies${qs ? `?${qs}` : ""}`;
}

export const listCompanies = (query: CompanyListQuery) =>
  call<{ companies: Company[]; total: number; limit: number; offset: number; archivedCount: number }>(companyListPath(query));

export const getCompany = (id: number) =>
  call<{ company: Company; people: CompanyPerson[]; summaries: CompanySummaries }>(`/api/crm/companies/${id}`);

export const createCompany = (body: Record<string, unknown>) =>
  call<{ company: Company }>("/api/crm/companies", { method: "POST", body });

export const updateCompany = (id: number, body: Record<string, unknown>) =>
  call<{ company: Company; changed: string[] }>(`/api/crm/companies/${id}`, { method: "PATCH", body });

export const archiveCompany = (id: number) =>
  call<{ company: Company }>(`/api/crm/companies/${id}/archive`, { method: "POST", body: {} });

export const restoreCompany = (id: number) =>
  call<{ company: Company }>(`/api/crm/companies/${id}/restore`, { method: "POST", body: {} });

export const deleteCompany = (id: number) =>
  call<{ ok: true; note: string }>(`/api/crm/companies/${id}`, { method: "DELETE" });

export const getSuggestions = () => call<Suggestions>("/api/crm/companies/suggestions");

export interface ApplyGroupInput {
  action: "create" | "link";
  contactIds: number[];
  companyId?: number;
  company?: { name: string; domain?: string | null };
  confirmDuplicate?: boolean;
}

export interface ApplyResult {
  groupIndex: number;
  action: "create" | "link";
  company: { id: number; name: string } | null;
  created: boolean;
  linked: Array<{ id: number; name: string }>;
  skipped: Array<{ id: number; name: string; reason: "already_linked" | "merged"; companyId?: number | null }>;
  note: string | null;
}

export const applySuggestions = (groups: ApplyGroupInput[]) =>
  call<{ results: ApplyResult[]; totals: { companiesCreated: number; contactsLinked: number; contactsSkipped: number } }>(
    "/api/crm/companies/suggestions/apply", { method: "POST", body: { groups } });

/** Link or unlink one contact. `null` unlinks. */
export const setContactCompany = (leadId: number, companyId: number | null) =>
  call<{ lead: { id: number; companyId: number | null } }>(`/api/crm/leads/${leadId}`, {
    method: "PATCH", body: { companyId },
  });

// ── Display helpers ─────────────────────────────────────────────────────────

/**
 * A safe href for a website somebody typed.
 *
 * Only http and https ever become a link: a `javascript:` value in a field is
 * exactly how a stored value becomes a live script. The server refuses those on
 * the way in; this is the second half of the same rule, for rows that predate it.
 */
export function websiteHref(website: string | null | undefined): string | null {
  const value = (website ?? "").trim();
  if (!value) return null;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return null;
  return scheme ? value : `https://${value}`;
}

/** What to show for a website: the host, not the whole address. */
export function websiteLabel(website: string | null | undefined): string {
  const value = (website ?? "").trim();
  if (!value) return "";
  return value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** Money, with its currency, never added across currencies. */
export function money(amount: string | number | null | undefined, currency = "USD"): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return String(amount ?? "");
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function companyHref(id: number): string {
  return `/admin/crm/companies/${id}`;
}

/** A contact's company as it should read: the linked record, or the text on file. */
export function contactCompanyLabel(contact: { companyName?: string | null; company?: string | null }): {
  label: string;
  linked: boolean;
} {
  const linked = (contact.companyName ?? "").trim();
  if (linked) return { label: linked, linked: true };
  return { label: (contact.company ?? "").trim(), linked: false };
}
