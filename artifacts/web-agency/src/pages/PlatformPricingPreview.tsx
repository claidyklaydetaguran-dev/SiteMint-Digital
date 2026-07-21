import { useState } from "react";
import { ChevronDown } from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { PricingTierCard } from "@/components/platform-preview/PricingTierCard";
import { pricingTiers, pricingFactors } from "@/components/platform-preview/pricingTiers";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "Pricing — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of SiteMint's pricing and investment direction — Starter, Growth, Premium, and Custom.";

function WhatAffectsPricing() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mx-auto mt-14 max-w-2xl rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-muted))] p-6">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]"
      >
        What affects pricing?
        <ChevronDown size={16} aria-hidden="true" className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {expanded && (
        <ul className="mt-4 flex flex-col gap-2">
          {pricingFactors.map((factor) => (
            <li key={factor} className="flex items-start gap-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--sm-mint-500))]" />
              {factor}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlatformPricingPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="Pricing"
        headingId="pp-pricing-page-heading"
        heading="What a SiteMint project typically costs"
        intro="Every project starts with a discovery conversation — these ranges reflect the scope of work, not a fixed price sheet. No hidden fees, no exact quotes before we understand your project."
      />

      <section aria-labelledby="pp-pricing-page-heading" className="px-4 pb-8 md:px-8">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((tier, index) => (
            <div key={tier.id} className="pp-reveal" style={{ animationDelay: `${index * 80}ms` }}>
              <PricingTierCard tier={tier} />
            </div>
          ))}
        </div>

        <WhatAffectsPricing />

        <div className="mx-auto mt-6 max-w-2xl text-center text-xs text-[hsl(var(--sm-color-text-muted))]">
          Maintenance and support are scoped separately based on how your website or system needs to be cared for
          after launch — covered during discovery, not assumed up front.
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
