import { motion } from "framer-motion";
import { ExternalLink, Home, Users, Briefcase, Code2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }),
};

const projects = [
  {
    name: "Shasta Greene Real Estate",
    url: "https://shastagreene.com",
    domain: "shastagreene.com",
    category: "Real Estate",
    categoryColor: "bg-blue-50 text-blue-700 border-blue-200",
    Icon: Home,
    gradient: "from-blue-600 via-indigo-600 to-blue-800",
    accentColor: "#93c5fd",
    dotColors: ["#bfdbfe", "#818cf8", "#c7d2fe"],
    description:
      "A professional real estate website designed to build trust, showcase services, support lead generation, and strengthen online presence.",
    outcomes: ["Professional online presence", "Lead capture ready", "Clear service presentation"],
  },
  {
    name: "OneFilAm Community",
    url: "https://onefilamcommunity.org",
    domain: "onefilamcommunity.org",
    category: "Nonprofit Organization",
    categoryColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: Users,
    gradient: "from-emerald-600 via-teal-600 to-emerald-800",
    accentColor: "#6ee7b7",
    dotColors: ["#a7f3d0", "#34d399", "#6ee7b7"],
    description:
      "A nonprofit community website supporting Filipino-American outreach, events, programs, community engagement, and organizational credibility.",
    outcomes: ["Community-focused platform", "Improved credibility", "Events & programs ready"],
  },
  {
    name: "Herlinda Valdovinos",
    url: "https://herlindavaldovinos.com",
    domain: "herlindavaldovinos.com",
    category: "Professional Services",
    categoryColor: "bg-purple-50 text-purple-700 border-purple-200",
    Icon: Briefcase,
    gradient: "from-violet-600 via-purple-600 to-violet-800",
    accentColor: "#c4b5fd",
    dotColors: ["#ddd6fe", "#a78bfa", "#c4b5fd"],
    description:
      "A professional website created to establish online credibility, present services clearly, and help generate client inquiries.",
    outcomes: ["Polished professional presence", "Clear service layout", "Portfolio showcase"],
  },
  {
    name: "Claidy Taguran Portfolio",
    url: "https://ClaidyTaguranPortfolio.replit.app",
    domain: "claidytaguranportfolio.replit.app",
    category: "Developer Portfolio",
    categoryColor: "bg-slate-100 text-slate-700 border-slate-200",
    Icon: Code2,
    gradient: "from-slate-700 via-slate-800 to-slate-900",
    accentColor: "#94a3b8",
    dotColors: ["#cbd5e1", "#94a3b8", "#64748b"],
    description:
      "A technical portfolio showcasing development projects, web applications, software skills, UI/UX work, and modern web development experience.",
    outcomes: ["Project showcase", "Skills presentation", "Recruiter-ready layout"],
  },
];

function GradientCard({ project }: { project: typeof projects[0] }) {
  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${project.gradient} relative overflow-hidden`}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0">
        {/* Large circle top-right */}
        <div
          className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10"
          style={{ background: project.accentColor }}
        />
        {/* Small circle bottom-left */}
        <div
          className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full opacity-10"
          style={{ background: project.accentColor }}
        />
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={`grid-${project.domain}`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${project.domain})`} />
        </svg>
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
        {/* Icon circle */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
        >
          <project.Icon className="w-7 h-7 text-white" />
        </div>

        {/* Decorative dots */}
        <div className="flex gap-2">
          {project.dotColors.map((color, i) => (
            <div key={i} className="w-2 h-2 rounded-full" style={{ background: color, opacity: 0.8 }} />
          ))}
        </div>

        {/* Domain pill */}
        <div
          className="px-4 py-1.5 rounded-full text-xs font-mono text-white/90 shadow-sm"
          style={{ background: "rgba(0,0,0,0.30)", backdropFilter: "blur(4px)" }}
        >
          {project.domain}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, index }: { project: typeof projects[0]; index: number }) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      className="h-full"
    >
      <div className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
        {/* Gradient visual */}
        <div className="aspect-[16/9] relative overflow-hidden border-b border-border/50">
          <GradientCard project={project} />
          <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors duration-500" />
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-grow">
          <div className="mb-3">
            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${project.categoryColor} uppercase tracking-wider`}>
              {project.category}
            </span>
          </div>

          <h3 className="font-serif font-bold text-xl text-foreground mb-2 group-hover:text-primary transition-colors">
            {project.name}
          </h3>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-grow">
            {project.description}
          </p>

          {/* Outcome tags */}
          <div className="flex flex-wrap gap-2 mb-5">
            {project.outcomes.map((o) => (
              <span key={o} className="text-xs bg-accent text-accent-foreground px-2.5 py-1 rounded-full border border-border/50">
                {o}
              </span>
            ))}
          </div>

          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <Button
              variant="outline"
              className="w-full gap-2 group-hover:border-primary/50 group-hover:text-primary transition-colors"
              data-testid={`button-portfolio-visit-${index}`}
            >
              Visit Website <ExternalLink className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function Portfolio() {
  return (
    <div className="w-full pb-24">
      {/* Header */}
      <section className="pt-20 pb-16 relative overflow-hidden bg-foreground text-background">
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-40"
          style={{ backgroundImage: "url('/dark-section-bg.png')" }}
        />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-foreground/80 via-foreground/60 to-foreground pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-background mb-4">
              Recent Work That Gets Results
            </h1>
            <p className="text-xl text-background/70 leading-relaxed">
              From real estate websites to nonprofit platforms and developer portfolios — SiteMint builds practical digital tools that support real growth.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Project Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid sm:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {projects.map((project, i) => (
              <ProjectCard key={i} project={project} index={i} />
            ))}
          </div>

          <div className="text-center mt-16">
            <p className="text-muted-foreground text-sm mb-6">
              Ready to be our next featured project?
            </p>
            <Link href="/discovery">
              <Button size="lg" className="h-14 px-10 text-base gap-2">
                Get My Free Business Growth Assessment <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
