/**
 * Frontend V3 — the shared service-page composition.
 *
 * Every service page explains, in order: the business problem, what SiteMint
 * builds, how it works, primary capabilities, how it connects to the rest of
 * SiteMint, who it is for, process, trust and safety, related work, and a
 * clear next action (DESIGN-SPEC.md §4). Pages supply typed content plus an
 * optional bespoke demonstration pane; the composition and rhythm stay
 * consistent across all of them.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import "@/styles/v5-pages.css";

export interface ServiceCapability {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface ServiceStep {
  title: string;
  body: string;
}

export interface ServiceRelated {
  kicker: string;
  title: string;
  desc: string;
  href: string;
}

export interface ServicePageContent {
  eyebrow: string;
  eyebrowIcon: LucideIcon;
  headline: string;
  lede: string;
  /** The business problem, stated plainly. */
  problem: { title: string; body: string };
  /** What SiteMint builds in response. */
  build: { title: string; body: string; points: string[] };
  /** How it works — a short numbered sequence. */
  how: { title: string; steps: ServiceStep[] };
  capabilities: { title: string; items: ServiceCapability[] };
  /** How this connects with the rest of SiteMint. */
  connects: { title: string; body: string; links: ServiceRelated[] };
  who: { title: string; body: string; fits: string[] };
  trust: { title: string; points: { title: string; body: string }[] };
  related: ServiceRelated[];
  cta: { title: string; body: string };
}

export function ServicePage({
  content,
  demo,
  extraSection,
}: {
  content: ServicePageContent;
  /** Bespoke demonstration pane rendered beside "what we build". */
  demo?: ReactNode;
  /**
   * An additional full-width section rendered after Capabilities and before
   * "Connects with the rest of SiteMint" — e.g. `AiSystemsV5`'s substantial
   * CRM & internal systems section (W-6). Optional; every other caller is
   * unaffected.
   */
  extraSection?: ReactNode;
}) {
  const reveal = useReveal();
  const Icon = content.eyebrowIcon;

  return (
    <div className="v3-service-page sm-v5page">
      {/* Hero — editorial, porcelain. */}
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
          <span className="v3-eyebrow reveal-fade-up">
            <Icon aria-hidden="true" size={14} />
            {content.eyebrow}
          </span>
          <h1 className="v3-display">{content.headline}</h1>
          <p className="v3-lede reveal-fade-up">{content.lede}</p>
          <div className="v3m-hero__actions reveal-scale-settle">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Build Your SiteMint System
            </Link>
          </div>
        </div>
      </section>

      {/* 1 · Problem */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3sp-two v3-reveal" ref={reveal}>
          <span className="v3m-sechead__no">01 · The problem</span>
          <div className="v3sp-two__body">
            <h2 className="v3-h2">{content.problem.title}</h2>
            <p className="v3-body">{content.problem.body}</p>
          </div>
        </div>
      </section>

      {/* 2 · What we build (+ demo) */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3m-sechead__no">02 · What we build</span>
            <h2 className="v3-h2">{content.build.title}</h2>
            <p className="v3-body">{content.build.body}</p>
            <ul className="v3m-checks">
              {content.build.points.map((point) => (
                <li key={point}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          {demo && <div className="v3m-split__media">{demo}</div>}
        </div>
      </section>

      {/* 3 · How it works */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">03 · How it works</span>
            <h2 className="v3-h2">{content.how.title}</h2>
          </div>
          <ol className="v3m-steps">
            {content.how.steps.map((step, i) => (
              <li key={step.title} className="v3m-step">
                <span className="v3m-step__no" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="v3m-step__title v3m-step__head">{step.title}</h3>
                <p className="v3m-step__body">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 · Capabilities */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">04 · Capabilities</span>
            <h2 className="v3-h2">{content.capabilities.title}</h2>
          </div>
          <div className="v3m-pillars v3m-pillars--3">
            {content.capabilities.items.map((cap) => (
              <div key={cap.title} className="v3-card v3m-pillar">
                <span className="v3m-pillar__icon">
                  <cap.icon aria-hidden="true" />
                </span>
                <h3 className="v3m-pillar__title">{cap.title}</h3>
                <p className="v3m-pillar__desc">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {extraSection}

      {/* 5 · Connects with the rest of SiteMint */}
      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">05 · One system</span>
            <h2 className="v3-h2">{content.connects.title}</h2>
            <p className="v3-lede">{content.connects.body}</p>
          </div>
          <div className="v3m-cards v3m-cards--3">
            {content.connects.links.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="v3-card v3-card--hover v3m-card-link"
              >
                <span className="v3m-card-link__kicker">{link.kicker}</span>
                <h3 className="v3m-card-link__title">{link.title}</h3>
                <p className="v3m-card-link__desc">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 6 · Who it's for */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3m-sechead__no">06 · Who it's for</span>
            <h2 className="v3-h2">{content.who.title}</h2>
            <p className="v3-body">{content.who.body}</p>
          </div>
          <div className="v3m-split__media">
            <ul className="v3m-checks">
              {content.who.fits.map((fit) => (
                <li key={fit}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{fit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 7 · Trust & safety */}
      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">07 · Trust & safety</span>
            <h2 className="v3-h2">{content.trust.title}</h2>
          </div>
          <div className="v3m-receipt">
            {content.trust.points.map((point) => (
              <div key={point.title} className="v3m-receipt__row">
                <span className="v3m-receipt__k">{point.title}</span>
                <span className="v3m-receipt__v">{point.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8 · Related */}
      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">08 · Related</span>
            <h2 className="v3-h2">See it in the wild.</h2>
          </div>
          <div className="v3m-cards v3m-cards--2">
            {content.related.map((rel) => (
              <Link
                key={rel.title}
                href={rel.href}
                className="v3-card v3-card--hover v3m-card-link"
              >
                <span className="v3m-card-link__kicker">{rel.kicker}</span>
                <h3 className="v3m-card-link__title">{rel.title}</h3>
                <p className="v3m-card-link__desc">{rel.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 9 · Next action */}
      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display">{content.cta.title}</h2>
          <p className="v3-lede">{content.cta.body}</p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Build Your SiteMint System
            </Link>
            <Link href={ROUTES.workV3} className="v3-btn v3-btn--outline">
              See our work
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ServicePage;
