/**
 * Frontend V3 — Terms of service. Flagged in the program report for
 * owner/legal review before production publication.
 */

import { useReveal } from "@/components/v3/useReveal";

export default function LegalTermsV3() {
  const reveal = useReveal();

  return (
    <div className="v3-legal-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Legal</span>
          <h1 className="v3-display">Terms of service.</h1>
          <p className="v3lg-updated">Last updated: September 2026</p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-prose">
            <p>
              These terms govern your use of the SiteMint Digital website and,
              where you hold an account, the SiteMint AI Receptionist service.
              By using the site or the service, you agree to them.
            </p>

            <h2>Using this website</h2>
            <p>
              The website and its content belong to SiteMint Digital. You may
              browse it and submit inquiries about our services. Don't misuse
              it — no attempting to break, probe, or overload it, and no
              submitting information you don't have the right to share.
            </p>

            <h2>Service accounts</h2>
            <p>
              If you create a SiteMint AI Receptionist account, you're
              responsible for keeping your credentials secure and for the
              accuracy of the business information you configure. You must have
              the authority to connect the phone numbers, calendars, and
              systems you connect.
            </p>

            <h2>Acceptable use of the receptionist</h2>
            <p>
              The receptionist service must be used lawfully: with any consent
              your jurisdiction requires for call handling, honoring opt-out
              requests, and never for spam, harassment, or deceptive
              impersonation. We may suspend accounts that break these rules.
            </p>

            <h2>Project work</h2>
            <p>
              Website, application, and automation projects are governed by
              the written scope agreed for that project. Unless that agreement
              says otherwise, you own the deliverables, your content, and your
              data.
            </p>

            <h2>Service changes and availability</h2>
            <p>
              We work to keep services available and will communicate material
              changes, but no online service is uninterrupted. Features
              described as previews or pilots may change as they mature.
            </p>

            <h2>Liability</h2>
            <p>
              To the extent the law allows, SiteMint's liability for issues
              arising from use of the website or service is limited to the
              amount you paid for the service in the preceding twelve months.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about these terms? Contact us through this website and
              a person will respond.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
