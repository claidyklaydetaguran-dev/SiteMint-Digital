import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  LayoutTemplate,
  Code2,
  Search,
  FileText,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08 },
  }),
};

const services = [
  {
    id: "website-design",
    icon: LayoutTemplate,
    title: "Website Design & Development",
    badge: "Essential Presence · Lead Generation · Growth Platform",
    description:
      "A professional website is your most reliable business asset — working 24/7 to build credibility and capture leads. We build conversion-focused sites, not just pretty pages.",
    included: [
      "Mobile responsive design across all devices",
      "Homepage, service pages, and landing pages",
      "Lead capture and contact forms",
      "Google Analytics and Search Console setup",
      "Basic SEO structure built into every page",
      "Google Maps and social media integration",
      "Speed optimization and SSL setup",
      "Launch support and training session",
    ],
    notIncluded: [
      "Copywriting — you provide the text, we provide the layout",
      "Advanced SEO campaigns (see SEO services below)",
      "CRM or marketing automation (available as add-ons)",
    ],
    note: null,
  },
  {
    id: "web-apps",
    icon: Code2,
    title: "Web Application Development",
    badge: "Internal Tool · Custom Business Platform",
    description:
      "A web application is custom software built specifically for how your business operates. Different from a website — this is for businesses that need tools, not just pages.",
    included: [
      "Booking and scheduling systems",
      "Client and staff portals",
      "Internal dashboards and admin panels",
      "User authentication and role-based access",
      "Database design and management",
      "AI assistants and chatbots",
      "Membership and resource platforms",
      "Workflow automation and integrations",
    ],
    notIncluded: [
      "Enterprise-grade SaaS products",
      "Banking or financial transaction systems",
      "HIPAA-regulated medical platforms",
      "Real-time systems for thousands of concurrent users",
    ],
    note: "Every web application starts with a consultation to scope the project properly. Pricing is determined after discovery — not before.",
  },
  {
    id: "seo",
    icon: Search,
    title: "SEO Services",
    badge: "SEO Foundation · Local SEO Growth",
    description:
      "A website and SEO are not the same thing. We separate them intentionally. Basic SEO structure comes with every website — but ranking on Google takes a dedicated strategy.",
    included: [
      "Keyword research and content structure",
      "Page titles, meta descriptions, and headings",
      "Google Search Console setup and indexing",
      "XML sitemap submission",
      "Local SEO and Google Business Profile guidance",
      "City and service-area landing pages",
      "Technical performance and crawl optimization",
      "Monthly keyword tracking and reporting",
    ],
    notIncluded: [
      "Guaranteed rankings — no one can promise that",
      "Content writing (see Blog & Content Support)",
    ],
    note: "SEO Foundation is a one-time setup. Local SEO Growth is an ongoing monthly service. Both are scoped separately from website packages.",
  },
  {
    id: "content",
    icon: FileText,
    title: "Blog & Content Support",
    badge: "Blog Setup · Monthly Content Support",
    description:
      "Consistent content is the long-term engine for organic traffic. We handle the infrastructure, strategy, and production so your blog actually gets done — every month.",
    included: [
      "Blog system setup and category architecture",
      "Monthly content planning and topic calendar",
      "SEO-optimized blog outlines",
      "AI-assisted content drafts (you review and approve)",
      "Formatting, upload, and publishing support",
      "Internal linking strategy",
      "Content performance reviews",
    ],
    notIncluded: [
      "Full ghostwriting or custom editorial content",
      "Photography or video production",
    ],
    note: "Blog Setup is a one-time service. Monthly Content Support is an ongoing retainer starting at $299/mo depending on volume.",
  },
  {
    id: "support",
    icon: ShieldCheck,
    title: "Ongoing Website Care",
    badge: "Basic Care · Growth Care · Priority Care",
    description:
      "Your website needs maintenance to stay fast, secure, and up to date. We act as your on-call technical team — so you focus on running your business, not managing a website.",
    included: [
      "Routine content and page updates",
      "Bug fixes and technical troubleshooting",
      "Website health and performance checks",
      "Software and dependency updates",
      "Monthly improvement recommendations",
      "Analytics reviews (Growth and Priority tiers)",
      "Dedicated support channel with SLA",
    ],
    notIncluded: [
      "New page builds or redesigns (quoted separately)",
      "SEO campaigns or content production",
    ],
    note: "Care plans range from $99 to $599/mo depending on support level and response time needed.",
  },
  {
    id: "automation",
    icon: Zap,
    title: "Business Automation",
    badge: "Add-on to any package",
    description:
      "Connect your website to the tools your business already uses. We eliminate manual data entry and build workflows that move information where it needs to go — automatically.",
    included: [
      "Lead capture and routing to your inbox or CRM",
      "Email notification workflows",
      "Lead management integrations (scope defined per project)",
      "Google Sheets and Airtable connections",
      "Appointment booking and calendar sync",
      "AI chatbot and assistant setup",
      "Zapier, Make, or custom automation design",
    ],
    notIncluded: [
      "Full CRM platform setup or management",
      "Complex ERP or enterprise workflow systems",
    ],
    note: "CRM integrations vary widely by platform. Scope and pricing are defined during consultation — not bundled into website packages.",
  },
];

export default function Services() {
  return (
    <div className="w-full pb-24">
      {/* Header */}
      <section className="pt-20 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-background/70 via-background/40 to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">What We Build</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Every service is scoped and priced separately — no bundled surprises, no scope creep. Start with what you need now, and add on as you grow.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-10">
            {services.map((service, i) => (
              <motion.div
                key={service.id}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <Card className="h-full border-border shadow-sm flex flex-col hover:border-primary/50 transition-colors duration-300">
                  <CardHeader className="pb-4">
                    <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center mb-4">
                      <service.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-xs font-semibold text-primary/70 uppercase tracking-widest mb-2">
                      {service.badge}
                    </div>
                    <CardTitle className="text-2xl font-serif font-bold">{service.title}</CardTitle>
                  </CardHeader>

                  <CardContent className="flex-grow flex flex-col gap-6">
                    <p className="text-muted-foreground leading-relaxed">{service.description}</p>

                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wider text-foreground mb-3">
                        What's included
                      </h4>
                      <ul className="space-y-2.5">
                        {service.included.map((f, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground text-sm">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wider text-foreground mb-3">
                        Not included
                      </h4>
                      <ul className="space-y-2">
                        {service.notIncluded.map((f, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                            <span className="text-muted-foreground/60 text-sm">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {service.note && (
                      <div className="flex items-start gap-3 bg-accent/60 rounded-lg px-4 py-3 text-sm text-muted-foreground">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{service.note}</span>
                      </div>
                    )}

                    <div className="mt-auto pt-2">
                      <Link href={`/contact?service=${service.id}`}>
                        <Button
                          variant="outline"
                          className="w-full"
                          data-testid={`button-service-inquire-${service.id}`}
                        >
                          Inquire about this service
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 bg-foreground text-background relative overflow-hidden border-t border-border/40">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-40 pointer-events-none" style={{ backgroundImage: "url('/dark-section-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-background mb-6">Not sure where to start?</h2>
          <p className="text-lg text-background/70 max-w-2xl mx-auto mb-10">
            Book a free consultation. We'll ask the right questions, understand your business goals, and recommend exactly what to build first — and what to save for later.
          </p>
          <Link href="/contact" data-testid="link-services-bottom-cta">
            <Button size="lg" className="h-14 px-8 text-base" data-testid="button-services-bottom-cta">
              Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
