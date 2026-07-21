import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { name: "Home",      href: "/" },
  { name: "Services",  href: "/services" },
  { name: "Pricing",   href: "/pricing" },
  { name: "Portfolio", href: "/portfolio" },
  { name: "About",     href: "/about" },
];

export function Navbar() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [location]                = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setIsOpen(false); }, [location]);

  return (
    <header
      style={{
        position: "fixed", top: 0, left: 0, right: 0,
        zIndex: 50,
        padding: "14px 20px",
        pointerEvents: "none",
      }}
    >
      {/* ── Floating pill ── */}
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
          background: isScrolled
            ? "rgba(255,255,255,0.92)"
            : "rgba(255,255,255,0.76)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          border: `1px solid ${isScrolled ? "rgba(77,203,151,0.22)" : "rgba(77,203,151,0.13)"}`,
          borderRadius: 100,
          padding: "7px 7px 7px 22px",
          boxShadow: isScrolled
            ? "0 8px 40px rgba(77,203,151,0.18), 0 2px 8px rgba(0,0,0,0.07)"
            : "0 4px 28px rgba(77,203,151,0.11)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
          pointerEvents: "auto",
        }}
      >
        {/* Logo */}
        <Link href="/">
          <SiteMintLogo variant="dark" iconSize={30} />
        </Link>

        {/* ── Desktop nav ── */}
        <nav
          className="hidden md:flex"
          style={{ alignItems: "center", gap: 2 }}
        >
          {navLinks.map((link) => {
            const active = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div
                  onMouseEnter={() => setHoveredLink(link.href)}
                  onMouseLeave={() => setHoveredLink(null)}
                  style={{
                    position: "relative",
                    padding: "7px 13px",
                    borderRadius: 100,
                    cursor: "pointer",
                  }}
                >
                  {/* Hover pill bg */}
                  <AnimatePresence>
                    {hoveredLink === link.href && (
                      <motion.span
                        layoutId="nav-hover-pill"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{
                          position: "absolute", inset: 0,
                          borderRadius: 100,
                          background: "rgba(77,203,151,0.07)",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#16233d" : "#374151",
                      letterSpacing: "-0.01em",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      transition: "color 0.2s",
                    }}
                  >
                    {link.name}
                    {/* Active dot */}
                    {active && (
                      <motion.span
                        layoutId="nav-active-dot"
                        style={{
                          width: 4, height: 4, borderRadius: "50%",
                          background: "#16233d",
                          display: "block",
                        }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* ── CTA button ── */}
        <div className="hidden md:block">
          <Link href="/discovery">
            <Button
              data-testid="button-nav-contact"
              style={{
                background: "linear-gradient(135deg, #7fdbb6 0%, #4dcb97 100%)",
                color: "#16233d",
                fontSize: 13,
                fontWeight: 700,
                padding: "9px 18px",
                borderRadius: 100,
                height: "auto",
                border: "none",
                boxShadow: "0 2px 12px rgba(77,203,151,0.32), inset 0 1px 0 rgba(255,255,255,0.12)",
                letterSpacing: "-0.01em",
                transition: "box-shadow 0.2s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 6px 22px rgba(77,203,151,0.52), inset 0 1px 0 rgba(255,255,255,0.14)";
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 2px 12px rgba(77,203,151,0.32), inset 0 1px 0 rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              }}
            >
              Start Your Project
            </Button>
          </Link>
        </div>

        {/* ── Mobile toggle ── */}
        <button
          className="md:hidden items-center justify-center"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: isOpen ? "rgba(77,203,151,0.10)" : "rgba(77,203,151,0.06)",
            border: "1px solid rgba(77,203,151,0.14)",
            color: "#16233d",
            cursor: "pointer",
            transition: "background 0.2s",
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
              maxWidth: 860,
              margin: "8px auto 0",
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              border: "1px solid rgba(77,203,151,0.16)",
              borderRadius: 20,
              padding: "12px 12px 16px",
              boxShadow: "0 12px 40px rgba(77,203,151,0.16)",
              pointerEvents: "auto",
            }}
          >
            {navLinks.map((link, i) => {
              const active = location === link.href;
              return (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                >
                  <Link href={link.href}>
                    <div
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        display: "flex", alignItems: "center", gap: 10,
                        background: active ? "rgba(77,203,151,0.07)" : "transparent",
                        transition: "background 0.18s",
                        cursor: "pointer",
                      }}
                    >
                      {active && (
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: "#16233d", flexShrink: 0,
                        }} />
                      )}
                      <span style={{
                        fontSize: 15, fontWeight: active ? 700 : 500,
                        color: active ? "#16233d" : "#374151",
                        marginLeft: active ? 0 : 15,
                      }}>
                        {link.name}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}

            <div style={{ padding: "8px 4px 0" }}>
              <Link href="/discovery">
                <Button
                  size="lg"
                  data-testid="button-mobile-nav-contact"
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #7fdbb6 0%, #4dcb97 100%)",
                    color: "#16233d",
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 12,
                    height: "auto",
                    padding: "13px",
                    border: "none",
                    boxShadow: "0 4px 16px rgba(77,203,151,0.36)",
                  }}
                >
                  Start Your Project
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
