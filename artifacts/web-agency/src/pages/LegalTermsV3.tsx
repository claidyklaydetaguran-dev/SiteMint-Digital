/**
 * Frontend V3 — Terms of service. Flagged in the program report for
 * owner/legal review before production publication.
 */

import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PolicyUpdated, TermsBody } from "@/components/legal/PolicyBodies";

export default function LegalTermsV3() {
  usePageMeta({
    title: "Terms of Service — SiteMint Digital",
    description:
      "The terms that govern use of SiteMint Digital's website and services.",
  });
  const reveal = useReveal();

  return (
    <div className="v3-legal-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Legal</span>
          <h1 className="v3-display">Terms of service.</h1>
          <p className="v3lg-updated"><PolicyUpdated policy="terms" /></p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-prose">
            <TermsBody />
          </div>
        </div>
      </section>
    </div>
  );
}
