import { pgTable, serial, text, integer, timestamp, decimal, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { crmStaff } from "./crmStaff";
import { crmCompanies } from "./crmCompanies";

// Canonical SiteMint Digital agency lead lifecycle statuses.
export const CRM_STATUSES = [
  "New Inquiry", "Discovery Sent", "Discovery Completed", "Qualified",
  "Proposal Needed", "Proposal Sent", "Follow-Up Needed", "Won",
  "Lost", "On Hold", "Client", "Maintenance Client",
] as const;
export type CrmStatus = typeof CRM_STATUSES[number];

// Canonical agency project / service types.
export const PROJECT_TYPES = [
  "Website Design", "Website Redesign", "Web Application", "CRM Development",
  "SEO", "Blog Content", "Maintenance & Support", "AI Automation",
  "Consultation", "E-commerce", "Landing Page", "Branding", "Website Audit",
] as const;
export type ProjectType = typeof PROJECT_TYPES[number];

export const CRM_SOURCES = [
  "Website Form", "Discovery Form", "Referral", "Cold Outreach",
  "Social Media", "CSV Import", "Manual Entry", "Other",
] as const;

export const CRM_PRIORITIES = ["Low", "Medium", "High"] as const;

export const crmLeads = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Contact info
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email").notNull(),
  website: text("website"),

  // Classification
  source: text("source").default("Manual Entry").notNull(),
  serviceInterest: text("service_interest"),
  status: text("status").default("New Inquiry").notNull(),
  priority: text("priority").default("Medium").notNull(),
  /**
   * The owner's name as it was recorded — typed, imported, or written by the
   * picker alongside the id.
   *
   * KEPT, deliberately, as the audit trail of what was actually recorded on the
   * day. The product reads `assignedToStaffId`; this column is still read as
   * text only by the campaign segment field `owner` and the `{{owner}}` merge
   * token (routes/crmMarketing.ts) and the CSV export. Every assignment writes
   * BOTH columns, so they cannot drift apart going forward; historical rows
   * keep whatever they always said.
   */
  assignedTo: text("assigned_to"),

  /**
   * M6: the real reference. Null means "nobody has resolved this contact's
   * owner to a person" — either it is unassigned, or `assignedTo` holds a
   * string that did not match exactly one member of staff.
   *
   * It is deliberately NOT derived on read. A name lookup done at read time is
   * a guess repeated on every query, and it silently changes answer when
   * somebody is renamed or a second person shares a name. The decision is made
   * once — by the rules in artifacts/api-server/src/lib/leadOwnerRules.ts at
   * write time, or by a person on Admin → "Unmapped lead owners" — and every
   * mapping decision is recorded in `crm_lead_owner_mappings`. See
   * `docs/crm-ops/schema/M6-lead-assignee.sql`.
   *
   * ON DELETE SET NULL: staff rows are disabled rather than deleted precisely
   * so attribution survives, but if one ever is deleted the contact must not
   * become undeletable and must not point at a person who no longer exists.
   * Losing the id is recoverable — `assignedTo` still holds the name, so the
   * value simply reappears in the unresolved list for a person to re-decide.
   */
  assignedToStaffId: integer("assigned_to_staff_id")
    .references(() => crmStaff.id, { onDelete: "set null" }),

  tags: text("tags").array().default([]).notNull(),

  // Follow-up tracking
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),

  // Notes
  notes: text("notes"),

  // Deal info
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  packageType: text("package_type"),

  // Pipeline doc statuses
  discoveryFormStatus: text("discovery_form_status").default("Not Started"),
  proposalStatus: text("proposal_status").default("Not Started"),
  sowStatus: text("sow_status").default("Not Started"),

  // Link to discovery submission if converted
  discoverySubmissionId: integer("discovery_submission_id"),

  // SMS / Phone
  smsConsent: boolean("sms_consent").default(false).notNull(),
  smsOptOut: boolean("sms_opt_out").default(false).notNull(),

  // Generated sales documents (stored as full HTML)
  generatedProposal: text("generated_proposal"),
  generatedSow: text("generated_sow"),

  /**
   * M7: the company this person works at, when a person has said so.
   *
   * NULL is a real state — "not linked to a company record" — and it is the
   * state every existing contact starts in. `company` above is NOT replaced: it
   * is the name as it was typed or imported (the receptionist signup pipeline
   * writes it), and it stays the raw material for the suggestions somebody
   * reviews before contacts are linked. Nothing derives this id from that text.
   *
   * ON DELETE SET NULL: the CRM refuses to delete a company while a current
   * contact is linked, so this only ever clears merged-away contact rows, which
   * are retained history rather than part of the book.
   *
   * Last in the column list on purpose: an upgraded table gains it at the end
   * (docs/crm-ops/schema/M7-companies.sql), and a fresh push should agree.
   */
  companyId: integer("company_id")
    .references(() => crmCompanies.id, { onDelete: "set null" }),
}, (table) => [
  // "whose contacts are these" — the query the assignment surfaces run, and the
  // one the unresolved-mappings panel runs the negation of.
  index("ix_crm_leads_assigned_to_staff_id").on(table.assignedToStaffId),
  // "who works at this company" — the company record and the contact filter.
  index("ix_crm_leads_company_id").on(table.companyId),
  // Push packet 0003 (2026-09-24 performance audit): the hot filter columns
  // that had no index — lookup by email (signup dedupe, inbound matching),
  // the pipeline status filter, and the two timestamps every list sorts on.
  index("ix_crm_leads_email").on(table.email),
  index("ix_crm_leads_status").on(table.status),
  index("ix_crm_leads_created_at").on(table.createdAt),
  index("ix_crm_leads_updated_at").on(table.updatedAt),
]);

export const insertCrmLeadSchema = createInsertSchema(crmLeads).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeads.$inferSelect;

// ── M6: the record of every owner-name mapping decision ─────────────────────
//
// One row per decision that pointed contacts carrying a free-text owner name at
// a member of staff: who (or which rule) decided, when, which person, how many
// contacts it moved, and whether the name was recorded on that person so it
// resolves by itself from then on. The review panel on /admin/crm/admin lists
// these beside the names still waiting for a decision, so the mapping of the
// existing names is visible rather than something that silently happened.
//
// It is a record, not the mechanism: the product reads
// `crm_leads.assigned_to_staff_id`, and a future value resolves through
// `crm_staff.legacy_names`. Nothing reads this table to decide anything.
//
// PUSH-MODE barrel table like every other crm_*; reviewed DDL and the backfill
// that writes its first rows: docs/crm-ops/schema/M6-lead-assignee.sql.

/** `display_name` / `legacy_name` / `email` = that rule decided; `manual` = a person did. */
export const CRM_LEAD_OWNER_MAPPING_RULES = ["display_name", "legacy_name", "email", "manual"] as const;
export type CrmLeadOwnerMappingRule = (typeof CRM_LEAD_OWNER_MAPPING_RULES)[number];

export const crmLeadOwnerMappings = pgTable("crm_lead_owner_mappings", {
  id: serial("id").primaryKey(),
  /** The comparison key of the name (see leadOwnerRules.ts `ownerKey`). */
  valueKey: text("value_key").notNull(),
  /** The name as it was shown when the decision was made. */
  valueLabel: text("value_label").notNull(),
  /**
   * The person the contacts now belong to. CASCADE: if a staff row is ever
   * deleted, its contacts lose the id (SET NULL above) and the name returns to
   * the unresolved list, so a record pointing at nobody would only mislead. The
   * append-only `crm_admin_audit_log` entry for a manual decision survives.
   */
  staffId: integer("staff_id").notNull().references(() => crmStaff.id, { onDelete: "cascade" }),
  rule: text("rule").notNull(),
  /** Contacts this decision pointed at the person, at the moment it was made. */
  leadsUpdated: integer("leads_updated").notNull().default(0),
  /** True when the name was added to that person's `legacy_names`. */
  legacyNameAdded: boolean("legacy_name_added").notNull().default(false),
  /** The person who decided. NULL for the automatic backfill — and after that person's row is deleted. */
  decidedByStaffId: integer("decided_by_staff_id").references(() => crmStaff.id, { onDelete: "set null" }),
  /** Who or what decided, as text, so the answer survives the row above going. */
  decidedByLabel: text("decided_by_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_lead_owner_mappings_value_key").on(table.valueKey),
  index("ix_crm_lead_owner_mappings_created_at").on(table.createdAt),
  check(
    "ck_crm_lead_owner_mappings_rule",
    sql`${table.rule} IN ('display_name', 'legacy_name', 'email', 'manual')`,
  ),
]);

export type CrmLeadOwnerMapping = typeof crmLeadOwnerMappings.$inferSelect;
