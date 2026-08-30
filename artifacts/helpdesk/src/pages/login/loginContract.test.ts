/**
 * Frontend V2 Phase 6 — committed contract tests for the AI Receptionist
 * sign-in page.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as the Phase 5 signup tests: the file lives beside the
 * module it tests so the import is an ordinary sibling import, and `scripts`
 * owns the runner because it is the workspace package that already has `tsx`.
 * helpdesk's tsconfig excludes `**\/*.test.ts` by glob, so this file is neither
 * type-built into the app nor bundled by Vite — nothing imports it from the
 * entry graph.
 *
 * Two kinds of assertion, both dependency-free:
 *
 *  1. **Behavioural.** `loginContract.ts` is pure and imported directly, so the
 *     validation rule, the submitted payload, and the error mapping are
 *     executed rather than pattern-matched.
 *  2. **Structural.** The page, the router, the shell, and the two route
 *     modules are read as source and checked for what a renderer would
 *     otherwise be needed to prove: that both fields are present with labels
 *     bound to their inputs, that the submit action and both navigation
 *     destinations are intact, that the readiness wording matches the public
 *     site character-for-character, and that no voice, booking, CRM or
 *     outcome over-claim appears.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, and never
 * creates a session or an account.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_LOGIN_FORM,
  LOGIN_CREDENTIALS,
  LOGIN_ENDPOINT,
  LOGIN_FALLBACK_ERROR,
  LOGIN_METHOD,
  LOGIN_NETWORK_ERROR,
  LOGIN_SUCCESS_ROUTE,
  buildLoginPayload,
  mapLoginError,
  validateLogin,
  type LoginFormValues,
} from "./loginContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/login → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Login.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-signin.css");
const readinessSrc = read("artifacts/helpdesk/src/pages/login/readiness.ts");
const publicReadinessSrc = read("artifacts/web-agency/src/components/v2/home/readiness.ts");

/**
 * The page source with comments removed.
 *
 * Over-claim checks must run against what the page *renders*, not what it
 * documents — the module docstring names the capabilities it is careful not to
 * claim, and scanning the raw file would flag that explanation as the very
 * thing it records the absence of.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const pageText = stripComments(pageSrc);

/**
 * The same source with runs of whitespace collapsed. Copy assertions run
 * against this, because a sentence in JSX is wrapped by the formatter at
 * whatever column it reaches — matching the raw text would make the tests fail
 * on reflowing rather than on a change of meaning.
 */
const pageProse = pageText.replace(/\s+/g, " ");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const valid: LoginFormValues = {
  email: "  Person@Example.invalid  ",
  password: "  a password with spaces  ",
};

console.log("\n--- sign-in payload and API contract ---");
{
  const payload = buildLoginPayload(valid);
  const keys = Object.keys(payload).sort();
  check(
    "payload carries exactly the two contracted keys",
    JSON.stringify(keys) === JSON.stringify(["email", "password"]),
    keys.join(","),
  );
  check("email is passed through untrimmed", payload.email === valid.email);
  check("password is passed through unaltered", payload.password === valid.password);
  check("endpoint is unchanged", LOGIN_ENDPOINT === "/api/receptionist/auth/login");
  check("method is unchanged", LOGIN_METHOD === "POST");
  check("credentials mode is unchanged", LOGIN_CREDENTIALS === "include");
  check("successful-login destination is unchanged", LOGIN_SUCCESS_ROUTE === "/");
}

console.log("\n--- client-side validation blocks invalid submissions ---");
{
  const blank = validateLogin(EMPTY_LOGIN_FORM);
  check("an empty form does not submit", blank.ok === false);
  check("both fields are reported when both are blank", Boolean(blank.fieldErrors.email && blank.fieldErrors.password));
  check("focus goes to the email field first", blank.focusField === "email");

  const noPassword = validateLogin({ email: "person@example.invalid", password: "" });
  check("a missing password does not submit", noPassword.ok === false);
  check("focus goes to the password field", noPassword.focusField === "password");
  check("the email is not flagged when only the password is missing", noPassword.fieldErrors.email === undefined);

  const whitespace = validateLogin({ email: "   ", password: "   " });
  check("whitespace-only credentials do not submit", whitespace.ok === false);

  const ok = validateLogin({ email: "person@example.invalid", password: "x" });
  check("a filled form submits", ok.ok === true);
  check("no client-side length rule is applied", ok.fieldErrors.password === undefined);
  check(
    "no client-side email-format rule is applied (the server decides)",
    validateLogin({ email: "not-an-email", password: "x" }).ok === true,
  );
}

console.log("\n--- server error presentation ---");
{
  check(
    "401 shows the server's own message",
    mapLoginError(401, "Invalid email or password.").message === "Invalid email or password.",
  );
  check(
    "401 does not reveal whether the account exists",
    !/no account|not found|unknown/i.test(mapLoginError(401, "Invalid email or password.").message),
  );
  check("429 is explained with the documented 15-minute window", mapLoginError(429, "Too many attempts. Try again later.").rateLimited === true);
  check(
    "429 message names the wait",
    mapLoginError(429).message === "Too many sign-in attempts. Try again in 15 minutes.",
  );
  check("400 shows the server's own message", mapLoginError(400, "Email and password are required.").message === "Email and password are required.");
  check(
    "a response with no error string falls back",
    mapLoginError(500).message === LOGIN_FALLBACK_ERROR,
  );
  check(
    "a blank error string falls back rather than rendering an empty alert",
    mapLoginError(500, "   ").message === LOGIN_FALLBACK_ERROR,
  );
  check("the network failure message is distinct", LOGIN_NETWORK_ERROR !== LOGIN_FALLBACK_ERROR);
}

console.log("\n--- the page is still wired to that contract ---");
{
  check("the page submits through the contract endpoint", pageText.includes("fetch(LOGIN_ENDPOINT"));
  check("the page uses the contract method", pageText.includes("method: LOGIN_METHOD"));
  check("the page sends the contract credentials mode", pageText.includes("credentials: LOGIN_CREDENTIALS"));
  check("the page sends the contract payload", pageText.includes("JSON.stringify(buildLoginPayload(form))"));
  check("the page validates before submitting", pageText.includes("validateLogin(form)"));
  check("the page maps server errors through the contract", pageText.includes("mapLoginError(res.status"));
  check(
    "the session is refreshed before navigating",
    pageText.indexOf("refreshSessionAfterLogin()") < pageText.indexOf("navigate(LOGIN_SUCCESS_ROUTE)"),
  );
  check("the page navigates to the contract destination", pageText.includes("navigate(LOGIN_SUCCESS_ROUTE)"));
  check("a second submission while one is in flight is refused", pageText.includes("if (submitting) return;"));
  check("the submit control is disabled while submitting", pageText.includes("disabled={submitting}"));
  check("no credential is written to a log", !/console\.(log|warn|error|info|debug)/.test(pageText));
}

console.log("\n--- required fields and the primary action ---");
{
  check("the email input is present", pageText.includes('id="signin-email"'));
  check("the password input is present", pageText.includes('id="signin-password"'));
  check("the email label is bound to its input", pageText.includes('htmlFor="signin-email"'));
  check("the password label is bound to its input", pageText.includes('htmlFor="signin-password"'));
  check("both labels are persistent text, not placeholders", (pageText.match(/className="si-label"/g) ?? []).length === 2);
  check("both fields are marked Required in words", (pageText.match(/className="si-req">Required/g) ?? []).length === 2);
  check("the email field uses the email type", pageText.includes('type="email"'));
  check("the email field autocompletes", pageText.includes('autoComplete="email"'));
  check("the password field autocompletes for sign-in, not signup", pageText.includes('autoComplete="current-password"') && !pageText.includes('autoComplete="new-password"'));
  check("the primary action is a submit button", pageText.includes('type="submit"'));
  check('the primary action is labelled "Sign in"', pageText.includes('"Signing in…" : "Sign in"'));
  check(
    "the primary action does not use a marketing label",
    !/(Get Started|Get started|Continue|Book a Call)/.test(pageText),
  );
  check("the submitting state is announced in the button text", pageText.includes("Signing in…"));
}

console.log("\n--- no authentication method that does not exist ---");
{
  check(
    "no password-recovery link is shown (no route implements one)",
    !/forgot|reset your password|password reset/i.test(pageText),
  );
  check("no remember-me control", !/remember\s?me/i.test(pageText));
  check(
    "no federated or magic-link control",
    !/(Google|Facebook|Apple|Microsoft|GitHub|SSO|magic link)/i.test(pageText),
  );
  check("no password-strength meter on sign-in", !/strength/i.test(pageText));
  // The repository is the authority: if a recovery route ever lands, this
  // check fails and the page must offer it.
  check(
    "the backend still has no password-recovery endpoint",
    !/forgot|password-reset|resetPassword/i.test(
      read("artifacts/api-server/src/routes/receptionistAuth.ts"),
    ),
  );
}

console.log("\n--- accessibility structure ---");
{
  check("exactly one h1", (pageText.match(/<h1/g) ?? []).length === 1);
  check("no heading level is skipped (h1 then h2s, no h3+)", !/<h3|<h4|<h5|<h6/.test(pageText));
  check("the form-level alert has role=alert", pageText.includes('role="alert"'));
  check("the form-level alert can take focus", pageText.includes("tabIndex={-1}") && pageText.includes("alertRef.current?.focus()"));
  check("inline errors are tied to their input", pageText.includes("aria-describedby={describedBy("));
  check("invalid fields are marked for assistive technology", (pageText.match(/aria-invalid=/g) ?? []).length === 2);
  check(
    "the password toggle is a real button, reachable by keyboard",
    (() => {
      // The whole opening tag, so a tabIndex added to it anywhere is caught —
      // the pre-V2 signup toggle was removed from the tab order this way.
      const tag = pageProse.match(/<button type="button" className="si-password__toggle"[^>]*>/);
      return Boolean(tag) && !/tabIndex/.test(tag![0]);
    })(),
  );
  check("the password toggle announces its state", pageText.includes("aria-pressed={showPassword}"));
  check("the password toggle has a text name", pageText.includes("Hide password") && pageText.includes("Show password"));
  check("the toggle icons are hidden from assistive technology", (pageText.match(/aria-hidden="true"/g) ?? []).length >= 3);
  check("controls meet the 44px minimum", (cssSrc.match(/min-height: 44px/g) ?? []).length >= 4);
  check("focus is never suppressed", !/outline:\s*(none|0)/.test(cssSrc));
  check("reduced motion is honoured", cssSrc.includes("@media (prefers-reduced-motion: reduce)"));
  check("errors do not depend on colour alone", pageText.includes('className="si-alert__label">Error'));
}

console.log("\n--- product truth ---");
{
  check(
    "the heading names the SMS receptionist",
    pageProse.includes("Sign in to your") && pageProse.includes("SMS Receptionist"),
  );
  check("the readiness tiers are rendered", pageText.includes("CAPABILITY_STATUS.map"));
  check("the tier label is always shown as text", pageText.includes("READINESS[item.tier].label"));

  // The three tiers must be worded exactly as the public site words them.
  for (const phrase of [
    "SMS Receptionist",
    "Voice experience",
    "Connected CRM and automated follow-up",
    "Available now",
    "In development",
    "Planned",
  ]) {
    check(`"${phrase}" matches the public site's wording`, readinessSrc.includes(`"${phrase}"`) && publicReadinessSrc.includes(`"${phrase}"`));
  }
  check(
    "SMS is the tier marked available",
    /\{ capability: "SMS Receptionist", tier: "available" \}/.test(readinessSrc),
  );
  check(
    "voice is not marked available",
    /\{ capability: "Voice experience", tier: "in-development" \}/.test(readinessSrc),
  );
  check(
    "CRM is not marked available",
    /\{ capability: "Connected CRM and automated follow-up", tier: "planned" \}/.test(readinessSrc),
  );
  check(
    "the page states plainly that voice and CRM are not included yet",
    pageProse.includes("Voice and connected CRM are not part of it yet."),
  );
  check(
    "the page states where a successful sign-in leads",
    pageProse.includes("Signing in opens your receptionist dashboard."),
  );
}

console.log("\n--- no unsupported claim ---");
{
  const forbidden: Array<[string, RegExp]> = [
    ["24/7 or round-the-clock availability", /24\/7|24 hours|round the clock|always on/i],
    ["a response-time promise", /answers? in seconds|instant(ly)? repl|response time|within seconds/i],
    ["voice answering as a live capability", /answers? (your )?calls|voice answering|never miss a call/i],
    ["automatic appointment booking", /books? appointments?|schedules? appointments?|auto-?book/i],
    ["automatic CRM filing or follow-up", /files? to your crm|automatic(ally)? follow(s|ed)? up/i],
    ["a leads, conversion, or revenue guarantee", /more leads|guaranteed|conversion rate|increase revenue/i],
    ["a compliance or certification claim", /soc\s?2|hipaa|iso 27001|bank-grade|enterprise-grade security/i],
  ];
  for (const [label, pattern] of forbidden) {
    check(`no ${label}`, !pattern.test(pageText), pageText.match(pattern)?.[0]);
  }
}

console.log("\n--- navigation destinations ---");
{
  check("the create-account destination is the public signup route", pageText.includes('publicSiteUrl("/ai-receptionist/signup")'));
  check("the return destination is the AI Receptionist landing page", pageText.includes('publicSiteUrl("/ai-receptionist")'));
  check("no destination is hand-composed", !/href="\/ai-receptionist/.test(pageText));
  check(
    "the create-account route is offered in words",
    pageProse.includes("Don't have an account?") &&
      (pageProse.match(/Create account/g) ?? []).length >= 2,
  );
  check("the return link is labelled", pageProse.includes("Back to AI Receptionist"));
  check(
    "cross-application links use document navigation, never <Link>",
    !/<Link\b/.test(pageText),
  );
}

console.log("\n--- routes, base handling, and dashboard protection ---");
{
  check("the sign-in route path is unchanged", routesSrc.includes('login: "/login"'));
  check("the router base is still derived centrally", routesSrc.includes("export const ROUTER_BASE = RAW_BASE.replace(/\\/+$/, \"\")"));
  check(
    "the base comes from Vite, so root and prefix builds both resolve",
    routesSrc.includes('const RAW_BASE = import.meta.env.BASE_URL || "/"'),
  );
  check(
    "publicSiteUrl is not derived from this app's base (no doubled prefix)",
    /export function publicSiteUrl\(path = "\/"\): string \{\s*return path\.startsWith\("\/"\) \? path : `\/\$\{path\}`;/.test(routesSrc),
  );
  check("the sign-in route is registered before the dashboard catch-all", (() => {
    const loginAt = appSrc.indexOf("ROUTES.login");
    const shellAt = appSrc.indexOf("<DashboardShell>");
    return loginAt !== -1 && shellAt !== -1 && loginAt < shellAt;
  })());
  check("the sign-in route renders inside AuthShell, not the dashboard chrome", /<Route path=\{ROUTES\.login\}>[\s\S]{0,120}<AuthShell>/.test(appSrc));
  check(
    "the dashboard still redirects an unauthenticated visitor to sign-in",
    read("artifacts/helpdesk/src/components/layout/AppShell.tsx").includes('navigate("/login")'),
  );
}

console.log("\n--- presentation stays inside the approved system ---");
{
  check("the sign-in stylesheet is scoped to the page", cssSrc.includes(".si-page {"));
  check("no remote font is requested", !/@import\s+url\(|fonts\.googleapis|fonts\.gstatic/.test(cssSrc));
  check("no remote or embedded image", !/url\(["']?https?:|data:image/.test(cssSrc));
  check("no gradient", !/gradient\(/.test(cssSrc));
  check("no radius above 16px", !/border-radius:\s*(1[7-9]|[2-9]\d|\d{3,})px/.test(cssSrc));
  check("the page opts out of the dashboard's dark theme explicitly", cssSrc.includes("color-scheme: light"));

  // The palette must be the approved one, byte-for-byte.
  const tokens = read("artifacts/web-agency/src/styles/tokens-v2.css");
  for (const hex of ["#FDFCFA", "#F0F9F6", "#E8F8F5", "#27E9B5", "#051824", "#3B5265"]) {
    check(
      `${hex} matches the approved token value`,
      tokens.toLowerCase().includes(hex.toLowerCase()) && cssSrc.toLowerCase().includes(hex.toLowerCase()),
    );
  }
  check(
    "no colour outside the approved palette and the two failure tints",
    (() => {
      const approved = new Set([
        "#fdfcfa", "#f6fbfa", "#f0f9f6", "#e8f8f5", "#27e9b5", "#051824", "#3b5265", "#ffffff",
        "#9c2233", "#fdf2f3", "#1fd0a2",
      ]);
      const used = (cssSrc.toLowerCase().match(/#[0-9a-f]{3,8}\b/g) ?? []).filter((c) => !approved.has(c));
      return used.length === 0;
    })(),
    (cssSrc.toLowerCase().match(/#[0-9a-f]{3,8}\b/g) ?? []).join(","),
  );
  check("the sign-in stylesheet ships with the sign-in route, not the entry graph", pageSrc.includes('import "@/styles/v2-signin.css"'));
  check(
    "the sign-in page is still lazily loaded",
    /const Login = lazy\(\(\) => import\("@\/pages\/Login"\)\)/.test(appSrc),
  );
}

console.log(
  failed === 0
    ? "\nAll frontendLoginContract tests passed."
    : `\nfrontendLoginContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
