import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { startProjectHref } from "./navConfig";

/**
 * Checkpoint 2A.4 Part 11/12: previously used --sm-color-bg-inverse, which
 * flips to near-white in dark theme (that token is designed for "inverse
 * of the current surface," not "always dark") — producing a jarring stark
 * white card on an otherwise deep-charcoal page. This panel is now a fixed
 * deep evergreen-charcoal gradient in both themes, with a fixed light text
 * color, so it never inverts — the one moment on the page allowed to stay
 * visually constant regardless of theme, similar in spirit to the AI
 * Receptionist demo's fixed "always dark chrome" precedent elsewhere in
 * the platform (root CLAUDE.md's CRM shell note).
 */
export function FinalCtaSection() {
  return (
    <section aria-labelledby="pp-final-cta-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-[var(--sm-radius-xl)] px-8 py-14 text-center shadow-[var(--sm-shadow-lg)] md:px-16 md:py-20"
        style={{ background: "linear-gradient(160deg, hsl(160 30% 11%), hsl(160 40% 7%))" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, hsl(var(--sm-mint-500) / 0.14), transparent 45%), radial-gradient(circle at 85% 85%, hsl(var(--sm-mint-500) / 0.10), transparent 50%)",
          }}
        />
        <h2 id="pp-final-cta-heading" className="pp-font-display relative text-3xl font-semibold md:text-4xl" style={{ color: "hsl(150 20% 94%)" }}>
          Your business deserves more than disconnected software.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base" style={{ color: "hsl(150 12% 78%)" }}>
          Let's build a website, product, and system that actually work together.
        </p>
        <Link
          href={startProjectHref}
          className="relative mt-8 inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] px-7 py-3.5 text-sm font-semibold text-[var(--sm-button-accent-text)] shadow-[var(--sm-shadow-glow-subtle)] transition-transform hover:-translate-y-0.5"
        >
          Build Your SiteMint System
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
