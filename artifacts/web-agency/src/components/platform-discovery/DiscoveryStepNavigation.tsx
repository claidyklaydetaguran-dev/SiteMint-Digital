import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoveryStepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
  onStartOver: () => void;
  /** Extra classes on the outer row — the shell uses this to apply the mobile sticky-footer treatment. */
  className?: string;
}

export function DiscoveryStepNavigation({
  currentStep,
  totalSteps,
  onBack,
  onContinue,
  onStartOver,
  className,
}: DiscoveryStepNavigationProps) {
  const isFirstStep = currentStep === 0;
  const isReviewStep = currentStep === totalSteps - 1;

  return (
    <div className={cn("flex items-center justify-between gap-2 sm:gap-3", className)}>
      <Button type="button" variant="ghost" size="sm" onClick={onStartOver} className="shrink-0 text-sm">
        Start Over
      </Button>
      <div className="flex shrink-0 gap-2 sm:gap-3">
        {!isFirstStep && (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft />
            Back
          </Button>
        )}
        {!isReviewStep && (
          <Button type="button" className="pp-btn pp-btn-primary" onClick={onContinue}>
            Continue
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
