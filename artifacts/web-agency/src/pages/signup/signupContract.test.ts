/**
 * Frontend V2 Phase 5 — committed contract tests for the AI Receptionist
 * signup page.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * It lives beside the module it tests, inside web-agency, so the import is an
 * ordinary sibling import rather than a cross-package one. `scripts` owns the
 * runner because it is the workspace package that already has `tsx`; adding a
 * test runner to web-agency would mean a new dependency, which this phase
 * forbids. web-agency's tsconfig excludes test files by glob, so this file is
 * neither type-built into the app nor bundled by Vite — nothing imports it from
 * the entry graph.
 *
 * Two kinds of assertion, both dependency-free:
 *
 *  1. **Behavioural.** `signupContract.ts` is pure and imported directly, so
 *     the validation rules, the submitted payload shape, and the error mapping
 *     are executed rather than pattern-matched.
 *  2. **Structural.** The page component is read as source and checked for the
 *     things a renderer would otherwise be needed to prove: that every field is
 *     still present with a label bound to its input, that the submit action and
 *     the sign-in destination are intact, that the readiness wording is
 *     accurate, and that no voice or CRM over-claim has crept back in.
 *
 * This deliberately uses no test framework, no DOM, and no new dependency, and
 * it changes no frozen configuration. It follows the same self-contained
 * PASS/FAIL style as the existing legacy api-server tests.
 *
 * It never performs a network request and never creates an account.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_SIGNUP_FORM,
  INDUSTRY_VALUES,
  SIGNUP_ENDPOINT,
  SIGNUP_METHOD,
  SIGNUP_NETWORK_ERROR,
  buildSignupPayload,
  mapSignupError,
  validateSignup,
  type SignupFormValues,
} from "./signupContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/signup → src/pages → src → web-agency → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const pageSrc = readFileSync(
  path.join(repoRoot, "artifacts/web-agency/src/pages/LandingReceptionistSignup.tsx"),
  "utf8",
);

/**
 * The page source with comments removed.
 *
 * Over-claim checks must run against what the page *renders*, not what it
 * documents. The module docstring deliberately quotes the claims Phase 5
 * deleted ("running 24/7", "Answers in seconds") so the removal is explained
 * where a future editor will read it — scanning the raw file would flag that
 * explanation as the very thing it is recording the removal of.
 */
const pageText = pageSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const valid: SignupFormValues = {
  name: "Test Person",
  businessName: "Test Business",
  email: "test@example.invalid",
  phone: "5550000000",
  businessType: "Retail",
  password: "correct horse battery",
};

console.log("\n--- signup payload contract ---");
{
  const payload = buildSignupPayload(valid);
  const keys = Object.keys(payload).sort();
  check(
    "payload carries exactly the six contracted keys",
    JSON.stringify(keys) ===
      JSON.stringify(["businessName", "email", "fullName", "industry", "password", "phone"]),
    keys.join(","),
  );
  check("fullName maps from the name field", payload.fullName === valid.name);
  check("industry maps from the businessType field", payload.industry === valid.businessType);
  check("businessName is passed through", payload.businessName === valid.businessName);
  check("phone is passed through", payload.phone === valid.phone);
  check("email is passed through untrimmed", payload.email === valid.email);
  check("password is passed through", payload.password === valid.password);
  check("endpoint is unchanged", SIGNUP_ENDPOINT === "/api/receptionist/auth/signup");
  check("method is unchanged", SIGNUP_METHOD === "POST");
}

console.log("\n--- client-side validation blocks invalid submissions ---");
{
  check("empty form is rejected", validateSignup(EMPTY_SIGNUP_FORM).ok === false);

  const noName = validateSignup({ ...valid, name: "   " });
  check("blank name is rejected", noName.ok === false);
  check(
    "blank name keeps the original message",
    noName.formError === "Name and email are required.",
    noName.formError,
  );
  check("blank name focuses the name field", noName.focusField === "name");

  const noEmail = validateSignup({ ...valid, email: "" });
  check("blank email is rejected", noEmail.ok === false);
  check("blank email focuses the email field", noEmail.focusField === "email");

  const shortPw = validateSignup({ ...valid, password: "1234567" });
  check("7-character password is rejected", shortPw.ok === false);
  check(
    "short password keeps the original message",
    shortPw.formError === "Password must be at least 8 characters.",
    shortPw.formError,
  );
  check("short password focuses the password field", shortPw.focusField === "password");

  check("exactly 8 characters is accepted", validateSignup({ ...valid, password: "12345678" }).ok);
  check("a complete form is accepted", validateSignup(valid).ok === true);

  // Optional fields must stay optional.
  check(
    "business name, phone and industry are optional",
    validateSignup({ ...valid, businessName: "", phone: "", businessType: "" }).ok === true,
  );

  // Name/email are checked before password, as they always were.
  const bothWrong = validateSignup({ ...EMPTY_SIGNUP_FORM, password: "x" });
  check(
    "name/email rule is evaluated before the password rule",
    bothWrong.formError === "Name and email are required.",
    bothWrong.formError,
  );

  // No client-side email-format rule may be introduced: it would reject input
  // the server currently accepts.
  check(
    "no client-side email format rule",
    validateSignup({ ...valid, email: "not-an-email" }).ok === true,
  );
}

console.log("\n--- API error mapping ---");
{
  const dup = mapSignupError(409, "An account with that email already exists.");
  check("409 explains the duplicate", /already exists/i.test(dup.message));
  check("409 offers sign-in as the recovery", dup.offerSignIn === true);

  const rate = mapSignupError(429, "Too many attempts. Try again later.");
  check("429 explains the rate limit", /too many/i.test(rate.message));
  check("429 does not offer sign-in", rate.offerSignIn === false);

  const bad = mapSignupError(400, "Full name, email, and password are required.");
  check(
    "other statuses keep the server message",
    bad.message === "Full name, email, and password are required.",
    bad.message,
  );
  check("unknown failure falls back to a generic message", mapSignupError(500).message.length > 0);
  check("network error has its own message", SIGNUP_NETWORK_ERROR.length > 0);
}

console.log("\n--- industry values are unchanged ---");
{
  check("Home Services stores its short value", INDUSTRY_VALUES["Home Services (HVAC, Plumbing, Electrical…)"] === "Home Services");
  check("Med Spa stores its short value", INDUSTRY_VALUES["Med Spa / Aesthetics"] === "Med Spa");
  check("Real Estate is unchanged", INDUSTRY_VALUES["Real Estate"] === "Real Estate");
}

console.log("\n--- required fields are still on the page ---");
{
  const fields = [
    { id: "s-name", label: "Full name" },
    { id: "s-biz", label: "Business name" },
    { id: "s-email", label: "Email" },
    { id: "s-phone", label: "Phone" },
    { id: "s-industry", label: "Industry" },
    { id: "s-password", label: "Password" },
  ];
  for (const f of fields) {
    check(`field ${f.id} is rendered`, pageSrc.includes(`id="${f.id}"`));
    check(
      `field ${f.id} has a label bound with htmlFor`,
      pageSrc.includes(`htmlFor="${f.id}"`),
    );
  }
  check("required fields declare aria-required", (pageSrc.match(/aria-required="true"/g) ?? []).length >= 3);
  check("email uses the email input type", /id="s-email"[\s\S]{0,400}?type="email"/.test(pageSrc));
  check("phone uses the tel input type", /id="s-phone"[\s\S]{0,400}?type="tel"/.test(pageSrc));
  check("password autocomplete is new-password", pageSrc.includes('autoComplete="new-password"'));
  check("email autocomplete is set", pageSrc.includes('autoComplete="email"'));
  check("name autocomplete is set", pageSrc.includes('autoComplete="name"'));
}

console.log("\n--- actions and destinations ---");
{
  check("submit button is type=submit", /type="submit"/.test(pageSrc));
  check('primary action reads "Create account"', pageSrc.includes('"Create account"'));
  check(
    "submitting state is announced",
    pageSrc.includes("Creating your account"),
  );
  check(
    'no "Get Started" label on the submit action',
    !/>\s*Get Started\s*</.test(pageSrc),
  );
  check('no "Book a Call"', !/Book a Call/i.test(pageSrc));
  check(
    "sign-in uses the centralised dashboard destination",
    pageSrc.includes("DASHBOARD_URLS.login"),
  );
  check(
    "sign-in path is not hand-written",
    !pageSrc.includes('"/ai-receptionist/dashboard/login"'),
  );
  check(
    "back link uses the centralised landing route",
    pageSrc.includes("ROUTES.aiReceptionist"),
  );
  check(
    "landing route is not hand-written",
    !/href="\/ai-receptionist"/.test(pageSrc),
  );
  check(
    "successful signup still redirects to the dashboard root",
    pageSrc.includes("window.location.href = DASHBOARD_URLS.root"),
  );
  check(
    "submit handler is still wired to the form",
    /<form[\s\S]{0,200}onSubmit=\{submit\}/.test(pageSrc),
  );
  check("endpoint constant is used, not a literal URL", !pageSrc.includes('"/api/receptionist/auth/signup"'));
}

console.log("\n--- readiness wording is accurate ---");
{
  check(
    "readiness comes from the shared source",
    pageSrc.includes("CAPABILITY_STATUS") && pageSrc.includes("READINESS"),
  );
  check("heading names the SMS receptionist", /Create your SMS Receptionist/.test(pageSrc));

  const overclaims: Array<[string, RegExp]> = [
    ["24/7", /24\s*\/\s*7/],
    ["24 hours a day", /24 hours a day/i],
    ["every call", /every call/i],
    ["never miss", /never miss/i],
    ["answers in seconds", /in seconds/i],
    ["always on", /always[- ]on\b/i],
    ["qualifies every caller", /every caller/i],
    ["books appointments automatically", /automatic(ally)?\s+(book|schedul)/i],
    ["files into a CRM automatically", /automatic(ally)?\s+(file|sync)/i],
    ["CRM described as in development", /CRM[^.]{0,60}(being developed|in development|coming soon)/i],
    ["guarantee", /guarantee/i],
    ["a price", /\$\s?\d/],
    ["a setup duration", /(set ?up|live|launch(ed)?)\s+in\s+(under\s+)?\w+\s+(day|days|week|weeks|hour|hours)/i],
    ["a compliance certification", /\b(HIPAA|SOC\s?2|ISO\s?27001|PCI[- ]DSS)\b/i],
    ["an encryption claim", /(bank|military)[- ]grade|end-to-end encrypt/i],
    ["a named integration", /\b(Salesforce|HubSpot|Zapier|Calendly|Google Calendar)\b/],
  ];
  for (const [label, re] of overclaims) {
    check(`no over-claim: ${label}`, !re.test(pageText), (pageText.match(re) ?? [])[0]);
  }
}

console.log("\n--- accessibility affordances ---");
{
  check("password visibility toggle is keyboard reachable", !pageSrc.includes("tabIndex={-1}\n                    onClick={() => setShowPw"));
  check("password toggle exposes pressed state", pageSrc.includes("aria-pressed={showPw}"));
  check("password toggle has an accessible name", /Show password|Hide password/.test(pageSrc));
  check("form-level error uses role=alert", pageSrc.includes('role="alert"'));
  check("inline errors are associated with aria-describedby", pageSrc.includes("aria-describedby"));
  check("invalid fields set aria-invalid", pageSrc.includes("aria-invalid"));
  check("required and optional are spelled out", pageSrc.includes(">Required<") && pageSrc.includes(">Optional<"));
  check("exactly one h1", (pageSrc.match(/<h1/g) ?? []).length === 1);
  check("no placeholder-only labelling", !/placeholder=/.test(pageSrc));
}

console.log("\n--- route helpers ---");
{
  const routesSrc = readFileSync(
    path.join(repoRoot, "artifacts/web-agency/src/lib/routes.ts"),
    "utf8",
  );
  check(
    "signup route path is unchanged",
    routesSrc.includes('aiReceptionistSignup: "/ai-receptionist/signup"'),
  );
  check("landing route path is unchanged", routesSrc.includes('aiReceptionist: "/ai-receptionist"'));
  check(
    "signup is registered before the landing route",
    (() => {
      const appSrc = readFileSync(
        path.join(repoRoot, "artifacts/web-agency/src/App.tsx"),
        "utf8",
      );
      const signupAt = appSrc.indexOf("ROUTES.aiReceptionistSignup");
      const landingAt = appSrc.indexOf("ROUTES.aiReceptionist}");
      return signupAt !== -1 && landingAt !== -1 && signupAt < landingAt;
    })(),
  );
  check(
    "dashboard URLs are absolute and do not take the router base",
    routesSrc.includes('const DASHBOARD_BASE = "/ai-receptionist/dashboard"'),
  );
  check(
    "Start Your Project still resolves to Discovery",
    routesSrc.includes("export const START_PROJECT_ROUTE = ROUTES.discovery"),
  );
}

console.log(
  failed === 0
    ? "\nAll frontendSignupContract tests passed."
    : `\nfrontendSignupContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
