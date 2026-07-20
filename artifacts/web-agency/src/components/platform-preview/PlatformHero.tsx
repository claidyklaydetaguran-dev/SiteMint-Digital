import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";
import { BusinessGoalSelector } from "./BusinessGoalSelector";
import { HeroSystemCanvas } from "./HeroSystemCanvas";

/**
 * Checkpoint 2A.4 Part 1/2: editorial two-column hero, not centered text
 * over empty space. The living system canvas sits beside the headline on
 * desktop (above the fold, not a scroll away), and the business-goal
 * selector is integrated into the copy column instead of a separate boxed
 * card section. Mobile stacks headline → CTAs → goal selector → simplified
 * vertical canvas, per Part 1's mobile requirements.
 *
 * CTA hierarchy (Part 2): primary "Build Your SiteMint System" connects to
 * the real Discovery flow; secondary "Explore How It Works" reveals the
 * connected-system explanation below. "Start a Project" remains the
 * navigation's own CTA (PlatformPreviewNavbar, unchanged).
 */
export function PlatformHero() {
  return (
    <section aria-labelledby="pp-hero-heading" className="relative overflow-hidden px-4 pb-16 pt-14 md:px-8 md:pb-20 md:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
        style={{
          background:
            "radial-gradient(circle at 15% -10%, hsl(var(--sm-mint-100) / 0.9), transparent 55%), radial-gradient(circle at 90% 10%, hsl(var(--sm-mint-100) / 0.5), transparent 45%)",
        }}
      />
      {/* Restrained architectural grid — fine linework only, no gimmick. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--sm-color-border-subtle)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--sm-color-border-subtle)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <p className="mb-5 inline-flex items-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
            SiteMint Digital — a connected technology company
          </p>

          <h1
            id="pp-hero-heading"
            className="pp-font-display max-w-xl text-4xl font-semibold leading-[1.08] text-[hsl(var(--sm-color-text-primary))] sm:text-5xl md:text-[3.4rem]"
          >
            Build smarter. Operate faster. Grow with SiteMint.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))] md:text-lg">
            Intelligent websites, AI-powered customer experiences, and connected business
            systems designed to help companies attract leads, automate work, and grow.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startProjectHref}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-6 py-3 text-sm font-semibold text-[var(--sm-button-primary-text)] shadow-[var(--sm-shadow-md)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
            >
              Build Your SiteMint System
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a
              href="#pp-ecosystem"
              className="inline-flex items-center justify-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-strong))] px-6 py-3 text-sm font-semibold text-[hsl(var(--sm-color-text-primary))] transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
            >
              Explore How It Works
            </a>
          </div>

          <div className="mt-10 max-w-md rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-subtle))] bg-[hsl(var(--sm-color-bg-subtle))] p-5">
            <BusinessGoalSelector />
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroSystemCanvas />
        </div>
      </div>
    </section>
  );
}
