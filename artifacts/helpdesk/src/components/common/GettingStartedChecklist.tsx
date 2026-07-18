import { Link } from "wouter";
import { X, CheckCircle2, ChevronRight } from "lucide-react";

export interface ChecklistStep {
  label: string;
  done: boolean;
  href: string;
}

interface GettingStartedChecklistProps {
  title: string;
  steps: ChecklistStep[];
  onDismiss: () => void;
}

/** Dismissible onboarding checklist — only rendered while steps remain incomplete. */
export function GettingStartedChecklist({ title, steps, onDismiss }: GettingStartedChecklistProps) {
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doneCount} of {steps.length} steps completed
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Dismiss setup checklist"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-1">
        {steps.map((step) => (
          <Link key={step.label} href={step.href}>
            <div
              className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-card/60 transition-colors ${
                step.done ? "opacity-55" : ""
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                  step.done ? "bg-success border-success" : "border-border bg-card"
                }`}
              >
                {step.done && <CheckCircle2 className="h-3 w-3 text-success-foreground" aria-hidden="true" />}
              </div>
              <span
                className={`text-xs leading-snug ${
                  step.done ? "text-muted-foreground line-through" : "text-foreground font-medium"
                }`}
              >
                {step.label}
              </span>
              {!step.done && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" aria-hidden="true" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
