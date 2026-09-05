/**
 * Frontend V3 — the SiteMint process page.
 */

import { useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, Eye, PauseCircle, MessagesSquare } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { BrowserFrame } from "@/components/v5/BrowserFrame";
import discoveryStep from "@/assets/product/discovery-step.png";
import "@/styles/v5-pages.css";

/**
 * V5 (W-8): the five real phases — Discover · Design · Build · Validate ·
 * Launch & Improve — each with the concrete client output, matching the
 * "how SiteMint works" homepage section (`HomeV5`'s `PROCESS_STEPS`).
 *
 * `artifact` (owner directive 2026-09-05: "what you receive") names the
 * literal deliverable object for the phase — a document, a link, an
 * environment — not a restated benefit.
 */
interface ProcessStep {
  title: string;
  body: string;
  artifact: string;
  /** Only Discover carries a real capture — the discovery form is the one
      phase with a public, screenshot-able surface today. */
  evidence?: { image: string; alt: string; caption: string; addressLabel: string };
}

const steps: ProcessStep[] = [
  {
    title: "Discover",
    body: "You complete a short structured brief — what you do, what keeps falling through, what a win looks like. We read it properly before we ever get on a call, so the first conversation starts in the middle, not at the beginning.",
    artifact: "The brief itself — the same one you'd fill in at Start — plus a one-page written recommendation.",
    evidence: {
      image: discoveryStep,
      alt: "SiteMint's real guided discovery form, showing a structured question step with a progress bar",
      caption: "SiteMint discovery flow — the actual form, preview data",
      addressLabel: "/discovery",
    },
  },
  {
    title: "Design",
    body: "You see the system taking shape early — real pages, real flows, real words — not a surprise unveiling at the end. Feedback lands while it's still cheap to act on.",
    artifact: "A reviewable staging link with real pages and real copy — comment or approve directly on it.",
  },
  {
    title: "Build",
    body: "We ship in focused stages you can use, connected to your calendar, phone, and records from the start.",
    artifact: "A working staging environment, already wired to your calendar, phone number, and records.",
  },
  {
    title: "Validate",
    body: "Every stage is verified before the next begins — typechecked, tested, and reviewed, with the standing rules below applied throughout.",
    artifact: "A short verification note: what was tested, what passed, and what changed since the last stage.",
  },
  {
    title: "Launch & Improve",
    body: "Every automated path launches with a human handoff and an audit trail. We watch the first weeks of real traffic together and tune what it teaches us. Systems drift as businesses grow — we stay available for the adjustments that keep yours matched to reality.",
    artifact: "Your live system, plus a written tuning log from the first weeks of real traffic.",
  },
];

export default function ProcessV3() {
  const reveal = useReveal();
  const [activeIndex, setActiveIndex] = useState(0);
  usePageMeta({
    title: "Process — SiteMint Digital",
    description: "How a SiteMint project runs: Discover, Design, Build, Validate, Launch & Improve — each with a concrete output.",
  });

  return (
    <div className="v3-process-page sm-v5page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
          <span className="v3-eyebrow reveal-fade-up">Process</span>
          <p className="v3-serif-note reveal-fade-up">No mystery, no big reveal.</p>
          {/* Headline is the hero LCP text — left static (no mask-reveal) so
              first paint isn't delayed; eyebrow/lede/actions carry the motion. */}
          <h1 className="v3-display">How a SiteMint project runs.</h1>
          <p className="v3-lede reveal-fade-up">
            Five stages, each with a concrete output. You always know where
            the project is, what happens next, and what you can already use.
          </p>
          <div className="v3m-hero__actions reveal-fade-up">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Build Your SiteMint System
            </Link>
            <Link href={ROUTES.pricing} className="v3-btn v3-btn--outline">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <ol className="v3m-steps">
            {steps.map((step, i) => {
              const isActive = i === activeIndex;
              const panelId = `v3m-step-panel-${i}`;
              return (
                <li
                  key={step.title}
                  className={`v3m-step reveal-scale-settle${isActive ? " v3m-step--active" : ""}`}
                >
                  {/* Number and title are real buttons driving `activeIndex` —
                      keyboard-reachable natively (Tab/Enter/Space), no custom
                      key handling. The three children below stay direct
                      children of `.v3m-step` so the existing two-column grid
                      (number | content, protected v3-marketing.css) still
                      applies exactly as before this pass. */}
                  <button
                    type="button"
                    className="v3m-step__no v3m-step__trigger"
                    aria-expanded={isActive}
                    aria-controls={panelId}
                    onClick={() => setActiveIndex(i)}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </button>
                  <h2 className="v3m-step__title v3m-step__head">
                    <button
                      type="button"
                      className="v3m-step__head-btn"
                      aria-expanded={isActive}
                      aria-controls={panelId}
                      onClick={() => setActiveIndex(i)}
                    >
                      {step.title}
                    </button>
                  </h2>
                  <div id={panelId} className="v3m-step__detail" hidden={!isActive}>
                    <p className="v3m-step__body">{step.body}</p>
                    <p className="v3m-step__body v3m-step__artifact">
                      <strong>What you receive:</strong> {step.artifact}
                    </p>
                    {step.evidence && (
                      <BrowserFrame
                        src={step.evidence.image}
                        alt={step.evidence.alt}
                        caption={step.evidence.caption}
                        addressLabel={step.evidence.addressLabel}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="v3-section" data-tone="ink">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy reveal-h-left">
            <span className="v3-eyebrow">
              <ShieldCheck aria-hidden="true" size={14} />
              The standing rules
            </span>
            <h2 className="v3-h2 reveal-clip">Four things that are true in every stage.</h2>
          </div>
          <div className="v3m-split__media">
            <ul className="v3m-checks">
              <li className="reveal-fade-up">
                <Eye aria-hidden="true" />
                <span>
                  <strong>You can always see the state of the work.</strong> No
                  status meetings required to find out what's happening.
                </span>
              </li>
              <li className="reveal-fade-up">
                <MessagesSquare aria-hidden="true" />
                <span>
                  <strong>Plain language, always.</strong> If we can't explain a
                  decision simply, we haven't finished making it.
                </span>
              </li>
              <li className="reveal-fade-up">
                <PauseCircle aria-hidden="true" />
                <span>
                  <strong>You can stop at any stage.</strong> Each checkpoint
                  leaves you with something whole, not a construction site.
                </span>
              </li>
              <li className="reveal-fade-up">
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
          <h2 className="v3-display reveal-clip">Stage one takes about ten minutes.</h2>
          <p className="v3-lede reveal-fade-up">
            The discovery brief is short, structured, and genuinely read.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary reveal-fade-up">
              Build Your SiteMint System
            </Link>
            <Link href={ROUTES.pricing} className="v3-btn v3-btn--outline reveal-fade-up">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
