/**
 * Frontend V3 — About page. Company facts only; no invented team bios,
 * awards, or history.
 */

import { Link } from "wouter";
import { ShieldCheck, Wrench, Compass, HandMetal } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { teamV5 } from "@/components/v5/teamV5";
import { usePageMeta } from "@/hooks/usePageMeta";
import "@/styles/v5-pages.css";

export default function AboutV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "Company — SiteMint Digital",
    description: "A studio that builds like an operator — what we believe, how we're organized, and the people doing the work.",
  });

  return (
    <div className="v3-about-page sm-v5page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
          <span className="v3-eyebrow reveal-fade-up">About</span>
          {/* Headline is the hero LCP text — left static (no mask-reveal) so
              first paint isn't delayed; eyebrow/lede/visual carry the motion. */}
          <h1 className="v3-display">
            A studio that builds like an operator.
          </h1>
          <p className="v3-lede reveal-fade-up">
            We run our own version of everything we sell. The discovery flow
            on this site is the same structured intake we build for clients.
            The automation and CRM we recommend runs our own pipeline. Our AI
            Receptionist product is in private, invite-only beta. We use what
            we build, which keeps us honest about what works and what's still
            in progress.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">00</span>
            <h2 className="v3-h2 reveal-clip">The people doing the work.</h2>
            <p className="v3-lede reveal-fade-up">
              SiteMint designs and builds connected digital systems —
              websites, web applications, CRM tools, automation, and AI
              products — that capture opportunities, organize operations, and
              move work toward the next meaningful action. These are the
              roles that make that happen, and the names attached to them
              today.
            </p>
          </div>
          <div className="v3m-pillars v3m-pillars--3">
            {teamV5.map((member) => (
              <div className="v3-card v3m-pillar reveal-scale-settle" key={member.name}>
                <h3 className="v3m-pillar__title">{member.name}</h3>
                <p className="v3m-pillar__desc">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">01</span>
            <h2 className="v3-h2 reveal-clip">What we believe.</h2>
          </div>
          <div className="v3m-pillars v3m-pillars--4">
            <div className="v3-card v3m-pillar reveal-scale-settle">
              <span className="v3m-pillar__icon">
                <Compass aria-hidden="true" />
              </span>
              <h3 className="v3m-pillar__title">Systems over tools</h3>
              <p className="v3m-pillar__desc">
                Another disconnected app makes a business slower. We build
                connections, not collections.
              </p>
            </div>
            <div className="v3-card v3m-pillar reveal-scale-settle">
              <span className="v3m-pillar__icon">
                <Wrench aria-hidden="true" />
              </span>
              <h3 className="v3m-pillar__title">Working software early</h3>
              <p className="v3m-pillar__desc">
                Visible progress beats polished promises. You use the system
                while it's being built.
              </p>
            </div>
            <div className="v3-card v3m-pillar reveal-scale-settle">
              <span className="v3m-pillar__icon">
                <HandMetal aria-hidden="true" />
              </span>
              <h3 className="v3m-pillar__title">People stay in charge</h3>
              <p className="v3m-pillar__desc">
                AI does the immediate work; humans make the calls that matter.
                Every automation has an off switch.
              </p>
            </div>
            <div className="v3-card v3m-pillar reveal-scale-settle">
              <span className="v3m-pillar__icon">
                <ShieldCheck aria-hidden="true" />
              </span>
              <h3 className="v3m-pillar__title">Honesty as a feature</h3>
              <p className="v3m-pillar__desc">
                No invented numbers, no borrowed logos, no capabilities we
                haven't shipped. This page included.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy reveal-h-left">
            <span className="v3-eyebrow">How we're organized</span>
            <h2 className="v3-h2 reveal-clip">Direct access, by design.</h2>
            <p className="v3-body reveal-fade-up">
              SiteMint is a focused team, not a layered agency. The people who
              design your system are the people who build it and the people who
              answer when something needs attention. That's only possible
              because our own operations run on the automation we sell.
            </p>
          </div>
          <div className="v3m-split__media">
            <div className="v3m-receipt reveal-scale-settle">
              <div className="v3m-receipt__row">
                <span className="v3m-receipt__k">What SiteMint builds</span>
                <span className="v3m-receipt__v">
                  Connected digital systems — websites, web applications, CRM
                  tools, automation, and AI products — that capture
                  opportunities, organize operations, and move work toward the
                  next meaningful action.
                </span>
              </div>
              <div className="v3m-receipt__row">
                <span className="v3m-receipt__k">What that means for you</span>
                <span className="v3m-receipt__v">
                  Direct access to the people doing the work — no account-manager
                  telephone game.
                </span>
              </div>
              <div className="v3m-receipt__row">
                <span className="v3m-receipt__k">And what it doesn't</span>
                <span className="v3m-receipt__v">
                  We take on a limited number of systems at a time, and we say
                  so when we're full.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display reveal-clip">See if we're the right fit.</h2>
          <p className="v3-lede reveal-fade-up">
            The fastest way to find out is a discovery brief — and a straight
            answer.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary reveal-fade-up">
              Build Your SiteMint System
            </Link>
            <Link href={ROUTES.workV3} className="v3-btn v3-btn--outline reveal-fade-up">
              Inspect our work first
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
