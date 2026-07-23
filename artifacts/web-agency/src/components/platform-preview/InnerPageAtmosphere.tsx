import { useRef } from "react";
import { usePlatformPreviewInViewport } from "@/hooks/usePlatformPreviewInViewport";

/**
 * Lightweight dark atmosphere for the five redesigned inner pages —
 * deliberately a separate, smaller component from HeroAuroraNetwork, not a
 * variant of it. HeroAuroraNetwork stays homepage-only, unchanged, still
 * driven by the shell's `showHeroAurora` boolean and its own ResizeObserver.
 * This component has none of that: no SVG connector network, no
 * ResizeObserver, no pointer-parallax — pure CSS radial-gradient layers
 * (see `.pp-inner-atmosphere-*` in styles/platform-preview.css), reusing
 * the same already-approved pp-aurora, pp-cyan-mint, and pp-navy tokens
 * the homepage hero and FinalCtaSection already use.
 *
 * Each inner page renders this directly wherever it needs atmosphere
 * (typically the hero band, plus 0-2 section transitions) — it is not
 * routed through PlatformPreviewPageShell, so it can never affect the
 * homepage's render path.
 *
 * `intensity="hero"` is the only variant with any motion at all (a slow,
 * paused-off-screen, reduced-motion-gated background drift); "section" and
 * "transition" are fully static.
 */
export function InnerPageAtmosphere({
  intensity = "section",
  className = "",
}: {
  intensity?: "hero" | "section" | "transition";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inViewport = usePlatformPreviewInViewport(rootRef);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pp-inner-atmosphere pp-inner-atmosphere-${intensity} pointer-events-none absolute inset-0 -z-10 overflow-hidden ${
        inViewport ? "" : "pp-inner-atmosphere-paused"
      } ${className}`}
    />
  );
}
