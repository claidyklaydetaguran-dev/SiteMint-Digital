import { useEffect, useRef, useState } from "react";
import { BarChart3, Bot, Globe2, LayoutTemplate, UserPlus } from "lucide-react";

/**
 * Owner-approved transparent hero device photo (laptop/tablet/phone),
 * replacing the earlier hand-built illustration. The devices-hero.png/
 * devices-ref.png disqualification that originally motivated the illustrated
 * approach applied to those two specific files, not to raster hero images in
 * general — this asset (hero-devices-remove-bg-io.png) is the explicitly
 * approved replacement. Client portfolio screenshots remain excluded from
 * the hero and stay exclusively in SelectedWorkSection's Portfolio spotlight.
 *
 * The "Illustrative System Preview" caption stays visible at every
 * breakpoint since the photographed screen content is a mocked composite,
 * not live SiteMint data.
 */

const HERO_IMAGE_SRC = "/hero-devices-remove-bg-io.png";
const HERO_IMAGE_WIDTH = 1536;
const HERO_IMAGE_HEIGHT = 1024;

const capabilityCards = [
  { label: "Custom Websites", icon: LayoutTemplate, position: "top-left" as const },
  { label: "CRM Systems", icon: UserPlus, position: "top-right" as const },
  { label: "AI Automation", icon: Bot, position: "bottom-left" as const },
  { label: "Analytics & Growth", icon: BarChart3, position: "bottom-right" as const },
];

/*
 * Capability cards sit in the wrapper's own top and bottom padding bands
 * only — genuinely empty space, not overlapping any device's content at
 * any breakpoint. Top pair sits above the laptop; bottom pair sits below
 * the tablet/phone row (which renders in normal flow, not absolutely
 * overlapped onto the laptop — an earlier draft tried overlapping the
 * tablet onto the laptop's bottom corner, but the tablet's own height
 * reached back into the laptop's content regardless of how shallow the
 * anchor offset was, and a second draft centering cards on the whole
 * wrapper's height landed them on the Recent Inquiries list instead).
 */
const capabilityPositionClasses: Record<string, string> = {
  "top-left": "left-0 top-0",
  "top-right": "right-0 top-0",
  "bottom-left": "left-0 bottom-0",
  "bottom-right": "right-0 bottom-0",
};

export function HeroDeviceComposition() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") setActive(false);
      else if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        setActive(rect.top < window.innerHeight && rect.bottom > 0);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <div ref={rootRef} className="w-full">
      {/*
       * Vertical layout: the wrapper's own lg:pt-16/lg:pb-16 padding
       * reserves clear bands above and below the device image. Capability
       * cards are absolutely positioned at top-0/bottom-0 of THIS wrapper
       * (its padding box), so they always land in those reserved bands —
       * vertically clear of the image regardless of horizontal placement.
       */}
      <div className={`relative mx-auto max-w-[560px] pb-6 pt-8 sm:max-w-[620px] lg:max-w-[680px] lg:pb-16 lg:pt-16 ${active ? "" : "pp-float-paused"}`}>
        {/* Floating capability cards — desktop/tablet only, per §9 mobile rule */}
        <div aria-hidden="true" className="hidden lg:block">
          {capabilityCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`pp-float absolute z-[2] flex items-center gap-2 rounded-[var(--sm-radius-lg)] border px-3.5 py-2.5 shadow-[var(--sm-shadow-md)] backdrop-blur-sm ${capabilityPositionClasses[card.position]}`}
                style={{
                  animationDelay: `${index * 900}ms`,
                  borderColor: "hsl(var(--pp-mint-mist))",
                  backgroundColor: "hsl(var(--pp-mint-warm-white) / 0.96)",
                }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)]"
                  style={{ backgroundColor: "hsl(var(--pp-mint-fresh) / 0.35)", color: "hsl(var(--pp-forest-deep))" }}
                >
                  <Icon size={14} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(var(--pp-forest-deep))" }}>
                  {card.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Restrained CSS-generated mint ambient glow behind the device photo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] h-[85%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--pp-mint-fresh) / 0.32) 0%, hsl(var(--pp-mint-emerald) / 0.14) 42%, transparent 72%)",
          }}
        />

        <div
          className="pp-float relative z-[1] mx-auto w-full"
          style={{ aspectRatio: `${HERO_IMAGE_WIDTH} / ${HERO_IMAGE_HEIGHT}` }}
        >
          <img
            src={HERO_IMAGE_SRC}
            alt="SiteMint Digital dashboard shown across a laptop, tablet, and phone"
            width={HERO_IMAGE_WIDTH}
            height={HERO_IMAGE_HEIGHT}
            className="h-full w-full object-contain"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </div>

      {/* Persistent disclosure — visible at every breakpoint, including mobile. */}
      <p
        className="mx-auto flex w-fit items-center gap-1.5 rounded-[var(--sm-radius-pill)] border px-3 py-1 text-[11px] font-medium"
        style={{ borderColor: "hsl(var(--pp-mint-mist))", color: "hsl(var(--pp-forest-slate))", backgroundColor: "hsl(var(--pp-mint-warm-white) / 0.8)" }}
      >
        <Globe2 size={11} aria-hidden="true" />
        Illustrative System Preview
      </p>
    </div>
  );
}
