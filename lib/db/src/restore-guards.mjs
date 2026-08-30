// P9 — pure guard logic shared by db-backup.mjs and db-restore-drill.mjs.
// Everything here is unit-tested; the executable wrappers stay thin.
//
// Two hard rules these guards encode:
//   1. A restore DRILL may only ever target a database whose NAME declares
//      it disposable — never anything that could be staging or production.
//   2. Connection secrets never appear on a command line (a quoting error
//      once echoed a live token in this project). The URL is decomposed
//      into the PG* environment variables and the child reads those.

const DRILL_NAME = /(drill|disposable|scratch|throwaway)/i;
const FORBIDDEN_NAME = /(prod|production|live|staging)/i;

/** @param {string} url @returns {{ok: true, dbName: string} | {ok: false, reason: string}} */
export function validateDrillTargetUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "target is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "target must be a postgres:// URL" };
  }
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName.length === 0) return { ok: false, reason: "target URL names no database" };
  if (FORBIDDEN_NAME.test(dbName)) {
    return { ok: false, reason: `refusing: database name "${dbName}" looks like a real environment` };
  }
  if (!DRILL_NAME.test(dbName)) {
    return {
      ok: false,
      reason: `refusing: a drill database must declare itself disposable — name it with "drill", "disposable", "scratch", or "throwaway" (got "${dbName}")`,
    };
  }
  return { ok: true, dbName };
}

/**
 * @param {string} outPath
 * @param {(p: string) => boolean} exists
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateBackupOutPath(outPath, exists) {
  if (typeof outPath !== "string" || outPath.trim().length === 0) {
    return { ok: false, reason: "--out <file> is required" };
  }
  if (!/\.(dump|sql)$/.test(outPath)) return { ok: false, reason: "--out must end in .dump or .sql" };
  if (exists(outPath)) return { ok: false, reason: `refusing to overwrite existing file: ${outPath}` };
  return { ok: true };
}

/**
 * Decomposes a postgres URL into PG* env vars so a child process never
 * sees the secret on argv. Query param sslmode is honored.
 * @param {string} url
 * @returns {{ok: true, env: Record<string, string>} | {ok: false, reason: string}}
 */
export function pgEnvFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "not a postgres:// URL" };
  }
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName.length === 0) return { ok: false, reason: "URL names no database" };
  /** @type {Record<string, string>} */
  const env = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: dbName,
  };
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return { ok: true, env };
}

/** The sanity shape a restored drill database must reproduce — DERIVED from the committed inventory, never pinned. */
export async function expectedRestoreShape() {
  const { expectedApplicationTables } = await import("./migrate-fresh.mjs");
  const { BASELINE_DOMAINS } = await import("./baseline-journals.mjs");
  return {
    publicTableCount: expectedApplicationTables().length,
    journalTables: BASELINE_DOMAINS.map((d) => `__drizzle_migrations_${d}`),
  };
}
