import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Check, X } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }),
};

const websitePackages = [
  {
    title: "Essential Presence",
    price: "2,995",
    description: "Best for new businesses, local service providers, nonprofits, and professional services.",
    popular: false,
    included: [
      "Up to 15 pages",
      "Mobile responsive design",
      "Contact forms",
      "Google Maps integration",
      "Social media integration",
      "Basic SEO setup",
      "Google Analytics",
      "Google Search Console",
      "Speed optimization",
      "SSL setup",
      "Basic blog capability",
    ],
    notIncluded: [
      "Copywriting",
      "Advanced SEO",
      "CRM integration",
      "Marketing automation",
    ],
  },
  {
    title: "Lead Generation Website",
    price: "5,995",
    description: "Best for service businesses ready to capture more leads and grow their online presence.",
    popular: true,
    included: [
      "Up to 24 pages",
      "Conversion-focused design",
      "Lead capture forms",
      "Dedicated landing pages",
      "Blog system",
      "Basic CRM integration",
      "Call tracking integration",
      "Analytics dashboard",
      "Local SEO foundation",
      "Conversion optimization",
      "Content migration",
      "Training session",
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
    description: "For established businesses that need a complete digital system built for scale.",
    popular: false,
    included: [
      "25+ pages",
      "Advanced site architecture",
      "Multiple lead funnels",
      "Advanced blog & content hub",
      "CRM integration",
      "Marketing automation",
      "Appointment booking",
      "Custom calculators",
      "Membership resources",
      "Reporting dashboards",
      "Multi-location SEO structure",
      "Strategy sessions",
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
    description: "Booking systems, inventory tools, employee dashboards, client portals, and property management.",
    timeline: "4–8 weeks",
    included: [
      "Authentication system",
      "Core database setup",
      "Admin dashboard",
      "User roles & permissions",
      "Reports & data views",
      "Deployment & launch support",
    ],
    popular: false,
  },
  {
    title: "Custom Business Platform",
    price: "Custom Quote",
    priceLabel: "Pricing after consultation",
    description: "CRM systems, marketplaces, SaaS platforms, membership platforms, and multi-user systems.",
    timeline: "Timeline determined after discovery",
    included: [
      "Discovery & architecture planning",
      "Custom UX/UI design",
      "Full-stack development",
      "Testing & QA",
      "Launch support",
      "Scalable cloud architecture",
    ],
    popular: true,
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

          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
            {websitePackages.map((tier, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <Card className={`relative flex flex-col h-full ${tier.popular ? "border-primary shadow-xl" : "border-border bg-card/50"}`}>
                  {tier.popular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                      Best Seller
                    </div>
                  )}
                  <CardHeader className="text-center pb-4 pt-8">
                    <CardTitle className="text-2xl font-serif mb-2">{tier.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow pb-6 px-6">
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

                    <div className="mt-6 pt-5 border-t border-border/50">
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
                  </CardContent>
                  <CardFooter className="pt-0 pb-8 px-6">
                    <Link href="/contact" className="w-full" data-testid={`link-pricing-website-${i}`}>
                      <Button
                        className="w-full h-12 text-base"
                        variant={tier.popular ? "default" : "outline"}
                        data-testid={`button-pricing-website-cta-${i}`}
                      >
                        Book a Consultation
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Web App Packages */}
      <section className="py-20 border-y border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-60" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 bg-background/50 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-3xl font-serif font-bold mb-4">Web Applications</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                A website and a web application are fundamentally different products — different buyers, different timelines, different expectations. Priced and scoped separately.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 max-w-2xl mx-auto mb-12 text-center">
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
                >
                  <Card className={`relative flex flex-col h-full ${pkg.popular ? "border-primary shadow-lg" : "border-border"}`}>
                    {pkg.popular && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                        Most Requested
                      </div>
                    )}
                    <CardHeader className="pt-8">
                      <CardTitle className="text-2xl font-serif">{pkg.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{pkg.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="mb-6">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">{pkg.priceLabel}</span>
                        <div className={`font-bold mt-1 text-foreground ${pkg.price === "Custom Quote" ? "text-2xl" : "text-3xl"}`}>
                          {pkg.price === "Custom Quote" ? pkg.price : `$${pkg.price}`}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{pkg.timeline}</div>
                      </div>
                      <ul className="space-y-3 text-sm">
                        {pkg.included.map((f, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
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
          </div>
        </div>
      </section>

      {/* Ongoing Growth */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif font-bold mb-4">Ongoing Growth Services</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Standalone add-ons that stack on top of any website or web app. Never bundled — always scoped separately.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {/* Website Care */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
              <h3 className="text-xl font-serif font-bold mb-6 pb-4 border-b border-border">Website Care</h3>
              <ul className="space-y-6">
                {[
                  { name: "Basic Care", price: "$99–$199/mo", desc: "Small monthly edits, bug fixes, and website health checks." },
                  { name: "Growth Care", price: "$199–$299/mo", desc: "Monthly updates, content uploads, analytics reviews, and SEO improvements." },
                  { name: "Priority Care", price: "$299/mo", desc: "Faster response SLA, landing page updates, automation maintenance, and strategy recommendations." },
                ].map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{item.desc}</div>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Blog Support */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}>
              <h3 className="text-xl font-serif font-bold mb-6 pb-4 border-b border-border">Blog & Content Support</h3>
              <ul className="space-y-6">
                {[
                  { name: "Blog Setup", price: "$500–$1,000", desc: "Blog architecture, categories, templates, and initial configuration." },
                  { name: "Content Support", price: "$299–$999/mo", desc: "Monthly blog planning, SEO outlines, AI-assisted drafts, upload formatting, and internal linking." },
                ].map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{item.desc}</div>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* SEO */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={2}>
              <h3 className="text-xl font-serif font-bold mb-6 pb-4 border-b border-border">SEO Services</h3>
              <ul className="space-y-6">
                {[
                  { name: "SEO Foundation", price: "$750–$1,500", desc: "One-time: keyword research, metadata, site architecture, Search Console, and technical setup." },
                  { name: "Local SEO Growth", price: "$500–$1,500/mo", desc: "Content planning, Google Business Profile optimization, citation management, and monthly reporting." },
                ].map((item, j) => (
                  <li key={j}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.price}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{item.desc}</div>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="text-center mt-16">
            <Link href="/contact" data-testid="link-pricing-addons-cta">
              <Button size="lg" className="h-14 px-10 text-base" data-testid="button-pricing-addons-cta">
                Book a Free Consultation
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
