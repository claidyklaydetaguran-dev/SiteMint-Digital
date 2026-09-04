/**
 * Frontend V2 Phase 7 — the authenticated dashboard shell.
 *
 * Replaces the shadcn `ui/sidebar` composition (SidebarProvider + Sheet +
 * cookie-persisted rail state) with a purpose-built shell. `ui/sidebar.tsx` had
 * exactly one consumer — this file — and is left in place untouched as a
 * rollback reference, the same pattern Phase 1 established for deferred routes.
 *
 * The rewrite exists to fix three real structural defects in the previous
 * chrome, each verified in the baseline capture:
 *
 *  1. **Two `<main>` landmarks.** `SidebarInset` renders a `<main>` and the
 *     shell rendered another `<main role="main">` inside it. There is now one.
 *  2. **No `<nav>` landmark at all.** The navigation was a plain `<div>` tree,
 *     so it could not be reached by landmark navigation. It is now a labelled
 *     `<nav>` containing a real list.
 *  3. **No skip link**, so a keyboard user traversed the whole navigation on
 *     every route. The skip link is now the first thing in the tab order.
 *
 * ── Preserved exactly ─────────────────────────────────────────────────────
 * The session query (`GET /api/receptionist/auth/me` via `useSession`), the
 * loading gate, the redirect to `/login` on a session error, the logout call
 * (`POST /api/receptionist/auth/logout` then `queryClient.clear()` then
 * `/login`), the firm-scoped data (`me.firm.*` only ever from the server
 * session), the trial usage figures, the appearance control, and the container
 * the child routes render into. No endpoint, method, payload, response shape,
 * route, or authorisation behaviour is changed by this file.
 *
 * Authenticated content is still never painted before authorisation resolves:
 * the component returns the loading state while `isLoading`, and `null` on
 * error, exactly as before.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useSession, useLogout } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { isNavItemActive, visibleNavGroups } from "@/components/layout/dashboardNav";
// Phase 12: the rail's plan name comes from the same helper Settings and
// Billing use, so one account cannot be called three different things in three
// places. It previously read "Pro plan" — a product this repository does not
// have; see `pages/settings/settingsContract.ts` for the evidence.
import { planLabel } from "@/pages/settings/settingsContract";
import { RouteScrollManager } from "@/components/layout/RouteScrollManager";
import "@/styles/v2-dashboard.css";
import "@/styles/v3-app.css";
// Frontend V4 Signal retheme — token-value override one layer above V3.
// ROLLBACK: remove this import to restore the V3 appearance.
import "@/styles/v4-app.css";
// SiteMint V5 "Signal, mint-led" retheme — token-value override one layer
// above V4. ROLLBACK: remove this import to restore the V4 appearance.
import "@/styles/v5-app.css";

const DESKTOP_QUERY = "(min-width: 64rem)";

// ─── Navigation ────────────────────────────────────────────────────────────

function RailNav({ location, onNavigate }: { location: string; onNavigate: () => void }) {
  const groups = visibleNavGroups(voicePlatformEnabled);

  return (
    <nav className="sd-rail__nav" aria-label="Dashboard">
      {groups.map((group) => (
        <div key={group.key} className="sd-rail__group" role="group" aria-label={group.label}>
          {group.showLabel && <span className="sd-rail__grouplabel">{group.label}</span>}
          <ul className="sd-rail__list">
            {group.items.map((item) => {
              const active = isNavItemActive(item, location);
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href!}
                    className="sd-navlink"
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <Icon className="sd-navlink__icon" aria-hidden="true" />
                    <span className="sd-navlink__label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ─── Trial usage ───────────────────────────────────────────────────────────

function UsageMeter({
  isPaid,
  planTier,
  used,
  limit,
  onNavigate,
}: {
  isPaid: boolean;
  planTier: string;
  used: number;
  limit: number;
  onNavigate: () => void;
}) {
  if (isPaid) {
    return <div className="sd-usage__plan">{planLabel(planTier) ?? ""}</div>;
  }

  const percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0;

  return (
    <Link
      href="/billing"
      className="sd-usage"
      onClick={onNavigate}
      aria-label={`Trial usage: ${used} of ${limit} conversations used. Open billing.`}
    >
      <span className="sd-usage__row">
        <span className="sd-usage__count">
          {used} of {limit} conversations
        </span>
        <span className="sd-usage__cta" aria-hidden="true">
          Billing
        </span>
      </span>
      <span className="sd-usage__track">
        <span
          className="sd-usage__fill"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </span>
    </Link>
  );
}

// ─── Appearance ────────────────────────────────────────────────────────────

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Rail-native replacement for the dropdown appearance menu. Same three
 * options and the same `next-themes` contract; a radio group rather than a
 * menu, so the choice is never hidden behind an extra interaction and the
 * current value is announced.
 */
function AppearanceControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";

  return (
    <div className="sd-appearance" role="radiogroup" aria-label="Appearance">
      {THEMES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          aria-label={label}
          className="sd-appearance__option"
          data-selected={current === value}
          onClick={() => setTheme(value)}
        >
          <Icon className="sd-railbtn__icon" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: me, isLoading, isError } = useSession();
  const logout = useLogout();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window === "undefined" || window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Session failure is the only unauthenticated signal the dashboard has, and
  // its destination is unchanged.
  useEffect(() => {
    if (!isLoading && isError) navigate("/login");
  }, [isLoading, isError, navigate]);

  // Close on navigation, then hand focus back to the control that opened it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Escape closes; Tab is confined to the drawer while it is open.
  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      const rail = railRef.current;
      if (!rail) return;
      const focusable = rail.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !rail.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Scroll lock that cannot shift the layout: the width the scrollbar was
  // occupying is given back as padding for exactly as long as it is hidden.
  useEffect(() => {
    if (!drawerOpen) return;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [drawerOpen]);

  // A closed drawer is fully removed from the tab order and the a11y tree.
  //
  // This must be declared *before* the focus effect below. Effects run in
  // declaration order, and `.focus()` is refused inside an `inert` subtree —
  // so if the flag were cleared second, the opening drawer would still be
  // inert at the moment focus was attempted and focus would silently stay on
  // `<body>`. Ordering them this way is what makes the focus move land.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.inert = !isDesktop && !drawerOpen;
  }, [isDesktop, drawerOpen, me]);

  // Move focus into the drawer when it opens — onto the close control, so the
  // way out is the first thing a keyboard or screen-reader user reaches.
  useEffect(() => {
    if (!drawerOpen) return;
    const target =
      closeRef.current ??
      railRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])");
    target?.focus();
  }, [drawerOpen]);

  if (isLoading) {
    return (
      <div className="sd-app sd-app--boot">
        <div className="sd-boot" role="status" aria-live="polite">
          <span className="sd-boot__mark" aria-hidden="true" />
          <span className="sd-boot__text">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  if (isError || !me) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isPaid = me.firm.planTier === "paid";
  const closeIfDrawer = () => {
    if (!isDesktop) setDrawerOpen(false);
  };

  return (
    <div className="sd-app">
      <RouteScrollManager />
      <a className="sd-skip" href="#sd-main">
        Skip to main content
      </a>

      {drawerOpen && !isDesktop && (
        <div
          className="sd-scrim"
          data-open={drawerOpen}
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <div
        ref={railRef}
        id="sd-rail"
        className="sd-rail"
        data-open={drawerOpen ? "true" : "false"}
        {...(!isDesktop
          ? { role: "dialog" as const, "aria-modal": true, "aria-label": "Dashboard navigation" }
          : {})}
      >
        {/* Text-only wordmark, matching the V2 sign-in bar exactly, so the
            brand does not change shape between signing in and arriving. */}
        <div className="sd-rail__head">
          <Link href="/" className="sd-rail__brand" onClick={closeIfDrawer}>
            {/* One flex item, so the space between the two words survives. */}
            <span>
              SiteMint <span className="sd-rail__brand-accent">AI Receptionist</span>
            </span>
          </Link>

          {/* Drawer mode only: on desktop the rail is permanent, so a close
              control would dismiss nothing. The previous chrome relied on the
              top bar's button toggling to an X, but the drawer is
              `position: fixed` over that bar — the X was painted behind the
              drawer and, being outside `railRef`, the focus trap made it
              unreachable too. The way out now lives inside the drawer. */}
          {!isDesktop && (
            <button
              ref={closeRef}
              type="button"
              className="sd-rail__close"
              onClick={closeDrawer}
            >
              <X className="sd-railbtn__icon" aria-hidden="true" />
              <span className="sd-sr">Close navigation</span>
            </button>
          )}
        </div>

        {/* Workspace identity comes only from the authenticated session. There
            is no placeholder business name and no generated avatar. */}
        <div className="sd-rail__workspace">
          <span className="sd-eyebrow">Workspace</span>
          <span className="sd-rail__workspace-name">{me.firm.name}</span>
        </div>

        <RailNav location={location} onNavigate={closeIfDrawer} />

        <div className="sd-rail__foot">
          <UsageMeter
            isPaid={isPaid}
            planTier={me.firm.planTier}
            used={me.conversationCount}
            limit={me.firm.trialConversationsLimit}
            onNavigate={closeIfDrawer}
          />
          <AppearanceControl />
          <button type="button" className="sd-railbtn" onClick={handleLogout}>
            <LogOut className="sd-railbtn__icon" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <div className="sd-column">
        <header className="sd-topbar">
          {/* Opens only. While the drawer is open this button is covered by it
              and excluded from the focus trap, so it can never be the way out —
              the drawer's own close control is. */}
          <button
            ref={triggerRef}
            type="button"
            className="sd-topbar__button"
            aria-expanded={drawerOpen}
            aria-controls="sd-rail"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="sd-railbtn__icon" aria-hidden="true" />
            <span className="sd-sr">Open navigation</span>
          </button>
          <span className="sd-topbar__title">{me.firm.name}</span>
          <span className="sd-topbar__spacer" aria-hidden="true" />
        </header>

        <main id="sd-main" className="sd-workspace" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
