import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { validateToken } from "../lib/admin-session.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.substring(7);
  if (!validateToken(token)) { res.status(401).json({ error: "Invalid token" }); return; }
  next();
}

// ── POST /crm/campaigns/copilot/generate ─────────────────────────────────────
// Streams a complete AI-generated campaign strategy + multi-step sequence.
// SSE format: data: {"type":"chunk","content":"..."}  then  data: {"type":"done"}
// SAFETY: AI never enrolls contacts, starts campaigns, queues or sends messages.
// All output is text-only. The client is responsible for any save actions.

router.post("/crm/campaigns/copilot/generate", requireAdmin, async (req: Request, res: Response) => {
  const {
    campaignGoal,
    personaId,
    personaLabel,
    discStyle,
    leadTemperature,
    industry,
    leadSource,
    tone,
    touchCount,
    channels,
    // extra context passed from the client for richer prompting
    personaDescription,
    personaPainPoint,
    personaBestCTA,
    personaRecommendedCadence,
  } = req.body as Record<string, string | string[]>;

  if (!campaignGoal) {
    res.status(400).json({ error: "campaignGoal is required" });
    return;
  }

  const channelList = Array.isArray(channels) ? channels.join(", ") : (channels || "email");
  const touchNum    = Number(touchCount) || 5;

  const systemPrompt = `You are a senior marketing strategist for SiteMint Digital — a web design, SEO, CRM, and automation agency.
Your job is to generate a complete, professional nurture campaign for a specific lead persona.

SiteMint services: website design & development, website redesigns, SEO, local SEO, CRM implementation, marketing automation, booking systems, proposal & onboarding systems.

You understand DISC behavioral psychology (Driver, Analytical, Amiable, Expressive) and apply it to messaging.
You know how to write subject lines that earn opens, body copy that earns replies, and CTAs that earn bookings.

SAFETY RULES (never break these):
- Do NOT instruct the user to enroll contacts, start a campaign, queue messages, or send anything automatically.
- All output is a strategic draft — always note that copy should be reviewed before sending.
- Do not invent client names, case studies, statistics, or pricing unless the user provided them.
- Keep every email under 200 words, every SMS under 160 characters.`;

  const userPrompt = `Generate a complete ${touchNum}-step nurture campaign for SiteMint Digital.

CAMPAIGN GOAL: ${campaignGoal}

AUDIENCE DETAILS:
- Persona: ${personaLabel || personaId || "General prospect"}
${personaDescription ? `- Description: ${personaDescription}` : ""}
${personaPainPoint ? `- Primary pain point: ${personaPainPoint}` : ""}
${personaBestCTA ? `- Best CTA for this persona: ${personaBestCTA}` : ""}
${personaRecommendedCadence ? `- Recommended cadence: ${personaRecommendedCadence}` : ""}
- DISC style: ${discStyle || "Not specified — write for general appeal"}
- Lead temperature: ${leadTemperature || "warm"}
- Industry: ${industry || "General business"}
- Lead source: ${leadSource || "Not specified"}

CAMPAIGN SETTINGS:
- Tone: ${tone || "Professional, consultative"}
- Number of touches: ${touchNum}
- Channels to use: ${channelList}

OUTPUT FORMAT — follow this EXACTLY, no deviation:

## CAMPAIGN STRATEGY

**Campaign Name:** [A compelling, specific campaign name]

**Objective:** [One sentence — what this campaign accomplishes]

**Summary:** [2–3 sentences explaining the strategy]

**Why this sequence works:** [2–3 sentences on the psychological/behavioral logic]

**Expected behavioral outcome:** [What the ideal lead does by the end]

**Ideal audience:** [Who benefits most from this campaign]

**Risk level:** Low / Medium / High — [one sentence explanation]

**Estimated completion time:** [e.g., "14 days"]

**Expected reply rate:** [e.g., "8–12% for warm lists"]

**Expected conversion rate:** [e.g., "3–5% to booked call"]

---

## CAMPAIGN HEALTH

**Sequence balance:** [Assessment: email/SMS/call/task mix]
**Touch frequency:** [Assessment: pacing and fatigue risk]
**Value-to-ask ratio:** [Assessment: how much value vs. how many asks]
**Behavior diversity:** [Assessment: variety of engagement signals tested]
**Overall campaign score:** [X/10 — brief explanation]

---

## SEQUENCE STEPS

For each step output EXACTLY this block (repeat for all ${touchNum} steps):

### Step [N] — Day [X]
**Channel:** [email | sms | call_prompt | task]
**Subject:** [Subject line — email only, leave blank for sms/call/task]
**Preview text:** [Preview text — email only]

**Body:**
[Full message copy. Email: ≤200 words. SMS: ≤160 characters. Call: a brief talk-track. Task: a clear internal task description.]

**CTA:** [The specific call to action]

**Subject score:**
- Curiosity: [1–10]
- Trust: [1–10]
- Spam risk: [Low/Medium/High]
- Open potential: [1–10]
- Urgency: [Low/Medium/High]
- Emotional score: [1–10]

**Email quality score:** (email steps only)
- Readability: [1–10]
- Personalization: [1–10]
- Spam risk: [Low/Medium/High]
- CTA strength: [1–10]
- Curiosity: [1–10]
- Authority: [1–10]
- Trust: [1–10]
- Relationship building: [1–10]
- DISC coverage: [1–10]
- Overall step score: [1–10]

**Step Intelligence:**
- Objective: [The specific objective of this step]
- Desired behavior: [What you want the lead to do after receiving this]
- Target signal: [The behavioral event that indicates success, e.g. email_opened, reply, meeting_booked]
- Expected lift: [What metric should improve and by how much]
- Routing hint: [What to do next if they engage vs. don't engage]

---

## JOURNEY SIMULATION

Show a realistic journey for an interested lead:

**Best-case path:**
[Numbered list: Lead receives Step 1 → [action] → receives Step 2 → [action] → ... → books call]

**No-open scenario:**
[What happens and what the routing recommendation is]

**No-click scenario:**
[What happens and what the routing recommendation is]

**Negative reply scenario:**
[How to handle it gracefully]

**Interested reply scenario:**
[How to capitalize on the signal]

---

REMINDER: This is a strategy draft. All copy must be reviewed and personalised before sending to real contacts. Do not enroll contacts or trigger any sends.`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Copilot generation error");
    res.write(`data: ${JSON.stringify({ type: "error", message: "AI generation failed — please try again." })}\n\n`);
    res.end();
  }
});

export default router;
