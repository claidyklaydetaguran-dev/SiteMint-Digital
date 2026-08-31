// R6 — the durable route-security contract.
//
// This is the test that has to fail when someone adds an unguarded write
// endpoint. It re-derives the mutating-route inventory from source on every
// run and compares it against the committed manifest.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  detectProtection,
  discoverMutatingRoutes,
  type MutatingRoute,
  type Protection,
} from "./routeSecurity.js";
import { KNOWN_OPEN_ROUTES, ROUTE_SECURITY_MANIFEST } from "./routeSecurity.manifest.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const routes = discoverMutatingRoutes(join(SRC, "routes"), join(SRC, "app.ts"));
const byKey = new Map(routes.map((r) => [r.key, r]));

const protectionOf = (r: MutatingRoute): Protection =>
  detectProtection(r)[0] ?? "unauthenticated";

describe("route-security inventory", () => {
  it("discovers every mutating route, including the app-level Stripe webhook", () => {
    expect(routes.length).toBeGreaterThanOrEqual(127);
    expect(byKey.has("POST /api/stripe/webhook"), "app.ts registrations must be scanned").toBe(true);
    // Keys must be unique or the manifest cannot address a route.
    expect(new Set(routes.map((r) => r.key)).size).toBe(routes.length);
    for (const r of routes) expect(r.method, r.key).toMatch(/^(POST|PUT|PATCH|DELETE)$/);
  });

  it("classifies every discovered route — a new route cannot ship unlisted", () => {
    const missing = routes.map((r) => r.key).filter((k) => !(k in ROUTE_SECURITY_MANIFEST));
    expect(
      missing,
      `unclassified mutating route(s). Add them to routeSecurity.manifest.ts with the protection they carry:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("has no stale manifest entries", () => {
    const stale = Object.keys(ROUTE_SECURITY_MANIFEST).filter((k) => !byKey.has(k));
    expect(stale, `manifest lists route(s) that no longer exist:\n${stale.join("\n")}`).toEqual([]);
  });

  it("every route still carries the protection it is recorded as having", () => {
    const regressions: string[] = [];
    for (const r of routes) {
      const expected = ROUTE_SECURITY_MANIFEST[r.key];
      if (!expected) continue; // reported by the completeness test above
      const actual = protectionOf(r);
      if (actual !== expected) regressions.push(`${r.key}: manifest="${expected}" source="${actual}" [${r.file}]`);
    }
    expect(
      regressions,
      `route protection changed. If deliberate, update the manifest; if not, this is a regression:\n${regressions.join("\n")}`,
    ).toEqual([]);
  });

  it("the set of unauthenticated routes is exactly the reviewed allowlist", () => {
    const open = routes.filter((r) => detectProtection(r).length === 0).map((r) => r.key).sort();
    const allowed = Object.keys(KNOWN_OPEN_ROUTES).sort();
    expect(
      open,
      "an uncontrolled public writer appeared (or an allowlisted one was closed). Gate it behind a default-off flag, or record it in KNOWN_OPEN_ROUTES with a reason.",
    ).toEqual(allowed);
  });

  it("every allowlisted open route carries a substantive reason", () => {
    for (const [key, reason] of Object.entries(KNOWN_OPEN_ROUTES)) {
      expect(reason.length, `${key} needs a real justification`).toBeGreaterThan(80);
      // Rate limiting bounds abuse; it does not control access. Accepting it as
      // a justification is precisely how the R5 audit missed a writer.
      expect(/rate limit(ed|ing)?\.?$/i.test(reason.trim()), `${key}: rate limiting alone is not access control`).toBe(false);
    }
  });

  it("the writers R6 closed are flag-gated, and each has its own flag", () => {
    for (const key of [
      "POST /api/v1/discovery-submissions",
      "POST /api/ai-toolkit/checkout",
      "POST /api/receptionist/auth/signup",
      "POST /api/landing-test/view",
    ]) {
      expect(ROUTE_SECURITY_MANIFEST[key], key).toBe("feature-flag");
    }
    const checkout = byKey.get("POST /api/ai-toolkit/checkout");
    expect(checkout?.body).toMatch(/isAiToolkitCheckoutEnabled/);
    // Boot sync and customer checkout are separate capabilities.
    expect(checkout?.body).not.toMatch(/STRIPE_BOOT_SYNC_ENABLED/);
    const discovery = byKey.get("POST /api/v1/discovery-submissions");
    expect(discovery?.body).toMatch(/isPublicFormSubmissionsEnabled/);
  });
});

describe("parser correctness (the false-positive traps)", () => {
  it("does not inherit middleware from the following route", () => {
    // POST /landing-test/view is immediately followed by an admin-only GET.
    // Bounding route bodies only on mutating verbs made the POST absorb that
    // GET's requireAdmin and report itself protected while it was wide open.
    const view = byKey.get("POST /api/landing-test/view");
    expect(view, "route missing").toBeDefined();
    expect(view?.body, "absorbed the neighbouring route's middleware").not.toMatch(/requireAdmin/);
    expect(view?.chain).not.toMatch(/requireAdmin/);
    expect(protectionOf(view as MutatingRoute)).toBe("feature-flag");
  });

  it("does not let a helper defined above a block of routes leak their guards", () => {
    // Inlining a called helper is what lets delegating routes be classified,
    // but a helper's source must stop at the next route registration. Without
    // that bound, password-reset/request picked up a later route's
    // requireReceptionistAuth and was misreported as session-protected.
    const req = byKey.get("POST /api/receptionist/account/password-reset/request");
    expect(req, "route missing").toBeDefined();
    expect(detectProtection(req as MutatingRoute)).toEqual([]);
  });

  it("still resolves genuine delegation to a same-file handler", () => {
    // The inverse failure: these routes are thin wrappers whose guard lives in
    // the function they call. They must not read as unprotected.
    expect(protectionOf(byKey.get("POST /api/v1/discovery-submissions") as MutatingRoute)).toBe("feature-flag");
    expect(protectionOf(byKey.get("POST /api/voice/sms/inbound") as MutatingRoute)).toBe("signature");
    expect(protectionOf(byKey.get("POST /api/voice/sms/status") as MutatingRoute)).toBe("signature");
  });

  it("treats rate limiting and honeypots as non-protection", () => {
    // The scheduling writer has both and must still classify as open.
    const sched = byKey.get("POST /api/public/schedule/:slug/requests");
    expect(sched?.body).toMatch(/publicSchedulingIpLimiter|isHoneypotTripped/);
    expect(detectProtection(sched as MutatingRoute)).toEqual([]);
  });
});
