import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The api-server test/ directory holds legacy standalone scripts
    // (PASS/FAIL console output, process.exit) predating Vitest — they are
    // run separately via `pnpm --filter @workspace/scripts run
    // test-legacy-api-server`, not collected here.
    include: ["src/**/*.test.ts"],

    // The DB-backed suites (crmStaffAuth, crmOperations, crmOperationsJourney)
    // share ONE PostgreSQL database and each needs a known starting state —
    // the staff bootstrap route, by design, only works when zero staff rows
    // exist. Run files in a single fork so two of them can never interleave
    // and truncate each other's fixtures mid-run.
    //
    // Everything else here is pure and unaffected; the cost is a few seconds
    // of wall clock against a whole class of false failures.
    fileParallelism: false,
  },
});
