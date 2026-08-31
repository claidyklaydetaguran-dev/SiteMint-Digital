// R4/R5 — fail-closed gates on the three unauthenticated public write surfaces.
//
// Two layers of proof:
//   1. the flag contract itself (exact-"true" semantics, all independent);
//   2. a source-level placement proof that each guard is the FIRST thing its
//      handler does — which is what actually guarantees "no row written, no
//      email sent, no rate-limit budget consumed" while disabled. This repo
//      is complemented by publicWriteRuntime.test.ts, which boots the real
//      app and proves the same gates over real HTTP against a trapped database.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR,
  isAiToolkitCheckoutEnabled,
  isPublicAnalyticsWritesEnabled,
  isPublicFormSubmissionsEnabled,
  isPublicRegistrationEnabled,
  isPasswordResetRequestsEnabled,
  isPublicSchedulingRequestsEnabled,
  PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR,
  PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR,
  PUBLIC_REGISTRATION_ENABLED_ENV_VAR,
  PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR,
  PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR,
} from "./publicWriteFlags.js";
import { describeEnvContract, validateEnvContract } from "./envContract.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const DISABLING_VALUES = [undefined, "", " ", "false", "FALSE", "TRUE", "True", "1", "yes", "on", "true "];

describe("public-write flag contract", () => {
  it("enables only on the exact lowercase string 'true'", () => {
    for (const v of DISABLING_VALUES) {
      const env = v === undefined ? {} : { [PUBLIC_REGISTRATION_ENABLED_ENV_VAR]: v };
      expect(isPublicRegistrationEnabled(env), `registration:${String(v)}`).toBe(false);
      const env2 = v === undefined ? {} : { [PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR]: v };
      expect(isPublicFormSubmissionsEnabled(env2), `forms:${String(v)}`).toBe(false);
      const env3 = v === undefined ? {} : { [PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR]: v };
      expect(isPublicAnalyticsWritesEnabled(env3), `analytics:${String(v)}`).toBe(false);
      const env4 = v === undefined ? {} : { [AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR]: v };
      expect(isAiToolkitCheckoutEnabled(env4), `checkout:${String(v)}`).toBe(false);
      const env5 = v === undefined ? {} : { [PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR]: v };
      expect(isPublicSchedulingRequestsEnabled(env5), `scheduling:${String(v)}`).toBe(false);
      const env6 = v === undefined ? {} : { [PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR]: v };
      expect(isPasswordResetRequestsEnabled(env6), `reset:${String(v)}`).toBe(false);
    }
    expect(isPublicRegistrationEnabled({ [PUBLIC_REGISTRATION_ENABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isPublicFormSubmissionsEnabled({ [PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isPublicAnalyticsWritesEnabled({ [PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isAiToolkitCheckoutEnabled({ [AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isPublicSchedulingRequestsEnabled({ [PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isPasswordResetRequestsEnabled({ [PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR]: "true" })).toBe(true);
  });

  it("defaults to disabled and all six flags are independent", () => {
    expect(isPublicRegistrationEnabled({})).toBe(false);
    expect(isPublicFormSubmissionsEnabled({})).toBe(false);
    const onlyForms = { [PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR]: "true" };
    expect(isPublicFormSubmissionsEnabled(onlyForms)).toBe(true);
    expect(isPublicRegistrationEnabled(onlyForms)).toBe(false);
    expect(isPublicAnalyticsWritesEnabled({})).toBe(false);
    expect(isPublicAnalyticsWritesEnabled(onlyForms)).toBe(false);
    const onlyReg = { [PUBLIC_REGISTRATION_ENABLED_ENV_VAR]: "true" };
    expect(isPublicRegistrationEnabled(onlyReg)).toBe(true);
    expect(isPublicFormSubmissionsEnabled(onlyReg)).toBe(false);
    expect(isPublicAnalyticsWritesEnabled(onlyReg)).toBe(false);
    const onlyAnalytics = { [PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR]: "true" };
    expect(isPublicAnalyticsWritesEnabled(onlyAnalytics)).toBe(true);
    expect(isPublicRegistrationEnabled(onlyAnalytics)).toBe(false);
    expect(isPublicFormSubmissionsEnabled(onlyAnalytics)).toBe(false);

    // Every flag switches on exactly one capability and nothing else.
    const ALL = [
      [PUBLIC_REGISTRATION_ENABLED_ENV_VAR, isPublicRegistrationEnabled],
      [PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR, isPublicFormSubmissionsEnabled],
      [PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR, isPublicAnalyticsWritesEnabled],
      [AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR, isAiToolkitCheckoutEnabled],
      [PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR, isPublicSchedulingRequestsEnabled],
      [PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR, isPasswordResetRequestsEnabled],
    ] as const;
    for (const [name, self] of ALL) {
      const env = { [name]: "true" };
      expect(self(env), `${name} must enable itself`).toBe(true);
      for (const [otherName, other] of ALL) {
        if (otherName === name) continue;
        expect(other(env), `${name} must not enable ${otherName}`).toBe(false);
      }
    }
    // Boot sync is a separate capability and must imply none of them.
    for (const [, fn] of ALL) expect(fn({ STRIPE_BOOT_SYNC_ENABLED: "true" })).toBe(false);
    // Neither is having a mail provider configured.
    for (const [, fn] of ALL) expect(fn({ RESEND_API_KEY: "re_test_not_a_real_key" })).toBe(false);
  });
});

describe("guard placement (blocked requests reach nothing)", () => {
  // Everything a disabled request must NOT reach, per route.
  const CASES: Array<{ file: string; handler: string; flag: string; forbidden: RegExp[] }> = [
    {
      file: "routes/receptionistAuth.ts",
      handler: 'router.post("/receptionist/auth/signup"',
      flag: "isPublicRegistrationEnabled",
      forbidden: [/signupIpLimiter/, /bcrypt\./, /db\s*\n?\s*\.insert/, /createSession\(/, /\.select\(/],
    },
    { file: "routes/contact.ts", handler: 'router.post("/contact/submit"', flag: "isPublicFormSubmissionsEnabled", forbidden: [/insert\(formSubmissions\)/, /sendFormEmails/, /validateContactSubmission/] },
    { file: "routes/discovery.ts", handler: 'router.post("/discovery/submit"', flag: "isPublicFormSubmissionsEnabled", forbidden: [/insert\(formSubmissions\)/, /sendFormEmails/] },
    { file: "routes/landingTest.ts", handler: 'router.post("/landing-test/submit"', flag: "isPublicFormSubmissionsEnabled", forbidden: [/insert\(formSubmissions\)/, /sendFormEmails/] },
    // R5: the analytics writer. `VERTICALS.includes` is this route's own
    // validation, so requiring the guard to precede it proves the gate runs
    // before validation as well as before the insert.
    {
      file: "routes/landingTest.ts",
      handler: 'router.post("/landing-test/view"',
      flag: "isPublicAnalyticsWritesEnabled",
      forbidden: [/insert\(landingPageViews\)/, /VERTICALS\.includes/, /req\.body/],
    },
    // R6: the checkout gate must precede the price lookup (a database query),
    // Stripe client construction, and the outbound session create.
    {
      file: "routes/aiToolkit.ts",
      handler: 'router.post("/ai-toolkit/checkout"',
      flag: "isAiToolkitCheckoutEnabled",
      forbidden: [/findActivePriceIdForProduct\(/, /getUncachableStripeClient\(/, /checkout\.sessions\.create/],
    },
    // R8: the reset gate must precede the limiter, validation, the account
    // lookup, the imported delegation, token creation, the audit row and mail.
    {
      file: "routes/receptionistAccount.ts",
      handler: 'router.post("/receptionist/account/password-reset/request"',
      flag: "isPasswordResetRequestsEnabled",
      forbidden: [/limited\(req, res, "pw-reset"\)/, /requestPasswordReset\(/, /req\.body/],
    },
    // R7: the booking gate must precede the slug/firm lookup, the IP limiter,
    // the honeypot and timing checks, validation, and the request insert.
    {
      file: "routes/publicScheduling.ts",
      handler: 'router.post("/public/schedule/:slug/requests"',
      flag: "isPublicSchedulingRequestsEnabled",
      forbidden: [
        /rateLimited\(/,
        /isHoneypotTripped/,
        /isImplausiblyFast/,
        /resolveFirmOrNotFound\(/,
        /submitAppointmentRequest\(/,
        /req\.body/,
      ],
    },
    // R6: the discovery-v1 gate must precede dependency resolution, fingerprint
    // config, rate limiting, honeypot/timing checks, validation and the insert.
    // Its guard lives in the delegated handler, which is where the work is.
    {
      file: "routes/discoveryV1.ts",
      handler: "export async function handleDiscoverySubmission",
      flag: "isPublicFormSubmissionsEnabled",
      forbidden: [
        /getDefaultDeps\(/,
        /loadFingerprintConfig\(/,
        /discoveryV1IpLimiter/,
        /isHoneypotTripped/,
        /safeParse/,
        /insertDiscoverySubmission\(/,
      ],
    },
  ];

  for (const c of CASES) {
    it(`${c.file}: guard is the first statement and precedes every side effect`, () => {
      const src = read(c.file);
      const start = src.indexOf(c.handler);
      expect(start, "handler not found").toBeGreaterThan(-1);
      const guardIdx = src.indexOf(c.flag, start);
      expect(guardIdx, "guard not found in handler").toBeGreaterThan(-1);

      // 503 + generic message, returned immediately.
      const guardBlock = src.slice(guardIdx, guardIdx + 260);
      expect(guardBlock).toMatch(/res\.status\(503\)/);
      expect(guardBlock).toMatch(/return;/);
      // Must not disclose the flag name or internal configuration.
      expect(guardBlock).not.toMatch(/PUBLIC_(REGISTRATION|FORM_SUBMISSIONS|ANALYTICS_WRITES)_ENABLED"/);

      for (const f of c.forbidden) {
        const m = f.exec(src.slice(start));
        if (m && m.index !== undefined) {
          expect(start + m.index, `${f} must come after the guard`).toBeGreaterThan(guardIdx);
        }
      }
    });
  }

  it("read-only and authenticated routes are untouched by the gates", () => {
    const auth = read("routes/receptionistAuth.ts");
    for (const other of ['router.post("/receptionist/auth/login"', 'router.post("/receptionist/auth/logout"', 'router.get("/receptionist/auth/me"']) {
      const i = auth.indexOf(other);
      expect(i, other).toBeGreaterThan(-1);
      const body = auth.slice(i, i + 1200);
      expect(body, `${other} must not be gated`).not.toMatch(/isPublicRegistrationEnabled|isPublicFormSubmissionsEnabled|isPublicAnalyticsWritesEnabled/);
    }
    // Login rate limiting untouched.
    expect(auth).toMatch(/loginEmailLimiter/);
    expect(auth).toMatch(/loginIpLimiter/);
    // Signup rate limiting still present for the enabled path.
    expect(auth).toMatch(/signupIpLimiter\.record/);

    // Health, readiness, metrics, and the Vapi webhook carry no public-write gate.
    for (const f of ["routes/health.ts", "routes/monitoring.ts", "routes/receptionistVoiceWebhook.ts"]) {
      expect(read(f), f).not.toMatch(/isPublicRegistrationEnabled|isPublicFormSubmissionsEnabled|isPublicAnalyticsWritesEnabled/);
    }
    // The analytics view endpoint has its OWN flag (R5) and must not be
    // reachable by enabling form submissions.
    const lt = read("routes/landingTest.ts");
    const viewIdx = lt.indexOf('router.post("/landing-test/view"');
    expect(viewIdx).toBeGreaterThan(-1);
    const viewBody = lt.slice(viewIdx, viewIdx + 400);
    expect(viewBody).toMatch(/isPublicAnalyticsWritesEnabled/);
    expect(viewBody).not.toMatch(/isPublicFormSubmissionsEnabled/);

    // R7: public read-only scheduling must NOT carry the booking gate — a
    // booking page that cannot even render its availability is not safer.
    const ps = read("routes/publicScheduling.ts");
    for (const ro of [
      'router.get("/public/schedule/:slug/config"',
      'router.get("/public/schedule/:slug/days"',
      'router.get("/public/schedule/:slug/slots"',
    ]) {
      const i = ps.indexOf(ro);
      expect(i, ro).toBeGreaterThan(-1);
      expect(ps.slice(i, i + 500), `${ro} must stay available`).not.toMatch(/isPublicSchedulingRequestsEnabled/);
    }

    // Read-only analytics stays admin-authenticated and ungated.
    const statsIdx = lt.indexOf('router.get("/landing-test/stats"');
    expect(statsIdx).toBeGreaterThan(-1);
    const statsBody = lt.slice(statsIdx, statsIdx + 300);
    expect(statsBody).toMatch(/requireAdmin/);
    expect(statsBody).not.toMatch(/isPublicAnalyticsWritesEnabled/);
  });

  it("every unauthenticated landing_page_views writer is gated", () => {
    const src = read("routes/landingTest.ts");
    const inserts = src.split("insert(landingPageViews)").length - 1;
    expect(inserts, "a new ungated analytics writer was added").toBe(1);
    expect(src).toMatch(/isPublicAnalyticsWritesEnabled/);
  });

  it("every unauthenticated form_submissions writer is gated", () => {
    for (const f of ["routes/contact.ts", "routes/discovery.ts", "routes/landingTest.ts"]) {
      const src = read(f);
      if (!/insert\(formSubmissions\)/.test(src)) continue;
      expect(src, f).toMatch(/isPublicFormSubmissionsEnabled/);
    }
  });
});

describe("environment contract", () => {
  it("registers all six public-write, checkout and reset flags", () => {
    const names = describeEnvContract().map((e) => e.name);
    for (const n of [
      PUBLIC_REGISTRATION_ENABLED_ENV_VAR,
      PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR,
      PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR,
      AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR,
      PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR,
      PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR,
    ]) {
      expect(names, n).toContain(n);
      expect(describeEnvContract().find((e) => e.name === n)?.kind, n).toBe("flag");
    }
  });

  it("warns when a flag is set to a value that does not enable it", async () => {
    const findings = await validateEnvContract({
      [PUBLIC_REGISTRATION_ENABLED_ENV_VAR]: "TRUE",
      [PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR]: "1",
      [PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR]: "yes",
      [AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR]: "on",
      [PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR]: "True",
      [PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR]: "on",
    });
    const named = findings.map((f) => f.name);
    expect(named).toContain(PUBLIC_REGISTRATION_ENABLED_ENV_VAR);
    expect(named).toContain(PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR);
    expect(named).toContain(PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR);
    expect(named).toContain(AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR);
    expect(named).toContain(PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR);
    expect(named).toContain(PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR);
    expect(findings.every((f) => f.level === "warning" || f.level === "error")).toBe(true);
  });

  it("a fully-defaulted environment stays clean", async () => {
    expect(await validateEnvContract({})).toEqual([]);
  });
});
