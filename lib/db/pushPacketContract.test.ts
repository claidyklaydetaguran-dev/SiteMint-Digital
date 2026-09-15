/**
 * Push packets: reviewed, additive SQL for push-managed tables that must be
 * created in an initialised database, where `drizzle-kit push` (a whole-schema
 * reconciler) is the wrong tool.
 *
 * Run via: tsx lib/db/pushPacketContract.test.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePacket } from "./src/apply-push-packet.mjs";

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const packetsDir = resolve(here, "push-packets");
const schemaSrc = readFileSync(resolve(here, "src/schema/crmAdminSessions.ts"), "utf8");

const packets = readdirSync(packetsDir).filter((f) => f.endsWith(".sql"));
check("at least one push packet is committed", packets.length > 0);

for (const file of packets) {
  const { statements, refused } = parsePacket(readFileSync(resolve(packetsDir, file), "utf8"));
  check(`${file}: every statement is additive and idempotent`, refused.length === 0, refused.join(" | "));
  check(`${file}: nothing is dropped, altered, truncated or deleted`, !statements.some((s) => /\b(DROP|ALTER|TRUNCATE|DELETE|UPDATE)\b/i.test(s)));
}

// The parser is the only guard between a packet and a deployment database.
const hostile = parsePacket(`CREATE TABLE IF NOT EXISTS "a" ("id" serial);\nDROP TABLE "crm_leads";\n-- DROP in a comment is fine\nALTER TABLE "x" ADD COLUMN "y" text;`);
check("the parser refuses a DROP hidden among allowed statements", hostile.refused.some((s) => /^DROP/i.test(s)));
check("the parser refuses an ALTER", hostile.refused.some((s) => /^ALTER/i.test(s)));
check("a comment mentioning DROP is not treated as a statement", hostile.statements.length === 3);
check("a CREATE without IF NOT EXISTS is refused", parsePacket(`CREATE TABLE "a" ("id" serial);`).refused.length === 1);

// 0001 must mirror the schema file: every column and index push would create.
const p1 = readFileSync(resolve(packetsDir, "0001_crm_admin_sessions.sql"), "utf8");
for (const column of ["token_hash", "created_at", "last_seen_at", "expires_at", "ip", "user_agent", "revoked_at", "actor", "action", "target"]) {
  check(`0001 creates column ${column}, which the schema declares`, p1.includes(`"${column}"`) && schemaSrc.includes(`"${column}"`));
}
for (const index of ["uq_crm_admin_sessions_token_hash", "ix_crm_admin_sessions_expires_at", "ix_crm_admin_audit_log_created_at", "ix_crm_admin_audit_log_action"]) {
  check(`0001 creates index ${index}, which the schema declares`, p1.includes(`"${index}"`) && schemaSrc.includes(`"${index}"`));
}
check("0001 keeps token_hash unique, as the session lookup requires", /CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_admin_sessions_token_hash"/.test(p1));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) process.exit(1);
console.log("All pushPacket contract tests passed.");
