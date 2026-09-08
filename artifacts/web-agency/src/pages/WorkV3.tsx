/**
 * Frontend V3 — Selected work.
 *
 * Honesty rule: no invented clients, results, or testimonials. The page leads
 * with the systems SiteMint genuinely builds and operates, and labels
 * capability compositions as exactly that.
 */

import { Fragment, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, AudioLines, Search, Workflow, Globe } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { capabilityLabelsV5 } from "@/components/v5/capabilityLabelsV5";
import { BrowserFrame } from "@/components/v5/BrowserFrame";
import { portfolioProjects, type PortfolioProject } from "@/components/platform-preview/portfolioProjects";
import { ProjectDialog } from "@/components/platform-preview/ProjectDialog";
import envClinic from "@/assets/media/support-work-clinic.jpg";
import envTrade from "@/assets/media/support-work-trade.jpg";
import envPractice from "@/assets/media/support-work-practice.jpg";
import { usePageMeta } from "@/hooks/usePageMeta";
import hdAvailability from "@/assets/product/hd-availability.png";
import hdAppointments from "@/assets/product/hd-appointments.png";
import discoveryStep from "@/assets/product/discovery-step.png";
import "@/styles/v5-pages.css";

const productionWork = [
  {
    icon: AudioLines,
    kicker: capabilityLabelsV5["private-beta"],
    title: "SiteMint AI Receptionist platform",
    body: "Our own voice and SMS receptionist product: answering, qualifying, and handing off to people — with consent handling, opt-out enforcement, and firm-scoped data isolation built into the platform itself. Currently in private, invite-only beta.",
    detail:
      "Runs on the same discipline we sell: explicit recording policy, human handoff on every path, and an audit trail behind every automated action.",
    href: ROUTES.aiReceptionist,
    linkLabel: "See the product",
  },
  {
    icon: Search,
    kicker: capabilityLabelsV5.available,
    title: "SiteMint discovery intake",
    body: "The structured project-intake flow on this website — guided steps, branching questions, save-and-resume drafts, and a structured brief that reaches our team once you submit it.",
    detail:
      "You can evaluate this one yourself right now: it's how projects start here.",
    href: ROUTES.discovery,
    linkLabel: "Try the discovery flow",
  },
  {
    icon: Workflow,
    kicker: capabilityLabelsV5["in-development"],
    title: "SiteMint operations engine",
    body: "The internal CRM and automation system that runs SiteMint's own follow-up: lead scoring, campaign sequences with stop-on-reply, task routing, and delivery tracking — the working proof behind our automation service.",
    detail:
      "Internal by design; we demonstrate the patterns, not customer data.",
    href: ROUTES.aiSystems,
    linkLabel: "AI Systems & Automation",
  },
];

interface CapabilityWorkItem {
  icon: typeof Globe;
  kicker: string;
  title: string;
  body: string;
  /** "The system" tab: the composition's flow, as node labels left→right. */
  flow: string[];
  /** "The interface" tab: the real SiteMint surface that would power this stage. */
  evidence: { image: string; alt: string; caption: string; addressLabel: string };
  /** Representative environment photograph (generated illustration, labelled as such). */
  environment: { image: string; alt: string };
}

const capabilityWork: CapabilityWorkItem[] = [
  {
    icon: Globe,
    kicker: capabilityLabelsV5.planned,
    title: "Booking-led clinic site",
    body: "A representative composition: a service site whose every page routes to scheduling, connected to an existing calendar, with automated confirmations and reminders replacing phone-tag.",
    flow: ["Client picks a time", "Calendar checked", "Confirmation sent", "Reminder before the visit"],
    environment: { image: envClinic, alt: "Calm clinic reception environment with a teal accent — generated illustration" },
    evidence: {
      image: hdAvailability,
      alt: "SiteMint dashboard availability screen showing open time slots on a calendar grid",
      caption: "SiteMint dashboard — availability view, preview data",
      addressLabel: "/dashboard/availability",
    },
  },
  {
    icon: Search,
    kicker: capabilityLabelsV5.planned,
    title: "Trade-services quoting intake",
    body: "A representative composition: photo-and-detail intake for quote requests, branching by job type, producing priced-ready briefs and a follow-up queue the owner works through in minutes.",
    flow: ["Photo + job details", "Branches by job type", "Priced-ready brief", "Follow-up queue"],
    environment: { image: envTrade, alt: "Trade-services workshop environment at golden hour — generated illustration" },
    evidence: {
      image: discoveryStep,
      alt: "SiteMint guided discovery form showing a structured question step with progress indicator",
      caption: "SiteMint discovery flow — preview data",
      addressLabel: "/discovery",
    },
  },
  {
    icon: Workflow,
    kicker: capabilityLabelsV5.planned,
    title: "Practice intake & follow-through",
    body: "A representative composition: structured client intake feeding a case record, with document requests, reminders, and status updates handled automatically between human touchpoints.",
    flow: ["Structured intake", "Case record created", "Document request sent", "Status updates automated"],
    environment: { image: envPractice, alt: "Professional practice meeting room environment — generated illustration" },
    evidence: {
      image: hdAppointments,
      alt: "SiteMint dashboard appointments screen listing scheduled client appointments",
      caption: "SiteMint dashboard — appointments view, preview data",
      addressLabel: "/dashboard/appointments",
    },
  },
];

/**
 * The published lineup (owner featured-work hierarchy, 2026-09-07):
 * Simply Save Solar is the primary featured project, OneFilAm Community
 * the second feature stage, and Hand Homecare leads the supporting grid —
 * all ordering and copy come from the manifest-backed data module
 * (docs/sitemint-platform/PORTFOLIO_PERMISSION_MANIFEST.md). Shasta Greene
 * remains approved-in-intent with no approved visual, so it is not listed.
 */
const publishedProjects = portfolioProjects
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * Per-composition "the system" / "the interface" toggle (owner directive:
 * "useful interaction" on every retained container). "The system" is a
 * labelled flow diagram of the representative composition itself — still
 * honestly a composition, not a client record. "The interface" is the real
 * SiteMint surface that would power that stage, in a `BrowserFrame`. Two
 * plain toggle buttons (`aria-pressed`), not a full ARIA tabs pattern —
 * appropriate for a simple two-state switch.
 */
function CompositionEvidence({ item }: { item: CapabilityWorkItem }) {
  // Defaults to "the interface" — the owner directive is "more real product
  // evidence" first, with the composition diagram as the secondary,
  // explicitly-labelled-representative view a click away.
  const [view, setView] = useState<"system" | "interface">("interface");
  const panelId = `sm-evidence-${item.title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="sm-evidence">
      <figure className="sm-evidence__env">
        <img src={item.environment.image} alt={item.environment.alt} loading="lazy" />
        <figcaption>Representative environment — generated illustration</figcaption>
      </figure>
      <div className="sm-evidence__tabs" role="group" aria-label={`View ${item.title} as`}>
        <button
          type="button"
          className="sm-evidence__tab"
          aria-pressed={view === "system"}
          aria-controls={panelId}
          onClick={() => setView("system")}
        >
          The system
        </button>
        <button
          type="button"
          className="sm-evidence__tab"
          aria-pressed={view === "interface"}
          aria-controls={panelId}
          onClick={() => setView("interface")}
        >
          The interface
        </button>
      </div>
      <div className="sm-evidence__panel" id={panelId}>
        {view === "system" ? (
          <div className="sm-evidence__diagram">
            <div className="sm-flow">
              {item.flow.map((node, i) => (
                <Fragment key={node}>
                  <span className="sm-flow__node">
                    <span className="sm-flow__dot" aria-hidden="true" />
                    {node}
                  </span>
                  {i < item.flow.length - 1 && (
                    <svg className="sm-flow__arrow" viewBox="0 0 24 6" aria-hidden="true">
                      <line x1="0" y1="3" x2="24" y2="3" pathLength={1} />
                    </svg>
                  )}
                </Fragment>
              ))}
            </div>
            <p className="sm-evidence__diagram-note">
              The composition's flow — representative, not a client record.
            </p>
          </div>
        ) : (
          <BrowserFrame
            src={item.evidence.image}
            alt={item.evidence.alt}
            caption={item.evidence.caption}
            addressLabel={item.evidence.addressLabel}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Selected projects — structurally complete portfolio scaffold. Renders a
 * clean, ready-to-fill grid; with no cleared entries yet it shows a single
 * honest state card instead of a fabricated project, client, screenshot, or
 * result.
 */
/**
 * Interactive project presentation (owner featured-work + interaction
 * directive, 2026-09-07). Two editorial feature stages (Simply Save Solar,
 * then OneFilAm Community) followed by the supporting grid. Every project
 * opens the ProjectDialog through a REAL button (the stretched
 * "Explore project" control); the live-site link stays its own anchor
 * layered above the button so nested-interactive semantics never occur.
 * Hover behavior (image zoom ≤1.05, mint frame illumination, signal-line
 * draw, tag reveal, restrained lift at 180–280ms) lives in v5-pages.css
 * and is fully disabled under prefers-reduced-motion.
 */
function ProjectCardBody({ project, index, onOpen }: {
  project: PortfolioProject;
  index: number;
  onOpen: (index: number) => void;
}) {
  return (
    <>
      <span className="sm-proj-card__no" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="sm-proj-card__client">{project.category}</span>
      <h3 className="sm-proj-card__title">{project.projectName}</h3>
      <p className="sm-proj-card__summary">{project.summary}</p>
      <span className="sm-proj-card__tags" aria-hidden="true">
        {project.contribution.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </span>
      <span className="sm-proj-card__row">
        <button
          type="button"
          className="sm-proj-card__open"
          onClick={(e) => {
            e.currentTarget.focus();
            onOpen(index);
          }}
        >
          Explore project
          <ArrowRight aria-hidden="true" size={16} />
        </button>
        {project.publicUrl && (
          <a
            className="sm-proj-card__visit"
            href={project.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Live site ↗
          </a>
        )}
      </span>
      <span className="sm-proj-card__signal" aria-hidden="true" />
    </>
  );
}

function SelectedProjectsSection({ reveal }: { reveal: ReturnType<typeof useReveal> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const featured = publishedProjects.filter((p) => p.featured);
  const supporting = publishedProjects.filter((p) => !p.featured);

  return (
    <section className="v3-section" data-tone="porcelain">
      <div className="v3-container v3-reveal" ref={reveal}>
        <div className="v3m-sechead">
          <span className="v3m-sechead__no">03</span>
          <h2 className="v3-h2 reveal-clip">Selected projects.</h2>
          <p className="v3-lede reveal-fade-up">
            Real, named client work — published once each client has agreed
            to it, never before.
          </p>
        </div>

        {featured.map((project, fi) => {
          const index = publishedProjects.indexOf(project);
          return (
            <article
              key={project.id}
              className={`sm-proj-feature reveal-scale-settle${fi % 2 === 1 ? " sm-proj-feature--flip" : ""}`}
            >
              <div className="sm-proj-feature__media">
                {project.desktopAsset && (
                  <img
                    className="sm-proj-feature__desktop"
                    src={project.desktopAsset.src}
                    alt={project.desktopAsset.alt}
                    width={project.desktopAsset.width}
                    height={project.desktopAsset.height}
                    loading={fi === 0 ? "eager" : "lazy"}
                  />
                )}
                {project.mobileAsset && (
                  <img
                    className="sm-proj-feature__mobile"
                    src={project.mobileAsset.src}
                    alt=""
                    aria-hidden="true"
                    width={project.mobileAsset.width}
                    height={project.mobileAsset.height}
                    loading="lazy"
                  />
                )}
              </div>
              <div className="sm-proj-feature__copy">
                <ProjectCardBody project={project} index={index} onOpen={setOpenIndex} />
              </div>
            </article>
          );
        })}

        <div className="sm-proj-grid">
          {supporting.map((project) => {
            const index = publishedProjects.indexOf(project);
            const asset = project.desktopAsset ?? project.mobileAsset ?? project.fallbackAsset;
            return (
              <article
                key={project.id}
                className={`sm-proj-card reveal-scale-settle${!project.desktopAsset ? " sm-proj-card--portrait" : ""}`}
              >
                {asset && (
                  <span className="sm-proj-card__media">
                    <img
                      src={asset.src}
                      alt={asset.alt}
                      width={asset.width}
                      height={asset.height}
                      loading="lazy"
                    />
                  </span>
                )}
                <div className="sm-proj-card__body">
                  <ProjectCardBody project={project} index={index} onOpen={setOpenIndex} />
                </div>
              </article>
            );
          })}
        </div>

        <ProjectDialog
          projects={publishedProjects}
          openIndex={openIndex}
          onNavigate={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      </div>
    </section>
  );
}

export default function WorkV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "Work — SiteMint Digital",
    description:
      "What SiteMint has actually built and run, labelled honestly: available now, private beta, in development, or planned.",
  });

  return (
    <div className="v3-work-page sm-v5page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
          <span className="v3-eyebrow reveal-fade-up">Work</span>
          {/* Headline is the hero LCP text — left static (no mask-reveal) so
              first paint isn't delayed; eyebrow/lede/actions carry the motion. */}
          <h1 className="v3-display">Proof you can inspect.</h1>
          <p className="v3-lede reveal-fade-up">
            We don't decorate this page with logos we can't verify or numbers
            we can't stand behind. Here is what SiteMint actually builds and
            runs — and honest examples of what we compose for clients.
          </p>
          <div className="v3m-hero__actions reveal-fade-up">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Plan My Project
            </Link>
            <Link href={ROUTES.process} className="v3-btn v3-btn--outline">
              See the process
            </Link>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">01</span>
            <h2 className="v3-h2 reveal-clip">Built and operated by SiteMint.</h2>
          </div>
          {productionWork.map((item) => (
            <article key={item.title} className="v3wk-item reveal-scale-settle">
              <div className="v3wk-item__meta">
                <span className="v3-eyebrow">
                  <item.icon aria-hidden="true" size={14} />
                  {item.kicker}
                </span>
              </div>
              <div className="v3wk-item__body">
                <h3 className="v3-h2">{item.title}</h3>
                <p className="v3-body">{item.body}</p>
                <p className="v3-body">{item.detail}</p>
                <div>
                  <Link href={item.href} className="v3-btn v3-btn--outline">
                    {item.linkLabel}
                    <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="v3m-sechead">
            <span className="v3m-sechead__no">02</span>
            <h2 className="v3-h2 reveal-clip">What we compose for clients.</h2>
            <p className="v3-lede reveal-fade-up">
              These are capability demonstrations — representative system
              compositions, not client case studies. They show how the pieces
              fit; your system starts from your business.
            </p>
          </div>
          <div className="v3m-cards v3m-cards--3">
            {capabilityWork.map((item) => (
              <div key={item.title} className="v3-card v3m-card-link reveal-scale-settle">
                <span className="v3m-card-link__kicker">{item.kicker}</span>
                <h3 className="v3m-card-link__title">{item.title}</h3>
                <p className="v3m-card-link__desc">{item.body}</p>
                <CompositionEvidence item={item} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <SelectedProjectsSection reveal={reveal} />

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display reveal-clip">The next system here could be yours.</h2>
          <p className="v3-lede reveal-fade-up">
            Start with a discovery brief and see how we'd compose it.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary reveal-fade-up">
              Plan My Project
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
