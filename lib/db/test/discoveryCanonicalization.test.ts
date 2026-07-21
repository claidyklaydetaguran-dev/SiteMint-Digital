// Phase 2C.2B — canonicalization determinism tests. Run via:
//   pnpm --filter @workspace/scripts exec tsx lib/db/test/discoveryCanonicalization.test.ts
import { canonicalizeDiscoveryPayload } from "../src/schema/discoveryCanonicalization";
import { DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION, type DiscoverySubmissionContract } from "../src/schema/discoveryContract";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const base: DiscoverySubmissionContract = {
  projectDirection: { primaryType: "new_website", secondaryInterests: ["redesign", "seo_ai_search_visibility"] },
  business: {
    organizationName: "Acme Co",
    industry: "Retail",
    description: "We sell hand-made goods.",
    primaryAudience: "Local shoppers.",
    businessStage: "established",
    teamSizeRange: "2_10",
  },
  decisionContext: {
    currentSituation: "Site is outdated.",
    primaryProblem: "Can't self-edit.",
    whyNow: "Rebranding this quarter.",
    desiredOutcome: "Self-service editing.",
    successDefinition: "Marketing publishes without help.",
    primaryGoal: "modernize_technology",
    secondaryGoals: ["improve_online_visibility", "increase_leads"],
    consequenceOfDelay: null,
  },
  projectScope: {
    features: [
      { key: "content_management", priority: "must_have" },
      { key: "blog", priority: "exploring" },
    ],
  },
  readiness: {
    logoStatus: "have_it",
    brandStatus: "have_it",
    contentStatus: "in_progress",
    photoVideoStatus: "need_help",
    domainStatus: "have_it",
    hostingStatus: "need_recommendation",
    integrations: ["mailchimp", "quickbooks"],
  },
  commercial: {
    launchWindow: "within_3_6_months",
    investmentRange: "growth",
    investmentApproved: false,
    decisionMakers: "Owner.",
    vendorProcurementInvolved: false,
    targetDate: null,
  },
  contact: {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    preferredContactMethod: "email",
    consent: { privacyPolicyAcknowledged: true, operationalContactConsent: true, marketingConsent: false, smsConsent: false },
  },
};

// Stable property ordering + version explicit.
{
  const canonical = canonicalizeDiscoveryPayload(base);
  const parsed = JSON.parse(canonical);
  check("canonicalization version is explicit in output", parsed.canonicalizationVersion === DISCOVERY_IDEMPOTENCY_CANONICALIZATION_VERSION);
  const topKeys = Object.keys(parsed.answers);
  check("top-level keys are sorted alphabetically", JSON.stringify(topKeys) === JSON.stringify([...topKeys].sort()));
}

// Equivalent object insertion orders produce the same canonical result.
{
  const reordered: DiscoverySubmissionContract = {
    contact: base.contact,
    commercial: base.commercial,
    readiness: base.readiness,
    projectScope: base.projectScope,
    decisionContext: base.decisionContext,
    business: base.business,
    projectDirection: base.projectDirection,
  };
  check(
    "different top-level insertion order canonicalizes identically",
    canonicalizeDiscoveryPayload(base) === canonicalizeDiscoveryPayload(reordered),
  );

  const nestedReordered: DiscoverySubmissionContract = {
    ...base,
    business: {
      teamSizeRange: base.business.teamSizeRange,
      businessStage: base.business.businessStage,
      primaryAudience: base.business.primaryAudience,
      description: base.business.description,
      industry: base.business.industry,
      organizationName: base.business.organizationName,
    },
  };
  check(
    "different nested key insertion order canonicalizes identically",
    canonicalizeDiscoveryPayload(base) === canonicalizeDiscoveryPayload(nestedReordered),
  );
}

// Normalized-equivalent values produce the same canonical result.
{
  const withWhitespace: DiscoverySubmissionContract = {
    ...base,
    business: { ...base.business, organizationName: "  Acme Co  " },
  };
  check(
    "incidental whitespace differences canonicalize identically",
    canonicalizeDiscoveryPayload(base) === canonicalizeDiscoveryPayload(withWhitespace),
  );
}

// Meaningful array order remains meaningful (projectScope.features, order-preserving).
{
  const reorderedFeatures: DiscoverySubmissionContract = {
    ...base,
    projectScope: {
      features: [...base.projectScope.features].reverse(),
    },
  };
  check(
    "order-meaningful array (features) changes canonical output when reordered",
    canonicalizeDiscoveryPayload(base) !== canonicalizeDiscoveryPayload(reorderedFeatures),
  );
}

// Set-like arrays normalize deterministically when explicitly configured.
{
  const reorderedSecondaryGoals: DiscoverySubmissionContract = {
    ...base,
    decisionContext: {
      ...base.decisionContext,
      secondaryGoals: base.decisionContext.secondaryGoals ? [...base.decisionContext.secondaryGoals].reverse() : undefined,
    },
  };
  check(
    "set-like array (secondaryGoals) canonicalizes identically regardless of order",
    canonicalizeDiscoveryPayload(base) === canonicalizeDiscoveryPayload(reorderedSecondaryGoals),
  );

  const reorderedIntegrations: DiscoverySubmissionContract = {
    ...base,
    readiness: {
      ...base.readiness,
      integrations: base.readiness.integrations ? [...base.readiness.integrations].reverse() : undefined,
    },
  };
  check(
    "set-like array (integrations) canonicalizes identically regardless of order",
    canonicalizeDiscoveryPayload(base) === canonicalizeDiscoveryPayload(reorderedIntegrations),
  );
}

// Explicit null vs. absent handling.
{
  const parsed = JSON.parse(canonicalizeDiscoveryPayload(base));
  check(
    "an explicit null field is present as null in canonical output",
    Object.prototype.hasOwnProperty.call(parsed.answers.decisionContext, "consequenceOfDelay") &&
      parsed.answers.decisionContext.consequenceOfDelay === null,
  );
  check(
    "an absent optional field is not present at all in canonical output",
    !Object.prototype.hasOwnProperty.call(parsed.answers.business, "currentWebsite"),
  );

  const withDelayText: DiscoverySubmissionContract = {
    ...base,
    decisionContext: { ...base.decisionContext, consequenceOfDelay: "We would miss the rebrand launch." },
  };
  check(
    "explicit null differs from an explicit non-null value",
    canonicalizeDiscoveryPayload(base) !== canonicalizeDiscoveryPayload(withDelayText),
  );
}

// Ephemeral/transport metadata never affects canonical output — enforced
// structurally: canonicalizeDiscoveryPayload's parameter type is
// DiscoverySubmissionContract (answers only), which has no transport fields
// at all, so there is no code path for them to leak in. Confirmed here by
// checking the canonical output never contains any transport-only key name.
{
  const canonical = canonicalizeDiscoveryPayload(base);
  const transportOnlyKeys = ["idempotencyKey", "honeypot", "formStartedAt", "schemaVersion", "formVersion"];
  check(
    "canonical output contains no transport-only field names",
    !transportOnlyKeys.some((key) => canonical.includes(`"${key}"`)),
  );
}

// A meaningful answer change affects canonical output.
{
  const changed: DiscoverySubmissionContract = {
    ...base,
    decisionContext: { ...base.decisionContext, primaryProblem: "A materially different problem statement." },
  };
  check(
    "a real answer change alters the canonical output",
    canonicalizeDiscoveryPayload(base) !== canonicalizeDiscoveryPayload(changed),
  );
}

if (failures > 0) {
  console.error(`\n${failures} discoveryCanonicalization test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryCanonicalization tests passed.");
}
