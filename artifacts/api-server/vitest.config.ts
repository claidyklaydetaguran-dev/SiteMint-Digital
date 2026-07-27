import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The api-server test/ directory holds legacy standalone scripts
    // (PASS/FAIL console output, process.exit) predating Vitest — they are
    // run separately via `pnpm --filter @workspace/scripts run
    // test-legacy-api-server`, not collected here.
    include: ["src/**/*.test.ts"],
  },
});
