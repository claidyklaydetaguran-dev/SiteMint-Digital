import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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
  BarChart,
  Megaphone,
  Settings,
  Workflow,
  CheckCircle2
} from "lucide-react";

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 md:pt-32 md:pb-48 overflow-hidden bg-background">
        <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Now accepting new clients for Q4
              </div>
              <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground leading-[1.1] tracking-tight mb-8">
                Websites and Web Apps Built to Help Your Business Grow.
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mb-10">
                We create clean, professional websites, custom web applications, SEO foundations, blog systems, and automation tools that help businesses look credible and operate smarter.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/contact">
                  <Button size="lg" className="h-14 px-8 text-base w-full sm:w-auto" data-testid="button-hero-primary">
                    Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/services">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base w-full sm:w-auto bg-transparent border-border/50 hover:bg-accent" data-testid="button-hero-secondary">
                    View Services
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="border-y border-border/40 bg-card/50 py-8">
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
            <p className="text-lg text-muted-foreground">We build everything you need to operate a successful modern business online.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: LayoutTemplate, title: "Website Design & Dev", desc: "Mobile-responsive, high-converting websites that serve as your digital storefront." },
              { icon: Code, title: "Web Application Dev", desc: "Custom client portals, CRM dashboards, and internal tools to streamline operations." },
              { icon: Search, title: "SEO Foundation", desc: "Technical and local SEO to ensure your business gets found by the right people." },
              { icon: Megaphone, title: "Blog & Content Support", desc: "Strategic content infrastructure to drive organic traffic and establish authority." },
              { icon: Settings, title: "Ongoing Website Care", desc: "Continuous updates, security checks, and performance optimization." },
              { icon: Workflow, title: "Business Automation", desc: "Connecting your tools to eliminate manual work and capture every lead." }
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
      <section className="py-24 bg-card/50 border-y border-border/40">
        <div className="container mx-auto px-4 md:px-6">
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
              { title: "Starter Website", price: "2,500", desc: "Perfect for local businesses needing a professional foundation." },
              { title: "Growth Website", price: "5,000", desc: "For established businesses ready to scale their organic lead generation." },
              { title: "Premium Business", price: "8,500", desc: "Comprehensive digital presence with advanced integrations." }
            ].map((tier, i) => (
              <Card key={i} className="border-border">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">{tier.title}</CardTitle>
                  <CardDescription>{tier.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-1">Starting at</div>
                  <div className="text-4xl font-bold">${tier.price}</div>
                </CardContent>
                <CardFooter>
                  <Link href="/pricing" className="w-full">
                    <Button variant="secondary" className="w-full">View Details</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Process Timeline */}
      <section className="py-24">
        <div className="container mx-auto px-4 md:px-6">
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

      {/* Portfolio & Testimonials */}
      <section className="py-24 bg-foreground text-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">Recent Work</h2>
              <p className="text-lg text-muted/80">See how we've helped other businesses transform their operations.</p>
            </div>
            <Link href="/portfolio">
              <Button variant="outline" className="bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground" data-testid="button-home-portfolio">
                View Portfolio
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {[
              { title: "Local Restaurant", metric: "40% increase in bookings" },
              { title: "Real Estate Agency", metric: "3x faster property load times" },
              { title: "Law Firm", metric: "150% more organic leads" }
            ].map((work, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-[4/3] bg-background/5 rounded-lg mb-6 overflow-hidden relative">
                  <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-serif font-bold text-xl mb-2">{work.title}</h3>
                <p className="text-muted/60 text-sm">{work.metric}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-8 border border-background/10 rounded-lg">
              <div className="flex text-primary mb-4">{"★★★★★"}</div>
              <p className="text-lg italic mb-6">"They didn't just build a website, they built a lead generation system that completely changed how we do business."</p>
              <div className="font-medium">— Sarah J., Studio Owner</div>
            </div>
            <div className="p-8 border border-background/10 rounded-lg">
              <div className="flex text-primary mb-4">{"★★★★★"}</div>
              <p className="text-lg italic mb-6">"The cleanest code and the best communication I've ever experienced with a development agency."</p>
              <div className="font-medium">— Michael T., Real Estate Broker</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-serif font-bold mb-10 text-center">Common Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-lg font-serif">What's the difference between a website and a web app?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                A website is primarily informational—it's your digital storefront designed to market your services, build trust, and capture leads (e.g., a restaurant menu or agency portfolio). A web application is a software tool users interact with to perform tasks—it handles complex data, user accounts, and workflows (e.g., a client portal, booking system, or internal CRM). We build both.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-lg font-serif">How long does a typical project take?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                A standard marketing website typically takes 4-6 weeks from discovery to launch. Custom web applications range from 8-16 weeks depending on complexity. We establish clear timelines during our initial consultation and stick to them.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-lg font-serif">Do you provide ongoing support?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                Yes. We offer Ongoing Care packages that include security updates, performance monitoring, regular content updates, and priority bug fixes. We want to be your long-term technical partner, not just a one-off vendor.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-card/50 border-t border-border/40">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Let's build your business online.</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Start with a website. Grow with systems. Turn your online presence into a real business tool.
          </p>
          <Link href="/contact">
            <Button size="lg" className="h-14 px-8 text-base" data-testid="button-final-cta">
              Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
