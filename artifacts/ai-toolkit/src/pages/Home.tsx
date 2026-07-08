import React from "react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MessageSquare, Zap, Clock, TrendingUp, HelpCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/30 text-foreground overflow-x-hidden">
      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <SiteMintLogo />
          <CheckoutButton size="sm" variant="default">
            Get the Toolkit for $23
          </CheckoutButton>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-32 px-4 relative">
        <div className="absolute inset-0 top-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />
        <div className="container mx-auto max-w-5xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm bg-accent/50 text-primary border-primary/20">
            For SMB Owners & Operators
          </Badge>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Stop Guessing. Start Prompting Like a Pro.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A downloadable pack of 50+ battle-tested AI prompts built for busy business owners. Save hours on marketing, customer service, sales, and operations without learning complex prompt engineering.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <CheckoutButton size="lg" className="w-full sm:w-auto text-lg px-8 h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_40px_rgba(52,211,153,0.3)]">
              Get Instant Access - $23
            </CheckoutButton>
            <p className="text-sm text-muted-foreground">Works with ChatGPT, Claude & Gemini.</p>
          </div>
        </div>

        {/* Product Mockup Image */}
        <div className="mt-16 md:mt-24 container mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm shadow-2xl shadow-primary/5">
            <img 
              src={`${import.meta.env.BASE_URL}product-mockup.png`} 
              alt="SMB AI Prompt Toolkit Preview" 
              className="w-full h-auto rounded-xl border border-white/10 opacity-90 object-cover object-center aspect-video"
            />
          </div>
        </div>
      </section>

      {/* Problem / Agitation Section */}
      <section className="py-24 bg-accent/30 border-y border-border/50">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-serif font-bold">You know AI can save you time. <br className="hidden md:block" /> But right now, it's just frustrating.</h2>
            <p className="text-lg text-muted-foreground">You stare at the blinking cursor, type a quick question, and get back a generic, robotic answer that sounds nothing like your business.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                title: "Wasting Time",
                desc: "Spending more time trying to get the right output than it would take to write it yourself."
              },
              {
                icon: MessageSquare,
                title: "Robotic Results",
                desc: "Everything you generate sounds like a corporate buzzword generator."
              },
              {
                icon: HelpCircle,
                title: "Blank Page Syndrome",
                desc: "Not knowing what you should even be using AI for in your day-to-day operations."
              }
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-background border border-border/50 shadow-sm relative overflow-hidden">
                <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center mb-6 text-red-400">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Inside Section */}
      <section className="py-32 px-4 relative">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white">What's Inside the Toolkit</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">50+ fill-in-the-blank templates spanning the 5 core pillars of your business.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: "Marketing & Social Media",
                items: ["Weekly content calendars", "Turn one blog into 10 social posts", "Local SEO business descriptions", "Google/Meta ad copy generation"]
              },
              {
                title: "Customer Service & Comm.",
                items: ["Replies to negative/positive reviews", "Difficult customer emails", "FAQ page generators", "Appointment follow-ups"]
              },
              {
                title: "Sales & Lead Generation",
                items: ["Cold outreach emails", "Proposal/quote cover emails", "Objection-handling scripts", "Sales page bullet points"]
              },
              {
                title: "Operations & Admin",
                items: ["Standard operating procedure writer", "Job postings & interview questions", "Meeting notes to action items", "Vendor negotiation emails"]
              },
              {
                title: "Financial & Planning",
                items: ["Monthly budget reviews", "Pricing strategy sounding board", "Business plan section drafting", "Expense category cleanup"]
              }
            ].map((category, i) => (
              <div key={i} className="p-8 rounded-2xl bg-card border border-card-border hover:border-primary/50 transition-colors duration-300">
                <h3 className="text-2xl font-bold mb-6 text-primary">{category.title}</h3>
                <ul className="space-y-4">
                  {category.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-card-foreground/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="p-8 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col justify-center items-center text-center">
              <Zap className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-2xl font-bold mb-2">Plus 30 more prompts</h3>
              <p className="text-muted-foreground mb-6">Designed specifically for local service businesses, agencies, and online stores.</p>
              <CheckoutButton variant="secondary" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Unlock All 50+ Prompts
              </CheckoutButton>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial / Social Proof */}
      <section className="py-24 bg-accent/30 border-y border-border/50 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="flex justify-center gap-1 mb-8">
            {[1,2,3,4,5].map(i => (
              <svg key={i} className="w-6 h-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <h2 className="text-2xl md:text-4xl font-serif italic font-medium leading-relaxed mb-8">
            "We finally stopped spending an hour trying to write the perfect email to upset customers. These prompts gave us exactly what we needed to just get the work done and get back to the actual business."
          </h2>
          <p className="font-semibold text-lg text-primary">— Built by SiteMint Digital</p>
          <p className="text-muted-foreground">Used by hundreds of our agency clients.</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 -z-10" />
        <div className="container mx-auto max-w-3xl text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-serif font-bold">Ready to get your time back?</h2>
          <p className="text-xl text-muted-foreground max-w-xl mx-auto">
            One-time payment of $23. Lifetime access to the markdown file and PDF. Copy, paste, and execute.
          </p>
          <div className="pt-8">
            <CheckoutButton size="lg" className="text-lg px-12 h-16 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_40px_rgba(52,211,153,0.2)] hover:shadow-[0_0_60px_rgba(52,211,153,0.4)] transition-all duration-300">
              Buy the Toolkit - $23
            </CheckoutButton>
            <p className="mt-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Secure payment via Stripe
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center border-t border-border/50 text-muted-foreground text-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-6">
            <SiteMintLogo iconSize={24} className="opacity-50 grayscale" />
          </div>
          <p>&copy; {new Date().getFullYear()} SiteMint Digital. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
