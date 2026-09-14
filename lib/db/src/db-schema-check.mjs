// Read-only: assert that the objects a migration was supposed to create are
// actually present in the database you name.
//
// "4/4 applied" says the runner recorded four rows in its journal. It does not
// say the table exists — a journal can be baselined, restored, or copied from
// another database. This command asks the server what it actually holds, so
// that "do not republish code that requires a table absent from the deployment
// database" can be checked rather than assumed.
//
// Reads information_schema and pg_indexes only. It selects no customer row,
// takes no lock, writes nothing, and prints no credential.
//
//   node ./src/db-schema-check.mjs --target prod --expect-db neondb \
//        --expect-fingerprint 0d60ab6bd05c
//
// Exit codes: 0 = every expected object present; 1 = something missing;
// 2 = usage, identity or connection error.

import { fileURLToPath } from "node:url";

import {
  readDatabaseIdentity,
  renderTargetBanner,
  resolveDbTarget,
  verifyDbIdentity,
} from "./db-target.mjs";

/**
 * What each scheduling migration is expected to have left behind. Keyed by the
 * journal tag so a failure names the migration to investigate, not just the
 * object.
 */
const EXPECTED = [
  {
    tag: "0002_superb_wither",
    tables: ["scheduling_date_exceptions"],
    columns: [
      ["scheduling_date_exceptions", "date_key"],
      ["scheduling_date_exceptions", "closed"],
      ["scheduling_appointment_types", "min_notice_minutes"],
      ["scheduling_appointment_types", "max_advance_days"],
      ["scheduling_appointment_types", "slot_interval_minutes"],
      ["scheduling_appointment_types", "calendar_id"],
    ],
    indexes: ["uq_scheduling_date_exceptions_firm_id_date"],
    constraints: [
      "ck_scheduling_date_exceptions_date_key",
      "ck_scheduling_date_exceptions_hours_match_closed",
      "ck_scheduling_appointment_types_overrides_sane",
      "scheduling_date_exceptions_firm_id_intake_firms_id_fk",
    ],
  },
  {
    tag: "0003_tired_vivisector",
    tables: [],
    columns: [["scheduling_appointment_requests", "tool_call_id"]],
    // Partial: the uniqueness only applies to rows that carry a tool call id,
    // so many requests may legitimately share a NULL.
    indexes: ["uq_scheduling_appointment_requests_firm_tool_call"],
    constraints: [],
  },
];

async function presentTables(client, names) {
  if (names.length === 0) return new Set();
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [names],
  );
  return new Set(rows.map((r) => r.table_name));
}

async function presentColumns(client, pairs) {
  if (pairs.length === 0) return new Set();
  const { rows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) = ANY(
              SELECT unnest($1::text[]), unnest($2::text[]))`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
  );
  return new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
}

async function presentIndexes(client, names) {
  if (names.length === 0) return new Set();
  const { rows } = await client.query(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1)`,
    [names],
  );
  return new Set(rows.map((r) => r.indexname));
}

async function presentConstraints(client, names) {
  if (names.length === 0) return new Set();
  const { rows } = await client.query(
    `SELECT conname FROM pg_constraint WHERE conname = ANY($1)`,
    [names],
  );
  return new Set(rows.map((r) => r.conname));
}

async function main() {
  // `requireExpectations: false` so a read-only report does not demand
  // `--confirm prod` — that word belongs to commands that change something.
  // The expected identity is still mandatory, enforced immediately below:
  // reporting "present" about the wrong database is its own kind of damage.
  const resolved = resolveDbTarget({ argv: process.argv.slice(2), env: process.env, requireExpectations: false });
  if (!resolved.ok) {
    console.error(`db schema check — ${resolved.message}`);
    process.exit(2);
  }
  if (resolved.expectDb === undefined || resolved.expectFingerprint === undefined) {
    console.error(
      `db schema check — name the identity you expect to reach: --expect-db <name> --expect-fingerprint <hex12>.\n` +
        `Read them first with:  node ./src/db-identity.mjs --target ${resolved.name}`,
    );
    process.exit(2);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: resolved.url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`db schema check — connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    process.exit(2);
  }

  try {
    const identity = await readDatabaseIdentity(client);
    console.log(renderTargetBanner({ ...resolved, identity }));
    console.log("");

    // The same gate every mutating command uses. A read is harmless, but
    // reporting "present" about the wrong database is not.
    const verified = verifyDbIdentity({
      expectDb: resolved.expectDb,
      expectFingerprint: resolved.expectFingerprint,
      actualDatabase: identity.database,
      actualFingerprint: resolved.fingerprint,
    });
    if (!verified.ok) {
      console.error(`db schema check — ${verified.message}`);
      process.exit(2);
    }

    const missing = [];
    for (const group of EXPECTED) {
      const tables = await presentTables(client, group.tables);
      const columns = await presentColumns(client, group.columns);
      const indexes = await presentIndexes(client, group.indexes);
      const constraints = await presentConstraints(client, group.constraints);

      const gaps = [
        ...group.tables.filter((t) => !tables.has(t)).map((t) => `table ${t}`),
        ...group.columns.filter(([t, c]) => !columns.has(`${t}.${c}`)).map(([t, c]) => `column ${t}.${c}`),
        ...group.indexes.filter((i) => !indexes.has(i)).map((i) => `index ${i}`),
        ...group.constraints.filter((c) => !constraints.has(c)).map((c) => `constraint ${c}`),
      ];

      const checked =
        group.tables.length + group.columns.length + group.indexes.length + group.constraints.length;
      if (gaps.length === 0) {
        console.log(`${group.tag}: all ${checked} objects present`);
      } else {
        console.log(`${group.tag}: MISSING ${gaps.length} of ${checked}`);
        for (const gap of gaps) console.log(`  missing ${gap}`);
        missing.push(...gaps);
      }
    }

    console.log("");
    if (missing.length > 0) {
      console.log("result: incomplete — do not deploy code that reads these objects");
      process.exit(1);
    }
    console.log("result: complete");
    process.exit(0);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
