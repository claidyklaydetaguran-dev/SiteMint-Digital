/**
 * Keyword constants and pure helpers for SMS opt-out / re-opt-in / help handling.
 *
 * All exports are pure functions with no side effects, no DB access, and no Express
 * dependencies. Keyword matching is exact (trimmed, uppercased) — a body of
 * "STOP please" does NOT match because it normalizes to "STOP PLEASE".
 */

export const OPT_OUT_KEYWORDS = [
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",
] as const;

export const OPT_IN_KEYWORDS = [
  "START", "YES", "UNSTOP",
] as const;

export const HELP_KEYWORDS = [
  "HELP",
] as const;

/** Trim surrounding whitespace and uppercase. */
export function normalizeKeyword(body: string): string {
  return body.trim().toUpperCase();
}

/** Exact match — only whole-body opt-out keywords trigger opt-out. */
export function isOptOut(normalized: string): boolean {
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(normalized);
}

/**
 * Exact match for re-opt-in keywords.
 * Caller must ALSO check conversation.status === "opted_out" before acting —
 * "YES" in an active conversation is a normal reply and must reach the LLM.
 */
export function isOptIn(normalized: string): boolean {
  return (OPT_IN_KEYWORDS as readonly string[]).includes(normalized);
}

export function isHelp(normalized: string): boolean {
  return (HELP_KEYWORDS as readonly string[]).includes(normalized);
}
