/**
 * Frontend V3 — Privacy policy.
 *
 * Drafted from the platform's actual data practices (discovery submissions,
 * receptionist accounts, call/SMS handling, minimal analytics). Flagged in
 * the program report for owner/legal review before production publication.
 */

import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PolicyUpdated, PrivacyBody } from "@/components/legal/PolicyBodies";

export default function LegalPrivacyV3() {
  usePageMeta({
    title: "Privacy Policy — SiteMint Digital",
    description:
      "How SiteMint Digital collects, uses, and protects information across our website and products.",
  });
  const reveal = useReveal();

  return (
    <div className="v3-legal-page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Legal</span>
          <h1 className="v3-display">Privacy policy.</h1>
          <p className="v3lg-updated"><PolicyUpdated policy="privacy" /></p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-prose">
            <PrivacyBody />
          </div>
        </div>
      </section>
    </div>
  );
}
