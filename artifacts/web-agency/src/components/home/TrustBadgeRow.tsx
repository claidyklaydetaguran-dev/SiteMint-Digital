import { motion } from "framer-motion";
import { Clock, MonitorSmartphone, Search, Zap, ShieldCheck } from "lucide-react";

const badges = [
  { icon: Clock, label: "Fast Turnaround" },
  { icon: MonitorSmartphone, label: "Mobile-Friendly" },
  { icon: Search, label: "SEO-Ready" },
  { icon: Zap, label: "Business Automation" },
  { icon: ShieldCheck, label: "Ongoing Support" },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 10, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
};

export function TrustBadgeRow() {
  return (
    <section className="py-10 border-y border-border/60 bg-secondary/40">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          className="flex flex-wrap justify-center md:justify-between items-center gap-x-8 gap-y-5"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          {badges.map((b) => (
            <motion.div
              key={b.label}
              variants={item}
              whileHover={{ y: -2 }}
              className="flex items-center gap-2.5 text-sm font-medium text-foreground/80"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-soft text-primary-soft-foreground flex-shrink-0">
                <b.icon className="w-4 h-4" />
              </span>
              {b.label}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
