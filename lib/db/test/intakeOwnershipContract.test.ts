/**
 * Checkpoint A1 — static, no-database ownership-contract assertions for the
 * intake_conversations/intake_messages migration cutover. No live database
 * connection is made anywhere in this file (DATABASE_URL is set to a
 * deliberately non-routable placeholder purely to satisfy drizzle.config.ts's
 * own import-time guard — drizzle-kit's `defineConfig` performs no
 * connection itself). Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeOwnershipContract.test.ts
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgres://placeholder:placeholder@127.0.0.1:1/placeholder";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.join(__dirname, "..");

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

const EXPECTED_LEGACY_TABLES = [
  "discovery_submissions",
  "form_submissions",
  "crm_leads",
  "crm_activities",
  "crm_tasks",
  "crm_email_templates",
  "crm_messages",
  "crm_deals",
  "crm_transactions",
  "crm_projects",
  "crm_campaigns",
  "crm_campaign_recipients",
  "crm_campaign_events",
  "crm_campaign_steps",
  "crm_campaign_scheduled_messages",
  "crm_behavioral_events",
  "ai_toolkit_purchases",
  "landing_page_views",
  "helpdesk_contacts",
  "helpdesk_agents",
  "helpdesk_tickets",
  "helpdesk_messages",
  "intake_firms",
  "intake_cases",
  "receptionist_sessions",
];

async function main(): Promise<void> {
  // ── 1 & 2: legacy-push tablesFilter is the exact allowlist, excluding
  // both intake tables ──────────────────────────────────────────────────────
  const legacyConfigModule = await import(path.join(dbRoot, "drizzle.config.ts"));
  const legacyConfig = legacyConfigModule.default;

  const tablesFilter: unknown = legacyConfig?.tablesFilter;
  assert(Array.isArray(tablesFilter), "drizzle.config.ts exports a tablesFilter array");

  if (Array.isArray(tablesFilter)) {
    const sortedActual = [...tablesFilter].sort();
    const sortedExpected = [...EXPECTED_LEGACY_TABLES].sort();
    assert(
      JSON.stringify(sortedActual) === JSON.stringify(sortedExpected),
      "tablesFilter contains exactly the expected 25 legacy table names, no more, no fewer",
    );
    assert(
      !tablesFilter.includes("intake_conversations"),
      "tablesFilter excludes intake_conversations",
    );
    assert(
      !tablesFilter.includes("intake_messages"),
      "tablesFilter excludes intake_messages",
    );
  }

  assert(
    JSON.stringify(legacyConfig?.schemaFilter) === JSON.stringify(["public"]),
    "drizzle.config.ts's schemaFilter is exactly ['public']",
  );

  // ── 3: candidate config has no dbCredentials ────────────────────────────
  const candidateConfigModule = await import(path.join(dbRoot, "drizzle.intake.candidate.config.ts"));
  const candidateConfig = candidateConfigModule.default;
  assert(
    candidateConfig !== null && typeof candidateConfig === "object" && !("dbCredentials" in candidateConfig),
    "drizzle.intake.candidate.config.ts has no dbCredentials field",
  );
  assert(
    !("url" in (candidateConfig ?? {})),
    "drizzle.intake.candidate.config.ts has no url field",
  );

  // ── 4: no migrate:intake / check:intake scripts exist ───────────────────
  const packageJson = JSON.parse(readFileSync(path.join(dbRoot, "package.json"), "utf8"));
  assert(
    !("migrate:intake" in (packageJson.scripts ?? {})),
    "package.json has no migrate:intake script",
  );
  assert(
    !("check:intake" in (packageJson.scripts ?? {})),
    "package.json has no check:intake script",
  );

  // ── 5: no canonical, executable intake migration directory exists ───────
  assert(
    !existsSync(path.join(dbRoot, "drizzle", "intake")),
    "no canonical lib/db/drizzle/intake/ directory exists",
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
