/**
 * Frontend V3 (R1) — the hero theater's atmospheric media.
 *
 * Renders the static poster immediately (so the hero never waits on video
 * bytes), then upgrades to the silent Magnific Signal Loop only when every
 * condition holds:
 *
 *  - `prefers-reduced-motion: no-preference` — reduced-motion users keep the
 *    static poster permanently (and are downgraded live if the preference
 *    changes mid-session);
 *  - viewport ≥ 768px — phones keep the poster (bytes + battery);
 *  - the connection is not in data-saver mode;
 *  - the browser has gone idle after load (requestIdleCallback, with a
 *    setTimeout fallback), so the loop can never compete with hero content.
 *
 * The video element is muted, loops, plays inline, and is purely decorative
 * (aria-hidden, no controls). Every piece of real content stays DOM above it.
 */

import { useEffect, useState } from "react";

interface SignalLoopMediaProps {
  poster: string;
  src: string;
}

export function SignalLoopMedia({ poster, src }: SignalLoopMediaProps) {
  const [playLoop, setPlayLoop] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const wide = window.matchMedia("(min-width: 768px)");
    type ConnectionInfo = { saveData?: boolean };
    const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;

    const eligible = () =>
      motion.matches && wide.matches && connection?.saveData !== true;

    let idleHandle: number | undefined;
    let timerHandle: number | undefined;

    const arm = () => {
      if (!eligible()) return;
      const start = () => {
        if (eligible()) setPlayLoop(true);
      };
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(start, { timeout: 4000 });
      } else {
        timerHandle = window.setTimeout(start, 1500);
      }
    };

    // Live downgrade: if reduced motion is enabled mid-session, drop back to
    // the static poster instantly.
    const onMotionChange = () => {
      if (!motion.matches) setPlayLoop(false);
      else arm();
    };
    motion.addEventListener("change", onMotionChange);
    arm();

    return () => {
      motion.removeEventListener("change", onMotionChange);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timerHandle !== undefined) window.clearTimeout(timerHandle);
    };
  }, []);

  if (!playLoop) {
    return (
      <img
        className="v3m-theater__poster"
        src={poster}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="low"
      />
    );
  }

  return (
    <video
      className="v3m-theater__poster"
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

export default SignalLoopMedia;
