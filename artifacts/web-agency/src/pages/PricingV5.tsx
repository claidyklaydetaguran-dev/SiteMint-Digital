/**
 * Frontend V5 — Pricing (W-13 superseded by amendment §10; V5-BLUEPRINT §9).
 * Three tiers, the mandatory disclaimer, and a client-side "configure your
 * scope" tool that composes a plain-text summary and links into `/start`
 * with that summary carried in a `scope` query parameter — visible in the
 * URL and copyable, so it can be pasted into the discovery brief's "why
 * now"/"desired outcome" fields by hand. Nothing is submitted from this page,
 * and `DiscoveryPage`/`StartV3` do not read the parameter automatically.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Megaphone } from "lucide-react";
import {
  pricingTiersV5,
  PRICING_DISCLAIMER_V5,
  AI_RECEPTIONIST_PRICING_NOTE_V5,
  ADVERTISING_SERVICES_NOTE_V5,
  type PricingTierV5,
} from "@/components/v5/pricingTiersV5";
import "@/styles/v5-pages.css";

const ADVERTISING_BOUNDARIES = [
  "Client ad spend is always separate from SiteMint's service fee.",
  "We never guarantee leads, revenue, ROAS, platform approval, or rankings.",
  "Not every website package includes ongoing campaign management.",
  "Offered as a recurring or separately scoped engagement — never bundled by default.",
];

const PRICE_FACTORS = [
  {
    title: "Number of pages & flows",
    desc: "A five-page brochure site and a twenty-page site with gated content are different builds, even at the same tier.",
  },
  {
    title: "Integrations & CRM connections",
    desc: "Connecting to a calendar or an existing tool takes less time than replacing that tool with a SiteMint CRM.",
  },
  {
    title: "Automation complexity",
    desc: "A single follow-up sequence is a different scope than routing, reminders, and record-keeping across a whole pipeline.",
  },
  {
    title: "Content & design readiness",
    desc: "Ready copy and brand assets move faster than starting from a blank page — we'll tell you which applies during discovery.",
  },
  {
    title: "Timeline",
    desc: "A compressed launch date can change scope or cost; discovery is where we'll say so plainly, not after you've committed.",
  },
  {
    title: "Ongoing support",
    desc: "Launch-only versus continued tuning and support changes the total, not just the build price.",
  },
] as const;

const SCOPE_ADD_ONS = [
  { id: "crm", label: "CRM or workflow connection" },
  { id: "automation", label: "Automation for follow-up and routing" },
  { id: "integrations", label: "Integrations with existing tools" },
  { id: "custom-app", label: "A custom web application" },
  { id: "growth-infrastructure", label: "Growth infrastructure (tracking, pixels, consent)" },
  { id: "advertising", label: "Advertising services (separately scoped, recurring)" },
  { id: "training", label: "Team training after launch" },
] as const;

function TierCard({ tier }: { tier: PricingTierV5 }) {
  return (
    <div className={`v3-card reveal-scale-settle${tier.recommended ? " v3-card--hover" : ""}`} style={{ padding: "1.75rem", display: "grid", gap: "0.75rem" }}>
      {tier.recommended && (
        <span className="v3-eyebrow" style={{ color: "var(--sm-mint-700, #0B7487)" }}>
          Most common starting point
        </span>
      )}
      <h2 className="v3-h2" style={{ fontSize: "1.3rem" }}>{tier.name}</h2>
      <p style={{ fontFamily: "var(--sm-font-display, inherit)", fontSize: "1.6rem", color: "var(--sm-mint-700, #0B7487)", margin: 0 }}>
        {tier.priceFrom}
      </p>
      <p className="v3-body">{tier.tagline}</p>
      <p className="v3-body" style={{ fontSize: "0.9rem", color: "var(--sm-text-muted, #4A6472)" }}>
        Best for: {tier.bestFor}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
        {tier.includes.map((item) => (
          <li key={item} style={{ display: "flex", gap: "0.5rem" }}>
            <span aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {tier.honestyNote && (
        <p style={{ fontSize: "0.8rem", color: "var(--sm-text-muted, #4A6472)" }}>{tier.honestyNote}</p>
      )}
    </div>
  );
}

function ScopeConfigurator() {
  const [tierId, setTierId] = useState<PricingTierV5["id"]>("growth");
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");

  const tier = pricingTiersV5.find((t) => t.id === tierId)!;

  const summary = useMemo(() => {
    const lines = [
      `Starting point: ${tier.name} (${tier.priceFrom})`,
      addOns.size > 0
        ? `Additional scope: ${SCOPE_ADD_ONS.filter((a) => addOns.has(a.id)).map((a) => a.label).join(", ")}`
        : "Additional scope: none selected yet",
    ];
    if (notes.trim()) lines.push(`Notes: ${notes.trim()}`);
    return lines.join("\n");
  }, [tier, addOns, notes]);

  function toggleAddOn(id: string) {
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const startHref = `${ROUTES.start}?scope=${encodeURIComponent(summary)}`;

  return (
    <div className="v3-card" style={{ padding: "1.75rem", display: "grid", gap: "1.25rem" }}>
      <div>
        <span className="v3-eyebrow">Configure your scope</span>
        <h2 className="v3-h2" style={{ fontSize: "1.3rem" }}>Not sure which tier fits?</h2>
        <p className="v3-body">
          Pick a starting point and any additional scope you already know
          about. This composes a summary you can bring straight into your
          discovery brief — it doesn't submit anything on its own.
        </p>
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="v3-eyebrow" style={{ marginBottom: "0.5rem" }}>Starting point</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {pricingTiersV5.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`v3-btn ${tierId === t.id ? "v3-btn--primary" : "v3-btn--outline"}`}
              aria-pressed={tierId === t.id}
              onClick={() => setTierId(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="v3-eyebrow" style={{ marginBottom: "0.5rem" }}>Additional scope (optional)</legend>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {SCOPE_ADD_ONS.map((addOn) => (
            <label key={addOn.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={addOns.has(addOn.id)}
                onChange={() => toggleAddOn(addOn.id)}
              />
              {addOn.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span className="v3-eyebrow">Anything else worth mentioning?</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{
            border: "1px solid var(--sm-line, #CFE7EA)",
            borderRadius: "var(--sm-radius-m, 10px)",
            padding: "0.6rem 0.75rem",
            fontFamily: "inherit",
          }}
        />
      </label>

      <div style={{ border: "1px solid var(--sm-line, #CFE7EA)", borderRadius: "var(--sm-radius-m, 10px)", padding: "1rem", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
        {summary}
      </div>

      <Link href={startHref} className="v3-btn v3-btn--primary">
        Bring this into a discovery brief →
      </Link>
    </div>
  );
}

export default function PricingV5() {
  const reveal = useReveal();
  usePageMeta({
    title: "Pricing — SiteMint Digital",
    description:
      "Three starting points for a SiteMint system: Starter Site System, Growth Digital System, and Custom Connected System — plus a scope configurator.",
  });

  return (
    <div className="v3-services-hub sm-v5page">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner v3-reveal" ref={reveal}>
          <span className="v3-eyebrow reveal-fade-up">Pricing</span>
          {/* Headline is the hero LCP text — left static (no mask-reveal) so
              first paint isn't delayed; eyebrow/lede/actions carry the motion. */}
          <h1 className="v3-display">Three starting points. Every system is scoped.</h1>
          <p className="v3-lede reveal-fade-up">
            These are starting estimates, not quotes. Every project is scoped
            through discovery before we commit to a price.
          </p>
          <div className="v3m-hero__actions reveal-fade-up">
            <a href="#configure" className="v3-btn v3-btn--primary">
              Configure Your Scope
            </a>
            <Link href={ROUTES.start} className="v3-btn v3-btn--outline">
              Build Your SiteMint System
            </Link>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {pricingTiersV5.map((tier) => (
              <TierCard tier={tier} key={tier.id} />
            ))}
          </div>
          <p className="v3-body" style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--sm-text-muted, #4A6472)" }}>
            {PRICING_DISCLAIMER_V5}
          </p>
          <p className="v3-body" style={{ fontSize: "0.85rem", color: "var(--sm-text-muted, #4A6472)" }}>
            {AI_RECEPTIONIST_PRICING_NOTE_V5}
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <span className="v3-eyebrow">
            <Megaphone aria-hidden="true" size={14} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />
            Advertising services
          </span>
          <h2 className="v3-h2 reveal-clip" style={{ marginTop: "0.5rem" }}>
            A separately scoped, recurring service — never a package line item.
          </h2>
          <p className="v3-body reveal-fade-up" style={{ marginTop: "0.5rem", maxWidth: "62ch" }}>
            Meta Ads and Google Ads management — campaign discovery and
            strategy, offer/audience/funnel planning, account and campaign
            setup, landing-page and creative coordination, pixels and
            conversion events, launch, and ongoing monitoring with plain
            reporting. Growth infrastructure (tracking, pixels, consent,
            landing pages) can be set up on its own, independent of whether
            you ever run paid media with us.
          </p>
          <div className="sm-ads-note reveal-scale-settle">
            <span className="v3-eyebrow" style={{ color: "var(--sm-mint-700, #0B7487)" }}>
              What this never means
            </span>
            <ul className="sm-ads-note__list">
              {ADVERTISING_BOUNDARIES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="v3-body" style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--sm-text-muted, #4A6472)" }}>
            {ADVERTISING_SERVICES_NOTE_V5}
          </p>
          <div style={{ marginTop: "1.25rem" }}>
            <Link href={ROUTES.start} className="v3-btn v3-btn--outline">
              Talk about an advertising engagement
            </Link>
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <span className="v3-eyebrow">What affects the price</span>
          <h2 className="v3-h2 reveal-clip" style={{ marginTop: "0.5rem" }}>
            Six things that move a project between tiers.
          </h2>
          <p className="v3-body reveal-fade-up" style={{ marginTop: "0.5rem" }}>
            The three tiers above are starting points, not the final word —
            these are the factors that shift a project up or down from its
            starting price, and every one of them gets discussed plainly
            during discovery, before we commit to a number.
          </p>
          <div className="sm-price-factors">
            {PRICE_FACTORS.map((factor) => (
              <div className="sm-price-factor reveal-scale-settle" key={factor.title}>
                <span className="sm-price-factor__title">{factor.title}</span>
                <p className="sm-price-factor__desc">{factor.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain" id="configure" style={{ scrollMarginTop: "5rem" }}>
        <div className="v3-container v3-reveal" ref={reveal}>
          <div className="reveal-scale-settle">
            <ScopeConfigurator />
          </div>
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display reveal-clip">Ready to scope your project?</h2>
          <p className="v3-lede reveal-fade-up">
            Start with the discovery brief — you'll get a straight
            recommendation, not a sales sequence.
          </p>
          <div className="v3m-cta__actions">
            <Link href={ROUTES.start} className="v3-btn v3-btn--primary reveal-fade-up">
              Build Your SiteMint System
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
