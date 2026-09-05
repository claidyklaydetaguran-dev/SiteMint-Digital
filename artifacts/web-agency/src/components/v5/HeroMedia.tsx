/**
 * V5 — poster-first hero media container (V5-BLUEPRINT §6/§17).
 *
 * The poster is an inline, abstract Glacier-composed illustration (an SVG,
 * never a photo, generated face, or stock image) — it doubles as the
 * always-rendered base layer and the fallback shown whenever video can't or
 * shouldn't play. An optional `videoSrc` (an owner-approved produced asset)
 * plays over it only:
 *   - at ≥ 768px viewport width,
 *   - after `window.load` *and* an idle tick (`requestIdleCallback`, with a
 *     timeout fallback) — never competing with LCP/hero copy paint,
 *   - and never under `prefers-reduced-motion: reduce`.
 * A caller with no produced video simply omits `videoSrc` and gets the
 * poster only.
 */

import { useEffect, useRef, useState } from "react";

export interface HeroMediaProps {
  /** Optional produced video (owner-approved asset). Omit until one exists. */
  videoSrc?: string;
  /** Accessible label for the poster/video region. */
  label: string;
  className?: string;
}

/**
 * The poster is a Glacier-composed illustration only — no baked-in caption.
 * The single visible label lives in the `.sm-hero-media__badge` below,
 * rendering the caller's actual `label` text; the SVG's own `aria-label`
 * (also the caller's `label`) carries the same words to assistive tech.
 * Two captions saying two different, hardcoded things here was the bug —
 * one accurate label, described twice in two modalities, is correct.
 */
function GlacierPoster({ label }: { label: string }) {
  return (
    <svg
      className="sm-hero-media__poster"
      viewBox="0 0 640 360"
      role="img"
      aria-label={label}
    >
      <rect width="640" height="360" fill="var(--sm-ink-950, #153E52)" />
      <g opacity="0.6" stroke="var(--sm-mint-400, #56D2CF)" strokeWidth="1.4" fill="none">
        <circle cx="120" cy="260" r="5" />
        <circle cx="220" cy="200" r="5" />
        <circle cx="330" cy="215" r="5" />
        <circle cx="440" cy="150" r="5" />
        <circle cx="530" cy="110" r="5" />
        <path d="M120 260 C 190 210, 260 250, 330 215 S 400 160, 440 150 S 500 120, 530 110" />
      </g>
      <g opacity="0.85" fill="var(--sm-mint-500, #32C5D2)">
        <circle cx="120" cy="260" r="2.4" />
        <circle cx="220" cy="200" r="2.4" />
        <circle cx="330" cy="215" r="2.4" />
        <circle cx="440" cy="150" r="2.4" />
        <circle cx="530" cy="110" r="2.4" />
      </g>
    </svg>
  );
}

export function HeroMedia({ videoSrc, label, className }: HeroMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canPlayVideo, setCanPlayVideo] = useState(false);

  useEffect(() => {
    if (!videoSrc) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    function armAfterIdle() {
      if (window.innerWidth < 768) return;
      const requestIdle = (
        window as typeof window & {
          requestIdleCallback?: (cb: () => void) => number;
        }
      ).requestIdleCallback;
      if (typeof requestIdle === "function") {
        idleHandle = requestIdle(() => setCanPlayVideo(true));
      } else {
        // Safari/older browsers have no requestIdleCallback — a short
        // timeout keeps the same "after load, not competing with paint"
        // intent without the API.
        timeoutHandle = setTimeout(() => setCanPlayVideo(true), 200);
      }
    }

    if (document.readyState === "complete") {
      armAfterIdle();
    } else {
      window.addEventListener("load", armAfterIdle, { once: true });
    }

    return () => {
      window.removeEventListener("load", armAfterIdle);
      if (idleHandle !== undefined) {
        (
          window as typeof window & {
            cancelIdleCallback?: (handle: number) => void;
          }
        ).cancelIdleCallback?.(idleHandle);
      }
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, [videoSrc]);

  useEffect(() => {
    if (canPlayVideo) videoRef.current?.play().catch(() => {});
  }, [canPlayVideo]);

  return (
    <div className={["sm-hero-media", className].filter(Boolean).join(" ")}>
      <GlacierPoster label={label} />
      {videoSrc && canPlayVideo && (
        <video
          ref={videoRef}
          className="sm-hero-media__video"
          muted
          playsInline
          loop
          preload="none"
          aria-hidden="true"
        >
          <source src={videoSrc} />
        </video>
      )}
      <span className="sm-hero-media__badge">{label}</span>
    </div>
  );
}

export default HeroMedia;
