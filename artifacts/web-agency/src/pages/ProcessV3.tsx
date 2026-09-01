/**
 * Frontend V3 — the SiteMint process page.
 */

import { Link } from "wouter";
import { ShieldCheck, Eye, PauseCircle, MessagesSquare } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";

const steps = [
  {
    title: "Discovery",
    body: "You complete a short structured brief — what you do, what keeps falling through, what a win looks like. We read it properly before we ever get on a call, so the first conversation starts in the middle, not at the beginning.",
    outcome: "A brief we both work from.",
  },
  {
    title: "The straight answer",
    body: "We come back with a plain recommendation: what to build, what to skip, what order to do it in, and what it takes. If we're not the right fit, we say so and point you somewhere better.",
    outcome: "A scoped recommendation you can say no to.",
  },
  {
    title: "Design in the open",
    body: "You see the system taking shape early — real pages, real flows, real words — not a surprise unveiling at the end. Feedback lands while it's still cheap to act on.",
    outcome: "A design you've already used before it ships.",
  },
  {
    title: "Build in stages",
    body: "We ship in focused stages you can use, connected to your calendar, phone, and records from the start. Each stage is verified — typechecked, tested, and reviewed — before the next begins.",
    outcome: "Working software at every checkpoint.",
  },
  {
    title: "Launch with a person in the loop",
    body: "Every automated path launches with a human handoff and an audit trail. We watch the first weeks of real traffic together and tune what it teaches us.",
    outcome: "A system that earns trust before it earns autonomy.",
  },
  {
    title: "Run and improve",
    body: "Systems drift as businesses grow. We stay available for the adjustments that keep yours matched to reality — and you own everything either way.",
    outcome: "A system that keeps up with you.",
  },
];

export default function ProcessV3() {
  const reveal = useReveal();

  return (
    <div className="v3-process-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Process</span>
          <p className="v3-serif-note">No mystery, no big reveal.</p>
          <h1 className="v3-display">How a SiteMint project runs.</h1>
          <p className="v3-lede">
            Six stages, each with a visible outcome. You always know where the
            project is, what happens next, and what you can already use.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <ol className="v3m-steps">
            {steps.map((step, i) => (
              <li key={step.title} className="v3m-step">
                <span className="v3m-step__no" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="v3m-step__title v3m-step__head">{step.title}</h2>
                <div>
                  <p className="v3m-step__body">{step.body}</p>
                  <p className="v3m-step__body">
                    <strong>Outcome:</strong> {step.outcome}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3-eyebrow">
              <ShieldCheck aria-hidden="true" size={14} />
              The standing rules
            </span>
            <h2 className="v3-h2">Four things that are true in every stage.</h2>
          </div>
          <div className="v3m-split__media">
            <ul className="v3m-checks">
              <li>
                <Eye aria-hidden="true" />
                <span>
                  <strong>You can always see the state of the work.</strong> No
                  status meetings required to find out what's happening.
                </span>
              </li>
              <li>
                <MessagesSquare aria-hidden="true" />
                <span>
                  <strong>Plain language, always.</strong> If we can't explain a
                  decision simply, we haven't finished making it.
                </span>
              </li>
              <li>
                <PauseCircle aria-hidden="true" />
                <span>
                  <strong>You can stop at any stage.</strong> Each checkpoint
                  leaves you with something whole, not a construction site.
                </span>
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                <span>
                  <strong>Your data and access stay yours.</strong> Credentials,
                  content, and records belong to your business from day one.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display">Stage one takes about ten minutes.</h2>
          <p className="v3-lede">
            The discovery brief is short, structured, and genuinely read.
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
