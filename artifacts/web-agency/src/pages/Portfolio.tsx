import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BarChart3, TrendingUp, Zap } from "lucide-react";

export default function Portfolio() {
  const caseStudies = [
    {
      id: 1,
      industry: "Local Restaurant Group",
      title: "Elevating the Dining Experience Before They Arrive",
      description: "We redesigned the online presence for a multi-location restaurant group, implementing a custom reservation system and mobile-first menu architecture.",
      metrics: [
        { label: "Increase in Reservations", value: "45%" },
        { label: "Mobile Bounce Rate Drop", value: "60%" }
      ],
      metricIcon: TrendingUp
    },
    {
      id: 2,
      industry: "Real Estate Brokerage",
      title: "A Property Portal That Captures High-Intent Leads",
      description: "Built a custom property search web application integrated directly with the regional MLS API, paired with automated email drip campaigns.",
      metrics: [
        { label: "Faster Load Times", value: "3x" },
        { label: "More Organic Leads", value: "120%" }
      ],
      metricIcon: Zap
    },
    {
      id: 3,
      industry: "Boutique Law Firm",
      title: "Building Trust Through Professional Authority",
      description: "Developed a secure, accessible website with an integrated client intake portal, document upload facility, and a robust legal blog CMS.",
      metrics: [
        { label: "Increase in Consultations", value: "85%" },
        { label: "Admin Time Saved/Week", value: "12 hrs" }
      ],
      metricIcon: BarChart3
    },
    {
      id: 4,
      industry: "Yoga & Wellness Studio",
      title: "Seamless Class Booking and Member Management",
      description: "Created a custom web application combining class scheduling, member subscriptions, video-on-demand library, and automated waitlists.",
      metrics: [
        { label: "Membership Growth", value: "50%" },
        { label: "Reduction in No-shows", value: "40%" }
      ],
      metricIcon: TrendingUp
    },
    {
      id: 5,
      industry: "Commercial Contractor",
      title: "Showcasing Large-Scale Projects to Win Enterprise Bids",
      description: "A premium portfolio website designed specifically to pass enterprise vendor procurement checks, featuring deep-dive project case studies.",
      metrics: [
        { label: "Increase in RFPs", value: "65%" },
        { label: "Page Views per Session", value: "+140%" }
      ],
      metricIcon: BarChart3
    }
  ];

  return (
    <div className="w-full pb-24">
      <section className="pt-20 pb-16 relative overflow-hidden bg-foreground text-background">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-40" style={{ backgroundImage: "url('/dark-section-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-foreground/80 via-foreground/60 to-foreground pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-background mb-6">Case Studies</h1>
            <p className="text-xl text-background/70 leading-relaxed">
              Explore how we've helped businesses transform their online presence and streamline their operations with custom digital systems.
            </p>
          </motion.div>
        </div>
      </section>
      
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-16">
            {caseStudies.map((study, i) => (
              <motion.div 
                key={study.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5 }}
                className="group"
              >
                <div className={`grid md:grid-cols-2 gap-8 lg:gap-16 items-center ${i % 2 !== 0 ? 'md:grid-cols-[1fr_1.2fr]' : 'md:grid-cols-[1.2fr_1fr]'}`}>
                  
                  {/* Image Placeholder */}
                  <div className={`order-1 ${i % 2 !== 0 ? 'md:order-2' : ''}`}>
                    <div className="aspect-[4/3] bg-card rounded-xl overflow-hidden relative border border-border shadow-sm group-hover:shadow-md transition-shadow">
                      <div className="absolute inset-0 bg-accent flex flex-col items-center justify-center p-8 text-center">
                         <div className="w-20 h-20 rounded-full bg-background mb-4 flex items-center justify-center border border-border">
                           <study.metricIcon className="w-8 h-8 text-primary opacity-50" />
                         </div>
                         <div className="text-muted-foreground font-medium">Project Visual Placeholder</div>
                      </div>
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors duration-500" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className={`order-2 ${i % 2 !== 0 ? 'md:order-1' : ''}`}>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-foreground text-xs font-semibold uppercase tracking-wider mb-6">
                      {study.industry}
                    </div>
                    <h3 className="text-3xl font-serif font-bold mb-4 text-foreground">{study.title}</h3>
                    <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                      {study.description}
                    </p>
                    
                    <div className="grid grid-cols-2 gap-6 mb-8 py-6 border-y border-border/50">
                      {study.metrics.map((metric, j) => (
                        <div key={j}>
                          <div className="text-3xl font-bold text-primary mb-1">{metric.value}</div>
                          <div className="text-sm font-medium text-muted-foreground">{metric.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center text-sm font-bold uppercase tracking-wider text-foreground group-hover:text-primary transition-colors cursor-pointer">
                      Read Full Case Study <ArrowRight className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
