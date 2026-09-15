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
  COMPLETE_FALLBACK_ERROR,
  COMPLETE_METHOD,
  COMPLETE_RATE_LIMITED,
  EMPTY_COMPLETE_FORM,
  EMPTY_REQUEST_FORM,
  ENTER_CODE_HREF,
  MIN_PASSWORD_LENGTH,
  REQUEST_CONFIRMATION,
  REQUEST_ENDPOINT,
  REQUEST_METHOD,
  REQUEST_UNAVAILABLE,
  buildCompletePayload,
  buildRequestPayload,
  mapCompleteError,
  mapRequestStatus,
  resolveResetToken,
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
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
// The server is the source of truth for both shapes; these checks read it so
// the page cannot drift from it again.
const serverSrc = read("artifacts/api-server/src/routes/receptionistAccount.ts");
function handlerBody(route: string): string {
  const start = serverSrc.indexOf(`router.post("${route}"`);
  if (start < 0) return "";
  const next = serverSrc.indexOf("router.", start + 10);
  return serverSrc.slice(start, next < 0 ? undefined : next);
}
const serverRequestHandler = handlerBody("/receptionist/account/password-reset/request");
const serverCompleteHandler = handlerBody("/receptionist/account/password-reset/complete");

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

  // The server answers a plain `res.json(...)` — 200, not the 202 the brief
  // named — and a page that only accepted 202 said "Something went wrong"
  // after every successful request.
  check("the server's request handler exists", serverRequestHandler.length > 0);
  check(
    "the server answers success with a plain 200 res.json",
    /res\.json\(\{ accepted: true/.test(serverRequestHandler) && !/res\.status\(202\)/.test(serverRequestHandler),
  );
  check("200 (what the server sends) maps to confirmed", mapRequestStatus(200) === "confirmed");
  check("202 maps to confirmed", mapRequestStatus(202) === "confirmed");
  check("204 maps to confirmed", mapRequestStatus(204) === "confirmed");
  check("503 maps to unavailable", mapRequestStatus(503) === "unavailable");
  check("any other status maps to error", [199, 300, 400, 429, 500].every((s) => mapRequestStatus(s) === "error"));

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
  check("a missing token is reported on the code field", validateComplete(EMPTY_COMPLETE_FORM, null).fieldErrors.token !== undefined);
  check(
    "an absurdly long code is rejected before it is sent",
    validateComplete({ code: "", password: "longenough1", confirmPassword: "longenough1" }, "x".repeat(201)).ok === false,
  );

  const shortPw = validateComplete({ code: "", password: "short1", confirmPassword: "short1" }, "tok_123");
  check(`a password under ${MIN_PASSWORD_LENGTH} characters is rejected`, shortPw.ok === false);

  const mismatch = validateComplete({ code: "", password: "longenough1", confirmPassword: "different1" }, "tok_123");
  check("mismatched passwords are rejected", mismatch.ok === false);
  check("mismatch is reported on the confirm field", mismatch.fieldErrors.confirmPassword !== undefined);

  const ok = validateComplete({ code: "", password: "longenough1", confirmPassword: "longenough1" }, "tok_123");
  check("a valid token and matching passwords pass", ok.ok === true);

  // The token comes from the link when there is one, otherwise from the code
  // the same email carries.
  check("the link's token wins when present", resolveResetToken("tok_from_link", "typed") === "tok_from_link");
  check("a typed code is used when the link has no token", resolveResetToken(null, "  typed_code  ") === "typed_code");
  check("a blank link token falls back to the typed code", resolveResetToken("   ", "typed_code") === "typed_code");
  check("nothing in either place is no token at all", resolveResetToken(null, "   ") === null);

  const payload = buildCompletePayload({ code: "", password: "longenough1", confirmPassword: "longenough1" }, " tok_123 ");
  // The server reads `body.token` and `body.newPassword`. The page used to send
  // `password`, which the server never read, so no reset could ever complete.
  check("the payload carries exactly token and newPassword", JSON.stringify(Object.keys(payload).sort()) === '["newPassword","token"]');
  check("the new password is carried under newPassword", payload.newPassword === "longenough1");
  check("the token is trimmed", payload.token === "tok_123");
  check("the payload does not carry confirmPassword or the raw form code", !("confirmPassword" in payload) && !("code" in payload));
  check("the server's complete handler exists", serverCompleteHandler.length > 0);
  check(
    "every key the payload sends is one the server reads",
    Object.keys(payload).every((key) => serverCompleteHandler.includes(`body.${key}`)),
  );

  check("a server message is shown as-is", mapCompleteError(401, "That code is invalid or expired.") === "That code is invalid or expired.");
  check("400 with a server message shows that message", mapCompleteError(400, "Password must be at least 8 characters.") === "Password must be at least 8 characters.");
  check("a wordless 401 falls back to the invalid-code sentence", mapCompleteError(401) === COMPLETE_FALLBACK_ERROR);
  check("a wordless 429 says to wait", mapCompleteError(429) === COMPLETE_RATE_LIMITED);
}

console.log("\n--- request-reset page is wired to the contract ---");
{
  check("the page imports the request contract", requestPageSrc.includes("./password-reset/passwordResetContract"));
  check("the page submits through the contract endpoint", requestPageSrc.includes("REQUEST_ENDPOINT"));
  check("the page validates before submitting", requestPageSrc.includes("validateRequest(form)"));
  check("an email input is present", requestPageSrc.includes('type="email"'));
  check("a link back to sign-in is present", requestPageSrc.includes("LOGIN_URL") && requestPageSrc.includes('const LOGIN_URL = "/login"'));
  check("no password field on the request page", !/type="password"/.test(requestPageSrc));
  check("the confirmation offers the code-entry page", requestPageSrc.includes("href={ENTER_CODE_HREF}"));
  check(
    "that is the complete-reset route",
    ENTER_CODE_HREF === "/password-reset/complete" && routesSrc.includes('passwordResetComplete: "/password-reset/complete"'),
  );
}

console.log("\n--- complete-reset page is wired to the contract ---");
{
  check("the page imports the complete contract", completePageSrc.includes("./password-reset/passwordResetContract"));
  check("the token is read from the query string", completePageSrc.includes("useSearchParams") && completePageSrc.includes('searchParams.get("token")'));
  check("a code field is offered when the link carries no token", completePageSrc.includes("{!hasLinkToken && (") && completePageSrc.includes('id="reset-code"'));
  check("the submitted token is resolved from the link or the typed code", completePageSrc.includes("resolveResetToken(urlToken, form.code)"));
  check("two password fields are present (new + confirm)", (completePageSrc.match(/type="password"/g) ?? []).length === 2);
  check("both password fields use new-password autocomplete", (completePageSrc.match(/autoComplete="new-password"/g) ?? []).length === 2);
  check("the strength hint is shown", completePageSrc.includes("PASSWORD_STRENGTH_HINT"));
  check("submit is not dead-ended by a link without a token", !completePageSrc.includes("|| !token}"));
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
