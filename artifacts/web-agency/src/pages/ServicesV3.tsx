/**
 * Frontend V3/V5 — Services hub ("What We Build"). Orients, then routes to
 * the service pages.
 *
 * V5 changes (W-2): working section anchors that match the header's mega
 * panel and an interactive systems map (hover/focus/tap highlights a
 * pillar and jumps to its anchor). "AI Systems & Automation" replaced
 * "Workflow Automation" and now includes CRM & internal systems as a
 * distinct, anchored section rather than a separate route (W-6).
 */

import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Globe,
  Search,
  Workflow,
  Database,
  Plug,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";

type PillarId = "websites-apps" | "discovery-systems" | "ai-systems" | "crm-systems";

interface Pillar {
  id: PillarId;
  icon: typeof Globe;
  title: string;
  headline: string;
  desc: string;
  href: string;
  mapPos: { x: number; y: number };
}

const pillars: Pillar[] = [
  {
    id: "websites-apps",
    icon: Globe,
    title: "Websites & Web Apps",
    headline: "A website that knows what happens next.",
    desc: "Editorial-grade marketing sites and custom applications, designed backwards from the action a real customer should take.",
    href: ROUTES.websitesApps,
    mapPos: { x: 70, y: 140 },
  },
  {
    id: "discovery-systems",
    icon: Search,
    title: "Discovery Systems",
    headline: "Turn first contact into a useful brief.",
    desc: "Structured, adaptive intake that hands your team something they can price, plan, and respond to the same day.",
    href: ROUTES.discoverySystems,
    mapPos: { x: 230, y: 60 },
  },
  {
    id: "ai-systems",
    icon: Workflow,
    title: "AI Systems & Automation",
    headline: "Less handoff. Less busywork. More momentum.",
    desc: "Follow-ups, routing, evaluation, and record-keeping handled automatically — with people kept in the loop and an audit trail on every step.",
    href: ROUTES.aiSystems,
    mapPos: { x: 390, y: 140 },
  },
  {
    id: "crm-systems",
    icon: Database,
    title: "CRM & Internal Systems",
    headline: "Where the business runs, in one place.",
    desc: "Pipeline, tasks, and records the team actually looks at — connected to the rest of the system, not a fifth disconnected tool.",
    href: `${ROUTES.aiSystems}#crm-systems`,
    mapPos: { x: 390, y: 240 },
  },
];

/**
 * The interactive systems map (W-2). Styled entirely with inline styles and
 * SVG presentation attributes — this page's stylesheets (`v3-marketing.css`,
 * `v3-pages.css`) are protected files this workstream may not edit, and
 * `v5-home.css` is scoped to `HomeV5` only, so no new class-based stylesheet
 * is introduced here.
 */
function SystemsMap() {
  const [active, setActive] = useState<PillarId | null>(null);

  function jumpTo(id: PillarId) {
    // Keep the URL deep-linkable: the map is an anchor navigation, so the
    // fragment must land in the address bar (replace, not push — overlay-free
    // in-page moves never add history entries).
    history.replaceState(history.state, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ maxWidth: 460, margin: "2rem auto 0" }}>
      <svg
        viewBox="0 0 460 300"
        role="group"
        aria-label="Interactive map of the four connected SiteMint systems"
        style={{ width: "100%", height: "auto" }}
      >
        <path
          d="M70 140 L230 60 L390 140 L390 240"
          fill="none"
          stroke="var(--v3-line, #CFE7EA)"
          strokeWidth={2}
        />
        {pillars.map((p) => {
          const isActive = active === p.id;
          return (
            <a key={p.id} href={`#${p.id}`} tabIndex={-1}>
              <circle
                cx={p.mapPos.x}
                cy={p.mapPos.y}
                r={26}
                fill={isActive ? "var(--v3-mint, #32C5D2)" : "var(--v3-surface, #fff)"}
                stroke="var(--v3-mint, #32C5D2)"
                strokeWidth={isActive ? 3 : 1.5}
                style={{ cursor: "pointer", transition: "fill 160ms ease, stroke-width 160ms ease" }}
                onMouseEnter={() => setActive(p.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.id)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                role="link"
                aria-label={p.title}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    jumpTo(p.id);
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(p.id);
                }}
              />
              <text
                x={p.mapPos.x}
                y={p.mapPos.y + 44}
                textAnchor="middle"
                style={{
                  fontSize: 11,
                  fill: isActive ? "var(--v3-ink, #173642)" : "var(--v3-text-muted, #4A6472)",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {p.title}
              </text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}

export default function ServicesV3() {
  const reveal = useReveal();
  usePageMeta({
    title: "What We Build — SiteMint Digital",
    description:
      "Websites & web apps, discovery systems, AI systems & automation, and CRM & internal systems — four connected SiteMint pillars, plus pricing estimates.",
  });

  return (
    <div className="v3-services-hub">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Services</span>
          <h1 className="v3-display">
            Four connected systems. One SiteMint build.
          </h1>
          <p className="v3-lede">
            Each system stands on its own. Together they form the SiteMint
            system: attention arrives at the website, discovery turns it into
            a brief, AI systems and automation carry the work, and the CRM is
            where your team sees it all.
          </p>
          <SystemsMap />
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          {pillars.map((service, i) => (
            <Fragment key={service.title}>
              <article className="v3wk-item" id={service.id} style={{ scrollMarginTop: "5rem" }}>
                <div className="v3wk-item__meta">
                  <span className="v3m-sechead__no">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="v3-eyebrow">
                    <service.icon aria-hidden="true" size={14} />
                    {service.title}
                  </span>
                </div>
                <div className="v3wk-item__body">
                  <h2 className="v3-h2">{service.headline}</h2>
                  <p className="v3-body">{service.desc}</p>
                  <div>
                    <Link href={service.href} className="v3-btn v3-btn--outline">
                      Explore {service.title}
                      <ArrowRight aria-hidden="true" size={16} />
                    </Link>
                  </div>
                </div>
              </article>
            </Fragment>
          ))}

          <article className="v3wk-item" id="integrations" style={{ scrollMarginTop: "5rem" }}>
            <div className="v3wk-item__meta">
              <span className="v3m-sechead__no">05</span>
              <span className="v3-eyebrow">
                <Plug aria-hidden="true" size={14} />
                Integrations
              </span>
            </div>
            <div className="v3wk-item__body">
              <h2 className="v3-h2">Connected to what you already run.</h2>
              <p className="v3-body">
                Calendars, phone, email, records, and billing — SiteMint
                systems connect to the tools your business already uses, so
                information stops being retyped and nothing lives in two
                places.
              </p>
              <div>
                <Link
                  href={`${ROUTES.aiSystems}#integrations`}
                  className="v3-btn v3-btn--outline"
                >
                  See how systems connect
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
            </div>
          </article>

          <article className="v3wk-item" id="pricing-estimates" style={{ scrollMarginTop: "5rem" }}>
            <div className="v3wk-item__meta">
              <span className="v3m-sechead__no">06</span>
              <span className="v3-eyebrow">Pricing estimates</span>
            </div>
            <div className="v3wk-item__body">
              <h2 className="v3-h2">Three starting points, honestly scoped.</h2>
              <p className="v3-body">
                Starter Site System, Growth Digital System, and Custom
                Connected System — with a scope configurator that composes a
                summary you can bring straight into a project brief.
              </p>
              <div>
                <Link href={ROUTES.pricing} className="v3-btn v3-btn--outline">
                  See pricing &amp; configure your scope
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display">Not sure which piece comes first?</h2>
          <p className="v3-lede">
            Start with discovery. You'll get a straight recommendation — and
            we'll tell you plainly what you don't need yet.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary">
              Start with SiteMint
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
