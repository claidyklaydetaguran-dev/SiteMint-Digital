// ── DISC Communication Intelligence Engine ────────────────────────────────────
// Rule-based behavioral profiling. Zero AI. Zero LLM. Fully transparent.
// Every score is explainable. Every point is traceable to a specific signal.
//
// DISC stands for:
//   D — Driver      (Dominant, decisive, direct, results-focused)
//   I — Expressive  (Influencing, enthusiastic, creative, social)
//   S — Amiable     (Steady, relationship-focused, warm, supportive)
//   C — Analytical  (Conscientious, data-driven, careful, methodical)
//
// This engine powers: Communication Profile, Follow-up Recommendations,
// Email Tone, Call Scripts, and future Campaign Automation.

// ── Input Interfaces ──────────────────────────────────────────────────────────

export interface DiLead {
  id: number;
  status: string;
  priority: string;
  source?: string;
  serviceInterest?: string | null;
  notes?: string | null;
  tags?: string[];
  estimatedValue?: string | null;
  packageType?: string | null;
  proposalStatus?: string;
  discoveryFormStatus?: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  smsConsent?: boolean;
  smsOptOut?: boolean;
}

export interface DiMessage {
  id: number;
  direction: string;       // "inbound" | "outbound"
  channel: string;         // "sms" | "call"
  body?: string | null;
  status?: string | null;
  callStatus?: string | null;
  duration?: number | null;
  createdAt: string;
}

export interface DiActivity {
  id: number;
  type: string;
  title: string;
  description?: string | null;
  createdAt: string;
}

export interface DiDiscovery {
  serviceInterest?: string;
  timeline?: string;
  budget?: string;
  goals?: string;
  [key: string]: unknown;
}

// ── Output Interfaces ─────────────────────────────────────────────────────────

export type DiscStyle = "Driver" | "Expressive" | "Amiable" | "Analytical";

export interface DiscRawScores {
  driver: number;
  expressive: number;
  amiable: number;
  analytical: number;
}

export interface DiscNormalized {
  driver: number;
  expressive: number;
  amiable: number;
  analytical: number;
}

export interface DiscReason {
  style: DiscStyle;
  text: string;
  points: number;
}

export interface CommunicationProfile {
  primaryStyle: DiscStyle;
  secondaryStyle: DiscStyle;
  confidence: number;
  preferredChannel: "SMS" | "Email" | "Call" | "Unknown";
  communicationLength: "Short" | "Medium" | "Long";
  decisionSpeed: "Fast" | "Moderate" | "Slow";
  suggestedTone: string;
  suggestedFollowUpStyle: string;
  approach: string;
}

export interface DiscProfile {
  raw: DiscRawScores;
  normalized: DiscNormalized;
  primaryStyle: DiscStyle;
  secondaryStyle: DiscStyle;
  confidence: number;
  reasons: DiscReason[];
  communicationProfile: CommunicationProfile;
  dataPoints: number;
}

export interface CommunicationStyle {
  tone: "Active" | "Warm" | "Enthusiastic" | "Analytical";
  length: "Short" | "Medium" | "Long";
  emotion: "Professional" | "Supportive" | "Expressive" | "Formal";
  cta: "Direct" | "Gentle" | "Inspiring" | "Evidence-based";
  greeting: "Brief" | "Warm" | "Energetic" | "Formal";
  closing: "Action-oriented" | "Supportive" | "Open-ended" | "Logical";
}

// ── Internal Types ────────────────────────────────────────────────────────────

interface MutableScores {
  driver: number;
  expressive: number;
  amiable: number;
  analytical: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;

// Keywords per DISC style (lowercase, partial match)
const DRIVER_KEYWORDS = [
  "asap", "quickly", "urgent", "need", "now", "fast", "immediately",
  "bottom line", "results", "deadline", "outcome", "quick", "decision",
  "let's go", "move forward", "done deal", "sign", "start",
];

const ANALYTICAL_KEYWORDS = [
  "compare", "comparison", "analysis", "data", "metrics", "roi",
  "review", "detail", "breakdown", "research", "statistics", "report",
  "how does", "what are", "can you explain", "timeline", "process",
  "specifics", "documentation", "track", "measure",
];

const AMIABLE_KEYWORDS = [
  "thank", "thanks", "appreciate", "grateful", "wonderful", "love this",
  "love working", "sounds great", "perfect", "we", "our team", "together",
  "family", "glad", "happy", "comfortable", "trusted", "enjoyed",
  "looking forward", "excited to work", "feel good", "community",
];

const EXPRESSIVE_KEYWORDS = [
  "excited", "amazing", "can't wait", "awesome", "incredible", "wow",
  "love it", "fantastic", "brilliant", "yes!", "let's do it", "pumped",
  "thrilled", "passionate", "game changer", "transform", "vision",
  "story", "journey", "big picture",
];

const DRIVER_SERVICES   = ["ecommerce", "web development", "automation", "lead generation", "conversion"];
const ANALYTICAL_SERVICES = ["seo", "analytics", "reporting", "technical", "audit", "strategy", "optimization"];
const AMIABLE_SERVICES  = ["social media", "customer service", "reputation", "community", "support", "review"];
const EXPRESSIVE_SERVICES = ["branding", "design", "creative", "content", "video", "storytelling", "logo"];

// ── Text Analysis Helpers ─────────────────────────────────────────────────────

function hasEmoji(text: string): boolean {
  return /\p{Emoji_Presentation}/u.test(text);
}

function exclamationCount(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

function questionCount(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw));
}

function serviceMatchesAny(serviceInterest: string | null | undefined, list: string[]): boolean {
  if (!serviceInterest) return false;
  const lower = serviceInterest.toLowerCase();
  return list.some(s => lower.includes(s));
}

// Clamp a score delta to a ceiling
function clamp(value: number, max: number): number {
  return Math.min(value, max);
}

// ── Reply Speed Analysis ──────────────────────────────────────────────────────

function getReplySpeedsHours(messages: DiMessage[]): number[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const speeds: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.direction === "outbound" && curr.direction === "inbound") {
      const h = (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) / HOUR;
      if (h >= 0 && h < 30 * 24) speeds.push(h); // only include plausible reply windows
    }
  }
  return speeds;
}

// ── Score Builder ─────────────────────────────────────────────────────────────

function addReason(
  scores: MutableScores,
  reasons: DiscReason[],
  style: DiscStyle,
  points: number,
  text: string,
): void {
  if (points <= 0) return;
  const key = style.toLowerCase() as keyof MutableScores;
  scores[key] = Math.min(100, scores[key] + points);
  reasons.push({ style, text, points });
}

// ── Lead-field Signals ────────────────────────────────────────────────────────

function scoreLead(lead: DiLead, scores: MutableScores, reasons: DiscReason[]): void {
  // Priority
  if (lead.priority === "High") {
    addReason(scores, reasons, "Driver", 8, "High-priority lead — likely decisive");
  }

  // Service interest
  if (serviceMatchesAny(lead.serviceInterest, DRIVER_SERVICES)) {
    addReason(scores, reasons, "Driver", 8, `Service interest (${lead.serviceInterest}) suggests results-driven buyer`);
  }
  if (serviceMatchesAny(lead.serviceInterest, ANALYTICAL_SERVICES)) {
    addReason(scores, reasons, "Analytical", 8, `Service interest (${lead.serviceInterest}) suggests data-oriented buyer`);
  }
  if (serviceMatchesAny(lead.serviceInterest, AMIABLE_SERVICES)) {
    addReason(scores, reasons, "Amiable", 8, `Service interest (${lead.serviceInterest}) suggests relationship-focused buyer`);
  }
  if (serviceMatchesAny(lead.serviceInterest, EXPRESSIVE_SERVICES)) {
    addReason(scores, reasons, "Expressive", 8, `Service interest (${lead.serviceInterest}) suggests creative-oriented buyer`);
  }

  // Estimated value: high = decisive buyer (Driver)
  const ev = parseFloat(lead.estimatedValue ?? "0");
  if (ev >= 10_000) {
    addReason(scores, reasons, "Driver", 6, `High deal value ($${ev.toLocaleString()}) — decisive buyer behavior`);
  }

  // Discovery form completed thoroughly = Analytical signal
  if (lead.discoveryFormStatus === "Submitted" || lead.discoveryFormStatus === "Completed") {
    addReason(scores, reasons, "Analytical", 8, "Completed discovery form — methodical, thorough approach");
  }

  // Notes: long notes = Analytical
  if (lead.notes && lead.notes.length > 150) {
    addReason(scores, reasons, "Analytical", 6, "Lead has detailed notes — analytical/thorough profile");
  }

  // Tags
  if (lead.tags) {
    const tagText = lead.tags.join(" ").toLowerCase();
    if (tagText.includes("vip") || tagText.includes("hot") || tagText.includes("urgent")) {
      addReason(scores, reasons, "Driver", 5, "Lead tagged as high-urgency");
    }
    if (tagText.includes("detail") || tagText.includes("technical") || tagText.includes("research")) {
      addReason(scores, reasons, "Analytical", 5, "Lead tagged as detail/technical oriented");
    }
  }

  // SMS consent = open, relationship-minded (Amiable/Expressive)
  if (lead.smsConsent) {
    addReason(scores, reasons, "Amiable", 4, "Opted into SMS — open and relationship-friendly");
  }
}

// ── Message-body Signals ──────────────────────────────────────────────────────

function scoreMessages(messages: DiMessage[], scores: MutableScores, reasons: DiscReason[]): void {
  const inbound = messages.filter(m => m.direction === "inbound");
  const outbound = messages.filter(m => m.direction === "outbound");

  // --- Body pattern analysis ---
  let driverBodyPoints    = 0;
  let analyticalBodyPts   = 0;
  let amiableBodyPts      = 0;
  let expressiveBodyPts   = 0;

  const driverBodyMsgs: string[]    = [];
  const analyticalBodyMsgs: string[] = [];
  const amiableBodyMsgs: string[]   = [];
  const expressiveBodyMsgs: string[] = [];

  for (const m of inbound) {
    const body = m.body ?? "";
    if (!body) continue;

    const len = body.trim().length;

    // Length signals
    if (len < 50) {
      driverBodyPoints = clamp(driverBodyPoints + 5, 20);
      driverBodyMsgs.push("short reply");
    } else if (len > 200) {
      analyticalBodyPts = clamp(analyticalBodyPts + 8, 32);
      analyticalBodyMsgs.push("long detailed reply");
    }

    // Punctuation
    const excl = exclamationCount(body);
    if (excl > 0) {
      expressiveBodyPts = clamp(expressiveBodyPts + Math.min(excl * 5, 10), 25);
      expressiveBodyMsgs.push(`${excl} exclamation mark(s)`);
    }

    const qmarks = questionCount(body);
    if (qmarks >= 2) {
      analyticalBodyPts = clamp(analyticalBodyPts + 8, 32);
      analyticalBodyMsgs.push(`${qmarks} questions in one message`);
    }

    // Emojis
    if (hasEmoji(body)) {
      expressiveBodyPts = clamp(expressiveBodyPts + 8, 25);
      expressiveBodyMsgs.push("used emojis");
    }

    // Keyword matching
    const dKws   = matchKeywords(body, DRIVER_KEYWORDS);
    const aKws   = matchKeywords(body, ANALYTICAL_KEYWORDS);
    const amKws  = matchKeywords(body, AMIABLE_KEYWORDS);
    const exKws  = matchKeywords(body, EXPRESSIVE_KEYWORDS);

    if (dKws.length)  { driverBodyPoints   = clamp(driverBodyPoints   + dKws.length * 5, 20); driverBodyMsgs.push(`urgency/results keywords: "${dKws[0]}"`); }
    if (aKws.length)  { analyticalBodyPts  = clamp(analyticalBodyPts  + aKws.length * 5, 32); analyticalBodyMsgs.push(`analytical keywords: "${aKws[0]}"`); }
    if (amKws.length) { amiableBodyPts     = clamp(amiableBodyPts     + amKws.length * 6, 24); amiableBodyMsgs.push(`warm/relational keywords: "${amKws[0]}"`); }
    if (exKws.length) { expressiveBodyPts  = clamp(expressiveBodyPts  + exKws.length * 6, 25); expressiveBodyMsgs.push(`enthusiasm keywords: "${exKws[0]}"`); }
  }

  if (driverBodyPoints > 0) {
    addReason(scores, reasons, "Driver", driverBodyPoints,
      `Message patterns: ${driverBodyMsgs.slice(0, 2).join(", ")}`);
  }
  if (analyticalBodyPts > 0) {
    addReason(scores, reasons, "Analytical", analyticalBodyPts,
      `Message patterns: ${analyticalBodyMsgs.slice(0, 2).join(", ")}`);
  }
  if (amiableBodyPts > 0) {
    addReason(scores, reasons, "Amiable", amiableBodyPts,
      `Message patterns: ${amiableBodyMsgs.slice(0, 2).join(", ")}`);
  }
  if (expressiveBodyPts > 0) {
    addReason(scores, reasons, "Expressive", expressiveBodyPts,
      `Message patterns: ${expressiveBodyMsgs.slice(0, 2).join(", ")}`);
  }

  // --- Reply speed analysis ---
  const speeds = getReplySpeedsHours(messages);
  const fastReplies  = speeds.filter(h => h < 2).length;
  const slowReplies  = speeds.filter(h => h > 24 && h < 72).length;

  if (fastReplies >= 2) {
    addReason(scores, reasons, "Driver", clamp(fastReplies * 8, 24),
      `${fastReplies} fast reply${fastReplies !== 1 ? "s" : ""} (< 2 hours) — decisive`);
  } else if (fastReplies === 1) {
    addReason(scores, reasons, "Driver", 5, "Fast reply (< 2 hours) — action-oriented");
  }

  if (slowReplies >= 2) {
    addReason(scores, reasons, "Amiable", clamp(slowReplies * 5, 15),
      `${slowReplies} thoughtful delayed repl${slowReplies !== 1 ? "ies" : "y"} (1–3 days) — deliberate`);
    addReason(scores, reasons, "Analytical", clamp(slowReplies * 4, 12),
      "Careful timing on replies suggests methodical thinking");
  }

  // --- Call signals ---
  const completedCalls = messages.filter(m =>
    m.channel === "call" &&
    ["completed", "answered", "in-progress"].includes((m.callStatus ?? "").toLowerCase()),
  );
  if (completedCalls.length > 0) {
    addReason(scores, reasons, "Driver", clamp(completedCalls.length * 5, 15),
      `${completedCalls.length} completed call${completedCalls.length !== 1 ? "s" : ""} — prefers direct communication`);
  }

  // --- Volume signals ---
  if (inbound.length >= 5) {
    addReason(scores, reasons, "Amiable", 6, `${inbound.length} inbound messages — engaged, relationship-building`);
  }

  // Outbound much higher than inbound = lead isn't replying much (Driver might not respond to SMS; Analytical may be deliberating)
  if (outbound.length > 0 && inbound.length === 0) {
    addReason(scores, reasons, "Driver", 4, "No replies yet — may prefer calls or direct contact");
  }
}

// ── Activity Signals ──────────────────────────────────────────────────────────

function scoreActivities(activities: DiActivity[], lead: DiLead, scores: MutableScores, reasons: DiscReason[]): void {
  const statusChanges = activities.filter(a => a.type === "status_changed");
  const emailsSent    = activities.filter(a => a.type === "email_sent");
  const tasksCreated  = activities.filter(a => a.type === "task_created");
  const tasksCompleted = activities.filter(a => a.type === "task_completed");

  // Fast status progression = Driver
  if (statusChanges.length >= 2) {
    const times = statusChanges.map(a => new Date(a.createdAt).getTime()).sort((a, b) => a - b);
    const fastChanges = times.reduce((count, t, i) =>
      i === 0 ? 0 : (t - times[i - 1] < 7 * 24 * HOUR ? count + 1 : count), 0,
    );
    if (fastChanges >= 1) {
      addReason(scores, reasons, "Driver", clamp(fastChanges * 8, 16),
        `${fastChanges} fast status progression${fastChanges !== 1 ? "s" : ""} — decisive buyer`);
    }
  }

  // Multiple emails = Analytical (likes written detail)
  if (emailsSent.length >= 2) {
    addReason(scores, reasons, "Analytical", clamp(emailsSent.length * 5, 20),
      `${emailsSent.length} email exchanges — prefers detailed written communication`);
  } else if (emailsSent.length === 1) {
    addReason(scores, reasons, "Analytical", 6, "Email communication — values written detail");
  }

  // Proposal deliberating (sent proposal, not yet won/signed, days elapsed)
  if (lead.proposalStatus === "Sent" && !["Won", "Lost"].includes(lead.status)) {
    const sentActivity = activities.find(a =>
      a.type === "status_changed" &&
      (a.title.toLowerCase().includes("proposal") || a.description?.toLowerCase().includes("proposal")),
    );
    if (sentActivity) {
      const daysSinceSent = (Date.now() - new Date(sentActivity.createdAt).getTime()) / (24 * HOUR);
      if (daysSinceSent > 7) {
        addReason(scores, reasons, "Analytical", 12,
          `Deliberating on proposal for ${Math.round(daysSinceSent)} days — careful evaluator`);
      }
    }
  }

  // Tasks completed quickly = Driver (action-oriented, follows through fast)
  if (tasksCompleted.length >= 2) {
    addReason(scores, reasons, "Driver", 5, `${tasksCompleted.length} tasks completed — follows through quickly`);
  }

  // Notes with Amiable/Expressive language (from activity descriptions)
  for (const a of activities) {
    const body = [a.title, a.description ?? ""].join(" ");
    const amKws = matchKeywords(body, AMIABLE_KEYWORDS);
    const exKws = matchKeywords(body, EXPRESSIVE_KEYWORDS);
    if (amKws.length >= 2) {
      addReason(scores, reasons, "Amiable", 5, `Warm language in activity: "${amKws[0]}"`);
      break;
    }
    if (exKws.length >= 2) {
      addReason(scores, reasons, "Expressive", 5, `Enthusiastic language in notes: "${exKws[0]}"`);
      break;
    }
  }
}

// ── Discovery Signals ─────────────────────────────────────────────────────────

function scoreDiscovery(discovery: DiDiscovery | null | undefined, scores: MutableScores, reasons: DiscReason[]): void {
  if (!discovery) return;

  const allText = Object.values(discovery)
    .filter((v): v is string => typeof v === "string")
    .join(" ");

  if (!allText) return;

  const dKws  = matchKeywords(allText, DRIVER_KEYWORDS);
  const aKws  = matchKeywords(allText, ANALYTICAL_KEYWORDS);
  const amKws = matchKeywords(allText, AMIABLE_KEYWORDS);
  const exKws = matchKeywords(allText, EXPRESSIVE_KEYWORDS);

  if (dKws.length >= 2)  addReason(scores, reasons, "Driver",     clamp(dKws.length  * 4, 16), `Discovery form signals urgency: "${dKws.slice(0, 2).join('", "')}"`);
  if (aKws.length >= 2)  addReason(scores, reasons, "Analytical", clamp(aKws.length  * 4, 16), `Discovery form signals analysis focus: "${aKws.slice(0, 2).join('", "')}"`);
  if (amKws.length >= 2) addReason(scores, reasons, "Amiable",   clamp(amKws.length * 4, 16), `Discovery form signals relationship focus: "${amKws.slice(0, 2).join('", "')}"`);
  if (exKws.length >= 2) addReason(scores, reasons, "Expressive",clamp(exKws.length * 4, 16), `Discovery form signals enthusiasm: "${exKws.slice(0, 2).join('", "')}"`);

  // Timeline urgency → Driver
  const timeline = (discovery.timeline ?? "").toString().toLowerCase();
  if (timeline.includes("immediately") || timeline.includes("asap") || timeline.includes("1 month")) {
    addReason(scores, reasons, "Driver", 10, "Discovery timeline: urgent/immediate — results-driven");
  } else if (timeline.includes("6 month") || timeline.includes("flexible") || timeline.includes("no rush")) {
    addReason(scores, reasons, "Analytical", 8, "Discovery timeline: no rush — careful evaluator");
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeScores(raw: DiscRawScores): DiscNormalized {
  const total = raw.driver + raw.expressive + raw.amiable + raw.analytical;
  if (total === 0) {
    return { driver: 25, expressive: 25, amiable: 25, analytical: 25 };
  }
  return {
    driver:     Math.round((raw.driver     / total) * 100),
    expressive: Math.round((raw.expressive / total) * 100),
    amiable:    Math.round((raw.amiable    / total) * 100),
    analytical: Math.round((raw.analytical / total) * 100),
  };
}

// ── Confidence Algorithm ──────────────────────────────────────────────────────
// Confidence = data volume (0–60 pts) + score spread (0–40 pts)

export function computeConfidence(dataPoints: number, raw: DiscRawScores): number {
  // Data volume component
  let dataScore =
    dataPoints >= 20 ? 60 :
    dataPoints >= 10 ? 45 :
    dataPoints >= 5  ? 30 :
    dataPoints >= 2  ? 15 :
    dataPoints >= 1  ? 5  : 0;

  // Spread component: higher gap between top two styles → more confidence
  const vals = [raw.driver, raw.expressive, raw.amiable, raw.analytical].sort((a, b) => b - a);
  const spread = vals[0] - vals[1];
  const spreadScore =
    spread >= 30 ? 40 :
    spread >= 20 ? 30 :
    spread >= 10 ? 20 :
    spread >= 5  ? 10 : 0;

  return Math.min(95, dataScore + spreadScore);
}

// ── Communication Profile per Primary Style ───────────────────────────────────

const STYLE_PROFILES: Record<DiscStyle, Omit<CommunicationProfile, "primaryStyle" | "secondaryStyle" | "confidence" | "preferredChannel">> = {
  Driver: {
    communicationLength: "Short",
    decisionSpeed: "Fast",
    suggestedTone: "Keep communication brief and outcome-focused. Lead with results, not features.",
    suggestedFollowUpStyle: "Short direct messages with clear next steps. Avoid over-explaining. Respect their time.",
    approach: "Lead with results and ROI. Be concise, decisive, and action-oriented. Skip the small talk.",
  },
  Analytical: {
    communicationLength: "Long",
    decisionSpeed: "Slow",
    suggestedTone: "Provide supporting data, comparisons, and detailed explanations. Back up every claim.",
    suggestedFollowUpStyle: "Send detailed information with supporting evidence. Allow time for review and questions.",
    approach: "Provide data-driven proposals with clear ROI metrics. Answer every question thoroughly. Allow deliberation time.",
  },
  Amiable: {
    communicationLength: "Medium",
    decisionSpeed: "Moderate",
    suggestedTone: "Build trust and rapport before asking for commitment. Be warm and personal.",
    suggestedFollowUpStyle: "Check in warmly, acknowledge concerns, and be patient with the decision timeline.",
    approach: "Build a genuine relationship first. Emphasize team fit, long-term partnership, and shared values.",
  },
  Expressive: {
    communicationLength: "Medium",
    decisionSpeed: "Fast",
    suggestedTone: "Be enthusiastic and paint the vision. Use storytelling, excitement, and energy.",
    suggestedFollowUpStyle: "Keep the energy high. Share success stories and the exciting transformation they can expect.",
    approach: "Paint an exciting vision. Share testimonials and the big-picture impact. Make them feel the transformation.",
  },
};

// ── computeBehaviorReasons ────────────────────────────────────────────────────

export function computeBehaviorReasons(
  lead: DiLead,
  messages: DiMessage[],
  activities: DiActivity[],
  discovery?: DiDiscovery | null,
): DiscReason[] {
  const scores: MutableScores = { driver: 0, expressive: 0, amiable: 0, analytical: 0 };
  const reasons: DiscReason[] = [];
  scoreLead(lead, scores, reasons);
  scoreMessages(messages, scores, reasons);
  scoreActivities(activities, lead, scores, reasons);
  scoreDiscovery(discovery, scores, reasons);
  return reasons;
}

// ── computeDiscProfile ────────────────────────────────────────────────────────

export function computeDiscProfile(
  lead: DiLead,
  messages: DiMessage[],
  activities: DiActivity[],
  discovery?: DiDiscovery | null,
): DiscProfile {
  const scores: MutableScores = { driver: 0, expressive: 0, amiable: 0, analytical: 0 };
  const reasons: DiscReason[] = [];

  scoreLead(lead, scores, reasons);
  scoreMessages(messages, scores, reasons);
  scoreActivities(activities, lead, scores, reasons);
  scoreDiscovery(discovery, scores, reasons);

  const raw: DiscRawScores = { ...scores };
  const normalized = normalizeScores(raw);

  // Sort styles by normalized score to find primary/secondary
  const ranked = (Object.keys(normalized) as DiscStyle[])
    .sort((a, b) => normalized[b.toLowerCase() as keyof DiscNormalized] - normalized[a.toLowerCase() as keyof DiscNormalized]);

  const primaryStyle   = ranked[0] as DiscStyle;
  const secondaryStyle = ranked[1] as DiscStyle;

  const dataPoints = messages.length + activities.length + (discovery ? 1 : 0);
  const confidence = computeConfidence(dataPoints, raw);

  // Preferred channel: derived from message patterns + style
  let preferredChannel: "SMS" | "Email" | "Call" | "Unknown" = "Unknown";
  const smsIn   = messages.filter(m => m.direction === "inbound" && m.channel === "sms").length;
  const callsOk = messages.filter(m => m.channel === "call" && ["completed","answered"].includes((m.callStatus ?? "").toLowerCase())).length;
  const emailActs = activities.filter(a => a.type === "email_sent").length;

  if (smsIn >= 2) preferredChannel = "SMS";
  else if (callsOk >= 2) preferredChannel = "Call";
  else if (smsIn === 1 && smsIn > callsOk) preferredChannel = "SMS";
  else if (callsOk === 1) preferredChannel = "Call";
  else if (emailActs >= 2 && smsIn === 0) preferredChannel = "Email";
  else if (primaryStyle === "Driver") preferredChannel = "Call";
  else if (primaryStyle === "Expressive") preferredChannel = "SMS";
  else if (primaryStyle === "Analytical") preferredChannel = "Email";
  else if (primaryStyle === "Amiable") preferredChannel = "SMS";

  const styleProfile = STYLE_PROFILES[primaryStyle];
  const communicationProfile: CommunicationProfile = {
    primaryStyle,
    secondaryStyle,
    confidence,
    preferredChannel,
    ...styleProfile,
  };

  return {
    raw,
    normalized,
    primaryStyle,
    secondaryStyle,
    confidence,
    reasons,
    communicationProfile,
    dataPoints,
  };
}

// ── computeCommunicationTone ──────────────────────────────────────────────────

export function computeCommunicationTone(profile: DiscProfile): CommunicationStyle {
  const { primaryStyle } = profile;

  const styleMap: Record<DiscStyle, CommunicationStyle> = {
    Driver: {
      tone: "Active",
      length: "Short",
      emotion: "Professional",
      cta: "Direct",
      greeting: "Brief",
      closing: "Action-oriented",
    },
    Analytical: {
      tone: "Analytical",
      length: "Long",
      emotion: "Formal",
      cta: "Evidence-based",
      greeting: "Formal",
      closing: "Logical",
    },
    Amiable: {
      tone: "Warm",
      length: "Medium",
      emotion: "Supportive",
      cta: "Gentle",
      greeting: "Warm",
      closing: "Supportive",
    },
    Expressive: {
      tone: "Enthusiastic",
      length: "Medium",
      emotion: "Expressive",
      cta: "Inspiring",
      greeting: "Energetic",
      closing: "Open-ended",
    },
  };

  return styleMap[primaryStyle];
}

// ── getCommunicationStyle (Campaign helper) ───────────────────────────────────
// Future email/SMS automation will consume this helper.

export function getCommunicationStyle(
  lead: DiLead,
  messages: DiMessage[],
  activities: DiActivity[],
  discovery?: DiDiscovery | null,
): CommunicationStyle {
  const profile = computeDiscProfile(lead, messages, activities, discovery);
  return computeCommunicationTone(profile);
}

// ── Simplified DISC from lead fields only (no messages/activities) ─────────────
// Used by dashboard where per-lead message history is not loaded.

export function computeSimplifiedDisc(lead: DiLead): DiscStyle {
  const scores: MutableScores = { driver: 0, expressive: 0, amiable: 0, analytical: 0 };
  const reasons: DiscReason[] = [];
  scoreLead(lead, scores, reasons);

  const entries = Object.entries(scores) as [keyof MutableScores, number][];
  const best = entries.reduce((prev, cur) => cur[1] > prev[1] ? cur : prev, entries[0]);

  const styleMap: Record<keyof MutableScores, DiscStyle> = {
    driver: "Driver", expressive: "Expressive", amiable: "Amiable", analytical: "Analytical",
  };

  // If all scores are 0 (no signals), return "Unknown"
  if (best[1] === 0) return "Amiable"; // default
  return styleMap[best[0]];
}

// ── Style Meta ────────────────────────────────────────────────────────────────

export interface DiscStyleMeta {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
  textColor: string;
  shortDesc: string;
}

export const DISC_META: Record<DiscStyle, DiscStyleMeta> = {
  Driver: {
    label: "Driver",
    emoji: "⚡",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    barColor: "bg-red-500",
    textColor: "text-red-700",
    shortDesc: "Decisive, direct, results-focused",
  },
  Expressive: {
    label: "Expressive",
    emoji: "🌟",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    barColor: "bg-amber-500",
    textColor: "text-amber-700",
    shortDesc: "Enthusiastic, creative, social",
  },
  Amiable: {
    label: "Amiable",
    emoji: "🤝",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    barColor: "bg-emerald-500",
    textColor: "text-emerald-700",
    shortDesc: "Warm, relationship-focused, steady",
  },
  Analytical: {
    label: "Analytical",
    emoji: "📊",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    barColor: "bg-blue-500",
    textColor: "text-blue-700",
    shortDesc: "Data-driven, methodical, careful",
  },
};
