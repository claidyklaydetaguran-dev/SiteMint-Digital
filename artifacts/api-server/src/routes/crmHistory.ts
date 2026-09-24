// ── Unified customer history ────────────────────────────────────────────────
//
// Two routes over one merge (`lib/customerTimeline.ts`):
//
//   GET /crm/history/:leadId           everything staff may see
//   GET /crm/history/:leadId/customer  the customer-visible projection
//
// The second is not a different query. It is the SAME query with
// `visibility = 'customer'`, filtered a second time on the way out. A customer
// portal that reads it can therefore be wrong about a lot of things without
// ever being wrong about the one that matters.
//
// Paging is keyset. `?cursor=` names a position in the history, not an offset
// into it, so a message arriving between page 1 and page 2 cannot push an
// older entry past the boundary and out of the record.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, crmLeads, crmStaff } from "@workspace/db";
import { requireCrmAuth } from "../lib/staffAuth.js";
import { hasPermission, type Permission } from "../lib/staffPermissions.js";
import {
  fetchTimelinePage, customerVisibleOnly, decodeCursor,
  allowedSourcesFor, omittedSourcesFor,
  SOURCE_SPECS, TIMELINE_KINDS, TIMELINE_SORT, TIMELINE_SOURCES, TIMELINE_VISIBILITIES,
  type TimelineEntry, type TimelineKind, type TimelineSource, type TimelineVisibility,
} from "../lib/customerTimeline.js";

const router: IRouter = Router();

const MAX_PAGE = 200;
const DEFAULT_PAGE = 50;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pageLimit(v: unknown): number {
  const n = num(v);
  if (n === undefined) return DEFAULT_PAGE;
  return Math.max(1, Math.min(MAX_PAGE, Math.trunc(n)));
}

/** Comma-separated `?kind=` values, keeping only ones we actually have. */
function kindsFrom(v: unknown): TimelineKind[] | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const wanted = v.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = wanted.filter((k): k is TimelineKind =>
    (TIMELINE_KINDS as readonly string[]).includes(k));
  return valid.length ? valid : undefined;
}

function visibilityFrom(v: unknown): TimelineVisibility | undefined {
  return typeof v === "string" && (TIMELINE_VISIBILITIES as readonly string[]).includes(v)
    ? v as TimelineVisibility
    : undefined;
}

/**
 * What this caller may see.
 *
 * A signed-in person is measured against their own grants. The legacy shared
 * bearer has no person and no grants, and already had unrestricted access
 * before staff accounts existed — narrowing it here would break the CRM for
 * everyone still on it, so it keeps what it had. That is the status quo being
 * retired, not a new hole; the cutover is `CRM_LEGACY_BEARER_ENABLED=false`.
 */
function allowedFor(req: Request): Set<TimelineSource> {
  const staff = req.staffAuth?.staff;
  if (!staff) return new Set<TimelineSource>(TIMELINE_SOURCES);
  return allowedSourcesFor((p: Permission) => hasPermission(staff, p));
}

async function loadContact(leadId: number) {
  const [lead] = await db.select({
    id: crmLeads.id, name: crmLeads.name, email: crmLeads.email,
    company: crmLeads.company, status: crmLeads.status, createdAt: crmLeads.createdAt,
  }).from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  return lead;
}

/**
 * Names for the staff ids this page happens to mention.
 *
 * Loaded per page rather than per row, and never used to FILL IN a missing
 * author — only to put a current display name on an id the row already
 * recorded. An id with no matching account keeps the label captured at write
 * time and says the account is gone.
 */
async function staffNamesFor(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
    .from(crmStaff).where(inArray(crmStaff.id, unique));
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/**
 * Puts current display names on the staff ids a finished page mentions.
 *
 * Which ids appear is only knowable after the page is fetched, and fetching
 * the page twice to find out would be a query wasted. So the merge runs with
 * an empty name map — which makes every staff actor fall back to the label
 * captured at write time — and this pass upgrades the ones whose account still
 * exists. An id with no account keeps its captured label and its "this account
 * no longer exists" note, which is the truth about that row.
 *
 * It never touches an entry with no staff id. An unattributed row stays
 * unattributed no matter who is signed in.
 */
async function withStaffNames(entries: TimelineEntry[]): Promise<TimelineEntry[]> {
  const ids = entries.map((e) => e.actor.staffId).filter((v): v is number => v != null);
  const names = await staffNamesFor(ids);
  for (const e of entries) {
    if (e.actor.staffId == null) continue;
    const name = names.get(e.actor.staffId);
    if (name) { e.actor.label = name; e.actor.note = null; }
  }
  return entries;
}

// ── The staff view ──────────────────────────────────────────────────────────

/**
 * One contact's whole history, newest first.
 *
 * Query: `?limit=` `?cursor=` `?kind=communication,payment` `?visibility=internal`
 *
 * The response says which sources it read and which it did not, and why. A
 * timeline that is quietly short because the reader lacks `deals.read` is
 * indistinguishable from a contact who has no deals, and those two are not the
 * same fact.
 */
router.get("/crm/history/:leadId", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid contact." }); return; }

  const lead = await loadContact(leadId);
  if (!lead) { res.status(404).json({ error: "Not found." }); return; }

  const q = req.query as Record<string, unknown>;
  const rawCursor = q["cursor"];
  const cursor = decodeCursor(rawCursor);
  if (rawCursor !== undefined && rawCursor !== "" && !cursor) {
    res.status(400).json({ error: "That cursor is not one we issued. Start from the first page." });
    return;
  }

  const allowed = allowedFor(req);
  const page = await fetchTimelinePage({
    leadId,
    contactName: lead.name,
    limit: pageLimit(q["limit"]),
    cursor,
    kinds: kindsFrom(q["kind"]),
    visibility: visibilityFrom(q["visibility"]),
    allowedSources: allowed,
    staffNames: new Map(),
  });
  await withStaffNames(page.entries);

  const omitted = omittedSourcesFor(allowed);

  res.json({
    contact: lead,
    entries: page.entries,
    nextCursor: page.nextCursor,
    paging: {
      sortKey: "(occurred_at, source, id)",
      order: TIMELINE_SORT,
      returnedOnThisPage: page.entries.length,
      // Deliberately NOT a total. A total over a merged, growing history is a
      // second query that can disagree with the pages it labels; the cursor
      // being null is the honest end-of-history signal.
      totalNote: "No total is reported. Walk the cursor until nextCursor is null — that is the whole history, exactly once.",
    },
    filters: {
      kinds: TIMELINE_KINDS,
      visibilities: TIMELINE_VISIBILITIES,
      appliedKinds: kindsFrom(q["kind"]) ?? null,
      appliedVisibility: visibilityFrom(q["visibility"]) ?? null,
    },
    sources: {
      queried: page.sourcesQueried,
      omitted,
      note: omitted.length
        ? "Some sources were not read because this account does not hold the grant listed. This timeline is therefore incomplete, and says so rather than looking empty."
        : "Every source was read.",
    },
    definitions: {
      visibility: "Set per entry, never inferred. 'customer' means the customer already sent, received, attended or paid it; 'internal' is everything else, including every staff note and every internal support message.",
      actor: "Who did it. A staff id is the only thing that proves a person acted. A row whose author was never recorded — including the historical 'admin' default on crm_activities.created_by — is reported as unattributed and is not credited to anybody.",
      paging: TIMELINE_SORT,
    },
  });
});

// ── The customer-visible projection ─────────────────────────────────────────

/**
 * The same history, as a customer could be shown it.
 *
 * Two independent gates, and the redundancy is deliberate: the query filters
 * on `visibility = 'customer'`, and the result is filtered again here. One of
 * those being wrong is a bug; both being wrong in the same direction is the
 * thing this is built to make unlikely.
 *
 * Internal-only fields are dropped from the shape as well, so a caller that
 * ignores `visibility` altogether still cannot read a staff note out of a
 * field it was not looking at.
 */
router.get("/crm/history/:leadId/customer", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid contact." }); return; }

  const lead = await loadContact(leadId);
  if (!lead) { res.status(404).json({ error: "Not found." }); return; }

  const q = req.query as Record<string, unknown>;
  const rawCursor = q["cursor"];
  const cursor = decodeCursor(rawCursor);
  if (rawCursor !== undefined && rawCursor !== "" && !cursor) {
    res.status(400).json({ error: "That cursor is not one we issued. Start from the first page." });
    return;
  }

  const allowed = allowedFor(req);
  const page = await fetchTimelinePage({
    leadId,
    contactName: lead.name,
    limit: pageLimit(q["limit"]),
    cursor,
    kinds: kindsFrom(q["kind"]),
    visibility: "customer",
    allowedSources: allowed,
    staffNames: new Map(),
  });
  await withStaffNames(page.entries);

  const safe = customerVisibleOnly(page.entries);

  res.json({
    contact: { id: lead.id, name: lead.name, email: lead.email, company: lead.company },
    entries: safe.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      kind: e.kind,
      source: e.source,
      visibility: e.visibility,
      summary: e.summary,
      // A customer sees WHO, not our internal note about who. Staff members
      // appear by name; an unattributed row stays unattributed here too.
      actor: { kind: e.actor.kind, label: e.actor.label },
      ...(e.amount != null ? { amount: e.amount } : {}),
    })),
    nextCursor: page.nextCursor,
    guarantee: {
      rule: "Every entry here has visibility = 'customer'. Internal entries are excluded by the query AND filtered again after it, and the shape drops the internal-only fields (detail, status, record links, actor notes) entirely.",
      internalEntriesReturned: page.entries.length - safe.length,
      customerVisibleSources: SOURCE_SPECS
        .filter((s) => s.visibility === "customer" || s.visibility === null)
        .map((s) => ({ source: s.source, visibility: s.visibility ?? "per-row", definition: s.definition })),
    },
  });
});

/**
 * What the timeline is made of, as data.
 *
 * The reporting doc has to stay true, and the cheapest way to keep a document
 * honest is to let the system state the same facts itself.
 */
router.get("/crm/history-sources", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const allowed = allowedFor(req);
  res.json({
    sortKey: "(occurred_at, source, id)",
    order: TIMELINE_SORT,
    kinds: TIMELINE_KINDS,
    visibilities: TIMELINE_VISIBILITIES,
    sources: SOURCE_SPECS.map((s) => ({
      source: s.source,
      kind: s.kind,
      table: s.table,
      visibility: s.visibility ?? "per-row",
      requiresPermission: s.permission,
      visibleToYou: allowed.has(s.source),
      definition: s.definition,
    })),
  });
});

export default router;
