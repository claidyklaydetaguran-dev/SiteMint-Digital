import { useRef, useState, type KeyboardEvent, type ReactElement, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckSquare,
  FileSearch,
  Globe,
  Hammer,
  MessageCircle,
  Network,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { InnerPageHero } from "@/components/platform-preview/InnerPageHero";
import { InnerPageAtmosphere } from "@/components/platform-preview/InnerPageAtmosphere";
import { GlassCard } from "@/components/platform-preview/GlassCard";
import { CapabilityBadge } from "@/components/platform-preview/CapabilityBadge";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";
import { startProjectHref } from "@/components/platform-preview/navConfig";
import {
  servicesDetail,
  serviceCategoryLabels,
  serviceCategoryIntros,
  type ServiceCategory,
  type ServiceDetail,
} from "@/components/platform-preview/servicesDetail";

const PREVIEW_TITLE = "Services — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of SiteMint's service catalog — websites, applications, CRM, automation, and more.";

const categoryOrder: ServiceCategory[] = ["presence", "systems", "automation"];

function servicesByCategory(category: ServiceCategory): ServiceDetail[] {
  return servicesDetail.filter((s) => s.category === category);
}

function textOnDark(muted = false) {
  return { color: muted ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-text-on-dark))" };
}

/** Deep-navy heading / charcoal-slate body — the light-surface counterpart
 * to textOnDark(), same contrast-verified tokens platform-preview.css
 * already documents (navy-800 on white 14.95:1, slate-600 on white 8.14:1). */
function textOnLight(muted = false) {
  return { color: muted ? "hsl(var(--pp-text))" : "hsl(var(--pp-navy-950))" };
}

/**
 * Warm-white / extremely-subtle-mint background for a light section —
 * deliberately not stark pure white and not a pale-mint wash: two very
 * low-opacity radial glows over --pp-surface-soft, echoing (at a much
 * calmer intensity) the same radial-glow language the dark hero uses.
 */
const lightSectionBackground: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 12% -10%, hsl(var(--pp-mint-pale) / 0.5) 0%, transparent 55%), radial-gradient(circle at 92% 110%, hsl(var(--pp-mint-pale) / 0.35) 0%, transparent 50%)",
  backgroundColor: "hsl(var(--pp-surface-soft))",
};

/** Soft, navy-tinted shadow for light-surface panels — controlled, not a
 * generic gray drop shadow. */
const lightPanelShadow = "0 1px 2px hsl(var(--pp-navy-950) / 0.04), 0 10px 24px -14px hsl(var(--pp-navy-950) / 0.16)";

/** Opaque light-surface panel — the light counterpart to GlassCard. Not a
 * translucent/blurred surface (there is nothing dark behind it to show
 * through), so it is a genuinely different treatment from GlassCard rather
 * than the same glass card recolored, per the light-surface direction. */
function LightPanel({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[var(--sm-radius-lg)] border bg-white transition-all duration-300 hover:-translate-y-0.5 focus-within:-translate-y-0.5 ${className}`}
      style={{ borderColor: "hsl(var(--pp-border-pale))", boxShadow: lightPanelShadow, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Repeated inner structure for the dark categories (Digital Presence,
 * Automation & Connection) — name / problem / build / benefit / capability
 * / link, on GlassCard. Only the outer arrangement differs per category.
 */
function ServiceCard({ service, compact = false }: { service: ServiceDetail; compact?: boolean }) {
  const Icon = service.icon;
  return (
    <GlassCard className={compact ? "p-5" : "p-7"}>
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--sm-radius-md)]"
          style={{ backgroundColor: "hsl(var(--pp-navy-700) / 0.6)", color: "hsl(var(--pp-cyan-mint))" }}
        >
          <Icon size={19} aria-hidden="true" />
        </span>
        <CapabilityBadge level={service.capability} />
      </div>

      <h3 className="pp-font-display mt-4 text-lg font-semibold" style={textOnDark()}>
        {service.name}
      </h3>
      <p className="mt-2 text-sm font-medium" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
        {service.problem}
      </p>
      <p className="mt-3 text-sm leading-relaxed" style={textOnDark(true)}>
        {service.build}
      </p>
      <p className="mt-3 text-xs" style={{ color: "hsl(var(--pp-text-on-dark-faint))" }}>
        <span className="font-semibold">Benefit: </span>
        {service.outcomes[0]}
      </p>

      <Link
        href={startProjectHref}
        className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold transition-colors hover:underline"
        style={{ color: "hsl(var(--pp-cyan-mint))" }}
      >
        Start a Project like this
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </GlassCard>
  );
}

/** Category 1 — "Digital Presence" (dark section): a standard 3-up card row. */
function PresenceLayout({ services }: { services: ServiceDetail[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <ServiceCard key={s.id} service={s} />
      ))}
    </div>
  );
}

/**
 * Category 2 — "Systems & Software" (light section): a light LightPanel
 * cluster with three internal rows, restyled specifically for a light
 * surface (opaque white, fine border, soft navy-tinted shadow, navy/slate
 * text) rather than the dark GlassCard treatment recolored.
 */
function SystemsLayoutLight({ services }: { services: ServiceDetail[] }) {
  return (
    <LightPanel className="divide-y p-0" style={{ overflow: "hidden" }}>
      {services.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.id}
            className="grid grid-cols-1 gap-4 p-7 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8"
            style={{ borderColor: "hsl(var(--pp-border-pale))" }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-[var(--sm-radius-md)]"
              style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
            >
              <Icon size={20} aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="pp-font-display text-lg font-semibold" style={textOnLight()}>
                  {s.name}
                </h3>
                <CapabilityBadge level={s.capability} />
              </div>
              <p className="mt-1.5 text-sm font-semibold" style={textOnLight()}>
                {s.problem}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={textOnLight(true)}>
                {s.build}
              </p>
            </div>
            <Link
              href={startProjectHref}
              className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap text-sm font-semibold transition-colors hover:underline md:justify-self-end"
              style={{ color: "hsl(var(--pp-navy-800))" }}
            >
              Start a Project
              <ArrowRight size={14} aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
            </Link>
          </div>
        );
      })}
    </LightPanel>
  );
}

/**
 * Category 3 — "Automation & Connection" (dark section): a vertical
 * connected list with a spine line between entries.
 */
function AutomationLayout({ services }: { services: ServiceDetail[] }) {
  return (
    <div className="relative flex flex-col gap-6">
      <div
        aria-hidden="true"
        className="absolute bottom-8 left-[27px] top-8 hidden w-px sm:block"
        style={{ backgroundColor: "hsl(var(--pp-cyan-mint) / 0.18)" }}
      />
      {services.map((s) => (
        <div key={s.id} className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <span
            className="relative z-[1] hidden h-14 w-14 shrink-0 items-center justify-center rounded-full sm:flex"
            style={{ backgroundColor: "hsl(var(--pp-navy-950))", border: "1px solid hsl(var(--pp-cyan-mint) / 0.3)", color: "hsl(var(--pp-cyan-mint))" }}
          >
            <s.icon size={20} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <ServiceCard service={s} compact />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Verified, real connected-system stages — every node is an actual
 * servicesDetail entry (no fabricated pipeline steps). Dark-surface only —
 * both places this renders (hero, recap) are dark sections. */
const connectorStages: { id: string; label: string; icon: typeof Globe }[] = [
  { id: "websites", label: "Website", icon: Globe },
  { id: "ai-receptionist", label: "AI Receptionist", icon: MessageCircle },
  { id: "crm", label: "CRM", icon: UserPlus },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "connected-systems", label: "One connected system", icon: Network },
];

function ConnectedSystemStrip() {
  return (
    <div className="relative mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px sm:block" style={{ backgroundColor: "hsl(var(--pp-cyan-mint) / 0.18)" }} />
      {connectorStages.map((stage) => (
        <div key={stage.id} className="relative z-[1] flex flex-col items-center gap-2 text-center sm:flex-1">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "hsl(var(--pp-navy-950))", border: "1px solid hsl(var(--pp-cyan-mint) / 0.35)", color: "hsl(var(--pp-cyan-mint))" }}
          >
            <stage.icon size={18} aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold" style={textOnDark()}>
            {stage.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Same five verified phases as the homepage's ProcessSection.tsx (Discover
 * → Architect → Build → Launch → Improve) — duplicated here rather than
 * importing that component, since ProcessSection.tsx is styled for the
 * homepage's forced-light rendering and editing it to add a variant would
 * modify a homepage-shared file. Content is identical (no new claims);
 * only the surface is restyled for this page's system.
 */
const processPhases = [
  {
    id: "discover",
    label: "Discover",
    artifact: "Business goals, bottlenecks, and customer journey",
    icon: FileSearch,
    detail:
      "We start by understanding the business, not the tech stack: current goals, where leads or time are being lost, and what the customer's actual journey looks like today.",
  },
  {
    id: "architect",
    label: "Architect",
    artifact: "System map, product scope, and technical plan",
    icon: Network,
    detail:
      "Before building anything, we map how the pieces connect — website, product, CRM, automation — and scope exactly what's in and out, so the build has a real plan behind it.",
  },
  {
    id: "build",
    label: "Build",
    artifact: "Design, engineering, and integrations",
    icon: Hammer,
    detail:
      "Design and engineering happen together, with the systems from Architect actually wired up — not a static design handed off to be built later.",
  },
  {
    id: "launch",
    label: "Launch",
    artifact: "Quality assurance, training, and controlled release",
    icon: CheckSquare,
    detail:
      "We verify the system works end to end, train the team who'll use it, and release in a controlled way rather than a single risky cutover.",
  },
  {
    id: "improve",
    label: "Improve",
    artifact: "Performance review, system refinement, and future opportunities",
    icon: TrendingUp,
    detail:
      "A launched system isn't a finished one. We review how it's actually performing and refine it — and flag real opportunities as the business changes.",
  },
] as const;

/** Interactive logic (state, arrow-key radiogroup navigation) is identical
 * regardless of surface — only the `variant` prop's style values change,
 * so light/dark never risk diverging in behavior. */
function ServicesProcess({ variant }: { variant: "light" | "dark" }) {
  const isDark = variant === "dark";
  const [selectedId, setSelectedId] = useState<(typeof processPhases)[number]["id"]>(processPhases[0].id);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedPhase = processPhases.find((p) => p.id === selectedId) ?? processPhases[0];

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + processPhases.length) % processPhases.length;
    setSelectedId(processPhases[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  }

  const accentColor = isDark ? "hsl(var(--pp-cyan-mint))" : "hsl(var(--pp-cyan-mint-deep))";

  return (
    <div role="radiogroup" aria-label="Project phases — select a phase for more detail" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {processPhases.map((phase, index) => {
        const isSelected = phase.id === selectedId;
        return (
          <button
            key={phase.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => setSelectedId(phase.id)}
            onFocus={() => setSelectedId(phase.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`${isDark ? "pp-glass-card" : ""} flex flex-col items-start gap-2 rounded-[var(--sm-radius-lg)] border p-5 text-left transition-all duration-300`}
            style={
              isDark
                ? {
                    borderColor: isSelected ? "hsl(var(--pp-cyan-mint) / 0.6)" : "hsl(var(--pp-cyan-mint) / 0.16)",
                    backgroundColor: "hsl(var(--pp-navy-800) / 0.55)",
                    boxShadow: isSelected ? "0 0 0 1px hsl(var(--pp-cyan-mint) / 0.2)" : undefined,
                  }
                : {
                    borderColor: isSelected ? "hsl(var(--pp-cyan-mint-deep) / 0.7)" : "hsl(var(--pp-border-pale))",
                    backgroundColor: "hsl(var(--pp-white))",
                    boxShadow: isSelected ? lightPanelShadow : "none",
                  }
            }
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-pill)] text-xs font-semibold"
              style={{
                backgroundColor: isSelected ? accentColor : isDark ? "hsl(var(--pp-navy-700) / 0.7)" : "hsl(var(--pp-mint-pale))",
                color: isSelected ? "hsl(var(--pp-navy-950))" : isDark ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-cyan-mint-deep))",
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="pp-font-display text-base font-semibold" style={isDark ? textOnDark() : textOnLight()}>
              {phase.label}
            </p>
            <p className="text-xs leading-relaxed" style={isDark ? textOnDark(true) : textOnLight(true)}>
              {phase.artifact}
            </p>
          </button>
        );
      })}

      <div
        role="status"
        aria-live="polite"
        className="col-span-full mt-2 overflow-hidden rounded-[var(--sm-radius-lg)] border"
        style={
          isDark
            ? { borderColor: "hsl(var(--pp-cyan-mint) / 0.16)", backgroundColor: "hsl(var(--pp-navy-800) / 0.55)" }
            : { borderColor: "hsl(var(--pp-border-pale))", backgroundColor: "hsl(var(--pp-white))", boxShadow: lightPanelShadow }
        }
      >
        <div className="flex items-center gap-2.5 border-b px-6 py-3" style={{ borderColor: isDark ? "hsl(var(--pp-cyan-mint) / 0.12)" : "hsl(var(--pp-border-pale))" }}>
          <selectedPhase.icon size={15} aria-hidden="true" style={{ color: accentColor }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
            {selectedPhase.label} artifact
          </span>
        </div>
        <p className="p-6 text-sm leading-relaxed" style={isDark ? textOnDark(true) : textOnLight(true)}>
          {selectedPhase.detail}
        </p>
      </div>
    </div>
  );
}

/** Real situations mapped to real service names — no invented scenarios,
 * no invented services. */
const decisionGuides = [
  { situation: "Just need a credible, trustworthy website", pointsTo: "Websites" },
  { situation: "Leads are going cold after hours or on weekends", pointsTo: "AI Receptionist" },
  { situation: "Leads are scattered across inboxes and spreadsheets", pointsTo: "CRM Systems" },
  { situation: "Ready to stop re-entering the same data everywhere", pointsTo: "Connected Business Systems" },
];

const layoutByCategory: Record<ServiceCategory, (props: { services: ServiceDetail[] }) => ReactElement> = {
  presence: PresenceLayout,
  systems: SystemsLayoutLight,
  automation: AutomationLayout,
};

export default function PlatformServicesPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell footerVariant="dark">
      {/* 1. Hero — dark */}
      <InnerPageHero
        eyebrow="Services"
        headingId="pp-services-page-heading"
        heading="One team behind your website, your systems, and everything that connects them"
        intro="No subscription required — every service below is real work SiteMint does for your business, labeled honestly by how ready it is today, from a first website to a fully connected system."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Start a Project
            <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 8 }} />
          </Link>
          <Link href="/platform-preview/contact" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Talk to us first
          </Link>
        </div>
        <ConnectedSystemStrip />
      </InnerPageHero>

      {/* 2-3. Business-problem framing + category navigation — light, one continuous section */}
      <section aria-labelledby="pp-services-problems-heading" className="relative px-4 py-16 md:px-8 md:py-20" style={lightSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal max-w-2xl">
            <h2 id="pp-services-problems-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              Most businesses aren't missing effort — they're missing a connected system
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={textOnLight(true)}>
              A slow, dated website loses trust before a call happens. Inquiries land in a form nobody checks
              until the next day. Leads sit in an inbox instead of a pipeline. Follow-up depends on someone
              remembering to do it. Each of these is a real, specific problem — and each one below is a real
              service that solves it.
            </p>
          </div>

          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[servicesDetail[0], servicesDetail.find((s) => s.id === "crm")!, servicesDetail.find((s) => s.id === "automation")!].map((s) => (
              <li key={s.id} className="pp-reveal">
                <LightPanel className="p-5 text-sm leading-relaxed" style={textOnLight(true) as CSSProperties}>
                  {s.problem}
                </LightPanel>
              </li>
            ))}
          </ul>

          <nav aria-label="Jump to a service category" className="pp-reveal mt-12 flex flex-wrap justify-center gap-2">
            {categoryOrder.map((cat) => (
              <a
                key={cat}
                href={`#category-${cat}`}
                className="pp-services-category-pill rounded-[var(--sm-radius-pill)] border px-4 py-1.5 text-sm font-medium"
                style={{ borderColor: "hsl(var(--pp-cyan-mint-deep) / 0.45)", color: "hsl(var(--pp-navy-800))" }}
              >
                {serviceCategoryLabels[cat]}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* 4. Digital Presence — dark */}
      <section id="category-presence" aria-labelledby="pp-category-presence-heading" className="relative scroll-mt-24 px-4 py-16 md:px-8 md:py-20">
        <InnerPageAtmosphere intensity="section" />
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal">
            <h3 id="pp-category-presence-heading" className="pp-font-display text-xl font-semibold sm:text-2xl" style={textOnDark()}>
              {serviceCategoryLabels.presence}
            </h3>
            <p className="mt-2 max-w-xl text-sm" style={textOnDark(true)}>
              {serviceCategoryIntros.presence}
            </p>
          </div>
          <div className="pp-reveal mt-8">
            <PresenceLayout services={servicesByCategory("presence")} />
          </div>
        </div>
      </section>

      {/* 5. Systems & Software — light */}
      <section id="category-systems" aria-labelledby="pp-category-systems-heading" className="relative scroll-mt-24 px-4 py-16 md:px-8 md:py-20" style={lightSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal">
            <h3 id="pp-category-systems-heading" className="pp-font-display text-xl font-semibold sm:text-2xl" style={textOnLight()}>
              {serviceCategoryLabels.systems}
            </h3>
            <p className="mt-2 max-w-xl text-sm" style={textOnLight(true)}>
              {serviceCategoryIntros.systems}
            </p>
          </div>
          <div className="pp-reveal mt-8">
            <SystemsLayoutLight services={servicesByCategory("systems")} />
          </div>
        </div>
      </section>

      {/* 6. Automation & Connection — dark */}
      <section id="category-automation" aria-labelledby="pp-category-automation-heading" className="relative scroll-mt-24 px-4 py-16 md:px-8 md:py-20">
        <InnerPageAtmosphere intensity="section" />
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal">
            <h3 id="pp-category-automation-heading" className="pp-font-display text-xl font-semibold sm:text-2xl" style={textOnDark()}>
              {serviceCategoryLabels.automation}
            </h3>
            <p className="mt-2 max-w-xl text-sm" style={textOnDark(true)}>
              {serviceCategoryIntros.automation}
            </p>
          </div>
          <div className="pp-reveal mt-8">
            <AutomationLayout services={servicesByCategory("automation")} />
          </div>
        </div>
      </section>

      {/* 7. Process + decision guidance — light, visual relief before the final dark conversion area */}
      <section aria-labelledby="pp-services-process-heading" className="relative px-4 py-16 md:px-8 md:py-20" style={lightSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal mx-auto mb-12 max-w-2xl text-center">
            <h2 id="pp-services-process-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              How we build it
            </h2>
            <p className="mt-4 text-sm leading-relaxed" style={textOnLight(true)}>
              Business understanding, systems architecture, engineering, and ongoing improvement — one
              connected process, not a one-time build.
            </p>
          </div>
          <div className="pp-reveal">
            <ServicesProcess variant="light" />
          </div>

          <div className="pp-reveal mx-auto mb-10 mt-20 max-w-xl text-center">
            <h2 id="pp-services-decision-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              Not sure where to start?
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={textOnLight(true)}>
              A few common starting points — or start the discovery questionnaire and we'll help you scope it.
            </p>
          </div>

          <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {decisionGuides.map((g) => (
              <li key={g.pointsTo} className="pp-reveal">
                <LightPanel className="flex items-start gap-3 p-4 text-sm">
                  <ArrowRight size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
                  <span style={textOnLight(true)}>
                    {g.situation} <span className="font-semibold" style={textOnLight()}>→ {g.pointsTo}</span>
                  </span>
                </LightPanel>
              </li>
            ))}
          </ul>

          <div className="pp-reveal mt-10 flex flex-wrap justify-center gap-3">
            <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
              Start the discovery questionnaire
              <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 8 }} />
            </Link>
            <Link href="/platform-preview/contact" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
              Talk to us first
            </Link>
          </div>
        </div>
      </section>

      {/* 8. Connected-system recap + final CTA — dark, one continuous zone into the dark footer */}
      <div className="relative" style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}>
        <section aria-labelledby="pp-services-connected-heading" className="relative px-4 pt-16 md:px-8 md:pt-20">
          <InnerPageAtmosphere intensity="section" />
          <div className="mx-auto max-w-[1280px] text-center">
            <h2 id="pp-services-connected-heading" className="pp-font-display mx-auto max-w-2xl text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
              Every service above can stand alone — or work as one system
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed" style={textOnDark(true)}>
              A website that captures an inquiry. An AI Receptionist that responds immediately. A CRM that never
              loses track of it. Automation that keeps it moving. Wired together, one inquiry flows through
              without manual re-entry — that's Connected Business Systems, not a separate product.
            </p>
            <ConnectedSystemStrip />
          </div>
        </section>

        <FinalCtaSection />
      </div>
    </PlatformPreviewPageShell>
  );
}
