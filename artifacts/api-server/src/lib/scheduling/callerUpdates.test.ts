// J3 (dashboard): the caller hears about approve / decline / cancel / move —
// only on the channels they agreed to, never a fallback, and a failure to
// queue never undoes the business's action.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";
import { notifyCallerOfAppointmentUpdate, type CallerUpdateDeps } from "./callerUpdates.js";
import { composeCallerChangeEmail, composeCallerChangeText } from "../voiceNotifications/callerAckComposer.js";

const REQ = (overrides: Partial<SchedulingAppointmentRequest> = {}) =>
  ({
    id: 1,
    firmId: 2,
    publicId: "abcdef12-1111-4111-8111-111111111111",
    appointmentTypeId: 2,
    status: "booked",
    requestedStartAt: new Date("2026-10-01T16:00:00.000Z"),
    requestedEndAt: new Date("2026-10-01T16:30:00.000Z"),
    timezone: "America/Los_Angeles",
    customerName: "Pat Caller",
    customerPhone: "+15551234567",
    customerEmail: "pat@example.com",
    phoneConsent: true,
    smsConsent: true,
    emailConsent: true,
    ...overrides,
  }) as SchedulingAppointmentRequest;

function deps(opts: { emailThrows?: boolean } = {}) {
  const emails: Array<{ dedupeKey: string; subject: string; body: string }> = [];
  const texts: Array<{ dedupeKey: string; body: string; rawPhone: string }> = [];
  const d: CallerUpdateDeps = {
    loadBusinessName: async () => "SiteMint Digital",
    loadServiceName: async () => "Discovery consultation",
    enqueueEmail: async (i) => {
      if (opts.emailThrows) throw new Error("outbox down");
      emails.push(i);
    },
    enqueueText: async (i) => {
      texts.push(i);
    },
  };
  return { d, emails, texts };
}

describe("who is told, and how", () => {
  it("both channels when the caller agreed to both", async () => {
    const h = deps();
    expect(await notifyCallerOfAppointmentUpdate(2, REQ(), { stage: "cancelled" }, h.d)).toEqual({ email: "queued", text: "queued" });
    expect(h.emails[0]!.subject).toMatch(/^Appointment cancelled — SiteMint Digital/);
    expect(h.texts[0]!.body).toMatch(/^SiteMint Digital: Your Discovery consultation on .* has been cancelled\. Ref abcdef12\. Reply STOP to opt out\.$/);
  });

  it("nothing at all without consent — never a fallback channel", async () => {
    const h = deps();
    expect(await notifyCallerOfAppointmentUpdate(2, REQ({ smsConsent: false, emailConsent: false }), { stage: "booked" }, h.d)).toEqual({
      email: "no_consent",
      text: "no_consent",
    });
    expect(h.emails).toEqual([]);
    expect(h.texts).toEqual([]);
  });

  it("text only when only texts were agreed; consent without a number sends nothing", async () => {
    const h = deps();
    await notifyCallerOfAppointmentUpdate(2, REQ({ emailConsent: false }), { stage: "booked" }, h.d);
    await notifyCallerOfAppointmentUpdate(2, REQ({ emailConsent: false, customerPhone: null }), { stage: "declined" }, h.d);
    expect(h.emails).toEqual([]);
    expect(h.texts).toHaveLength(1);
  });

  it("a reschedule names the new confirmed time and the new reference", async () => {
    const h = deps();
    await notifyCallerOfAppointmentUpdate(
      2,
      REQ(),
      { stage: "rescheduled", newStartAt: new Date("2026-10-02T17:00:00.000Z"), newReference: "fedcba98-2222-4222-8222-222222222222" },
      h.d,
    );
    expect(h.emails[0]!.body).toMatch(/New time:/);
    expect(h.emails[0]!.body).toMatch(/fedcba98-2222/);
    expect(h.texts[0]!.body).toMatch(/has moved to .* and is confirmed\. Ref fedcba98\./);
  });

  it("every stage has its own dedupe key, and 'booked' shares the voice path's", async () => {
    const h = deps();
    for (const stage of ["booked", "declined", "cancelled"] as const) await notifyCallerOfAppointmentUpdate(2, REQ(), { stage }, h.d);
    expect(h.emails.map((e) => e.dedupeKey)).toEqual([
      "caller_ack:appointment:abcdef12-1111-4111-8111-111111111111:booked",
      "caller_ack:appointment:abcdef12-1111-4111-8111-111111111111:declined",
      "caller_ack:appointment:abcdef12-1111-4111-8111-111111111111:cancelled",
    ]);
    expect(new Set(h.texts.map((t) => t.dedupeKey)).size).toBe(3);
  });

  it("an email outbox failure is reported, and the text still goes", async () => {
    const h = deps({ emailThrows: true });
    expect(await notifyCallerOfAppointmentUpdate(2, REQ(), { stage: "cancelled" }, h.d)).toEqual({ email: "failed", text: "queued" });
  });
});

describe("wording never overstates", () => {
  const base = {
    businessName: "SiteMint Digital",
    serviceName: "Discovery consultation",
    startAt: new Date("2026-10-01T16:00:00.000Z"),
    timeZone: "America/Los_Angeles",
    reference: "abcdef12-1111-4111-8111-111111111111",
  };
  it("a declined request says nothing is booked", () => {
    expect(composeCallerChangeEmail({ ...base, change: "declined" }).body).toMatch(/Nothing is booked/);
    expect(composeCallerChangeText({ ...base, change: "declined" })).toMatch(/Nothing is booked/);
  });
  it("names the timezone and never carries a dashboard link", () => {
    const e = composeCallerChangeEmail({ ...base, change: "cancelled" });
    expect(e.body).toContain("America/Los_Angeles");
    expect(e.body).not.toMatch(/dashboard|http/i);
  });
  it("texts stay within one outbox row", () => {
    expect(composeCallerChangeText({ ...base, change: "rescheduled", newStartAt: new Date("2026-10-02T17:00:00.000Z"), newReference: base.reference }).length).toBeLessThan(640);
  });
});

describe("the dashboard actions call it after success only", () => {
  const cal = readFileSync(new URL("../../routes/receptionistCalendar.ts", import.meta.url), "utf8");
  const avail = readFileSync(new URL("../../routes/receptionistAvailability.ts", import.meta.url), "utf8");
  it("approve → booked, booked cancel → cancelled, reschedule → rescheduled", () => {
    expect(cal).toMatch(/if \(outcome === "booked"\) \{\s*await notifyCallerBestEffort\([\s\S]{0,160}\{ stage: "booked" \}/);
    expect(cal).toMatch(/if \(result\.outcome === "cancelled"\) \{\s*await notifyCallerBestEffort\([\s\S]{0,160}\{ stage: "cancelled" \}/);
    expect(cal).toMatch(/if \(result\.outcome === "rescheduled" && result\.replacement\) \{\s*await notifyCallerBestEffort\([\s\S]{0,260}stage: "rescheduled"/);
  });
  it("declining a pending request → declined, after the cancel succeeded", () => {
    const i = avail.indexOf('{ stage: "declined" }');
    expect(i).toBeGreaterThan(avail.indexOf("if (!cancelled) {"));
  });
});
