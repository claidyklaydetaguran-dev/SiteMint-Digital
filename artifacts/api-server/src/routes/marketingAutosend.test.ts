/**
 * Automatic sending of scheduled campaigns is off unless somebody says so.
 *
 * This is the only worker in the CRM that can mail customers with nobody
 * pressing a button, so the interesting question is not "does it send" but
 * "can it possibly send when it was not switched on". A flag that is truthy
 * for `"1"`, `"yes"` or `"TRUE"` is how a deployment starts mailing people
 * because somebody set what looked like an obviously-on value.
 *
 * Same rule as `STRIPE_BOOT_SYNC_ENABLED`: the exact string `"true"`, nothing
 * else. These are pure, so they need no database.
 */
import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD ??= "autosend-test-admin-value";

const { marketingAutosendEnabled, MARKETING_AUTOSEND_ENV_VAR, startDueCampaigns } =
  await import("./crmMarketing.js");

describe("scheduled campaign auto-send is fail-closed", () => {
  it("is off when the variable is absent", () => {
    expect(marketingAutosendEnabled({})).toBe(false);
  });

  it("is off for every near-miss that looks enabled", () => {
    for (const value of ["1", "TRUE", "True", "yes", "on", "enabled", " true", "true ", ""]) {
      expect(
        marketingAutosendEnabled({ [MARKETING_AUTOSEND_ENV_VAR]: value }),
        `${JSON.stringify(value)} must not enable automatic sending`,
      ).toBe(false);
    }
  });

  it("is on only for the exact string", () => {
    expect(marketingAutosendEnabled({ [MARKETING_AUTOSEND_ENV_VAR]: "true" })).toBe(true);
  });

  it("does no work at all while it is off", async () => {
    // Reads nothing and claims nothing — proven by the fact that this resolves
    // against a DATABASE_URL that cannot connect. A query would reject.
    const before = process.env[MARKETING_AUTOSEND_ENV_VAR];
    delete process.env[MARKETING_AUTOSEND_ENV_VAR];
    try {
      await expect(startDueCampaigns()).resolves.toEqual([]);
    } finally {
      if (before !== undefined) process.env[MARKETING_AUTOSEND_ENV_VAR] = before;
    }
  });
});
