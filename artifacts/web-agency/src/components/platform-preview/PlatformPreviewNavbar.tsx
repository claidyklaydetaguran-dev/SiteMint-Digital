import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { PlatformPreviewThemeToggle } from "./PlatformPreviewThemeToggle";
import {
  signInHref,
  companyNavItems,
  primaryNavItems,
  productsNavItems,
  servicesNavItems,
  startProjectHref,
  type PreviewNavItem,
} from "./navConfig";
import type { PlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";

function NavDropdown({ item, align = "center" }: { item: PreviewNavItem; align?: "center" | "end" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        containerRef.current?.querySelector("button")?.focus();
      }
    }

    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  if (!item.children) {
    return (
      <Link
        href={item.href!}
        className="pp-nav-trigger rounded-[var(--sm-radius-pill)] px-3.5 py-2 text-sm font-medium text-[hsl(var(--pp-text))]"
        aria-current={location === item.href ? "page" : undefined}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="pp-nav-trigger inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] px-3.5 py-2 text-sm font-medium text-[hsl(var(--pp-text))]"
      >
        {item.label}
        <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={item.label}
          className={`pp-dropdown-panel absolute top-full z-[var(--sm-z-dropdown)] mt-2 w-80 p-2 ${
            align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          {item.children.map((child) =>
            child.disabled ? (
              <div
                key={child.label}
                role="menuitem"
                aria-disabled="true"
                className="pp-dropdown-item flex flex-col gap-0.5 rounded-[var(--sm-radius-md)] px-3 py-2.5 opacity-60"
              >
                <span className="text-sm font-semibold text-[hsl(var(--pp-forest-deep))]">
                  {child.label}
                  <span className="ml-2 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--pp-mint-pale))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--pp-text-muted))]">
                    {child.disabledNote}
                  </span>
                </span>
                <span className="text-xs text-[hsl(var(--pp-text-muted))]">{child.description}</span>
              </div>
            ) : (
              <Link
                key={child.label}
                href={child.href!}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="pp-dropdown-item flex flex-col gap-0.5 rounded-[var(--sm-radius-md)] px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-[hsl(var(--pp-forest-deep))]">{child.label}</span>
                <span className="text-xs text-[hsl(var(--pp-text-muted))]">{child.description}</span>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function PlatformPreviewNavbar({
  theme,
  onToggleTheme,
  onOpenMobileMenu,
  showThemeToggle = false,
}: {
  theme: PlatformPreviewTheme;
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
  showThemeToggle?: boolean;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-[var(--sm-z-raised)] px-3 transition-[padding] md:px-6" style={{ paddingTop: isScrolled ? "0.5rem" : "1rem" }}>
      <div
        className="mx-auto flex max-w-[1280px] items-center justify-between rounded-[var(--sm-radius-pill)] px-4 transition-[height,box-shadow,background-color] md:px-6"
        style={{
          height: isScrolled ? "56px" : "68px",
          backgroundColor: isScrolled ? "hsl(var(--pp-mint-warm-white) / 0.96)" : "hsl(var(--pp-mint-warm-white) / 0.78)",
          backdropFilter: "blur(18px)",
          border: "1px solid hsl(var(--pp-mint-mist) / 0.9)",
          boxShadow: isScrolled
            ? "0 1px 2px hsl(var(--pp-shadow) / 0.05), 0 10px 24px -10px hsl(var(--pp-shadow) / 0.2)"
            : "0 1px 2px hsl(var(--pp-shadow) / 0.04), 0 6px 18px -10px hsl(var(--pp-shadow) / 0.14)",
        }}
      >
        <Link href="/platform-preview" className="inline-flex items-center" aria-label="SiteMint Digital home">
          <SiteMintLogo variant="dark" iconSize={30} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {primaryNavItems.map((item) => (
            <NavDropdown key={item.label} item={item} align={item.label === "Company" ? "end" : "center"} />
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {showThemeToggle && <PlatformPreviewThemeToggle theme={theme} onToggle={onToggleTheme} />}
          <span aria-hidden="true" className="h-6 w-px" style={{ backgroundColor: "hsl(var(--pp-mint-mist))" }} />
          <Link
            href={signInHref}
            aria-label="Sign in to AI Receptionist"
            className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-4 py-2 text-sm font-medium"
          >
            Sign In
          </Link>
          <Link href={startProjectHref} className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-4 py-2 text-sm font-semibold">
            Start a Project
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {showThemeToggle && <PlatformPreviewThemeToggle theme={theme} onToggle={onToggleTheme} />}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-md)] border text-[hsl(var(--pp-forest-deep))]"
            style={{ borderColor: "hsl(var(--pp-mint-mist))" }}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

export { productsNavItems, servicesNavItems, companyNavItems };
