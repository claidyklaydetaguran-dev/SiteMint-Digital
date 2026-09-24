// AR-001G: fail-closed admin authentication.
//
// The admin login route previously fell back to a hardcoded literal whenever
// the environment variable was unset, so any deployment that forgot to set it
// accepted a password committed to this repository. The literal is gone and is
// deliberately not repeated anywhere — not in this comment, not in a test, and
// not in the documentation — so that reading the current tree cannot recover
// it. There is no fallback here in any environment: without an explicitly
// configured secret the admin login is *unavailable* rather than guessable.
//
// The secret itself is never logged, never returned, and never included in a
// thrown message. Nothing is read at module import time.

import crypto from "crypto";

export const ADMIN_PASSWORD_ENV_VAR = "ADMIN_PASSWORD";

/**
 * `unconfigured` is deliberately distinct from `mismatch`. An operator whose
 * deployment is missing the secret needs to see a different outcome from a
 * user who typed the wrong password, and a client must not be invited to keep
 * retrying against a server that can never accept any password.
 */
export type AdminPasswordVerdict = "unconfigured" | "mismatch" | "match";

/** The only environment field this module reads. */
export interface AdminPasswordEnv {
  ADMIN_PASSWORD?: string | undefined;
}

/**
 * Fixed-width digest of the input.
 *
 * `crypto.timingSafeEqual` throws on buffers of unequal length, so comparing
 * raw candidate bytes would both crash on a length mismatch and leak the
 * secret's length through that difference in behaviour. Comparing SHA-256
 * digests instead makes every comparison exactly 32 bytes wide regardless of
 * the candidate's length or encoding, so a wrong password of any length —
 * including a multi-byte Unicode one — takes the same comparison path.
 */
function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/** True only when an explicit, non-empty secret is configured. */
export function isAdminPasswordConfigured(env: AdminPasswordEnv): boolean {
  const secret = env[ADMIN_PASSWORD_ENV_VAR];
  return typeof secret === "string" && secret.length > 0;
}

/**
 * Verifies a candidate password against the configured secret.
 *
 * An absent or empty secret short-circuits to `unconfigured` *before* any
 * comparison happens, so nothing is ever compared against an empty or
 * undefined secret — in particular, an empty candidate can never match an
 * empty secret, because that state is not a comparison at all.
 *
 * Once a secret exists, every candidate — a string, an empty string, a
 * number, an object, `undefined` — takes the identical digest-and-compare
 * path, so no incorrect value is distinguishable from another by timing or by
 * outcome.
 */
export function verifyAdminPassword(candidate: unknown, env: AdminPasswordEnv): AdminPasswordVerdict {
  const secret = env[ADMIN_PASSWORD_ENV_VAR];
  if (typeof secret !== "string" || secret.length === 0) {
    return "unconfigured";
  }

  const candidateText = typeof candidate === "string" ? candidate : "";
  const matches = crypto.timingSafeEqual(digest(candidateText), digest(secret));
  return matches ? "match" : "mismatch";
}
