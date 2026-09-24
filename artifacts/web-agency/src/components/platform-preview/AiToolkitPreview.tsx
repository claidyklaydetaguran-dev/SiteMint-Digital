import { FileText, Lightbulb, MessagesSquare, Network, Workflow } from "lucide-react";
import { CapabilityBadge } from "./CapabilityBadge";

/**
 * Replaces the earlier decorative "AI Toolkit supports every stage" strip
 * (Checkpoint 2A.1) with an honest preview (Checkpoint 2A.2 Part 4).
 * AI Toolkit is a real, deployed, standalone app (own checkout) but has no
 * customer login/account of any kind (artifacts/ai-toolkit/src/App.tsx
 * registers only `/`, `/thank-you`, `/cancel`) and no entry point from the
 * main site — so it is labeled "In development" as a *customer product*
 * here, matching ProductsSection's per-product badge for the same reason.
 *
 * Checkpoint 2A.3: the heading previously read "AI Toolkit — conceptual
 * direction" while the badge beside it read "In development" — two
 * different-sounding readiness words for the same fact. Now both say the
 * same thing ("In development"), with "product preview" naming what this
 * panel actually is. The five items below remain individually unlabeled
 * (no per-item badge) since they're one unambiguous readiness level, not
 * five separate claims — adding five more badges here would be exactly the
 * "badge overload" this checkpoint's restraint requirement warns against.
 * Never presented as shipped capabilities; carries no Sign In / Launch App
 * action, no "Available now" label, and no dashboard/integration/analytics
 * implication.
 */
const conceptualCapabilities = [
  { label: "Content assistance", icon: FileText },
  { label: "Workflow suggestions", icon: Workflow },
  { label: "Business prompt tools", icon: MessagesSquare },
  { label: "System planning", icon: Network },
  { label: "Structured automation guidance", icon: Lightbulb },
];

export function AiToolkitPreview() {
  return (
    <div className="rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-muted))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">AI Toolkit — product preview</h3>
        <CapabilityBadge level="in-development" />
      </div>
      <p className="mt-1.5 text-xs text-[hsl(var(--sm-color-text-muted))]">
        Not yet a generally available customer product. The directions below are under
        consideration, not shipped features.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {conceptualCapabilities.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.label}
              className="flex flex-col items-center gap-2 rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3 text-center"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
                <Icon size={14} aria-hidden="true" />
              </span>
              <span className="text-[11px] leading-snug text-[hsl(var(--sm-color-text-secondary))]">{item.label}</span>
            </li>
          );
        })}
      </ul>

      <span
        aria-disabled="true"
        className="mt-4 inline-flex w-fit items-center rounded-[var(--sm-radius-pill)] border border-dashed border-[hsl(var(--sm-color-border-strong))] px-4 py-2 text-xs font-medium text-[hsl(var(--sm-color-text-muted))]"
      >
        Explore the product direction
      </span>
    </div>
  );
}
