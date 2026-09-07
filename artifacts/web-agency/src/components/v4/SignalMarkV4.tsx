/**
 * Frontend V4 — the SiteMint brand mark: the diamond drawn in the pastel
 * mint signature (owner brand directive, 2026-09-07 final pass — the cyan
 * gradient is retired). The stroke runs signature #99F5D0 → border #80E9BE
 * so the mark keeps definition on white surfaces while reading as the
 * exact swatch; the core dot is the pure signature. Decorative; pair it
 * with visible text or an aria-label on the wrapping link.
 */

import { useId } from "react";

export interface SignalMarkV4Props {
  size?: number;
}

export function SignalMarkV4({ size = 22 }: SignalMarkV4Props) {
  // Unique, render-stable gradient id per instance — duplicate SVG ids across
  // one document resolve to the first occurrence, which breaks when a header
  // and footer both render the mark.
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--sm-mint-signature, #99F5D0)" />
          <stop offset="0.55" stopColor="#8CEFC7" />
          <stop offset="1" stopColor="var(--sm-mint-border, #80E9BE)" />
        </linearGradient>
      </defs>
      <rect
        x="5.2"
        y="5.2"
        width="13.6"
        height="13.6"
        rx="2"
        transform="rotate(45 12 12)"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="2.4" fill="var(--sm-mint-signature, #99F5D0)" />
    </svg>
  );
}

export default SignalMarkV4;
