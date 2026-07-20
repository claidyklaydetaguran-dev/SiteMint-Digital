import { useEffect, useState } from "react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";
import { PlatformPreviewNavbar } from "@/components/platform-preview/PlatformPreviewNavbar";
import { PlatformPreviewMobileMenu } from "@/components/platform-preview/PlatformPreviewMobileMenu";
import { PlatformPreviewFooter } from "@/components/platform-preview/PlatformPreviewFooter";
import { PlatformHero } from "@/components/platform-preview/PlatformHero";
import { BusinessGoalSelector } from "@/components/platform-preview/BusinessGoalSelector";
import { PlatformPreviewGoalProvider } from "@/components/platform-preview/PlatformPreviewGoalContext";
import { EcosystemVisual } from "@/components/platform-preview/EcosystemVisual";
import { ProductsSection } from "@/components/platform-preview/ProductsSection";
import { ServicesSection } from "@/components/platform-preview/ServicesSection";
import { ConnectedWorkflowSection } from "@/components/platform-preview/ConnectedWorkflowSection";
import { SiteMintDifferenceSection } from "@/components/platform-preview/SiteMintDifferenceSection";
import { SelectedWorkSection } from "@/components/platform-preview/SelectedWorkSection";
import { ProcessSection } from "@/components/platform-preview/ProcessSection";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "SiteMint Platform Preview (Internal, Unpublished) | Not the Live Site";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished visual prototype of a future SiteMint Digital umbrella homepage. Not indexed, not linked publicly, not the production site.";

/**
 * Sets document <title>/meta for this route only, and restores the prior
 * values on unmount so navigating away (e.g. via the app's own not-found
 * fallback when the flag is off) never leaves preview metadata behind on
 * another route. web-agency has no per-route metadata system today (see
 * docs/sitemint-platform/DESIGN_TOKEN_AUDIT.md / PRD §23) — this is a
 * route-scoped stand-in, not a new shared SEO mechanism.
 */
function usePreviewDocumentMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PREVIEW_TITLE;

    const createdTags: HTMLMetaElement[] = [];

    function setMeta(name: string, content: string) {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
        createdTags.push(tag);
      }
      tag.setAttribute("content", content);
    }

    setMeta("robots", "noindex, nofollow");
    setMeta("description", PREVIEW_DESCRIPTION);

    const previousCanonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
    document.head.querySelector('link[rel="canonical"]')?.remove();

    return () => {
      document.title = previousTitle;
      createdTags.forEach((tag) => tag.remove());
      if (previousCanonical) {
        const canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        canonical.setAttribute("href", previousCanonical);
        document.head.appendChild(canonical);
      }
    };
  }, []);
}

export default function PlatformPreview() {
  usePreviewDocumentMeta();
  const { theme, toggleTheme } = usePlatformPreviewTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onLocationHashChange() {
      setMobileMenuOpen(false);
    }
    window.addEventListener("popstate", onLocationHashChange);
    return () => window.removeEventListener("popstate", onLocationHashChange);
  }, [mobileMenuOpen]);

  return (
    <div
      className={`platform-preview flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))] ${theme === "dark" ? "dark" : ""}`}
    >
      <a href="#pp-main-content" className="pp-skip-link">
        Skip to content
      </a>

      <PlatformPreviewNavbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
      />

      {mobileMenuOpen && <PlatformPreviewMobileMenu onClose={() => setMobileMenuOpen(false)} />}

      <main id="pp-main-content" className="flex-1">
        <PlatformPreviewGoalProvider>
          <PlatformHero />
          <BusinessGoalSelector />
          <EcosystemVisual />
          <ProductsSection />
          <ServicesSection />
          <ConnectedWorkflowSection />
          <SiteMintDifferenceSection />
          <SelectedWorkSection />
          <ProcessSection />
          <FinalCtaSection />
        </PlatformPreviewGoalProvider>
      </main>

      <PlatformPreviewFooter />
    </div>
  );
}
