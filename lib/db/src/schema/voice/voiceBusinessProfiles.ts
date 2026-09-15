import { pgTable, serial, integer, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "../intakeAgent";

// ── Business profile details the account row has no room for ────────────────
// Versioned-migration-only (voice domain journal, 0011). One row per firm.
//
// Settings has always shown "primary contact" and "default business location",
// but intake_firms — the receptionist identity — is frozen and push-managed, so
// those fields had nowhere to live and the form stopped offering them. They
// live here instead, beside the firm, following the same pattern as
// voice_onboarding_states: created lazily on first save, cascade-deleted with
// the firm, and firm-scoped on every query.
//
// Every column is nullable because every field is optional: "not set" is a
// real, displayable state and must never be stored as an empty string that
// reads as set. Application code (lib/accountProfile/profileService.ts) trims
// and normalises; the CHECKs here are the backstop that keeps a bad write from
// ever landing, whatever path it came through.

export const PROFILE_CONTACT_NAME_MAX = 120;
export const PROFILE_CONTACT_EMAIL_MAX = 254;
export const PROFILE_LOCATION_MAX = 300;

export const voiceBusinessProfiles = pgTable("voice_business_profiles", {
  id:                  serial("id").primaryKey(),
  firmId:              integer("firm_id")
                         .notNull()
                         .references(() => intakeFirms.id, { onDelete: "cascade" }),
  primaryContactName:  text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  defaultLocation:     text("default_location"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One profile per business; also the firm_id index every query uses.
  uniqueIndex("uq_voice_business_profiles_firm_id").on(table.firmId),
  check(
    "ck_voice_business_profiles_contact_name",
    sql`${table.primaryContactName} IS NULL OR char_length(${table.primaryContactName}) BETWEEN 1 AND 120`,
  ),
  check(
    "ck_voice_business_profiles_contact_email",
    sql`${table.primaryContactEmail} IS NULL OR (char_length(${table.primaryContactEmail}) BETWEEN 3 AND 254 AND ${table.primaryContactEmail} LIKE '%_@_%')`,
  ),
  check(
    "ck_voice_business_profiles_location",
    sql`${table.defaultLocation} IS NULL OR char_length(${table.defaultLocation}) BETWEEN 1 AND 300`,
  ),
]);

export type VoiceBusinessProfile = typeof voiceBusinessProfiles.$inferSelect;
