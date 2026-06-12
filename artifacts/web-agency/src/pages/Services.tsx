import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  LayoutTemplate,
  Code,
  Search,
  Megaphone,
  Settings,
  Workflow,
  CheckCircle2
} from "lucide-react";

export default function Services() {
  const services = [
    {
      id: "website-design",
      icon: LayoutTemplate,
      title: "Website Design & Development",
      description: "We build fast, mobile-responsive websites that act as your most reliable salesperson. Our sites are built with clean code and structured for conversions.",
      features: [
        "Mobile responsive design",
        "Homepage + core service pages",
        "Lead capture contact forms",
        "Branding & typography guidance",
        "Basic technical SEO setup",
        "Analytics integration",
        "Full launch support & training"
      ]
    },
    {
      id: "web-apps",
      icon: Code,
      title: "Web Application Development",
      description: "Custom software tailored to how your business actually runs. Stop fighting with off-the-shelf tools that almost do what you need.",
      features: [
        "Secure client portals",
        "Custom booking & scheduling systems",
        "CRM & internal dashboard development",
        "Admin control panels",
        "Secure user authentication",
        "Complex database integration",
        "Automated operational workflows"
      ]
    },
    {
      id: "seo",
      icon: Search,
      title: "SEO Foundation",
      description: "A beautiful website is useless if no one finds it. We build SEO directly into the architecture of your site, not as an afterthought.",
      features: [
        "Strategic keyword structure",
        "Optimized meta descriptions & titles",
        "Proper heading (H1-H6) hierarchy",
        "Local SEO & Google Business profile",
        "Google Search Console setup",
        "XML Sitemap & indexing",
        "Technical performance optimization"
      ]
    },
    {
      id: "content",
      icon: Megaphone,
      title: "Blog & Content Support",
      description: "Consistent, high-quality content is the engine for organic growth. We provide the infrastructure and strategy to keep your blog active.",
      features: [
        "CMS and blog architecture setup",
        "Strategic category structuring",
        "Monthly content planning",
        "Targeted SEO outlines",
        "AI-assisted drafting workflows",
        "Formatting & content upload",
        "Internal linking strategies"
      ]
    },
    {
      id: "support",
      icon: Settings,
      title: "Ongoing Website Care",
      description: "Your digital presence needs maintenance to stay secure and fast. We act as your on-call technical team so you can focus on running your business.",
      features: [
        "Routine page and content updates",
        "Security monitoring & bug fixes",
        "Performance and speed checks",
        "Monthly proactive improvements",
        "Technical troubleshooting",
        "Software and dependency updates",
        "Dedicated support channel"
      ]
    },
    {
      id: "automation",
      icon: Workflow,
      title: "Business Automation Add-ons",
      description: "Connect your website to your operational tools. We eliminate manual data entry by routing information exactly where it needs to go.",
      features: [
        "Advanced lead capture routing",
        "Custom email notification flows",
        "Direct CRM connections (HubSpot, Salesforce)",
        "Google Sheets / Airtable syncing",
        "Automated appointment booking",
        "Custom AI chatbot integration",
        "Zapier/Make workflow design"
      ]
    }
  ];

  return (
    <div className="w-full pb-24">
      <section className="pt-20 pb-16 bg-accent/30">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">Our Services</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We design comprehensive digital systems. From professional websites to complex internal tools, we build everything you need to operate smarter online.
            </p>
          </motion.div>
        </div>
      </section>
      
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-12">
            {services.map((service, i) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <Card className="h-full border-border shadow-sm flex flex-col hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-4">
                    <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center mb-4">
                      <service.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-serif font-bold">{service.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow flex flex-col">
                    <p className="text-muted-foreground mb-8">
                      {service.description}
                    </p>
                    <div className="mt-auto">
                      <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground mb-4">What's included:</h4>
                      <ul className="space-y-3 mb-8">
                        {service.features.map((feature, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Link href={`/contact?service=${service.id}`}>
                        <Button variant="outline" className="w-full" data-testid={`button-service-inquire-${service.id}`}>
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

      <section className="py-24 bg-card/50 border-t border-border/40">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Not sure what you need?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Let's discuss your business goals, and we'll recommend the right digital system for your current stage of growth.
          </p>
          <Link href="/contact">
            <Button size="lg" className="h-14 px-8 text-base">
              Book a Free Consultation <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
