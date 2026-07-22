import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PlatformHero } from "@/components/platform-preview/PlatformHero";
import { PostHeroGoalSection } from "@/components/platform-preview/PostHeroGoalSection";
import { PlatformPreviewGoalProvider } from "@/components/platform-preview/PlatformPreviewGoalContext";
import { EcosystemVisual } from "@/components/platform-preview/EcosystemVisual";
import { ProductsSection } from "@/components/platform-preview/ProductsSection";
import { ServicesSection } from "@/components/platform-preview/ServicesSection";
import { SiteMintDifferenceSection } from "@/components/platform-preview/SiteMintDifferenceSection";
import { SelectedWorkSection } from "@/components/platform-preview/SelectedWorkSection";
import { ProcessSection } from "@/components/platform-preview/ProcessSection";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "SiteMint Platform Preview (Internal, Unpublished) | Not the Live Site";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished visual prototype of a future SiteMint Digital umbrella homepage. Not indexed, not linked publicly, not the production site.";

export default function PlatformPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell>
      <PlatformPreviewGoalProvider>
        <PlatformHero />
        <PostHeroGoalSection />
        <EcosystemVisual />
        <ProductsSection />
        <ServicesSection />
        <SiteMintDifferenceSection />
        <SelectedWorkSection />
        <ProcessSection />
        <FinalCtaSection />
      </PlatformPreviewGoalProvider>
    </PlatformPreviewPageShell>
  );
}
