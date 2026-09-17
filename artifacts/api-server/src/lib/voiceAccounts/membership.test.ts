/**
 * Team access: invitations, member passwords, roles and revocation.
 *
 * The rules pinned here are the ones a real team depends on: an invitation
 * only ever activates the person it was sent to; a member signs in with their
 * own password; removing someone ends their sessions at once; and staff can
 * handle the day's work but cannot change how the business is set up.
 */

import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  acceptInvitation,
  changeMemberPassword,
  changeMemberRole,
  inviteMember,
  revokeMemberById,
} from "./membership.js";
import { inviteCodeIn, membershipFake } from "./membershipFake.js";
import { accessDecision, type ReceptionistPrincipal } from "../receptionistRoles.js";

const holder: ReceptionistPrincipal = { role: "owner", accountHolder: true, memberId: null };
const coOwner: ReceptionistPrincipal = { role: "owner", accountHolder: false, memberId: 3 };
const staff: ReceptionistPrincipal = { role: "staff", accountHolder: false, memberId: 4 };

describe("inviting", () => {
  it("validates the address and role, and refuses the account's own address", async () => {
    const f = membershipFake();
    expect(await inviteMember(7, "not-an-email", "staff", f.deps)).toEqual({ ok: false, reason: "invalid_email" });
    expect(await inviteMember(7, "a@b.co", "superuser", f.deps)).toEqual({ ok: false, reason: "invalid_role" });
    expect(await inviteMember(7, "Owner@Acme.example.com", "staff", f.deps)).toEqual({ ok: false, reason: "own_address" });
    expect(f.mail).toHaveLength(0);
  });

  it("bounds the roster at ten people who still have access", async () => {
    const f = membershipFake();
    for (let i = 0; i < 10; i++) expect((await inviteMember(7, `m${i}@x.co`, "staff", f.deps)).ok).toBe(true);
    expect(await inviteMember(7, "eleventh@x.co", "staff", f.deps)).toEqual({ ok: false, reason: "member_limit" });
    await revokeMemberById(7, f.roster[0]!.id, f.deps);
    expect((await inviteMember(7, "eleventh@x.co", "staff", f.deps)).ok).toBe(true);
  });

  it("refuses a duplicate, but lets a removed person be invited again with a fresh start", async () => {
    const f = membershipFake();
    await inviteMember(7, "sam@x.co", "owner", f.deps);
    expect(await inviteMember(7, "sam@x.co", "staff", f.deps)).toEqual({ ok: false, reason: "already_member" });
    await revokeMemberById(7, f.roster[0]!.id, f.deps);
    const again = await inviteMember(7, "sam@x.co", "staff", f.deps);
    expect(again.ok).toBe(true);
    expect(f.roster).toHaveLength(1);
    expect(f.roster[0]).toMatchObject({ status: "invited", role: "staff", passwordHash: null });
  });

  it("removes the roster row again when the email cannot be sent", async () => {
    const f = membershipFake({ sendOk: false });
    expect(await inviteMember(7, "sam@x.co", "staff", f.deps)).toEqual({ ok: false, reason: "delivery_unavailable" });
    expect(f.roster[0]?.status).toBe("revoked");
  });

  it("emails a link to the acceptance screen and the same code, naming the business and the role", async () => {
    const f = membershipFake({ env: { VOICE_DASHBOARD_BASE_URL: "https://sitemintdigital.com" } });
    await inviteMember(7, "Sam@X.co", "staff", f.deps);
    const { to, subject, text } = f.mail[0]!;
    expect(to).toBe("sam@x.co");
    expect(subject).toContain("Acme Plumbing");
    const code = inviteCodeIn(text)!;
    const link = /https:\/\/\S+/.exec(text)![0];
    expect(new URL(link).pathname).toBe("/ai-receptionist/dashboard/accept-invitation");
    expect(new URL(link).searchParams.get("token")).toBe(code);
    expect(text).toContain("As staff");
    expect(text).not.toMatch(/not available yet|label for now/);
  });
});

describe("accepting", () => {
  async function invited(email = "sam@x.co") {
    const f = membershipFake();
    await inviteMember(7, email, "staff", f.deps);
    return { f, code: inviteCodeIn(f.mail.at(-1)!.text)! };
  }

  it("activates the invited person with their own password, once", async () => {
    const { f, code } = await invited();
    expect(await acceptInvitation(code, "SAM@x.co", "correct horse", f.deps)).toEqual({ ok: true, firmId: 7, email: "sam@x.co" });
    const m = f.roster[0]!;
    expect(m.status).toBe("active");
    expect(m.inviteTokenHash).toBeNull();
    expect(await bcrypt.compare("correct horse", m.passwordHash!)).toBe(true);
    expect(await acceptInvitation(code, "sam@x.co", "correct horse", f.deps)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("a code cannot activate a different invitee, even in the same business", async () => {
    const f = membershipFake();
    await inviteMember(7, "alex@x.co", "owner", f.deps);
    await inviteMember(7, "sam@x.co", "staff", f.deps);
    const samsCode = inviteCodeIn(f.mail[1]!.text)!;
    expect(await acceptInvitation(samsCode, "alex@x.co", "takeover-pass", f.deps)).toEqual({ ok: false, reason: "no_invitation" });
    expect(f.roster.find((m) => m.email === "alex@x.co")).toMatchObject({ status: "invited", passwordHash: null });
  });

  it("a too-short password is refused before the code is spent", async () => {
    const { f, code } = await invited();
    expect(await acceptInvitation(code, "sam@x.co", "short", f.deps)).toEqual({ ok: false, reason: "weak_password" });
    expect((await acceptInvitation(code, "sam@x.co", "long enough", f.deps)).ok).toBe(true);
  });

  it("a code from a re-sent invitation replaces the old one", async () => {
    const f = membershipFake();
    await inviteMember(7, "sam@x.co", "staff", f.deps);
    const first = inviteCodeIn(f.mail[0]!.text)!;
    await revokeMemberById(7, f.roster[0]!.id, f.deps);
    await inviteMember(7, "sam@x.co", "staff", f.deps);
    const second = inviteCodeIn(f.mail[1]!.text)!;
    expect(await acceptInvitation(first, "sam@x.co", "long enough", f.deps)).toEqual({ ok: false, reason: "no_invitation" });
    // The first code was spent on the failed attempt; the second still works.
    expect((await acceptInvitation(second, "sam@x.co", "long enough", f.deps)).ok).toBe(true);
  });
});

describe("removing and changing roles", () => {
  async function activeTeam() {
    const f = membershipFake();
    for (const [email, role] of [["alex@x.co", "owner"], ["sam@x.co", "staff"]] as const) {
      await inviteMember(7, email, role, f.deps);
      await acceptInvitation(inviteCodeIn(f.mail.at(-1)!.text), email, "long enough", f.deps);
    }
    return f;
  }

  it("removal revokes, clears the password, and ends that person's sessions", async () => {
    const f = await activeTeam();
    const sam = f.roster.find((m) => m.email === "sam@x.co")!;
    expect(await revokeMemberById(7, sam.id, f.deps)).toEqual({ ok: true });
    expect(sam).toMatchObject({ status: "revoked", passwordHash: null });
    expect(f.endedSessions).toEqual([{ firmId: 7, email: "sam@x.co" }]);
  });

  it("another business's member id reads as not found", async () => {
    const f = await activeTeam();
    expect(await revokeMemberById(8, f.roster[0]!.id, f.deps)).toEqual({ ok: false, reason: "not_found" });
    expect(await changeMemberRole(8, f.roster[0]!.id, "staff", f.deps)).toEqual({ ok: false, reason: "not_found" });
    expect(f.endedSessions).toHaveLength(0);
  });

  it("nobody removes or demotes themselves", async () => {
    const f = await activeTeam();
    const alex = f.roster.find((m) => m.email === "alex@x.co")!;
    expect(await revokeMemberById(7, alex.id, f.deps, alex.id)).toEqual({ ok: false, reason: "self" });
    expect(await changeMemberRole(7, alex.id, "staff", f.deps, alex.id)).toEqual({ ok: false, reason: "self" });
    expect(alex).toMatchObject({ status: "active", role: "owner" });
  });

  it("an owner can change another member's role", async () => {
    const f = await activeTeam();
    const sam = f.roster.find((m) => m.email === "sam@x.co")!;
    const result = await changeMemberRole(7, sam.id, "owner", f.deps, f.roster[0]!.id);
    expect(result.ok && result.member.role).toBe("owner");
    expect(await changeMemberRole(7, sam.id, "admin", f.deps)).toEqual({ ok: false, reason: "invalid_role" });
  });

  it("a member changes their own password with the current one, and other sessions end", async () => {
    const f = await activeTeam();
    const sam = f.roster.find((m) => m.email === "sam@x.co")!;
    expect(await changeMemberPassword(7, sam.id, "wrong", "brand new pass", f.deps)).toEqual({ ok: false, reason: "wrong_password" });
    expect(await changeMemberPassword(7, sam.id, "long enough", "short", f.deps)).toEqual({ ok: false, reason: "weak_password" });
    expect(await changeMemberPassword(7, sam.id, "long enough", "brand new pass", f.deps)).toEqual({ ok: true });
    expect(await bcrypt.compare("brand new pass", sam.passwordHash!)).toBe(true);
    expect(f.endedSessions).toEqual([{ firmId: 7, email: "sam@x.co" }]);
  });
});

describe("what each role may do", () => {
  it("owners may do everything except change the account's own sign-in", () => {
    for (const p of [holder, coOwner]) {
      expect(accessDecision("POST", "/receptionist/voice/assistants/:id/publish", p)).toBe("allow");
      expect(accessDecision("POST", "/receptionist/account/members", p)).toBe("allow");
      expect(accessDecision("POST", "/receptionist/billing/create-checkout-session", p)).toBe("allow");
    }
    expect(accessDecision("PATCH", "/receptionist/account/email", holder)).toBe("allow");
    expect(accessDecision("PATCH", "/receptionist/account/email", coOwner)).toBe("account_holder_only");
    expect(accessDecision("POST", "/receptionist/account/password/change", coOwner)).toBe("account_holder_only");
  });

  it("staff read everything and handle the day's work", () => {
    expect(accessDecision("GET", "/receptionist/voice/calls", staff)).toBe("allow");
    expect(accessDecision("HEAD", "/receptionist/contacts", staff)).toBe("allow");
    for (const [method, path] of [
      ["PATCH", "/receptionist/voice/messages/:id"],
      ["POST", "/receptionist/contacts"],
      ["PATCH", "/receptionist/contacts/:id"],
      ["POST", "/receptionist/calendar/requests/:publicId/approve"],
      ["POST", "/receptionist/support/requests"],
      ["POST", "/receptionist/voice/assistants/:id/browser-test-session"],
    ] as const) {
      expect(accessDecision(method, path, staff), `${method} ${path}`).toBe("allow");
    }
  });

  it("staff cannot change setup, phone, calendar connection, team, billing or profile", () => {
    for (const [method, path] of [
      ["POST", "/receptionist/voice/assistants/:id/publish"],
      ["PATCH", "/receptionist/voice/assistants/:id"],
      ["POST", "/receptionist/voice/numbers/:id/assign"],
      ["PUT", "/receptionist/calendar/selection"],
      ["GET", "/receptionist/calendar/google/callback"],
      ["POST", "/receptionist/account/members"],
      ["DELETE", "/receptionist/account/members/:id"],
      ["POST", "/receptionist/billing/create-checkout-session"],
      ["PATCH", "/receptionist/account/profile"],
      ["PUT", "/receptionist/onboarding"],
      ["POST", "/receptionist/some/route-added-later"],
    ] as const) {
      expect(accessDecision(method, path, staff), `${method} ${path}`).toBe("owner_only");
    }
  });

  it("an unknown route shape lets only the account holder through", () => {
    expect(accessDecision("GET", undefined, holder)).toBe("allow");
    expect(accessDecision("GET", undefined, coOwner)).toBe("account_holder_only");
  });
});
