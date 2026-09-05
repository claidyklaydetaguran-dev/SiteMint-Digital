import { cn } from "@/lib/utils";

// Checkpoint 2C.3 — owner-directed intake reorganization (8 narrative steps
// + review, replacing the prior 7 + review). Indexed identically to
// STEP_FIELD_PATHS (discoveryFormModel.ts) and STEP_WHY_COPY
// (discoveryStepCopy.ts): index 0-7 are the eight answer steps, index 8 is
// the review step.
export const STEP_LABELS = [
  "Project Starting Point",
  "System or Service Needed",
  "Business and Audience",
  "Brand and Visual Direction",
  "Content and Functionality",
  "Systems and Integrations",
  "Growth, Advertising, and Tracking",
  "Delivery, Budget, and Contact",
  "Review",
] as const;

export const TOTAL_STEPS = STEP_LABELS.length;

interface DiscoveryProgressProps {
  currentStep: number;
}

export function DiscoveryProgress({ currentStep }: DiscoveryProgressProps) {
  return (
    <nav aria-label="Guided project form progress" className="mb-8">
      <p className="text-sm font-medium text-[hsl(var(--sm-color-text-secondary))] mb-2">
        Step {currentStep + 1} of {TOTAL_STEPS}: {STEP_LABELS[currentStep]}
      </p>
      <ol className="flex w-full gap-1.5">
        {STEP_LABELS.map((label, index) => {
          const isCurrent = index === currentStep;
          const isComplete = index < currentStep;
          return (
            <li
              key={label}
              className="flex-1"
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300",
                  isCurrent || isComplete
                    ? "bg-[hsl(var(--sm-mint-700))]"
                    : "bg-[hsl(var(--sm-color-border-default))]",
                )}
              />
              <span className="sr-only">
                {label}
                {isCurrent ? " (current step)" : isComplete ? " (completed)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
