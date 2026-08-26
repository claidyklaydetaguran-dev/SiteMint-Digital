import { defineConfig, loadEnv, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/**
 * ── AR-001J final refinement, owner decision A: one canonical flag value ──
 *
 * The three voice build flags gate both a runtime decision (navigation and
 * route registration) and a build decision (whether the gated code is emitted
 * at all). `lib/featureFlags.ts` answers the two statically decidable
 * spellings with literal comparisons that Vite substitutes and Rollup folds,
 * and defers everything else to `parseBooleanFlag`. That made the two
 * decisions agree, but it left static removal partial: a spelling the parser
 * accepts but the bundler cannot decide (`"TRUE"`, `" true "`) and one it
 * rejects but the bundler also cannot decide (`"1"`, `"yes"`) both left the
 * gated modules in the build.
 *
 * Canonicalising here closes that gap without narrowing the public contract.
 * The environment still accepts every spelling it documented; the same truth
 * table that `parseBooleanFlag` implements is applied once, before Vite
 * resolves its env and therefore before Rollup constructs the module graph,
 * and application code only ever sees the literal string "true" or "false".
 * Consequences, all of them measured by the build matrix:
 *
 *   • every accepted true spelling produces the same build as "true";
 *   • every other value — unset, malformed, "1", "yes", "on", whitespace —
 *     produces the same build as "false", with the gated code fully removed;
 *   • the runtime parser and the build boundary can no longer disagree,
 *     because there is only one value left for either of them to read;
 *   • no raw environment value reaches browser code, in dev or in a build.
 *
 * This is deliberately written back into `process.env`, which is exactly
 * where Vite's own `loadEnv` looks last and therefore trusts most: the dev
 * server's `import.meta.env` object, a production build's static
 * substitution, and the whole-object fallback all take the canonical value
 * from the same place. Only these three names are touched.
 */
const VOICE_BUILD_FLAGS = [
  "VITE_VOICE_PLATFORM_ENABLED",
  "VITE_VOICE_PUBLISH_ENABLED",
  "VITE_VOICE_BROWSER_TEST_ENABLED",
] as const;

/**
 * `parseBooleanFlag`'s table, unchanged: a string whose trimmed, lower-cased
 * form is exactly `true`. Everything else, including every non-string and
 * every unset value, is false.
 */
function canonicalVoiceFlagValue(raw: string | undefined): "true" | "false" {
  return typeof raw === "string" && raw.trim().toLowerCase() === "true" ? "true" : "false";
}

function canonicalizeVoiceBuildFlags(mode: string, envDir: string): Record<string, "true" | "false"> {
  // Same sources and same precedence Vite itself uses a moment later: the
  // mode's .env files, then real process environment variables, which win.
  const resolved = loadEnv(mode, envDir, "VITE_");
  const canonical: Record<string, "true" | "false"> = {};
  for (const name of VOICE_BUILD_FLAGS) {
    const value = canonicalVoiceFlagValue(resolved[name]);
    process.env[name] = value;
    canonical[name] = value;
  }
  return canonical;
}

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const root = path.resolve(import.meta.dirname);

  // Before anything else reads the environment: see the note above.
  canonicalizeVoiceBuildFlags(mode, root);

  const rawPort = process.env.PORT;
  const basePath = process.env.BASE_PATH;

  // PORT and BASE_PATH are required for dev/preview but not for production builds.
  // The deployment system provides them via artifact.toml [services.env]; from bash
  // (typecheck, CI) they are absent — only the server config needs them.
  const isServing = command === "serve";

  if (isServing && !rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }

  if (isServing && !basePath) {
    throw new Error("BASE_PATH environment variable is required but was not provided.");
  }

  const port = Number(rawPort ?? "3000");
  const base = basePath ?? "/ai-receptionist/dashboard";

  if (isServing && (Number.isNaN(port) || port <= 0)) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      // Local dev only: production serves the dashboard and /api behind the
      // same origin (see CLAUDE.md), so this proxy exists purely so `pnpm
      // --filter @workspace/helpdesk run dev` can reach a locally running
      // api-server on its own port without changing any request paths.
      proxy: process.env.API_PROXY_TARGET
        ? { "/api": { target: process.env.API_PROXY_TARGET, changeOrigin: true } }
        : undefined,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
