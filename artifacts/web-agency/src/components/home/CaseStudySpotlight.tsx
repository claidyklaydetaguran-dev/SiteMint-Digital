import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";

const caseStudies = [
  {
    name: "Shasta Greene",
    domain: "shastagreene.com",
    url: "https://shastagreene.com",
    category: "Real Estate",
    image: "/portfolio-shasta.png",
    headline: "A credible online home for a growing real estate practice",
    description:
      "Shasta needed a site that felt as polished as her in-person reputation. We built a fast, mobile-first site with clear service pages and a lead-capture flow tied straight into her inbox.",
    outcomes: ["Professional online presence", "Lead capture ready"],
  },
  {
    name: "OneFilAm Community",
    domain: "onefilamcommunity.org",
    url: "https://onefilamcommunity.org",
    category: "Nonprofit",
    image: "/portfolio-onefilam.png",
    headline: "A platform that helps a community organize and grow",
    description:
      "A nonprofit's site has to build trust fast with no marketing budget behind it. We focused on clarity, storytelling, and a simple path for new members to get involved.",
    outcomes: ["Community-focused platform", "Improved credibility"],
  },
  {
    name: "Herlinda Valdovinos",
    domain: "herlindavaldovinos.com",
    url: "https://herlindavaldovinos.com",
    category: "Professional Services",
    image: "/portfolio-herlinda.png",
    headline: "A clear, professional presence built around her services",
    description:
      "The brief was simple: make it effortless for prospective clients to understand what's offered and take the next step, without a cluttered, over-designed site getting in the way.",
    outcomes: ["Polished professional presence", "Clear service layout"],
  },
];

export function CaseStudySpotlight() {
  const [active, setActive] = useState(0);
  const current = caseStudies[active];

  return (
    <section className="py-24">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-4">Case Studies</p>
          <h2 className="text-3xl md:text-5xl font-serif font-bold">Our customer stories</h2>
        </motion.div>

        {/* Tab strip */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex flex-wrap justify-center gap-1 p-1.5 rounded-full bg-secondary/70 border border-border/60">
            {caseStudies.map((cs, i) => (
              <button
                key={cs.name}
                onClick={() => setActive(i)}
                className="relative px-4 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ color: active === i ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
              >
                {active === i && (
                  <motion.span
                    layoutId="case-study-tab-pill"
                    className="absolute inset-0 bg-card rounded-full shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{cs.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Spotlight card */}
        <div className="max-w-5xl mx-auto rounded-3xl border border-card-border bg-card overflow-hidden shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.name}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="grid md:grid-cols-2"
            >
              <div className="p-8 md:p-10 flex flex-col justify-center">
                <span className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary-soft-foreground mb-5">
                  {current.category}
                </span>
                <h3 className="font-serif font-bold text-2xl md:text-3xl mb-4 leading-snug">
                  {current.headline}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6">{current.description}</p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {current.outcomes.map((o) => (
                    <span key={o} className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      {o}
                    </span>
                  ))}
                </div>
                <a
                  href={current.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all w-fit"
                >
                  View live site <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              <motion.div
                className="relative aspect-[4/3] md:aspect-auto overflow-hidden bg-secondary"
                whileHover="hover"
              >
                <motion.img
                  src={current.image}
                  alt={`${current.name} website`}
                  className="w-full h-full object-cover"
                  variants={{ hover: { scale: 1.04 } }}
                  transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
