/**
 * Frontend V2 Phase 6 — product readiness tiers for the sign-in page.
 *
 * CONTENT-SPECIFICATION.md §4.1 and INFORMATION-ARCHITECTURE.md §3 make the
 * three-tier labelling mandatory wherever a capability appears, and the
 * sign-in page is the last public surface that did not carry it.
 *
 * The wording is character-for-character the same as the public site's
 * `artifacts/web-agency/src/components/v2/home/readiness.ts`, which the
 * landing page and the Phase 5 signup page both read. It is duplicated rather
 * than imported because helpdesk and web-agency are separate Vite applications
 * with no shared component package between them, and adding one would be a new
 * dependency this phase forbids. `loginContract.test.ts` asserts the two files
 * still agree, so they cannot drift apart silently.
 *
 * No import, for the same portability reason as `loginContract.ts`.
 */

export type ReadinessTier = "available" | "in-development" | "planned";

export const READINESS: Record<ReadinessTier, { label: string }> = {
  available: { label: "Available now" },
  "in-development": { label: "In development" },
  planned: { label: "Planned" },
};

/**
 * The three capabilities, in the order the public site states them. The
 * sign-in page shows the capability and its tier only — the landing page's
 * longer descriptions would turn this into a marketing block beside a form.
 */
export const CAPABILITY_STATUS: Array<{ capability: string; tier: ReadinessTier }> = [
  { capability: "SMS Receptionist", tier: "available" },
  { capability: "Voice experience", tier: "in-development" },
  { capability: "Connected CRM and automated follow-up", tier: "planned" },
];
