import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import {
  MessageSquare,
  Settings,
  Bot,
  LogOut,
  Menu,
  X,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Firm {
  id: number;
  name: string;
  email: string | null;
  planTier: string;
  trialConversationsLimit: number;
  createdAt: string;
}

interface MeResponse {
  firm: Firm;
  conversationCount: number;
}

interface ReceptionistAppShellProps {
  children: ReactNode;
}

// ── Nav items ──────────────────────────────────────────────────────────────────

const NAV = [
  { label: "Conversations", href: "/app",              icon: MessageSquare },
  { label: "Agent Config",  href: "/app/agent-config", icon: Bot },
  { label: "Settings",      href: "/app/settings",     icon: Settings },
];

// ── Context (simple prop-drill — no additional context library needed) ─────────

export function useReceptionistShell() {
  return null;
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export default function ReceptionistAppShell({ children }: ReceptionistAppShellProps) {
  const [location, navigate] = useLocation();
  const [me,        setMe]    = useState<MeResponse | null>(null);
  const [loading,   setLoading] = useState(true);
  const [sideOpen,  setSideOpen] = useState(false);

  useEffect(() => {
    fetch("/api/receptionist/auth/me", { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) { navigate("/app/login"); return; }
        const d = await r.json() as MeResponse;
        setMe(d);
      })
      .catch(() => navigate("/app/login"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" });
    navigate("/app/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!me) return null;

  const used      = me.conversationCount;
  const limit     = me.firm.trialConversationsLimit;
  const pct       = Math.min(100, Math.round((used / limit) * 100));
  const isTrial   = me.firm.planTier !== "paid";
  const nearLimit = isTrial && pct >= 80;

  // Height of the top banner — used to offset fixed/sticky elements below it.
  // 0 when banner is hidden (paid plan) so layout stays flush.
  const BANNER_H = isTrial ? 38 : 0;
  // Height of the mobile top bar itself (approximately)
  const TOPBAR_H = 48;

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      style={{
        width: mobile ? "100%" : 240,
        background: "#fff",
        borderRight: mobile ? "none" : "1px solid rgba(6,46,113,0.09)",
        display: "flex",
        flexDirection: "column",
        height: mobile ? "auto" : "100%",
        padding: mobile ? "16px 12px 24px" : "24px 12px",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "0 10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/ai-receptionist">
          <SiteMintLogo variant="dark" iconSize={26} />
        </Link>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "#fff",
          background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
          padding: "2px 7px", borderRadius: 100, flexShrink: 0,
        }}>
          AI Receptionist
        </span>
      </div>

      {/* Nav links */}
      {NAV.map(({ label, href, icon: Icon }) => {
        const active = location === href || (href !== "/app" && location.startsWith(href));
        return (
          <Link key={href} href={href} onClick={() => setSideOpen(false)}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                background: active ? "rgba(6,46,113,0.08)" : "transparent",
                color: active ? "#062e71" : "#6b7280",
                fontWeight: active ? 600 : 500,
                fontSize: 13.5,
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "rgba(6,46,113,0.04)";
                  e.currentTarget.style.color = "#062e71";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#6b7280";
                }
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </div>
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Firm name + logout */}
      <div style={{ padding: "12px 12px 0", borderTop: "1px solid rgba(6,46,113,0.07)" }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: "#374151", marginBottom: 2 }}>
          {me.firm.name}
        </p>
        <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>
          {me.firm.email}
        </p>
        <button
          onClick={logout}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 12.5, fontWeight: 500, color: "#6b7280",
            background: "none", border: "none", cursor: "pointer",
            padding: "6px 8px", borderRadius: 8,
            transition: "color 0.15s, background 0.15s",
            width: "100%",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ef4444";
            e.currentTarget.style.background = "rgba(239,68,68,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6b7280";
            e.currentTarget.style.background = "none";
          }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc" }}>

      {/* ── Trial banner — hidden entirely for paid plans ── */}
      {isTrial && (
        <div style={{
          background: nearLimit
            ? "linear-gradient(90deg, #b45309 0%, #d97706 100%)"
            : "linear-gradient(90deg, #062e71 0%, #1249a8 100%)",
          color: "#fff",
          padding: "9px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontSize: 12.5,
          fontWeight: 500,
          flexWrap: "wrap",
          rowGap: 6,
        }}>
          {nearLimit && <AlertCircle size={14} style={{ flexShrink: 0 }} />}
          <span>
            Trial usage: <strong>{used}</strong> / <strong>{limit}</strong> conversations
          </span>
          {/* Progress bar */}
          <div style={{
            width: 80, height: 4, background: "rgba(255,255,255,0.25)",
            borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: pct >= 80 ? "#fde68a" : "#7dd3fc",
              borderRadius: 4,
              transition: "width 0.4s ease",
            }} />
          </div>
          {/* Upgrade pill — shown from 80% onward (near-limit + at-limit) */}
          {nearLimit && (
            <a
              href="/app/settings#upgrade"
              style={{
                marginLeft: 4,
                fontSize: 11.5, fontWeight: 700, color: "#fff",
                background: "rgba(255,255,255,0.20)",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 100, padding: "2px 10px",
                textDecoration: "none", flexShrink: 0,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.30)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.20)"; }}
            >
              Upgrade →
            </a>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Desktop sidebar */}
        <div
          className="hidden md:flex"
          style={{ flexDirection: "column", height: `calc(100vh - ${BANNER_H}px)`, position: "sticky", top: 0 }}
        >
          <Sidebar />
        </div>

        {/* Mobile top bar */}
        <div className="md:hidden" style={{
          position: "fixed", top: BANNER_H, left: 0, right: 0, zIndex: 40,
          background: "#fff",
          borderBottom: "1px solid rgba(6,46,113,0.09)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          height: TOPBAR_H,
        }}>
          <Link href="/ai-receptionist">
            <SiteMintLogo variant="dark" iconSize={24} />
          </Link>
          <button
            onClick={() => setSideOpen((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#062e71", padding: 4 }}
          >
            {sideOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {sideOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="md:hidden"
              style={{
                position: "fixed",
                top: BANNER_H + TOPBAR_H,
                left: 0, right: 0, bottom: 0,
                background: "#fff", zIndex: 35,
                boxShadow: "4px 0 24px rgba(0,0,0,0.10)",
              }}
            >
              <Sidebar mobile />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content — pt-[50px] clears the fixed mobile top bar on small screens */}
        <main
          style={{ flex: 1, overflowY: "auto" }}
          className="pt-[50px] md:pt-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
