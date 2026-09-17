/**
 * Committed contract tests for the AI Receptionist account-creation page:
 * ordinary registration, no invite code.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * History: Phase 5 pinned an open trial signup, S-1 pinned an invite-only one,
 * and the owner retired the private-beta invitation for customer signup on
 * 2026-09-16. This suite now pins registration WITHOUT an invite, while
 * keeping S-1's timezone and Terms acknowledgement.
 *
 * Same arrangement as every other contract test in this app: behavioural
 * checks execute `signupContract.ts` directly; structural checks read the
 * page source. No test framework, no DOM, no new dependency, no network
 * request, no account created.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { POLICY_VERSIONS } from "../legal/policyVersions";
import {
  emptySignupForm,
  MIN_PASSWORD_LENGTH,
  SIGNUP_ENDPOINT,
  SIGNUP_METHOD,
  SIGNUP_NETWORK_ERROR,
  TIMEZONE_OPTIONS,
  buildSignupPayload,
  detectTimezone,
  mapSignupError,
  SIGNUP_POLICIES_CHANGED_MESSAGE,
  SIGNUP_UNAVAILABLE_MESSAGE,
  validateSignup,
  type SignupFormValues,
} from "./signupContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/signup → src/pages → src → web-agency → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/web-agency/src/pages/LandingReceptionistSignup.tsx");
const dialogSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../components/legal/PolicyDialog.tsx"), "utf8");
const termsPageSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../LegalTermsV3.tsx"), "utf8");
const privacyPageSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../LegalPrivacyV3.tsx"), "utf8");
const routesSrc = read("artifacts/web-agency/src/lib/routes.ts");
const appSrc = read("artifacts/web-agency/src/App.tsx");

const pageText = pageSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

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
  ownerName: "Jamie Rivera",
  businessName: "Northgate Plumbing",
  email: "jamie@northgate.example",
  password: "correct horse battery",
  timezone: "America/Chicago",
  acceptedTerms: true,
};

console.log("\n--- signup payload contract ---");
{
  const payload = buildSignupPayload(valid);
  const keys = Object.keys(payload).sort();
  check(
    "payload carries exactly the seven contracted keys — no invite code",
    JSON.stringify(keys) === JSON.stringify(["acceptedPolicies", "acceptedTerms", "businessName", "email", "ownerName", "password", "timezone"]),
    keys.join(","),
  );
  check("no inviteCode is sent", !("inviteCode" in payload));
  check(
    "the policy versions shown on the page are sent",
    JSON.stringify(payload.acceptedPolicies) === JSON.stringify({ terms: POLICY_VERSIONS.terms, privacy: POLICY_VERSIONS.privacy }),
  );
  const serverVersions = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../api-server/src/lib/policyVersions.ts"), "utf8");
  check(
    "and they are the versions the server records",
    serverVersions.includes(`terms: "${POLICY_VERSIONS.terms}"`) && serverVersions.includes(`privacy: "${POLICY_VERSIONS.privacy}"`),
  );
  check("a policy change mid-signup is not reported as an existing account",
    mapSignupError(409, "x", "policies_outdated").outcome !== "duplicate" && mapSignupError(409, "x", "policies_outdated").message === SIGNUP_POLICIES_CHANGED_MESSAGE);
  check("ownerName is passed through", payload.ownerName === valid.ownerName);
  check("businessName is passed through", payload.businessName === valid.businessName);
  check("email is trimmed", buildSignupPayload({ ...valid, email: "  jamie@northgate.example " }).email === valid.email);
  check("password is passed through unaltered", payload.password === valid.password);
  check("timezone is passed through", payload.timezone === valid.timezone);
  check("acceptedTerms is always sent as literal true", payload.acceptedTerms === true);
  check("endpoint is the registration route", SIGNUP_ENDPOINT === "/api/receptionist/auth/register");
  check("method is POST", SIGNUP_METHOD === "POST");
  check("the page calls neither the invite route nor the older signup route", !/auth\/(invite-signup|signup)["'`]/.test(pageSrc));
}

console.log("\n--- client-side validation, in field order ---");
{
  const empty = emptySignupForm();
  check("an empty form is rejected", validateSignup(empty).ok === false);
  check("owner name is checked first", validateSignup(empty).focusField === "ownerName");

  const noOwner = validateSignup({ ...valid, ownerName: "" });
  check("a missing owner name is rejected", noOwner.ok === false);
  check("focus goes to owner name", noOwner.focusField === "ownerName");

  const noBusiness = validateSignup({ ...valid, businessName: "  " });
  check("a missing business name is rejected", noBusiness.ok === false);

  const noEmail = validateSignup({ ...valid, email: "" });
  check("a missing email is rejected", noEmail.ok === false);
  check("an obviously malformed email is rejected client-side", validateSignup({ ...valid, email: "not-an-email" }).focusField === "email");

  const shortPw = validateSignup({ ...valid, password: "1234567" });
  check(`a password under ${MIN_PASSWORD_LENGTH} characters is rejected`, shortPw.ok === false);
  check("exactly the minimum length is accepted", validateSignup({ ...valid, password: "12345678" }).ok === true);

  const noTerms = validateSignup({ ...valid, acceptedTerms: false });
  check("an unchecked Terms/Privacy box is rejected", noTerms.ok === false);
  check("Terms is checked last, after every other field is valid", noTerms.formError.toLowerCase().includes("terms"));

  check("timezone is optional client-side (the browser default fills it in)", validateSignup({ ...valid, timezone: "" }).ok === true);
  check("a fully valid form passes", validateSignup(valid).ok === true);
}

console.log("\n--- API error mapping ---");
{
  const invalid = mapSignupError(400, "Enter a valid email address.");
  check("400 reads as a validation failure", invalid.outcome === "invalid");
  check("400 shows the server's own message", invalid.message === "Enter a valid email address.");

  const dup = mapSignupError(409, "anything");
  check("409 reads as an existing account", dup.outcome === "duplicate");
  check("409 offers recovery (sign in / reset) rather than a second account", dup.offerRecovery === true);

  const limited = mapSignupError(429);
  check("429 reads as rate-limited", limited.outcome === "limited" && limited.offerRecovery === false);

  const off = mapSignupError(503);
  check("503 reads as unavailable", off.outcome === "unavailable");
  check("503 says so plainly, without private-beta or invitation wording", off.message === SIGNUP_UNAVAILABLE_MESSAGE && !/invitation|private beta/i.test(off.message));
  check("503 does not offer recovery (there is no account to recover)", off.offerRecovery === false);

  check("a 500 never echoes server internals", mapSignupError(500, "stack trace here").message !== "stack trace here");

  const other = mapSignupError(500);
  check("an unmapped failure falls back to a generic message", other.message.length > 0 && other.outcome === "error");
  check("network error has its own distinct message", SIGNUP_NETWORK_ERROR.length > 0 && SIGNUP_NETWORK_ERROR !== other.message);
}

console.log("\n--- timezone select ---");
{
  check("every option is a real IANA zone name (contains a '/', or is UTC)", TIMEZONE_OPTIONS.every((tz) => tz === "UTC" || tz.includes("/")));
  check("detectTimezone never throws outside a browser and returns a string", typeof detectTimezone() === "string");
  check("the page preselects the browser's own timezone", pageText.includes("emptySignupForm(detectTimezone())"));
}

console.log("\n--- required fields are on the page ---");
{
  const fields = [
    { id: "s-owner-name", label: "Your name" },
    { id: "s-business-name", label: "Business name" },
    { id: "s-email", label: "Work email" },
    { id: "s-timezone", label: "Timezone" },
    { id: "s-password", label: "Password" },
    { id: "s-accept-terms", label: "Terms" },
  ];
  for (const f of fields) {
    check(`field ${f.id} is rendered`, pageSrc.includes(`id="${f.id}"`));
    check(`field ${f.id} has a label bound with htmlFor`, pageSrc.includes(`htmlFor="${f.id}"`));
  }
  check("there is no invite code field", !pageSrc.includes("s-invite-code") && !/Invite code/i.test(pageText));
  check("the Terms checkbox is a real checkbox input", /id="s-accept-terms"[\s\S]{0,80}?type="checkbox"/.test(pageSrc));
  // Owner defect 2026-09-17: opening a policy navigated away and lost the form.
  check("Terms and Privacy open in in-page dialogs", pageSrc.includes('<PolicyDialog policy="terms"') && pageSrc.includes('<PolicyDialog policy="privacy"'));
  check("no policy link navigates away from the form", !pageSrc.includes("ROUTES.terms") && !pageSrc.includes("ROUTES.privacy"));
  check("the dialog trigger is a button, not a link", dialogSrc.includes('<button type="button" className="sg-alt__link sg-policy-link">'));
  check("the dialog and the policy pages share one wording", termsPageSrc.includes("<TermsBody />") && privacyPageSrc.includes("<PrivacyBody />") && dialogSrc.includes("<TermsBody />") && dialogSrc.includes("<PrivacyBody />"));
  check("timezone is a native select, not a custom widget", pageSrc.includes('<select id="s-timezone"'));
  check("password autocomplete is new-password", pageSrc.includes('autoComplete="new-password"'));
  check("email autocomplete is set", pageSrc.includes('autoComplete="email"'));
  check("owner-name autocomplete is set", pageSrc.includes('autoComplete="name"'));
  check("business-name autocomplete is organization", pageSrc.includes('autoComplete="organization"'));
}

console.log("\n--- states: submitting, duplicate, unavailable ---");
{
  check("a submitting state disables the submit button", pageSrc.includes("disabled={submitting}"));
  check("the submitting state is announced in the button", pageSrc.includes("Creating your account"));
  check(
    "an existing account (409) offers sign-in and password reset",
    pageSrc.includes('outcome === "duplicate"') && pageSrc.includes("Sign in instead") && pageSrc.includes("DASHBOARD_URLS.passwordReset"),
  );
  check("the password-reset destination is the dashboard's reset page", routesSrc.includes('passwordReset: dashboardUrl("/password-reset")'));
  check("no beta-request dead end remains on the page", !/Request Beta Access|BETA_REQUEST_HREF/.test(pageSrc));
  check("field-level errors are rendered per field, tied by aria-describedby", pageSrc.includes("aria-describedby={describedBy("));
}

console.log("\n--- the fire-and-forget lead-capture call is removed ---");
{
  // Checked against the comment-stripped text: the module docstring
  // documents removing this endpoint, and that explanation must not be
  // mistaken for the endpoint still being called.
  check("no landing-test submission remains", !pageText.includes("/api/landing-test/submit"));
  check("no fire-and-forget void fetch remains on this page", !/void fetch\(/.test(pageSrc));
}

console.log("\n--- actions and destinations ---");
{
  check("submit button is type=submit", /type="submit"/.test(pageSrc));
  check('primary action reads "Create account"', pageSrc.includes('"Create account"'));
  check('no "Get Started" label on the submit action', !/>\s*Get Started\s*</.test(pageSrc));
  check(
    "sign-in uses the centralised dashboard destination",
    pageSrc.includes("DASHBOARD_URLS.login"),
  );
  check(
    "back link uses the centralised landing route",
    pageSrc.includes("ROUTES.aiReceptionist"),
  );
  check(
    "successful signup still redirects to the dashboard root",
    pageSrc.includes("window.location.href = DASHBOARD_URLS.root"),
  );
  check(
    "submit handler is still wired to the form",
    /<form[\s\S]{0,200}onSubmit=\{submit\}/.test(pageSrc),
  );
}

console.log("\n--- readiness wording and honest next steps ---");
{
  check("readiness comes from the shared source", pageSrc.includes("CAPABILITY_STATUS") && pageSrc.includes("READINESS"));
  check("heading matches the S-1 title exactly", /Set up your AI Receptionist/.test(pageSrc));
  check("the page no longer describes an invitation or private beta", !/invit|private beta/i.test(pageText));
  check("the page never promises automatic activation", !/activat(e|ion)s?\s+(automatically|immediately)/i.test(pageText));

  const overclaims: Array<[string, RegExp]> = [
    ["24/7", /24\s*\/\s*7/],
    ["every call", /every call/i],
    ["never miss", /never miss/i],
    ["answers in seconds", /in seconds/i],
    ["always on", /always[- ]on\b/i],
    ["guarantee", /guarantee/i],
    ["a price", /\$\s?\d/],
    ["a compliance certification", /\b(HIPAA|SOC\s?2|ISO\s?27001|PCI[- ]DSS)\b/i],
  ];
  for (const [label, re] of overclaims) {
    check(`no over-claim: ${label}`, !re.test(pageText), (pageText.match(re) ?? [])[0]);
  }
}

console.log("\n--- accessibility affordances ---");
{
  check("password toggle exposes pressed state", pageSrc.includes("aria-pressed={showPw}"));
  check("password toggle has an accessible name", /Show password|Hide password/.test(pageSrc));
  check("form-level error uses role=alert", pageSrc.includes('role="alert"'));
  check("invalid fields set aria-invalid", pageSrc.includes("aria-invalid"));
  check("required and optional are spelled out", pageSrc.includes(">Required<") && pageSrc.includes(">Optional<"));
  check("exactly one h1", (pageSrc.match(/<h1/g) ?? []).length === 1);
  check("no placeholder-only labelling", !/placeholder=/.test(pageSrc));
}

console.log("\n--- route helpers ---");
{
  check("signup route path is unchanged", routesSrc.includes('aiReceptionistSignup: "/ai-receptionist/signup"'));
  check("landing route path is unchanged", routesSrc.includes('aiReceptionist: "/ai-receptionist"'));
  check(
    "signup is registered before the landing route",
    (() => {
      // Match the actual <Route path={...}> registrations. A bare
      // `ROUTES.aiReceptionist}` needle also matches the retired-vertical
      // redirect template literals (`${ROUTES.aiReceptionist}#use-cases`),
      // which sit above the signup route and are not route registrations.
      const signupAt = appSrc.indexOf("path={ROUTES.aiReceptionistSignup}");
      const landingAt = appSrc.indexOf("path={ROUTES.aiReceptionist}");
      return signupAt !== -1 && landingAt !== -1 && signupAt < landingAt;
    })(),
  );
  check("Terms and Privacy routes exist and are used", routesSrc.includes('terms: "/terms"') && routesSrc.includes('privacy: "/privacy"'));
}

console.log(
  failed === 0
    ? "\nAll frontendSignupContract tests passed."
    : `\nfrontendSignupContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
