import { Button } from "@/components/ui/button";
import { STEP_LABELS } from "./DiscoveryProgress";
import type { DiscoveryDraft } from "./discoveryFormModel";

interface DiscoveryReviewProps {
  values: DiscoveryDraft;
  onEditStep: (stepIndex: number) => void;
  onCompletePreview: () => void;
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

function buildSections(values: DiscoveryDraft): ReviewSection[] {
  return [
    {
      stepIndex: 0,
      title: STEP_LABELS[0],
      fields: [
        { label: "Primary project type", value: values.projectDirection?.primaryType },
        { label: "Also interested in", value: values.projectDirection?.secondaryInterests },
      ],
    },
    {
      stepIndex: 1,
      title: STEP_LABELS[1],
      fields: [
        { label: "Organization name", value: values.business?.organizationName },
        { label: "Industry", value: values.business?.industry },
        { label: "Current website", value: values.business?.currentWebsite },
        { label: "Business stage", value: values.business?.businessStage },
        { label: "Team size", value: values.business?.teamSizeRange },
        { label: "Primary audience", value: values.business?.primaryAudience },
      ],
    },
    {
      stepIndex: 2,
      title: STEP_LABELS[2],
      fields: [
        { label: "Current situation", value: values.decisionContext?.currentSituation },
        { label: "Primary problem", value: values.decisionContext?.primaryProblem },
        { label: "Why now", value: values.decisionContext?.whyNow },
        { label: "Desired outcome", value: values.decisionContext?.desiredOutcome },
        { label: "Success definition", value: values.decisionContext?.successDefinition },
        { label: "Primary goal", value: values.decisionContext?.primaryGoal },
      ],
    },
    {
      stepIndex: 3,
      title: STEP_LABELS[3],
      fields: [
        { label: "Selected features", value: values.projectScope?.features },
        { label: "Additional requirements", value: values.projectScope?.additionalRequirements },
      ],
    },
    {
      stepIndex: 4,
      title: STEP_LABELS[4],
      fields: [
        { label: "Logo", value: values.readiness?.logoStatus },
        { label: "Brand assets", value: values.readiness?.brandStatus },
        { label: "Content", value: values.readiness?.contentStatus },
        { label: "Photo/video", value: values.readiness?.photoVideoStatus },
        { label: "Domain", value: values.readiness?.domainStatus },
        { label: "Hosting", value: values.readiness?.hostingStatus },
      ],
    },
    {
      stepIndex: 5,
      title: STEP_LABELS[5],
      fields: [
        { label: "Launch window", value: values.commercial?.launchWindow },
        { label: "Investment range", value: values.commercial?.investmentRange },
        { label: "Investment approved", value: values.commercial?.investmentApproved },
        { label: "Decision makers", value: values.commercial?.decisionMakers },
        { label: "Vendor/procurement involved", value: values.commercial?.vendorProcurementInvolved },
      ],
    },
    {
      stepIndex: 6,
      title: STEP_LABELS[6],
      fields: [
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
}

export function DiscoveryReview({ values, onEditStep, onCompletePreview }: DiscoveryReviewProps) {
  const sections = buildSections(values);

  return (
    <div>
      <p className="mb-6 text-[hsl(var(--sm-color-text-secondary))]">
        Review everything below before completing this preview. You can edit any section — nothing is submitted or
        saved until you choose to complete the preview.
      </p>

      <div className="space-y-6">
        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-lg border border-[hsl(var(--sm-card-border))] bg-[hsl(var(--sm-card-background))] p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="font-serif text-lg font-bold text-[hsl(var(--sm-color-text-primary))]">
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
        Complete Preview validates every answer above. Nothing is submitted, emailed, or saved — this is a preview
        only.
      </p>

      <Button type="button" size="lg" className="mt-4" onClick={onCompletePreview}>
        Complete Preview
      </Button>
    </div>
  );
}
