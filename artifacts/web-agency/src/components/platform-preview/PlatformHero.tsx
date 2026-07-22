import { Link } from "wouter";
import { ArrowRight, Bot, Globe, LayoutTemplate, LineChart } from "lucide-react";
import { startProjectHref, workHref } from "./navConfig";
import { HeroDeviceComposition } from "./HeroDeviceComposition";
import { HeroAuroraNetwork } from "./HeroAuroraNetwork";

/**
 * Frontend Epic 1 visual redesign V2 — complete hero rebuild on a fixed
 * light-mint palette (owner rejected the prior dark, washed-out version).
 * ~42/58 content/visual split on desktop. BusinessGoalSelector was removed
 * from this file entirely (owner feedback: "priority selector clutters the
 * hero") — it now lives in its own PostHeroGoalSection immediately after
 * this one. The prior HeroSystemCanvas (a small bordered icon-list card,
 * not a real device composition) is replaced by HeroDeviceComposition, an
 * original illustrative laptop/tablet/phone SiteMint system diagram.
 *
 * Mobile order (owner-specified, §9): eyebrow → headline → supporting copy
 * → primary CTA → secondary CTA → honest capability proof row → device
 * composition last. Achieved with a single DOM order (no reordering
 * classes needed) since HeroDeviceComposition is already the last child.
 */
const microProof = [
  { label: "Websites", icon: Globe },
  { label: "CRM", icon: Bot },
  { label: "Automation", icon: LineChart },
  { label: "AI Systems", icon: LayoutTemplate },
];

export function PlatformHero() {
  return (
    <section aria-labelledby="pp-hero-heading" className="relative overflow-hidden px-4 pb-14 pt-14 md:px-8 md:pb-20 md:pt-20">
      <HeroAuroraNetwork />

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-[0.42fr_0.58fr] lg:gap-10">
        <div className="pp-reveal">
          <p
            className="mb-5 inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] border px-4 py-1.5 text-xs font-medium uppercase tracking-wide"
            style={{ borderColor: "hsl(var(--pp-mint-mist))", backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-mint-deep))" }}
          >
            <span className="pp-status-dot" aria-hidden="true" />
            <span>
              SiteMint Digital — a connected technology company
              <span className="sr-only"> — systems active and connected</span>
            </span>
          </p>

          <h1
            id="pp-hero-heading"
            className="pp-font-display max-w-xl text-4xl font-semibold leading-[1.08] sm:text-5xl md:text-[3.4rem]"
            style={{ color: "hsl(var(--pp-forest-deep))" }}
          >
            AI-Powered Websites &amp; Business Systems That Help You Get More Customers
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed md:text-lg" style={{ color: "hsl(var(--pp-forest-slate))" }}>
            Custom websites, CRM systems, business automation, and AI-powered customer
            communication — connected together so leads get captured, followed up, and
            turned into customers.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startProjectHref}
              className="pp-btn pp-btn-primary group inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold"
            >
              Start Your Project
              <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={workHref}
              className="pp-btn pp-btn-secondary inline-flex items-center justify-center rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold"
            >
              View Our Work
            </Link>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2" aria-label="What SiteMint builds">
            {microProof.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "hsl(var(--pp-forest-slate))" }}>
                  <Icon size={14} aria-hidden="true" style={{ color: "hsl(var(--pp-mint-deep))" }} />
                  {item.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="pp-reveal" style={{ animationDelay: "120ms" }}>
          <HeroDeviceComposition />
        </div>
      </div>
    </section>
  );
}
