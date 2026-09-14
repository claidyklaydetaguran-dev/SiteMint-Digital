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
 */

export async function setup(): Promise<void> {
  const url = process.env["CRM_TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    // The DB-backed suites skip themselves when no test database is configured.
    // Saying so beats a confusing connection error from the import below.
    console.log("[globalSetup] no CRM_TEST_DATABASE_URL — DB-backed suites will skip");
    return;
  }
  // The db client reads DATABASE_URL at import time, so it must be set first
  // and must point at the scratch database, not whatever the developer happens
  // to have configured for running the app.
  process.env["DATABASE_URL"] = url;

  const { db } = await import("@workspace/db");
  const { crmStaff, crmStaffLoginAttempts } = await import("@workspace/db");
  const { assertDisposableDatabase } = await import("./src/lib/disposableDatabase.js");

  const name = await assertDisposableDatabase("the test-run global reset");

  // Sessions and tokens are ON DELETE CASCADE from crm_staff, so this is the
  // whole of the residue that causes the cascade.
  const staff = await db.delete(crmStaff).returning({ id: crmStaff.id });
  await db.delete(crmStaffLoginAttempts);

  if (staff.length > 0) {
    console.log(
      `[globalSetup] cleared ${staff.length} staff row(s) left over in "${name}" by a previous run`,
    );
  }
}
