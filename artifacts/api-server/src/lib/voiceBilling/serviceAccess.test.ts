// J7: the plan gate in front of every path a business can start alone that
// spends provider time (publish, sync, browser test calls).

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import { resolveServiceAccess, SERVICE_ACCESS_MESSAGES, VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR } from "./serviceAccess.js";
import { describeEnvContract } from "../envContract.js";

const CATALOG = JSON.stringify([{ planCode: "pilot", includedMinutes: 300, smsIncluded: true }]);
const on = { [VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR]: "true", VOICE_PLAN_CATALOG_JSON: CATALOG };
const sub = (planCode: string, state: string) => async () => ({ planCode, state });
const none = async () => undefined;

describe("resolveServiceAccess", () => {
  it("changes nothing while enforcement is off, and only the exact string true turns it on", async () => {
    for (const v of [undefined, "", "TRUE", "1", "yes"]) {
      const r = await resolveServiceAccess(1, { env: { [VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR]: v }, findSubscription: none });
      expect(r).toEqual({ allowed: true, basis: "not_required" });
    }
  });

  it("allows an active or grace subscription whose plan is in the catalog", async () => {
    expect(await resolveServiceAccess(1, { env: on, findSubscription: sub("pilot", "active") })).toEqual({
      allowed: true, basis: "subscription", planCode: "pilot", state: "active",
    });
    expect((await resolveServiceAccess(1, { env: on, findSubscription: sub("pilot", "grace") })).allowed).toBe(true);
  });

  it("refuses no subscription, suspended, cancelled, and a plan the catalog no longer has", async () => {
    expect(await resolveServiceAccess(1, { env: on, findSubscription: none })).toEqual({ allowed: false, reason: "not_activated" });
    expect(await resolveServiceAccess(1, { env: on, findSubscription: sub("pilot", "suspended") })).toEqual({ allowed: false, reason: "suspended" });
    expect(await resolveServiceAccess(1, { env: on, findSubscription: sub("pilot", "canceled") })).toEqual({ allowed: false, reason: "canceled" });
    expect(await resolveServiceAccess(1, { env: on, findSubscription: sub("retired", "active") })).toEqual({ allowed: false, reason: "not_activated" });
    expect(await resolveServiceAccess(1, { env: on, findSubscription: sub("pilot", "weird") })).toEqual({ allowed: false, reason: "not_activated" });
  });

  it("fails closed when the catalog is missing or malformed", async () => {
    const lookup = vi.fn(sub("pilot", "active"));
    expect(await resolveServiceAccess(1, { env: { [VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR]: "true" }, findSubscription: lookup })).toEqual({
      allowed: false, reason: "not_activated",
    });
    expect(
      await resolveServiceAccess(1, { env: { [VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR]: "true", VOICE_PLAN_CATALOG_JSON: "{nope" }, findSubscription: lookup }),
    ).toEqual({ allowed: false, reason: "not_activated" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("looks up only the firm it was asked about", async () => {
    const lookup = vi.fn(none);
    await resolveServiceAccess(42, { env: on, findSubscription: lookup });
    expect(lookup).toHaveBeenCalledWith(42);
  });

  it("every refusal has plain owner-facing wording", () => {
    for (const m of Object.values(SERVICE_ACCESS_MESSAGES)) {
      expect(m).not.toMatch(/subscription row|catalog|firm/i);
      expect(m.length).toBeGreaterThan(20);
    }
  });

  it("is declared in the environment contract", () => {
    expect(describeEnvContract().some((e) => e.name === VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR && e.kind === "flag")).toBe(true);
  });
});

describe("routes that spend provider time check the plan first", () => {
  const src = readFileSync(new URL("../../routes/receptionistVoiceAssistants.ts", import.meta.url), "utf8");
  for (const op of ["publish", "sync", "browser_test_session"]) {
    it(`${op} is refused before the service is called`, () => {
      expect(src).toContain(`refusedWithoutServiceAccess(req, res, "${op}")`);
    });
  }
  it("the check precedes the provider-facing call in each handler", () => {
    expect(src.indexOf(`"publish")) return;`)).toBeLessThan(src.indexOf("await publishAssistant("));
    expect(src.indexOf(`"sync")) return;`)).toBeLessThan(src.indexOf("await synchronizePublishedAssistant("));
    expect(src.indexOf(`"browser_test_session")) return;`)).toBeLessThan(src.indexOf("await getBrowserTestSession("));
  });
});
