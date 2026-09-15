// One-click links in the account emails.
//
// The failure these guard against: a customer asked for a password reset and
// received a bare code, while the reset page could only read a `?token=` it was
// never given. The link fixes that — but it carries a single-use credential, so
// the other half of the property matters as much: it is never relative, never
// localhost, never plain http, and the code is still in the email when there is
// no safe link to send.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  ACCOUNT_LINK_PATHS,
  DASHBOARD_MOUNT_PATH,
  accountEmailLink,
  passwordResetEmailText,
  publicDashboardBase,
  verificationEmailText,
} from "./accountEmailLinks.js";
import {
  hashToken,
  requestEmailVerification,
  requestPasswordReset,
  type AccountTokenDeps,
  type EmailVerificationDeps,
  type PasswordResetDeps,
} from "./accountTokens.js";
import { changeAccountEmail, type EmailChangeDeps } from "./emailChange.js";
import { inviteMember, type MembershipDeps } from "../voiceAccounts/membership.js";
import type { VoiceFirmMember } from "@workspace/db/schema/voice";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

const PUBLIC = { VOICE_DASHBOARD_BASE_URL: "https://sitemintdigital.com" };
const NO_BASE: Record<string, string | undefined> = {};

interface Mail { to: string; subject: string; text: string }

function tokenStore() {
  const rows: Array<{ purpose: string; tokenHash: string }> = [];
  const deps: AccountTokenDeps = {
    insertToken: async (row) => {
      rows.push({ purpose: String(row.purpose), tokenHash: row.tokenHash });
    },
    consumeToken: async () => undefined,
  };
  return { rows, deps };
}

function resetHarness(env: Record<string, string | undefined>) {
  const mail: Mail[] = [];
  const tokens = tokenStore();
  const deps: PasswordResetDeps = {
    tokens: tokens.deps,
    findFirmByEmail: async () => ({ id: 7, email: "owner@business.co.uk" }),
    updatePasswordHash: async () => {},
    revokeSessions: async () => {},
    sendEmail: async (to, subject, text) => {
      mail.push({ to, subject, text });
      return { ok: true };
    },
    recordAudit: async () => {},
    env,
  };
  return { deps, mail, tokens };
}

const codeIn = (text: string, window: string) => new RegExp(`valid ${window}\\): (\\S+)`).exec(text)?.[1];
const linkIn = (text: string) => /(https:\/\/\S+)/.exec(text)?.[1];

describe("the public base a token link may be built on", () => {
  it("accepts a public https origin and strips trailing slashes and whitespace", () => {
    expect(publicDashboardBase({ VOICE_DASHBOARD_BASE_URL: "https://sitemintdigital.com/" })).toBe("https://sitemintdigital.com");
    expect(publicDashboardBase({ VOICE_DASHBOARD_BASE_URL: "  https://sitemintdigital.com//  " })).toBe("https://sitemintdigital.com");
  });

  it("builds no link at all without a safe public origin", () => {
    const refused = [
      undefined,
      "",
      "   ",
      "/ai-receptionist/dashboard", // relative — opens nothing from an inbox
      "sitemintdigital.com", // no scheme
      "http://sitemintdigital.com", // a token in cleartext
      "https://localhost:21622",
      "https://dashboard.localhost",
      "https://127.0.0.1:8080",
      "https://[::1]:8080",
      "https://0.0.0.0",
      "https://user:secret@sitemintdigital.com",
      "https://sitemintdigital.com/?ref=email",
      "https://sitemintdigital.com/#top",
      "javascript:alert(1)",
    ];
    for (const value of refused) {
      const env = value === undefined ? {} : { VOICE_DASHBOARD_BASE_URL: value };
      expect(publicDashboardBase(env), String(value)).toBeNull();
      expect(accountEmailLink("passwordResetComplete", "t".repeat(43), env), String(value)).toBeNull();
    }
  });
});

describe("the link itself", () => {
  it("points at the dashboard route that reads the token", () => {
    expect(accountEmailLink("passwordResetComplete", "abc_DEF-123", PUBLIC)).toBe(
      "https://sitemintdigital.com/ai-receptionist/dashboard/password-reset/complete?token=abc_DEF-123",
    );
    expect(accountEmailLink("verifyEmail", "abc_DEF-123", PUBLIC)).toBe(
      "https://sitemintdigital.com/ai-receptionist/dashboard/verify-email?token=abc_DEF-123",
    );
  });

  it("URL-encodes the token", () => {
    expect(accountEmailLink("verifyEmail", "a+b/c=d&e", PUBLIC)).toBe(
      "https://sitemintdigital.com/ai-receptionist/dashboard/verify-email?token=a%2Bb%2Fc%3Dd%26e",
    );
  });

  it("uses the dashboard's real routes and mount path", () => {
    const routes = read("artifacts/helpdesk/src/lib/routes.ts");
    expect(routes).toContain(`verifyEmail: "${ACCOUNT_LINK_PATHS.verifyEmail}"`);
    expect(routes).toContain(`passwordResetComplete: "${ACCOUNT_LINK_PATHS.passwordResetComplete}"`);
    // Same prefix the post-call email's dashboard link already uses.
    expect(read("artifacts/api-server/src/lib/voiceNotifications/notificationOutbox.ts")).toContain(`${DASHBOARD_MOUNT_PATH}/calls/`);
    // And both pages actually read ?token=.
    expect(read("artifacts/helpdesk/src/pages/PasswordResetComplete.tsx")).toContain('searchParams.get("token")');
    expect(read("artifacts/helpdesk/src/pages/VerifyEmail.tsx")).toContain('searchParams.get("token")');
  });

  it("has no invitation link, because there is no screen that accepts one", () => {
    expect(Object.keys(ACCOUNT_LINK_PATHS).sort()).toEqual(["passwordResetComplete", "verifyEmail"]);
  });
});

describe("email bodies", () => {
  it("a reset email carries the link AND the code, and they are the same token", () => {
    const text = passwordResetEmailText("tok_reset_1234567890", PUBLIC);
    expect(codeIn(text, "30 minutes")).toBe("tok_reset_1234567890");
    expect(new URL(linkIn(text) as string).searchParams.get("token")).toBe("tok_reset_1234567890");
  });

  it("without a safe base, a reset email is code-only and has no link of any kind", () => {
    for (const env of [NO_BASE, { VOICE_DASHBOARD_BASE_URL: "http://localhost:21622" }]) {
      const text = passwordResetEmailText("tok_reset_1234567890", env);
      expect(codeIn(text, "30 minutes")).toBe("tok_reset_1234567890");
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toContain("/ai-receptionist");
      expect(text).not.toContain("token=");
    }
  });

  it("a verification email carries the link AND the code; without a base, only the code", () => {
    const linked = verificationEmailText("tok_verify_1234567890", PUBLIC);
    expect(codeIn(linked, "24 hours")).toBe("tok_verify_1234567890");
    expect(linkIn(linked)).toBe("https://sitemintdigital.com/ai-receptionist/dashboard/verify-email?token=tok_verify_1234567890");

    const plain = verificationEmailText("tok_verify_1234567890", NO_BASE);
    expect(codeIn(plain, "24 hours")).toBe("tok_verify_1234567890");
    expect(plain).not.toMatch(/https?:\/\/|\/ai-receptionist|token=/);
  });
});

describe("the flows send what they minted", () => {
  it("password reset: the link's token is the stored token's preimage", async () => {
    const h = resetHarness(PUBLIC);
    expect(await requestPasswordReset("owner@business.co.uk", h.deps)).toEqual({ accepted: true });
    const text = h.mail[0]?.text ?? "";
    const code = codeIn(text, "30 minutes") as string;
    const link = linkIn(text) as string;
    expect(new URL(link).pathname).toBe("/ai-receptionist/dashboard/password-reset/complete");
    expect(new URL(link).searchParams.get("token")).toBe(code);
    expect(h.tokens.rows[0]?.tokenHash).toBe(hashToken(code));
  });

  it("password reset without configuration still sends a usable code", async () => {
    const h = resetHarness(NO_BASE);
    await requestPasswordReset("owner@business.co.uk", h.deps);
    const text = h.mail[0]?.text ?? "";
    expect(h.tokens.rows[0]?.tokenHash).toBe(hashToken(codeIn(text, "30 minutes") as string));
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("email verification links to /verify-email with the minted token", async () => {
    const mail: Mail[] = [];
    const tokens = tokenStore();
    const deps: EmailVerificationDeps = {
      tokens: tokens.deps,
      findFirmEmail: async () => "owner@business.co.uk",
      markVerified: async () => {},
      sendEmail: async (to, subject, text) => {
        mail.push({ to, subject, text });
        return { ok: true };
      },
      recordAudit: async () => {},
      env: PUBLIC,
    };
    expect(await requestEmailVerification(7, deps)).toEqual({ sent: true });
    const link = new URL(linkIn(mail[0]?.text ?? "") as string);
    expect(link.pathname).toBe("/ai-receptionist/dashboard/verify-email");
    expect(tokens.rows[0]?.tokenHash).toBe(hashToken(link.searchParams.get("token") as string));
  });

  it("an address change sends the verification link to the NEW address only", async () => {
    const mail: Mail[] = [];
    const deps: EmailChangeDeps = {
      loadFirm: async () => ({ email: "owner@oldbusiness.co.uk", passwordHash: "hash-of-correct-horse" }),
      verifyPassword: async (password, hash) => hash === `hash-of-${password}`,
      findFirmIdByEmail: async () => undefined,
      updateEmail: async () => {},
      clearVerification: async () => {},
      sendEmail: async (to, subject, text) => {
        mail.push({ to, subject, text });
        return { ok: true };
      },
      issueToken: async () => ({ rawToken: "RAW-TOKEN-VALUE-0123456789" }),
      recordAudit: async () => {},
      env: PUBLIC,
    };
    const result = await changeAccountEmail(7, { newEmail: "owner@newbusiness.co.uk", currentPassword: "correct-horse" }, deps);
    expect(result).toEqual({ ok: true, email: "owner@newbusiness.co.uk", verificationSent: true });
    const toNew = mail.find((m) => m.to === "owner@newbusiness.co.uk");
    const toOld = mail.find((m) => m.to === "owner@oldbusiness.co.uk");
    expect(linkIn(toNew?.text ?? "")).toBe(
      "https://sitemintdigital.com/ai-receptionist/dashboard/verify-email?token=RAW-TOKEN-VALUE-0123456789",
    );
    expect(toOld?.text ?? "").not.toContain("token=");
    expect(toOld?.text ?? "").not.toContain("RAW-TOKEN-VALUE");
  });

  it("an invitation promises nothing that does not exist: no link, and says sign-in is unavailable", async () => {
    const mail: Mail[] = [];
    const now = new Date("2026-09-16T12:00:00.000Z");
    const deps: MembershipDeps = {
      tokens: tokenStore().deps,
      listMembers: async () => [],
      insertMember: async (row) =>
        ({ id: 1, ...row, status: "invited", invitedAt: now, acceptedAt: null, revokedAt: null, createdAt: now, updatedAt: now }) as unknown as VoiceFirmMember,
      activateMember: async () => true,
      revokeMember: async () => true,
      sendEmail: async (to, subject, text) => {
        mail.push({ to, subject, text });
        return { ok: true };
      },
      recordAudit: async () => {},
      now: () => now,
    };
    const previous = process.env.VOICE_DASHBOARD_BASE_URL;
    process.env.VOICE_DASHBOARD_BASE_URL = PUBLIC.VOICE_DASHBOARD_BASE_URL;
    try {
      expect((await inviteMember(7, "colleague@business.co.uk", "staff", deps)).ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.VOICE_DASHBOARD_BASE_URL;
      else process.env.VOICE_DASHBOARD_BASE_URL = previous;
    }
    const text = mail[0]?.text ?? "";
    expect(text).not.toMatch(/https?:\/\/|token=/);
    expect(text).toContain("Team sign-in is not available yet");
    expect(text).not.toMatch(/accept it|set (your|their) (own )?password/i);
    expect(/code \(valid 7 days\): (\S+)/.exec(text)?.[1]).toBeTruthy();
  });

  it("never writes a token or its link to a logger", async () => {
    const logged: unknown[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      }),
    );
    const h = resetHarness(PUBLIC);
    try {
      await requestPasswordReset("owner@business.co.uk", h.deps);
    } finally {
      for (const s of spies) s.mockRestore();
    }
    const code = codeIn(h.mail[0]?.text ?? "", "30 minutes") as string;
    expect(code).toBeTruthy();
    expect(JSON.stringify(logged)).not.toContain(code);
  });
});
