/**
 * Checkpoint A1/A2 — static, no-database, no-module-execution
 * ownership-contract assertions for the intake_conversations/intake_messages
 * migration cutover. Deliberately parses the Drizzle config files as plain
 * text rather than importing/executing them: drizzle.config.ts uses
 * `path.join(__dirname, ...)`, which is only valid when the file is loaded
 * through drizzle-kit's own CJS-style config loader (as it always is in
 * real use) — a direct ESM `import()` of that file (as this test would
 * otherwise need to do) throws `__dirname is not defined in ES module
 * scope`, since lib/db/package.json declares `"type": "module"`. That is a
 * pre-existing property of drizzle.config.ts, not something introduced or
 * fixed here; this test simply never exercises that code path, and instead
 * verifies the same facts via source-text inspection, which is more direct
 * for a static/no-execution test in any case. Run via:
 *   pnpm --filter @workspace/scripts exec tsx lib/db/test/intakeOwnershipContract.test.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.join(__dirname, "..");

/** Extracts the string array literal following `key: [ ... ]` in `source`. Throws if not found. */
function extractStringArray(source: string, key: string): string[] {
  const match = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) throw new Error(`Could not find "${key}: [...]" in source`);
  return [...match[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
}

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
  const legacyConfigSource = readFileSync(path.join(dbRoot, "drizzle.config.ts"), "utf8");
  const tablesFilter = extractStringArray(legacyConfigSource, "tablesFilter");

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

  const schemaFilter = extractStringArray(legacyConfigSource, "schemaFilter");
  assert(
    JSON.stringify(schemaFilter) === JSON.stringify(["public"]),
    "drizzle.config.ts's schemaFilter is exactly ['public']",
  );

  // ── candidate config: shape, out path, no credentials ───────────────────
  // Comments are stripped before scanning so that explanatory prose
  // *mentioning* dbCredentials/defineConfig (to say they're intentionally
  // absent) isn't mistaken for actual usage of them.
  const candidateConfigSourceRaw = readFileSync(path.join(dbRoot, "drizzle.intake.candidate.config.ts"), "utf8");
  const candidateConfigSource = candidateConfigSourceRaw
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

  const outMatch = /out\s*:\s*["']([^"']*)["']/.exec(candidateConfigSource);
  assert(
    outMatch?.[1] === "./drizzle-intake-candidate",
    "drizzle.intake.candidate.config.ts's out is exactly './drizzle-intake-candidate'",
  );
  assert(
    !/\bdbCredentials\b/.test(candidateConfigSource),
    "drizzle.intake.candidate.config.ts has no dbCredentials field",
  );
  assert(
    !/^\s*url\s*:/m.test(candidateConfigSource),
    "drizzle.intake.candidate.config.ts has no url field",
  );
  assert(
    !/defineConfig/.test(candidateConfigSource),
    "drizzle.intake.candidate.config.ts does not use defineConfig (avoids its dbCredentials-requiring type)",
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
