/**
 * Frontend V4 — the four service glyphs. Custom SVG (not icon-font glyphs):
 * each has a static frame plus a `.v4-glyph-anim` stroke that draws on
 * hover/focus of the surrounding card (CSS-driven, reduced-motion renders it
 * drawn). All decorative — always `aria-hidden` via the shared wrapper.
 */

import type { ReactElement } from "react";
import type { V4Glyph } from "./publicNavV4";

function SiteGlyph() {
  return (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        className="v4-glyph-anim"
        d="M6 15c2.5-3 4.5 2 7-1s3-1 5-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  );
}

function DiscoveryGlyph() {
  return (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 8h7M8.5 11.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path
        className="v4-glyph-anim"
        d="M8.5 15.5l2 2 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function AutomationGlyph() {
  return (
    <>
      <circle cx="5.5" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18.5" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        className="v4-glyph-anim"
        d="M7.2 7.5 10.3 10.5M13.7 13.5l3.1 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  );
}

function VoiceGlyph() {
  return (
    <>
      <rect
        x="6.8"
        y="6.8"
        width="10.4"
        height="10.4"
        rx="1.5"
        transform="rotate(45 12 12)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        className="v4-glyph-anim"
        d="M9 12h.01M12 9.5v5M15 11v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  );
}

/** CRM & internal systems — stacked records with one row lighting up. */
function CrmGlyph() {
  return (
    <>
      <rect x="3.5" y="4" width="17" height="5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="11" width="17" height="5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <path
        className="v4-glyph-anim"
        d="M6.5 18.5h11M6.5 6.5h.01M6.5 13.5h.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  );
}

/** SEO, analytics & growth — a baseline with a rising measured line. */
function GrowthGlyph() {
  return (
    <>
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path
        className="v4-glyph-anim"
        d="M6 16.5 10.5 12l3 2.5L19 8m0 0h-3.4M19 8v3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

const GLYPHS: Record<V4Glyph, () => ReactElement> = {
  site: SiteGlyph,
  discovery: DiscoveryGlyph,
  automation: AutomationGlyph,
  voice: VoiceGlyph,
  crm: CrmGlyph,
  growth: GrowthGlyph,
};

export interface SignalGlyphV4Props {
  glyph: V4Glyph;
  className?: string;
}

export function SignalGlyphV4({ glyph, className }: SignalGlyphV4Props) {
  const Inner = GLYPHS[glyph];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <Inner />
    </svg>
  );
}

export default SignalGlyphV4;
