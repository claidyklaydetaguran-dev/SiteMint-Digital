/**
 * Puts the shared test database into a known state ONCE, before any suite runs.
 *
 * The failure this prevents is a cascade, and it is nastier than it sounds.
 * Roughly twenty-five DB-backed suites create their own staff actor, and
 * several of them exercise the bootstrap route, which by design only works when
 * `crm_staff` is empty. Each suite clears the table in `beforeAll` and again in
 * `afterAll` — which is fine, right up until one suite *fails*. A failing
 * suite's `afterAll` may not run, so it leaves its actor behind, and every
 * later suite that bootstraps an owner then fails with an unrelated 401.
 *
 * One genuine red test therefore presents as twenty red suites, none of which
 * names the real problem. That has already misled two separate readings of this
 * suite: the first blamed file parallelism (which is off), the second blamed
 * new billing code (which was innocent). The actual trigger both times was a
 * single earlier error — once from `DATABASE_URL` pointing at the owner-preview
 * database instead of the scratch one.
 *
 * Clearing the table here does not make any suite's own setup redundant; it
 * makes a *previous run's* residue stop mattering, so a failure stays local to
 * the suite that caused it and the next run starts clean regardless of how the
 * last one ended.
 *
 * It refuses outright on any database not on the disposable allowlist — the
 * same check the suites use — so this can never become the thing that wipes
 * real accounts.
 *
 * TWO LIMITS, both learned the hard way and worth stating rather than
 * discovering again:
 *
 * 1. This helps between runs, not within one. A suite that fails PARTWAY can
 *    still leave its actor behind and break later suites in the same run. The
 *    reset makes the NEXT run start clean regardless of how this one ended; it
 *    does not make a mid-run failure local.
 *
 * 2. Clearing the table is itself destructive to a CONCURRENT run — the first
 *    version of this file made two overlapping runs delete each other's live
 *    staff session, which surfaced as inexplicable 401s in whichever suite
 *    happened to be mid-flight. So the run takes an advisory lock on the
 *    scratch database first and refuses to start if another run holds it.
 *    Two runs sharing one scratch database was always a mistake; it is now a
 *    loud one instead of a confusing one.
 */

/** Arbitrary but fixed: any two runs must agree on the same key to collide. */
const RUN_LOCK_KEY = 0x5c17e57n; // "smtest"

export async function setup(): Promise<() => Promise<void>> {
  const noop = async () => {};
  const url = process.env["CRM_TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    // The DB-backed suites skip themselves when no test database is configured.
    // Saying so beats a confusing connection error from the import below.
    console.log("[globalSetup] no CRM_TEST_DATABASE_URL — DB-backed suites will skip");
    return noop;
  }
  // The db client reads DATABASE_URL at import time, so it must be set first
  // and must point at the scratch database, not whatever the developer happens
  // to have configured for running the app.
  process.env["DATABASE_URL"] = url;

  const { db } = await import("@workspace/db");
  const { crmStaff, crmStaffLoginAttempts } = await import("@workspace/db");
  const { assertDisposableDatabase } = await import("./src/lib/disposableDatabase.js");

  const name = await assertDisposableDatabase("the test-run global reset");

  // A dedicated connection, because a session-scoped advisory lock lives and
  // dies with the connection that took it — a pooled one would hand the lock
  // back the moment the query finished.
  // `pg` is a transitive dependency of @workspace/db, not a direct one of this
  // package, so it is resolved from there rather than from here. A plain
  // `import "pg"` fails with ERR_MODULE_NOT_FOUND.
  const { createRequire } = await import("node:module");
  const requireFromDb = createRequire(new URL("../../lib/db/package.json", import.meta.url));
  const pg = requireFromDb("pg") as typeof import("pg");
  const lockHolder = new pg.Client({ connectionString: url });
  await lockHolder.connect();

  const held = await lockHolder.query<{ got: boolean }>(
    "select pg_try_advisory_lock($1) as got", [String(RUN_LOCK_KEY)],
  );
  if (!held.rows[0]?.got) {
    await lockHolder.end();
    throw new Error(
      `Another test run is already using "${name}". Two runs cannot share one scratch `
      + "database: each clears crm_staff at startup, so they delete each other's live "
      + "sessions and both fail with 401s that name everything except the cause. "
      + "Wait for the other run to finish, or point CRM_TEST_DATABASE_URL at a different "
      + "scratch database.",
    );
  }

  // Sessions and tokens are ON DELETE CASCADE from crm_staff, so this is the
  // whole of the residue that causes the cascade.
  const staff = await db.delete(crmStaff).returning({ id: crmStaff.id });
  await db.delete(crmStaffLoginAttempts);

  if (staff.length > 0) {
    console.log(
      `[globalSetup] cleared ${staff.length} staff row(s) left over in "${name}" by a previous run`,
    );
  }

  return async () => {
    try {
      await lockHolder.query("select pg_advisory_unlock($1)", [String(RUN_LOCK_KEY)]);
    } finally {
      await lockHolder.end();
    }
  };
}
