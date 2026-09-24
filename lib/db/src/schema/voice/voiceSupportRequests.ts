import { pgTable, serial, integer, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "../intakeAgent";

// ── Support requests a business can actually send ───────────────────────────
// Versioned-migration-only (voice domain journal, 0013).
//
// Support used to be a contact card: an email address and a promise that
// somebody would reply. Nothing was recorded, so a business could not see that
// its request had been received, what state it was in, or what was said before
// — and SiteMint had no list of what was outstanding. These two tables are the
// smallest thing that makes those questions answerable.
//
// Ownership is the whole point of the firm_id columns: a request belongs to one
// business, every query filters on it, and another business's id reads as
// missing rather than forbidden. `voice_support_messages.firm_id` is
// denormalised for exactly that reason — the thread can be scoped without
// joining, so a mistake in one query cannot leak another firm's thread.
//
// What is deliberately NOT here: attachments, assignment, priorities and SLAs.
// A request, its thread, and its state are what a pilot needs; anything more
// would be a support desk nobody staffs yet.

export const SUPPORT_SUBJECT_MAX = 160;
export const SUPPORT_BODY_MAX = 4000;
export const SUPPORT_EMAIL_MAX = 254;

/** What the business says the request is about. Chosen from a fixed list. */
export const SUPPORT_CATEGORIES = ["question", "problem", "billing", "other"] as const;
export type VoiceSupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/**
 * Where a request stands, in the words a business reads:
 *
 *  - `open`         received, nobody from SiteMint has replied yet.
 *  - `in_progress`  SiteMint is working on it.
 *  - `answered`     SiteMint replied and is waiting on the business.
 *  - `closed`       finished. Either side can close it; a new message reopens.
 */
export const SUPPORT_STATUSES = ["open", "in_progress", "answered", "closed"] as const;
export type VoiceSupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Who wrote a message in the thread. */
export const SUPPORT_AUTHORS = ["business", "sitemint"] as const;
export type VoiceSupportAuthor = (typeof SUPPORT_AUTHORS)[number];

export const voiceSupportRequests = pgTable("voice_support_requests", {
  id:        serial("id").primaryKey(),
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  subject:   text("subject").notNull(),
  category:  text("category").notNull().default("question"),
  status:    text("status").notNull().default("open"),
  /**
   * The account address at the time of writing, so a reply goes where the
   * person who asked can read it even if the account email later changes.
   */
  requestedByEmail: text("requested_by_email").notNull(),
  /** When the last message landed, whoever wrote it. Orders the list. */
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  /**
   * When SiteMint's own inbox was told about this request. Null means nobody
   * has been alerted — the request is still recorded and visible, and the
   * dashboard says so rather than implying someone is already reading it.
   */
  operatorNotifiedAt: timestamp("operator_notified_at", { withTimezone: true }),
  closedAt:  timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_support_requests_firm_created").on(table.firmId, table.createdAt),
  index("ix_voice_support_requests_firm_status").on(table.firmId, table.status),
  check("ck_voice_support_requests_subject", sql`char_length(${table.subject}) BETWEEN 1 AND 160`),
  check("ck_voice_support_requests_email", sql`char_length(${table.requestedByEmail}) BETWEEN 3 AND 254 AND ${table.requestedByEmail} LIKE '%_@_%'`),
  check("ck_voice_support_requests_category", sql`${table.category} IN ('question', 'problem', 'billing', 'other')`),
  check("ck_voice_support_requests_status", sql`${table.status} IN ('open', 'in_progress', 'answered', 'closed')`),
  // The state and its evidence cannot drift apart: only a closed request
  // carries a closing time, and a closed one always does.
  check("ck_voice_support_requests_closed_is_stamped", sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL)`),
]);

export const voiceSupportMessages = pgTable("voice_support_messages", {
  id:        serial("id").primaryKey(),
  requestId: integer("request_id")
               .notNull()
               .references(() => voiceSupportRequests.id, { onDelete: "cascade" }),
  /** Denormalised so a thread read is firm-scoped without a join. */
  firmId:    integer("firm_id")
               .notNull()
               .references(() => intakeFirms.id, { onDelete: "cascade" }),
  author:    text("author").notNull(),
  body:      text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_support_messages_request_created").on(table.requestId, table.createdAt),
  index("ix_voice_support_messages_firm_created").on(table.firmId, table.createdAt),
  check("ck_voice_support_messages_author", sql`${table.author} IN ('business', 'sitemint')`),
  check("ck_voice_support_messages_body", sql`char_length(${table.body}) BETWEEN 1 AND 4000`),
]);

export type VoiceSupportRequest = typeof voiceSupportRequests.$inferSelect;
export type VoiceSupportMessage = typeof voiceSupportMessages.$inferSelect;
