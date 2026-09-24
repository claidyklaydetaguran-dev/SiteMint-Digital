// Phase 2C.2B — shared contract schema tests. No test framework is installed
// in this repo (see DISCOVERY_DOMAIN_CONTRACT.md); run directly via:
//   pnpm --filter @workspace/discovery-contract run test
import {
  DiscoverySubmissionContract,
  DiscoveryTransportMeta,
  DiscoverySubmissionRequest,
} from "../src/schemas";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const validContact = {
  name: "Jordan Rivera",
  email: "jordan@example.com",
  preferredContactMethod: "email" as const,
  consent: {
    privacyPolicyAcknowledged: true as const,
    operationalContactConsent: true as const,
    marketingConsent: false,
    smsConsent: false,
  },
};

// Smallest valid submission: every optional field omitted.
const smallestValid = {
  projectDirection: { primaryType: "new_website" },
  business: {
    organizationName: "Acme Co",
    industry: "Retail",
    description: "We sell hand-made goods online and in one retail store.",
    primaryAudience: "Local shoppers and online buyers across the region.",
    businessStage: "established",
    teamSizeRange: "2_10",
  },
  decisionContext: {
    currentSituation: "Our site is outdated and hard to update ourselves.",
    primaryProblem: "No one on the team can safely edit the current site.",
    whyNow: "We are rebranding this quarter and need a matching site.",
    desiredOutcome: "A site the team can update without a developer.",
    successDefinition: "Marketing can publish new pages without help.",
    primaryGoal: "modernize_technology",
  },
  projectScope: {
    features: [{ key: "content_management", priority: "must_have" }],
  },
  readiness: {
    logoStatus: "have_it",
    brandStatus: "have_it",
    contentStatus: "in_progress",
    photoVideoStatus: "need_help",
    domainStatus: "have_it",
    hostingStatus: "need_recommendation",
  },
  commercial: {
    launchWindow: "within_3_6_months",
    investmentRange: "growth",
    investmentApproved: false,
    decisionMakers: "Owner and marketing lead.",
    vendorProcurementInvolved: false,
  },
  contact: validContact,
};

// A fuller, representative submission exercising most optional fields.
const fullRepresentative = {
  projectDirection: {
    primaryType: "web_application",
    secondaryInterests: ["workflow_automation", "internal_crm"],
  },
  business: {
    organizationName: "Northgate Logistics",
    industry: "Logistics",
    currentWebsite: "https://northgate.example.com",
    serviceArea: "Pacific Northwest",
    description: "We coordinate freight scheduling for regional carriers.",
    primaryAudience: "Dispatch teams at partner carriers.",
    secondaryAudience: "Warehouse managers.",
    businessStage: "growing",
    teamSizeRange: "11_50",
    businessModel: "B2B service",
    productsServices: "Scheduling coordination and load tracking.",
  },
  decisionContext: {
    currentSituation: "Scheduling happens over email and phone today.",
    primaryProblem: "Double-booked loads are common and costly.",
    customerImpact: "Carriers lose trust when loads are mishandled.",
    teamImpact: "Dispatchers spend hours resolving conflicts manually.",
    currentManualWork: "Manual spreadsheet reconciliation every evening.",
    missedOpportunities: "Can't take on new carriers without more staff.",
    whyNow: "We're adding two new regional carriers next quarter.",
    urgencyTrigger: "New carrier onboarding deadline.",
    consequenceOfDelay: "Onboarding will be delayed for the new carriers.",
    desiredOutcome: "Automated conflict-free scheduling.",
    successDefinition: "Zero double-bookings for 90 consecutive days.",
    primaryGoal: "reduce_manual_work",
    secondaryGoals: ["support_growth", "improve_data_visibility"],
  },
  projectScope: {
    features: [
      { key: "load_scheduling", priority: "must_have" },
      { key: "carrier_portal", priority: "important_after_launch" },
      { key: "reporting_dashboard", priority: "exploring" },
    ],
    additionalRequirements: "Must integrate with our existing dispatch tool.",
  },
  readiness: {
    logoStatus: "have_it",
    brandStatus: "have_it",
    contentStatus: "have_it",
    photoVideoStatus: "not_applicable",
    referenceSites: ["https://example-competitor.com", "https://example-inspo.com"],
    designPreferences: "Clean, data-dense dashboards.",
    designDislikes: "No stock photography of trucks.",
    domainStatus: "have_it",
    hostingStatus: "have_it",
    currentPlatform: "Custom internal tool",
    currentCrm: "None",
    currentEmailProvider: "Google Workspace",
    schedulingTool: "None",
    migrationNeeds: "Import six months of historical load data.",
    integrations: ["quickbooks", "google_maps"],
    accessibilityNeeds: "Standard WCAG 2.2 AA.",
    languageNeeds: "English only.",
    privacyRegulatoryNeeds: "Standard commercial data handling.",
    technicalOwner: "IT Director",
    contentOwner: "Operations Manager",
  },
  commercial: {
    launchWindow: "within_1_3_months",
    targetDate: "2026-10-01",
    dateFlexibility: "firm",
    deadlineReason: "New carrier onboarding deadline.",
    investmentRange: "premium",
    investmentApproved: true,
    decisionMakers: "COO and IT Director.",
    finalApprover: "COO",
    vendorProcurementInvolved: true,
    supportModelPreference: "ongoing_retainer",
    discoveryAvailability: "Weekday mornings, Pacific time.",
    preferredStartPeriod: "Next available slot",
  },
  contact: {
    name: "Priya Natarajan",
    title: "IT Director",
    email: "priya@northgate.example.com",
    phone: "+15035551234",
    preferredContactMethod: "either",
    preferredContactTime: "Mornings",
    timeZone: "America/Los_Angeles",
    referralSource: "Referral from a partner carrier",
    consent: {
      privacyPolicyAcknowledged: true,
      operationalContactConsent: true,
      marketingConsent: true,
      smsConsent: false,
    },
  },
};

check("smallest valid submission parses", DiscoverySubmissionContract.safeParse(smallestValid).success);
check(
  "full representative submission parses",
  DiscoverySubmissionContract.safeParse(fullRepresentative).success,
);

// Unknown field rejection (strict object).
{
  const withUnknown = { ...smallestValid, unexpectedField: "nope" };
  const result = DiscoverySubmissionContract.safeParse(withUnknown);
  check("unknown top-level field is rejected", !result.success);
}
{
  const withUnknownNested = {
    ...smallestValid,
    business: { ...smallestValid.business, unexpectedNested: "nope" },
  };
  check("unknown nested field is rejected", !DiscoverySubmissionContract.safeParse(withUnknownNested).success);
}

// Missing required fields.
{
  const { business, ...missingBusiness } = smallestValid;
  check("missing required category is rejected", !DiscoverySubmissionContract.safeParse(missingBusiness).success);
}
{
  const missingGoal = {
    ...smallestValid,
    decisionContext: { ...smallestValid.decisionContext, primaryGoal: undefined },
  };
  check("missing required field within a category is rejected", !DiscoverySubmissionContract.safeParse(missingGoal).success);
}

// Invalid email.
{
  const badEmail = { ...smallestValid, contact: { ...validContact, email: "not-an-email" } };
  check("invalid email is rejected", !DiscoverySubmissionContract.safeParse(badEmail).success);
}

// Invalid URL.
{
  const badUrl = { ...smallestValid, business: { ...smallestValid.business, currentWebsite: "not a url" } };
  check("invalid URL is rejected", !DiscoverySubmissionContract.safeParse(badUrl).success);
}

// Oversized string.
{
  const oversized = { ...smallestValid, business: { ...smallestValid.business, description: "x".repeat(5000) } };
  check("oversized free-text string is rejected", !DiscoverySubmissionContract.safeParse(oversized).success);
}

// Oversized array.
{
  const tooManyFeatures = {
    ...smallestValid,
    projectScope: {
      features: Array.from({ length: 61 }, (_, i) => ({ key: `feature_${i}`, priority: "not_sure" as const })),
    },
  };
  check("oversized array is rejected", !DiscoverySubmissionContract.safeParse(tooManyFeatures).success);
}

// Invalid enum.
{
  const badEnum = { ...smallestValid, projectDirection: { primaryType: "not_a_real_type" } };
  check("invalid enum value is rejected", !DiscoverySubmissionContract.safeParse(badEnum).success);
}

// Phone optional.
check("phone is optional (absent)", DiscoverySubmissionContract.safeParse(smallestValid).success);
{
  const withPhone = { ...smallestValid, contact: { ...validContact, phone: "+15035550100" } };
  check("phone is accepted when present", DiscoverySubmissionContract.safeParse(withPhone).success);
}

// Marketing consent optional; SMS consent optional and separate.
{
  const parsed = DiscoverySubmissionContract.safeParse(smallestValid);
  check(
    "marketing consent defaults false when omitted, independent of required consents",
    parsed.success && parsed.data.contact.consent.marketingConsent === false,
  );
  check(
    "sms consent defaults false when omitted, independent of marketing consent",
    parsed.success && parsed.data.contact.consent.smsConsent === false,
  );
}
{
  const marketingOnly = {
    ...smallestValid,
    contact: { ...validContact, consent: { ...validContact.consent, marketingConsent: true } },
  };
  const parsed = DiscoverySubmissionContract.safeParse(marketingOnly);
  check(
    "marketing consent can be true while sms consent stays false (kept separate)",
    parsed.success && parsed.data.contact.consent.marketingConsent === true && parsed.data.contact.consent.smsConsent === false,
  );
}

// No secret-like or file-upload fields present anywhere in the contract.
{
  const serialized = JSON.stringify(smallestValid) + JSON.stringify(fullRepresentative);
  const forbiddenPatterns = [/password/i, /apiKey/i, /secret/i, /token/i, /fileUpload/i, /attachment/i, /base64/i];
  check(
    "no secret-like or file-upload field names appear in example payloads",
    !forbiddenPatterns.some((pattern) => pattern.test(serialized)),
  );
}

// Transport metadata is structurally separate from the answer contract.
{
  const meta = {
    idempotencyKey: "5f1e6f0e-9c3a-4b3d-8b7a-1a2b3c4d5e6f",
    formVersion: "1.0.0",
    schemaVersion: "1.0.0",
    formStartedAt: new Date().toISOString(),
  };
  check("transport metadata validates independently of answers", DiscoveryTransportMeta.safeParse(meta).success);
  check(
    "answers contract has no idempotencyKey/formStartedAt fields",
    !("idempotencyKey" in DiscoverySubmissionContract.shape) && !("formStartedAt" in DiscoverySubmissionContract.shape),
  );
  const envelope = { meta, answers: smallestValid };
  check("full request envelope (meta + answers) validates", DiscoverySubmissionRequest.safeParse(envelope).success);
}

// ── Checkpoint 2C.3 additions (owner-directed intake reorganization) ────────
// Additive only: every check below extends coverage without weakening or
// removing any check above.

// projectDirection.projectStage is new and optional — absent (legacy shape)
// and present both validate.
check(
  "projectStage is optional (absent still parses, matches pre-2C.3 shape)",
  DiscoverySubmissionContract.safeParse(smallestValid).success,
);
{
  const withStage = {
    ...smallestValid,
    projectDirection: { ...smallestValid.projectDirection, projectStage: "redesign" },
  };
  const parsed = DiscoverySubmissionContract.safeParse(withStage);
  check(
    "projectStage is accepted when present",
    parsed.success && parsed.data.projectDirection.projectStage === "redesign",
  );
}
{
  const badStage = {
    ...smallestValid,
    projectDirection: { ...smallestValid.projectDirection, projectStage: "not_a_real_stage" },
  };
  check("invalid projectStage value is rejected", !DiscoverySubmissionContract.safeParse(badStage).success);
}

// decisionContext.primaryProblem / successDefinition relaxed to optional.
{
  const { primaryProblem: _primaryProblem, ...decisionContextWithoutPrimaryProblem } = smallestValid.decisionContext;
  const withoutPrimaryProblem = { ...smallestValid, decisionContext: decisionContextWithoutPrimaryProblem };
  check(
    "primaryProblem is now optional (submission without it still parses)",
    DiscoverySubmissionContract.safeParse(withoutPrimaryProblem).success,
  );
}
{
  const { successDefinition: _successDefinition, ...decisionContextWithoutSuccessDefinition } = smallestValid.decisionContext;
  const withoutSuccessDefinition = { ...smallestValid, decisionContext: decisionContextWithoutSuccessDefinition };
  check(
    "successDefinition is now optional (submission without it still parses)",
    DiscoverySubmissionContract.safeParse(withoutSuccessDefinition).success,
  );
}

// New optional top-level `growth` section.
check(
  "growth section is optional (absent entirely still parses)",
  DiscoverySubmissionContract.safeParse(smallestValid).success && !("growth" in smallestValid),
);
{
  const notInterested = { ...smallestValid, growth: { interested: false } };
  check("growth.interested=false with nothing else set parses", DiscoverySubmissionContract.safeParse(notInterested).success);
}
{
  const fullGrowth = {
    ...smallestValid,
    growth: {
      interested: true,
      platform: "meta_ads",
      monthlyBudgetRange: "1500_5000",
      campaignObjective: "lead_generation",
      targetAudienceLocations: "Adults 25-54 within 25 miles of Portland, OR.",
      hasLandingPage: "yes",
      landingPageUrl: "https://example.com/landing",
      hasPixelsConfigured: "unsure",
      analyticsConsentReady: "no",
      creativeAssetsAvailable: "in_progress",
      previousCampaignResults: "Ran a small boosted-post test last year with mixed results.",
      reportingCadence: "monthly",
    },
  };
  check("fully populated growth section parses", DiscoverySubmissionContract.safeParse(fullGrowth).success);
}
{
  const badGrowth = { ...smallestValid, growth: { interested: true, platform: "not_a_real_platform" } };
  check("invalid growth.platform value is rejected", !DiscoverySubmissionContract.safeParse(badGrowth).success);
}
{
  const missingInterested = { ...smallestValid, growth: { platform: "google_ads" } };
  check(
    "growth.interested is required once the growth section is present at all",
    !DiscoverySubmissionContract.safeParse(missingInterested).success,
  );
}

// The two api-server-shaped fixtures (protected files this checkpoint must
// never touch or break) stay valid under the widened contract — asserted
// here as a standing guardrail, not a copy of those tests.
{
  const apiServerShapedAnswers = {
    projectDirection: { primaryType: "new_website" },
    business: {
      organizationName: "Acme Co",
      industry: "Retail",
      description: "A test business description that is long enough.",
      primaryAudience: "Local shoppers looking for goods and services nearby.",
      businessStage: "established",
      teamSizeRange: "2_10",
    },
    decisionContext: {
      currentSituation: "No website today, losing walk-in and online interest.",
      primaryProblem: "No online presence at all for the business.",
      whyNow: "Ready to invest in growth this quarter.",
      desiredOutcome: "A credible site that converts visitors into customers.",
      successDefinition: "More inbound inquiries each month.",
      primaryGoal: "increase_leads",
    },
    projectScope: { features: [] },
    readiness: {
      logoStatus: "have_it",
      brandStatus: "have_it",
      contentStatus: "in_progress",
      photoVideoStatus: "need_help",
      domainStatus: "have_it",
      hostingStatus: "need_recommendation",
    },
    commercial: {
      launchWindow: "within_1_3_months",
      investmentRange: "growth",
      investmentApproved: true,
      decisionMakers: "Just me, the owner.",
      vendorProcurementInvolved: false,
    },
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      preferredContactMethod: "email",
      consent: { privacyPolicyAcknowledged: true, operationalContactConsent: true, marketingConsent: false, smsConsent: false },
    },
  };
  check(
    "the artifacts/api-server discoveryV1 test fixture shape still parses unchanged",
    DiscoverySubmissionContract.safeParse(apiServerShapedAnswers).success,
  );
}

if (failures > 0) {
  console.error(`\n${failures} discoveryContract test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryContract tests passed.");
}
