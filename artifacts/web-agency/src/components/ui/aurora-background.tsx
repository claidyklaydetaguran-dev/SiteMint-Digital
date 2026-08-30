import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout-only wrapper for PlatformHero's content grid. Originally (rounds
 * 5-9) this component also rendered its own decorative aurora/ribbon
 * layers, adapted from Aceternity UI's Aurora Background pattern. Round 9
 * (final): running two independent decorative background systems — this
 * component's own layers plus the page-shell-level `HeroAuroraNetwork` —
 * produced a visible seam at their box edges that no amount of width/inset
 * alignment fully removed, however closely matched. There is now exactly
 * ONE background system for the whole navbar+hero region:
 * `HeroAuroraNetwork`, rendered at the shell level and dynamically sized
 * (via `ResizeObserver`) to cover this section's real height, so it shows
 * through this component uninterrupted. This component keeps its name/
 * signature (`showRadialGradient` accepted for backward compatibility, no
 * longer used) so PlatformHero.tsx and any future usage don't need to
 * change beyond removing the prop.
 */
export function AuroraBackground({
  children,
  className,
  showRadialGradient: _showRadialGradient = true,
  ...props
}: ComponentPropsWithoutRef<"div"> & { showRadialGradient?: boolean }) {
  return (
    <div className={cn("relative", className)} {...props}>
      {children}
    </div>
  );
}
