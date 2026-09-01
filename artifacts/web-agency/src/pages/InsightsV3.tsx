/**
 * Frontend V3 — Insights foundation.
 *
 * Honest state: the editorial program is real but young. Planned pieces are
 * shown as "in the works" — no fabricated publish dates, authors, or read
 * counts. The index is built so articles can be added as routed pages later
 * without redesign.
 */

import { Link } from "wouter";
import { PenLine, Bell } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";

const upcoming = [
  {
    kicker: "Operations",
    title: "The two-line email is costing you jobs",
    desc: "Why unstructured inquiries lose to structured ones, and what a good intake question actually looks like.",
  },
  {
    kicker: "AI, honestly",
    title: "What an AI receptionist should refuse to do",
    desc: "Consent, handoff, and the calls that must reach a person — the safety design behind ours.",
  },
  {
    kicker: "Systems",
    title: "Automation that stops when a human shows up",
    desc: "The stop-on-reply principle, and why polite persistence beats clever sequences.",
  },
];

export default function InsightsV3() {
  const reveal = useReveal();

  return (
    <div className="v3-insights-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Insights</span>
          <p className="v3-serif-note">Thinking out loud.</p>
          <h1 className="v3-display">
            Notes on building business systems.
          </h1>
          <p className="v3-lede">
            Practical, specific, and free of hype — written from operating the
            systems we sell. The first pieces are being written now; here's
            what's coming.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3in-list">
            {upcoming.map((item) => (
              <article key={item.title} className="v3-card v3in-item">
                <span className="v3-chip v3in-item__status">
                  <PenLine aria-hidden="true" size={12} />
                  In the works
                </span>
                <span className="v3m-card-link__kicker">{item.kicker}</span>
                <h2 className="v3m-card-link__title">{item.title}</h2>
                <p className="v3m-card-link__desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <Bell aria-hidden="true" size={28} />
          <h2 className="v3-h2">Want the first pieces when they land?</h2>
          <p className="v3-lede">
            Start a conversation and mention it — we'll let you know directly.
            No newsletter machinery, no drip sequence.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.contact} className="v3-btn v3-btn--outline">
              Get in touch
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
