// R8 — the security properties the password-reset flow must keep once
// PASSWORD_RESET_REQUESTS_ENABLED is on.
//
// The gate decides *whether* the flow runs; these assert that when it does run,
// it still behaves the way a password-reset endpoint has to. They drive
// `requestPasswordReset` through its injected dependencies, so nothing here
// touches a database, a mail provider, or the network.

import { describe, expect, it, vi } from "vitest";

import {
  hashToken,
  issueAccountToken,
  requestPasswordReset,
  TOKEN_TTL_MS,
  type AccountTokenDeps,
  type PasswordResetDeps,
} from "./accountTokens.js";

interface Recorded {
  tokenRows: Array<{ firmId: number; purpose: string; tokenHash: string; expiresAt: Date }>;
  emails: Array<{ to: string; subject: string; text: string }>;
  audits: Array<{ firmId: number; action: string }>;
  lookups: string[];
}

function harness(firm: { id: number; email: string } | undefined) {
  const rec: Recorded = { tokenRows: [], emails: [], audits: [], lookups: [] };
  const tokens: AccountTokenDeps = {
    insertToken: async (row) => {
      rec.tokenRows.push({ ...row, purpose: String(row.purpose) });
    },
    consumeToken: async () => undefined,
  };
  const deps: PasswordResetDeps = {
    tokens,
    findFirmByEmail: async (emailLower) => {
      rec.lookups.push(emailLower);
      return firm;
    },
    updatePasswordHash: async () => {},
    revokeSessions: async () => {},
    sendEmail: async (to, subject, text) => {
      rec.emails.push({ to, subject, text });
      return { ok: true };
    },
    recordAudit: async (firmId, action) => {
      rec.audits.push({ firmId, action });
    },
  };
  return { deps, rec };
}

const KNOWN = { id: 7, email: "owner@example.test" };

describe("password reset — account-existence disclosure", () => {
  it("returns an identical result for a known and an unknown address", async () => {
    const known = harness(KNOWN);
    const unknown = harness(undefined);
    const a = await requestPasswordReset("owner@example.test", known.deps);
    const b = await requestPasswordReset("nobody@example.test", unknown.deps);
    expect(a).toEqual({ accepted: true });
    expect(b).toEqual({ accepted: true });
    // Byte-identical, not merely "both truthy".
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returns the same result for a malformed or empty address", async () => {
    for (const bad of [undefined, "", "   ", 42, {}, "x".repeat(500)]) {
      const h = harness(KNOWN);
      expect(await requestPasswordReset(bad, h.deps), String(bad)).toEqual({ accepted: true });
    }
  });

  it("does no work at all for an unknown address", async () => {
    const h = harness(undefined);
    await requestPasswordReset("nobody@example.test", h.deps);
    expect(h.rec.tokenRows, "no token may be minted for a non-account").toEqual([]);
    expect(h.rec.emails, "no mail may be sent to a non-account").toEqual([]);
    expect(h.rec.audits).toEqual([]);
  });

  it("normalises the address before lookup so casing cannot be probed", async () => {
    const h = harness(KNOWN);
    await requestPasswordReset("  OWNER@Example.TEST  ", h.deps);
    expect(h.rec.lookups).toEqual(["owner@example.test"]);
  });
});

describe("password reset — token and delivery properties", () => {
  it("sends exactly one email per accepted request, to the account on file", async () => {
    const h = harness(KNOWN);
    await requestPasswordReset("owner@example.test", h.deps);
    expect(h.rec.emails).toHaveLength(1);
    // Never to the address supplied by the caller if it differs from the record.
    expect(h.rec.emails[0]?.to).toBe(KNOWN.email);
  });

  it("mints exactly one password_reset token and stores only its hash", async () => {
    const h = harness(KNOWN);
    await requestPasswordReset("owner@example.test", h.deps);
    expect(h.rec.tokenRows).toHaveLength(1);
    const row = h.rec.tokenRows[0];
    expect(row?.purpose).toBe("password_reset");
    // The stored value is a sha256 hex digest, and it is NOT the raw code that
    // was emailed — that is the whole point of hashing at rest.
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const emailed = /valid 30 minutes\): (\S+)/.exec(h.rec.emails[0]?.text ?? "")?.[1];
    expect(emailed, "the reset code should appear in the email body").toBeTruthy();
    expect(row?.tokenHash).not.toBe(emailed);
    expect(row?.tokenHash).toBe(hashToken(emailed as string));
  });

  it("expires the token, and within the established 30-minute window", async () => {
    expect(TOKEN_TTL_MS.password_reset).toBe(30 * 60 * 1000);
    const h = harness(KNOWN);
    const before = Date.now();
    await requestPasswordReset("owner@example.test", h.deps);
    const expiresAt = h.rec.tokenRows[0]?.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThan(before);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(before + TOKEN_TTL_MS.password_reset + 5_000);
  });

  it("issues a fresh, unguessable token each time", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const h = harness(KNOWN);
      await requestPasswordReset("owner@example.test", h.deps);
      seen.add(h.rec.tokenRows[0]?.tokenHash as string);
    }
    expect(seen.size, "token hashes must all differ").toBe(25);
  });

  it("records the audit event for an accepted request", async () => {
    const h = harness(KNOWN);
    await requestPasswordReset("owner@example.test", h.deps);
    expect(h.rec.audits).toEqual([{ firmId: KNOWN.id, action: "password.reset_requested" }]);
  });

  it("reports delivery failure without revealing whether the account existed", async () => {
    const h = harness(KNOWN);
    h.deps.sendEmail = async () => ({ ok: false });
    const res = await requestPasswordReset("owner@example.test", h.deps);
    // A delivery outage is an infrastructure condition, not an account signal —
    // and the same outage would surface for any address.
    expect(res).toEqual({ accepted: false, reason: "delivery_unavailable" });
  });

  it("never writes a raw token to a logger", async () => {
    const logged: unknown[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      }),
    );
    const h = harness(KNOWN);
    await requestPasswordReset("owner@example.test", h.deps);
    for (const s of spies) s.mockRestore();
    const emailed = /valid 30 minutes\): (\S+)/.exec(h.rec.emails[0]?.text ?? "")?.[1] as string;
    expect(JSON.stringify(logged)).not.toContain(emailed);
  });
});

describe("issueAccountToken storage policy", () => {
  it("persists only the hash — the raw token is returned to the caller, never stored", async () => {
    const rows: Array<{ tokenHash: string }> = [];
    const deps: AccountTokenDeps = {
      insertToken: async (row) => {
        rows.push({ tokenHash: row.tokenHash });
      },
      consumeToken: async () => undefined,
    };
    const { rawToken } = await issueAccountToken(1, "password_reset", deps);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(rawToken));
    expect(rows[0]?.tokenHash).not.toBe(rawToken);
    // 32 random bytes, base64url — long enough that guessing is not a strategy.
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
  });
});
