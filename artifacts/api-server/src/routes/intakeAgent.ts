/**
 * AI SMS Intake Agent
 *
 * Inbound Twilio webhook → LLM conversation → structured case extraction →
 * deterministic scoring → firm notification email.
 *
 * Webhook signature validation is handled by validateIntakeTwilioSignature
 * (see lib/intakeTwilio.ts). In dev/test NODE_ENV it bypasses automatically
 * so plain curl testing continues to work without real Twilio credentials.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { validateIntakeTwilioSignature } from "../lib/intakeTwilio.js";
import { validateToken } from "../lib/admin-session.js";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import {
  db,
  intakeFirms,
  intakeConversations,
  intakeMessages,
  intakeCases,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { IntakeFirm, IntakeCase } from "@workspace/db";
import { scoreIntakeCase } from "../lib/intakeScoring.js";
import { getResend } from "../lib/email.js";

const router: IRouter = Router();

// ── Admin auth (local — same pattern as crm.ts) ───────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!validateToken(token)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── Email ─────────────────────────────────────────────────────────────────────

const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>";

const TIER_EMOJI: Record<string, string> = {
  Hot:           "🔥",
  Warm:          "🌤️",
  Cold:          "🧊",
  Disqualified:  "❌",
  "Needs Review":"⚠️",
};

function buildIntakeNotificationHtml(params: {
  tier:             string;
  callerPhone:      string;
  firmName:         string;
  incidentType:     string | null;
  incidentDate:     string | null;
  incidentDateNormalized: string | null;
  injurySeverity:   string | null;
  faultDescription: string | null;
  priorAttorney:    boolean | null;
  summary:          string | null;
  disqualifyReason: string | null;
}): string {
  const {
    tier, callerPhone, firmName, incidentType, incidentDate,
    incidentDateNormalized, injurySeverity, faultDescription,
    priorAttorney, summary, disqualifyReason,
  } = params;

  const tierColors: Record<string, string> = {
    Hot:           "#dc2626",
    Warm:          "#ea580c",
    Cold:          "#2563eb",
    Disqualified:  "#6b7280",
    "Needs Review":"#d97706",
  };
  const tierColor = tierColors[tier] ?? "#6b7280";
  const emoji     = TIER_EMOJI[tier] ?? "";

  const row = (label: string, value: string | null | undefined, alt = false) =>
    `<tr style="background:${alt ? "#f8fafc" : "#ffffff"};"><td style="padding:7px 14px;font-weight:600;color:#374151;width:200px;vertical-align:top;font-size:13px;">${label}</td><td style="padding:7px 14px;color:#111827;font-size:13px;">${value ?? "—"}</td></tr>`;

  const displayDate = incidentDateNormalized
    ? new Date(incidentDateNormalized).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : incidentDate ?? null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:#1e293b;padding:28px 32px;">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:20px;">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="9" fill="#1e293b"/>
          <rect width="40" height="40" rx="9" fill="white" fill-opacity="0.08"/>
          <path d="M20 11L29 20L20 29L11 20Z" fill="#34d399" opacity="0.90"/>
          <path d="M20 16L24 20L20 24L16 20Z" fill="#1e293b"/>
          <circle cx="20" cy="13" r="2.5" fill="#34d399"/>
        </svg>
        <span style="color:#ffffff;font-size:20px;font-weight:700;font-family:Georgia,serif;">SiteMint <span style="color:#94a3b8;">Digital</span></span>
      </div>
      <h1 style="color:#ffffff;margin:0 0 4px;font-size:22px;">New AI Intake Case</h1>
      <p style="color:#94a3b8;margin:0;font-size:15px;">${firmName}</p>
    </div>

    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="display:inline-flex;align-items:center;gap:10px;background:${tierColor}18;border:1.5px solid ${tierColor}55;border-radius:10px;padding:10px 20px;">
        <span style="font-size:22px;">${emoji}</span>
        <div>
          <p style="margin:0;font-size:11px;font-weight:600;color:${tierColor};text-transform:uppercase;letter-spacing:.06em;">Case Tier</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:${tierColor};">${tier}</p>
        </div>
      </div>
      ${disqualifyReason ? `<p style="margin:10px 0 0;font-size:13px;color:#6b7280;">Reason: ${disqualifyReason}</p>` : ""}
    </div>

    <div style="padding:24px 32px;">
      ${summary ? `
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;">AI Case Summary</p>
        <p style="margin:0;font-size:14px;color:#111827;line-height:1.65;">${summary}</p>
      </div>` : ""}

      <h2 style="font-size:14px;color:#1e293b;margin:0 0 10px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Extracted Facts</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Caller Phone",    callerPhone)}
        ${row("Incident Type",   incidentType,        true)}
        ${row("Incident Date",   displayDate,         false)}
        ${row("Injury Severity", injurySeverity,      true)}
        ${row("Fault / Context", faultDescription,    false)}
        ${row("Prior Attorney",  priorAttorney == null ? "Unknown" : priorAttorney ? "Yes" : "No", true)}
      </table>
    </div>

    <div style="background:#f8fafc;padding:16px 32px;text-align:center;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">
      SiteMint Digital Solutions · <a href="mailto:info.sitemint@gmail.com" style="color:#3b82f6;">info.sitemint@gmail.com</a> · 949-880-6515
    </div>
  </div>
</body>
</html>`;
}

// ── LLM contract ──────────────────────────────────────────────────────────────

interface ExtractedFields {
  incidentType:            string  | null;
  incidentDate:            string  | null;
  incidentDateNormalized:  string  | null;
  injurySeverity:          string  | null;
  faultDescription:        string  | null;
  priorAttorney:           boolean | null;
  summary:                 string  | null;
}

interface LlmResponse {
  reply:               string;
  extractedFields:     ExtractedFields;
  conversationComplete: boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(firm: IntakeFirm, existingCase: IntakeCase | null): string {
  const today = new Date().toISOString().slice(0, 10);

  const knownFields = existingCase
    ? [
        existingCase.incidentType              ? `- Incident type: ${existingCase.incidentType}` : null,
        existingCase.incidentDate              ? `- Incident date: ${existingCase.incidentDate}` : null,
        existingCase.incidentDateNormalized    ? `- Incident date (ISO): ${existingCase.incidentDateNormalized}` : null,
        existingCase.injurySeverity            ? `- Injury severity: ${existingCase.injurySeverity}` : null,
        existingCase.faultDescription          ? `- Fault description: ${existingCase.faultDescription}` : null,
        existingCase.priorAttorney != null
          ? `- Prior attorney: ${existingCase.priorAttorney ? "yes" : "no"}` : null,
      ].filter(Boolean).join("\n")
    : "None yet.";

  return `You are a warm, empathetic AI intake specialist for ${firm.name}, a ${firm.practiceAreas.join(", ")} law firm serving ${firm.statesServed.join(", ")}.

Your job is to have a natural, conversational SMS exchange with someone who just texted in about a potential legal matter. You are NOT a rigid questionnaire — you are a caring human-like assistant helping them feel heard while gently gathering facts.

FIELDS TO GATHER (gather naturally across multiple exchanges — not all at once):
1. incidentType — what kind of accident or incident (car accident, slip & fall, workplace injury, etc.)
2. incidentDate — when it happened (approximate is fine: "last March", "about 6 months ago")
3. injurySeverity — description of their injuries (type, severity, ongoing treatment)
4. faultDescription — who was at fault and what happened (brief)
5. priorAttorney — have they already spoken with or hired an attorney?

SMS RULES (critical — this is SMS, not email):
- Keep replies SHORT: aim for 1–3 sentences, under 160 characters when possible.
- Ask only 1 question per reply. Never dump multiple questions in one message.
- Be warm and acknowledge their situation before asking anything.
- Never sound like a form or a bot.

FIELDS ALREADY COLLECTED FROM THIS CONVERSATION:
${knownFields}

COMPLETION: Set conversationComplete = true when:
- You have gathered all 5 fields (incidentType, incidentDate, injurySeverity, faultDescription, priorAttorney), OR
- The person says goodbye / indicates they're done / asks to stop.
When completing, summarize the case facts and let them know someone will follow up.

You MUST respond with ONLY valid JSON in this exact shape — no extra text, no markdown:
{
  "reply": "Your SMS reply text here",
  "extractedFields": {
    "incidentType": "string or null",
    "incidentDate": "string or null — the date as the caller described it (e.g. 'last week', 'March 3rd')",
    "incidentDateNormalized": "ISO date string YYYY-MM-DD or null — your best guess at the calendar date based on today being ${today}; return null if you cannot reasonably determine it",
    "injurySeverity": "string or null",
    "faultDescription": "string or null",
    "priorAttorney": true,
    "summary": "one-paragraph case summary for attorney review, or null if incomplete"
  },
  "conversationComplete": false
}

Only include newly extracted or updated values in extractedFields. Use null for fields not yet known or not mentioned in this exchange.
For incidentDateNormalized: make a best-effort ISO date calculation from relative phrases. If the caller says "last week" and today is ${today}, return the approximate ISO date. Return null only if you truly cannot determine even a rough date.`;
}

// ── Twilio SMS sender (isolated — does NOT use lib/twilio.ts) ─────────────────
// Reads: INTAKE_TWILIO_ACCOUNT_SID, INTAKE_TWILIO_AUTH_TOKEN
// If either is unset, logs the reply instead of sending.

async function sendIntakeSms(
  req: Request,
  { to, from, body }: { to: string; from: string; body: string },
): Promise<void> {
  const accountSid = process.env.INTAKE_TWILIO_ACCOUNT_SID;
  const authToken  = process.env.INTAKE_TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    req.log.info(
      { to, from, body },
      "[intake] INTAKE_TWILIO_* not configured — SMS reply logged only (no message sent)",
    );
    return;
  }

  const url    = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const creds  = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const resp = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    req.log.error({ status: resp.status, text }, "[intake] Twilio SMS send failed");
  } else {
    req.log.info({ to }, "[intake] SMS reply sent via Twilio");
  }
}

// ── POST /intake/sms-webhook ──────────────────────────────────────────────────

router.post("/intake/sms-webhook", validateIntakeTwilioSignature, async (req: Request, res: Response) => {
  try {
    const { From, To, Body } = req.body as Record<string, string>;

    if (!From || !Body) {
      req.log.warn({ body: req.body }, "[intake] Missing From or Body in webhook");
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    // ── 1. Resolve firm ───────────────────────────────────────────────────────
    let [firm] = await db.select().from(intakeFirms)
      .where(eq(intakeFirms.twilioNumber, To ?? ""))
      .limit(1);

    if (!firm) {
      const all = await db.select().from(intakeFirms).limit(1);
      firm = all[0];
    }

    if (!firm) {
      req.log.error({ To }, "[intake] No firm found — seed the test firm first");
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    // ── 2. Find or create conversation ───────────────────────────────────────
    let [conversation] = await db.select().from(intakeConversations)
      .where(and(
        eq(intakeConversations.firmId, firm.id),
        eq(intakeConversations.callerPhone, From),
      ))
      .limit(1);

    let isNewConversation = false;
    if (!conversation) {
      isNewConversation = true;
      const rows = await db.insert(intakeConversations).values({
        firmId:        firm.id,
        callerPhone:   From,
        status:        "in_progress",
        lastMessageAt: new Date(),
      }).returning();
      conversation = rows[0];
    }

    if (conversation.status === "completed") {
      const closedReply = "Your intake is already complete. Our team will be in touch soon. Thank you!";
      await sendIntakeSms(req, { to: From, from: firm.twilioNumber, body: closedReply });
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    // ── 3. Store inbound message ──────────────────────────────────────────────
    await db.insert(intakeMessages).values({
      conversationId: conversation.id,
      direction:      "inbound",
      body:           Body,
    });

    // ── 3.5. Trial cap check (new conversations only) ────────────────────────
    // Existing in-progress conversations are NEVER interrupted — cap only gates
    // whether a brand-new conversation starts the automated AI loop.
    // We still create the conversation row + log the inbound message above so
    // the lead is never silently dropped.
    if (isNewConversation && firm.planTier !== "paid") {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(intakeConversations)
        .where(eq(intakeConversations.firmId, firm.id));
      const total = Number(countRow?.count ?? 0);
      if (total > firm.trialConversationsLimit) {
        req.log.info(
          { firmId: firm.id, total, limit: firm.trialConversationsLimit },
          "[intake] Trial cap reached — conversation logged but AI reply suppressed",
        );
        res.type("text/xml").send("<Response></Response>");
        return;
      }
    }

    // ── 4. Load message history and existing case ─────────────────────────────
    const history = await db.select().from(intakeMessages)
      .where(eq(intakeMessages.conversationId, conversation.id))
      .orderBy(asc(intakeMessages.createdAt));

    const [existingCase] = await db.select().from(intakeCases)
      .where(eq(intakeCases.conversationId, conversation.id))
      .limit(1);

    // ── 5. Build OpenAI messages ──────────────────────────────────────────────
    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: buildSystemPrompt(firm, existingCase ?? null) },
      ...history.map(m => ({
        role:    (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.body,
      })),
    ];

    // ── 6. Call LLM ───────────────────────────────────────────────────────────
    const completion = await openai.chat.completions.create({
      model:                "gpt-5.4",
      max_completion_tokens: 512,
      response_format:      { type: "json_object" },
      messages:             chatMessages,
    });

    const rawJson = completion.choices[0]?.message?.content ?? "{}";
    let parsed: LlmResponse;
    try {
      parsed = JSON.parse(rawJson) as LlmResponse;
    } catch {
      req.log.error({ rawJson }, "[intake] LLM returned invalid JSON — using fallback reply");
      parsed = {
        reply:               "Thank you for reaching out. Could you tell me a bit about what happened?",
        extractedFields:     {
          incidentType: null, incidentDate: null, incidentDateNormalized: null,
          injurySeverity: null, faultDescription: null, priorAttorney: null, summary: null,
        },
        conversationComplete: false,
      };
    }

    const { reply, extractedFields, conversationComplete } = parsed;

    // ── 7. Upsert intake case with newly extracted fields ─────────────────────
    // Only write fields the LLM actually extracted (non-null), so prior
    // turns' data is never overwritten with null.
    const updates: Partial<{
      incidentType:           string;
      incidentDate:           string;
      incidentDateNormalized: string;
      injurySeverity:         string;
      faultDescription:       string;
      priorAttorney:          boolean;
      summary:                string;
      tier:                   string;
      disqualifyReason:       string;
      updatedAt:              Date;
    }> = { updatedAt: new Date() };

    if (extractedFields.incidentType            != null) updates.incidentType            = extractedFields.incidentType;
    if (extractedFields.incidentDate            != null) updates.incidentDate            = extractedFields.incidentDate;
    if (extractedFields.incidentDateNormalized  != null) updates.incidentDateNormalized  = extractedFields.incidentDateNormalized;
    if (extractedFields.injurySeverity          != null) updates.injurySeverity          = extractedFields.injurySeverity;
    if (extractedFields.faultDescription        != null) updates.faultDescription        = extractedFields.faultDescription;
    if (extractedFields.priorAttorney           != null) updates.priorAttorney           = extractedFields.priorAttorney;
    if (extractedFields.summary                 != null) updates.summary                 = extractedFields.summary;

    let caseId: number;

    if (existingCase) {
      await db.update(intakeCases)
        .set(updates)
        .where(eq(intakeCases.id, existingCase.id));
      caseId = existingCase.id;
    } else {
      const [inserted] = await db.insert(intakeCases).values({
        conversationId:         conversation.id,
        firmId:                 firm.id,
        incidentType:           extractedFields.incidentType            ?? null,
        incidentDate:           extractedFields.incidentDate            ?? null,
        incidentDateNormalized: extractedFields.incidentDateNormalized  ?? null,
        injurySeverity:         extractedFields.injurySeverity          ?? null,
        faultDescription:       extractedFields.faultDescription        ?? null,
        priorAttorney:          extractedFields.priorAttorney           ?? null,
        summary:                extractedFields.summary                 ?? null,
      }).returning();
      caseId = inserted.id;
    }

    // ── 8. Store outbound message ─────────────────────────────────────────────
    await db.insert(intakeMessages).values({
      conversationId: conversation.id,
      direction:      "outbound",
      body:           reply,
    });

    // ── 9. Update conversation (lastMessageAt + status) ───────────────────────
    await db.update(intakeConversations)
      .set({
        lastMessageAt: new Date(),
        status: conversationComplete ? "completed" : conversation.status,
      })
      .where(eq(intakeConversations.id, conversation.id));

    // ── 10. On completion: score + persist + notify ───────────────────────────
    if (conversationComplete) {
      // Re-fetch the final case row to get all accumulated fields
      const [finalCase] = await db.select().from(intakeCases)
        .where(eq(intakeCases.id, caseId))
        .limit(1);

      if (finalCase) {
        const { tier, disqualifyReason } = scoreIntakeCase(
          {
            priorAttorney:          finalCase.priorAttorney          ?? null,
            incidentType:           finalCase.incidentType           ?? null,
            incidentDateNormalized: finalCase.incidentDateNormalized ?? null,
            injurySeverity:         finalCase.injurySeverity         ?? null,
          },
          {
            practiceAreas:            firm.practiceAreas,
            statuteOfLimitationsDays: firm.statuteOfLimitationsDays,
          },
        );

        // Persist tier + disqualifyReason onto the case row
        await db.update(intakeCases)
          .set({ tier, disqualifyReason: disqualifyReason ?? null })
          .where(eq(intakeCases.id, caseId));

        req.log.info(
          { caseId, tier, disqualifyReason, callerPhone: From },
          "[intake] Case scored",
        );

        // Send notification email to the firm
        try {
          const resend = getResend();
          const emoji  = TIER_EMOJI[tier] ?? "";
          const subject = `${emoji} [${tier}] New intake case: ${finalCase.incidentType ?? "unknown incident"} — ${From}`;

          await resend.emails.send({
            from:    FROM_ADDRESS,
            to:      [firm.notifyEmail],
            subject,
            html:    buildIntakeNotificationHtml({
              tier,
              callerPhone:            From,
              firmName:               firm.name,
              incidentType:           finalCase.incidentType           ?? null,
              incidentDate:           finalCase.incidentDate           ?? null,
              incidentDateNormalized: finalCase.incidentDateNormalized ?? null,
              injurySeverity:         finalCase.injurySeverity         ?? null,
              faultDescription:       finalCase.faultDescription       ?? null,
              priorAttorney:          finalCase.priorAttorney          ?? null,
              summary:                finalCase.summary                ?? null,
              disqualifyReason:       disqualifyReason                 ?? null,
            }),
          });

          req.log.info(
            { to: firm.notifyEmail, tier, subject },
            "[intake] Notification email sent",
          );
        } catch (emailErr) {
          // Non-fatal — log and continue
          req.log.error(
            { err: emailErr },
            "[intake] Notification email failed — case still stored",
          );
        }
      }
    }

    // ── 11. Send SMS reply (or log if Twilio not configured) ──────────────────
    await sendIntakeSms(req, { to: From, from: firm.twilioNumber, body: reply });

    res.type("text/xml").send("<Response></Response>");
  } catch (err) {
    req.log.error({ err }, "[intake] SMS webhook error");
    res.type("text/xml").send("<Response></Response>");
  }
});

// ── GET /intake/cases — admin review list ─────────────────────────────────────

router.get("/intake/cases", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id:                     intakeCases.id,
        createdAt:              intakeCases.createdAt,
        incidentType:           intakeCases.incidentType,
        incidentDate:           intakeCases.incidentDate,
        incidentDateNormalized: intakeCases.incidentDateNormalized,
        injurySeverity:         intakeCases.injurySeverity,
        faultDescription:       intakeCases.faultDescription,
        priorAttorney:          intakeCases.priorAttorney,
        summary:                intakeCases.summary,
        tier:                   intakeCases.tier,
        disqualifyReason:       intakeCases.disqualifyReason,
        callerPhone:            intakeConversations.callerPhone,
        conversationStatus:     intakeConversations.status,
        firmName:               intakeFirms.name,
      })
      .from(intakeCases)
      .innerJoin(intakeConversations, eq(intakeCases.conversationId, intakeConversations.id))
      .innerJoin(intakeFirms,         eq(intakeCases.firmId,         intakeFirms.id))
      .orderBy(desc(intakeCases.createdAt));

    res.json({ cases: rows });
  } catch (err) {
    req.log.error({ err }, "[intake] GET /intake/cases error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
