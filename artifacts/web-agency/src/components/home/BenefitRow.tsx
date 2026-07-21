import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, LayoutTemplate, Workflow, TrendingUp } from "lucide-react";

const benefits = [
  {
    icon: LayoutTemplate,
    title: "No way to size up the right site for your business",
    desc: "We start with a discovery call, not a template picker — every build maps to how your business actually attracts and closes customers.",
  },
  {
    icon: Workflow,
    title: "No simple way to tie your site to real follow-up",
    desc: "CRM, automations, and lead capture are built in from day one, so nothing you invest in marketing goes to waste after the click.",
  },
  {
    icon: TrendingUp,
    title: "No straightforward path to prove it's working",
    desc: "Clear delivery timelines, plain-language reporting, and a team that explains the 'why' behind every recommendation.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const } },
};

export function BenefitRow() {
  return (
    <section className="py-24 bg-secondary/40">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-14"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-4">Pain Points</p>
          <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">
            You're expected to <span className="text-primary">deliver fast</span>, but most agencies
            can't keep up with <span className="text-primary">what your business actually needs</span>
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {benefits.map((b) => (
            <motion.div
              key={b.title}
              variants={item}
              whileHover={{ y: -4 }}
              className="p-6 rounded-2xl bg-card border border-card-border transition-shadow duration-300 hover:shadow-[0_16px_36px_rgba(77,203,151,0.14)]"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-lg border border-primary/25 text-primary mb-5">
                <b.icon className="w-4.5 h-4.5" />
              </span>
              <h3 className="font-semibold text-base leading-snug mb-2">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="text-center mt-12">
          <Link href="/services" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2.5 transition-all">
            See everything we build <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
