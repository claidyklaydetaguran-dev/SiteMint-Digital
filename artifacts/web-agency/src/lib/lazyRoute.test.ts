/**
 * Regression check for "The workspace failed to load."
 *
 * The reported failure was `/admin/crm/my-day` showing the route error panel.
 * The browser exception was:
 *
 *     TypeError: Failed to fetch dynamically imported module:
 *       http://localhost:22065/src/pages/crm/CrmMyDay.tsx
 *
 * The module itself served fine (200, 251 KB) and the API answered 200, so the
 * trigger was a transient transport failure. What made it *stick* was that
 * `React.lazy()` memoises a rejected import: measured in the running app with
 * a loader that fails once and would succeed on the second call, the loader
 * was invoked exactly once and the panel never recovered.
 *
 * These tests pin both halves of the repair:
 *   1. a transient module-load failure is retried and absorbed, so React never
 *      caches a rejection;
 *   2. a real error from inside a loaded module is NOT retried;
 *   3. every route in App.tsx goes through the retrying loader;
 *   4. the boundary's automatic reload budget is per-route, not session-wide,
 *      and its retry reloads for a chunk failure rather than remounting into
 *      the same cached rejection.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importWithRetry, isModuleLoadError } from "./lazyRoute";

const HERE = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

/** The exact message the browser produced for the reported failure. */
const REPORTED_MESSAGE =
  "Failed to fetch dynamically imported module: http://localhost:22065/src/pages/crm/CrmMyDay.tsx";

type Mod = { default: () => null };
const OK: Mod = { default: () => null };

describe("importWithRetry", () => {
  it("absorbs the exact failure that was reported, instead of caching it", async () => {
    let attempts = 0;
    const factory = async (): Promise<Mod> => {
      attempts++;
      if (attempts === 1) throw new TypeError(REPORTED_MESSAGE);
      return OK;
    };

    const mod = await importWithRetry(factory, { baseDelayMs: 1 });

    expect(mod).toBe(OK);
    // The original code called the loader once and gave up permanently.
    expect(attempts).toBe(2);
  });

  it("keeps retrying up to the attempt budget", async () => {
    let attempts = 0;
    const factory = async (): Promise<Mod> => {
      attempts++;
      if (attempts < 3) throw new TypeError(REPORTED_MESSAGE);
      return OK;
    };

    await expect(importWithRetry(factory, { attempts: 3, baseDelayMs: 1 })).resolves.toBe(OK);
    expect(attempts).toBe(3);
  });

  it("gives up after the budget and rethrows the real error", async () => {
    let attempts = 0;
    const factory = async (): Promise<Mod> => {
      attempts++;
      throw new TypeError(REPORTED_MESSAGE);
    };

    await expect(importWithRetry(factory, { attempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/Failed to fetch dynamically imported module/);
    expect(attempts).toBe(2);
  });

  it("does NOT retry an error thrown by a module that actually loaded", async () => {
    // Retrying a genuine defect just runs the broken code again and delays the
    // report, so this must surface on the first attempt.
    let attempts = 0;
    const factory = async (): Promise<Mod> => {
      attempts++;
      throw new TypeError("Cannot read properties of null (reading 'dayStart')");
    };

    await expect(importWithRetry(factory, { attempts: 3, baseDelayMs: 1 }))
      .rejects.toThrow(/dayStart/);
    expect(attempts).toBe(1);
  });

  it("recognises the module-load failures browsers actually emit", () => {
    for (const message of [
      REPORTED_MESSAGE,
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "ChunkLoadError: Loading chunk 42 failed.",
    ]) {
      expect(isModuleLoadError(new Error(message))).toBe(true);
    }
    expect(isModuleLoadError(new Error("Cannot read properties of null"))).toBe(false);
    expect(isModuleLoadError(null)).toBe(false);
  });
});

describe("App route loading", () => {
  const app = read("App.tsx");

  it("loads every route through the retrying loader", () => {
    // A bare `lazy(() => import(...))` anywhere here reintroduces the defect:
    // React would cache that route's rejection with no way back.
    const bare = app.match(/[^a-zA-Z]lazy\(\(\)\s*=>\s*import\(/g) ?? [];
    expect(bare).toEqual([]);

    const retrying = app.match(/lazyRoute\(\(\)\s*=>\s*import\(/g) ?? [];
    expect(retrying.length).toBeGreaterThan(50);
    expect(app).toContain('import { lazyRoute } from "@/lib/lazyRoute"');
  });

  it("still registers the My Day route that was reported broken", () => {
    expect(app).toContain('path="/admin/crm/my-day"');
  });
});

describe("RouteErrorBoundary", () => {
  const boundary = read("components/route/RouteErrorBoundary.tsx");

  it("budgets its automatic reload per route, not per session", () => {
    // The old key was one session-wide string, so the first chunk failure
    // anywhere spent the automatic reload for every other route too.
    expect(boundary).toContain("reloadKeyFor");
    expect(boundary).toMatch(/\$\{CHUNK_RELOAD_PREFIX\}:\$\{routeLabel/);
  });

  it("reloads rather than remounting when the failure was a chunk load", () => {
    // Remounting re-renders the same React.lazy, which re-throws the cached
    // rejection — the retry button could never work.
    expect(boundary).toContain("isChunkError");
    expect(boundary).toMatch(/if \(this\.state\.isChunkError\)[\s\S]{0,400}window\.location\.reload\(\)/);
  });

  it("classifies the error when it is caught, not only when it is logged", () => {
    expect(boundary).toMatch(/getDerivedStateFromError\(error: unknown\)/);
    expect(boundary).toMatch(/isChunkError: isModuleLoadError\(error\)/);
  });
});
