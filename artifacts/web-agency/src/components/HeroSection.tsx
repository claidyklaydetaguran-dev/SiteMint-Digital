import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Layout, Monitor, BarChart2, Star } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────
const WORDS = ["Customers", "Clients", "Businesses", "Partners", "Results", "Revenue"];

const FEATURE_CARDS = [
  {
    id: "ai",
    Icon: Zap,
    bg: "linear-gradient(135deg,#1d4ed8,#2563eb)",
    title: "AI Automation",
    desc: "Workflows that save time and increase revenue",
  },
  {
    id: "crm",
    Icon: Layout,
    bg: "linear-gradient(135deg,#0ea5e9,#2563eb)",
    title: "CRM Systems",
    desc: "Manage leads, clients & communications",
  },
  {
    id: "web",
    Icon: Monitor,
    bg: "linear-gradient(135deg,#0891b2,#1d4ed8)",
    title: "Custom Websites",
    desc: "Beautiful, fast & optimized for conversions",
  },
  {
    id: "analytics",
    Icon: BarChart2,
    bg: "linear-gradient(135deg,#4f46e5,#2563eb)",
    title: "Analytics & Growth",
    desc: "Track performance and scale with confidence",
  },
];

const PARTICLES = [
  { id: 1, x: 54, y: 9, r: 2.2, dur: 4.2, del: 0 },
  { id: 2, x: 63, y: 17, r: 1.6, dur: 5.1, del: 1.0 },
  { id: 3, x: 73, y: 7, r: 2.8, dur: 3.6, del: 0.5 },
  { id: 4, x: 84, y: 21, r: 1.4, dur: 4.7, del: 2.1 },
  { id: 5, x: 91, y: 38, r: 2.1, dur: 6.0, del: 1.5 },
  { id: 6, x: 79, y: 54, r: 1.1, dur: 3.2, del: 0.3 },
  { id: 7, x: 96, y: 64, r: 1.7, dur: 5.3, del: 3.0 },
  { id: 8, x: 67, y: 71, r: 2.0, dur: 4.1, del: 0.8 },
  { id: 9, x: 57, y: 81, r: 1.2, dur: 5.8, del: 2.5 },
  { id: 10, x: 47, y: 14, r: 1.5, dur: 4.4, del: 1.2 },
  { id: 11, x: 93, y: 86, r: 2.1, dur: 5.0, del: 0.4 },
  { id: 12, x: 76, y: 91, r: 1.4, dur: 4.6, del: 1.8 },
  { id: 13, x: 83, y: 31, r: 1.0, dur: 3.7, del: 2.2 },
  { id: 14, x: 65, y: 44, r: 2.4, dur: 5.6, del: 0.7 },
  { id: 15, x: 51, y: 59, r: 1.1, dur: 4.0, del: 1.6 },
  { id: 16, x: 98, y: 11, r: 1.9, dur: 6.2, del: 0.1 },
  { id: 17, x: 87, y: 77, r: 1.5, dur: 3.4, del: 2.9 },
  { id: 18, x: 43, y: 89, r: 2.0, dur: 5.2, del: 1.1 },
  { id: 19, x: 59, y: 96, r: 1.2, dur: 4.3, del: 0.6 },
  { id: 20, x: 71, y: 27, r: 1.6, dur: 6.1, del: 1.9 },
  { id: 21, x: 88, y: 48, r: 1.3, dur: 4.8, del: 3.2 },
  { id: 22, x: 60, y: 33, r: 2.3, dur: 5.5, del: 0.9 },
  { id: 23, x: 78, y: 62, r: 1.0, dur: 3.9, del: 2.4 },
  { id: 24, x: 49, y: 42, r: 1.7, dur: 4.9, del: 1.3 },
];

const CONNECTIONS = [
  [1, 3], [3, 4], [4, 5], [5, 7], [2, 3], [6, 8], [8, 11], [10, 2],
  [13, 14], [14, 6], [17, 12], [18, 19], [20, 13], [21, 5], [22, 20],
];

const LOGOS = [
  { name: "real", label: "rea|" },
  { name: "exp", label: "eXp" },
  { name: "kw", label: "kw" },
  { name: "compass", label: "COMPASS" },
  { name: "redfin", label: "REDFIN" },
  { name: "zillow", label: "zillow" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function WordCycler() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="relative inline-block">
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[idx]}
          initial={{ y: 28, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -28, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="inline-block"
          style={{ color: "#2563EB" }}
        >
          {WORDS[idx]}
        </motion.span>
      </AnimatePresence>
      <motion.span
        className="inline-block w-[3px] rounded-sm ml-1"
        style={{
          height: "0.9em",
          background: "#2563EB",
          verticalAlign: "middle",
          marginBottom: "0.08em",
        }}
        animate={{ opacity: [1, 1, 0, 0, 1, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear", times: [0, 0.45, 0.5, 0.95, 1, 1] }}
      />
    </span>
  );
}

function ParticleField() {
  const pMap = Object.fromEntries(PARTICLES.map(p => [p.id, p]));
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ opacity: 0.45 }}
    >
      <defs>
        <radialGradient id="pg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </radialGradient>
      </defs>
      {CONNECTIONS.map(([a, b], i) => {
        const pa = pMap[a]; const pb = pMap[b];
        if (!pa || !pb) return null;
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="#93C5FD" strokeWidth="0.15" strokeOpacity="0.6"
          />
        );
      })}
      {PARTICLES.map(p => (
        <circle key={p.id} cx={p.x} cy={p.y} r={p.r} fill="#3B82F6">
          <animate
            attributeName="opacity"
            values="0.2;0.9;0.2"
            dur={`${p.dur}s`}
            begin={`${p.del}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values={`${p.r * 0.7};${p.r};${p.r * 0.7}`}
            dur={`${p.dur}s`}
            begin={`${p.del}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}

function WaveBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1440 600"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: 1 }}
    >
      <defs>
        <linearGradient id="wg1" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.18" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="wg2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.04" />
        </linearGradient>
        <filter id="blur1">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      {/* Main sweeping wave arc */}
      <path
        d="M -100 520 Q 300 200 700 180 Q 1000 165 1200 80 Q 1320 30 1540 -20"
        stroke="url(#wg1)"
        strokeWidth="220"
        fill="none"
        strokeLinecap="round"
        filter="url(#blur1)"
      />
      {/* Secondary wave */}
      <path
        d="M -100 580 Q 400 320 750 300 Q 1050 285 1250 200 Q 1380 155 1540 110"
        stroke="url(#wg2)"
        strokeWidth="120"
        fill="none"
        strokeLinecap="round"
        filter="url(#blur1)"
      />
      {/* Subtle scatter blobs */}
      <ellipse cx="900" cy="120" rx="280" ry="80" fill="#bfdbfe" opacity="0.18" filter="url(#blur1)" />
      <ellipse cx="1100" cy="300" rx="180" ry="60" fill="#93c5fd" opacity="0.12" filter="url(#blur1)" />
      <ellipse cx="600" cy="480" rx="200" ry="50" fill="#dbeafe" opacity="0.15" filter="url(#blur1)" />
    </svg>
  );
}

// ── Laptop Mockup ─────────────────────────────────────────────────────────────

function LaptopMockup() {
  return (
    <div
      className="relative select-none"
      style={{
        width: 480,
        filter: "drop-shadow(0 32px 48px rgba(15,23,42,0.28)) drop-shadow(0 8px 16px rgba(37,99,235,0.15))",
      }}
    >
      {/* Screen lid */}
      <div
        style={{
          background: "#1E293B",
          borderRadius: "14px 14px 0 0",
          padding: "10px 10px 0",
          position: "relative",
        }}
      >
        {/* Camera dot */}
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#374151", margin: "0 auto 6px" }} />
        {/* Screen bezel */}
        <div style={{ background: "#0D1B3E", borderRadius: 8, overflow: "hidden", aspectRatio: "16/10", position: "relative" }}>
          {/* Screen content */}
          <LaptopScreen />
        </div>
      </div>
      {/* Keyboard base */}
      <div style={{
        background: "linear-gradient(180deg, #CBD5E1 0%, #94A3B8 100%)",
        borderRadius: "0 0 12px 12px",
        height: 20,
        position: "relative",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}>
        {/* Touchpad */}
        <div style={{
          width: 80, height: 12, background: "#B0BBC8",
          borderRadius: 4, margin: "4px auto 0",
          border: "1px solid #94A3B8",
        }} />
      </div>
      {/* Base shadow edge */}
      <div style={{
        height: 3,
        background: "linear-gradient(180deg, #64748B 0%, transparent 100%)",
        borderRadius: "0 0 4px 4px",
        marginTop: 1,
        opacity: 0.4,
      }} />
    </div>
  );
}

function LaptopScreen() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#0D1B3E", fontFamily: "sans-serif", position: "relative" }}>
      {/* Nav */}
      <div style={{ background: "#0F172A", padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#60A5FA", fontSize: 7, fontWeight: 700, letterSpacing: 0.5 }}>◆ SiteMint Digital</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["Home", "Services", "About", "Contact"].map(l => (
            <span key={l} style={{ color: "#94A3B8", fontSize: 5 }}>{l}</span>
          ))}
          <span style={{ background: "#2563EB", color: "#fff", fontSize: 5, padding: "2px 6px", borderRadius: 3 }}>Get Started</span>
        </div>
      </div>
      {/* Hero area */}
      <div style={{ padding: "12px 14px 8px", background: "linear-gradient(135deg,#0D1B3E 0%,#1E3A5F 100%)" }}>
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: 1.3, maxWidth: 180, marginBottom: 5 }}>
          Elevate Your Business<br />With Smart Digital Solutions.
        </p>
        <p style={{ color: "#93C5FD", fontSize: 6, marginBottom: 7 }}>Websites, CRM, Automation & More</p>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ background: "#2563EB", color: "#fff", fontSize: 6, padding: "3px 8px", borderRadius: 3, fontWeight: 600 }}>Get Started</span>
          <span style={{ border: "1px solid #3B82F6", color: "#93C5FD", fontSize: 6, padding: "3px 8px", borderRadius: 3 }}>Learn More</span>
        </div>
      </div>
      {/* Stats row */}
      <div style={{ display: "flex", borderTop: "1px solid #1E3A5F", background: "#0F172A" }}>
        {[
          { label: "Total Leads", val: "1,248" },
          { label: "Appointments", val: "92" },
          { label: "New Customers", val: "64" },
          { label: "Revenue", val: "$28,540" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "6px 4px", borderRight: i < 3 ? "1px solid #1E3A5F" : "none", textAlign: "center" }}>
            <div style={{ color: "#F1F5F9", fontSize: 8, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: "#64748B", fontSize: 5 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Mini chart */}
      <div style={{ padding: "6px 10px", background: "#0D1B3E" }}>
        <svg width="100%" height="36" viewBox="0 0 400 36" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,30 L45,24 L90,26 L135,16 L180,18 L225,10 L270,12 L315,6 L360,8 L400,4 L400,36 L0,36 Z" fill="url(#cg)" />
          <path d="M0,30 L45,24 L90,26 L135,16 L180,18 L225,10 L270,12 L315,6 L360,8 L400,4" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
          {[{x:45,y:24},{x:135,y:16},{x:225,y:10},{x:315,y:6}].map((p,i)=>(
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#60A5FA" />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Phone Mockup ──────────────────────────────────────────────────────────────

function PhoneMockup() {
  return (
    <div
      style={{
        width: 108,
        background: "#111827",
        borderRadius: 18,
        padding: "8px 5px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(37,99,235,0.2)",
        position: "relative",
      }}
    >
      {/* Notch */}
      <div style={{ width: 32, height: 6, background: "#1F2937", borderRadius: 4, margin: "0 auto 4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 8, height: 3, background: "#374151", borderRadius: 2 }} />
      </div>
      {/* Screen */}
      <div style={{ background: "#0D1B3E", borderRadius: 12, overflow: "hidden", minHeight: 180 }}>
        <PhoneScreen />
      </div>
    </div>
  );
}

function PhoneScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "8px 7px" }}>
      <p style={{ color: "#fff", fontSize: 7.5, fontWeight: 700, marginBottom: 2 }}>Dashboard</p>
      <p style={{ color: "#64748B", fontSize: 5.5, marginBottom: 8 }}>Overview</p>
      <div style={{ background: "#1E3A5F", borderRadius: 8, padding: "8px 8px", marginBottom: 6 }}>
        <p style={{ color: "#93C5FD", fontSize: 5.5, marginBottom: 2 }}>Revenue</p>
        <p style={{ color: "#F1F5F9", fontSize: 10, fontWeight: 800, marginBottom: 2 }}>$28,540</p>
        <p style={{ color: "#34D399", fontSize: 5, display: "flex", alignItems: "center", gap: 2 }}>↑ 2.3% this month</p>
      </div>
      {[
        { label: "Leads", val: "1,248", color: "#60A5FA" },
        { label: "Appointments", val: "92", color: "#818CF8" },
      ].map((item, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 4px", borderBottom: "1px solid #1E3A5F" }}>
          <span style={{ color: "#94A3B8", fontSize: 6 }}>{item.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#F1F5F9", fontSize: 7, fontWeight: 700 }}>{item.val}</span>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
          </div>
        </div>
      ))}
      {/* Mini bar chart */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
        {[55,70,40,85,60,90,75,65,80,95].map((h, i) => (
          <div key={i} style={{ flex: 1, background: i === 9 ? "#3B82F6" : "#1E3A5F", height: `${h}%`, borderRadius: "2px 2px 0 0" }} />
        ))}
      </div>
    </div>
  );
}

// ── Tablet Mockup ─────────────────────────────────────────────────────────────

function TabletMockup() {
  return (
    <div
      style={{
        width: 140,
        background: "#1E293B",
        borderRadius: 14,
        padding: "8px 6px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(37,99,235,0.15)",
      }}
    >
      {/* Camera */}
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#374151", margin: "0 auto 4px" }} />
      <div style={{ background: "#0D1B3E", borderRadius: 10, overflow: "hidden", minHeight: 170 }}>
        <TabletScreen />
      </div>
    </div>
  );
}

function TabletScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "10px 10px" }}>
      <p style={{ color: "#F1F5F9", fontSize: 10, fontWeight: 800, lineHeight: 1.3, marginBottom: 6 }}>
        Automate.<br />Engage.<br />Grow.
      </p>
      <p style={{ color: "#93C5FD", fontSize: 5.5, marginBottom: 7, lineHeight: 1.6 }}>
        Powerful automation configured that save time and win more customers.
      </p>
      <div style={{ background: "#2563EB", color: "#fff", fontSize: 6, padding: "4px 10px", borderRadius: 4, display: "inline-block", marginBottom: 10, fontWeight: 600 }}>
        Explore Automation
      </div>
      <p style={{ color: "#64748B", fontSize: 5.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Workflow Overview</p>
      {[
        { label: "New Lead", color: "#34D399" },
        { label: "Send Email", color: "#60A5FA" },
        { label: "Follow Up", color: "#818CF8" },
        { label: "Book Appointment", color: "#F59E0B" },
      ].map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: step.color, flexShrink: 0 }} />
          <span style={{ color: "#CBD5E1", fontSize: 6 }}>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Plant Decoration ──────────────────────────────────────────────────────────

function PlantDecoration() {
  return (
    <div style={{ position: "absolute", right: 0, top: 0, zIndex: 2, pointerEvents: "none", opacity: 0.92 }}>
      <svg width="120" height="180" viewBox="0 0 120 180" fill="none">
        {/* Pot */}
        <rect x="38" y="148" width="44" height="32" rx="4" fill="#E5E7EB" />
        <rect x="34" y="144" width="52" height="8" rx="4" fill="#D1D5DB" />
        {/* Soil */}
        <ellipse cx="60" cy="152" rx="22" ry="5" fill="#6B7280" opacity="0.3" />
        {/* Stem */}
        <path d="M60 148 L60 90" stroke="#4B7C2E" strokeWidth="3" strokeLinecap="round" />
        {/* Large left leaf */}
        <path d="M60 120 Q30 90 18 60 Q35 70 60 105 Z" fill="#22C55E" opacity="0.9" />
        <path d="M60 120 Q30 90 18 60" stroke="#15803D" strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* Large right leaf */}
        <path d="M60 105 Q90 78 106 45 Q88 62 60 92 Z" fill="#16A34A" opacity="0.9" />
        <path d="M60 105 Q90 78 106 45" stroke="#15803D" strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* Upper left leaf */}
        <path d="M60 92 Q38 68 22 40 Q42 55 60 80 Z" fill="#4ADE80" opacity="0.85" />
        <path d="M60 92 Q38 68 22 40" stroke="#15803D" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        {/* Upper right leaf */}
        <path d="M60 80 Q88 58 102 28 Q82 48 60 70 Z" fill="#22C55E" opacity="0.85" />
        <path d="M60 80 Q88 58 102 28" stroke="#15803D" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        {/* Top leaf */}
        <path d="M60 70 Q52 44 58 22 Q65 44 62 66 Z" fill="#4ADE80" opacity="0.8" />
        {/* Light overlay on leaves */}
        <path d="M60 120 Q45 100 38 75" stroke="#86EFAC" strokeWidth="0.6" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M60 105 Q75 88 82 65" stroke="#86EFAC" strokeWidth="0.6" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  );
}

// ── Feature Card ──────────────────────────────────────────────────────────────

function FeatureCard({ card, delay }: { card: typeof FEATURE_CARDS[0]; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -3, scale: 1.02 }}
      style={{
        background: "rgba(255,255,255,0.93)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: 13,
        padding: "9px 12px",
        boxShadow: "0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(37,99,235,0.08)",
        border: "1px solid rgba(255,255,255,0.9)",
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        width: 176,
        cursor: "default",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: card.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
        }}
      >
        <card.Icon size={16} color="#fff" />
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 2, lineHeight: 1.2 }}>{card.title}</p>
        <p style={{ fontSize: 10.5, color: "#64748B", lineHeight: 1.4 }}>{card.desc}</p>
      </div>
    </motion.div>
  );
}

// ── Trust Logos ───────────────────────────────────────────────────────────────

function TrustLogosBar() {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.80)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(226,232,240,0.8)",
        padding: "18px 40px",
        display: "flex",
        alignItems: "center",
        gap: 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 2, marginRight: 32, whiteSpace: "nowrap" }}>
        TRUSTED BY
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap", flex: 1 }}>
        {LOGOS.map(logo => (
          <span
            key={logo.name}
            style={{
              fontSize: logo.name === "compass" || logo.name === "redfin" ? 13 : 16,
              fontWeight: logo.name === "kw" || logo.name === "redfin" ? 800 : 600,
              color: "#94A3B8",
              letterSpacing: logo.name === "compass" ? 1.5 : 0,
              fontStyle: logo.name === "exp" ? "italic" : "normal",
              fontFamily: logo.name === "zillow" ? "Georgia, serif" : "inherit",
            }}
          >
            {logo.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Avatar Stack ──────────────────────────────────────────────────────────────

function AvatarStack() {
  const avatars = [
    { initials: "JD", bg: "#3B82F6" },
    { initials: "MR", bg: "#6366F1" },
    { initials: "SK", bg: "#10B981" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex" }}>
        {avatars.map((a, i) => (
          <div
            key={i}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: a.bg,
              border: "2.5px solid #fff",
              marginLeft: i === 0 ? 0 : -8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: avatars.length - i,
            }}
          >
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{a.initials}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
          {[1,2,3,4,5].map(i => (
            <Star key={i} size={12} fill="#F59E0B" color="#F59E0B" />
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "#475569", fontWeight: 500 }}>Trusted by 500+ business owners</p>
      </div>
    </div>
  );
}

// ── Main Hero Section ─────────────────────────────────────────────────────────

export function HeroSection() {
  return (
    <div style={{ background: "linear-gradient(150deg,#EBF4FF 0%,#F0F7FF 25%,#F8FAFF 55%,#EDF4FE 100%)" }}>
      {/* ── Hero Panel ── */}
      <section
        className="relative"
        style={{ minHeight: "calc(100vh - 72px)", paddingBottom: 0, overflowX: "clip" }}
      >
        {/* Layered backgrounds */}
        <WaveBackground />
        <ParticleField />

        {/* Subtle radial light glow from top-right */}
        <div style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(147,197,253,0.22) 0%,transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          bottom: -40,
          left: -40,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(196,219,255,0.18) 0%,transparent 70%)",
          pointerEvents: "none",
        }} />

        <div className="relative z-10" style={{ maxWidth: 1380, margin: "0 auto", paddingLeft: 56, paddingRight: 24, paddingTop: 52, paddingBottom: 64 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, minHeight: 560 }}>

            {/* ── LEFT: Text content ── */}
            <div style={{ flex: "0 0 42%", maxWidth: "42%", paddingTop: 20 }}>

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(219,234,254,0.8)",
                  border: "1px solid rgba(147,197,253,0.6)",
                  borderRadius: 100,
                  padding: "6px 14px",
                  marginBottom: 24,
                  backdropFilter: "blur(8px)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563EB", display: "inline-block", boxShadow: "0 0 0 3px rgba(37,99,235,0.2)" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1E40AF" }}>Now accepting new clients</span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.1 }}
                style={{
                  fontSize: "clamp(28px, 2.85vw, 44px)",
                  fontWeight: 900,
                  color: "#0F172A",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                  fontFamily: "Playfair Display, Georgia, serif",
                }}
              >
                AI-Powered Websites &amp; Business Systems That Help You Get More{" "}
                <WordCycler />
              </motion.h1>

              {/* Body */}
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.2 }}
                style={{ fontSize: 15.5, color: "#475569", lineHeight: 1.7, marginBottom: 32, maxWidth: 460 }}
              >
                We build growth-focused websites, CRM systems, automation
                workflows, client portals, and custom business applications for
                service businesses, nonprofits, real estate professionals, and
                growing organizations.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.28 }}
                style={{ display: "flex", flexDirection: "row", gap: 12, marginBottom: 28, alignItems: "center" }}
              >
                <Link href="/discovery">
                  <Button
                    size="lg"
                    style={{
                      background: "#0F172A",
                      color: "#fff",
                      fontSize: 13.5,
                      fontWeight: 700,
                      padding: "12px 20px",
                      borderRadius: 10,
                      height: "auto",
                      boxShadow: "0 4px 16px rgba(15,23,42,0.22)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      whiteSpace: "nowrap",
                    }}
                    data-testid="button-hero-primary"
                  >
                    Get My Free Business Growth Assessment
                    <ArrowRight size={15} />
                  </Button>
                </Link>
                <Link href="/portfolio">
                  <Button
                    size="lg"
                    variant="outline"
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      padding: "12px 20px",
                      borderRadius: 10,
                      height: "auto",
                      border: "1.5px solid #CBD5E1",
                      color: "#374151",
                      background: "rgba(255,255,255,0.7)",
                      backdropFilter: "blur(8px)",
                      whiteSpace: "nowrap",
                    }}
                    data-testid="button-hero-secondary"
                  >
                    View Our Work
                  </Button>
                </Link>
              </motion.div>

              {/* Trust strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <AvatarStack />
              </motion.div>
            </div>

            {/* ── RIGHT: Visual elements ── */}
            <div style={{ flex: 1, position: "relative", minHeight: 540, display: "flex", gap: 16, alignItems: "stretch", overflow: "visible" }}>

              {/* Plant — absolute overlay at top right of this panel */}
              <div style={{ position: "absolute", right: -12, top: -64, zIndex: 10, pointerEvents: "none" }}>
                <PlantDecoration />
              </div>

              {/* Devices sub-column */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  flex: "1 1 0",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  position: "relative",
                }}
              >
                {/* Laptop */}
                <div style={{ position: "relative", zIndex: 2 }}>
                  <LaptopMockup />
                </div>

                {/* Phone + Tablet row — overlapping bottom of laptop */}
                <div style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                  position: "absolute",
                  bottom: 0,
                  right: -30,
                  zIndex: 3,
                }}>
                  <PhoneMockup />
                  <TabletMockup />
                </div>

                {/* Desk shadow */}
                <div style={{
                  position: "absolute",
                  bottom: -8,
                  left: 20,
                  right: 20,
                  height: 20,
                  background: "rgba(148,163,184,0.3)",
                  filter: "blur(12px)",
                  borderRadius: "50%",
                  zIndex: 1,
                }} />
              </motion.div>

              {/* Feature cards sub-column */}
              <div style={{
                width: 182,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                paddingTop: 8,
                paddingBottom: 40,
                gap: 10,
              }}>
                <FeatureCard card={FEATURE_CARDS[0]} delay={0.45} />
                <FeatureCard card={FEATURE_CARDS[1]} delay={0.55} />
                <FeatureCard card={FEATURE_CARDS[2]} delay={0.65} />
                <FeatureCard card={FEATURE_CARDS[3]} delay={0.75} />
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* ── Trusted By ── */}
      <TrustLogosBar />
    </div>
  );
}
