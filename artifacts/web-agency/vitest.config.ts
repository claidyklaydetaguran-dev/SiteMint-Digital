import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * web-agency has two kinds of committed test.
 *
 * The `*Contract.test.ts` suites are dependency-free scripts in the house
 * style that predates a test framework here — they `console.log` their checks
 * and `process.exit(1)` on failure, and they are run by the long `tsx` chain
 * in `@workspace/scripts`'s `test` script. They are deliberately EXCLUDED
 * below: they declare no `describe`/`it`, so Vitest would collect them, find
 * no suite, and fail. Leave them to the runner that already owns them.
 *
 * Everything else under `src/**` is an ordinary Vitest suite and runs here.
 * This config and the `test` script in package.json are what connect them to
 * the root `pnpm -r --if-present run test`.
 *
 * There is deliberately no jsdom environment: nothing in this package renders
 * a component under test today, and adding one would pull in a dependency
 * nothing needs yet.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "src/**/*Contract.test.ts"],
  },
});
