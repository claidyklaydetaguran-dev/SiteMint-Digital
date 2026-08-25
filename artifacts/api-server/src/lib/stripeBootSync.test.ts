/**
 * AR-001G — opt-in Stripe boot synchronization.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * The connector, the webhook lookup and the backfill are represented by a
 * single counted spy standing in for `initStripeWebhookAndSync`. Proving that
 * spy was never invoked proves none of the three happened, because in
 * `index.ts` all three live behind that one call. `fetch` is additionally
 * tripwired so an accidental direct request would fail the suite rather than
 * pass silently.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  STRIPE_BOOT_SYNC_ENABLED_ENV_VAR,
  describeBootSyncFailure,
  isStripeBootSyncEnabled,
  startStripeBootSync,
  type StripeBootSyncEnv,
} from "./stripeBootSync.js";

// ─── Tripwire ──────────────────────────────────────────────────────────────

let fetchCalls = 0;
const globalAny = globalThis as unknown as Record<string, unknown>;
let originalFetch: unknown;

beforeAll(() => {
  originalFetch = globalAny["fetch"];
  globalAny["fetch"] = function trip(): never {
    fetchCalls += 1;
    throw new Error("AR-001G tripwire: fetch must never be invoked by the Stripe boot-sync guard");
  };
});

afterAll(() => {
  if (originalFetch === undefined) delete globalAny["fetch"];
  else globalAny["fetch"] = originalFetch;
});

afterEach(() => {
  expect(fetchCalls, "fetch must never be invoked").toBe(0);
});

// ─── Harness ───────────────────────────────────────────────────────────────

interface LogEntry {
  level: "info" | "error";
  meta: Record<string, unknown>;
  message: string;
}

function harness(env: StripeBootSyncEnv, runBootSync?: () => Promise<void>) {
  const logs: LogEntry[] = [];
  let calls = 0;
  const deps = {
    isEnabled: () => isStripeBootSyncEnabled(env),
    runBootSync: () => {
      calls += 1;
      return runBootSync ? runBootSync() : Promise.resolve();
    },
    logger: {
      info(meta: Record<string, unknown>, message: string) {
        logs.push({ level: "info" as const, meta, message });
      },
      error(meta: Record<string, unknown>, message: string) {
        logs.push({ level: "error" as const, meta, message });
      },
    },
  };
  return { deps, logs, calls: () => calls };
}

// ═══════════════════════════════════════════════════════════════════════════
describe("flag parsing", () => {
  it("defaults to false when the flag is absent", () => {
    expect(isStripeBootSyncEnabled({})).toBe(false);
  });

  it("enables only on the exact string true", () => {
    expect(isStripeBootSyncEnabled({ STRIPE_BOOT_SYNC_ENABLED: "true" })).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["uppercase TRUE", "TRUE"],
    ["capitalised True", "True"],
    ["the numeral one", "1"],
    ["yes", "yes"],
    ["on", "on"],
    ["padded true", " true "],
    ["the string false", "false"],
    ["arbitrary text", "enabled-please"],
  ])("fails closed for %s", (_label, value) => {
    expect(isStripeBootSyncEnabled({ STRIPE_BOOT_SYNC_ENABLED: value })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("boot-sync activation", () => {
  it("performs zero connector calls when the flag is missing", () => {
    const h = harness({});
    startStripeBootSync(h.deps);
    expect(h.calls()).toBe(0);
  });

  it("performs zero connector calls when the flag is false", () => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "false" });
    startStripeBootSync(h.deps);
    expect(h.calls()).toBe(0);
  });

  it.each(["TRUE", "1", "yes", " true ", ""])("performs zero connector calls for the invalid value %j", (value) => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: value });
    startStripeBootSync(h.deps);
    expect(h.calls()).toBe(0);
  });

  it("activates the existing routine exactly once on the exact true value", () => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "true" });
    startStripeBootSync(h.deps);
    expect(h.calls()).toBe(1);
  });

  it("does not activate twice when invoked once", () => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "true" });
    startStripeBootSync(h.deps);
    expect(h.calls()).toBe(1);
  });

  it("logs a safe informational line when disabled", () => {
    const h = harness({});
    startStripeBootSync(h.deps);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]?.level).toBe("info");
    expect(h.logs[0]?.meta).toEqual({ [STRIPE_BOOT_SYNC_ENABLED_ENV_VAR]: false });
  });

  it("continues boot when disabled — it returns rather than throwing", () => {
    const h = harness({});
    expect(() => startStripeBootSync(h.deps)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("failure handling", () => {
  it("catches a rejection so boot is never taken down", async () => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "true" }, () =>
      Promise.reject(new Error("connector unavailable")),
    );
    expect(() => startStripeBootSync(h.deps)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    const errors = h.logs.filter((entry) => entry.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta.failure).toBe("Error: connector unavailable");
  });

  it("catches a synchronous throw from the routine", () => {
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "true" }, () => {
      throw new Error("thrown synchronously");
    });
    expect(() => startStripeBootSync(h.deps)).not.toThrow();

    const errors = h.logs.filter((entry) => entry.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta.failure).toBe("Error: thrown synchronously");
  });

  it("logs no credential from a Stripe-shaped error", async () => {
    const leaky = Object.assign(new Error("Request failed"), {
      requestId: "req_123",
      raw: { secret: "sk_live_MUST_NOT_APPEAR" },
      config: { headers: { Authorization: "Bearer sk_live_MUST_NOT_APPEAR" } },
    });
    const h = harness({ STRIPE_BOOT_SYNC_ENABLED: "true" }, () => Promise.reject(leaky));
    startStripeBootSync(h.deps);
    await new Promise((resolve) => setImmediate(resolve));

    const serialized = JSON.stringify(h.logs);
    expect(serialized).not.toContain("sk_live");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });

  it("bounds a very long error message", () => {
    const described = describeBootSyncFailure(new Error("x".repeat(5_000)));
    expect(described.length).toBeLessThanOrEqual(230);
    expect(described.endsWith("...")).toBe(true);
  });

  it("describes a non-Error rejection without serializing it", () => {
    expect(describeBootSyncFailure({ secret: "sk_live_MUST_NOT_APPEAR" })).toBe("Error");
    expect(describeBootSyncFailure("sk_live_MUST_NOT_APPEAR")).toBe("Error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("startup wiring is guarded and migrations are untouched", () => {
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const indexSource = readFileSync(join(srcRoot, "index.ts"), "utf8");

  it("routes the boot sync through the guard", () => {
    expect(indexSource).toContain("startStripeBootSync");
  });

  it("never calls the boot-sync routine unguarded", () => {
    // The only textual occurrences may be its declaration and the reference
    // handed to the guard — never a bare `initStripeWebhookAndSync()` call.
    expect(indexSource).not.toMatch(/^\s*initStripeWebhookAndSync\(\)/m);
  });

  it("leaves the required startup migration outside the flag", () => {
    // `runStripeMigrations()` is an internal database migration that startup
    // genuinely requires; it must not have been moved behind the flag.
    expect(indexSource).toMatch(/await runStripeMigrations\(\)/);
    const migrationIndex = indexSource.indexOf("await runStripeMigrations()");
    // The call site, not the import, so the ordering assertion is meaningful.
    const guardIndex = indexSource.indexOf("startStripeBootSync({");
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeLessThan(guardIndex);
  });

  it("leaves the checkout and webhook request paths out of this module", () => {
    const guardSource = readFileSync(join(srcRoot, "lib", "stripeBootSync.ts"), "utf8");
    // The guard decides *whether* to run boot sync; it never reaches Stripe
    // itself, so it imports nothing at all and names no Stripe entrypoint.
    expect(guardSource).not.toMatch(/^\s*import\s/m);
    expect(guardSource).not.toContain("checkout");
    expect(guardSource).not.toContain("processWebhook");
    expect(guardSource).not.toContain("getStripeSync");
    expect(guardSource).not.toContain("findOrCreateManagedWebhook");
    expect(guardSource).not.toContain("syncBackfill");
  });

  it("leaves the checkout session an explicit user action, not a boot action", () => {
    const billingSource = readFileSync(join(srcRoot, "routes", "receptionistBilling.ts"), "utf8");
    // Checkout lives behind an authenticated route handler. If boot ever
    // started creating sessions, this file would be reachable from index.ts.
    expect(indexSource).not.toContain("receptionistBilling");
    expect(billingSource).toContain("checkout");
  });
});
