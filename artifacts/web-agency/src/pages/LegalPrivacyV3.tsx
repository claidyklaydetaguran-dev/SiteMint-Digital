/**
 * Frontend V3 — Privacy policy.
 *
 * Drafted from the platform's actual data practices (discovery submissions,
 * receptionist accounts, call/SMS handling, minimal analytics). Flagged in
 * the program report for owner/legal review before production publication.
 */

import { useReveal } from "@/components/v3/useReveal";

export default function LegalPrivacyV3() {
  const reveal = useReveal();

  return (
    <div className="v3-legal-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Legal</span>
          <h1 className="v3-display">Privacy policy.</h1>
          <p className="v3lg-updated">Last updated: September 2026</p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-prose">
            <p>
              SiteMint Digital ("SiteMint", "we") builds and operates business
              systems, including this website and the SiteMint AI Receptionist
              service. This policy explains what information we collect, why we
              collect it, and the choices you have.
            </p>

            <h2>Information you give us</h2>
            <p>
              When you complete a discovery brief, contact form, or service
              signup, we collect what you enter: your name, contact details,
              and the information you provide about your business and project.
              We use it to respond to you and to deliver the service you
              requested — not to build advertising profiles.
            </p>

            <h2>Information from using our services</h2>
            <p>
              If your business uses the SiteMint AI Receptionist, the service
              processes call and message information needed to operate:
              caller/contact details, conversation outcomes, appointment
              requests, and delivery status. Recording and transcript retention
              are governed by an explicit artifact policy configured for each
              account; where the policy is set to none, recordings and
              transcripts are not retained.
            </p>

            <h2>Consent and opt-out</h2>
            <p>
              Messaging through our systems honors opt-out requests
              immediately: replying STOP to an SMS conversation ends it and
              records the opt-out. Automated sequences stop when a person
              replies or takes over.
            </p>

            <h2>Cookies and analytics</h2>
            <p>
              This website uses only the storage needed for it to function
              (such as saving an in-progress discovery draft in your browser).
              We do not run third-party advertising trackers.
            </p>

            <h2>Sharing</h2>
            <p>
              We do not sell personal information. We share it only with the
              service providers needed to operate our systems (such as
              telephony, email delivery, and payment processing), under their
              own contractual obligations, and where the law requires it.
            </p>

            <h2>Retention and security</h2>
            <p>
              We keep information for as long as needed to provide the service
              and meet legal obligations, and we protect it with
              access-controlled, authenticated systems. Customer data in the
              receptionist platform is isolated per business account.
            </p>

            <h2>Your choices</h2>
            <p>
              You can ask us what we hold about you, ask for a correction, or
              ask for deletion where the law provides for it. Contact us
              through this website and a person will respond.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
