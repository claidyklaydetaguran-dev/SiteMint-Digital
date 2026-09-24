/**
 * Frontend V2 Phase 2 — the shared public header.
 *
 * Accessibility contract (ACCESSIBILITY-REQUIREMENTS.md, owner requirements):
 * - Desktop and mobile navigation are fully keyboard operable.
 * - The Solutions submenu opens on hover **and** on focus/click, and is
 *   reachable by keyboard alone — hover behaviour always has focus parity.
 *   It is a `aria-expanded` disclosure rather than a menubar widget, because
 *   its children are ordinary links, not menu commands.
 * - The mobile drawer traps focus, closes on `Escape`, closes on route change,
 *   restores focus to the trigger, and every target is at least 44×44.
 * - Focus is never suppressed; `:focus-visible` rings come from the token layer.
 *
 * Layout stability: the header reserves its height with a fixed `min-height`
 * and the sticky bar never changes size on scroll, so nothing below it shifts
 * (no CLS from the chrome).
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import {
  primaryNavItems,
  signInHref,
  startProjectHref,
  startProjectLabel,
  type V2NavItem,
} from "./publicNav";

/**
 * True when `href` is the current page.
 *
 * In-page anchors are deliberately never "current": `Process` points at
 * `/#process`, which shares the homepage's path, so treating it as a page match
 * marked both `Home` and `Process` as `aria-current="page"` at the same time.
 */
function isActive(location: string, href?: string): boolean {
  if (!href || href.includes("#")) return false;
  return location === href;
}

function DesktopItem({ item, location }: { item: V2NavItem; location: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLLIElement>(null);
  const menuId = useId();

  // Close when focus or pointer leaves the whole item, and on Escape.
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
          className="v2-nav__link"
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
      className="v2-nav__item v2-nav__item--has-menu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="v2-nav__link v2-nav__link--trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {item.label}
        <ChevronDown aria-hidden="true" className="v2-nav__chevron" />
      </button>

      <div id={menuId} className="v2-nav__menu" hidden={!open}>
        <ul className="v2-nav__menu-list">
          {item.children.map((child) => (
            <li key={child.label}>
              <Link href={child.href} className="v2-nav__menu-link">
                <span className="v2-nav__menu-label">{child.label}</span>
                <span className="v2-nav__menu-desc">{child.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function SiteHeader() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Escape to close, and a focus trap while open.
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusables = drawer.querySelectorAll<HTMLElement>(
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
    // Move focus into the drawer once it is rendered.
    drawer?.querySelector<HTMLElement>("a[href], button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  // Return focus to the trigger when the drawer closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !menuOpen) triggerRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  return (
    <header className="v2-header">
      <div className="v2-header__bar">
        <Link href="/" className="v2-header__brand" aria-label="SiteMint Digital — home">
          <SiteMintLogo variant="dark" iconSize={30} />
        </Link>

        <nav className="v2-nav" aria-label="Primary">
          <ul className="v2-nav__list">
            {primaryNavItems.map((item) => (
              <DesktopItem key={item.label} item={item} location={location} />
            ))}
          </ul>
        </nav>

        <div className="v2-header__actions">
          {/* Cross-application document navigation — never a <Link>. */}
          <a href={signInHref} className="v2-header__signin">
            Sign In
          </a>
          <Link href={startProjectHref} className="v2-btn v2-btn--primary v2-header__cta">
            {startProjectLabel}
          </Link>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="v2-header__toggle"
          aria-expanded={menuOpen}
          aria-controls={drawerId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Menu aria-hidden="true" />
          <span className="v2-visually-hidden">
            {menuOpen ? "Close main menu" : "Open main menu"}
          </span>
        </button>
      </div>

      {menuOpen && (
        <div className="v2-drawer" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="v2-drawer__panel" id={drawerId} ref={drawerRef}>
            <div className="v2-drawer__head">
              <span className="v2-drawer__title">Menu</span>
              <button
                type="button"
                className="v2-drawer__close"
                onClick={() => setMenuOpen(false)}
              >
                <X aria-hidden="true" />
                <span className="v2-visually-hidden">Close main menu</span>
              </button>
            </div>

            <nav aria-label="Mobile primary">
              <ul className="v2-drawer__list">
                {primaryNavItems.map((item) =>
                  item.children ? (
                    <li key={item.label} className="v2-drawer__group">
                      <span className="v2-drawer__group-title">{item.label}</span>
                      <ul className="v2-drawer__sublist">
                        {item.children.map((child) => (
                          <li key={child.label}>
                            <Link href={child.href} className="v2-drawer__link">
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
                        className="v2-drawer__link"
                        aria-current={isActive(location, item.href) ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>

            <div className="v2-drawer__actions">
              <a href={signInHref} className="v2-btn v2-btn--secondary v2-drawer__action">
                Sign In
              </a>
              <Link
                href={startProjectHref}
                className="v2-btn v2-btn--primary v2-drawer__action"
              >
                {startProjectLabel}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default SiteHeader;
