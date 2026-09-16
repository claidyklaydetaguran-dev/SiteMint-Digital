// Applies one reviewed, additive push packet (lib/db/push-packets/*.sql) to a
// NAMED database, in a single transaction, after verifying its identity.
//
// A push packet exists when a push-managed table (crm_*, intake_*) must be
// created in an initialised database where running `drizzle-kit push` — a
// whole-schema reconciler — would be the wrong tool. The packet mirrors the
// schema file exactly, so a later push sees no difference.
//
//   node ./src/apply-push-packet.mjs --packet push-packets/0001_crm_admin_sessions.sql \
//        --target prod --expect-db neondb --expect-fingerprint 0d60ab6bd05c --confirm prod
//
// Allows only additive, re-runnable DDL:
//   CREATE TABLE IF NOT EXISTS
//   CREATE [UNIQUE] INDEX IF NOT EXISTS
//   ALTER TABLE "t" ADD COLUMN IF NOT EXISTS ...
//   ALTER TABLE "t" ADD CONSTRAINT "name" ...   (skipped when "t" already has
//                                                 a constraint of that name —
//                                                 Postgres has no IF NOT EXISTS)
// Refuses: a packet outside push-packets/, any other statement, anything that
// mentions DROP, RENAME, TRUNCATE, DELETE, UPDATE or ALTER COLUMN, and any
// identity mismatch. Prints no credential. Exit 0 applied (or already present),
// 1 refused by the database, 2 usage/identity/connection error.

import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDatabaseIdentity, renderTargetBanner, resolveDbTarget, verifyDbIdentity } from "./db-target.mjs";

const PACKETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../push-packets");

/** Splits a packet into statements and allows only additive, idempotent DDL. */
export function parsePacket(sql) {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = [
    /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s/i,
    /^ALTER\s+TABLE\s+"[^"]+"\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s/i,
    ADD_CONSTRAINT,
  ];
  // A destructive keyword anywhere in a statement refuses it, even behind an
  // allowed prefix (e.g. a second clause in one ALTER TABLE).
  const destructive = /\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE)\b|\bALTER\s+COLUMN\b/i;
  const refused = statements.filter((s) => {
    const body = s
      .replace(/'[^']*'/g, "''") // keywords inside string literals are data
      .replace(/\bON\s+(DELETE|UPDATE)\s+(CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT)\b/gi, ""); // FK referential actions
    return !allowed.some((re) => re.test(s)) || destructive.test(body);
  });
  return { statements, refused };
}

const ADD_CONSTRAINT = /^ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s/i;

/** Postgres truncates identifiers to 63 bytes; compare the stored form. */
function storedName(name) {
  let out = Buffer.from(name, "utf8");
  if (out.length > 63) out = out.subarray(0, 63);
  return out.toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const packetFlag = argv.indexOf("--packet");
  const packetArg = packetFlag !== -1 ? argv[packetFlag + 1] : undefined;
  if (!packetArg) {
    console.error("apply push packet — name the packet: --packet push-packets/<file>.sql");
    process.exit(2);
  }
  const packetPath = resolve(process.cwd(), packetArg);
  if (dirname(packetPath) !== PACKETS_DIR) {
    console.error(`apply push packet — refusing ${basename(packetPath)}: packets must live in lib/db/push-packets/`);
    process.exit(2);
  }
  const { statements, refused } = parsePacket(readFileSync(packetPath, "utf8"));
  if (refused.length > 0) {
    console.error(`apply push packet — refusing: ${refused.length} statement(s) are not additive CREATE ... IF NOT EXISTS`);
    process.exit(2);
  }

  const target = resolveDbTarget({ argv, env: process.env });
  if (!target.ok) {
    console.error(`apply push packet — ${target.message}`);
    process.exit(2);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: target.url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`apply push packet — connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    process.exit(2);
  }

  try {
    const identity = await readDatabaseIdentity(client);
    console.log(renderTargetBanner({ ...target, identity }));
    const verified = verifyDbIdentity({
      expectDb: target.expectDb,
      expectFingerprint: target.expectFingerprint,
      actualDatabase: identity.database,
      actualFingerprint: target.fingerprint,
    });
    if (!verified.ok) {
      console.error(`apply push packet — ${verified.message}`);
      process.exit(2);
    }

    let skipped = 0;
    await client.query("BEGIN");
    try {
      for (const statement of statements) {
        const m = ADD_CONSTRAINT.exec(statement);
        if (m) {
          const exists = await client.query(
            "select 1 from pg_constraint where conrelid = to_regclass($1) and conname = $2",
            [`public."${m[1]}"`, storedName(m[2])],
          );
          if (exists.rowCount > 0) {
            skipped++;
            continue;
          }
        }
        await client.query(statement);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`apply push packet — refused by the database, nothing applied: ${err instanceof Error ? err.message : "unknown"}`);
      process.exit(1);
    }
    console.log(
      `applied ${basename(packetPath)}: ${statements.length - skipped} additive statement(s), ` +
        `${skipped} constraint(s) already present, one transaction`,
    );
    process.exit(0);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
