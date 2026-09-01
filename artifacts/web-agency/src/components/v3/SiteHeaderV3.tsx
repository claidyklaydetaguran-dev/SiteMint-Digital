/**
 * Frontend V3 — the floating public header.
 *
 * Behaviour carried over from the V2 header verbatim (the accessibility
 * contract is identical): keyboard-operable Services disclosure with hover +
 * focus parity, mobile sheet with focus trap / Escape / route-change close /
 * focus restore, 44px targets, focus never suppressed.
 *
 * V3 additions:
 * - `tone="ink" | "light"` — pages with an ink hero start the header
 *   transparent over it; light pages start on porcelain. Both compact into a
 *   blurred floating bar once the page scrolls (`data-scrolled`).
 * - The bar reserves its height via the shell (`.v3-shell--ink` overlays,
 *   light pages pad), so scrolling never shifts layout.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { SiteMintMarkV3 } from "./SiteMintMarkV3";
import {
  primaryNavV3,
  signInHrefV3,
  startHrefV3,
  startLabelV3,
  type V3NavItem,
} from "./publicNavV3";

function isActive(location: string, href?: string): boolean {
  if (!href || href.includes("#")) return false;
  return location === href;
}

function DesktopItem({ item, location }: { item: V3NavItem; location: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLLIElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        wrapRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!item.children) {
    return (
      <li>
        <Link
          href={item.href!}
          className="v3-nav__link"
          aria-current={isActive(location, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li
      ref={wrapRef}
      className="v3-nav__item v3-nav__item--has-menu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="v3-nav__link v3-nav__link--trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {item.label}
        <ChevronDown aria-hidden="true" className="v3-nav__chevron" />
      </button>

      <div id={menuId} className="v3-nav__menu" hidden={!open}>
        <ul className="v3-nav__menu-list">
          {item.children.map((child) => (
            <li key={child.label}>
              <Link href={child.href} className="v3-nav__menu-link">
                <span className="v3-nav__menu-label">{child.label}</span>
                <span className="v3-nav__menu-desc">{child.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export interface SiteHeaderV3Props {
  tone?: "ink" | "light";
}

export function SiteHeaderV3({ tone = "light" }: SiteHeaderV3Props) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  // Compact the bar once the page has meaningfully scrolled.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Escape to close + focus trap while open.
  useEffect(() => {
    if (!menuOpen) return;
    const sheet = sheetRef.current;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sheet) return;
      const focusables = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    sheet?.querySelector<HTMLElement>("a[href], button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  // Return focus to the trigger when the sheet closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !menuOpen) triggerRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  return (
    <header
      className="v3-header"
      data-nav-tone={tone}
      data-scrolled={scrolled || undefined}
    >
      <div className="v3-header__bar">
        <Link href="/" className="v3-header__brand" aria-label="SiteMint Digital — home">
          <SiteMintMarkV3 size={30} />
        </Link>

        <nav className="v3-nav" aria-label="Primary">
          <ul className="v3-nav__list">
            {primaryNavV3.map((item) => (
              <DesktopItem key={item.label} item={item} location={location} />
            ))}
          </ul>
        </nav>

        <div className="v3-header__actions">
          {/* Cross-application document navigation — never a <Link>. */}
          <a href={signInHrefV3} className="v3-header__signin">
            Sign in
          </a>
          <Link href={startHrefV3} className="v3-btn v3-btn--primary v3-header__cta">
            {startLabelV3}
          </Link>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="v3-header__toggle"
          aria-expanded={menuOpen}
          aria-controls={sheetId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Menu aria-hidden="true" />
          <span className="v2-visually-hidden">
            {menuOpen ? "Close main menu" : "Open main menu"}
          </span>
        </button>
      </div>

      {menuOpen && (
        <div className="v3-sheet" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="v3-sheet__panel" id={sheetId} ref={sheetRef}>
            <div className="v3-sheet__head">
              <SiteMintMarkV3 size={26} />
              <button
                type="button"
                className="v3-sheet__close"
                onClick={() => setMenuOpen(false)}
              >
                <X aria-hidden="true" />
                <span className="v2-visually-hidden">Close main menu</span>
              </button>
            </div>

            <nav aria-label="Mobile primary">
              <ul className="v3-sheet__list">
                {primaryNavV3.map((item) =>
                  item.children ? (
                    <li key={item.label} className="v3-sheet__group">
                      <span className="v3-sheet__group-title">{item.label}</span>
                      <ul className="v3-sheet__sublist">
                        {item.children.map((child) => (
                          <li key={child.label}>
                            <Link href={child.href} className="v3-sheet__link">
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li key={item.label}>
                      <Link
                        href={item.href!}
                        className="v3-sheet__link"
                        aria-current={isActive(location, item.href) ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>

            <div className="v3-sheet__actions">
              <a href={signInHrefV3} className="v3-btn v3-btn--outline v3-sheet__action">
                Sign in
              </a>
              <Link href={startHrefV3} className="v3-btn v3-btn--primary v3-sheet__action">
                {startLabelV3}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default SiteHeaderV3;
