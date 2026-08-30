// P9 — deployment/recovery contract: the read-only migrate preflight's
// report builder (every branch on fixtures, no server), the backup/drill
// guards (the "cannot target a real environment" property), and the
// derived restore shape staying in lockstep with the committed inventory.

import { buildPreflightReport, renderPreflightReport } from "./src/migrate-preflight.mjs";
import { MIGRATE_DECISION } from "./src/migrate-guard.mjs";
import {
  expectedRestoreShape,
  pgEnvFromUrl,
  validateBackupOutPath,
  validateDrillTargetUrl,
} from "./src/restore-guards.mjs";
import { expectedApplicationTables } from "./src/migrate-fresh.mjs";
import { BASELINE_DOMAINS } from "./src/baseline-journals.mjs";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("--- deployRecoveryContract.test.ts ---");

// ── fixtures ─────────────────────────────────────────────────────────────────

type Expected = { createdAt: number; hash: string; tag: string; domain?: string };
function expectedByDomain(spec: Record<string, Expected[]>): Map<string, Expected[]> {
  return new Map(Object.entries(spec));
}
const VOICE: Expected[] = [
  { createdAt: 100, hash: "hv0", tag: "0000_a" },
  { createdAt: 200, hash: "hv1", tag: "0001_b" },
];
const SCHED: Expected[] = [{ createdAt: 150, hash: "hs0", tag: "0000_s" }];

// ── 1. empty database → bootstrap-first plan ─────────────────────────────────

{
  const report = buildPreflightReport({
    legacyRows: [],
    domainRows: new Map([
      ["voice", null],
      ["scheduling", null],
    ]),
    expectedByDomain: expectedByDomain({ voice: VOICE, scheduling: SCHED }),
  });
  check("empty database is safe", report.safe === true, report.decision);
  check("empty database is recognised as empty", report.databaseEmpty === true);
  check(
    "plan bootstraps first, then migrates each pending domain",
    report.plan.length === 3 &&
      report.plan[0]!.includes("migrate:fresh") &&
      report.plan[1]!.includes("migrate:voice") &&
      report.plan[2]!.includes("migrate:scheduling"),
    report.plan.join(" | "),
  );
  check("pending tags are named in the plan", report.plan[1]!.includes("0000_a, 0001_b"));
}

// ── 2. fully applied → nothing to do ─────────────────────────────────────────

{
  const report = buildPreflightReport({
    legacyRows: [],
    domainRows: new Map([
      ["voice", VOICE.map((e) => ({ hash: e.hash, created_at: e.createdAt }))],
      ["scheduling", SCHED.map((e) => ({ hash: e.hash, created_at: e.createdAt }))],
    ]),
    expectedByDomain: expectedByDomain({ voice: VOICE, scheduling: SCHED }),
  });
  check("fully applied is safe", report.safe === true, report.decision);
  check("fully applied plan is nothing-to-do", report.plan.length === 1 && report.plan[0]!.includes("nothing to do"));
  check("per-domain counts are reported", report.perDomain[0]!.appliedCount === 2 && report.perDomain[0]!.expectedCount === 2);
}

// ── 3. partial → only the pending domain migrates ────────────────────────────

{
  const report = buildPreflightReport({
    legacyRows: [],
    domainRows: new Map([
      ["voice", [{ hash: "hv0", created_at: 100 }]],
      ["scheduling", SCHED.map((e) => ({ hash: e.hash, created_at: e.createdAt }))],
    ]),
    expectedByDomain: expectedByDomain({ voice: VOICE, scheduling: SCHED }),
  });
  check("partial database is safe", report.safe === true, report.decision);
  check(
    "only the pending domain appears in the plan",
    report.plan.length === 1 && report.plan[0]!.includes("migrate:voice") && report.plan[0]!.includes("0001_b"),
    report.plan.join(" | "),
  );
  check("a partially applied database is not 'empty'", report.databaseEmpty === false);
}

// ── 4. hash drift → refused with the trap named ──────────────────────────────

{
  const report = buildPreflightReport({
    legacyRows: [],
    domainRows: new Map([
      ["voice", [{ hash: "TAMPERED", created_at: 100 }]],
      ["scheduling", null],
    ]),
    expectedByDomain: expectedByDomain({ voice: VOICE, scheduling: SCHED }),
  });
  check("hash drift is unsafe", report.safe === false, report.decision);
  check("the drifted tag is identified", report.perDomain[0]!.hashDrift.includes("0000_a"));
  const rendered = renderPreflightReport(report);
  check("the rendering names the edited-migration trap", rendered.includes("HASH DRIFT") && rendered.includes("Never edit an applied migration"));
}

// ── 5. legacy unbaselined → baseline step is the whole plan ──────────────────

{
  const report = buildPreflightReport({
    legacyRows: [{ hash: "hv0", created_at: 100 }],
    domainRows: new Map([
      ["voice", null],
      ["scheduling", null],
    ]),
    expectedByDomain: expectedByDomain({ voice: VOICE, scheduling: SCHED }),
  });
  check("legacy journal without baselines is refused", report.decision === MIGRATE_DECISION.REFUSE_UNBASELINED);
  check("the plan is the baseline command", report.plan.length === 1 && report.plan[0]!.includes("baseline:journals"));
}

// ── 6. drill target guard: cannot aim at a real environment ──────────────────

{
  const good = validateDrillTargetUrl("postgres://u:p@localhost:5432/sitemint_restore_drill");
  check("a drill-named database is accepted", good.ok === true && (good as { dbName: string }).dbName === "sitemint_restore_drill");
  const cases: Array<[string, string]> = [
    ["postgres://u:p@host/sitemint", "undeclared name"],
    ["postgres://u:p@host/sitemint_prod_drill", "prod outranks drill"],
    ["postgres://u:p@host/staging_scratch", "staging outranks scratch"],
    ["postgres://u:p@host/", "no database name"],
    ["mysql://u:p@host/drill", "wrong protocol"],
    ["not a url", "unparseable"],
  ];
  for (const [url, label] of cases) {
    const verdict = validateDrillTargetUrl(url);
    check(`drill guard refuses: ${label}`, verdict.ok === false);
  }
}

// ── 7. backup guards + secret-free child environment ─────────────────────────

{
  check("backup requires --out", validateBackupOutPath("", () => false).ok === false);
  check("backup requires a dump/sql suffix", validateBackupOutPath("x.txt", () => false).ok === false);
  check("backup refuses to overwrite", validateBackupOutPath("x.dump", () => true).ok === false);
  check("backup accepts a fresh .dump", validateBackupOutPath("backups/x.dump", () => false).ok === true);

  const env = pgEnvFromUrl("postgres://user%40x:se%3Acret@db.example.com:6543/mydb?sslmode=require");
  check(
    "the URL decomposes into PG* vars (never argv)",
    env.ok === true &&
      env.env.PGHOST === "db.example.com" &&
      env.env.PGPORT === "6543" &&
      env.env.PGDATABASE === "mydb" &&
      env.env.PGUSER === "user@x" &&
      env.env.PGPASSWORD === "se:cret" &&
      env.env.PGSSLMODE === "require",
    JSON.stringify(env),
  );
  const defaultPort = pgEnvFromUrl("postgres://u:p@host/db");
  check("the port defaults to 5432", defaultPort.ok === true && defaultPort.env.PGPORT === "5432");
  check("a non-postgres URL is refused", pgEnvFromUrl("https://host/db").ok === false);
}

// ── 8. the drill shape is derived, not pinned ────────────────────────────────

{
  const shape = await expectedRestoreShape();
  check(
    "drill table count equals the derived application inventory",
    shape.publicTableCount === expectedApplicationTables().length,
    `${shape.publicTableCount} vs ${expectedApplicationTables().length}`,
  );
  check(
    "drill journals equal the baseline domains",
    JSON.stringify(shape.journalTables) === JSON.stringify(BASELINE_DOMAINS.map((d: string) => `__drizzle_migrations_${d}`)),
  );
}

console.log(`${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
