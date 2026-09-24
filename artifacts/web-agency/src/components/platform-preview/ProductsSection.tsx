import { Link } from "wouter";
import { ArrowRight, Phone, Sparkles, Wrench } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { CapabilityBadge } from "./CapabilityBadge";
import type { CapabilityLevel } from "./capabilityStatus";
import { AiReceptionistDemo } from "./AiReceptionistDemo";

/**
 * AI Receptionist's real capability isn't one uniform readiness level — SMS
 * is live, voice is in development, and CRM/follow-up automation is
 * platform direction, not a shipped integration (verified: no foreign key
 * or sync path from lib/db/src/schema/intakeAgent.ts's intake_* tables into
 * crm_leads/crm_deals; the CRM's `/admin/crm/intake-cases` route gives staff
 * a dedicated *view* of intake conversations, not an automatic pipeline
 * hand-off). Checkpoint 2A.3: replaces the single blanket "Available now"
 * product badge with this breakdown so the card never implies uniform
 * readiness. See capability-evidence matrix in
 * docs/sitemint-platform/IMPLEMENTATION_ROADMAP.md's Checkpoint 2A.3 entry.
 */
const receptionistReadiness: { label: string; level: CapabilityLevel }[] = [
  { label: "SMS receptionist", level: "available" },
  { label: "Voice experience", level: "in-development" },
  { label: "Connected CRM & follow-up", level: "planned" },
];

const products = [
  {
    id: "ai-receptionist",
    name: "AI Receptionist",
    icon: Phone,
    problem: "Missed calls and slow follow-up cost businesses real leads.",
    description:
      "An AI-powered receptionist that answers and qualifies every inbound text — day or night — so no inquiry goes unanswered.",
    href: "/ai-receptionist",
    cta: "See AI Receptionist",
    available: true,
  },
  {
    id: "ai-toolkit",
    name: "AI Toolkit",
    icon: Wrench,
    problem: "Teams juggle too many disconnected AI tools for everyday work.",
    description:
      "A focused set of AI tools built for common business tasks, in one place. Direction under consideration: content assistance, workflow suggestions, and structured automation guidance.",
    href: null,
    cta: "Explore the product direction",
    available: false,
    // AI Toolkit is a real, deployed, standalone app with working checkout,
    // but it is not yet a generally available *customer product* — it has
    // no login/account of any kind (artifacts/ai-toolkit/src/App.tsx
    // registers only `/`, `/thank-you`, `/cancel`) and no entry point from
    // the main site. One "In development" label is unambiguous here (unlike
    // AI Receptionist, there's no sub-capability split to show).
    capability: "in-development" as const,
  },
];

export function ProductsSection() {
  const { selectedGoal } = useSelectedGoal();

  return (
    <section aria-labelledby="pp-products-heading" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 max-w-2xl">
          <h2 id="pp-products-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
            Products SiteMint builds and operates
          </h2>
          <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
            Software SiteMint owns and runs for customers — not one-off builds.
          </p>
        </div>

        {/* Asymmetric: AI Receptionist (2 cols, full content) vs. AI Toolkit
            (1 col, self-start so it never stretches to match the featured
            product's height — Checkpoint 2A.4 Part 4, avoids the "large
            empty card" impression an equal-height grid produced). */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          {products.map((product) => {
            const Icon = product.icon;
            const isRecommended = selectedGoal.recommendedProductIds.includes(product.id);
            const isFeatured = product.id === "ai-receptionist";
            return (
              <div
                key={product.id}
                className={`relative flex flex-col rounded-[var(--sm-radius-xl)] border p-8 shadow-[var(--sm-shadow-sm)] transition-colors ${
                  isFeatured ? "lg:col-span-2" : "lg:col-span-1"
                }`}
                style={{
                  borderColor: isRecommended ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-default))",
                }}
              >
                {isRecommended && (
                  <span className="absolute -top-3 left-8 inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-action-primary))] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-inverse))]">
                    <Sparkles size={11} aria-hidden="true" />
                    Recommended for you
                  </span>
                )}

                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-[var(--sm-radius-md)] bg-[var(--sm-button-accent-background)] text-[var(--sm-button-accent-text)]">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  {product.capability && <CapabilityBadge level={product.capability} />}
                </div>
                <h3 className="pp-font-display text-xl font-semibold text-[hsl(var(--sm-color-text-primary))]">{product.name}</h3>
                <p className="mt-2 text-sm font-medium text-[hsl(var(--sm-color-action-primary))]">{product.problem}</p>
                <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{product.description}</p>

                {product.id === "ai-receptionist" && (
                  <ul className="mb-1 mt-3 flex flex-col gap-1.5" aria-label="AI Receptionist readiness by capability">
                    {receptionistReadiness.map((row) => (
                      <li key={row.label} className="flex items-center justify-between gap-2 text-xs text-[hsl(var(--sm-color-text-secondary))]">
                        {row.label}
                        <CapabilityBadge level={row.level} />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex-1" />

                {product.available ? (
                  <Link
                    href={product.href!}
                    className="mt-6 inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-5 py-2.5 text-sm font-semibold text-[var(--sm-button-primary-text)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
                  >
                    {product.cta}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="mt-6 inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] border border-dashed border-[hsl(var(--sm-color-border-strong))] px-5 py-2.5 text-sm font-medium text-[hsl(var(--sm-color-text-muted))]"
                  >
                    {product.cta}
                  </span>
                )}

                {product.id === "ai-receptionist" && <AiReceptionistDemo />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
