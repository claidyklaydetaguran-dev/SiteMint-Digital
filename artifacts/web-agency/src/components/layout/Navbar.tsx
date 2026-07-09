import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteMintLogo } from "@/components/SiteMintLogo";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Services", href: "/services" },
  { name: "Pricing", href: "/pricing" },
  { name: "Portfolio", href: "/portfolio" },
  { name: "About", href: "/about" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-center pt-4 px-4">
      {/* Floating pill */}
      <div
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(203,213,225,0.55)",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(6,46,113,0.10), 0 1px 4px rgba(0,0,0,0.06)",
          padding: "8px 16px 8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          width: "100%",
          maxWidth: 860,
          transition: "box-shadow 0.3s, background 0.3s",
          ...(isScrolled && {
            boxShadow: "0 8px 32px rgba(6,46,113,0.14), 0 1px 4px rgba(0,0,0,0.08)",
          }),
        }}
      >
        <Link href="/" className="flex-shrink-0">
          <SiteMintLogo variant="dark" iconSize={30} />
        </Link>

        {/* Desktop Nav links */}
        <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative text-sm font-medium transition-colors hover:text-primary"
              style={{ color: location === link.href ? "#062e71" : "#64748B" }}
            >
              {link.name}
              {location === link.href && (
                <span
                  style={{
                    position: "absolute",
                    bottom: -4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#062e71",
                  }}
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href="/discovery" className="hidden md:block">
            <Button
              className="!bg-[#062e71] hover:!bg-[#0a3d91] hover:shadow-[0_6px_22px_rgba(6,46,113,0.40)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
              style={{ borderRadius: 10, fontSize: 13, fontWeight: 600 }}
              data-testid="button-nav-contact"
            >
              Start Your Project
            </Button>
          </Link>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-slate-600 p-1.5"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% - 4px)",
            left: 16,
            right: 16,
            maxWidth: 860,
            margin: "0 auto",
            background: "rgba(255,255,255,0.97)",
            border: "1px solid rgba(203,213,225,0.55)",
            borderRadius: "0 0 16px 16px",
            boxShadow: "0 8px 24px rgba(6,46,113,0.10)",
            padding: "12px 20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: 15,
                fontWeight: 500,
                padding: "10px 0",
                borderBottom: "1px solid rgba(226,232,240,0.6)",
                color: location === link.href ? "#062e71" : "#374151",
              }}
            >
              {link.name}
            </Link>
          ))}
          <Link href="/discovery" className="mt-2">
            <Button
              className="w-full !bg-[#062e71] hover:!bg-[#0a3d91]"
              size="lg"
              data-testid="button-mobile-nav-contact"
            >
              Start Your Project
            </Button>
          </Link>
        </div>
      )}
    </header>
  );
}
