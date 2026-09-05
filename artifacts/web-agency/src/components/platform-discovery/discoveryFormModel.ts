import type { FieldErrors, Resolver, UseFormReturn } from "react-hook-form";
import { DiscoverySubmissionContract } from "@workspace/discovery-contract";

/**
 * Phase 2C.2C2 — draft/default-value and validation model for the guided
 * discovery preview form. See docs/sitemint-platform (build plan) for the
 * full rationale. Nothing here modifies, preprocesses, or duplicates
 * `DiscoverySubmissionContract` — it is only ever validated via one shared
 * `DiscoverySubmissionContract.safeParse` call (`validateDiscoverySubmission`
 * below), reused unchanged by both the step-scoped resolver and final
 * completion.
 */

// ── Draft type — mechanically derived from the contract, never hand-written ──

type Draft<T> = T extends (infer U)[]
  ? Draft<U>[]
  : T extends object
    ? { [K in keyof T]?: Draft<T[K]> }
    : T | undefined;

export type DiscoveryDraft = Draft<DiscoverySubmissionContract>;

// ── Default draft values — every scalar begins unset; every array begins [] ──

export const defaultDiscoveryDraft: DiscoveryDraft = {
  projectDirection: {
    projectStage: undefined,
    primaryType: undefined,
    secondaryInterests: [],
  },
  business: {
    organizationName: undefined,
    industry: undefined,
    currentWebsite: undefined,
    serviceArea: undefined,
    description: undefined,
    primaryAudience: undefined,
    secondaryAudience: undefined,
    businessStage: undefined,
    teamSizeRange: undefined,
    businessModel: undefined,
    productsServices: undefined,
  },
  decisionContext: {
    currentSituation: undefined,
    primaryProblem: undefined,
    customerImpact: undefined,
    teamImpact: undefined,
    currentManualWork: undefined,
    missedOpportunities: undefined,
    whyNow: undefined,
    urgencyTrigger: undefined,
    consequenceOfDelay: undefined,
    desiredOutcome: undefined,
    successDefinition: undefined,
    primaryGoal: undefined,
    secondaryGoals: [],
  },
  projectScope: {
    features: [],
    additionalRequirements: undefined,
  },
  readiness: {
    logoStatus: undefined,
    brandStatus: undefined,
    contentStatus: undefined,
    photoVideoStatus: undefined,
    referenceSites: [],
    designPreferences: undefined,
    designDislikes: undefined,
    domainStatus: undefined,
    hostingStatus: undefined,
    currentPlatform: undefined,
    currentCrm: undefined,
    currentEmailProvider: undefined,
    schedulingTool: undefined,
    migrationNeeds: undefined,
    integrations: [],
    accessibilityNeeds: undefined,
    languageNeeds: undefined,
    privacyRegulatoryNeeds: undefined,
    technicalOwner: undefined,
    contentOwner: undefined,
  },
  growth: {
    interested: false,
    platform: undefined,
    otherPlatformNote: undefined,
    monthlyBudgetRange: undefined,
    campaignObjective: undefined,
    targetAudienceLocations: undefined,
    hasLandingPage: undefined,
    landingPageUrl: undefined,
    hasPixelsConfigured: undefined,
    analyticsConsentReady: undefined,
    creativeAssetsAvailable: undefined,
    previousCampaignResults: undefined,
    reportingCadence: undefined,
  },
  commercial: {
    launchWindow: undefined,
    targetDate: undefined,
    dateFlexibility: undefined,
    deadlineReason: undefined,
    investmentRange: undefined,
    investmentApproved: undefined,
    decisionMakers: undefined,
    finalApprover: undefined,
    vendorProcurementInvolved: undefined,
    supportModelPreference: undefined,
    discoveryAvailability: undefined,
    preferredStartPeriod: undefined,
  },
  contact: {
    name: undefined,
    title: undefined,
    email: undefined,
    phone: undefined,
    preferredContactMethod: undefined,
    preferredContactTime: undefined,
    timeZone: undefined,
    referralSource: undefined,
    consent: {
      privacyPolicyAcknowledged: undefined,
      operationalContactConsent: undefined,
      marketingConsent: false,
      smsConsent: false,
    },
  },
};

// ── Field-level normalization adapters — blank/whitespace optional text/url/
// phone/date becomes undefined at the point of input; required fields get no
// adapter and stay plain strings, so a blank required field still fails the
// contract's own min-length check normally. ─────────────────────────────────

function blankToUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Optional short/long text fields (register(..., { setValueAs: toOptionalText })). */
export const toOptionalText = blankToUndefined;

/** Optional URL fields — blank means absent; format is validated by the contract's z.url(). */
export const toOptionalUrl = blankToUndefined;

/** Optional phone field — blank means absent. */
export const toOptionalPhone = blankToUndefined;

/**
 * Optional/nullable date fields (native <input type="date">). A cleared or
 * untouched date input yields "" -> undefined. `null` is never produced
 * here — it is only ever set by a dedicated, explicit "no date yet" toggle
 * calling field.onChange(null) directly.
 */
export function toOptionalDate(raw: string): string | undefined {
  return raw.trim().length > 0 ? raw : undefined;
}

/**
 * Defense-in-depth structural pass, run immediately before every
 * `DiscoverySubmissionContract.safeParse` call: walks the draft recursively
 * and replaces any blank/whitespace-only string with `undefined`, leaving
 * arrays, booleans, enums, non-empty strings, and explicit `null` untouched.
 * Field-level adapters (above) already normalize every optional input at
 * the point of entry; this pass only catches values that reach here some
 * other way. Return type is deliberately `unknown` -- the correct type for
 * "a value about to be handed to safeParse," not a weakening of safety.
 */
export function normalizeDiscoveryDraft(draft: DiscoveryDraft): unknown {
  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      return blankToUndefined(value);
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = walk(val);
      }
      return result;
    }
    return value;
  }
  return walk(draft);
}

// ── Shared validation helper — the single safeParse call site ──────────────

export type DiscoverySubmissionValidation =
  | { success: true; data: DiscoverySubmissionContract }
  | { success: false; error: SafeParseFailure["error"] };

type SafeParseResult = ReturnType<typeof DiscoverySubmissionContract.safeParse>;
type SafeParseFailure = Extract<SafeParseResult, { success: false }>;
type ZodIssueLike = SafeParseFailure["error"]["issues"][number];

export function validateDiscoverySubmission(draft: DiscoveryDraft): DiscoverySubmissionValidation {
  const candidate = normalizeDiscoveryDraft(draft);
  const result = DiscoverySubmissionContract.safeParse(candidate);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}

// ── Generic (path, message) -> RHF FieldErrors mapping — no field-specific
// knowledge, no schema duplication. ─────────────────────────────────────────

function issuePathToString(path: ZodIssueLike["path"]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc.length === 0 ? String(segment) : `${acc}.${String(segment)}`;
  }, "");
}

function setNestedError(target: Record<string, unknown>, path: string, message: string): void {
  // "features[0].priority" must nest as features → 0 → priority: a literal
  // "features[0]" key is invisible to getNodeAtPath("projectScope.features"),
  // which made findFirstStepWithError fall back to step 0 for every array-item
  // error (submit bounced the visitor to the first step instead of the one
  // holding the invalid field).
  const segments = path.replace(/[(d+)]/g, ".$1").split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    if (existing === undefined || typeof existing !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = { type: "validation", message };
}

export function mapZodIssuesToFieldErrors(issues: readonly ZodIssueLike[]): FieldErrors<DiscoveryDraft> {
  const errors: Record<string, unknown> = {};
  for (const issue of issues) {
    if (issue.path.length === 0) continue;
    setNestedError(errors, issuePathToString(issue.path), issue.message);
  }
  return errors as FieldErrors<DiscoveryDraft>;
}

/**
 * Keeps only the issues whose path is one of `names` or a descendant of one
 * (e.g. requesting "business" also keeps "business.organizationName"). Pure
 * string-prefix filtering over whatever paths Zod reported -- no knowledge
 * of individual fields or step boundaries.
 */
function filterIssuesToNames(issues: readonly ZodIssueLike[], names: readonly string[]): ZodIssueLike[] {
  return issues.filter((issue) => {
    const path = issuePathToString(issue.path);
    return names.some((name) => path === name || path.startsWith(`${name}.`) || path.startsWith(`${name}[`));
  });
}

// ── Path 1: step-scoped resolver. Only ever invoked via an explicit
// trigger(currentStepFieldPaths) call from step navigation -- never treated
// as, or used to detect, final completion. `options.names` is used solely
// to filter which of THIS call's own requested paths to report; it is never
// inspected for emptiness or otherwise trusted as a step-vs-final signal. ──

export const discoveryResolver: Resolver<DiscoveryDraft> = async (draft, _context, options) => {
  const result = validateDiscoverySubmission(draft);
  if (result.success) {
    // This resolver never returns a submission value -- see
    // handleCompletePreview / validateDiscoverySubmission for the only
    // place a real DiscoverySubmissionContract is produced and acted on.
    return { values: {}, errors: {} };
  }
  const names = options.names ?? [];
  const scopedIssues = filterIssuesToNames(result.error.issues, names);
  return { values: {}, errors: mapZodIssuesToFieldErrors(scopedIssues) };
};

// ── Step field paths — Checkpoint 2C.3 (owner-directed reorganization). The
// reorganized wizard has UI steps that no longer map one-to-one onto the
// contract's top-level keys (e.g. "Business and audience" now also carries
// several decisionContext leaf fields, and "Project starting point" carries
// only two leaf fields out of projectDirection/business rather than either
// object in full) — so each step is now an explicit list of dot-paths
// (leaf fields or whole subtrees) rather than a single top-level key.
// `filterIssuesToNames` above already matches by exact path or path-prefix,
// so this generalizes the original one-key-per-step model without changing
// its matching semantics. Reused by every step's Continue handler and by
// findFirstStepWithError/countErrorsAtPaths below. ──────────────────────────

export type StepFieldPaths = readonly string[];

export const STEP_FIELD_PATHS: readonly StepFieldPaths[] = [
  // 0 — Project starting point
  ["projectDirection.projectStage", "business.description"],
  // 1 — System or service needed
  ["projectDirection.primaryType", "projectDirection.secondaryInterests"],
  // 2 — Business and audience (+ the situation/goals questions that used to
  // be their own step — folded in here per the owner-directed audit)
  [
    "business.organizationName",
    "business.industry",
    "business.currentWebsite",
    "business.serviceArea",
    "business.primaryAudience",
    "business.secondaryAudience",
    "business.businessStage",
    "business.teamSizeRange",
    "decisionContext.currentSituation",
    "decisionContext.whyNow",
    "decisionContext.desiredOutcome",
    "decisionContext.primaryGoal",
    "decisionContext.secondaryGoals",
    "decisionContext.customerImpact",
  ],
  // 3 — Brand and visual direction
  [
    "readiness.logoStatus",
    "readiness.brandStatus",
    "readiness.referenceSites",
    "readiness.designPreferences",
    "readiness.designDislikes",
  ],
  // 4 — Content and functionality
  ["projectScope.features", "projectScope.additionalRequirements", "readiness.contentStatus", "readiness.photoVideoStatus"],
  // 5 — Systems and integrations
  [
    "readiness.domainStatus",
    "readiness.hostingStatus",
    "readiness.currentPlatform",
    "readiness.integrations",
    "readiness.migrationNeeds",
  ],
  // 6 — Growth, advertising, and tracking
  [
    "growth.interested",
    "growth.platform",
    "growth.otherPlatformNote",
    "growth.monthlyBudgetRange",
    "growth.campaignObjective",
    "growth.targetAudienceLocations",
    "growth.hasLandingPage",
    "growth.landingPageUrl",
    "growth.hasPixelsConfigured",
    "growth.analyticsConsentReady",
    "growth.creativeAssetsAvailable",
    "growth.previousCampaignResults",
    "growth.reportingCadence",
  ],
  // 7 — Delivery, budget, and contact
  [
    "commercial.launchWindow",
    "commercial.targetDate",
    "commercial.dateFlexibility",
    "commercial.deadlineReason",
    "commercial.investmentRange",
    "commercial.investmentApproved",
    "commercial.decisionMakers",
    "commercial.finalApprover",
    "commercial.vendorProcurementInvolved",
    "commercial.supportModelPreference",
    "contact.name",
    "contact.title",
    "contact.email",
    "contact.phone",
    "contact.preferredContactMethod",
    "contact.preferredContactTime",
    "contact.timeZone",
    "contact.referralSource",
    "contact.consent",
  ],
];

/** Walks a dot-path (no array-index segments expected here) through a nested object, returning whatever is found (or undefined). */
function getNodeAtPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** True if a RHF FieldErrors tree has any error at or beneath the given dot-path. */
function hasErrorAtPath(errors: FieldErrors<DiscoveryDraft>, path: string): boolean {
  return getNodeAtPath(errors, path) != null;
}

function countLeafErrors(node: unknown): number {
  if (node === null || node === undefined) return 0;
  if (typeof node === "object" && "message" in (node as Record<string, unknown>) && !Array.isArray(node)) {
    return typeof (node as { message?: unknown }).message === "string" ? 1 : 0;
  }
  if (Array.isArray(node)) {
    return node.reduce<number>((sum, child) => sum + countLeafErrors(child), 0);
  }
  if (typeof node === "object") {
    return Object.values(node as Record<string, unknown>).reduce<number>((sum, child) => sum + countLeafErrors(child), 0);
  }
  return 0;
}

/** Total number of leaf field errors across a step's field paths — drives the "N fields need attention" wording. */
export function countErrorsAtPaths(errors: FieldErrors<DiscoveryDraft>, paths: StepFieldPaths): number {
  return paths.reduce((sum, path) => sum + countLeafErrors(getNodeAtPath(errors, path)), 0);
}

/** Generic: walks the ordered list of step field-path groups and returns the index of the first one with any error. */
export function findFirstStepWithError(
  errors: FieldErrors<DiscoveryDraft>,
  stepFieldPaths: readonly StepFieldPaths[] = STEP_FIELD_PATHS,
): number {
  for (let i = 0; i < stepFieldPaths.length; i++) {
    if (stepFieldPaths[i].some((path) => hasErrorAtPath(errors, path))) return i;
  }
  return 0;
}

/** Generic: recursively walks a nested FieldErrors object and calls form.setError for every leaf. */
export function applyFieldErrors(form: UseFormReturn<DiscoveryDraft>, errors: FieldErrors<DiscoveryDraft>): void {
  function isLeaf(node: unknown): node is { type?: string; message?: string } {
    return (
      node !== null &&
      typeof node === "object" &&
      ("message" in (node as Record<string, unknown>) || "type" in (node as Record<string, unknown>)) &&
      !Array.isArray(node)
    );
  }

  function walk(node: unknown, path: string): void {
    if (node === undefined || node === null) return;
    if (isLeaf(node) && typeof (node as { message?: unknown }).message === "string") {
      const leaf = node as { type?: string; message: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setError(path as any, { type: leaf.type ?? "validation", message: leaf.message });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, path ? `${path}[${index}]` : `${index}`));
      return;
    }
    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(errors, "");
}
