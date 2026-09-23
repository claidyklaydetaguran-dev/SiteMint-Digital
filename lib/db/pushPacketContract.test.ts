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
  const destructive = statements.filter((s) =>
    /\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE)\b|\bALTER\s+COLUMN\b/i.test(
      s.replace(/'[^']*'/g, "''").replace(/\bON\s+(DELETE|UPDATE)\s+(CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT)\b/gi, ""),
    ),
  );
  check(`${file}: nothing is dropped, renamed, truncated, deleted or altered in place`, destructive.length === 0, destructive.join(" | ").slice(0, 200));
  const alters = statements.filter((s) => /^ALTER\b/i.test(s));
  check(
    `${file}: every ALTER only adds a column (IF NOT EXISTS) or a constraint`,
    alters.every((s) => /^ALTER\s+TABLE\s+"[^"]+"\s+ADD\s+(COLUMN\s+IF\s+NOT\s+EXISTS|CONSTRAINT)\s/i.test(s)),
  );
}

// The parser is the only guard between a packet and a deployment database.
const hostile = parsePacket(`CREATE TABLE IF NOT EXISTS "a" ("id" serial);\nDROP TABLE "crm_leads";\n-- DROP in a comment is fine\nALTER TABLE "x" ADD COLUMN "y" text;`);
check("the parser refuses a DROP hidden among allowed statements", hostile.refused.some((s) => /^DROP/i.test(s)));
check("the parser refuses an ADD COLUMN without IF NOT EXISTS", hostile.refused.some((s) => /^ALTER/i.test(s)));
check("a comment mentioning DROP is not treated as a statement", hostile.statements.length === 3);
check("a CREATE without IF NOT EXISTS is refused", parsePacket(`CREATE TABLE "a" ("id" serial);`).refused.length === 1);
check(
  "a re-runnable column addition is allowed",
  parsePacket(`ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "priority" text;`).refused.length === 0,
);
check(
  "a foreign key with ON DELETE / ON UPDATE actions is allowed",
  parsePacket(`ALTER TABLE "a" ADD CONSTRAINT "a_b_fk" FOREIGN KEY ("b") REFERENCES "public"."b"("id") ON DELETE cascade ON UPDATE no action;`).refused.length === 0,
);
check(
  "a destructive clause behind an allowed prefix is refused",
  parsePacket(`ALTER TABLE "a" ADD COLUMN IF NOT EXISTS "y" text, DROP COLUMN "z";`).refused.length === 1,
);
check("an in-place column alteration is refused", parsePacket(`ALTER TABLE "a" ALTER COLUMN "tags" SET DEFAULT '{}';`).refused.length === 1);
check("a rename is refused", parsePacket(`ALTER TABLE "a" RENAME TO "b";`).refused.length === 1);
check(
  "a destructive word inside a string literal is data, not a statement",
  parsePacket(`ALTER TABLE "a" ADD CONSTRAINT "ck" CHECK ("a"."s" IN ('drop', 'delete'));`).refused.length === 0,
);

// 0002: the 11cf649 push-managed release, reviewed. Its generator excluded the
// only non-additive statements in the push diff; pin that they stay out.
const p2 = readFileSync(resolve(packetsDir, "0002_crm_release_2026_09_17.sql"), "utf8");
const p2s = parsePacket(p2).statements;
check("0002 has the reviewed statement count", p2s.length === 231, String(p2s.length));
check("0002 creates the 55 new push-managed tables", p2s.filter((s) => /^CREATE TABLE IF NOT EXISTS/.test(s)).length === 55);
for (const table of ["crm_staff", "crm_staff_sessions", "crm_conversations", "crm_companies"]) {
  check(`0002 creates ${table}`, p2s.some((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`)));
}
check("0002 documents the six foreign keys it deliberately does not re-create", (p2.match(/^--\s{7}\S+/gm) ?? []).length === 6);
check("0002 leaves the Discovery duplicate-link key untouched", !p2s.some((s) => /discovery_submissions_duplicate_of_submission_id/.test(s)));

// 0001 must mirror the schema file: every column and index push would create.
const p1 = readFileSync(resolve(packetsDir, "0001_crm_admin_sessions.sql"), "utf8");
for (const column of ["token_hash", "created_at", "last_seen_at", "expires_at", "ip", "user_agent", "revoked_at", "actor", "action", "target"]) {
  check(`0001 creates column ${column}, which the schema declares`, p1.includes(`"${column}"`) && schemaSrc.includes(`"${column}"`));
}
for (const index of ["uq_crm_admin_sessions_token_hash", "ix_crm_admin_sessions_expires_at", "ix_crm_admin_audit_log_created_at", "ix_crm_admin_audit_log_action"]) {
  check(`0001 creates index ${index}, which the schema declares`, p1.includes(`"${index}"`) && schemaSrc.includes(`"${index}"`));
}
check("0001 keeps token_hash unique, as the session lookup requires", /CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_admin_sessions_token_hash"/.test(p1));

// 0003: the 2026-09-24 performance-audit indexes. Every index must mirror an
// index("...") declaration in the schema file that owns the table, and the
// packet must stay indexes-only.
const p3 = readFileSync(resolve(packetsDir, "0003_crm_indexes_2026_09_24.sql"), "utf8");
const p3s = parsePacket(p3).statements;
check("0003 has the reviewed statement count", p3s.length === 21, String(p3s.length));
check("0003 is indexes only", p3s.every((s) => /^CREATE INDEX IF NOT EXISTS "ix_crm_/.test(s)));
const p3Schema: Record<string, string[]> = {
  "crmActivities.ts": ["ix_crm_activities_lead_id", "ix_crm_activities_created_at"],
  "crmLeads.ts": ["ix_crm_leads_email", "ix_crm_leads_status", "ix_crm_leads_created_at", "ix_crm_leads_updated_at"],
  "crmTasks.ts": ["ix_crm_tasks_lead_id", "ix_crm_tasks_project_id"],
  "crmDeals.ts": ["ix_crm_deals_lead_id"],
  "crmProjects.ts": ["ix_crm_projects_lead_id"],
  "crmMessages.ts": ["ix_crm_messages_lead_id"],
  "crmCampaigns.ts": [
    "ix_crm_campaign_recipients_campaign_id", "ix_crm_campaign_recipients_lead_id", "ix_crm_campaign_recipients_status",
    "ix_crm_campaign_scheduled_messages_campaign_id", "ix_crm_campaign_scheduled_messages_lead_id",
    "ix_crm_campaign_scheduled_messages_status", "ix_crm_campaign_scheduled_messages_scheduled_at",
    "ix_crm_campaign_steps_campaign_id",
  ],
  "crmBehavioralEvents.ts": ["ix_crm_behavioral_events_lead_id", "ix_crm_behavioral_events_occurred_at"],
};
for (const [file, indexes] of Object.entries(p3Schema)) {
  const src = readFileSync(resolve(here, "src/schema", file), "utf8");
  for (const index of indexes) {
    check(`0003 creates index ${index}, which ${file} declares`, p3s.some((s) => s.includes(`"${index}"`)) && src.includes(`index("${index}")`));
    check(`${index} fits the 63-byte identifier limit`, Buffer.byteLength(index, "utf8") <= 63);
  }
}
check("0003 declares every index the schema files attribute to it", Object.values(p3Schema).flat().length === p3s.length);
check("0003 documents the rollback for every index it creates", p3s.every((s) => {
  const m = /"(ix_crm_[^"]+)"/.exec(s);
  return m !== null && p3.includes(`DROP INDEX IF EXISTS "${m[1]}"`);
}));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) process.exit(1);
console.log("All pushPacket contract tests passed.");
