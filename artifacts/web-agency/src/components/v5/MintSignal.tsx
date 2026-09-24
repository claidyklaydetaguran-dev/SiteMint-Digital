/**
 * Mint Signal — the brand's decorative graphic language (mint-brand
 * directive, 2026-09-07): small paired nodes, a fine signal trail with one
 * sprout-like branch, and a softly cropped corner field in the signature
 * pastel. Abstract and technological — never literal foliage.
 *
 * Purely decorative (aria-hidden), absolutely positioned into a section
 * corner by `.sm-mint-corner` (v5-remap.css). Static SVG — no animation,
 * so it costs nothing and needs no reduced-motion branch.
 */

export function MintSignalCorner({ flip = false }: { flip?: boolean }) {
  return (
    <span className={`sm-mint-corner${flip ? " sm-mint-corner--flip" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 220 160" width="220" height="160" fill="none">
        {/* Soft corner field */}
        <circle cx="205" cy="-10" r="120" fill="var(--sm-mint-signature, #99F5D0)" opacity="0.16" />
        <circle cx="215" cy="-20" r="70" fill="var(--sm-mint-signature, #99F5D0)" opacity="0.18" />
        {/* Fine signal trail with one sprout-like branch */}
        <path
          d="M12 132 C 60 120, 96 96, 128 72 S 190 28, 212 20"
          stroke="var(--sm-mint-border, #80E9BE)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M128 72 C 140 78, 148 88, 150 102"
          stroke="var(--sm-mint-border, #80E9BE)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Paired nodes */}
        <circle cx="128" cy="72" r="4" fill="var(--sm-mint-signature, #99F5D0)" stroke="var(--sm-mint-ink, #0B6B57)" strokeWidth="1" />
        <circle cx="150" cy="102" r="3" fill="var(--sm-mint-signature, #99F5D0)" stroke="var(--sm-mint-ink, #0B6B57)" strokeWidth="1" />
        <circle cx="212" cy="20" r="4.5" fill="var(--sm-mint-signature, #99F5D0)" stroke="var(--sm-mint-ink, #0B6B57)" strokeWidth="1" />
        <circle cx="12" cy="132" r="2.5" fill="var(--sm-mint-border, #80E9BE)" />
      </svg>
    </span>
  );
}

export default MintSignalCorner;
