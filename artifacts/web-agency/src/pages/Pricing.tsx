import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Check, X, ArrowRight, Zap, ShieldCheck, Search, FileText, TrendingUp, AlertTriangle, Lightbulb, Target } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }),
};

const websitePackages = [
  {
    title: "Essential Presence",
    price: "2,995",
    description: "Best for new businesses, local service providers, nonprofits, solo professionals, and small businesses that need a clean and credible website.",
    note: "Best for businesses that need a professional online foundation.",
    popular: false,
    included: [
      "Up to 15 pages",
      "Mobile responsive design",
      "Contact form",
      "Google Maps integration",
      "Social media links",
      "Basic SEO setup",
      "Google Analytics setup",
      "Google Search Console setup",
      "Speed optimization basics",
      "Blog capability",
      "Launch support",
    ],
    notIncluded: [
      "Copywriting",
      "Advanced SEO campaigns",
      "CRM integration",
      "Marketing automation",
    ],
  },
  {
    title: "Lead Generation Website",
    price: "5,995",
    description: "Best for service businesses that want a stronger website designed to capture leads and support marketing.",
    note: "Best for businesses ready to turn website traffic into inquiries.",
    popular: true,
    included: [
      "Up to 24 pages",
      "Conversion-focused layout",
      "Service landing pages",
      "Lead capture forms",
      "Blog system",
      "Basic CRM or email integration",
      "Local SEO foundation",
      "Analytics dashboard setup",
      "Content migration support",
      "One training session",
      "30 days post-launch support",
    ],
    notIncluded: [
      "Custom software",
      "Client portals",
      "User login systems",
    ],
  },
  {
    title: "Growth Platform",
    price: "9,995",
    description: "Best for established businesses that need a larger website, stronger content structure, and business growth systems.",
    note: "Best for businesses that need their website to function like a growth system.",
    popular: false,
    included: [
      "25+ pages",
      "Advanced website architecture",
      "Multi-service or multi-location structure",
      "Advanced blog & content hub",
      "Multiple lead funnels",
      "CRM or email marketing integration",
      "Appointment booking integration",
      "Reporting dashboard setup",
      "Marketing automation setup",
      "Strategy session",
      "45 days post-launch support",
    ],
    notIncluded: [
      "Custom SaaS software",
      "Enterprise-grade systems",
    ],
  },
];

const webAppPackages = [
  {
    title: "Internal Tool",
    price: "12,500",
    priceLabel: "Starting at",
    description: "For businesses that need a simple custom tool to manage operations.",
    timeline: "Typical timeline: 4–8 weeks depending on scope",
    popular: false,
    included: [
      "Secure login system",
      "User dashboard",
      "Admin dashboard",
      "Database setup",
      "User roles",
      "Basic reporting",
      "Workflow automation",
      "Deployment support",
    ],
    examples: ["Client portal", "Booking dashboard", "Inventory tracker", "Simple CRM", "Internal request system"],
  },
  {
    title: "Custom Business Platform",
    price: "25,000",
    priceLabel: "Starting at",
    description: "For businesses that need a more advanced custom web application.",
    timeline: "Timeline determined after discovery",
    popular: true,
    included: [
      "Custom user roles and permissions",
      "Advanced dashboards",
      "Database management",
      "Booking or scheduling system",
      "Notifications",
      "Payment or form integrations",
      "Admin controls",
      "Scalable architecture planning",
      "Testing and launch support",
    ],
    examples: ["CRM platform", "Marketplace MVP", "Membership platform", "SaaS MVP", "Multi-user business portal"],
  },
];

const seoAddOns = [
  {
    name: "SEO Foundation",
    price: "$750",
    type: "One-time",
    desc: "Keyword structure, page titles & meta descriptions, SEO-friendly headings, sitemap setup, Google Search Console guidance, indexing support, and technical SEO basics.",
  },
  {
    name: "Local SEO Boost",
    price: "$1,500",
    type: "One-time",
    desc: "Local keyword planning, city/service page structure, Google Business Profile guidance, local landing page recommendations, and location-based content strategy.",
  },
  {
    name: "Monthly SEO Support",
    price: "$500/mo",
    type: "Monthly",
    desc: "Monthly keyword recommendations, SEO improvement checklist, blog & topic planning, search performance review, and content optimization suggestions.",
  },
];

const blogAddOns = [
  {
    name: "Blog Setup",
    price: "$500",
    type: "One-time",
    desc: "Blog page setup, category structure, post template, featured post layout, and internal linking structure.",
  },
  {
    name: "Monthly Blog Support",
    price: "$750/mo",
    type: "Monthly",
    desc: "4 blog topic ideas per month, SEO blog outlines, AI-assisted draft support, upload formatting, internal linking suggestions, and monthly content planning.",
  },
];

const careAddOns = [
  {
    name: "Basic Care",
    price: "$99/mo",
    desc: "Small monthly edits, bug fixes, website health check, and basic support.",
  },
  {
    name: "Growth Care",
    price: "$299/mo",
    desc: "Monthly updates, blog upload support, SEO improvement support, analytics review, and priority response.",
  },
  {
    name: "Priority Care",
    price: "$599/mo",
    desc: "Faster support, landing page updates, automation updates, conversion improvement suggestions, and monthly strategy recommendations.",
  },
];

const marketPositions = [
  {
    label: "DIY Builders",
    range: "$20–$300/mo",
    bestFor: "Very simple websites",
    limitation: "Limited strategy, customization, and support",
    highlight: false,
  },
  {
    label: "Freelancers",
    range: "$1,500–$5,000",
    bestFor: "Basic websites",
    limitation: "Quality and support can vary",
    highlight: false,
  },
  {
    label: "SiteMint Digital",
    range: "$2,995–$15,000+",
    bestFor: "Business websites, lead generation, web apps, SEO, automations, and growth systems",
    advantage: "Faster build, strategic structure, modern tools, and practical support",
    highlight: true,
  },
  {
    label: "Traditional Agencies",
    range: "$10,000–$50,000+",
    bestFor: "Larger marketing campaigns and enterprise work",
    limitation: "Higher cost and longer timeline",
    highlight: false,
  },
];

const swotCards = [
  {
    icon: TrendingUp,
    label: "Our Strengths",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/20",
    items: [
      "Faster development process",
      "Lower overhead than large agencies",
      "Website, app, SEO, blog, and automation support in one place",
      "Strong fit for small businesses, nonprofits, real estate, consultants, and service providers",
    ],
  },
  {
    icon: Lightbulb,
    label: "Where We Grow",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    items: [
      "Not ideal for enterprise-level software",
      "Complex apps require deeper discovery",
      "Some advanced integrations need custom planning",
      "Scope must be clearly defined upfront",
    ],
  },
  {
    icon: Target,
    label: "Market Opportunities",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    items: [
      "Many small businesses still need better websites",
      "AI and automation are becoming critical for growth",
      "Local SEO and content help businesses compete online",
      "Businesses want systems — not just pages",
    ],
  },
  {
    icon: AlertTriangle,
    label: "Our Awareness",
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    items: [
      "Cheap freelancers undercut on price",
      "DIY website builders are improving",
      "AI website generators are commoditizing basics",
      "Agencies with larger teams can scale faster",
    ],
  },
];

export default function Pricing() {
  return (
    <div className="w-full pb-24">
      {/* Header */}
      <section className="pt-20 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-background/60 via-background/30 to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">Transparent Pricing</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Every package is scoped to deliver real business outcomes — not just pages and features. Priced above freelancers, well below large agencies.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Website Packages */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">Website Packages</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Professional marketing websites built to attract leads, build credibility, and support daily operations.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {websitePackages.map((tier, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="flex"
              >
                <Card className={`relative flex flex-col w-full ${tier.popular ? "border-primary shadow-xl" : "border-border bg-card/50"}`}>
                  {tier.popular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                      Most Popular
                    </div>
                  )}
                  <CardHeader className="text-center pb-4 pt-8">
                    <CardTitle className="text-2xl font-serif mb-2">{tier.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow pb-6 px-6 flex flex-col">
                    <div className="text-center mb-8">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Starting at</span>
                      <div className="text-5xl font-bold mt-2 text-foreground">${tier.price}</div>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">What's included</p>
                      <ul className="space-y-2.5 text-sm">
                        {tier.included.map((f, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border/50">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Not included</p>
                      <ul className="space-y-2 text-sm">
                        {tier.notIncluded.map((f, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <X className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                            <span className="text-muted-foreground/60">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border/30">
                      <p className="text-xs text-primary font-medium italic">{tier.note}</p>
                    </div>

                    <div className="mt-auto pt-6">
                      <Link href="/contact" className="w-full" data-testid={`link-pricing-website-${i}`}>
                        <Button
                          className="w-full h-12 text-base"
                          variant={tier.popular ? "default" : "outline"}
                          data-testid={`button-pricing-website-cta-${i}`}
                        >
                          Book a Consultation
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8 max-w-2xl mx-auto">
            All prices are starting prices. Final pricing depends on scope, page count, content readiness, integrations, revisions, and timeline.
            Website packages do not include advanced custom software unless stated. Web applications are quoted separately.
          </p>
        </div>
      </section>

      {/* Web App Packages */}
      <section className="py-20 border-y border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-60" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 bg-background/50 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-3xl font-serif font-bold mb-4">Web Application Packages</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Web applications are for businesses that need custom tools, portals, dashboards, databases, booking systems, or internal systems — not just a public website.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 max-w-2xl mx-auto mb-12 text-center">
              Web applications require a separate consultation to scope properly. Pricing below reflects starting investment, not a fixed quote.
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {webAppPackages.map((pkg, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="flex"
                >
                  <Card className={`relative flex flex-col w-full ${pkg.popular ? "border-primary shadow-lg" : "border-border"}`}>
                    {pkg.popular && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                        Most Requested
                      </div>
                    )}
                    <CardHeader className="pt-8">
                      <CardTitle className="text-2xl font-serif">{pkg.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{pkg.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow flex flex-col">
                      <div className="mb-6">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">{pkg.priceLabel}</span>
                        <div className="text-3xl font-bold mt-1 text-foreground">${pkg.price}</div>
                        <div className="text-xs text-muted-foreground mt-1">{pkg.timeline}</div>
                      </div>
                      <ul className="space-y-3 text-sm mb-6">
                        {pkg.included.map((f, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Examples</p>
                        <div className="flex flex-wrap gap-2">
                          {pkg.examples.map((ex, j) => (
                            <span key={j} className="text-xs bg-accent px-2 py-1 rounded text-muted-foreground">{ex}</span>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pb-8">
                      <Link href="/contact" className="w-full" data-testid={`link-pricing-webapp-${i}`}>
                        <Button
                          variant={pkg.popular ? "default" : "outline"}
                          className="w-full"
                          data-testid={`button-pricing-webapp-cta-${i}`}
                        >
                          Book a Consultation
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-8 max-w-2xl mx-auto">
              Final pricing depends on discovery, features, integrations, and complexity.
            </p>
          </div>
        </div>
      </section>

      {/* Add-On Services: 3 columns */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif font-bold mb-4">Add-On Services</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Standalone services that stack on top of any website or web app. Never bundled — always scoped and priced separately.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {/* SEO */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                  <Search className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xl font-serif font-bold">SEO Add-Ons</h3>
              </div>
              <ul className="space-y-6">
                {seoAddOns.map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <span className="text-xs text-muted-foreground/60 uppercase tracking-wide">{item.type}</span>
                    <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Blog */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xl font-serif font-bold">Blog & Content</h3>
              </div>
              <ul className="space-y-6">
                {blogAddOns.map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <span className="text-xs text-muted-foreground/60 uppercase tracking-wide">{item.type}</span>
                    <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-6 border-t border-border">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-xl font-serif font-bold">Automation Add-Ons</h3>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">Custom Automation</span>
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">From $500</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {["Lead capture", "CRM connection", "Email notifications", "Google Sheets", "Booking automation", "AI chatbot", "Follow-up workflows", "Form routing"].map(t => (
                    <span key={t} className="text-xs bg-accent px-2 py-1 rounded text-muted-foreground">{t}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Pricing depends on tools, integrations, and workflow complexity.</p>
              </div>
            </motion.div>

            {/* Care */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={2}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xl font-serif font-bold">Ongoing Care</h3>
              </div>
              <ul className="space-y-6">
                {careAddOns.map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="text-center mt-16">
            <Link href="/contact" data-testid="link-pricing-addons-cta">
              <Button size="lg" className="h-14 px-10 text-base" data-testid="button-pricing-addons-cta">
                Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Market Positioning */}
      <section className="py-20 bg-foreground text-background relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-40 pointer-events-none" style={{ backgroundImage: "url('/dark-section-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-serif font-bold text-background mb-4">Where We Fit In The Market</h2>
            <p className="text-background/70 max-w-2xl mx-auto">
              We sit between low-cost freelancers and traditional agencies — giving you more strategic, modern, and business-focused results without the slow timelines and high overhead.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {marketPositions.map((pos, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <div className={`rounded-xl p-6 h-full flex flex-col border ${pos.highlight ? "bg-primary border-primary/60 text-primary-foreground" : "bg-background/10 border-background/10 text-background"}`}>
                  <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${pos.highlight ? "text-primary-foreground/70" : "text-background/50"}`}>
                    {pos.label}
                  </div>
                  <div className={`text-xl font-bold font-serif mb-3 ${pos.highlight ? "text-primary-foreground" : "text-background"}`}>{pos.range}</div>
                  <p className={`text-sm mb-3 flex-grow ${pos.highlight ? "text-primary-foreground/90" : "text-background/70"}`}>
                    <span className="font-semibold">Best for: </span>{pos.bestFor}
                  </p>
                  {pos.highlight ? (
                    <p className="text-sm text-primary-foreground/80">
                      <span className="font-semibold">Why us: </span>{pos.advantage}
                    </p>
                  ) : (
                    <p className={`text-sm ${pos.highlight ? "text-primary-foreground/70" : "text-background/50"}`}>
                      <span className="font-semibold">Limitation: </span>{pos.limitation}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us (SWOT) */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-30" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-serif font-bold mb-4">Why Businesses Choose Us</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We're honest about what we do well, where we focus, and what's happening in the market. That transparency is what builds long-term trust.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {swotCards.map((card, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <div className={`rounded-xl border p-6 h-full ${card.bg}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                    <h3 className="font-serif font-bold text-base text-foreground">{card.label}</h3>
                  </div>
                  <ul className="space-y-3">
                    {card.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="w-1 h-1 rounded-full bg-current mt-2 shrink-0 opacity-40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 bg-accent/30 border-t border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-40" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <h2 className="text-4xl font-serif font-bold mb-4">Not sure which package is right for you?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Book a free consultation. We'll help you figure out exactly what to build, what to skip, and what it will realistically cost.
          </p>
          <Link href="/contact" data-testid="link-pricing-bottom-cta">
            <Button size="lg" className="h-14 px-10 text-base" data-testid="button-pricing-bottom-cta">
              Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
