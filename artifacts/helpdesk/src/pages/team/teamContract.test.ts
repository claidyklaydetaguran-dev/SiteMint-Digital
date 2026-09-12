/**
 * Committed contract tests for the Team screen.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/team/teamContract.test.ts
 *
 * The premise: the invite / list / revoke endpoints have existed since P8 and
 * nothing in the dashboard called them, so the only way to give a colleague
 * access was to share the owner's password — which cannot be revoked without
 * locking the owner out, and leaves no record of who did what.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_INVITE_FORM,
  INVITE,
  PAGE,
  ROLE_DETAIL,
  ROLE_OPTIONS,
  ROSTER,
  STATUS_LABEL,
  canRemove,
  everyRenderableString,
  inviteErrorDetail,
  memberDate,
  roleLabel,
  statusLabel,
  statusTone,
  validateInvite,
  type TeamMember,
} from "./teamContract.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean): void {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}`); }
}
function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}
function section(name: string): void { console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`); }

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Team.tsx");
const apiSrc = read("artifacts/helpdesk/src/lib/accountApi.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const appSrc = read("artifacts/helpdesk/src/App.tsx");

section("the page is actually reachable");

check("a route exists", routesSrc.includes('team: "/account/team"'));
check("it is registered in the router", appSrc.includes("ROUTES.team") && appSrc.includes('import("@/pages/Team")'));
check("and it has a nav entry under Account", navSrc.includes('key: "team"') && navSrc.includes('href: "/account/team"'));

section("it calls the endpoints that already existed");

check("list", apiSrc.includes('MEMBERS_ENDPOINT = "/api/receptionist/account/members"') && apiSrc.includes("fetchTeamMembers"));
check("invite", apiSrc.includes("inviteTeamMember") && apiSrc.includes('method: "POST"'));
check("revoke", apiSrc.includes("removeTeamMember") && apiSrc.includes('method: "DELETE"'));
check("the page uses all three", ["fetchTeamMembers", "inviteTeamMember", "removeTeamMember"].every((fn) => pageSrc.includes(fn)));

section("an empty roster and a failed read are different facts");

// Showing the empty state for a failed read would tell a business nobody has
// access when the truth is that nobody knows.
check("the page tracks a load failure separately", pageSrc.includes("loadFailed"));
check("the empty state renders only when the list really came back empty",
  pageSrc.includes("members !== null && members.length === 0 && !loadFailed"));
check("a failed read offers a retry", pageSrc.includes("Try again"));

section("status says what is true of the person");

// "Invited" is not "has access", and that distinction is exactly what an owner
// needs when working out why a colleague cannot sign in.
eq("an invitation not yet used", statusLabel("invited"), "Invited, not signed in yet");
eq("someone who can sign in", statusLabel("active"), "Has access");
eq("someone removed", statusLabel("revoked"), "Access removed");
eq("an unrecognised status is not guessed", statusLabel("something_else"), "Unknown");
check("each status reads differently", new Set(Object.values(STATUS_LABEL)).size === 3);
eq("an unused invitation draws the eye", statusTone("invited"), "attention");
eq("a removed person does not", statusTone("revoked"), "muted");

section("who can be removed");

const member = (status: string): TeamMember => ({ id: 1, email: "a@b.co.uk", role: "staff", status, invitedAt: null, acceptedAt: null });
check("someone with access can be removed", canRemove(member("active")));
check("an unused invitation can be withdrawn", canRemove(member("invited")));
check("someone already removed cannot be removed again", !canRemove(member("revoked")));
check("the confirmation says access ends immediately", /immediately/i.test(ROSTER.removeConfirmDetail));
check("and that their work is not deleted", /nothing they did is deleted/i.test(ROSTER.removeConfirmDetail));

section("roles are described in terms a business uses");

eq("two roles, staff offered first", ROLE_OPTIONS.map((o) => o.value), ["staff", "owner"]);
check("owner includes billing and the team", /billing and the team/i.test(ROLE_DETAIL.owner ?? ""));
check("staff excludes them", /except billing and the team/i.test(ROLE_DETAIL.staff ?? ""));
eq("an unknown role is not guessed", roleLabel("superuser"), "Unknown role");
// The server enforces exactly one distinction; describing more would imply a
// permissions system that does not exist.
check("no role claims per-page permissions", Object.values(ROLE_DETAIL).every((d) => !/per-page|granular|permission level/i.test(d)));

section("inviting");

eq("a new form defaults to staff, not owner", EMPTY_INVITE_FORM.role, "staff");
check("an empty address is refused", validateInvite({ email: "  ", role: "staff" }).ok === false);
check("a malformed address is refused", validateInvite({ email: "nope", role: "staff" }).ok === false);
const valid = validateInvite({ email: "  Colleague@Business.CO.UK ", role: "owner" });
check("a valid address is accepted", valid.ok === true);
if (valid.ok) {
  eq("it is normalised", valid.payload.email, "colleague@business.co.uk");
  eq("the chosen role is carried", valid.payload.role, "owner");
}
check("the invite copy says the link is single-use", /works once/i.test(INVITE.detail));
check("and that it expires", /expires/i.test(INVITE.detail));
check("the sent copy does not claim they have access yet", /invited until they set their password/i.test(INVITE.sentDetail));

// The server knows the member limit and the roster; the browser does not.
eq("the server's own sentence is shown when it has one", inviteErrorDetail("Member limit reached."), "Member limit reached.");
check("a blank one falls back to something actionable", /try sending the invitation again/i.test(inviteErrorDetail("  ")));

section("dates");

eq("a missing date is not invented", memberDate(null), "—");
eq("nor an unparseable one", memberDate("not-a-date"), "—");
check("a real date is formatted", memberDate("2026-09-11T15:04:00.000Z") !== "—");

section("string surface");

const strings = everyRenderableString();
check("every renderable string is non-empty", strings.every((s) => typeof s === "string" && s.trim() !== ""));
check("the page title is present", strings.includes(PAGE.title));
// Nothing here may claim a capability the endpoints do not have.
check("nothing claims last-seen or activity per member", strings.every((s) => !/last seen|last active|activity log/i.test(s)));
check("the page explains why sharing a password is not the answer", /nobody needs to share yours/i.test(PAGE.detail));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Team contract tests passed.");
