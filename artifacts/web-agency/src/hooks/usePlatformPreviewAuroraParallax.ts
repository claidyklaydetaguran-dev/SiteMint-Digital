import { useEffect, useRef } from "react";

/**
 * Single rAF-driven pointer-parallax controller for the /platform-preview
 * navbar-plus-hero aurora. Writes eased, normalized (-1..1) pointer
 * coordinates as CSS custom properties (`--pp-aurora-x`, `--pp-aurora-y`)
 * directly on `rootRef`'s element via `style.setProperty` — no React state,
 * so pointer movement never triggers a re-render. Because CSS custom
 * properties inherit, setting them here (the page-shell root, which wraps
 * both the navbar and the hero) is enough for every descendant decorative
 * layer — including the ones inside PlatformHero's own AuroraBackground —
 * to read the same values without a second controller instance.
 *
 * Desktop-mouse only: `pointerType !== "mouse"` events are ignored (same
 * guard used elsewhere in this tree), so trackpads-as-touch and real touch
 * input never drive this. Disabled entirely — no listeners attached — when
 * the primary input is coarse (`pointer: coarse`) or the user prefers
 * reduced motion; the reduced-motion query is re-checked live so toggling
 * the OS setting mid-session takes effect immediately.
 */
export function usePlatformPreviewAuroraParallax(rootRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const activeRef = useRef(enabled);
  activeRef.current = enabled;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;

    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (coarseQuery.matches || reducedMotionQuery.matches) return;

    let rafId: number | null = null;
    let rect = root.getBoundingClientRect();
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let settled = true;

    function updateRect() {
      rect = root!.getBoundingClientRect();
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !activeRef.current) return;
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      targetX = Math.min(1, Math.max(-1, nx));
      targetY = Math.min(1, Math.max(-1, ny));
      settled = false;
      ensureLoop();
    }

    function onPointerLeave(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      targetX = 0;
      targetY = 0;
      settled = false;
      ensureLoop();
    }

    function ensureLoop() {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function tick() {
      rafId = null;
      const ease = 0.08;
      const nextX = currentX + (targetX - currentX) * ease;
      const nextY = currentY + (targetY - currentY) * ease;
      const delta = Math.abs(nextX - currentX) + Math.abs(nextY - currentY);
      currentX = nextX;
      currentY = nextY;
      root!.style.setProperty("--pp-aurora-x", currentX.toFixed(4));
      root!.style.setProperty("--pp-aurora-y", currentY.toFixed(4));

      if (delta > 0.0005) {
        rafId = requestAnimationFrame(tick);
      } else {
        settled = true;
      }
    }

    window.addEventListener("resize", updateRect, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave, { passive: true });

    function onReducedMotionChange() {
      if (reducedMotionQuery.matches) {
        targetX = 0;
        targetY = 0;
        currentX = 0;
        currentY = 0;
        root!.style.setProperty("--pp-aurora-x", "0");
        root!.style.setProperty("--pp-aurora-y", "0");
        root!.removeEventListener("pointermove", onPointerMove);
        root!.removeEventListener("pointerleave", onPointerLeave);
      }
    }
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateRect);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      void settled;
    };
  }, [rootRef]);
}
