import { Link } from "wouter";
import { motion } from "framer-motion";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AnimatedCounter } from "./AnimatedCounter";

const stats = [
  { render: () => <AnimatedCounter value={10} suffix="+" />, label: "Projects Delivered", note: "Websites, web apps & systems" },
  { render: () => <AnimatedCounter value={100} suffix="%" />, label: "Client Satisfaction", note: "Based on completed projects" },
  { render: () => "4–6 wks", label: "Avg. Turnaround", note: "For standard marketing websites" },
  { render: () => <AnimatedCounter value={3} />, label: "Core Team", note: "Handled in-house, never outsourced" },
];

const chartData = [
  { period: "Q1", projects: 2 },
  { period: "Q2", projects: 4 },
  { period: "Q3", projects: 7 },
  { period: "Q4", projects: 10 },
];

const chartConfig = {
  projects: { label: "Projects Delivered", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

export function StatsChart() {
  return (
    <section className="py-24 border-y border-border/40 bg-secondary/40">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid lg:grid-cols-2 gap-14 items-center max-w-6xl mx-auto">
          {/* Left: copy + CTA + stat grid */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-4">Core Experience</p>
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-5 leading-snug">
              Real momentum, delivered <span className="text-primary">quarter after quarter</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-md">
              We're a small, hands-on team by design — every project gets direct access
              to the people building it, not a rotating cast of account managers.
            </p>
            <Link href="/discovery">
              <Button
                className="rounded-full px-6 mb-10"
                style={{ background: "linear-gradient(135deg, #7fdbb6 0%, #4dcb97 100%)", color: "#16233d" }}
              >
                Contact us
              </Button>
            </Link>

            <div className="grid grid-cols-2 gap-x-8 gap-y-7">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-3xl font-bold mb-1">{s.render()}</div>
                  <div className="font-semibold text-sm mb-0.5">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.note}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: animated line chart */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl bg-card border border-card-border p-6"
          >
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="projects"
                  stroke="var(--color-projects)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "var(--color-projects)" }}
                  isAnimationActive
                  animationDuration={900}
                />
              </LineChart>
            </ChartContainer>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
