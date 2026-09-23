import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ownerPoster from "@/assets/mint/leaf-hero-poster.webp";
import receptionPoster from "@/assets/mint/reception-poster.webp";
import { MintArrow } from "./MintArrow";
import "./mint-cinema.css";

// Only reviewed films with these names are included. No unrelated stock clip
// fallback. The "-mobile" files are the SAME approved films re-encoded at
// 960px with short keyframe intervals, so a phone scrubs smoothly on roughly
// a sixth of the bytes (leaf hero 5.5 MB -> 0.9 MB, reception 1.5 MB -> 0.2 MB).
const films = import.meta.glob(
  ["../../assets/mint/*-approved.mp4", "../../assets/mint/*-approved-mobile.mp4"],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

// Scroll fallback (launch follow-up, 2026-09-24): 36 frames of the SAME
// approved leaf film (2.4 per second, 720 px, ~8 KB each, 283 KB in total).
// Used only when the browser refuses to play or seek the film — iOS Safari
// in Low Power Mode, or a media stack that never reports metadata.
const frameUrls = Object.entries(
  import.meta.glob("../../assets/mint/frames/leaf-*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

type MotionPolicy = { motion: boolean; compact: boolean; reduced: boolean; saveData: boolean };
type Mode = "video" | "frames";

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
  const [policy, setPolicy] = useState<MotionPolicy>({ motion: false, compact: false, reduced: false, saveData: false });
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const reducedData = matchMedia("(prefers-reduced-data: reduce)");
    const compact = matchMedia("(max-width: 800px)");
    const connection = (navigator as Navigator & { connection?: ConnectionHints }).connection;
    const update = () => {
      const saveData = reducedData.matches || Boolean(connection?.saveData);
      setPolicy({ motion: !reduced.matches && !saveData, compact: compact.matches, reduced: reduced.matches, saveData });
    };
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

type Debug = Record<string, string | number | boolean | null>;

export function MintCinemaHero({ receptionist = false }: { receptionist?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const manuallyPaused = useRef(false);
  const inView = useRef(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("video");
  const [frameIndex, setFrameIndex] = useState(0);
  const [framesReady, setFramesReady] = useState(false);
  const [primed, setPrimed] = useState(false);
  const [debug, setDebug] = useState<Debug | null>(null);
  const { motion, compact, reduced, saveData } = useMotionPolicy();
  const name = receptionist ? "reception" : "leaf-hero";
  const src =
    (compact && films[`../../assets/mint/${name}-approved-mobile.mp4`]) ||
    films[`../../assets/mint/${name}-approved.mp4`];
  const poster = receptionist ? receptionPoster : ownerPoster;
  // The poster always paints first; the film mounts only once the policy is
  // known, so the first frame is never blank and reduced-motion / data-saver
  // visitors never download a film at all.
  const active = Boolean(src && !failed && motion);
  const scrub = active && !receptionist;
  const useFrames = scrub && mode === "frames" && frameUrls.length > 0;
  const wantDebug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("herodebug") === "1";

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
  //
  // Safari (macOS and iOS) does not paint a <video> frame for a currentTime
  // change until playback has started once, and iOS ignores `preload` until
  // load() or play() is called. So the film is PRIMED: load(), then a muted
  // inline play() that is paused again on the very next tick. Muted inline
  // playback needs no gesture except in Low Power Mode, where play() rejects;
  // that rejection, a media error, or metadata that never arrives switches
  // the hero to the frame sequence instead of leaving a dead poster.
  useEffect(() => {
    const film = video.current;
    const root = section.current;
    if (!film || !root || !scrub || mode !== "video") return;
    let frame = 0;
    let targetTime = 0;
    let disposed = false;
    let primedLocal = false;
    let fallbackTimer = 0;
    const dbg = (extra: Debug = {}) => {
      if (!wantDebug) return;
      setDebug({
        mode: "video",
        primed: primedLocal,
        readyState: film.readyState,
        networkState: film.networkState,
        duration: Number.isFinite(film.duration) ? Number(film.duration.toFixed(2)) : null,
        currentTime: Number(film.currentTime.toFixed(2)),
        target: Number(targetTime.toFixed(2)),
        error: film.error ? `${film.error.code}` : null,
        src: (film.currentSrc || "").split("/").pop() ?? "",
        reduced,
        saveData,
        ...extra,
      });
    };
    const toFrames = (reason: string) => {
      if (disposed) return;
      dbg({ fallback: reason });
      setMode("frames");
    };
    const seek = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / distance));
      if (primedLocal && Number.isFinite(film.duration) && film.duration > 0) {
        targetTime = progress * Math.max(0, film.duration - 0.05);
        if (!film.seeking && Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime;
      }
      dbg({ progress: Number(progress.toFixed(3)) });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };
    const settle = () => {
      if (Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime;
    };
    const prime = () => {
      if (primedLocal || disposed) return;
      film.muted = true;
      const request = film.play();
      if (!request) {
        primedLocal = true;
        setPrimed(true);
        schedule();
        return;
      }
      request
        .then(() => {
          film.pause();
          primedLocal = true;
          window.clearTimeout(fallbackTimer);
          setPrimed(true);
          schedule();
        })
        .catch((error: unknown) => toFrames(`play rejected: ${error instanceof Error ? error.name : String(error)}`));
    };
    const onError = () => toFrames(`media error ${film.error?.code ?? "?"}`);
    film.addEventListener("seeked", settle);
    film.addEventListener("loadedmetadata", prime);
    film.addEventListener("error", onError);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    // iOS fetches nothing until asked; load() starts the metadata request.
    try {
      film.load();
    } catch {
      /* not fatal */
    }
    if (film.readyState >= 1) prime();
    // Metadata that never arrives (iOS with playback blocked, a broken range
    // response) must not leave a dead poster: try to play anyway after 4 s,
    // and give up to the frames after 9 s.
    fallbackTimer = window.setTimeout(() => {
      if (primedLocal || disposed) return;
      prime();
      fallbackTimer = window.setTimeout(() => {
        if (!primedLocal && !disposed) toFrames("no metadata within 9s");
      }, 5000);
    }, 4000);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
      film.removeEventListener("seeked", settle);
      film.removeEventListener("loadedmetadata", prime);
      film.removeEventListener("error", onError);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub, mode, src]);

  // Frame-sequence fallback: preload the frames, then swap by scroll progress.
  useEffect(() => {
    const root = section.current;
    if (!root || !useFrames) return;
    let disposed = false;
    let frame = 0;
    let loaded = 0;
    for (const url of frameUrls) {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        loaded += 1;
        if (loaded === frameUrls.length && !disposed) setFramesReady(true);
      };
      img.src = url;
    }
    const seek = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / distance));
      const index = Math.min(frameUrls.length - 1, Math.round(progress * (frameUrls.length - 1)));
      setFrameIndex(index);
      if (wantDebug) setDebug({ mode: "frames", frame: index, frames: frameUrls.length, loaded, progress: Number(progress.toFixed(3)), reduced, saveData });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFrames]);

  const togglePlayback = () => {
    const film = video.current;
    if (!film) return;
    manuallyPaused.current = playing;
    if (playing) film.pause();
    else film.play().catch(() => setPlaying(false));
  };
  const anchor = receptionist ? "#example" : "#how-sitemint-works";
  return (
    <section
      ref={section}
      className={`mint-cinema ${!receptionist ? "mint-cinema--leaf" : ""} ${scrub ? "mint-cinema--scrub" : ""}`}
      aria-label={receptionist ? "SiteMint AI receptionist" : "Meet SiteMint Digital"}
      data-hero-mode={!active ? "still" : useFrames ? "frames" : primed || receptionist ? "video" : "priming"}
    >
      <div className="mint-cinema__frame">
        <img className="mint-cinema__media" src={poster} alt="" fetchPriority="high" decoding="async" />
        {useFrames && framesReady && (
          <img className="mint-cinema__media mint-cinema__frame-image" src={frameUrls[frameIndex]} alt="" decoding="sync" />
        )}
        {active && !useFrames && (
          <video
            key={src}
            ref={video}
            className={`mint-cinema__media ${scrub && !primed ? "mint-cinema__media--pending" : ""}`}
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
            onError={() => (scrub ? setMode("frames") : setFailed(true))}
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
            <a className="button outline" href={anchor}>
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
          <a href={anchor}>
            Explore below <MintArrow direction="down" size={13} />
          </a>
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
        {wantDebug && (
          <pre className="mint-cinema__debug" aria-hidden="true">
            {JSON.stringify(
              { ...(debug ?? { mode, primed }), active, compact, ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 90) : "" },
              null,
              1,
            )}
          </pre>
        )}
      </div>
    </section>
  );
}
