import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { CapabilityBadge } from "./CapabilityBadge";
import { servicesDetail, type ServiceDetail } from "./servicesDetail";
import { startProjectHref } from "./navConfig";

/**
 * Required living-site interaction (hover + keyboard-focus): slight lift,
 * mint border glow, icon gradient shift, related-capability reveal — all
 * `transform`/`opacity`/color transitions, no layout-shifting reflow.
 * `group-focus-within` covers keyboard users tabbing into the card's link.
 */
export function ServiceDetailCard({ service }: { service: ServiceDetail }) {
  const Icon = service.icon;
  const related = service.relatedIds
    .map((id) => servicesDetail.find((s) => s.id === id))
    .filter((s): s is ServiceDetail => Boolean(s));

  return (
    <article
      tabIndex={-1}
      className="group relative flex flex-col rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[hsl(var(--sm-mint-500))] hover:shadow-[var(--sm-shadow-glow-subtle)] focus-within:-translate-y-1 focus-within:border-[hsl(var(--sm-mint-500))] focus-within:shadow-[var(--sm-shadow-glow-subtle)]"
    >
      <div className="mb-5 flex items-center justify-between">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-[var(--sm-radius-md)] text-[hsl(var(--sm-color-action-primary))] transition-all duration-300 group-hover:text-[hsl(160_30%_12%)] group-focus-within:text-[hsl(160_30%_12%)]"
          style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}
          data-icon-chip
        >
          <span className="pp-icon-chip flex h-full w-full items-center justify-center rounded-[var(--sm-radius-md)] transition-all duration-300 group-hover:bg-[linear-gradient(135deg,hsl(var(--sm-mint-500)),hsl(var(--sm-mint-300)))] group-focus-within:bg-[linear-gradient(135deg,hsl(var(--sm-mint-500)),hsl(var(--sm-mint-300)))]">
            <Icon size={20} aria-hidden="true" />
          </span>
        </span>
        <CapabilityBadge level={service.capability} />
      </div>

      <h3 className="pp-font-display text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]">{service.name}</h3>
      <p className="mt-2 text-sm font-medium text-[hsl(var(--sm-color-action-primary))]">{service.problem}</p>
      <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{service.build}</p>
      <p className="mt-3 text-xs text-[hsl(var(--sm-color-text-muted))]">
        <span className="font-semibold text-[hsl(var(--sm-color-text-secondary))]">Best for: </span>
        {service.bestFor}
      </p>

      <ul className="mt-4 flex flex-col gap-1.5">
        {service.outcomes.map((outcome) => (
          <li key={outcome} className="flex items-start gap-2 text-xs text-[hsl(var(--sm-color-text-secondary))]">
            <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--sm-mint-500))]" />
            {outcome}
          </li>
        ))}
      </ul>

      {/* Related-capability reveal — no layout shift: max-height/opacity only,
          revealed on hover/keyboard-focus. */}
      {related.length > 0 && (
        <div className="pp-related-reveal mt-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:mt-4 group-hover:max-h-24 group-hover:opacity-100 group-focus-within:mt-4 group-focus-within:max-h-24 group-focus-within:opacity-100" style={{ maxHeight: 0 }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Related capabilities</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {related.map((item) => (
              <span key={item.id} className="rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-surface-muted))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--sm-color-text-secondary))]">
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />

      <Link
        href={startProjectHref}
        className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] transition-colors hover:underline"
      >
        Start a project like this
        <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </article>
  );
}
