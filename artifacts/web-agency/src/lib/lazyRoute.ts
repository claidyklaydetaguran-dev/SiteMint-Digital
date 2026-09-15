/**
 * Route-level lazy loading that can actually survive a failed chunk fetch.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `React.lazy()` memoises the promise its factory returns — including a
 * *rejected* one. Once a route's dynamic import fails, React stores the
 * rejection and re-throws the same error on every subsequent render of that
 * component, forever. Remounting the subtree does not re-run the factory.
 *
 * That was measured, not assumed. Rendering a `React.lazy` whose loader fails
 * once and would succeed on the second call, inside an error boundary whose
 * retry clears `hasError`:
 *
 *     attempts: 1        ← the loader was never called again
 *     recovered: false   ← the error panel stayed up permanently
 *
 * So a boundary that "retries" by re-rendering its children is structurally
 * incapable of recovering a failed route chunk. The user is left on a dead-end
 * panel whose only working escape is a full document reload.
 *
 * The failure that gets you there is ordinarily transient:
 *   - dev: Vite discovers a new dependency, re-optimises, and drops the
 *     in-flight module requests;
 *   - production: a redeploy replaces the hashed filenames a loaded document
 *     still refers to;
 *   - anywhere: a dropped or throttled connection.
 *
 * ── What this does ──────────────────────────────────────────────────────────
 *
 * Retries the import *inside* the factory, so React only ever observes the
 * final outcome. A transient failure is absorbed before it can be cached, and
 * the route simply loads — no error panel, no lost navigation.
 *
 * It deliberately does NOT retry forever: a genuinely missing chunk (stale
 * document after a deploy) fails fast enough for the boundary to offer the one
 * recovery that works, a reload that re-reads index.html.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** A dynamic `import()` of a module with a default-exported component. */
export type ModuleFactory<T extends ComponentType<unknown>> = () => Promise<{ default: T }>;

export interface LazyRouteOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** Delay before the second attempt; doubles each time after. */
  baseDelayMs?: number;
}

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 220;

/**
 * A failed dynamic import surfaces differently across browsers, so match the
 * observed shapes rather than one message. Kept in step with the matching
 * predicate in `RouteErrorBoundary`.
 */
export function isModuleLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Run `factory`, retrying a *module load* failure with exponential backoff.
 *
 * Only module-load failures are retried. If the module loads and its own
 * top-level code throws, that is a real defect in the page — retrying it would
 * just run the broken code repeatedly and delay the error, so it rethrows at
 * once.
 */
export async function importWithRetry<T extends ComponentType<unknown>>(
  factory: ModuleFactory<T>,
  options: LazyRouteOptions = {},
): Promise<{ default: T }> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const baseDelay = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      // A module that loaded and then threw is not a transport problem.
      if (!isModuleLoadError(error)) throw error;
      if (attempt === attempts - 1) break;
      await wait(baseDelay * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * `React.lazy` with the retry above already applied.
 *
 * Drop-in replacement for `lazy(() => import("..."))` at a route call site.
 */
export function lazyRoute<T extends ComponentType<never>>(
  factory: ModuleFactory<T>,
  options?: LazyRouteOptions,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(factory as ModuleFactory<ComponentType<unknown>>, options)) as LazyExoticComponent<T>;
}

export default lazyRoute;
