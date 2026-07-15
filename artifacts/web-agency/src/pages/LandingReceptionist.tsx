import { useState, useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Calendar,
  Mail,
  MessageSquare,
  Globe,
  ArrowRight,
  Zap,
  Clock,
  DollarSign,
  Users,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

// ── Industry demo conversations ──────────────────────────────────────────────

interface Exchange {
  from: "visitor" | "ai";
  text: string;
}

interface IndustryDemo {
  label: string;
  exchanges: Exchange[];
}

const INDUSTRIES: IndustryDemo[] = [
  {
    label: "Real Estate",
    exchanges: [
      { from: "visitor", text: "Hi, I saw your listing on Zillow for the 3-bed on Maple Ave. Is it still available?" },
      { from: "ai", text: "Hi! Yes, it's still available. Are you looking to buy, or do you work with a buyer's agent?" },
      { from: "visitor", text: "I'm buying. Pre-approved up to $650k." },
      { from: "ai", text: "Perfect — that property is listed at $619k. Would you like to schedule a showing? I can check availability right now." },
    ],
  },
  {
    label: "Law Firm",
    exchanges: [
      { from: "visitor", text: "I was in a car accident last week and I think I need a lawyer." },
      { from: "ai", text: "I'm sorry to hear that. Were you injured, and was the other driver at fault?" },
      { from: "visitor", text: "Yes, I have a broken wrist. The other driver ran a red light." },
      { from: "ai", text: "Thank you for sharing that. Have you already spoken with any other attorneys about this?" },
    ],
  },
  {
    label: "Home Services",
    exchanges: [
      { from: "visitor", text: "My kitchen sink is completely backed up. Need a plumber ASAP." },
      { from: "ai", text: "Got it — we can help. Is water actively overflowing, or is it just draining very slowly?" },
      { from: "visitor", text: "Just won't drain at all. Standing water." },
      { from: "ai", text: "Understood. Are you available this afternoon, or does tomorrow morning work better? I can check today's schedule." },
    ],
  },
  {
    label: "Med Spa",
    exchanges: [
      { from: "visitor", text: "Hey, I'm interested in Botox. What areas do you treat?" },
      { from: "ai", text: "We treat forehead lines, crow's feet, and frown lines. Is this your first time with Botox, or have you had it before?" },
      { from: "visitor", text: "First time. A little nervous honestly." },
      { from: "ai", text: "Totally normal! We'd love to book a quick consultation first — no pressure, just answers. Want me to find a time that works for you?" },
    ],
  },
  {
    label: "Restaurant",
    exchanges: [
      { from: "visitor", text: "Do you take reservations for Saturday dinner? Party of 6." },
      { from: "ai", text: "We do! Saturday is busy — we have openings at 5:30 pm or 8:15 pm. Do either work for your group?" },
      { from: "visitor", text: "8:15 is perfect." },
      { from: "ai", text: "Great — name for the reservation, and any dietary restrictions or special occasions I should note?" },
    ],
  },
  {
    label: "Retail",
    exchanges: [
      { from: "visitor", text: "Do you carry the Nike Air Max 270 in size 11?" },
      { from: "ai", text: "Let me check — we have that in black/white and the volt colorway in an 11. Do you have a preference?" },
      { from: "visitor", text: "The black/white. Can I pick up today?" },
      { from: "ai", text: "Yes, it's in stock at our main location. Want me to hold a pair under your name?" },
    ],
  },
];

const STATS = [
  {
    icon: MessageSquare,
    number: "60–80%",
    label: "of inbound calls go unanswered",
    source: "BrightLocal / Google SMB research",
  },
  {
    icon: Zap,
    number: "<15 sec",
    label: "average AI response time via SMS",
    source: "Industry benchmark",
  },
  {
    icon: DollarSign,
    number: "$150–1,200+",
    label: "typical value of one qualified lead",
    source: "Varies by industry",
  },
];

const BENEFITS = [
  {
    icon: Users,
    title: "Capture leads that would otherwise go cold",
    body: "Most callers don't leave voicemails. When an AI replies within seconds, they stay engaged — and you get the lead instead of the competitor who answers next.",
  },
  {
    icon: Calendar,
    title: "Guide conversations toward booking",
    body: "The AI asks the right qualifying questions for your business, collects the information you need, and moves toward scheduling — so your team picks up ready to close.",
  },
  {
    icon: RefreshCw,
    title: "Automate follow-up so nothing falls through",
    body: "Every conversation is logged. Unanswered leads can be followed up automatically by text so a busy day never means a lost opportunity.",
  },
  {
    icon: ShieldCheck,
    title: "Stay consistent and on-brand, 24/7",
    body: "The AI represents your business the way you want — with your tone, your service list, your booking process. No off-script answers, no bad days.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Tell us about your business",
    body: "We start with a conversation: how you work, what your customers typically ask, what a qualified lead looks like for you.",
  },
  {
    step: "02",
    title: "We connect your calendar and tools",
    body: "We configure the AI, connect it to your scheduling or CRM, and test it against real scenarios before anything goes live.",
  },
  {
    step: "03",
    title: "Your AI receptionist goes live",
    body: "We handle the rollout. Your team gets a review dashboard. You see every conversation and can step in at any point.",
  },
];

const INTEGRATIONS = [
  { icon: Calendar, label: "Google Calendar" },
  { icon: Mail, label: "Email" },
  { icon: MessageSquare, label: "SMS" },
  { icon: Globe, label: "Website Chat" },
];

const FAQS = [
  {
    q: "What exactly is an AI receptionist?",
    a: "It's a text-based AI that responds to inbound messages on behalf of your business — answering common questions, qualifying leads, and moving toward a booking or next step. It's configured specifically for your business, not a generic chatbot.",
  },
  {
    q: "Does it replace my staff?",
    a: "No. It handles the first-response layer — the part that currently goes unanswered or waits hours for a reply. Your team still handles the relationship, closes the sale, and delivers the service. The AI makes sure no one falls through the cracks while you're busy.",
  },
  {
    q: "Can it handle phone calls?",
    a: "Currently, the AI receptionist is text-based — it responds via SMS and website chat. Voice capability is on our roadmap and we'll offer it to existing clients first when it's ready.",
  },
  {
    q: "How long does setup take?",
    a: "For most businesses, we can have something live within one to two weeks from our first conversation. Setup is handled entirely by our team — you review and approve before anything goes live.",
  },
  {
    q: "What happens after we launch?",
    a: "You get access to a conversation review dashboard, and we monitor the system during the first few weeks. We adjust the AI's responses based on real conversations — it gets more accurate over time.",
  },
  {
    q: "Can it connect to tools I already use?",
    a: "We support Google Calendar, email, SMS, and website chat out of the box. If you use a specific CRM or scheduling tool, ask us — we evaluate integrations on a case-by-case basis.",
  },
];

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
}
const empty: FormState = { name: "", businessName: "", email: "", phone: "", businessType: "" };

// ── Animation helpers ────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingReceptionist() {
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [activeIndustry, setActiveIndustry] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const demoRef = useRef<HTMLElement>(null);

  // ── Page-view tracking (preserve exactly) ──
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    fetch("/api/landing-test/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: "receptionist",
        utmSource: qs.get("utm_source") ?? null,
        utmMedium: qs.get("utm_medium") ?? null,
        utmCampaign: qs.get("utm_campaign") ?? null,
      }),
    }).catch(() => { /* tracking fire-and-forget */ });
  }, []);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Submit (preserve exactly) ──
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const qs = new URLSearchParams(window.location.search);
      const r = await fetch("/api/landing-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical: "receptionist",
          name: form.name,
          businessName: form.businessName,
          email: form.email,
          phone: form.phone,
          extra: form.businessType,
          utmSource: qs.get("utm_source") ?? "direct",
          utmMedium: qs.get("utm_medium") ?? "direct",
          utmCampaign: qs.get("utm_campaign") ?? null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Submission failed — please try again."); return; }
      setSuccess(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToDemo = () => demoRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToContact = () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });

  const currentDemo = INDUSTRIES[activeIndustry];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">

      {/* ── 1. Sticky Nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/ai-receptionist" className="shrink-0">
            <SiteMintLogo variant="dark" iconSize={28} />
          </a>

          {/* Center nav links — desktop */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {[
              { label: "Features", id: "features" },
              { label: "How It Works", id: "how-it-works" },
              { label: "Pricing", id: "pricing" },
              { label: "FAQ", id: "faq" },
            ].map((link) => (
              <button
                key={link.id}
                onClick={() => document.getElementById(link.id)?.scrollIntoView({ behavior: "smooth" })}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Right CTAs */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={scrollToDemo}
            >
              See a demo
            </Button>
            <Button size="sm" onClick={scrollToContact} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Talk to us
            </Button>
            {/* Mobile hamburger */}
            <button
              className="md:hidden ml-1 p-1 text-foreground"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border px-4 py-4 flex flex-col gap-3 bg-background">
            {[
              { label: "Features", id: "features" },
              { label: "How It Works", id: "how-it-works" },
              { label: "Pricing", id: "pricing" },
              { label: "FAQ", id: "faq" },
            ].map((link) => (
              <button
                key={link.id}
                onClick={() => { document.getElementById(link.id)?.scrollIntoView({ behavior: "smooth" }); setMobileMenuOpen(false); }}
                className="text-sm text-left text-muted-foreground hover:text-foreground py-1"
              >
                {link.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── 2. Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground px-4 md:px-6 py-16 md:py-24">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <motion.div
            className="space-y-6"
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            <motion.span
              variants={fadeUp}
              className="inline-block text-xs font-bold tracking-widest uppercase bg-white/10 border border-white/20 text-primary-foreground/80 px-3 py-1 rounded-full"
            >
              AI Receptionist · SiteMint Digital
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className="font-serif text-3xl md:text-5xl font-bold leading-tight"
            >
              Stop losing jobs<br />to voicemail.
            </motion.h1>

            <motion.p variants={fadeUp} className="text-primary-foreground/75 text-base md:text-lg leading-relaxed max-w-md">
              Your AI receptionist answers by text in seconds, asks the right qualifying questions,
              and keeps every lead warm — even when you're on a job.
            </motion.p>

            <motion.ul variants={fadeUp} className="space-y-2.5 text-sm">
              {[
                "Answers by text in seconds — no voicemail, no lost caller",
                "Asks the right questions for your specific business",
                "You review every conversation before anything is missed",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                  <span className="text-primary-foreground/80">{item}</span>
                </li>
              ))}
            </motion.ul>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-white text-primary hover:bg-white/90 font-semibold"
              >
                Talk to us about your business
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToDemo}
                className="border-white/30 text-primary-foreground hover:bg-white/10 gap-2"
              >
                <Play className="w-4 h-4" />
                See it in action
              </Button>
            </motion.div>
          </motion.div>

          {/* Right — phone mockup */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.6, delay: 0.2 } }}
            className="flex justify-center md:justify-end"
          >
            <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-primary-foreground/80">AI Receptionist — Online</span>
              </div>
              <div className="space-y-3">
                {currentDemo.exchanges.slice(0, 3).map((ex, i) => (
                  <div
                    key={i}
                    className={`flex ${ex.from === "visitor" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        ex.from === "visitor"
                          ? "bg-white text-primary rounded-br-sm"
                          : "bg-white/15 text-primary-foreground/90 rounded-bl-sm"
                      }`}
                    >
                      {ex.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-primary-foreground/40 text-center">
                Sample conversation · {currentDemo.label}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 3. Industry selector ───────────────────────────────────────────── */}
      <section ref={demoRef as React.RefObject<HTMLElement>} id="demo" className="px-4 md:px-6 py-16 bg-muted/40">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-8 space-y-3"
          >
            <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-primary/70">
              Configurable by industry
            </motion.p>
            <motion.h2 variants={fadeUp} className="font-serif text-2xl md:text-3xl font-bold">
              See how it adapts to your business
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-sm max-w-xl mx-auto">
              The AI's questions and conversation flow are tailored to each type of business —
              these are example exchanges showing how it could work for yours.
            </motion.p>
          </motion.div>

          {/* Industry pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {INDUSTRIES.map((ind, i) => (
              <button
                key={ind.label}
                onClick={() => setActiveIndustry(i)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  i === activeIndustry
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-background border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {ind.label}
              </button>
            ))}
          </div>

          {/* Conversation card */}
          <motion.div
            key={activeIndustry}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
            className="max-w-md mx-auto bg-background border border-border rounded-2xl p-5 shadow-md"
          >
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-muted-foreground">AI Receptionist — {currentDemo.label}</span>
            </div>
            <div className="space-y-3">
              {currentDemo.exchanges.map((ex, i) => (
                <div key={i} className={`flex ${ex.from === "visitor" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      ex.from === "visitor"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {ex.text}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-4 pt-3 border-t border-border">
              Example only — actual questions are customized for your business
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── 4. Stats bar ──────────────────────────────────────────────────── */}
      <section className="bg-primary px-4 md:px-6 py-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {STATS.map((stat) => (
            <motion.div
              key={stat.number}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-black font-serif text-primary-foreground mb-1">
                {stat.number}
              </div>
              <div className="text-sm text-primary-foreground/75 mb-1">{stat.label}</div>
              <div className="text-[10px] text-primary-foreground/40">{stat.source}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 5. Benefits ───────────────────────────────────────────────────── */}
      <section id="features" className="px-4 md:px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-12 space-y-3"
          >
            <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-primary/70">Features</motion.p>
            <motion.h2 variants={fadeUp} className="font-serif text-2xl md:text-3xl font-bold">Built to handle what you can't</motion.h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-start">
            {/* Feature cards */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {BENEFITS.map((b) => (
                <motion.div
                  key={b.title}
                  variants={fadeUp}
                  className="bg-background border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <b.icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-2 leading-snug">{b.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{b.body}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* iMessage-style chat mockup */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0, transition: { duration: 0.5 } }}
              viewport={{ once: true }}
              className="bg-muted/50 border border-border rounded-2xl p-5 shadow-sm"
            >
              <div className="text-xs font-semibold text-muted-foreground mb-4 text-center">
                Real conversation example
              </div>
              <div className="space-y-3">
                {[
                  { from: "visitor", text: "Hi, I saw your ad. Do you do emergency HVAC calls?" },
                  { from: "ai", text: "Yes, we do! Is your system not heating or cooling right now?" },
                  { from: "visitor", text: "No heat. It's 48° in here." },
                  { from: "ai", text: "Got it — that's urgent. Are you available in the next 2 hours, or should we schedule for first thing tomorrow morning?" },
                  { from: "visitor", text: "Now please, yes." },
                  { from: "ai", text: "Perfect. I've flagged this as urgent. Can I get your address so we can dispatch someone?" },
                ].map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "visitor" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 text-xs leading-relaxed rounded-2xl ${
                        msg.from === "visitor"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-background border border-border text-foreground rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-4">
                This lead would have gone to voicemail. Instead, it's booked.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 6. How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-muted/40 px-4 md:px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-12 space-y-3"
          >
            <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-primary/70">Process</motion.p>
            <motion.h2 variants={fadeUp} className="font-serif text-2xl md:text-3xl font-bold">From conversation to live in weeks</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-sm max-w-xl mx-auto">
              We handle the full setup — no technical work on your end.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-6"
          >
            {HOW_IT_WORKS.map((step) => (
              <motion.div
                key={step.step}
                variants={fadeUp}
                className="bg-background border border-border rounded-2xl p-6 shadow-sm text-center"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xs font-black text-primary">{step.step}</span>
                </div>
                <h3 className="font-semibold text-sm mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 7. Integrations ───────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-14 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary/70 mb-3">Integrations</p>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            Connects with the tools your business already runs on.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {INTEGRATIONS.map((int) => (
              <div key={int.label} className="flex items-center gap-2.5 bg-background border border-border rounded-xl px-4 py-2.5 shadow-sm text-sm font-medium">
                <int.icon className="w-4 h-4 text-primary" />
                {int.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. Testimonials ───────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-20 bg-muted/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70">Testimonials</p>
            <h2 className="font-serif text-2xl md:text-3xl font-bold">What clients are saying</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                quote: "We used to miss 3–4 calls a day when we were on jobs. Those were jobs we never knew we lost. Now every inquiry gets an immediate response.",
                role: "Home Services Business Owner",
              },
              {
                quote: "The first week it was live, it captured two leads that came in after 9pm. Both became paying clients. Setup was fast — we were live in under two weeks.",
                role: "Med Spa Manager",
              },
            ].map((t, i) => (
              <div key={i} className="bg-background border border-border rounded-2xl p-6 shadow-sm relative">
                <div className="absolute top-3 right-4 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                  Example
                </div>
                <p className="text-sm leading-relaxed text-foreground/80 mb-4 italic">"{t.quote}"</p>
                <p className="text-xs font-semibold text-muted-foreground">— {t.role}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            Placeholder quotes — real client testimonials will appear here as pilots are completed.
          </p>
        </div>
      </section>

      {/* ── 9. Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-4 md:px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-12 space-y-3"
          >
            <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-primary/70">Pricing</motion.p>
            <motion.h2 variants={fadeUp} className="font-serif text-2xl md:text-3xl font-bold">Simple, honest pricing</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-sm max-w-md mx-auto">
              No per-message fees, no surprise costs. One setup, one monthly rate.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto"
          >
            {/* Setup */}
            <motion.div variants={fadeUp} className="bg-background border border-border rounded-2xl p-7 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">One-Time Setup</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="font-serif text-4xl font-black text-foreground">$500</span>
                <span className="text-muted-foreground text-sm mb-1">– $1,500</span>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Depends on scope and integrations needed</p>
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                {[
                  "Custom AI configuration for your business",
                  "Calendar and tool integrations",
                  "Full testing before launch",
                  "Onboarding and review dashboard access",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Monthly */}
            <motion.div variants={fadeUp} className="bg-primary text-primary-foreground rounded-2xl p-7 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-foreground/60 mb-4">Monthly Plan</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="font-serif text-4xl font-black">$99</span>
                <span className="text-primary-foreground/60 text-sm mb-1">– $299/mo</span>
              </div>
              <p className="text-xs text-primary-foreground/60 mb-5">Based on conversation volume</p>
              <ul className="space-y-2.5 text-xs text-primary-foreground/80">
                {[
                  "AI receptionist active 24/7",
                  "Conversation review dashboard",
                  "Ongoing tuning as your business evolves",
                  "Email and SMS support",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-6 bg-white text-primary hover:bg-white/90 font-semibold"
                onClick={scrollToContact}
              >
                Get started <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── 10. FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-muted/40 px-4 md:px-6 py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70">FAQ</p>
            <h2 className="font-serif text-2xl md:text-3xl font-bold">Common questions</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="bg-background border border-border rounded-xl px-5 py-1 shadow-sm"
              >
                <AccordionTrigger className="text-sm font-semibold text-left hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── 11. Final CTA banner ──────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground px-4 md:px-6 py-20">
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <h2 className="font-serif text-2xl md:text-4xl font-bold">
            Ready to stop missing calls?
          </h2>
          <p className="text-primary-foreground/70 text-base max-w-md mx-auto leading-relaxed">
            Tell us about your business and we'll show you exactly how an AI receptionist
            would work for your industry. No pressure — just a conversation.
          </p>
          <Button
            size="lg"
            onClick={scrollToContact}
            className="bg-white text-primary hover:bg-white/90 font-semibold px-8"
          >
            Talk to us <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </section>

      {/* ── Contact / signup form ─────────────────────────────────────────── */}
      <section id="contact" className="px-4 md:px-6 py-20">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70">Get in touch</p>
            <h2 className="font-serif text-2xl md:text-3xl font-bold">Let's talk about your business</h2>
            <p className="text-muted-foreground text-sm">
              We'll reach out within one business day.
            </p>
          </div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-800">We'll be in touch shortly!</p>
              <p className="text-sm text-emerald-700">
                Thanks for reaching out. A member of our team will contact you within one business day.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-4 bg-background border border-border rounded-2xl p-8 shadow-md">
              <div>
                <Label htmlFor="name" className="text-sm font-semibold">Full Name *</Label>
                <Input id="name" value={form.name} onChange={set("name")} placeholder="Chris Rivera" className="mt-1.5" required />
              </div>
              <div>
                <Label htmlFor="businessName" className="text-sm font-semibold">Business Name</Label>
                <Input id="businessName" value={form.businessName} onChange={set("businessName")} placeholder="Rivera Plumbing & Heating" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="chris@riveraplumbing.com" className="mt-1.5" required />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-semibold">Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="businessType" className="text-sm font-semibold">Industry</Label>
                <Select value={form.businessType} onValueChange={(v) => setForm((f) => ({ ...f, businessType: v }))}>
                  <SelectTrigger id="businessType" className="mt-1.5 w-full">
                    <SelectValue placeholder="Select your industry…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Home Services">Home Services (HVAC, Plumbing, Electrical…)</SelectItem>
                    <SelectItem value="Real Estate">Real Estate</SelectItem>
                    <SelectItem value="Law Firm">Law Firm</SelectItem>
                    <SelectItem value="Med Spa">Med Spa / Aesthetics</SelectItem>
                    <SelectItem value="Restaurant">Restaurant</SelectItem>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Send my details
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                No spam. No sales pressure. Just a conversation about your business.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── 12. Footer ────────────────────────────────────────────────────── */}
      <Footer />
    </div>
  );
}
