import { Link } from "wouter";
import { ArrowRight, Bot, Code2, LayoutTemplate, LineChart, Search, Sparkles, Wrench } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";

const services = [
  {
    id: "websites",
    name: "Websites",
    icon: LayoutTemplate,
    problem: "Businesses that look outdated online lose trust before a call ever happens.",
    approach: "Conversion-focused marketing sites built on a shared, premium design system.",
    deliverable: "A responsive, SEO-ready website your team can maintain.",
  },
  {
    id: "web-apps",
    name: "Web Applications",
    icon: Code2,
    problem: "Off-the-shelf software rarely fits how a business actually operates.",
    approach: "Custom tools scoped around your real workflow, not a generic template.",
    deliverable: "A purpose-built internal or customer-facing application.",
  },
  {
    id: "crm",
    name: "CRM Systems",
    icon: Bot,
    problem: "Leads scattered across inboxes and spreadsheets go cold.",
    approach: "A structured CRM implementation so every lead has an owner and a next step.",
    deliverable: "A working CRM, configured for your pipeline.",
  },
  {
    id: "automation",
    name: "Business Automation",
    icon: Wrench,
    problem: "Manual follow-up and repetitive admin work eat time that should go to customers.",
    approach: "Automated workflows for the repeatable parts of your operation.",
    deliverable: "Documented automations connected to your existing systems.",
  },
  {
    id: "seo",
    name: "SEO & Digital Growth",
    icon: Search,
    problem: "A site that isn't found doesn't generate leads.",
    approach: "Foundational SEO built into the site itself, not bolted on after launch.",
    deliverable: "A technically sound, search-ready site structure.",
  },
  {
    id: "maintenance",
    name: "Maintenance & Support",
    icon: LineChart,
    problem: "Sites and systems that aren't maintained slowly break or fall behind.",
    approach: "Ongoing care so what we build keeps working as your business grows.",
    deliverable: "A maintained system with a clear point of contact.",
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

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            const isRecommended = selectedGoal.recommendedServiceIds.includes(service.id);
            return (
              <Link
                key={service.id}
                href="/services"
                className="group relative flex flex-col rounded-[var(--sm-radius-lg)] border p-6 transition-shadow hover:shadow-[var(--sm-shadow-md)]"
                style={{
                  borderColor: isRecommended ? "hsl(var(--sm-color-border-focus))" : "hsl(var(--sm-color-border-default))",
                  backgroundColor: "hsl(var(--sm-color-surface-default))",
                }}
              >
                {isRecommended && (
                  <span className="absolute -top-2.5 right-5 inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-action-primary))] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-inverse))]">
                    <Sparkles size={10} aria-hidden="true" />
                    For you
                  </span>
                )}

                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{service.name}</h3>
                <p className="mt-2 text-sm text-[hsl(var(--sm-color-text-secondary))]">{service.problem}</p>
                <p className="mt-2 text-xs text-[hsl(var(--sm-color-text-muted))]">{service.approach}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--sm-color-action-primary))] group-hover:underline">
                  Learn more
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
