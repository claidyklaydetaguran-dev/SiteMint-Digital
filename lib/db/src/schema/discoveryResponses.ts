// ── Safe response and error contracts ────────────────────────────────────────
// Phase 2C.2B (docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md §30).
// Typed shapes for the FUTURE POST /api/v1/discovery-submissions endpoint —
// not wired to any route in this checkpoint. Every shape here is safe to
// serialize directly to an untrusted client: no database ID internals beyond
// an opaque public reference, no SQL/stack/provider detail, no key version,
// no duplicate classification, no operator identity, no internal queue
// state.

// Closed set of public-safe error codes needed by this and near-future
// phases. Deliberately excludes: database table names, SQL details, provider
// names (unless explicitly approved), key versions, duplicate
// classifications, operator IDs, internal queue states.
export const DISCOVERY_SAFE_ERROR_CODES = [
  "validation_error",
  "malformed_request",
  "payload_too_large",
  "submission_review",
  "rate_limited",
  "submission_already_received",
  "idempotency_conflict",
  "temporarily_unavailable",
  "server_error",
] as const;

export type DiscoverySafeErrorCode = (typeof DISCOVERY_SAFE_ERROR_CODES)[number];

// 201 — storage of the client's answers is the sole definition of success
// (PRD §26); `reference` is an opaque, client-safe identifier, never the raw
// database primary key format guaranteed or documented as such.
export interface DiscoveryAcceptedResponse {
  status: "received";
  reference: string;
}

// 200/201 — same idempotency key, canonical-payload-hash match (PRD §18/§24
// scenario 1). Returns the original submission's safe representation again,
// never a new row.
export interface DiscoveryAlreadyReceivedResponse {
  code: "submission_already_received";
  reference: string;
}

// 409 — same idempotency key, canonical-payload-hash mismatch (PRD §24
// scenario 2/§30). Message text is fixed by the PRD; never overwrites or
// exposes the original submission's content.
export const DISCOVERY_IDEMPOTENCY_CONFLICT_MESSAGE =
  "This submission session has already been used. Please refresh the form and try again.";

export interface DiscoveryIdempotencyConflictResponse {
  code: "idempotency_conflict";
  message: typeof DISCOVERY_IDEMPOTENCY_CONFLICT_MESSAGE;
}

// 400 — safe structured field errors only: a client-safe field path (dot
// notation matching the contract's own category/field names, e.g.
// "contact.email") and a short human-readable message. Never a raw zod
// issue object, internal schema path beyond the field identifier, or stack
// trace.
export interface DiscoveryFieldError {
  field: string;
  message: string;
}

export interface DiscoveryValidationFailureResponse {
  code: "validation_error";
  fieldErrors: DiscoveryFieldError[];
}

// 500/503 — generic, retry-safe; never database/provider detail.
export interface DiscoveryTemporaryFailureResponse {
  code: "temporarily_unavailable" | "server_error";
  message: string;
  retryable: true;
}

export type DiscoverySafeResponse =
  | DiscoveryAcceptedResponse
  | DiscoveryAlreadyReceivedResponse
  | DiscoveryIdempotencyConflictResponse
  | DiscoveryValidationFailureResponse
  | DiscoveryTemporaryFailureResponse;
