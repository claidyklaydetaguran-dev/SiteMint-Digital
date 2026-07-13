/**
 * AI SMS Intake Agent — Phase 1
 *
 * Inbound Twilio webhook → LLM conversation → structured case extraction.
 *
 * SECURITY NOTE: Twilio webhook signature validation is NOT implemented here.
 * It MUST be added (using Twilio's X-Twilio-Signature header + the webhook
 * URL + sorted params) before any real firm goes live. Phase 1 defers this
 * to keep the dev loop fast and testable with plain curl.
 *
 * LIMITATIONS (all expected — Phase 2 scope):
 * - Single hardcoded test firm; firm looked up by `To` number, falls back
 *   to the first seeded firm when number doesn't match.
 * - No scoring or risk assessment.
 * - No attorney notification emails.
 * - Twilio credentials are INTAKE_TWILIO_* env vars; if unset, reply is
 *   logged only — no SMS is actually sent.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  intakeFirms,
  intakeConversations,
  intakeMessages,
  intakeCases,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { IntakeFirm, IntakeCase } from "@workspace/db";

const router: IRouter = Router();

// ── LLM contract ──────────────────────────────────────────────────────────────

interface ExtractedFields {
  incidentType:     string | null;
  incidentDate:     string | null;
  injurySeverity:   string | null;
  faultDescription: string | null;
  priorAttorney:    boolean | null;
  summary:          string | null;
}

interface LlmResponse {
  reply:               string;
  extractedFields:     ExtractedFields;
  conversationComplete: boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(firm: IntakeFirm, existingCase: IntakeCase | null): string {
  const knownFields = existingCase
    ? [
        existingCase.incidentType     ? `- Incident type: ${existingCase.incidentType}` : null,
        existingCase.incidentDate     ? `- Incident date: ${existingCase.incidentDate}` : null,
        existingCase.injurySeverity   ? `- Injury severity: ${existingCase.injurySeverity}` : null,
        existingCase.faultDescription ? `- Fault description: ${existingCase.faultDescription}` : null,
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
    "incidentDate": "string or null",
    "injurySeverity": "string or null",
    "faultDescription": "string or null",
    "priorAttorney": true or false or null,
    "summary": "one-paragraph case summary for attorney review, or null if incomplete"
  },
  "conversationComplete": false
}

Only include newly extracted or updated values in extractedFields. Use null for fields not yet known or not mentioned in this exchange.`;
}

// ── Twilio SMS sender (isolated — does NOT use lib/twilio.ts) ─────────────────
// Reads: INTAKE_TWILIO_ACCOUNT_SID, INTAKE_TWILIO_AUTH_TOKEN
// If either is unset, logs the reply instead of sending. This is intentional
// for Phase 1 where no real Twilio number is provisioned yet.

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
// Twilio sends form-encoded fields: From, To, Body (plus others we ignore).
// express.urlencoded() in app.ts already parses these — no extra middleware needed.

router.post("/intake/sms-webhook", async (req: Request, res: Response) => {
  // SECURITY: Twilio webhook signature validation must be added here before
  // any real firm goes live. See: https://www.twilio.com/docs/usage/webhooks/webhooks-security

  try {
    const { From, To, Body } = req.body as Record<string, string>;

    if (!From || !Body) {
      req.log.warn({ body: req.body }, "[intake] Missing From or Body in webhook");
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    // ── 1. Resolve firm ───────────────────────────────────────────────────────
    // Match by the Twilio number the caller texted. Falls back to the first
    // seeded firm for Phase 1 testing (only one firm exists).
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

    if (!conversation) {
      const rows = await db.insert(intakeConversations).values({
        firmId:        firm.id,
        callerPhone:   From,
        status:        "in_progress",
        lastMessageAt: new Date(),
      }).returning();
      conversation = rows[0];
    }

    if (conversation.status === "completed") {
      // Conversation already finished — politely decline further intake
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
        extractedFields:     { incidentType: null, incidentDate: null, injurySeverity: null, faultDescription: null, priorAttorney: null, summary: null },
        conversationComplete: false,
      };
    }

    const { reply, extractedFields, conversationComplete } = parsed;

    // ── 7. Upsert intake case with newly extracted fields ─────────────────────
    // Only write fields that the LLM actually extracted (non-null values),
    // so previous turns' data is never overwritten with null.
    const updates: Partial<{
      incidentType: string;
      incidentDate: string;
      injurySeverity: string;
      faultDescription: string;
      priorAttorney: boolean;
      summary: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (extractedFields.incidentType     != null) updates.incidentType     = extractedFields.incidentType;
    if (extractedFields.incidentDate     != null) updates.incidentDate     = extractedFields.incidentDate;
    if (extractedFields.injurySeverity   != null) updates.injurySeverity   = extractedFields.injurySeverity;
    if (extractedFields.faultDescription != null) updates.faultDescription = extractedFields.faultDescription;
    if (extractedFields.priorAttorney    != null) updates.priorAttorney    = extractedFields.priorAttorney;
    if (extractedFields.summary          != null) updates.summary          = extractedFields.summary;

    if (existingCase) {
      await db.update(intakeCases)
        .set(updates)
        .where(eq(intakeCases.id, existingCase.id));
    } else {
      await db.insert(intakeCases).values({
        conversationId:   conversation.id,
        firmId:           firm.id,
        incidentType:     extractedFields.incidentType     ?? null,
        incidentDate:     extractedFields.incidentDate     ?? null,
        injurySeverity:   extractedFields.injurySeverity   ?? null,
        faultDescription: extractedFields.faultDescription ?? null,
        priorAttorney:    extractedFields.priorAttorney    ?? null,
        summary:          extractedFields.summary          ?? null,
      });
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

    // ── 10. Send SMS reply (or log if Twilio not configured) ──────────────────
    await sendIntakeSms(req, { to: From, from: firm.twilioNumber, body: reply });

    // Return empty TwiML — actual reply is sent via REST API above
    res.type("text/xml").send("<Response></Response>");
  } catch (err) {
    req.log.error({ err }, "[intake] SMS webhook error");
    res.type("text/xml").send("<Response></Response>");
  }
});

export default router;
