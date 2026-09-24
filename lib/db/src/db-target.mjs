// Explicit database targeting for every command that can change a database.
//
// The problem this closes: `migrate:*`, `preflight` and `backup` all read
// `process.env.DATABASE_URL`. Two databases live in the same workspace — the
// development one and the deployment one — so which database a command touched
// depended entirely on which variable happened to be exported in that shell.
// Nothing in the command said which one was intended, and nothing checked.
// A correct-looking command with a stale environment is indistinguishable from
// a correct command, right up until it has written to the wrong database.
//
// So a target is now NAMED, and the name is what selects the connection:
//
//     --target dev   → DATABASE_URL
//     --target prod  → PROD_DATABASE_URL
//
// There is no default and no fallback between them. `--target prod` never
// reads DATABASE_URL, so an unset PROD_DATABASE_URL fails loudly instead of
// quietly migrating development.
//
// Naming a target is a claim, not proof. The caller must also state what it
// expects to be connected to, and the command verifies that claim against the
// live connection before doing anything:
//
//     --expect-db <name>            checked against current_database()
//     --expect-fingerprint <hex12>  checked against the resolved connection
//
// The fingerprint is a one-way digest of host, port, database and user. It is
// stable for a given database, it changes if any of those change, and it
// reveals no credential — which is what makes it safe to print in a report,
// paste into a runbook, and commit to a checklist. The URL itself is never
// printed, never logged, and never included in an error message.
//
// `prod` additionally requires `--confirm prod`. A typo in a target name is
// recoverable; a typo that writes to the deployment database is not.

import { createHash } from "node:crypto";

/** The only databases any command here may address. */
export const DB_TARGETS = {
  dev: {
    label: "development (workspace)",
    urlEnvVar: "DATABASE_URL",
    requiresConfirmation: false,
  },
  prod: {
    label: "deployment (published app)",
    urlEnvVar: "PROD_DATABASE_URL",
    requiresConfirmation: true,
  },
};

export const TARGET_NAMES = Object.keys(DB_TARGETS);

export const TARGET_ERROR = {
  MISSING_TARGET: "missing-target",
  UNKNOWN_TARGET: "unknown-target",
  MISSING_URL: "missing-url",
  UNPARSABLE_URL: "unparsable-url",
  MISSING_EXPECTATION: "missing-expectation",
  MISSING_CONFIRMATION: "missing-confirmation",
  IDENTITY_MISMATCH: "identity-mismatch",
};

/**
 * Minimal flag reader: `--flag value` and `--flag=value`. Deliberately not a
 * general argument parser — an unrecognised flag is ignored here rather than
 * silently reinterpreted as a value.
 *
 * @param {string[]} argv
 * @param {string} name
 * @returns {string | undefined}
 */
export function readFlag(argv, name) {
  const long = `--${name}`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === long) return argv[i + 1];
    if (typeof arg === "string" && arg.startsWith(`${long}=`)) return arg.slice(long.length + 1);
  }
  return undefined;
}

/**
 * A one-way, credential-free identity for a connection.
 *
 * Digests host, port, database and user — everything that determines WHICH
 * database this is — and deliberately excludes the password, so the value is
 * safe to display and to record in a runbook.
 *
 * @param {string} url
 * @returns {{ ok: true, fingerprint: string, database: string } | { ok: false }}
 */
export function connectionFingerprint(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false };
  }
  const host = parsed.hostname;
  const port = parsed.port === "" ? "5432" : parsed.port;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(parsed.username);
  if (host === "" || database === "") return { ok: false };
  const digest = createHash("sha256").update(`${host}|${port}|${database}|${user}`).digest("hex");
  return { ok: true, fingerprint: digest.slice(0, 12), database };
}

/**
 * Resolves and validates a target request. Pure: takes argv and an env map,
 * touches no network and no filesystem, so every refusal below is unit-tested.
 *
 * `requireExpectations: false` is for the read-only identity reporter, which
 * exists precisely to discover the values the other commands then require.
 *
 * @param {object} input
 * @param {string[]} input.argv
 * @param {Record<string, string | undefined>} input.env
 * @param {boolean} [input.requireExpectations]
 */
export function resolveDbTarget({ argv, env, requireExpectations = true }) {
  const name = readFlag(argv, "target") ?? env.MIGRATE_TARGET;
  if (name === undefined || name === "") {
    return {
      ok: false,
      code: TARGET_ERROR.MISSING_TARGET,
      message: `no database target named. Pass --target <${TARGET_NAMES.join("|")}>. There is no default: the command will not guess which database you meant.`,
    };
  }
  const target = DB_TARGETS[name];
  if (target === undefined) {
    return {
      ok: false,
      code: TARGET_ERROR.UNKNOWN_TARGET,
      message: `unknown database target "${name}". Expected one of ${TARGET_NAMES.join(", ")}.`,
    };
  }

  const url = env[target.urlEnvVar];
  if (url === undefined || url === "") {
    return {
      ok: false,
      code: TARGET_ERROR.MISSING_URL,
      message: `target "${name}" reads ${target.urlEnvVar}, which is not set. It is not substituted from any other variable — set ${target.urlEnvVar} or choose a different target.`,
    };
  }

  const fingerprint = connectionFingerprint(url);
  if (!fingerprint.ok) {
    return {
      ok: false,
      code: TARGET_ERROR.UNPARSABLE_URL,
      message: `${target.urlEnvVar} is not a usable PostgreSQL connection URL. (Its value is never printed.)`,
    };
  }

  const expectDb = readFlag(argv, "expect-db") ?? env.MIGRATE_EXPECT_DB;
  const expectFingerprint = readFlag(argv, "expect-fingerprint") ?? env.MIGRATE_EXPECT_FINGERPRINT;

  if (requireExpectations && (expectDb === undefined || expectFingerprint === undefined)) {
    return {
      ok: false,
      code: TARGET_ERROR.MISSING_EXPECTATION,
      message:
        `target "${name}" needs the identity you expect to reach: --expect-db <name> --expect-fingerprint <hex12>.\n` +
        `Read them first with:  node ./src/db-identity.mjs --target ${name}`,
    };
  }

  if (requireExpectations && target.requiresConfirmation) {
    const confirm = readFlag(argv, "confirm") ?? env.MIGRATE_CONFIRM;
    if (confirm !== name) {
      return {
        ok: false,
        code: TARGET_ERROR.MISSING_CONFIRMATION,
        message: `target "${name}" is the ${target.label} database and must be confirmed explicitly: --confirm ${name}.`,
      };
    }
  }

  return {
    ok: true,
    name,
    label: target.label,
    urlEnvVar: target.urlEnvVar,
    url,
    fingerprint: fingerprint.fingerprint,
    databaseFromUrl: fingerprint.database,
    expectDb,
    expectFingerprint,
  };
}

/**
 * Checks the claim against what the connection actually is.
 *
 * `actualDatabase` comes from `current_database()` — the server's own answer,
 * not the URL's path — so a proxy or a pooler that rewrites the database name
 * is caught rather than trusted.
 *
 * @param {object} input
 * @param {string} input.expectDb
 * @param {string} input.expectFingerprint
 * @param {string} input.actualDatabase
 * @param {string} input.actualFingerprint
 */
export function verifyDbIdentity({ expectDb, expectFingerprint, actualDatabase, actualFingerprint }) {
  const mismatches = [];
  if (expectDb !== actualDatabase) {
    mismatches.push(`expected database "${expectDb}", connected to "${actualDatabase}"`);
  }
  if (expectFingerprint !== actualFingerprint) {
    mismatches.push(`expected fingerprint ${expectFingerprint}, connection is ${actualFingerprint}`);
  }
  if (mismatches.length > 0) {
    return {
      ok: false,
      code: TARGET_ERROR.IDENTITY_MISMATCH,
      message: `this is not the database you named.\n  ${mismatches.join("\n  ")}\nNothing was changed.`,
    };
  }
  return { ok: true };
}

/**
 * Reads the identity facts a report may show. Every field here is safe to
 * print; none of them can reconstruct a credential.
 *
 * @param {{ query: (sql: string) => Promise<{ rows: any[] }> }} client
 */
export async function readDatabaseIdentity(client) {
  const { rows } = await client.query(
    `SELECT current_database() AS database,
            current_user       AS role,
            version()          AS server_version,
            pg_postmaster_start_time() AS started_at`,
  );
  const row = rows[0] ?? {};
  return {
    database: String(row.database ?? ""),
    role: String(row.role ?? ""),
    // Just the version number; the full string carries build paths.
    serverVersion: /PostgreSQL (\d+(?:\.\d+)?)/.exec(String(row.server_version ?? ""))?.[1] ?? "unknown",
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at ?? ""),
  };
}

/** The banner every targeting command prints before it acts. No secrets. */
export function renderTargetBanner({ name, label, urlEnvVar, fingerprint, identity }) {
  return [
    `database target: ${name}  (${label})`,
    `  connection source: ${urlEnvVar}  [value never printed]`,
    `  fingerprint:       ${fingerprint}`,
    `  current_database:  ${identity.database}`,
    `  role:              ${identity.role}`,
    `  server:            PostgreSQL ${identity.serverVersion}`,
  ].join("\n");
}
