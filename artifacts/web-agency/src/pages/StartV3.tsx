/**
 * Frontend V3 — Start with SiteMint.
 *
 * The conversion page: sets expectations, then routes into the existing
 * discovery flow (owner decision: Discovery is the primary intake and stays
 * the system of record for new inquiries).
 */

import { Link } from "wouter";
import { ArrowRight, Clock, FileText, MessagesSquare, Phone, Mail, ShieldCheck } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";

/** Real contact details (W-12) — same values as `ThankYou.tsx`. */
const SUPPORT_PHONE = "949-880-6515";
const SUPPORT_PHONE_HREF = "tel:9498806515";
const SUPPORT_EMAIL = "info.sitemint@gmail.com";
const SUPPORT_RESPONSE_TIME = "within 1 business day";

export default function StartV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "Start with SiteMint — SiteMint Digital",
    description: "Every SiteMint project starts with a short, structured discovery brief. See what to expect, or contact us directly.",
  });

  return (
    <div className="v3-start-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Start with SiteMint</span>
          <h1 className="v3-display">
            Ten minutes now saves three calls later.
          </h1>
          <p className="v3-lede">
            Every SiteMint project starts with a short discovery brief. It's
            structured, it saves as you go, and a person — not a pipeline —
            reads every word.
          </p>
          <div className="v3m-hero__actions">
            <Link href={ROUTES.discovery} className="v3-btn v3-btn--primary">
              Begin the discovery brief
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3m-split v3-reveal" ref={reveal}>
          <div className="v3m-split__copy">
            <span className="v3m-sechead__no">What to expect</span>
            <h2 className="v3-h2">Here's exactly what happens.</h2>
            <ol className="v3st-expect">
              <li>
                <strong>You complete the brief</strong>
                <span>
                  About ten minutes of focused questions about your business
                  and what keeps falling through. Save and resume any time.
                </span>
              </li>
              <li>
                <strong>We read it properly</strong>
                <span>
                  A person reviews your brief — what you wrote shapes the
                  conversation, so nothing gets asked twice.
                </span>
              </li>
              <li>
                <strong>You get a straight answer</strong>
                <span>
                  A plain recommendation: what to build, what to skip, and what
                  it takes. If we're not the right fit, we'll say so.
                </span>
              </li>
              <li>
                <strong>You decide</strong>
                <span>
                  No pressure sequence, no countdown timers. The brief is
                  useful to you even if we never work together.
                </span>
              </li>
            </ol>
          </div>
          <div className="v3m-split__media">
            <div className="v3-card v3st-panel" data-tone="ice">
              <ul className="v3m-checks">
                <li>
                  <Clock aria-hidden="true" />
                  <span>
                    <strong>~10 minutes</strong> — structured, with progress
                    saved as you go
                  </span>
                </li>
                <li>
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>A real brief</strong> — you'll see what your answers
                    become
                  </span>
                </li>
                <li>
                  <MessagesSquare aria-hidden="true" />
                  <span>
                    <strong>A human reply</strong> — read and answered by the
                    people who'd do the work
                  </span>
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>Your information, respected</strong> — used to
                    respond to you, nothing else
                  </span>
                </li>
              </ul>
              <Link href={ROUTES.discovery} className="v3-btn v3-btn--primary">
                Begin the discovery brief
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact — folded in from the retired standalone /contact page
          (W-12). `/contact` redirects here (`${ROUTES.start}#contact`). */}
      <section className="v3-section" data-tone="porcelain" id="contact" style={{ scrollMarginTop: "5rem" }}>
        <div className="v3-container v3sp-two v3-reveal" ref={reveal}>
          <span className="v3m-sechead__no">Prefer to talk first?</span>
          <div className="v3sp-two__body">
            <h2 className="v3-h2">That works too.</h2>
            <p className="v3-body">
              If a form isn't how you think, reach out directly and we'll have
              the same conversation by message or call. The brief can come
              later — or we'll fill it in together.
            </p>
            <ul className="v3m-checks">
              <li>
                <Phone aria-hidden="true" />
                <span>
                  <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE}</a>
                </span>
              </li>
              <li>
                <Mail aria-hidden="true" />
                <span>
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </span>
              </li>
              <li>
                <Clock aria-hidden="true" />
                <span>Expected response time: {SUPPORT_RESPONSE_TIME}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
