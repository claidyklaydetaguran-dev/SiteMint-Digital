import { Link } from "wouter";
import { ArrowRight, Phone, Wrench } from "lucide-react";

const products = [
  {
    name: "AI Receptionist",
    icon: Phone,
    problem: "Missed calls and slow follow-up cost businesses real leads.",
    description:
      "An AI-powered receptionist that answers, qualifies, and follows up with every inbound lead — day or night — so no inquiry goes unanswered.",
    href: "/ai-receptionist",
    cta: "See AI Receptionist",
    available: true,
  },
  {
    name: "AI Toolkit",
    icon: Wrench,
    problem: "Teams juggle too many disconnected AI tools for everyday work.",
    description:
      "A focused set of AI tools built for common business tasks, in one place.",
    href: null,
    cta: "Coming to sitemintdigital.com",
    available: false,
  },
];

export function ProductsSection() {
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
            return (
              <div
                key={product.name}
                className="flex flex-col rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-8 shadow-[var(--sm-shadow-sm)]"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-[var(--sm-radius-md)] bg-[var(--sm-button-accent-background)] text-[var(--sm-button-accent-text)]">
                  <Icon size={22} aria-hidden="true" />
                </span>
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
