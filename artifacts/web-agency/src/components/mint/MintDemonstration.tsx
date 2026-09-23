import { useEffect, useRef, useState } from "react";
import poster from "@/assets/mint/business-owner.webp";

const films = import.meta.glob("../../assets/mint/home-approved.mp4", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function MintDemonstration() {
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let userPaused = false;
    let observerPaused = false;
    const pause = () => { if (!observerPaused) userPaused = true; };
    const play = () => { userPaused = false; };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observerPaused = false;
        if (!userPaused) el.play().catch(() => {});
      } else { observerPaused = true; el.pause(); }
    }, { threshold: 0.3 });
    el.addEventListener("pause", pause);
    el.addEventListener("play", play);
    observer.observe(el);
    return () => { observer.disconnect(); el.removeEventListener("pause", pause); el.removeEventListener("play", play); };
  }, [failed]);
  const src = films["../../assets/mint/home-approved.mp4"];
  return <section className="section wrap mint-demonstration" id="how-sitemint-works" aria-labelledby="mint-demo-title">
    <div className="section-heading">
      <h2 id="mint-demo-title">See how it comes together.</h2>
      <p>A website that welcomes customers. An app that makes the next step easy. A connected workspace that keeps projects moving.</p>
    </div>
    {src && !failed ? <video ref={video} muted loop controls playsInline preload="metadata" poster={poster} onError={() => setFailed(true)} aria-label="SiteMint digital services demonstration" src={src} /> : <img src={poster} alt="A business owner working at her laptop in a bright studio" loading="lazy" />}
    <p className="mint-demonstration__caption">An illustrative journey through websites, apps and connected business systems.</p>
  </section>;
}
