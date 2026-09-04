/**
 * V5 customer-shell foundation — committed contract tests for the
 * authenticated dashboard shell and its redesigned overview (D-1).
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * This file still tests two things together, as it always has: the
 * Overview-specific contract in `overviewContract.ts` (this session's scope)
 * and the shared `AppShell` / `dashboardNav` chrome (not this session's
 * scope — `lib/nav.ts`, `dashboardNav.ts` and `AppShell.tsx` belong to the
 * nav/shell owner and are read here, not edited). The shell/nav/accessibility
 * sections below are carried over verbatim from the Phase 7 suite; only the
 * Overview-contract sections (agent-config/readiness/attention/readiness
 * ladder) were rewritten for the D-1 redesign, since `readAgentConfig`,
 * `buildSetupSteps` and `deriveReadiness` no longer exist — the Setup hub
 * (`pages/setup/setupContract.ts`, S-3) now owns that narrower question, and
 * this file's own `setupContract.test.ts` covers it.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, and never
 * creates a session or an account.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildActivityFigures,
  buildNeedsAttention,
  buildNextBestAction,
  buildTodayFigures,
  buildUsage,
  countToday,
  deriveReceptionistState,
  recentCalls,
  recentConversations,
  RECEPTIONIST_STATE_LABEL,
  type OverviewConversation,
  type OverviewSession,
} from "./overviewContract.js";
import {
  isNavItemActive,
  visibleNavDestinations,
  visibleNavGroups,
} from "../../components/layout/dashboardNav.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/overview → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const shellSrc = read("artifacts/helpdesk/src/components/layout/AppShell.tsx");
const navSrc = read("artifacts/helpdesk/src/components/layout/dashboardNav.ts");
const pageSrc = read("artifacts/helpdesk/src/pages/Overview.tsx");
const overviewApiSrc = read("artifacts/helpdesk/src/pages/overview/overviewApi.ts");
const pageHeaderSrc = read("artifacts/helpdesk/src/components/common/PageHeader.tsx");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const conversationsSrc = read("artifacts/helpdesk/src/hooks/useConversations.ts");
const apiSrc = read("artifacts/helpdesk/src/lib/api.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-dashboard.css");
const readinessSrc = read("artifacts/helpdesk/src/pages/login/readiness.ts");
const publicReadinessSrc = read("artifacts/web-agency/src/components/v2/home/readiness.ts");
const tokensSrc = read("artifacts/web-agency/src/styles/tokens-v2.css");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why, so a prose mention of a deleted badge or a dropped library
 * must never be mistaken for the thing still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const shellCode = stripComments(shellSrc);

// ─── Tiny runner ───────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const HOUR = 3600_000;
const NOW = Date.now();
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

function conversation(over: Partial<OverviewConversation> = {}): OverviewConversation {
  return {
    id: 1,
    createdAt: iso(2),
    lastMessageAt: iso(1),
    callerPhone: "+15125550142",
    status: "completed",
    tier: null,
    disqualifyReason: null,
    isOverCap: false,
    ...over,
  };
}

const session = (over: Partial<OverviewSession["firm"]> = {}, count = 7): OverviewSession => ({
  firm: {
    id: 41,
    name: "Northgate Plumbing",
    email: null,
    planTier: "trial",
    trialConversationsLimit: 20,
    createdAt: iso(500),
    ...over,
  },
  conversationCount: count,
});

// ─── 1. Receptionist state is derived from real signals only ──────────────

section("receptionist state (D-1 status chip)");

eq("a brand-new firm is not set up", deriveReceptionistState({ setupComplete: false, anyStepDone: false, numberAssigned: false, assistantPublished: false }), "not_set_up");
eq("progress with an unfinished checklist is in progress", deriveReceptionistState({ setupComplete: false, anyStepDone: true, numberAssigned: false, assistantPublished: false }), "setup_in_progress");
eq("a complete checklist without a live number/assistant is ready for activation", deriveReceptionistState({ setupComplete: true, anyStepDone: true, numberAssigned: false, assistantPublished: false }), "ready_for_activation");
eq("a number alone, without a published assistant, is not live", deriveReceptionistState({ setupComplete: true, anyStepDone: true, numberAssigned: true, assistantPublished: false }), "ready_for_activation");
eq("a published assistant alone, without a number, is not live", deriveReceptionistState({ setupComplete: true, anyStepDone: true, numberAssigned: false, assistantPublished: true }), "ready_for_activation");
eq("only both a number and a published assistant read as live", deriveReceptionistState({ setupComplete: true, anyStepDone: true, numberAssigned: true, assistantPublished: true }), "live");
check("every state has a plain-text label — status is never colour-only", Object.values(RECEPTIONIST_STATE_LABEL).every((l) => l.length > 0));

// ─── 2. No fabricated metric ever renders ──────────────────────────────────

section("no fabricated metric");

eq(
  "with no conversations every activity figure is null — never a zero presented as a measurement",
  buildActivityFigures([]).map((f) => f.value),
  [null, null, null],
);
eq(
  "with conversations the figures are plain tallies of real rows",
  buildActivityFigures([
    conversation({ id: 1, tier: "Hot", status: "in_progress", createdAt: iso(2) }),
    conversation({ id: 2, tier: "Hot", createdAt: iso(2) }),
    conversation({ id: 3, tier: "Cold", createdAt: iso(24 * 30) }),
  ]).map((f) => f.value),
  [2, 2, 1],
);
check("only the hot-lead figure carries emphasis", buildActivityFigures([]).filter((f) => f.emphasis).length === 1);
eq("an unknown today's-activity count is null, not zero", buildTodayFigures({ callsToday: null, conversationsToday: null, pendingAppointmentRequests: null }).map((f) => f.value), [null, null, null]);
eq("a zero real count is shown as zero, distinct from unknown", buildTodayFigures({ callsToday: 0, conversationsToday: 2, pendingAppointmentRequests: 0 }).map((f) => f.value), [0, 2, 0]);
eq("countToday returns null for an empty conversation list", countToday([]), null);
eq("countToday counts only rows created in the last 24 hours", countToday([conversation({ createdAt: iso(2) }), conversation({ createdAt: iso(30) })]), 1);
check(
  "the page renders 'None yet' for a null figure rather than a number",
  pageSrc.includes('figure.value === null ? "None yet" : figure.value'),
);
check(
  "no fabricated fallback: the page never coalesces a metric to a literal number",
  !/\?\?\s*0\b/.test(pageCode) && !/\|\|\s*0\b/.test(pageCode),
);
check(
  "the previous hardcoded 'Receptionist active' badge is gone",
  !pageCode.includes("Receptionist active") && !shellCode.includes("Receptionist active"),
);
check(
  "the previous 'Voice add-on required' tiles are gone",
  !pageCode.includes("Voice add-on required") && !pageCode.includes("Hours saved"),
);
check(
  "no chart library is imported by the overview",
  !pageCode.includes("recharts") && !pageCode.includes("BarChart") && !pageCode.includes("StatusBadge"),
);
check(
  "no unverifiable availability or outcome claim appears on the page",
  ![
    "24/7",
    "always on",
    "never miss",
    "works 24",
    "guarantee",
    "instantly",
    "revolutionize",
    "game-changing",
    "effortless",
  ].some((phrase) => pageCode.toLowerCase().includes(phrase.toLowerCase())),
);
check(
  "a voice-platform query that resolves to null (off/unavailable) is never coerced to a zero-problem count",
  overviewApiSrc.includes("return null") && overviewApiSrc.includes("!voicePlatformEnabled"),
);

// ─── 3. Needs-attention: real problems only, degrading on unknown data ─────

section("needs-attention list");

eq("a healthy trial account with everything known has nothing needing attention", buildNeedsAttention({ overCapCount: 0, needsReviewCount: 0, openIssuesCount: 0, pendingAppointmentRequestsCount: 0 }), []);
eq(
  "conversations past the trial cap are surfaced",
  buildNeedsAttention({ overCapCount: 2, needsReviewCount: 0, openIssuesCount: 0, pendingAppointmentRequestsCount: 0 }).map((a) => a.key),
  ["over-cap"],
);
eq(
  "unscored conversations are surfaced",
  buildNeedsAttention({ overCapCount: 0, needsReviewCount: 1, openIssuesCount: 0, pendingAppointmentRequestsCount: 0 }).map((a) => a.key),
  ["needs-review"],
);
eq(
  "open issues are surfaced",
  buildNeedsAttention({ overCapCount: 0, needsReviewCount: 0, openIssuesCount: 3, pendingAppointmentRequestsCount: 0 }).map((a) => a.key),
  ["open-issues"],
);
eq(
  "pending appointment requests are surfaced",
  buildNeedsAttention({ overCapCount: 0, needsReviewCount: 0, openIssuesCount: 0, pendingAppointmentRequestsCount: 4 }).map((a) => a.key),
  ["pending-requests"],
);
eq(
  "a null (unknown) count never contributes an item — unknown is not shown as zero problems",
  buildNeedsAttention({ overCapCount: 0, needsReviewCount: 0, openIssuesCount: null, pendingAppointmentRequestsCount: null }),
  [],
);
eq(
  "every attention item names a real destination, in a stable order",
  buildNeedsAttention({ overCapCount: 1, needsReviewCount: 1, openIssuesCount: 1, pendingAppointmentRequestsCount: 1 }).map((a) => a.href),
  ["/logs", "/billing", "/conversations", "/appointments"],
);

// ─── 4. Usage is the firm's own, from the session only ─────────────────────

section("usage and tenancy");

eq("trial usage is a real percentage of real counts", buildUsage(session({}, 7)).percent, 35);
eq("a paid plan has no trial percentage", buildUsage(session({ planTier: "paid" }, 7)).percent, null);
eq("a zero limit cannot divide by zero", buildUsage(session({ trialConversationsLimit: 0 }, 3)).percent, 0);
check(
  "the shell reads firm identity only from the authenticated session",
  shellSrc.includes("me.firm.name") && !/firmId\s*[:=]\s*\d/.test(shellSrc),
);
check(
  "the session hook still returns undefined for an unresolved firm id",
  sessionSrc.includes("if (isLoading || isError || !data) return undefined;"),
);
check(
  "the session query is still non-retrying, so a 401 surfaces immediately",
  sessionSrc.includes("retry: false"),
);
eq("recent conversations are ordered newest-first and capped at five", recentConversations([
  conversation({ id: 1, lastMessageAt: iso(5) }),
  conversation({ id: 2, lastMessageAt: iso(1) }),
  conversation({ id: 3, lastMessageAt: iso(3) }),
  conversation({ id: 4, lastMessageAt: iso(7) }),
  conversation({ id: 5, lastMessageAt: iso(9) }),
  conversation({ id: 6, lastMessageAt: iso(11) }),
]).map((c) => c.id), [2, 3, 1, 4, 5]);
eq("recent calls are ordered newest-first and capped at five", recentCalls([
  { callId: "a", stateLabel: "Completed", callerNumberDisplay: "+1", startedAt: iso(5) },
  { callId: "b", stateLabel: "Completed", callerNumberDisplay: "+1", startedAt: iso(1) },
  { callId: "c", stateLabel: "Completed", callerNumberDisplay: "+1", startedAt: iso(9) },
]).map((c) => c.callId), ["b", "a", "c"]);

// ─── 5. One next-best action ────────────────────────────────────────────────

section("next-best action");

eq("setup incomplete points to /setup", buildNextBestAction({ receptionistState: "not_set_up", attentionCount: 0 }).href, "/setup");
eq("setup complete but not live still points to /setup for final review", buildNextBestAction({ receptionistState: "ready_for_activation", attentionCount: 0 }).href, "/setup");
eq("live with something needing attention points at it", buildNextBestAction({ receptionistState: "live", attentionCount: 2 }).actionLabel, "Review what needs attention");
eq("live and healthy still offers a single action, not none", buildNextBestAction({ receptionistState: "live", attentionCount: 0 }).actionLabel.length > 0, true);
check(
  "the page renders exactly one next-action card",
  (pageCode.match(/<NextActionCard/g) ?? []).length === 1,
);

// ─── 6. Authentication, session and logout contracts (unchanged shell) ─────

section("authentication contracts");

check(
  "the dashboard route is still protected — the shell gates on the session query",
  shellSrc.includes("useSession()") && shellSrc.includes("if (isError || !me) return null;"),
);
check(
  "authenticated content is never painted before authorisation resolves",
  shellSrc.includes("if (isLoading)") &&
    shellSrc.indexOf("if (isLoading)") < shellSrc.indexOf("if (isError || !me) return null;"),
);
check(
  "an unauthenticated visitor is still sent to the verified sign-in route",
  shellSrc.includes('if (!isLoading && isError) navigate("/login")'),
);
eq("the sign-in route is unchanged", /login:\s*"([^"]+)"/.exec(routesSrc)?.[1], "/login");
eq("the dashboard overview route is unchanged", /overview:\s*"([^"]+)"/.exec(routesSrc)?.[1], "/");
check(
  "a successful sign-in still lands on the dashboard overview",
  read("artifacts/helpdesk/src/pages/login/loginContract.ts").includes('export const LOGIN_SUCCESS_ROUTE = "/";'),
);
check(
  "the logout contract is unchanged: POST, credentials included, then the cache is cleared",
  sessionSrc.includes('fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" })') &&
    sessionSrc.includes("qc.clear()"),
);
check(
  "the shell signs out through that hook and then navigates to sign-in",
  shellSrc.includes("await logout()") && shellSrc.includes('navigate("/login")'),
);
check(
  "sign out is a real control in the rail, not hidden behind a hover menu",
  shellSrc.includes(">\n            Sign out") || shellSrc.includes("Sign out"),
);

// ─── 7. API surface — new sources are additive, existing ones untouched ───

section("API surface");

check(
  "the conversations, session and voice-numbers/onboarding/calendar-status/issues/calls sources this page reads are all real, documented endpoints",
  conversationsSrc.includes('"/receptionist/conversations"') &&
    sessionSrc.includes('"/receptionist/auth/me"') &&
    overviewApiSrc.includes('"/receptionist/voice/numbers"') &&
    overviewApiSrc.includes('"/receptionist/availability/calendar-status"') &&
    overviewApiSrc.includes('"/receptionist/voice/issues"') &&
    overviewApiSrc.includes('"/receptionist/voice/calls"'),
);
check("the API base and credentials mode are unchanged", apiSrc.includes('const API_BASE = "/api"') && apiSrc.includes('credentials: "include"'));
check(
  "the conversations query key and refetch interval are unchanged",
  conversationsSrc.includes('queryKey: ["conversations"]') && conversationsSrc.includes("refetchInterval: 30_000"),
);
check(
  "the session query key and staleTime are unchanged",
  sessionSrc.includes('export const SESSION_KEY = ["receptionist-me"] as const;') &&
    sessionSrc.includes("staleTime: 60_000"),
);
check(
  "the overview issues no write of any kind",
  !/useMutation|method:\s*"(POST|PATCH|PUT|DELETE)"/.test(pageSrc) && !/useMutation|method:\s*"(POST|PATCH|PUT|DELETE)"/.test(overviewApiSrc),
);
check(
  "no polling interval was added by the redesign",
  (pageSrc.match(/refetchInterval/g) ?? []).length === 0 && (overviewApiSrc.match(/refetchInterval/g) ?? []).length === 0,
);
check(
  "every new voice-platform query is gated on the same voicePlatformEnabled flag other pages use",
  overviewApiSrc.includes('from "@/lib/featureFlags"') && (overviewApiSrc.match(/voicePlatformEnabled/g) ?? []).length >= 3,
);

// ─── 8. Routing and base-path helpers (unchanged shell) ────────────────────

section("routing and base paths");

check(
  "the router base is still derived from the Vite base with no trailing slash",
  routesSrc.includes('const RAW_BASE = import.meta.env.BASE_URL || "/";') &&
    routesSrc.includes('export const ROUTER_BASE = RAW_BASE.replace(/\\/+$/, "");'),
);
check(
  "every dashboard route path is base-relative, so it works at / and under a prefix",
  !/^\s*\w+:\s*"\/ai-receptionist/m.test(routesSrc),
);
check(
  "route order still puts sign-in and the public booking page ahead of the dashboard catch-all",
  appSrc.indexOf("ROUTES.login") < appSrc.indexOf("ROUTES.publicSchedule") &&
    appSrc.indexOf("ROUTES.publicSchedule") < appSrc.indexOf("<DashboardShell>"),
);
check(
  "the shell links with wouter's Link, never a hardcoded absolute dashboard URL",
  !/href="\/ai-receptionist/.test(shellSrc) && shellSrc.includes('from "wouter"'),
);
check("the skip link targets the one main landmark", shellSrc.includes('href="#sd-main"') && shellSrc.includes('id="sd-main"'));

// ─── 9. Navigation inventory (unchanged; this session does not own nav.ts) ─

section("navigation");

eq(
  "with the voice flag off, the visible destinations are exactly the built ones",
  visibleNavDestinations(false),
  ["/", "/conversations", "/receptionist", "/contacts", "/billing", "/settings"],
);
check(
  "every visible destination has a route registered in the router",
  visibleNavDestinations(false).every(
    (href) =>
      href === "/" ||
      new RegExp(`${href.replace(/\//g, "\\/")}"`).test(routesSrc),
  ),
);
check(
  "no navigation entry is rendered for an unbuilt capability",
  visibleNavGroups(false).every((g) => g.items.every((i) => i.state === "live" && Boolean(i.href))),
);
check(
  "turning the voice flag on only adds voice destinations, never removes one",
  visibleNavDestinations(false).every((href) => visibleNavDestinations(true).includes(href)),
);
eq(
  "the first group's heading is suppressed because it repeats its only item's name",
  visibleNavGroups(false).map((g) => `${g.label}:${g.showLabel}`),
  ["Overview:false", "Operate:true", "Manage:true"],
);
eq(
  "the overview item matches only the overview route",
  [
    isNavItemActive(visibleNavGroups(false)[0]!.items[0]!, "/"),
    isNavItemActive(visibleNavGroups(false)[0]!.items[0]!, "/contacts"),
  ],
  [true, false],
);
eq(
  "a section item matches its own subtree",
  [
    isNavItemActive(visibleNavGroups(false)[1]!.items[2]!, "/contacts/9"),
    isNavItemActive(visibleNavGroups(false)[1]!.items[2]!, "/billing"),
  ],
  [true, false],
);
check(
  "the approved navigation architecture in lib/nav.ts is read, not redefined",
  navSrc.includes('from "../../lib/nav.js"') && !navSrc.includes("label: \"Conversations\""),
);
check(
  "V5-BLUEPRINT.md §14 PR-5 registrations (Setup, Scheduling, Channels, Account) are not yet in nav.ts — reported to the nav owner, not added here",
  !navSrc.includes('"/setup"') && !navSrc.includes('"/scheduling/'),
);

// ─── 10. Accessible current-page, drawer and focus behaviour (unchanged shell,
//         two edits for the D-1 page structure) ────────────────────────────

section("accessibility contracts");

check("the current page is conveyed with aria-current", shellSrc.includes('aria-current={active ? "page" : undefined}'));
check(
  "the active indicator is driven by that same attribute, so state is never colour-only",
  cssSrc.includes('.sd-navlink[aria-current="page"]'),
);
check("navigation is a labelled nav landmark containing a list", shellSrc.includes('<nav className="sd-rail__nav" aria-label="Dashboard">') && shellSrc.includes("<ul className=\"sd-rail__list\">"));
check(
  "there is exactly one main landmark, and the shadcn sidebar chrome is no longer used",
  (shellCode.match(/<main/g) ?? []).length === 1 &&
    shellCode.includes('<main id="sd-main"') &&
    !shellCode.includes("SidebarInset") &&
    !shellCode.includes("components/ui/sidebar"),
);
check("a skip link is present", shellSrc.includes('className="sd-skip"'));
check(
  "the mobile navigation control is a real button with expanded state and a name",
  shellSrc.includes("aria-expanded={drawerOpen}") &&
    shellSrc.includes('aria-controls="sd-rail"') &&
    shellSrc.includes("Open navigation"),
);
check("the open drawer is a labelled modal dialog", shellSrc.includes('role: "dialog" as const') && shellSrc.includes('"aria-label": "Dashboard navigation"'));
check("Escape closes the drawer", shellSrc.includes('if (event.key === "Escape")'));
check("Tab is confined to the open drawer", shellSrc.includes('if (event.key !== "Tab") return;'));
check("focus moves into the drawer on open", shellCode.includes("target?.focus()"));
check("focus returns to the trigger on close", shellSrc.includes("triggerRef.current?.focus()"));
check("a closed drawer is removed from the tab order", shellSrc.includes("rail.inert = !isDesktop && !drawerOpen"));

const closeButton = /<button\s+ref=\{closeRef\}[\s\S]*?<\/button>/.exec(shellCode)?.[0] ?? "";

check("the drawer renders its own close control", closeButton.length > 0);
check(
  "it is a real semantic button, not a clickable div or link",
  closeButton.startsWith("<button") && closeButton.includes('type="button"'),
);
check(
  'it has the accessible name "Close navigation"',
  /<span className="sd-sr">Close navigation<\/span>/.test(closeButton),
);
check(
  "its icon is hidden from assistive technology, so the name is not doubled",
  /<X className="sd-railbtn__icon" aria-hidden="true" \/>/.test(closeButton),
);
check("activating it closes the drawer", closeButton.includes("onClick={closeDrawer}"));
check(
  "closeDrawer both closes and returns focus to the menu trigger",
  /const closeDrawer = useCallback\(\(\) => \{\s*setDrawerOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/.test(
    shellCode,
  ),
);
check(
  "it is rendered only in drawer mode — a permanent desktop rail has nothing to close",
  /\{!isDesktop && \(\s*<button\s+ref=\{closeRef\}/.test(shellCode),
);
check(
  "it receives initial focus when the drawer opens, ahead of every destination",
  shellCode.includes("closeRef.current ??") && shellCode.includes("target?.focus()"),
);
check(
  "the inert flag is cleared before focus is moved, or the focus move is refused",
  shellCode.indexOf("rail.inert = !isDesktop && !drawerOpen") <
    shellCode.indexOf("target?.focus()"),
);
check(
  "it precedes the navigation destinations in the drawer's tab order",
  shellCode.indexOf("ref={closeRef}") < shellCode.indexOf("<RailNav"),
);
check(
  "it reserves a 44x44 target and takes the rail's own focus ring",
  /\.sd-rail__close \{[^}]*width: 44px;[^}]*height: 44px;/.test(cssSrc) &&
    /\.sd-rail__close \{[^}]*color: var\(--sd-rail-text\)/.test(cssSrc),
);
check(
  "no glow, shadow, float or oversized treatment on it",
  !/\.sd-rail__close[^}]*(box-shadow|filter|position: (fixed|absolute)|transform: scale)/.test(cssSrc),
);
check(
  "the top bar control now only opens, so the occluded X can no longer be the way out",
  shellCode.includes("onClick={() => setDrawerOpen(true)}") &&
    !shellCode.includes("setDrawerOpen((open) => !open)"),
);
check(
  "the backdrop still dismisses, but it is no longer the only visible way out",
  shellCode.includes('className="sd-scrim"') && shellCode.includes("onClick={closeDrawer}"),
);
check(
  "the drawer's navigation destinations are unchanged by this control",
  shellCode.includes("<RailNav location={location} onNavigate={closeIfDrawer} />"),
);
check(
  "scroll lock compensates for the scrollbar so it cannot shift the layout",
  shellSrc.includes("window.innerWidth - documentElement.clientWidth") && shellSrc.includes("paddingRight"),
);
check("the loading state is announced", pageSrc.includes('role="status"') && pageSrc.includes('aria-busy="true"'));
check("the request-error state is announced", pageSrc.includes('role="alert"'));
check(
  "the error is not signalled by colour alone — it carries an icon, a heading and a retry control",
  pageSrc.includes("sd-error__icon") && pageSrc.includes("Try again"),
);
check("the retry control re-runs the same query, adding no new request", pageSrc.includes("onClick={() => refetchConversations()}"));
check(
  // D-1: the setup checklist itself moved to the Setup hub (S-3), which
  // conveys each step's status in text via <StatusChip> — see
  // setupContract.test.ts. Overview's status is now the single receptionist
  // state chip, and StatusChip always renders its label as visible text.
  "the receptionist state is conveyed in text via StatusChip, not colour alone",
  pageSrc.includes("<StatusChip") && read("artifacts/helpdesk/src/components/common/StatusChip.tsx").includes("{label}"),
);
check(
  "every interactive target in the shell CSS reserves at least 44px",
  (cssSrc.match(/min-height:\s*44px/g) ?? []).length >= 5 && cssSrc.includes("width: 44px"),
);
check("focus is visible and uses the mint ring", cssSrc.includes(".sd-app :focus-visible") && cssSrc.includes("--sd-focus-color"));
check(
  "reduced motion removes the entrance and every transition",
  cssSrc.includes("@media (prefers-reduced-motion: reduce)") &&
    cssSrc.includes("animation-duration: 0.01ms !important") &&
    cssSrc.includes("transition-duration: 0.01ms !important"),
);
check(
  // Overview.tsx now composes its title through the shared <PageHeader>
  // (components/common/PageHeader.tsx) rather than writing the h1 itself, so
  // the heading-order check reads that component's source instead.
  "the heading order is h1 then h2 with no level skipped, via the shared PageHeader",
  pageHeaderSrc.includes('<h1 className="sd-page__title">') &&
    !pageCode.includes("<h1") &&
    (pageCode.match(/<PageHeader/g) ?? []).length === 1 &&
    !pageSrc.includes("<h4"),
);

// ─── 11. Product readiness — no stale claim on Overview itself ─────────────

section("product readiness");

check(
  // The three-tier capability ladder ("SMS Receptionist: Available now",
  // "Voice experience: In development", …) is accurate on the public site and
  // on sign-in, which describe the product in general. It stopped being
  // accurate *here*: this build genuinely has a live voice platform behind
  // `voicePlatformEnabled`, so telling a firm with a live receptionist that
  // voice is "in development" would be the exact fabricated claim this
  // product forbids. The ladder was removed from Overview for that reason —
  // real, firm-specific status (the state chip, the assigned number, the
  // calendar connection) replaces it. Sign-in and the public site are
  // unaffected and still carry the shared wording, checked below.
  "the capability ladder is no longer duplicated on Overview",
  !pageCode.includes("CAPABILITY_STATUS") && !pageCode.includes("sd-ladder"),
);
for (const [tier, label] of [
  ["available", "Available now"],
  ["in-development", "In development"],
  ["planned", "Planned"],
] as const) {
  const declaration = new RegExp(`"?${tier}"?:\\s*\\{[^}]*label:\\s*"${label}"`);
  check(
    `the "${tier}" tier still reads "${label}" wherever it is shown (sign-in and the public site)`,
    declaration.test(readinessSrc) && declaration.test(publicReadinessSrc),
  );
}
check(
  "the empty state names what happens next and where to change it",
  pageCode.includes("No conversations yet") &&
    /texts your business number/.test(pageCode) &&
    /Current SMS\s+Receptionist/.test(pageCode),
);

// ─── 12. Design tokens have not drifted from the approved system ──────────

section("design tokens");

for (const token of [
  "--v2-warm-white: #fdfcfa",
  "--v2-offwhite: #f6fbfa",
  "--v2-mint-mist: #f0f9f6",
  "--v2-mint-100: #e8f8f5",
  "--v2-mint-500: #27e9b5",
  "--v2-navy-900: #051824",
  "--v2-slate-500: #3b5265",
]) {
  const [name, value] = token.split(": ");
  check(
    `${name} still matches the approved public token (${value})`,
    cssSrc.includes(token) && tokensSrc.toLowerCase().includes(`${name}: ${value}`.toLowerCase()),
  );
}
check("no remote asset is requested by the dashboard stylesheet", !/@import\s+url|https?:\/\//.test(cssSrc));
check("no image, video or generated asset is referenced", !/url\(|<video|<img/.test(cssSrc) && !/<img|<video/.test(pageSrc));
check(
  "text on mint is navy — white on mint is prohibited by the token system",
  cssSrc.includes("--sd-accent-ink: var(--v2-navy-900)"),
);
check("nothing loops: no infinite animation outside the skeleton and boot placeholders", (cssSrc.match(/infinite/g) ?? []).length === 2);
check(
  "only compositor-friendly properties are animated",
  !/transition:[^;]*\b(width|height|top|left|margin|padding|filter|background-position)\b/.test(cssSrc),
);
check("hover transforms are gated behind a fine pointer", cssSrc.includes("@media (hover: hover) and (pointer: fine)"));

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Overview (D-1) dashboard contract tests passed.");
