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
 * loading gate, the redirect to `/login` on a session REFUSAL (a request that
 * never completed keeps the page and says the server is unreachable), the logout call
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
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  ChevronRight,
  Inbox,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Phone,
  Settings as SettingsIcon,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSession, useSessionAccess, useLogout } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { isNavItemActive, visibleNavGroups, type NavItem } from "@/components/layout/dashboardNav";
// AR-001J boundary: the voice-usage rail indicator is gated the same way the
// voice routes are — see the note in routes/voiceRoutes.ts. Its disabled
// branch resolves to a component that renders nothing, so this import is
// always safe to mount, in every build.
import { UsageRailIndicatorGate } from "@/routes/voiceRoutes";
// Phase 12: the rail's plan name comes from the same helper Settings and
// Billing use, so one account cannot be called three different things in three
// places. It previously read "Pro plan" — a product this repository does not
// have; see `pages/settings/settingsContract.ts` for the evidence.
import { planLabel } from "@/pages/settings/settingsContract";
import { RouteScrollManager } from "@/components/layout/RouteScrollManager";
// Workspace status in the rail reads the same server readiness answer Setup
// and the overview read, so the three can never disagree.
import { useReadiness, type Readiness } from "@/lib/readinessApi";
import "@/styles/v2-dashboard.css";
import "@/styles/v3-app.css";
// Frontend V4 Signal retheme — token-value override one layer above V3.
// ROLLBACK: remove this import to restore the V3 appearance.
import "@/styles/v4-app.css";
// SiteMint V5 "Signal, mint-led" retheme — token-value override one layer
// above V4. ROLLBACK: remove this import to restore the V4 appearance.
import "@/styles/v5-app.css";
// SiteMint Workspace (Mint Clarity) — the authoritative layer; supersedes
// mint-workspace.css. ROLLBACK: swap this import back to mint-workspace.css.
import "@/styles/workspace.css";

const DESKTOP_QUERY = "(min-width: 64rem)";

// ─── Navigation ────────────────────────────────────────────────────────────

/** "3 of 4" on the Setup row while setup is unfinished; nothing once it is. */
function setupProgress(readiness: Readiness | undefined): string | null {
  if (!readiness || readiness.steps.length === 0) return null;
  const done = readiness.steps.filter((step) => step.state === "done").length;
  return done < readiness.steps.length ? `${done} of ${readiness.steps.length}` : null;
}

/** The label of the destination the visitor is on, for the mobile top bar. */
function currentPageLabel(location: string): string | null {
  for (const group of visibleNavGroups(voicePlatformEnabled)) {
    for (const item of group.items) if (isNavItemActive(item, location)) return item.label;
  }
  return null;
}

type RailTone = "live" | "progress" | "attention" | "neutral";

function railStatus(readiness: Readiness | undefined): { label: string; tone: RailTone } {
  if (!readiness) return { label: "Status not checked", tone: "neutral" };
  if (readiness.state === "live_call_verified") return { label: readiness.label, tone: "live" };
  if (readiness.state === "needs_attention" || readiness.state === "paused") return { label: readiness.label, tone: "attention" };
  if (readiness.state === "not_checked") return { label: readiness.label, tone: "neutral" };
  return { label: readiness.label, tone: "progress" };
}

/** Section icons for groups that hold more than one destination. */
const SECTION_ICON: Record<string, LucideIcon> = {
  scheduling: CalendarDays,
  activity: Inbox,
  channels: Phone,
  account: SettingsIcon,
};

/**
 * The rail shows one entry per section. A section with a single destination
 * links straight to it; a section with several expands in place, showing its
 * pages, whenever the visitor is inside it — so the rail stays short enough
 * to read at a glance and the current location is always visible.
 */
function RailNav({ location, onNavigate }: { location: string; onNavigate: () => void }) {
  const groups = visibleNavGroups(voicePlatformEnabled);
  const progress = setupProgress(useReadiness().data);

  const renderItem = (item: NavItem, nested: boolean) => {
    const active = isNavItemActive(item, location);
    const Icon = item.icon;
    return (
      <li key={item.key}>
        <Link
          href={item.href!}
          className="sd-navlink"
          data-nested={nested ? "true" : undefined}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          {!nested && <Icon className="sd-navlink__icon" aria-hidden="true" />}
          <span className="sd-navlink__label">{item.label}</span>
          {item.href === "/setup" && progress && (
            <span className="ws-navbadge">
              {progress}
              <span className="sd-sr"> steps complete</span>
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <nav className="sd-rail__nav" aria-label="Dashboard">
      <ul className="sd-rail__list">
        {groups.map((group) => {
          if (group.items.length === 1) return renderItem(group.items[0]!, false);
          const inside = group.items.some((item) => isNavItemActive(item, location));
          const SectionIcon = SECTION_ICON[group.key] ?? group.items[0]!.icon;
          return (
            <li key={group.key} className="sd-rail__group" data-open={inside ? "true" : "false"}>
              <Link
                href={group.items[0]!.href!}
                className="sd-navlink ws-navsection"
                data-active={inside ? "true" : "false"}
                aria-expanded={inside}
                onClick={onNavigate}
              >
                <SectionIcon className="sd-navlink__icon" aria-hidden="true" />
                <span className="sd-navlink__label">{group.label}</span>
                <ChevronRight className="ws-navsection__chevron" aria-hidden="true" />
              </Link>
              {inside && (
                <ul className="ws-subnav" aria-label={group.label}>
                  {group.items.map((item) => renderItem(item, true))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Sibling pages of the current section, as a scrollable tab row above the
 * page. Shown only where the rail is a drawer (phones and tablets), so the
 * pages next to this one are one tap away without opening the menu.
 */
function SectionTabs({ location }: { location: string }) {
  const group = visibleNavGroups(voicePlatformEnabled).find(
    (g) => g.items.length > 1 && g.items.some((item) => isNavItemActive(item, location)),
  );
  if (!group) return null;
  return (
    <nav className="ws-sectiontabs" aria-label={`${group.label} pages`}>
      <ul>
        {group.items.map((item) => {
          const active = isNavItemActive(item, location);
          return (
            <li key={item.key}>
              <Link href={item.href!} className="ws-sectiontab" aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * "Section / Page" above every page in a multi-page section, on desktop. On a
 * detail page (a path below the destination, e.g. one call) the page becomes
 * a link back to its list and a final "Details" crumb marks where you are.
 */
function ShellCrumbs({ location }: { location: string }) {
  for (const group of visibleNavGroups(voicePlatformEnabled)) {
    if (group.items.length < 2) continue;
    const item = group.items.find((i) => isNavItemActive(i, location));
    if (!item) continue;
    const onDetail = location !== item.href && location !== `${item.href}/`;
    return (
      <nav className="ws-crumbs ws-shell-crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href={group.items[0]!.href!}>{group.label}</Link>
          </li>
          <li>
            <span aria-hidden="true">/</span>
            {onDetail ? <Link href={item.href!}>{item.label}</Link> : <span aria-current="location">{item.label}</span>}
          </li>
          {onDetail && (
            <li>
              <span aria-hidden="true">/</span>
              <span aria-current="location">Details</span>
            </li>
          )}
        </ol>
      </nav>
    );
  }
  return null;
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

  // This meter counts text-message (SMS) intake conversations for the life of
  // the account — not calls, and not "this period". Saying so is the whole
  // point: beside a call product, the bare word "conversations" read as a
  // voice business's call allowance for the month, which it never was.
  return (
    <Link
      href="/billing"
      className="sd-usage"
      onClick={onNavigate}
      aria-label={`Trial usage: ${used} of ${limit} SMS conversations used, all time. Open billing.`}
    >
      <span className="sd-usage__row">
        <span className="sd-usage__count">
          {used} of {limit} SMS conversations, all time
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
  const { data: me, isLoading } = useSession();
  const { access: sessionAccess, refetch: retrySession } = useSessionAccess();
  const logout = useLogout();
  const readiness = useReadiness();

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

  // Only a refusal signs somebody out. A session request that never completed
  // — a restarting instance, a dropped connection — used to navigate away and
  // discard whatever was on screen; it now leaves the page alone and says the
  // server cannot be reached, and the next successful request clears it.
  useEffect(() => {
    if (sessionAccess === "denied") navigate("/login");
  }, [sessionAccess, navigate]);

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

  // A refusal is already navigating to the login page, so render nothing while
  // that happens. Anything else without a session means the server could not be
  // reached: say so and offer a retry instead of a blank screen.
  if (sessionAccess === "denied") return null;
  if (!me) {
    return (
      <div className="sd-app sd-app--boot">
        <div className="sd-boot" role="alert">
          <span className="sd-boot__mark" aria-hidden="true" />
          <span className="sd-boot__text">
            Can&apos;t reach the server. Your sign-in has not ended — this is a connection problem.
          </span>
          <button type="button" className="sd-link" onClick={retrySession}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isPaid = me.firm.planTier === "paid";
  const status = railStatus(readiness.data);
  const pageLabel = currentPageLabel(location);
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
            <span className="ws-brandmark" aria-hidden="true">
              S
            </span>
            {/* One flex item per line, so the words keep their spacing. */}
            <span className="ws-brandtext">
              <span>SiteMint</span>
              <span className="ws-brandtext__sub sd-rail__brand-accent">AI Receptionist</span>
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
          {me.viewer && !me.viewer.accountHolder && (
            <span className="sd-rail__workspace-role">
              {me.viewer.email} · {me.viewer.role === "owner" ? "Owner" : "Staff"}
            </span>
          )}
          <Link href="/setup" className="ws-rail-status" onClick={closeIfDrawer}>
            <span className="ws-dot" data-tone={status.tone} aria-hidden="true" />
            <span>
              <span className="sd-sr">Receptionist status: </span>
              {status.label}
            </span>
          </Link>
        </div>

        <RailNav location={location} onNavigate={closeIfDrawer} />

        <div className="sd-rail__foot">
          {/* V5 PR-8 — a voice-enabled build shows the combined minutes/SMS
              indicator (`UsageRailIndicatorGate`); every other build keeps the
              existing SMS trial meter exactly as before. */}
          {voicePlatformEnabled ? (
            <Suspense fallback={null}>
              <UsageRailIndicatorGate />
            </Suspense>
          ) : (
            <UsageMeter
              isPaid={isPaid}
              planTier={me.firm.planTier}
              used={me.conversationCount}
              limit={me.firm.trialConversationsLimit}
              onNavigate={closeIfDrawer}
            />
          )}
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
          <span className="sd-topbar__title">
            <span>{pageLabel ?? me.firm.name}</span>
            {pageLabel && <span className="ws-topbar__section">{me.firm.name}</span>}
          </span>
          <span className="sd-topbar__spacer" aria-hidden="true" />
        </header>

        <main id="sd-main" className="sd-workspace" tabIndex={-1}>
          {isDesktop ? <ShellCrumbs location={location} /> : <SectionTabs location={location} />}
          {children}
        </main>
      </div>
    </div>
  );
}
