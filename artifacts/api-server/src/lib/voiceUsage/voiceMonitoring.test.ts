// P7 — usage metering, cap states, alerts, the daily digest, staff call
// reviews, and the monitoring gate: idempotency under duplicate delivery,
// fail-closed configuration everywhere, PII-free rendering, and the exact
// decision matrix of the /metricz admission gate.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  aggregateUsageForPeriod,
  checkAndRecordUsageCap,
  computePeriodYm,
  loadUsageCapMinutesFromEnv,
  recordCallUsage,
  runUsageBackfillOnce,
  startUsageBackfillSweep,
  VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR,
  type UnmeteredReport,
  type UsageLedgerDeps,
} from "./usageService.js";
import {
  createDisabledAlertTransport,
  createResendAlertTransport,
  FakeAlertTransport,
  loadVoiceAlertConfigFromEnv,
  notifyCriticalIssue,
  renderCriticalIssueAlert,
  RESEND_EMAILS_URL,
  VOICE_ALERTS_ENABLED_ENV_VAR,
} from "../voiceAlerts/alertTransport.js";
import {
  buildFirmDigest,
  isVoiceDigestEnabled,
  renderFirmDigest,
  runDailyDigestOnce,
  VOICE_DIGEST_ENABLED_ENV_VAR,
} from "../voiceAlerts/dailyDigest.js";
import { clearCallReview, setCallReview, type ReviewDeps } from "../voiceReviews/reviewService.js";
import { metricsGateDecision, metricsTokenMatches, VOICE_METRICS_TOKEN_ENV_VAR } from "../../routes/monitoring.js";
import type { VoiceCallReview } from "@workspace/db/schema/voice";

const AUG = new Date("2026-08-15T10:00:00.000Z");

function memoryLedger(): UsageLedgerDeps & { rows: Array<{ key: string; firmId: number; durationSec: number; periodYm: string; source: string }> } {
  const rows: Array<{ key: string; firmId: number; durationSec: number; periodYm: string; source: string }> = [];
  return {
    rows,
    insertLedgerRow: async (row) => {
      const key = `${row.provider}:${row.callId}`;
      if (rows.some((r) => r.key === key)) return { inserted: false };
      rows.push({ key, firmId: row.firmId, durationSec: row.durationSec, periodYm: row.periodYm, source: row.source });
      return { inserted: true };
    },
    sumPeriod: async (firmId, periodYm) => {
      const mine = rows.filter((r) => r.firmId === firmId && r.periodYm === periodYm);
      return { totalSeconds: mine.reduce((a, r) => a + r.durationSec, 0), callCount: mine.length };
    },
  };
}

// ── period + cap config ──────────────────────────────────────────────────────

describe("usage config", () => {
  it("computes UTC periods, including the year boundary", () => {
    expect(computePeriodYm(AUG)).toBe("2026-08");
    expect(computePeriodYm(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12");
    expect(computePeriodYm(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });

  it("cap minutes: null when unset, value when valid, throws on anything malformed", () => {
    expect(loadUsageCapMinutesFromEnv({})).toBeNull();
    expect(loadUsageCapMinutesFromEnv({ [VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR]: "  " })).toBeNull();
    expect(loadUsageCapMinutesFromEnv({ [VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR]: "500" })).toBe(500);
    for (const bad of ["abc", "0", "-5", "1.5", "1000001"]) {
      expect(() => loadUsageCapMinutesFromEnv({ [VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR]: bad }), bad).toThrow(/must be an integer/);
    }
  });
});

// ── ledger idempotency ───────────────────────────────────────────────────────

describe("recordCallUsage", () => {
  it("is idempotent per (provider, callId) across sources and rounds durations", async () => {
    const ledger = memoryLedger();
    const base = { firmId: 7, provider: "vapi", callId: "c1", endedAt: AUG } as const;
    expect(await recordCallUsage({ ...base, durationSec: 61.4, source: "end_of_call_report" }, ledger)).toEqual({ recorded: true });
    expect(await recordCallUsage({ ...base, durationSec: 61.4, source: "end_of_call_report" }, ledger)).toEqual({
      recorded: false,
      reason: "duplicate",
    });
    expect(await recordCallUsage({ ...base, durationSec: 999, source: "reconciliation" }, ledger)).toEqual({
      recorded: false,
      reason: "duplicate",
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]!.durationSec).toBe(61);
    expect(ledger.rows[0]!.periodYm).toBe("2026-08");
  });

  it("refuses impossible durations without touching the ledger", async () => {
    const ledger = memoryLedger();
    for (const durationSec of [-1, Number.NaN, Number.POSITIVE_INFINITY, 86_401]) {
      const result = await recordCallUsage(
        { firmId: 7, provider: "vapi", callId: "cx", durationSec, source: "end_of_call_report", endedAt: AUG },
        ledger,
      );
      expect(result).toEqual({ recorded: false, reason: "invalid_duration" });
    }
    expect(ledger.rows).toHaveLength(0);
  });

  it("aggregates per firm and period", async () => {
    const ledger = memoryLedger();
    await recordCallUsage({ firmId: 7, provider: "vapi", callId: "a", durationSec: 100, source: "end_of_call_report", endedAt: AUG }, ledger);
    await recordCallUsage({ firmId: 7, provider: "vapi", callId: "b", durationSec: 50, source: "reconciliation", endedAt: AUG }, ledger);
    await recordCallUsage({ firmId: 8, provider: "vapi", callId: "c", durationSec: 999, source: "end_of_call_report", endedAt: AUG }, ledger);
    expect(await aggregateUsageForPeriod(7, "2026-08", ledger)).toEqual({ totalSeconds: 150, callCount: 2 });
    expect(await aggregateUsageForPeriod(7, "2026-07", ledger)).toEqual({ totalSeconds: 0, callCount: 0 });
  });
});

// ── cap state machine ────────────────────────────────────────────────────────

describe("checkAndRecordUsageCap", () => {
  function capHarness(totalSeconds: number, insertResult: boolean) {
    const inserts: unknown[] = [];
    const issues: unknown[] = [];
    return {
      inserts,
      issues,
      deps: {
        ledger: {
          insertLedgerRow: async () => ({ inserted: true }),
          sumPeriod: async () => ({ totalSeconds, callCount: 1 }),
        },
        insertCapState: async (row: unknown) => {
          inserts.push(row);
          return { inserted: insertResult };
        },
        openIssue: async (input: unknown) => {
          issues.push(input);
          return {};
        },
        env: { [VOICE_USAGE_INCLUDED_MINUTES_ENV_VAR]: "10" },
        now: () => AUG,
      },
    };
  }

  it("does nothing without a configured cap", async () => {
    const result = await checkAndRecordUsageCap(7, {
      ledger: { insertLedgerRow: async () => ({ inserted: true }), sumPeriod: async () => ({ totalSeconds: 1, callCount: 1 }) },
      env: {},
    });
    expect(result).toEqual({ checked: false, reason: "no_cap_configured" });
  });

  it("under (or exactly at) the cap: no state, no issue", async () => {
    const at = capHarness(600, true); // cap 10 min = 600s, usage == cap
    expect(await checkAndRecordUsageCap(7, at.deps)).toEqual({ checked: true, exceeded: false, totalSeconds: 600, capSeconds: 600 });
    expect(at.inserts).toHaveLength(0);
    expect(at.issues).toHaveLength(0);
  });

  it("first breach records pause_requested and opens ONE critical issue", async () => {
    const h = capHarness(601, true);
    const result = await checkAndRecordUsageCap(7, h.deps);
    expect(result).toEqual({ checked: true, exceeded: true, requested: true, totalSeconds: 601, capSeconds: 600 });
    expect(h.inserts).toEqual([{ firmId: 7, periodYm: "2026-08", capMinutes: 10, usedSecondsAtDetection: 601 }]);
    expect(h.issues).toHaveLength(1);
    const issue = h.issues[0] as Record<string, unknown>;
    expect(issue.level).toBe("critical");
    expect(issue.code).toBe("usage_pause_requested");
    expect(issue.dedupeKey).toBe("7:2026-08");
  });

  it("an existing state row (pause_requested or operator-cleared) suppresses re-detection", async () => {
    const h = capHarness(9999, false); // conflict: a row already exists for the period
    const result = await checkAndRecordUsageCap(7, h.deps);
    expect(result).toEqual({ checked: true, exceeded: true, requested: false, totalSeconds: 9999, capSeconds: 600 });
    expect(h.issues).toHaveLength(0);
  });
});

// ── backfill ─────────────────────────────────────────────────────────────────

describe("runUsageBackfillOnce", () => {
  it("meters unmetered reports idempotently and skips invalid durations", async () => {
    const ledger = memoryLedger();
    await recordCallUsage({ firmId: 7, provider: "vapi", callId: "already", durationSec: 10, source: "end_of_call_report", endedAt: AUG }, ledger);
    const reports: UnmeteredReport[] = [
      { firmId: 7, callId: "already", durationSeconds: 10, createdAt: AUG }, // duplicate — one row stays
      { firmId: 7, callId: "missed", durationSeconds: 42, createdAt: AUG },
      { firmId: 8, callId: "broken", durationSeconds: -3, createdAt: AUG }, // invalid — logged, not thrown
    ];
    const logged: string[] = [];
    const result = await runUsageBackfillOnce({
      listUnmeteredReports: async () => reports,
      ledger,
      logger: (event) => logged.push(event),
    });
    expect(result).toEqual({ scanned: 3, recorded: 1 });
    expect(ledger.rows.map((r) => r.key).sort()).toEqual(["vapi:already", "vapi:missed"]);
    expect(ledger.rows.find((r) => r.key === "vapi:missed")!.source).toBe("reconciliation");
    expect(logged).toEqual(["usage_backfill_invalid_duration"]);
  });

  it("the sweep starter registers nothing while the reconciliation flag is off", () => {
    const logged: Array<[string, Record<string, unknown>]> = [];
    const stop = startUsageBackfillSweep(60_000, {
      env: {},
      listUnmeteredReports: async () => [],
      logger: (event, fields) => logged.push([event, fields]),
    });
    stop();
    expect(logged).toEqual([["usage_backfill_disabled", { flag: "VOICE_RECONCILIATION_ENABLED" }]]);
  });
});

// ── alert transport ──────────────────────────────────────────────────────────

describe("alert transport", () => {
  const COMPLETE = {
    [VOICE_ALERTS_ENABLED_ENV_VAR]: "true",
    RESEND_API_KEY: "re_test_key_value",
    VOICE_ALERTS_FROM: "alerts@sitemint.digital",
    VOICE_ALERTS_TO: "ops@sitemint.digital",
  };

  it("config is null unless the gate is exactly 'true', and throws when enabled but incomplete", () => {
    expect(loadVoiceAlertConfigFromEnv({})).toBeNull();
    expect(loadVoiceAlertConfigFromEnv({ [VOICE_ALERTS_ENABLED_ENV_VAR]: "TRUE" })).toBeNull();
    expect(loadVoiceAlertConfigFromEnv({ [VOICE_ALERTS_ENABLED_ENV_VAR]: "1" })).toBeNull();
    for (const missing of ["RESEND_API_KEY", "VOICE_ALERTS_FROM", "VOICE_ALERTS_TO"]) {
      const env = { ...COMPLETE, [missing]: undefined };
      expect(() => loadVoiceAlertConfigFromEnv(env), missing).toThrow();
    }
    expect(() => loadVoiceAlertConfigFromEnv({ ...COMPLETE, VOICE_ALERTS_TO: "not-an-email" })).toThrow();
    expect(loadVoiceAlertConfigFromEnv(COMPLETE)).toEqual({
      apiKey: "re_test_key_value",
      from: "alerts@sitemint.digital",
      to: "ops@sitemint.digital",
    });
  });

  it("the disabled transport refuses locally — no network surface at all", async () => {
    expect(await createDisabledAlertTransport().send({ subject: "s", text: "t" })).toEqual({
      ok: false,
      reason: "alerts_disabled",
    });
  });

  it("the Resend transport posts to the pinned URL only, and maps failures to reasons without bodies", async () => {
    const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
    const transport = createResendAlertTransport(
      { apiKey: "re_key", from: "a@b.co", to: "c@d.co" },
      async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200 };
      },
    );
    expect(await transport.send({ subject: "Subject", text: "Body" })).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RESEND_EMAILS_URL);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");

    const failing = createResendAlertTransport({ apiKey: "k", from: "a@b.co", to: "c@d.co" }, async () => ({ ok: false, status: 422 }));
    expect(await failing.send({ subject: "s", text: "t" })).toEqual({ ok: false, reason: "provider_status_422" });

    const throwing = createResendAlertTransport({ apiKey: "k", from: "a@b.co", to: "c@d.co" }, async () => {
      throw new Error("boom");
    });
    expect(await throwing.send({ subject: "s", text: "t" })).toEqual({ ok: false, reason: "transport_error" });
  });

  it("critical-issue alerts carry code and firm id, never context payloads, and the notifier never throws", async () => {
    const message = renderCriticalIssueAlert({ firmId: 7, code: "usage_pause_requested", message: "Cap exceeded." });
    expect(message.subject).toContain("usage_pause_requested");
    expect(message.subject).toContain("firm 7");
    expect(message.text).toContain("no customer content");

    const fake = new FakeAlertTransport();
    expect(await notifyCriticalIssue({ firmId: 7, code: "x", message: "m" }, fake)).toEqual({ ok: true });
    expect(fake.sent).toHaveLength(1);

    const rejecting = { send: async () => Promise.reject(new Error("nope")) };
    expect(await notifyCriticalIssue({ firmId: 7, code: "x", message: "m" }, rejecting)).toEqual({
      ok: false,
      reason: "notifier_error",
    });
  });
});

// ── daily digest ─────────────────────────────────────────────────────────────

describe("daily digest", () => {
  const REPOS = {
    sumLedgerWindow: async () => ({ callCount: 4, totalSeconds: 615 }),
    countIssuesOpened: async () => 2,
    countIssuesUnresolved: async () => 3,
    countCallsAwaitingReview: async () => 5,
  };

  it("is gated off by default and runs nothing", async () => {
    expect(isVoiceDigestEnabled({})).toBe(false);
    let touched = false;
    const result = await runDailyDigestOnce({
      env: {},
      listActiveFirmIds: async () => {
        touched = true;
        return [7];
      },
      ...REPOS,
    });
    expect(result).toEqual({ ran: false, firms: 0, sent: 0 });
    expect(touched).toBe(false);
  });

  it("builds yesterday's UTC window, renders counts only, and reports send failures", async () => {
    const windows: Array<[Date, Date]> = [];
    const transport = new FakeAlertTransport();
    const result = await runDailyDigestOnce({
      env: { [VOICE_DIGEST_ENABLED_ENV_VAR]: "true" },
      now: () => new Date("2026-08-15T03:10:00.000Z"),
      listActiveFirmIds: async (start, end) => {
        windows.push([start, end]);
        return [7, 9];
      },
      ...REPOS,
      transport,
    });
    expect(result).toEqual({ ran: true, firms: 2, sent: 2 });
    expect(windows[0]![0].toISOString()).toBe("2026-08-14T00:00:00.000Z");
    expect(windows[0]![1].toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[0]!.subject).toContain("2026-08-14");
    expect(transport.sent[0]!.text).toContain("Calls metered:         4");
    expect(transport.sent[0]!.text).toContain("Minutes used:          10");

    const failingTransport = new FakeAlertTransport();
    failingTransport.result = { ok: false, reason: "provider_status_500" };
    const logged: Array<[string, Record<string, unknown>]> = [];
    const failed = await runDailyDigestOnce({
      env: { [VOICE_DIGEST_ENABLED_ENV_VAR]: "true" },
      now: () => new Date("2026-08-15T03:10:00.000Z"),
      listActiveFirmIds: async () => [7],
      ...REPOS,
      transport: failingTransport,
      logger: (event, fields) => logged.push([event, fields]),
    });
    expect(failed).toEqual({ ran: true, firms: 1, sent: 0 });
    expect(logged).toEqual([["voice_digest_send_failed", { firmId: 7, reason: "provider_status_500" }]]);
  });

  it("digest content is exactly the aggregate shape — a render round-trip", async () => {
    const digest = await buildFirmDigest(7, new Date("2026-08-14T00:00:00.000Z"), new Date("2026-08-15T00:00:00.000Z"), REPOS);
    expect(digest).toMatchObject({ firmId: 7, callCount: 4, totalSeconds: 615, issuesOpened: 2, issuesUnresolved: 3, callsAwaitingReview: 5 });
    const rendered = renderFirmDigest(digest);
    expect(rendered.text).not.toMatch(/\+1\d{9}/); // no phone numbers by construction
  });
});

// ── staff call reviews ───────────────────────────────────────────────────────

describe("call reviews", () => {
  function reviewHarness(exists: boolean): ReviewDeps & { saved: unknown[]; deleted: string[] } {
    const saved: unknown[] = [];
    const deleted: string[] = [];
    return {
      saved,
      deleted,
      callExists: async () => exists,
      upsertReview: async (row) => {
        saved.push(row);
        return { id: 1, ...row, createdAt: AUG, updatedAt: AUG } as unknown as VoiceCallReview;
      },
      deleteReview: async (_firmId, _provider, callId) => {
        deleted.push(callId);
        return true;
      },
      listReviews: async () => [],
    };
  }

  it("accepts only the two review states and bounded notes, and refuses unknown calls", async () => {
    const h = reviewHarness(true);
    expect(await setCallReview(7, "vapi", "c1", "archived", null, h)).toEqual({ ok: false, reason: "invalid_state" });
    expect(await setCallReview(7, "vapi", "c1", "reviewed", "x".repeat(501), h)).toEqual({ ok: false, reason: "invalid_note" });
    expect(await setCallReview(7, "vapi", "c1", "reviewed", 42, h)).toEqual({ ok: false, reason: "invalid_note" });
    expect(h.saved).toHaveLength(0);

    const missing = reviewHarness(false);
    expect(await setCallReview(7, "vapi", "ghost", "reviewed", null, missing)).toEqual({ ok: false, reason: "call_not_found" });

    const flagged = await setCallReview(7, "vapi", "c1", "flagged", "  needs a callback  ", h);
    expect(flagged.ok).toBe(true);
    expect(h.saved[0]).toEqual({ firmId: 7, provider: "vapi", callId: "c1", reviewState: "flagged", note: "needs a callback" });

    const blankNote = await setCallReview(7, "vapi", "c2", "reviewed", "   ", h);
    expect(blankNote.ok).toBe(true);
    expect((h.saved[1] as { note: string | null }).note).toBeNull();
  });

  it("clearing returns the call to pending", async () => {
    const h = reviewHarness(true);
    expect(await clearCallReview(7, "vapi", "c1", h)).toBe(true);
    expect(h.deleted).toEqual(["c1"]);
  });
});

// ── metrics gate ─────────────────────────────────────────────────────────────

describe("metrics gate", () => {
  const TOKEN = "metrics-token-0123456789";

  it("token matching is strict about shape", () => {
    expect(metricsTokenMatches(undefined, TOKEN)).toBe(false);
    expect(metricsTokenMatches(TOKEN, TOKEN)).toBe(false); // bare token, no Bearer
    expect(metricsTokenMatches(`Bearer wrong`, TOKEN)).toBe(false);
    expect(metricsTokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("the admission decision is fail-closed: unconfigured means not_found, never open", () => {
    expect(metricsGateDecision(`Bearer ${TOKEN}`, {})).toBe("not_found");
    expect(metricsGateDecision(`Bearer ${TOKEN}`, { [VOICE_METRICS_TOKEN_ENV_VAR]: "short" })).toBe("not_found");
    expect(metricsGateDecision(undefined, { [VOICE_METRICS_TOKEN_ENV_VAR]: TOKEN })).toBe("unauthorized");
    expect(metricsGateDecision("Bearer nope", { [VOICE_METRICS_TOKEN_ENV_VAR]: TOKEN })).toBe("unauthorized");
    expect(metricsGateDecision(`Bearer ${TOKEN}`, { [VOICE_METRICS_TOKEN_ENV_VAR]: TOKEN })).toBe("ok");
  });
});
