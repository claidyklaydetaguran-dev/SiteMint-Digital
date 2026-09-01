/**
 * Frontend V3 — the SiteMint mark, recolored into the mint→electric-cyan
 * family (the V2 mark's emerald green is outside the approved V3 palette).
 * Self-contained: no Tailwind classes, tones itself from the V3 role vars.
 */

interface SiteMintMarkV3Props {
  /** Icon square size in px. */
  size?: number;
  /** Hide the wordmark for compact placements. */
  showText?: boolean;
  className?: string;
}

export function SiteMintMarkV3({ size = 30, showText = true, className }: SiteMintMarkV3Props) {
  return (
    <span className={`v3-mark${className ? ` ${className}` : ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="v3-mark-g" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#20E6C3" />
            <stop offset="1" stopColor="#4FE7F5" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="#0C2633" />
        <path d="M20 8L32 20L20 32L8 20Z" fill="#E9FCF8" opacity="0.1" />
        <path d="M20 11L29 20L20 29L11 20Z" fill="url(#v3-mark-g)" opacity="0.95" />
        <path d="M20 16L24 20L20 24L16 20Z" fill="#0C2633" />
        <circle cx="20" cy="13" r="2.4" fill="#20E6C3" />
      </svg>
      {showText && (
        <span className="v3-mark__word">
          SiteMint <span className="v3-mark__word-co">Digital</span>
        </span>
      )}
    </span>
  );
}

export default SiteMintMarkV3;
