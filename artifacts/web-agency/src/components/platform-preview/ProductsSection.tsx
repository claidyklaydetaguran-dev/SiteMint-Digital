import { Link } from "wouter";
import { ArrowRight, Phone, Sparkles, Wrench } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { CapabilityBadge } from "./CapabilityBadge";
import { AiReceptionistDemo } from "./AiReceptionistDemo";

const products = [
  {
    id: "ai-receptionist",
    name: "AI Receptionist",
    icon: Phone,
    problem: "Missed calls and slow follow-up cost businesses real leads.",
    description:
      "An AI-powered receptionist that answers, qualifies, and follows up with every inbound lead — day or night — so no inquiry goes unanswered.",
    href: "/ai-receptionist",
    cta: "See AI Receptionist",
    available: true,
    // The product itself is live and in production use (root CLAUDE.md
    // protected-file list). "Coming to sitemintdigital.com" below refers only
    // to AI Toolkit's main-site entry point, a separate, narrower gap.
    capability: "available" as const,
  },
  {
    id: "ai-toolkit",
    name: "AI Toolkit",
    icon: Wrench,
    problem: "Teams juggle too many disconnected AI tools for everyday work.",
    description:
      "A focused set of AI tools built for common business tasks, in one place.",
    href: null,
    cta: "Explore the product direction",
    available: false,
    // Corrected (Checkpoint 2A.2): AI Toolkit is a real, deployed, standalone
    // app with working checkout, but it is not yet a generally available
    // *customer product* — it has no login/account of any kind
    // (artifacts/ai-toolkit/src/App.tsx registers only `/`, `/thank-you`,
    // `/cancel`) and no entry point from the main site. "In development"
    // reflects that honestly; the earlier "available" framing (Checkpoint
    // 2A.1) conflated "the app is deployed" with "it's a ready customer
    // product," which this checkpoint's instructions correct.
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {products.map((product) => {
            const Icon = product.icon;
            const isRecommended = selectedGoal.recommendedProductIds.includes(product.id);
            return (
              <div
                key={product.id}
                className="relative flex flex-col rounded-[var(--sm-radius-xl)] border p-8 shadow-[var(--sm-shadow-sm)] transition-colors"
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
                  <CapabilityBadge level={product.capability} />
                </div>
                <h3 className="pp-font-display text-xl font-semibold text-[hsl(var(--sm-color-text-primary))]">{product.name}</h3>
                <p className="mt-2 text-sm font-medium text-[hsl(var(--sm-color-action-primary))]">{product.problem}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{product.description}</p>

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
