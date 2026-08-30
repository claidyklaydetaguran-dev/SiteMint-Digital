import { pgTable, serial, text, integer, timestamp, jsonb, boolean, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Phase 2C.2B duplicate-review states (docs/sitemint-platform/
// DISCOVERY_FORM_HARDENING_PRD.md §18/§19/§24, four-state model finalized in
// Checkpoint 2C.2A.3). "none" is the default for every legacy row — it means
// "not currently flagged as a likely duplicate," not "validated by the new
// anti-spam system"; no legacy row is ever backfilled to a value implying it
// passed a check that did not exist when it was created.
export const DISCOVERY_DUPLICATE_REVIEW_STATUSES = [
  "none",
  "pending",
  "cleared",
  "confirmed_duplicate",
] as const;
export type DiscoveryDuplicateReviewStatus = (typeof DISCOVERY_DUPLICATE_REVIEW_STATUSES)[number];

export const discoverySubmissions = pgTable("discovery_submissions", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Key fields extracted for filtering/display
  contactName: text("contact_name").notNull(),
  companyName: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  industry: text("industry"),
  serviceInterest: text("service_interest"),
  budget: text("budget"),
  timeline: text("timeline"),
  decisionMaker: text("decision_maker"),

  // Scoring & classification
  leadScore: integer("lead_score").default(1).notNull(),
  tags: text("tags").array().default([]).notNull(),
  status: text("status").default("New").notNull(),
  recommendedPackage: text("recommended_package"),

  // Full form data (all sections)
  formData: jsonb("form_data").$type<Record<string, unknown>>().notNull(),

  // Generated documents (stored after generation)
  generatedProposal: text("generated_proposal"),
  generatedSow: text("generated_sow"),

  // Internal
  internalNotes: text("internal_notes"),

  // ── CRM-specific fields ────────────────────────────────────────────────────
  // Link to the CRM lead (set when imported/synced into CRM)
  leadId: integer("lead_id"),

  // AI / deterministic classification outputs
  aiSummary: text("ai_summary"),
  estimatedComplexity: text("estimated_complexity"), // Low | Medium | High | Enterprise
  estimatedBudgetTier: text("estimated_budget_tier"), // Essential | Growth | Premium
  suggestedScope: jsonb("suggested_scope").$type<Record<string, unknown>>(),

  // CRM workflow status (New | Reviewed | Proposal Generated | Archived)
  crmStatus: text("crm_status").default("New").notNull(),

  // Preferred contact method from the form
  preferredContactMethod: text("preferred_contact_method"),

  // Project was converted to a crm_project (id stored here to prevent duplicates)
  convertedProjectId: integer("converted_project_id"),

  // ── Phase 2C.2B — Project Discovery System domain contract ────────────────
  // Additive only. Every field below is nullable (or defaults to a value that
  // makes no claim about legacy rows, see DISCOVERY_DUPLICATE_REVIEW_STATUSES
  // above) because every row created before this checkpoint predates schema
  // versioning, idempotency keys, HMAC hashes, and duplicate fingerprints.
  // No column here is read or written by any route yet — see
  // docs/sitemint-platform/DISCOVERY_DOMAIN_CONTRACT.md for the full mapping,
  // including why `status` (above) already serves as the PRD's "overall
  // intake status" and `leadId` (above) already serves as the PRD's "linked
  // CRM lead ID," so neither is duplicated here.
  schemaVersion: text("schema_version"),
  formVersion: text("form_version"),

  // Client-generated idempotency key (§18/§24). Unique when present; the
  // unique index below allows any number of NULLs (ordinary Postgres unique-
  // index semantics), so legacy rows without a key never conflict.
  idempotencyKey: text("idempotency_key"),

  // Canonical idempotency payload hash (§18, finalized 2C.2A.3) — an HMAC of
  // the canonicalized, validated DTO, never a hash of raw request JSON.
  idempotencyPayloadHash: text("idempotency_payload_hash"),
  idempotencyPayloadHashKeyVersion: text("idempotency_payload_hash_key_version"),
  idempotencyCanonicalizationVersion: text("idempotency_canonicalization_version"),

  // Duplicate-detection fingerprint (§18/§24) — an HMAC of normalized fields,
  // never raw email/phone/IP. Ordinary (non-unique) index only: this is a
  // lookup aid for operator review, never a uniqueness mechanism.
  duplicateFingerprint: text("duplicate_fingerprint"),
  fingerprintKeyVersion: text("fingerprint_key_version"),

  duplicateReviewStatus: text("duplicate_review_status").default("none").notNull(),
  // Self-reference: populated only when duplicateReviewStatus = 'confirmed_duplicate'.
  // ON DELETE SET NULL — deleting the original submission a duplicate points
  // to must never delete or corrupt the duplicate row itself; see
  // DISCOVERY_DOMAIN_CONTRACT.md "Foreign-key behavior."
  duplicateOfSubmissionId: integer("duplicate_of_submission_id").references(
    (): AnyPgColumn => discoverySubmissions.id,
    { onDelete: "set null" },
  ),
  duplicateResolvedAt: timestamp("duplicate_resolved_at", { withTimezone: true }),
  duplicateResolvedBy: text("duplicate_resolved_by"),
  duplicateResolutionReasonCode: text("duplicate_resolution_reason_code"),

  privacyPolicyVersion: text("privacy_policy_version"),

  // Module 1B correction — qualification-honesty marker. Nullable, no
  // default: legacy rows and any row created before this column existed
  // stay NULL ("scoring state unknown"), never fabricated. The structured
  // (V1) submission insert explicitly writes `false` ("accepted, not yet
  // scored"). A future, separately-approved automated-scoring process may
  // write `true`. Does not change `leadScore`'s own type, nullability, or
  // default in any way — this column exists specifically because
  // `leadScore` alone (NOT NULL, default 1) cannot honestly distinguish
  // "never scored" from "scored as low as possible." Existing CRM/admin
  // screens do not yet read this column — see the REQUIRED FOLLOW-UP note
  // in discoveryV1Persistence.ts.
  isAutomaticallyScored: boolean("is_automatically_scored"),
}, (table) => [
  uniqueIndex("uq_discovery_submissions_idempotency_key").on(table.idempotencyKey),
  index("ix_discovery_submissions_duplicate_fingerprint").on(table.duplicateFingerprint),
  index("ix_discovery_submissions_duplicate_review_status").on(table.duplicateReviewStatus),
  index("ix_discovery_submissions_created_at").on(table.createdAt),
  check(
    "ck_discovery_submissions_duplicate_review_status",
    sql`${table.duplicateReviewStatus} IN ('none', 'pending', 'cleared', 'confirmed_duplicate')`,
  ),
]);

export const insertDiscoverySubmissionSchema = createInsertSchema(discoverySubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscoverySubmission = z.infer<typeof insertDiscoverySubmissionSchema>;
export type DiscoverySubmission = typeof discoverySubmissions.$inferSelect;
