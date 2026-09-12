// Changing the account's email address.
//
// The property that matters is that a business can always get back to a
// reachable inbox, and that nobody else can take the account over on the way.
// Staging proved the first half is not theoretical: its address ends in
// `.invalid`, so no verification mail could ever arrive and there was no route
// out of that from inside the product.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { changeAccountEmail, normalizeAccountEmail, type EmailChangeDeps } from "./emailChange.js";

const FIRM = 7;
const CURRENT = "owner@oldbusiness.example.com".replace(".example.com", ".co.uk");

interface Sent { to: string; subject: string; text: string }

function deps(options: {
  password?: string;
  currentEmail?: string;
  takenBy?: Record<string, number>;
  sendFails?: (to: string) => boolean;
  issueThrows?: boolean;
} = {}) {
  const sent: Sent[] = [];
  const audits: Array<{ action: string; subject: string }> = [];
  const state = { email: options.currentEmail ?? CURRENT, verifiedCleared: 0, updates: [] as string[] };
  const d: EmailChangeDeps = {
    loadFirm: async () => ({ email: state.email, passwordHash: "hash-of-" + (options.password ?? "correct-horse") }),
    verifyPassword: async (password, hash) => hash === "hash-of-" + password,
    findFirmIdByEmail: async (email) => (options.takenBy ?? {})[email],
    updateEmail: async (_firmId, email) => {
      state.updates.push(email);
      state.email = email;
    },
    clearVerification: async () => {
      state.verifiedCleared += 1;
    },
    sendEmail: async (to, subject, text) => {
      if (options.sendFails?.(to)) return { ok: false };
      sent.push({ to, subject, text });
      return { ok: true };
    },
    issueToken: async () => {
      if (options.issueThrows) throw new Error("token store down");
      return { rawToken: "RAW-TOKEN-VALUE" };
    },
    recordAudit: async (_firmId, action, subject) => {
      audits.push({ action, subject });
    },
  };
  return { deps: d, sent, audits, state };
}

const GOOD = { newEmail: "owner@realbusiness.co.uk", currentPassword: "correct-horse" };

describe("changing the account email", () => {
  it("changes the address and sends a code to the new one", async () => {
    const h = deps();
    const result = await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(result).toEqual({ ok: true, email: "owner@realbusiness.co.uk", verificationSent: true });
    expect(h.state.updates).toEqual(["owner@realbusiness.co.uk"]);

    const verification = h.sent.find((m) => m.subject === "Verify your SiteMint AI Receptionist email");
    expect(verification?.to).toBe("owner@realbusiness.co.uk");
    expect(verification?.text).toContain("RAW-TOKEN-VALUE");
  });

  it("leaves the new address unverified until it is proven", async () => {
    const h = deps();
    const result = await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(result.ok).toBe(true);
    // The whole point: nothing is sent to an address nobody has proven, and
    // the system already refuses to email an unverified one.
    expect(h.state.verifiedCleared).toBe(1);
  });

  it("tells the old address, because that is its only warning", async () => {
    const h = deps();
    await changeAccountEmail(FIRM, GOOD, h.deps);
    const notice = h.sent.find((m) => m.to === CURRENT);
    expect(notice).toBeDefined();
    expect(notice!.subject).toMatch(/sign-in email was changed/i);
    expect(notice!.text).toContain("owner@realbusiness.co.uk");
    // It must not carry the verification code — that belongs only to whoever
    // controls the new address.
    expect(notice!.text).not.toContain("RAW-TOKEN-VALUE");
  });

  it("refuses without the current password", async () => {
    const h = deps();
    const wrong = await changeAccountEmail(FIRM, { ...GOOD, currentPassword: "guess" }, h.deps);
    expect(wrong).toEqual({ ok: false, reason: "wrong_password" });
    const missing = await changeAccountEmail(FIRM, { ...GOOD, currentPassword: undefined }, h.deps);
    expect(missing).toEqual({ ok: false, reason: "wrong_password" });
    // Nothing moved and nothing was sent.
    expect(h.state.updates).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it("checks the password before revealing whether an address is taken", async () => {
    // Otherwise this endpoint is an oracle: anyone with a session could ask
    // "is this address registered?" for any address.
    const h = deps({ takenBy: { "someone@else.co.uk": 99 } });
    const result = await changeAccountEmail(FIRM, { newEmail: "someone@else.co.uk", currentPassword: "wrong" }, h.deps);
    expect(result).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("refuses an address another account already uses", async () => {
    const h = deps({ takenBy: { "someone@else.co.uk": 99 } });
    const result = await changeAccountEmail(FIRM, { ...GOOD, newEmail: "someone@else.co.uk" }, h.deps);
    expect(result).toEqual({ ok: false, reason: "duplicate_email" });
    expect(h.state.updates).toEqual([]);
  });

  it("refuses the address it already has", async () => {
    const h = deps();
    const result = await changeAccountEmail(FIRM, { ...GOOD, newEmail: CURRENT.toUpperCase() }, h.deps);
    expect(result).toEqual({ ok: false, reason: "same_email" });
  });

  it("reports honestly when the address changed but the code could not be sent", async () => {
    // Saying "changed" alone would leave a business waiting for mail that is
    // not coming; saying "failed" would be wrong, because it did change.
    const h = deps({ sendFails: (to) => to === "owner@realbusiness.co.uk" });
    const result = await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(result).toEqual({ ok: true, email: "owner@realbusiness.co.uk", verificationSent: false });
    expect(h.state.updates).toEqual(["owner@realbusiness.co.uk"]);
  });

  it("still reports the change when issuing the code throws", async () => {
    const h = deps({ issueThrows: true });
    const result = await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(result).toEqual({ ok: true, email: "owner@realbusiness.co.uk", verificationSent: false });
  });

  it("does not let a failed notice to the old address undo the change", async () => {
    const h = deps({ sendFails: (to) => to === CURRENT });
    const result = await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(result.ok).toBe(true);
    expect(h.state.updates).toEqual(["owner@realbusiness.co.uk"]);
  });

  it("records the change in the audit trail", async () => {
    const h = deps();
    await changeAccountEmail(FIRM, GOOD, h.deps);
    expect(h.audits).toEqual([{ action: "email.changed", subject: "owner@realbusiness.co.uk" }]);
  });
});

describe("which addresses are accepted", () => {
  it("normalises case and surrounding space", () => {
    expect(normalizeAccountEmail("  Owner@Business.CO.UK ")).toBe("owner@business.co.uk");
  });

  it("rejects anything that is not an address", () => {
    for (const bad of ["", "   ", "owner", "owner@", "@business.co.uk", "owner business@x.co.uk", 42, null, undefined]) {
      expect(normalizeAccountEmail(bad as unknown), String(bad)).toBeNull();
    }
    expect(normalizeAccountEmail("a".repeat(200) + "@b.co.uk")).toBeNull();
  });

  it("rejects the reserved domains that can never receive mail", () => {
    // This is the exact shape staging was stuck in: an address that looks
    // valid, passes every pattern check, and is guaranteed undeliverable. If it
    // were accepted the account would go straight back to being unreachable,
    // while appearing to have been fixed.
    for (const bad of [
      "owner@staging.sitemint.invalid",
      "owner@invalid",
      "owner@localhost",
      "owner@app.localhost",
      "owner@example",
      "owner@my.example",
      "owner@test",
      "owner@mail.test",
    ]) {
      expect(normalizeAccountEmail(bad), bad).toBeNull();
    }
  });

  it("accepts the real domains those reserved names resemble", () => {
    // `.invalid` is refused; a domain that merely CONTAINS the word is not.
    for (const good of [
      "owner@sitemintdigital.com",
      "owner@invalid-name.co.uk",
      "owner@example.com",
      "owner@testing.co.uk",
      "owner@localhost.co.uk",
    ]) {
      expect(normalizeAccountEmail(good), good).toBe(good);
    }
  });
});
