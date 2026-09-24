import { describe, it, expect } from "vitest";
import { runSignupJob, backoffDelayMs, reconcileMissingSignupJobs, type SignupJobDeps } from "./pipeline.js";
import type { VoiceSignupJob } from "@workspace/db/schema/voice";

// The pipeline's job handlers, exercised against injected fakes. The durable
// half (unique firm×kind enqueue, SKIP LOCKED claim, backoff persistence) is
// exercised live on staging — a queued row alone is never reported as done.

const NOW = new Date("2026-09-10T12:00:00Z");

function job(kind: string, payload: Record<string, unknown> = {}): VoiceSignupJob {
  return {
    id: 1,
    firmId: 42,
    kind,
    status: "processing",
    attempts: 0,
    maxAttempts: 5,
    payload,
    result: {},
    lastError: null,
    nextAttemptAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as VoiceSignupJob;
}

function deps(overrides: Partial<SignupJobDeps>): SignupJobDeps {
  return {
    findLeadByEmail: async () => undefined,
    insertLead: async () => ({ id: 900 }),
    tagLead: async () => {},
    requestVerificationEmail: async () => ({ sent: true }),
    sendWelcomeEmail: async () => ({ ok: true }),
    findFirmEmail: async () => ({ email: "owner@example.com", name: "Test Firm" }),
    now: () => NOW,
    ...overrides,
  };
}

describe("crm_link", () => {
  it("creates one lead with the receptionist tag and source", async () => {
    const inserts: unknown[] = [];
    const d = deps({
      insertLead: async (values) => {
        inserts.push(values);
        return { id: 901 };
      },
    });
    const out = await runSignupJob(job("crm_link", { email: "New@Biz.com", fullName: "Ana Reyes", businessName: "Reyes Dental", phone: "555", industry: "dental" }), d);
    expect(out).toEqual({ ok: true, result: { crmLeadId: 901, crmOutcome: "created" } });
    expect(inserts).toHaveLength(1);
    const v = inserts[0] as Record<string, unknown>;
    expect(v.email).toBe("new@biz.com");
    expect(v.source).toBe("AI Receptionist Signup");
    expect(v.tags).toEqual(["AI Receptionist"]);
    expect(v.company).toBe("Reyes Dental");
    // The CRM record must never carry secrets.
    expect(JSON.stringify(v)).not.toMatch(/password|hash|token/i);
  });

  it("links an existing lead instead of duplicating it", async () => {
    const tagged: unknown[] = [];
    const d = deps({
      findLeadByEmail: async () => ({ id: 77, tags: ["Discovery"], notes: "old" }),
      insertLead: async () => {
        throw new Error("must not insert");
      },
      tagLead: async (leadId, tags, note) => {
        tagged.push({ leadId, tags, note });
      },
    });
    const out = await runSignupJob(job("crm_link", { email: "x@y.com" }), d);
    expect(out).toEqual({ ok: true, result: { crmLeadId: 77, crmOutcome: "linked" } });
    expect(tagged).toEqual([
      { leadId: 77, tags: ["Discovery", "AI Receptionist"], note: "AI Receptionist account created 2026-09-10 (firm 42)." },
    ]);
  });

  it("is idempotent for an already-linked lead (no writes at all)", async () => {
    const d = deps({
      findLeadByEmail: async () => ({ id: 77, tags: ["AI Receptionist"], notes: null }),
      insertLead: async () => {
        throw new Error("must not insert");
      },
      tagLead: async () => {
        throw new Error("must not tag twice");
      },
    });
    const out = await runSignupJob(job("crm_link", { email: "x@y.com" }), d);
    expect(out).toEqual({ ok: true, result: { crmLeadId: 77, crmOutcome: "already_linked" } });
  });

  it("fails permanently when the payload has no email", async () => {
    const out = await runSignupJob(job("crm_link", {}), deps({}));
    expect(out).toEqual({ ok: false, retryable: false, error: "payload_missing_email" });
  });
});

describe("verification_email", () => {
  it("records provider acceptance, never delivery", async () => {
    const out = await runSignupJob(job("verification_email"), deps({}));
    expect(out).toEqual({ ok: true, result: { emailAccepted: true } });
  });

  it("retries a delivery outage but not a missing address", async () => {
    const outage = await runSignupJob(
      job("verification_email"),
      deps({ requestVerificationEmail: async () => ({ sent: false, reason: "delivery_unavailable" }) }),
    );
    expect(outage).toEqual({ ok: false, retryable: true, error: "delivery_unavailable" });
    const noEmail = await runSignupJob(
      job("verification_email"),
      deps({ requestVerificationEmail: async () => ({ sent: false, reason: "no_email" }) }),
    );
    expect(noEmail).toEqual({ ok: false, retryable: false, error: "no_email_on_firm" });
  });
});

describe("welcome_email", () => {
  it("sends once to the firm's address", async () => {
    const sent: unknown[] = [];
    const d = deps({
      sendWelcomeEmail: async (to, name) => {
        sent.push({ to, name });
        return { ok: true };
      },
    });
    const out = await runSignupJob(job("welcome_email"), d);
    expect(out).toEqual({ ok: true, result: { emailAccepted: true } });
    expect(sent).toEqual([{ to: "owner@example.com", name: "Test Firm" }]);
  });

  it("retries provider failure", async () => {
    const out = await runSignupJob(
      job("welcome_email"),
      deps({ sendWelcomeEmail: async () => ({ ok: false, reason: "alerts_disabled" }) }),
    );
    expect(out).toEqual({ ok: false, retryable: true, error: "alerts_disabled" });
  });
});

describe("reconciliation", () => {
  it("creates exactly the missing work — one enqueue per account lacking a crm_link job", async () => {
    const calls: unknown[] = [];
    const out = await reconcileMissingSignupJobs({
      findAccountsMissingCrmLink: async () => [
        { id: 7, email: "a@b.com", name: "A Co", industry: "hvac" },
        { id: 9, email: null, name: "No Email LLC", industry: null },
        { id: 11, email: "c@d.com", name: "C Co", industry: null },
      ],
      enqueue: async (firmId, payload, kinds) => {
        calls.push({ firmId, payload, kinds });
      },
    });
    // The no-email account is skipped (nothing useful can be created for it);
    // both real accounts get crm_link + verification_email and nothing else.
    expect(out).toEqual({ enqueued: 2 });
    expect(calls).toEqual([
      { firmId: 7, payload: { businessName: "A Co", email: "a@b.com", industry: "hvac" }, kinds: ["crm_link", "verification_email"] },
      { firmId: 11, payload: { businessName: "C Co", email: "c@d.com", industry: undefined }, kinds: ["crm_link", "verification_email"] },
    ]);
  });

  it("is a no-op when nothing is missing", async () => {
    const out = await reconcileMissingSignupJobs({
      findAccountsMissingCrmLink: async () => [],
      enqueue: async () => { throw new Error("must not enqueue"); },
    });
    expect(out).toEqual({ enqueued: 0 });
  });
});

describe("backoff", () => {
  it("doubles from 30s and caps at an hour", () => {
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(20)).toBe(3_600_000);
  });
});
