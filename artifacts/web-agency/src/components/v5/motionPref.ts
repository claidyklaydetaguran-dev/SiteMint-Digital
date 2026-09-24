/**
 * Motion policy (owner directive 2026-09-09 — the visible switch is gone).
 *
 * SiteMint used to surface a "Reduce animation" switch in the navigation,
 * persisted as localStorage["sm-motion"]. It was removed because:
 *  - the operating system's `prefers-reduced-motion` already expresses the
 *    same intent, is honoured automatically, and travels with the visitor;
 *  - a value left at "off" in one browser silently froze the hero film and
 *    the particle journey on every later visit, with nothing on screen to
 *    explain why or undo it.
 *
 * Accessibility is unchanged: every decorative film and the particle drift
 * still stand down under `prefers-reduced-motion: reduce`, and the hero
 * renders its complete static composition instead of an empty field.
 *
 * These exports remain so the eligibility gates keep one shared vocabulary,
 * but the preference is now always "on": motion is governed solely by the
 * media query. `purgeLegacyMotionPref()` runs once at boot to delete any
 * stored "off" left over from the old switch, so no returning visitor is
 * stuck with a frozen hero.
 */

const LEGACY_KEY = "sm-motion";
export const MOTION_EVENT = "sm-motion-change";

/** Always false — motion is governed by `prefers-reduced-motion` alone. */
export function motionOff(): boolean {
  return false;
}

/**
 * One-time cleanup of the retired preference: removes the stored value and
 * clears the attribute it used to drive, so a stale "off" can never keep
 * animation suppressed. Safe to call repeatedly; touches nothing else.
 */
export function purgeLegacyMotionPref(): void {
  try {
    if (localStorage.getItem(LEGACY_KEY) !== null) {
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    /* private mode / storage disabled — the attribute reset below still applies */
  }
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.smMotion;
  }
}

/** Retained for call-site compatibility; motion is never suppressed now. */
export function applyMotionAttr(): void {
  purgeLegacyMotionPref();
}

/**
 * Retained so eligibility gates can keep their subscribe/unsubscribe shape.
 * No user-facing control emits this event any more, so the callback never
 * fires; the returned unsubscribe is still safe to call.
 */
export function onMotionChange(_cb: (off: boolean) => void): () => void {
  return () => {};
}
