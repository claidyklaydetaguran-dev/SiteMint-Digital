import { FileText, Lightbulb, MessagesSquare, Network, Workflow } from "lucide-react";
import { CapabilityBadge } from "./CapabilityBadge";

/**
 * Replaces the earlier decorative "AI Toolkit supports every stage" strip
 * (Checkpoint 2A.1) with an honest preview (Checkpoint 2A.2 Part 4).
 * AI Toolkit is a real, deployed, standalone app (own checkout) but has no
 * customer login/account of any kind (artifacts/ai-toolkit/src/App.tsx
 * registers only `/`, `/thank-you`, `/cancel`) and no entry point from the
 * main site — so it is labeled "In development" as a *customer product*
 * here, distinct from ProductsSection's per-product badge which now uses
 * the same label. The five items below are conceptual direction only, all
 * grounded in existing platform documentation (AI Toolkit's product
 * category, the shared automation/systems positioning) — never presented
 * as shipped capabilities, and carry no Sign In / Launch App action.
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
        <h3 className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">AI Toolkit — conceptual direction</h3>
        <CapabilityBadge level="in-development" />
      </div>
      <p className="mt-1.5 text-xs text-[hsl(var(--sm-color-text-muted))]">
        Not yet a generally available customer product. These are directions under
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
              <Icon size={16} aria-hidden="true" className="text-[hsl(var(--sm-color-text-muted))]" />
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
