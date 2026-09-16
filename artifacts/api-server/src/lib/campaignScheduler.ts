import { db } from "@workspace/db";
import {
  crmCampaignScheduledMessages,
  crmCampaignRecipients,
  crmCampaigns,
  crmCampaignSteps,
  crmLeads,
  crmCampaignEvents,
  crmTasks,
} from "@workspace/db/schema";
import { eq, and, lte, gte, or, count, inArray, asc } from "drizzle-orm";
import { staffMailBlockedReason, trySendStaffMail } from "./staffMail.js";
import { emailRef, emailRefTags } from "./emailRefs.js";
import { getTwilio, getTwilioPhone, isTwilioConfigured } from "./twilio.js";
import { logger } from "./logger.js";

const BATCH_SIZE = 30;

/**
 * How overdue a message may be and still be sent without a person looking.
 *
 * A backlog that is already days old is not a schedule, it is a burst waiting
 * to happen — a first boot against an existing database, a restored copy, or a
 * worker that was down over a weekend. Thirty a minute then go to customers
 * who stopped expecting them, and nobody decided that. Past this, the message
 * is HELD: visible in the queue, releasable by a person, and never sent by the
 * passage of time alone.
 *
 * Matched to the reminder engine's own 24-hour floor (`crmScheduler.ts`), so
 * the CRM has one answer to "how stale is too stale" rather than two.
 */
export const STALE_HOLD_MS = 24 * 60 * 60 * 1000;
const REPLY_EVENT_TYPES = ["replied_estimated", "replied"];

export interface SchedulerStatus {
  running: boolean;
  lastRunAt: Date | null;
  lastRunProcessed: number;
  lastRunErrors: number;
  totalProcessed: number;
  totalErrors: number;
  totalSkipped: number;
  totalDeferred: number;
}

const _status: SchedulerStatus = {
  running: false,
  lastRunAt: null,
  lastRunProcessed: 0,
  lastRunErrors: 0,
  totalProcessed: 0,
  totalErrors: 0,
  totalSkipped: 0,
  totalDeferred: 0,
};

// ── Send-window enforcement ───────────────────────────────────────────────────
// sendTime: immediate | morning | afternoon | evening (hour in server-local time)
const SEND_WINDOW_HOUR: Record<string, number> = { morning: 9, afternoon: 13, evening: 17 };

function computeEffectiveSendAt(scheduledAt: Date, sendTime: string, businessDaysOnly: boolean): Date {
  const effective = new Date(scheduledAt);
  const hour = SEND_WINDOW_HOUR[sendTime];
  if (hour !== undefined) effective.setHours(hour, 0, 0, 0);
  if (businessDaysOnly) {
    while (effective.getDay() === 0 || effective.getDay() === 6) {
      effective.setDate(effective.getDate() + 1);
      if (hour !== undefined) effective.setHours(hour, 0, 0, 0);
    }
  }
  return effective;
}

// Atomically claim a scheduled message before acting on it, so a crash/restart
// between the external send call and the status write can't cause a resend,
// and a late-arriving stop-on-reply cancellation can't race a send.
async function claimMessage(msgId: number): Promise<boolean> {
  const claimed = await db
    .update(crmCampaignScheduledMessages)
    .set({ status: "sending" })
    .where(and(eq(crmCampaignScheduledMessages.id, msgId), eq(crmCampaignScheduledMessages.status, "scheduled")))
    .returning({ id: crmCampaignScheduledMessages.id });
  return claimed.length > 0;
}

export function getSchedulerStatus(): SchedulerStatus {
  return { ..._status };
}

// ── Branch evaluation (Phase 26D) ─────────────────────────────────────────────
// A step's message is only gated if it is the branchTrue/FalseNextStepId of
// some OTHER step in the same campaign. Steps with no incoming branch pointer
// (i.e. every step in a today's linear campaign) are completely unaffected.
type BranchVerdict = "proceed" | "deferred" | "canceled";

async function evaluateBranchGate(
  msg: typeof crmCampaignScheduledMessages.$inferSelect,
  recipientId: number,
  now: Date,
): Promise<BranchVerdict> {
  const [sourceStep] = await db
    .select()
    .from(crmCampaignSteps)
    .where(
      and(
        eq(crmCampaignSteps.campaignId, msg.campaignId),
        or(
          eq(crmCampaignSteps.branchTrueNextStepId, msg.stepId ?? -1),
          eq(crmCampaignSteps.branchFalseNextStepId, msg.stepId ?? -1),
        ),
      ),
    )
    .limit(1);

  if (!sourceStep || !sourceStep.branchOnEvent) return "proceed";

  const [sourceMsg] = await db
    .select({ sentAt: crmCampaignScheduledMessages.sentAt })
    .from(crmCampaignScheduledMessages)
    .where(
      and(
        eq(crmCampaignScheduledMessages.recipientId, recipientId),
        eq(crmCampaignScheduledMessages.stepId, sourceStep.id),
        eq(crmCampaignScheduledMessages.status, "sent"),
      ),
    )
    .limit(1);

  if (!sourceMsg?.sentAt) {
    // Source step hasn't sent yet — nothing to evaluate. Check back later.
    await rescheduleIfStillScheduled(msg.id, new Date(now.getTime() + 60 * 60 * 1000));
    return "deferred";
  }

  const windowMs = (sourceStep.branchWindowHours ?? 0) * 60 * 60 * 1000;
  const deadline = new Date(sourceMsg.sentAt.getTime() + windowMs);
  if (now.getTime() < deadline.getTime()) {
    await rescheduleIfStillScheduled(msg.id, deadline);
    return "deferred";
  }

  let matched: boolean;
  if (sourceStep.branchOnEvent === "no_reply") {
    const [reply] = await db
      .select({ id: crmCampaignEvents.id })
      .from(crmCampaignEvents)
      .where(
        and(
          eq(crmCampaignEvents.campaignRecipientId, recipientId),
          eq(crmCampaignEvents.eventType, "replied_estimated"),
          gte(crmCampaignEvents.occurredAt, sourceMsg.sentAt),
          lte(crmCampaignEvents.occurredAt, deadline),
        ),
      )
      .limit(1);
    matched = !reply;
  } else {
    const [evt] = await db
      .select({ id: crmCampaignEvents.id })
      .from(crmCampaignEvents)
      .where(
        and(
          eq(crmCampaignEvents.campaignRecipientId, recipientId),
          eq(crmCampaignEvents.eventType, sourceStep.branchOnEvent),
          gte(crmCampaignEvents.occurredAt, sourceMsg.sentAt),
          lte(crmCampaignEvents.occurredAt, deadline),
        ),
      )
      .limit(1);
    matched = !!evt;
  }

  const isTrueTarget = sourceStep.branchTrueNextStepId === msg.stepId;
  const isFalseTarget = sourceStep.branchFalseNextStepId === msg.stepId;
  const proceed = (matched && isTrueTarget) || (!matched && isFalseTarget);
  if (proceed) return "proceed";

  await db
    .update(crmCampaignScheduledMessages)
    .set({ status: "canceled", lastError: `Branch not taken (branchOnEvent=${sourceStep.branchOnEvent}, matched=${matched})` })
    .where(and(eq(crmCampaignScheduledMessages.id, msg.id), eq(crmCampaignScheduledMessages.status, "scheduled")));
  return "canceled";
}

async function rescheduleIfStillScheduled(msgId: number, scheduledAt: Date): Promise<void> {
  await db
    .update(crmCampaignScheduledMessages)
    .set({ scheduledAt })
    .where(and(eq(crmCampaignScheduledMessages.id, msgId), eq(crmCampaignScheduledMessages.status, "scheduled")));
}

async function hasReplied(recipientId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(crmCampaignEvents)
    .where(
      and(
        eq(crmCampaignEvents.campaignRecipientId, recipientId),
        inArray(crmCampaignEvents.eventType, REPLY_EVENT_TYPES),
      ),
    );
  return (row?.n ?? 0) > 0;
}

// All terminal transitions below only apply FROM "sending" (the status set by
// claimMessage). This guarantees a message already canceled/sent/failed by a
// concurrent writer (e.g. stampReplyAndStop) can never be flipped back.
async function markMessageSent(
  msgId: number,
  resendEmailId: string | null,
): Promise<void> {
  await db
    .update(crmCampaignScheduledMessages)
    .set({ status: "sent", sentAt: new Date(), resendEmailId, lastError: null })
    .where(and(eq(crmCampaignScheduledMessages.id, msgId), eq(crmCampaignScheduledMessages.status, "sending")));
}

async function markMessageFailed(msgId: number, error: string): Promise<void> {
  await db
    .update(crmCampaignScheduledMessages)
    .set({ status: "failed", lastError: error })
    .where(and(eq(crmCampaignScheduledMessages.id, msgId), eq(crmCampaignScheduledMessages.status, "sending")));
}

/**
 * Stops a long-overdue message and asks for a person, rather than sending it.
 *
 * Held rather than cancelled, and held rather than sent: cancelling would
 * decide on somebody's behalf that the message is no longer wanted, and
 * sending would mail a customer something scheduled for a moment that has
 * passed. The row keeps its place in the queue, says how late it is, and goes
 * out only when a person releases it.
 */
async function holdStaleMessage(msgId: number, scheduledAt: Date, now: Date): Promise<void> {
  const hoursLate = Math.round((now.getTime() - scheduledAt.getTime()) / 3_600_000);
  await db
    .update(crmCampaignScheduledMessages)
    .set({
      status: "held",
      lastError: `Held for review: this was due ${hoursLate} hours ago. A backlog this old usually means the worker was down, the database is a restored copy, or the campaign was forgotten — and sending it in one burst mails people who stopped expecting it. Release it in the queue, or send it from there, to let it go out.`,
    })
    .where(and(
      eq(crmCampaignScheduledMessages.id, msgId),
      eq(crmCampaignScheduledMessages.status, "scheduled"),
    ));
}

async function markMessageSkipped(
  msgId: number,
  reason: string,
): Promise<void> {
  await db
    .update(crmCampaignScheduledMessages)
    .set({
      status: "skipped",
      sentAt: new Date(),
      lastError: null,
      metadata: { skipReason: reason },
    })
    .where(and(eq(crmCampaignScheduledMessages.id, msgId), eq(crmCampaignScheduledMessages.status, "sending")));
}

async function checkAndCompleteRecipient(recipientId: number): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(crmCampaignScheduledMessages)
    .where(
      and(
        eq(crmCampaignScheduledMessages.recipientId, recipientId),
        eq(crmCampaignScheduledMessages.status, "scheduled"),
      ),
    );
  if ((row?.n ?? 0) === 0) {
    await db
      .update(crmCampaignRecipients)
      .set({ enrollmentStatus: "completed" })
      .where(
        and(
          eq(crmCampaignRecipients.id, recipientId),
          eq(crmCampaignRecipients.enrollmentStatus, "active"),
        ),
      );
  }
}

export async function processScheduledMessages(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
  deferred: number;
  /** Long-overdue messages stopped for a person to look at (STALE_HOLD_MS). */
  held: number;
  /** Email messages left untouched because this server cannot send mail. */
  heldForMail: number;
}> {
  if (_status.running) {
    logger.debug("Campaign scheduler already running — skipping tick");
    return { processed: 0, errors: 0, skipped: 0, deferred: 0, held: 0, heldForMail: 0 };
  }

  _status.running = true;
  let processed = 0;
  let errors = 0;
  let skipped = 0;
  let deferred = 0;
  let held = 0;
  let heldForMail = 0;

  try {
    const now = new Date();

    const messages = await db
      .select({
        msg: crmCampaignScheduledMessages,
        recipientId: crmCampaignRecipients.id,
        recipientCurrentStep: crmCampaignRecipients.currentStep,
        enrollmentStatus: crmCampaignRecipients.enrollmentStatus,
        campaignId: crmCampaigns.id,
        campaignName: crmCampaigns.name,
        stopOnReply: crmCampaigns.stopOnReply,
        leadEmail: crmLeads.email,
        leadPhone: crmLeads.phone,
        leadName: crmLeads.name,
        sendTime: crmCampaignSteps.sendTime,
        businessDaysOnly: crmCampaignSteps.businessDaysOnly,
      })
      .from(crmCampaignScheduledMessages)
      .innerJoin(
        crmCampaignRecipients,
        eq(crmCampaignScheduledMessages.recipientId, crmCampaignRecipients.id),
      )
      .innerJoin(
        crmCampaigns,
        eq(crmCampaignScheduledMessages.campaignId, crmCampaigns.id),
      )
      .innerJoin(
        crmLeads,
        eq(crmCampaignScheduledMessages.leadId, crmLeads.id),
      )
      .innerJoin(
        crmCampaignSteps,
        eq(crmCampaignScheduledMessages.stepId, crmCampaignSteps.id),
      )
      .where(
        and(
          eq(crmCampaignScheduledMessages.status, "scheduled"),
          lte(crmCampaignScheduledMessages.scheduledAt, now),
          eq(crmCampaigns.autoSend, true),
          eq(crmCampaignRecipients.enrollmentStatus, "active"),
        ),
      )
      .orderBy(asc(crmCampaignScheduledMessages.scheduledAt), asc(crmCampaignScheduledMessages.stepId))
      .limit(BATCH_SIZE);

    if (messages.length > 0) {
      logger.info({ count: messages.length }, "Campaign scheduler: processing messages");
    }

    for (const row of messages) {
      const { msg, recipientId, stopOnReply, leadEmail, leadPhone, leadName, campaignName, sendTime, businessDaysOnly } = row;

      try {
        // ── Nothing can reach a provider in this environment ─────────────────
        //
        // The message is left exactly where it is: unclaimed, unchanged and
        // still due. Recording a failure here would claim it had been handled,
        // and it would never go out once mail is configured — the same rule
        // the reminder engine follows for a failure BEFORE the provider call.
        if (msg.channel === "email" && staffMailBlockedReason() !== null) {
          heldForMail++;
          continue;
        }

        // ── A backlog is not a schedule ──────────────────────────────────────
        //
        // Anything overdue by more than a day is stopped for a person instead
        // of being mailed at thirty a minute. This is the guard that decides
        // what happens the first time this worker runs against an existing
        // database — a restored copy, or a deployment that was down — where
        // every message in it is due at once and nobody chose that.
        if (
          (msg.channel === "email" || msg.channel === "sms")
          && msg.scheduledAt
          && now.getTime() - msg.scheduledAt.getTime() > STALE_HOLD_MS
          && !(msg.metadata as Record<string, unknown> | null)?.["releasedFromHoldAt"]
        ) {
          await holdStaleMessage(msg.id, msg.scheduledAt, now);
          held++;
          continue;
        }

        // ── Branch gate (Phase 26D) ───────────────────────────────────────────
        // Only affects messages whose step is the branchTrue/FalseNextStepId
        // of some other step. Everything else falls straight through.
        const branchVerdict = await evaluateBranchGate(msg, recipientId, now);
        if (branchVerdict === "deferred") {
          deferred++;
          _status.totalDeferred++;
          continue;
        }
        if (branchVerdict === "canceled") {
          skipped++;
          _status.totalSkipped++;
          continue;
        }

        // ── Send-window enforcement ──────────────────────────────────────────
        // The calendar day may have arrived, but the step may require a
        // specific time-of-day and/or business days only. Defer (reschedule)
        // rather than sending early or dropping the message.
        if (msg.scheduledAt) {
          const effectiveAt = computeEffectiveSendAt(msg.scheduledAt, sendTime, businessDaysOnly);
          if (effectiveAt.getTime() > now.getTime()) {
            await db
              .update(crmCampaignScheduledMessages)
              .set({ scheduledAt: effectiveAt })
              .where(
                and(
                  eq(crmCampaignScheduledMessages.id, msg.id),
                  eq(crmCampaignScheduledMessages.status, "scheduled"),
                ),
              );
            deferred++;
            _status.totalDeferred++;
            continue;
          }
        }

        // ── Claim (crash-duplicate + reply-race guard) ───────────────────────
        // Atomically flip scheduled → sending. If another writer (e.g. a
        // stop-on-reply cancellation) already moved this row out of
        // "scheduled", the claim fails and we skip it — never send.
        if (!(await claimMessage(msg.id))) {
          continue;
        }

        // ── stopOnReply guard ────────────────────────────────────────────────
        if (stopOnReply && (await hasReplied(recipientId))) {
          await markMessageSkipped(msg.id, "Lead has replied — sequence stopped");
          await db
            .update(crmCampaignRecipients)
            .set({ enrollmentStatus: "stopped" })
            .where(eq(crmCampaignRecipients.id, recipientId));
          skipped++;
          _status.totalSkipped++;
          continue;
        }

        const channel = msg.channel;
        const subject = msg.subject ?? `Message from ${campaignName}`;
        const body = msg.body ?? "";
        const fullName = leadName ?? leadEmail.split("@")[0] ?? "there";

        // ── Email ────────────────────────────────────────────────────────────
        if (channel === "email") {
          if (!leadEmail) {
            await markMessageSkipped(msg.id, "Lead has no email address");
            skipped++;
            _status.totalSkipped++;
            continue;
          }

          const outcome = await trySendStaffMail({
            to: leadEmail,
            subject,
            text: body || subject,
            html: buildSequenceEmailHtml(fullName, subject, body),
            // The provider echoes this back on every event about the message,
            // which is what lets a delivery report reach this queue row.
            tags: emailRefTags(emailRef("sequence_message", msg.id)),
          });

          if (!outcome.sent) {
            // Recorded under the class the answer actually supports. The
            // `uncertain:` one must never read as "not sent": the message may
            // be in their inbox, nothing re-queues it by itself, and a later
            // `delivered` event is what resolves it.
            await markMessageFailed(msg.id, `${outcome.failure}: ${outcome.reason}`.slice(0, 500));
            errors++;
            _status.totalErrors++;
            continue;
          }

          await markMessageSent(msg.id, outcome.providerId);
          await db
            .update(crmCampaignRecipients)
            .set({ currentStep: (row.recipientCurrentStep ?? 0) + 1 })
            .where(eq(crmCampaignRecipients.id, recipientId));
          processed++;
          _status.totalProcessed++;
        }

        // ── SMS ──────────────────────────────────────────────────────────────
        else if (channel === "sms") {
          if (!leadPhone) {
            await markMessageSkipped(msg.id, "Lead has no phone number");
            skipped++;
            _status.totalSkipped++;
            continue;
          }
          if (!isTwilioConfigured()) {
            await markMessageSkipped(msg.id, "Twilio is not configured");
            skipped++;
            _status.totalSkipped++;
            continue;
          }

          const client = getTwilio();
          await client.messages.create({
            body: body || subject,
            from: getTwilioPhone(),
            to: leadPhone,
          });
          await markMessageSent(msg.id, null);
          await db
            .update(crmCampaignRecipients)
            .set({ currentStep: (row.recipientCurrentStep ?? 0) + 1 })
            .where(eq(crmCampaignRecipients.id, recipientId));
          processed++;
          _status.totalProcessed++;
        }

        // ── Call prompt / Task — create a crm_tasks row, then skip ──────────
        else {
          const isCall = channel === "call_prompt";
          const taskBody = (msg.body ?? "").trim();
          const taskTitle = isCall
            ? `Call ${fullName} — ${campaignName}`
            : `${campaignName}: ${taskBody.slice(0, 60) || "Complete task"}`;
          const taskDesc =
            (taskBody ? taskBody + "\n\n" : "") +
            `From campaign: ${campaignName}, step ${msg.stepId ?? "?"}`;

          const [createdTask] = await db.insert(crmTasks).values({
            leadId: msg.leadId ?? null,
            type: isCall ? "Call" : "Follow Up",
            title: taskTitle,
            description: taskDesc,
            dueDate: msg.scheduledAt ?? new Date(),
            // Stated rather than left to the column default, which is "date":
            // a campaign step's send time IS a moment somebody scheduled, and
            // this task is that moment's manual half. Everything else that
            // creates a task derives its due date from a day offset and means
            // a day, so the default is right for them and wrong for this.
            dueKind: "time",
            status: "pending",
            createdBy: "campaign-automation",
          }).returning({ id: crmTasks.id });

          const taskId = createdTask?.id ?? null;
          logger.info({ taskId, msgId: msg.id, channel }, "Campaign scheduler: created task for manual step");

          const reason = isCall
            ? `Call prompt — task created (id ${taskId})`
            : `Task — task created (id ${taskId})`;
          await markMessageSkipped(msg.id, reason);
          await db
            .update(crmCampaignRecipients)
            .set({ currentStep: (row.recipientCurrentStep ?? 0) + 1 })
            .where(eq(crmCampaignRecipients.id, recipientId));
          skipped++;
          _status.totalSkipped++;
        }

        // ── Check if recipient is now done with all steps ────────────────────
        await checkAndCompleteRecipient(recipientId);
      } catch (err) {
        errors++;
        _status.totalErrors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, msgId: msg.id }, "Campaign scheduler: failed to send message");
        try {
          await markMessageFailed(msg.id, errMsg);
        } catch (dbErr) {
          logger.error({ dbErr }, "Campaign scheduler: could not mark message as failed");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Campaign scheduler: batch query failed");
  } finally {
    _status.running = false;
    _status.lastRunAt = new Date();
    _status.lastRunProcessed = processed;
    _status.lastRunErrors = errors;
  }

  if (held > 0 || heldForMail > 0) {
    logger.warn(
      { held, heldForMail },
      "Campaign scheduler: messages not sent — held for review, or left alone because this server cannot send mail",
    );
  }

  return { processed, errors, skipped, deferred, held, heldForMail };
}

export function startScheduler(intervalMs = 60_000): ReturnType<typeof setInterval> {
  logger.info({ intervalMs }, "Campaign scheduler started");
  processScheduledMessages().catch((err) =>
    logger.error({ err }, "Campaign scheduler: initial run error"),
  );
  return setInterval(() => {
    processScheduledMessages().catch((err) =>
      logger.error({ err }, "Campaign scheduler: tick error"),
    );
  }, intervalMs);
}

// ── Email template for sequence messages ─────────────────────────────────────

function buildSequenceEmailHtml(name: string, subject: string, body: string): string {
  const bodyHtml = body
    .split(/\n\n+/)
    .map((p) => `<p style="color:#374151;line-height:1.7;margin:0 0 16px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:24px 32px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="9" fill="#1e293b"/>
          <rect width="40" height="40" rx="9" fill="white" fill-opacity="0.08"/>
          <path d="M20 11L29 20L20 29L11 20Z" fill="#34d399" opacity="0.90"/>
          <path d="M20 16L24 20L20 24L16 20Z" fill="#1e293b"/>
          <circle cx="20" cy="13" r="2.5" fill="#34d399"/>
        </svg>
        <span style="color:#ffffff;font-size:18px;font-weight:700;font-family:Georgia,serif;">SiteMint <span style="color:#94a3b8;">Digital</span></span>
      </div>
    </div>
    <div style="padding:32px;">
      <h1 style="color:#1e293b;font-size:20px;margin:0 0 20px;">${subject}</h1>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 20px;"/>
      <p style="color:#374151;margin:0 0 4px;font-weight:700;">Best Regards,</p>
      <p style="color:#374151;margin:0;">SiteMint Digital Solutions</p>
    </div>
    <div style="background:#f8fafc;padding:14px 32px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
      SiteMint Digital Solutions &middot; <a href="mailto:info.sitemint@gmail.com" style="color:#3b82f6;">info.sitemint@gmail.com</a> &middot; 949-880-6515
      <br/><span style="font-size:11px;color:#9ca3af;">You are receiving this because you opted in. Reply STOP to unsubscribe.</span>
    </div>
  </div>
</body>
</html>`;
}
