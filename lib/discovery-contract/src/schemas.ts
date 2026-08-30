import { z } from "zod/v4";

// ── Project Discovery System — shared typed contract ─────────────────────────
// Phase 2C.2B (docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md §12/§14/
// §20/§21). This is the single source of truth for the FUTURE structured
// "Start Your Project" intake — it is not wired into any route, component, or
// the current /discovery form/POST /api/discovery/submit endpoint in this
// checkpoint (those remain untouched and unstructured). No `any`; every
// choice field is an explicit z.enum; every free-text field and array is
// bounded; unknown keys are rejected (`z.strictObject`) rather than silently
// stripped, so a malformed or unexpected client payload fails validation
// instead of being quietly truncated.
//
// Versioning (PRD §15): schemaVersion changes on any field addition,
// removal, or semantic change; formVersion changes on copy/order-only
// changes. Historical submissions render using the schema version they were
// stored with — this contract is never retroactively applied to legacy rows
// (see discoverySubmissions' additive, nullable Phase 2C.2B columns).

export const DISCOVERY_SCHEMA_VERSION = "1.0.0";
export const DISCOVERY_FORM_VERSION = "1.0.0";
export const DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION = "v1";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalShortText = (max: number) => z.string().trim().min(1).max(max).optional();
const optionalLongText = (max: number) => z.string().trim().min(1).max(max).optional();

// ── §12.1 Project direction ──────────────────────────────────────────────────

export const PROJECT_PRIMARY_TYPES = [
  "new_website",
  "redesign",
  "web_application",
  "customer_portal",
  "internal_crm",
  "business_operations_system",
  "ai_receptionist",
  "workflow_automation",
  "seo_ai_search_visibility",
  "maintenance_support",
  "multiple_connected_systems",
  "not_sure_yet",
] as const;

const projectDirectionSchema = z.strictObject({
  primaryType: z.enum(PROJECT_PRIMARY_TYPES),
  // Order-insensitive (a set of additional interests, not a ranking) — the
  // canonicalization utility below is explicitly told to sort this field.
  secondaryInterests: z.array(z.enum(PROJECT_PRIMARY_TYPES)).max(10).optional(),
});

// ── §12.2 Business and audience ──────────────────────────────────────────────

export const BUSINESS_STAGES = [
  "preparing_to_launch",
  "newly_operating",
  "established",
  "growing",
  "rebranding",
  "replacing_existing_system",
  "expanding_new_market",
] as const;

export const TEAM_SIZE_RANGES = ["solo", "2_10", "11_50", "51_200", "200_plus"] as const;

const businessSchema = z.strictObject({
  organizationName: shortText(200),
  industry: shortText(120),
  currentWebsite: z.url().max(2048).optional(),
  serviceArea: optionalShortText(200),
  description: shortText(2000),
  primaryAudience: shortText(500),
  secondaryAudience: optionalShortText(500),
  businessStage: z.enum(BUSINESS_STAGES),
  teamSizeRange: z.enum(TEAM_SIZE_RANGES),
  businessModel: optionalShortText(200),
  productsServices: optionalLongText(2000),
});

// ── §12.3 Problem, impact, urgency, desired outcome (decision context) ──────
// Ethical framing binding rule (PRD §7): neutral, non-manipulative field
// names only — never "Emotional Driver"/"Pain Manipulation"/"Buyer
// Psychology"/"Fear Analysis" publicly or in identifiers.

export const PROJECT_GOALS = [
  "increase_leads",
  "improve_customer_experience",
  "reduce_manual_work",
  "modernize_technology",
  "launch_new_offering",
  "improve_online_visibility",
  "consolidate_systems",
  "support_growth",
  "improve_data_visibility",
  "other",
] as const;

const decisionContextSchema = z.strictObject({
  currentSituation: shortText(2000),
  primaryProblem: shortText(2000),
  customerImpact: optionalLongText(2000),
  teamImpact: optionalLongText(2000),
  currentManualWork: optionalLongText(2000),
  missedOpportunities: optionalLongText(2000),
  whyNow: shortText(2000),
  urgencyTrigger: optionalShortText(500),
  // Nullable, not merely optional: the field is always present in the
  // payload once collected, but the client may explicitly record "no
  // meaningful consequence of delay" as null rather than omitting the key —
  // the canonicalization utility treats an explicit null differently from an
  // absent key (see discoveryCanonicalization.ts).
  consequenceOfDelay: z.string().trim().min(1).max(2000).nullable().optional(),
  desiredOutcome: shortText(2000),
  successDefinition: shortText(2000),
  primaryGoal: z.enum(PROJECT_GOALS),
  // Order-insensitive set of additional goals.
  secondaryGoals: z.array(z.enum(PROJECT_GOALS)).max(9).optional(),
});

// ── §12.4 Features, users, workflows ─────────────────────────────────────────

export const FEATURE_PRIORITIES = ["must_have", "important_after_launch", "exploring", "not_sure"] as const;

const featureSelectionSchema = z.strictObject({
  // A stable, contract-level feature key (not free text) — the enumerated
  // option lists differ per projectDirection.primaryType branch (PRD §13
  // conditional branching map); this contract intentionally keeps the key
  // as a bounded string here rather than one giant enum spanning every
  // branch, so new project-type branches can add feature keys without a
  // contract version bump for unrelated branches.
  key: z.string().trim().min(1).max(80),
  priority: z.enum(FEATURE_PRIORITIES),
});

const projectScopeSchema = z.strictObject({
  // Order is meaningful here — the sequence reflects the order the prospect
  // selected/ranked features in, not a set. Never sorted by canonicalization.
  features: z.array(featureSelectionSchema).max(60),
  additionalRequirements: optionalLongText(2000),
});

// ── §12.5 Content, design, technical readiness ───────────────────────────────

export const ASSET_READINESS_STATUSES = ["have_it", "in_progress", "need_help", "not_applicable"] as const;
export const PLATFORM_STATUSES = ["have_it", "need_recommendation", "not_applicable"] as const;

const readinessSchema = z.strictObject({
  logoStatus: z.enum(ASSET_READINESS_STATUSES),
  brandStatus: z.enum(ASSET_READINESS_STATUSES),
  contentStatus: z.enum(ASSET_READINESS_STATUSES),
  photoVideoStatus: z.enum(ASSET_READINESS_STATUSES),
  // Order is meaningful (the prospect's own priority/preference ordering).
  referenceSites: z.array(z.url().max(2048)).max(10).optional(),
  designPreferences: optionalLongText(1000),
  designDislikes: optionalLongText(1000),
  domainStatus: z.enum(PLATFORM_STATUSES),
  hostingStatus: z.enum(PLATFORM_STATUSES),
  currentPlatform: optionalShortText(200),
  currentCrm: optionalShortText(200),
  currentEmailProvider: optionalShortText(200),
  schedulingTool: optionalShortText(200),
  migrationNeeds: optionalLongText(1000),
  // Set-like (no meaningful order) — canonicalization sorts this field.
  integrations: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  accessibilityNeeds: optionalLongText(500),
  languageNeeds: optionalLongText(500),
  privacyRegulatoryNeeds: optionalLongText(500),
  technicalOwner: optionalShortText(200),
  contentOwner: optionalShortText(200),
});

// ── §12.6 Timeline, investment, decision process ─────────────────────────────

export const LAUNCH_WINDOWS = ["asap", "within_1_3_months", "within_3_6_months", "6_plus_months", "not_sure"] as const;
export const INVESTMENT_RANGES = ["starter", "growth", "premium", "custom", "not_sure"] as const;
export const SUPPORT_MODEL_PREFERENCES = ["ongoing_retainer", "as_needed", "self_managed", "not_sure"] as const;

const commercialSchema = z.strictObject({
  launchWindow: z.enum(LAUNCH_WINDOWS),
  // Nullable, not merely optional: an explicit "no target date yet" (null)
  // is distinguishable from the key never having been asked (absent).
  targetDate: z.iso.date().nullable().optional(),
  dateFlexibility: z.enum(["firm", "flexible"]).optional(),
  deadlineReason: optionalShortText(500),
  investmentRange: z.enum(INVESTMENT_RANGES),
  investmentApproved: z.boolean(),
  decisionMakers: shortText(500),
  finalApprover: optionalShortText(200),
  vendorProcurementInvolved: z.boolean(),
  supportModelPreference: z.enum(SUPPORT_MODEL_PREFERENCES).optional(),
  discoveryAvailability: optionalShortText(500),
  preferredStartPeriod: optionalShortText(200),
});

// ── §12.7 Contact, consent, final review ─────────────────────────────────────
// Consent fields are intentionally split: required inquiry-processing
// consent is never bundled with optional marketing consent (binding rule,
// PRD §31); SMS consent is kept separate and optional (PRD §41 recorded
// decision), never implied by the other two.

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "either"] as const;

const consentSchema = z.strictObject({
  privacyPolicyAcknowledged: z.literal(true),
  operationalContactConsent: z.literal(true),
  marketingConsent: z.boolean().default(false),
  smsConsent: z.boolean().default(false),
});

const contactSchema = z.strictObject({
  name: shortText(200),
  title: optionalShortText(200),
  email: z.email().max(320),
  phone: z.string().trim().min(1).max(40).optional(),
  preferredContactMethod: z.enum(PREFERRED_CONTACT_METHODS),
  preferredContactTime: optionalShortText(200),
  timeZone: optionalShortText(100),
  referralSource: optionalShortText(200),
  consent: consentSchema,
});

// ── Top-level contract ────────────────────────────────────────────────────────

export const DiscoverySubmissionContract = z.strictObject({
  projectDirection: projectDirectionSchema,
  business: businessSchema,
  decisionContext: decisionContextSchema,
  projectScope: projectScopeSchema,
  readiness: readinessSchema,
  commercial: commercialSchema,
  contact: contactSchema,
});

export type DiscoverySubmissionContract = z.infer<typeof DiscoverySubmissionContract>;

// ── Transport metadata — kept structurally separate from the immutable
// user-answer object above (never merged into it, PRD §14/§18). None of
// these fields are ever included in the canonical idempotency payload (see
// discoveryCanonicalization.ts).

export const DiscoveryTransportMeta = z.strictObject({
  idempotencyKey: z.uuid(),
  formVersion: z.string().trim().min(1).max(40),
  schemaVersion: z.string().trim().min(1).max(40),
  // Honeypot: must always arrive empty from a real browser; a non-empty
  // value is a bot signal, evaluated by future anti-spam logic (PRD §17/§23)
  // — not evaluated in this checkpoint.
  honeypot: z.string().max(500).optional(),
  formStartedAt: z.iso.datetime(),
});

export type DiscoveryTransportMeta = z.infer<typeof DiscoveryTransportMeta>;

// Full request envelope a future POST /api/v1/discovery-submissions would
// accept — documented here as the contract shape, not wired to any route.
export const DiscoverySubmissionRequest = z.strictObject({
  meta: DiscoveryTransportMeta,
  answers: DiscoverySubmissionContract,
});

export type DiscoverySubmissionRequest = z.infer<typeof DiscoverySubmissionRequest>;
