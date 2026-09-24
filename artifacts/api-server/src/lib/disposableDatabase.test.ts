/**
 * A destructive test helper must never be able to run against a real database.
 *
 * Several suites clear whole tables in setup — one of them empties `crm_staff`
 * outright, because it needs a zero-staff database to exercise the bootstrap
 * path. Against `crm_preview` that deletes the owner accounts somebody actually
 * signs in with, including the real one.
 *
 * The protection used to be "whoever runs it exports the right
 * CRM_TEST_DATABASE_URL". This pins the replacement, and the source scan is the
 * part that matters: it fails when a NEW unqualified delete appears without the
 * guard, which is how this would otherwise come back.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

function everyTestFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { everyTestFile(full, out); continue; }
    if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * An unqualified delete: `db.delete(table)` with no `.where(...)` after it.
 * Matching on the absence of `.where` on the same line is exact here, because
 * drizzle's builder puts them together — a qualified delete never wraps.
 */
const UNQUALIFIED_DELETE = /\bdb\.delete\((?:schema\.)?[A-Za-z_][A-Za-z0-9_]*\)\s*;/;
const TRUNCATE = /\bTRUNCATE\b/i;

describe("destructive test cleanup is guarded", () => {
  const files = everyTestFile(SRC);

  it("finds the suites to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every file that wipes a whole table asserts the database is disposable", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const wipes = UNQUALIFIED_DELETE.test(source) || TRUNCATE.test(source);
      if (!wipes) continue;
      if (source.includes("assertDisposableDatabase")) continue;
      // This file itself contains the patterns as string literals.
      if (file.endsWith("disposableDatabase.test.ts")) continue;
      offenders.push(file.slice(SRC.length + 1).replace(/\\/g, "/"));
    }

    expect(
      offenders,
      "these suites clear whole tables without asserting the database is disposable, "
        + "so pointing them at crm_preview would delete real accounts:\n  "
        + offenders.join("\n  ")
        + "\nAdd: await assertDisposableDatabase(\"<suite> cleanup\") before the deletes.",
    ).toEqual([]);
  });

  it("keeps the owner preview off the disposable list", async () => {
    // The whole point. If crm_preview is ever added here, the guard stops
    // guarding the one database it exists to protect.
    const { DISPOSABLE_DATABASES } = await import("./disposableDatabase.js");
    expect(DISPOSABLE_DATABASES).not.toContain("crm_preview");
    expect(DISPOSABLE_DATABASES).toContain("crm_test");
  });

  it("resets staff residue before the run, and guards that reset too", () => {
    // Why this is pinned: ~25 suites bootstrap an owner, which only works on an
    // empty crm_staff. A suite that FAILS may skip its afterAll and leave its
    // actor behind, and every later bootstrap then fails with an unrelated 401
    // — one red test presenting as twenty. The global reset makes a failure
    // stay local to the suite that caused it.
    //
    // It is also the loudest possible place to catch a misaimed DATABASE_URL:
    // it runs before any suite, so a wrong database aborts the run with a
    // message naming it instead of producing a wall of mystery 401s.
    const root = join(SRC, "..");
    const config = readFileSync(join(root, "vitest.config.ts"), "utf8");
    expect(config, "vitest.config.ts must register the global reset").toMatch(
      /globalSetup:\s*\[\s*["']\.\/vitest\.globalSetup\.ts["']/,
    );

    const setup = readFileSync(join(root, "vitest.globalSetup.ts"), "utf8");
    expect(setup, "the reset must refuse a non-disposable database").toContain(
      "assertDisposableDatabase",
    );
    // The assertion has to come BEFORE the delete, or the guard is decoration.
    expect(
      setup.indexOf("assertDisposableDatabase("),
      "assertDisposableDatabase must run before any delete",
    ).toBeLessThan(setup.indexOf("db.delete("));

    // And the reset is itself destructive to a CONCURRENT run: two overlapping
    // runs would delete each other's live staff session, which surfaces as
    // inexplicable 401s in whichever suite happens to be mid-flight. The lock
    // must be taken before the delete too, or the race is still open.
    expect(setup, "the reset must refuse to run alongside another run").toContain(
      "pg_try_advisory_lock",
    );
    expect(
      setup.indexOf("pg_try_advisory_lock"),
      "the advisory lock must be taken before any delete",
    ).toBeLessThan(setup.indexOf("db.delete("));
    expect(setup, "and must release it afterwards").toContain("pg_advisory_unlock");
  });
});
