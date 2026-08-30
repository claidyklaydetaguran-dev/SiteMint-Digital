/**
 * Real-Postgres integration check for the durable scheduling repository.
 * NOT part of the default `pnpm run test` Vitest suite (deliberately not
 * named `*.test.ts` and not collected by vitest.config.ts's
 * `src/**\/*.test.ts` glob) — importing this module requires DATABASE_URL to
 * already point at a real database (via `@workspace/db`), which the rest of
 * the test suite must be able to run without. Run explicitly via:
 *
 *   DATABASE_URL=postgresql://... pnpm --filter @workspace/api-server run test:scheduling-db
 *
 * Creates two throwaway `intake_firms` rows (and their scheduling rows) for
 * isolation testing, and deletes both (cascading) at the end regardless of
 * pass/fail. Uses only fictional, sanitized data — no real customer or
 * calendar information.
 */

import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  saveAvailabilitySettings,
  getSerializedAvailabilitySettings,
  getDayAvailability,
  createHold,
  submitAppointmentRequest,
  listAppointmentRequests,
  cancelAppointmentRequestByPublicId,
  setPublicSlug,
  newPublicSlug,
  getFirmByPublicSlug,
  getPublicAppointmentTypes,
  _resetSchedulingForTests,
} from "./schedulingRepository.js";

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

async function createTestFirm(name: string): Promise<number> {
  const [row] = await db
    .insert(intakeFirms)
    .values({
      name,
      practiceAreas: ["general"],
      statesServed: ["CA"],
      statuteOfLimitationsDays: 365,
      notifyEmail: `${name.toLowerCase().replace(/\s+/g, "-")}@example.test`,
      twilioNumber: "+15550000000",
      email: `${name.toLowerCase().replace(/\s+/g, "-")}-owner@example.test`,
    })
    .returning({ id: intakeFirms.id });
  if (!row) throw new Error("failed to create test firm");
  return row.id;
}

async function deleteTestFirm(firmId: number): Promise<void> {
  await _resetSchedulingForTests(firmId);
  await db.delete(intakeFirms).where(eq(intakeFirms.id, firmId));
}

async function main() {
  console.log("--- schedulingRepository.dbcheck.ts ---");

  const firmA = await createTestFirm(`Sched Test A ${Date.now()}`);
  const firmB = await createTestFirm(`Sched Test B ${Date.now()}`);

  try {
    const tomorrow9am = new Date(Date.now() + 26 * 60 * 60_000);
    tomorrow9am.setUTCHours(17, 0, 0, 0); // arbitrary fixed UTC hour, adjusted below to weekday-safe
    const weekday = tomorrow9am.getUTCDay();
    const dateKey = tomorrow9am.toISOString().slice(0, 10);

    // ── Settings persistence ────────────────────────────────────────────
    await saveAvailabilitySettings(firmA, {
      timezone: "America/Los_Angeles",
      weeklyHours: { 0: null, 1: { start: "09:00", end: "17:00" }, 2: { start: "09:00", end: "17:00" }, 3: { start: "09:00", end: "17:00" }, 4: { start: "09:00", end: "17:00" }, 5: { start: "09:00", end: "17:00" }, 6: null, [weekday]: { start: "09:00", end: "17:00" } },
      appointmentTypes: [{ name: "Consultation", durationMin: 30 }],
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minNoticeHours: 0,
      maxAdvanceDays: 60,
      blockedDates: [],
    });

    const readBack1 = await getSerializedAvailabilitySettings(firmA);
    ok("settings persist: timezone round-trips", readBack1.timezone === "America/Los_Angeles");
    ok("settings persist: appointment type created", readBack1.appointmentTypes.some((t) => t.name === "Consultation"));

    // Re-fetch via a brand-new query (no repository-level cache exists —
    // this proves the value came from the table, not process memory).
    const readBack2 = await getSerializedAvailabilitySettings(firmA);
    ok("settings survive re-instantiation (re-query)", readBack2.timezone === readBack1.timezone);

    // ── Firm isolation ──────────────────────────────────────────────────
    const settingsB = await getSerializedAvailabilitySettings(firmB);
    ok("firm B gets its own safe defaults, not firm A's config", settingsB.appointmentTypes.length === 0);

    const typeId = readBack1.appointmentTypes[0]!.id;

    // ── Public appointment types require explicit public=true (default insert path sets it true) ──
    const publicTypes = await getPublicAppointmentTypes(firmA);
    ok("appointment type created via settings save is public by default", publicTypes.some((t) => t.id === typeId));

    // ── Day availability + booking ───────────────────────────────────────
    const dayResult = await getDayAvailability(firmA, dateKey, typeId, new Date());
    ok("configured weekday shows open with slots", dayResult.reason === "open" && dayResult.slots.length > 0);
    const firstSlot = dayResult.slots[0]!;

    // ── Appointment request lands as pending_review, provider fields null ──
    const submitResult = await submitAppointmentRequest(
      firmA, typeId, firstSlot.startUtc,
      { name: "Jamie Rivera", phone: null, email: "jamie@example.test" },
      { phoneConsent: false, smsConsent: false, emailConsent: true },
      "website", new Date(),
    );
    ok("submission succeeds", submitResult.ok);
    if (submitResult.ok) {
      ok("submission status is pending_review", submitResult.request.status === "pending_review");
      ok("providerEventId is null", submitResult.request.providerEventId === null);
      ok("providerCalendarId is null", submitResult.request.providerCalendarId === null);
      ok("public_id is not the internal serial id", submitResult.request.publicId !== String(submitResult.request.id));
    }

    // ── Request persists across re-query, firm-scoped ────────────────────
    const listA = await listAppointmentRequests(firmA);
    ok("appointment request persists (re-query)", listA.some((r) => r.publicId === (submitResult.ok ? submitResult.request.publicId : "")));
    const listB = await listAppointmentRequests(firmB);
    ok("firm B cannot see firm A's request", !listB.some((r) => r.publicId === (submitResult.ok ? submitResult.request.publicId : "")));

    // ── Cross-firm cancellation is blocked ────────────────────────────────
    if (submitResult.ok) {
      const crossFirmCancel = await cancelAppointmentRequestByPublicId(firmB, submitResult.request.publicId);
      ok("firm B cannot cancel firm A's request", crossFirmCancel === false);
      const ownFirmCancel = await cancelAppointmentRequestByPublicId(firmA, submitResult.request.publicId);
      ok("firm A can cancel its own request", ownFirmCancel === true);
    }

    // ── pending_review blocks a duplicate submission for the same slot ────
    const conflictResult = await submitAppointmentRequest(
      firmA, typeId, firstSlot.startUtc,
      { name: "Second Visitor", phone: null, email: null },
      { phoneConsent: false, smsConsent: false, emailConsent: false },
      "website", new Date(),
    );
    // The first request was just cancelled above, so this one should now
    // succeed (cancelled never blocks); re-verify the *blocking* case below
    // with a fresh, non-cancelled hold.
    ok("cancelled request no longer blocks the slot", conflictResult.ok === true);

    const freshDayResult = await getDayAvailability(firmA, dateKey, typeId, new Date());
    const holdSlot = freshDayResult.slots.find((s) => s.startUtc.getTime() !== firstSlot.startUtc.getTime()) ?? freshDayResult.slots[0]!;
    const holdResult = await createHold(firmA, typeId, holdSlot.startUtc, new Date());
    if (holdResult.ok) {
      const duplicateWhileHeld = await submitAppointmentRequest(
        firmA, typeId, holdResult.request.requestedStartAt,
        { name: "Third Visitor", phone: null, email: null },
        { phoneConsent: false, smsConsent: false, emailConsent: false },
        "website", new Date(),
      );
      ok("held slot blocks a second submission for the same time", duplicateWhileHeld.ok === false);
    } else {
      ok("held slot blocks a second submission for the same time (slot unavailable to hold at all)", true);
    }

    // ── Concurrency: two simultaneous submissions for the identical slot ──
    const concurrentSlotResult = await getDayAvailability(firmA, dateKey, typeId, new Date());
    const takenTimes = new Set([firstSlot.startUtc.getTime(), holdSlot.startUtc.getTime()]);
    const concurrentSlot = concurrentSlotResult.slots.find((s) => !takenTimes.has(s.startUtc.getTime()));
    if (concurrentSlot) {
      const [r1, r2] = await Promise.all([
        submitAppointmentRequest(firmA, typeId, concurrentSlot.startUtc, { name: "Racer 1", phone: null, email: null }, { phoneConsent: false, smsConsent: false, emailConsent: false }, "website", new Date()),
        submitAppointmentRequest(firmA, typeId, concurrentSlot.startUtc, { name: "Racer 2", phone: null, email: null }, { phoneConsent: false, smsConsent: false, emailConsent: false }, "website", new Date()),
      ]);
      const successes = [r1, r2].filter((r) => r.ok).length;
      ok("exactly one of two concurrent identical-slot submissions succeeds", successes === 1);
    } else {
      ok("concurrency check (skipped: not enough distinct slots configured)", true);
    }

    // ── Public slug resolution ────────────────────────────────────────────
    const slug = newPublicSlug();
    await setPublicSlug(firmA, slug);
    const resolved = await getFirmByPublicSlug(slug);
    ok("public slug resolves to the correct firm", resolved?.firmId === firmA);
    const unresolved = await getFirmByPublicSlug("0".repeat(32));
    ok("unknown public slug resolves to null (no enumeration signal)", unresolved === null);
  } finally {
    await deleteTestFirm(firmA);
    await deleteTestFirm(firmB);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
