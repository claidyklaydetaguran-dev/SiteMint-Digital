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
 *
 * `showThemeToggle` (default false) is a page-level capability, not a
 * per-render prop passed down blindly: when false, the resolved theme
 * applied to this wrapper (and threaded to Navbar/MobileMenu) is forced to
 * "light" regardless of what usePlatformPreviewTheme() returns, so the
 * homepage and every ordinary preview page render the fixed light-mint
 * design even if a visitor previously set dark mode on the one page that
 * still exposes the toggle (AI Receptionist). Hiding the toggle button
 * alone would not be enough, since the persisted localStorage value would
 * otherwise still leak into this wrapper's `dark` class.
 */
export function PlatformPreviewPageShell({
  children,
  showThemeToggle = false,
}: {
  children: ReactNode;
  showThemeToggle?: boolean;
}) {
  const { theme, toggleTheme } = usePlatformPreviewTheme();
  const effectiveTheme = showThemeToggle ? theme : "light";
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
      className={`platform-preview flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))] ${effectiveTheme === "dark" ? "dark" : ""}`}
    >
      <a href="#pp-main-content" className="pp-skip-link">
        Skip to content
      </a>

      <PlatformPreviewNavbar
        theme={effectiveTheme}
        onToggleTheme={toggleTheme}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        showThemeToggle={showThemeToggle}
      />

      {mobileMenuOpen && (
        <PlatformPreviewMobileMenu
          onClose={() => setMobileMenuOpen(false)}
          theme={effectiveTheme}
          onToggleTheme={toggleTheme}
          showThemeToggle={showThemeToggle}
        />
      )}

      <main id="pp-main-content" className="flex-1">
        {children}
      </main>

      <PlatformPreviewFooter />
    </div>
  );
}
