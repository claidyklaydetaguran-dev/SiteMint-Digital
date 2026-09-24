/**
 * V5 — real-product-evidence frame (owner directive 2026-09: "more visual,
 * more real product evidence"). Wraps one of the eight real preview captures
 * in `assets/product/*.png` in a lightweight browser-chrome frame so it reads
 * as "a real interface", not a screenshot pasted onto the page.
 *
 * Honesty rule: every caller supplies its own caption naming the surface and
 * stating the data is preview/fixture data — this component never invents
 * one. All eight source captures are 2560×1600 (see the asset import), so a
 * single fixed aspect-ratio keeps every usage CLS-safe without per-caller
 * math.
 */

import { useEffect, useRef, useState } from "react";

const CAPTURE_WIDTH = 2560;
const CAPTURE_HEIGHT = 1600;

export interface BrowserFrameProps {
  /** Vite-resolved asset URL (import a .png from assets/product). */
  src: string;
  /** Describes what is actually shown — no marketing language. */
  alt: string;
  /** Visible caption under the frame, e.g. "SiteMint dashboard — preview data". */
  caption: string;
  /** Optional short label shown in the frame's address bar, e.g. "/dashboard/appointments". */
  addressLabel?: string;
  loading?: "lazy" | "eager";
  className?: string;
}

export function BrowserFrame({
  src,
  alt,
  caption,
  addressLabel,
  loading = "lazy",
  className,
}: BrowserFrameProps) {
  // Fade-in on decode (CSS-gated to `prefers-reduced-motion: no-preference`,
  // see v5-pages.css) rather than a spinner — the fixed aspect-ratio box
  // below already reserves the exact space, so this never causes CLS. Reads
  // `.complete` in case the browser served the image from cache before
  // React attached the load listener.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <figure className={["sm-browser-frame", className].filter(Boolean).join(" ")}>
      <div className="sm-browser-frame__chrome" aria-hidden="true">
        <span className="sm-browser-frame__dot" />
        <span className="sm-browser-frame__dot" />
        <span className="sm-browser-frame__dot" />
        {addressLabel && (
          <span className="sm-browser-frame__address">{addressLabel}</span>
        )}
      </div>
      <div className="sm-browser-frame__viewport">
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          width={CAPTURE_WIDTH}
          height={CAPTURE_HEIGHT}
          className={`sm-browser-frame__img${loaded ? " sm-is-loaded" : ""}`}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <figcaption className="sm-browser-frame__caption">{caption}</figcaption>
    </figure>
  );
}

export default BrowserFrame;
