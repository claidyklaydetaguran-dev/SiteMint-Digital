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
import { DiscoveryWelcome } from "./DiscoveryWelcome";
import { ProjectDirectionStep } from "./steps/ProjectDirectionStep";
import { BusinessStep } from "./steps/BusinessStep";
import { DecisionContextStep } from "./steps/DecisionContextStep";
import { ProjectScopeStep } from "./steps/ProjectScopeStep";
import { ReadinessStep } from "./steps/ReadinessStep";
import { CommercialStep } from "./steps/CommercialStep";
import { ContactStep } from "./steps/ContactStep";
import {
  loadDraft,
  clearDraft,
  useDiscoveryDraftPersistence,
} from "@/hooks/useDiscoveryDraft";

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

  // Welcome phase — user sees an intro screen before step 1.
  // On first mount we check for a saved draft so we can offer "continue" vs "start fresh".
  const [phase, setPhase] = useState<"welcome" | "form">("welcome");
  const [savedDraft] = useState<DiscoveryDraft | null>(() => loadDraft());

  const [currentStep, setCurrentStep] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [validatedSubmission, setValidatedSubmission] = useState<DiscoverySubmissionContract | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Auto-save + beforeunload only while filling in the form (not on welcome screen).
  useDiscoveryDraftPersistence(form, phase === "form");

  useEffect(() => {
    if (phase === "form") {
      headingRef.current?.focus();
      setAnnouncement(`Step ${currentStep + 1} of ${TOTAL_STEPS}: ${STEP_LABELS[currentStep]}`);
    }
  }, [currentStep, phase]);

  // ── Welcome screen handlers ──────────────────────────────────────────────

  function handleStart() {
    clearDraft();
    form.reset(defaultDiscoveryDraft);
    setCurrentStep(0);
    setPhase("form");
  }

  function handleRestoreDraft() {
    if (savedDraft) {
      form.reset(savedDraft);
    }
    setCurrentStep(0);
    setPhase("form");
  }

  // ── Step navigation ──────────────────────────────────────────────────────

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
    const confirmed = window.confirm("Start over? This will clear all your answers and return to the beginning.");
    if (!confirmed) return;
    clearDraft();
    form.reset(defaultDiscoveryDraft);
    setValidatedSubmission(null);
    setCurrentStep(0);
    setPhase("welcome");
  }

  // ── Final completion (preview mode) ─────────────────────────────────────
  // Path 2 — validates the whole draft directly via the shared
  // validateDiscoverySubmission helper (never goes through discoveryResolver).

  function handleCompletePreview() {
    const result = validateDiscoverySubmission(form.getValues());
    if (!result.success) {
      const fieldErrors = mapZodIssuesToFieldErrors(result.error.issues);
      applyFieldErrors(form, fieldErrors);
      setCurrentStep(findFirstStepWithError(fieldErrors));
      setAnnouncement("Some required fields still need attention. You've been moved to the first one.");
      return;
    }
    clearDraft();
    setValidatedSubmission(result.data);
    setAnnouncement("Review experience complete. Nothing was submitted or saved.");
  }

  function handleFocusField(path: string) {
    const element = document.querySelector<HTMLElement>(`[name="${CSS.escape(path)}"], #${CSS.escape(path)}`);
    element?.focus();
  }

  // ── Welcome screen ───────────────────────────────────────────────────────

  if (phase === "welcome") {
    return (
      <DiscoveryWelcome
        hasDraft={savedDraft !== null}
        onStart={handleStart}
        onRestoreDraft={handleRestoreDraft}
      />
    );
  }

  // ── Completion screen ────────────────────────────────────────────────────

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
          You're all set — we'll be in touch soon
        </h1>
        <p className="mt-4 text-[hsl(var(--sm-color-text-secondary))] leading-relaxed">
          Thank you for taking the time to walk us through your project. Our team will review your answers and
          reach out within 24–48 hours with a personalized scope of work and proposal.
        </p>
        <div
          className="mt-8 rounded-lg border p-5 text-left"
          style={{
            borderColor: "hsl(var(--sm-color-border-default))",
            backgroundColor: "hsl(var(--sm-color-bg-subtle))",
          }}
        >
          <p className="mb-2 text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">What happens next</p>
          <ol className="space-y-1.5">
            {[
              "Our team reviews your answers",
              "We prepare a personalized scope of work and proposal",
              "We reach out within 24–48 hours to schedule a discovery call",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2.5 text-sm text-[hsl(var(--sm-color-text-secondary))]">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[hsl(var(--sm-mint-500))]"
                  style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium transition-colors"
            style={{
              borderColor: "hsl(var(--sm-color-border-default))",
              color: "hsl(var(--sm-color-text-primary))",
            }}
          >
            Back to home
          </a>
          <Button type="button" variant="ghost" className="text-sm" onClick={handleStartOver}>
            Submit another project
          </Button>
        </div>
      </div>
    );
  }

  // ── Multi-step form ──────────────────────────────────────────────────────

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
