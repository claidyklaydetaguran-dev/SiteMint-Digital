import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RotatingWord } from "@/components/RotatingWord";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ArrowRight,
  MonitorSmartphone,
  Search,
  Zap,
  Clock,
  ShieldCheck,
  Code,
  LayoutTemplate,
  BarChart3,
  Code2,
  ExternalLink,
} from "lucide-react";

const recentWork = [
  {
    name: "Shasta Greene Real Estate",
    url: "https://shastagreene.com",
    domain: "shastagreene.com",
    category: "Real Estate",
    image: "/portfolio-shasta.png",
    outcomes: ["Professional online presence", "Lead capture ready"],
  },
  {
    name: "OneFilAm Community",
    url: "https://onefilamcommunity.org",
    domain: "onefilamcommunity.org",
    category: "Nonprofit",
    image: "/portfolio-onefilam.png",
    outcomes: ["Community-focused platform", "Improved credibility"],
  },
  {
    name: "Herlinda Valdovinos",
    url: "https://herlindavaldovinos.com",
    domain: "herlindavaldovinos.com",
    category: "Professional Services",
    image: "/portfolio-herlinda.png",
    outcomes: ["Polished professional presence", "Clear service layout"],
  },
];

function WorkCard({ item }: { item: typeof recentWork[0] }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
      <div className="rounded-xl overflow-hidden border border-background/10 hover:border-background/30 transition-all duration-300">
        {/* AI mockup image */}
        <div className="aspect-[4/3] relative overflow-hidden bg-background/5">
          <img
            src={item.image}
            alt={`${item.name} website`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap"
            style={{ background: "rgba(0,0,0,0.50)", backdropFilter: "blur(4px)" }}
          >
            {item.domain}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-semibold text-background/50 uppercase tracking-wider mb-1">{item.category}</div>
          <h3 className="font-serif font-bold text-lg text-background mb-3 group-hover:text-background/80 transition-colors">
            {item.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            {item.outcomes.map((o) => (
              <span key={o} className="text-xs text-background/60 bg-background/10 px-2.5 py-1 rounded-full">
                {o}
              </span>
            ))}
          </div>
        </div>
      </div>
    </a>
  );
}

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 md:pt-32 md:pb-48 overflow-hidden">
        <picture>
          <source srcSet="/hero-bg-4k.webp" type="image/webp" />
          <img
            src="/hero-bg-4k.png"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          />
        </picture>
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-background/60 via-background/30 to-background pointer-events-none" />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-background via-background/70 to-transparent pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
                Now accepting new clients
              </div>
              <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground leading-[1.1] tracking-tight mb-8">
                AI-Powered Websites &amp; Business Systems That Help You Get More{" "}
                <RotatingWord
                  words={["Customers", "Leads", "Bookings", "Sales", "Clients", "Growth"]}
                  className="text-primary"
                />
                .
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mb-10">
                We build growth-focused websites, CRM systems, automation workflows, client portals, and custom business applications for service businesses, nonprofits, real estate professionals, and growing organizations.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/discovery">
                  <Button size="lg" className="h-14 px-8 text-base w-full sm:w-auto" data-testid="button-hero-primary">
                    Get My Free Business Growth Assessment <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/portfolio">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base w-full sm:w-auto bg-transparent border-border/50 hover:bg-accent" data-testid="button-hero-secondary">
                    View Our Work
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="border-y border-border/40 bg-card/50 py-8 relative" style={{ backgroundImage: "url('/warm-accent-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-wrap justify-center md:justify-between items-center gap-8 md:gap-4 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Fast Turnaround</div>
            <div className="flex items-center gap-2"><MonitorSmartphone className="w-5 h-5 text-primary" /> Mobile-Friendly</div>
            <div className="flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> SEO-Ready</div>
            <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> Business Automation</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Ongoing Support</div>
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">Digital Systems for Growth</h2>
            <p className="text-lg text-muted-foreground">We build everything you need to attract leads, organize follow-up, and operate a successful modern business online.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: LayoutTemplate, title: "Growth Websites", desc: "Mobile-responsive, conversion-focused websites that serve as your 24/7 digital storefront and lead capture engine." },
              { icon: Code, title: "CRM Systems", desc: "Custom client portals and CRM dashboards that organize your contacts, automate follow-up, and track every lead." },
              { icon: Search, title: "SEO Foundations", desc: "Technical and local SEO so your business gets found by the right people searching for your services." },
              { icon: Zap, title: "Business Automation", desc: "Connect your tools, eliminate manual admin work, and capture every lead without lifting a finger." },
              { icon: Code2, title: "Custom Web Apps", desc: "Booking systems, client portals, internal dashboards, and AI-powered tools built for how your business operates." },
              { icon: BarChart3, title: "AI-Assisted Tools", desc: "Chatbots, automated proposals, smart intake forms, and data systems that scale your operations without scaling headcount." },
            ].map((service, i) => (
              <Card key={i} className="group border-none shadow-sm bg-accent/30 hover:bg-accent/60 transition-colors">
                <CardHeader>
                  <service.icon className="w-10 h-10 text-primary mb-4" />
                  <CardTitle className="font-serif text-xl">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">{service.desc}</p>
                  <Link href="/services" className="text-sm font-medium text-foreground group-hover:text-primary flex items-center transition-colors">
                    Learn more <ArrowRight className="w-4 h-4 ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 border-y border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-background/50 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">Transparent Packages</h2>
              <p className="text-lg text-muted-foreground">Clear deliverables, timeline, and pricing. No hidden fees.</p>
            </div>
            <Link href="/pricing">
              <Button variant="outline" data-testid="button-home-all-pricing">View All Pricing</Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Essential Presence", price: "2,995", desc: "For new businesses, local service providers, and professional services that need a credible online home." },
              { title: "Lead Generation Website", price: "5,995", desc: "For service businesses ready to convert visitors into leads with a conversion-focused digital presence.", popular: true },
              { title: "Growth Platform", price: "9,995", desc: "For established businesses that need a complete digital system with automation, CRM, and advanced SEO." },
            ].map((tier, i) => (
              <Card key={i} className={`relative border-border ${(tier as any).popular ? "border-primary shadow-lg" : ""}`}>
                {(tier as any).popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                    Best Seller
                  </div>
                )}
                <CardHeader className="pt-8">
                  <CardTitle className="font-serif text-2xl">{tier.title}</CardTitle>
                  <CardDescription>{tier.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-1">Starting at</div>
                  <div className="text-4xl font-bold">${tier.price}</div>
                </CardContent>
                <CardFooter>
                  <Link href="/pricing" className="w-full">
                    <Button variant={(tier as any).popular ? "default" : "secondary"} className="w-full">View Details</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Process Timeline */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-30" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">How We Work</h2>
            <p className="text-lg text-muted-foreground">A proven process for delivering results on time.</p>
          </div>

          <div className="flex flex-col md:flex-row justify-between relative max-w-5xl mx-auto">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-[1px] bg-border -translate-y-1/2 z-0" />
            {["Discover", "Design", "Build", "Launch", "Optimize"].map((step, i) => (
              <div key={i} className="relative z-10 flex flex-row md:flex-col items-center gap-4 md:gap-6 mb-8 md:mb-0">
                <div className="w-12 h-12 rounded-full bg-background border-2 border-primary flex items-center justify-center font-bold text-primary shadow-[0_0_0_8px_hsl(var(--background))]">
                  {i + 1}
                </div>
                <div className="text-left md:text-center">
                  <h4 className="font-serif font-bold text-lg mb-1">{step}</h4>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Work — real projects */}
      <section className="py-24 bg-foreground text-background relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-40 pointer-events-none" style={{ backgroundImage: "url('/dark-section-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">Recent Work</h2>
              <p className="text-lg text-background/70">
                Real websites built for real businesses — real estate professionals, nonprofits, and service providers.
              </p>
            </div>
            <Link href="/portfolio">
              <Button
                variant="outline"
                className="bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
                data-testid="button-home-portfolio"
              >
                View All Work
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {recentWork.map((item, i) => (
              <WorkCard key={i} item={item} />
            ))}
          </div>

          {/* Honest results strip */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { label: "Projects Delivered", value: "10+", note: "Websites, web apps & systems" },
              { label: "Avg. Turnaround", value: "4–6 wks", note: "For standard marketing websites" },
              { label: "Client Satisfaction", value: "100%", note: "Based on completed projects" },
            ].map((stat, i) => (
              <div key={i} className="p-6 border border-background/10 rounded-xl text-center">
                <div className="text-3xl font-bold text-background mb-1">{stat.value}</div>
                <div className="font-semibold text-background/80 mb-1">{stat.label}</div>
                <div className="text-sm text-background/50">{stat.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-20" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 max-w-3xl relative z-10">
          <h2 className="text-3xl md:text-5xl font-serif font-bold mb-10 text-center">Common Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-lg font-serif">What's the difference between a website and a web app?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                A website is primarily informational — your digital storefront designed to market your services, build trust, and capture leads. A web application is software users interact with to perform tasks: client portals, booking systems, internal CRMs. We build both.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-lg font-serif">How long does a typical project take?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                A standard marketing website typically takes 4–6 weeks from discovery to launch. Custom web applications range from 8–16 weeks depending on complexity. We establish clear timelines during our initial consultation and stick to them.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-lg font-serif">Do you provide ongoing support?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                Yes. We offer Ongoing Care packages that include security updates, performance monitoring, content updates, and priority bug fixes. We want to be your long-term technical partner, not just a one-off vendor.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger className="text-lg font-serif">Who are you — who actually builds my project?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                SiteMint Digital is led by Claidy Taguran (Technical Director), Shasta Greene (Head of Strategy), and Saisa Lorraigne (Project & Admin Manager). Your project is handled by our core team — not outsourced.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 border-t border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-background/50 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Let's build your business online.</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Start with a website. Grow with systems. Turn your online presence into a real business tool.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/discovery">
              <Button size="lg" className="h-14 px-8 text-base gap-2" data-testid="button-final-cta">
                Get My Free Business Growth Assessment <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/portfolio">
              <Button size="lg" variant="outline" className="h-14 px-8 text-base">
                View Our Work
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
