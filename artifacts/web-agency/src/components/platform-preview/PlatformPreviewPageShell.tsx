import { useEffect, useState, type ReactNode } from "react";
import { usePlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";
import { PlatformPreviewNavbar } from "./PlatformPreviewNavbar";
import { PlatformPreviewMobileMenu } from "./PlatformPreviewMobileMenu";
import { PlatformPreviewFooter } from "./PlatformPreviewFooter";

/**
 * Shared chrome (skip link, navbar, mobile menu, footer, theme class) for
 * every /platform-preview/* page. Extracted from PlatformPreview.tsx's
 * original inline shell, which every new Frontend Epic 1 page would
 * otherwise have re-typed verbatim (mobile-menu open state, popstate
 * close-on-navigate, theme toggle wiring, skip link). Content differs per
 * page; this chrome does not.
 */
export function PlatformPreviewPageShell({ children }: { children: ReactNode }) {
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

      <PlatformPreviewNavbar theme={theme} onToggleTheme={toggleTheme} onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      {mobileMenuOpen && <PlatformPreviewMobileMenu onClose={() => setMobileMenuOpen(false)} />}

      <main id="pp-main-content" className="flex-1">
        {children}
      </main>

      <PlatformPreviewFooter />
    </div>
  );
}
