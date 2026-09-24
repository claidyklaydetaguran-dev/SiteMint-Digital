import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { crmStaff } from "./crmStaff";

// ── M7: companies, modelled separately from the people who work there ────────
//
// Until now a customer was a lead with status "Client", and the organisation
// that lead works for was a free-text `crm_leads.company` string. Two people
// from the same business were two unrelated rows that happened to share some
// characters, so there was nowhere to ask "what do we have going on with this
// business?" — its people, deals, projects, tickets, quotes and invoices.
//
// A company is its own record, and a contact points at one through the nullable
// `crm_leads.company_id`. The typed `crm_leads.company` text is KEPT exactly as
// it was: it is what was recorded, the receptionist signup pipeline writes it,
// and it is the raw material for the suggestions a person reviews before
// anything is linked. Nothing links a contact to a company automatically.
//
// PUSH-MODE barrel table like every other crm_*; reviewed DDL:
// docs/crm-ops/schema/M7-companies.sql. The column order below is the order of
// that file's CREATE TABLE, so a fresh push and an upgraded database agree.
export const crmCompanies = pgTable("crm_companies", {
  id: serial("id").primaryKey(),

  /** The name as a person wrote it. */
  name: text("name").notNull(),
  /**
   * `name` lower-cased, trimmed, with internal whitespace collapsed — computed
   * by the application at write time (artifacts/api-server/src/lib/companies.ts)
   * so the database's locale never decides what "the same name" means.
   *
   * Deliberately NOT unique: two genuinely different businesses can share a
   * name. It drives a duplicate WARNING when a company is created, which a
   * person may override after seeing the candidates.
   */
  normalizedName: text("normalized_name").notNull(),
  /**
   * The web domain, normalised: lower-case host, no scheme, no leading "www.",
   * no path ("acme.com"). Not unique either — a group and its subsidiary can
   * share one — but a match is offered as a possible duplicate.
   */
  domain: text("domain"),
  website: text("website"),
  phone: text("phone"),
  industry: text("industry"),

  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country"),

  notes: text("notes"),

  /**
   * The member of staff who looks after this relationship. SET NULL for the
   * same reason as `crm_leads.assigned_to_staff_id`: staff rows are disabled
   * rather than deleted, but a deleted one must not make the company
   * undeletable or point at somebody who is gone.
   */
  ownerStaffId: integer("owner_staff_id")
    .references(() => crmStaff.id, { onDelete: "set null" }),
  /** Who created the record. NULL for the legacy shared bearer, and after that staff row is deleted. */
  createdByStaffId: integer("created_by_staff_id")
    .references(() => crmStaff.id, { onDelete: "set null" }),

  /**
   * Archived companies are hidden from the list by default and cannot have new
   * people linked to them. Archiving changes nothing about the people already
   * linked — it is reversible, which is why it exists beside an owner-only
   * delete.
   */
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // The duplicate warning's two questions, and "whose companies are these".
  index("ix_crm_companies_normalized_name").on(table.normalizedName),
  index("ix_crm_companies_domain").on(table.domain),
  index("ix_crm_companies_owner_staff_id").on(table.ownerStaffId),
]);

export type CrmCompany = typeof crmCompanies.$inferSelect;
