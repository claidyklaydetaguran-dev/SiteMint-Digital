/**
 * AI Receptionist V5 — shared motion utilities for the hero redesign and the
 * cinematic scroll motifs threaded through the rest of the page (owner
 * directive, 2026-09-05 full-screen hero + product motion pass).
 *
 * Two small hooks, both consumed from `AiReceptionistV5.tsx` and
 * `CallTheaterV5.tsx`:
 *
 * - `usePausableAmbient` — for CONTINUOUS ambient loops (the hero's call-ring
 *   pulse, its waveform bars, the scroll cue, the call theater's idle
 *   breathing ring). Sets `data-ambient-paused` on the observed element
 *   whenever the tab is hidden OR the element is scrolled offscreen, so CSS
 *   can flip `animation-play-state: paused`. Never removes the element or
 *   its content — only pauses the loop.
 * - `useArmedReveal` — for ONE-SHOT, reveal-once scroll motifs that must NOT
 *   use opacity (the hero headline's masked line reveal, and any other motif
 *   built on clip-path/stroke-dashoffset/transform instead of opacity).
 *   Mirrors `components/v5/Reveal.tsx`'s progressive-enhancement contract:
 *   the element renders at its final, fully visible state with NO class/data
 *   attribute until this hook's mount effect runs, so nothing is ever stuck
 *   invisible if IntersectionObserver is unavailable or a later effect never
 *   fires. Only after mount does `armed` flip true (arming the hidden
 *   at-rest state in CSS); `revealed` then flips true once the element is in
 *   view (or immediately under reduced motion / without observer support).
 */

import { useEffect, useRef, useState, type RefObject } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Mount an ambient loop's play/pause gate onto a ref'd element. */
export function usePausableAmbient<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    let hidden = typeof document !== "undefined" && document.visibilityState !== "visible";
    let offscreen = false;

    function apply() {
      if (!node) return;
      if (hidden || offscreen) node.setAttribute("data-ambient-paused", "true");
      else node.removeAttribute("data-ambient-paused");
    }

    function onVisibility() {
      hidden = document.visibilityState !== "visible";
      apply();
    }
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) offscreen = !entry.isIntersecting;
          apply();
        },
        { threshold: 0.01 },
      );
      observer.observe(node);
    }

    apply();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  return ref;
}

export interface UseArmedRevealResult<T extends Element> {
  ref: RefObject<T | null>;
  /** True once mounted — gates adding the CSS class/attribute that hides the
   *  element at rest. Content is always visible before this flips. */
  armed: boolean;
  /** True once revealed (in view, or immediately under reduced motion / no
   *  observer support). */
  revealed: boolean;
}

/** Reveal-once gate for opacity-free (clip-path / transform / stroke-dashoffset)
 *  motifs — the LCP-safe counterpart to `useRevealV5` in `components/v5/Reveal.tsx`.
 *  Bound to `Element` (not `HTMLElement`) so SVG targets — every glyph motif
 *  in `AiReceptionistV5.tsx` (`AvailabilitySlotGlyph`, `ConfirmCheckGlyph`)
 *  — can use it directly. */
/** Entrance for the hero headline specifically. The headline's at-rest armed
 *  state is `clip-path: inset(0 0 100%)`, and Chromium factors the target's
 *  own clip-path into IntersectionObserver's intersectionRect — a fully
 *  clipped element reports ratio 0 forever, so an observer-based reveal
 *  deadlocks (measured live: armed class applied, `--in` never landed).
 *  Since the headline is always first-viewport content, reveal it on a short
 *  post-arm timer instead; reduced motion stays fully static via `armed`
 *  never flipping. */
export function useHeadlineEntrance<T extends Element>(): UseArmedRevealResult<T> {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    setArmed(true);
    const timer = setTimeout(() => setRevealed(true), 180);
    return () => clearTimeout(timer);
  }, []);

  return { ref, armed, revealed: prefersReducedMotion() ? true : revealed };
}

export function useArmedReveal<T extends Element>(
  threshold = 0.2,
): UseArmedRevealResult<T> {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    setArmed(true);
    return undefined;
  }, []);

  useEffect(() => {
    if (!armed) return undefined;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, threshold]);

  return { ref, armed, revealed: prefersReducedMotion() ? true : revealed };
}
