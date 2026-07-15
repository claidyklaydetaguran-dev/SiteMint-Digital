import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { motion, AnimatePresence } from "framer-motion";

const scrollLinks = [
  { name: "Features",     href: "/#features" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "Pricing",      href: "/#pricing" },
  { name: "FAQ",          href: "/#faq" },
];

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function NavLink({ name, sectionId, mobile }: { name: string; sectionId: string; mobile?: boolean }) {
  const [hovered, setHovered] = useState(false);

  if (mobile) {
    return (
      <button
        onClick={() => scrollTo(sectionId)}
        style={{
          width: "100%", textAlign: "left",
          padding: "11px 14px",
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10,
          background: "transparent",
          border: "none", cursor: "pointer",
          transition: "background 0.18s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(6,46,113,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: "#374151", marginLeft: 15 }}>
          {name}
        </span>
      </button>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => scrollTo(sectionId)}
      style={{ position: "relative", padding: "7px 13px", borderRadius: 100, cursor: "pointer" }}
    >
      <AnimatePresence>
        {hovered && (
          <motion.span
            layoutId="recep-nav-hover-pill"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute", inset: 0, borderRadius: 100,
              background: "rgba(6,46,113,0.07)", pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>
      <span style={{
        fontSize: 13.5, fontWeight: 500, color: "#374151",
        letterSpacing: "-0.01em", position: "relative",
      }}>
        {name}
      </span>
    </div>
  );
}

export function ReceptionistNav() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed", top: 0, left: 0, right: 0,
        zIndex: 50, padding: "14px 20px", pointerEvents: "none",
      }}
    >
      {/* ── Floating pill ── */}
      <div
        style={{
          maxWidth: 860, margin: "0 auto",
          background: isScrolled ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.76)",
          backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
          border: `1px solid ${isScrolled ? "rgba(6,46,113,0.22)" : "rgba(6,46,113,0.13)"}`,
          borderRadius: 100,
          padding: "7px 7px 7px 18px",
          boxShadow: isScrolled
            ? "0 8px 40px rgba(6,46,113,0.18), 0 2px 8px rgba(0,0,0,0.07)"
            : "0 4px 28px rgba(6,46,113,0.11)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
          pointerEvents: "auto",
        }}
      >
        {/* ── Logo + product badge ── */}
        <Link href="/ai-receptionist">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SiteMintLogo variant="dark" iconSize={28} />
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "#fff",
              background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
              padding: "2px 7px", borderRadius: 100,
              lineHeight: 1.5, flexShrink: 0,
            }}>
              AI Receptionist
            </span>
          </div>
        </Link>

        {/* ── Desktop scroll links ── */}
        <nav className="hidden md:flex" style={{ alignItems: "center", gap: 2 }}>
          {scrollLinks.map((link) => (
            <NavLink
              key={link.href}
              name={link.name}
              sectionId={link.href.replace("/#", "")}
            />
          ))}
        </nav>

        {/* ── CTA ── */}
        <div className="hidden md:block">
          <Link href="/ai-receptionist/signup">
            <Button
              style={{
                background: "linear-gradient(135deg, #062e71 0%, #0a3d91 100%)",
                color: "#fff", fontSize: 13, fontWeight: 700,
                padding: "9px 18px", borderRadius: 100, height: "auto",
                border: "none",
                boxShadow: "0 2px 12px rgba(6,46,113,0.32), inset 0 1px 0 rgba(255,255,255,0.12)",
                letterSpacing: "-0.01em", transition: "box-shadow 0.2s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 6px 22px rgba(6,46,113,0.52), inset 0 1px 0 rgba(255,255,255,0.14)";
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 2px 12px rgba(6,46,113,0.32), inset 0 1px 0 rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              }}
            >
              Get early access
            </Button>
          </Link>
        </div>

        {/* ── Mobile toggle ── */}
        <button
          className="md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: isOpen ? "rgba(6,46,113,0.10)" : "rgba(6,46,113,0.06)",
            border: "1px solid rgba(6,46,113,0.14)", color: "#062e71",
            cursor: "pointer", transition: "background 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isOpen
              ? <motion.span key="x"
                  initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <X size={18} />
                </motion.span>
              : <motion.span key="menu"
                  initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Menu size={18} />
                </motion.span>
            }
          </AnimatePresence>
        </button>
      </div>

      {/* ── Mobile dropdown ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -8,   scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{
              maxWidth: 860, margin: "8px auto 0",
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
              border: "1px solid rgba(6,46,113,0.16)", borderRadius: 20,
              padding: "12px 12px 16px",
              boxShadow: "0 12px 40px rgba(6,46,113,0.16)", pointerEvents: "auto",
            }}
          >
            {scrollLinks.map((link, i) => (
              <motion.div
                key={link.href}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                onClick={() => setIsOpen(false)}
              >
                <NavLink
                  name={link.name}
                  sectionId={link.href.replace("/#", "")}
                  mobile
                />
              </motion.div>
            ))}

            <div style={{ padding: "8px 4px 0" }}>
              <Link href="/ai-receptionist/signup">
                <Button
                  size="lg"
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #062e71 0%, #0a3d91 100%)",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    borderRadius: 12, height: "auto", padding: "13px",
                    border: "none", boxShadow: "0 4px 16px rgba(6,46,113,0.36)",
                  }}
                >
                  Get early access
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
