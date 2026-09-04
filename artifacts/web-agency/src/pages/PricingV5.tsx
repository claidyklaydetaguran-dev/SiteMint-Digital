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
import {
  pricingTiersV5,
  PRICING_DISCLAIMER_V5,
  AI_RECEPTIONIST_PRICING_NOTE_V5,
  type PricingTierV5,
} from "@/components/v5/pricingTiersV5";

const SCOPE_ADD_ONS = [
  { id: "crm", label: "CRM or workflow connection" },
  { id: "automation", label: "Automation for follow-up and routing" },
  { id: "integrations", label: "Integrations with existing tools" },
  { id: "custom-app", label: "A custom web application" },
  { id: "training", label: "Team training after launch" },
] as const;

function TierCard({ tier }: { tier: PricingTierV5 }) {
  return (
    <div className={`v3-card${tier.recommended ? " v3-card--hover" : ""}`} style={{ padding: "1.75rem", display: "grid", gap: "0.75rem" }}>
      {tier.recommended && (
        <span className="v3-eyebrow" style={{ color: "var(--sm-mint-700, #0E7F6B)" }}>
          Most common starting point
        </span>
      )}
      <h2 className="v3-h2" style={{ fontSize: "1.3rem" }}>{tier.name}</h2>
      <p style={{ fontFamily: "var(--sm-font-display, inherit)", fontSize: "1.6rem", color: "var(--sm-mint-700, #0E7F6B)", margin: 0 }}>
        {tier.priceFrom}
      </p>
      <p className="v3-body">{tier.tagline}</p>
      <p className="v3-body" style={{ fontSize: "0.9rem", color: "var(--sm-text-muted, #526B70)" }}>
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
        <p style={{ fontSize: "0.8rem", color: "var(--sm-text-muted, #526B70)" }}>{tier.honestyNote}</p>
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
            border: "1px solid var(--sm-line, #D7E7E3)",
            borderRadius: "var(--sm-radius-m, 10px)",
            padding: "0.6rem 0.75rem",
            fontFamily: "inherit",
          }}
        />
      </label>

      <div style={{ border: "1px solid var(--sm-line, #D7E7E3)", borderRadius: "var(--sm-radius-m, 10px)", padding: "1rem", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
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
    <div className="v3-services-hub">
      <section className="v3m-page-hero" data-tone="porcelain">
        <div className="v3-container v3m-page-hero__inner">
          <span className="v3-eyebrow">Pricing</span>
          <h1 className="v3-display">Three starting points. Every system is scoped.</h1>
          <p className="v3-lede">
            These are starting estimates, not quotes. Every project is scoped
            through discovery before we commit to a price.
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="white">
        <div className="v3-container v3-reveal" ref={reveal}>
          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {pricingTiersV5.map((tier) => (
              <TierCard tier={tier} key={tier.id} />
            ))}
          </div>
          <p className="v3-body" style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--sm-text-muted, #526B70)" }}>
            {PRICING_DISCLAIMER_V5}
          </p>
          <p className="v3-body" style={{ fontSize: "0.85rem", color: "var(--sm-text-muted, #526B70)" }}>
            {AI_RECEPTIONIST_PRICING_NOTE_V5}
          </p>
        </div>
      </section>

      <section className="v3-section" data-tone="porcelain">
        <div className="v3-container v3-reveal" ref={reveal}>
          <ScopeConfigurator />
        </div>
      </section>

      <section className="v3-section v3m-cta" data-tone="ink">
        <div className="v3-container v3m-cta__inner v3-reveal" ref={reveal}>
          <h2 className="v3-display">Ready to scope your project?</h2>
          <p className="v3-lede">
            Start with the discovery brief — you'll get a straight
            recommendation, not a sales sequence.
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
