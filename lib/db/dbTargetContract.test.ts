// The database-targeting contract.
//
// Two databases live in the same workspace. Before this, every migrating
// command read `process.env.DATABASE_URL`, so which database a command touched
// was decided by whichever variable happened to be exported — and a correct
// command with a stale environment looked exactly like a correct command.
//
// These cases hold the four properties that close that gap:
//
//   1. No target named          → refuse. There is no default.
//   2. A target selects its OWN variable, with no cross-fallback. `prod` with
//      PROD_DATABASE_URL unset must fail, even when DATABASE_URL is set — the
//      failure mode being prevented is precisely "migrated dev while meaning
//      prod".
//   3. Naming is not proof: the caller states the identity it expects, and a
//      mismatch refuses without changing anything.
//   4. The deployment database additionally needs explicit confirmation.
//
// Plus two source-level properties, because a future edit could reintroduce the
// original defect while leaving all the unit cases green: no mutating command
// may read DATABASE_URL directly any more, and the drizzle-kit child must be
// handed the resolved connection rather than inheriting the ambient one.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DB_TARGETS,
  TARGET_ERROR,
  connectionFingerprint,
  readFlag,
  resolveDbTarget,
  verifyDbIdentity,
} from "./src/db-target.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
}

const DEV_URL = "postgres://devuser:secret-dev@dev-host.example.com:5432/devdb";
const PROD_URL = "postgres://produser:secret-prod@prod-host.example.com:5432/proddb";

const devFingerprint = connectionFingerprint(DEV_URL);
const prodFingerprint = connectionFingerprint(PROD_URL);
if (!devFingerprint.ok || !prodFingerprint.ok) {
  console.error("fixture URLs failed to fingerprint");
  process.exit(1);
}

// ── 1. no default target ─────────────────────────────────────────────────────

console.log("no target named");
{
  const result = resolveDbTarget({ argv: [], env: { DATABASE_URL: DEV_URL, PROD_DATABASE_URL: PROD_URL } });
  check("refuses when no target is named", !result.ok && result.code === TARGET_ERROR.MISSING_TARGET);
  check(
    "says there is no default, rather than guessing",
    !result.ok && /no default/i.test(result.message),
    !result.ok ? result.message : "",
  );

  const unknown = resolveDbTarget({ argv: ["--target", "staging"], env: { DATABASE_URL: DEV_URL } });
  check("refuses an unknown target name", !unknown.ok && unknown.code === TARGET_ERROR.UNKNOWN_TARGET);
}

// ── 2. a target selects its own variable, with no fallback ───────────────────

console.log("target selects its own connection");
{
  const dev = resolveDbTarget({
    argv: ["--target", "dev", "--expect-db", "devdb", "--expect-fingerprint", devFingerprint.fingerprint],
    env: { DATABASE_URL: DEV_URL, PROD_DATABASE_URL: PROD_URL },
  });
  check("dev resolves DATABASE_URL", dev.ok && dev.url === DEV_URL && dev.urlEnvVar === "DATABASE_URL");

  const prod = resolveDbTarget({
    argv: ["--target", "prod", "--expect-db", "proddb", "--expect-fingerprint", prodFingerprint.fingerprint, "--confirm", "prod"],
    env: { DATABASE_URL: DEV_URL, PROD_DATABASE_URL: PROD_URL },
  });
  check("prod resolves PROD_DATABASE_URL", prod.ok && prod.url === PROD_URL && prod.urlEnvVar === "PROD_DATABASE_URL");

  // The defect being prevented: PROD_DATABASE_URL missing must NOT silently
  // become DATABASE_URL, or `--target prod` migrates development.
  const noProd = resolveDbTarget({
    argv: ["--target", "prod", "--expect-db", "proddb", "--expect-fingerprint", prodFingerprint.fingerprint, "--confirm", "prod"],
    env: { DATABASE_URL: DEV_URL },
  });
  check("prod with PROD_DATABASE_URL unset refuses rather than falling back to DATABASE_URL",
    !noProd.ok && noProd.code === TARGET_ERROR.MISSING_URL);
  check("the refusal names the variable it needs, and no URL",
    !noProd.ok && noProd.message.includes("PROD_DATABASE_URL") && !noProd.message.includes("secret-dev"),
    !noProd.ok ? noProd.message : "");

  const noDev = resolveDbTarget({
    argv: ["--target", "dev", "--expect-db", "devdb", "--expect-fingerprint", "aaaaaaaaaaaa"],
    env: { PROD_DATABASE_URL: PROD_URL },
  });
  check("dev with DATABASE_URL unset does not fall back to PROD_DATABASE_URL either",
    !noDev.ok && noDev.code === TARGET_ERROR.MISSING_URL);
}

// ── 3. naming is not proof ───────────────────────────────────────────────────

console.log("stated identity is verified");
{
  const missing = resolveDbTarget({ argv: ["--target", "dev"], env: { DATABASE_URL: DEV_URL } });
  check("refuses without a stated expectation", !missing.ok && missing.code === TARGET_ERROR.MISSING_EXPECTATION);
  check("points at the identity reporter", !missing.ok && missing.message.includes("db-identity.mjs"));

  const wrongDb = verifyDbIdentity({
    expectDb: "devdb",
    expectFingerprint: devFingerprint.fingerprint,
    actualDatabase: "proddb",
    actualFingerprint: devFingerprint.fingerprint,
  });
  check("a different current_database() is a mismatch", !wrongDb.ok && wrongDb.code === TARGET_ERROR.IDENTITY_MISMATCH);
  check("the mismatch says nothing was changed", !wrongDb.ok && /nothing was changed/i.test(wrongDb.message));

  const wrongHost = verifyDbIdentity({
    expectDb: "devdb",
    expectFingerprint: devFingerprint.fingerprint,
    actualDatabase: "devdb",
    actualFingerprint: prodFingerprint.fingerprint,
  });
  // Same database NAME on a different server is the case a name alone misses.
  check("a same-named database on a different host is still a mismatch", !wrongHost.ok);

  const right = verifyDbIdentity({
    expectDb: "devdb",
    expectFingerprint: devFingerprint.fingerprint,
    actualDatabase: "devdb",
    actualFingerprint: devFingerprint.fingerprint,
  });
  check("a matching identity passes", right.ok);
}

console.log("the fingerprint is safe to print and discriminating");
{
  check("differs between the two databases", devFingerprint.fingerprint !== prodFingerprint.fingerprint);
  check("is stable for the same connection", connectionFingerprint(DEV_URL).ok && (connectionFingerprint(DEV_URL) as { fingerprint: string }).fingerprint === devFingerprint.fingerprint);
  check("is short enough to read back", devFingerprint.fingerprint.length === 12);
  check("contains no part of the password", !devFingerprint.fingerprint.includes("secret"));

  // Password rotation must not change the database's identity — otherwise every
  // committed runbook value would go stale for the wrong reason.
  const rotated = connectionFingerprint("postgres://devuser:a-new-password@dev-host.example.com:5432/devdb");
  check("survives a password change", rotated.ok && rotated.fingerprint === devFingerprint.fingerprint);

  // Host, database, port and user all change it.
  const otherHost = connectionFingerprint("postgres://devuser:secret-dev@other-host.example.com:5432/devdb");
  const otherDb = connectionFingerprint("postgres://devuser:secret-dev@dev-host.example.com:5432/otherdb");
  const otherPort = connectionFingerprint("postgres://devuser:secret-dev@dev-host.example.com:6543/devdb");
  const otherUser = connectionFingerprint("postgres://otheruser:secret-dev@dev-host.example.com:5432/devdb");
  check(
    "changes with host, database, port or user",
    [otherHost, otherDb, otherPort, otherUser].every((f) => f.ok && f.fingerprint !== devFingerprint.fingerprint),
  );

  check("rejects a value that is not a connection URL", !connectionFingerprint("not-a-url").ok);
  check("rejects a URL with no database path", !connectionFingerprint("postgres://u:p@host:5432/").ok);
}

// ── 4. the deployment database needs confirmation ───────────────────────────

console.log("deployment database confirmation");
{
  const args = ["--target", "prod", "--expect-db", "proddb", "--expect-fingerprint", prodFingerprint.fingerprint];
  const unconfirmed = resolveDbTarget({ argv: args, env: { PROD_DATABASE_URL: PROD_URL } });
  check("refuses prod without --confirm", !unconfirmed.ok && unconfirmed.code === TARGET_ERROR.MISSING_CONFIRMATION);

  const wrongConfirm = resolveDbTarget({ argv: [...args, "--confirm", "dev"], env: { PROD_DATABASE_URL: PROD_URL } });
  check("refuses prod when the confirmation names a different target", !wrongConfirm.ok);

  const confirmed = resolveDbTarget({ argv: [...args, "--confirm", "prod"], env: { PROD_DATABASE_URL: PROD_URL } });
  check("accepts prod with the matching confirmation", confirmed.ok);

  check("dev needs no confirmation", DB_TARGETS.dev.requiresConfirmation === false);
  check("prod does", DB_TARGETS.prod.requiresConfirmation === true);
}

console.log("flag parsing");
{
  check("reads --flag value", readFlag(["--target", "dev"], "target") === "dev");
  check("reads --flag=value", readFlag(["--target=prod"], "target") === "prod");
  check("returns undefined for an absent flag", readFlag(["--other", "x"], "target") === undefined);
  // A prefix must not match: --target-db is not --target.
  check("does not match a longer flag name", readFlag(["--target-db", "x"], "target") === undefined);
}

// ── source-level: the original defect cannot come back ──────────────────────

console.log("no command re-reads an ambient DATABASE_URL");
{
  // Comments are stripped first: these files EXPLAIN the defect they close, so
  // scanning raw text would fail on the explanation rather than on any code.
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const file of ["src/migrate-guard.mjs", "src/migrate-preflight.mjs", "src/db-identity.mjs", "src/db-backup.mjs"]) {
    const code = stripComments(read(file));
    const reads = [...code.matchAll(/process\.env\.DATABASE_URL/g)];
    check(`${file} does not read process.env.DATABASE_URL`, reads.length === 0, reads.length ? `${reads.length} occurrence(s) in code` : "");
    check(`${file} resolves its connection through resolveDbTarget`, code.includes("resolveDbTarget"));
  }

  // A backup of the wrong database is worse than no backup, because it is the
  // thing you rely on when a migration goes wrong — so it verifies too.
  const backup = stripComments(read("src/db-backup.mjs"));
  check("the backup verifies the identity before running pg_dump",
    backup.indexOf("verifyDbIdentity") < backup.indexOf("spawn(\"pg_dump\""));
  check("the backup dumps the resolved connection, not an ambient one",
    backup.includes("pgEnvFromUrl(target.url)"));

  const guard = read("src/migrate-guard.mjs");
  check(
    "the guard hands drizzle-kit the resolved connection instead of the ambient one",
    /env:\s*\{\s*\.\.\.process\.env,\s*DATABASE_URL:\s*databaseUrl\s*\}/.test(guard),
  );
  check("the guard verifies identity before taking the advisory lock",
    guard.indexOf("verifyDbIdentity") < guard.indexOf("pg_advisory_lock"));
  check("the guard prints a banner naming what it reached", guard.includes("renderTargetBanner"));
}

console.log("");
if (failures > 0) {
  console.error(`dbTargetContract: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All dbTargetContract tests passed.");
