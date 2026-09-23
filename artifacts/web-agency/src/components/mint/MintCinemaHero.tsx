import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ownerPoster from "@/assets/mint/leaf-hero-poster.webp";
import receptionPoster from "@/assets/mint/reception-poster.webp";
import "./mint-cinema.css";

// Only reviewed films with these names are included. No unrelated stock clip
// fallback. The "-mobile" files are the SAME approved films re-encoded at
// 960px with short keyframe intervals, so a phone scrubs smoothly on roughly
// a sixth of the bytes (leaf hero 5.5 MB -> 0.9 MB, reception 1.5 MB -> 0.2 MB).
const films = import.meta.glob(
  ["../../assets/mint/*-approved.mp4", "../../assets/mint/*-approved-mobile.mp4"],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

type MotionPolicy = { motion: boolean; compact: boolean };

type ConnectionHints = {
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

/**
 * Motion runs unless the visitor asked for reduced motion or reduced data
 * (media query or the browser's data-saver switch). Viewport width only
 * selects the rendition; it never decides whether motion runs. A narrow
 * screen that can play video gets the same story as a desktop.
 */
function useMotionPolicy(): MotionPolicy {
  const [policy, setPolicy] = useState<MotionPolicy>({ motion: false, compact: false });
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const reducedData = matchMedia("(prefers-reduced-data: reduce)");
    const compact = matchMedia("(max-width: 800px)");
    const connection = (navigator as Navigator & { connection?: ConnectionHints }).connection;
    const update = () =>
      setPolicy({
        motion: !reduced.matches && !reducedData.matches && !connection?.saveData,
        compact: compact.matches,
      });
    update();
    for (const query of [reduced, reducedData, compact]) query.addEventListener("change", update);
    connection?.addEventListener?.("change", update);
    return () => {
      for (const query of [reduced, reducedData, compact]) query.removeEventListener("change", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);
  return policy;
}

export function MintCinemaHero({ receptionist = false }: { receptionist?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const manuallyPaused = useRef(false);
  const inView = useRef(false);
  const [failed, setFailed] = useState(false);
  const { motion, compact } = useMotionPolicy();
  const name = receptionist ? "reception" : "leaf-hero";
  const src =
    (compact && films[`../../assets/mint/${name}-approved-mobile.mp4`]) ||
    films[`../../assets/mint/${name}-approved.mp4`];
  const poster = receptionist ? receptionPoster : ownerPoster;
  // The poster always paints first; the film mounts only once the policy is
  // known, so the first frame is never blank and reduced-motion / data-saver
  // visitors never download a film at all.
  const active = Boolean(src && !failed && motion);

  // Receptionist page: ambient background loop while the hero is on screen.
  // Autoplay may be refused (Low Power Mode, browser policy); the play/pause
  // control below then offers the same film on a real tap.
  useEffect(() => {
    const film = video.current;
    const root = section.current;
    if (!film || !root || !active || !receptionist) return;
    const attempt = () => {
      if (!inView.current || manuallyPaused.current || document.hidden) return;
      const request = film.play();
      if (request) request.catch(() => setPlaying(false));
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
        if (entry.isIntersecting) attempt();
        else film.pause();
      },
      { threshold: 0.15 },
    );
    observer.observe(root);
    const onVisibility = () => {
      if (document.hidden) film.pause();
      else attempt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      film.pause();
    };
  }, [active, receptionist, src]);

  // Homepage: the film is scrubbed by scroll position while the frame is
  // sticky. Works from touch, wheel, keyboard and momentum scrolling because
  // it only reads the section's position on each animation frame. Viewport
  // height changes (address bar, rotation, resize) re-measure on the fly.
  useEffect(() => {
    const film = video.current;
    const root = section.current;
    if (!film || !root || !active || receptionist) return;
    let frame = 0;
    let targetTime = 0;
    const seek = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / distance));
      if (Number.isFinite(film.duration) && film.duration > 0) {
        targetTime = progress * Math.max(0, film.duration - 0.05);
        if (!film.seeking && Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };
    const settle = () => {
      if (Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime;
    };
    film.addEventListener("seeked", settle);
    film.addEventListener("loadedmetadata", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      film.removeEventListener("seeked", settle);
      film.removeEventListener("loadedmetadata", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [active, receptionist, src]);

  const scrub = active && !receptionist;
  const togglePlayback = () => {
    const film = video.current;
    if (!film) return;
    manuallyPaused.current = playing;
    if (playing) film.pause();
    else film.play().catch(() => setPlaying(false));
  };
  return (
    <section
      ref={section}
      className={`mint-cinema ${!receptionist ? "mint-cinema--leaf" : ""} ${scrub ? "mint-cinema--scrub" : ""}`}
      aria-label={receptionist ? "SiteMint AI receptionist" : "Meet SiteMint Digital"}
    >
      <div className="mint-cinema__frame">
        <img className="mint-cinema__media" src={poster} alt="" fetchPriority="high" decoding="async" />
        {active && (
          <video
            key={src}
            ref={video}
            className="mint-cinema__media"
            src={src}
            poster={poster}
            muted
            playsInline
            loop={receptionist}
            // Scrubbing needs buffered frames; the small mobile rendition is
            // cheap enough to fetch ahead. Desktop keeps metadata-only and
            // streams as the visitor scrolls. The ambient loop streams too.
            preload={scrub && compact ? "auto" : "metadata"}
            disableRemotePlayback
            onError={() => setFailed(true)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            aria-hidden="true"
            tabIndex={-1}
          />
        )}
        <div className="mint-cinema__shade" />
        <div className="mint-cinema__copy">
          <p className="mint-cinema__eyebrow">
            {receptionist ? "SiteMint AI Receptionist" : "Websites, apps and connected systems"}
          </p>
          <h1>
            {receptionist ? (
              <>
                A helpful voice.
                <br />
                More room for your day.
              </>
            ) : (
              <>
                A fresh start
                <br />
                for your business.
              </>
            )}
          </h1>
          <p className="mint-cinema__intro">
            {receptionist
              ? "Give every caller a clear next step. An assistant shaped around your services, your calendar and your team."
              : "Websites, apps and connected systems. Thoughtfully designed. Built around you."}
          </p>
          <div className="actions">
            <a className="button" href={receptionist ? "/start?service=ai-receptionist" : "/discovery"}>
              {receptionist ? "Get started" : "Let’s build your next chapter"}
            </a>
            <a className="button outline" href={receptionist ? "#example" : "#how-sitemint-works"}>
              {receptionist ? "See how it works" : "Explore SiteMint"}
            </a>
          </div>
          {receptionist && (
            <a className="mint-cinema__signin" href="/ai-receptionist/dashboard/login">
              Already with SiteMint? Sign in
            </a>
          )}
        </div>
        <div className="mint-cinema__foot">
          <span>{scrub ? "Scroll to follow the story" : "Thoughtfully designed. Set up with you."}</span>
          <a href={receptionist ? "#example" : "#how-sitemint-works"}>Explore below ↓</a>
        </div>
        {active && receptionist && (
          <button
            type="button"
            className="mint-cinema__pause"
            aria-label={playing ? "Pause background video" : "Play background video"}
            aria-pressed={playing}
            title={playing ? "Pause video" : "Play video"}
            onClick={togglePlayback}
          >
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
    </section>
  );
}
