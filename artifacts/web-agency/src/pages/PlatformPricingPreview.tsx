import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, ChevronDown, Minus } from "lucide-react";
import "@/styles/platform-preview.css";
import { useProductionDocumentMeta } from "@/hooks/useProductionDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { InnerPageHero } from "@/components/platform-preview/InnerPageHero";
import { InnerPageAtmosphere } from "@/components/platform-preview/InnerPageAtmosphere";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";
import { startProjectHref } from "@/components/platform-preview/navConfig";
import { pricingTiers, pricingFactors } from "@/components/platform-preview/pricingTiers";

const PAGE_TITLE = "Pricing | SiteMint Digital";
const PAGE_DESCRIPTION =
  "Transparent SiteMint Digital pricing and packages — clear deliverables, timelines, and investment ranges with no hidden fees.";

function textOnDark(muted = false) {
  return { color: muted ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-text-on-dark))" };
}
function textOnLight(muted = false) {
  return { color: muted ? "hsl(var(--pp-text))" : "hsl(var(--pp-navy-950))" };
}

const lightPanelShadow = "0 1px 2px hsl(var(--pp-navy-950) / 0.04), 0 10px 24px -14px hsl(var(--pp-navy-950) / 0.16)";

const warmSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 8% -10%, hsl(var(--pp-mint-pale) / 0.45) 0%, transparent 55%)",
  backgroundColor: "hsl(var(--pp-white))",
};
const coolSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 92% 0%, hsl(var(--pp-mint-pale) / 0.5) 0%, transparent 60%)",
  backgroundColor: "hsl(var(--pp-surface-soft))",
};

function LightPanel({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[var(--sm-radius-lg)] border bg-white transition-all duration-300 ${className}`}
      style={{ borderColor: "hsl(var(--pp-border-pale))", boxShadow: lightPanelShadow, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * The three fixed-structure tiers (Starter/Growth/Premium) share one light
 * card — their commercial shape is identical (one-time project price +
 * inclusions list). Growth is marked `recommended: true` in the data, but
 * that is an internal placement decision, not verified purchase-popularity
 * or fit data for "most businesses" — so the badge names Growth's actual
 * scope ("for growing service businesses", drawn directly from the tier's
 * own `bestFor` copy: "Service businesses ready to convert visitors into
 * tracked leads") rather than asserting a broad, unverifiable claim about
 * who it fits.
 */
function TierCard({ tier }: { tier: (typeof pricingTiers)[number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <LightPanel
      className={`relative flex h-full flex-col p-7 ${tier.recommended ? "" : ""}`}
      style={{ borderColor: tier.recommended ? "hsl(var(--pp-cyan-mint-deep) / 0.55)" : "hsl(var(--pp-border-pale))" }}
    >
      {tier.recommended && (
        <span
          className="absolute -top-3 left-7 inline-flex items-center rounded-[var(--sm-radius-pill)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: "hsl(var(--pp-cyan-mint-deep))", color: "hsl(var(--pp-white))" }}
        >
          For growing service businesses
        </span>
      )}

      <h3 className="pp-font-display text-xl font-semibold" style={textOnLight()}>
        {tier.name}
      </h3>
      <p className="mt-1.5 text-sm" style={textOnLight(true)}>
        {tier.tagline}
      </p>

      {/* Price kept directly adjacent to its qualifier, per the "no fine
          print at the bottom" requirement — "Starting around" is part of
          the price line itself, not a footnote. */}
      <p className="mt-5 text-2xl font-semibold" style={{ color: "hsl(var(--pp-navy-800))" }}>
        {tier.priceFrom}
      </p>
      <p className="mt-1 text-xs" style={textOnLight(true)}>
        One-time project investment · final price confirmed after discovery
      </p>

      <p className="mt-4 text-xs leading-relaxed" style={textOnLight(true)}>
        {tier.bestFor}
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {tier.includes.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm" style={textOnLight(true)}>
            <Check size={15} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
            {item}
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${tier.id}-not-included`}
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: "hsl(var(--pp-navy-800))" }}
      >
        What's not included
        <ChevronDown size={13} aria-hidden="true" className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {expanded && (
        <ul id={`${tier.id}-not-included`} className="mt-2 flex flex-col gap-2">
          {tier.notIncluded.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs" style={textOnLight(true)}>
              <Minus size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "hsl(var(--pp-text-muted))" }} />
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />

      <Link
        href={startProjectHref}
        className="mt-6 inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] px-5 py-2.5 text-sm font-semibold transition-colors"
        style={
          tier.recommended
            ? { backgroundColor: "hsl(var(--pp-cyan-mint-deep))", color: "hsl(var(--pp-white))" }
            : { backgroundColor: "hsl(var(--pp-navy-800))", color: "hsl(var(--pp-white))" }
        }
      >
        Start with {tier.name}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </LightPanel>
  );
}

const starter = pricingTiers.find((t) => t.id === "starter")!;
const growth = pricingTiers.find((t) => t.id === "growth")!;
const premium = pricingTiers.find((t) => t.id === "premium")!;
const custom = pricingTiers.find((t) => t.id === "custom")!;

/**
 * Verified comparison dimensions — every value is derived directly from
 * pricingTiers.ts's own includes/notIncluded text (Growth explicitly
 * states "Everything in Starter"; Premium explicitly states "Everything in
 * Growth" — that inheritance chain is what makes each cell verifiable,
 * not a fresh claim). No page-count row is included: production Pricing.tsx
 * and this preview's own data disagree on Starter's page count (15 vs ~5),
 * a real unresolved conflict — scope is described qualitatively instead of
 * asserting either disputed number.
 */
const comparisonRows: { dimension: string; starter: string; growth: string; premium: string }[] = [
  { dimension: "Website scope", starter: "Focused marketing site", growth: "Expanded page count & structure", premium: "Expanded page count & structure" },
  { dimension: "CRM & lead tracking", starter: "Not included", growth: "Included — setup for capture & follow-up", premium: "Included — deeper configuration" },
  { dimension: "Automation", starter: "Not included", growth: "Foundational, for new inquiries", premium: "Deeper automation configuration" },
  { dimension: "SEO foundation", starter: "SEO-foundational build", growth: "Same as Starter (inherited)", premium: "Advanced SEO foundation" },
  { dimension: "Support", starter: "Launch support & basic training", growth: "Same as Starter (inherited)", premium: "Priority support during & after launch" },
];

/**
 * Add-ons — sourced from production Pricing.tsx (artifacts/web-agency/src/
 * pages/Pricing.tsx), the only place in the repository with real add-on
 * figures. Kept as a separate, differently-structured section (not tier
 * cards) since add-ons are optional and separately priced, per the
 * brief's explicit "never bundled" instruction — quoting that source
 * directly rather than paraphrasing it into ambiguity.
 */
const addOnGroups: { group: string; items: { name: string; price: string; billing: "One-time" | "Monthly"; desc: string }[] }[] = [
  {
    group: "SEO",
    items: [
      { name: "SEO Foundation", price: "$750", billing: "One-time", desc: "Keyword structure, page titles & meta descriptions, sitemap setup, and technical SEO basics." },
      { name: "Local SEO Boost", price: "$1,500", billing: "One-time", desc: "Local keyword planning, city/service page structure, and Google Business Profile guidance." },
      { name: "Monthly SEO Support", price: "$500/mo", billing: "Monthly", desc: "Ongoing keyword recommendations, search performance review, and content optimization suggestions." },
    ],
  },
  {
    group: "Blog & Content",
    items: [
      { name: "Blog Setup", price: "$500", billing: "One-time", desc: "Blog page setup, category structure, post template, and internal linking structure." },
      { name: "Monthly Blog Support", price: "$750/mo", billing: "Monthly", desc: "Blog topic ideas, SEO outlines, and monthly content planning." },
    ],
  },
  {
    group: "Automation",
    items: [
      { name: "Custom Automation", price: "From $500", billing: "One-time", desc: "Lead capture, CRM connections, notifications, and follow-up workflows — priced by complexity." },
    ],
  },
  {
    group: "Ongoing Care",
    items: [
      { name: "Basic Care", price: "$99/mo", billing: "Monthly", desc: "Small monthly edits, bug fixes, and a website health check." },
      { name: "Growth Care", price: "$299/mo", billing: "Monthly", desc: "Monthly updates, blog upload support, and analytics review." },
      { name: "Priority Care", price: "$599/mo", billing: "Monthly", desc: "Faster response, landing-page updates, and monthly strategy recommendations." },
    ],
  },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "How is my final price determined?",
    a: "Every project starts with a discovery conversation. The final price depends on page/content complexity, whether CRM, automation, or a custom application is in scope, integrations with your existing tools, timeline, and ongoing maintenance needs.",
  },
  {
    q: "What if I'm not sure which package fits?",
    a: "That's what the Custom path and the discovery process are for — you don't need to pick a package correctly on your own. Start the discovery questionnaire and we'll help scope the right fit before anything is priced.",
  },
  {
    q: "Are add-ons required to get started?",
    a: "No. Add-ons are standalone services that stack on top of a website or web application — never bundled into a package by default, always scoped and priced separately.",
  },
  {
    q: "Is ongoing maintenance included after launch?",
    a: "Maintenance and support are scoped separately based on how your website or system needs to be cared for after launch — covered during discovery, not assumed up front.",
  },
];

function FaqItem({ item, index }: { item: (typeof faqs)[number]; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `pp-pricing-faq-panel-${index}`;
  return (
    <LightPanel className="overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left text-sm font-semibold"
        style={textOnLight()}
      >
        {item.q}
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${open ? "rotate-180 transition-transform" : "transition-transform"}`} style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
      </button>
      {open && (
        <p id={panelId} className="px-5 pb-5 text-sm leading-relaxed" style={textOnLight(true)}>
          {item.a}
        </p>
      )}
    </LightPanel>
  );
}

export default function PlatformPricingPreview() {
  useProductionDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION, "/pricing");

  return (
    <PlatformPreviewPageShell footerVariant="dark">
      {/* Hero — dark */}
      <InnerPageHero
        eyebrow="Pricing"
        headingId="pp-pricing-page-heading"
        heading="What a SiteMint project typically costs"
        intro="Pricing depends on what your business actually needs. These are real starting ranges and inclusions — not a fixed price sheet — so you can gauge fit before a single conversation."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Start a Project
            <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 8 }} />
          </Link>
          <a href="#pricing-options" className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            See the options
          </a>
        </div>
      </InnerPageHero>

      {/* Orientation + primary options — light, with one dark inset (Custom) */}
      <section id="pricing-options" aria-labelledby="pp-pricing-options-heading" className="scroll-mt-24 px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal mx-auto max-w-2xl text-center">
            <h2 id="pp-pricing-options-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              How to read these options
            </h2>
            <p className="mt-4 text-sm leading-relaxed" style={textOnLight(true)}>
              Starter, Growth, and Premium are one-time project investments with a starting price and a clear scope.
              Custom is a separate path for a specific web application, portal, or integration — priced only after a
              short discovery conversation. Whichever you choose, you start with the same next step: tell us about
              the project, and we confirm real scope and price together.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="pp-reveal">
              <TierCard tier={starter} />
            </div>
            <div className="pp-reveal">
              <TierCard tier={growth} />
            </div>
            <div className="pp-reveal">
              <TierCard tier={premium} />
            </div>
          </div>

          {/* Custom — structurally different (no fixed price, scoped after
              discovery), so it gets a distinct dark inset panel rather than
              a fourth identical card. */}
          <div
            className="pp-reveal relative mt-8 overflow-hidden rounded-[var(--sm-radius-xl)] border p-8 md:p-10"
            style={{ backgroundColor: "hsl(var(--pp-navy-950))", borderColor: "hsl(var(--pp-cyan-mint) / 0.18)" }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{ backgroundImage: "radial-gradient(ellipse at 90% 10%, hsl(var(--pp-cyan-mint) / 0.14) 0%, transparent 55%)" }}
            />
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="pp-font-display text-xl font-semibold" style={textOnDark()}>
                  {custom.name}
                </h3>
                <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
                  {custom.tagline}
                </p>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={textOnDark(true)}>
                  {custom.bestFor}
                </p>
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {custom.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm" style={textOnDark(true)}>
                      <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "hsl(var(--pp-cyan-mint))" }} />
                      {item}
                    </li>
                  ))}
                </ul>
                {/* Verified before use: /pricing (production, artifacts/web-agency/
                    src/pages/Pricing.tsx) is a real, live, unflagged public
                    route (registered in App.tsx alongside /services, /about,
                    etc.) — these are its current published starting prices
                    for its "Internal Tool" and "Custom Business Platform"
                    web-app packages, not an internal-only estimate. Labeled
                    explicitly as coming from those named packages rather than
                    implied to be this page's own "Custom" tier price. */}
                <p className="mt-5 text-xs" style={{ color: "hsl(var(--pp-text-on-dark-faint))" }}>
                  For reference, SiteMint's published starting prices for comparable web application work are{" "}
                  <span style={textOnDark()}>$12,500</span> for a focused internal tool and{" "}
                  <span style={textOnDark()}>$25,000</span> for a more advanced platform — both are starting points
                  for that kind of work, not a quote for your project, which is confirmed after discovery.
                </p>
              </div>
              <Link
                href={startProjectHref}
                className="pp-btn pp-btn-primary inline-flex w-fit items-center gap-2 rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold"
              >
                Start a Custom Project
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison — a distinct light shade, table header on a dark strip */}
      <section aria-labelledby="pp-pricing-comparison-heading" className="px-4 py-16 md:px-8 md:py-24" style={coolSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal max-w-xl">
            <h2 id="pp-pricing-comparison-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              Comparing Starter, Growth, and Premium
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={textOnLight(true)}>
              Every row below is verified against what each tier actually includes — Growth and Premium build on the
              tier before them, not a separate feature set. Custom isn't shown here since its scope is set during
              discovery, not fixed in advance.
            </p>
          </div>

          <LightPanel className="pp-reveal mt-10 overflow-hidden p-0">
            {/* Desktop/tablet: real table, dark header row. */}
            <table className="hidden w-full lg:table">
              <thead>
                <tr style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}>
                  <th scope="col" className="p-5 text-left text-xs font-semibold uppercase tracking-wide" style={textOnDark(true)}>
                    Dimension
                  </th>
                  {[starter, growth, premium].map((t) => (
                    <th key={t.id} scope="col" className="p-5 text-left text-sm font-semibold" style={textOnDark()}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.dimension} style={{ backgroundColor: i % 2 === 1 ? "hsl(var(--pp-surface-soft))" : "transparent" }}>
                    <th scope="row" className="p-5 text-left text-sm font-semibold" style={textOnLight()}>
                      {row.dimension}
                    </th>
                    <td className="p-5 text-sm" style={textOnLight(true)}>
                      {row.starter}
                    </td>
                    <td className="p-5 text-sm" style={textOnLight(true)}>
                      {row.growth}
                    </td>
                    <td className="p-5 text-sm" style={textOnLight(true)}>
                      {row.premium}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile/tablet-narrow: grouped by dimension, tier stacked
                underneath — no horizontal scrolling. */}
            <div className="divide-y lg:hidden" style={{ borderColor: "hsl(var(--pp-border-pale))" }}>
              {comparisonRows.map((row) => (
                <div key={row.dimension} className="p-5" style={{ borderColor: "hsl(var(--pp-border-pale))" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
                    {row.dimension}
                  </p>
                  <dl className="mt-3 flex flex-col gap-2">
                    {[
                      { label: starter.name, value: row.starter },
                      { label: growth.name, value: row.growth },
                      { label: premium.name, value: row.premium },
                    ].map((entry) => (
                      <div key={entry.label} className="flex items-start justify-between gap-4 text-sm">
                        <dt className="font-semibold" style={textOnLight()}>
                          {entry.label}
                        </dt>
                        <dd className="text-right" style={textOnLight(true)}>
                          {entry.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </LightPanel>
        </div>
      </section>

      {/* Add-ons — dark section, light chip-style items */}
      <section aria-labelledby="pp-pricing-addons-heading" className="relative px-4 py-16 md:px-8 md:py-24">
        <InnerPageAtmosphere intensity="section" />
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal max-w-2xl">
            <h2 id="pp-pricing-addons-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
              Optional add-ons
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={textOnDark(true)}>
              Standalone services that stack on top of any website or web application — never bundled, always scoped
              and priced on their own.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {addOnGroups.map((group) => (
              <div key={group.group} className="pp-reveal pp-glass-card rounded-[var(--sm-radius-lg)] border p-6" style={{ backgroundColor: "hsl(var(--pp-navy-800) / 0.55)", borderColor: "hsl(var(--pp-cyan-mint) / 0.16)" }}>
                <h3 className="pp-font-display text-base font-semibold" style={textOnDark()}>
                  {group.group}
                </h3>
                <ul className="mt-4 flex flex-col gap-4">
                  {group.items.map((item) => (
                    <li key={item.name}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold" style={textOnDark()}>
                          {item.name}
                        </span>
                        <span
                          className="shrink-0 rounded-[var(--sm-radius-pill)] px-2 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: "hsl(var(--pp-navy-950))", color: "hsl(var(--pp-cyan-mint))" }}
                        >
                          {item.price}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-text-on-dark-faint))" }}>
                        {item.billing}
                      </span>
                      <p className="mt-1 text-xs leading-relaxed" style={textOnDark(true)}>
                        {item.desc}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What happens next + FAQ — light, visual relief before the close */}
      <section aria-labelledby="pp-pricing-next-heading" className="px-4 py-16 md:px-8 md:py-24" style={warmSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <div className="pp-reveal mx-auto max-w-2xl text-center">
            <h2 id="pp-pricing-next-heading" className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              What happens after you reach out
            </h2>
          </div>

          <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { step: "1", title: "Share your project", detail: "Start the discovery questionnaire or send a message — either way, you tell us what you're trying to build." },
              { step: "2", title: "We scope it together", detail: "We ask what's needed to understand real scope: pages, systems, integrations, and timeline." },
              { step: "3", title: "You get a clear price", detail: "Final price and package are confirmed based on your actual project — not assumed in advance." },
            ].map((s) => (
              <li key={s.step} className="pp-reveal">
                <LightPanel className="flex h-full flex-col gap-2 p-6">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--sm-radius-pill)] text-xs font-semibold"
                    style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
                  >
                    {s.step}
                  </span>
                  <p className="pp-font-display mt-1 text-base font-semibold" style={textOnLight()}>
                    {s.title}
                  </p>
                  <p className="text-sm leading-relaxed" style={textOnLight(true)}>
                    {s.detail}
                  </p>
                </LightPanel>
              </li>
            ))}
          </ol>

          <div className="pp-reveal mx-auto mb-8 mt-20 max-w-2xl text-center">
            <h2 className="pp-font-display text-2xl font-semibold sm:text-3xl" style={textOnLight()}>
              Pricing questions
            </h2>
          </div>
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {faqs.map((item, i) => (
              <div key={item.q} className="pp-reveal">
                <FaqItem item={item} index={i} />
              </div>
            ))}
          </div>

          {/* What affects pricing — kept as the same verified factor list
              already approved elsewhere in this preview. */}
          <LightPanel className="pp-reveal mx-auto mt-10 max-w-2xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
              What affects pricing
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {pricingFactors.map((factor) => (
                <li key={factor} className="flex items-start gap-2 text-sm" style={textOnLight(true)}>
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--pp-cyan-mint-deep))" }} />
                  {factor}
                </li>
              ))}
            </ul>
          </LightPanel>
        </div>
      </section>

      {/* Closing — dark, one continuous zone into the dark footer */}
      <div className="relative" style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}>
        <section aria-labelledby="pp-pricing-closing-heading" className="px-4 pt-16 md:px-8 md:pt-20">
          <div className="mx-auto max-w-[1280px] text-center">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint))" }}>
              Not sure which fits yet?
            </p>
            <h2 id="pp-pricing-closing-heading" className="pp-font-display mx-auto mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
              That's exactly what discovery is for — start the conversation, not the paperwork
            </h2>
          </div>
        </section>

        <FinalCtaSection />
      </div>
    </PlatformPreviewPageShell>
  );
}
