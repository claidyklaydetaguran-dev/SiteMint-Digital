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
  countErrorsAtPaths,
  STEP_FIELD_PATHS,
  type DiscoveryDraft,
} from "./discoveryFormModel";
import type { DiscoverySubmissionContract } from "@workspace/discovery-contract";
import { DiscoveryProgress, STEP_LABELS, TOTAL_STEPS } from "./DiscoveryProgress";
import { DiscoveryStepRail } from "./DiscoveryStepRail";
import { DiscoveryStepNavigation } from "./DiscoveryStepNavigation";
import { DiscoveryValidationSummary } from "./DiscoveryValidationSummary";
import { DiscoveryReview } from "./DiscoveryReview";
import { DiscoveryWelcome } from "./DiscoveryWelcome";
import { ProjectStartingPointStep } from "./steps/ProjectStartingPointStep";
import { SystemNeededStep } from "./steps/SystemNeededStep";
import { BusinessAudienceStep } from "./steps/BusinessAudienceStep";
import { BrandDirectionStep } from "./steps/BrandDirectionStep";
import { ContentFunctionalityStep } from "./steps/ContentFunctionalityStep";
import { SystemsIntegrationsStep } from "./steps/SystemsIntegrationsStep";
import { GrowthAdvertisingStep } from "./steps/GrowthAdvertisingStep";
import { DeliveryContactStep } from "./steps/DeliveryContactStep";
import {
  loadDraft,
  clearDraft,
  useDiscoveryDraftPersistence,
} from "@/hooks/useDiscoveryDraft";
import {
  buildDiscoverySubmitBody,
  submitDiscoveryBrief,
  getOrCreateSubmissionSession,
  isSessionAlreadySubmitted,
  markSessionSubmitted,
  clearSubmissionSession,
  type DiscoverySubmitOutcome,
} from "./discoverySubmit";

const SUPPORT_EMAIL = "info.sitemint@gmail.com";

const REVIEW_STEP_INDEX = TOTAL_STEPS - 1;

const STEP_COMPONENTS = [
  ProjectStartingPointStep,
  SystemNeededStep,
  BusinessAudienceStep,
  BrandDirectionStep,
  ContentFunctionalityStep,
  SystemsIntegrationsStep,
  GrowthAdvertisingStep,
  DeliveryContactStep,
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
  // W-9/W-11: real submission states, distinct from the client-side
  // validation state above.
  const [submitState, setSubmitState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "done"; outcome: Extract<DiscoverySubmitOutcome, { kind: "success" | "duplicate" }> }
    | { kind: "error"; outcome: Exclude<DiscoverySubmitOutcome, { kind: "success" | "duplicate" }> }
  >({ kind: "idle" });
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
    const stepPaths = STEP_FIELD_PATHS[currentStep];
    // react-hook-form's trigger() accepts an array of any registered field
    // paths (leaf or subtree) — it is not limited to top-level keys, so this
    // validates exactly this step's fields regardless of which contract
    // object(s) they belong to.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isValid = await form.trigger(stepPaths as any);
    if (isValid) {
      setCurrentStep((step) => Math.min(step + 1, REVIEW_STEP_INDEX));
    } else {
      const failingCount = countErrorsAtPaths(form.formState.errors, stepPaths);
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
    clearSubmissionSession();
    form.reset(defaultDiscoveryDraft);
    setValidatedSubmission(null);
    setSubmitState({ kind: "idle" });
    setCurrentStep(0);
    setPhase("welcome");
  }

  // ── Final completion — validates the whole draft, then submits it to the
  // real backend (W-9/W-11). Path 2: validates directly via the shared
  // validateDiscoverySubmission helper (never goes through discoveryResolver).

  async function handleCompletePreview() {
    if (submitState.kind === "submitting") return; // duplicate-prevention: ignore re-clicks mid-flight

    const result = validateDiscoverySubmission(form.getValues());
    if (!result.success) {
      const fieldErrors = mapZodIssuesToFieldErrors(result.error.issues);
      applyFieldErrors(form, fieldErrors);
      setCurrentStep(findFirstStepWithError(fieldErrors));
      setAnnouncement("Some required fields still need attention. You've been moved to the first one.");
      return;
    }

    setValidatedSubmission(result.data);

    const { idempotencyKey, formStartedAt } = getOrCreateSubmissionSession();

    // Duplicate-prevention: this session's key already succeeded — show the
    // same completion state again without a second network call.
    if (isSessionAlreadySubmitted(idempotencyKey)) {
      setSubmitState({ kind: "done", outcome: { kind: "duplicate", reference: idempotencyKey } });
      clearDraft();
      setAnnouncement("This brief was already submitted.");
      return;
    }

    setSubmitState({ kind: "submitting" });
    setAnnouncement("Submitting your brief…");

    const body = buildDiscoverySubmitBody(result.data, idempotencyKey, formStartedAt);
    const outcome = await submitDiscoveryBrief(body);

    if (outcome.kind === "success" || outcome.kind === "duplicate") {
      markSessionSubmitted(idempotencyKey);
      clearDraft();
      setSubmitState({ kind: "done", outcome });
      setAnnouncement("Your brief was submitted. We'll be in touch soon.");
      return;
    }

    // An idempotency conflict means this session's cached key now belongs to
    // a *different* payload (e.g. the visitor edited an answer after a
    // partial earlier attempt) — clear it so "Try again" gets a fresh key
    // instead of colliding again. Every other outcome keeps the filled-in
    // draft (already validated above) so the visitor can retry without
    // re-entering anything.
    if (outcome.kind === "idempotency_conflict") {
      clearSubmissionSession();
    }
    setSubmitState({ kind: "error", outcome });
    setAnnouncement(outcome.message);
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

  // ── Completion screen (success / duplicate) ─────────────────────────────

  if (submitState.kind === "done") {
    const isDuplicate = submitState.outcome.kind === "duplicate";
    const reference = submitState.outcome.reference;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6" aria-live="polite">
        <span
          className="pp-check-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}
        >
          <CheckCircle2 size={28} aria-hidden="true" className="text-[hsl(var(--sm-mint-700))]" />
        </span>
        <h1 className="pp-font-display mt-5 text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))]">
          You're all set — we'll be in touch soon
        </h1>
        <p className="mt-4 text-[hsl(var(--sm-color-text-secondary))] leading-relaxed">
          {isDuplicate
            ? "This brief was already received — no need to resubmit. Our team will review your answers and reach out within 24–48 hours with a personalized scope of work and proposal."
            : "Thank you for taking the time to walk us through your project. Our team will review your answers and reach out within 24–48 hours with a personalized scope of work and proposal."}
        </p>

        {reference && (
          <div className="dv5-reference-block text-left sm:text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-secondary))]">
              Your submission reference
            </p>
            <p className="dv5-reference-value mt-1">{reference}</p>
            <p className="mt-1 text-xs text-[hsl(var(--sm-color-text-muted))]">
              Save this in case you need to reference your brief when we talk.
            </p>
          </div>
        )}

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
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[hsl(var(--sm-mint-700))]"
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

  // ── Service unavailable (flag off) — 503, distinct from a network/server
  // error: submissions genuinely are not open yet, so retrying won't help. ──

  if (submitState.kind === "error" && submitState.outcome.kind === "service_unavailable") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6" aria-live="polite">
        <h1 className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))]">
          Submissions are not open yet
        </h1>
        <p className="mt-4 text-[hsl(var(--sm-color-text-secondary))] leading-relaxed">
          We're not able to accept new project briefs through this form right now. Email us directly and we'll pick
          up where this form left off.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex h-10 items-center rounded-md px-5 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "hsl(var(--sm-mint-700))" }}
          >
            Email {SUPPORT_EMAIL}
          </a>
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
        </div>
      </div>
    );
  }

  // ── Multi-step form ──────────────────────────────────────────────────────

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <FormProvider {...form}>
      <div className="dv5-shell px-4 py-8 sm:px-6 md:py-12">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <div className="dv5-grid">
          <DiscoveryStepRail currentStep={currentStep} />

          <div className="dv5-workspace">
            <div className="dv5-mobile-progress">
              <DiscoveryProgress currentStep={currentStep} />
            </div>

            <h2
              ref={headingRef}
              tabIndex={-1}
              className="pp-font-display mb-6 text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] outline-none md:mb-4 md:text-xs md:font-semibold md:uppercase md:tracking-wide md:text-[hsl(var(--sm-color-text-secondary))]"
            >
              {STEP_LABELS[currentStep]}
            </h2>

            {currentStep < REVIEW_STEP_INDEX && (
              <DiscoveryValidationSummary
                stepPaths={STEP_FIELD_PATHS[currentStep]}
                errors={form.formState.errors}
                onFocusField={handleFocusField}
              />
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div key={currentStep} className="dv5-step-panel">
                {currentStep < REVIEW_STEP_INDEX ? (
                  <StepComponent />
                ) : (
                  <DiscoveryReview
                    values={form.getValues()}
                    onEditStep={handleEditStep}
                    onCompletePreview={handleCompletePreview}
                    submitting={submitState.kind === "submitting"}
                    errorMessage={submitState.kind === "error" ? submitState.outcome.message : undefined}
                  />
                )}
              </div>

              <DiscoveryStepNavigation
                currentStep={currentStep}
                totalSteps={TOTAL_STEPS}
                onBack={handleBack}
                onContinue={handleContinue}
                onStartOver={handleStartOver}
                className="dv5-nav"
              />
            </form>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
