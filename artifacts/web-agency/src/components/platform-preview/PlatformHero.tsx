import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";

export function PlatformHero() {
  return (
    <section aria-labelledby="pp-hero-heading" className="relative overflow-hidden px-4 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            "radial-gradient(circle at 50% -10%, hsl(var(--sm-mint-100) / 0.9), transparent 60%)",
        }}
      />

      <div className="mx-auto flex max-w-[1280px] flex-col items-center text-center">
        <p className="mb-5 inline-flex items-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
          SiteMint Digital — a connected technology company
        </p>

        <h1
          id="pp-hero-heading"
          className="pp-font-display max-w-4xl text-4xl font-semibold leading-[1.1] text-[hsl(var(--sm-color-text-primary))] sm:text-5xl md:text-6xl"
        >
          Build smarter. Operate faster. Grow with SiteMint.
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))] md:text-lg">
          Intelligent websites, AI-powered customer experiences, and connected business
          systems designed to help companies attract leads, automate work, and grow.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <a
            href="#pp-ecosystem"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-6 py-3 text-sm font-semibold text-[var(--sm-button-primary-text)] shadow-[var(--sm-shadow-md)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
          >
            Explore SiteMint
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <Link
            href={startProjectHref}
            className="inline-flex items-center justify-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-strong))] px-6 py-3 text-sm font-semibold text-[hsl(var(--sm-color-text-primary))] transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
          >
            Start a Project
          </Link>
        </div>
      </div>
    </section>
  );
}
