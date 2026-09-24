// J7: checkout activation — the plan code must exist, the ledger makes it
// idempotent, and a failed activation releases its ledger row for the retry.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import { activateVoicePlanFromCheckout, loadCheckoutPlanCode, type CheckoutActivationDeps } from "./checkoutActivation.js";
import { describeEnvContract } from "../envContract.js";

const CATALOG = JSON.stringify([{ planCode: "starter", includedMinutes: 300, smsIncluded: true }]);

describe("the plan a checkout activates", () => {
  it("is null when unset, unknown to the catalog, or the catalog is broken", () => {
    expect(loadCheckoutPlanCode({})).toBeNull();
    expect(loadCheckoutPlanCode({ VOICE_CHECKOUT_PLAN_CODE: "starter" })).toBeNull();
    expect(loadCheckoutPlanCode({ VOICE_CHECKOUT_PLAN_CODE: "gold", VOICE_PLAN_CATALOG_JSON: CATALOG })).toBeNull();
    expect(loadCheckoutPlanCode({ VOICE_CHECKOUT_PLAN_CODE: "starter", VOICE_PLAN_CATALOG_JSON: "{" })).toBeNull();
    expect(loadCheckoutPlanCode({ VOICE_CHECKOUT_PLAN_CODE: " starter ", VOICE_PLAN_CATALOG_JSON: CATALOG })).toBe("starter");
  });
  it("is documented in the environment contract", () => {
    expect(describeEnvContract().some((e) => e.name === "VOICE_CHECKOUT_PLAN_CODE")).toBe(true);
  });
});

describe("activation", () => {
  const deps = (opts: { inserted?: boolean; activateThrows?: boolean } = {}) => {
    const calls: string[] = [];
    const d: CheckoutActivationDeps = {
      storeEventOnce: async (_f, provider, key) => {
        calls.push(`store:${provider}:${key}`);
        return { inserted: opts.inserted ?? true };
      },
      releaseEvent: async (_p, key) => {
        calls.push(`release:${key}`);
      },
      activate: async (firmId, plan, customer) => {
        if (opts.activateThrows) throw new Error("db down");
        calls.push(`activate:${firmId}:${plan}:${customer}`);
      },
    };
    return { d, calls };
  };
  const input = { firmId: 2, stripeCustomerId: "cus_x", planCode: "starter", eventId: "evt_1" };

  it("records the event then activates", async () => {
    const h = deps();
    expect(await activateVoicePlanFromCheckout(input, h.d)).toEqual({ applied: true });
    expect(h.calls).toEqual(["store:stripe_receptionist:evt_1", "activate:2:starter:cus_x"]);
  });
  it("a redelivery activates nothing", async () => {
    const h = deps({ inserted: false });
    expect(await activateVoicePlanFromCheckout(input, h.d)).toEqual({ applied: false, reason: "duplicate_event" });
    expect(h.calls).toEqual(["store:stripe_receptionist:evt_1"]);
  });
  it("a failed activation releases the ledger row and throws, so Stripe retries", async () => {
    const h = deps({ activateThrows: true });
    await expect(activateVoicePlanFromCheckout(input, h.d)).rejects.toThrow("db down");
    expect(h.calls).toEqual(["store:stripe_receptionist:evt_1", "release:evt_1"]);
  });
});

describe("the checkout route", () => {
  const src = readFileSync(new URL("../../routes/receptionistBilling.ts", import.meta.url), "utf8");
  it("refuses to start a checkout that could not activate a plan", () => {
    expect(src).toMatch(/if \(!priceId \|\| loadCheckoutPlanCode\(\) === null\)/);
  });
  it("returns the customer to the dashboard origin and the real Billing path", () => {
    expect(src).toContain('process.env["VOICE_DASHBOARD_BASE_URL"]');
    expect(src).toContain("/ai-receptionist/dashboard/account/billing?upgraded=1");
    expect(src).not.toContain("/ai-receptionist/dashboard/billing?upgraded=1");
  });
  it("handles the whole payment lifecycle on the one webhook", () => {
    for (const t of ["invoice.payment_failed", "invoice.payment_succeeded", "customer.subscription.resumed", "customer.subscription.deleted"]) {
      expect(src).toContain(`case "${t}"`);
    }
  });
});
