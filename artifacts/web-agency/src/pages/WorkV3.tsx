/**
 * Frontend V3 — Selected work.
 *
 * Honesty rule: no invented clients, results, or testimonials. The page leads
 * with the systems SiteMint genuinely builds and operates, and labels
 * capability compositions as exactly that.
 */

import { Link } from "wouter";
import { ArrowRight, AudioLines, Search, Workflow, Globe } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { capabilityLabelsV5 } from "@/components/v5/capabilityLabelsV5";
import { usePageMeta } from "@/hooks/usePageMeta";

const productionWork = [
  {
    icon: AudioLines,
    kicker: capabilityLabelsV5["private-beta"],
    title: "SiteMint AI Receptionist platform",
    body: "Our own voice and SMS receptionist product: answering, qualifying, and handing off to people — with consent handling, opt-out enforcement, and firm-scoped data isolation built into the platform itself. Currently in private, invite-only beta.",
    detail:
      "Runs on the same discipline we sell: explicit recording policy, human handoff on every path, and an audit trail behind every automated action.",
    href: ROUTES.aiReceptionist,
    linkLabel: "See the product",
  },
  {
    icon: Search,
    kicker: capabilityLabelsV5.available,
    title: "SiteMint discovery intake",
    body: "The structured project-intake flow on this website — guided steps, branching questions, save-and-resume drafts, and a structured brief that reaches our team once you submit it.",
    detail:
      "You can evaluate this one yourself right now: it's how projects start here.",
    href: ROUTES.discovery,
    linkLabel: "Try the discovery flow",
  },
  {
    icon: Workflow,
    kicker: capabilityLabelsV5["in-development"],
    title: "SiteMint operations engine",
    body: "The internal CRM and automation system that runs SiteMint's own pipeline: lead scoring, campaign sequences with stop-on-reply, task routing, and delivery tracking — the working proof behind our automation service.",
    detail:
      "Internal by design; we demonstrate the patterns, not customer data.",
    href: ROUTES.aiSystems,
    linkLabel: "AI Systems & Automation",
  },
];

const capabilityWork = [
  {
    icon: Globe,
    kicker: capabilityLabelsV5.planned,
    title: "Booking-led clinic site",
    body: "A representative composition: a service site whose every page routes to scheduling, connected to an existing calendar, with automated confirmations and reminders replacing phone-tag.",
  },
  {
    icon: Search,
    kicker: capabilityLabelsV5.planned,
    title: "Trade-services quoting intake",
    body: "A representative composition: photo-and-detail intake for quote requests, branching by job type, producing priced-ready briefs and a follow-up queue the owner works through in minutes.",
  },
  {
    icon: Workflow,
    kicker: capabilityLabelsV5.planned,
    title: "Practice intake & follow-through",
    body: "A representative composition: structured client intake feeding a case record, with document requests, reminders, and status updates handled automatically between human touchpoints.",
  },
];

export default function WorkV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "Work — SiteMint Digital",
    description:
      "What SiteMint has actually built and run, labelled honestly: available now, private beta, in development, or planned.",
  });

  return (
    <div className="v3-work-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Work</span>
          <h1 className="v3-display">Proof you can inspect.</h1>
          <p className="v3-lede">
            We don't decorate this page with logos we can't verify or numbers
            we can't stand behind. Here is what SiteMint actually builds and
            runs — and honest examples of what we compose for clients.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">01</span>
            <h2 className="v3-h2">Built and operated by SiteMint.</h2>
          </div>
          {productionWork.map((item) => (
            <article key={item.title} className="v3wk-item">
              <div className="v3wk-item__meta">
                <span className="v3-eyebrow">
                  <item.icon aria-hidden="true" size={14} />
                  {item.kicker}
                </span>
              </div>
              <div className="v3wk-item__body">
                <h3 className="v3-h2">{item.title}</h3>
                <p className="v3-body">{item.body}</p>
                <p className="v3-body">{item.detail}</p>
                <div>
                  <Link href={item.href} className="v3-btn v3-btn--outline">
                    {item.linkLabel}
                    <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">02</span>
            <h2 className="v3-h2">What we compose for clients.</h2>
            <p className="v3-lede">
              These are capability demonstrations — representative system
              compositions, not client case studies. They show how the pieces
              fit; your system starts from your business.
            </p>
          </div>
          <div className="v3m-cards v3m-cards--3">
            {capabilityWork.map((item) => (
              <div key={item.title} className="v3-card v3m-card-link">
                <span className="v3m-card-link__kicker">{item.kicker}</span>
                <h3 className="v3m-card-link__title">{item.title}</h3>
                <p className="v3m-card-link__desc">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display">The next system here could be yours.</h2>
          <p className="v3-lede">
            Start with a discovery brief and see how we'd compose it.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Start with SiteMint
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
