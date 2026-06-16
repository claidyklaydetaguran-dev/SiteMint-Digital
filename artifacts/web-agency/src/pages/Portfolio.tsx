import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }),
};

const projects = [
  {
    name: "Shasta Greene Real Estate",
    url: "https://shastagreene.com",
    category: "Real Estate",
    categoryColor: "bg-blue-50 text-blue-700 border-blue-200",
    description:
      "A professional real estate website designed to build trust, showcase services, support lead generation, and strengthen online presence.",
  },
  {
    name: "OneFilAm Community",
    url: "https://onefilamcommunity.org",
    category: "Nonprofit Organization",
    categoryColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description:
      "A nonprofit community website supporting Filipino-American outreach, events, programs, community engagement, and organizational credibility.",
  },
  {
    name: "Herlinda Valdovinos",
    url: "https://herlindavaldovinos.com",
    category: "Professional Services",
    categoryColor: "bg-purple-50 text-purple-700 border-purple-200",
    description:
      "A professional website created to establish online credibility, present services clearly, and help generate client inquiries.",
  },
  {
    name: "Claidy Taguran Portfolio",
    url: "https://ClaidyTaguranPorfolio.replit.app",
    category: "Developer Portfolio",
    categoryColor: "bg-primary/5 text-primary border-primary/20",
    description:
      "A technical portfolio showcasing development projects, web applications, software skills, UI/UX work, and modern web development experience.",
  },
];

function ProjectCard({ project, index }: { project: typeof projects[0]; index: number }) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
    >
      <div className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
        {/* Preview placeholder with domain */}
        <div className="aspect-[16/9] bg-accent relative overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center border border-border shadow-sm">
              <span className="font-serif font-bold text-primary text-xl">{project.name[0]}</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground/60 bg-background/80 px-3 py-1 rounded-full border border-border/40">
              {project.url.replace("https://", "")}
            </span>
          </div>
          <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors duration-500" />
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-grow">
          <div className="mb-4">
            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${project.categoryColor} uppercase tracking-wider`}>
              {project.category}
            </span>
          </div>
          <h3 className="font-serif font-bold text-xl text-foreground mb-3 group-hover:text-primary transition-colors">
            {project.name}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed flex-grow">
            {project.description}
          </p>
          <div className="mt-6">
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full gap-2 group-hover:border-primary/50 group-hover:text-primary transition-colors" data-testid={`button-portfolio-visit-${index}`}>
                Visit Website <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          </div>
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
        <div className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none opacity-40" style={{ backgroundImage: "url('/dark-section-bg.png')" }} />
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-foreground/80 via-foreground/60 to-foreground pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-background mb-6">Past Clients & Featured Projects</h1>
            <p className="text-xl text-background/70 leading-relaxed">
              Real websites and digital projects created for entrepreneurs, nonprofits, professionals, and technical portfolios.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Project Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {projects.map((project, i) => (
              <ProjectCard key={i} project={project} index={i} />
            ))}
          </div>

          <div className="text-center mt-16">
            <p className="text-muted-foreground text-sm mb-6">
              Interested in seeing what we can build for your business?
            </p>
            <a href="/contact">
              <Button size="lg" className="h-14 px-10 text-base">
                Start a Project
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
