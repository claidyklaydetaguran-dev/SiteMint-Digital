import {
  pgTable, serial, text, integer, timestamp, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M4: Marketing — segments, designs, campaigns, and who was excluded ───────
//
// PUSH-MODE tables (shared barrel), additive only. Reviewed DDL lives in
// docs/crm-ops/schema/M4-marketing.sql.
//
// ── Why these are new tables and not more columns on `crm_campaigns` ────────
//
// `crm_campaigns` already exists and is the record for the SEQUENCE engine:
// `crm_campaign_steps`, `crm_campaign_scheduled_messages` and
// `lib/campaignScheduler.ts` all key off it, and its status vocabulary is
// `draft | ready | archived`. A broadcast that can be scheduled, paused
// mid-flight, resumed and cancelled needs `scheduled | sending | paused |
// cancelled | sent` — putting both vocabularies in one column would mean the
// scheduler's `autoSend` query and this module's send loop each reading a
// status the other could write. Two engines sharing one state column is how a
// paused campaign keeps sending.
//
// So the sequence engine is left byte-for-byte alone and Marketing owns its
// own five tables with its own guarantees:
//
//   Re-evaluation   A segment stores a DEFINITION, never a frozen member list.
//                   Membership is computed from `crm_leads` at the moment a
//                   send starts, so a contact who stopped qualifying yesterday
//                   is not mailed today.
//
//   Accountability  Every excluded recipient gets a ROW, with the reason, in
//                   the same table as the sent ones. A drop that leaves no
//                   trace is indistinguishable from a bug, and "why did 40
//                   people not get this" must have an answer that is a list of
//                   names rather than a number.
//
//   Approval        AI-drafted copy is `draft` until a person approves it, in a
//                   column, not in a convention. The send path reads that
//                   column.

// ── Segments ────────────────────────────────────────────────────────────────

/**
 * The contact fields a segment may test.
 *
 * A closed list on purpose. An open one would let a saved segment reference a
 * column that later changes meaning, and there would be no way to tell a stale
 * definition from a working one.
 */
export const CRM_SEGMENT_FIELDS = [
  "status", "source", "priority", "owner", "service_interest",
  "company", "tag", "estimated_value", "created_at", "last_contacted_at",
] as const;
export type CrmSegmentField = (typeof CRM_SEGMENT_FIELDS)[number];

/**
 * How a condition tests its field.
 *
 * `within_days` and `older_than_days` are deliberately RELATIVE. They are the
 * reason a segment must be re-evaluated at send time rather than resolved once:
 * "contacted in the last 30 days" means something different tomorrow, and a
 * frozen member list would quietly send to people it was told to exclude.
 */
export const CRM_SEGMENT_OPERATORS = [
  "is", "is_not", "in", "not_in", "contains",
  "has_tag", "lacks_tag",
  "gte", "lte",
  "within_days", "older_than_days",
  "is_set", "is_not_set",
] as const;
export type CrmSegmentOperator = (typeof CRM_SEGMENT_OPERATORS)[number];

/**
 * Which operators each field actually accepts.
 *
 * The API refuses anything outside this table rather than building SQL that
 * compares a timestamp to a tag and silently matches nobody — a segment that
 * matches nobody for a structural reason looks exactly like one that matches
 * nobody for a business reason, and only one of those is worth acting on.
 */
export const CRM_SEGMENT_FIELD_OPERATORS: Record<CrmSegmentField, readonly CrmSegmentOperator[]> = {
  status:            ["is", "is_not", "in", "not_in"],
  source:            ["is", "is_not", "in", "not_in"],
  priority:          ["is", "is_not", "in", "not_in"],
  owner:             ["is", "is_not", "in", "not_in", "is_set", "is_not_set"],
  service_interest:  ["is", "is_not", "contains", "is_set", "is_not_set"],
  company:           ["is", "is_not", "contains", "is_set", "is_not_set"],
  tag:               ["has_tag", "lacks_tag"],
  estimated_value:   ["gte", "lte", "is_set", "is_not_set"],
  created_at:        ["within_days", "older_than_days"],
  last_contacted_at: ["within_days", "older_than_days", "is_set", "is_not_set"],
};

/** `all` = every condition must hold (AND); `any` = at least one (OR). */
export const CRM_SEGMENT_MATCH_MODES = ["all", "any"] as const;
export type CrmSegmentMatchMode = (typeof CRM_SEGMENT_MATCH_MODES)[number];

export interface CrmSegmentCondition {
  field: CrmSegmentField;
  operator: CrmSegmentOperator;
  /** Absent for `is_set` / `is_not_set`; a list for `in` / `not_in`. */
  value?: string | number | string[] | null;
}

export interface CrmSegmentDefinition {
  match: CrmSegmentMatchMode;
  conditions: CrmSegmentCondition[];
}

export const crmMarketingSegments = pgTable("crm_marketing_segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),

  /**
   * The definition, never the members. Nothing in this module stores a
   * resolved list of contacts against a segment.
   */
  definition: jsonb("definition").$type<CrmSegmentDefinition>().notNull(),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel: text("created_by_label"),

  /** Archived rather than deleted: a sent campaign still names its segment. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_marketing_segments_name").on(table.name),
  index("ix_crm_marketing_segments_archived").on(table.archivedAt),
]);

export type CrmMarketingSegment = typeof crmMarketingSegments.$inferSelect;

// ── Designs (saved templates) ───────────────────────────────────────────────

/**
 * The block kinds the visual designer produces.
 *
 * Stored as structure, never as a blob of HTML. HTML is a lossy projection of
 * a design — reopening one would mean parsing our own output back into
 * editable blocks, which fails the first time somebody's mail client mangles
 * it. The blocks are the document; the HTML is the render.
 */
export const CRM_EMAIL_BLOCK_TYPES = [
  "heading", "text", "image", "button", "divider", "spacer",
] as const;
export type CrmEmailBlockType = (typeof CRM_EMAIL_BLOCK_TYPES)[number];

export const CRM_EMAIL_BLOCK_ALIGNMENTS = ["left", "center", "right"] as const;
export type CrmEmailBlockAlignment = (typeof CRM_EMAIL_BLOCK_ALIGNMENTS)[number];

export interface CrmEmailBlock {
  id: string;
  type: CrmEmailBlockType;
  /** heading, text, button label. May contain merge tokens. */
  text?: string | null;
  /** heading only: 1 or 2. */
  level?: number | null;
  align?: CrmEmailBlockAlignment | null;
  /** image src, button href. */
  url?: string | null;
  /** image alt text — required for an image, because a blocked image with no alt is a blank. */
  alt?: string | null;
  /** image width in px, spacer height in px. */
  size?: number | null;
}

export const crmMarketingDesigns = pgTable("crm_marketing_designs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),

  subject: text("subject"),
  preheader: text("preheader"),
  /** The editable document. A saved template reopens into the designer. */
  blocks: jsonb("blocks").$type<CrmEmailBlock[]>().notNull().default(sql`'[]'::jsonb`),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel: text("created_by_label"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_marketing_designs_name").on(table.name),
  index("ix_crm_marketing_designs_archived").on(table.archivedAt),
]);

export type CrmMarketingDesign = typeof crmMarketingDesigns.$inferSelect;

// ── Campaigns ───────────────────────────────────────────────────────────────

/**
 * Where a broadcast is in its life.
 *
 *   draft      being written; no audience has been resolved
 *   scheduled  a time is set; the audience is still NOT resolved
 *   sending    the audience has been resolved and the send is running
 *   paused     the send was stopped part-way; what went out stays out
 *   cancelled  abandoned; what went out stays out
 *   sent       every resolved recipient reached a terminal state
 */
export const CRM_MARKETING_CAMPAIGN_STATUSES = [
  "draft", "scheduled", "sending", "paused", "cancelled", "sent",
] as const;
export type CrmMarketingCampaignStatus = (typeof CRM_MARKETING_CAMPAIGN_STATUSES)[number];

/**
 * The state machine, stated here rather than left to whichever button a screen
 * happened to offer.
 *
 * `cancelled` and `sent` are terminal. That is the point: cancelling is not an
 * undo, and a campaign that has already put mail in people's inboxes can never
 * return to a state where it might send more of the same.
 */
export const CRM_MARKETING_CAMPAIGN_TRANSITIONS: Record<CrmMarketingCampaignStatus, readonly CrmMarketingCampaignStatus[]> = {
  draft:     ["scheduled", "sending", "cancelled"],
  scheduled: ["draft", "sending", "cancelled"],
  sending:   ["paused", "cancelled", "sent"],
  paused:    ["sending", "cancelled"],
  cancelled: [],
  sent:      [],
};

/**
 * Whether AI-written copy in this campaign has been approved by a person.
 *
 *   none      nothing in this campaign came from a model
 *   draft     a model wrote some of this and nobody has approved it
 *   approved  a named person read it and accepted it
 *
 * This is a column, not a convention, because the send path has to be able to
 * refuse. A flag that only the UI honours is not a gate.
 */
export const CRM_AI_CONTENT_STATES = ["none", "draft", "approved"] as const;
export type CrmAiContentState = (typeof CRM_AI_CONTENT_STATES)[number];

/**
 * Where a campaign's audience comes from. M5, additive.
 *
 *   segment  a saved audience, by id — re-evaluated at send time
 *   filter   conditions held on the campaign itself, never saved as a segment
 *   list     an explicit list of contact ids somebody picked by hand
 *
 * `filter` and `list` exist because requiring a saved segment first was a dead
 * end: somebody who wants to mail eleven named people had to invent and name a
 * reusable audience before they could write a word. A campaign-local filter is
 * still a DEFINITION and is still re-evaluated at send time, so it keeps the
 * re-evaluation guarantee; `list` is the one deliberately frozen shape, and it
 * is frozen because "these eleven people" is what was meant.
 */
export const CRM_MARKETING_AUDIENCE_MODES = ["segment", "filter", "list"] as const;
export type CrmMarketingAudienceMode = (typeof CRM_MARKETING_AUDIENCE_MODES)[number];

export const crmMarketingCampaigns = pgTable("crm_marketing_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),

  subject: text("subject").notNull().default(""),
  preheader: text("preheader"),
  blocks: jsonb("blocks").$type<CrmEmailBlock[]>().notNull().default(sql`'[]'::jsonb`),

  /** The audience definition this send will resolve. No FK, as elsewhere in crm_*. */
  segmentId: integer("segment_id"),
  /** The template it was seeded from, for provenance only. */
  designId: integer("design_id"),

  // ── M5: the audience, without a saved segment as a prerequisite ──
  audienceMode: text("audience_mode").notNull().default("segment"),
  /** `filter` mode: the same shape a segment stores, held on the campaign. */
  audienceDefinition: jsonb("audience_definition").$type<CrmSegmentDefinition>(),
  /** `list` mode: the contact ids somebody chose by hand. */
  audienceLeadIds: jsonb("audience_lead_ids").$type<number[]>(),

  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /**
   * The IANA zone the person was thinking in when they scheduled it.
   *
   * `scheduled_at` is an instant and is unambiguous on its own; this is kept so
   * the screen can say "9:00 AM, Los Angeles time" rather than re-projecting the
   * instant into whatever zone the reader's laptop happens to be in and quietly
   * showing a different hour to two colleagues.
   */
  scheduledTimezone: text("scheduled_timezone"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // ── The AI approval gate ──
  aiContentState: text("ai_content_state").notNull().default("none"),
  aiDraftedAt: timestamp("ai_drafted_at", { withTimezone: true }),
  /**
   * Exactly what was put in front of the model. Kept so a claim in a sent
   * email can be traced to the verified fact it was grounded on — or shown
   * not to have been.
   */
  aiGrounding: jsonb("ai_grounding").$type<Record<string, unknown>>(),
  aiApprovedByStaffId: integer("ai_approved_by_staff_id"),
  aiApprovedByLabel: text("ai_approved_by_label"),
  aiApprovedAt: timestamp("ai_approved_at", { withTimezone: true }),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel: text("created_by_label"),

  /**
   * Who touched it last. M5, additive.
   *
   * Not decoration: two people editing one campaign is the normal case in a
   * four-person office, and "somebody else changed this" is an unactionable
   * message. The optimistic-concurrency refusal names this person.
   */
  updatedByStaffId: integer("updated_by_staff_id"),
  updatedByLabel: text("updated_by_label"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_marketing_campaigns_status").on(table.status),
  index("ix_crm_marketing_campaigns_segment").on(table.segmentId),
  check(
    "ck_crm_marketing_campaigns_status",
    sql`${table.status} IN ('draft','scheduled','sending','paused','cancelled','sent')`,
  ),
  check(
    "ck_crm_marketing_campaigns_audience_mode",
    sql`${table.audienceMode} IN ('segment','filter','list')`,
  ),
  check(
    "ck_crm_marketing_campaigns_ai_state",
    sql`${table.aiContentState} IN ('none','draft','approved')`,
  ),
  // An approved state with nobody's name on it is not an approval.
  check(
    "ck_crm_marketing_campaigns_ai_approval",
    sql`${table.aiContentState} <> 'approved' OR ${table.aiApprovedAt} IS NOT NULL`,
  ),
]);

export type CrmMarketingCampaign = typeof crmMarketingCampaigns.$inferSelect;

// ── Per-campaign exclusions ─────────────────────────────────────────────────

/**
 * "Not this person, not this time."
 *
 * Separate from `crm_email_suppressions` on purpose and in one direction only:
 * a suppression is global and permanent-ish (a hard bounce, a spam complaint,
 * an unsubscribe) and belongs to the address; this is a local judgement about
 * one campaign — "we are already in a contract negotiation with them, leave
 * them out of the newsletter". Collapsing the two would mean either leaking a
 * one-off decision into every future send, or diluting a suppression into
 * something a campaign can ignore.
 */
export const crmMarketingExclusions = pgTable("crm_marketing_exclusions", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),
  reason: text("reason"),
  excludedByStaffId: integer("excluded_by_staff_id"),
  excludedByLabel: text("excluded_by_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_marketing_exclusions").on(table.campaignId, table.leadId),
  index("ix_crm_marketing_exclusions_campaign").on(table.campaignId),
]);

export type CrmMarketingExclusion = typeof crmMarketingExclusions.$inferSelect;

// ── The recipient ledger ────────────────────────────────────────────────────

/**
 * What happened to each contact, including the ones nothing happened to.
 *
 *   pending   resolved into the audience, not yet attempted
 *   sent      handed to the mail provider and accepted
 *   failed    attempted and refused, with the provider's reason
 *   excluded  never attempted, with the reason
 *   test      a test send to a staff address — never a customer
 */
export const CRM_MARKETING_RECIPIENT_STATUSES = [
  "pending", "sent", "failed", "excluded", "test",
] as const;
export type CrmMarketingRecipientStatus = (typeof CRM_MARKETING_RECIPIENT_STATUSES)[number];

/**
 * Why somebody in the audience was not mailed.
 *
 * Every one of these is a row the results screen can list by name. A campaign
 * that says "412 sent" when the segment held 460 must be able to answer the
 * other 48 individually — an unexplained gap is the shape of a silent drop.
 */
export const CRM_MARKETING_EXCLUSION_REASONS = [
  /** In `crm_email_suppressions` for a bounce or a spam complaint. */
  "suppressed",
  /** In `crm_email_suppressions` because the person asked to stop. */
  "unsubscribed",
  /** Explicitly excluded from THIS campaign by a person. */
  "campaign_excluded",
  /** No address, or one that cannot be a mailbox. */
  "no_address",
  /** A merge field this copy needs has no value and no fallback. */
  "missing_merge_field",
] as const;
export type CrmMarketingExclusionReason = (typeof CRM_MARKETING_EXCLUSION_REASONS)[number];

export const crmMarketingRecipients = pgTable("crm_marketing_recipients", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),

  /** Normalised at resolution time; null when the contact had none. */
  address: text("address"),

  status: text("status").notNull().default("pending"),
  exclusionReason: text("exclusion_reason"),
  exclusionDetail: text("exclusion_detail"),

  /** What was actually rendered for this person, kept for audit. */
  renderedSubject: text("rendered_subject"),
  renderedHtml: text("rendered_html"),
  /** Merge fields that fell back to their default for this person. */
  fallbacksUsed: jsonb("fallbacks_used").$type<string[]>(),

  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),

  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One row per contact per campaign. A resend must update this row, never add
  // a second one, or "how many people got this" stops being answerable.
  uniqueIndex("uq_crm_marketing_recipients").on(table.campaignId, table.leadId),
  index("ix_crm_marketing_recipients_campaign_status").on(table.campaignId, table.status),
  check(
    "ck_crm_marketing_recipients_status",
    sql`${table.status} IN ('pending','sent','failed','excluded','test')`,
  ),
  // An exclusion without a reason is the silent drop this table exists to stop.
  check(
    "ck_crm_marketing_recipients_exclusion_reason",
    sql`${table.status} <> 'excluded' OR ${table.exclusionReason} IS NOT NULL`,
  ),
]);

export type CrmMarketingRecipient = typeof crmMarketingRecipients.$inferSelect;

// ── Merge fields ────────────────────────────────────────────────────────────

/**
 * The catalogue of values that can be merged into copy, and where each comes
 * from on the contact record.
 *
 * The token syntax is `{{field|fallback}}` and the fallback half is NOT
 * optional. A token written `{{first_name}}` is rejected before a send starts,
 * because the alternative is an email that opens "Hi ," for everybody whose
 * name we never captured — and that failure is invisible until a customer
 * points it out.
 */
export const CRM_MERGE_FIELDS = {
  first_name: "The contact's first name, taken from the first word of their name.",
  last_name: "The contact's surname, taken from the rest of their name.",
  full_name: "The contact's full name as recorded.",
  company: "The company on the contact record.",
  email: "The contact's email address.",
  owner: "The staff member the contact is assigned to.",
  service_interest: "The service recorded against the contact.",
  status: "The contact's pipeline status.",
  source: "Where the contact came from.",
} as const;

export type CrmMergeField = keyof typeof CRM_MERGE_FIELDS;

/** `{{ field | fallback }}` — whitespace tolerated, fallback mandatory. */
export const CRM_MERGE_TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*(\|\s*([^}]*?)\s*)?\}\}/g;
