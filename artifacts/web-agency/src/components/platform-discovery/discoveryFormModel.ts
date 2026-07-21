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
  const segments = path.split(".");
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

// ── Step field paths — one top-level contract key per step. Passing the
// parent path to trigger()/lookups validates and reports the whole subtree
// in one call. Reused by every step's Continue handler and by
// findFirstStepWithError below. ─────────────────────────────────────────────

export const STEP_FIELD_PATHS: readonly (keyof DiscoveryDraft)[] = [
  "projectDirection",
  "business",
  "decisionContext",
  "projectScope",
  "readiness",
  "commercial",
  "contact",
];

/** Generic: walks a fixed, ordered list of top-level step keys and returns the index of the first one with any error. */
export function findFirstStepWithError(
  errors: FieldErrors<DiscoveryDraft>,
  stepFieldPaths: readonly (keyof DiscoveryDraft)[] = STEP_FIELD_PATHS,
): number {
  for (let i = 0; i < stepFieldPaths.length; i++) {
    if (errors[stepFieldPaths[i]]) return i;
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
