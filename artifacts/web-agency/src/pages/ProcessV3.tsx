/**
 * Frontend V3 — the SiteMint process page.
 */

import { Link } from "wouter";
import { ShieldCheck, Eye, PauseCircle, MessagesSquare } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import "@/styles/v5-pages.css";

/**
 * V5 (W-8): the five real phases — Discover · Design · Build · Validate ·
 * Launch & Improve — each with the concrete client output, matching the
 * "how SiteMint works" homepage section (`HomeV5`'s `PROCESS_STEPS`).
 */
const steps = [
  {
    title: "Discover",
    body: "You complete a short structured brief — what you do, what keeps falling through, what a win looks like. We read it properly before we ever get on a call, so the first conversation starts in the middle, not at the beginning.",
    outcome: "a structured brief we both work from, plus a plain recommendation on what to build and what to skip.",
  },
  {
    title: "Design",
    body: "You see the system taking shape early — real pages, real flows, real words — not a surprise unveiling at the end. Feedback lands while it's still cheap to act on.",
    outcome: "real pages and flows you review and approve before anything is built.",
  },
  {
    title: "Build",
    body: "We ship in focused stages you can use, connected to your calendar, phone, and records from the start.",
    outcome: "working software at every checkpoint — not a single reveal at the end.",
  },
  {
    title: "Validate",
    body: "Every stage is verified before the next begins — typechecked, tested, and reviewed, with the standing rules below applied throughout.",
    outcome: "a verified stage — typechecked, tested, and reviewed — before it ships.",
  },
  {
    title: "Launch & Improve",
    body: "Every automated path launches with a human handoff and an audit trail. We watch the first weeks of real traffic together and tune what it teaches us. Systems drift as businesses grow — we stay available for the adjustments that keep yours matched to reality.",
    outcome: "a live system with a human handoff, plus ongoing tuning as your business changes.",
  },
];

export default function ProcessV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "Process — SiteMint Digital",
    description: "How a SiteMint project runs: Discover, Design, Build, Validate, Launch & Improve — each with a concrete output.",
  });

  return (
    <div className="v3-process-page sm-v5page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Process</span>
          <p className="v3-serif-note">No mystery, no big reveal.</p>
          <h1 className="v3-display">How a SiteMint project runs.</h1>
          <p className="v3-lede">
            Five stages, each with a concrete output. You always know where
            the project is, what happens next, and what you can already use.
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
