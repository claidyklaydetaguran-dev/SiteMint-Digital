// P3: constrained tool-call dispatcher — the only bridge between a live
// conversation and SiteMint's scheduling engine.
//
// Invariants:
//   - firmId arrives ONLY from the webhook route's assistant linkage; tool
//     arguments cannot name, imply, or override a tenant.
//   - Every argument set is zod-validated against the closed catalog before
//     any collaborator runs; validation failure yields a spoken-back safe
//     result and (firm-scoped) diagnostic issue, never an exception.
//   - Results are REDACTED: they confirm actions in plain language with the
//     request's public reference id, and never echo caller contact details
//     back through the provider.
//   - Booking rides the existing advisory-locked, revalidating
//     submitAppointmentRequest — the dispatcher adds no second, weaker
//     booking path. Reschedule composes create-new-then-cancel-old with
//     compensation, so the failure mode is "extra held slot released", never
//     a lost appointment.
//   - Import hygiene matches reconciliation.ts: pure logic imports no
//     database; production collaborators lazy-load inside the defaults.

import type { DayAvailabilityResult } from "../../scheduling/availabilityEngine.js";
import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";
import {
  TOOL_ARG_SCHEMAS,
  isVoiceToolName,
  type BookAppointmentArgs,
  type CancelAppointmentArgs,
  type CheckAvailabilityArgs,
  type RescheduleAppointmentArgs,
} from "./toolCatalog.js";

export interface ToolCallRequest {
  toolCallId: string;
  name: string;
  args: unknown;
}

export interface ToolCallResult {
  toolCallId: string;
  /** Plain sentence(s) for the model to speak from. Never raw JSON dumps, never caller PII echoes. */
  result: string;
}

type SlotMutation =
  | { ok: true; request: SchedulingAppointmentRequest }
  | { ok: false; reason: "slot_no_longer_available" | "unknown_appointment_type" };

export interface ToolSchedulingDeps {
  now?: () => Date;
  getDayAvailability: (firmId: number, dateKey: string, appointmentTypeId: string, now: Date) => Promise<DayAvailabilityResult>;
  /** Business timezone + bookable types — one call, one consistent snapshot. */
  getSchedulingContext: (firmId: number) => Promise<{ timezone: string; types: Array<{ id: string; name: string; durationMin: number }> }>;
  /** Firm-scoped lookup of an existing request by its public reference id. */
  findRequestByPublicId: (firmId: number, publicId: string) => Promise<SchedulingAppointmentRequest | undefined>;
  submitAppointmentRequest: (
    firmId: number,
    appointmentTypeId: string,
    startUtc: Date,
    contact: { name: string; phone: string | null; email: string | null },
    consent: { phoneConsent: boolean; smsConsent: boolean; emailConsent: boolean },
    now: Date,
  ) => Promise<SlotMutation>;
  cancelAppointmentRequestByPublicId: (firmId: number, publicId: string) => Promise<boolean>;
  /** Firm-scoped issue sink for diagnostics; injected so tests stay DB-free. */
  openIssue?: (input: {
    firmId: number;
    level: "info" | "warning" | "error";
    code: "tool_invalid_args" | "tool_execution_failed";
    message: string;
    dedupeKey: string;
    context?: Record<string, unknown>;
  }) => Promise<unknown>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function defaultDeps(): Promise<ToolSchedulingDeps> {
  const repo = await import("../../scheduling/schedulingRepository.js");
  const issues = await import("../../voiceIssues/voiceIssueService.js");
  return {
    getDayAvailability: (firmId, dateKey, typeId, now) => repo.getDayAvailability(firmId, dateKey, typeId, now),
    getSchedulingContext: async (firmId) => {
      const config = await repo.buildAvailabilityConfig(firmId);
      return {
        timezone: config.timezone,
        types: config.appointmentTypes.map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin })),
      };
    },
    findRequestByPublicId: async (firmId, publicId) => {
      const rows = await repo.listAppointmentRequests(firmId);
      return rows.find((r) => r.publicId === publicId);
    },
    submitAppointmentRequest: (firmId, typeId, startUtc, contact, consent, now) =>
      repo.submitAppointmentRequest(firmId, typeId, startUtc, contact, consent, "ai_receptionist", now),
    cancelAppointmentRequestByPublicId: (firmId, publicId) => repo.cancelAppointmentRequestByPublicId(firmId, publicId),
    openIssue: (input) => issues.openVoiceIssue(input),
  };
}

const SAFE_INVALID = "I couldn't use those details. Let me take your information and have the office follow up instead.";
const SAFE_FAILED = "I'm having trouble with the scheduling system right now. The office will follow up to confirm a time.";
const MAX_OFFERED_SLOTS = 6;

function formatSlotForSpeech(startUtc: Date, timezone: string): string {
  // Business-timezone, speech-friendly ("Tuesday, September 1 at 2:30 PM").
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(startUtc);
}

function dayReasonSentence(reason: DayAvailabilityResult["reason"]): string {
  switch (reason) {
    case "blocked": return "The office isn't taking appointments that day.";
    case "outside_hours": return "The office is closed that day.";
    case "fully_booked": return "That day is fully booked.";
    case "past_booking_window": return "That date is too soon to book.";
    case "beyond_advance_window": return "That date is further out than the office books.";
    case "open": return "No open times remain on that day.";
  }
}

// ── individual executors ─────────────────────────────────────────────────────

async function runCheckAvailability(
  firmId: number,
  args: CheckAvailabilityArgs,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  const { timezone, types } = await deps.getSchedulingContext(firmId);
  if (types.length === 0) return "Online scheduling isn't set up yet; the office will call back to arrange a time.";

  const type = args.appointmentTypeId ? types.find((t) => t.id === args.appointmentTypeId) : types[0];
  if (!type) return "That appointment type isn't offered. " + typeMenu(types);

  const day = await deps.getDayAvailability(firmId, args.date, type.id, now);
  if (day.slots.length === 0) return dayReasonSentence(day.reason);

  const offered = day.slots.slice(0, MAX_OFFERED_SLOTS);
  const spoken = offered
    .map((s) => `${formatSlotForSpeech(s.startUtc, timezone)} (slot ${s.startUtc.toISOString()})`)
    .join("; ");
  return `Open ${type.name} times: ${spoken}. Offer these to the caller; book with the exact slot value.`;
}

function typeMenu(types: Array<{ id: string; name: string; durationMin: number }>): string {
  return (
    "Available appointment types: " +
    types.map((t) => `${t.name} (${t.durationMin} minutes, id ${t.id})`).join("; ") +
    "."
  );
}

async function runBookAppointment(
  firmId: number,
  args: BookAppointmentArgs,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  const startUtc = new Date(args.startIso);
  const result = await deps.submitAppointmentRequest(
    firmId,
    args.appointmentTypeId,
    startUtc,
    { name: args.customerName, phone: args.customerPhone ?? null, email: args.customerEmail ?? null },
    { phoneConsent: true, smsConsent: args.smsConsent === true, emailConsent: false },
    now,
  );
  if (!result.ok) {
    return result.reason === "slot_no_longer_available"
      ? "That time was just taken. Check availability again and offer another slot."
      : "That appointment type isn't valid. Check availability first and use its appointment type id.";
  }
  return `Booked, pending the office's confirmation. Reference id ${result.request.publicId}. Tell the caller the office will confirm shortly.`;
}

async function runCancelAppointment(
  firmId: number,
  args: CancelAppointmentArgs,
  deps: ToolSchedulingDeps,
): Promise<string> {
  const cancelled = await deps.cancelAppointmentRequestByPublicId(firmId, args.requestId);
  return cancelled
    ? "The appointment is cancelled."
    : "I couldn't find an appointment with that reference. The office can help if the caller doesn't have it.";
}

async function runRescheduleAppointment(
  firmId: number,
  args: RescheduleAppointmentArgs,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  // Order of operations: verify the old request exists (firm-scoped), book
  // the new slot first (revalidated + advisory-locked, preserving the old
  // request's type and contact details), then cancel the old reference.
  // Compensation: if the old reference fails to cancel after the new one was
  // created, release the new one so nothing is double-held.
  const old = await deps.findRequestByPublicId(firmId, args.requestId);
  if (!old) {
    return "I couldn't find an appointment with that reference. The office can help if the caller doesn't have it.";
  }

  const created = await deps.submitAppointmentRequest(
    firmId,
    String(old.appointmentTypeId),
    new Date(args.newStartIso),
    { name: old.customerName, phone: old.customerPhone ?? null, email: old.customerEmail ?? null },
    { phoneConsent: old.phoneConsent, smsConsent: old.smsConsent, emailConsent: old.emailConsent },
    now,
  );
  if (!created.ok) {
    return created.reason === "slot_no_longer_available"
      ? "That new time was just taken. Check availability again and offer another slot."
      : SAFE_FAILED;
  }

  const cancelledOld = await deps.cancelAppointmentRequestByPublicId(firmId, args.requestId);
  if (!cancelledOld) {
    // Compensate: never leave two live holds for one caller intent.
    await deps.cancelAppointmentRequestByPublicId(firmId, created.request.publicId);
    return "I couldn't find the original appointment to move. The office can help with the existing booking.";
  }
  return `Rescheduled, pending the office's confirmation. New reference id ${created.request.publicId}.`;
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export async function dispatchToolCalls(
  firmId: number,
  calls: readonly ToolCallRequest[],
  deps?: ToolSchedulingDeps,
): Promise<ToolCallResult[]> {
  const resolved = deps ?? (await defaultDeps());
  const now = resolved.now?.() ?? new Date();
  const results: ToolCallResult[] = [];

  for (const call of calls) {
    results.push({ toolCallId: call.toolCallId, result: await executeOne(firmId, call, resolved, now) });
  }
  return results;
}

async function executeOne(
  firmId: number,
  call: ToolCallRequest,
  deps: ToolSchedulingDeps,
  now: Date,
): Promise<string> {
  if (!isVoiceToolName(call.name)) {
    deps.logger?.("voice_tool_unknown", { firmId, name: String(call.name).slice(0, 40) });
    return SAFE_INVALID;
  }

  const parsed = TOOL_ARG_SCHEMAS[call.name].safeParse(call.args ?? {});
  if (!parsed.success) {
    deps.logger?.("voice_tool_invalid_args", { firmId, tool: call.name });
    try {
      await deps.openIssue?.({
        firmId,
        level: "info",
        code: "tool_invalid_args",
        message: `The assistant sent arguments that failed validation for ${call.name}.`,
        dedupeKey: `${call.name}:${call.toolCallId}`,
        context: { tool: call.name, toolCallId: call.toolCallId },
      });
    } catch { /* diagnostics are best-effort */ }
    return SAFE_INVALID;
  }

  try {
    switch (call.name) {
      case "check_availability":
        return await runCheckAvailability(firmId, parsed.data as CheckAvailabilityArgs, deps, now);
      case "book_appointment":
        return await runBookAppointment(firmId, parsed.data as BookAppointmentArgs, deps, now);
      case "cancel_appointment":
        return await runCancelAppointment(firmId, parsed.data as CancelAppointmentArgs, deps);
      case "reschedule_appointment":
        return await runRescheduleAppointment(firmId, parsed.data as RescheduleAppointmentArgs, deps, now);
    }
  } catch (err) {
    deps.logger?.("voice_tool_execution_failed", {
      firmId,
      tool: call.name,
      errorClass: err instanceof Error ? err.name : "unknown",
    });
    try {
      await deps.openIssue?.({
        firmId,
        level: "error",
        code: "tool_execution_failed",
        message: `Executing ${call.name} threw; the caller was given the safe fallback line.`,
        dedupeKey: `${call.name}:${call.toolCallId}`,
        context: { tool: call.name, toolCallId: call.toolCallId },
      });
    } catch { /* diagnostics are best-effort */ }
    return SAFE_FAILED;
  }
}
