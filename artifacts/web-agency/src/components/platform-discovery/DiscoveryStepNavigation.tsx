import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface DiscoveryStepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
  onStartOver: () => void;
}

export function DiscoveryStepNavigation({
  currentStep,
  totalSteps,
  onBack,
  onContinue,
  onStartOver,
}: DiscoveryStepNavigationProps) {
  const isFirstStep = currentStep === 0;
  const isReviewStep = currentStep === totalSteps - 1;

  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button type="button" variant="ghost" onClick={onStartOver}>
        Start Over
      </Button>
      <div className="flex gap-3">
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
