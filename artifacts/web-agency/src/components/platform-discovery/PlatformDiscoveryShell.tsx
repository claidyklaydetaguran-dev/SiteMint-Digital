import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  defaultDiscoveryDraft,
  discoveryResolver,
  validateDiscoverySubmission,
  applyFieldErrors,
  findFirstStepWithError,
  mapZodIssuesToFieldErrors,
  STEP_FIELD_PATHS,
  type DiscoveryDraft,
} from "./discoveryFormModel";
import type { DiscoverySubmissionContract } from "@workspace/discovery-contract";
import { DiscoveryProgress, STEP_LABELS, TOTAL_STEPS } from "./DiscoveryProgress";
import { DiscoveryStepNavigation } from "./DiscoveryStepNavigation";
import { DiscoveryValidationSummary } from "./DiscoveryValidationSummary";
import { DiscoveryReview } from "./DiscoveryReview";
import { ProjectDirectionStep } from "./steps/ProjectDirectionStep";
import { BusinessStep } from "./steps/BusinessStep";
import { DecisionContextStep } from "./steps/DecisionContextStep";
import { ProjectScopeStep } from "./steps/ProjectScopeStep";
import { ReadinessStep } from "./steps/ReadinessStep";
import { CommercialStep } from "./steps/CommercialStep";
import { ContactStep } from "./steps/ContactStep";

const REVIEW_STEP_INDEX = TOTAL_STEPS - 1;

const STEP_COMPONENTS = [
  ProjectDirectionStep,
  BusinessStep,
  DecisionContextStep,
  ProjectScopeStep,
  ReadinessStep,
  CommercialStep,
  ContactStep,
];

export function PlatformDiscoveryShell() {
  const form = useForm<DiscoveryDraft>({
    defaultValues: defaultDiscoveryDraft,
    resolver: discoveryResolver,
    shouldUnregister: false,
    mode: "onSubmit",
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [validatedSubmission, setValidatedSubmission] = useState<DiscoverySubmissionContract | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    setAnnouncement(`Step ${currentStep + 1} of ${TOTAL_STEPS}: ${STEP_LABELS[currentStep]}`);
  }, [currentStep]);

  async function handleContinue() {
    const stepKey = STEP_FIELD_PATHS[currentStep];
    const isValid = await form.trigger([stepKey]);
    if (isValid) {
      setCurrentStep((step) => Math.min(step + 1, REVIEW_STEP_INDEX));
    } else {
      const failingCount = Object.keys(form.formState.errors[stepKey] ?? {}).length;
      setAnnouncement(
        failingCount === 1 ? "1 field needs attention" : `${Math.max(failingCount, 1)} fields need attention`,
      );
    }
  }

  function handleBack() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function handleEditStep(stepIndex: number) {
    setCurrentStep(stepIndex);
  }

  function handleStartOver() {
    const confirmed = window.confirm("Start over? This will clear everything you've entered in this preview.");
    if (!confirmed) return;
    form.reset(defaultDiscoveryDraft);
    setValidatedSubmission(null);
    setCurrentStep(0);
  }

  // Path 2 — final completion. Never calls trigger()/handleSubmit and never
  // goes through discoveryResolver; validates the whole draft directly so
  // it is always full-contract validation regardless of anything RHF's
  // resolver machinery is doing elsewhere.
  function handleCompletePreview() {
    const result = validateDiscoverySubmission(form.getValues());
    if (!result.success) {
      const fieldErrors = mapZodIssuesToFieldErrors(result.error.issues);
      applyFieldErrors(form, fieldErrors);
      setCurrentStep(findFirstStepWithError(fieldErrors));
      setAnnouncement("Some required fields still need attention. You've been moved to the first one.");
      return;
    }
    setValidatedSubmission(result.data);
    setAnnouncement("Review Experience Complete. This was a preview; nothing was submitted or saved.");
  }

  function handleFocusField(path: string) {
    const element = document.querySelector<HTMLElement>(`[name="${CSS.escape(path)}"], #${CSS.escape(path)}`);
    element?.focus();
  }

  if (validatedSubmission) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6" aria-live="polite">
        <span
          className="pp-check-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}
        >
          <CheckCircle2 size={28} aria-hidden="true" className="text-[hsl(var(--sm-mint-500))]" />
        </span>
        <h1 className="mt-5 text-2xl font-serif font-bold text-[hsl(var(--sm-color-text-primary))]">
          Review Experience Complete
        </h1>
        <p className="mt-4 text-[hsl(var(--sm-color-text-secondary))]">
          This was a preview; nothing was submitted or saved. No email, database record, or CRM entry was created.
        </p>
        <Button type="button" className="pp-btn pp-btn-primary mt-8" onClick={handleStartOver}>
          Start Over
        </Button>
      </div>
    );
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <FormProvider {...form}>
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <DiscoveryProgress currentStep={currentStep} />

        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mb-6 text-2xl font-serif font-bold text-[hsl(var(--sm-color-text-primary))] outline-none"
        >
          {STEP_LABELS[currentStep]}
        </h2>

        {currentStep < REVIEW_STEP_INDEX && (
          <DiscoveryValidationSummary
            stepKey={STEP_FIELD_PATHS[currentStep]}
            errors={form.formState.errors}
            onFocusField={handleFocusField}
          />
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div key={currentStep} className="pp-reveal">
            {currentStep < REVIEW_STEP_INDEX ? (
              <StepComponent />
            ) : (
              <DiscoveryReview
                values={form.getValues()}
                onEditStep={handleEditStep}
                onCompletePreview={handleCompletePreview}
              />
            )}
          </div>

          <DiscoveryStepNavigation
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            onBack={handleBack}
            onContinue={handleContinue}
            onStartOver={handleStartOver}
          />
        </form>
      </div>
    </FormProvider>
  );
}
