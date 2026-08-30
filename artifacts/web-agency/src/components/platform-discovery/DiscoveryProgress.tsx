import { cn } from "@/lib/utils";

export const STEP_LABELS = [
  "Project Direction",
  "Business and Audience",
  "Current Situation and Goals",
  "Features and Project Scope",
  "Content, Design, and Technical Readiness",
  "Timeline, Investment, and Decision Process",
  "Contact and Consent",
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
                  "block h-1.5 rounded-full transition-all duration-500",
                  isCurrent || isComplete
                    ? "bg-[hsl(var(--sm-mint-500))]"
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
