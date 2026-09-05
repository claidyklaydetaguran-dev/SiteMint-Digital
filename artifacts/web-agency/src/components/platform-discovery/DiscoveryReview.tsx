import { Button } from "@/components/ui/button";
import { STEP_LABELS } from "./DiscoveryProgress";
import type { DiscoveryDraft } from "./discoveryFormModel";

interface DiscoveryReviewProps {
  values: DiscoveryDraft;
  onEditStep: (stepIndex: number) => void;
  onCompletePreview: () => void;
  /** True while the submission request is in flight — disables the button and prevents duplicate submits. */
  submitting?: boolean;
  /** Present when the last submit attempt failed (validation, network, rate limit, server, idempotency conflict). */
  errorMessage?: string;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not answered yet";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None selected";
    return value
      .map((entry) => {
        if (entry !== null && typeof entry === "object") {
          const { key, priority } = entry as { key?: string; priority?: string };
          return priority ? `${key} (${priority.replace(/_/g, " ")})` : String(key);
        }
        return String(entry);
      })
      .join(", ");
  }
  return String(value).replace(/_/g, " ");
}

interface ReviewSection {
  stepIndex: number;
  title: string;
  fields: { label: string; value: unknown }[];
}

/**
 * Checkpoint 2C.3 — rebuilt for the reorganized 8-step order. Every section
 * still maps back to the step it came from (`stepIndex`, used by the "Edit"
 * link), and the growth section is entirely omitted from the summary when
 * the visitor said they weren't interested — showing eleven "Not answered
 * yet" rows for a step they explicitly opted out of would be noise, not a
 * useful review.
 */
function buildSections(values: DiscoveryDraft): ReviewSection[] {
  const sections: ReviewSection[] = [
    {
      stepIndex: 0,
      title: STEP_LABELS[0],
      fields: [
        { label: "Starting point", value: values.projectDirection?.projectStage },
        { label: "What the business does", value: values.business?.description },
      ],
    },
    {
      stepIndex: 1,
      title: STEP_LABELS[1],
      fields: [
        { label: "System or service needed", value: values.projectDirection?.primaryType },
        { label: "Also interested in", value: values.projectDirection?.secondaryInterests },
      ],
    },
    {
      stepIndex: 2,
      title: STEP_LABELS[2],
      fields: [
        { label: "Organization name", value: values.business?.organizationName },
        { label: "Industry", value: values.business?.industry },
        { label: "Current website", value: values.business?.currentWebsite },
        { label: "Service area", value: values.business?.serviceArea },
        { label: "Primary audience", value: values.business?.primaryAudience },
        { label: "Secondary audience", value: values.business?.secondaryAudience },
        { label: "Business stage", value: values.business?.businessStage },
        { label: "Team size", value: values.business?.teamSizeRange },
        { label: "Current situation", value: values.decisionContext?.currentSituation },
        { label: "Impact today", value: values.decisionContext?.customerImpact },
        { label: "Why now", value: values.decisionContext?.whyNow },
        { label: "Desired outcome", value: values.decisionContext?.desiredOutcome },
        { label: "Primary goal", value: values.decisionContext?.primaryGoal },
        { label: "Secondary goals", value: values.decisionContext?.secondaryGoals },
      ],
    },
    {
      stepIndex: 3,
      title: STEP_LABELS[3],
      fields: [
        { label: "Logo", value: values.readiness?.logoStatus },
        { label: "Brand assets", value: values.readiness?.brandStatus },
        { label: "Reference sites", value: values.readiness?.referenceSites },
        { label: "Styles / colors", value: values.readiness?.designPreferences },
        { label: "Things to avoid", value: values.readiness?.designDislikes },
      ],
    },
    {
      stepIndex: 4,
      title: STEP_LABELS[4],
      fields: [
        { label: "Selected features", value: values.projectScope?.features },
        { label: "Additional requirements", value: values.projectScope?.additionalRequirements },
        { label: "Content readiness", value: values.readiness?.contentStatus },
        { label: "Photo / video readiness", value: values.readiness?.photoVideoStatus },
      ],
    },
    {
      stepIndex: 5,
      title: STEP_LABELS[5],
      fields: [
        { label: "Domain", value: values.readiness?.domainStatus },
        { label: "Hosting", value: values.readiness?.hostingStatus },
        { label: "Current platform", value: values.readiness?.currentPlatform },
        { label: "Tools / data to connect", value: values.readiness?.integrations },
        { label: "Migration needs", value: values.readiness?.migrationNeeds },
      ],
    },
    {
      stepIndex: 7,
      title: STEP_LABELS[7],
      fields: [
        { label: "Launch window", value: values.commercial?.launchWindow },
        { label: "Target date", value: values.commercial?.targetDate },
        { label: "Investment range", value: values.commercial?.investmentRange },
        { label: "Investment approved", value: values.commercial?.investmentApproved },
        { label: "Decision makers", value: values.commercial?.decisionMakers },
        { label: "Vendor/procurement involved", value: values.commercial?.vendorProcurementInvolved },
        { label: "Name", value: values.contact?.name },
        { label: "Email", value: values.contact?.email },
        { label: "Phone", value: values.contact?.phone },
        { label: "Preferred contact method", value: values.contact?.preferredContactMethod },
        { label: "Privacy policy acknowledged", value: values.contact?.consent?.privacyPolicyAcknowledged },
        { label: "Operational contact consent", value: values.contact?.consent?.operationalContactConsent },
        { label: "Marketing consent", value: values.contact?.consent?.marketingConsent },
        { label: "SMS consent", value: values.contact?.consent?.smsConsent },
      ],
    },
  ];

  if (values.growth?.interested) {
    sections.splice(6, 0, {
      stepIndex: 6,
      title: STEP_LABELS[6],
      fields: [
        { label: "Interested in advertising support", value: values.growth?.interested },
        { label: "Platform", value: values.growth?.platform },
        { label: "Other platform", value: values.growth?.otherPlatformNote },
        { label: "Monthly media budget", value: values.growth?.monthlyBudgetRange },
        { label: "Campaign objective", value: values.growth?.campaignObjective },
        { label: "Target audience / locations", value: values.growth?.targetAudienceLocations },
        { label: "Has a landing page", value: values.growth?.hasLandingPage },
        { label: "Landing page URL", value: values.growth?.landingPageUrl },
        { label: "Pixels / conversion tracking", value: values.growth?.hasPixelsConfigured },
        { label: "Analytics / consent ready", value: values.growth?.analyticsConsentReady },
        { label: "Creative assets", value: values.growth?.creativeAssetsAvailable },
        { label: "Previous results", value: values.growth?.previousCampaignResults },
        { label: "Reporting cadence", value: values.growth?.reportingCadence },
      ],
    });
  }

  return sections;
}

export function DiscoveryReview({
  values,
  onEditStep,
  onCompletePreview,
  submitting = false,
  errorMessage,
}: DiscoveryReviewProps) {
  const sections = buildSections(values);

  return (
    <div>
      <p className="mb-6 text-[hsl(var(--sm-color-text-secondary))]">
        Review everything below before submitting. You can edit any section — nothing is sent to SiteMint until you
        submit the brief.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="dv5-alert-in mb-6 rounded-md border border-[hsl(var(--sm-color-status-danger))]/30 bg-[hsl(var(--sm-color-status-danger))]/5 p-4 text-sm font-medium text-[hsl(var(--sm-color-status-danger))]"
        >
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="dv5-review-section">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="pp-font-display text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]">
                {section.title}
              </h3>
              <button
                type="button"
                onClick={() => onEditStep(section.stepIndex)}
                className="text-sm font-medium text-[hsl(var(--sm-color-text-link))] underline underline-offset-2 hover:no-underline"
              >
                Edit
              </button>
            </div>
            <dl className="space-y-2">
              {section.fields.map((field) => (
                <div key={field.label} className="grid grid-cols-1 gap-1 sm:grid-cols-[13rem_1fr]">
                  <dt className="text-sm text-[hsl(var(--sm-color-text-secondary))]">{field.label}</dt>
                  <dd className="text-sm text-[hsl(var(--sm-color-text-primary))]">{formatValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-[hsl(var(--sm-color-text-secondary))]">
        Submitting sends this brief to SiteMint. Our team reviews every submission and replies within 24–48 hours.
      </p>

      <Button
        type="button"
        size="lg"
        className="pp-btn pp-btn-primary mt-4"
        onClick={onCompletePreview}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? "Submitting…" : errorMessage ? "Try again" : "Submit Discovery Brief"}
      </Button>
    </div>
  );
}
