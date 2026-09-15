import {
  pgTable, serial, text, integer, boolean, timestamp, customType, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M3: documents, document requests, and controlled sharing ────────────────
//
// PUSH-MODE tables (shared barrel), additive only.
//
// Storage decision: file bytes live in PostgreSQL, in a table of their own.
// The deployment target is Replit Autoscale, whose filesystem is ephemeral and
// per-instance — a file written to disk by one instance is gone on the next
// deploy and invisible to every other instance. Object storage would be the
// right answer at volume, but it is a provider decision nobody has made, and
// an adapter pointing at nothing is not storage. Bytes in the database work in
// every environment today and move cleanly behind an adapter later.
//
// Blobs are split from metadata so that listing documents never drags file
// contents through memory — every list query touches `crm_attachments` only.

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() { return "bytea"; },
});

export const crmAttachmentBlobs = pgTable("crm_attachment_blobs", {
  attachmentId: integer("attachment_id").primaryKey(),
  bytes:        bytea("bytes").notNull(),
});

export type CrmAttachmentBlob = typeof crmAttachmentBlobs.$inferSelect;

// ── Document requests ───────────────────────────────────────────────────────
//
// "Waiting for documents" on the Command Center should mean somebody actually
// asked for something and it has not arrived — not a proposal status guessed
// at from a lead row. This is that record.

export const CRM_DOC_REQUEST_STATUSES = ["pending", "received", "cancelled"] as const;
export type CrmDocRequestStatus = (typeof CRM_DOC_REQUEST_STATUSES)[number];

export const crmDocumentRequests = pgTable("crm_document_requests", {
  id:                 serial("id").primaryKey(),
  /** What the document belongs to: contact/lead, deal, project or ticket. */
  entityType:         text("entity_type").notNull(),
  entityId:           integer("entity_id").notNull(),
  title:              text("title").notNull(),
  description:        text("description"),
  status:             text("status").notNull().default("pending"),
  requestedAt:        timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  dueDate:            timestamp("due_date", { withTimezone: true }),
  /** The staff member chasing it. */
  ownerStaffId:       integer("owner_staff_id"),
  requestedByStaffId: integer("requested_by_staff_id"),
  requestedByLabel:   text("requested_by_label").notNull(),
  receivedAt:         timestamp("received_at", { withTimezone: true }),
  /** The upload that satisfied the request, once one does. */
  receivedAttachmentId: integer("received_attachment_id"),
  cancelledAt:        timestamp("cancelled_at", { withTimezone: true }),
  notes:              text("notes"),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_document_requests_entity").on(table.entityType, table.entityId),
  index("ix_crm_document_requests_status_due").on(table.status, table.dueDate),
  check("ck_crm_document_requests_status",
    sql`${table.status} IN ('pending', 'received', 'cancelled')`),
]);

export type CrmDocumentRequest = typeof crmDocumentRequests.$inferSelect;

// ── Expiring, revocable share links ─────────────────────────────────────────
//
// Only the sha256 of the token is stored, so a leaked database row cannot be
// turned back into a working link. Every download is counted and the link can
// be revoked or expired — an unguessable URL on its own is not access control.

export const crmDocumentShares = pgTable("crm_document_shares", {
  id:               serial("id").primaryKey(),
  attachmentId:     integer("attachment_id").notNull(),
  tokenHash:        text("token_hash").notNull(),
  createdByStaffId: integer("created_by_staff_id"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt:        timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt:        timestamp("revoked_at", { withTimezone: true }),
  /** Null means unlimited within the expiry window. */
  maxDownloads:     integer("max_downloads"),
  downloadCount:    integer("download_count").notNull().default(0),
  lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
  /** Free-text note about who it was shared with, for the audit trail. */
  sharedWithLabel:  text("shared_with_label"),
}, (table) => [
  uniqueIndex("uq_crm_document_shares_token_hash").on(table.tokenHash),
  index("ix_crm_document_shares_attachment").on(table.attachmentId),
]);

export type CrmDocumentShare = typeof crmDocumentShares.$inferSelect;

// ── M3: internal calendar ───────────────────────────────────────────────────
//
// The team's own diary. Deliberately separate from the receptionist product's
// `scheduling_*` tables, which are a customer's booking data and not this
// agency's calendar.
//
// Times are absolute UTC instants; `timezone` records the zone the appointment
// was authored in so it can be displayed and edited in its original wall-clock
// terms, and so a DST shift does not silently move an existing booking.

export const CRM_APPOINTMENT_STATUSES = ["scheduled", "cancelled", "completed"] as const;
export type CrmAppointmentStatus = (typeof CRM_APPOINTMENT_STATUSES)[number];

export const crmAppointments = pgTable("crm_appointments", {
  id:               serial("id").primaryKey(),
  title:            text("title").notNull(),
  description:      text("description"),
  startAt:          timestamp("start_at", { withTimezone: true }).notNull(),
  endAt:            timestamp("end_at", { withTimezone: true }).notNull(),
  allDay:           boolean("all_day").notNull().default(false),
  /** IANA zone the appointment was created in. */
  timezone:         text("timezone").notNull().default("UTC"),
  location:         text("location"),
  meetingUrl:       text("meeting_url"),
  status:           text("status").notNull().default("scheduled"),

  /** What it is about — any or none of these. */
  leadId:           integer("lead_id"),
  projectId:        integer("project_id"),
  dealId:           integer("deal_id"),

  organizerStaffId: integer("organizer_staff_id"),
  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel:   text("created_by_label").notNull(),

  /** Minutes before start to remind attendees. Null means no reminder. */
  reminderMinutesBefore: integer("reminder_minutes_before"),

  /**
   * M4: the iCalendar SEQUENCE this appointment is currently at.
   *
   * RFC 5545 §3.8.7.4. An attendee's calendar replaces an event it already
   * holds only when the incoming message carries the SAME UID and a HIGHER
   * sequence — otherwise it either ignores the update or files a duplicate.
   * Bumped once per material change (see `crmAppointmentInvites.ts`), never
   * for a note tweak, and never reset.
   *
   * The UID needs no column: it is derived from `id`, so it is stable for the
   * life of the row by construction.
   */
  icalSequence:     integer("ical_sequence").notNull().default(0),

  cancelledAt:      timestamp("cancelled_at", { withTimezone: true }),
  cancelledByStaffId: integer("cancelled_by_staff_id"),
  cancelReason:     text("cancel_reason"),
  completedAt:      timestamp("completed_at", { withTimezone: true }),

  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_appointments_start").on(table.startAt),
  index("ix_crm_appointments_organizer").on(table.organizerStaffId, table.startAt),
  index("ix_crm_appointments_lead").on(table.leadId),
  check("ck_crm_appointments_status",
    sql`${table.status} IN ('scheduled', 'cancelled', 'completed')`),
  // An appointment that ends before it starts is not a schedule, it is a bug.
  check("ck_crm_appointments_order", sql`${table.endAt} >= ${table.startAt}`),
]);

export type CrmAppointment = typeof crmAppointments.$inferSelect;

/**
 * Attendees. A row is either internal (`staffId`) or external
 * (`externalEmail`) — the check keeps exactly one of those true, so an
 * attendee always resolves to somebody.
 */
export const crmAppointmentAttendees = pgTable("crm_appointment_attendees", {
  id:            serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull(),
  staffId:       integer("staff_id"),
  externalEmail: text("external_email"),
  externalName:  text("external_name"),
  /**
   * What staff recorded, NOT what the attendee answered. Nothing ingests an
   * RSVP reply, so this stays a human note even now that invitations are sent
   * — `invitationOutcome` below is the field that reflects a machine fact.
   */
  responseStatus: text("response_status").notNull().default("invited"),

  // ── M4: what the mail seam actually said about this person's invitation ───
  //
  // These record DELIVERY, not acceptance, and they use `staffMail.ts`'s own
  // vocabulary unchanged so there is one set of words in the system rather
  // than two. NULL means no invitation has ever been attempted for this row —
  // deliberately not a sixth word meaning the same thing.

  /** `sent` | `not_configured` | `rejected` | `failed` | `uncertain`, or NULL. */
  invitationOutcome:    text("invitation_outcome"),
  /** Why, in the provider's or the seam's own words. */
  invitationReason:     text("invitation_reason"),
  /** `REQUEST` or `CANCEL` — what the last message asked their calendar to do. */
  invitationMethod:     text("invitation_method"),
  /** The SEQUENCE that message carried, so a stale attendee is visible. */
  invitationSequence:   integer("invitation_sequence"),
  invitationAt:         timestamp("invitation_at", { withTimezone: true }),
  /** The provider's message id, when there was one. Traceability, not proof of reading. */
  invitationProviderId: text("invitation_provider_id"),

  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_appointment_attendees_appointment").on(table.appointmentId),
  uniqueIndex("uq_crm_appointment_attendees_staff").on(table.appointmentId, table.staffId),
  check("ck_crm_appointment_attendees_who",
    sql`(${table.staffId} IS NOT NULL) <> (${table.externalEmail} IS NOT NULL)`),
  check("ck_crm_appointment_attendees_response",
    sql`${table.responseStatus} IN ('invited', 'accepted', 'declined', 'tentative')`),
  // NULL passes: a row that has never been invited is not a bad row.
  check("ck_crm_appointment_attendees_invitation_outcome",
    sql`${table.invitationOutcome} IS NULL OR ${table.invitationOutcome} IN ('sent', 'not_configured', 'rejected', 'failed', 'uncertain')`),
  check("ck_crm_appointment_attendees_invitation_method",
    sql`${table.invitationMethod} IS NULL OR ${table.invitationMethod} IN ('REQUEST', 'CANCEL')`),
]);

export type CrmAppointmentAttendee = typeof crmAppointmentAttendees.$inferSelect;
