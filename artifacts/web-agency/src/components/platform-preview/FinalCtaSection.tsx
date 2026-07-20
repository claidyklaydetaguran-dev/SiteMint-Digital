import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";

export function FinalCtaSection() {
  return (
    <section aria-labelledby="pp-final-cta-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-3xl rounded-[var(--sm-radius-xl)] bg-[hsl(var(--sm-color-bg-inverse))] px-8 py-14 text-center shadow-[var(--sm-shadow-lg)] md:px-16 md:py-20">
        <h2 id="pp-final-cta-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-inverse))] md:text-4xl">
          Your business deserves more than disconnected software.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-[hsl(var(--sm-color-text-inverse-secondary))]">
          Let's build a website, product, and system that actually work together.
        </p>
        <Link
          href={startProjectHref}
          className="mt-8 inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] px-7 py-3.5 text-sm font-semibold text-[var(--sm-button-accent-text)] shadow-[var(--sm-shadow-glow-subtle)] transition-transform hover:-translate-y-0.5"
        >
          Build Your SiteMint System
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
