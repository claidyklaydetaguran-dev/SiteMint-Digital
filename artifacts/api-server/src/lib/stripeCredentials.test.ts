// Where Stripe's key comes from, and what is said when there is none.
//
// The Replit connector remains the production path. The environment fallback
// exists so billing can be exercised in test mode anywhere: without it,
// creating a checkout session off Replit failed with a 500 that said nothing
// about configuration.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  readStripeCredentialsFromEnv,
  STRIPE_SECRET_KEY_ENV_VAR,
  STRIPE_WEBHOOK_SECRET_ENV_VAR,
} from "./stripeClient.js";

describe("readStripeCredentialsFromEnv", () => {
  it("uses a key from the environment, with the webhook secret when one is set", () => {
    expect(
      readStripeCredentialsFromEnv({
        [STRIPE_SECRET_KEY_ENV_VAR]: "sk_test_example",
        [STRIPE_WEBHOOK_SECRET_ENV_VAR]: "whsec_example",
      }),
    ).toEqual({ secretKey: "sk_test_example", webhookSecret: "whsec_example" });
  });

  it("omits the webhook secret rather than passing an empty one", () => {
    expect(readStripeCredentialsFromEnv({ [STRIPE_SECRET_KEY_ENV_VAR]: "sk_test_example" })).toEqual({
      secretKey: "sk_test_example",
    });
    expect(
      readStripeCredentialsFromEnv({ [STRIPE_SECRET_KEY_ENV_VAR]: "sk_test_example", [STRIPE_WEBHOOK_SECRET_ENV_VAR]: "   " }),
    ).toEqual({ secretKey: "sk_test_example" });
  });

  it("falls through to the connector when no key is set", () => {
    expect(readStripeCredentialsFromEnv({})).toBeNull();
    expect(readStripeCredentialsFromEnv({ [STRIPE_SECRET_KEY_ENV_VAR]: "   " })).toBeNull();
  });

  it("names both ways to configure it when neither is available", async () => {
    const { getUncachableStripeClient } = await import("./stripeClient.js");
    const saved = {
      key: process.env[STRIPE_SECRET_KEY_ENV_VAR],
      host: process.env["REPLIT_CONNECTORS_HOSTNAME"],
      identity: process.env["REPL_IDENTITY"],
      renewal: process.env["WEB_REPL_RENEWAL"],
    };
    delete process.env[STRIPE_SECRET_KEY_ENV_VAR];
    delete process.env["REPLIT_CONNECTORS_HOSTNAME"];
    delete process.env["REPL_IDENTITY"];
    delete process.env["WEB_REPL_RENEWAL"];
    try {
      await expect(getUncachableStripeClient()).rejects.toThrow(/STRIPE_SECRET_KEY[\s\S]*Integrations tab/);
    } finally {
      if (saved.key !== undefined) process.env[STRIPE_SECRET_KEY_ENV_VAR] = saved.key;
      if (saved.host !== undefined) process.env["REPLIT_CONNECTORS_HOSTNAME"] = saved.host;
      if (saved.identity !== undefined) process.env["REPL_IDENTITY"] = saved.identity;
      if (saved.renewal !== undefined) process.env["WEB_REPL_RENEWAL"] = saved.renewal;
    }
  });
});
