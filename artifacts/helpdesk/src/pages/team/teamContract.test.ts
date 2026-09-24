/**
 * Committed contract tests for the Team screen.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/team/teamContract.test.ts
 *
 * The premise (2026-09-17, team access approved): invited people accept by
 * choosing their own password, sign in with it, and are held to their role on
 * every request; removal signs them out. The page must say exactly that, and
 * offer staff nothing the server would refuse.
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
  TEAM_SIGN_IN_AVAILABLE,
  canChangeRole,
  canRemove,
  everyRenderableString,
  inviteErrorDetail,
  memberDate,
  roleLabel,
  statusLabel,
  statusTone,
  validateInvite,
  validateOwnPassword,
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
const membershipSrc = read("artifacts/api-server/src/lib/voiceAccounts/membership.ts");
const linksSrc = read("artifacts/api-server/src/lib/accountSecurity/accountEmailLinks.ts");
const rolesSrc = read("artifacts/api-server/src/lib/receptionistRoles.ts");
const authSrc = read("artifacts/api-server/src/lib/receptionistAuth.ts");
const acceptSrc = read("artifacts/helpdesk/src/pages/AcceptInvitation.tsx");

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

eq("an invitation not yet used", statusLabel("invited"), "Invited — hasn't accepted yet");
eq("an accepted invitation can sign in", statusLabel("active"), "Can sign in");
eq("someone removed", statusLabel("revoked"), "Removed");
eq("an unrecognised status is not guessed", statusLabel("something_else"), "Unknown");
check("each status reads differently", new Set(Object.values(STATUS_LABEL)).size === 3);
eq("an unused invitation draws the eye", statusTone("invited"), "attention");
eq("a removed person does not", statusTone("revoked"), "muted");

section("who can change whom");

const member = (status: string, isYou = false): TeamMember => ({ id: 1, email: "a@b.co.uk", role: "staff", status, invitedAt: null, acceptedAt: null, isYou });
check("an owner can remove someone with access", canRemove(member("active"), true));
check("an owner can withdraw an unused invitation", canRemove(member("invited"), true));
check("nobody removes a row already removed", !canRemove(member("revoked"), true));
check("nobody removes themselves", !canRemove(member("active", true), true));
check("staff remove nobody", !canRemove(member("active"), false));
check("an owner can change another person's role", canChangeRole(member("active"), true));
check("but not their own", !canChangeRole(member("active", true), true));
check("staff change no roles", !canChangeRole(member("active"), false));
check("removal says they are signed out straight away", /signed out straight away/i.test(ROSTER.removeConfirmDetail));
check("the page hides invite controls from staff", pageSrc.includes("{viewer.isOwner && (") && pageSrc.includes("useViewer()"));
check("members get their own password form; the main account uses Settings", pageSrc.includes("{!viewer.accountHolder && <OwnPasswordSection />}"));
check("it calls the member password endpoint", pageSrc.includes("changeOwnMemberPassword") && apiSrc.includes('MEMBER_PASSWORD_ENDPOINT = "/api/receptionist/account/member-password"'));
check("roles are changed with PATCH", apiSrc.includes("changeTeamMemberRole") && apiSrc.includes('method: "PATCH"'));

section("roles describe what the server enforces");

eq("two roles, staff offered first", ROLE_OPTIONS.map((o) => o.value), ["staff", "owner"]);
check("staff are told they can't change settings", /can't change settings/i.test(ROLE_DETAIL.staff!));
check("owners are told they manage team and billing", /team and billing/i.test(ROLE_DETAIL.owner!));
check("the server really enforces roles", rolesSrc.includes("export function accessDecision") && authSrc.includes("accessDecision(req.method"));
check(
  "staff writes the copy promises are on the server's allow-list",
  [
    "PATCH /receptionist/voice/messages/:id",
    "POST /receptionist/contacts",
    "POST /receptionist/calendar/requests/:publicId/approve",
    "POST /receptionist/support/requests",
  ].every((k) => rolesSrc.includes(`"${k}"`)),
);
eq("an unknown role is not guessed", roleLabel("superuser"), "Unknown role");
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
check("the invite copy says how long the link lasts", /seven days/i.test(INVITE.detail));
check("and that they choose their own password", /choose their own password/i.test(INVITE.detail));
check("the invitation email links to the acceptance screen", membershipSrc.includes("invitationEmailText") && linksSrc.includes('acceptInvitation: "/accept-invitation"'));
check("and no longer says sign-in is unavailable", !/not available yet/.test(membershipSrc + linksSrc));
eq("the server's own sentence is shown when it has one", inviteErrorDetail("Member limit reached."), "Member limit reached.");
check("a blank one falls back to something actionable", /try sending the invitation again/i.test(inviteErrorDetail("  ")));

section("own password");

check("a missing current password is refused", !validateOwnPassword("", "long enough").ok);
check("a short new one is refused", !validateOwnPassword("old", "short").ok);
check("a valid pair passes", validateOwnPassword("old", "long enough").ok);

section("accepting an invitation");

check("an accept route exists", routesSrc.includes('acceptInvitation: "/accept-invitation"'));
check("it renders outside the dashboard shell", appSrc.includes("ROUTES.acceptInvitation") && appSrc.includes('import("@/pages/AcceptInvitation")'));
check("the screen reads the link's token and sets a password", acceptSrc.includes('searchParams.get("token")') && acceptSrc.includes("acceptTeamInvitation"));

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
eq("team sign-in is recorded as available", TEAM_SIGN_IN_AVAILABLE, true);
check("nothing still says team members cannot sign in", strings.every((x) => !/cannot sign in|labels for now/i.test(x)));

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Team contract tests passed.");
