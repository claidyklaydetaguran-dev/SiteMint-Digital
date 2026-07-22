import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bot, Globe2, LayoutTemplate, MessageCircle, UserPlus } from "lucide-react";

/**
 * Original, frontend-only SiteMint system illustration — not a screenshot of
 * any kind. Built for the homepage hero after devices-hero.png/devices-ref.png
 * were disqualified (blue-dominant, garbled placeholder text) and client
 * portfolio screenshots were ruled out for the hero (they stay exclusively in
 * SelectedWorkSection's Portfolio spotlight). These three device-frame shells
 * are new and generic — they accept JSX children and have zero dependency on
 * PortfolioProject or any client image asset, unlike PortfolioVisual.tsx's
 * DesktopFrame/MobileFrame (which are hard-coupled to a project + <img>).
 *
 * Every label rendered here is drawn from the owner-approved set only —
 * no dollar amounts, no growth/conversion percentages, no fake client
 * totals. The "Illustrative System Preview" caption stays visible at every
 * breakpoint so the composition is never mistaken for live SiteMint data.
 */

function LaptopFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full overflow-hidden rounded-[var(--sm-radius-lg)] shadow-[var(--sm-shadow-lg)]"
      style={{ backgroundColor: "hsl(var(--pp-forest-deep))" }}
    >
      <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ backgroundColor: "hsl(var(--pp-forest-near-black))" }}>
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--pp-mint-sage-gray))" }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--pp-mint-sage-gray))" }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--pp-mint-sage-gray))" }} />
        </span>
        <span className="ml-2 text-xs font-semibold" style={{ color: "hsl(var(--pp-mint-warm-white))" }}>
          SiteMint Digital
        </span>
      </div>
      <div className="p-4" style={{ backgroundColor: "hsl(var(--pp-mint-warm-white))" }}>
        {children}
      </div>
    </div>
  );
}

function TabletFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border-[5px] shadow-[var(--sm-shadow-md)]"
      style={{ borderColor: "hsl(var(--pp-forest-slate))", backgroundColor: "hsl(var(--pp-forest-slate))" }}
    >
      <div className="rounded-[0.85rem] p-3.5" style={{ backgroundColor: "hsl(var(--pp-mint-soft-white))" }}>
        {children}
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[1.5rem] border-[6px] shadow-[var(--sm-shadow-lg)]"
      style={{ borderColor: "hsl(var(--pp-forest-near-black))", backgroundColor: "hsl(var(--pp-forest-near-black))" }}
    >
      <div className="rounded-[0.9rem] p-3" style={{ backgroundColor: "hsl(var(--pp-mint-soft-white))" }}>
        {children}
      </div>
    </div>
  );
}

const laptopStats = [
  { label: "New inquiries", value: "24" },
  { label: "Appointments", value: "8" },
  { label: "Follow-ups due", value: "6" },
];

const laptopRecentInquiries = ["Website contact form", "AI Receptionist text", "Referral inquiry"];

const automationSteps = ["New lead", "Send acknowledgment", "Assign follow-up", "Book appointment"];

const receptionistSteps = ["Incoming inquiry", "Contact captured", "Next action"];

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
       * Vertical layout: the wrapper's own lg:pt-20/lg:pb-20 padding
       * reserves clear bands above and below the laptop frame. Capability
       * cards are absolutely positioned at top-0/bottom-0 of THIS wrapper
       * (its padding box), so they always land in those reserved bands —
       * vertically clear of the laptop's content regardless of horizontal
       * placement. This is what keeps them from ever covering the laptop's
       * stat cards or lists (the bug in the first draft: cards positioned
       * mid-height landed directly on top of laptop content).
       */}
      <div className={`relative mx-auto max-w-[420px] pb-6 pt-8 sm:max-w-[460px] lg:pb-16 lg:pt-20 ${active ? "" : "pp-float-paused"}`}>
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

        <div className="relative z-[1]">
          <LaptopFrame>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-mint-deep))" }}>
              Overview
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {laptopStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[var(--sm-radius-md)] p-2.5"
                  style={{ backgroundColor: "hsl(var(--pp-mint-pale))" }}
                >
                  <p className="text-base font-semibold" style={{ color: "hsl(var(--pp-forest-deep))" }}>
                    {stat.value}
                  </p>
                  <p className="text-[10px] leading-tight" style={{ color: "hsl(var(--pp-forest-slate))" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-[var(--sm-radius-md)] p-2.5" style={{ backgroundColor: "hsl(var(--pp-mint-pale))" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-mint-deep))" }}>
                Recent inquiries
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {laptopRecentInquiries.map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-[11px]" style={{ color: "hsl(var(--pp-forest-slate))" }}>
                    <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--pp-mint-emerald))" }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2.5 flex items-center justify-between rounded-[var(--sm-radius-md)] px-2.5 py-2" style={{ backgroundColor: "hsl(var(--pp-mint-mist))" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-forest-deep))" }}>
                Workflow status
              </span>
              <span className="text-[10px] font-semibold" style={{ color: "hsl(var(--pp-mint-deep))" }}>
                Running
              </span>
            </div>
          </LaptopFrame>
        </div>

        {/*
         * Tablet + phone render in normal flow directly below the laptop —
         * not absolutely overlapped onto it — so there is no risk of
         * covering the laptop's own content at any breakpoint. This still
         * reads as one connected device cluster (matching the reference
         * video's layered device-pairing idea) without the overlap bug a
         * shallow-anchor approach produced when the tablet's own height
         * reached back into the laptop's content.
         */}
        <div className="relative z-[2] mt-4 flex items-start justify-center gap-4 sm:mt-5">
          <div className="hidden w-[150px] sm:block md:w-[168px]">
            <TabletFrame>
              <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-mint-deep))" }}>
                Automation workflow
              </p>
              <ol className="relative mt-2 flex flex-col gap-2.5">
                <div
                  aria-hidden="true"
                  className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px"
                  style={{ backgroundColor: "hsl(var(--pp-mint-mist))" }}
                />
                {automationSteps.map((step) => (
                  <li key={step} className="relative z-[1] flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full border-2"
                      style={{ borderColor: "hsl(var(--pp-mint-emerald))", backgroundColor: "hsl(var(--pp-mint-warm-white))" }}
                    />
                    <span className="text-[10px] leading-tight" style={{ color: "hsl(var(--pp-forest-slate))" }}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </TabletFrame>
          </div>

          <div className="w-[120px] md:w-[132px]">
            <PhoneFrame>
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-mint-deep))" }}>
                <MessageCircle size={10} aria-hidden="true" />
                AI Receptionist
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {receptionistSteps.map((step) => (
                  <li key={step} className="flex items-center gap-1.5 text-[9px] leading-tight" style={{ color: "hsl(var(--pp-forest-slate))" }}>
                    <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--pp-mint-emerald))" }} />
                    {step}
                  </li>
                ))}
              </ul>
            </PhoneFrame>
          </div>
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
