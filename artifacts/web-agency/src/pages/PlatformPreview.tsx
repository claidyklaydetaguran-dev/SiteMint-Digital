import "@/styles/platform-preview.css";
import { useProductionDocumentMeta } from "@/hooks/useProductionDocumentMeta";
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

const PAGE_TITLE = "SiteMint Digital | AI-Powered Websites & Business Systems";
const PAGE_DESCRIPTION =
  "SiteMint Digital builds AI-powered websites, CRM systems, automation workflows, and custom business applications that help service businesses get more customers and operate smarter.";

export default function PlatformPreview() {
  useProductionDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION, "/");

  return (
    <PlatformPreviewPageShell showHeroAurora>
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
