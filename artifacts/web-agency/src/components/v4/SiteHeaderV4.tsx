/**
 * Frontend V4 — the Signal public header.
 *
 * Accessibility contract carried from V3 verbatim: keyboard-operable
 * disclosure, mobile sheet with focus trap / Escape / route-change close /
 * focus restore, 44px targets, focus never suppressed.
 *
 * V4 changes (owner correction pass, binding):
 * - "What We Build" is **click-operated only** — pointer movement never
 *   opens or closes it. Escape and outside-click dismiss it; Escape restores
 *   focus to the trigger; ArrowLeft/ArrowRight move between panel cards.
 * - "Client Sign In" is a quiet utility link; "Start a Project" is the one
 *   filled CTA.
 * - The AI Receptionist product entry is an outlined pill with a live dot.
 * - The mobile sheet groups destinations into deliberate expandables
 *   (What We Build · Company) instead of one flat list.
 *
 * Product-mode redesign (owner review: "the nav bar on AI Receptionist,
 * it's too messy"). The defect was structural, not cosmetic: `headerMode=
 * "product"` used to render the *entire* company nav (What We Build panel +
 * Work/Process/Company + the redundant AI Receptionist pill) and then bolt
 * two extra CTAs onto the end — seven interactive targets in one row.
 * Product mode now renders its own lean row instead of extending the
 * company one: brand → quiet separator → "AI Receptionist" as plain text
 * (no pill, we're already on that page) → the product sub-nav → "Sign in" →
 * one primary CTA. See the "Product-mode header" CSS block in v4-chrome.css
 * for the responsive collapse strategy. Company mode's JSX and CSS are
 * untouched — every product-only rule is scoped under `[data-mode=
 * "product"]`.
 *
 * Product sub-nav repair (owner review, 2026-09-06, full-viewport product
 * theater): the three quick links above were replaced with a full,
 * verified sub-nav (`productSubNavV4`) — Overview, Try the Demo, How It
 * Works, Capabilities, Setup & Integrations, Business Uses, FAQ, each
 * mapped to a real anchor id on the AI Receptionist page — plus
 * IntersectionObserver-driven active-section tracking
 * (`useProductSubNavActiveId`) so the current section carries
 * `aria-current="true"` on both the desktop row and, now, the mobile sheet
 * (which previously showed the company nav in product mode with no in-page
 * links at all).
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, X } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { dispatchIntroReplay, scrollToTop } from "@/lib/scrollBehavior";
import { SignalMarkV4 } from "./SignalMarkV4";
import { SignalGlyphV4 } from "./SignalGlyphsV4";
import {
  primaryNavV4,
  productNavV4,
  signInHrefV4,
  signInLabelV4,
  startHrefV4,
  startLabelV4,
  whatWeBuildV4,
  requestBetaHrefV4,
} from "./publicNavV4";

/**
 * Product sub-navigation (owner review fix, 2026-09-06 — "the nav bar on
 * AI Receptionist, it's too messy" plus "repair its product navigation").
 * The previous three quick links pointed at only three sections and had no
 * mobile presence and no active-state indication. Every id below is a real,
 * rendered anchor on the AI Receptionist page — six of the seven are ids
 * from `pages/receptionist-v5/sections.ts` (`RECEPTIONIST_V5_SECTIONS`);
 * `hero-theater` is the id on the embedded call theater inside the hero
 * (`HeroCallTheaterV5` in `components/receptionist-v5/CallTheaterV5.tsx`,
 * rendered from `pages/AiReceptionistV5.tsx`). "Request Private Beta" is
 * not in this list — it's the existing primary CTA button, not a quiet
 * in-page link. Kept local to the header rather than in `publicNavV4.ts`
 * since this component is the only consumer.
 */
const productSubNavV4: { id: string; label: string; href: string }[] = [
  { id: "hero", label: "Overview", href: `#hero` },
  { id: "hero-theater", label: "Try the Demo", href: `#hero-theater` },
  { id: "scheduling", label: "How It Works", href: `#scheduling` },
  { id: "what-it-does", label: "Capabilities", href: `#what-it-does` },
  { id: "setup", label: "Setup & Integrations", href: `#setup` },
  { id: "use-cases", label: "Business Uses", href: `#use-cases` },
  { id: "faq", label: "FAQ", href: `#faq` },
];

const productSubNavIdsV4 = productSubNavV4.map((item) => item.id);

/**
 * Scrollspy for the product sub-nav: tracks which anchored section is
 * currently in view so the matching link can carry `aria-current="true"`
 * plus a visual state (`.v4-product-nav__link[aria-current="true"]` /
 * `.v4-sheet__link[aria-current="true"]` in v4-chrome.css). `enabled` gates
 * the observer entirely — the six-plus-one ids this watches only exist on
 * the AI Receptionist page, so this never runs in company mode. The
 * `-96px … -55%` root margin arms a section as active once it clears the
 * fixed header, and prefers the earliest-still-visible section when more
 * than one qualifies (e.g. short sections near a fast scroll).
 */
function useProductSubNavActiveId(enabled: boolean, ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ids.join("|")]);

  return activeId;
}

function isActive(location: string, href?: string): boolean {
  if (!href || href.includes("#")) return false;
  return location === href;
}

/** True when the current route is one of the "What We Build" pillar pages. */
function isPillarActive(location: string): boolean {
  return whatWeBuildV4.some((item) => isActive(location, item.href));
}

/**
 * Owner routing directive (2026-09-05): clicking the wordmark, or a
 * top-level nav item, for the page the visitor is ALREADY on must not
 * navigate — wouter would no-op that anyway, since the pathname doesn't
 * change — it resets that page to the top and replays its introduction in
 * place (see `useIntroReplay.ts`). `active` says whether the link's target
 * is the current route; `onNavigate` runs first so a caller can close a
 * mobile sheet, which a same-pathname click otherwise leaves open (the
 * sheet's own auto-close effect only fires on an actual location change).
 */
function handleActiveNavClick(
  e: ReactMouseEvent<HTMLAnchorElement>,
  active: boolean,
  onNavigate?: () => void,
): void {
  if (!active) return;
  e.preventDefault();
  onNavigate?.();
  scrollToTop();
  dispatchIntroReplay();
}

export interface SiteHeaderV4Props {
  tone?: "ink" | "light";
  /**
   * IA §3 / L-7: `"product"` replaces the whole company row (What We Build
   * panel, Work/Process/Company, the AI Receptionist pill, Client Sign In,
   * Start a Project) with a dedicated, lean product row: brand, "AI
   * Receptionist" as plain text, up to three in-page quick links, "Sign
   * in", and one primary CTA ("Request Beta"). The AI Receptionist route
   * passes this; every other public route stays `"company"` (default).
   */
  headerMode?: "company" | "product";
}

export function SiteHeaderV4({ tone = "light", headerMode = "company" }: SiteHeaderV4Props) {
  const [location] = useLocation();
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const sheetId = useId();
  const activeSubNavId = useProductSubNavActiveId(headerMode === "product", productSubNavIdsV4);

  // Ink-hero pages let the transparent-dark bar sit over the hero until the
  // page scrolls past it; light pages are light immediately.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close overlays whenever the route changes.
  useEffect(() => {
    setPanelOpen(false);
    setMenuOpen(false);
  }, [location]);

  // Panel: Escape closes + restores focus; outside click closes; arrow keys
  // move between the four cards.
  useEffect(() => {
    if (!panelOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanelOpen(false);
        panelTriggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const cards = Array.from(
          panelRef.current?.querySelectorAll<HTMLAnchorElement>(
            ".v4-panel__card",
          ) ?? [],
        );
        const i = cards.indexOf(document.activeElement as HTMLAnchorElement);
        if (i === -1) return;
        e.preventDefault();
        const next =
          e.key === "ArrowRight"
            ? cards[i + 1] ?? cards[0]
            : cards[i - 1] ?? cards[cards.length - 1];
        next.focus();
      }
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        panelTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setPanelOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [panelOpen]);

  // Panel: close when focus leaves both the trigger and the panel (keyboard
  // users tabbing onward), never from pointer movement.
  function onPanelBlur(e: ReactFocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (
      next &&
      (panelRef.current?.contains(next) ||
        panelTriggerRef.current?.contains(next))
    ) {
      return;
    }
    setPanelOpen(false);
  }

  // Sheet: Escape + focus trap + scroll lock (V3 contract, verbatim).
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

  // Return focus to the toggles when their overlays close.
  const panelWasOpen = useRef(false);
  useEffect(() => {
    panelWasOpen.current = panelOpen;
  }, [panelOpen]);
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (sheetWasOpen.current && !menuOpen) sheetTriggerRef.current?.focus();
    sheetWasOpen.current = menuOpen;
  }, [menuOpen]);

  const surface = tone === "ink" && !scrolled ? "dark" : "light";

  return (
    <header
      ref={headerRef}
      className="v4-header"
      data-surface={surface}
      data-scrolled={scrolled || undefined}
      data-mode={headerMode}
    >
      <div className="v4-header__inner">
        <Link
          href="/"
          className="v4-header__brand"
          aria-label="SiteMint Digital — home"
          onClick={(e) => handleActiveNavClick(e, location === ROUTES.home)}
        >
          <SignalMarkV4 size={22} />
          {/* Product mode hides the wordmark below ~480px to protect the
              product name + primary CTA from crowding (v4-chrome.css). The
              span is inert for company mode — no visual change there. */}
          <span className="v4-header__brand-word">SiteMint</span>
        </Link>

        {headerMode === "product" ? (
          <>
            <span className="v4-header__product-sep" aria-hidden="true" />
            <span className="v4-header__product-name">AI Receptionist</span>

            <nav className="v4-product-nav" aria-label="AI Receptionist sections">
              <ul className="v4-product-nav__list">
                {productSubNavV4.map((item) => (
                  <li key={item.id}>
                    {/* Native <a>: fragment hrefs must use browser same-page
                        jumps (scroll-margin-top applies); a wouter <Link>
                        routes them through the SPA scroll manager, which
                        skips hash scrolling on the same route. */}
                    <a
                      href={item.href}
                      className="v4-product-nav__link"
                      aria-current={activeSubNavId === item.id ? "true" : undefined}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="v4-header__actions">
              {/* Cross-application document navigation — never a <Link>. */}
              <a href={signInHrefV4} className="v4-header__signin">
                Sign in
              </a>
              <Link
                href={requestBetaHrefV4}
                className="v4-btn v4-btn--primary v4-header__cta"
                aria-label="Request Private Beta"
              >
                {/* Below ~480px the brand wordmark is already gone (CSS);
                    shortening "Request Private Beta" → "Beta" buys back the
                    width the product name needs to never truncate. "Beta"
                    is a substring of the constant aria-label above, so the
                    visible text is always contained in the accessible name
                    at both sizes. */}
                <span className="v4-header__cta-full" aria-hidden="true">Request Private Beta</span>
                <span className="v4-header__cta-short" aria-hidden="true">Beta</span>
              </Link>
            </div>
          </>
        ) : (
        <nav className="v4-nav" aria-label="Primary">
          <ul className="v4-nav__list">
            <li onBlur={onPanelBlur}>
              <button
                ref={panelTriggerRef}
                type="button"
                className="v4-nav__link"
                aria-expanded={panelOpen}
                aria-controls={panelId}
                aria-current={isPillarActive(location) ? "page" : undefined}
                onClick={() => setPanelOpen((v) => !v)}
              >
                What We Build
                <ChevronDown aria-hidden="true" className="v4-nav__chevron" />
              </button>

              {panelOpen && (
                <div
                  id={panelId}
                  ref={panelRef}
                  className="v4-panel"
                  role="region"
                  aria-label="What We Build"
                >
                  <div className="v4-panel__inner">
                    <div className="v4-panel__grid">
                      {whatWeBuildV4.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="v4-panel__card"
                        >
                          <SignalGlyphV4
                            glyph={item.glyph}
                            className="v4-panel__glyph"
                          />
                          <span className="v4-panel__outcome">
                            {item.outcome}
                          </span>
                          <span className="v4-panel__title">{item.label}</span>
                          <span className="v4-panel__desc">
                            {item.description}
                          </span>
                        </Link>
                      ))}
                    </div>
                    <div className="v4-panel__foot">
                      <span>Four systems, one connected signal.</span>
                      <Link href="/services">
                        See how the systems connect →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </li>

            {primaryNavV4.map((item) => {
              const active = isActive(location, item.href);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="v4-nav__link"
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => handleActiveNavClick(e, active)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href={productNavV4.href}
                className="v4-nav__link v4-nav__prod"
                aria-current={
                  isActive(location, productNavV4.href) ? "page" : undefined
                }
                onClick={(e) =>
                  handleActiveNavClick(e, isActive(location, productNavV4.href))
                }
              >
                <span className="v4-nav__prod-dot" aria-hidden="true" />
                {productNavV4.label}
              </Link>
            </li>

            <li className="v4-header__sep" role="presentation" aria-hidden="true" />

            <li>
              {/* Cross-application document navigation — never a <Link>. */}
              <a href={signInHrefV4} className="v4-header__signin">
                {signInLabelV4}
              </a>
            </li>
            <li>
              <Link
                href={startHrefV4}
                className="v4-btn v4-btn--primary v4-header__cta"
              >
                {startLabelV4}
              </Link>
            </li>
          </ul>
        </nav>
        )}

        <button
          ref={sheetTriggerRef}
          type="button"
          className="v4-header__toggle"
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
        <div
          className="v4-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
        >
          <div className="v4-sheet__panel" id={sheetId} ref={sheetRef}>
            <div className="v4-sheet__head">
              <SignalMarkV4 size={24} />
              <button
                type="button"
                className="v4-sheet__close"
                onClick={() => setMenuOpen(false)}
              >
                <X aria-hidden="true" />
                <span className="v2-visually-hidden">Close main menu</span>
              </button>
            </div>

            <nav aria-label="Mobile primary">
              <ul className="v4-sheet__list">
                {headerMode === "product" ? (
                  /* Product-mode mobile menu (owner review fix): the same
                     dedicated sub-nav as the desktop row, not the company
                     "What We Build"/"Explore" groups — this is the fix for
                     mobile visitors on the AI Receptionist page previously
                     having no in-page navigation at all. Each link closes
                     the sheet on click since a same-route hash navigation
                     never changes `location`, so the sheet's own
                     route-change auto-close effect never fires for these. */
                  productSubNavV4.map((item) => (
                    <li key={item.id}>
                      <a
                        href={item.href}
                        className="v4-sheet__link"
                        aria-current={activeSubNavId === item.id ? "true" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))
                ) : (
                  <>
                    <MobileGroup
                      title="What We Build"
                      location={location}
                      onCloseMenu={() => setMenuOpen(false)}
                    >
                      {whatWeBuildV4.map((item) => ({
                        label: item.label,
                        href: item.href,
                      }))}
                    </MobileGroup>
                    {/* W-17: mobile group renamed "Company" → "Explore". */}
                    <MobileGroup
                      title="Explore"
                      location={location}
                      onCloseMenu={() => setMenuOpen(false)}
                    >
                      {primaryNavV4}
                    </MobileGroup>
                    <li>
                      <Link
                        href={productNavV4.href}
                        className="v4-sheet__link"
                        aria-current={
                          isActive(location, productNavV4.href) ? "page" : undefined
                        }
                        onClick={(e) =>
                          handleActiveNavClick(e, isActive(location, productNavV4.href), () =>
                            setMenuOpen(false),
                          )
                        }
                      >
                        {productNavV4.label}
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </nav>

            {headerMode === "product" ? (
              <>
                <a href={signInHrefV4} className="v4-sheet__quiet">
                  Sign in
                </a>
                <Link
                  href={requestBetaHrefV4}
                  className="v4-btn v4-btn--primary v4-sheet__cta"
                >
                  Request Private Beta
                </Link>
              </>
            ) : (
              <>
                <a href={signInHrefV4} className="v4-sheet__quiet">
                  {signInLabelV4}
                </a>
                <Link
                  href={startHrefV4}
                  className="v4-btn v4-btn--primary v4-sheet__cta"
                >
                  {startLabelV4}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

interface MobileGroupProps {
  title: string;
  location: string;
  children: Array<{ label: string; href: string }>;
  /** Closes the mobile sheet on a same-page re-click, which the sheet's own
   *  auto-close effect (keyed on route change) never sees. */
  onCloseMenu: () => void;
}

/** A deliberate expandable group in the mobile sheet (owner correction 2). */
function MobileGroup({ title, location, children, onCloseMenu }: MobileGroupProps) {
  // A group containing the current page starts open so location is obvious.
  const containsCurrent = children.some((c) => isActive(location, c.href));
  const [open, setOpen] = useState(containsCurrent);
  const subId = useId();

  return (
    <li>
      <button
        type="button"
        className="v4-sheet__group-btn"
        aria-expanded={open}
        aria-controls={subId}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className="v4-nav__chevron"
          style={open ? { transform: "rotate(180deg)" } : undefined}
        />
      </button>
      {open && (
        <ul className="v4-sheet__sub" id={subId}>
          {children.map((child) => {
            const active = isActive(location, child.href);
            return (
              <li key={child.label}>
                <Link
                  href={child.href}
                  className="v4-sheet__link"
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => handleActiveNavClick(e, active, onCloseMenu)}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default SiteHeaderV4;
