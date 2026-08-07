/**
 * Frontend V2 Phase 3 — the complete homepage.
 *
 * Section order is fixed by INFORMATION-ARCHITECTURE.md §2. Sections 1 and 13
 * (header and footer) belong to the shared shell; this module owns 2–12:
 *
 *   2 Hero · 3 Connected-system statement · 4 Business outcomes ·
 *   5 What SiteMint builds · 6 Interactive system workflow ·
 *   7 AI Receptionist feature · 8 Selected work · 9 SiteMint process ·
 *   10 Team · 11 FAQ · 12 Final project CTA
 *
 * Surface plan: warm white and off-white dominate; pale mint and mint mist give
 * restrained differentiation; **navy appears exactly twice on the page** — the
 * workflow feature section here, and the footer in the shell.
 *
 * Content integrity. Every project, person, and process phase on this page is
 * read from data already verified in this repository — `portfolioProjects.ts`,
 * the `team-*` assets, and the phases `ProcessSection.tsx` already ships. There
 * are no invented statistics, results, testimonials, customer counts, response
 * times, setup timelines, revenue claims, named integrations, awards, partner
 * logos, or social accounts anywhere in this file. Where an outcome is not
 * verified, the project shows the problem, what was built, and its connected-
 * system purpose — and no performance number.
 *
 * Imagery. No generated image, no Magnific asset, and no video is used. The
 * hero is a real HTML/CSS composition (`SystemComposition`); the only
 * photographs are the verified team portraits and the verified project
 * screenshots that already ship in `public/`, all routed through `withBase()`
 * so they resolve under a deployment prefix as well as at the root.
 */

import { Link } from "wouter";
import {
  Globe,
  Database,
  MessageSquare,
  Plug,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import {
  ROUTES,
  START_PROJECT_ROUTE,
  HOME_SECTIONS,
  homeSection,
  servicesSection,
  withBase,
} from "@/lib/routes";
import { SystemComposition } from "@/components/v2/home/SystemComposition";
import { WorkflowSection } from "@/components/v2/home/WorkflowSection";
import { FaqSection } from "@/components/v2/home/FaqSection";
import { CAPABILITY_STATUS, READINESS } from "@/components/v2/home/readiness";
import { portfolioProjects } from "@/components/platform-preview/portfolioProjects";

/* ── 4. Business outcomes — outcomes, not features, and no numbers. ──────── */
const outcomes = [
  {
    title: "Respond while the lead is still warm",
    body: "An inquiry gets an answer instead of sitting in an inbox until the customer has already called someone else.",
  },
  {
    title: "Stop losing leads in the follow-up gap",
    body: "Conversations stay in one place with their history attached, so the second contact does not depend on someone remembering.",
  },
  {
    title: "See what is actually happening",
    body: "One record of who asked for what, instead of the truth being split across a phone, an inbox, and a notebook.",
  },
  {
    title: "Spend less time on busywork",
    body: "The repetitive parts — retyping details, chasing the same question twice — stop being a person's job.",
  },
];

/* ── 5. What SiteMint builds ─────────────────────────────────────────────── */
const buildItems = [
  {
    title: "Websites & Apps",
    body: "Marketing sites that give a visitor an obvious next step, and custom software shaped around how the business actually runs.",
    href: servicesSection("websites-apps"),
    icon: Globe,
  },
  {
    title: "CRM & Automation",
    body: "One system of record for every lead and client, and the repetitive follow-up work handled without a person driving it.",
    href: servicesSection("crm-automation"),
    icon: Database,
  },
  {
    title: "AI Receptionist",
    body: "Replies to inbound inquiries over SMS, asks the questions your business needs answered, and keeps the conversation organised.",
    href: ROUTES.aiReceptionist,
    icon: MessageSquare,
  },
  {
    title: "Integrations",
    body: "Connecting the systems you already run so they behave as one. We describe the approach rather than name products we have not verified.",
    href: ROUTES.contact,
    icon: Plug,
  },
];

/* ── 9. Process — the five phases already verified in ProcessSection.tsx. ── */
const processPhases = [
  {
    label: "Discover",
    body: "We start by understanding the business, not the tech stack: current goals, where leads or time are being lost, and what the customer's journey actually looks like today.",
  },
  {
    label: "Architect",
    body: "Before building anything, we map how the pieces connect — website, product, CRM, automation — and scope exactly what is in and out.",
  },
  {
    label: "Build",
    body: "Design and engineering happen together, with the systems from Architect actually wired up rather than handed off to be built later.",
  },
  {
    label: "Launch",
    body: "We verify the system works end to end, train the team who will use it, and release in a controlled way rather than one risky cutover.",
  },
  {
    label: "Improve",
    body: "A launched system is not a finished one. We review how it is performing and refine it as the business changes.",
  },
];

/* ── 10. Team — the three people named in index.html's Organization JSON-LD,
   with the portrait assets that already ship in public/. ─────────────────── */
const team = [
  {
    name: "Claidy Taguran",
    role: "Technical Director",
    photo: "/team-claidy.png",
  },
  {
    name: "Shasta Greene",
    role: "Head of Strategy",
    photo: "/team-shasta.jpg",
  },
  {
    name: "Saisa Lorraigne",
    role: "Project and Admin Manager",
    photo: "/team-saisa.jpg",
  },
];

export default function HomeV2() {
  return (
    <>
      {/* ── 2. Hero ───────────────────────────────────────────────────────── */}
      <section className="v2-section v2-hero" aria-labelledby="hero-heading">
        <div className="v2-wrap v2-hero__grid">
          <div className="v2-hero__copy v2-enter">
            <h1 id="hero-heading" className="v2-display">
              Digital systems built to turn attention into customers.
            </h1>
            <p className="v2-lede">
              SiteMint designs websites, apps, CRM workflows, and AI
              receptionists that work together—so your business can respond
              faster, follow up better, and grow without adding more busywork.
            </p>
            <div className="v2-hero__actions">
              <Link href={START_PROJECT_ROUTE} className="v2-btn v2-btn--primary">
                Start Your Project
              </Link>
              <Link
                href={homeSection("work")}
                className="v2-btn v2-btn--secondary"
              >
                View Our Work
                <ArrowRight aria-hidden="true" className="v2-btn__icon" />
              </Link>
            </div>
          </div>

          <div className="v2-hero__visual v2-enter v2-enter--delayed">
            <SystemComposition />
          </div>
        </div>
      </section>

      {/* ── 3. Connected-system statement ─────────────────────────────────── */}
      <section className="v2-section v2-section--accent" aria-labelledby="thesis-heading">
        <div className="v2-wrap v2-wrap--narrow">
          <h2 id="thesis-heading" className="v2-h2 v2-statement">
            Most businesses do not need six more tools. They need the ones they
            already have to behave like a single system.
          </h2>
        </div>
      </section>

      {/* ── 4. Business outcomes ──────────────────────────────────────────── */}
      <section className="v2-section" aria-labelledby="outcomes-heading">
        <div className="v2-wrap">
          <p className="v2-eyebrow">What changes</p>
          <h2 id="outcomes-heading" className="v2-h2">
            What a connected system actually changes
          </h2>

          <ul className="v2-outcomes">
            {outcomes.map((item) => (
              <li key={item.title} className="v2-outcomes__item">
                <h3 className="v2-h3">{item.title}</h3>
                <p className="v2-body-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 5. What SiteMint builds ───────────────────────────────────────── */}
      <section className="v2-section v2-section--alt" aria-labelledby="builds-heading">
        <div className="v2-wrap">
          <p className="v2-eyebrow">Scope</p>
          <h2 id="builds-heading" className="v2-h2">
            What SiteMint builds
          </h2>

          <ul className="v2-builds">
            {buildItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="v2-builds__item">
                  <Icon aria-hidden="true" className="v2-builds__icon" />
                  <h3 className="v2-h3">{item.title}</h3>
                  <p className="v2-body-muted">{item.body}</p>
                  <Link href={item.href} className="v2-textlink">
                    Learn more
                    <ArrowRight aria-hidden="true" className="v2-textlink__icon" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── 6. Interactive system workflow — the one navy feature section ─── */}
      <WorkflowSection />

      {/* ── 7. AI Receptionist feature, with mandatory readiness labelling ── */}
      <section className="v2-section" aria-labelledby="receptionist-heading">
        <div className="v2-wrap v2-split">
          <div>
            <p className="v2-eyebrow">AI Receptionist</p>
            <h2 id="receptionist-heading" className="v2-h2">
              An inquiry gets a reply, and the details get captured
            </h2>
            <p className="v2-lede">
              The SiteMint receptionist answers inbound text inquiries, asks the
              questions your business decided matter, and keeps the whole
              conversation in one place. Here is exactly where each part of it
              stands today.
            </p>
            <Link href={ROUTES.aiReceptionist} className="v2-btn v2-btn--secondary">
              See the AI Receptionist
              <ArrowRight aria-hidden="true" className="v2-btn__icon" />
            </Link>
          </div>

          <ul className="v2-status">
            {CAPABILITY_STATUS.map((item) => (
              <li key={item.capability} className="v2-status__item">
                <div className="v2-status__head">
                  <h3 className="v2-h3">{item.capability}</h3>
                  <span className={`v2-tier v2-tier--${item.tier}`}>
                    {READINESS[item.tier].label}
                  </span>
                </div>
                <p className="v2-body-muted">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 8. Selected work ──────────────────────────────────────────────── */}
      <section
        className="v2-section v2-section--alt"
        aria-labelledby="work-heading"
        id={HOME_SECTIONS.work}
      >
        <div className="v2-wrap">
          <p className="v2-eyebrow">Selected work</p>
          <h2 id="work-heading" className="v2-h2">
            Projects we have built
          </h2>
          <p className="v2-lede">
            We publish the problem, what we built, and what it connects to. We do
            not publish performance figures we cannot substantiate.
          </p>

          <ul className="v2-work">
            {portfolioProjects.map((project) => {
              const asset = project.desktopAsset ?? project.mobileAsset;
              return (
                <li key={project.id} className="v2-work__item">
                  {asset && (
                    <img
                      className="v2-work__shot"
                      src={withBase(asset.src)}
                      width={asset.width}
                      height={asset.height}
                      alt={asset.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="v2-work__body">
                    <p className="v2-work__meta">
                      {project.category} · {project.industry}
                    </p>
                    <h3 className="v2-h3">{project.projectName}</h3>
                    <p className="v2-body-muted">{project.summary}</p>
                    <ul className="v2-work__tags">
                      {project.contribution.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {project.publicUrl && (
                      <a
                        className="v2-textlink"
                        href={project.publicUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {project.ctaLabel}
                        <ArrowUpRight
                          aria-hidden="true"
                          className="v2-textlink__icon"
                        />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── 9. SiteMint process ───────────────────────────────────────────── */}
      <section
        className="v2-section"
        aria-labelledby="process-heading"
        id={HOME_SECTIONS.process}
      >
        <div className="v2-wrap">
          <p className="v2-eyebrow">How we work</p>
          <h2 id="process-heading" className="v2-h2">
            The SiteMint process
          </h2>

          <ol className="v2-process">
            {processPhases.map((phase, index) => (
              <li key={phase.label} className="v2-process__step">
                <span className="v2-process__num" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="v2-h3">{phase.label}</h3>
                  <p className="v2-body-muted">{phase.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 10. Team ──────────────────────────────────────────────────────── */}
      <section className="v2-section v2-section--accent" aria-labelledby="team-heading">
        <div className="v2-wrap">
          <p className="v2-eyebrow">Who you work with</p>
          <h2 id="team-heading" className="v2-h2">
            The team
          </h2>

          <ul className="v2-team">
            {team.map((person) => (
              <li key={person.name} className="v2-team__item">
                <img
                  className="v2-team__photo"
                  src={withBase(person.photo)}
                  alt={`${person.name}, ${person.role} at SiteMint Digital`}
                  loading="lazy"
                  decoding="async"
                  width={320}
                  height={320}
                />
                <h3 className="v2-h3">{person.name}</h3>
                <p className="v2-body-muted">{person.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 11. FAQ ───────────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ── 12. Final project CTA ─────────────────────────────────────────── */}
      <section className="v2-section v2-cta" aria-labelledby="cta-heading">
        <div className="v2-wrap v2-wrap--narrow v2-cta__inner">
          <h2 id="cta-heading" className="v2-h2">
            Tell us what your business is trying to fix
          </h2>
          <p className="v2-lede">
            Discovery is a conversation, not a commitment. You describe how
            things work today and where they break; we tell you honestly what we
            would build and what we would leave alone.
          </p>
          <Link href={START_PROJECT_ROUTE} className="v2-btn v2-btn--primary">
            Start Your Project
          </Link>
        </div>
      </section>
    </>
  );
}
