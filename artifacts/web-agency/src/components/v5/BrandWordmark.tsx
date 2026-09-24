/**
 * SiteMint V5 — the client-approved typography-only wordmark
 * (professional redesign, 2026-09-09).
 *
 * The shared client review explicitly rejected the tilted diamond and the
 * boxed "SM" monogram ("it still looks like a generated tech logo") and
 * approved a custom typography-only wordmark combining minimal Apple-style
 * simplicity, editorial refinement, and confident geometric weight:
 *
 *     SiteMint.
 *     DIGITAL
 *
 * - No separate icon or monogram, ever.
 * - "Site" in ink (light surfaces) or white (dark surfaces).
 * - "Mint" + the closing period carry the approved pastel-mint family —
 *   the signature swatch on dark, text-safe mint-ink on light.
 * - "DIGITAL" beneath in small, widely letter-spaced capitals (authored as
 *   "Digital" + text-transform so screen readers read a word, not letters).
 *
 * Surface handling is pure CSS (styles/v5-pro.css): the wordmark reads its
 * ink from the same `data-surface` / `data-tone` scopes the chrome already
 * maintains, so one component serves the header, mobile sheet, footer,
 * Discovery, and the AI Receptionist surfaces.
 *
 * Accessibility: the visible text is real text ("SiteMint" + "Digital").
 * Wrapping links keep their existing "SiteMint Digital — home" aria-labels.
 * The favicon is intentionally NOT redesigned here — it stays as-is until
 * the owner approves a symbol (client directive: no unapproved symbol).
 */

export interface BrandWordmarkProps {
  /** Drops the "DIGITAL" sub-line where vertical room is scarce. */
  compact?: boolean;
  className?: string;
}

export function BrandWordmark({ compact = false, className }: BrandWordmarkProps) {
  return (
    <span className={`sm-wordmark${className ? ` ${className}` : ""}`}>
      <span className="sm-wordmark__word">
        Site
        <span className="sm-wordmark__mint">Mint</span>
        <span className="sm-wordmark__dot" aria-hidden="true">
          .
        </span>
      </span>
      {!compact && <span className="sm-wordmark__sub">Digital</span>}
    </span>
  );
}

export default BrandWordmark;
