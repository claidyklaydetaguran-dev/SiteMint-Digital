/**
 * Frontend V2 — dashboard route loading fallback (Phase 1).
 *
 * The helpdesk previously had zero code splitting (17 eager page imports), so
 * there was no loading state to design. Now that each page is lazy, every route
 * group needs a fallback that reserves stable geometry rather than collapsing
 * the layout while a chunk arrives.
 *
 * Built from the app's existing Tailwind tokens so it inherits light/dark
 * theming automatically and adds no new CSS layer.
 */

interface RouteFallbackProps {
  label?: string;
}

export function RouteFallback({ label = "Loading" }: RouteFallbackProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[60vh] w-full flex-col gap-4 p-6"
      data-testid="route-fallback"
    >
      <span className="sr-only">{label}…</span>
      {/* `motion-safe:` keeps the pulse off under prefers-reduced-motion. */}
      <div
        aria-hidden="true"
        className="h-8 w-56 rounded-md bg-muted motion-safe:animate-pulse"
      />
      <div
        aria-hidden="true"
        className="h-4 w-full max-w-2xl rounded-md bg-muted motion-safe:animate-pulse"
      />
      <div
        aria-hidden="true"
        className="h-4 w-full max-w-md rounded-md bg-muted motion-safe:animate-pulse"
      />
      <div
        aria-hidden="true"
        className="h-48 w-full rounded-lg bg-muted motion-safe:animate-pulse"
      />
    </div>
  );
}

export default RouteFallback;
