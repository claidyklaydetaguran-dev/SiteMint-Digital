/**
 * Frontend V4 — the Signal brand mark: the SiteMint diamond drawn with the
 * signal gradient, core dot in cyan. Decorative; pair it with visible text
 * or an aria-label on the wrapping link.
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
          <stop offset="0" stopColor="var(--v4-cyan)" />
          <stop offset="0.55" stopColor="var(--v4-turquoise)" />
          <stop offset="1" stopColor="var(--v4-mint)" />
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
      <circle cx="12" cy="12" r="2.4" fill="var(--v4-cyan)" />
    </svg>
  );
}

export default SignalMarkV4;
