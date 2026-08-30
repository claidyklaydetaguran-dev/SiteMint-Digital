// P8 — entitlement config, the subscription state machine (test-clock
// style: every transition uses an injected now), Stripe signature
// verification, single-use account tokens, the reset/verification/
// invitation flows, and the account rate limiter. Fail-closed config and
// idempotency-by-construction are the recurring assertions.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  findPlan,
  loadVoicePlanCatalogFromEnv,
  resolveEntitlementsForFirm,
  resolveIncludedMinutesForFirm,
  VOICE_DEFAULT_PLAN_ENV_VAR,
  VOICE_PLAN_CATALOG_ENV_VAR,
} from "./entitlements.js";
import {
  applySubscriptionEvent,
  applyEventForStripeCustomer,
  loadGraceDaysFromEnv,
  runGraceExpirySweepOnce,
  startGraceExpirySweep,
  VOICE_BILLING_GRACE_DAYS_ENV_VAR,
  type SubscriptionPersistenceDeps,
  type SubscriptionRow,
} from "./subscriptionState.js";
import {
  buildStripeSignatureHeader,
  extractStripeCustomerId,
  mapStripeEventType,
  verifyStripeSignature,
} from "./stripeWebhookAuth.js";
import {
  completePasswordReset,
  confirmEmailVerification,
  consumeAccountToken,
  issueAccountToken,
  requestEmailVerification,
  requestPasswordReset,
  type AccountTokenDeps,
} from "../accountSecurity/accountTokens.js";
import { acceptInvitation, inviteMember, type MembershipDeps } from "../voiceAccounts/membership.js";
import { recordAuditEvent } from "../voiceAccounts/auditLog.js";
import { accountRateLimitAllows } from "../../routes/receptionistAccount.js";
import type { VoiceFirmMember } from "@workspace/db/schema/voice";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const CATALOG = JSON.stringify([
  { planCode: "starter", includedMinutes: 300, smsIncluded: false },
  { planCode: "pro", includedMinutes: 1500, smsIncluded: true },
]);

function memoryTokens(now: () => Date = () => NOW): AccountTokenDeps & { rows: Array<{ purpose: string; tokenHash: string; firmId: number; expiresAt: Date; consumedAt: Date | null }> } {
  const rows: Array<{ purpose: string; tokenHash: string; firmId: number; expiresAt: Date; consumedAt: Date | null }> = [];
  return {
    rows,
    now,
    insertToken: async (row) => {
      rows.push({ ...row, consumedAt: null });
    },
    consumeToken: async (purpose, tokenHash, at) => {
      const row = rows.find(
        (r) => r.purpose === purpose && r.tokenHash === tokenHash && r.consumedAt === null && r.expiresAt.getTime() > at.getTime(),
      );
      if (!row) return undefined;
      row.consumedAt = at;
      return { firmId: row.firmId };
    },
  };
}

// ── plan catalog ─────────────────────────────────────────────────────────────

describe("plan catalog", () => {
  it("is null when unset and fail-closed on every malformed shape", () => {
    expect(loadVoicePlanCatalogFromEnv({})).toBeNull();
    const bad = [
      "not json",
      "{}",
      "[]",
      JSON.stringify([{ planCode: "a", includedMinutes: 10, surprise: 1 }]),
      JSON.stringify([{ planCode: "Bad Code!", includedMinutes: 10 }]),
      JSON.stringify([{ planCode: "a", includedMinutes: 10 }, { planCode: "a", includedMinutes: 20 }]),
      JSON.stringify([{ planCode: "a", includedMinutes: 0 }]),
      JSON.stringify([{ planCode: "a", includedMinutes: 10, smsIncluded: "yes" }]),
    ];
    for (const raw of bad) {
      expect(() => loadVoicePlanCatalogFromEnv({ [VOICE_PLAN_CATALOG_ENV_VAR]: raw }), raw).toThrow();
    }
    expect(() =>
      loadVoicePlanCatalogFromEnv({ [VOICE_PLAN_CATALOG_ENV_VAR]: CATALOG, [VOICE_DEFAULT_PLAN_ENV_VAR]: "ghost" }),
    ).toThrow(/not in the catalog/);
    const catalog = loadVoicePlanCatalogFromEnv({ [VOICE_PLAN_CATALOG_ENV_VAR]: CATALOG, [VOICE_DEFAULT_PLAN_ENV_VAR]: "starter" });
    expect(catalog?.plans).toHaveLength(2);
    expect(catalog?.defaultPlanCode).toBe("starter");
    expect(findPlan(catalog!, "pro")?.includedMinutes).toBe(1500);
  });

  it("resolves entitlements: subscription plan, then default, then none — and minutes fall back to the P7 env cap", async () => {
    const env = { [VOICE_PLAN_CATALOG_ENV_VAR]: CATALOG, [VOICE_DEFAULT_PLAN_ENV_VAR]: "starter" };
    const withSub = await resolveEntitlementsForFirm(7, { env, findSubscription: async () => ({ planCode: "pro", state: "grace" }) });
    expect(withSub).toMatchObject({ source: "subscription", subscriptionState: "grace", plan: { planCode: "pro" } });

    const ghostPlan = await resolveEntitlementsForFirm(7, { env, findSubscription: async () => ({ planCode: "ghost", state: "active" }) });
    expect(ghostPlan).toMatchObject({ source: "default_plan", plan: { planCode: "starter" } });

    const noSub = await resolveEntitlementsForFirm(7, { env, findSubscription: async () => undefined });
    expect(noSub).toMatchObject({ source: "default_plan" });

    const noDefault = await resolveEntitlementsForFirm(7, {
      env: { [VOICE_PLAN_CATALOG_ENV_VAR]: CATALOG },
      findSubscription: async () => undefined,
    });
    expect(noDefault).toEqual({ source: "none" });

    expect(await resolveEntitlementsForFirm(7, { env: {}, findSubscription: async () => undefined })).toEqual({ source: "none" });

    expect(
      await resolveIncludedMinutesForFirm(7, { env, findSubscription: async () => ({ planCode: "pro", state: "active" }) }),
    ).toBe(1500);
    expect(
      await resolveIncludedMinutesForFirm(7, { env: { VOICE_USAGE_INCLUDED_MINUTES: "77" }, findSubscription: async () => undefined }),
    ).toBe(77);
    expect(await resolveIncludedMinutesForFirm(7, { env: {}, findSubscription: async () => undefined })).toBeNull();
  });
});

// ── subscription state machine ───────────────────────────────────────────────

describe("subscription transitions (test clock)", () => {
  it("grace days config: default 7, bounded, fail-closed", () => {
    expect(loadGraceDaysFromEnv({})).toBe(7);
    expect(loadGraceDaysFromEnv({ [VOICE_BILLING_GRACE_DAYS_ENV_VAR]: "14" })).toBe(14);
    for (const bad of ["0", "61", "abc", "3.5"]) {
      expect(() => loadGraceDaysFromEnv({ [VOICE_BILLING_GRACE_DAYS_ENV_VAR]: bad }), bad).toThrow();
    }
  });

  it("implements exactly the documented table", () => {
    const grace = { state: "grace" as const, graceUntil: new Date(NOW.getTime() + 1000) };

    // payment_failed from active starts the dunning window at now + graceDays
    const failed = applySubscriptionEvent({ state: "active", graceUntil: null }, "payment_failed", NOW, 7);
    expect(failed.changed && failed.next).toEqual({ state: "grace", graceUntil: new Date(NOW.getTime() + 7 * 86_400_000) });

    // recovery from grace and suspended
    for (const state of ["grace", "suspended"] as const) {
      const recovered = applySubscriptionEvent({ state, graceUntil: state === "grace" ? NOW : null }, "payment_succeeded", NOW, 7);
      expect(recovered.changed && recovered.next).toEqual({ state: "active", graceUntil: null });
    }

    // no-ops and refusals
    expect(applySubscriptionEvent({ state: "active", graceUntil: null }, "payment_succeeded", NOW, 7)).toEqual({ changed: false, reason: "no_op" });
    expect(applySubscriptionEvent({ state: "canceled", graceUntil: null }, "payment_failed", NOW, 7)).toEqual({ changed: false, reason: "not_applicable" });
    expect(applySubscriptionEvent({ state: "canceled", graceUntil: null }, "payment_succeeded", NOW, 7)).toEqual({ changed: false, reason: "not_applicable" });
    expect(applySubscriptionEvent(grace, "payment_failed", NOW, 7)).toEqual({ changed: false, reason: "no_op" });

    // grace_expired honors the deadline exactly
    expect(applySubscriptionEvent(grace, "grace_expired", NOW, 7)).toEqual({ changed: false, reason: "not_applicable" });
    const expired = applySubscriptionEvent({ state: "grace", graceUntil: NOW }, "grace_expired", NOW, 7);
    expect(expired.changed && expired.next).toEqual({ state: "suspended", graceUntil: null });
    expect(expired.changed && expired.effects.some((e) => e.kind === "critical_issue" && e.code === "billing_suspended")).toBe(true);

    // cancel from anywhere; reactivate only from canceled
    expect(applySubscriptionEvent(grace, "canceled", NOW, 7).changed).toBe(true);
    expect(applySubscriptionEvent({ state: "canceled", graceUntil: null }, "reactivated", NOW, 7).changed).toBe(true);
    expect(applySubscriptionEvent({ state: "active", graceUntil: null }, "reactivated", NOW, 7)).toEqual({ changed: false, reason: "not_applicable" });
  });

  function persistence(row: SubscriptionRow | undefined, opts: { updateOk?: boolean; storeInserted?: boolean } = {}) {
    const audits: string[] = [];
    const issues: string[] = [];
    const stored: string[] = [];
    const deps: SubscriptionPersistenceDeps = {
      findByStripeCustomerId: async () => row,
      findByFirmId: async () => row,
      updateState: async () => opts.updateOk ?? true,
      listExpiredGrace: async () => (row ? [row] : []),
      storeEventOnce: async (_firmId, _provider, eventKey) => {
        stored.push(eventKey);
        return { inserted: opts.storeInserted ?? true };
      },
      recordAudit: async (_firmId, action) => {
        audits.push(action);
      },
      openCriticalIssue: async (_firmId, code) => {
        issues.push(code);
      },
      now: () => NOW,
      env: {},
    };
    return { deps, audits, issues, stored };
  }

  const graceRow: SubscriptionRow = { firmId: 7, planCode: "starter", state: "grace", graceUntil: new Date(NOW.getTime() - 1000) };

  it("applies events by stored Stripe mapping only, with ledger idempotency and concurrency guards", async () => {
    expect(await applyEventForStripeCustomer("cus_x", "payment_succeeded", persistence(undefined).deps)).toEqual({
      applied: false,
      reason: "unknown_subscription",
    });

    const dup = persistence(graceRow, { storeInserted: false });
    expect(await applyEventForStripeCustomer("cus_x", "payment_succeeded", dup.deps, { provider: "stripe_voice", eventKey: "evt_1" })).toEqual({
      applied: false,
      reason: "duplicate_event",
    });

    const raced = persistence(graceRow, { updateOk: false });
    expect(await applyEventForStripeCustomer("cus_x", "payment_succeeded", raced.deps)).toEqual({
      applied: false,
      reason: "concurrent_change",
    });

    const ok = persistence(graceRow);
    const outcome = await applyEventForStripeCustomer("cus_x", "payment_succeeded", ok.deps, { provider: "stripe_voice", eventKey: "evt_2" });
    expect(outcome).toEqual({ applied: true, next: { state: "active", graceUntil: null } });
    expect(ok.stored).toEqual(["evt_2"]);
    expect(ok.audits).toEqual(["subscription.payment_recovered"]);
  });

  it("a throwing effect never undoes the applied state change", async () => {
    const h = persistence(graceRow);
    h.deps.recordAudit = async () => {
      throw new Error("audit down");
    };
    const outcome = await applyEventForStripeCustomer("cus_x", "payment_succeeded", h.deps);
    expect(outcome.applied).toBe(true);
  });

  it("the grace sweep suspends expired rows with the critical issue, and its starter is flag-gated", async () => {
    const h = persistence(graceRow);
    expect(await runGraceExpirySweepOnce(h.deps)).toEqual({ scanned: 1, suspended: 1 });
    expect(h.issues).toEqual(["billing_suspended"]);
    expect(h.audits).toEqual(["subscription.suspended"]);

    const logged: string[] = [];
    startGraceExpirySweep(1000, { env: {}, logger: (event) => logged.push(event) })();
    expect(logged).toEqual(["grace_sweep_disabled"]);
  });
});

// ── Stripe signature ─────────────────────────────────────────────────────────

describe("Stripe webhook signature", () => {
  const SECRET = "whsec_test_secret_0123456789";
  const BODY = Buffer.from(JSON.stringify({ id: "evt_1", type: "invoice.payment_failed" }));
  const nowSec = Math.floor(NOW.getTime() / 1000);

  it("accepts a genuine header, including rotation with multiple v1 entries", () => {
    const header = buildStripeSignatureHeader(BODY, SECRET, nowSec);
    expect(verifyStripeSignature(BODY, header, SECRET, NOW.getTime())).toEqual({ ok: true, timestamp: nowSec });
    const rotated = `t=${nowSec},v1=${"0".repeat(64)},${header.split(",")[1]}`;
    expect(verifyStripeSignature(BODY, rotated, SECRET, NOW.getTime()).ok).toBe(true);
  });

  it("refuses missing/malformed/stale/mismatched signatures, each with its reason", () => {
    const header = buildStripeSignatureHeader(BODY, SECRET, nowSec);
    expect(verifyStripeSignature(BODY, undefined, SECRET, NOW.getTime())).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(BODY, "v1=abc", SECRET, NOW.getTime())).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeSignature(BODY, `t=${nowSec}`, SECRET, NOW.getTime())).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeSignature(BODY, header, SECRET, NOW.getTime() + 301_000)).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyStripeSignature(BODY, header, "wrong_secret_0123456789", NOW.getTime())).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifyStripeSignature(Buffer.from("tampered"), header, SECRET, NOW.getTime())).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("maps only the closed event set and extracts only string customer ids", () => {
    expect(mapStripeEventType("invoice.payment_succeeded")).toBe("payment_succeeded");
    expect(mapStripeEventType("invoice.payment_failed")).toBe("payment_failed");
    expect(mapStripeEventType("customer.subscription.deleted")).toBe("canceled");
    expect(mapStripeEventType("customer.subscription.resumed")).toBe("reactivated");
    expect(mapStripeEventType("charge.succeeded")).toBeNull();
    expect(mapStripeEventType(undefined)).toBeNull();
    expect(extractStripeCustomerId({ data: { object: { customer: "cus_abc" } } })).toBe("cus_abc");
    expect(extractStripeCustomerId({ data: { object: { customer: { id: "cus_abc" } } } })).toBeNull();
    expect(extractStripeCustomerId({})).toBeNull();
  });
});

// ── account tokens ───────────────────────────────────────────────────────────

describe("account tokens", () => {
  it("issues hash-only rows and consumes exactly once, per purpose, before expiry", async () => {
    const tokens = memoryTokens();
    const { rawToken } = await issueAccountToken(7, "password_reset", tokens);
    expect(tokens.rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.rows[0]!.tokenHash).not.toContain(rawToken);

    expect(await consumeAccountToken("email_verification", rawToken, tokens)).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await consumeAccountToken("password_reset", rawToken, tokens)).toEqual({ ok: true, firmId: 7 });
    expect(await consumeAccountToken("password_reset", rawToken, tokens)).toEqual({ ok: false, reason: "invalid_or_expired" });

    const lateClock = memoryTokens(() => NOW);
    const issued = await issueAccountToken(7, "password_reset", lateClock);
    lateClock.now = () => new Date(NOW.getTime() + 31 * 60 * 1000); // past the 30-minute TTL
    expect(await consumeAccountToken("password_reset", issued.rawToken, lateClock)).toEqual({ ok: false, reason: "invalid_or_expired" });

    expect(await consumeAccountToken("password_reset", "short", tokens)).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await consumeAccountToken("password_reset", 42, tokens)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });
});

// ── password reset flow ──────────────────────────────────────────────────────

describe("password reset", () => {
  function resetHarness(known: boolean, sendOk = true) {
    const tokens = memoryTokens();
    const sent: Array<{ to: string; text: string }> = [];
    const audits: string[] = [];
    let storedHash: string | undefined;
    let sessionsRevoked = 0;
    return {
      tokens,
      sent,
      audits,
      get storedHash() { return storedHash; },
      get sessionsRevoked() { return sessionsRevoked; },
      deps: {
        tokens,
        findFirmByEmail: async () => (known ? { id: 7, email: "owner@firm.example" } : undefined),
        updatePasswordHash: async (_firmId: number, hash: string) => {
          storedHash = hash;
        },
        revokeSessions: async () => {
          sessionsRevoked += 1;
        },
        sendEmail: async (to: string, _subject: string, text: string) => {
          sent.push({ to, text });
          return { ok: sendOk };
        },
        recordAudit: async (_firmId: number, action: string) => {
          audits.push(action);
        },
        hashPassword: async (password: string) => `hashed(${password})`,
      },
    };
  }

  it("answers identically for unknown addresses and completes with session revocation for real ones", async () => {
    const unknown = resetHarness(false);
    expect(await requestPasswordReset("ghost@example.com", unknown.deps)).toEqual({ accepted: true });
    expect(unknown.sent).toHaveLength(0);

    const h = resetHarness(true);
    expect(await requestPasswordReset("Owner@Firm.example", h.deps)).toEqual({ accepted: true });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.to).toBe("owner@firm.example");
    const rawToken = /code \(valid 30 minutes\): (\S+)/.exec(h.sent[0]!.text)?.[1];
    expect(rawToken).toBeDefined();

    expect(await completePasswordReset(rawToken, "short", h.deps)).toEqual({ ok: false, reason: "weak_password" });
    expect(await completePasswordReset("wrong-token-wrong-token", "longenough1", h.deps)).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await completePasswordReset(rawToken, "longenough1", h.deps)).toEqual({ ok: true });
    expect(h.storedHash).toBe("hashed(longenough1)");
    expect(h.sessionsRevoked).toBe(1);
    expect(h.audits).toContain("password.reset_completed");
    // the token died with its use
    expect(await completePasswordReset(rawToken, "longenough1", h.deps)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("a disabled delivery path is surfaced, never a silent lockout", async () => {
    const h = resetHarness(true, false);
    expect(await requestPasswordReset("owner@firm.example", h.deps)).toEqual({ accepted: false, reason: "delivery_unavailable" });
  });
});

// ── email verification + membership ──────────────────────────────────────────

describe("verification and membership", () => {
  it("verification round-trip marks the firm verified", async () => {
    const tokens = memoryTokens();
    const sent: string[] = [];
    let verifiedAt: Date | undefined;
    const deps = {
      tokens,
      findFirmEmail: async () => "owner@firm.example",
      markVerified: async (_firmId: number, at: Date) => {
        verifiedAt = at;
      },
      sendEmail: async (_to: string, _subject: string, text: string) => {
        sent.push(text);
        return { ok: true };
      },
      recordAudit: async () => {},
      now: () => NOW,
    };
    expect(await requestEmailVerification(7, deps)).toEqual({ sent: true });
    const rawToken = /code \(valid 24 hours\): (\S+)/.exec(sent[0]!)?.[1];
    expect(await confirmEmailVerification(rawToken, deps)).toEqual({ ok: true, firmId: 7 });
    expect(verifiedAt).toEqual(NOW);
  });

  function member(overrides: Partial<VoiceFirmMember> = {}): VoiceFirmMember {
    return {
      id: 1,
      firmId: 7,
      email: "staff@firm.example",
      role: "staff",
      status: "invited",
      invitedAt: NOW,
      acceptedAt: null,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as VoiceFirmMember;
  }

  function membershipHarness(opts: { roster?: VoiceFirmMember[]; insertOk?: boolean; sendOk?: boolean; activateOk?: boolean } = {}) {
    const tokens = memoryTokens();
    const sent: string[] = [];
    const revoked: number[] = [];
    const deps: Partial<MembershipDeps> = {
      tokens,
      listMembers: async () => opts.roster ?? [],
      insertMember: async (row) => ((opts.insertOk ?? true) ? member({ email: row.email, role: row.role }) : undefined),
      activateMember: async () => opts.activateOk ?? true,
      revokeMember: async (_firmId, memberId) => {
        revoked.push(memberId);
        return true;
      },
      sendEmail: async (_to, _subject, text) => {
        sent.push(text);
        return { ok: opts.sendOk ?? true };
      },
      recordAudit: async () => {},
      now: () => NOW,
    };
    return { deps, sent, revoked, tokens };
  }

  it("invitation validates, bounds the roster, compensates failed delivery, and accepts by token+email", async () => {
    const h = membershipHarness();
    expect(await inviteMember(7, "not-an-email", "staff", h.deps)).toEqual({ ok: false, reason: "invalid_email" });
    expect(await inviteMember(7, "a@b.co", "superuser", h.deps)).toEqual({ ok: false, reason: "invalid_role" });

    const full = membershipHarness({ roster: Array.from({ length: 10 }, (_, i) => member({ id: i + 1, email: `m${i}@x.co` })) });
    expect(await inviteMember(7, "new@x.co", "staff", full.deps)).toEqual({ ok: false, reason: "member_limit" });

    const dup = membershipHarness({ insertOk: false });
    expect(await inviteMember(7, "staff@firm.example", "staff", dup.deps)).toEqual({ ok: false, reason: "already_member" });

    const down = membershipHarness({ sendOk: false });
    expect(await inviteMember(7, "staff@firm.example", "staff", down.deps)).toEqual({ ok: false, reason: "delivery_unavailable" });
    expect(down.revoked).toEqual([1]); // the dead roster row was compensated away

    const ok = membershipHarness();
    const invited = await inviteMember(7, "Staff@Firm.example", "staff", ok.deps);
    expect(invited.ok).toBe(true);
    const rawToken = /code \(valid 7 days\): (\S+)/.exec(ok.sent[0]!)?.[1];
    expect(await acceptInvitation(rawToken, "staff@firm.example", ok.deps)).toEqual({ ok: true, firmId: 7 });
    expect(await acceptInvitation(rawToken, "staff@firm.example", ok.deps)).toEqual({ ok: false, reason: "invalid_or_expired" });

    const wrongEmail = membershipHarness({ activateOk: false });
    const invited2 = await inviteMember(7, "other@firm.example", "staff", wrongEmail.deps);
    expect(invited2.ok).toBe(true);
    const rawToken2 = /code \(valid 7 days\): (\S+)/.exec(wrongEmail.sent[0]!)?.[1];
    expect(await acceptInvitation(rawToken2, "guess@evil.example", wrongEmail.deps)).toEqual({ ok: false, reason: "no_invitation" });
  });
});

// ── audit + rate limiter ─────────────────────────────────────────────────────

describe("audit and rate limiting", () => {
  it("audit actions are shape-checked at the writer", async () => {
    const rows: unknown[] = [];
    const deps = { insertAuditRow: async (row: unknown) => { rows.push(row); } };
    await recordAuditEvent({ firmId: 7, actor: "system", action: "subscription.grace_entered" }, deps);
    expect(rows).toHaveLength(1);
    await expect(recordAuditEvent({ firmId: 7, actor: "system", action: "Bad Action!" }, deps)).rejects.toThrow(/must match/);
  });

  it("the account limiter allows 10 per window per key and resets on a new window", () => {
    const base = Date.parse("2026-08-30T00:00:00.000Z");
    for (let i = 0; i < 10; i += 1) {
      expect(accountRateLimitAllows("t:1.2.3.4", base + i), `hit ${i}`).toBe(true);
    }
    expect(accountRateLimitAllows("t:1.2.3.4", base + 10)).toBe(false);
    expect(accountRateLimitAllows("t:5.6.7.8", base)).toBe(true); // other keys unaffected
    expect(accountRateLimitAllows("t:1.2.3.4", base + 60 * 60 * 1000)).toBe(true); // new window
  });
});
