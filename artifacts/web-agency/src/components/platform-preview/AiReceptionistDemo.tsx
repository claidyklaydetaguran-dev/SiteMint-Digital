import { CheckCircle2, MessageSquareText, User } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { receptionistDemoScenarios, defaultReceptionistDemoScenarioId } from "./receptionistDemoScenarios";
import { CapabilityBadge } from "./CapabilityBadge";

/**
 * Compact, clearly synthetic demonstration (Checkpoint 2A.2 Part 3) — not a
 * live call, not a real provider connection, no microphone, no fake "live"
 * indicator. Updates via the shared business-goal selection
 * (PlatformPreviewGoalContext) rather than a second selector, per Part 7's
 * data-driven-architecture requirement.
 */
export function AiReceptionistDemo() {
  const { selectedGoal } = useSelectedGoal();
  const scenario =
    receptionistDemoScenarios[selectedGoal.demoScenarioId] ??
    receptionistDemoScenarios[defaultReceptionistDemoScenarioId];

  return (
    <div className="mt-6 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-muted))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-surface-default))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
          Interactive demonstration — example customer journey
        </span>
        <span className="text-[11px] font-medium text-[hsl(var(--sm-color-text-muted))]">{scenario.scenarioLabel}</span>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
          <MessageSquareText size={15} aria-hidden="true" />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-[hsl(var(--sm-color-text-primary))]">Incoming customer inquiry ({scenario.inquiry.channel})</p>
          <p className="mt-1 text-[hsl(var(--sm-color-text-secondary))]">
            <span className="inline-flex items-center gap-1 font-medium">
              <User size={12} aria-hidden="true" /> {scenario.inquiry.name}
            </span>
            {" — "}
            {scenario.inquiry.reason}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Captured</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {scenario.capturedFields.map((field) => (
              <li key={field} className="flex items-center gap-1.5 text-xs text-[hsl(var(--sm-color-text-secondary))]">
                <CheckCircle2 size={12} aria-hidden="true" className="text-[hsl(var(--sm-color-status-success))]" />
                {field}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Next action</p>
          <p className="mt-1.5 text-xs text-[hsl(var(--sm-color-text-secondary))]">{scenario.nextAction}</p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[hsl(var(--sm-color-text-muted))]">
        <li className="inline-flex items-center gap-1.5">
          SMS intake <CapabilityBadge level={scenario.smsCapability} />
        </li>
        <li className="inline-flex items-center gap-1.5">
          Voice <CapabilityBadge level={scenario.voiceCapability} />
        </li>
        <li className="inline-flex items-center gap-1.5">
          Automated CRM follow-up <CapabilityBadge level={scenario.crmFollowupCapability} />
        </li>
      </ul>
    </div>
  );
}
