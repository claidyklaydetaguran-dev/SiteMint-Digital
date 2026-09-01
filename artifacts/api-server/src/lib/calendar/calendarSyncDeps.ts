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

import { markBookedInDb, clearProviderEventInDb, type CalendarSyncDeps } from "./calendarEventSync.js";
import { GoogleCalendarEventWriter } from "./eventWriter.js";
import { getActiveConnection, updateAccessToken } from "./calendarConnectionsRepository.js";
import { listAppointmentRequests } from "../scheduling/schedulingRepository.js";
import { openVoiceIssue } from "../voiceIssues/voiceIssueService.js";

/**
 * `findRequest` reuses the firm-scoped list exactly as the voice tool
 * dispatcher does — there is no by-public-id repository query, and a foreign
 * public id is simply absent from a firm's own list, so cross-firm lookup
 * fails as "not found" rather than needing a separate ownership check.
 */
export function calendarSyncDeps(): CalendarSyncDeps {
  return {
    getActiveConnection,
    writer: new GoogleCalendarEventWriter({ updateAccessToken }),
    findRequest: async (firmId, publicId) =>
      (await listAppointmentRequests(firmId)).find((r) => r.publicId === publicId),
    markBooked: markBookedInDb,
    clearProviderEvent: clearProviderEventInDb,
    openIssue: (input) => openVoiceIssue(input),
  };
}
