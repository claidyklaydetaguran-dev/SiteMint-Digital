// ── One customer's history, merged ──────────────────────────────────────────
//
// The CRM held a contact's history in four separate streams — the activity
// log, the message thread, the task list, and whatever the sales chain knew —
// and none of them could see the others. "What has actually happened with this
// client" therefore had no answer: you opened four screens and did the merge in
// your head, and whichever screen you forgot was the part you did not know.
//
// This module is that merge, done once, in the database, with three properties
// the four streams never had:
//
//  1. ONE order. Every entry carries an absolute `occurred_at`, and the sort
//     key is `(occurred_at, source, id)` — total, and immutable per entry.
//  2. Keyset paging, not offset. A contact's history grows while you read it.
//     Offset paging over a growing set re-reads the same rows and skips the
//     ones that slid past the boundary; a keyset cursor cannot, because it
//     names a POSITION rather than a count. See `TIMELINE_SORT` below.
//  3. An explicit `visibility` on every entry. Not a convention, not "notes
//     are probably internal" — a field, set per source, that a customer-facing
//     projection filters on. The cost of getting that wrong is a client
//     reading a private staff note, so it is stated rather than inferred.
//
// And one rule that runs through all of it: NEVER INVENT AN ACTOR. Most of
// this history predates staff accounts. `crm_activities.created_by` has a
// column default of the literal string `'admin'`, so thousands of rows claim
// an author that never existed; `crm_messages.sent_by_staff_id` is null for
// every row written before attribution. Those are shown as unattributed and
// said to be unattributed. Crediting them to whoever is signed in today, or to
// "Admin", would be the system telling a confident lie about who did what.

import { sql, type SQL } from "drizzle-orm";
import { db, TRANSACTION_RECEIVED_STATUS } from "@workspace/db";
import type { Permission } from "./staffPermissions.js";

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * What kind of thing an entry is. Coarse, because this is what somebody
 * filters by when they are looking for "the money" or "what we said to them".
 */
export const TIMELINE_KINDS = [
  "communication", "note", "meeting", "document",
  "deal", "project", "payment", "support", "task",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/**
 * Who may ever see an entry.
 *
 *   customer  the customer already sent, received or attended this
 *   internal  staff only — it must never reach a customer-facing surface
 *
 * There is deliberately no default and no third value. A future customer
 * portal filters on exactly this.
 */
export const TIMELINE_VISIBILITIES = ["internal", "customer"] as const;
export type TimelineVisibility = (typeof TIMELINE_VISIBILITIES)[number];

/**
 * Every distinct EVENT, not every table.
 *
 * One row can be several events — a deal is opened, won, and converted — and
 * each of those is its own source. That is not cosmetic: it is what makes
 * `(occurred_at, source, id)` unique. If `deal_won` and `deal_converted` both
 * called themselves `deal`, one deal row could produce two entries with the
 * same sort key, and a cursor landing between them would drop one.
 */
export const TIMELINE_SOURCES = [
  "message",
  "conversation_resolved",
  "activity",
  "comment",
  "task_created",
  "task_completed",
  "appointment_scheduled",
  "appointment_completed",
  "appointment_cancelled",
  "document_requested",
  "document_received",
  "document_uploaded",
  "deal_opened",
  "deal_won",
  "deal_lost",
  "deal_converted",
  "project_started",
  "project_update",
  "payment_recorded",
  "payment_received",
  "ticket_opened",
  "ticket_resolved",
  "support_message",
] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

/** The sort key, written down once so the API and the docs cannot drift. */
export const TIMELINE_SORT =
  "occurred_at DESC, source DESC, id DESC — newest first. Every part is "
  + "immutable once the entry exists, so a cursor names a position in a "
  + "growing history rather than a count into it: new events arriving while "
  + "you page cannot shift, skip or repeat the older ones.";

// ── Actors ──────────────────────────────────────────────────────────────────

export type TimelineActorKind = "staff" | "customer" | "system" | "unattributed";

export interface TimelineActor {
  kind: TimelineActorKind;
  staffId: number | null;
  label: string;
  /** Said out loud when the label is not a person we can vouch for. */
  note: string | null;
}

/**
 * Author labels that are not authors.
 *
 * These are the literals written by the shared-password era, when every action
 * in the CRM was recorded as "admin" because there was exactly one credential
 * and no people. `crm_activities.created_by` and `crm_tasks.created_by` still
 * carry `DEFAULT 'admin'`, so new rows written by a code path that forgets to
 * pass an author land here too — which is precisely why matching on the value
 * is better than trusting the column to be empty.
 */
const PLACEHOLDER_AUTHOR_LABELS = new Set([
  "admin", "administrator", "system admin", "legacy-shared-bearer",
  "unknown", "n/a", "-", "",
]);

export const UNATTRIBUTED_LABEL = "Unattributed";
export const UNATTRIBUTED_NOTE =
  "No author was recorded on this row. It predates staff accounts, or was "
  + "written by a path that did not say who was acting. It is deliberately not "
  + "credited to anybody.";

export function isPlaceholderAuthor(label: string | null | undefined): boolean {
  if (label == null) return true;
  return PLACEHOLDER_AUTHOR_LABELS.has(label.trim().toLowerCase());
}

/**
 * Turns whatever a row happens to record into an honest actor.
 *
 * The order matters. A staff id is the only thing that proves a person acted,
 * so it wins; a free-text label is second-best and is marked as such; a
 * placeholder label is treated as no label at all.
 */
export function resolveActor(args: {
  origin: string | null;
  staffId: number | null;
  label: string | null;
  staffNames: ReadonlyMap<number, string>;
  contactName: string | null;
}): TimelineActor {
  const { origin, staffId, label, staffNames, contactName } = args;

  if (origin === "inbound" || origin === "customer") {
    return { kind: "customer", staffId: null, label: contactName ?? "The customer", note: null };
  }
  if (origin === "automated" || origin === "system") {
    return {
      kind: "system", staffId: null, label: "Automated",
      note: "Sent by the system, not by a person.",
    };
  }

  if (staffId != null) {
    const known = staffNames.get(staffId);
    if (known) return { kind: "staff", staffId, label: known, note: null };
    const captured = !isPlaceholderAuthor(label) ? label!.trim() : null;
    return {
      kind: "staff", staffId,
      label: captured ?? `Staff #${staffId}`,
      note: "This staff account no longer exists. The name shown was captured when the record was written.",
    };
  }

  if (!isPlaceholderAuthor(label)) {
    return {
      kind: "staff", staffId: null, label: label!.trim(),
      note: "Recorded by name only — this predates staff accounts, so it is not linked to one.",
    };
  }

  return { kind: "unattributed", staffId: null, label: UNATTRIBUTED_LABEL, note: UNATTRIBUTED_NOTE };
}

// ── Entries ─────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  /** Stable identity for this entry across pages: `<source>:<id>`. */
  id: string;
  occurredAt: string;
  source: TimelineSource;
  kind: TimelineKind;
  visibility: TimelineVisibility;
  /** One line a person can read without opening anything. */
  summary: string;
  /** The body, quote, or note behind the summary. Null when there is none. */
  detail: string | null;
  actor: TimelineActor;
  /** Where the underlying record lives, so the entry is followable. */
  record: { type: string; id: number; href: string };
  /** Only the extras that source actually has. */
  channel?: string | null;
  direction?: string | null;
  status?: string | null;
  amount?: number | null;
}

// ── Cursors ─────────────────────────────────────────────────────────────────

export interface TimelineCursor { t: string; r: number; i: number }

export function encodeCursor(c: TimelineCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/** Undefined for anything that is not a cursor we wrote. Never throws. */
export function decodeCursor(raw: unknown): TimelineCursor | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const { t, r, i } = parsed as Record<string, unknown>;
    if (typeof t !== "string" || typeof r !== "number" || typeof i !== "number") return undefined;
    if (Number.isNaN(Date.parse(t))) return undefined;
    return { t, r, i };
  } catch { return undefined; }
}

// ── Source specifications ───────────────────────────────────────────────────
//
// Everything the merge needs to know about one source, in one place: where it
// comes from, what kind it is, who may see it, and which grant it sits behind.
//
// `visibility` is a constant for all but two sources, and the constants are
// chosen by one rule, stated here because it is the rule a reviewer should
// argue with rather than guess at:
//
//   An entry is `customer` only when the customer already sent it, received
//   it, attended it, or paid it. EVERYTHING ELSE IS INTERNAL.
//
// That is deliberately lopsided. A wrongly-internal entry means a customer
// portal shows less than it could; a wrongly-customer entry means private
// commentary about a client reaches that client. Those two mistakes are not
// worth the same, so the doubt resolves one way.

interface SourceSpec {
  source: TimelineSource;
  /** Position in the sort key. Fixed forever — a cursor encodes it. */
  rank: number;
  kind: TimelineKind;
  /** Null when the row itself decides (a column, not a convention). */
  visibility: TimelineVisibility | null;
  /** The grant a signed-in person needs before this source is even queried. */
  permission: Permission;
  table: string;
  /** What the figure is, for the traceability doc and the API's own answer. */
  definition: string;
}

const NULL_TEXT = sql`NULL::text`;
const NULL_INT = sql`NULL::int`;

/**
 * Builds one branch of the union with a fixed column list.
 *
 * Every branch must project the same 16 columns in the same order and with the
 * same types, or PostgreSQL refuses the union — which is a feature: a new
 * source cannot be added carelessly.
 */
function branch(spec: {
  source: TimelineSource; rank: number;
  occurredAt: SQL; sourceId: SQL; visibility: SQL;
  entityType: string; entityId: SQL;
  actorOrigin: SQL; actorStaffId: SQL; actorLabel: SQL;
  title: SQL; body: SQL; status: SQL; channel: SQL; direction: SQL; amount: SQL;
  from: SQL; where: SQL;
}): SQL {
  return sql`SELECT
    ${spec.occurredAt} AS occurred_at,
    ${spec.source}::text AS source,
    ${spec.rank}::int AS source_rank,
    ${spec.sourceId} AS source_id,
    ${spec.visibility} AS visibility,
    ${spec.entityType}::text AS entity_type,
    ${spec.entityId} AS entity_id,
    ${spec.actorOrigin} AS actor_origin,
    ${spec.actorStaffId} AS actor_staff_id,
    ${spec.actorLabel} AS actor_label,
    ${spec.title} AS title,
    ${spec.body} AS body,
    ${spec.status} AS status,
    ${spec.channel} AS channel,
    ${spec.direction} AS direction,
    ${spec.amount} AS amount
  FROM ${spec.from}
  WHERE ${spec.where}`;
}

/**
 * The scope CTE: which deals, projects and tickets belong to this contact.
 *
 * Several tables (`crm_comments`, `crm_attachments`, `crm_document_requests`)
 * are entity-generic, so a note on this contact's deal is part of this
 * contact's history even though the row never names the contact.
 */
function scopeCte(leadId: number): SQL {
  return sql`
    WITH scoped_deals AS (SELECT id FROM crm_deals WHERE lead_id = ${leadId}),
         scoped_projects AS (SELECT id FROM crm_projects WHERE lead_id = ${leadId}),
         scoped_tickets AS (SELECT id FROM crm_support_tickets WHERE lead_id = ${leadId}),
         scoped_conversations AS (SELECT id FROM crm_conversations WHERE contact_id = ${leadId})`;
}

/** The entity-generic membership predicate, used by three tables. */
function entityScope(alias: string, leadId: number): SQL {
  const a = sql.raw(alias);
  return sql`(
    (${a}.entity_type = 'lead' AND ${a}.entity_id = ${leadId})
    OR (${a}.entity_type = 'deal' AND ${a}.entity_id IN (SELECT id FROM scoped_deals))
    OR (${a}.entity_type = 'project' AND ${a}.entity_id IN (SELECT id FROM scoped_projects))
    OR (${a}.entity_type = 'ticket' AND ${a}.entity_id IN (SELECT id FROM scoped_tickets))
  )`;
}

export const SOURCE_SPECS: readonly SourceSpec[] = [
  {
    source: "message", rank: 10, kind: "communication", visibility: "customer",
    permission: "communications.read", table: "crm_messages",
    definition: "Every SMS, call record and email on this contact's threads, inbound and outbound.",
  },
  {
    source: "conversation_resolved", rank: 20, kind: "communication", visibility: "internal",
    permission: "communications.read", table: "crm_conversations",
    definition: "A conversation marked resolved by a staff member. Internal: it is a handling decision, not something the customer was told.",
  },
  {
    source: "activity", rank: 30, kind: "note", visibility: "internal",
    permission: "leads.read", table: "crm_activities",
    definition: "The lead activity log — notes, status changes, field edits. Internal by definition: it is the office's own running commentary.",
  },
  {
    source: "comment", rank: 40, kind: "note", visibility: null,
    permission: "leads.read", table: "crm_comments",
    definition: "Comments on this contact or on their deals, projects and tickets. Visibility comes from the row's own is_internal column.",
  },
  {
    source: "task_created", rank: 50, kind: "task", visibility: "internal",
    permission: "leads.read", table: "crm_tasks",
    definition: "A task raised against this contact. Internal: our work queue is not the customer's business.",
  },
  {
    source: "task_completed", rank: 55, kind: "task", visibility: "internal",
    permission: "leads.read", table: "crm_tasks",
    definition: "A task against this contact marked done.",
  },
  {
    source: "appointment_scheduled", rank: 60, kind: "meeting", visibility: "customer",
    permission: "leads.read", table: "crm_appointments",
    definition: "A meeting booked with this contact. Customer-visible: they were invited to it.",
  },
  {
    source: "appointment_completed", rank: 62, kind: "meeting", visibility: "customer",
    permission: "leads.read", table: "crm_appointments",
    definition: "A meeting with this contact that took place.",
  },
  {
    source: "appointment_cancelled", rank: 64, kind: "meeting", visibility: "customer",
    permission: "leads.read", table: "crm_appointments",
    definition: "A meeting with this contact that was cancelled. The cancellation reason is staff text and is NOT carried into the customer projection.",
  },
  {
    source: "document_requested", rank: 70, kind: "document", visibility: "customer",
    permission: "documents.read", table: "crm_document_requests",
    definition: "A document we asked this contact for. Customer-visible: the request was addressed to them.",
  },
  {
    source: "document_received", rank: 72, kind: "document", visibility: "customer",
    permission: "documents.read", table: "crm_document_requests",
    definition: "A requested document arriving.",
  },
  {
    source: "document_uploaded", rank: 74, kind: "document", visibility: "internal",
    permission: "documents.read", table: "crm_attachments",
    definition: "A file attached to this contact or their records. Internal unless it was explicitly shared — and nothing here proves it was, so it is internal.",
  },
  {
    source: "deal_opened", rank: 80, kind: "deal", visibility: "internal",
    permission: "deals.read", table: "crm_deals",
    definition: "A deal raised for this contact. Internal: pipeline values and likelihoods are commercial working notes.",
  },
  {
    source: "deal_won", rank: 82, kind: "deal", visibility: "internal",
    permission: "deals.read", table: "crm_deals",
    definition: "A deal closed as won, with who decided it.",
  },
  {
    source: "deal_lost", rank: 84, kind: "deal", visibility: "internal",
    permission: "deals.read", table: "crm_deals",
    definition: "A deal closed as lost, with the recorded reason. Emphatically internal — the loss reason is our assessment.",
  },
  {
    source: "deal_converted", rank: 86, kind: "deal", visibility: "internal",
    permission: "deals.read", table: "crm_deals",
    definition: "A won deal turned into a project.",
  },
  {
    source: "project_started", rank: 90, kind: "project", visibility: "internal",
    permission: "projects.read", table: "crm_projects",
    definition: "A delivery project opened for this contact. Internal: it carries the budget and internal notes.",
  },
  {
    source: "project_update", rank: 92, kind: "project", visibility: "internal",
    permission: "projects.read", table: "crm_project_updates",
    definition: "A dated work update on one of this contact's projects. Internal: it is the delivery team's log.",
  },
  {
    source: "payment_recorded", rank: 100, kind: "payment", visibility: "internal",
    permission: "deals.read", table: "crm_transactions",
    definition: "A transaction row being created, whatever its status. Internal, because a pending or failed charge is not news the customer has had.",
  },
  {
    source: "payment_received", rank: 102, kind: "payment", visibility: "customer",
    permission: "deals.read", table: "crm_transactions",
    definition: `A payment that actually arrived — status = '${TRANSACTION_RECEIVED_STATUS}' with a received_at. Customer-visible: they paid it.`,
  },
  {
    source: "ticket_opened", rank: 110, kind: "support", visibility: "internal",
    permission: "support.read", table: "crm_support_tickets",
    definition: "A support ticket raised for this contact. The ticket RECORD is internal; the customer-facing half of support is its customer-visibility messages.",
  },
  {
    source: "ticket_resolved", rank: 112, kind: "support", visibility: "internal",
    permission: "support.read", table: "crm_support_tickets",
    definition: "A support ticket resolved, with the recorded resolution. Internal: the resolution vocabulary is ours.",
  },
  {
    source: "support_message", rank: 114, kind: "support", visibility: null,
    permission: "support.read", table: "crm_support_messages",
    definition: "One entry in a support thread. Visibility comes from the row's own visibility column, which has no default in the schema or the API.",
  },
] as const;

const SPEC_BY_SOURCE = new Map<TimelineSource, SourceSpec>(
  SOURCE_SPECS.map((s) => [s.source, s]),
);

export function specFor(source: TimelineSource): SourceSpec {
  const spec = SPEC_BY_SOURCE.get(source);
  if (!spec) throw new Error(`Unknown timeline source: ${source}`);
  return spec;
}

/** Every source a caller holding these grants is allowed to see. */
export function allowedSourcesFor(
  has: (permission: Permission) => boolean,
): Set<TimelineSource> {
  const allowed = new Set<TimelineSource>();
  for (const spec of SOURCE_SPECS) if (has(spec.permission)) allowed.add(spec.source);
  return allowed;
}

/** What a caller is NOT being shown, and the grant that would show it. */
export function omittedSourcesFor(
  allowed: ReadonlySet<TimelineSource>,
): { source: TimelineSource; needs: Permission }[] {
  return SOURCE_SPECS
    .filter((s) => !allowed.has(s.source))
    .map((s) => ({ source: s.source, needs: s.permission }));
}

// ── The branches ────────────────────────────────────────────────────────────

function branchFor(spec: SourceSpec, leadId: number, visibility: TimelineVisibility | undefined): SQL | null {
  // A source with a constant visibility that does not match the filter is
  // dropped entirely rather than queried and thrown away.
  if (visibility && spec.visibility !== null && spec.visibility !== visibility) return null;

  const rowVisibilityFilter = (column: SQL): SQL =>
    visibility ? sql` AND ${column} = ${visibility}` : sql``;

  switch (spec.source) {
    case "message":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`m.created_at`, sourceId: sql`m.id`,
        visibility: sql`'customer'::text`,
        entityType: "message", entityId: sql`m.id`,
        actorOrigin: sql`coalesce(m.origin, CASE WHEN m.direction = 'inbound' THEN 'inbound' ELSE NULL END)::text`,
        actorStaffId: sql`m.sent_by_staff_id`, actorLabel: sql`m.sent_by_label`,
        title: sql`coalesce(m.subject, m.channel)::text`, body: sql`m.body`,
        status: sql`m.status`, channel: sql`m.channel`, direction: sql`m.direction`,
        amount: NULL_TEXT,
        from: sql`crm_messages m`,
        where: sql`(m.lead_id = ${leadId} OR m.conversation_id IN (SELECT id FROM scoped_conversations))`,
      });

    case "conversation_resolved":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`c.resolved_at`, sourceId: sql`c.id`,
        visibility: sql`'internal'::text`,
        entityType: "conversation", entityId: sql`c.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`c.resolved_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`coalesce(c.subject, c.channel)::text`, body: NULL_TEXT,
        status: sql`c.status`, channel: sql`c.channel`, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_conversations c`,
        where: sql`c.contact_id = ${leadId} AND c.resolved_at IS NOT NULL`,
      });

    case "activity":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`a.created_at`, sourceId: sql`a.id`,
        visibility: sql`'internal'::text`,
        entityType: "activity", entityId: sql`a.id`,
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: sql`a.created_by`,
        title: sql`a.title`, body: sql`a.description`,
        status: sql`a.type`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_activities a`,
        where: sql`a.lead_id = ${leadId}`,
      });

    case "comment":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`cm.created_at`, sourceId: sql`cm.id`,
        visibility: sql`CASE WHEN cm.is_internal THEN 'internal' ELSE 'customer' END::text`,
        entityType: "comment", entityId: sql`cm.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`cm.author_staff_id`, actorLabel: sql`cm.author_label`,
        title: sql`cm.entity_type`, body: sql`cm.body`,
        status: NULL_TEXT, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_comments cm`,
        where: sql`${entityScope("cm", leadId)} AND cm.deleted_at IS NULL${
          rowVisibilityFilter(sql`(CASE WHEN cm.is_internal THEN 'internal' ELSE 'customer' END)`)}`,
      });

    case "task_created":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`t.created_at`, sourceId: sql`t.id`,
        visibility: sql`'internal'::text`,
        entityType: "task", entityId: sql`t.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`t.created_by_staff_id`, actorLabel: sql`t.created_by`,
        title: sql`t.title`, body: sql`t.description`,
        status: sql`t.type`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_tasks t`,
        where: sql`(t.lead_id = ${leadId} OR t.project_id IN (SELECT id FROM scoped_projects))`,
      });

    case "task_completed":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`t.completed_at`, sourceId: sql`t.id`,
        visibility: sql`'internal'::text`,
        entityType: "task", entityId: sql`t.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`t.completed_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`t.title`, body: NULL_TEXT,
        status: sql`t.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_tasks t`,
        where: sql`(t.lead_id = ${leadId} OR t.project_id IN (SELECT id FROM scoped_projects)) AND t.completed_at IS NOT NULL`,
      });

    case "appointment_scheduled":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`ap.start_at`, sourceId: sql`ap.id`,
        visibility: sql`'customer'::text`,
        entityType: "appointment", entityId: sql`ap.id`,
        // `created_by_staff_id` is the author. `organizer_staff_id` is
        // ownership, and substituting one for the other would credit a meeting
        // to whoever runs it rather than whoever booked it.
        actorOrigin: NULL_TEXT, actorStaffId: sql`ap.created_by_staff_id`,
        actorLabel: sql`ap.created_by_label`,
        title: sql`ap.title`, body: sql`ap.description`,
        status: sql`ap.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_appointments ap`,
        where: sql`(ap.lead_id = ${leadId} OR ap.deal_id IN (SELECT id FROM scoped_deals) OR ap.project_id IN (SELECT id FROM scoped_projects))`,
      });

    case "appointment_completed":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`ap.completed_at`, sourceId: sql`ap.id`,
        visibility: sql`'customer'::text`,
        entityType: "appointment", entityId: sql`ap.id`,
        // Nothing records who marked a meeting complete, so nobody is named.
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`ap.title`, body: NULL_TEXT,
        status: sql`ap.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_appointments ap`,
        where: sql`(ap.lead_id = ${leadId} OR ap.deal_id IN (SELECT id FROM scoped_deals) OR ap.project_id IN (SELECT id FROM scoped_projects)) AND ap.completed_at IS NOT NULL`,
      });

    case "appointment_cancelled":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`ap.cancelled_at`, sourceId: sql`ap.id`,
        visibility: sql`'customer'::text`,
        entityType: "appointment", entityId: sql`ap.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`ap.cancelled_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`ap.title`, body: sql`ap.cancel_reason`,
        status: sql`ap.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_appointments ap`,
        where: sql`(ap.lead_id = ${leadId} OR ap.deal_id IN (SELECT id FROM scoped_deals) OR ap.project_id IN (SELECT id FROM scoped_projects)) AND ap.cancelled_at IS NOT NULL`,
      });

    case "document_requested":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`dr.requested_at`, sourceId: sql`dr.id`,
        visibility: sql`'customer'::text`,
        entityType: "document_request", entityId: sql`dr.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`dr.requested_by_staff_id`, actorLabel: sql`dr.requested_by_label`,
        title: sql`dr.title`, body: sql`dr.description`,
        status: sql`dr.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_document_requests dr`,
        where: entityScope("dr", leadId),
      });

    case "document_received":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`dr.received_at`, sourceId: sql`dr.id`,
        visibility: sql`'customer'::text`,
        entityType: "document_request", entityId: sql`dr.id`,
        // `crm_document_requests` records no "received by". The upload that
        // satisfied it might have come from the customer or from somebody here
        // filing it on their behalf, and the row cannot tell the two apart —
        // so it names neither.
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`dr.title`, body: NULL_TEXT,
        status: sql`dr.status`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_document_requests dr`,
        where: sql`${entityScope("dr", leadId)} AND dr.received_at IS NOT NULL`,
      });

    case "document_uploaded":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`att.created_at`, sourceId: sql`att.id`,
        visibility: sql`'internal'::text`,
        entityType: "attachment", entityId: sql`att.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`att.uploaded_by_staff_id`, actorLabel: sql`att.uploaded_by_label`,
        title: sql`att.filename`, body: NULL_TEXT,
        status: sql`att.mime_type`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_attachments att`,
        where: sql`${entityScope("att", leadId)} AND att.deleted_at IS NULL`,
      });

    case "deal_opened":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`d.created_at`, sourceId: sql`d.id`,
        visibility: sql`'internal'::text`,
        entityType: "deal", entityId: sql`d.id`,
        // `owner_staff_id` is whose deal it is NOW, which is not who opened it.
        // A deal reassigned last week would otherwise rewrite its own history.
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`d.name`, body: sql`d.notes`,
        status: sql`d.stage`, channel: NULL_TEXT, direction: NULL_TEXT, amount: sql`d.value::text`,
        from: sql`crm_deals d`,
        where: sql`d.lead_id = ${leadId}`,
      });

    case "deal_won":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`d.won_at`, sourceId: sql`d.id`,
        visibility: sql`'internal'::text`,
        entityType: "deal", entityId: sql`d.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`d.closed_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`d.name`, body: NULL_TEXT,
        status: sql`d.stage`, channel: NULL_TEXT, direction: NULL_TEXT, amount: sql`d.value::text`,
        from: sql`crm_deals d`,
        where: sql`d.lead_id = ${leadId} AND d.won_at IS NOT NULL`,
      });

    case "deal_lost":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`d.lost_at`, sourceId: sql`d.id`,
        visibility: sql`'internal'::text`,
        entityType: "deal", entityId: sql`d.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`d.closed_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`d.name`, body: sql`d.lost_reason_detail`,
        status: sql`d.lost_reason`, channel: NULL_TEXT, direction: NULL_TEXT, amount: sql`d.value::text`,
        from: sql`crm_deals d`,
        where: sql`d.lead_id = ${leadId} AND d.lost_at IS NOT NULL`,
      });

    case "deal_converted":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`d.converted_at`, sourceId: sql`d.id`,
        visibility: sql`'internal'::text`,
        entityType: "deal", entityId: sql`d.id`,
        // Nothing records who ran the conversion. See `deal_opened`.
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`d.name`, body: NULL_TEXT,
        status: sql`d.converted_project_id::text`, channel: NULL_TEXT, direction: NULL_TEXT,
        amount: sql`d.value::text`,
        from: sql`crm_deals d`,
        where: sql`d.lead_id = ${leadId} AND d.converted_at IS NOT NULL`,
      });

    case "project_started":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`p.created_at`, sourceId: sql`p.id`,
        visibility: sql`'internal'::text`,
        entityType: "project", entityId: sql`p.id`,
        // `owner_staff_id` and `assigned_to` are both current ownership, not
        // authorship. A project carries no record of who started it.
        actorOrigin: NULL_TEXT, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`p.name`, body: sql`p.notes`,
        status: sql`p.stage`, channel: NULL_TEXT, direction: NULL_TEXT, amount: sql`p.budget::text`,
        from: sql`crm_projects p`,
        where: sql`p.lead_id = ${leadId}`,
      });

    case "project_update":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`pu.created_at`, sourceId: sql`pu.id`,
        visibility: sql`'internal'::text`,
        entityType: "project", entityId: sql`pu.project_id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`pu.author_staff_id`, actorLabel: sql`pu.author_label`,
        title: sql`coalesce(pu.stage_at_update, 'Update')::text`, body: sql`pu.body`,
        status: sql`pu.stage_at_update`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_project_updates pu`,
        where: sql`pu.project_id IN (SELECT id FROM scoped_projects)`,
      });

    case "payment_recorded":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`tx.created_at`, sourceId: sql`tx.id`,
        visibility: sql`'internal'::text`,
        entityType: "transaction", entityId: sql`tx.id`,
        actorOrigin: sql`CASE WHEN tx.method = 'stripe' THEN 'system' ELSE NULL END::text`,
        actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`tx.method`, body: sql`tx.notes`,
        status: sql`tx.status`, channel: sql`tx.method`, direction: NULL_TEXT, amount: sql`tx.amount::text`,
        from: sql`crm_transactions tx`,
        where: sql`(tx.lead_id = ${leadId} OR tx.deal_id IN (SELECT id FROM scoped_deals))`,
      });

    case "payment_received":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`tx.received_at`, sourceId: sql`tx.id`,
        visibility: sql`'customer'::text`,
        entityType: "transaction", entityId: sql`tx.id`,
        actorOrigin: sql`'customer'::text`, actorStaffId: NULL_INT, actorLabel: NULL_TEXT,
        title: sql`tx.method`, body: NULL_TEXT,
        status: sql`tx.status`, channel: sql`tx.method`, direction: NULL_TEXT, amount: sql`tx.amount::text`,
        from: sql`crm_transactions tx`,
        // The status literal comes from TRANSACTION_RECEIVED_STATUS, never a
        // hand-typed string — a reader filtering on a value no write path
        // produces is exactly how "money received" once became structurally $0.
        where: sql`(tx.lead_id = ${leadId} OR tx.deal_id IN (SELECT id FROM scoped_deals))
          AND tx.status = ${TRANSACTION_RECEIVED_STATUS} AND tx.received_at IS NOT NULL`,
      });

    case "ticket_opened":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`tk.created_at`, sourceId: sql`tk.id`,
        visibility: sql`'internal'::text`,
        entityType: "ticket", entityId: sql`tk.id`,
        actorOrigin: sql`CASE WHEN tk.source IN ('email', 'phone', 'service_request') THEN 'customer' ELSE NULL END::text`,
        actorStaffId: sql`tk.opened_by_staff_id`, actorLabel: sql`tk.opened_by_label`,
        title: sql`tk.subject`, body: sql`tk.description`,
        status: sql`tk.status`, channel: sql`tk.source`, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_support_tickets tk`,
        where: sql`tk.lead_id = ${leadId}`,
      });

    case "ticket_resolved":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`tk.resolved_at`, sourceId: sql`tk.id`,
        visibility: sql`'internal'::text`,
        entityType: "ticket", entityId: sql`tk.id`,
        actorOrigin: NULL_TEXT, actorStaffId: sql`tk.resolved_by_staff_id`, actorLabel: NULL_TEXT,
        title: sql`tk.subject`, body: sql`tk.resolution_note`,
        status: sql`tk.resolution`, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_support_tickets tk`,
        where: sql`tk.lead_id = ${leadId} AND tk.resolved_at IS NOT NULL`,
      });

    case "support_message":
      return branch({
        source: spec.source, rank: spec.rank,
        occurredAt: sql`sm.created_at`, sourceId: sql`sm.id`,
        visibility: sql`sm.visibility`,
        entityType: "ticket", entityId: sql`sm.ticket_id`,
        actorOrigin: sql`sm.origin`, actorStaffId: sql`sm.sent_by_staff_id`, actorLabel: sql`sm.sent_by_label`,
        title: NULL_TEXT, body: sql`sm.body`,
        status: NULL_TEXT, channel: NULL_TEXT, direction: NULL_TEXT, amount: NULL_TEXT,
        from: sql`crm_support_messages sm`,
        where: sql`sm.ticket_id IN (SELECT id FROM scoped_tickets)${rowVisibilityFilter(sql`sm.visibility`)}`,
      });

    default:
      return null;
  }
}

// ── Summaries and links ─────────────────────────────────────────────────────

interface RawRow {
  occurred_at: Date;
  source: TimelineSource;
  source_rank: number;
  source_id: number;
  visibility: TimelineVisibility;
  entity_type: string;
  entity_id: number;
  actor_origin: string | null;
  actor_staff_id: number | null;
  actor_label: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  channel: string | null;
  direction: string | null;
  amount: string | null;
}

function clip(text: string | null, max = 140): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function money(amount: string | null): string {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "an unrecorded amount";
}

/** The one line somebody reads. Never invents a fact the row does not carry. */
function summarise(row: RawRow, leadId: number): string {
  switch (row.source) {
    case "message": {
      const way = row.direction === "inbound" ? "received" : "sent";
      const what = row.channel === "call" ? "call" : row.channel ?? "message";
      const text = clip(row.body) || clip(row.title);
      return text ? `${what} ${way}: ${text}` : `${what} ${way}`;
    }
    case "conversation_resolved":
      return `Conversation marked resolved${row.channel ? ` (${row.channel})` : ""}`;
    case "activity":
      return clip(row.title) || `Activity: ${row.status ?? "recorded"}`;
    case "comment":
      return `${row.visibility === "internal" ? "Internal note" : "Note"} on ${row.title ?? "record"}: ${clip(row.body)}`;
    case "task_created":
      return `Task raised: ${clip(row.title)}`;
    case "task_completed":
      return `Task completed: ${clip(row.title)}`;
    case "appointment_scheduled":
      return `Meeting: ${clip(row.title)}`;
    case "appointment_completed":
      return `Meeting took place: ${clip(row.title)}`;
    case "appointment_cancelled":
      return `Meeting cancelled: ${clip(row.title)}`;
    case "document_requested":
      return `Document requested: ${clip(row.title)}`;
    case "document_received":
      return `Document received: ${clip(row.title)}`;
    case "document_uploaded":
      return `File attached: ${clip(row.title)}`;
    case "deal_opened":
      return `Deal opened: ${clip(row.title)} (${money(row.amount)})`;
    case "deal_won":
      return `Deal won: ${clip(row.title)} (${money(row.amount)})`;
    case "deal_lost":
      return `Deal lost: ${clip(row.title)}${row.status ? ` — ${row.status}` : " — no reason recorded"}`;
    case "deal_converted":
      return `Deal converted into a project: ${clip(row.title)}`;
    case "project_started":
      return `Project started: ${clip(row.title)}`;
    case "project_update":
      return `Project update${row.status ? ` (${row.status})` : ""}: ${clip(row.body)}`;
    case "payment_recorded":
      return `Payment of ${money(row.amount)} recorded via ${row.channel ?? "an unrecorded method"} — status ${row.status ?? "unknown"}`;
    case "payment_received":
      return `Payment of ${money(row.amount)} received via ${row.channel ?? "an unrecorded method"}`;
    case "ticket_opened":
      return `Support ticket opened: ${clip(row.title)}`;
    case "ticket_resolved":
      return `Support ticket resolved: ${clip(row.title)}${row.status ? ` — ${row.status}` : ""}`;
    case "support_message":
      return `${row.visibility === "internal" ? "Internal support note" : "Support reply"}: ${clip(row.body)}`;
    default:
      return `Recorded against contact ${leadId}`;
  }
}

/** Where the underlying record actually lives in the CRM. */
function hrefFor(row: RawRow, leadId: number): string {
  switch (row.entity_type) {
    case "deal": return `/admin/crm/deals?id=${row.entity_id}`;
    case "project": return `/admin/crm/projects?id=${row.entity_id}`;
    case "ticket": return `/admin/crm/support?ticket=${row.entity_id}`;
    case "task": return `/admin/crm/tasks?id=${row.entity_id}`;
    case "appointment": return `/admin/crm/calendar?appointment=${row.entity_id}`;
    case "transaction": return `/admin/crm/transactions?id=${row.entity_id}`;
    case "conversation": return `/admin/crm/inbox?conversation=${row.entity_id}`;
    case "document_request":
    case "attachment": return `/admin/crm/documents?lead=${leadId}`;
    default: return `/admin/crm/leads/${leadId}`;
  }
}

// ── The query ───────────────────────────────────────────────────────────────

export interface TimelineRequest {
  leadId: number;
  contactName: string | null;
  limit: number;
  cursor?: TimelineCursor | undefined;
  kinds?: readonly TimelineKind[] | undefined;
  visibility?: TimelineVisibility | undefined;
  allowedSources: ReadonlySet<TimelineSource>;
  staffNames: ReadonlyMap<number, string>;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  nextCursor: string | null;
  /** The sources this query actually read, so a short page is explicable. */
  sourcesQueried: TimelineSource[];
}

export async function fetchTimelinePage(req: TimelineRequest): Promise<TimelinePage> {
  const specs = SOURCE_SPECS.filter((s) => {
    if (!req.allowedSources.has(s.source)) return false;
    if (req.kinds && req.kinds.length > 0 && !req.kinds.includes(s.kind)) return false;
    if (req.visibility && s.visibility !== null && s.visibility !== req.visibility) return false;
    return true;
  });

  if (specs.length === 0) return { entries: [], nextCursor: null, sourcesQueried: [] };

  const branches: SQL[] = [];
  for (const spec of specs) {
    const b = branchFor(spec, req.leadId, req.visibility);
    if (b) branches.push(b);
  }
  if (branches.length === 0) return { entries: [], nextCursor: null, sourcesQueried: [] };

  const union = sql.join(branches, sql` UNION ALL `);

  // The keyset predicate, spelled out rather than reduced: the comparison has
  // to match the ORDER BY exactly, and "clever" forms of this are where paging
  // bugs live. Read it as: strictly older, or same instant and a lower source
  // rank, or same instant and same source and a lower id.
  const keyset = req.cursor
    ? sql` WHERE (e.occurred_at < ${req.cursor.t}::timestamptz
        OR (e.occurred_at = ${req.cursor.t}::timestamptz
            AND (e.source_rank < ${req.cursor.r}::int
                 OR (e.source_rank = ${req.cursor.r}::int AND e.source_id < ${req.cursor.i}::int))))`
    : sql``;

  const query = sql`${scopeCte(req.leadId)}
    SELECT * FROM (${union}) e${keyset}
    ORDER BY e.occurred_at DESC, e.source_rank DESC, e.source_id DESC
    LIMIT ${req.limit + 1}`;

  const result = await db.execute(query);
  const rows = result.rows as unknown as RawRow[];

  const hasMore = rows.length > req.limit;
  const page = hasMore ? rows.slice(0, req.limit) : rows;

  const entries = page.map((row): TimelineEntry => {
    const spec = specFor(row.source);
    const amount = row.amount == null ? null : Number(row.amount);
    const entry: TimelineEntry = {
      id: `${row.source}:${row.source_id}`,
      occurredAt: new Date(row.occurred_at).toISOString(),
      source: row.source,
      kind: spec.kind,
      visibility: row.visibility,
      summary: summarise(row, req.leadId),
      detail: row.body ?? null,
      actor: resolveActor({
        origin: row.actor_origin,
        staffId: row.actor_staff_id,
        label: row.actor_label,
        staffNames: req.staffNames,
        contactName: req.contactName,
      }),
      record: { type: row.entity_type, id: row.entity_id, href: hrefFor(row, req.leadId) },
    };
    if (row.channel != null) entry.channel = row.channel;
    if (row.direction != null) entry.direction = row.direction;
    if (row.status != null) entry.status = row.status;
    if (amount != null && Number.isFinite(amount)) entry.amount = amount;
    return entry;
  });

  const last = page[page.length - 1];
  return {
    entries,
    nextCursor: hasMore && last
      ? encodeCursor({
          t: new Date(last.occurred_at).toISOString(),
          r: last.source_rank,
          i: last.source_id,
        })
      : null,
    sourcesQueried: specs.map((s) => s.source),
  };
}

/**
 * The customer-visible projection.
 *
 * The query already filtered on `visibility = 'customer'`. This runs again on
 * the way out, and that redundancy is the point: the guarantee "no internal
 * entry reaches a customer surface" should not rest on one WHERE clause being
 * built correctly by whichever caller came next. If the two ever disagree, the
 * stricter one wins and nothing leaks.
 */
export function customerVisibleOnly(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.filter((e) => e.visibility === "customer");
}
