/**
 * Frontend V2 Phase 10 — the truth layer for the Contacts workspace.
 *
 * ── The binding fact this module encodes ──────────────────────────────────
 *
 * **This product has no contact records.** Not "none yet for this firm" — none
 * anywhere in the receptionist surface. The evidence, verified in Phase 10
 * discovery:
 *
 *  • **No schema.** `lib/db/src/schema/intakeAgent.ts` defines five tables —
 *    `intake_firms`, `intake_conversations`, `intake_messages`, `intake_cases`
 *    and `receptionist_sessions`. None of them is a contact table, and the only
 *    column in any of them that identifies a person is
 *    `intake_conversations.caller_phone`. There is no name, email or company
 *    column for the people who text a business.
 *
 *  • **No endpoint.** The receptionist routers expose nothing that reads,
 *    writes, searches or lists a contact. The only `/contacts` endpoints in the
 *    repository are `GET|POST|PATCH /api/helpdesk/contacts` in
 *    `routes/helpdesk.ts`, and every one of them is gated by `requireAdmin` —
 *    the CRM's `Authorization: Bearer` system. `CLAUDE.md` records that file as
 *    legacy CRM-auth-only routes and forbids merging the two auth systems, so
 *    this dashboard — which authenticates with the httpOnly
 *    `receptionist_session` cookie — cannot call them and must not try.
 *
 *  • **Phase 8 already documented it.** `conversationsContract.ts` states that
 *    the conversations API "returns `callerPhone` and nothing else that
 *    identifies a person", which is why that workspace has no contact names.
 *
 * So this route fetches nothing. It has no query, no query key, no cache entry,
 * no retry, no refetch and no polling, because there is no endpoint for it to
 * call. That is not an omission to be filled in later by this phase — it is the
 * accurate shape of the product.
 *
 * ── What the previous workspace claimed ───────────────────────────────────
 *
 * The page this replaces promised a full contact directory with three
 * capabilities that do not exist: a log of calls (this is an SMS product), a
 * per-contact tier (tier belongs to a scored *case*, one per conversation), and
 * scoring applied to people rather than cases. `/contacts/:id` rendered the
 * literal developer string "Contact Detail stub" to any authenticated operator
 * who reached it.
 *
 * This module replaces both with what is verifiably true, and nothing else.
 *
 * ── What is deliberately not built ────────────────────────────────────────
 *
 * No list, no rows, no selection, no detail panel, no search field, no filters,
 * no pagination, no counts, no tags, no lifecycle or lead status, no
 * last-contacted timestamp, no import, export, merge, archive or delete. Every
 * one of those would require a contract that does not exist, and a search box
 * over zero records is a lie told with an input element.
 *
 * The one action offered is a link to Conversations, which is real, is already
 * firm-scoped by the server session, and is where a caller's phone number
 * actually lives.
 */

// ─── Availability ──────────────────────────────────────────────────────────

/**
 * Why the workspace shows no directory.
 *
 * A single literal, not a boolean, so a caller cannot write
 * `if (!unavailable)` and render a fictional list in the other branch. When a
 * real contact contract exists, this union gains a member and every consumer
 * must handle it explicitly.
 */
export type ContactsAvailability = "no-contact-records";

export interface AvailabilityCopy {
  /** Neutral: nothing is broken and nothing needs attention. */
  tone: "neutral";
  title: string;
  detail: string;
}

/**
 * The headline statement. Phrased as a fact about the product rather than as a
 * promise about a release, because no dated commitment exists in the repository
 * to support one — and the copy it replaces invented three features.
 *
 * It describes the *product*, not the account: "this account has none" would be
 * a claim about stored data that this route never queries. What is verified is
 * that no contact table and no contact endpoint exist at all.
 */
export function availabilityCopy(): AvailabilityCopy {
  return {
    tone: "neutral",
    title: "No separate contact records are stored",
    detail:
      "Your SMS Receptionist identifies conversations by the phone number they come from. It does not store a separate contact directory.",
  };
}

// ─── What is actually recorded ─────────────────────────────────────────────

export interface RecordedField {
  label: string;
  /** `true` only where a real column backs the field. */
  recorded: boolean;
  detail: string;
}

/**
 * A reading of `intake_conversations`, field by field.
 *
 * This exists so the page can answer "what is actually kept about the people
 * who contact me?" concretely instead of gesturing at it. Every `true` row
 * names a column that exists; every `false` row is absent from the schema.
 *
 * These are fields stored *with a conversation*. Nothing here describes a
 * contact record, because none exists.
 */
export function recordedFields(): RecordedField[] {
  return [
    {
      label: "Phone number",
      recorded: true,
      detail:
        "The phone number the conversation comes from. This is the only person identifier available here.",
    },
    {
      label: "Name",
      recorded: false,
      detail: "Not collected. The SMS Receptionist does not ask for or store a name.",
    },
    {
      label: "Email address",
      recorded: false,
      detail: "Not collected by the SMS Receptionist.",
    },
    {
      label: "Company",
      recorded: false,
      detail: "Not collected.",
    },
  ];
}

/** The count of genuinely stored identity fields — derived, never asserted. */
export function recordedCount(fields: readonly RecordedField[] = recordedFields()): number {
  return fields.filter((field) => field.recorded).length;
}

// ─── Where the real information is ─────────────────────────────────────────

export interface Destination {
  /** Base-relative; the wouter `base` prop resolves the configured prefix. */
  href: string;
  label: string;
  detail: string;
}

/**
 * The single real action on this route.
 *
 * `View conversations` describes exactly what the link does. It is not
 * "View contacts", not "Start conversation" and not "Send message" — the
 * dashboard has no outbound SMS contract at all, as Phase 8 established.
 *
 * The detail deliberately claims no historical completeness. The list endpoint
 * returns the conversation records that are available to the session; nothing
 * in the repository proves total coverage, unlimited retention, or that every
 * number that ever texted still appears. "Available conversation records" is
 * what can be supported, so it is what is said. Status and tier are qualified
 * with "when present" because `tier` is nullable and a case may be unscored.
 */
export function conversationsDestination(): Destination {
  return {
    href: "/conversations",
    label: "View conversations",
    detail:
      "Phone numbers appear under Conversations as part of the available conversation records, together with stored status and tier information when present.",
  };
}

// ─── The detail route ──────────────────────────────────────────────────────

export interface DetailCopy {
  title: string;
  detail: string;
}

/**
 * `/contacts/:id` resolves to no record, for every possible `:id`.
 *
 * The route stays registered so a stored link or a typed URL lands somewhere
 * coherent instead of falling through to the generic 404, but it cannot show a
 * contact and does not pretend the identifier was merely wrong or expired —
 * there is no table it could have been found in.
 *
 * The copy does not describe the URL as a pointer to some existing record. No
 * contact-detail contract exists, so it addresses nothing — and calling it a
 * pointer would imply a target that was checked and found missing. The reason
 * given is the product's, not the account's.
 *
 * The identifier is deliberately not echoed back into the page. It is
 * unvalidated URL input, it carries no meaning here, and reflecting it would
 * suggest a lookup happened.
 */
export function detailCopy(): DetailCopy {
  return {
    title: "No contact record is available",
    detail:
      "This SMS Receptionist does not store separate contact records, so this route cannot load a contact. Nothing was looked up.",
  };
}
