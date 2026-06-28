// ── SiteMint Campaign Strategy Taxonomy ───────────────────────────────────────
// Phase 26B — strategy metadata only. Zero AI, zero side effects, no persistence
// of its own. Pure data + lookup helpers consumed by the Campaign Builder to
// suggest personas, topics, and ready-made campaign blueprints.
//
// This file does NOT send email, enroll contacts, or touch the scheduler.

// ── Shared enums ──────────────────────────────────────────────────────────────

export type FunnelStage =
  | "awareness"
  | "consideration"
  | "decision"
  | "retention"
  | "referral";

export type PersonaCategory =
  | "inbound"
  | "service-line"
  | "industry"
  | "outbound"
  | "lifecycle";

export type TopicCategory =
  | "education"
  | "conversion"
  | "nurture"
  | "proof"
  | "process";

export type CampaignChannel = "email" | "sms" | "call_prompt" | "task";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SitemintPersona {
  id: string;
  label: string;
  category: PersonaCategory;
  description: string;
  recommendedTone: string;
  defaultGoal: string;
  suggestedTopics: string[]; // topic ids
  recommendedCadence: string;
  primaryPainPoint: string;
  bestCTA: string;
}

export interface SitemintTopic {
  id: string;
  title: string;
  category: TopicCategory;
  audience: string;
  funnelStage: FunnelStage;
  description: string;
  suggestedSubjectHooks: string[];
  targetSignals: string[];
  recommendedCTA: string;
  behavioralLift: string;
}

export interface SitemintExampleStep {
  day: number;
  channel: CampaignChannel;
  topicId?: string;
  purpose: string;
}

export interface SitemintCampaignBlueprint {
  id: string;
  label: string;
  personaId: string;
  goal: string;
  toneProfile: string;
  suggestedSequenceLength: number;
  recommendedChannels: CampaignChannel[];
  stopOnReply: boolean;
  exampleSteps: SitemintExampleStep[];
}

// ── Personas ──────────────────────────────────────────────────────────────────

export const SITEMINT_PERSONAS: SitemintPersona[] = [
  {
    id: "new-website-inquiry",
    label: "New Website Inquiry",
    category: "inbound",
    description: "A fresh lead who reached out wanting a new website built.",
    recommendedTone: "Warm, consultative, confidence-building",
    defaultGoal: "Book a discovery call and scope the project",
    suggestedTopics: ["why-website-losing-leads", "conversion-homepage-tips", "discovery-call-prep", "before-after-website-audit"],
    recommendedCadence: "Day 0, 2, 5, 9 — taper after first reply",
    primaryPainPoint: "Their current site (or lack of one) isn't generating business",
    bestCTA: "Book a free 20-minute discovery call",
  },
  {
    id: "website-redesign-lead",
    label: "Website Redesign Lead",
    category: "service-line",
    description: "Has a site already but knows it's dated and underperforming.",
    recommendedTone: "Diagnostic, reassuring, proof-led",
    defaultGoal: "Get a redesign audit booked",
    suggestedTopics: ["website-redesign-checklist", "before-after-website-audit", "conversion-homepage-tips", "case-study-campaign"],
    recommendedCadence: "Day 0, 3, 7, 12",
    primaryPainPoint: "Outdated design that hurts credibility and conversions",
    bestCTA: "Request a free redesign audit",
  },
  {
    id: "crm-automation-lead",
    label: "CRM / Automation Lead",
    category: "service-line",
    description: "Interested in automating lead capture, follow-up, and admin work.",
    recommendedTone: "Practical, ROI-focused, systems-minded",
    defaultGoal: "Demo the automation stack and quantify time saved",
    suggestedTopics: ["what-crm-should-automate", "lead-routing-automation", "ai-automation-saves-time", "booking-system-automation"],
    recommendedCadence: "Day 0, 2, 6, 10",
    primaryPainPoint: "Manual follow-up and leads slipping through the cracks",
    bestCTA: "See a live automation walkthrough",
  },
  {
    id: "seo-lead",
    label: "SEO Lead",
    category: "service-line",
    description: "Wants to rank higher and capture more organic search traffic.",
    recommendedTone: "Educational, data-backed, patient",
    defaultGoal: "Deliver an SEO opportunity snapshot",
    suggestedTopics: ["seo-basics-local", "why-website-losing-leads", "before-after-website-audit", "case-study-campaign"],
    recommendedCadence: "Day 0, 4, 9, 14",
    primaryPainPoint: "Invisible on Google for the searches that matter",
    bestCTA: "Get a free local SEO snapshot",
  },
  {
    id: "local-business-owner",
    label: "Local Business Owner",
    category: "industry",
    description: "Owner-operator focused on more local customers, less tech jargon.",
    recommendedTone: "Plain-spoken, friendly, no jargon",
    defaultGoal: "Earn trust and book a no-pressure consult",
    suggestedTopics: ["why-website-losing-leads", "seo-basics-local", "booking-system-automation", "ai-automation-saves-time"],
    recommendedCadence: "Day 0, 3, 8, 14",
    primaryPainPoint: "Too busy running the business to fix the website",
    bestCTA: "Grab a free 15-minute consult",
  },
  {
    id: "nonprofit",
    label: "Nonprofit Organization",
    category: "industry",
    description: "Mission-driven org needing donations, volunteers, and clarity.",
    recommendedTone: "Mission-aligned, empathetic, value-conscious",
    defaultGoal: "Show impact-focused web + donation flow value",
    suggestedTopics: ["why-website-losing-leads", "conversion-homepage-tips", "case-study-campaign", "website-redesign-checklist"],
    recommendedCadence: "Day 0, 4, 9, 15",
    primaryPainPoint: "Limited budget and a site that doesn't drive donations",
    bestCTA: "Book a nonprofit-friendly strategy call",
  },
  {
    id: "real-estate-agent",
    label: "Real Estate Agent",
    category: "industry",
    description: "Agent who lives on leads, listings, and fast response times.",
    recommendedTone: "Fast-moving, results-first, high-energy",
    defaultGoal: "Win a lead-capture + booking site project",
    suggestedTopics: ["booking-system-automation", "lead-routing-automation", "conversion-homepage-tips", "seo-basics-local"],
    recommendedCadence: "Day 0, 2, 5, 8 — agents respond quickly",
    primaryPainPoint: "Leads go cold before they can follow up",
    bestCTA: "See the agent lead-capture demo",
  },
  {
    id: "attorney-law-firm",
    label: "Attorney / Law Firm",
    category: "industry",
    description: "Firm that needs authority, trust, and qualified case inquiries.",
    recommendedTone: "Professional, authoritative, precise",
    defaultGoal: "Position SiteMint as the firm's growth partner",
    suggestedTopics: ["seo-basics-local", "conversion-homepage-tips", "booking-system-automation", "case-study-campaign"],
    recommendedCadence: "Day 0, 4, 9, 14",
    primaryPainPoint: "Not enough qualified case inquiries from the website",
    bestCTA: "Schedule a confidential strategy call",
  },
  {
    id: "homecare-business",
    label: "Homecare Business",
    category: "industry",
    description: "Care provider needing local trust and steady inquiry volume.",
    recommendedTone: "Compassionate, trustworthy, clear",
    defaultGoal: "Drive family inquiries and intake calls",
    suggestedTopics: ["booking-system-automation", "seo-basics-local", "why-website-losing-leads", "case-study-campaign"],
    recommendedCadence: "Day 0, 3, 8, 13",
    primaryPainPoint: "Families can't easily find or contact them online",
    bestCTA: "Book a free intake-flow review",
  },
  {
    id: "coach-consultant",
    label: "Coach / Consultant",
    category: "industry",
    description: "Personal brand selling expertise, programs, and bookings.",
    recommendedTone: "Inspirational, personal, momentum-driven",
    defaultGoal: "Build a booking-ready personal brand site",
    suggestedTopics: ["booking-system-automation", "conversion-homepage-tips", "ai-automation-saves-time", "case-study-campaign"],
    recommendedCadence: "Day 0, 2, 6, 11",
    primaryPainPoint: "A site that doesn't convert visitors into booked calls",
    bestCTA: "See your booking funnel mocked up",
  },
  {
    id: "ecommerce-lead",
    label: "E-commerce Lead",
    category: "service-line",
    description: "Sells products online and cares about conversion + speed.",
    recommendedTone: "Conversion-obsessed, metrics-led, brisk",
    defaultGoal: "Improve store conversion and AOV",
    suggestedTopics: ["conversion-homepage-tips", "why-website-losing-leads", "ai-automation-saves-time", "before-after-website-audit"],
    recommendedCadence: "Day 0, 2, 5, 9",
    primaryPainPoint: "Traffic that doesn't convert into sales",
    bestCTA: "Get a free conversion teardown",
  },
  {
    id: "cold-prospect",
    label: "Cold Prospect",
    category: "outbound",
    description: "Hasn't engaged yet — needs a relevant, low-friction reason to reply.",
    recommendedTone: "Curious, concise, value-first",
    defaultGoal: "Earn a first reply or micro-commitment",
    suggestedTopics: ["why-website-losing-leads", "before-after-website-audit", "case-study-campaign", "seo-basics-local"],
    recommendedCadence: "Day 0, 4, 9, 16 — slow and respectful",
    primaryPainPoint: "Unaware their website is costing them business",
    bestCTA: "Reply 'audit' for a free 2-minute teardown",
  },
  {
    id: "past-client",
    label: "Past Client",
    category: "lifecycle",
    description: "Already worked with SiteMint — ripe for upsell and referrals.",
    recommendedTone: "Familiar, appreciative, partnership-minded",
    defaultGoal: "Re-engage for maintenance, upgrades, or referrals",
    suggestedTopics: ["maintenance-plan-nurture", "website-launch-checklist", "case-study-campaign", "ai-automation-saves-time"],
    recommendedCadence: "Day 0, 7, 21 — low frequency",
    primaryPainPoint: "Their site/tools have drifted since launch",
    bestCTA: "Book a quick check-in call",
  },
  {
    id: "referral-partner",
    label: "Referral Partner",
    category: "lifecycle",
    description: "Agency, freelancer, or ally who can send recurring referrals.",
    recommendedTone: "Collaborative, generous, mutual-win",
    defaultGoal: "Activate and reward referral activity",
    suggestedTopics: ["case-study-campaign", "ai-automation-saves-time", "what-crm-should-automate", "maintenance-plan-nurture"],
    recommendedCadence: "Day 0, 10, 30 — relationship pace",
    primaryPainPoint: "No simple, rewarding way to send work our way",
    bestCTA: "Grab your partner referral kit",
  },
  {
    id: "hot-discovery-form-lead",
    label: "Hot Discovery Form Lead",
    category: "inbound",
    description: "Just completed the discovery form — peak intent, act fast.",
    recommendedTone: "Prompt, decisive, momentum-preserving",
    defaultGoal: "Convert peak intent into a booked call",
    suggestedTopics: ["discovery-call-prep", "proposal-follow-up", "before-after-website-audit", "case-study-campaign"],
    recommendedCadence: "Day 0 (within hours), 1, 3, 6",
    primaryPainPoint: "Ready to move but needs reassurance to commit",
    bestCTA: "Confirm your discovery call slot",
  },
  {
    id: "non-responsive-discovery-lead",
    label: "Non-responsive Discovery Lead",
    category: "lifecycle",
    description: "Filled the discovery form but went quiet — needs re-activation.",
    recommendedTone: "Light, helpful, easy-to-say-yes",
    defaultGoal: "Re-open the conversation with low friction",
    suggestedTopics: ["why-website-losing-leads", "before-after-website-audit", "case-study-campaign", "proposal-follow-up"],
    recommendedCadence: "Day 0, 4, 10, 18 — then archive",
    primaryPainPoint: "Got busy or unsure and let it stall",
    bestCTA: "Reply with a good time and we'll take it from there",
  },
];

// ── Topics ────────────────────────────────────────────────────────────────────

export const SITEMINT_TOPICS: SitemintTopic[] = [
  {
    id: "why-website-losing-leads",
    title: "Why your website is losing leads",
    category: "education",
    audience: "Owners with an existing but underperforming site",
    funnelStage: "awareness",
    description: "Names the silent conversion killers — slow load, weak CTA, no mobile flow — and frames the cost in lost leads.",
    suggestedSubjectHooks: [
      "Your website might be losing you 3 leads a week",
      "The #1 reason visitors leave your site",
      "Quick question about your homepage",
    ],
    targetSignals: ["email_opened", "proposal_viewed", "contact_form_submitted"],
    recommendedCTA: "Request a free 2-minute homepage teardown",
    behavioralLift: "Strong opener for awareness — typically lifts open and reply intent on cold and warm lists.",
  },
  {
    id: "website-redesign-checklist",
    title: "Website redesign checklist",
    category: "process",
    audience: "Leads considering a redesign",
    funnelStage: "consideration",
    description: "A practical checklist that helps the reader self-diagnose and positions SiteMint as the obvious partner.",
    suggestedSubjectHooks: [
      "The 7-point website redesign checklist",
      "Before you redesign, check these 7 things",
      "Is your site ready for a refresh?",
    ],
    targetSignals: ["email_clicked_cta", "proposal_viewed", "proposal_reopened"],
    recommendedCTA: "Get a free redesign audit",
    behavioralLift: "Checklist format drives clicks and downloads — good mid-funnel engagement signal.",
  },
  {
    id: "what-crm-should-automate",
    title: "What a CRM should automate",
    category: "education",
    audience: "Automation-curious leads",
    funnelStage: "consideration",
    description: "Explains which repetitive tasks a CRM should remove, mapped to hours saved per week.",
    suggestedSubjectHooks: [
      "5 tasks your CRM should be doing for you",
      "Stop doing this by hand",
      "How much time is manual follow-up costing you?",
    ],
    targetSignals: ["email_clicked_cta", "call_answered", "meeting_booked"],
    recommendedCTA: "See a live automation walkthrough",
    behavioralLift: "ROI framing converts well with operations-minded buyers; raises demo-request rate.",
  },
  {
    id: "seo-basics-local",
    title: "SEO basics for local businesses",
    category: "education",
    audience: "Local owners wanting more search traffic",
    funnelStage: "awareness",
    description: "Demystifies local SEO — Google Business Profile, reviews, on-page basics — without jargon.",
    suggestedSubjectHooks: [
      "Why you're not showing up on Google",
      "3 local SEO fixes you can do today",
      "Get found by customers nearby",
    ],
    targetSignals: ["email_opened", "email_clicked_cta", "organic"],
    recommendedCTA: "Get a free local SEO snapshot",
    behavioralLift: "Educational value builds trust early; effective top-of-funnel nurture.",
  },
  {
    id: "ai-automation-saves-time",
    title: "How AI automation saves admin time",
    category: "education",
    audience: "Time-strapped owners and operators",
    funnelStage: "consideration",
    description: "Shows concrete before/after of automated intake, routing, and follow-up with hours reclaimed.",
    suggestedSubjectHooks: [
      "Get back 6 hours a week",
      "Let automation handle the busywork",
      "What we automated for a business like yours",
    ],
    targetSignals: ["email_clicked_cta", "meeting_booked", "call_answered"],
    recommendedCTA: "See what we'd automate for you",
    behavioralLift: "Time-savings hook resonates with overwhelmed owners; lifts meeting bookings.",
  },
  {
    id: "discovery-call-prep",
    title: "Discovery call preparation",
    category: "process",
    audience: "Leads who are about to book or just booked",
    funnelStage: "decision",
    description: "Sets expectations for the discovery call so the lead shows up ready and confident.",
    suggestedSubjectHooks: [
      "Let's make our call worth your time",
      "3 things to think about before we talk",
      "Here's what to expect on our call",
    ],
    targetSignals: ["meeting_booked", "meeting_attended", "email_replied"],
    recommendedCTA: "Confirm your discovery call slot",
    behavioralLift: "Reduces no-shows and primes high-intent leads to commit faster.",
  },
  {
    id: "proposal-follow-up",
    title: "Proposal follow-up",
    category: "conversion",
    audience: "Leads with an open proposal or SOW",
    funnelStage: "decision",
    description: "Gentle, value-reinforcing nudges that move an open proposal toward a yes.",
    suggestedSubjectHooks: [
      "Any questions on the proposal?",
      "Following up on your project plan",
      "Ready when you are",
    ],
    targetSignals: ["proposal_viewed", "proposal_reopened", "sow_opened"],
    recommendedCTA: "Reply to get started or ask a question",
    behavioralLift: "Direct bottom-funnel driver; reopens stalled deals and accelerates close.",
  },
  {
    id: "case-study-campaign",
    title: "Case study campaign",
    category: "proof",
    audience: "Leads evaluating credibility",
    funnelStage: "consideration",
    description: "Real before/after results from a comparable client to build proof and reduce risk.",
    suggestedSubjectHooks: [
      "How we doubled a client's web leads",
      "A quick before/after you'll like",
      "Results from a business like yours",
    ],
    targetSignals: ["email_clicked_cta", "proposal_viewed", "case_study_viewed"],
    recommendedCTA: "See the full case study",
    behavioralLift: "Social proof lifts trust scores and click-through across the mid funnel.",
  },
  {
    id: "maintenance-plan-nurture",
    title: "Maintenance plan nurture",
    category: "nurture",
    audience: "Past clients and launched sites",
    funnelStage: "retention",
    description: "Keeps launched sites healthy and the relationship warm with proactive care touchpoints.",
    suggestedSubjectHooks: [
      "Keeping your site fast and secure",
      "Your monthly site health check",
      "A quick update on your website",
    ],
    targetSignals: ["email_opened", "call_answered", "referral"],
    recommendedCTA: "Book a quick check-in call",
    behavioralLift: "Retention touch that surfaces upsell and referral opportunities.",
  },
  {
    id: "website-launch-checklist",
    title: "Website launch checklist",
    category: "process",
    audience: "Clients near or just past launch",
    funnelStage: "retention",
    description: "A launch-day and post-launch checklist that reinforces value delivered.",
    suggestedSubjectHooks: [
      "Your launch checklist is ready",
      "Did we cover everything? Let's verify",
      "Post-launch: the 5 things that matter",
    ],
    targetSignals: ["email_opened", "email_clicked_cta", "referral"],
    recommendedCTA: "Confirm your launch checklist",
    behavioralLift: "Reinforces delivered value; sets up maintenance and referral asks.",
  },
  {
    id: "conversion-homepage-tips",
    title: "Conversion-focused homepage tips",
    category: "education",
    audience: "Leads who care about turning visitors into customers",
    funnelStage: "consideration",
    description: "Concrete homepage tweaks — hero clarity, CTA placement, trust signals — tied to conversion.",
    suggestedSubjectHooks: [
      "3 homepage tweaks that convert",
      "Your hero section is doing too little",
      "Turn more visitors into customers",
    ],
    targetSignals: ["email_clicked_cta", "proposal_viewed", "contact_form_submitted"],
    recommendedCTA: "Get a free homepage conversion review",
    behavioralLift: "Actionable tips earn clicks and replies; strong consideration-stage performer.",
  },
  {
    id: "booking-system-automation",
    title: "Booking system automation",
    category: "education",
    audience: "Service businesses that rely on appointments",
    funnelStage: "consideration",
    description: "Shows how automated booking + reminders cut no-shows and admin time.",
    suggestedSubjectHooks: [
      "Let clients book themselves",
      "Cut no-shows with automated reminders",
      "Stop playing phone tag",
    ],
    targetSignals: ["email_clicked_cta", "meeting_booked", "call_answered"],
    recommendedCTA: "See the booking automation demo",
    behavioralLift: "High relevance for appointment-driven industries; lifts demo requests.",
  },
  {
    id: "lead-routing-automation",
    title: "Lead routing automation",
    category: "education",
    audience: "Teams losing leads to slow follow-up",
    funnelStage: "consideration",
    description: "Explains instant lead capture, routing, and follow-up so no lead goes cold.",
    suggestedSubjectHooks: [
      "Never let a lead go cold again",
      "Where your leads are leaking",
      "Instant follow-up, zero effort",
    ],
    targetSignals: ["email_clicked_cta", "meeting_booked", "call_answered"],
    recommendedCTA: "See lead routing in action",
    behavioralLift: "Speaks to revenue leakage; motivates fast-moving buyers to book.",
  },
  {
    id: "before-after-website-audit",
    title: "Before/after website audit",
    category: "proof",
    audience: "Leads who need to see the gap visually",
    funnelStage: "awareness",
    description: "A side-by-side teardown that makes the improvement opportunity impossible to ignore.",
    suggestedSubjectHooks: [
      "I made you a quick before/after",
      "Here's what your site could look like",
      "A 2-minute audit of your homepage",
    ],
    targetSignals: ["email_opened", "email_clicked_cta", "proposal_viewed"],
    recommendedCTA: "See your free before/after audit",
    behavioralLift: "Personalized proof is a top reply-driver on cold and dormant lists.",
  },
];

// ── Blueprints ────────────────────────────────────────────────────────────────

export const SITEMINT_CAMPAIGN_BLUEPRINTS: SitemintCampaignBlueprint[] = [
  {
    id: "bp-new-website-inquiry",
    label: "New Inquiry → Discovery Call",
    personaId: "new-website-inquiry",
    goal: "Book a discovery call and scope the project",
    toneProfile: "Warm, consultative, confidence-building",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email", "call_prompt"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Acknowledge inquiry, frame the opportunity" },
      { day: 2, channel: "email", topicId: "conversion-homepage-tips", purpose: "Add value with quick wins" },
      { day: 5, channel: "email", topicId: "before-after-website-audit", purpose: "Offer a personalized audit" },
      { day: 9, channel: "call_prompt", topicId: "discovery-call-prep", purpose: "Prompt a direct call to book" },
    ],
  },
  {
    id: "bp-website-redesign-lead",
    label: "Redesign → Audit Booking",
    personaId: "website-redesign-lead",
    goal: "Get a redesign audit booked",
    toneProfile: "Diagnostic, reassuring, proof-led",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "website-redesign-checklist", purpose: "Self-diagnosis checklist" },
      { day: 3, channel: "email", topicId: "before-after-website-audit", purpose: "Show the gap visually" },
      { day: 7, channel: "email", topicId: "case-study-campaign", purpose: "Prove results with a peer" },
      { day: 12, channel: "email", topicId: "conversion-homepage-tips", purpose: "Final value nudge + CTA" },
    ],
  },
  {
    id: "bp-crm-automation-lead",
    label: "Automation → Demo",
    personaId: "crm-automation-lead",
    goal: "Demo the automation stack and quantify time saved",
    toneProfile: "Practical, ROI-focused, systems-minded",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email", "call_prompt"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "what-crm-should-automate", purpose: "Frame the manual-work problem" },
      { day: 2, channel: "email", topicId: "lead-routing-automation", purpose: "Show revenue leakage fix" },
      { day: 6, channel: "email", topicId: "ai-automation-saves-time", purpose: "Quantify hours saved" },
      { day: 10, channel: "call_prompt", purpose: "Offer a live walkthrough" },
    ],
  },
  {
    id: "bp-seo-lead",
    label: "SEO → Snapshot",
    personaId: "seo-lead",
    goal: "Deliver an SEO opportunity snapshot",
    toneProfile: "Educational, data-backed, patient",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "seo-basics-local", purpose: "Educate on local SEO" },
      { day: 4, channel: "email", topicId: "why-website-losing-leads", purpose: "Connect SEO to lost leads" },
      { day: 9, channel: "email", topicId: "before-after-website-audit", purpose: "Offer a snapshot" },
      { day: 14, channel: "email", topicId: "case-study-campaign", purpose: "Prove with results" },
    ],
  },
  {
    id: "bp-local-business-owner",
    label: "Local Owner → Consult",
    personaId: "local-business-owner",
    goal: "Earn trust and book a no-pressure consult",
    toneProfile: "Plain-spoken, friendly, no jargon",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email", "sms"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Relatable problem framing" },
      { day: 3, channel: "email", topicId: "seo-basics-local", purpose: "Easy local-SEO wins" },
      { day: 8, channel: "email", topicId: "booking-system-automation", purpose: "Show time-saving tools" },
      { day: 14, channel: "sms", purpose: "Friendly nudge to book a consult" },
    ],
  },
  {
    id: "bp-nonprofit",
    label: "Nonprofit → Strategy Call",
    personaId: "nonprofit",
    goal: "Show impact-focused web + donation flow value",
    toneProfile: "Mission-aligned, empathetic, value-conscious",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Frame missed donations" },
      { day: 4, channel: "email", topicId: "conversion-homepage-tips", purpose: "Donation-flow clarity" },
      { day: 9, channel: "email", topicId: "case-study-campaign", purpose: "Show nonprofit impact" },
      { day: 15, channel: "email", topicId: "website-redesign-checklist", purpose: "Offer a strategy call" },
    ],
  },
  {
    id: "bp-real-estate-agent",
    label: "Agent → Lead Capture Demo",
    personaId: "real-estate-agent",
    goal: "Win a lead-capture + booking site project",
    toneProfile: "Fast-moving, results-first, high-energy",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email", "sms"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "lead-routing-automation", purpose: "Stop cold leads" },
      { day: 2, channel: "sms", purpose: "Fast nudge — agents move quick" },
      { day: 5, channel: "email", topicId: "booking-system-automation", purpose: "Show booking automation" },
      { day: 8, channel: "email", topicId: "conversion-homepage-tips", purpose: "Convert more site visitors" },
    ],
  },
  {
    id: "bp-attorney-law-firm",
    label: "Law Firm → Strategy Call",
    personaId: "attorney-law-firm",
    goal: "Position SiteMint as the firm's growth partner",
    toneProfile: "Professional, authoritative, precise",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "seo-basics-local", purpose: "Visibility for case searches" },
      { day: 4, channel: "email", topicId: "conversion-homepage-tips", purpose: "Convert qualified inquiries" },
      { day: 9, channel: "email", topicId: "case-study-campaign", purpose: "Authority via results" },
      { day: 14, channel: "email", topicId: "booking-system-automation", purpose: "Offer a strategy call" },
    ],
  },
  {
    id: "bp-homecare-business",
    label: "Homecare → Intake Review",
    personaId: "homecare-business",
    goal: "Drive family inquiries and intake calls",
    toneProfile: "Compassionate, trustworthy, clear",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Families can't find you" },
      { day: 3, channel: "email", topicId: "seo-basics-local", purpose: "Be findable locally" },
      { day: 8, channel: "email", topicId: "booking-system-automation", purpose: "Simplify intake" },
      { day: 13, channel: "email", topicId: "case-study-campaign", purpose: "Show trust + offer review" },
    ],
  },
  {
    id: "bp-coach-consultant",
    label: "Coach → Booking Funnel",
    personaId: "coach-consultant",
    goal: "Build a booking-ready personal brand site",
    toneProfile: "Inspirational, personal, momentum-driven",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "conversion-homepage-tips", purpose: "Convert visitors to calls" },
      { day: 2, channel: "email", topicId: "booking-system-automation", purpose: "Self-serve booking" },
      { day: 6, channel: "email", topicId: "ai-automation-saves-time", purpose: "Automate the admin" },
      { day: 11, channel: "email", topicId: "case-study-campaign", purpose: "Proof + mockup offer" },
    ],
  },
  {
    id: "bp-ecommerce-lead",
    label: "E-commerce → Conversion Teardown",
    personaId: "ecommerce-lead",
    goal: "Improve store conversion and AOV",
    toneProfile: "Conversion-obsessed, metrics-led, brisk",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "conversion-homepage-tips", purpose: "Quick conversion wins" },
      { day: 2, channel: "email", topicId: "why-website-losing-leads", purpose: "Where sales leak" },
      { day: 5, channel: "email", topicId: "before-after-website-audit", purpose: "Offer a teardown" },
      { day: 9, channel: "email", topicId: "ai-automation-saves-time", purpose: "Automate cart/follow-up" },
    ],
  },
  {
    id: "bp-cold-prospect",
    label: "Cold → First Reply",
    personaId: "cold-prospect",
    goal: "Earn a first reply or micro-commitment",
    toneProfile: "Curious, concise, value-first",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Pattern-interrupt opener" },
      { day: 4, channel: "email", topicId: "before-after-website-audit", purpose: "Offer a free teardown" },
      { day: 9, channel: "email", topicId: "case-study-campaign", purpose: "Proof to lower risk" },
      { day: 16, channel: "email", topicId: "seo-basics-local", purpose: "Final value-first touch" },
    ],
  },
  {
    id: "bp-past-client",
    label: "Past Client → Re-engage",
    personaId: "past-client",
    goal: "Re-engage for maintenance, upgrades, or referrals",
    toneProfile: "Familiar, appreciative, partnership-minded",
    suggestedSequenceLength: 3,
    recommendedChannels: ["email", "call_prompt"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "maintenance-plan-nurture", purpose: "Proactive care check-in" },
      { day: 7, channel: "email", topicId: "ai-automation-saves-time", purpose: "Offer a relevant upgrade" },
      { day: 21, channel: "call_prompt", topicId: "case-study-campaign", purpose: "Referral + check-in call" },
    ],
  },
  {
    id: "bp-referral-partner",
    label: "Partner → Activate Referrals",
    personaId: "referral-partner",
    goal: "Activate and reward referral activity",
    toneProfile: "Collaborative, generous, mutual-win",
    suggestedSequenceLength: 3,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "case-study-campaign", purpose: "Show what we deliver" },
      { day: 10, channel: "email", topicId: "what-crm-should-automate", purpose: "Make referring easy" },
      { day: 30, channel: "email", topicId: "maintenance-plan-nurture", purpose: "Keep the relationship warm" },
    ],
  },
  {
    id: "bp-hot-discovery-form-lead",
    label: "Hot Lead → Fast Close",
    personaId: "hot-discovery-form-lead",
    goal: "Convert peak intent into a booked call",
    toneProfile: "Prompt, decisive, momentum-preserving",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email", "sms", "call_prompt"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "discovery-call-prep", purpose: "Strike while intent is hot" },
      { day: 1, channel: "sms", purpose: "Quick nudge to confirm a time" },
      { day: 3, channel: "email", topicId: "before-after-website-audit", purpose: "Reinforce value" },
      { day: 6, channel: "call_prompt", topicId: "proposal-follow-up", purpose: "Direct call to close" },
    ],
  },
  {
    id: "bp-non-responsive-discovery-lead",
    label: "Quiet Lead → Re-activate",
    personaId: "non-responsive-discovery-lead",
    goal: "Re-open the conversation with low friction",
    toneProfile: "Light, helpful, easy-to-say-yes",
    suggestedSequenceLength: 4,
    recommendedChannels: ["email"],
    stopOnReply: true,
    exampleSteps: [
      { day: 0, channel: "email", topicId: "why-website-losing-leads", purpose: "Low-friction re-open" },
      { day: 4, channel: "email", topicId: "before-after-website-audit", purpose: "Tempt with a teardown" },
      { day: 10, channel: "email", topicId: "case-study-campaign", purpose: "Proof to rebuild interest" },
      { day: 18, channel: "email", topicId: "proposal-follow-up", purpose: "Final easy-yes nudge" },
    ],
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

const PERSONA_BY_ID = new Map(SITEMINT_PERSONAS.map(p => [p.id, p]));
const TOPIC_BY_ID = new Map(SITEMINT_TOPICS.map(t => [t.id, t]));
const BLUEPRINT_BY_PERSONA = new Map(SITEMINT_CAMPAIGN_BLUEPRINTS.map(b => [b.personaId, b]));

export function getPersonaById(personaId: string | null | undefined): SitemintPersona | null {
  if (!personaId) return null;
  return PERSONA_BY_ID.get(personaId) ?? null;
}

export function getTopicById(topicId: string | null | undefined): SitemintTopic | null {
  if (!topicId) return null;
  return TOPIC_BY_ID.get(topicId) ?? null;
}

// Topics suggested for a persona (in suggested order), falling back to all topics
// when no persona is provided or it has no suggestions.
export function getTopicsForPersona(personaId: string | null | undefined): SitemintTopic[] {
  const persona = getPersonaById(personaId);
  if (!persona) return [...SITEMINT_TOPICS];
  const suggested = persona.suggestedTopics
    .map(id => TOPIC_BY_ID.get(id))
    .filter((t): t is SitemintTopic => Boolean(t));
  return suggested.length ? suggested : [...SITEMINT_TOPICS];
}

export function getBlueprintForPersona(personaId: string | null | undefined): SitemintCampaignBlueprint | null {
  if (!personaId) return null;
  return BLUEPRINT_BY_PERSONA.get(personaId) ?? null;
}

export function getBlueprintById(blueprintId: string | null | undefined): SitemintCampaignBlueprint | null {
  if (!blueprintId) return null;
  return SITEMINT_CAMPAIGN_BLUEPRINTS.find(b => b.id === blueprintId) ?? null;
}

// ── Strategy hints ────────────────────────────────────────────────────────────
// Combines a persona + optional topic into a single, UI-ready hint object.
// Pure metadata — does not generate email copy.

export interface CampaignStrategyHints {
  persona: SitemintPersona | null;
  topic: SitemintTopic | null;
  blueprint: SitemintCampaignBlueprint | null;
  recommendedTone: string;
  recommendedGoal: string;
  recommendedCadence: string;
  recommendedCTA: string;
  subjectHooks: string[];
  targetSignals: string[];
  whyItWorks: string;
}

export function getCampaignStrategyHints(
  personaId: string | null | undefined,
  topicId?: string | null | undefined,
): CampaignStrategyHints | null {
  const persona = getPersonaById(personaId);
  const topic = getTopicById(topicId);
  if (!persona && !topic) return null;

  const blueprint = persona ? getBlueprintForPersona(persona.id) : null;

  let whyItWorks = "";
  if (persona && topic) {
    whyItWorks = `"${topic.title}" speaks directly to ${persona.label}'s core pain — ${persona.primaryPainPoint.toLowerCase()}. ${topic.behavioralLift}`;
  } else if (topic) {
    whyItWorks = topic.behavioralLift;
  } else if (persona) {
    whyItWorks = `${persona.label}: ${persona.primaryPainPoint}. Lead with ${persona.recommendedTone.toLowerCase()} messaging.`;
  }

  return {
    persona,
    topic,
    blueprint,
    recommendedTone: persona?.recommendedTone ?? blueprint?.toneProfile ?? "Professional, helpful",
    recommendedGoal: blueprint?.goal ?? persona?.defaultGoal ?? "Move the lead to the next step",
    recommendedCadence: persona?.recommendedCadence ?? "Day 0, 3, 7, 12",
    recommendedCTA: topic?.recommendedCTA ?? persona?.bestCTA ?? "Book a call",
    subjectHooks: topic?.suggestedSubjectHooks ?? [],
    targetSignals: topic?.targetSignals ?? [],
    whyItWorks,
  };
}
