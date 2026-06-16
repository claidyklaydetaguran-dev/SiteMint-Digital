import { motion } from "framer-motion";
import { CheckCircle2, Monitor, TrendingUp, Zap, Smartphone, Search, HeadphonesIcon } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }),
};

const team = [
  {
    name: "Claidy Taguran",
    title: "Technical Director",
    photo: "/team-claidy.png",
    description:
      "Leads technical strategy, website development, application development, CRM systems, AI integrations, database architecture, and deployment. Oversees the technical quality of every SiteMint project from planning to launch.",
  },
  {
    name: "Shasta Greene",
    title: "Head of Strategy",
    photo: "/team-shasta.jpg",
    description:
      "Leads business strategy, client growth planning, digital positioning, website messaging, CRM workflow strategy, and automation planning. Helps clients turn their website into a real business growth system.",
  },
  {
    name: "Saisa Lorraigne",
    title: "Project and Admin Manager",
    photo: "/team-saisa.jpg",
    description:
      "Manages project coordination, client communication, onboarding, timelines, documentation, quality control, and administrative operations to keep every project organized and moving forward.",
  },
];

const values = [
  {
    title: "Trustworthy",
    description: "We do what we say we're going to do. No disappearing acts, no surprise invoices, and no holding your domain hostage."
  },
  {
    title: "Results-Focused",
    description: "We don't build art projects. We build business tools. Every design decision is filtered through the lens of generating leads and revenue."
  },
  {
    title: "Communicative",
    description: "We speak plainly. We explain the 'why' behind the technical details without burying you in jargon."
  },
  {
    title: "Long-Term Thinking",
    description: "We architect systems meant to scale with your business for years, not cheap templates that break after the next update."
  }
];

const trustCards = [
  {
    icon: Monitor,
    title: "Custom Website Design",
    description: "Websites built around each client's brand, goals, and audience — not templated shortcuts.",
  },
  {
    icon: TrendingUp,
    title: "Business Strategy First",
    description: "We don't just build pages. We help structure websites to support leads, trust, and long-term growth.",
  },
  {
    icon: Zap,
    title: "CRM & Automation Ready",
    description: "We help connect websites with lead forms, customer tracking, follow-up workflows, and automation tools.",
  },
  {
    icon: Smartphone,
    title: "Mobile Responsive",
    description: "Every website looks clean and professional on desktop, tablet, and mobile — without compromise.",
  },
  {
    icon: Search,
    title: "SEO Foundation",
    description: "Every site is built with clean content hierarchy, metadata, performance, and search visibility in mind.",
  },
  {
    icon: HeadphonesIcon,
    title: "Ongoing Support",
    description: "We provide support for updates, improvements, and future website growth long after launch.",
  },
];

export default function About() {
  return (
    <div className="w-full pb-24">
      {/* Hero Section */}
      <section className="pt-20 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-background/65 via-background/35 to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">Built for Business Owners.</h1>
            <p className="text-2xl text-muted-foreground leading-relaxed">
              We believe small and medium businesses deserve the same caliber of digital tools and engineering precision as enterprise giants.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-serif font-bold mb-6">Our Story</h2>
              <div className="prose prose-lg prose-gray dark:prose-invert">
                <p>
                  SiteMint was built out of a simple observation: most small and medium businesses are underserved when it comes to real digital strategy. They either get cheap templates from freelancers, or pay too much for slow, overcomplicated agencies.
                </p>
                <p>
                  We set out to change that. SiteMint is a focused team of builders and strategists who care about one thing: helping businesses grow through better websites, smarter systems, and practical automation.
                </p>
                <p>
                  Every project we take on is treated like a business system — not just a design exercise. We build things that work, and we stick around to make sure they keep working.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border p-8 md:p-12 rounded-lg shadow-sm">
              <h3 className="text-2xl font-serif font-bold mb-8 text-center">Our Core Values</h3>
              <div className="space-y-6">
                {values.map((value, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-foreground mb-1">{value.title}</h4>
                      <p className="text-sm text-muted-foreground">{value.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 border-y border-border/40 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-50" style={{ backgroundImage: "url('/warm-accent-bg.png')" }} />
        <div className="absolute inset-0 bg-background/40 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl font-serif font-bold mb-4">Leadership Team</h2>
            <p className="text-muted-foreground">The people behind every SiteMint project — strategy, engineering, and operations.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            {team.map((member, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="text-center group"
              >
                <div className="w-48 h-48 mx-auto rounded-full mb-6 overflow-hidden border-2 border-border shadow-md group-hover:shadow-lg group-hover:border-primary/40 transition-all duration-300">
                  <img
                    src={member.photo}
                    alt={member.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-1">{member.name}</h3>
                <div className="text-primary font-medium text-sm mb-4 uppercase tracking-wider">{member.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{member.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Businesses Choose SiteMint */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-20" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-serif font-bold mb-4">Why Businesses Choose SiteMint</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We focus on what actually moves the needle for growing businesses.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {trustCards.map((card, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <div className="bg-card border border-border rounded-xl p-6 h-full hover:border-primary/40 hover:shadow-md transition-all duration-300 group">
                  <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                    <card.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-foreground mb-2">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
