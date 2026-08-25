// AR-001G: opt-in Stripe boot synchronization.
//
// Server startup previously called `initStripeWebhookAndSync()`
// unconditionally once the HTTP port was open. On any environment that
// happened to carry Replit connector credentials that meant boot itself
// fetched Stripe credentials, registered a managed webhook pointing at
// whatever `REPLIT_DOMAINS` resolved to, and started a full backfill — all
// without anyone asking for it. For an isolated staging deployment that is
// exactly the kind of unrequested external mutation that must not happen.
//
// Boot synchronization is now off unless explicitly and exactly enabled. This
// module owns only that decision; the work itself stays in `index.ts`, and the
// database migrations that startup genuinely requires are deliberately not
// routed through here.

export const STRIPE_BOOT_SYNC_ENABLED_ENV_VAR = "STRIPE_BOOT_SYNC_ENABLED";

/** The only environment field this module reads. */
export interface StripeBootSyncEnv {
  STRIPE_BOOT_SYNC_ENABLED?: string | undefined;
}

/**
 * Defaults to false. Only the exact, case-sensitive string `"true"` enables
 * boot synchronization — matching `isVoicePublishEnabled()`, the convention
 * already used for every backend voice flag.
 *
 * Everything else is false, and that deliberately includes the values a
 * reader might expect to work: `"TRUE"`, `"True"`, `"1"`, `"yes"`, `"on"`,
 * and `" true "` with stray whitespace. A misconfigured value must fail
 * closed rather than guess that an external Stripe mutation was intended.
 */
export function isStripeBootSyncEnabled(env: StripeBootSyncEnv): boolean {
  return env[STRIPE_BOOT_SYNC_ENABLED_ENV_VAR] === "true";
}

/** The minimal log surface this guard needs. */
export interface StripeBootSyncLogger {
  info(meta: Record<string, unknown>, message: string): void;
  error(meta: Record<string, unknown>, message: string): void;
}

export interface StripeBootSyncDependencies {
  /** Explicit flag check. Never read at module import time. */
  isEnabled: () => boolean;
  /**
   * The existing boot-sync routine. It is a function reference, not an
   * invocation: when the flag is off it is never called, so no connector is
   * acquired, no webhook is looked up or created, and no backfill starts.
   */
  runBootSync: () => Promise<void>;
  logger: StripeBootSyncLogger;
}

const MAX_LOGGED_ERROR_LENGTH = 200;

/**
 * Reduces a thrown value to a short, bounded description.
 *
 * The failure path used to log the whole error object. A Stripe or connector
 * error can carry a request payload, a response body, headers, or a `cause`
 * chain, any of which may contain the secret key that was just fetched — so
 * only the error's constructor name and a truncated message are recorded, and
 * never the stack, the cause, or the value itself.
 */
export function describeBootSyncFailure(err: unknown): string {
  const name = err instanceof Error && typeof err.name === "string" ? err.name : "Error";
  const raw = err instanceof Error && typeof err.message === "string" ? err.message : "";
  const message = raw.length > MAX_LOGGED_ERROR_LENGTH ? `${raw.slice(0, MAX_LOGGED_ERROR_LENGTH)}...` : raw;
  return message.length > 0 ? `${name}: ${message}` : name;
}

/**
 * Runs Stripe boot synchronization only when it has been explicitly enabled.
 *
 * Returns synchronously in both cases. When enabled, the existing routine is
 * started exactly once and its rejection is caught here, so a Stripe failure
 * can never take down a server that has already opened its port — the same
 * guarantee the previous unconditional call provided.
 */
export function startStripeBootSync(deps: StripeBootSyncDependencies): void {
  if (!deps.isEnabled()) {
    deps.logger.info(
      { [STRIPE_BOOT_SYNC_ENABLED_ENV_VAR]: false },
      "Stripe boot sync is disabled; skipping connector, webhook registration and backfill",
    );
    return;
  }

  deps.logger.info({ [STRIPE_BOOT_SYNC_ENABLED_ENV_VAR]: true }, "Stripe boot sync is enabled; starting");

  const fail = (err: unknown): void => {
    deps.logger.error({ failure: describeBootSyncFailure(err) }, "Error initializing Stripe webhook/sync");
  };

  // Both failure shapes are contained: a rejected promise, and — although the
  // production routine is `async` and so cannot do this — a synchronous throw
  // before the promise is ever returned.
  try {
    deps.runBootSync().catch(fail);
  } catch (err) {
    fail(err);
  }
}
