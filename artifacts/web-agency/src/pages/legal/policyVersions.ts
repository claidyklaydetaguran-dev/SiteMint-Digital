/**
 * The Terms and Privacy Policy versions this site shows.
 *
 * A version is the date the wording took effect. It must equal
 * CURRENT_POLICY_VERSIONS in artifacts/api-server/src/lib/policyVersions.ts:
 * signup sends the versions the person saw, and the server records them with
 * its own timestamp (or refuses, if the page is out of date). Change both,
 * together with the wording in components/legal/PolicyBodies.tsx.
 */

export const POLICY_VERSIONS = {
  terms: "2026-09-17",
  privacy: "2026-09-17",
} as const;

export type PolicyKind = keyof typeof POLICY_VERSIONS;

/** "17 September 2026" — the date a person reads, from the version string. */
export function policyDateLabel(version: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version);
  if (!match) return version;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : version;
}
