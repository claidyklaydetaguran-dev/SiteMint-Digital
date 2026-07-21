import { DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION, type DiscoverySubmissionContract } from "./discoveryContract";

// ── Canonical idempotency payload (v1) ────────────────────────────────────────
// Phase 2C.2B (docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md §18,
// finalized 2C.2A.3). Pure, deterministic — no I/O, no randomness, no
// timestamps generated here. Input type is `DiscoverySubmissionContract`
// (validated answers only, never `DiscoverySubmissionRequest`), so transport
// metadata (idempotencyKey, honeypot, formStartedAt, schemaVersion,
// formVersion) and every server/database-generated field are structurally
// excluded — there is no code path by which they could leak into the
// canonical form. This module never hashes anything itself (no key
// material handled here) — see artifacts/api-server/src/lib/discoveryHmac.ts
// for the server-only HMAC step that consumes this function's output.
//
// Determinism rules:
// - Object keys are sorted alphabetically at every level, never relying on
//   the caller's original insertion order — two logically identical answer
//   objects built in different key orders canonicalize identically.
// - Arrays preserve their original element order by default, because most
//   arrays in this contract carry order that is semantically meaningful
//   (e.g. `projectScope.features`, a prospect's own selection/priority
//   order; `readiness.referenceSites`, a preference order). Only the arrays
//   explicitly listed in SET_LIKE_ARRAY_PATHS below are treated as
//   order-insensitive sets and sorted — these are genuinely unordered
//   multi-select fields (secondary interests/goals, integrations).
// - An explicit `null` (only possible on fields the contract marks
//   `.nullable()`) is preserved as `null` in the canonical output — distinct
//   from an absent/optional key, which is simply not present in the output.
//   This lets "the prospect explicitly said there's no deadline reason"
//   canonicalize differently from "this field was never asked."
// - Strings are trimmed defensively (idempotent — the contract already
//   trims on validation) so canonical equality never depends on incidental
//   whitespace differences.

const SET_LIKE_ARRAY_PATHS: ReadonlySet<string> = new Set([
  "projectDirection.secondaryInterests",
  "decisionContext.secondaryGoals",
  "readiness.integrations",
]);

function compareCanonical(a: unknown, b: unknown): number {
  const as = JSON.stringify(a);
  const bs = JSON.stringify(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function canonicalizeValue(value: unknown, path: string): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const canonicalizedItems = value.map((item) => canonicalizeValue(item, `${path}[]`));
    if (SET_LIKE_ARRAY_PATHS.has(path)) {
      return [...canonicalizedItems].sort(compareCanonical);
    }
    return canonicalizedItems;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const childPath = path ? `${path}.${key}` : key;
      result[key] = canonicalizeValue(obj[key], childPath);
    }
    return result;
  }
  // number | boolean — already canonical as-is.
  return value;
}

export interface CanonicalDiscoveryPayload {
  canonicalizationVersion: typeof DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION;
  answers: unknown;
}

// Never store or log the returned string as-is — only its HMAC digest (see
// discoveryHmac.ts) is ever persisted (PRD §18).
export function canonicalizeDiscoveryPayload(answers: DiscoverySubmissionContract): string {
  const canonical: CanonicalDiscoveryPayload = {
    canonicalizationVersion: DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION,
    answers: canonicalizeValue(answers, ""),
  };
  return JSON.stringify(canonical);
}
