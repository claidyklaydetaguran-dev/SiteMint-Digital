import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HeroSection, AvatarStack } from "@/components/HeroSection";
import { TrustBadgeRow } from "@/components/home/TrustBadgeRow";
import { BenefitRow } from "@/components/home/BenefitRow";
import { CaseStudySpotlight } from "@/components/home/CaseStudySpotlight";
import { StatsChart } from "@/components/home/StatsChart";
import { ArrowRight, Diamond } from "lucide-react";

const pricingTiers = [
  {
    title: "Essential Presence",
    price: "2,995",
    desc: "For new businesses and local service providers that need a credible online home.",
    features: ["5-page responsive website", "Contact & lead capture forms", "Basic SEO setup"],
  },
  {
    title: "Lead Generation Website",
    price: "5,995",
    desc: "For service businesses ready to convert visitors into leads.",
    features: ["Everything in Essential, plus", "Conversion-focused design", "CRM-ready lead capture", "4–6 week delivery"],
    popular: true,
  },
  {
    title: "Growth Platform",
    price: "9,995",
    desc: "For established businesses that need a complete digital system.",
    features: ["Everything in Lead Gen, plus", "Custom CRM & automations", "Advanced local SEO", "Ongoing care & support"],
  },
];

const processSteps = ["Discover", "Design", "Build", "Launch", "Optimize"];

const stepContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const stepItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <HeroSection />

      {/* Trust badge row */}
      <TrustBadgeRow />

      {/* Benefit / pain-point row */}
      <BenefitRow />

      {/* Case study spotlight */}
      <CaseStudySpotlight />

      {/* Stats + animated chart */}
      <StatsChart />

      {/* Process Timeline */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">How We Work</h2>
            <p className="text-lg text-muted-foreground">A proven process for delivering results on time.</p>
          </motion.div>

          <motion.div
            className="flex flex-col md:flex-row justify-between relative max-w-5xl mx-auto"
            variants={stepContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div
              className="hidden md:block absolute top-6 left-0 w-full h-[1px] bg-border -translate-y-1/2 z-0 origin-left"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] as const }}
            />
            {processSteps.map((step, i) => (
              <motion.div
                key={i}
                variants={stepItem}
                className="relative z-10 flex flex-row md:flex-col items-center gap-4 md:gap-6 mb-8 md:mb-0"
              >
                <div className="w-12 h-12 rounded-full bg-background border-2 border-primary flex items-center justify-center font-bold text-primary shadow-[0_0_0_8px_hsl(var(--background))]">
                  {i + 1}
                </div>
                <div className="text-left md:text-center">
                  <h4 className="font-serif font-bold text-lg mb-1">{step}</h4>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 border-y border-border/40 relative overflow-hidden bg-secondary/40">
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
            {pricingTiers.map((tier, i) => (
              <Card
                key={i}
                className={`relative bg-card overflow-hidden ${tier.popular ? "border-primary shadow-xl shadow-primary/10 md:-translate-y-2" : "border-card-border"}`}
              >
                {tier.popular && (
                  <div
                    className="absolute top-0 left-0 right-0 py-2 text-center text-xs font-bold tracking-wider uppercase text-white"
                    style={{ background: "linear-gradient(135deg, #4dcb97 0%, #309169 100%)" }}
                  >
                    Most Popular
                  </div>
                )}
                <CardHeader className={tier.popular ? "pt-14" : "pt-8"}>
                  <CardTitle className="font-serif text-2xl">{tier.title}</CardTitle>
                  <CardDescription>{tier.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-1">Starting at</div>
                  <div className="text-4xl font-bold mb-6">${tier.price}</div>
                  <ul className="flex flex-col gap-2.5">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <Diamond className="w-3 h-3 mt-1 flex-shrink-0 fill-primary text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href="/pricing" className="w-full">
                    <Button variant={tier.popular ? "default" : "secondary"} className="w-full">View Details</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 relative overflow-hidden">
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

      {/* Final CTA / promo band */}
      <section
        className="py-24 border-t border-border/40 relative overflow-hidden"
        style={{ background: "linear-gradient(155deg, #d5f0e4 0%, #e6f8ef 40%, #f7fdfa 70%, #e3f6ee 100%)" }}
      >
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Let's build your <span className="text-primary">business online</span>.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Start with a website. Grow with systems. Turn your online presence into a real business tool.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
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
            <div className="flex justify-center">
              <AvatarStack />
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
