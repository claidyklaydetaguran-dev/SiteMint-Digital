// The outbox's retry decisions, tested directly.
//
// Three limits of the earlier worker are pinned here:
//   - its lease was shorter than a batch of sends, so a second worker could
//     reclaim rows the first was still sending;
//   - an attempt whose outcome was unknown was retried blind, including after
//     the provider's 24-hour idempotency window had closed;
//   - a worker that died mid-send had its attempt forgotten.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  NOTIFICATION_CLAIM_BATCH,
  NOTIFICATION_KEY_WINDOW_MS,
  NOTIFICATION_LEASE_MS,
  NOTIFICATION_MAX_ATTEMPTS,
  outcomeIsUncertain,
  planReclaim,
  planSettlement,
  resendWouldBeUnprotected,
  settleWithoutSending,
  type AttemptHistory,
} from "./notificationOutbox.js";
import { ALERT_SEND_TIMEOUT_MS } from "../voiceAlerts/alertTransport.js";

const T0 = new Date("2026-09-16T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const fresh: AttemptHistory = { attempts: 0, firstAttemptAt: null, outcomeUncertainAt: null };

describe("the claim lease", () => {
  it("outlasts a whole batch of sends that each run to the transport timeout", () => {
    expect(NOTIFICATION_LEASE_MS).toBeGreaterThan(NOTIFICATION_CLAIM_BATCH * ALERT_SEND_TIMEOUT_MS);
  });

  it("the worker settles only while its own lease value is still on the row", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "notificationOutbox.ts"), "utf8");
    const settle = src.slice(src.indexOf("async function applySettlement"), src.indexOf("export interface NotificationRunSummary"));
    expect(settle).toMatch(/eq\(voiceNotifications\.state, "sending"\)/);
    expect(settle).toMatch(/eq\(voiceNotifications\.leaseExpiresAt, row\.leaseExpiresAt\)/);
    // A lapsed lease is reclaimed only once it has genuinely expired.
    expect(src).toMatch(/lte\(voiceNotifications\.leaseExpiresAt, now\)/);
    expect(src).not.toMatch(/leaseExpiresAt: now,/);
  });
});

describe("which results leave the outcome unknown", () => {
  it("treats timeouts, dropped connections, 5xx, lapsed leases and in-flight keys as unknown", () => {
    for (const code of ["transport_timeout", "transport_error", "transport_threw", "lease_expired", "provider_idempotency_in_progress", "provider_status_500", "provider_status_503"]) {
      expect(outcomeIsUncertain(code), code).toBe(true);
    }
  });

  it("treats a 4xx rejection and a configuration hold as definitely not sent", () => {
    for (const code of ["provider_status_422", "provider_status_401", "alerts_disabled", "recipient_suppressed"]) {
      expect(outcomeIsUncertain(code), code).toBe(false);
    }
  });
});

describe("planSettlement", () => {
  it("records acceptance with the provider's receipt and starts the key clock", () => {
    const s = planSettlement(fresh, { ok: true, providerMessageId: "re_1" }, T0, T0);
    expect(s).toMatchObject({ state: "accepted", attempts: 1, firstAttemptAt: T0, providerMessageId: "re_1", lastErrorCode: null });
  });

  it("keeps the attempt count and the key clock untouched on a configuration hold", () => {
    const s = planSettlement(fresh, { ok: false, reason: "alerts_disabled" }, T0, T0);
    expect(s).toMatchObject({ state: "failed", attempts: 0, firstAttemptAt: null, outcomeUncertainAt: null });
    expect(s.nextAttemptAt!.getTime()).toBeGreaterThan(T0.getTime());
  });

  it("remembers when an outcome first became unknown, and retries with backoff", () => {
    const s = planSettlement(fresh, { ok: false, reason: "transport_timeout" }, T0, T0);
    expect(s).toMatchObject({ state: "failed", attempts: 1, firstAttemptAt: T0, outcomeUncertainAt: T0 });
    // A later definite rejection does not erase that the earlier one may have gone out.
    const later = planSettlement(s, { ok: false, reason: "provider_status_422" }, at(60_000), at(60_000));
    expect(later.outcomeUncertainAt).toEqual(T0);
    expect(later.firstAttemptAt).toEqual(T0);
  });

  it("stops at the attempt limit as 'abandoned' only when nothing could have been sent", () => {
    const history: AttemptHistory = { attempts: NOTIFICATION_MAX_ATTEMPTS - 1, firstAttemptAt: T0, outcomeUncertainAt: null };
    expect(planSettlement(history, { ok: false, reason: "provider_status_422" }, T0, T0).state).toBe("abandoned");
  });

  it("stops at the attempt limit as 'unconfirmed' when an attempt may have been accepted", () => {
    const history: AttemptHistory = { attempts: NOTIFICATION_MAX_ATTEMPTS - 1, firstAttemptAt: T0, outcomeUncertainAt: T0 };
    const s = planSettlement(history, { ok: false, reason: "provider_status_422" }, T0, T0);
    expect(s.state).toBe("unconfirmed");
    expect(s.nextAttemptAt).toBeNull();
  });

  it("never resends after the provider reports the key was used for other content", () => {
    const s = planSettlement(fresh, { ok: false, reason: "provider_idempotency_conflict" }, T0, T0);
    expect(s.state).toBe("unconfirmed");
    expect(s.outcomeUncertainAt).toEqual(T0);
  });
});

describe("the provider's 24-hour key window", () => {
  it("allows a retry of an uncertain send while the key is certainly still held", () => {
    const history: AttemptHistory = { attempts: 1, firstAttemptAt: T0, outcomeUncertainAt: T0 };
    expect(resendWouldBeUnprotected(history, at(NOTIFICATION_KEY_WINDOW_MS - 1))).toBe(false);
  });

  it("refuses to resend an uncertain send once the window may have closed", () => {
    const history: AttemptHistory = { attempts: 1, firstAttemptAt: T0, outcomeUncertainAt: at(3_600_000) };
    // Measured from the FIRST request with the key, not from the uncertain one.
    expect(resendWouldBeUnprotected(history, at(NOTIFICATION_KEY_WINDOW_MS))).toBe(true);
    expect(NOTIFICATION_KEY_WINDOW_MS).toBeLessThan(24 * 60 * 60_000);
  });

  it("does not hold back a row whose attempts were all definite rejections", () => {
    const history: AttemptHistory = { attempts: 2, firstAttemptAt: T0, outcomeUncertainAt: null };
    expect(resendWouldBeUnprotected(history, at(3 * 24 * 60 * 60_000))).toBe(false);
  });

  it("marks such a row 'unconfirmed' — a person checks the inbox; nobody guesses", () => {
    const s = settleWithoutSending({ attempts: 2, firstAttemptAt: T0, outcomeUncertainAt: T0 }, "outcome_unknown_key_expired");
    expect(s).toMatchObject({ state: "unconfirmed", lastErrorCode: "outcome_unknown_key_expired", nextAttemptAt: null });
    expect(settleWithoutSending(fresh, "recipient_suppressed").state).toBe("abandoned");
  });
});

describe("a worker that stopped mid-send", () => {
  it("counts the lost attempt and treats its outcome as unknown from the claim", () => {
    const lapsedLease = at(NOTIFICATION_LEASE_MS);
    const h = planReclaim(fresh, lapsedLease, at(NOTIFICATION_LEASE_MS + 5_000));
    expect(h.attempts).toBe(1);
    expect(h.firstAttemptAt).toEqual(T0);
    expect(h.outcomeUncertainAt).toEqual(T0);
  });

  it("keeps an earlier, older first attempt", () => {
    const earlier = new Date(T0.getTime() - 3_600_000);
    const h = planReclaim({ attempts: 2, firstAttemptAt: earlier, outcomeUncertainAt: null }, at(NOTIFICATION_LEASE_MS), at(NOTIFICATION_LEASE_MS));
    expect(h).toEqual({ attempts: 3, firstAttemptAt: earlier, outcomeUncertainAt: T0 });
  });
});
