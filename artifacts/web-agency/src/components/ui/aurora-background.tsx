import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable animated aurora/southern-lights background, adapted from
 * Aceternity UI's Aurora Background pattern (architecture only — no demo
 * copy or layout copied) to this project's Tailwind v4 + CSS-variable
 * conventions. CSS-only (layered radial-gradient "beam" ellipses + a slow
 * background-position/rotate/scale keyframe in styles/platform-preview.css)
 * — no canvas, WebGL, or JS-driven animation. Two independently-animated
 * ribbon layers (round-5: a single repeating-linear-gradient read as flat,
 * barely-visible stripes) give the flowing, layered-band depth the design
 * calls for.
 *
 * Accessibility: the outer element genuinely renders `children` in normal
 * flow and is never aria-hidden, so it never hides interactive or
 * meaningful content from assistive tech. Only the internal decorative
 * ribbon layers are `aria-hidden` + `pointer-events-none`.
 */
export function AuroraBackground({
  children,
  className,
  showRadialGradient = true,
  ...props
}: ComponentPropsWithoutRef<"div"> & { showRadialGradient?: boolean }) {
  return (
    <div className={cn("relative isolate", className)} {...props}>
      <div
        aria-hidden="true"
        className={cn(
          "pp-aurora-ribbon-layer pointer-events-none absolute inset-0 -z-10 overflow-hidden",
          showRadialGradient && "pp-aurora-radial-mask",
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pp-aurora-ribbon-layer-2 pointer-events-none absolute inset-0 -z-10 overflow-hidden",
          showRadialGradient && "pp-aurora-radial-mask",
        )}
      />
      {children}
    </div>
  );
}
