import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, ChevronDown, Sparkles, X } from "lucide-react";
import { startProjectHref } from "./navConfig";
import type { PricingTier } from "./pricingTiers";

/**
 * Recommended-tier visual treatment (mint border/glow + badge) and an
 * expandable "what's not included" section, following the same
 * button-driven expand/collapse pattern ProcessSection uses elsewhere in
 * this preview rather than inventing a second accordion primitive.
 */
export function PricingTierCard({ tier }: { tier: PricingTier }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="relative flex flex-col rounded-[var(--sm-radius-xl)] border p-7 transition-all duration-300"
      style={{
        borderColor: tier.recommended ? "hsl(var(--sm-mint-500))" : "hsl(var(--sm-color-border-default))",
        backgroundColor: "hsl(var(--sm-color-surface-default))",
        boxShadow: tier.recommended ? "var(--sm-shadow-glow-subtle)" : "var(--sm-shadow-sm)",
      }}
    >
      {tier.recommended && (
        <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--sm-button-accent-text)]">
          <Sparkles size={11} aria-hidden="true" />
          Most popular
        </span>
      )}

      <h3 className="pp-font-display text-xl font-semibold text-[hsl(var(--sm-color-text-primary))]">{tier.name}</h3>
      <p className="mt-1.5 text-sm text-[hsl(var(--sm-color-text-secondary))]">{tier.tagline}</p>
      <p className="mt-4 text-lg font-semibold text-[hsl(var(--sm-color-action-primary))]">{tier.priceFrom}</p>
      <p className="mt-3 text-xs leading-relaxed text-[hsl(var(--sm-color-text-muted))]">{tier.bestFor}</p>

      <ul className="mt-5 flex flex-col gap-2">
        {tier.includes.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">
            <Check size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-[hsl(var(--sm-mint-500))]" />
            {item}
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--sm-color-text-muted))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]"
      >
        What's not included
        <ChevronDown size={13} aria-hidden="true" className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {expanded && (
        <ul className="mt-2 flex flex-col gap-2">
          {tier.notIncluded.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-[hsl(var(--sm-color-text-muted))]">
              <X size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />

      <Link
        href={startProjectHref}
        className="mt-6 inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] px-5 py-2.5 text-sm font-semibold transition-colors"
        style={
          tier.recommended
            ? { backgroundColor: "var(--sm-button-accent-background)", color: "var(--sm-button-accent-text)" }
            : { backgroundColor: "var(--sm-button-primary-background)", color: "var(--sm-button-primary-text)" }
        }
      >
        Start Your Project
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
