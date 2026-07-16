import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, type Variants, useInView, useMotionValue, useSpring } from "framer-motion";
import { ReceptionistNav } from "@/components/layout/ReceptionistNav";
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
  Send,
  Calendar,
  Mail,
  MessageSquare,
  Globe,
  ArrowRight,
  Zap,
  DollarSign,
  Users,
  RefreshCw,
  ShieldCheck,
  Phone,
  PhoneOff,
  Star,
  TrendingUp,
  Clock,
} from "lucide-react";

// ── Industry interactive demo scripts ────────────────────────────────────────

interface IndustryScript {
  label: string;
  emoji: string;
  greeting: string;
  responses: string[];
}

const INDUSTRY_SCRIPTS: IndustryScript[] = [
  {
    label: "Real Estate",
    emoji: "🏠",
    greeting: "Hi! I'm the AI receptionist for this real estate team. Are you looking to buy, sell, or rent?",
    responses: [
      "Got it! Are you pre-approved for financing, or would you like help connecting with a lender first?",
      "That helps me point you to the right listings. What's your target price range and preferred area?",
      "Perfect. I can schedule a showing at your convenience — what days work best this week?",
      "Wonderful — I've flagged this for the team. Someone will reach out shortly to confirm the details.",
    ],
  },
  {
    label: "Law Firm",
    emoji: "⚖️",
    greeting: "Hello! You've reached the intake line for this law firm. What kind of legal matter can we help you with today?",
    responses: [
      "I'm sorry to hear that. Were you injured, and do you know who was at fault?",
      "Thank you for sharing that. Approximately when did this incident occur?",
      "Understood. Have you already spoken with any other attorneys about this matter?",
      "I've noted the details. An attorney will review your situation and follow up with you directly — usually within one business day.",
    ],
  },
  {
    label: "Home Services",
    emoji: "🔧",
    greeting: "Hi, you've reached our home services team. What issue are you dealing with today?",
    responses: [
      "Got it — is this urgent, or is it something that can be scheduled in the next few days?",
      "Understood. Is the problem getting worse, or is it stable for now?",
      "Makes sense. To get the right technician to you, what's the address and best time to visit?",
      "All set — I've flagged this as a priority. The team will call you back to confirm the appointment window.",
    ],
  },
  {
    label: "Med Spa",
    emoji: "💆",
    greeting: "Hello! Welcome to our med spa. Are you interested in booking a treatment, or do you have a question for us?",
    responses: [
      "Great choice! Is this your first time with this treatment, or have you had it done before?",
      "Totally understandable — we love first-timers! Would you prefer a quick consultation call, or are you ready to book?",
      "We have availability this week. Do you have a preferred day or time that works for you?",
      "Perfect — I've got your interest noted. Someone from our team will reach out to confirm your appointment.",
    ],
  },
  {
    label: "Restaurant",
    emoji: "🍽️",
    greeting: "Thanks for reaching out! Are you looking to make a reservation, or do you have a question about our menu?",
    responses: [
      "Happy to help with that. How many guests will be joining you, and what date were you thinking?",
      "We do have some availability! Do you have a preferred time, or are you flexible?",
      "Any special occasion or dietary needs I should note for your reservation?",
      "You're all set — I've flagged this for the host team. You'll get a confirmation shortly.",
    ],
  },
  {
    label: "Retail",
    emoji: "🛍️",
    greeting: "Hi there! Looking for something specific, or just browsing today?",
    responses: [
      "Good call — that's one of our most popular items. Do you have a size or color preference?",
      "Let me check on that for you. Do you need it today, or is a few days' wait okay?",
      "We can hold it under your name if you'd like — just need a name and a callback number.",
      "Done! We'll hold it for 24 hours and give you a call to confirm pickup or delivery.",
    ],
  },
];

// ── Static data ───────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: Users,      color: "#6366f1", bg: "rgba(99,102,241,0.12)", title: "Capture leads that go cold",            body: "Most callers don't leave voicemails. When an AI replies in seconds, they stay engaged — and you get the lead instead of the competitor who answers next." },
  { icon: Calendar,   color: "#10b981", bg: "rgba(16,185,129,0.12)", title: "Guide conversations toward booking",     body: "The AI asks the right qualifying questions for your business, collects the information you need, and moves toward scheduling." },
  { icon: RefreshCw,  color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  title: "Automate follow-up on every lead",      body: "Every conversation is logged. Unanswered leads can be followed up automatically so a busy day never means a lost opportunity." },
  { icon: ShieldCheck, color: "#06b6d4", bg: "rgba(6,182,212,0.12)", title: "Consistent and on-brand, 24/7",          body: "The AI represents your business the way you want — with your tone, your service list, your booking process. No off-script answers, no bad days." },
];

const HOW_IT_WORKS = [
  { step: "01", icon: MessageSquare, title: "Tell us about your business",       body: "We start with a conversation: how you work, what your customers typically ask, what a qualified lead looks like for you." },
  { step: "02", icon: Zap,           title: "We connect your calendar and tools", body: "We configure the AI, connect it to your scheduling or CRM, and test it against real scenarios before anything goes live." },
  { step: "03", icon: TrendingUp,    title: "Your AI receptionist goes live",    body: "We handle the rollout. Your team gets a review dashboard. You see every conversation and can step in at any point." },
];

const FAQS = [
  { q: "What exactly is an AI receptionist?",           a: "It's a text-based AI that responds to inbound messages on behalf of your business — answering common questions, qualifying leads, and moving toward a booking or next step. It's configured specifically for your business, not a generic chatbot." },
  { q: "Does it replace my staff?",                     a: "No. It handles the first-response layer — the part that currently goes unanswered or waits hours for a reply. Your team still handles the relationship, closes the sale, and delivers the service." },
  { q: "Can it handle phone calls?",                    a: "Currently, the AI receptionist is text-based — it responds via SMS and website chat. Voice capability is on our roadmap and we'll offer it to existing clients first when it's ready." },
  { q: "How long does setup take?",                     a: "For most businesses, we can have something live within one to two weeks from our first conversation. Setup is handled entirely by our team — you review and approve before anything goes live." },
  { q: "What happens after we launch?",                 a: "You get access to a conversation review dashboard, and we monitor the system during the first few weeks. We adjust the AI's responses based on real conversations — it gets more accurate over time." },
  { q: "Can it connect to tools I already use?",        a: "We support Google Calendar, email, SMS, and website chat out of the box. If you use a specific CRM or scheduling tool, ask us — we evaluate integrations on a case-by-case basis." },
];

// ── Contact form state ────────────────────────────────────────────────────────

interface FormState {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
}
const empty: FormState = { name: "", businessName: "", email: "", phone: "", businessType: "" };

// ── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};
const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.5 } },
};

// ── Animated counter ──────────────────────────────────────────────────────────

function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 60, damping: 20 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(Math.round(v)));
    return unsub;
  }, [spring]);

  return <span ref={ref}>{prefix}{display.toLocaleString()}{suffix}</span>;
}

// ── Hero phone mockup with animated conversation ──────────────────────────────

function HeroPhoneMockup({ industryIdx }: { industryIdx: number }) {
  const script = INDUSTRY_SCRIPTS[industryIdx];
  const [visibleMessages, setVisibleMessages] = useState<Array<{ from: "ai" | "user"; text: string }>>([]);
  const [phase, setPhase] = useState(0);

  const conversation = [
    { from: "ai" as const, text: script.greeting },
    { from: "user" as const, text: "Hi, I need some help with that." },
    { from: "ai" as const, text: script.responses[0] },
    { from: "user" as const, text: "Yes, please!" },
    { from: "ai" as const, text: script.responses[1] },
  ];

  useEffect(() => {
    setVisibleMessages([]);
    setPhase(0);
  }, [industryIdx]);

  useEffect(() => {
    if (phase >= conversation.length) return;
    const delay = phase === 0 ? 400 : 900;
    const timer = setTimeout(() => {
      setVisibleMessages((prev) => [...prev, conversation[phase]]);
      setPhase((p) => p + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, industryIdx]);

  return (
    <div style={{
      width: 280,
      background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
      borderRadius: 36,
      padding: "12px 6px",
      boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)",
      position: "relative",
    }}>
      {/* Notch */}
      <div style={{
        width: 100, height: 28, background: "#0d1117",
        borderRadius: "0 0 20px 20px", margin: "0 auto 8px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1a1a2e" }} />
        <div style={{ width: 50, height: 6, borderRadius: 3, background: "#1a1a2e" }} />
      </div>

      {/* Screen */}
      <div style={{
        background: "#f2f2f7",
        borderRadius: 26,
        overflow: "hidden",
        minHeight: 420,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* SMS Header */}
        <div style={{
          background: "linear-gradient(180deg, #f7f7f7 0%, #efefef 100%)",
          padding: "10px 14px",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>AI Receptionist</div>
            <div style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>● Online now</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={`${industryIdx}-${i}`}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: "flex", justifyContent: msg.from === "user" ? "flex-end" : "flex-start" }}
            >
              <div style={{
                maxWidth: "80%",
                background: msg.from === "user"
                  ? "linear-gradient(135deg, #062e71 0%, #1249a8 100%)"
                  : "#fff",
                color: msg.from === "user" ? "#fff" : "#1a1a1a",
                borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                padding: "8px 11px",
                fontSize: 11,
                lineHeight: 1.5,
                boxShadow: msg.from === "user"
                  ? "0 2px 8px rgba(6,46,113,0.35)"
                  : "0 1px 4px rgba(0,0,0,0.12)",
              }}>
                {msg.text}
              </div>
            </motion.div>
          ))}

          {phase < conversation.length && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                background: "#fff", borderRadius: "16px 16px 16px 4px",
                padding: "10px 14px", display: "flex", gap: 4, alignItems: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
              }}>
                {[0,1,2].map((i) => (
                  <motion.div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#9ca3af" }}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          background: "#f7f7f7", borderTop: "1px solid #e0e0e0",
          padding: "8px 10px", display: "flex", alignItems: "center", gap: 6,
        }}>
          <div style={{
            flex: 1, background: "#fff", borderRadius: 16, padding: "6px 12px",
            fontSize: 10, color: "#9ca3af", border: "1px solid #e5e7eb",
          }}>
            Text message
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Send style={{ width: 12, height: 12, color: "#fff" }} />
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div style={{
        width: 100, height: 4, background: "rgba(255,255,255,0.2)",
        borderRadius: 2, margin: "10px auto 0",
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingReceptionist() {
  // ── Contact form ──
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // ── Interactive demo ──
  const [activeIndustry, setActiveIndustry] = useState(0);
  const [demoMessages, setDemoMessages] = useState<Array<{ from: "user" | "ai"; text: string }>>([]);
  const [demoInput, setDemoInput] = useState("");
  const [demoStep, setDemoStep] = useState(0);
  const [demoTyping, setDemoTyping] = useState(false);
  const demoEndRef = useRef<HTMLDivElement>(null);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const demoRef = useRef<HTMLElement>(null);

  // ── Page-view tracking (preserve exactly) ──
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    fetch("/api/landing-test/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page:        "receptionist",
        utmSource:   qs.get("utm_source")   ?? null,
        utmMedium:   qs.get("utm_medium")   ?? null,
        utmCampaign: qs.get("utm_campaign") ?? null,
      }),
    }).catch(() => { /* tracking fire-and-forget */ });
  }, []);

  // ── Demo: reset conversation when industry changes ──
  useEffect(() => {
    const script = INDUSTRY_SCRIPTS[activeIndustry];
    setDemoMessages([{ from: "ai", text: script.greeting }]);
    setDemoStep(0);
    setDemoInput("");
    setDemoTyping(false);
  }, [activeIndustry]);

  // ── Demo: auto-scroll to latest message ──
  useEffect(() => {
    demoEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [demoMessages, demoTyping]);

  const sendDemoMessage = () => {
    if (!demoInput.trim() || demoTyping) return;
    const userMsg = demoInput.trim();
    setDemoInput("");
    setDemoMessages((prev) => [...prev, { from: "user", text: userMsg }]);
    setDemoTyping(true);

    const script = INDUSTRY_SCRIPTS[activeIndustry];
    const nextResponse = script.responses[demoStep % script.responses.length];

    setTimeout(() => {
      setDemoMessages((prev) => [...prev, { from: "ai", text: nextResponse }]);
      setDemoStep((s) => s + 1);
      setDemoTyping(false);
      setTimeout(() => demoInputRef.current?.focus(), 50);
    }, 800);
  };

  // ── Contact form set helper ──
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Contact form submit (preserve exactly) ──
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
          vertical:     "receptionist",
          name:         form.name,
          businessName: form.businessName,
          email:        form.email,
          phone:        form.phone,
          extra:        form.businessType,
          utmSource:    qs.get("utm_source")   ?? "direct",
          utmMedium:    qs.get("utm_medium")   ?? "direct",
          utmCampaign:  qs.get("utm_campaign") ?? null,
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

  const scrollToDemo    = () => demoRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToContact = () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9ff", overflowX: "hidden", fontFamily: "Plus Jakarta Sans, sans-serif" }}>

      <ReceptionistNav />
      <div style={{ height: 82 }} />

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO — full-viewport dark immersive section
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{
        background: "linear-gradient(135deg, #020c1f 0%, #041630 40%, #061e48 100%)",
        position: "relative",
        overflow: "hidden",
        padding: "72px 24px 80px",
      }}>
        {/* Grid dot pattern */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.18) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 100%)",
        }} />

        {/* Glow blobs */}
        <div style={{ position: "absolute", top: "-10%", left: "5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,46,113,0.45) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-5%", right: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>

            {/* ── Left copy ── */}
            <motion.div initial="hidden" animate="show" variants={stagger} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <motion.div variants={fadeUp}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                  color: "#a5b4fc", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", padding: "5px 12px", borderRadius: 100,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  AI Receptionist · SiteMint Digital
                </span>
              </motion.div>

              <motion.h1 variants={fadeUp} style={{
                fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
                fontFamily: "Playfair Display, serif",
                fontWeight: 700, lineHeight: 1.1,
                color: "#fff", margin: 0,
                letterSpacing: "-0.02em",
              }}>
                Stop losing jobs<br />
                to{" "}
                <span style={{
                  background: "linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #34d399 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>voicemail</span>.
              </motion.h1>

              <motion.p variants={fadeUp} style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, margin: 0, maxWidth: 460 }}>
                Your AI receptionist answers by text in seconds, asks the right qualifying questions,
                and keeps every lead warm — even when you're on a job.
              </motion.p>

              <motion.ul variants={fadeUp} style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Answers by text in seconds — no voicemail, no lost caller",
                  "Asks the right questions for your specific business",
                  "You review every conversation before anything is missed",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <CheckCircle2 style={{ width: 17, height: 17, color: "#34d399", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>{item}</span>
                  </li>
                ))}
              </motion.ul>

              <motion.div variants={fadeUp} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href="/ai-receptionist/signup">
                  <button style={{
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    boxShadow: "0 4px 24px rgba(99,102,241,0.5), 0 0 0 1px rgba(99,102,241,0.4)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                    letterSpacing: "-0.01em",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(99,102,241,0.65), 0 0 0 1px rgba(99,102,241,0.4)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(99,102,241,0.5), 0 0 0 1px rgba(99,102,241,0.4)"; }}
                  >
                    Get early access <ArrowRight style={{ width: 16, height: 16 }} />
                  </button>
                </Link>
                <button onClick={scrollToDemo} style={{
                  background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, fontWeight: 600,
                  padding: "14px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  backdropFilter: "blur(8px)", transition: "background 0.2s",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                >
                  <Play style={{ width: 15, height: 15 }} />
                  See it in action
                </button>
              </motion.div>

              {/* Social proof micro-strip */}
              <motion.div variants={fadeUp} style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
                <div style={{ display: "flex" }}>
                  {["🏠", "⚖️", "🔧", "💆", "🍽️"].map((emoji, i) => (
                    <div key={i} style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "rgba(255,255,255,0.12)", border: "2px solid rgba(255,255,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, marginLeft: i === 0 ? 0 : -6,
                    }}>{emoji}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                  Built for <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>6+ industries</span> · Setup in &lt;2 weeks
                </div>
              </motion.div>
            </motion.div>

            {/* ── Right: Phone mockup ── */}
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] } }}
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}
            >
              {/* Missed call card (left accent) */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0, transition: { delay: 0.9, duration: 0.5 } }}
                style={{
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 16, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 8, width: 160,
                  backdropFilter: "blur(12px)",
                  alignSelf: "flex-start", marginTop: 60,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <PhoneOff style={{ width: 13, height: 13, color: "#f87171" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: "0.04em", textTransform: "uppercase" }}>Without AI</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>Caller hangs up after 4 rings…</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Lead value: <span style={{ color: "#f87171", fontWeight: 700 }}>$0</span></div>
              </motion.div>

              <HeroPhoneMockup industryIdx={activeIndustry} />

              {/* Captured lead card (right accent) */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0, transition: { delay: 1.1, duration: 0.5 } }}
                style={{
                  background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                  borderRadius: 16, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 8, width: 160,
                  backdropFilter: "blur(12px)",
                  alignSelf: "flex-end", marginBottom: 60,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.04em", textTransform: "uppercase" }}>With AI</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>Lead captured, follow-up scheduled ✓</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Responded in <span style={{ color: "#34d399", fontWeight: 700 }}>&lt;12 sec</span></div>
              </motion.div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          STATS BAR — bold numbers on near-black
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#041230", padding: "48px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32 }}>
          {[
            { num: 70, suffix: "%+", label: "of inbound calls go unanswered", sub: "BrightLocal / Google SMB research", icon: Phone, color: "#f87171" },
            { num: 15, prefix: "<", suffix: " sec", label: "average AI response time via SMS", sub: "Industry benchmark", icon: Zap, color: "#fbbf24" },
            { num: 1200, prefix: "$", suffix: "+", label: "typical value of one qualified lead", sub: "Varies by industry", icon: DollarSign, color: "#34d399" },
          ].map(({ num, prefix, suffix, label, sub, icon: Icon, color }) => (
            <motion.div key={label} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
              style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <Icon style={{ width: 18, height: 18, color }} />
              </div>
              <div style={{ fontSize: "clamp(2rem,4vw,2.8rem)", fontWeight: 900, fontFamily: "Playfair Display, serif", color: "#fff", lineHeight: 1 }}>
                {prefix}<AnimatedCounter value={num} />{suffix}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          INDUSTRY DEMO — interactive chat
      ═══════════════════════════════════════════════════════════════════════ */}
      <section ref={demoRef as React.RefObject<HTMLElement>} id="demo" style={{ padding: "96px 24px", background: "#f8f9ff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            style={{ textAlign: "center", marginBottom: 48, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <motion.span variants={fadeUp} style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#6366f1", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100,
            }}>Interactive Demo</motion.span>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              Try it yourself — pick your industry
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 15, color: "#64748b", maxWidth: 520, lineHeight: 1.6, margin: 0 }}>
              Type a message and see how the AI responds. Each industry has its own conversation flow —
              questions and tone configured specifically for your business.
            </motion.p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>

            {/* Left: industry pills + demo chat */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {INDUSTRY_SCRIPTS.map((ind, i) => (
                  <button key={ind.label} onClick={() => setActiveIndustry(i)} style={{
                    padding: "8px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                    background: i === activeIndustry
                      ? "linear-gradient(135deg, #062e71 0%, #1249a8 100%)"
                      : "#fff",
                    color: i === activeIndustry ? "#fff" : "#475569",
                    border: i === activeIndustry ? "1px solid transparent" : "1px solid #e2e8f0",
                    boxShadow: i === activeIndustry
                      ? "0 4px 16px rgba(6,46,113,0.3)"
                      : "0 1px 3px rgba(0,0,0,0.06)",
                  }}>
                    {ind.emoji} {ind.label}
                  </button>
                ))}
              </div>

              {/* Chat card */}
              <div style={{
                background: "#fff", borderRadius: 20,
                boxShadow: "0 4px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{
                  background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
                  padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {INDUSTRY_SCRIPTS[activeIndustry].emoji} AI Receptionist — {INDUSTRY_SCRIPTS[activeIndustry].label}
                  </span>
                </div>

                {/* Messages */}
                <div style={{ height: 280, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {demoMessages.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
                      style={{ display: "flex", justifyContent: msg.from === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "80%", borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        padding: "10px 14px", fontSize: 13, lineHeight: 1.55,
                        background: msg.from === "user"
                          ? "linear-gradient(135deg, #062e71 0%, #1249a8 100%)"
                          : "#f1f5f9",
                        color: msg.from === "user" ? "#fff" : "#1e293b",
                        boxShadow: msg.from === "user" ? "0 2px 8px rgba(6,46,113,0.25)" : "none",
                      }}>{msg.text}</div>
                    </motion.div>
                  ))}
                  {demoTyping && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ background: "#f1f5f9", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", display: "flex", gap: 4, alignItems: "center" }}>
                        {[0,1,2].map((i) => (
                          <motion.div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8" }}
                            animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                  <div ref={demoEndRef} />
                </div>

                {/* Input row */}
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 14px", display: "flex", gap: 10, background: "#fff" }}>
                  <input ref={demoInputRef} type="text" value={demoInput}
                    onChange={(e) => setDemoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendDemoMessage(); }}
                    placeholder="Type a message…" disabled={demoTyping}
                    style={{
                      flex: 1, fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 12, padding: "10px 14px", outline: "none", color: "#1e293b",
                    }}
                  />
                  <button onClick={sendDemoMessage} disabled={demoTyping || !demoInput.trim()}
                    style={{
                      background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
                      color: "#fff", border: "none", borderRadius: 12, padding: "10px 14px",
                      cursor: demoInput.trim() ? "pointer" : "not-allowed", opacity: demoInput.trim() ? 1 : 0.4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                    <Send style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
              <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", margin: 0 }}>
                Client-side demo — actual conversations are configured for your specific business
              </p>
            </div>

            {/* Right: real conversation showcase */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{
                background: "linear-gradient(135deg, #020c1f 0%, #061e48 100%)",
                borderRadius: 20, padding: 24,
                boxShadow: "0 20px 60px rgba(2,12,31,0.25)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>
                  Real conversation — HVAC emergency
                </div>
                {[
                  { from: "visitor", text: "Hi, I saw your ad. Do you do emergency HVAC calls?" },
                  { from: "ai",      text: "Yes, we do! Is your system not heating or cooling right now?" },
                  { from: "visitor", text: "No heat. It's 48° in here." },
                  { from: "ai",      text: "Got it — that's urgent. Are you available in the next 2 hours, or should we schedule for first thing tomorrow morning?" },
                  { from: "visitor", text: "Now please, yes." },
                  { from: "ai",      text: "Perfect. I've flagged this as urgent. Can I get your address so we can dispatch someone?" },
                ].map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: msg.from === "visitor" ? 12 : -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    style={{ display: "flex", justifyContent: msg.from === "visitor" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{
                      maxWidth: "78%", borderRadius: msg.from === "visitor" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      padding: "9px 13px", fontSize: 12, lineHeight: 1.55,
                      background: msg.from === "visitor" ? "rgba(255,255,255,0.12)" : "rgba(99,102,241,0.2)",
                      color: msg.from === "visitor" ? "rgba(255,255,255,0.85)" : "#c7d2fe",
                      border: msg.from === "visitor" ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(99,102,241,0.3)",
                    }}>{msg.text}</div>
                  </motion.div>
                ))}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 style={{ width: 14, height: 14, color: "#34d399" }} />
                    <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>Lead captured. Would've gone to voicemail.</span>
                  </div>
                </div>
              </div>

              {/* Metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { icon: Clock, color: "#fbbf24", label: "Response time", value: "< 12 sec" },
                  { icon: TrendingUp, color: "#34d399", label: "Lead outcome", value: "Booked" },
                  { icon: Phone, color: "#60a5fa", label: "Missed calls rescued", value: "100%" },
                  { icon: Star, color: "#a78bfa", label: "Available", value: "24 / 7" },
                ].map(({ icon: Icon, color, label, value }) => (
                  <div key={label} style={{
                    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                    padding: "16px", display: "flex", flexDirection: "column", gap: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon style={{ width: 13, height: 13, color }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#0f1729", letterSpacing: "-0.02em" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          BENEFITS — colored icon cards
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            style={{ textAlign: "center", marginBottom: 56, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <motion.span variants={fadeUp} style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100,
            }}>Features</motion.span>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              Built to handle what you can't
            </motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {BENEFITS.map((b) => (
              <motion.div key={b.title} variants={fadeUp}
                style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
                  padding: "28px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  transition: "box-shadow 0.2s, transform 0.2s", cursor: "default",
                }}
                whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.1)" }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 14, background: b.bg,
                  border: `1px solid ${b.color}25`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                }}>
                  <b.icon style={{ width: 20, height: 20, color: b.color }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f1729", margin: "0 0 10px", lineHeight: 1.3 }}>{b.title}</h3>
                <p style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.65, margin: 0 }}>{b.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          HOW IT WORKS — numbered steps with connectors
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" style={{ padding: "96px 24px", background: "linear-gradient(180deg, #f8f9ff 0%, #eef0ff 100%)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            style={{ textAlign: "center", marginBottom: 56, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <motion.span variants={fadeUp} style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100,
            }}>Process</motion.span>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              Live in under two weeks
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 15, color: "#64748b", maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
              We handle the full setup — no technical work on your end.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, position: "relative" }}>
            {/* Connector line */}
            <div style={{
              position: "absolute", top: 44, left: "calc(16.5% + 22px)", right: "calc(16.5% + 22px)",
              height: 2, background: "linear-gradient(90deg, #6366f1 0%, #a78bfa 100%)",
              zIndex: 0,
            }} />
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div key={step.step} variants={fadeUp}
                style={{ textAlign: "center", padding: "0 24px", position: "relative", zIndex: 1 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: i === 1 ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" : "#fff",
                  border: `2px solid ${i === 1 ? "transparent" : "#e2e8f0"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
                  boxShadow: i === 1 ? "0 8px 24px rgba(99,102,241,0.4)" : "0 4px 12px rgba(0,0,0,0.08)",
                }}>
                  <step.icon style={{ width: 22, height: 22, color: i === 1 ? "#fff" : "#6366f1" }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: "0.06em", marginBottom: 8 }}>STEP {step.step}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f1729", margin: "0 0 10px", lineHeight: 1.3 }}>{step.title}</h3>
                <p style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.65, margin: 0 }}>{step.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100, marginBottom: 16,
            }}>Testimonials</span>
            <h2 style={{ fontSize: "clamp(1.8rem,3.5vw,2.4rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              What clients are saying
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {[
              { quote: "We used to miss 3–4 calls a day when we were on jobs. Those were jobs we never knew we lost. Now every inquiry gets an immediate response.", role: "Home Services Business Owner", stars: 5 },
              { quote: "The first week it was live, it captured two leads that came in after 9pm. Both became paying clients. Setup was fast — we were live in under two weeks.", role: "Med Spa Manager", stars: 5 },
            ].map((t, i) => (
              <motion.div key={i} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
                style={{
                  background: "linear-gradient(135deg, #020c1f 0%, #061e48 100%)",
                  borderRadius: 20, padding: "28px",
                  boxShadow: "0 16px 48px rgba(2,12,31,0.2)",
                  position: "relative", overflow: "hidden",
                }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: "radial-gradient(circle at top right, rgba(99,102,241,0.2) 0%, transparent 70%)" }} />
                <div style={{ position: "absolute", top: 8, right: 10, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Example</div>
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} style={{ width: 14, height: 14, color: "#fbbf24", fill: "#fbbf24" }} />
                  ))}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: "0 0 20px", fontStyle: "italic" }}>"{t.quote}"</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", margin: 0 }}>— {t.role}</p>
              </motion.div>
            ))}
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 24 }}>
            Placeholder quotes — real client testimonials will appear here as pilots are completed.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          INTEGRATIONS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ padding: "56px 24px", background: "#f8f9ff", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366f1", marginBottom: 8 }}>Integrations</p>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>Connects with the tools your business already runs on.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            {[
              { icon: Calendar, label: "Google Calendar", color: "#4285f4" },
              { icon: Mail,     label: "Email",           color: "#ea4335" },
              { icon: MessageSquare, label: "SMS",        color: "#10b981" },
              { icon: Globe,    label: "Website Chat",    color: "#6366f1" },
            ].map(({ icon: Icon, label, color }) => (
              <motion.div key={label} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
                  padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "#1e293b",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "default",
                  transition: "box-shadow 0.2s",
                }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon style={{ width: 16, height: 16, color }} />
                </div>
                {label}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          PRICING — premium cards
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="pricing" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            style={{ textAlign: "center", marginBottom: 56, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <motion.span variants={fadeUp} style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100,
            }}>Pricing</motion.span>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              Simple, honest pricing
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 15, color: "#64748b", maxWidth: 400, lineHeight: 1.6, margin: 0 }}>
              No per-message fees, no surprise costs. One setup, one monthly rate.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 720, margin: "0 auto" }}>

            {/* Setup */}
            <motion.div variants={fadeUp} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 24, padding: "36px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", margin: "0 0 20px" }}>One-Time Setup</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 44, fontWeight: 900, color: "#0f1729", fontFamily: "Playfair Display, serif", lineHeight: 1 }}>$500</span>
                <span style={{ fontSize: 16, color: "#94a3b8", marginBottom: 6 }}>– $1,500</span>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 24px" }}>Depends on scope and integrations</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {["Custom AI configuration for your business", "Calendar and tool integrations", "Full testing before launch", "Onboarding and review dashboard access"].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <CheckCircle2 style={{ width: 15, height: 15, color: "#10b981", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.4 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Monthly — hero card */}
            <motion.div variants={fadeUp} style={{
              background: "linear-gradient(135deg, #020c1f 0%, #062e71 100%)",
              borderRadius: 24, padding: "36px",
              boxShadow: "0 20px 60px rgba(6,46,113,0.35), 0 0 0 1px rgba(99,102,241,0.25)",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)" }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", margin: 0 }}>Monthly Plan</p>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(52,211,153,0.2)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", padding: "2px 8px", borderRadius: 100 }}>MOST POPULAR</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, color: "#fff", fontFamily: "Playfair Display, serif", lineHeight: 1 }}>$99</span>
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>– $299/mo</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 24px" }}>Based on conversation volume</p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {["AI receptionist active 24/7", "Conversation review dashboard", "Ongoing tuning as your business evolves", "Email and SMS support"].map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <CheckCircle2 style={{ width: 15, height: 15, color: "#34d399", flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/ai-receptionist/signup">
                  <button style={{
                    width: "100%", background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#fff", fontSize: 14, fontWeight: 700, border: "none",
                    borderRadius: 12, padding: "14px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
                  >
                    Get early access <ArrowRight style={{ width: 15, height: 15 }} />
                  </button>
                </Link>
              </div>
            </motion.div>

          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="faq" style={{ padding: "96px 24px", background: "linear-gradient(180deg, #f8f9ff 0%, #eef0ff 100%)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100, marginBottom: 16,
            }}>FAQ</span>
            <h2 style={{ fontSize: "clamp(1.8rem,3.5vw,2.4rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: 0, color: "#0f1729", letterSpacing: "-0.02em" }}>
              Common questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}
                className="bg-white border border-slate-200 rounded-2xl px-6 py-1 shadow-sm">
                <AccordionTrigger className="text-sm font-semibold text-left hover:no-underline py-5 text-slate-800">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-500 leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FINAL CTA — dark with glow
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{
        background: "linear-gradient(135deg, #020c1f 0%, #041630 50%, #061e48 100%)",
        padding: "96px 24px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.15) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 65%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
            <motion.div variants={fadeUp} style={{
              width: 64, height: 64, borderRadius: 20,
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 32px rgba(99,102,241,0.5)",
            }}>
              <Phone style={{ width: 28, height: 28, color: "#fff" }} />
            </motion.div>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(2rem,4vw,3rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Ready to stop<br />missing calls?
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", maxWidth: 440, lineHeight: 1.65, margin: 0 }}>
              Tell us about your business and we'll show you exactly how an AI receptionist would work for your industry.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/ai-receptionist/signup">
                <button style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                  padding: "16px 32px", borderRadius: 14, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 4px 24px rgba(99,102,241,0.55)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 36px rgba(99,102,241,0.7)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(99,102,241,0.55)"; }}
                >
                  Get early access <ArrowRight style={{ width: 16, height: 16 }} />
                </button>
              </Link>
              <button onClick={scrollToContact} style={{
                background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, fontWeight: 600,
                padding: "16px 28px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.16)",
                cursor: "pointer", backdropFilter: "blur(8px)", transition: "background 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
              >
                Talk to us directly
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          CONTACT FORM
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="contact" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#6366f1",
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              padding: "4px 12px", borderRadius: 100, marginBottom: 16,
            }}>Get in touch</span>
            <h2 style={{ fontSize: "clamp(1.8rem,3.5vw,2.4rem)", fontFamily: "Playfair Display, serif", fontWeight: 700, margin: "0 0 10px", color: "#0f1729", letterSpacing: "-0.02em" }}>
              Let's talk about your business
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>We'll reach out within one business day.</p>
          </div>

          {success ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                border: "1px solid #bbf7d0", borderRadius: 20, padding: "48px 32px", textAlign: "center",
              }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 style={{ width: 28, height: 28, color: "#059669" }} />
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#065f46", margin: 0 }}>We'll be in touch shortly!</p>
              <p style={{ fontSize: 14, color: "#047857", margin: 0, lineHeight: 1.6 }}>Thanks for reaching out. A member of our team will contact you within one business day.</p>
            </motion.div>
          ) : (
            <form onSubmit={submit} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 24, padding: "40px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.07)",
              display: "flex", flexDirection: "column", gap: 18,
            }}>
              <div>
                <Label htmlFor="name" className="text-sm font-semibold text-slate-700">Full Name *</Label>
                <Input id="name" value={form.name} onChange={set("name")} placeholder="Chris Rivera" className="mt-1.5" required />
              </div>
              <div>
                <Label htmlFor="businessName" className="text-sm font-semibold text-slate-700">Business Name</Label>
                <Input id="businessName" value={form.businessName} onChange={set("businessName")} placeholder="Rivera Plumbing & Heating" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="chris@riveraplumbing.com" className="mt-1.5" required />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="businessType" className="text-sm font-semibold text-slate-700">Industry</Label>
                <Select value={form.businessType} onValueChange={(v) => setForm((f) => ({ ...f, businessType: v }))}>
                  <SelectTrigger id="businessType" className="mt-1.5 w-full"><SelectValue placeholder="Select your industry…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real Estate">Real Estate</SelectItem>
                    <SelectItem value="Law Firm">Law Firm</SelectItem>
                    <SelectItem value="Home Services">Home Services (HVAC, Plumbing, Electrical…)</SelectItem>
                    <SelectItem value="Med Spa">Med Spa / Aesthetics</SelectItem>
                    <SelectItem value="Restaurant">Restaurant</SelectItem>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
                  <AlertCircle style={{ width: 15, height: 15, color: "#dc2626", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>
                </div>
              )}
              <button type="submit" disabled={submitting}
                style={{
                  background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
                  color: "#fff", fontSize: 15, fontWeight: 700, border: "none",
                  borderRadius: 12, padding: "15px", cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(6,46,113,0.35)", opacity: submitting ? 0.7 : 1,
                  transition: "transform 0.15s",
                }}
                onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                {submitting ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : null}
                Send my details
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", margin: 0 }}>No spam. No sales pressure. Just a conversation about your business.</p>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
