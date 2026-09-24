/**
 * V5 customer-shell foundation — committed contract tests for the Settings
 * workspace (D-7: editable business profile + account password).
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Phase 11's suite asserted, at length, that this route had no settings
 * endpoint and no editable control — see this file's git history for that
 * premise. D-7 inverts it: `agent-config` now carries `timezone`,
 * `primaryContact` and `defaultLocation`, and a password-change endpoint
 * exists (or degrades honestly to "not available yet" via `accountApi.ts`
 * if it does not). This suite tests the new truth; the assertions that
 * remain valid regardless (logout contract, plan-label sharing with Billing,
 * member-since formatting, long-value handling) are carried over unchanged.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  accountFields,
  accountNote,
  buildProfilePatch,
  calendarBannerCopy,
  destinations,
  EMAIL_CHANGE,
  emailChangeDetail,
  isKnownPlan,
  memberSince,
  MIN_NEW_PASSWORD_LENGTH,
  NOT_AVAILABLE,
  planLabel,
  readCalendarParam,
  saveButtonLabel,
  sessionCopy,
  signOutLabel,
  SIGN_OUT_TIMEOUT_MS,
  validateEmailChange,
  validatePasswordChange,
  validateProfile,
  type AccountSource,
  type ProfileFormValues,
} from "./settingsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/settings → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Settings.tsx");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const accountApiSrc = read("artifacts/helpdesk/src/lib/accountApi.ts");

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}
function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}
function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

const firm = (over: Partial<AccountSource> = {}): AccountSource => ({
  name: "Northgate Plumbing",
  email: "owner@northgate.example",
  planTier: "trial",
  createdAt: "2026-06-01T09:00:00.000Z",
  ...over,
});

const validProfile: ProfileFormValues = {
  name: "Northgate Plumbing",
  industry: "Home Services",
  timezone: "America/Chicago",
  contactName: "Jamie Rivera",
  contactEmail: "jamie@northgate.example",
  defaultLocation: "123 Main St, Springfield",
};

// ─── Read-only account values (unchanged from Phase 11/12) ─────────────────

section("Account — verified session values only");

eq("a complete session renders all four labels in reading order", accountFields(firm()).map((f) => f.label), ["Business", "Email", "Plan", "Member since"]);
eq("the business name is the session's own", accountFields(firm())[0]?.value, "Northgate Plumbing");
eq("a null email renders the concise unavailable treatment, never a guess", accountFields(firm({ email: null }))[1]?.value, null);
eq("the unavailable treatment is stated once, plainly", NOT_AVAILABLE, "Not available");
eq("a blank plan omits the row entirely rather than inventing a tier", accountFields(firm({ planTier: "" })).map((f) => f.label), ["Business", "Email", "Member since"]);
eq("a paid plan reads as a neutral verified label", planLabel("paid"), "Paid plan");
eq("a trial plan reuses the shared verified label", planLabel("trial"), "Free Trial");
check("the plan label never names a product this repository does not have", !/pro|premium|enterprise|unlimited/i.test(planLabel("paid") ?? ""));
eq("an unrecognised plan is echoed verbatim, never renamed", planLabel("enterprise_legacy_2019"), "enterprise_legacy_2019");
check("only the two verified tiers are reported as known", isKnownPlan("paid") && isKnownPlan("trial") && !isKnownPlan("x"));
eq("member since uses the shared format", memberSince("2026-06-01T09:00:00.000Z"), new Date("2026-06-01T09:00:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
eq("an invalid createdAt yields no date", memberSince("tomorrow"), null);
check("the account note explains provenance, not a restriction", !/cannot|can't|unable|not allowed|locked/i.test(accountNote()));

// ─── D-7: editable business profile ────────────────────────────────────────

section("editable business profile (D-7)");

check("a blank business name is rejected", validateProfile({ ...validProfile, name: "   " }).ok === false);
check("every other field is optional", validateProfile({ ...validProfile, industry: "", timezone: "", contactName: "", contactEmail: "", defaultLocation: "" }).ok === true);
check("a complete form validates", validateProfile(validProfile).ok === true);
check("a mistyped contact email is caught before submit", validateProfile({ ...validProfile, contactEmail: "jamie at northgate" }).fieldErrors.contactEmail !== undefined);
check("an unusual but real contact email is not refused", validateProfile({ ...validProfile, contactEmail: "o'neil+ops@sub.example.co.uk" }).ok === true);

const patch = buildProfilePatch(validProfile);
// The primary contact and default location were once removed from this patch
// because nothing could store them — this test then pinned exactly three
// fields. They have storage now (voice migration 0011), so all five are sent,
// and the server's read-back is what the form displays afterwards.
eq("the patch carries every field the profile can store", Object.keys(patch).sort(), ["defaultLocation", "industry", "name", "primaryContact", "timezone"]);
eq("the contact is sent grouped, as the server reads it", patch.primaryContact, { name: "Jamie Rivera", email: "jamie@northgate.example" });
check("values are trimmed before submission", buildProfilePatch({ ...validProfile, name: "  Padded Co  " }).name === "Padded Co");
eq("an emptied location is sent as empty, which the server stores as not set", buildProfilePatch({ ...validProfile, defaultLocation: "   " }).defaultLocation, "");

eq("the save button reads 'Save changes' while idle", saveButtonLabel("idle"), "Save changes");
eq("the save button announces the in-flight state", saveButtonLabel("saving"), "Saving…");
eq("the save button confirms success", saveButtonLabel("saved"), "Saved");

// The profile has its own endpoint. It is NOT agent-config: that route is the
// SMS agent's configuration (greeting, description, qualifying questions) and
// rejects every profile field.
check(
  "the client posts the profile to its own account endpoint",
  accountApiSrc.includes('PROFILE_ENDPOINT = "/receptionist/account/profile"'),
);
check(
  "the profile write no longer targets agent-config",
  !/updateAccountProfile[\s\S]{0,200}agent-config/.test(accountApiSrc),
);

check("the page reads the business profile to populate the form", pageSrc.includes("fetchBusinessProfile()"));
check("the page writes through updateAccountProfile, not a hand-rolled request", pageSrc.includes("updateAccountProfile(buildProfilePatch(profile))"));
check("saving invalidates the shared agent-config cache entry", pageSrc.includes('queryKey: ["agent-config"]'));
check("business name is required in the UI", pageSrc.includes('id="settings-name"') && pageSrc.includes('htmlFor="settings-name"'));
check(
  "every storable field is present, including the contact and location that now have storage",
  ["settings-name", "settings-industry", "settings-timezone", "settings-contact-name", "settings-contact-email", "settings-location"].every((id) =>
    pageSrc.includes(`id="${id}"`),
  ),
);
check(
  "after saving, the form shows what the server stored rather than what was typed",
  pageSrc.includes("readBusinessProfile(await updateAccountProfile(buildProfilePatch(profile)))"),
);
check("a contact email error is shown beside its field", pageSrc.includes("contactEmailError &&") && pageSrc.includes('aria-describedby="settings-contact-email-help"'));
check(
  "saving refreshes the timezone's real home and the setup step that reads these fields",
  pageSrc.includes('queryKey: ["availability"]') && pageSrc.includes('queryKey: ["setup"]'),
);

// ─── S-2: change password ────────────────────────────────────────────────

section("change password (S-2)");

check("a blank current password is rejected", validatePasswordChange({ currentPassword: "", newPassword: "longenough1", confirmPassword: "longenough1" }).ok === false);
check(`a new password under ${MIN_NEW_PASSWORD_LENGTH} characters is rejected`, validatePasswordChange({ currentPassword: "x", newPassword: "short", confirmPassword: "short" }).ok === false);
check("mismatched new passwords are rejected", validatePasswordChange({ currentPassword: "x", newPassword: "longenough1", confirmPassword: "different1" }).ok === false);
check("a valid change passes", validatePasswordChange({ currentPassword: "x", newPassword: "longenough1", confirmPassword: "longenough1" }).ok === true);

eq("the change-password endpoint is the documented one", /PASSWORD_CHANGE_ENDPOINT = "([^"]+)"/.exec(accountApiSrc)?.[1], "/api/receptionist/account/password/change");
check("a 404 from that endpoint reads as 'not available yet', never as a password error", accountApiSrc.includes('"unavailable"') && accountApiSrc.includes("res.status === 404"));
check("the page shows that unavailable copy rather than a generic error when the route is missing", pageSrc.includes('pwState === "unavailable"'));
check("the page submits current and new password only, via changePassword", pageSrc.includes("changePassword(pwForm.currentPassword, pwForm.newPassword)"));
check("both new-password fields use new-password autocomplete", (pageSrc.match(/id="pw-(new|confirm)"[\s\S]{0,200}?autoComplete="new-password"/g) ?? []).length === 2);
check("the current-password field uses current-password autocomplete", /id="pw-current"[\s\S]{0,200}?autoComplete="current-password"/.test(pageSrc));

// ─── Calendar banner (D-7 / B-4: reads ?calendar=) ─────────────────────────

section("calendar connection banner");

eq("connected reads as connected", readCalendarParam("connected"), "connected");
eq("error reads as error", readCalendarParam("error"), "error");
eq("anything else (including absent) reads as no banner", readCalendarParam(null), null);
eq("anything else (including absent) reads as no banner", readCalendarParam("bogus"), null);
check("the connected banner is success-toned and names the feature", calendarBannerCopy("connected").tone === "success" && /calendar/i.test(calendarBannerCopy("connected").title));
check("the error banner explains what to do next", calendarBannerCopy("error").detail.length > 0);
check("the page reads the calendar query param", pageSrc.includes('searchParams.get("calendar")'));
check("the banner links back to Scheduling → Calendar", pageSrc.includes('href="/scheduling/calendar"'));

// ─── Session / logout (unchanged) ──────────────────────────────────────────

section("session and logout — unchanged");

check("the existing logout contract is unchanged", sessionSrc.includes('await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" })') && sessionSrc.includes("qc.clear()"));
check("the page still reads the shared session hook", pageSrc.includes("useSession") && pageSrc.includes('from "@/hooks/useSession"'));
check("logout goes through the existing hook, not a hand-rolled request to that endpoint", pageSrc.includes("useLogout") && !pageSrc.includes('"/api/receptionist/auth/logout"'));
check(
  // D-7 added a second timer — the "Saved" confirmation reverting to idle —
  // alongside the pre-existing logout-wait bound. Both are bounded,
  // self-clearing UI timers, not polling.
  "exactly two bounded timers exist: the logout-wait bound and the save-confirmation reset",
  (pageSrc.match(/setTimeout\(/g) ?? []).length === 2 && pageSrc.includes("SIGN_OUT_TIMEOUT_MS"),
);
eq("session copy is unchanged", sessionCopy().idleLabel, "Sign out");
eq("sign-out label tracks state", signOutLabel("pending"), "Signing out…");
check("no Authorization/Bearer header is constructed — the two auth systems stay separate", !/Authorization|Bearer|localStorage/.test(pageSrc));
check("no firm identifier is sent from the client — scoping stays server-side", !/firmId\s*[:=]|firm_id/.test(pageSrc));
eq("the sign-out timeout is unchanged", SIGN_OUT_TIMEOUT_MS, 10_000);

// ─── Configuration destinations ────────────────────────────────────────────

section("configuration destinations");

eq("destinations include Receptionist, Assistant and Billing, at their 2026-09 owner replan D-2 paths", destinations().map((d) => d.href), ["/channels/sms", "/assistants", "/account/billing"]);
check("every destination is a real Link, not a button standing in for one", pageSrc.includes("sg-place__action"));

section("changing the sign-in / notification address");

// Why this section exists: the address is the login identity AND the only
// destination for every message the product sends, and there was no way to
// change it. Staging proved the cost — its address ends in `.invalid`, which
// can never receive mail, so the account was permanently unreachable with no
// route out from inside the product.

check("the page has an email-change form", pageSrc.includes("handleEmailSubmit") && pageSrc.includes('id="em-new"'));
check("it asks for the current password", pageSrc.includes('id="em-pw"') && pageSrc.includes('autoComplete="current-password"'));
check("it points at the page that finishes the job", pageSrc.includes("EMAIL_CHANGE.verifyHref"));
eq("which is the verify-email route", EMAIL_CHANGE.verifyHref, "/verify-email");

check("the client sends a PATCH to the account email endpoint", accountApiSrc.includes('EMAIL_CHANGE_ENDPOINT = "/api/receptionist/account/email"') && accountApiSrc.includes('method: "PATCH"'));

// The two outcomes are different facts and the page must not merge them:
// "changed" without "code sent" leaves a business waiting for mail that is
// not coming.
check("the success copy distinguishes code-sent from code-not-sent", emailChangeDetail(true) !== emailChangeDetail(false));
check("the not-sent copy says what to do next", /verify email/i.test(emailChangeDetail(false)));

eq("a valid address and password are accepted", validateEmailChange({ email: " Owner@Business.CO.UK ", currentPassword: "pw" }), {
  ok: true,
  payload: { email: "owner@business.co.uk", currentPassword: "pw" },
});
check("an empty address is refused", validateEmailChange({ email: "", currentPassword: "pw" }).ok === false);
check("a missing password is refused", validateEmailChange({ email: "a@b.co.uk", currentPassword: "" }).ok === false);
check("a malformed address is refused", validateEmailChange({ email: "owner@", currentPassword: "pw" }).ok === false);

// The exact shape staging was stuck in. Accepting it would look like a fix and
// leave the account just as unreachable.
for (const undeliverable of ["owner@staging.sitemint.invalid", "owner@my.test", "owner@x.example"]) {
  const result = validateEmailChange({ email: undeliverable, currentPassword: "pw" });
  check(`${undeliverable} is refused as undeliverable`, result.ok === false);
  // These pass every shape check, so "invalid address" would read as a bug in
  // the form rather than as a fact about the domain.
  if (!result.ok) check(`${undeliverable} is explained, not just rejected`, /never receive mail/i.test(result.errors.email ?? ""));
}
// `owner@localhost` has no dot, so the shape check catches it first. Still
// refused — just with the ordinary message, which is the honest one for it.
check("owner@localhost is refused", validateEmailChange({ email: "owner@localhost", currentPassword: "pw" }).ok === false);
check("a real domain that merely resembles one is accepted", validateEmailChange({ email: "owner@invalid-name.co.uk", currentPassword: "pw" }).ok === true);


console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Settings (D-7) contract tests passed.");
