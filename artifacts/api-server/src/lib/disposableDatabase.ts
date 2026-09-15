/**
 * Refuses to let a destructive test helper run against a database somebody
 * actually uses.
 *
 * Several suites clear whole tables in their setup — `crmDeliveries.test.ts`
 * does `db.delete(crmStaff)`, unqualified, because it needs a zero-staff
 * database to exercise the bootstrap path. That is legitimate for a scratch
 * database and catastrophic for any other: it would delete the owner accounts,
 * including the real one somebody signs in with.
 *
 * Until now the only thing standing between those two outcomes was whoever ran
 * the suite exporting the right `CRM_TEST_DATABASE_URL`. That is a convention,
 * not a safeguard, and it fails silently in the one direction that matters.
 *
 * This asks the database what its own name is and refuses anything not on the
 * allowlist. It is deliberately a NAME check rather than a URL check: a URL can
 * point somewhere other than it appears to (a tunnel, a pooler, a copied
 * connection string with the database swapped), and the name comes from the
 * server that is actually about to be written to.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Databases a suite may wipe. Anything else is refused.
 *
 * `crm_preview` is deliberately absent and must stay absent: it holds the owner
 * demo data and the real staff accounts.
 *
 * `crm_test_a`…`crm_test_d` exist so parallel workstreams each get their own
 * scratch database. One shared database cannot be shared safely: every run
 * clears crm_staff at startup, so two overlapping runs delete each other's live
 * sessions. The run lock now makes that collision loud rather than confusing,
 * but a loud refusal still stops the second workstream dead — separate
 * databases let both proceed. They are listed by name, not matched by pattern,
 * so nothing that merely resembles a test database can ever qualify.
 */
export const DISPOSABLE_DATABASES = [
  "crm_test", "crm_test_a", "crm_test_b", "crm_test_c", "crm_test_d", "crm_install_probe",
] as const;

/** Databases named explicitly so the refusal can say why. */
const PROTECTED_DATABASES: Record<string, string> = {
  crm_preview: "the owner preview — it holds real staff accounts and the demo data",
};

let cached: string | null = null;

export async function currentDatabaseName(): Promise<string> {
  if (cached) return cached;
  const rows = await db.execute(sql`select current_database() as name`);
  // drizzle returns either rows[] or { rows: [] } depending on the driver.
  const first = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | { name?: string }
    | undefined;
  cached = String(first?.name ?? "");
  return cached;
}

/**
 * Throws unless the connected database is one a test may destroy.
 *
 * Call this before any unqualified delete or truncate in a test. The message
 * names the database it found, because the usual cause is an environment
 * variable pointing somewhere unintended, and the fastest fix is seeing which.
 */
export async function assertDisposableDatabase(what = "destructive test cleanup"): Promise<string> {
  const name = await currentDatabaseName();

  const protectedReason = PROTECTED_DATABASES[name];
  if (protectedReason) {
    throw new Error(
      `Refusing to run ${what} against "${name}" — ${protectedReason}. `
      + `Point CRM_TEST_DATABASE_URL and DATABASE_URL at one of: ${DISPOSABLE_DATABASES.join(", ")}.`,
    );
  }

  if (!(DISPOSABLE_DATABASES as readonly string[]).includes(name)) {
    throw new Error(
      `Refusing to run ${what} against "${name}" — it is not a known disposable database. `
      + `Allowed: ${DISPOSABLE_DATABASES.join(", ")}. `
      + `If this database really is scratch, add it to DISPOSABLE_DATABASES deliberately.`,
    );
  }

  return name;
}

/** Test seam — the name is cached because it cannot change within a process. */
export function __resetDatabaseNameCache(): void {
  cached = null;
}
