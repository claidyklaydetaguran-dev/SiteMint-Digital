import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function About() {
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

  return (
    <div className="w-full pb-24">
      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-accent/30">
        <div className="container mx-auto px-4 md:px-6">
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
                  Founded in 2020, SiteMint Digital was born out of frustration. We saw too many excellent local businesses struggling online because they were sold broken WordPress templates by fly-by-night freelancers, or locked into restrictive, expensive platforms.
                </p>
                <p>
                  We realized that business owners didn't just want "a website." They wanted a digital system that worked—something that reliably captured leads, represented their brand professionally, and automated the manual tasks eating up their week.
                </p>
                <p>
                  So we built an agency focused purely on <strong>engineering business outcomes</strong>. We brought enterprise-grade development practices—clean code, scalable architecture, and rigorous design—to the small and medium business market.
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
      <section className="py-20 bg-accent/30 border-y border-border/40">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl font-serif font-bold mb-4">Leadership Team</h2>
            <p className="text-muted-foreground">Experienced engineers and designers dedicated to your growth.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            {/* Team Member 1 */}
            <div className="text-center group">
              <div className="w-48 h-48 mx-auto bg-card border border-border rounded-full mb-6 overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-serif text-6xl">
                  JD
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">James Davies</h3>
              <div className="text-primary font-medium text-sm mb-4 uppercase tracking-wider">Technical Director & Founder</div>
              <p className="text-sm text-muted-foreground">Former enterprise software engineer who traded corporate infrastructure for helping local businesses scale.</p>
            </div>

            {/* Team Member 2 */}
            <div className="text-center group">
              <div className="w-48 h-48 mx-auto bg-card border border-border rounded-full mb-6 overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-serif text-6xl">
                  SR
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">Sarah Rossi</h3>
              <div className="text-primary font-medium text-sm mb-4 uppercase tracking-wider">Design Director</div>
              <p className="text-sm text-muted-foreground">Obsessed with conversion-focused UX and creating digital experiences that build immediate trust.</p>
            </div>

            {/* Team Member 3 */}
            <div className="text-center group">
              <div className="w-48 h-48 mx-auto bg-card border border-border rounded-full mb-6 overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-serif text-6xl">
                  MW
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">Marcus Wright</h3>
              <div className="text-primary font-medium text-sm mb-4 uppercase tracking-wider">Head of Strategy</div>
              <p className="text-sm text-muted-foreground">Bridges the gap between technical execution and your bottom-line business goals.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
