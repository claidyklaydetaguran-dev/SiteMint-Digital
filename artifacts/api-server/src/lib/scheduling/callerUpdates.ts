// J3 (dashboard): telling the caller when the business approves, declines,
// cancels or moves their appointment.
//
// The voice path already tells a caller what happened on the call. Once the
// call is over, only the dashboard changes the appointment — and until this
// module nothing reached the caller: someone told "the office will confirm"
// was never told it had, or that it had been called off.
//
// Consent is read from the request row, never inferred: a text only when the
// caller agreed to texts (smsConsent, and no STOP since), an email only when
// they agreed to be emailed (emailConsent with an address). No consent, no
// message — never a fallback channel. Everything here is best-effort: the
// business's action has already happened and is not undone because a
// notification could not be queued.

import type { SchedulingAppointmentRequest } from "@workspace/db/schema/scheduling";
import {
  composeCallerAckEmail,
  composeCallerChangeEmail,
  composeCallerChangeText,
} from "../voiceNotifications/callerAckComposer.js";
import { callerAppointmentAckDedupeKey } from "../voiceNotifications/notificationOutbox.js";

export type CallerUpdate =
  | { stage: "booked" }
  | { stage: "declined" }
  | { stage: "cancelled" }
  | { stage: "rescheduled"; newStartAt: Date; newReference: string };

export interface CallerUpdateDeps {
  loadBusinessName: (firmId: number) => Promise<string>;
  loadServiceName: (firmId: number, appointmentTypeId: number) => Promise<string>;
  enqueueEmail: (input: { firmId: number; recipient: string; dedupeKey: string; subject: string; body: string }) => Promise<void>;
  enqueueText: (input: { firmId: number; rawPhone: string; requestConsented: boolean; dedupeKey: string; body: string }) => Promise<unknown>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export interface CallerUpdateResult {
  email: "queued" | "no_consent" | "failed";
  text: "queued" | "no_consent" | "failed";
}

export async function notifyCallerOfAppointmentUpdate(
  firmId: number,
  request: SchedulingAppointmentRequest,
  update: CallerUpdate,
  deps: CallerUpdateDeps,
): Promise<CallerUpdateResult> {
  const result: CallerUpdateResult = { email: "no_consent", text: "no_consent" };
  const wantsEmail = request.emailConsent === true && typeof request.customerEmail === "string" && request.customerEmail !== "";
  const wantsText = request.smsConsent === true && typeof request.customerPhone === "string" && request.customerPhone !== "";
  if (!wantsEmail && !wantsText) return result;

  let businessName = "Your appointment";
  let serviceName = "Appointment";
  try {
    businessName = (await deps.loadBusinessName(firmId)) || businessName;
    serviceName = (await deps.loadServiceName(firmId, request.appointmentTypeId)) || serviceName;
  } catch {
    /* generic wording is still accurate */
  }
  const timeZone = request.timezone || "America/Los_Angeles";
  const base = { businessName, serviceName, startAt: request.requestedStartAt, timeZone, reference: request.publicId };
  const change =
    update.stage === "rescheduled"
      ? { ...base, change: "rescheduled" as const, newStartAt: update.newStartAt, newReference: update.newReference }
      : update.stage === "booked"
        ? null
        : { ...base, change: update.stage };

  if (wantsEmail) {
    try {
      const composed =
        change === null
          ? composeCallerAckEmail({ ...base, status: "booked" })
          : composeCallerChangeEmail(change);
      await deps.enqueueEmail({
        firmId,
        recipient: request.customerEmail!,
        // "booked" shares the voice path's key, so a booking confirmed on the
        // call and then approved again from the dashboard is one email.
        dedupeKey: callerAppointmentAckDedupeKey(request.publicId, update.stage),
        subject: composed.subject,
        body: composed.body,
      });
      result.email = "queued";
    } catch (err) {
      result.email = "failed";
      deps.logger?.("caller_update_email_not_queued", { firmId, stage: update.stage, errorClass: err instanceof Error ? err.name : "unknown" });
    }
  }

  if (wantsText) {
    try {
      const body = composeCallerChangeText(change === null ? { ...base, change: "booked" } : change);
      await deps.enqueueText({
        firmId,
        rawPhone: request.customerPhone!,
        requestConsented: true,
        dedupeKey: `appointment_update:${request.publicId}:${update.stage}`,
        body,
      });
      result.text = "queued";
    } catch (err) {
      result.text = "failed";
      deps.logger?.("caller_update_text_not_queued", { firmId, stage: update.stage, errorClass: err instanceof Error ? err.name : "unknown" });
    }
  }
  return result;
}

export async function productionCallerUpdateDeps(): Promise<CallerUpdateDeps> {
  const [{ db }, { intakeFirms }, { eq }, repo, notifications, sms] = await Promise.all([
    import("@workspace/db"),
    import("@workspace/db/schema"),
    import("drizzle-orm"),
    import("./schedulingRepository.js"),
    import("../voiceNotifications/notificationOutbox.js"),
    import("../voiceSms/outboxService.js"),
  ]);
  return {
    loadBusinessName: async (firmId) => {
      const [row] = await db.select({ name: intakeFirms.name }).from(intakeFirms).where(eq(intakeFirms.id, firmId)).limit(1);
      return row?.name ?? "";
    },
    loadServiceName: async (firmId, typeId) => {
      const config = await repo.buildAvailabilityConfig(firmId);
      return config.appointmentTypes.find((t) => t.id === String(typeId))?.name ?? "";
    },
    enqueueEmail: async (input) => {
      await notifications.enqueueNotification({ ...input, kind: "caller_acknowledgement" });
    },
    enqueueText: (input) => sms.enqueueAppointmentUpdate(input),
  };
}

/** Route helper: best-effort, never throws, never delays the business's answer by failing. */
export async function notifyCallerBestEffort(
  firmId: number,
  request: SchedulingAppointmentRequest | undefined,
  update: CallerUpdate,
  log?: (meta: Record<string, unknown>, msg: string) => void,
): Promise<void> {
  if (!request) return;
  try {
    const result = await notifyCallerOfAppointmentUpdate(firmId, request, update, await productionCallerUpdateDeps());
    log?.({ firmId, stage: update.stage, ...result }, "[appointments] caller update");
  } catch (err) {
    log?.({ firmId, stage: update.stage, errorClass: err instanceof Error ? err.name : "unknown" }, "[appointments] caller update not queued");
  }
}
