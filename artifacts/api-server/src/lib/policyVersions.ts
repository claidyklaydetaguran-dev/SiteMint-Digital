// The Terms and Privacy Policy versions a new business accepts at signup.
//
// A version is the date its wording took effect (YYYY-MM-DD). Change it only
// together with the policy text in artifacts/web-agency/src/pages/legal/
// policyVersions.ts; the signup form sends the versions it displayed, and a
// mismatch means the person agreed to wording that is no longer current, so
// signup is refused with a request to reload rather than recording the wrong
// version.

import type { PolicyKind } from "@workspace/db/schema/voice";

export const CURRENT_POLICY_VERSIONS: Readonly<Record<PolicyKind, string>> = {
  terms: "2026-09-17",
  privacy: "2026-09-17",
};

export type PolicyCheck =
  | { ok: true; accepted: Array<{ policy: PolicyKind; version: string }> }
  | { ok: false; reason: "not_accepted" | "outdated" };

/**
 * `acceptedPolicies` is the body's `{ terms, privacy }` map of displayed
 * versions. Both must be present and current, and the explicit acceptance
 * flag must be true.
 */
export function checkPolicyAcceptance(acceptedTerms: unknown, acceptedPolicies: unknown): PolicyCheck {
  if (acceptedTerms !== true) return { ok: false, reason: "not_accepted" };
  const shown = (acceptedPolicies ?? {}) as Record<string, unknown>;
  if (typeof shown !== "object" || shown === null) return { ok: false, reason: "not_accepted" };
  const accepted: Array<{ policy: PolicyKind; version: string }> = [];
  for (const policy of ["terms", "privacy"] as const) {
    if (typeof shown[policy] !== "string") return { ok: false, reason: "not_accepted" };
    if (shown[policy] !== CURRENT_POLICY_VERSIONS[policy]) return { ok: false, reason: "outdated" };
    accepted.push({ policy, version: CURRENT_POLICY_VERSIONS[policy] });
  }
  return { ok: true, accepted };
}

export const POLICY_MESSAGES = {
  not_accepted: "Please read and accept the Terms and the Privacy Policy to continue.",
  outdated: "Our Terms or Privacy Policy changed while this page was open. Reload the page, review them, and try again.",
} as const;

/** Current versions for the legacy invite path, which only sends the acceptance flag. */
export function currentPolicyAcceptances(): Array<{ policy: PolicyKind; version: string }> {
  return (["terms", "privacy"] as const).map((policy) => ({ policy, version: CURRENT_POLICY_VERSIONS[policy] }));
}
