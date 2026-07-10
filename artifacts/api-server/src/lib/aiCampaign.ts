import { openai } from "@workspace/integrations-openai-ai-server";

// ── AI Campaign Draft Generator (Phase 26G) ───────────────────────────────────
// Drafts campaign copy for a human to review, edit, and manually save/send.
// This module NEVER sends email/SMS, NEVER enrolls a lead, and NEVER saves a
// campaign — it only returns structured draft data for the UI to pre-fill
// form fields with. The caller (route + UI) is responsible for persistence.

export interface AiCampaignGenerateInput {
  personaId?: string;
  personaLabel?: string;
  personaDescription?: string;
  personaPainPoint?: string;
  personaBestCTA?: string;
  topicId?: string;
  topicTitle?: string;
  topicDescription?: string;
  objective: string;
  toneProfile: string;
}

export interface AiSequenceGenerateInput extends AiCampaignGenerateInput {
  stepCount: number;
}

export interface AiCampaignDraft {
  subject: string;
  body: string;
}

export interface AiSequenceStepDraft {
  dayOffset: number;
  channel: "email" | "sms" | "call_prompt" | "task";
  subject: string | null;
  body: string;
  intentLabel: string;
}

export interface AiSequenceDraft {
  steps: AiSequenceStepDraft[];
}

const SAFETY_RULES = `SAFETY RULES (never break these):
- You are drafting content ONLY. Never write instructions to send, enroll, queue, or auto-anything.
- Never include phrases like "I've sent", "enrolling now", "this will automatically", or similar action language — you are producing a draft for a human to review before they manually save/send it.
- Do not invent client names, statistics, or pricing that weren't provided.
- Return ONLY valid JSON matching the requested shape — no markdown, no commentary, no code fences.`;

function personaContext(input: AiCampaignGenerateInput): string {
  const lines: string[] = [];
  if (input.personaLabel) lines.push(`- Persona: ${input.personaLabel}`);
  if (input.personaDescription) lines.push(`- Persona description: ${input.personaDescription}`);
  if (input.personaPainPoint) lines.push(`- Primary pain point: ${input.personaPainPoint}`);
  if (input.personaBestCTA) lines.push(`- Best CTA for this persona: ${input.personaBestCTA}`);
  if (input.topicTitle) lines.push(`- Topic: ${input.topicTitle}`);
  if (input.topicDescription) lines.push(`- Topic angle: ${input.topicDescription}`);
  lines.push(`- Objective: ${input.objective || "Book a discovery call"}`);
  lines.push(`- Tone profile: ${input.toneProfile || "Professional, consultative"}`);
  return lines.join("\n");
}

function extractJson<T>(raw: string): T {
  // Strip accidental code fences even though the prompt forbids them.
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

// ── Single campaign draft (broadcast) ─────────────────────────────────────────

export async function generateCampaignDraft(input: AiCampaignGenerateInput): Promise<AiCampaignDraft> {
  const systemPrompt = `You are a senior email copywriter for SiteMint Digital, a web design/SEO/CRM/automation agency.
Write a single marketing email draft matching the persona's recommended tone.
Keep the body under 180 words. Never exceed it.

${SAFETY_RULES}

Return JSON with EXACTLY this shape:
{"subject": "string, one compelling subject line", "body": "string, plain-text email body with line breaks as \\n"}`;

  const userPrompt = `Draft one marketing email for this campaign:\n${personaContext(input)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson<Partial<AiCampaignDraft>>(raw);
  return {
    subject: String(parsed.subject ?? "").trim() || "Draft subject (edit me)",
    body: String(parsed.body ?? "").trim() || "Draft body (edit me)",
  };
}

// ── Multi-step sequence draft (nurture/drip) ──────────────────────────────────

export async function generateSequenceDraft(input: AiSequenceGenerateInput): Promise<AiSequenceDraft> {
  const stepCount = Math.min(Math.max(Math.round(input.stepCount) || 4, 1), 12);

  const systemPrompt = `You are a senior lifecycle marketing strategist for SiteMint Digital, a web design/SEO/CRM/automation agency.
Design a ${stepCount}-step nurture sequence matching the persona's recommended tone.
Space steps out realistically — do NOT front-load all steps on day 0-1. A reasonable pattern is
day 0, then roughly +2 to +5 days between subsequent steps, tapering the interval later in the sequence.
Prefer "email" for most steps; use "sms" for a quick nudge, "call_prompt" for a suggested phone call, and
"task" for an internal reminder — vary channels only when it makes sense, most sequences should be mostly email.
Each email step's body must stay under 180 words. Each sms body must stay under 160 characters.

${SAFETY_RULES}

Return JSON with EXACTLY this shape:
{"steps": [
  {"dayOffset": 0, "channel": "email", "subject": "string or null (null unless channel is email)", "body": "string", "intentLabel": "short phrase describing this step's intent, e.g. 'Introduce value'"}
]}
The "steps" array must contain exactly ${stepCount} items, sorted by ascending dayOffset, with dayOffset starting at 0.`;

  const userPrompt = `Draft a ${stepCount}-step nurture sequence for this campaign:\n${personaContext(input)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson<{ steps?: unknown[] }>(raw);
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];

  const allowedChannels = new Set(["email", "sms", "call_prompt", "task"]);
  const steps: AiSequenceStepDraft[] = rawSteps.slice(0, stepCount).map((s, i) => {
    const step = (s ?? {}) as Record<string, unknown>;
    const channel = allowedChannels.has(String(step.channel)) ? (String(step.channel) as AiSequenceStepDraft["channel"]) : "email";
    return {
      dayOffset: Number.isFinite(Number(step.dayOffset)) ? Math.max(0, Math.round(Number(step.dayOffset))) : i * 3,
      channel,
      subject: channel === "email" ? (String(step.subject ?? "").trim() || `Draft step ${i + 1}`) : null,
      body: String(step.body ?? "").trim() || "Draft body (edit me)",
      intentLabel: String(step.intentLabel ?? "").trim(),
    };
  });

  if (steps.length === 0) {
    throw new Error("AI returned no usable steps");
  }

  return { steps };
}
