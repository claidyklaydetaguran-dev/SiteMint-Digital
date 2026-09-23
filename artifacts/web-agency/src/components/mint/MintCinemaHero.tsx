import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ownerPoster from "@/assets/mint/leaf-hero-poster.webp";
import receptionPoster from "@/assets/mint/reception-poster.webp";
import "./mint-cinema.css";

// Only reviewed films with these names are included. No unrelated stock clip fallback.
const films = import.meta.glob("../../assets/mint/*-approved.mp4", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function MintCinemaHero({ receptionist = false }: { receptionist?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const manuallyPaused = useRef(false);
  const [failed, setFailed] = useState(false);
  const [motion, setMotion] = useState(false);
  const src = films[`../../assets/mint/${receptionist ? "reception" : "leaf-hero"}-approved.mp4`];
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: no-preference) and (min-width: 801px)");
    const update = () => setMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const film = video.current;
    const root = section.current;
    if (!film || !root || !src || failed || !motion) return;
    if (receptionist) {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !manuallyPaused.current) film.play().catch(() => setPlaying(false));
        else film.pause();
      }, { threshold: 0.15 });
      observer.observe(root);
      return () => { observer.disconnect(); film.pause(); };
    }
    let frame = 0;
    let targetTime = 0;
    const seek = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, root.offsetHeight - innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / distance));
      if (Number.isFinite(film.duration)) {
        targetTime = progress * Math.max(0, film.duration - 0.05);
        if (!film.seeking && Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime;
      }
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(seek); };
    const settle = () => { if (Math.abs(film.currentTime - targetTime) > 0.04) film.currentTime = targetTime; };
    film.addEventListener("seeked", settle);
    film.addEventListener("loadedmetadata", scroll);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    scroll();
    return () => { cancelAnimationFrame(frame); film.removeEventListener("seeked", settle); film.removeEventListener("loadedmetadata", scroll); window.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); };
  }, [src, receptionist, motion, failed]);
  const active = Boolean(src && !failed && motion);
  return <section ref={section} className={`mint-cinema ${!receptionist ? "mint-cinema--leaf" : ""} ${!receptionist && active ? "mint-cinema--scrub" : ""}`} aria-label={receptionist ? "SiteMint AI receptionist" : "Meet SiteMint Digital"}>
    <div className="mint-cinema__frame">
      <img className="mint-cinema__media" src={receptionist ? receptionPoster : ownerPoster} alt="" fetchPriority="high" />
      {active && <video ref={video} className="mint-cinema__media" src={src} muted playsInline loop={receptionist} preload="metadata" onError={() => setFailed(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-hidden="true" />}
      <div className="mint-cinema__shade" />
      <div className="mint-cinema__copy">
        <p className="mint-cinema__eyebrow">{receptionist ? "SiteMint AI Receptionist" : "Websites, apps and connected systems"}</p>
        <h1>{receptionist ? <>A helpful voice.<br />More room for your day.</> : <>A fresh start<br />for your business.</>}</h1>
        <p className="mint-cinema__intro">{receptionist ? "Give every caller a clear next step. An assistant shaped around your services, your calendar and your team." : "Websites, apps and connected systems. Thoughtfully designed. Built around you."}</p>
        <div className="actions">
          <a className="button" href={receptionist ? "/start?service=ai-receptionist" : "/discovery"}>{receptionist ? "Plan my receptionist" : "Let’s build your next chapter"}</a>
          <a className="button outline" href={receptionist ? "#example" : "#how-sitemint-works"}>{receptionist ? "Explore a sample call" : "Explore SiteMint"}</a>
        </div>
        {receptionist && <a className="mint-cinema__signin" href="/ai-receptionist/dashboard/login">Already with SiteMint? Sign in</a>}
      </div>
      <div className="mint-cinema__foot"><span>{active && !receptionist ? "Scroll to follow the story" : "Thoughtfully designed. Set up with you."}</span><a href={receptionist ? "#example" : "#how-sitemint-works"}>Explore below ↓</a></div>
      {active && receptionist && <button className="mint-cinema__pause" aria-label={playing ? "Pause background video" : "Play background video"} title={playing ? "Pause video" : "Play video"} onClick={() => { manuallyPaused.current = playing; if (playing) video.current?.pause(); else video.current?.play().catch(() => setPlaying(false)); }}>{playing ? <Pause size={18} aria-hidden="true"/> : <Play size={18} aria-hidden="true"/>}</button>}
    </div>
  </section>;
}
