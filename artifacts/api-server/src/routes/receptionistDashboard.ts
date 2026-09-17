// GET /api/receptionist/dashboard — the dashboard's figures, trend and recent
// activity for the signed-in business, built from its own records only.
// Each source is read on its own; one that fails is reported as unavailable
// rather than shown as zero.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceContacts, voiceMessages } from "@workspace/db/schema/voice";
import { schedulingAppointmentRequests } from "@workspace/db/schema/scheduling";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { buildDashboardSummary, type BookingFact, type CallFact, type ContactFact, type MessageFact } from "../lib/dashboard/dashboardSummary.js";

const router: IRouter = Router();

const WINDOW_MS = 30 * 86_400_000;

async function attempt<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

router.get("/receptionist/dashboard", requireReceptionistAuth, async (req: Request, res: Response) => {
  const firmId = req.firmId!;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  try {
    const [timezone, calls, messages, bookings, contacts, contactsTotal] = await Promise.all([
      attempt(async () => (await import("../lib/accountProfile/profileService.js")).readBusinessProfile(firmId)).then(
        (p) => (p && p.timezone ? p.timezone : "UTC"),
      ),
      attempt(async (): Promise<CallFact[]> => {
        const { listRealCallsForFirm } = await import("../lib/voice/webhooks/realCallsRepository.js");
        const records = await listRealCallsForFirm(firmId);
        return records
          .filter((r) => !r.synthetic && r.firstEventAt.getTime() >= since.getTime())
          .map((r) => ({
            callId: r.callId,
            channel: r.channel,
            state: r.state,
            startedAt: r.firstEventAt,
            durationSec: r.durationSec,
            callerNumberDisplay: r.callerNumberDisplay,
          }));
      }),
      attempt(async (): Promise<MessageFact[]> =>
        db
          .select({
            id: voiceMessages.id,
            topic: voiceMessages.topic,
            urgency: voiceMessages.urgency,
            followUpStatus: voiceMessages.followUpStatus,
            callerName: voiceMessages.callerName,
            createdAt: voiceMessages.createdAt,
          })
          .from(voiceMessages)
          .where(eq(voiceMessages.firmId, firmId))
          .orderBy(desc(voiceMessages.createdAt))
          .limit(200),
      ),
      attempt(async (): Promise<BookingFact[]> => {
        const rows = await db
          .select({
            publicId: schedulingAppointmentRequests.publicId,
            status: schedulingAppointmentRequests.status,
            startAt: schedulingAppointmentRequests.requestedStartAt,
            customerName: schedulingAppointmentRequests.customerName,
            createdAt: schedulingAppointmentRequests.createdAt,
          })
          .from(schedulingAppointmentRequests)
          // Recent requests, plus anything still ahead or still waiting, however long ago it was made.
          .where(
            and(
              eq(schedulingAppointmentRequests.firmId, firmId),
              or(
                gte(schedulingAppointmentRequests.createdAt, since),
                gte(schedulingAppointmentRequests.requestedStartAt, now),
                inArray(schedulingAppointmentRequests.status, ["pending_review", "requested"]),
              ),
            ),
          )
          .orderBy(desc(schedulingAppointmentRequests.createdAt))
          .limit(200);
        return rows.map((r) => ({ ...r, publicId: String(r.publicId) }));
      }),
      attempt(async (): Promise<ContactFact[]> =>
        db
          .select({ id: voiceContacts.id, name: voiceContacts.displayName, createdAt: voiceContacts.createdAt })
          .from(voiceContacts)
          .where(and(eq(voiceContacts.firmId, firmId), gte(voiceContacts.createdAt, since)))
          .orderBy(desc(voiceContacts.createdAt))
          .limit(200),
      ),
      attempt(async () => {
        const [row] = await db.select({ n: count() }).from(voiceContacts).where(eq(voiceContacts.firmId, firmId));
        return Number(row?.n ?? 0);
      }),
    ]);

    res.set("Cache-Control", "no-store");
    res.json(buildDashboardSummary({ now, timezone, calls, messages, bookings, contacts, contactsTotal }));
  } catch (err) {
    req.log.error({ firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[dashboard] summary failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
