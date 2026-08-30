import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";
import { usePlatformPreviewAuroraParallax } from "@/hooks/usePlatformPreviewAuroraParallax";
import { PlatformPreviewNavbar } from "./PlatformPreviewNavbar";
import { PlatformPreviewMobileMenu } from "./PlatformPreviewMobileMenu";
import { PlatformPreviewFooter } from "./PlatformPreviewFooter";
import { HeroAuroraNetwork } from "./HeroAuroraNetwork";

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
 *
 * `showHeroAurora` (default false) — round 6, homepage only: the floating
 * pill navbar's own inset margins leave a plain-canvas gutter around/behind
 * it, breaking the "navbar floats as a glass island over one continuous
 * hero background" composition the owner wants. Rather than changing the
 * navbar itself (explicitly kept inset/rounded/unchanged) or stretching
 * PlatformHero's own decorative layers past their section's
 * `overflow-hidden` boundary (would silently clip), HeroAuroraNetwork is
 * rendered *here*, at the shell level, positioned behind both the navbar
 * and the hero section — one unbroken background, not a duplicate that
 * could visibly seam against the hero's own copy. Only `PlatformPreview.tsx`
 * (the homepage) passes this true; every other /platform-preview/* page is
 * unaffected.
 *
 * Round 8 adds restrained rAF/CSS-variable pointer parallax
 * (usePlatformPreviewAuroraParallax) on this same root element. Because
 * `--pp-aurora-x`/`--pp-aurora-y` are plain custom properties, setting them
 * here is enough for descendant decorative layers in both this shell block
 * and PlatformHero's own AuroraBackground to read the same eased pointer
 * position via CSS inheritance — one controller, no duplicate listeners.
 *
 * `footerVariant` (default "light") — a thin passthrough to
 * PlatformPreviewFooter's own `variant` prop, added for the platform-preview
 * inner-page dark redesign. Kept intentionally dumb (no routing logic, no
 * context, no branching beyond the one prop hop) so the homepage's call
 * site needs no change and stays on the default light footer; the five
 * redesigned inner pages pass `footerVariant="dark"` explicitly.
 */
export function PlatformPreviewPageShell({
  children,
  showThemeToggle = false,
  showHeroAurora = false,
  footerVariant = "light",
}: {
  children: ReactNode;
  showThemeToggle?: boolean;
  showHeroAurora?: boolean;
  footerVariant?: "light" | "dark";
}) {
  const { theme, toggleTheme } = usePlatformPreviewTheme();
  const effectiveTheme = showThemeToggle ? theme : "light";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  usePlatformPreviewAuroraParallax(rootRef, showHeroAurora);

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
      ref={rootRef}
      className={`platform-preview relative isolate flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))] ${effectiveTheme === "dark" ? "dark" : ""}`}
    >
      {showHeroAurora && <HeroAuroraNetwork />}

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

      <PlatformPreviewFooter variant={footerVariant} />
    </div>
  );
}
