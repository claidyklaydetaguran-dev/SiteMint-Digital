// ── M4: AI campaign drafting ────────────────────────────────────────────────
//
// Suggests an editable subject, preheader, body and call-to-action label for a
// marketing campaign. Everything it returns is a DRAFT: the campaign row it
// lands on is marked `ai_content_state = 'draft'` and cannot be sent until a
// named person approves it.
//
// Three properties this module exists to hold.
//
//   Grounding      The model is given one thing — a `CampaignGrounding` object
//                  built here from verified facts and the real segment/contact
//                  context — and told it may use nothing else. It is never
//                  asked what SiteMint does, never given the run of the
//                  conversation, and never handed a customer record wholesale.
//
//   Verification   A prompt is a request, not a guarantee. Every draft is then
//                  scanned for the classes of claim a marketing email must
//                  never invent on its own: money, percentages, guarantees,
//                  awards, statistics, testimonials, named clients. A draft
//                  that contains one is REJECTED and returned as a refusal
//                  with the offending text quoted — not silently scrubbed,
//                  because a scrubbed sentence usually still asserts the thing.
//
//   Honesty        With no OpenAI configuration this feature reports itself
//                  unavailable and the rest of the builder keeps working.
//                  Nothing here composes a "suggestion" locally and presents it
//                  as model output. A fabricated fallback would be the exact
//                  failure the grounding rules exist to prevent, arriving by a
//                  different door.
//
// The OpenAI client is consumed the way `routes/intakeAgent.ts` consumes it —
// through the `@workspace/integrations-openai-ai-server` barrel, whose `openai`
// handle is a lazy proxy that raises `OpenAiUnavailableError` on first use when
// the integration is not configured. That file is protected and was not
// touched.

import {
  openai, isOpenAiConfigured, missingOpenAiConfig,
} from "@workspace/integrations-openai-ai-server";
import { CRM_MERGE_FIELDS, type CrmMergeField } from "@workspace/db";

// ── The verified facts ──────────────────────────────────────────────────────

/**
 * Everything the model is allowed to know about SiteMint Digital.
 *
 * Deliberately small and deliberately free of numbers. There is no pricing
 * here, no client list, no "we increased X by Y%" — not because those would be
 * useful to withhold, but because anything in this object can end up asserted
 * in a customer's inbox, and only things somebody has verified belong in that
 * position.
 *
 * Services are stated as the work offered, not as a package with a price.
 */
export const SITEMINT_VERIFIED_FACTS = {
  company: "SiteMint Digital Solutions",
  whatWeDo:
    "A web design and digital studio. We build and rebuild business websites, "
    + "web applications and e-commerce stores, run SEO and blog content, set up "
    + "CRM and AI automation, and maintain what we build.",
  services: [
    "Website design", "Website redesign", "Web application development",
    "CRM development", "SEO", "Blog content", "Maintenance and support",
    "AI automation", "E-commerce", "Landing pages", "Branding", "Website audit",
  ],
  howWeStart: "A discovery call, or a short discovery form the client fills in.",
  contact: { email: "info.sitemint@gmail.com", phone: "949-880-6515" },
} as const;

// ── The grounding set ───────────────────────────────────────────────────────

export interface CampaignGroundingInput {
  /** What the campaign is for, in the requester's own words. */
  goal: string;
  /** Tone the requester asked for, e.g. "warm and plain". Free text. */
  tone?: string | null;
  /** The audience, as the segment describes itself. */
  segmentName?: string | null;
  segmentDescription?: string | null;
  /**
   * A DESCRIPTION of who is in the segment — counts and the distinct values of
   * a few classification fields. Never a list of people.
   */
  audienceShape?: {
    size: number;
    statuses: string[];
    sources: string[];
    services: string[];
  } | null;
  /** Merge fields this campaign may use. */
  mergeFields?: CrmMergeField[];
  /**
   * Prices, offers and terms an authorised owner has supplied and stands
   * behind. These are the ONLY claims of their kind a draft may make: the
   * guard licenses a matched fragment when it appears inside one of these,
   * and refuses it otherwise. Without this a campaign could never mention a
   * price, which is most of what marketing is for.
   */
  approvedFacts?: ApprovedFact[];
}

/**
 * The object that is put in front of the model, and nothing else.
 *
 * It is built here rather than assembled at the call site so there is one
 * place to read to know what the model can see — and so `ai_grounding` on the
 * campaign row is a faithful copy of it, which makes a claim in a sent email
 * traceable to the fact it was grounded on, or provably not.
 */
export interface CampaignGrounding {
  facts: typeof SITEMINT_VERIFIED_FACTS;
  goal: string;
  tone: string;
  audience: {
    name: string | null;
    description: string | null;
    shape: CampaignGroundingInput["audienceShape"];
  };
  mergeFields: { token: string; means: string }[];
  /** What licensed any price or offer in the copy, and who approved it. */
  approvedFacts: ApprovedFact[];
}

export function buildGrounding(input: CampaignGroundingInput): CampaignGrounding {
  const fields = (input.mergeFields ?? ["first_name", "company"]).filter(
    (f): f is CrmMergeField => f in CRM_MERGE_FIELDS,
  );
  return {
    facts: SITEMINT_VERIFIED_FACTS,
    goal: input.goal.trim(),
    tone: (input.tone ?? "professional, plain-spoken, no hype").trim(),
    audience: {
      name: input.segmentName ?? null,
      description: input.segmentDescription ?? null,
      shape: input.audienceShape ?? null,
    },
    mergeFields: fields.map((token) => ({ token, means: CRM_MERGE_FIELDS[token] })),
    approvedFacts: input.approvedFacts ?? [],
  };
}

// ── Availability ────────────────────────────────────────────────────────────

export interface DraftingAvailability {
  available: boolean;
  /** Names of absent configuration variables — never their values. */
  missing: readonly string[];
  /**
   * For the person trying to write a campaign. No variable names, no server
   * vocabulary: somebody selling websites should not have to read an
   * environment variable to understand why a button is greyed out.
   */
  reason: string | null;
  /**
   * For whoever administers the deployment. This is where the variable names
   * live, and the UI shows it behind a disclosure rather than in the flow.
   */
  adminDetail: string | null;
}

/**
 * Whether drafting can run at all, and if not, why.
 *
 * Two audiences, two messages. The builder renders the operator one as a status
 * panel rather than hiding the feature, because "the button is missing" and
 * "the button is broken" are indistinguishable to the person using it — and it
 * keeps the administrator detail collapsed, because a raw variable name in the
 * main flow is noise to the operator and an invitation to paste a secret
 * somewhere it does not belong.
 */
export function draftingAvailability(env: NodeJS.ProcessEnv = process.env): DraftingAvailability {
  if (isOpenAiConfigured(env)) {
    return { available: true, missing: [], reason: null, adminDetail: null };
  }
  const missing = missingOpenAiConfig(env);
  return {
    available: false,
    missing,
    reason:
      "Drafting with AI is not switched on for this workspace yet. "
      + "Everything else here works — write the email yourself, or ask whoever "
      + "looks after this system to turn it on.",
    adminDetail:
      `Set ${missing.join(" and ")} in the deployment's secret store, then restart. `
      + "These are the same variables the AI intake scoring already uses, so an "
      + "environment where that works needs no new credential.",
  };
}

// ── What a draft may not contain ────────────────────────────────────────────

/**
 * The claim classes a drafted email must never invent.
 *
 * Each entry is a pattern and the plain reason it is refused. They are checked
 * against the model's OUTPUT, because the prompt is a request and this is the
 * enforcement. A match rejects the whole draft rather than editing it: a
 * sentence with its number removed usually still asserts the thing, and a
 * half-removed claim is harder to spot than a whole one.
 */
const UNGROUNDED_CLAIM_RULES: { name: string; pattern: RegExp; why: string }[] = [
  {
    name: "price",
    // The amount must be captured WHOLE. An earlier version matched only the
    // symbol and one digit, so "£499" reported as "£4" — harmless while the
    // guard only ever refused, but once an approved fact can license a match,
    // a truncated "£1" out of "£1,999" is a substring of an approved "£1,200"
    // and would license an invented price. The match is the unit of trust, so
    // it has to be the whole claim.
    pattern: /(?:[$£€]\s?\d[\d,]*(?:\.\d+)?|(?:\b\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars|per month|\/month|a month))/i,
    why: "It names a price. Nothing in the grounding set contains pricing, so any figure here was invented.",
  },
  {
    name: "percentage",
    pattern: /\b\d+(?:\.\d+)?\s?%/,
    why: "It quotes a percentage. No measured figure was supplied, so this would be a statistic we made up.",
  },
  {
    name: "discount",
    pattern: /\b(?:discount|% off|percent off|half price|money[- ]back|free trial|no obligation refund)\b/i,
    why: "It offers a discount or refund term that nobody has authorised.",
  },
  {
    name: "guarantee",
    pattern: /\b(?:guarantee[sd]?|guaranteed|we promise|risk[- ]free)\b/i,
    why: "It makes a guarantee. Guarantees are contractual and are not ours to write into a marketing email.",
  },
  {
    name: "award",
    pattern: /\b(?:award[- ]winning|#\s?1\b|no\.?\s?1\b|industry[- ]leading|best[- ]in[- ]class|top[- ]rated)\b/i,
    why: "It claims a ranking or award that is not in the verified facts.",
  },
  {
    name: "statistic",
    pattern: /\b\d+(?:\.\d+)?\s?(?:x|times)\s+(?:more|faster|better|higher|greater)\b|\b(?:studies show|research shows|on average,)\b/i,
    why: "It quotes a measurement. No measurement was supplied to ground it.",
  },
  {
    name: "testimonial",
    pattern: /\b(?:testimonial|our clients say|customers say|rated \d|reviews? say|trusted by (?:over )?\d)\b/i,
    why: "It attributes words or trust to customers who were never quoted.",
  },
  {
    name: "named client",
    pattern: /\b(?:clients like|companies like|customers like|such as|including)\s+[A-Z][A-Za-z0-9&.'-]+/,
    why: "It names, or appears to name, a client. No client names are in the grounding set.",
  },
];

export interface UngroundedClaim {
  rule: string;
  matched: string;
  why: string;
}

/**
 * A fact an authorised owner has supplied and stands behind.
 *
 * This is what makes a price sayable. The guard below does not ask "does this
 * text contain a number" — it asks "is this claim one the owner approved". A
 * campaign that genuinely has a price is normal business, and refusing it would
 * make the feature useless for the thing marketing exists to do. What must
 * never happen is the *model* inventing one.
 */
export interface ApprovedFact {
  /** The exact claim as the owner wrote it, e.g. "£1,200 setup". */
  text: string;
  /** Who approved it. Recorded so a claim in a sent email has a name against it. */
  approvedBy: string;
}

/** Normalised for comparison: case, whitespace and thousands separators. */
function claimKey(s: string): string {
  return s.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Finds claims in drafted copy that nothing in the grounding set supports.
 *
 * Pure, so the judgement can be tested without a model or a network — which
 * matters, because this function is the actual guarantee. The prompt is only
 * the polite version of it.
 *
 * `approved` licenses specific claims. A matched fragment is allowed when it
 * appears inside a fact an owner approved — so "£1,200 setup" passes if the
 * owner supplied it, and "£999 this week only" still fails, because nobody
 * authorised that figure. Matching is on the normalised fragment rather than
 * the whole sentence, so the model may write around the fact without having to
 * reproduce the owner's sentence word for word.
 */
export function findUngroundedClaims(
  text: string,
  approved: readonly ApprovedFact[] = [],
): UngroundedClaim[] {
  const licensed = approved.map((f) => claimKey(f.text));
  const isLicensed = (fragment: string) => {
    const key = claimKey(fragment);
    return licensed.some((fact) => fact.includes(key));
  };

  const found: UngroundedClaim[] = [];
  for (const rule of UNGROUNDED_CLAIM_RULES) {
    // `matchAll` rather than `exec`: a draft can carry one approved price and
    // one invented one, and stopping at the first match would let the second
    // through whenever the approved one happened to come first.
    for (const m of text.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "") + "g"))) {
      if (isLicensed(m[0])) continue;
      found.push({ rule: rule.name, matched: m[0].slice(0, 120), why: rule.why });
      break;
    }
  }
  return found;
}

/**
 * Finds merge tokens the draft used that the campaign cannot honour.
 *
 * Two ways a token is wrong, and both end as a refusal:
 *  - it names a field that does not exist, so it would render literally;
 *  - it has no `|fallback`, so it renders empty for anybody missing that value
 *    and the email opens "Hi ,".
 */
export function findBadMergeTokens(text: string): { token: string; why: string }[] {
  const bad: { token: string; why: string }[] = [];
  const pattern = /\{\{([^}]*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const inner = (m[1] ?? "").trim();
    const [rawField, ...rest] = inner.split("|");
    const field = (rawField ?? "").trim();
    if (!(field in CRM_MERGE_FIELDS)) {
      bad.push({ token: m[0], why: `"${field}" is not a merge field this CRM can resolve.` });
      continue;
    }
    if (rest.length === 0 || rest.join("|").trim() === "") {
      bad.push({
        token: m[0],
        why: `"${field}" has no fallback. Written this way it renders as nothing for every contact missing that value.`,
      });
    }
  }
  return bad;
}

// ── Drafting ────────────────────────────────────────────────────────────────

export interface CampaignDraft {
  subject: string;
  preheader: string;
  body: string;
  ctaLabel: string;
}

export type CampaignDraftResult =
  | { ok: true; draft: CampaignDraft; grounding: CampaignGrounding }
  | { ok: false; refusal: "unavailable" | "unusable_response" | "ungrounded"; reason: string; claims?: UngroundedClaim[]; badTokens?: { token: string; why: string }[] };

/**
 * The single seam a test provider may reach this module through.
 *
 * Explicit injection, mirroring the voice platform's
 * `PublishServiceDependencies`: there is no environment variable that swaps
 * the model out, no registry lookup and no silent fallback. Production calls
 * `draftCampaign` with no second argument and always gets the real client.
 */
export interface CampaignDraftingDependencies {
  /** Returns the model's raw response text for a system/user prompt pair. */
  complete(args: { system: string; user: string }): Promise<string>;
  /** Overridable only so a test can exercise the unavailable path. */
  availability?(): DraftingAvailability;
}

const MODEL = "gpt-5.4";

const productionDependencies: CampaignDraftingDependencies = {
  async complete({ system, user }) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  },
};

function systemPrompt(grounding: CampaignGrounding): string {
  const tokens = grounding.mergeFields
    .map((f) => `  {{${f.token}|<a sensible fallback>}} — ${f.means}`)
    .join("\n");

  return `You are drafting ONE marketing email for ${grounding.facts.company}.

THE ONLY INFORMATION YOU MAY USE is the JSON object in the user message. It is
the complete and exclusive set of facts about this business and this audience.

You must NOT introduce, imply, or allude to any of the following, because none
of them were supplied and inventing one would put a false claim in a real
customer's inbox:
  - prices, fees, rates, budgets or any monetary figure
  - discounts, offers, refunds, free trials or money-back terms
  - guarantees or promises of a result
  - percentages, multipliers, statistics or measured outcomes of any kind
  - awards, rankings, "#1", "industry-leading" or similar status claims
  - testimonials, reviews, ratings, or anything attributed to a customer
  - the name of any client, company or person

Write plainly. No hype, no stock marketing filler, no "unlock", "supercharge",
"game-changing", "in today's fast-paced world".

Personalisation uses merge tokens. Every token MUST carry a fallback after a
pipe, because a token without one renders as nothing for any contact missing
that value. Available tokens:
${tokens || "  (none — write without personalisation)"}

Keep the body under 160 words. Sign off with "[Your name]" — do not invent a
signatory.

Return ONLY a JSON object, no markdown and no commentary, of exactly this shape:
{"subject":"string","preheader":"string, one short line shown after the subject",
 "body":"string, plain text, line breaks as \\n","ctaLabel":"string, 2-5 words for a button"}

Do not include a URL anywhere. The person reviewing this draft chooses where
the button points.`;
}

/**
 * Drafts campaign copy, or refuses and says why.
 *
 * Never throws for the ordinary failures — an unconfigured integration, an
 * unparseable response, an ungrounded claim — because each of those is a real
 * answer the builder has to show rather than a 500.
 */
export async function draftCampaign(
  input: CampaignGroundingInput,
  deps: CampaignDraftingDependencies = productionDependencies,
): Promise<CampaignDraftResult> {
  const availability = deps.availability ? deps.availability() : draftingAvailability();
  if (!availability.available) {
    return { ok: false, refusal: "unavailable", reason: availability.reason ?? "AI drafting is not configured." };
  }

  const grounding = buildGrounding(input);

  let raw: string;
  try {
    raw = await deps.complete({
      system: systemPrompt(grounding),
      user: JSON.stringify(grounding, null, 2),
    });
  } catch (err) {
    return {
      ok: false,
      refusal: "unavailable",
      reason: err instanceof Error
        ? `The model could not be reached: ${err.message.slice(0, 200)}`
        : "The model could not be reached.",
    };
  }

  let parsed: Partial<CampaignDraft>;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned) as Partial<CampaignDraft>;
  } catch {
    return {
      ok: false,
      refusal: "unusable_response",
      reason: "The model did not return usable JSON, so there is no draft to show. Nothing was saved.",
    };
  }

  const draft: CampaignDraft = {
    subject: String(parsed.subject ?? "").trim(),
    preheader: String(parsed.preheader ?? "").trim(),
    body: String(parsed.body ?? "").trim(),
    ctaLabel: String(parsed.ctaLabel ?? "").trim(),
  };

  if (!draft.subject || !draft.body) {
    return {
      ok: false,
      refusal: "unusable_response",
      reason: "The model returned no subject or no body. Nothing was saved.",
    };
  }

  const whole = `${draft.subject}\n${draft.preheader}\n${draft.body}\n${draft.ctaLabel}`;
  // Owner-approved prices and terms license those exact claims; everything
  // else of that kind is still refused. Passing the grounding's copy rather
  // than the raw input keeps the check and the stored record in agreement.
  const claims = findUngroundedClaims(whole, grounding.approvedFacts);
  const badTokens = findBadMergeTokens(whole);
  if (claims.length > 0 || badTokens.length > 0) {
    return {
      ok: false,
      refusal: "ungrounded",
      reason:
        "The draft was refused because it contained something nothing in the grounding set supports. "
        + "It has not been saved to the campaign. Try again, or write the copy yourself.",
      claims,
      badTokens,
    };
  }

  return { ok: true, draft, grounding };
}
