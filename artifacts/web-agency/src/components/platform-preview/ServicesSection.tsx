import { Link } from "wouter";
import { ArrowRight, Bot, Code2, LayoutTemplate, LineChart, Search, Sparkles, Wrench } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

/** Featured: the two services that most directly build and operate the
 * systems this whole platform is about (Checkpoint 2A.4 Part 5's bento
 * direction) — larger tiles, fuller copy. Compact: the remaining four,
 * smaller tiles, condensed copy. Composition varies; content accuracy and
 * availability status are unchanged from earlier checkpoints. */
const featuredServices = [
  {
    id: "websites",
    name: "Websites",
    icon: LayoutTemplate,
    problem: "Businesses that look outdated online lose trust before a call ever happens.",
    approach: "Conversion-focused marketing sites built on a shared, premium design system.",
    deliverable: "A responsive, SEO-ready website your team can maintain.",
  },
  {
    id: "crm",
    name: "CRM Systems",
    icon: Bot,
    problem: "Leads scattered across inboxes and spreadsheets go cold.",
    approach: "A structured CRM implementation so every lead has an owner and a next step.",
    deliverable: "A working CRM, configured for your pipeline.",
  },
];

const compactServices = [
  {
    id: "web-apps",
    name: "Web Applications",
    icon: Code2,
    problem: "Off-the-shelf software rarely fits how a business actually operates.",
  },
  {
    id: "automation",
    name: "Business Automation",
    icon: Wrench,
    problem: "Manual follow-up and repetitive admin work eat time that should go to customers.",
  },
  {
    id: "seo",
    name: "SEO & Digital Growth",
    icon: Search,
    problem: "A site that isn't found doesn't generate leads.",
  },
  {
    id: "maintenance",
    name: "Maintenance & Support",
    icon: LineChart,
    problem: "Sites and systems that aren't maintained slowly break or fall behind.",
  },
];

export function ServicesSection() {
  const { selectedGoal } = useSelectedGoal();

  return (
    <section aria-labelledby="pp-services-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 id="pp-services-heading" className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-4xl">
              Services SiteMint delivers for your business
            </h2>
            <p className="mt-4 text-base text-[hsl(var(--sm-color-text-secondary))]">
              Work SiteMint performs on your own website, application, or systems — no
              subscription required.
            </p>
          </div>
          <Link
            href="/services"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline"
          >
            View all services
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        {/* Bento composition: two featured tiles (fuller copy), four compact
            tiles below (Checkpoint 2A.4 Part 5) — replaces the earlier
            uniform six-identical-box grid. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {featuredServices.map((service) => {
            const Icon = service.icon;
            const isRecommended = selectedGoal.recommendedServiceIds.includes(service.id);
            return (
              <Link
                key={service.id}
                href="/services"
                className="group relative flex flex-col rounded-[var(--sm-radius-xl)] border p-8 transition-shadow hover:shadow-[var(--sm-shadow-md)]"
                style={{
                  borderColor: isRecommended ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-default))",
                }}
              >
                {isRecommended && (
                  <span className="absolute -top-2.5 right-6 inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-action-primary))] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-inverse))]">
                    <Sparkles size={10} aria-hidden="true" />
                    For you
                  </span>
                )}

                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="pp-font-display text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]">{service.name}</h3>
                <p className="mt-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">{service.problem}</p>
                <p className="mt-2 text-xs text-[hsl(var(--sm-color-text-muted))]">{service.approach}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] group-hover:underline">
                  Learn more
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {compactServices.map((service) => {
            const Icon = service.icon;
            const isRecommended = selectedGoal.recommendedServiceIds.includes(service.id);
            return (
              <Link
                key={service.id}
                href="/services"
                className="group relative flex flex-col rounded-[var(--sm-radius-lg)] border p-5 transition-shadow hover:shadow-[var(--sm-shadow-sm)]"
                style={{
                  borderColor: isRecommended ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-muted))",
                }}
              >
                {isRecommended && (
                  <span className="absolute -top-2 right-4 inline-flex items-center rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-action-primary))] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-inverse))]">
                    For you
                  </span>
                )}
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] text-[hsl(var(--sm-color-action-primary))]">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{service.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[hsl(var(--sm-color-text-muted))]">{service.problem}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
