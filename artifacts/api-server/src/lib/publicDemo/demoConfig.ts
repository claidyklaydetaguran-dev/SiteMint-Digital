// V5 blueprint §10: the controlled live-demo capability flag and its two
// operating caps. Fail-closed by construction: even with the flag on, the
// route (routes/publicDemo.ts) still needs a configured DemoSessionProvider
// (demoSessionProvider.ts) before a session can start — this module owns
// only "is the capability switched on, and what are its limits", never a
// provider connection of any kind.

export const PUBLIC_DEMO_ENABLED_ENV_VAR = "PUBLIC_DEMO_ENABLED";
export const PUBLIC_DEMO_MAX_CONCURRENT_ENV_VAR = "PUBLIC_DEMO_MAX_CONCURRENT";
export const PUBLIC_DEMO_DAILY_CAP_CENTS_ENV_VAR = "PUBLIC_DEMO_DAILY_CAP_CENTS";

/** True only for the exact string "true" — same contract as every other capability flag. */
export function isPublicDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[PUBLIC_DEMO_ENABLED_ENV_VAR] === "true";
}

/**
 * The repository's established feature-disabled reply: generic, names no
 * flag or internal state. Used for EVERY reason a demo session is refused
 * (flag off, provider not configured, at capacity, over budget) so a probe
 * cannot distinguish "not built" from "temporarily at capacity".
 */
export const PUBLIC_DEMO_DISABLED_MESSAGE = "Live demo is not available.";

export interface DemoCapsConfig {
  maxConcurrent: number;
  dailyCapCents: number;
}

/**
 * Both caps are required for the demo to start — there is no default. A
 * deployment that turns the flag on without setting both gets the same
 * refused-503 behavior as one that never set the flag at all; this makes
 * "the demo is live with no budget ceiling" structurally impossible.
 */
export function loadDemoCapsFromEnv(env: Record<string, string | undefined> = process.env): DemoCapsConfig {
  const rawConcurrent = env[PUBLIC_DEMO_MAX_CONCURRENT_ENV_VAR];
  const rawCap = env[PUBLIC_DEMO_DAILY_CAP_CENTS_ENV_VAR];
  if (rawConcurrent === undefined || rawConcurrent.trim().length === 0) {
    throw new Error(`${PUBLIC_DEMO_MAX_CONCURRENT_ENV_VAR} must be set for the live demo to start.`);
  }
  if (rawCap === undefined || rawCap.trim().length === 0) {
    throw new Error(`${PUBLIC_DEMO_DAILY_CAP_CENTS_ENV_VAR} must be set for the live demo to start.`);
  }
  const maxConcurrent = Number(rawConcurrent.trim());
  const dailyCapCents = Number(rawCap.trim());
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 50) {
    throw new Error(`${PUBLIC_DEMO_MAX_CONCURRENT_ENV_VAR} must be an integer in [1, 50].`);
  }
  if (!Number.isInteger(dailyCapCents) || dailyCapCents < 1 || dailyCapCents > 1_000_000) {
    throw new Error(`${PUBLIC_DEMO_DAILY_CAP_CENTS_ENV_VAR} must be an integer number of cents in [1, 1000000].`);
  }
  return { maxConcurrent, dailyCapCents };
}

/** The one behavioral cap not driven by an env var — fixed by product decision, not configuration. */
export const DEMO_MAX_SESSION_SECONDS = 90;

/** One demo session per signed visitor cookie per rolling window. */
export const DEMO_ONE_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
