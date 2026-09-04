/**
 * Discovery submission contract — W-9/W-11. Mirrors the `signupContract.ts`
 * pattern: everything that has to stay exact (endpoint, payload shape,
 * status-to-message mapping) lives here as pure functions, separate from the
 * component that calls them.
 *
 * Endpoint choice: `POST /api/v1/discovery-submissions`
 * (`artifacts/api-server/src/routes/discoveryV1.ts`, read-only). Its request
 * body is `{ meta, answers }` where `meta` is `DiscoveryTransportMeta`
 * (idempotencyKey, formVersion, schemaVersion, optional honeypot,
 * formStartedAt) and `answers` is `DiscoverySubmissionContract` — exactly
 * what `validateDiscoverySubmission()` in `discoveryFormModel.ts` already
 * produces. The route computes its own HMAC/fingerprint server-side from
 * `answers` and a server-only key (`discoveryHmac.ts`); it never expects the
 * browser to send a signature, so this is the correct endpoint — the
 * alternative `POST /api/discovery/submit` route was not used.
 */

import {
  DiscoverySubmissionContract,
  DISCOVERY_FORM_VERSION,
  DISCOVERY_SCHEMA_VERSION,
} from "@workspace/discovery-contract";

export const DISCOVERY_SUBMIT_ENDPOINT = "/api/v1/discovery-submissions";
export const DISCOVERY_SUBMIT_METHOD = "POST";

export interface DiscoverySubmitRequestBody {
  meta: {
    idempotencyKey: string;
    formVersion: string;
    schemaVersion: string;
    formStartedAt: string;
  };
  answers: DiscoverySubmissionContract;
}

export function buildDiscoverySubmitBody(
  answers: DiscoverySubmissionContract,
  idempotencyKey: string,
  formStartedAt: string,
): DiscoverySubmitRequestBody {
  return {
    meta: {
      idempotencyKey,
      formVersion: DISCOVERY_FORM_VERSION,
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      formStartedAt,
    },
    answers,
  };
}

export type DiscoverySubmitOutcome =
  | { kind: "success"; reference: string }
  | { kind: "duplicate"; reference: string }
  | { kind: "service_unavailable"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "validation_error"; message: string }
  | { kind: "idempotency_conflict"; message: string }
  | { kind: "network_error"; message: string }
  | { kind: "server_error"; message: string };

const GENERIC_SERVER_ERROR =
  "Something went wrong on our end. Your answers are still saved — please try again.";

export const DISCOVERY_NETWORK_ERROR =
  "We couldn't reach the server. Your answers are still saved here — check your connection and try again.";

/**
 * Maps a fetch Response to a typed outcome. Never throws — a malformed JSON
 * body still resolves to a `server_error` outcome rather than propagating.
 */
export async function mapDiscoverySubmitResponse(
  res: Response,
): Promise<DiscoverySubmitOutcome> {
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON body — fall through to the status-based mapping below.
  }

  if (res.status === 503) {
    return {
      kind: "service_unavailable",
      message:
        typeof body.message === "string"
          ? body.message
          : "Submissions are not open yet.",
    };
  }
  if (res.status === 429) {
    return {
      kind: "rate_limited",
      message:
        typeof body.message === "string"
          ? body.message
          : "Too many attempts. Please try again later.",
    };
  }
  if (res.status === 400) {
    return {
      kind: "validation_error",
      message: "Some answers didn't pass validation. Please review the brief and try again.",
    };
  }
  if (res.status === 409) {
    return {
      kind: "idempotency_conflict",
      message:
        typeof body.message === "string"
          ? body.message
          : "This submission conflicts with a previous one. Please start over.",
    };
  }
  if (res.status === 200 || res.status === 201) {
    const reference = typeof body.reference === "string" ? body.reference : "";
    return res.status === 200
      ? { kind: "duplicate", reference }
      : { kind: "success", reference };
  }
  return { kind: "server_error", message: GENERIC_SERVER_ERROR };
}

/**
 * Submits the brief. Resolves to a `network_error` outcome (never throws)
 * when `fetch` itself fails — the caller keeps the filled-in draft either
 * way so the visitor can retry without re-entering anything.
 */
export async function submitDiscoveryBrief(
  body: DiscoverySubmitRequestBody,
): Promise<DiscoverySubmitOutcome> {
  try {
    const res = await fetch(DISCOVERY_SUBMIT_ENDPOINT, {
      method: DISCOVERY_SUBMIT_METHOD,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await mapDiscoverySubmitResponse(res);
  } catch {
    return { kind: "network_error", message: DISCOVERY_NETWORK_ERROR };
  }
}

// ── Idempotency key lifecycle (sessionStorage) — W-9/W-11 duplicate
// prevention. One key per fill-in session: created when the form phase
// starts, reused across saves/resumes within the same browser tab, and
// cleared on a successful/duplicate submission or an explicit start-over so
// the next brief gets a fresh key. ──────────────────────────────────────────

const IDEMPOTENCY_KEY_STORAGE_KEY = "sm_discovery_idempotency_key_v1";
const FORM_STARTED_AT_STORAGE_KEY = "sm_discovery_started_at_v1";
const SUBMITTED_MARKER_STORAGE_KEY = "sm_discovery_submitted_v1";

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (very old browsers).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Gets (or lazily creates) this session's idempotency key + start time. */
export function getOrCreateSubmissionSession(): {
  idempotencyKey: string;
  formStartedAt: string;
} {
  try {
    const existingKey = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE_KEY);
    const existingStartedAt = sessionStorage.getItem(FORM_STARTED_AT_STORAGE_KEY);
    if (existingKey && existingStartedAt) {
      return { idempotencyKey: existingKey, formStartedAt: existingStartedAt };
    }
    const idempotencyKey = randomUuid();
    const formStartedAt = new Date().toISOString();
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE_KEY, idempotencyKey);
    sessionStorage.setItem(FORM_STARTED_AT_STORAGE_KEY, formStartedAt);
    return { idempotencyKey, formStartedAt };
  } catch {
    // sessionStorage unavailable (private mode, quota) — a fresh key per
    // attempt is still safe; it just loses cross-reload de-duplication.
    return { idempotencyKey: randomUuid(), formStartedAt: new Date().toISOString() };
  }
}

/** True once this session's key has already been successfully submitted. */
export function isSessionAlreadySubmitted(idempotencyKey: string): boolean {
  try {
    return sessionStorage.getItem(SUBMITTED_MARKER_STORAGE_KEY) === idempotencyKey;
  } catch {
    return false;
  }
}

export function markSessionSubmitted(idempotencyKey: string): void {
  try {
    sessionStorage.setItem(SUBMITTED_MARKER_STORAGE_KEY, idempotencyKey);
  } catch {
    // ignore
  }
}

/** Clears the whole submission session — a fresh brief gets a fresh key. */
export function clearSubmissionSession(): void {
  try {
    sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE_KEY);
    sessionStorage.removeItem(FORM_STARTED_AT_STORAGE_KEY);
    sessionStorage.removeItem(SUBMITTED_MARKER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
