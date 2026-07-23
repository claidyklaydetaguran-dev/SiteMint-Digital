import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Compass, MessageCircle, Network, TrendingUp, Users } from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { InnerPageHero } from "@/components/platform-preview/InnerPageHero";
import { InnerPageAtmosphere } from "@/components/platform-preview/InnerPageAtmosphere";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";
import { startProjectHref, workHref } from "@/components/platform-preview/navConfig";
import { aboutTeam, aboutPrinciples } from "@/components/platform-preview/aboutContent";
import { portfolioProjects } from "@/components/platform-preview/portfolioProjects";
import { SupportingVisual } from "@/components/platform-preview/PortfolioVisual";

const PREVIEW_TITLE = "About — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of who SiteMint Digital is, how the team thinks, and how the three team members' roles connect.";

function textOnDark(muted = false) {
  return { color: muted ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-text-on-dark))" };
}
function textOnLight(muted = false) {
  return { color: muted ? "hsl(var(--pp-text))" : "hsl(var(--pp-navy-950))" };
}

const lightPanelShadow = "0 1px 2px hsl(var(--pp-navy-950) / 0.04), 0 10px 24px -14px hsl(var(--pp-navy-950) / 0.16)";

const warmSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 10% -10%, hsl(var(--pp-mint-pale) / 0.45) 0%, transparent 55%)",
  backgroundColor: "hsl(var(--pp-white))",
};
const coolSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 90% 0%, hsl(var(--pp-mint-pale) / 0.5) 0%, transparent 60%)",
  backgroundColor: "hsl(var(--pp-surface-soft))",
};

function LightPanel({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[var(--sm-radius-lg)] border bg-white transition-all duration-300 ${className}`}
      style={{ borderColor: "hsl(var(--pp-border-pale))", boxShadow: lightPanelShadow, ...style }}
    >
      {children}
    </div>
  );
}

const principleIcons = {
  "workflow-first": Compass,
  "connected-systems": Network,
  "automation-assists": Users,
  "honest-about-readiness": MessageCircle,
  "stage-appropriate": TrendingUp,
} as const;

/** Asymmetric span pattern for the principles grid — first and fourth
 * principles read as the two anchor ideas (workflow-first framing, and
 * honest scope/readiness), given a wider block; the rest sit at a normal
 * width. Deliberately not a uniform 3-up grid, per the "avoid mechanical
 * alternation / generic values grid" direction. */
const principleSpanClass: Record<string, string> = {
  "workflow-first": "sm:col-span-2",
  "connected-systems": "sm:col-span-1",
  "automation-assists": "sm:col-span-1",
  "honest-about-readiness": "sm:col-span-2",
  "stage-appropriate": "sm:col-span-2 lg:col-span-1",
};

function PrincipleCard({ principle }: { principle: (typeof aboutPrinciples)[number] }) {
  const Icon = principleIcons[principle.id as keyof typeof principleIcons];
  return (
    <LightPanel className={`p-6 ${principleSpanClass[principle.id] ?? ""}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-[var(--sm-radius-pill)]"
        style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      <h3 className="pp-font-display mt-4 text-base font-semibold leading-snug" style={textOnLight()}>
        {principle.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={textOnLight(true)}>
        {principle.description}
      </p>
    </LightPanel>
  );
}

const roleSummaries: Record<string, string> = {
  "Technical Director": "Technical architecture and implementation",
  "Head of Strategy": "Strategy and business requirements",
  "Project and Admin Manager": "Project coordination and administration",
};

function TeamRow({ member, index }: { member: (typeof aboutTeam)[number]; index: number }) {
  const reversed = index % 2 === 1;
  return (
    <div className={`flex flex-col gap-6 md:flex-row md:items-center md:gap-10 ${reversed ? "md:flex-row-reverse" : ""}`}>
      <div className="mx-auto w-full max-w-[280px] shrink-0 md:mx-0 md:w-[280px]">
        <div
          className="overflow-hidden rounded-[var(--sm-radius-lg)] border"
          style={{ aspectRatio: "4 / 5", borderColor: "hsl(var(--pp-cyan-mint) / 0.22)" }}
        >
          <img
            src={member.photo}
            alt={`${member.name}, ${member.title}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ objectPosition: member.portraitPosition ?? "center" }}
          />
        </div>
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
          {member.title}
        </p>
        <h3 className="pp-font-display mt-1.5 text-2xl font-semibold" style={textOnDark()}>
          {member.name}
        </h3>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide" style={textOnDark(true)}>
          {roleSummaries[member.title]}
        </p>
        <p className="mt-3 max-w-lg text-sm leading-relaxed" style={textOnDark(true)}>
          {member.description}
        </p>
      </div>
    </div>
  );
}

export default function PlatformAboutPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell footerVariant="dark">
      {/* Hero — dark */}
      <InnerPageHero
        eyebrow="About SiteMint Digital"
        headingId="pp-about-page-heading"
        heading="Built around how your business actually works."
        intro="SiteMint is a small, direct team building websites, software, and the systems that connect them — so a business runs on one connected system instead of a pile of disconnected tools."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Start a Project
            <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 8 }} />
          </Link>
          <a href="#pp-about-team-heading" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Meet the team
          </a>
        </div>
      </InnerPageHero>

      {/* Company perspective — light, warm */}
      <section aria-labelledby="pp-about-perspective-heading" className="px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-5 md:items-start">
          <div className="md:col-span-3">
            <h2 id="pp-about-perspective-heading" className="pp-font-display text-2xl font-semibold leading-snug sm:text-3xl" style={textOnLight()}>
              Most businesses run on disconnected pieces.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed" style={textOnLight(true)}>
              A website that doesn't talk to the CRM. Leads that land in an inbox and stall there. Automation bolted onto
              a workflow it was never built for. Internal tools that don't share information with anything else. Each
              piece might work fine on its own — but stitched together after the fact, they rarely work as a system.
            </p>
          </div>
          <div className="md:col-span-2">
            <LightPanel className="p-6">
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
                SiteMint's role
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={textOnLight(true)}>
                We design around the whole picture instead: the website, the CRM, the automation, and the internal
                tools that keep a business running — planned and built to work together from the start, not assembled
                piecemeal after the fact.
              </p>
            </LightPanel>
          </div>
        </div>
      </section>

      {/* How SiteMint thinks — light/pale-mint, asymmetric principle blocks */}
      <section aria-labelledby="pp-about-principles-heading" className="px-4 py-16 md:px-8 md:py-24" style={coolSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="max-w-2xl">
            <h2 id="pp-about-principles-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              How SiteMint thinks
            </h2>
            <p className="mt-3 text-base leading-relaxed" style={textOnLight(true)}>
              The behaviors behind every project — not values on a wall.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {aboutPrinciples.map((principle) => (
              <PrincipleCard key={principle.id} principle={principle} />
            ))}
          </div>
        </div>
      </section>

      {/* Team — dark narrative panel inset within the lighter page */}
      <section aria-labelledby="pp-about-team-heading" className="relative px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div
          className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[var(--sm-radius-xl)] px-5 py-14 shadow-[var(--sm-shadow-lg)] sm:px-10 md:py-20"
          style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}
        >
          <InnerPageAtmosphere intensity="section" />
          <div className="relative mx-auto mb-12 max-w-2xl text-center">
            <h2 id="pp-about-team-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
              The team behind every project
            </h2>
            <p className="mt-3 text-base leading-relaxed" style={textOnDark(true)}>
              Strategy shapes what the business needs, technical architecture turns it into a working system, and
              project coordination keeps it moving — three roles, one connected process.
            </p>
          </div>
          <div className="relative mx-auto flex max-w-4xl flex-col gap-14">
            {aboutTeam.map((member, index) => (
              <TeamRow key={member.name} member={member} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* How the team works together — light/cool, compact working-model flow */}
      <section aria-labelledby="pp-about-working-heading" className="px-4 py-16 md:px-8 md:py-24" style={coolSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="max-w-2xl">
            <h2 id="pp-about-working-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              How the team works together
            </h2>
            <p className="mt-3 text-base leading-relaxed" style={textOnLight(true)}>
              Every phase involves more than one role — strategy, technical execution, and coordination overlapping
              rather than handing off in isolation.
            </p>
          </div>
          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                step: "Understand",
                detail: "Goals, bottlenecks, and how work actually happens today — before anything gets built.",
              },
              {
                step: "Plan and build",
                detail: "System architecture, design, and engineering happen together, wired to the systems the project actually needs.",
              },
              {
                step: "Launch and support",
                detail: "A controlled release, with the team staying on for the system's ongoing care.",
              },
            ].map((item, i) => (
              <LightPanel key={item.step} className="p-6">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-pill)] text-xs font-semibold"
                  style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="pp-font-display mt-3 text-base font-semibold" style={textOnLight()}>
                  {item.step}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={textOnLight(true)}>
                  {item.detail}
                </p>
              </LightPanel>
            ))}
          </ol>
        </div>
      </section>

      {/* Credibility through real work — light, compact strip of approved projects */}
      <section aria-labelledby="pp-about-work-heading" className="px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <h2 id="pp-about-work-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
                Real systems, already delivered
              </h2>
              <p className="mt-3 text-base leading-relaxed" style={textOnLight(true)}>
                A sample of the kinds of websites and digital systems SiteMint has built for real organizations.
              </p>
            </div>
            <Link
              href={workHref}
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}
            >
              See the full Portfolio
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {portfolioProjects.map((project) => (
              <LightPanel key={project.id} className="p-4">
                <SupportingVisual project={project} />
                <p className="mt-4 text-sm font-semibold" style={textOnLight()}>
                  {project.projectName}
                </p>
                <p className="text-xs" style={textOnLight(true)}>
                  {project.category}
                </p>
              </LightPanel>
            ))}
          </div>
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
