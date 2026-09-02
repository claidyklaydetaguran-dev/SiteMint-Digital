// M4: the production wiring for calendarEventSync.ts.
//
// That module carried the whole approve/remove/reconcile lifecycle — and its
// CALENDAR_WRITE_ENABLED gate — but nothing imported it, so no reachable code
// path could write a calendar event and the flag had no runtime effect at all.
// This is the single place those collaborators are assembled, shared by the
// calendar router (approve/reconcile) and the availability router's cancel
// follow-up, so there is exactly one definition of how a live write is wired.
//
// Nothing here widens the surface: every dependency is firm-scoped, the writer
// is the narrow create/patch/delete client, and issues are operator-safe.

import {
  markBookedInDb,
  clearProviderEventInDb,
  cancelBookedInDb,
  markRescheduledInDb,
  type BookedLifecycleDeps,
} from "./calendarEventSync.js";
import { GoogleCalendarEventWriter } from "./eventWriter.js";
import { getActiveConnection, updateAccessToken } from "./calendarConnectionsRepository.js";
import {
  listAppointmentRequests,
  submitAppointmentRequest,
  cancelAppointmentRequestByPublicId,
} from "../scheduling/schedulingRepository.js";
import { openVoiceIssue } from "../voiceIssues/voiceIssueService.js";
import { getFreeBusyProvider } from "./index.js";

/**
 * `findRequest` reuses the firm-scoped list exactly as the voice tool
 * dispatcher does — there is no by-public-id repository query, and a foreign
 * public id is simply absent from a firm's own list, so cross-firm lookup
 * fails as "not found" rather than needing a separate ownership check.
 *
 * `submitReplacement` is the same availability-validated submission the
 * appointments page uses (same slot rules, same free/busy read), carrying the
 * original caller's contact and consent unchanged; `discardReplacement` is
 * the ordinary pending/held cancel, because a replacement that just lost its
 * race is still pending_review.
 */
export function calendarSyncDeps(): BookedLifecycleDeps {
  return {
    getActiveConnection,
    writer: new GoogleCalendarEventWriter({ updateAccessToken }),
    findRequest: async (firmId, publicId) =>
      (await listAppointmentRequests(firmId)).find((r) => r.publicId === publicId),
    markBooked: markBookedInDb,
    clearProviderEvent: clearProviderEventInDb,
    cancelBooked: cancelBookedInDb,
    markRescheduled: markRescheduledInDb,
    submitReplacement: async (firmId, before, startUtc) => {
      const result = await submitAppointmentRequest(
        firmId,
        String(before.appointmentTypeId),
        startUtc,
        { name: before.customerName, phone: before.customerPhone, email: before.customerEmail },
        { phoneConsent: before.phoneConsent, smsConsent: before.smsConsent, emailConsent: before.emailConsent },
        "manual",
        new Date(),
        getFreeBusyProvider(),
      );
      if (!result.ok) return { ok: false };
      return {
        ok: true,
        publicId: result.request.publicId,
        startUtc: result.request.requestedStartAt,
        endUtc: result.request.requestedEndAt,
      };
    },
    discardReplacement: async (firmId, publicId) => {
      await cancelAppointmentRequestByPublicId(firmId, publicId);
    },
    openIssue: (input) => openVoiceIssue(input),
  };
}
