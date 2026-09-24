// Changing the account password from Settings.
//
// The form posted to a route that did not exist. What has to be true now that
// it does: the current password gates the change, the new one meets the same
// rule a reset enforces and is stored through the same hash, every other
// session is signed out while the one making the change survives, and nothing
// changes at all on a refusal.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  completePasswordReset,
  hashAccountPassword,
  isAcceptableNewPassword,
  verifyAccountPassword,
} from "./accountTokens.js";
import { changeAccountPassword, productionPasswordChangeDeps, type PasswordChangeDeps } from "./passwordChange.js";

const FIRM = 7;
const CURRENT = "harbour-trellis-5521";
const NEXT = "lantern-quartz-7734";

function harness(options: { hash?: string | undefined; revokeThrows?: boolean; auditThrows?: boolean } = {}) {
  const state = {
    hash: ("hash:" + CURRENT) as string | undefined,
    updates: [] as string[],
    revoked: [] as Array<{ firmId: number; keep: string | undefined }>,
    audits: [] as string[],
    lookups: 0,
  };
  if ("hash" in options) state.hash = options.hash;
  const deps: PasswordChangeDeps = {
    loadPasswordHash: async () => {
      state.lookups += 1;
      return state.hash;
    },
    verifyPassword: async (password, hash) => hash === `hash:${password}`,
    hashPassword: async (password) => `hash:${password}`,
    updatePasswordHash: async (_firmId, hash) => {
      state.updates.push(hash);
      state.hash = hash;
    },
    revokeOtherSessions: async (firmId, keep) => {
      if (options.revokeThrows) throw new Error("session store down");
      state.revoked.push({ firmId, keep });
    },
    recordAudit: async (_firmId, action) => {
      if (options.auditThrows) throw new Error("audit store down");
      state.audits.push(action);
    },
  };
  return { deps, state };
}

describe("changing the account password", () => {
  it("changes it when the current password is right, and signs out every other session", async () => {
    const h = harness();
    const result = await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, "session-here", h.deps);
    expect(result).toEqual({ ok: true, otherSessionsSignedOut: true });
    expect(h.state.updates).toEqual([`hash:${NEXT}`]);
    // The session making the change is the one kept.
    expect(h.state.revoked).toEqual([{ firmId: FIRM, keep: "session-here" }]);
    expect(h.state.audits).toEqual(["password.changed"]);
  });

  it("stores what the hasher returns, never the plaintext", async () => {
    const h = harness();
    await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, "session-here", h.deps);
    expect(h.state.updates[0]).not.toBe(NEXT);
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const h = harness();
    const result = await changeAccountPassword(FIRM, { currentPassword: "not-it-at-all", newPassword: NEXT }, "session-here", h.deps);
    expect(result).toEqual({ ok: false, reason: "wrong_password" });
    expect(h.state.updates).toEqual([]);
    expect(h.state.revoked).toEqual([]);
    expect(h.state.audits).toEqual([]);
  });

  it("refuses a missing or malformed current password without looking the account up", async () => {
    for (const bad of [undefined, "", 42, null, "x".repeat(201)]) {
      const h = harness();
      expect(await changeAccountPassword(FIRM, { currentPassword: bad, newPassword: NEXT }, "s", h.deps), String(bad)).toEqual({
        ok: false,
        reason: "wrong_password",
      });
      expect(h.state.lookups).toBe(0);
    }
  });

  it("refuses a new password outside the shared rule before checking anything else", async () => {
    for (const bad of ["short", "x".repeat(NEW_PASSWORD_MIN_LENGTH - 1), "x".repeat(NEW_PASSWORD_MAX_LENGTH + 1), undefined, 12345678]) {
      const h = harness();
      expect(await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: bad }, "s", h.deps), String(bad)).toEqual({
        ok: false,
        reason: "weak_password",
      });
      expect(h.state.lookups).toBe(0);
      expect(h.state.updates).toEqual([]);
    }
  });

  it("an account with no password on file cannot be changed", async () => {
    for (const hash of [undefined, ""]) {
      const h = harness({ hash });
      expect(await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, "s", h.deps)).toEqual({
        ok: false,
        reason: "wrong_password",
      });
      expect(h.state.updates).toEqual([]);
    }
  });

  it("signs out EVERY session when the current one cannot be identified — fail closed", async () => {
    for (const token of [undefined, ""]) {
      const h = harness();
      await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, token, h.deps);
      expect(h.state.revoked).toEqual([{ firmId: FIRM, keep: undefined }]);
    }
  });

  it("a failed sign-out neither hides nor undoes the change", async () => {
    const h = harness({ revokeThrows: true });
    const result = await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, "session-here", h.deps);
    expect(result).toEqual({ ok: true, otherSessionsSignedOut: false });
    expect(h.state.updates).toEqual([`hash:${NEXT}`]);
  });

  it("a failed audit row is not a failed change", async () => {
    const h = harness({ auditThrows: true });
    expect(await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: NEXT }, "s", h.deps)).toEqual({
      ok: true,
      otherSessionsSignedOut: true,
    });
  });
});

describe("one password rule and one hash for reset and change", () => {
  it("draws the length boundary in one place", () => {
    expect(NEW_PASSWORD_MIN_LENGTH).toBe(8);
    expect(isAcceptableNewPassword("x".repeat(7))).toBe(false);
    expect(isAcceptableNewPassword("x".repeat(8))).toBe(true);
    expect(isAcceptableNewPassword("x".repeat(NEW_PASSWORD_MAX_LENGTH))).toBe(true);
    expect(isAcceptableNewPassword("x".repeat(NEW_PASSWORD_MAX_LENGTH + 1))).toBe(false);
    expect(isAcceptableNewPassword(12345678)).toBe(false);
  });

  it("a reset refuses exactly what a change refuses", async () => {
    const resetDeps = {
      tokens: { insertToken: async () => {}, consumeToken: async () => undefined },
      findFirmByEmail: async () => undefined,
      updatePasswordHash: async () => {},
      revokeSessions: async () => {},
      sendEmail: async () => ({ ok: true }),
      recordAudit: async () => {},
    };
    for (const candidate of ["x".repeat(7), "x".repeat(8), "x".repeat(200), "x".repeat(201)]) {
      const reset = await completePasswordReset("t".repeat(43), candidate, resetDeps);
      const change = await changeAccountPassword(FIRM, { currentPassword: CURRENT, newPassword: candidate }, "s", harness().deps);
      const resetWeak = !reset.ok && reset.reason === "weak_password";
      const changeWeak = !change.ok && change.reason === "weak_password";
      expect(changeWeak, `length ${candidate.length}`).toBe(resetWeak);
    }
  });

  it("production wiring uses the shared bcrypt helpers, not a second copy", async () => {
    const deps = await productionPasswordChangeDeps();
    expect(deps.hashPassword).toBe(hashAccountPassword);
    expect(deps.verifyPassword).toBe(verifyAccountPassword);
  });

  it("the shared helpers round-trip at the real cost and refuse an empty hash", async () => {
    const hash = await hashAccountPassword(NEXT);
    expect(hash).not.toContain(NEXT);
    expect(await verifyAccountPassword(NEXT, hash)).toBe(true);
    expect(await verifyAccountPassword(CURRENT, hash)).toBe(false);
    expect(await verifyAccountPassword(NEXT, "")).toBe(false);
  }, 30_000);
});
