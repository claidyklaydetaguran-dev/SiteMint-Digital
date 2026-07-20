import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { PlatformPreviewThemeToggle } from "./PlatformPreviewThemeToggle";
import {
  clientLoginHref,
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
        className="rounded-[var(--sm-radius-pill)] px-3 py-2 text-sm font-medium text-[hsl(var(--sm-color-text-secondary))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))] aria-[current=page]:text-[hsl(var(--sm-color-action-primary))]"
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
        className="inline-flex items-center gap-1 rounded-[var(--sm-radius-pill)] px-3 py-2 text-sm font-medium text-[hsl(var(--sm-color-text-secondary))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]"
      >
        {item.label}
        <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={item.label}
          className={`absolute top-full z-[var(--sm-z-dropdown)] mt-2 w-80 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-bg-elevated))] p-2 shadow-[var(--sm-shadow-lg)] ${
            align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          {item.children.map((child) =>
            child.disabled ? (
              <div
                key={child.label}
                role="menuitem"
                aria-disabled="true"
                className="flex flex-col gap-0.5 rounded-[var(--sm-radius-md)] px-3 py-2.5 opacity-60"
              >
                <span className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">
                  {child.label}
                  <span className="ml-2 rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-color-surface-muted))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">
                    {child.disabledNote}
                  </span>
                </span>
                <span className="text-xs text-[hsl(var(--sm-color-text-muted))]">{child.description}</span>
              </div>
            ) : (
              <Link
                key={child.label}
                href={child.href!}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex flex-col gap-0.5 rounded-[var(--sm-radius-md)] px-3 py-2.5 transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
              >
                <span className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">{child.label}</span>
                <span className="text-xs text-[hsl(var(--sm-color-text-muted))]">{child.description}</span>
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
}: {
  theme: PlatformPreviewTheme;
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-[var(--sm-z-raised)] border-b transition-colors"
      style={{
        borderColor: isScrolled ? "hsl(var(--sm-color-border-default))" : "transparent",
        backgroundColor: isScrolled ? "hsl(var(--sm-color-bg-elevated) / 0.92)" : "hsl(var(--sm-color-bg-elevated) / 0.6)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="inline-flex items-center" aria-label="SiteMint Digital home">
          <SiteMintLogo variant="dark" iconSize={30} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {primaryNavItems.map((item) => (
            <NavDropdown key={item.label} item={item} align={item.label === "Company" ? "end" : "center"} />
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <PlatformPreviewThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link
            href={clientLoginHref}
            className="rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-strong))] px-4 py-2 text-sm font-medium text-[hsl(var(--sm-color-text-primary))] transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
          >
            Client Login
          </Link>
          <Link
            href={startProjectHref}
            className="rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-4 py-2 text-sm font-semibold text-[var(--sm-button-primary-text)] shadow-[var(--sm-shadow-sm)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
          >
            Start a Project
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <PlatformPreviewThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-md)] border border-[hsl(var(--sm-color-border-default))] text-[hsl(var(--sm-color-text-primary))]"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

export { productsNavItems, servicesNavItems, companyNavItems };
