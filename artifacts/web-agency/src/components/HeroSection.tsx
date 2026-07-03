import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Layout, Monitor, BarChart2, Star } from "lucide-react";
import { FlipWords } from "./FlipWords";
import { CardContainer, CardBody, CardItem } from "./Card3D";
import Particles from "./Particles";
import "./HeroResponsive.css";

// ── Constants ──────────────────────────────────────────────────────────────────
const WORDS = ["Customers", "Clients", "Leads", "Sales", "Revenue"];
const DEEP_NAVY = "#062e71";

const FEATURE_CARDS = [
  {
    id: "ai",
    Icon: Zap,
    iconBg: "linear-gradient(135deg,#7c3aed,#2563eb)",
    title: "AI Automation",
    desc: "Workflows that save time and boost revenue",
    metric: "12 active workflows",
    pct: 87,
    color: "#818cf8",
    delay: 0,
  },
  {
    id: "crm",
    Icon: Layout,
    iconBg: "linear-gradient(135deg,#0369a1,#1d4ed8)",
    title: "CRM Systems",
    desc: "Manage leads, clients & communications",
    metric: "1,248 leads tracked",
    pct: 74,
    color: "#38bdf8",
    delay: 0.08,
  },
  {
    id: "web",
    Icon: Monitor,
    iconBg: "linear-gradient(135deg,#0f766e,#1d4ed8)",
    title: "Custom Websites",
    desc: "Beautiful, fast & optimized for conversions",
    metric: "99.9% uptime",
    pct: 99,
    color: "#34d399",
    delay: 0.16,
  },
  {
    id: "analytics",
    Icon: BarChart2,
    iconBg: "linear-gradient(135deg,#c026d3,#4338ca)",
    title: "Analytics & Growth",
    desc: "Track performance and scale with confidence",
    metric: "+24% growth MoM",
    pct: 68,
    color: "#e879f9",
    delay: 0.24,
  },
];

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
          <stop offset="0%" stopColor="#062e71" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#1255c4" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="wg2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#062e71" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.06" />
        </linearGradient>
        <filter id="wblur">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <path
        d="M -80 600 Q 350 220 740 200 Q 1040 185 1260 90 Q 1380 44 1560 0"
        stroke="url(#wg1)" strokeWidth="280" fill="none"
        strokeLinecap="round" filter="url(#wblur)"
      />
      <path
        d="M -80 720 Q 440 360 820 340 Q 1100 325 1300 240 Q 1420 195 1560 165"
        stroke="url(#wg2)" strokeWidth="150" fill="none"
        strokeLinecap="round" filter="url(#wblur)"
      />
      <ellipse cx="960" cy="130" rx="340" ry="100" fill="#3b82f6" opacity="0.12" filter="url(#wblur)" />
      <ellipse cx="1200" cy="340" rx="220" ry="80" fill="#1d4ed8" opacity="0.09" filter="url(#wblur)" />
    </svg>
  );
}

// ── 3D Feature Card — techy dark glass ────────────────────────────────────────
function Feature3DCard({ card, style }: { card: typeof FEATURE_CARDS[0]; style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        ...style,
        zIndex: 20,
        animation: `card-entry 0.55s cubic-bezier(0.23,1,0.32,1) ${card.delay + 0.5}s both`,
      }}
      className="hero-feature-card"
    >
      <CardContainer containerClassName="p-0" className="">
        <CardBody className="w-[178px]">
          <div
            style={{
              background: "linear-gradient(135deg,rgba(4,12,44,0.96) 0%,rgba(7,22,66,0.93) 100%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(59,130,246,0.26)",
              borderRadius: 14,
              padding: "11px 13px 12px",
              boxShadow:
                "0 0 0 1px rgba(6,46,113,0.12), 0 14px 44px rgba(6,46,113,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Corner brackets */}
            {[
              { top: 0, left: 0, borderTop: "1.5px solid", borderLeft: "1.5px solid", borderRadius: "14px 0 0 0" },
              { top: 0, right: 0, borderTop: "1.5px solid", borderRight: "1.5px solid", borderRadius: "0 14px 0 0" },
              { bottom: 0, left: 0, borderBottom: "1.5px solid", borderLeft: "1.5px solid", borderRadius: "0 0 0 14px" },
              { bottom: 0, right: 0, borderBottom: "1.5px solid", borderRight: "1.5px solid", borderRadius: "0 0 14px 0" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute", width: 10, height: 10,
                  borderColor: `rgba(59,130,246,0.65)`,
                  ...s,
                  pointerEvents: "none",
                }}
              />
            ))}

            {/* Ambient glow blob */}
            <div style={{
              position: "absolute", top: -24, right: -24, width: 90, height: 90,
              background: `radial-gradient(circle,${card.color}22 0%,transparent 70%)`,
              pointerEvents: "none",
            }} />

            {/* Header: icon + title + live dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <CardItem translateZ={44} className="flex-shrink-0">
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: card.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 14px ${card.color}55, 0 4px 10px rgba(6,46,113,0.4), inset 0 1px 0 rgba(255,255,255,0.16)`,
                }}>
                  <card.Icon size={13} color="#fff" strokeWidth={2.5} />
                </div>
              </CardItem>

              <CardItem translateZ={26} style={{ flex: 1 }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.2 }}>
                  {card.title}
                </p>
              </CardItem>

              {/* Pulsing live dot */}
              <div
                className="live-pulse-dot"
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#34d399",
                  flexShrink: 0,
                  animation: "live-pulse 2s ease-in-out infinite",
                }}
              />
            </div>

            {/* Description */}
            <CardItem translateZ={16}>
              <p style={{ fontSize: 9.5, color: "#64748B", lineHeight: 1.5, marginBottom: 9 }}>
                {card.desc}
              </p>
            </CardItem>

            {/* Metric progress bar */}
            <div style={{ marginBottom: 5 }}>
              <div style={{
                height: 3, borderRadius: 2,
                background: "rgba(59,130,246,0.12)", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${card.pct}%`,
                  background: `linear-gradient(90deg,${card.color},${card.color}bb)`,
                  borderRadius: 2,
                  boxShadow: `0 0 6px ${card.color}88`,
                }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 7.5, color: "#475569" }}>{card.metric}</span>
              <span style={{ fontSize: 8, color: card.color, fontWeight: 700 }}>{card.pct}%</span>
            </div>
          </div>
        </CardBody>
      </CardContainer>
    </div>
  );
}

// ── Feature Connectors SVG ─────────────────────────────────────────────────────
function FeatureConnectors() {
  // viewBox approximates the right-column (≈700 × 520px)
  // Card centers estimated from absolute positions:
  //   Card 0 (top:0,   right:-10) → (618, 44)
  //   Card 1 (top:64,  left:28%)  → (284, 108)
  //   Card 2 (bottom:60, left:0)  → (90, 422)
  //   Card 3 (bottom:0,  right:0) → (618, 478)
  const paths = [
    { d: "M 284,108 C 390,78 510,58 618,44",   dur: "2.4s", color: "#818cf8", delay: "0s" },
    { d: "M 284,108 C 240,210 150,320 90,422",  dur: "2.8s", color: "#38bdf8", delay: "0.5s" },
    { d: "M 90,422  C 220,444 460,462 618,478", dur: "3.2s", color: "#34d399", delay: "1s" },
    { d: "M 618,44  C 660,170 660,340 618,478", dur: "2.6s", color: "#e879f9", delay: "1.5s" },
  ];

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 15, overflow: "visible" }}
      viewBox="0 0 700 520"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {paths.map((p, i) => (
          <linearGradient key={`lg${i}`} id={`cg${i}`} gradientUnits="userSpaceOnUse"
            x1={p.d.match(/M\s*([\d.]+)/)?.[1]} y1="0"
            x2={p.d.match(/(\d+),(\d+)$/)?.[1]} y2="0">
            <stop offset="0%" stopColor={p.color} stopOpacity="0" />
            <stop offset="50%" stopColor={p.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {paths.map((p, i) => (
        <g key={i}>
          {/* Static faint base path */}
          <path d={p.d} fill="none" stroke={p.color} strokeWidth="1" strokeOpacity="0.18" strokeDasharray="4 6" />
          {/* Animated flowing dash */}
          <path
            d={p.d} fill="none" stroke={p.color} strokeWidth="1.5" strokeOpacity="0.7"
            strokeDasharray="18 222"
            strokeLinecap="round"
          >
            <animate attributeName="stroke-dashoffset" from="240" to="-240" dur={p.dur} begin={p.delay} repeatCount="indefinite" />
          </path>
          {/* Traveling glow dot */}
          <circle r="3" fill={p.color} fillOpacity="0.9">
            <animateMotion dur={p.dur} begin={p.delay} repeatCount="indefinite" rotate="auto">
              <mpath xlinkHref={`#cp${i}`} />
            </animateMotion>
          </circle>
          <path id={`cp${i}`} d={p.d} fill="none" style={{ display: "none" }} />
          {/* Larger soft glow behind dot */}
          <circle r="6" fill={p.color} fillOpacity="0.2">
            <animateMotion dur={p.dur} begin={p.delay} repeatCount="indefinite" rotate="auto">
              <mpath xlinkHref={`#cp${i}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  );
}

// ── Laptop Mockup ─────────────────────────────────────────────────────────────
function LaptopMockup() {
  return (
    <div
      style={{
        width: 400,
        filter:
          "drop-shadow(0 40px 70px rgba(0,0,0,0.55)) drop-shadow(0 10px 28px rgba(6,46,113,0.28))",
        position: "relative",
        zIndex: 3,
      }}
    >
      {/* Lid — dark space gray like MacBook Pro */}
      <div
        style={{
          background: "linear-gradient(175deg,#2a2f3e 0%,#1e2230 50%,#1a1e2c 100%)",
          borderRadius: "16px 16px 0 0",
          padding: "10px 9px 0",
          border: "1px solid #3a404f",
          borderBottom: "none",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)",
        }}
      >
        {/* Camera row */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 4,
            marginBottom: 8,
          }}
        >
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#3a404f" }} />
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#0d1117",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8), 0 0 0 1px #2a2f3e",
            }}
          />
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#3a404f" }} />
        </div>
        {/* Screen bezel */}
        <div
          style={{
            background: "#0a0e18",
            borderRadius: "7px 7px 0 0",
            overflow: "hidden",
            aspectRatio: "16/10",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          <LaptopScreen />
          {/* Glass glare */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "28%",
              background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 100%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* Hinge strip */}
      <div
        style={{
          height: 5,
          background: "linear-gradient(180deg,#252a38 0%,#1a1e2c 100%)",
          borderLeft: "1px solid #3a404f",
          borderRight: "1px solid #3a404f",
        }}
      />

      {/* Keyboard base — dark graphite */}
      <div
        style={{
          background: "linear-gradient(180deg,#242837 0%,#1c2030 100%)",
          borderRadius: "0 0 12px 12px",
          padding: "8px 14px 10px",
          border: "1px solid #3a404f",
          borderTop: "none",
          boxShadow:
            "0 10px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4)",
        }}
      >
        {/* Key rows */}
        {[13, 12, 11].map((count, row) => (
          <div key={row} style={{ display: "flex", gap: 3, marginBottom: 4 }}>
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 2,
                  boxShadow: "0 1px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              />
            ))}
          </div>
        ))}
        {/* Spacebar */}
        <div
          style={{
            height: 6,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 2,
            marginBottom: 6,
            boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
          }}
        />
        {/* Trackpad */}
        <div
          style={{
            width: 88,
            height: 14,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 6,
            margin: "0 auto",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      </div>

      {/* Desk shadow */}
      <div
        style={{
          position: "absolute",
          bottom: -14,
          left: "10%",
          right: "10%",
          height: 16,
          background: "rgba(6,46,113,0.20)",
          filter: "blur(14px)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

function LaptopScreen() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#0D1B3E", fontFamily: "sans-serif", position: "relative" }}>
      {/* Nav */}
      <div
        style={{
          background: "#0A1628",
          padding: "5px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(30,58,138,0.35)",
        }}
      >
        <span style={{ color: "#60A5FA", fontSize: 7, fontWeight: 800, letterSpacing: 0.3 }}>◆ SiteMint Digital</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["Home", "Services", "About", "Contact"].map((l) => (
            <span key={l} style={{ color: "#94A3B8", fontSize: 5 }}>{l}</span>
          ))}
          <span
            style={{
              background: "#2563EB",
              color: "#fff",
              fontSize: 5,
              padding: "2px 7px",
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            Get Started
          </span>
        </div>
      </div>
      {/* Hero area */}
      <div
        style={{
          padding: "10px 14px 6px",
          background: "linear-gradient(135deg,#0D1B3E 0%,#1E3A5F 100%)",
          display: "flex",
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: 1.3,
              maxWidth: 160,
              marginBottom: 4,
            }}
          >
            Elevate Your Business<br />With Smart Digital Solutions.
          </p>
          <p style={{ color: "#93C5FD", fontSize: 5.5, marginBottom: 6 }}>Websites, CRM, Automation & More</p>
          <span
            style={{
              background: "#2563EB",
              color: "#fff",
              fontSize: 5.5,
              padding: "3px 9px",
              borderRadius: 3,
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            Get Started
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 4 }}>
          {["#1E40AF", "#0369A1", "#4338CA"].map((c, i) => (
            <div key={i} style={{ width: 28, height: 18, background: c, borderRadius: 3, opacity: 0.7 }} />
          ))}
        </div>
      </div>
      {/* Stats row */}
      <div
        style={{
          display: "flex",
          background: "#0A1628",
          borderTop: "1px solid rgba(30,58,138,0.3)",
        }}
      >
        {[
          { label: "Total Leads", val: "1,248", chg: "+12%" },
          { label: "Appointments", val: "92", chg: "+8%" },
          { label: "New Customers", val: "64", chg: "+23%" },
          { label: "Revenue", val: "$28,540", chg: "+19%" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "5px 4px",
              textAlign: "center",
              borderRight: i < 3 ? "1px solid rgba(30,58,138,0.2)" : "none",
            }}
          >
            <div style={{ color: "#F1F5F9", fontSize: 8.5, fontWeight: 800 }}>{s.val}</div>
            <div style={{ color: "#64748B", fontSize: 4.5, marginBottom: 1 }}>{s.label}</div>
            <div style={{ color: "#34D399", fontSize: 4.5 }}>{s.chg}</div>
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
          <path
            d="M0,24 L50,20 L100,22 L150,14 L200,16 L250,8 L300,10 L350,4 L400,2 L400,28 L0,28 Z"
            fill="url(#lcg)"
          />
          <path
            d="M0,24 L50,20 L100,22 L150,14 L200,16 L250,8 L300,10 L350,4 L400,2"
            fill="none" stroke="#3B82F6" strokeWidth="1.5"
          />
          {[{x:150,y:14},{x:250,y:8},{x:350,y:4}].map((p, i) => (
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
        width: 96,
        background: "linear-gradient(175deg,#1a1f2e 0%,#0d1117 100%)",
        borderRadius: 24,
        padding: "0 4px 8px",
        boxShadow:
          "0 28px 56px rgba(0,0,0,0.55), 0 8px 18px rgba(6,46,113,0.22), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(255,255,255,0.04)",
        border: "1px solid #1F2937",
        position: "relative",
        zIndex: 5,
      }}
    >
      {/* Dynamic Island */}
      <div
        style={{
          width: 38,
          height: 9,
          background: "#070b12",
          borderRadius: "0 0 12px 12px",
          margin: "0 auto 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          border: "1px solid #1F2937",
          borderTop: "none",
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#141922",
            border: "1px solid #374151",
          }}
        />
      </div>
      {/* Screen */}
      <div
        style={{
          background: "#0D1B3E",
          borderRadius: 18,
          overflow: "hidden",
          minHeight: 176,
        }}
      >
        <PhoneScreen />
      </div>
      {/* Side buttons */}
      <div
        style={{
          position: "absolute",
          right: -3,
          top: 52,
          width: 3,
          height: 26,
          background: "#252d3d",
          borderRadius: "0 3px 3px 0",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -3,
          top: 46,
          width: 3,
          height: 20,
          background: "#252d3d",
          borderRadius: "3px 0 0 3px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -3,
          top: 70,
          width: 3,
          height: 20,
          background: "#252d3d",
          borderRadius: "3px 0 0 3px",
        }}
      />
    </div>
  );
}

function PhoneScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "8px 8px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 7,
        }}
      >
        <p style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>Dashboard</p>
        <div
          style={{
            width: 15,
            height: 15,
            borderRadius: "50%",
            background: "#1E3A5F",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />
        </div>
      </div>
      <p style={{ color: "#475569", fontSize: 5.5, marginBottom: 7, letterSpacing: 0.3 }}>Overview</p>
      {/* Revenue card */}
      <div
        style={{
          background: "linear-gradient(135deg,#1E3A5F,#1E40AF)",
          borderRadius: 9,
          padding: "7px 9px",
          marginBottom: 6,
        }}
      >
        <p style={{ color: "#93C5FD", fontSize: 5, marginBottom: 1 }}>Revenue</p>
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>$28,540</p>
        <p style={{ color: "#34D399", fontSize: 4.5 }}>↑ 2.3% from last month</p>
      </div>
      {/* Leads & Appointments */}
      {[
        { label: "Leads", val: "1,248", color: "#60A5FA" },
        { label: "Appointments", val: "92", color: "#818CF8" },
      ].map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 2px",
            borderBottom: "1px solid rgba(30,58,138,0.2)",
          }}
        >
          <span style={{ color: "#94A3B8", fontSize: 5.5 }}>{row.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: "#F1F5F9", fontSize: 8, fontWeight: 700 }}>{row.val}</span>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: row.color }} />
          </div>
        </div>
      ))}
      {/* Mini bar chart */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 26,
        }}
      >
        {[42, 58, 35, 74, 52, 84, 67, 58, 78, 92].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: i === 9 ? "#3B82F6" : `rgba(30,64,175,${0.18 + i * 0.07})`,
              height: `${h}%`,
              borderRadius: "2px 2px 0 0",
            }}
          />
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
        width: 130,
        background: "linear-gradient(175deg,#1a1f2e 0%,#0d1117 100%)",
        borderRadius: 16,
        padding: "8px 5px 7px",
        boxShadow:
          "0 24px 48px rgba(0,0,0,0.45), 0 6px 16px rgba(6,46,113,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
        border: "1px solid #2D3748",
        position: "relative",
        zIndex: 4,
      }}
    >
      {/* Camera */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#141922",
          border: "1px solid #374151",
          margin: "0 auto 5px",
        }}
      />
      {/* Screen */}
      <div
        style={{
          background: "#0D1B3E",
          borderRadius: 10,
          overflow: "hidden",
          minHeight: 180,
        }}
      >
        <TabletScreen />
      </div>
      {/* Home bar */}
      <div
        style={{
          width: 32,
          height: 4,
          background: "#1F2937",
          borderRadius: 4,
          margin: "5px auto 0",
          border: "1px solid #374151",
        }}
      />
    </div>
  );
}

function TabletScreen() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "10px 10px", background: "#0D1B3E" }}>
      <p
        style={{
          color: "#F1F5F9",
          fontSize: 10,
          fontWeight: 800,
          lineHeight: 1.3,
          marginBottom: 5,
        }}
      >
        Automate.<br />Engage.<br />Grow.
      </p>
      <p style={{ color: "#93C5FD", fontSize: 5, marginBottom: 9, lineHeight: 1.6 }}>
        Powerful automation configured that saves time and wins more customers.
      </p>
      <div
        style={{
          background: "#2563EB",
          color: "#fff",
          fontSize: 5.5,
          padding: "4px 10px",
          borderRadius: 4,
          display: "inline-block",
          marginBottom: 10,
          fontWeight: 600,
          boxShadow: "0 4px 10px rgba(37,99,235,0.4)",
        }}
      >
        Explore Automation
      </div>
      <p
        style={{
          color: "#475569",
          fontSize: 4.8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 7,
        }}
      >
        Workflow Overview
      </p>
      {[
        { label: "New Lead",         color: "#34D399" },
        { label: "Send Email",       color: "#60A5FA" },
        { label: "Follow Up",        color: "#818CF8" },
        { label: "Book Appointment", color: "#F59E0B" },
      ].map((step) => (
        <div
          key={step.label}
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: step.color,
              flexShrink: 0,
              boxShadow: `0 0 6px ${step.color}90`,
            }}
          />
          <span style={{ color: "#CBD5E1", fontSize: 6 }}>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Avatar Stack ──────────────────────────────────────────────────────────────
function AvatarStack() {
  const avatars = [
    { bg: "#2563EB", text: "JD" },
    { bg: "#6366F1", text: "MR" },
    { bg: "#10B981", text: "SK" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex" }}>
        {avatars.map((a, i) => (
          <div
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: a.bg,
              border: "2.5px solid #fff",
              marginLeft: i === 0 ? 0 : -10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: avatars.length - i,
              boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
            }}
          >
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{a.text}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={13} fill="#F59E0B" color="#F59E0B" />
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>
          Trusted by 10+ business owners
        </p>
      </div>
    </div>
  );
}

// ── Device Image 3D Hover (zoom + tilt) ───────────────────────────────────────
function DeviceImageHover() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onEnter = () => {
    if (!imgRef.current) return;
    imgRef.current.style.transform =
      "perspective(1200px) scale(1.06) rotateY(0deg) rotateX(0deg)";
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current || !imgRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 14;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8;
    imgRef.current.style.transform =
      `perspective(1200px) scale(1.07) rotateY(${x}deg) rotateX(${-y}deg)`;
  };

  const onLeave = () => {
    if (!imgRef.current) return;
    imgRef.current.style.transform =
      "perspective(1200px) scale(1) rotateY(0deg) rotateX(0deg)";
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ cursor: "pointer", display: "block", width: "100%" }}
    >
      <img
        ref={imgRef}
        src="/devices-hero.png"
        alt="SiteMint Digital on all devices"
        style={{
          width: 620,
          maxWidth: "100%",
          display: "block",
          borderRadius: 16,
          transformStyle: "preserve-3d",
          transition: "transform 0.32s cubic-bezier(0.23,1,0.32,1)",
          willChange: "transform",
          filter: "drop-shadow(0 32px 56px rgba(6,46,113,0.30)) drop-shadow(0 8px 18px rgba(0,0,0,0.22))",
        }}
      />
    </div>
  );
}

// ── Main Hero Section ─────────────────────────────────────────────────────────
export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <section
      style={{
        minHeight: "calc(100vh - 68px)",
        background: `linear-gradient(155deg, #cfdcf7 0%, #e4ecfb 20%, #f2f6fd 50%, #dce8f9 80%, #c8d9f5 100%)`,
        position: "relative",
        overflowX: "clip",
      }}
    >
      {/* Wave layer */}
      <WaveBackground />

      {/* Particles — full section, z=0 */}
      <Particles
        particleCount={40}
        particleColors={["#062e71", "#0a3d91", "#1255c4", "#3b82f6"]}
      />

      {/* Light radial glows */}
      <div
        style={{
          position: "absolute", top: -80, right: -80,
          width: 620, height: 620, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,46,113,0.14) 0%, transparent 70%)",
          pointerEvents: "none", zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute", bottom: -40, left: -60,
          width: 460, height: 460, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,46,113,0.08) 0%, transparent 70%)",
          pointerEvents: "none", zIndex: 1,
        }}
      />

      {/* ── Content ── */}
      <div
        className="hero-wrap"
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          paddingLeft: 56,
          paddingRight: 16,
          paddingTop: 52,
          paddingBottom: 60,
          position: "relative",
          zIndex: 10,
        }}
      >
        <div className="hero-row" style={{ display: "flex", alignItems: "flex-start", gap: 20, minHeight: 560 }}>

          {/* ── LEFT column ── */}
          <div className="hero-left" style={{ flex: "0 0 40%", maxWidth: "40%", paddingTop: 24 }}>

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(219,234,254,0.85)",
                border: "1px solid rgba(147,197,253,0.55)",
                borderRadius: 100,
                padding: "6px 14px",
                marginBottom: 24,
                backdropFilter: "blur(8px)",
              }}
            >
              <motion.span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#34d399",
                  display: "inline-block",
                }}
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(52,211,153,0.5)",
                    "0 0 0 6px rgba(52,211,153,0)",
                    "0 0 0 0 rgba(52,211,153,0)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: DEEP_NAVY }}>
                Now accepting new clients
              </span>
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
              {mounted && (
                <FlipWords
                  words={WORDS}
                  duration={2600}
                  className="font-black"
                  style={{ color: DEEP_NAVY } as React.CSSProperties}
                />
              )}
            </motion.h1>

            {/* Body */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{
                fontSize: 15,
                color: "#475569",
                lineHeight: 1.72,
                marginBottom: 28,
                maxWidth: 440,
              }}
            >
              We build growth-focused websites, CRM systems, automation workflows,
              client portals, and custom business applications for service businesses,
              nonprofits, real estate professionals, and growing organizations.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28 }}
              style={{ display: "flex", gap: 12, marginBottom: 26, alignItems: "center", flexWrap: "wrap" }}
            >
              <Link href="/discovery">
                <Button
                  size="lg"
                  className="!bg-[#062e71] hover:!bg-[#0a3d91] hover:shadow-[0_8px_28px_rgba(6,46,113,0.55)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "12px 18px",
                    borderRadius: 10,
                    height: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
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
          <div className="hero-right" style={{ flex: 1, position: "relative", minHeight: 520, overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center" }}>

            {/* Animated SVG connector lines between cards */}
            <FeatureConnectors />

            {/* Floating 3D Feature Cards — scattered around the device image */}
            <Feature3DCard card={FEATURE_CARDS[0]} style={{ top: 0,   right: -10 }} />
            <Feature3DCard card={FEATURE_CARDS[1]} style={{ top: -10, left: "28%" }} />
            <Feature3DCard card={FEATURE_CARDS[2]} style={{ bottom: 20, left: 0 }} />
            <Feature3DCard card={FEATURE_CARDS[3]} style={{ bottom: 0, right: 0 }} />

            {/* Devices — real image with 3D zoom-on-hover */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.32, ease: [0.23, 1, 0.32, 1] }}
              className="hero-device"
              style={{ width: "100%", zIndex: 2, marginTop: 60 }}
            >
              <DeviceImageHover />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
