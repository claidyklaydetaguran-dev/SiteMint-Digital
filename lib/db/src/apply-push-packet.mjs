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
// Refuses: a packet outside push-packets/, any statement that is not
// CREATE TABLE IF NOT EXISTS / CREATE [UNIQUE] INDEX IF NOT EXISTS, and any
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
  const allowed = /^CREATE\s+(TABLE\s+IF\s+NOT\s+EXISTS|(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS)\s/i;
  const refused = statements.filter((s) => !allowed.test(s));
  return { statements, refused };
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

    await client.query("BEGIN");
    try {
      for (const statement of statements) await client.query(statement);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`apply push packet — refused by the database, nothing applied: ${err instanceof Error ? err.message : "unknown"}`);
      process.exit(1);
    }
    console.log(`applied ${basename(packetPath)}: ${statements.length} additive statement(s), one transaction`);
    process.exit(0);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
