// R6 — the startup lifecycle, extracted from index.ts so it can be tested.
//
// Order matters and is the whole point:
//   1. bind the port (the platform probe now has an upstream)
//   2. run migrations exactly once, with the boot gate refusing app traffic
//   3. only on success: state -> ready, then start background workers
//   4. on failure: state -> failed, sanitized log, close the server, exit 1
//
// Nothing here reports readiness before migrations finish, and a migration
// failure is never swallowed to keep a health probe happy — the process dies
// so the platform restarts it.

import { setBootState } from "./bootState.js";

export interface ClosableServer {
  close(cb?: (err?: Error) => void): unknown;
}

export interface BootLogger {
  info(meta: Record<string, unknown>, msg: string): void;
  error(meta: Record<string, unknown>, msg: string): void;
}

export interface BootDeps {
  /** Bind the HTTP port. Resolves once listening. */
  listen: () => Promise<ClosableServer>;
  /** The internal database migration. Must be run exactly once. */
  runMigrations: () => Promise<void>;
  /** Schedulers, sweepers, digests, backfills. Only after migrations succeed. */
  startWorkers: () => void;
  logger: BootLogger;
  /** Process exit. Injected so tests observe the code instead of dying. */
  exit: (code: number) => void;
}

export interface BootOutcome {
  state: "ready" | "failed";
  server: ClosableServer | null;
  migrationRuns: number;
  workersStarted: boolean;
  exitCode: number | null;
}

/**
 * Strip anything credential-shaped from an error before it reaches a log.
 *
 * Migration failures surface driver errors, and those routinely carry the
 * connection string. The message is kept because it is what makes a failure
 * diagnosable; the parts that must never be logged are redacted.
 */
export function sanitizeBootError(err: unknown): { name: string; message: string } {
  const name = err instanceof Error ? err.name : typeof err;
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw
    .replace(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"']*/g, "[redacted-url]")
    .replace(/\b(password|pgpassword|token|secret|key)\s*=\s*[^\s&"';]+/gi, "$1=[redacted]");
  return { name, message: message.slice(0, 500) };
}

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      server.close(done);
    } catch {
      done();
    }
    // Never hang the failure path on a socket that refuses to drain.
    setTimeout(done, 5_000).unref?.();
  });
}

export async function runBootSequence(deps: BootDeps): Promise<BootOutcome> {
  const outcome: BootOutcome = {
    state: "failed",
    server: null,
    migrationRuns: 0,
    workersStarted: false,
    exitCode: null,
  };

  setBootState("starting");

  // Bind first: from here the platform probe gets a real liveness answer,
  // while `bootGate` refuses everything else.
  const server = await deps.listen();
  outcome.server = server;
  deps.logger.info({}, "listening; running startup migrations");

  try {
    outcome.migrationRuns += 1;
    await deps.runMigrations();
  } catch (err) {
    setBootState("failed");
    outcome.state = "failed";
    deps.logger.error({ err: sanitizeBootError(err) }, "startup migrations failed; shutting down");
    await closeServer(server);
    outcome.exitCode = 1;
    deps.exit(1);
    return outcome;
  }

  setBootState("ready");
  outcome.state = "ready";
  deps.startWorkers();
  outcome.workersStarted = true;
  deps.logger.info({}, "migrations complete; serving application traffic");
  return outcome;
}
