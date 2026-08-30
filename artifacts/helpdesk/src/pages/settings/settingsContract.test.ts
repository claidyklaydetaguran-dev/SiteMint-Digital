/**
 * Frontend V2 Phase 11 — committed contract tests for the Settings workspace.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as Phases 5–10: the file lives beside the module it tests,
 * `scripts` owns the runner because it is the workspace package that already
 * has `tsx`, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob so nothing
 * here is type-built into the app or bundled by Vite.
 *
 * Much of this file asserts absence, and deliberately so. Phase 11 established
 * that the receptionist surface has **no settings endpoint and no preference
 * model**, so the regression to guard against is not a broken control — it is a
 * plausible one that was invented. Every phrase the previous page displayed is
 * enumerated below and required to be gone from the source, from the contract
 * module and from the built output.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, never creates a
 * session, and never contacts a provider.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  accountFields,
  accountNote,
  destinations,
  isKnownPlan,
  memberSince,
  NOT_AVAILABLE,
  pageCopy,
  planLabel,
  preferenceNotice,
  sessionCopy,
  signOutLabel,
  SIGN_OUT_TIMEOUT_MS,
  type AccountSource,
} from "./settingsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/settings → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Settings.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/settings/settingsContract.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-settings.css");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const shellSrc = read("artifacts/helpdesk/src/components/layout/AppShell.tsx");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const authRouteSrc = read("artifacts/api-server/src/routes/receptionistAuth.ts");

/**
 * Source with comments stripped. This route explains at length what it removed
 * and why, so a prose mention of a deleted preference must never be mistaken
 * for the control still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const contractCode = stripComments(contractSrc);
const cssCode = stripComments(cssSrc);
const routeCode = `${pageCode}\n${contractCode}`;

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
  check(
    `${label} (got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const firm = (over: Partial<AccountSource> = {}): AccountSource => ({
  name: "Northgate Plumbing",
  email: "owner@northgate.example",
  planTier: "trial",
  createdAt: "2026-06-01T09:00:00.000Z",
  ...over,
});

const LONG_NAME =
  "Northgate Plumbing, Heating, Drainage and Emergency Restoration Services of the Greater Metropolitan Area";
const LONG_EMAIL =
  "operations.scheduling.and.dispatch.team.northgate@extremely-long-subdomain.example.com";

// ─── The premise: no settings contract exists ──────────────────────────────

section("Premise — the product stores no preferences");

check(
  "the session route returns only name, email, planTier, trial limit and createdAt",
  (() => {
    const block = /auth\/me[\s\S]{0,1400}/.exec(authRouteSrc)?.[0] ?? "";
    return (
      block.includes("intakeFirms.email") &&
      block.includes("intakeFirms.planTier") &&
      block.includes("intakeFirms.createdAt") &&
      !/locale|timeZone|time_zone|dateFormat|date_format|hourCycle/i.test(block)
    );
  })(),
);

check(
  "no locale, time-zone, date-format or hour-cycle field exists in the session hook",
  !/locale|timeZone|time_zone|dateFormat|date_format|hourCycle|hour_cycle/i.test(sessionSrc),
);

// Endpoint *shapes* only. The approved notice legitimately contains the word
// "preferences", and matching that would forbid the very copy this phase
// requires.
check(
  "no settings endpoint is referenced anywhere on the route",
  !/receptionist\/settings|api\/settings|\/settings\/(api|preferences)\b|\/preferences["'`\/]/i.test(
    routeCode,
  ),
);

// ─── Requests ──────────────────────────────────────────────────────────────

section("Requests — the shell's session, and the logout the operator asks for");

check(
  "the page reads the shared session hook rather than fetching for itself",
  pageCode.includes("useSession") && pageCode.includes('from "@/hooks/useSession"'),
);

check(
  "the page opens no query, mutation or cache entry of its own",
  !/useQuery\(|useMutation|useQueryClient|queryKey|fetchQuery|invalidateQueries/.test(pageCode),
);

check(
  "the session hook still uses one shared key, so a second observer adds no request",
  sessionSrc.includes('export const SESSION_KEY = ["receptionist-me"]') &&
    sessionSrc.includes("staleTime: 60_000"),
);

check(
  "the page never calls the API client or fetch directly",
  !/apiFetch|fetch\(|XMLHttpRequest|axios/.test(pageCode),
);

check(
  "no polling, interval or refetch is introduced",
  !/refetchInterval|refetchOnWindowFocus|setInterval|refetch\(/.test(pageCode),
);

check(
  "the only timer bounds the logout wait — it starts no request",
  (pageCode.match(/setTimeout/g) ?? []).length === 1 &&
    pageCode.includes("SIGN_OUT_TIMEOUT_MS"),
);

check(
  "logout goes through the existing hook, not a hand-rolled request",
  pageCode.includes("useLogout") && !pageCode.includes("auth/logout"),
);

check(
  "the existing logout contract is unchanged",
  sessionSrc.includes(
    'await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" })',
  ) && sessionSrc.includes("qc.clear()"),
);

check(
  "neither Receptionist nor Billing data is prefetched from this route",
  !/prefetch|preload|agent-config|conversations\?|billing\//i.test(pageCode),
);

check(
  "no firm identifier is sent from the client — scoping stays server-side",
  !/firmId|firm_id/.test(pageCode),
);

check(
  "no Authorization/Bearer header is constructed — the two auth systems stay separate",
  !/Authorization|Bearer|localStorage/.test(pageCode),
);

check(
  "no token, session id, cookie or internal auth detail is rendered",
  !/session_id|sessionId|receptionist_session|document\.cookie|token/i.test(pageCode),
);

// ─── Nothing is fabricated ─────────────────────────────────────────────────

section("Truth — every removed claim stays removed");

/**
 * The exact content the previous Settings page displayed, plus the controls a
 * settings page is expected to grow. Matched by fragment so that enforcing
 * their absence does not reintroduce them as literals in the source.
 */
const BANNED: [string, RegExp][] = [
  ["display language", /Display\s+Langu/i],
  ["the hardcoded locale", /English\s*\(United\s*States\)/i],
  ["the hardcoded offset", /UTC-8/i],
  ["the hardcoded zone name", /Pacific\s+Time/i],
  ["a time-zone control", /Time\s?zone/i],
  ["the hardcoded date format", /MM\/DD\/YYYY/i],
  ["a date-format control", /Date\s+Format/i],
  ["a 24-hour switch", /24-hour/i],
  ["team members", /Team\s+Members/i],
  ["a coming-soon promise", /Coming\s+Soon/i],
  ["the unverified single-login claim", /one\s+login\s+per\s+business/i],
  ["multi-user access", /[Mm]ulti-user/],
  ["a save control", /Save\s+changes/i],
  ["profile editing", /Edit\s+profile/i],
  ["a password change", /Change\s+password/i],
  ["a team invitation", /Invite\s+team|Manage\s+team/i],
  ["notification preferences", /Notification\s+preferen/i],
];

const bannedHits = (src: string) =>
  BANNED.filter(([, re]) => re.test(src)).map(([name]) => name);

check(
  "no removed phrase appears in the rendered page",
  bannedHits(pageCode).length === 0,
);

check(
  "no removed phrase appears in the contract module's executable code",
  bannedHits(contractCode).length === 0,
);

check(
  "no removed phrase appears in the route stylesheet",
  bannedHits(cssSrc).length === 0,
);

check(
  "no removed phrase is produced by any contract function",
  (() => {
    const rendered = [
      pageCopy().eyebrow,
      pageCopy().title,
      pageCopy().detail,
      accountNote(),
      preferenceNotice().title,
      preferenceNotice().detail,
      ...destinations().flatMap((d) => [d.title, d.detail, d.action]),
      ...Object.values(sessionCopy()),
      ...accountFields(firm()).map((f) => `${f.label} ${f.value}`),
      NOT_AVAILABLE,
    ].join("\n");
    return bannedHits(rendered).length === 0;
  })(),
);

check(
  "no editable control of any kind is rendered — no input, select, switch or form",
  !/<input|<select|<textarea|<form|<Switch|role="switch"|contentEditable/.test(pageCode),
);

check(
  "no disabled placeholder control stands in for a future feature",
  !/disabled(?!=\{signOut === "pending"\})/.test(pageCode),
);

check(
  "the only button on the route is Sign out",
  (pageCode.match(/<button/g) ?? []).length === 1,
);

check(
  "no Change, Edit, Save, Update or Manage control appears",
  !/>\s*(Change|Edit|Save|Update|Manage|Invite|Remove|Add)\b/.test(pageCode),
);

check(
  "no roadmap or release promise is made",
  !/coming soon|soon|shortly|on the way|next release|roadmap|arriving|planned for/i.test(
    [
      preferenceNotice().title,
      preferenceNotice().detail,
      accountNote(),
      pageCopy().detail,
    ].join(" "),
  ),
);

check(
  "the preference notice describes the application, not a fault or a wait",
  !/error|failed|unable|problem|temporarily/i.test(
    `${preferenceNotice().title} ${preferenceNotice().detail}`,
  ),
);

check(
  "no value is inferred from the browser, device or current date",
  !/Intl\.|navigator\.|resolvedOptions|Date\.now\(\)|new Date\(\)/.test(routeCode),
);

check(
  "no fabricated identity — no avatar, initials or generated name",
  !/avatar|initials|getInitials|charAt\(0\)|placeholderName/i.test(pageCode),
);

check(
  "no fabricated statistic or decorative figure",
  !/sd-figure|sd-chip|percent|Math\.round|toFixed/.test(pageCode),
);

// ─── Account values ────────────────────────────────────────────────────────

section("Account — verified session values only");

eq(
  "a complete session renders all four labels in reading order",
  accountFields(firm()).map((f) => f.label),
  ["Business", "Email", "Plan", "Member since"],
);

eq("the business name is the session's own", accountFields(firm())[0]?.value, "Northgate Plumbing");

eq(
  "the email address is the session's own",
  accountFields(firm())[1]?.value,
  "owner@northgate.example",
);

eq(
  "a null email renders the concise unavailable treatment, never a guess",
  accountFields(firm({ email: null }))[1]?.value,
  null,
);

eq(
  "a whitespace-only email is treated as absent",
  accountFields(firm({ email: "   " }))[1]?.value,
  null,
);

eq("the unavailable treatment is stated once, plainly", NOT_AVAILABLE, "Not available");

eq(
  "a blank plan omits the row entirely rather than inventing a tier",
  accountFields(firm({ planTier: "" })).map((f) => f.label),
  ["Business", "Email", "Member since"],
);

eq(
  "a blank createdAt omits Member since rather than inventing a date",
  accountFields(firm({ createdAt: "" })).map((f) => f.label),
  ["Business", "Email", "Plan"],
);

eq(
  "an unparseable createdAt omits Member since",
  accountFields(firm({ createdAt: "not-a-date" })).map((f) => f.label),
  ["Business", "Email", "Plan"],
);

eq(
  "with every optional field absent, the layout still has both required rows",
  accountFields(firm({ email: null, planTier: "  ", createdAt: "" })).map((f) => [
    f.label,
    f.value,
  ]),
  [
    ["Business", "Northgate Plumbing"],
    ["Email", null],
  ],
);

// Phase 12 removed the invented product name "Pro" at this, its only source;
// Billing imports this same helper, so both routes read the plan identically.
eq("a paid plan reads as a neutral verified label", planLabel("paid"), "Paid plan");
eq("a trial plan reuses the shared verified label", planLabel("trial"), "Free Trial");
eq("the plan label never names a product this repository does not have",
  /pro|premium|enterprise|unlimited/i.test(planLabel("paid") ?? ""), false);

eq(
  "an unrecognised plan is echoed verbatim, never renamed",
  planLabel("enterprise_legacy_2019"),
  "enterprise_legacy_2019",
);

eq("a blank plan yields no label at all", planLabel("   "), null);
eq("a null plan yields no label at all", planLabel(null), null);

check(
  "only the two verified tiers are reported as known",
  isKnownPlan("paid") && isKnownPlan("trial") && !isKnownPlan("enterprise_legacy_2019") &&
    !isKnownPlan(""),
);

eq(
  "member since uses Billing's existing format",
  memberSince("2026-06-01T09:00:00.000Z"),
  new Date("2026-06-01T09:00:00.000Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
);

eq("an empty createdAt yields no date", memberSince(""), null);
eq("an invalid createdAt yields no date", memberSince("tomorrow"), null);
eq("an undefined createdAt yields no date", memberSince(undefined), null);

check(
  "a long business name and a long email survive intact — never truncated in data",
  accountFields(firm({ name: LONG_NAME, email: LONG_EMAIL }))[0]?.value === LONG_NAME &&
    accountFields(firm({ name: LONG_NAME, email: LONG_EMAIL }))[1]?.value === LONG_EMAIL,
);

check(
  "long values wrap in the layout rather than being clipped",
  cssCode.includes("overflow-wrap: anywhere") && !/text-overflow:\s*ellipsis/.test(cssCode),
);

eq(
  "the account note explains provenance without sounding like a failure",
  accountNote(),
  "These values are shown as they are recorded on your account.",
);

check(
  "the account note does not describe editing as blocked",
  !/cannot|can't|unable|not allowed|locked|disabled/i.test(accountNote()),
);

// ─── Destinations ──────────────────────────────────────────────────────────

section("Configuration destinations");

eq(
  "exactly two destinations, both genuine dashboard routes",
  destinations().map((d) => d.href),
  ["/receptionist", "/billing"],
);

eq(
  "the receptionist destination is the approved wording",
  destinations()[0],
  {
    href: "/receptionist",
    title: "Receptionist",
    detail: "Open the SMS Receptionist configuration.",
    action: "Open Receptionist",
  },
);

eq(
  "the billing destination is the approved wording",
  destinations()[1],
  {
    href: "/billing",
    title: "Billing",
    detail: "Review plan and usage information.",
    action: "View billing",
  },
);

check(
  "both destinations resolve to routes registered in the default build",
  destinations().every((d) =>
    appSrc.includes(`ROUTES.${d.href === "/receptionist" ? "receptionist" : "billing"}`),
  ) &&
    routesSrc.includes('receptionist: "/receptionist"') &&
    routesSrc.includes('billing: "/billing"'),
);

check(
  "neither destination is behind the voice-platform flag",
  (() => {
    const gated = appSrc.slice(appSrc.indexOf("{voicePlatformEnabled && ("));
    return !gated.includes("ROUTES.receptionist") && !gated.includes("ROUTES.billing");
  })(),
);

check(
  "destinations are rendered as links, not as clickable cards",
  /<Link/.test(pageCode) && !/<li[^>]*onClick|<div[^>]*onClick/.test(pageCode),
);

check(
  "links are base-relative — no deployment prefix is hardcoded",
  !/\/ai-receptionist\/dashboard/.test(routeCode) &&
    destinations().every((d) => d.href.startsWith("/") && !d.href.startsWith("//")),
);

check(
  "no link to the API-keys route is offered",
  !/api-keys|apiKeys|API Keys/i.test(routeCode),
);

// ─── Preference notice ─────────────────────────────────────────────────────

section("Preference availability");

eq("the notice is neutral, not an error or a warning", preferenceNotice().tone, "neutral");

eq(
  "the notice heading is the approved wording",
  preferenceNotice().title,
  "Account preferences are not available",
);

eq(
  "the notice body is the approved wording",
  preferenceNotice().detail,
  "This application does not currently provide stored language, time-zone, or date-format settings.",
);

// ─── Session action ────────────────────────────────────────────────────────

section("Sign out");

eq("the section heading is the approved wording", sessionCopy().title, "Session");
eq("the section description is the approved wording", sessionCopy().detail, "Sign out of this browser.");
eq("the idle label is the approved wording", signOutLabel("idle"), "Sign out");
eq("the pending label states what is happening", signOutLabel("pending"), "Signing out…");
eq("a failed sign-out returns the control to its idle label", signOutLabel("failed"), "Sign out");

eq(
  "the failure heading names what did not happen",
  sessionCopy().errorTitle,
  "Sign out did not complete",
);

eq(
  "the failure body says what to do next",
  sessionCopy().errorDetail,
  "The request did not complete. Check your connection and try again.",
);

check(
  "the failure copy does not apologise or speculate about the cause",
  !/sorry|apolog|oops|server error|our end|something went wrong/i.test(
    `${sessionCopy().errorTitle} ${sessionCopy().errorDetail}`,
  ),
);

check(
  "the sign-out description does not claim to end sessions elsewhere",
  !/all devices|everywhere|other browsers|every session/i.test(sessionCopy().detail),
);

check(
  "the pending state cannot last forever — the wait is bounded",
  SIGN_OUT_TIMEOUT_MS > 0 && SIGN_OUT_TIMEOUT_MS <= 30_000,
);

check(
  "a second activation while pending is ignored",
  pageCode.includes('if (signOut === "pending") return;'),
);

check(
  "the control is disabled and marked busy while pending",
  pageCode.includes('disabled={signOut === "pending"}') &&
    pageCode.includes('aria-busy={signOut === "pending"}'),
);

check(
  "a successful sign-out navigates to the sign-in route",
  pageCode.includes('navigate("/login")'),
);

check(
  "the failure is announced, not merely coloured",
  pageCode.includes('role="alert"') && cssCode.includes("--sd-danger"),
);

check(
  "focus returns to the control that failed",
  pageCode.includes('if (signOut === "failed") signOutRef.current?.focus()'),
);

check(
  "the page is never announced as a live region in its entirety",
  (pageCode.match(/aria-live/g) ?? []).length === 1 &&
    pageCode.includes('role="status" aria-live="polite"'),
);

// ─── Loading and session expiry ────────────────────────────────────────────

section("Loading, expiry and authorisation");

check(
  "the loading branch is announced and renders no account value",
  pageCode.includes('role="status" aria-live="polite"') &&
    pageCode.includes("Loading account information"),
);

check(
  "no authenticated content renders before the session resolves",
  pageCode.indexOf("if (isLoading)") < pageCode.indexOf("accountFields(me.firm)") &&
    pageCode.includes("if (!me) return null;"),
);

check(
  "the shell still owns the redirect on an expired session",
  shellSrc.includes('if (!isLoading && isError) navigate("/login")') &&
    shellSrc.includes("if (isError || !me) return null;"),
);

check(
  "the page does not duplicate or weaken the shell's redirect",
  !/isError/.test(pageCode),
);

check(
  "no fabricated fallback identity is rendered when the session is absent",
  !/\?\?\s*"[A-Za-z]|\|\|\s*"[A-Za-z]/.test(pageCode.replace(/\?\? NOT_AVAILABLE/g, "")),
);

// ─── Navigation and gating contract preserved ──────────────────────────────

section("Navigation and feature gating — unchanged from the protected baseline");

check(
  "the settings route path is unchanged",
  routesSrc.includes('settings: "/settings"'),
);

check(
  "the settings route is still registered, in the same position, inside the shell",
  appSrc.includes("<Route path={ROUTES.settings} component={Settings} />") &&
    appSrc.indexOf("ROUTES.contactDetail") < appSrc.indexOf("ROUTES.settings") &&
    appSrc.indexOf("ROUTES.settings") < appSrc.indexOf("ROUTES.billing") &&
    appSrc.indexOf("<DashboardShell>") < appSrc.indexOf("ROUTES.settings") &&
    appSrc.indexOf("ROUTES.settings") < appSrc.indexOf("</DashboardShell>"),
);

check(
  "the page is still lazy-imported at its own call site",
  appSrc.includes('const Settings = lazy(() => import("@/pages/Settings"))'),
);

check(
  "the settings nav entry is untouched — still live, still ungated, still /settings",
  navSrc.includes(
    '{ key: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, state: "live", voiceGated: false }',
  ),
);

check(
  "the API-keys nav entry is untouched — still advanced, still voice-gated",
  navSrc.includes('key: "api-keys", label: "API Keys", href: "/settings/api-keys", icon: KeyRound') &&
    navSrc.includes('state: "advanced", voiceGated: true'),
);

check(
  "voice feature gating is unchanged",
  flagsSrc.includes("VITE_VOICE_PLATFORM_ENABLED") &&
    flagsSrc.includes("VITE_VOICE_PUBLISH_ENABLED") &&
    appSrc.includes("const comingSoonRoutes = voicePlatformEnabled"),
);

check(
  "the route neither reads nor changes a feature flag",
  !/featureFlags|voicePlatformEnabled|voicePublishEnabled|import\.meta\.env/.test(routeCode),
);

check(
  "no secondary settings navigation with dead tabs survives",
  !/activePanel|setActivePanel|Panel\b|NAV\s*[:=]/.test(pageCode),
);

// ─── Accessibility ─────────────────────────────────────────────────────────

section("Accessibility");

check("the page has exactly one h1", (pageCode.match(/<h1/g) ?? []).length === 1);

check(
  "the heading order is h1 → h2 → h3 with no level skipped",
  /<h1/.test(pageCode) &&
    /<h2/.test(pageCode) &&
    pageCode.indexOf("<h1") < pageCode.indexOf("<h2") &&
    pageCode.indexOf("<h2") < pageCode.indexOf("<h3") &&
    !/<h4|<h5|<h6/.test(pageCode),
);

check(
  "every section is labelled by its own heading",
  (pageCode.match(/aria-labelledby=/g) ?? []).length ===
    (pageCode.match(/<section/g) ?? []).length,
);

check(
  "account values use real description-list semantics",
  /<dl/.test(pageCode) && /<dt/.test(pageCode) && /<dd/.test(pageCode),
);

check(
  "destinations use a real list",
  /<ul/.test(pageCode) && /<li/.test(pageCode),
);

check(
  "no clickable generic element and no positive tabIndex",
  !/<div[^>]*onClick|<span[^>]*onClick/.test(pageCode) && !/tabIndex=\{[1-9]/.test(pageCode),
);

check(
  "decorative icons are hidden from assistive technology",
  (pageCode.match(/<ArrowRight/g) ?? []).length <=
    (pageCode.match(/aria-hidden="true"/g) ?? []).length,
);

check(
  "the missing-value state is carried by words, not by colour alone",
  pageCode.includes("NOT_AVAILABLE") && cssCode.includes('[data-missing="true"]'),
);

check(
  "every interactive target reserves at least 44px",
  cssCode.includes("min-height: 44px"),
);

check(
  "focus is visible and uses the shared mint ring",
  cssCode.includes("focus-visible") && cssCode.includes("--sd-focus-color"),
);

check(
  "hover is never the only way to reveal an action",
  !/opacity:\s*0/.test(cssCode) && !/visibility:\s*hidden/.test(cssCode),
);

// ─── Visual system ─────────────────────────────────────────────────────────

section("Visual system — inherited, not re-invented");

check(
  "the stylesheet defines no colour of its own — every value is an --sd-* token",
  !/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(cssCode),
);

check(
  "no purple, indigo or ordinary green is introduced",
  !/purple|indigo|violet|#7c3aed|#4f46e5|\bgreen\b/i.test(cssCode),
);

check(
  "no gradient, glass or glow",
  !/gradient|backdrop-filter|box-shadow:[^;]*rgba?\([^)]*0\.[3-9]/i.test(cssCode),
);

check(
  "no image, video or generated asset is referenced",
  !/url\(/.test(cssCode) && !/<img|<video/.test(pageCode),
);

check(
  "the shell stylesheet is imported alongside, not replaced",
  pageSrc.includes('import "@/styles/v2-dashboard.css"') &&
    pageSrc.includes('import "@/styles/v2-settings.css"'),
);

check(
  "the workspace is styled by its own namespace and does not redefine sd-* classes",
  !/^\.sd-[a-z-]+\s*\{/m.test(cssCode),
);

check(
  "not every section became a card",
  (cssCode.match(/border-radius: var\(--sd-radius-card\)/g) ?? []).length <= 1,
);

check(
  "no shadcn component is reintroduced — the route uses the shell's own vocabulary",
  !/@\/components\/ui\//.test(pageCode),
);

check(
  "red is reserved for the one genuine error state",
  (cssCode.match(/--sd-danger/g) ?? []).length > 0 &&
    !/--sd-danger/.test(cssCode.slice(0, cssCode.indexOf(".sg-failure"))),
);

// ─── Motion ────────────────────────────────────────────────────────────────

section("Motion");

check("the layer adds no keyframes of its own", !/@keyframes/.test(cssCode));

check(
  "no continuous or infinite animation",
  !/infinite|animation-iteration-count:\s*(?!1\b)/.test(cssCode),
);

check(
  "the shared single entrance is used, and nothing is staggered",
  pageCode.includes("sd-enter") &&
    !/animation-delay|stagger|transitionDelay/.test(`${cssCode}\n${pageCode}`),
);

check(
  "transitions are limited to colour properties — no layout animation",
  !/transition:\s*(all|width|height|top|left|margin|padding)/.test(cssCode),
);

// ─── Built output ──────────────────────────────────────────────────────────

section("Built output — the removed content is absent from the bundle");

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
if (!existsSync(distDir)) {
  console.log("  SKIP  no build present; run the helpdesk build to check the bundle");
} else {
  const settingsChunks = readdirSync(distDir).filter((f) => /^Settings-.*\.js$/.test(f));
  check("exactly one Settings route chunk is emitted", settingsChunks.length === 1);

  /**
   * The Settings route's built graph: its own chunk plus the sibling chunks it
   * statically imports, excluding the shared application entry.
   *
   * Phase 12 made `settingsContract.ts` a genuinely shared module — Billing
   * imports `planLabel` from it so one account cannot be named two different
   * things on two routes — and Vite therefore emits it as its own chunk rather
   * than inlining it here. The assertions below are unchanged in what they
   * require; only where they look has been corrected, because "inside
   * `Settings-*.js`" stopped being the same question as "in what this route
   * ships". Following the imports is strictly the stronger check: a banned
   * phrase can no longer escape detection by being hoisted into a shared chunk.
   */
  const routeGraph = (entry: string, includeEntryChunk: boolean): string[] => {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (seen.has(file) || !existsSync(path.join(distDir, file))) continue;
      seen.add(file);
      const src = readFileSync(path.join(distDir, file), "utf8");
      for (const m of src.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
        if (includeEntryChunk || !/^index-/.test(m[1]!)) queue.push(m[1]!);
      }
    }
    return [...seen];
  };
  const join = (files: string[]) =>
    files.map((f) => readFileSync(path.join(distDir, f), "utf8")).join("\n");

  /* Everything the route actually ships, entry chunk included — the right scope
     for "is the approved wording present". `settingsContract` is now imported by
     the shell as well as by two routes, so Vite folds it into the entry chunk;
     that is where the notice legitimately lives. */
  const built = join(routeGraph(settingsChunks[0]!, true));
  /* The route's own code, entry excluded — the right scope for "did an invented
     phrase come back", since the shared entry carries unrelated app code. */
  const routeOnly = join(routeGraph(settingsChunks[0]!, false));

  check("no removed phrase survives into the built Settings code", bannedHits(routeOnly).length === 0);
  check(
    "the built output contains the approved preference notice",
    built.includes("Account preferences are not available"),
  );
  check(
    "the built chunk references no settings endpoint",
    !/receptionist\/settings|api\/settings/.test(routeOnly),
  );
  // Targeted, whole-bundle: the invented product name must exist nowhere at all.
  const wholeBundle = join(readdirSync(distDir).filter((f) => f.endsWith(".js")));
  check(
    "the invented product name is absent from every emitted chunk",
    !/Pro plan|Pro \(Paid\)/.test(wholeBundle),
  );
}

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 11 settings contract tests passed.");
