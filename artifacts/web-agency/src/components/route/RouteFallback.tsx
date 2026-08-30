/**
 * Frontend V2 — route-level loading fallback (Phase 1).
 *
 * Replaces the app's previous `<Suspense fallback={null}>` usages, which
 * rendered nothing at all while a lazy chunk loaded — a blank screen, and a
 * layout jump when content finally arrived.
 *
 * Requirements this satisfies:
 * - Stable dimensions: the skeleton reserves viewport-height space so the page
 *   does not collapse and then re-expand (CLS).
 * - Never blocks content already available: it is rendered *inside* a route
 *   boundary, so a shell/header rendered above it stays visible and readable.
 * - Announced politely, and marked `aria-busy` so assistive technology knows
 *   the region is loading rather than empty.
 * - Honours `prefers-reduced-motion` — the shimmer is purely decorative and is
 *   disabled entirely under `reduce` (see index.css).
 */

interface RouteFallbackProps {
  /** Accessible description of what is loading. */
  label?: string;
}

export function RouteFallback({ label = "Loading page" }: RouteFallbackProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="v2-route-fallback"
      data-testid="route-fallback"
    >
      <span className="v2-visually-hidden">{label}…</span>
      <div className="v2-route-fallback__inner" aria-hidden="true">
        <div className="v2-skeleton v2-route-fallback__eyebrow" />
        <div className="v2-skeleton v2-route-fallback__title" />
        <div className="v2-skeleton v2-route-fallback__line" />
        <div className="v2-skeleton v2-route-fallback__line v2-route-fallback__line--short" />
      </div>
    </div>
  );
}

export default RouteFallback;
