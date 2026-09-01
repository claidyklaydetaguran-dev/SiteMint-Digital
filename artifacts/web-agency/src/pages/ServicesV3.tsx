/**
 * Frontend V3 — Services hub. Orients, then routes to the four service pages.
 */

import { Fragment } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Globe,
  AudioLines,
  Search,
  Workflow,
  Plug,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";

const services = [
  {
    icon: Globe,
    title: "Websites & Web Apps",
    headline: "A website that knows what happens next.",
    desc: "Editorial-grade marketing sites and custom applications, designed backwards from the action a real customer should take.",
    href: ROUTES.websitesApps,
  },
  {
    icon: AudioLines,
    title: "AI Receptionist",
    headline: "The call you miss shouldn't be the customer you lose.",
    desc: "A business receptionist that answers, understands, books, follows up, and knows when to bring in a person.",
    href: ROUTES.aiReceptionist,
  },
  {
    icon: Search,
    title: "Discovery Systems",
    headline: "Turn first contact into a useful brief.",
    desc: "Structured, adaptive intake that hands your team something they can price, plan, and respond to the same day.",
    href: ROUTES.discoverySystems,
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    headline: "Less handoff. Less busywork. More momentum.",
    desc: "Follow-ups, routing, and record-keeping handled automatically — with people kept in the loop and an audit trail on every step.",
    href: ROUTES.automation,
  },
];

export default function ServicesV3() {
  const reveal = useReveal();

  return (
    <div className="v3-services-hub">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Services</span>
          <h1 className="v3-display">
            Four ways in. One connected system.
          </h1>
          <p className="v3-lede">
            Each service stands on its own. Together they form the SiteMint
            system: attention arrives at the website, discovery turns it into a
            brief, automation and the receptionist carry the work, and your
            team finishes it.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          {services.map((service, i) => (
            <Fragment key={service.title}>
              <article className="v3wk-item">
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

          <article className="v3wk-item">
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
                  href={`${ROUTES.automation}#integrations`}
                  className="v3-btn v3-btn--outline"
                >
                  See how systems connect
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
