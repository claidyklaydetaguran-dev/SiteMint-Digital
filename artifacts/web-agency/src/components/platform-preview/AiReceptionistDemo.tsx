import { CheckCircle2, MessageSquareText, User } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { receptionistDemoScenarios, defaultReceptionistDemoScenarioId } from "./receptionistDemoScenarios";

/**
 * Compact, clearly synthetic demonstration (Checkpoint 2A.2 Part 3) — not a
 * live call, not a real provider connection, no microphone, no fake "live"
 * indicator, no real customer record, no implied automatic appointment
 * completion or production CRM sync. Updates via the shared business-goal
 * selection (PlatformPreviewGoalContext) rather than a second selector, per
 * Part 7's data-driven-architecture requirement.
 *
 * Checkpoint 2A.3: the per-channel SMS/Voice/CRM-follow-up readiness
 * breakdown now lives once, in ProductsSection's `receptionistReadiness`
 * list directly above this panel (same card) — not repeated here, per the
 * status-badge-restraint requirement ("no repeated identical readiness
 * label within the same compact card").
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

      <p className="mt-3 text-[11px] leading-snug text-[hsl(var(--sm-color-text-muted))]">
        Synthetic example, not a live conversation — no real call, provider connection, or
        customer record. See the readiness breakdown above for what's live today.
      </p>
    </div>
  );
}
