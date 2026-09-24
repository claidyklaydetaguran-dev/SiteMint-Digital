// P9 — read-only migration preflight: the report an operator reads BEFORE
// touching any environment's database.
//
// It connects, reads the legacy + per-domain journals, and reports:
//   - the migrate-guard decision this database would get,
//   - per domain: applied count, pending tags, and HASH DRIFT — a
//     committed .sql whose bytes no longer match the hash the database
//     recorded (the "edited an applied migration" trap, caught here
//     before any migrate:* command locks itself out),
//   - the ordered plan of commands to run (bootstrap push first when the
//     database is empty, then each domain's guarded migrate).
//
// IT NEVER WRITES. No lock is taken; no drizzle-kit child is spawned.
// Exit codes: 0 = safe plan printed (possibly "nothing to do");
// 1 = refused/drift (read the findings); 2 = usage/connection error.
//
// The database is named, not inherited: `--target dev` or `--target prod`. The
// report leads with the identity it actually reached, so "exit 0, nothing to do"
// can never be read as a verdict about a different database than the one the
// operator had in mind.
//
//   node ./src/migrate-preflight.mjs --target dev

import { fileURLToPath } from "node:url";

import {
  BASELINE_DOMAINS,
  readExpectedMigrations,
} from "./baseline-journals.mjs";
import { readDatabaseIdentity, renderTargetBanner, resolveDbTarget } from "./db-target.mjs";
import { classifyMigrateReadiness, MIGRATE_DECISION, readState } from "./migrate-guard.mjs";

/**
 * Pure report builder — every branch unit-testable without a server.
 *
 * @param {object} input
 * @param {Array<{hash: string, created_at: string|number}>} input.legacyRows
 * @param {Map<string, Array<{hash: string, created_at: string|number}>|null>} input.domainRows
 * @param {Map<string, Array<{createdAt: number, hash: string, tag: string}>>} input.expectedByDomain
 */
export function buildPreflightReport({ legacyRows, domainRows, expectedByDomain }) {
  const verdict = classifyMigrateReadiness({ legacyRows, domainRows, expectedByDomain });
  const domains = [...expectedByDomain.keys()];

  const perDomain = domains.map((domain) => {
    const expected = expectedByDomain.get(domain) ?? [];
    const rows = domainRows.get(domain) ?? null;
    const applied = (rows ?? []).map((r) => ({ createdAt: Number(r.created_at), hash: String(r.hash) }));
    const appliedByCreatedAt = new Map(applied.map((r) => [r.createdAt, r.hash]));
    const pendingTags = expected.filter((e) => !appliedByCreatedAt.has(e.createdAt)).map((e) => e.tag);
    const hashDrift = expected
      .filter((e) => appliedByCreatedAt.has(e.createdAt) && appliedByCreatedAt.get(e.createdAt) !== e.hash)
      .map((e) => e.tag);
    return {
      domain,
      journalExists: rows !== null,
      appliedCount: applied.length,
      expectedCount: expected.length,
      pendingTags,
      hashDrift,
    };
  });

  const anyDrift = perDomain.some((d) => d.hashDrift.length > 0);
  const databaseEmpty = perDomain.every((d) => !d.journalExists || d.appliedCount === 0) && legacyRows.length === 0;

  /** @type {string[]} */
  const plan = [];
  if (verdict.decision === MIGRATE_DECISION.REFUSE_UNBASELINED) {
    plan.push("pnpm --filter @workspace/db run baseline:journals   # required first — legacy journal not yet baselined");
  } else if (verdict.decision === MIGRATE_DECISION.REFUSE_MISMATCHED || anyDrift) {
    // no runnable plan — findings only
  } else {
    if (databaseEmpty) {
      plan.push("pnpm --filter @workspace/db run migrate:fresh      # bootstrap-only base push on an empty database");
    }
    for (const d of perDomain) {
      if (d.pendingTags.length > 0) {
        plan.push(`pnpm --filter @workspace/db run migrate:${d.domain}   # applies ${d.pendingTags.join(", ")}`);
      }
    }
    if (plan.length === 0) plan.push("nothing to do — every committed migration is applied");
  }

  return {
    decision: verdict.decision,
    problems: verdict.problems,
    perDomain,
    anyDrift,
    databaseEmpty,
    plan,
    safe: verdict.decision !== MIGRATE_DECISION.REFUSE_UNBASELINED && verdict.decision !== MIGRATE_DECISION.REFUSE_MISMATCHED && !anyDrift,
  };
}

export function renderPreflightReport(report) {
  const lines = [];
  lines.push(`decision: ${report.decision}${report.safe ? "" : "  (REFUSED — do not migrate)"}`);
  for (const d of report.perDomain) {
    const state = d.journalExists ? `${d.appliedCount}/${d.expectedCount} applied` : "journal table absent";
    lines.push(`  ${d.domain}: ${state}${d.pendingTags.length ? `; pending: ${d.pendingTags.join(", ")}` : ""}`);
    for (const tag of d.hashDrift) {
      lines.push(`    !! HASH DRIFT on ${tag} — the committed .sql no longer matches what this database applied.`);
      lines.push(`       Never edit an applied migration's bytes (see lib/db/MIGRATIONS.md).`);
    }
  }
  for (const p of report.problems) lines.push(`  problem: ${p}`);
  lines.push("plan:");
  for (const step of report.plan) lines.push(`  ${step}`);
  return lines.join("\n");
}

async function main() {
  // The preflight is read-only, so it does not demand a stated expectation —
  // but it must still say WHICH database it examined, or its verdict is about
  // an unknown database and tells the operator nothing they can act on.
  const target = resolveDbTarget({ argv: process.argv.slice(2), env: process.env, requireExpectations: false });
  if (!target.ok) {
    console.error(`migrate preflight — ${target.message}`);
    process.exit(2);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: target.url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`migrate preflight — connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    process.exit(2);
  }
  try {
    const identity = await readDatabaseIdentity(client);
    console.log(renderTargetBanner({ ...target, identity }));
    console.log("");
    const expectedByDomain = new Map(BASELINE_DOMAINS.map((d) => [d, readExpectedMigrations(d)]));
    const { legacyRows, domainRows } = await readState(client, BASELINE_DOMAINS);
    const report = buildPreflightReport({ legacyRows, domainRows, expectedByDomain });
    console.log(renderPreflightReport(report));
    if (report.safe && report.plan.some((step) => step.startsWith("pnpm"))) {
      console.log("");
      console.log("Each step above must name this same target:");
      console.log(`  -- --target ${target.name} --expect-db ${identity.database} --expect-fingerprint ${target.fingerprint}` +
        (target.name === "prod" ? " --confirm prod" : ""));
    }
    process.exit(report.safe ? 0 : 1);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
