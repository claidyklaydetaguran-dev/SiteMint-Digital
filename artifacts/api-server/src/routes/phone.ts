import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, crmLeads, crmActivities, crmMessages } from "@workspace/db";
import { eq, desc, or, and, isNotNull } from "drizzle-orm";
import { validateToken } from "../lib/admin-session.js";
import {
  isTwilioConfigured, getTwilio, getTwilioPhone, getForwardPhone, getCrmBaseUrl,
  normalizePhone, isOptOutMessage, isOptInMessage,
  createWebhookValidator, getWebhookSecurityMode,
} from "../lib/twilio.js";

const router: IRouter = Router();
const validateTwilioWebhook = createWebhookValidator();

// ── Rate limiting state (simple in-memory per number) ─────────────────────────
const smsRateMap = new Map<string, { count: number; reset: number }>();
const SMS_RATE_LIMIT = 10;
const SMS_RATE_WINDOW = 60 * 1000;

function checkSmsRate(toNumber: string): boolean {
  const now = Date.now();
  const entry = smsRateMap.get(toNumber);
  if (!entry || now > entry.reset) {
    smsRateMap.set(toNumber, { count: 1, reset: now + SMS_RATE_WINDOW });
    return true;
  }
  if (entry.count >= SMS_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!validateToken(auth.substring(7))) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function logActivity(leadId: number, type: string, title: string, description?: string, metadata?: Record<string, unknown>) {
  await db.insert(crmActivities).values({ leadId, type, title, description, metadata });
}

async function findLeadByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const digits10 = normalized.replace(/\D/g, "").slice(-10);
  const [lead] = await db.select().from(crmLeads)
    .where(or(
      eq(crmLeads.phone, phone),
      eq(crmLeads.phone, normalized),
      eq(crmLeads.phone, digits10),
    ))
    .limit(1);
  return lead ?? null;
}

// ── GET /crm/phone/status ──────────────────────────────────────────────────────
router.get("/crm/phone/status", requireAdmin, async (req: Request, res: Response) => {
  const configured = isTwilioConfigured();
  const baseUrl = getCrmBaseUrl();
  const businessNumber = process.env.TWILIO_PHONE_NUMBER ?? "";
  const forwardTo = process.env.FORWARD_TO_PHONE_NUMBER ?? "";

  let accountStatus: string | null = null;
  if (configured) {
    try {
      const client = getTwilio();
      const account = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
      accountStatus = account.status;
    } catch {
      accountStatus = "error";
    }
  }

  const securityMode = getWebhookSecurityMode();

  const normalizedForwardTo = forwardTo ? normalizePhone(forwardTo) : "";
  const forwardingNumberLooksValid =
    normalizedForwardTo.startsWith("+") &&
    normalizedForwardTo.replace(/\D/g, "").length >= 10;

  res.json({
    configured,
    provider: process.env.PHONE_PROVIDER ?? "twilio",
    businessNumber,
    forwardTo,
    normalizedForwardTo,
    forwardingNumberLooksValid,
    accountStatus,
    forwardConfigured: !!forwardTo,
    baseUrlMissing: !baseUrl,
    webhookSecurityEnabled: securityMode === "enabled",
    webhookSecurityMode: securityMode,
    webhooks: baseUrl ? {
      incomingSms: `${baseUrl}/api/crm/webhooks/twilio/sms`,
      incomingVoice: `${baseUrl}/api/crm/webhooks/twilio/voice`,
      voiceStatus: `${baseUrl}/api/crm/webhooks/twilio/voice/status`,
      smsStatus: `${baseUrl}/api/crm/webhooks/twilio/sms/status`,
    } : null,
  });
});

// ── POST /crm/phone/test-sms ───────────────────────────────────────────────────
router.post("/crm/phone/test-sms", requireAdmin, async (req: Request, res: Response) => {
  if (!isTwilioConfigured()) { res.status(400).json({ error: "Twilio is not configured." }); return; }
  const { to } = req.body as { to?: string };
  if (!to) { res.status(400).json({ error: "Destination number required." }); return; }

  try {
    const client = getTwilio();
    const msg = await client.messages.create({
      body: "✅ This is a test SMS from SiteMint Digital CRM. Your Twilio integration is working!",
      from: getTwilioPhone(),
      to: normalizePhone(to),
    });
    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    req.log.error({ err }, "Test SMS failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send test SMS" });
  }
});

// ── GET /crm/conversations ─────────────────────────────────────────────────────
router.get("/crm/conversations", requireAdmin, async (req: Request, res: Response) => {
  try {
    const messages = await db.select().from(crmMessages)
      .orderBy(desc(crmMessages.createdAt))
      .limit(200);

    const leadIds = [...new Set(messages.map(m => m.leadId).filter((id): id is number => id !== null))];
    const leads = leadIds.length
      ? await db.select({ id: crmLeads.id, name: crmLeads.name, phone: crmLeads.phone, email: crmLeads.email, company: crmLeads.company, smsOptOut: crmLeads.smsOptOut })
          .from(crmLeads).where(or(...leadIds.map(id => eq(crmLeads.id, id))))
      : [];

    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

    const threads = new Map<string, { leadId: number | null; lead: typeof leads[0] | null; messages: typeof messages; lastAt: string; unread: number }>();

    for (const m of messages) {
      const key = m.leadId ? `lead-${m.leadId}` : `unknown-${m.fromNumber ?? m.toNumber}`;
      if (!threads.has(key)) {
        threads.set(key, { leadId: m.leadId, lead: m.leadId ? (leadMap[m.leadId] ?? null) : null, messages: [], lastAt: m.createdAt.toISOString(), unread: 0 });
      }
      const t = threads.get(key)!;
      t.messages.push(m);
      if (m.direction === "inbound") t.unread++;
    }

    res.json({ conversations: [...threads.values()].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()) });
  } catch (err) {
    req.log.error({ err }, "Error fetching conversations");
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// ── GET /crm/leads/:id/messages ───────────────────────────────────────────────
router.get("/crm/leads/:id/messages", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const messages = await db.select().from(crmMessages)
      .where(eq(crmMessages.leadId, id))
      .orderBy(desc(crmMessages.createdAt));
    res.json({ messages });
  } catch (err) {
    req.log.error({ err }, "Error fetching lead messages");
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ── POST /crm/leads/:id/sms ───────────────────────────────────────────────────
router.post("/crm/leads/:id/sms", requireAdmin, async (req: Request, res: Response) => {
  if (!isTwilioConfigured()) { res.status(400).json({ error: "Twilio is not configured." }); return; }
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { body } = req.body as { body?: string };
  if (!body?.trim()) { res.status(400).json({ error: "Message body is required." }); return; }

  try {
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    if (!lead.phone) { res.status(400).json({ error: "Lead has no phone number." }); return; }
    if (lead.smsOptOut) { res.status(400).json({ error: "This lead has opted out of SMS (STOP received)." }); return; }

    const to = normalizePhone(lead.phone);
    if (!checkSmsRate(to)) { res.status(429).json({ error: "Rate limit exceeded. Try again shortly." }); return; }

    const client = getTwilio();
    const msg = await client.messages.create({
      body: body.trim(),
      from: getTwilioPhone(),
      to,
      statusCallback: getCrmBaseUrl() ? `${getCrmBaseUrl()}/api/crm/webhooks/twilio/sms/status` : undefined,
    });

    const [saved] = await db.insert(crmMessages).values({
      leadId: id,
      direction: "outbound",
      channel: "sms",
      body: body.trim(),
      twilioSid: msg.sid,
      fromNumber: getTwilioPhone(),
      toNumber: to,
      status: msg.status,
    }).returning();

    await logActivity(id, "sms_sent", `SMS sent to ${lead.name}`, body.trim().substring(0, 100), { twilioSid: msg.sid, to });
    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, id));

    res.json({ success: true, message: saved, sid: msg.sid });
  } catch (err) {
    req.log.error({ err }, "Error sending SMS");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send SMS" });
  }
});

// ── POST /crm/leads/:id/call ──────────────────────────────────────────────────
router.post("/crm/leads/:id/call", requireAdmin, async (req: Request, res: Response) => {
  if (!isTwilioConfigured()) { res.status(400).json({ error: "Twilio is not configured." }); return; }
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    if (!lead.phone) { res.status(400).json({ error: "Lead has no phone number." }); return; }

    const forwardTo = getForwardPhone();
    if (!forwardTo) { res.status(400).json({ error: "FORWARD_TO_PHONE_NUMBER is not configured." }); return; }

    const client = getTwilio();
    const baseUrl = getCrmBaseUrl();
    const leadPhone = normalizePhone(lead.phone);

    // Bridge call: Twilio calls forwardTo first, then connects to the lead
    const call = await client.calls.create({
      to: forwardTo,
      from: getTwilioPhone(),
      url: baseUrl
        ? `${baseUrl}/api/crm/webhooks/twilio/voice/bridge?leadPhone=${encodeURIComponent(leadPhone)}&leadName=${encodeURIComponent(lead.name)}`
        : "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
      statusCallback: baseUrl ? `${baseUrl}/api/crm/webhooks/twilio/voice/status` : undefined,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    const [saved] = await db.insert(crmMessages).values({
      leadId: id,
      direction: "outbound",
      channel: "call",
      body: `Bridge call initiated to ${lead.name} (${leadPhone})`,
      twilioSid: call.sid,
      fromNumber: getTwilioPhone(),
      toNumber: leadPhone,
      callStatus: "initiated",
    }).returning();

    await logActivity(id, "call_initiated", `Outbound call initiated to ${lead.name}`, `Bridge: Twilio called ${forwardTo}, then connects to ${leadPhone}`, { twilioSid: call.sid });
    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, id));

    res.json({ success: true, message: saved, sid: call.sid });
  } catch (err) {
    req.log.error({ err }, "Error initiating call");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to initiate call" });
  }
});

// ── PATCH /crm/leads/:id/sms-consent ─────────────────────────────────────────
router.patch("/crm/leads/:id/sms-consent", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { smsConsent, smsOptOut } = req.body as { smsConsent?: boolean; smsOptOut?: boolean };
  try {
    if (typeof smsConsent === "boolean") {
      await db.update(crmLeads).set({ smsConsent, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    }
    if (typeof smsOptOut === "boolean") {
      await db.update(crmLeads).set({ smsOptOut, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update SMS consent");
    res.status(500).json({ error: "Failed to update SMS consent" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// WEBHOOKS — no admin auth, Twilio-signed requests
// ════════════════════════════════════════════════════════════════════════════════

// ── POST /crm/webhooks/twilio/sms ─────────────────────────────────────────────
router.post("/crm/webhooks/twilio/sms", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { Body, From, To, MessageSid, NumMedia } = req.body as Record<string, string>;

    // Opt-out / opt-in handling
    if (Body && isOptOutMessage(Body)) {
      const lead = await findLeadByPhone(From ?? "");
      if (lead) {
        await db.update(crmLeads).set({ smsOptOut: true, updatedAt: new Date() }).where(eq(crmLeads.id, lead.id));
        await logActivity(lead.id, "sms_opt_out", `${lead.name} sent STOP — SMS opt-out recorded`, Body);
      }
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    if (Body && isOptInMessage(Body)) {
      const lead = await findLeadByPhone(From ?? "");
      if (lead) {
        await db.update(crmLeads).set({ smsOptOut: false, updatedAt: new Date() }).where(eq(crmLeads.id, lead.id));
        await logActivity(lead.id, "sms_opt_in", `${lead.name} re-subscribed to SMS`, Body);
      }
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    // Find or create lead
    let lead = await findLeadByPhone(From ?? "");

    if (!lead) {
      const [created] = await db.insert(crmLeads).values({
        name: `Unknown (${From})`,
        email: `sms-${(From ?? "").replace(/\D/g, "")}@imported.local`,
        phone: From,
        source: "Twilio Inbound SMS",
        status: "New",
        priority: "Medium",
      }).returning();
      lead = created;
      await logActivity(lead.id, "lead_created", `New lead from inbound SMS`, `Phone: ${From}`);
    }

    await db.insert(crmMessages).values({
      leadId: lead.id,
      direction: "inbound",
      channel: "sms",
      body: Body,
      twilioSid: MessageSid,
      fromNumber: From,
      toNumber: To,
      status: "received",
      metadata: NumMedia && Number(NumMedia) > 0 ? { hasMedia: true, numMedia: Number(NumMedia) } : undefined,
    });

    await logActivity(lead.id, "sms_received", `Inbound SMS from ${lead.name}`, Body?.substring(0, 100));
    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, lead.id));

    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (err) {
    (req as unknown as { log?: { error: (...args: unknown[]) => void } }).log?.error?.({ err }, "Twilio SMS webhook error");
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});

// ── POST /crm/webhooks/twilio/sms/status ─────────────────────────────────────
router.post("/crm/webhooks/twilio/sms/status", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body as Record<string, string>;
    if (MessageSid) {
      const updated = await db.update(crmMessages)
        .set({ status: MessageStatus, errorCode: ErrorCode ?? null })
        .where(eq(crmMessages.twilioSid, MessageSid))
        .returning({ leadId: crmMessages.leadId });

      if (
        (MessageStatus === "failed" || MessageStatus === "undelivered") &&
        updated[0]?.leadId != null
      ) {
        const errorSuffix = ErrorCode ? ` (error ${ErrorCode})` : "";
        await logActivity(
          updated[0].leadId,
          "sms_failed",
          `SMS delivery failed${errorSuffix}`,
          `Status: ${MessageStatus}${ErrorCode ? ` · Twilio error ${ErrorCode}` : ""}`,
          { twilioSid: MessageSid, status: MessageStatus, errorCode: ErrorCode ?? null },
        );
      }
    }
    res.sendStatus(204);
  } catch {
    res.sendStatus(204);
  }
});

// ── POST /crm/webhooks/twilio/voice ───────────────────────────────────────────
router.post("/crm/webhooks/twilio/voice", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { From, To, CallSid } = req.body as Record<string, string>;
    const forwardTo = getForwardPhone();

    let lead = await findLeadByPhone(From ?? "");

    if (!lead) {
      const [created] = await db.insert(crmLeads).values({
        name: `Unknown Caller (${From})`,
        email: `call-${(From ?? "").replace(/\D/g, "")}@imported.local`,
        phone: From,
        source: "Twilio Inbound Call",
        status: "New",
        priority: "Medium",
      }).returning();
      lead = created;
      await logActivity(lead.id, "lead_created", `New lead from inbound call`, `Phone: ${From}`);
    }

    await db.insert(crmMessages).values({
      leadId: lead.id,
      direction: "inbound",
      channel: "call",
      body: `Incoming call from ${From}`,
      twilioSid: CallSid,
      fromNumber: From,
      toNumber: To,
      callStatus: "ringing",
    });

    await logActivity(lead.id, "call_received", `Incoming call from ${lead.name}`, `From: ${From}`);
    await db.update(crmLeads).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, lead.id));

    const baseUrl = getCrmBaseUrl();
    const statusCb = baseUrl ? ` action="${baseUrl}/api/crm/webhooks/twilio/voice/status"` : "";

    if (forwardTo) {
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${statusCb} callerId="${To}">${forwardTo}</Dial>
</Response>`);
    } else {
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling SiteMint Digital. We are unable to take your call right now. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="false"/>
</Response>`);
    }
  } catch {
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>An error occurred. Please try again later.</Say></Response>`);
  }
});

// ── POST /crm/webhooks/twilio/voice/bridge ────────────────────────────────────
// Generates TwiML to connect the admin's phone to the lead's number
router.post("/crm/webhooks/twilio/voice/bridge", validateTwilioWebhook, async (req: Request, res: Response) => {
  const leadPhone = (req.query.leadPhone as string) ?? "";
  const leadName = (req.query.leadName as string) ?? "lead";
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to ${leadName}. Please hold.</Say>
  <Dial callerId="${getTwilioPhone()}">${leadPhone}</Dial>
</Response>`);
});

// ── POST /crm/webhooks/twilio/voice/status ────────────────────────────────────
router.post("/crm/webhooks/twilio/voice/status", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body as Record<string, string>;
    if (CallSid) {
      // Fetch existing row first — needed for leadId and dedup
      const [existing] = await db.select().from(crmMessages)
        .where(eq(crmMessages.twilioSid, CallSid)).limit(1);

      const updates: Partial<{ callStatus: string; duration: number; status: string }> = {
        callStatus: CallStatus,
        status: CallStatus,
      };
      if (CallDuration) updates.duration = Number(CallDuration);
      await db.update(crmMessages).set(updates).where(eq(crmMessages.twilioSid, CallSid));

      // Log missed-call activity for no-answer / busy / failed
      const MISSED_STATUSES = ["no-answer", "busy", "failed"];
      if (MISSED_STATUSES.includes(CallStatus) && existing?.leadId) {
        // Dedup: search existing call_missed activities for this callSid in metadata
        const prior = await db.select({ id: crmActivities.id, metadata: crmActivities.metadata })
          .from(crmActivities)
          .where(and(eq(crmActivities.leadId, existing.leadId), eq(crmActivities.type, "call_missed")));

        const alreadyLogged = prior.some(
          a => (a.metadata as Record<string, unknown> | null)?.callSid === CallSid
        );

        if (!alreadyLogged) {
          const durationLabel = CallDuration ? ` after ${CallDuration}s` : "";
          await logActivity(
            existing.leadId,
            "call_missed",
            "Missed call",
            `Call ${CallStatus}${durationLabel}`,
            { callSid: CallSid, callStatus: CallStatus, duration: CallDuration ? Number(CallDuration) : null },
          );
        }
      }
    }
    res.sendStatus(204);
  } catch {
    res.sendStatus(204);
  }
});

// ── GET /crm/phone/audit ──────────────────────────────────────────────────────
router.get("/crm/phone/audit", requireAdmin, async (req: Request, res: Response) => {
  try {
    const leads = await db
      .select({ id: crmLeads.id, name: crmLeads.name, phone: crmLeads.phone })
      .from(crmLeads)
      .where(isNotNull(crmLeads.phone));

    const results = [];
    for (const lead of leads) {
      if (!lead.phone) continue;
      const phone = lead.phone;
      const normalized = normalizePhone(phone);
      // Already clean: E.164 and normalizePhone agrees
      if (phone.startsWith("+") && normalized === phone) continue;

      const digits = phone.replace(/\D/g, "");
      let issue: string;
      if (!phone.startsWith("+") && digits.length === 11 && digits.startsWith("0")) {
        issue = "Possible PH trunk format";
      } else if (
        !phone.startsWith("+") &&
        (digits.length === 10 ||
          (digits.length === 11 && digits.startsWith("1")) ||
          (digits.length === 12 && digits.startsWith("63")))
      ) {
        issue = "Needs E.164 formatting";
      } else {
        issue = "Unrecognized phone format";
      }

      const canAutoFix = normalized !== phone && normalized.startsWith("+");
      results.push({ id: lead.id, name: lead.name, phone, normalizedPhone: normalized, issue, canAutoFix });
    }

    res.json({ leads: results });
  } catch (err) {
    req.log.error({ err }, "Phone audit failed");
    res.status(500).json({ error: "Audit failed" });
  }
});

// ── POST /crm/phone/normalize ─────────────────────────────────────────────────
router.post("/crm/phone/normalize", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { leadIds } = req.body as { leadIds?: number[] };
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({ error: "leadIds must be a non-empty array" });
      return;
    }

    const results: { leadId: number; oldPhone: string | null; newPhone: string | null; status: string; reason: string }[] = [];
    let updated = 0;
    let skipped = 0;
    const errors: number[] = [];

    for (const leadId of leadIds) {
      try {
        const [lead] = await db
          .select({ id: crmLeads.id, phone: crmLeads.phone })
          .from(crmLeads)
          .where(eq(crmLeads.id, leadId));

        if (!lead || !lead.phone) {
          skipped++;
          results.push({ leadId, oldPhone: null, newPhone: null, status: "skipped", reason: "No phone" });
          continue;
        }

        const normalized = normalizePhone(lead.phone);

        if (normalized === lead.phone) {
          skipped++;
          results.push({ leadId, oldPhone: lead.phone, newPhone: lead.phone, status: "skipped", reason: "Already normalized" });
          continue;
        }

        if (!normalized.startsWith("+")) {
          skipped++;
          results.push({ leadId, oldPhone: lead.phone, newPhone: normalized, status: "skipped", reason: "Cannot safely normalize" });
          continue;
        }

        await db
          .update(crmLeads)
          .set({ phone: normalized, updatedAt: new Date() })
          .where(eq(crmLeads.id, leadId));

        updated++;
        results.push({ leadId, oldPhone: lead.phone, newPhone: normalized, status: "updated", reason: "Normalized to E.164" });
      } catch (err) {
        errors.push(leadId);
        results.push({ leadId, oldPhone: null, newPhone: null, status: "error", reason: String(err) });
      }
    }

    res.json({ updated, skipped, errors: errors.length, results });
  } catch (err) {
    req.log.error({ err }, "Bulk normalize failed");
    res.status(500).json({ error: "Normalize failed" });
  }
});

export default router;
