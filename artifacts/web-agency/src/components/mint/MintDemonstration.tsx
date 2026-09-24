import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import posterLarge from "@/assets/mint/business-owner.webp";
import posterSmall from "@/assets/mint/business-owner-768.webp";

// The approved homepage film, plus the same film at 960px for narrow screens
// (4.0 MB -> 0.9 MB). Nothing else is ever substituted.
const films = import.meta.glob(
  ["../../assets/mint/home-approved.mp4", "../../assets/mint/home-approved-mobile.mp4"],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

/** Reduced motion, reduced data or the browser's data-saver switch: the
 *  demonstration then waits for the visitor's own play press. */
function prefersStill(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    matchMedia("(prefers-reduced-data: reduce)").matches ||
    Boolean(connection?.saveData)
  );
}

export function MintDemonstration() {
  const [failed, setFailed] = useState(false);
  // True only after a real autoplay attempt was refused by the browser
  // (Low Power Mode, autoplay policy). The control is a genuine user
  // gesture, which is what such policies require.
  const [needsTap, setNeedsTap] = useState(false);
  const [compact] = useState(() => typeof window !== "undefined" && matchMedia("(max-width: 800px)").matches);
  const video = useRef<HTMLVideoElement>(null);
  const src =
    (compact && films["../../assets/mint/home-approved-mobile.mp4"]) ||
    films["../../assets/mint/home-approved.mp4"];
  // A <video poster> cannot carry srcset, so the rendition is chosen here.
  const poster = compact ? posterSmall : posterLarge;

  useEffect(() => {
    const el = video.current;
    if (!el || failed || prefersStill()) return;
    let userPaused = false; // an explicit pause by the visitor wins until they press play again
    let visible = false;
    let autoPausing = false; // tells our own pause() apart from the visitor's
    const tryPlay = () => {
      if (userPaused || !visible || document.hidden) return;
      const attempt = el.play();
      if (attempt) attempt.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    };
    const autoPause = () => {
      if (el.paused) return;
      autoPausing = true;
      el.pause();
    };
    const onPause = () => {
      if (autoPausing) {
        autoPausing = false;
        return;
      }
      // The browser pauses media itself when the tab is hidden; that is
      // not the visitor asking to stop.
      if (document.hidden) return;
      userPaused = true;
    };
    const onPlay = () => {
      userPaused = false;
      setNeedsTap(false);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) tryPlay();
        else autoPause();
      },
      { threshold: 0.35 },
    );
    const onVisibility = () => {
      if (document.hidden) autoPause();
      else tryPlay();
    };
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    document.addEventListener("visibilitychange", onVisibility);
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [failed]);

  const playFromControl = () => {
    const el = video.current;
    if (!el) return;
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => setNeedsTap(true));
  };

  return (
    <section className="section wrap mint-demonstration" id="how-sitemint-works" aria-labelledby="mint-demo-title">
      <div className="section-heading">
        <h2 id="mint-demo-title">See how it comes together.</h2>
        <p>A website that welcomes customers. An app that makes the next step easy. A connected workspace that keeps projects moving.</p>
      </div>
      <div className="mint-demonstration__stage">
        {src && !failed ? (
          <video
            ref={video}
            muted
            loop
            controls
            playsInline
            preload="metadata"
            poster={poster}
            onError={() => setFailed(true)}
            aria-label="SiteMint digital services demonstration"
            src={src}
          />
        ) : (
          <img
            src={posterLarge}
            srcSet={`${posterSmall} 768w, ${posterLarge} 1536w`}
            sizes="(max-width: 800px) calc(100vw - 48px), min(1260px, 90vw)"
            width="1536"
            height="1024"
            alt="A business owner working at her laptop in a bright studio"
            loading="lazy"
            decoding="async"
          />
        )}
        {needsTap && !failed && (
          <button type="button" className="mint-demonstration__play" onClick={playFromControl}>
            <Play size={20} aria-hidden="true" />
            Play the demonstration
          </button>
        )}
      </div>
      <p className="mint-demonstration__caption">An illustrative journey through websites, apps and connected business systems.</p>
    </section>
  );
}
