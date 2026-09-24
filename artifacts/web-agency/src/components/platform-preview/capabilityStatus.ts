/**
 * Honest capability labeling (Checkpoint 2A.1). Every capability the
 * prototype represents — a system-flow stage, a product — is classified
 * into exactly one of these four states so the premium visual experience
 * never implies more is live than actually is. Grounded in the real
 * repository state documented in docs/sitemint-platform/DESIGN_TOKEN_AUDIT.md
 * and root CLAUDE.md (e.g. analytics is genuinely unimplemented anywhere in
 * the repo — PRD §24 — so no stage claims it as available).
 */

export type CapabilityLevel = "available" | "in-development" | "planned" | "conceptual";

export const capabilityLabels: Record<CapabilityLevel, string> = {
  available: "Available now",
  "in-development": "In development",
  planned: "Planned direction",
  conceptual: "Conceptual demonstration",
};

/** Maps to the design-tokens statusbadge component tokens (already
 * accessibility-corrected — see lib/design-tokens/src/semantic.css). */
export const capabilityTokenKey: Record<CapabilityLevel, "success" | "info" | "warning" | "neutral"> = {
  available: "success",
  "in-development": "info",
  planned: "warning",
  conceptual: "neutral",
};
