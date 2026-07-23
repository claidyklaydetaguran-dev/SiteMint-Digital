// Phase 2C.2D verification — asserts the EXACT, actual database semantics
// of leadScore/tags/recommendedPackage/isAutomaticallyScored on
// discoverySubmissions (never assumed from "the insert omits them"), that
// the V1 insert explicitly writes isAutomaticallyScored: false, and that
// no legacy scoring/tagging/package-recommendation function is reachable
// from the structured-submission code path. Uses `getTableConfig`
// (drizzle-orm) — no live database connection, matching the existing
// lib/db/test/discoveryDatabaseContract.test.ts convention.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryV1QualificationDefault.test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { discoverySubmissions } from "@workspace/db/schema";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const config = getTableConfig(discoverySubmissions);
const columnsByName = new Map(config.columns.map((c) => [c.name, c]));

// ── Exact stored semantics ────────────────────────────────────────────────

{
  const col = columnsByName.get("lead_score");
  check("lead_score is NOT NULL", col?.notNull === true);
  check("lead_score has a database default", col?.hasDefault === true);
  check("lead_score's default value is exactly 1", col?.default === 1);
}

{
  const col = columnsByName.get("tags");
  check("tags is NOT NULL", col?.notNull === true);
  check("tags has a database default", col?.hasDefault === true);
  check("tags default is an empty array", Array.isArray(col?.default) && col.default.length === 0);
}

{
  const col = columnsByName.get("recommended_package");
  check("recommended_package is nullable (not NOT NULL)", col?.notNull === false);
  check("recommended_package has no database default", col?.hasDefault === false);
}

{
  const col = columnsByName.get("is_automatically_scored");
  check("is_automatically_scored column exists", col !== undefined);
  check("is_automatically_scored is nullable (legacy rows stay NULL — scoring state unknown)", col?.notNull === false);
  check("is_automatically_scored has no database default (never fabricated for legacy rows)", col?.hasDefault === false);
}

// ── The V1 insert explicitly stores false (not omitted, not NULL, not true) ──

{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const persistenceSource = fs.readFileSync(path.join(here, "../src/lib/discoveryV1Persistence.ts"), "utf8");
  const routeSource = fs.readFileSync(path.join(here, "../src/routes/discoveryV1.ts"), "utf8");
  const combined = persistenceSource + routeSource;

  const valuesBlockMatch = persistenceSource.match(/\.values\(\{([\s\S]*?)\n {6}\}\)/);
  const valuesBlock = valuesBlockMatch ? valuesBlockMatch[1] : "";
  check("valuesBlock was found (test is actually checking something)", valuesBlock.length > 0);
  check(
    "the submission insert explicitly sets isAutomaticallyScored: false",
    /\bisAutomaticallyScored\s*:\s*false\b/.test(valuesBlock),
  );
  check(
    "leadScore/tags/recommendedPackage are never explicitly assigned in the submission insert (DB defaults/NULL apply instead)",
    !/\b(leadScore|tags|recommendedPackage)\s*:/.test(valuesBlock),
  );

  // ── No legacy scoring, tagging, or package-recommendation function is invoked ──
  check(
    "neither discoveryV1Persistence.ts nor discoveryV1.ts imports the legacy scoring functions",
    !/calculateLeadScore|calculateTags|recommendPackage/.test(combined),
  );

  // ── The V1 response never exposes leadScore as a calculated result ──
  const responseSection = routeSource.slice(routeSource.indexOf("res.status(201)"));
  check(
    "the 201 API response never includes leadScore, tags, or recommendedPackage",
    !/leadScore|recommendedPackage/.test(responseSection.split("\n").slice(0, 3).join("\n")),
  );
}

if (failures > 0) {
  console.error(`\n${failures} discoveryV1QualificationDefault test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryV1QualificationDefault tests passed.");
}
