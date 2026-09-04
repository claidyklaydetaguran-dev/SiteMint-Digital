/**
 * V5 customer-shell foundation — committed contract tests for the
 * password-reset request and complete pages (S-2).
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as every other contract test in this app: behavioural
 * checks execute the pure functions directly, structural checks read the
 * page source. No test framework, no DOM, no network request.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPLETE_ENDPOINT,
  COMPLETE_METHOD,
  EMPTY_COMPLETE_FORM,
  EMPTY_REQUEST_FORM,
  MIN_PASSWORD_LENGTH,
  REQUEST_CONFIRMATION,
  REQUEST_ENDPOINT,
  REQUEST_METHOD,
  REQUEST_UNAVAILABLE,
  buildCompletePayload,
  buildRequestPayload,
  mapCompleteError,
  mapRequestStatus,
  validateComplete,
  validateRequest,
} from "./passwordResetContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/password-reset → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const requestPageSrc = read("artifacts/helpdesk/src/pages/PasswordReset.tsx");
const completePageSrc = read("artifacts/helpdesk/src/pages/PasswordResetComplete.tsx");
const loginPageSrc = read("artifacts/helpdesk/src/pages/Login.tsx");

let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n--- request-reset contract ---");
{
  check("endpoint is the documented one", REQUEST_ENDPOINT === "/api/receptionist/account/password-reset/request");
  check("method is POST", REQUEST_METHOD === "POST");
  check("payload carries exactly the email key", JSON.stringify(Object.keys(buildRequestPayload(EMPTY_REQUEST_FORM))) === '["email"]');

  check("blank email is rejected", validateRequest(EMPTY_REQUEST_FORM).ok === false);
  check("whitespace-only email is rejected", validateRequest({ email: "   " }).ok === false);
  check("a filled email passes client validation", validateRequest({ email: "a@example.invalid" }).ok === true);
  check("no client-side email-format rule (the server decides)", validateRequest({ email: "not-an-email" }).ok === true);

  check("202 maps to confirmed", mapRequestStatus(202) === "confirmed");
  check("503 maps to unavailable", mapRequestStatus(503) === "unavailable");
  check("any other status maps to error", mapRequestStatus(500) === "error");

  check(
    "the confirmation is non-enumerating (says nothing about whether the account exists)",
    !/no account|not found|unknown|does not exist/i.test(REQUEST_CONFIRMATION),
  );
  check("the unavailable copy names SiteMint as the contact path", REQUEST_UNAVAILABLE.includes("contact SiteMint"));
}

console.log("\n--- complete-reset contract ---");
{
  check("endpoint is the documented one", COMPLETE_ENDPOINT === "/api/receptionist/account/password-reset/complete");
  check("method is POST", COMPLETE_METHOD === "POST");

  check("a missing token is rejected", validateComplete(EMPTY_COMPLETE_FORM, null).ok === false);
  check("a blank token is rejected", validateComplete(EMPTY_COMPLETE_FORM, "  ").ok === false);

  const shortPw = validateComplete({ password: "short1", confirmPassword: "short1" }, "tok_123");
  check(`a password under ${MIN_PASSWORD_LENGTH} characters is rejected`, shortPw.ok === false);

  const mismatch = validateComplete({ password: "longenough1", confirmPassword: "different1" }, "tok_123");
  check("mismatched passwords are rejected", mismatch.ok === false);
  check("mismatch is reported on the confirm field", mismatch.fieldErrors.confirmPassword !== undefined);

  const ok = validateComplete({ password: "longenough1", confirmPassword: "longenough1" }, "tok_123");
  check("a valid token and matching passwords pass", ok.ok === true);

  const payload = buildCompletePayload({ password: "longenough1", confirmPassword: "longenough1" }, "tok_123");
  check("the payload carries exactly token and password", JSON.stringify(Object.keys(payload).sort()) === '["password","token"]');
  check("the payload does not carry confirmPassword", !("confirmPassword" in payload));

  check("400 with a server message shows that message", mapCompleteError(400, "This link has expired.") === "This link has expired.");
  check("400 with no server message falls back", mapCompleteError(400).length > 0);
}

console.log("\n--- request-reset page is wired to the contract ---");
{
  check("the page imports the request contract", requestPageSrc.includes("./password-reset/passwordResetContract"));
  check("the page submits through the contract endpoint", requestPageSrc.includes("REQUEST_ENDPOINT"));
  check("the page validates before submitting", requestPageSrc.includes("validateRequest(form)"));
  check("an email input is present", requestPageSrc.includes('type="email"'));
  check("a link back to sign-in is present", requestPageSrc.includes("LOGIN_URL") && requestPageSrc.includes('const LOGIN_URL = "/login"'));
  check("no password field on the request page", !/type="password"/.test(requestPageSrc));
}

console.log("\n--- complete-reset page is wired to the contract ---");
{
  check("the page imports the complete contract", completePageSrc.includes("./password-reset/passwordResetContract"));
  check("the token is read from the query string, not typed", completePageSrc.includes("useSearchParams") && completePageSrc.includes('searchParams.get("token")'));
  check("two password fields are present (new + confirm)", (completePageSrc.match(/type="password"/g) ?? []).length === 2);
  check("both password fields use new-password autocomplete", (completePageSrc.match(/autoComplete="new-password"/g) ?? []).length === 2);
  check("the strength hint is shown", completePageSrc.includes("PASSWORD_STRENGTH_HINT"));
  check("submit is disabled without a token", completePageSrc.includes("disabled={submitting || !token}"));
  check("success links to sign-in rather than auto-navigating", completePageSrc.includes('href="/login"') && !completePageSrc.includes("navigate(") );
}

console.log("\n--- Login links here ---");
{
  check('a "Forgot password?" link is present on sign-in', /Forgot password/i.test(loginPageSrc));
  check("it points at the request-reset route", loginPageSrc.includes('href="/password-reset"') || loginPageSrc.includes('to="/password-reset"'));
}

console.log(
  failed === 0
    ? "\nAll passwordResetContract tests passed."
    : `\npasswordResetContract: ${failed} check(s) FAILED.`,
);
if (failed > 0) process.exit(1);
