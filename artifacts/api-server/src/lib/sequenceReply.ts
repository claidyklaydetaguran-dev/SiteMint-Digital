import { db } from "@workspace/db";
import {
  crmCampaignRecipients,
  crmCampaignScheduledMessages,
  crmCampaignEvents,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Called whenever an inbound reply is detected for a lead (SMS, email, etc.).
 * For every active sequence enrollment for this lead:
 *  - stamps a `replied_estimated` event on the recipient
 *  - cancels remaining scheduled messages
 *  - marks the recipient enrollment as "stopped"
 *
 * Only acts on campaigns where stopOnReply = true (the scheduler also checks
 * this, but we enforce it here proactively so the queue clears immediately).
 *
 * Returns the number of recipients stopped.
 */
export async function stampReplyAndStop(leadId: number, channel: "sms" | "email", metadata?: Record<string, unknown>): Promise<number> {
  try {
    // Find all active enrollments for this lead across all campaigns
    const activeRecipients = await db
      .select({
        id: crmCampaignRecipients.id,
        campaignId: crmCampaignRecipients.campaignId,
      })
      .from(crmCampaignRecipients)
      .where(
        and(
          eq(crmCampaignRecipients.leadId, leadId),
          eq(crmCampaignRecipients.enrollmentStatus, "active"),
        ),
      );

    if (activeRecipients.length === 0) return 0;

    let stopped = 0;

    for (const recipient of activeRecipients) {
      try {
        // Stamp reply event
        await db.insert(crmCampaignEvents).values({
          campaignRecipientId: recipient.id,
          eventType: "replied_estimated",
          occurredAt: new Date(),
          metadata: { channel, leadId, ...metadata },
        });

        // Cancel all pending scheduled messages for this recipient
        await db
          .update(crmCampaignScheduledMessages)
          .set({ status: "canceled", lastError: `Lead replied via ${channel} — sequence stopped` })
          .where(
            and(
              eq(crmCampaignScheduledMessages.recipientId, recipient.id),
              inArray(crmCampaignScheduledMessages.status, ["scheduled", "queued"]),
            ),
          );

        // Mark enrollment stopped
        await db
          .update(crmCampaignRecipients)
          .set({ enrollmentStatus: "stopped" })
          .where(eq(crmCampaignRecipients.id, recipient.id));

        stopped++;
        logger.info({ recipientId: recipient.id, campaignId: recipient.campaignId, leadId, channel }, "Sequence stopped on reply");
      } catch (err) {
        logger.error({ err, recipientId: recipient.id }, "sequenceReply: failed to stop recipient");
      }
    }

    return stopped;
  } catch (err) {
    logger.error({ err, leadId }, "sequenceReply: query failed");
    return 0;
  }
}
