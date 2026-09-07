/**
 * AI Receptionist client demonstration (owner client-access directive,
 * 2026-09-07): a safe, truthful, guided tour of the receptionist dashboard
 * for client review — real product surfaces captured with SYNTHETIC
 * preview data, clearly disclosed, with no live account, no customer
 * information, no provider charges, and nothing to reset (the page is
 * stateless by construction).
 *
 * The CRM chapter is a capability DEMONSTRATION (the same synthetic
 * Connected Operations Map the homepage carries) — never a path into the
 * private staff Operations CRM, which remains role-protected and is not
 * shown publicly (standing constraint).
 */

import { Link } from "wouter";
import { PublicShell } from "@/shells/PublicShell";
import { ROUTES, dashboardUrl } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { BrowserFrame } from "@/components/v5/BrowserFrame";
import { ConnectedOpsMap } from "@/components/v5/ConnectedOpsMap";
import hdOverview from "@/assets/product/hd-overview.png";
import hdCalls from "@/assets/product/hd-calls.png";
import hdContacts from "@/assets/product/hd-contacts.png";
import hdAppointments from "@/assets/product/hd-appointments.png";
import hdAvailability from "@/assets/product/hd-availability.png";
import "@/styles/v5-pages.css";

const TOUR = [
  {
    no: "01",
    title: "Overview",
    body: "The workspace a business owner lands on: today's activity, recent call outcomes, and what needs a human next — one screen instead of a voicemail inbox.",
    image: hdOverview,
    alt: "SiteMint dashboard overview screen with synthetic preview data",
    address: "/dashboard",
    caption: "Dashboard overview — synthetic preview data",
  },
  {
    no: "02",
    title: "Calls",
    body: "Every handled call as an operational record: who called, what the receptionist did, the outcome, and what was handed to a person. No raw recordings are retained by default.",
    image: hdCalls,
    alt: "SiteMint dashboard calls screen listing synthetic call records and outcomes",
    address: "/dashboard/calls",
    caption: "Call records — synthetic preview data",
  },
  {
    no: "03",
    title: "Contacts & follow-ups",
    body: "Callers become contacts with history attached, so follow-ups happen from context — not from memory.",
    image: hdContacts,
    alt: "SiteMint dashboard contacts screen with synthetic contact records",
    address: "/dashboard/contacts",
    caption: "Contacts — synthetic preview data",
  },
  {
    no: "04",
    title: "Appointments",
    body: "Bookings the receptionist takes land on a real schedule, with confirmations tracked through to completion.",
    image: hdAppointments,
    alt: "SiteMint dashboard appointments screen listing synthetic scheduled appointments",
    address: "/dashboard/appointments",
    caption: "Appointments — synthetic preview data",
  },
  {
    no: "05",
    title: "Availability & configuration",
    body: "The business stays in charge: open hours, appointment types, and what the receptionist may offer are configured here — every automated behavior has an off switch.",
    image: hdAvailability,
    alt: "SiteMint dashboard availability screen showing an editable weekly schedule",
    address: "/dashboard/scheduling/availability",
    caption: "Availability — synthetic preview data",
  },
];

export default function AiReceptionistDemoV5() {
  const reveal = useReveal();
  usePageMeta({
    title: "AI Receptionist Demo — SiteMint Digital",
    description:
      "A guided, safely simulated tour of the SiteMint AI Receptionist dashboard — calls, appointments, follow-ups, and configuration — using synthetic preview data.",
  });

  return (
    <PublicShell chrome="v4" routeLabel="AI Receptionist Demo" heroTone="light">
      <div className="sm-v5page sm-demo-page">
        <section className="v3m-page-hero" data-tone="porcelain">
          <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
            <span className="v3-eyebrow reveal-fade-up">Client demonstration</span>
            <h1 className="v3-display">
              The receptionist dashboard, <span className="sm-mark">surface by surface.</span>
            </h1>
            <p className="v3-lede reveal-fade-up">
              This is the real product interface, captured with synthetic
              business data so you can evaluate it without an account.
            </p>
            <p className="sm-demo-disclosure reveal-fade-up" role="note">
              Simulated preview — synthetic business and call data. No live
              account, no customer information, and nothing on this page
              places calls or creates charges.
            </p>
            <div className="v3m-hero__actions reveal-fade-up">
              <a href={dashboardUrl("/login")} className="v3-btn v3-btn--primary">
                Sign in
              </a>
              <Link href={`${ROUTES.aiReceptionist}#beta`} className="v3-btn v3-btn--outline">
                Request access
              </Link>
              <Link href={`${ROUTES.aiReceptionist}#preview`} className="v3-btn v3-btn--quiet">
                Try the interactive preview
              </Link>
            </div>
          </div>
        </section>

        <section className="v3-section" data-tone="white">
          <div className="v3-container v3-reveal" ref={reveal}>
            <div className="v3m-sechead">
              <span className="v3m-sechead__no">01 · The dashboard tour</span>
              <h2 className="v3-h2 reveal-clip">Five surfaces a business actually uses.</h2>
            </div>
            <div className="sm-demo-tour">
              {TOUR.map((stop) => (
                <article className="sm-demo-stop reveal-scale-settle" key={stop.no}>
                  <div className="sm-demo-stop__copy">
                    <span className="sm-proj-card__no" aria-hidden="true">{stop.no}</span>
                    <h3 className="sm-demo-stop__title">{stop.title}</h3>
                    <p>{stop.body}</p>
                  </div>
                  <BrowserFrame
                    src={stop.image}
                    alt={stop.alt}
                    caption={stop.caption}
                    addressLabel={stop.address}
                  />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="v3-section" data-tone="porcelain">
          <div className="v3-container v3-reveal" ref={reveal}>
            <div className="v3m-sechead">
              <span className="v3m-sechead__no">02 · CRM &amp; operations</span>
              <h2 className="v3-h2 reveal-clip">Where the call ends up: a capability demonstration.</h2>
              <p className="v3-lede reveal-fade-up">
                The map below walks the same seven steps a project or inquiry
                moves through in a SiteMint-built CRM. Every name in it is
                invented for illustration — the real SiteMint Operations CRM
                is private, role-protected, and never shown publicly.
              </p>
            </div>
            <ConnectedOpsMap />
          </div>
        </section>

        <section className="v3-section" data-tone="ink">
          <div className="v3-container v3-reveal" ref={reveal}>
            <h2 className="v3-h2 reveal-clip">Ready when you are.</h2>
            <p className="v3-lede reveal-fade-up">
              The AI Receptionist is in private, invite-only beta. Request
              access and we will walk your business through setup.
            </p>
            <div className="v3m-hero__actions reveal-fade-up">
              <Link href={`${ROUTES.aiReceptionist}#beta`} className="v3-btn v3-btn--primary">
                Request private beta
              </Link>
              <a href={dashboardUrl("/login")} className="v3-btn v3-btn--outline">
                Client sign in
              </a>
            </div>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
