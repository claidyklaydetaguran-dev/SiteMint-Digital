/**
 * Frontend V2 Phase 4 — the AI Receptionist landing page.
 *
 * Section order is fixed by INFORMATION-ARCHITECTURE.md §3. The header and
 * footer belong to the shared V2 public shell; this module owns 1–9:
 *
 *   1 Hero (with the readiness ledger) · 2 Five core jobs ·
 *   3 Response trail · 4 Human control · 5 Business scenarios ·
 *   6 What it connects to · 7 Setup · 8 FAQ · 9 Signup CTA
 *
 * Surface plan. Warm white dominates; off-white and mint mist give restrained
 * differentiation; mint is reserved for actions, tier chips, the eyebrow rule,
 * and the trail rail. **Navy appears exactly once here** — the human-control
 * section — plus the footer in the shell. That section is navy on purpose: the
 * trail ends on a human handoff and the page turns dark at exactly the point a
 * person takes over.
 *
 * Product honesty (CONTENT-SPECIFICATION.md §4.1, §8, §9). The three readiness
 * tiers are stated in the hero, restated on the jobs, built into the trail's
 * boundary panel, and answered again in the FAQ. Wording for every tier comes
 * from the single shared source in `components/v2/home/readiness.ts`, so a tier
 * cannot be described one way here and another way on the homepage. Scheduling
 * is labelled *in development* because no booking logic exists in the intake
 * pipeline — see the verification notes in `receptionistContent.ts`.
 *
 * Nothing on this page states a response time, an availability window, a
 * customer or call count, an industry count, a delivery timeline, a price, a
 * business result, a testimonial, or a named third-party integration. There is
 * no generated image, no Magnific asset, and no video: the one visual set piece
 * is real HTML and CSS.
 *
 * CTA destinations. "Create Your Receptionist" is account creation and resolves
 * to `ROUTES.aiReceptionistSignup`. "Start Your Project" is the agency
 * engagement and resolves to `START_PROJECT_ROUTE` (/discovery). The two are
 * never crossed, and each is worded as the thing it actually does. Both go
 * through the centralised path layer, so they carry the router base exactly
 * once.
 */

import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ROUTES, START_PROJECT_ROUTE } from "@/lib/routes";
import { CAPABILITY_STATUS, READINESS } from "@/components/v2/home/readiness";
import { ResponseTrail } from "@/components/air/ResponseTrail";
import { ResponseOverview } from "@/components/air/ResponseOverview";
import {
  CORE_JOBS,
  HUMAN_CONTROL,
  SCENARIOS,
  SETUP_STEPS,
  FAQS,
} from "@/components/air/receptionistContent";

/** In-page anchor for the hero's secondary CTA. */
const HOW_IT_WORKS = "how-it-works";

export default function AiReceptionist() {
  return (
    <>
      {/* ── 1. Hero ───────────────────────────────────────────────────────────
          The readiness ledger is the hero's visual anchor rather than a
          decorative graphic. It puts the honest status of all three
          capabilities above the fold, where it cannot be missed or mistaken
          for small print. */}
      <section className="v2-section v2-hero air-hero" aria-labelledby="air-hero-heading">
        <div className="v2-wrap air-hero__grid">
          <div className="air-hero__copy">
            <p className="v2-eyebrow">AI Receptionist</p>
            <h1 id="air-hero-heading" className="v2-display air-hero__title">
              Every lead deserves a timely response.
            </h1>
            {/* Phase 4.1 product-truth correction. The Phase 4 wording — "SMS
                is available now, with voice and deeper CRM connections being
                developed" — put voice and CRM in one clause and made the CRM
                capability sound as though it were already under construction.
                CRM is *planned*. The three tiers are now stated separately and
                in their real order, and "planned" is never softened into
                "being developed" or "coming soon". */}
            <p className="v2-lede air-hero__lede">
              SiteMint's AI Receptionist helps businesses respond to inquiries,
              qualify leads, and keep conversations organized. SMS is available
              now. Voice is in development, while connected CRM and automated
              follow-up are planned.
            </p>

            <div className="v2-hero__actions air-hero__actions">
              <Link
                href={ROUTES.aiReceptionistSignup}
                className="v2-btn v2-btn--primary"
              >
                Create Your Receptionist
              </Link>
              <a href={`#${HOW_IT_WORKS}`} className="v2-btn v2-btn--secondary">
                See How It Works
                <ArrowRight aria-hidden="true" className="v2-btn__icon" />
              </a>
            </div>
          </div>

          {/* Phase 4.1: the right half was empty. It now carries the compact
              end-to-end summary of the shipped SMS path — a summary of the
              trail below, not a duplicate of it. On mobile the grid collapses
              and this stacks under the CTAs as an ordinary list. */}
          <ResponseOverview />
        </div>

        <div className="v2-wrap">
          {/* Three tiers, one row, in descending availability. The tier is
              carried by the chip's text, not by its colour alone. */}
          <div className="air-ledger">
            <h2 className="air-ledger__title" id="air-status-heading">
              Where the product stands today
            </h2>
            <ul className="air-ledger__list" aria-labelledby="air-status-heading">
              {CAPABILITY_STATUS.map((item) => (
                <li
                  key={item.capability}
                  className={`air-ledger__item air-ledger__item--${item.tier}`}
                >
                  <span className={`v2-tier v2-tier--${item.tier}`}>
                    {READINESS[item.tier].label}
                  </span>
                  <h3 className="air-ledger__name">{item.capability}</h3>
                  <p className="air-ledger__note">{item.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 2. Five core jobs — a spec sheet, not a card grid. ─────────────── */}
      <section className="v2-section v2-section--alt air-section" aria-labelledby="jobs-heading">
        <div className="v2-wrap">
          <div className="v2-head">
            <p className="v2-eyebrow">What it does</p>
            <h2 id="jobs-heading" className="v2-h2">
              Five jobs, and where each one really stands
            </h2>
            <p className="v2-lede">
              Four of these run today over SMS. One does not, and it says so
              rather than being quietly listed alongside the rest.
            </p>
          </div>

          <dl className="air-jobs">
            {CORE_JOBS.map((job) => (
              <div
                key={job.name}
                className={`air-jobs__row air-jobs__row--${job.tier}`}
              >
                <dt className="air-jobs__term">
                  <span className="air-jobs__name">{job.name}</span>
                  <span className={`v2-tier v2-tier--${job.tier}`}>
                    {READINESS[job.tier].label}
                  </span>
                </dt>
                <dd className="air-jobs__desc">{job.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 3. The response trail — this page's signature. ─────────────────── */}
      <ResponseTrail id={HOW_IT_WORKS} />

      {/* ── 4. Human control — the one navy section on this page. ──────────── */}
      <section
        className="v2-section v2-section--feature air-section air-control"
        aria-labelledby="control-heading"
      >
        <div className="v2-wrap">
          <div className="v2-head">
            <p className="v2-eyebrow v2-eyebrow--on-dark">Human control</p>
            <h2 id="control-heading" className="v2-h2 v2-h2--on-dark">
              What the receptionist never decides on its own
            </h2>
            <p className="v2-lede v2-lede--on-dark">
              The trail above ends with a person for a reason. These are the
              limits the system actually has, not a policy we intend to adopt.
            </p>
          </div>

          <ul className="air-control__list">
            {HUMAN_CONTROL.map((item) => (
              <li key={item.title} className="air-control__item">
                <h3 className="air-control__name">{item.title}</h3>
                <p className="air-control__body">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 5. Business scenarios — scenarios, never customers. ────────────── */}
      <section className="v2-section air-section" aria-labelledby="scenarios-heading">
        <div className="v2-wrap">
          <div className="v2-head">
            <p className="v2-eyebrow">Who it suits</p>
            <h2 id="scenarios-heading" className="v2-h2">
              Businesses where the first reply decides the job
            </h2>
            <p className="v2-lede">
              These are scenarios, written to show the shape of the problem.
              They are not customers, and we are not claiming them as results.
            </p>
          </div>

          <ul className="air-scenarios">
            {SCENARIOS.map((item) => (
              <li key={item.sector} className="air-scenarios__item">
                <h3 className="air-scenarios__sector">{item.sector}</h3>
                <p className="v2-body-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 6. What it connects to — no product is named, because none is
             verified in this repository. ───────────────────────────────────── */}
      <section
        className="v2-section v2-section--accent air-section"
        aria-labelledby="connect-heading"
      >
        <div className="v2-wrap v2-wrap--narrow">
          <div className="v2-head">
            <p className="v2-eyebrow">What it connects to</p>
            <h2 id="connect-heading" className="v2-h2">
              Today it works on its own, and we would rather say so
            </h2>
          </div>
          <p className="v2-body-muted air-prose">
            The receptionist answers the text, keeps the conversation, and
            emails the summary to the address you choose. That is the whole
            circuit as it ships. We are not listing integration logos for
            connections we have not built.
          </p>
          <p className="v2-body-muted air-prose">
            Conversations flowing into a CRM record, and follow-up running
            without someone driving it, are the direction of the product.
          </p>
          <p className="air-prose air-prose__tier">
            <span className="v2-tier v2-tier--planned">
              {READINESS.planned.label}
            </span>
            <span>{READINESS.planned.note}</span>
          </p>
        </div>
      </section>

      {/* ── 7. Setup — honest steps, honest effort, and no timeline. ───────── */}
      <section className="v2-section air-section" aria-labelledby="setup-heading">
        <div className="v2-wrap">
          <div className="v2-head">
            <p className="v2-eyebrow">Getting set up</p>
            <h2 id="setup-heading" className="v2-h2">
              What setting it up actually involves
            </h2>
            <p className="v2-lede">
              Four things have to be true before a receptionist is useful. We do
              not publish a setup duration, because yours depends on how settled
              these answers already are.
            </p>
          </div>

          <ol className="air-setup">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title} className="air-setup__step">
                <span className="air-setup__num" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="air-setup__text">
                  <h3 className="v2-h3">{step.title}</h3>
                  <p className="v2-body-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 8. FAQ — native <details>, so every answer opens without
             JavaScript and keyboard behaviour comes from the platform. ────── */}
      <section
        className="v2-section v2-section--alt air-section"
        aria-labelledby="air-faq-heading"
        id="faq"
      >
        <div className="v2-wrap v2-wrap--narrow">
          <div className="v2-head">
            <p className="v2-eyebrow">Questions</p>
            <h2 id="air-faq-heading" className="v2-h2">
              Frequently asked questions
            </h2>
          </div>

          <div className="v2-faq">
            {FAQS.map((item) => (
              <details key={item.q} className="v2-faq__item">
                <summary className="v2-faq__q">{item.q}</summary>
                <p className="v2-faq__a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Signup CTA. Two destinations, each named for what it is: an
             account, or an agency engagement. They are never crossed. ─────── */}
      <section
        className="v2-section v2-section--accent v2-cta air-section"
        aria-labelledby="air-cta-heading"
      >
        <div className="v2-wrap v2-wrap--narrow v2-cta__inner">
          <h2 id="air-cta-heading" className="v2-h2">
            Start with the part that works today
          </h2>
          <p className="v2-lede">
            Create a receptionist account and set up the SMS receptionist. If
            what you actually need is a website, a CRM, or the whole system
            joined up, that is a different conversation and it starts with
            Discovery.
          </p>
          <div className="v2-hero__actions air-cta__actions">
            <Link
              href={ROUTES.aiReceptionistSignup}
              className="v2-btn v2-btn--primary"
            >
              Create Your Receptionist
            </Link>
            <Link href={START_PROJECT_ROUTE} className="v2-btn v2-btn--secondary">
              Start Your Project
              <ArrowRight aria-hidden="true" className="v2-btn__icon" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
