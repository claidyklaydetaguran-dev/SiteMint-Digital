import { pgTable, serial, integer, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { crmLeads } from "./crmLeads";

// ── crm_behavioral_events ──────────────────────────────────────────────────────
//
// Every observable lead action that carries intent signal.
// Each row has an eventType and a set of DNA score deltas.
// The Lead DNA profile is computed on-the-fly by summing all deltas per lead.
//
// Allowed eventType values (web-agency context):
//   Email:    email_opened | email_clicked_cta | email_ignored | email_replied
//   Proposal: proposal_viewed | proposal_reopened | proposal_downloaded
//             sow_opened | sow_downloaded
//   Phone:    call_answered | call_missed | call_duration_long
//             sms_replied | sms_ignored
//   Source:   discovery_form_submitted | contact_form_submitted
//             referral | facebook_lead | instagram_lead | google_ppc | organic
//   Meeting:  meeting_booked | meeting_attended | meeting_no_show
//   Manual:   manual (admin-created event with custom deltas)

export const crmBehavioralEvents = pgTable("crm_behavioral_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),

  eventType: text("event_type").notNull(),

  // Optional human-readable context (e.g. campaign name, email subject)
  label: text("label"),

  // DNA score deltas applied by this event (null = no change to that dimension)
  dClientIntent:         numeric("d_client_intent", { precision: 5, scale: 2 }),
  dUrgency:              numeric("d_urgency", { precision: 5, scale: 2 }),
  dTrust:                numeric("d_trust", { precision: 5, scale: 2 }),
  dProjectReadiness:     numeric("d_project_readiness", { precision: 5, scale: 2 }),
  dBudgetConfidence:     numeric("d_budget_confidence", { precision: 5, scale: 2 }),
  dCommunicationScore:   numeric("d_communication_score", { precision: 5, scale: 2 }),
  dReferralProbability:  numeric("d_referral_probability", { precision: 5, scale: 2 }),

  // Optional free-form metadata (e.g. { campaignId: 7, recipientId: 42 })
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export type CrmBehavioralEvent = typeof crmBehavioralEvents.$inferSelect;
export type InsertCrmBehavioralEvent = typeof crmBehavioralEvents.$inferInsert;
