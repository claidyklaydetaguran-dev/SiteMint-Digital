import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Layout, Monitor, BarChart2, Star } from "lucide-react";
import Particles from "./Particles";

// ── Constants ──────────────────────────────────────────────────────────────────
const WORDS = ["Customers", "Clients", "Leads", "Sales", "Revenue"];

const NAVY = "#1E3A8A";
const NAVY_MID = "#1E40AF";

const FEATURE_CARDS = [
  { id: "ai",        Icon: Zap,       bg: "linear-gradient(135deg,#1d4ed8,#1e40af)", title: "AI Automation",   desc: "Workflows that save time and increase revenue" },
  { id: "crm",       Icon: Layout,    bg: "linear-gradient(135deg,#0369a1,#1d4ed8)", title: "CRM Systems",     desc: "Manage leads, clients & communications" },
  { id: "web",       Icon: Monitor,   bg: "linear-gradient(135deg,#0891b2,#1d4ed8)", title: "Custom Websites", desc: "Beautiful, fast & optimized for conversions" },
  { id: "analytics", Icon: BarChart2, bg: "linear-gradient(135deg,#4338ca,#1d4ed8)", title: "Analytics & Growth", desc: "Track performance and scale with confidence" },
];

// ── Word Cycler ────────────────────────────────────────────────────────────────
function WordCycler() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % WORDS.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <span style={{ position: "relative", display: "inline-block", verticalAlign: "baseline" }}>
      {/* Cycling word */}
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[idx]}
          initial={{ y: 22, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -22, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
          style={{ display: "inline-block", color: NAVY_MID }}
        >
          {WORDS[idx]}
        </motion.span>
      </AnimatePresence>

      {/* Blinking cursor */}
      <motion.span
        style={{ display: "inline-block", width: 3, height: "0.88em", background: NAVY_MID, borderRadius: 2, marginLeft: 2, verticalAlign: "middle" }}
        animate={{ opacity: [1, 1, 0, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "linear", times: [0, 0.45, 0.5, 0.95] }}
      />

      {/* Floating word-list dropdown beside the cycler */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, x: -4 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        style={{
          position: "absolute",
          left: "calc(100% + 16px)",
          top: "50%",
          transform: "translateY(-50%)",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(30,64,175,0.15)",
          borderRadius: 12,
          padding: "10px 16px",
          boxShadow: "0 8px 32px rgba(30,58,138,0.12), 0 2px 8px rgba(30,58,138,0.08)",
          minWidth: 130,
          zIndex: 10,
        }}
      >
        {WORDS.map((w, i) => (
          <div
            key={w}
            style={{
              fontSize: 13.5,
              fontWeight: i === idx ? 700 : 400,
              color: i === idx ? NAVY_MID : "#94A3B8",
              padding: "2px 0",
              transition: "all 0.2s",
              fontFamily: "Playfair Display, Georgia, serif",
            }}
          >
            {w}
          </div>
        ))}
      </motion.div>
    </span>
  );
}

// ── Wave Background ───────────────────────────────────────────────────────────
function WaveBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1440 700"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="wg1" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.12" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="wg2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.04" />
        </linearGradient>
        <filter id="wblur">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      {/* Main wave arc */}
      <path
        d="M -80 600 Q 350 240 720 220 Q 1020 205 1240 110 Q 1360 60 1540 10"
        stroke="url(#wg1)" strokeWidth="260" fill="none"
        strokeLinecap="round" filter="url(#wblur)"
      />
      {/* Secondary wave */}
      <path
        d="M -80 680 Q 420 360 800 340 Q 1080 325 1280 240 Q 1400 195 1540 165"
        stroke="url(#wg2)" strokeWidth="140" fill="none"
        strokeLinecap="round" filter="url(#wblur)"
      />
      {/* Glow blobs */}
      <ellipse cx="950" cy="140" rx="320" ry="90" fill="#bfdbfe" opacity="0.14" filter="url(#wblur)" />
      <ellipse cx="1150" cy="320" rx="200" ry="70" fill="#93c5fd" opacity="0.10" filter="url(#wblur)" />
    </svg>
  );
}

// ── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({ card, delay, style }: { card: typeof FEATURE_CARDS[0]; delay: number; style: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -5, scale: 1.03, boxShadow: "0 16px 40px rgba(30,58,138,0.18)" }}
      style={{
        position: "absolute",
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderRadius: 14,
        padding: "10px 14px",
        boxShadow: "0 8px 28px rgba(30,58,138,0.12), 0 2px 8px rgba(30,58,138,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
        border: "1px solid rgba(255,255,255,0.85)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: 186,
        cursor: "default",
        zIndex: 20,
        ...style,
      }}
    >
      {/* Icon with gradient bg + 3D inset shadow */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: card.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 4px 14px rgba(30,58,138,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
      }}>
        <card.Icon size={16} color="#fff" strokeWidth={2.5} />
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 2, lineHeight: 1.2 }}>{card.title}</p>
        <p style={{ fontSize: 10.5, color: "#64748B", lineHeight: 1.45 }}>{card.desc}</p>
      </div>
    </motion.div>
  );
}

// ── Laptop Mockup ─────────────────────────────────────────────────────────────
function LaptopMockup() {
  return (
    <div style={{
      width: 400,
      filter: "drop-shadow(0 28px 56px rgba(15,23,42,0.32)) drop-shadow(0 8px 20px rgba(30,58,138,0.18))",
      position: "relative",
      zIndex: 3,
    }}>
      {/* ─ Screen lid ─ */}
      <div style={{
        background: "linear-gradient(180deg, #1C2333 0%, #1A2030 100%)",
        borderRadius: "14px 14px 0 0",
        padding: "10px 10px 0",
        border: "1px solid #2D3748",
        borderBottom: "none",
        position: "relative",
      }}>
        {/* Camera + mic row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 7 }}>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#374151" }} />
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1F2937", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5), 0 0 0 1px #374151" }} />
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#374151" }} />
        </div>

        {/* Screen glass */}
        <div style={{
          background: "#0D1B3E",
          borderRadius: "6px 6px 0 0",
          overflow: "hidden",
          aspectRatio: "16/10",
          position: "relative",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}>
          <LaptopScreen />
          {/* Screen glare */}
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: "35%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
            pointerEvents: "none",
          }} />
        </div>
      </div>

      {/* ─ Hinge ─ */}
      <div style={{
        height: 5,
        background: "linear-gradient(180deg, #151C2B 0%, #0F1520 100%)",
        borderLeft: "1px solid #2D3748",
        borderRight: "1px solid #2D3748",
      }} />

      {/* ─ Keyboard base ─ */}
      <div style={{
        background: "linear-gradient(180deg, #C9D1DC 0%, #B0BAC6 100%)",
        borderRadius: "0 0 10px 10px",
        padding: "6px 12px 8px",
        border: "1px solid #9AA5B4",
        borderTop: "none",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}>
        {/* Keys hint */}
        <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 5, background: "rgba(0,0,0,0.12)", borderRadius: 2 }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 5, background: "rgba(0,0,0,0.10)", borderRadius: 2 }} />
          ))}
        </div>
        {/* Trackpad */}
        <div style={{ width: 90, height: 14, background: "rgba(0,0,0,0.10)", borderRadius: 6, margin: "2px auto 0", border: "1px solid rgba(0,0,0,0.08)" }} />
      </div>

      {/* ─ Bottom edge shadow ─ */}
      <div style={{
        position: "absolute",
        bottom: -12,
        left: "10%",
        right: "10%",
        height: 14,
        background: "rgba(30,58,138,0.18)",
        filter: "blur(12px)",
        borderRadius: "50%",
      }} />
    </div>
  );
}

function LaptopScreen() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#0D1B3E", fontFamily: "sans-serif" }}>
      {/* Nav */}
      <div style={{
        background: "#0A1628",
        padding: "5px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(30,58,138,0.3)",
      }}>
        <span style={{ color: "#60A5FA", fontSize: 7, fontWeight: 800, letterSpacing: 0.3 }}>◆ SiteMint Digital</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["Home","Services","About","Contact"].map(l => (
            <span key={l} style={{ color: "#94A3B8", fontSize: 5 }}>{l}</span>
          ))}
          <span style={{ background: "#2563EB", color: "#fff", fontSize: 5, padding: "2px 6px", borderRadius: 3, fontWeight: 600 }}>Get Started</span>
        </div>
      </div>
      {/* Hero area */}
      <div style={{ padding: "10px 14px 6px", background: "linear-gradient(135deg,#0D1B3E 0%,#1E3A5F 100%)", display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: 1.3, maxWidth: 160, marginBottom: 4 }}>
            Elevate Your Business<br />With Smart Digital Solutions.
          </p>
          <p style={{ color: "#93C5FD", fontSize: 5.5, marginBottom: 6 }}>Websites, CRM, Automation & More</p>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ background: "#2563EB", color: "#fff", fontSize: 5.5, padding: "3px 8px", borderRadius: 3, fontWeight: 600 }}>Get Started</span>
          </div>
        </div>
        {/* Right side decoration boxes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 4 }}>
          {["#1E40AF","#0369A1","#4338CA"].map((c, i) => (
            <div key={i} style={{ width: 24, height: 16, background: c, borderRadius: 3, opacity: 0.7 }} />
          ))}
        </div>
      </div>
      {/* Stats */}
      <div style={{ display: "flex", background: "#0A1628", borderTop: "1px solid rgba(30,58,138,0.3)" }}>
        {[
          { label: "Total Leads", val: "1,248", change: "+12%" },
          { label: "Appointments", val: "92",   change: "+8%" },
          { label: "New Customers", val: "64",  change: "+23%" },
          { label: "Revenue", val: "$28,540",   change: "+19%" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1,
            padding: "5px 4px",
            borderRight: i < 3 ? "1px solid rgba(30,58,138,0.2)" : "none",
            textAlign: "center",
            background: "rgba(255,255,255,0.02)",
          }}>
            <div style={{ color: "#F1F5F9", fontSize: 8.5, fontWeight: 800 }}>{s.val}</div>
            <div style={{ color: "#64748B", fontSize: 4.5, marginBottom: 1 }}>{s.label}</div>
            <div style={{ color: "#34D399", fontSize: 4.5 }}>{s.change}</div>
          </div>
        ))}
      </div>
      {/* Chart */}
      <div style={{ padding: "5px 10px 4px", background: "#0D1B3E" }}>
        <svg width="100%" height="28" viewBox="0 0 400 28" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,24 L50,20 L100,22 L150,14 L200,16 L250,8 L300,10 L350,4 L400,2 L400,28 L0,28 Z" fill="url(#lcg)" />
          <path d="M0,24 L50,20 L100,22 L150,14 L200,16 L250,8 L300,10 L350,4 L400,2" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
          {[{x:150,y:14},{x:250,y:8},{x:350,y:4}].map((p,i)=>(
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
    <div style={{
      width: 94,
      background: "linear-gradient(180deg, #111827 0%, #0D1117 100%)",
      borderRadius: 22,
      padding: "0 4px 6px",
      boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 8px 16px rgba(30,58,138,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
      border: "1px solid #1F2937",
      position: "relative",
      zIndex: 5,
    }}>
      {/* Dynamic Island */}
      <div style={{
        width: 36, height: 8, background: "#0A0F1A",
        borderRadius: "0 0 10px 10px",
        margin: "0 auto 5px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        border: "1px solid #1F2937", borderTop: "none",
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#111827", border: "1px solid #374151" }} />
      </div>
      {/* Screen */}
      <div style={{ background: "#0D1B3E", borderRadius: 16, overflow: "hidden", minHeight: 174 }}>
        <PhoneScreen />
      </div>
      {/* Side buttons hint */}
      <div style={{ position: "absolute", right: -3, top: 50, width: 3, height: 24, background: "#1F2937", borderRadius: "0 2px 2px 0" }} />
      <div style={{ position: "absolute", left: -3, top: 44, width: 3, height: 18, background: "#1F2937", borderRadius: "2px 0 0 2px" }} />
      <div style={{ position: "absolute", left: -3, top: 66, width: 3, height: 18, background: "#1F2937", borderRadius: "2px 0 0 2px" }} />
    </div>
  );
}

function PhoneScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "7px 7px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <p style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>Dashboard</p>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#1E3A5F", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />
        </div>
      </div>
      <p style={{ color: "#64748B", fontSize: 5.5, marginBottom: 8, letterSpacing: 0.3 }}>Overview</p>
      {/* Revenue card */}
      <div style={{ background: "linear-gradient(135deg,#1E3A5F,#1E40AF)", borderRadius: 8, padding: "7px 8px", marginBottom: 5 }}>
        <p style={{ color: "#93C5FD", fontSize: 5, marginBottom: 1 }}>Revenue</p>
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>$28,540</p>
        <p style={{ color: "#34D399", fontSize: 4.5 }}>↑ 2.3% from last month</p>
      </div>
      {/* Leads */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 2px", borderBottom: "1px solid rgba(30,58,138,0.2)" }}>
        <span style={{ color: "#94A3B8", fontSize: 5.5 }}>Leads</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ color: "#F1F5F9", fontSize: 7.5, fontWeight: 700 }}>1,248</span>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#60A5FA" }} />
        </div>
      </div>
      {/* Appointments */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 2px", borderBottom: "1px solid rgba(30,58,138,0.2)" }}>
        <span style={{ color: "#94A3B8", fontSize: 5.5 }}>Appointments</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ color: "#F1F5F9", fontSize: 7.5, fontWeight: 700 }}>92</span>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#818CF8" }} />
        </div>
      </div>
      {/* Mini bar chart */}
      <div style={{ marginTop: 7, display: "flex", alignItems: "flex-end", gap: 2, height: 24 }}>
        {[45,62,38,78,55,88,70,60,82,95].map((h, i) => (
          <div key={i} style={{
            flex: 1,
            background: i === 9 ? "#3B82F6" : `rgba(30,64,175,${0.2 + i * 0.07})`,
            height: `${h}%`,
            borderRadius: "2px 2px 0 0",
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Tablet Mockup ─────────────────────────────────────────────────────────────
function TabletMockup() {
  return (
    <div style={{
      width: 128,
      background: "linear-gradient(180deg, #1C2333 0%, #161E2E 100%)",
      borderRadius: 14,
      padding: "7px 5px 6px",
      boxShadow: "0 20px 44px rgba(0,0,0,0.42), 0 6px 14px rgba(30,58,138,0.16), inset 0 1px 0 rgba(255,255,255,0.07)",
      border: "1px solid #2D3748",
      position: "relative",
      zIndex: 4,
    }}>
      {/* Camera */}
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1F2937", border: "1px solid #374151", margin: "0 auto 4px" }} />
      {/* Screen */}
      <div style={{ background: "#0D1B3E", borderRadius: 10, overflow: "hidden", minHeight: 176 }}>
        <TabletScreen />
      </div>
      {/* Bottom button */}
      <div style={{ width: 30, height: 4, background: "#1F2937", borderRadius: 4, margin: "5px auto 0", border: "1px solid #374151" }} />
    </div>
  );
}

function TabletScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "10px 10px", background: "#0D1B3E" }}>
      <p style={{ color: "#F1F5F9", fontSize: 10, fontWeight: 800, lineHeight: 1.3, marginBottom: 5 }}>
        Automate.<br />Engage.<br />Grow.
      </p>
      <p style={{ color: "#93C5FD", fontSize: 5, marginBottom: 8, lineHeight: 1.6 }}>
        Powerful automation configured that save time and win more customers.
      </p>
      <div style={{
        background: "#2563EB",
        color: "#fff", fontSize: 5.5,
        padding: "4px 10px", borderRadius: 4,
        display: "inline-block", marginBottom: 9,
        fontWeight: 600,
        boxShadow: "0 4px 10px rgba(37,99,235,0.4)",
      }}>
        Explore Automation
      </div>
      <p style={{ color: "#475569", fontSize: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        Workflow Overview
      </p>
      {[
        { label: "New Lead",         color: "#34D399" },
        { label: "Send Email",       color: "#60A5FA" },
        { label: "Follow Up",        color: "#818CF8" },
        { label: "Book Appointment", color: "#F59E0B" },
      ].map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: step.color, flexShrink: 0, boxShadow: `0 0 6px ${step.color}80` }} />
          <span style={{ color: "#CBD5E1", fontSize: 6 }}>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Avatar Stack ──────────────────────────────────────────────────────────────
function AvatarStack() {
  const avatars = [
    { bg: "#3B82F6", text: "JD" },
    { bg: "#6366F1", text: "MR" },
    { bg: "#10B981", text: "SK" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex" }}>
        {avatars.map((a, i) => (
          <div key={i} style={{
            width: 34, height: 34, borderRadius: "50%",
            background: a.bg,
            border: "2.5px solid #fff",
            marginLeft: i === 0 ? 0 : -10,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: avatars.length - i,
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          }}>
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{a.text}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
          {[1,2,3,4,5].map(i => <Star key={i} size={13} fill="#F59E0B" color="#F59E0B" />)}
        </div>
        <p style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>Trusted by 10+ business owners</p>
      </div>
    </div>
  );
}

// ── Main Hero Section ─────────────────────────────────────────────────────────
export function HeroSection() {
  return (
    <section
      style={{
        minHeight: "calc(100vh - 68px)",
        background: "linear-gradient(155deg, #EEF3FF 0%, #F0F6FF 22%, #F7FAFF 52%, #EBF1FF 100%)",
        position: "relative",
        overflowX: "clip",
      }}
    >
      {/* ── Background layers ── */}
      <WaveBackground />

      {/* CSS/SVG Particles layer */}
      <Particles
        particleCount={40}
        particleColors={["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6"]}
        className=""
      />

      {/* Radial light glows */}
      <div style={{ position: "absolute", top: -100, right: -100, width: 640, height: 640, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.20) 0%, transparent 70%)", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "absolute", bottom: -60, left: -60, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,219,255,0.14) 0%, transparent 70%)", pointerEvents: "none", zIndex: 1 }} />

      {/* ── Content ── */}
      <div
        style={{ maxWidth: 1380, margin: "0 auto", paddingLeft: 56, paddingRight: 16, paddingTop: 52, paddingBottom: 60, position: "relative", zIndex: 10 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, minHeight: 560 }}>

          {/* ── LEFT column ── */}
          <div style={{ flex: "0 0 40%", maxWidth: "40%", paddingTop: 24 }}>

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(219,234,254,0.85)",
                border: "1px solid rgba(147,197,253,0.55)",
                borderRadius: 100, padding: "6px 14px", marginBottom: 24,
                backdropFilter: "blur(8px)",
              }}
            >
              <motion.span
                style={{ width: 8, height: 8, borderRadius: "50%", background: NAVY_MID, display: "inline-block" }}
                animate={{ boxShadow: ["0 0 0 0 rgba(30,64,175,0.4)", "0 0 0 6px rgba(30,64,175,0)", "0 0 0 0 rgba(30,64,175,0)"] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1E40AF" }}>Now accepting new clients</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
              style={{
                fontSize: "clamp(26px, 2.6vw, 40px)",
                fontWeight: 900,
                color: "#0F172A",
                lineHeight: 1.18,
                letterSpacing: "-0.02em",
                marginBottom: 18,
                fontFamily: "Playfair Display, Georgia, serif",
              }}
            >
              AI-Powered Websites &amp; Business Systems That Help You Get More{" "}
              <WordCycler />
            </motion.h1>

            {/* Body */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ fontSize: 15, color: "#475569", lineHeight: 1.72, marginBottom: 28, maxWidth: 440 }}
            >
              We build growth-focused websites, CRM systems, automation
              workflows, client portals, and custom business applications for
              service businesses, nonprofits, real estate professionals, and
              growing organizations.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28 }}
              style={{ display: "flex", gap: 12, marginBottom: 26, alignItems: "center" }}
            >
              <Link href="/discovery">
                <Button
                  size="lg"
                  style={{
                    background: NAVY,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "12px 18px",
                    borderRadius: 10,
                    height: "auto",
                    boxShadow: `0 4px 18px rgba(30,58,138,0.28)`,
                    display: "flex", alignItems: "center", gap: 7,
                    whiteSpace: "nowrap",
                  }}
                  data-testid="button-hero-primary"
                >
                  Get My Free Business Growth Assessment <ArrowRight size={15} />
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button
                  size="lg"
                  variant="outline"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "12px 18px",
                    borderRadius: 10,
                    height: "auto",
                    border: "1.5px solid #CBD5E1",
                    color: "#374151",
                    background: "rgba(255,255,255,0.72)",
                    backdropFilter: "blur(8px)",
                    whiteSpace: "nowrap",
                  }}
                  data-testid="button-hero-secondary"
                >
                  View Our Work
                </Button>
              </Link>
            </motion.div>

            {/* Trust */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <AvatarStack />
            </motion.div>
          </div>

          {/* ── RIGHT column ── */}
          <div style={{ flex: 1, position: "relative", minHeight: 560, overflow: "visible" }}>

            {/* ── Floating Feature Cards ── (scattered above devices) */}
            <FeatureCard card={FEATURE_CARDS[0]} delay={0.5}  style={{ top: 0,   right: 10 }} />
            <FeatureCard card={FEATURE_CARDS[1]} delay={0.6}  style={{ top: 58,  left: "34%" }} />
            <FeatureCard card={FEATURE_CARDS[2]} delay={0.7}  style={{ top: 130, left: "6%" }} />
            <FeatureCard card={FEATURE_CARDS[3]} delay={0.8}  style={{ top: 188, right: 4 }} />

            {/* ── Plant image — behind tablet, right side ── */}
            <div style={{
              position: "absolute",
              right: -16,
              bottom: 0,
              zIndex: 2,
              pointerEvents: "none",
              width: 155,
            }}>
              <img
                src="/plant.png"
                alt="decorative plant"
                style={{ width: "100%", display: "block", objectFit: "contain" }}
              />
            </div>

            {/* ── Devices group ── */}
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.38, ease: [0.23, 1, 0.32, 1] }}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                display: "flex",
                alignItems: "flex-end",
                gap: 0,
              }}
            >
              {/* Laptop */}
              <div style={{ position: "relative", zIndex: 3 }}>
                <LaptopMockup />
              </div>

              {/* Phone + Tablet group */}
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                marginLeft: -20,
                marginBottom: 22,
                position: "relative",
                zIndex: 4,
              }}>
                <PhoneMockup />
                <TabletMockup />
              </div>
            </motion.div>

            {/* Desk surface reflection */}
            <div style={{
              position: "absolute",
              bottom: -6,
              left: 0,
              width: "74%",
              height: 18,
              background: "rgba(30,58,138,0.10)",
              filter: "blur(14px)",
              borderRadius: "50%",
              zIndex: 1,
            }} />
          </div>

        </div>
      </div>
    </section>
  );
}
