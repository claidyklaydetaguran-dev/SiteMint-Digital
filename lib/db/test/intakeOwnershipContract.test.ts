/**
 * Checkpoint A1 — static, no-database ownership-contract assertions for the
 * intake_conversations/intake_messages migration cutover. No live database
 * connection is made anywhere in this file (DATABASE_URL is set to a
 * deliberately non-routable placeholder purely to satisfy drizzle.config.ts's
 * own import-time guard — drizzle-kit's `defineConfig` performs no
 * connection itself). Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeOwnershipContract.test.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  // ── legacy-push tablesFilter is the exact allowlist, excluding both
  // intake tables ─────────────────────────────────────────────────────────
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

  // ── candidate config: shape, out path, no credentials ───────────────────
  const candidateConfigModule = await import(path.join(dbRoot, "drizzle.intake.candidate.config.ts"));
  const candidateConfig = candidateConfigModule.default;

  assert(
    candidateConfig?.out === "./drizzle-intake-candidate",
    "drizzle.intake.candidate.config.ts's out is exactly './drizzle-intake-candidate'",
  );
  assert(
    candidateConfig !== null && typeof candidateConfig === "object" && !("dbCredentials" in candidateConfig),
    "drizzle.intake.candidate.config.ts has no dbCredentials field",
  );
  assert(
    !("url" in (candidateConfig ?? {})),
    "drizzle.intake.candidate.config.ts has no url field",
  );

  // ── no operational Drizzle config points at the candidate directory ─────
  const operationalConfigFiles = ["drizzle.config.ts", "drizzle.voice.config.ts", "drizzle.discovery.config.ts"];
  for (const configFile of operationalConfigFiles) {
    const fullPath = path.join(dbRoot, configFile);
    if (!existsSync(fullPath)) continue; // not every config file is guaranteed present in every checkout
    const source = readFileSync(fullPath, "utf8");
    assert(
      !source.includes("drizzle-intake-candidate"),
      `${configFile} does not reference the drizzle-intake-candidate directory`,
    );
  }

  // ── candidate config is referenced only by generate:intake:candidate ────
  const packageJson = JSON.parse(readFileSync(path.join(dbRoot, "package.json"), "utf8"));
  const scripts: Record<string, string> = packageJson.scripts ?? {};

  const scriptsReferencingCandidateConfig = Object.entries(scripts)
    .filter(([, cmd]) => cmd.includes("drizzle.intake.candidate.config.ts"))
    .map(([name]) => name);
  assert(
    JSON.stringify(scriptsReferencingCandidateConfig) === JSON.stringify(["generate:intake:candidate"]),
    "drizzle.intake.candidate.config.ts is referenced by exactly one script: generate:intake:candidate",
  );

  // ── migrate:intake / check:intake remain absent ──────────────────────────
  assert(!("migrate:intake" in scripts), "package.json has no migrate:intake script");
  assert(!("check:intake" in scripts), "package.json has no check:intake script");

  // ── existing voice/discovery scripts remain untouched ────────────────────
  assert(
    scripts["generate:voice"] === "drizzle-kit generate --config ./drizzle.voice.config.ts",
    "generate:voice script is preserved unchanged",
  );
  assert(
    scripts["migrate:voice"] === "drizzle-kit migrate --config ./drizzle.voice.config.ts",
    "migrate:voice script is preserved unchanged",
  );

  // ── no canonical, executable intake migration directory exists ───────────
  assert(
    !existsSync(path.join(dbRoot, "drizzle", "intake")),
    "no canonical lib/db/drizzle/intake/ directory exists",
  );

  // ── no candidate artifacts have been generated ───────────────────────────
  const candidateDir = path.join(dbRoot, "drizzle-intake-candidate");
  assert(
    !existsSync(candidateDir) || readdirSync(candidateDir).length === 0,
    "no candidate migration artifacts have been generated under drizzle-intake-candidate/",
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
