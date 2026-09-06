/**
 * Global Motion preference (owner final polish directive, 2026-09-06).
 *
 * Decorative films no longer carry per-video pause buttons — WCAG 2.2.2's
 * pause/stop/hide requirement is met instead by (a) the reduced-motion
 * media query, which keeps every decorative video from mounting at all,
 * and (b) this single discreet site-wide Motion preference, surfaced in
 * the footer, well away from any film surface.
 *
 * "Off" means: every `video[data-sm-decorative-film]` is unmounted by its
 * eligibility gate (posters remain), and `html[data-sm-motion="off"]`
 * pauses CSS animations (rule in v5-remap.css). The preference persists in
 * localStorage and applies before the gates evaluate on later visits.
 */

const KEY = "sm-motion";
export const MOTION_EVENT = "sm-motion-change";

export function motionOff(): boolean {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export function setMotionOff(off: boolean): void {
  try {
    localStorage.setItem(KEY, off ? "off" : "on");
  } catch {
    /* private mode — the in-page state still applies below */
  }
  applyMotionAttr(off);
  window.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: { off } }));
}

export function applyMotionAttr(off: boolean = motionOff()): void {
  document.documentElement.dataset.smMotion = off ? "off" : "on";
}

/** Subscribe an eligibility gate to live preference flips. */
export function onMotionChange(cb: (off: boolean) => void): () => void {
  const handler = (e: Event) => cb(Boolean((e as CustomEvent).detail?.off));
  window.addEventListener(MOTION_EVENT, handler);
  return () => window.removeEventListener(MOTION_EVENT, handler);
}
