import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";
import { BusinessGoalSelector } from "./BusinessGoalSelector";
import { HeroSystemCanvas } from "./HeroSystemCanvas";
import { HeroAuroraNetwork } from "./HeroAuroraNetwork";

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
      <HeroAuroraNetwork />

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="pp-reveal">
          <p
            className="mb-5 inline-flex items-center rounded-[var(--sm-radius-pill)] border px-4 py-1.5 text-xs font-medium uppercase tracking-wide"
            style={{ borderColor: "hsl(150 20% 90% / 0.25)", backgroundColor: "hsl(150 20% 94% / 0.08)", color: "hsl(150 20% 90%)" }}
          >
            SiteMint Digital — a connected technology company
          </p>

          <h1
            id="pp-hero-heading"
            className="pp-font-display max-w-xl text-4xl font-semibold leading-[1.08] sm:text-5xl md:text-[3.4rem]"
            style={{ color: "hsl(150 20% 97%)" }}
          >
            Build smarter. Operate faster. Grow with SiteMint.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed md:text-lg" style={{ color: "hsl(150 12% 82%)" }}>
            Intelligent websites, AI-powered customer experiences, and connected business
            systems designed to help companies attract leads, automate work, and grow.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startProjectHref}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] px-6 py-3 text-sm font-semibold text-[var(--sm-button-accent-text)] shadow-[var(--sm-shadow-glow-subtle)] transition-transform hover:-translate-y-0.5"
            >
              Build Your SiteMint System
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a
              href="#pp-ecosystem"
              className="inline-flex items-center justify-center rounded-[var(--sm-radius-pill)] border px-6 py-3 text-sm font-semibold transition-colors hover:bg-[hsl(150_20%_94%/0.08)]"
              style={{ borderColor: "hsl(150 20% 90% / 0.35)", color: "hsl(150 20% 94%)" }}
            >
              Explore How It Works
            </a>
          </div>

          <div
            className="mt-10 max-w-md rounded-[var(--sm-radius-lg)] border p-5 shadow-[var(--sm-shadow-lg)] backdrop-blur-md"
            style={{ borderColor: "hsl(var(--sm-color-border-default))", backgroundColor: "hsl(var(--sm-color-bg-elevated) / 0.94)" }}
          >
            <BusinessGoalSelector />
          </div>
        </div>

        <div className="pp-reveal flex justify-center lg:justify-end" style={{ animationDelay: "120ms" }}>
          <HeroSystemCanvas />
        </div>
      </div>
    </section>
  );
}
