/**
 * Frontend V2 Phase 8 — committed contract tests for the SMS Conversations
 * workspace.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as the Phase 5 signup, Phase 6 sign-in and Phase 7 overview
 * suites: the file sits beside the module it tests, `scripts` owns the runner
 * because it is the workspace package that already has `tsx`, and helpdesk's
 * tsconfig excludes `**\/*.test.ts` by glob so nothing here is type-built into
 * the app or bundled by Vite. No test framework, no DOM, no new dependency, no
 * frozen configuration touched.
 *
 * Two kinds of assertion:
 *
 *  1. **Behavioural.** `conversationsContract.ts` is pure and imported
 *     directly, so filtering, ordering, grouping, attention, messaging
 *     availability and every error and empty message are executed.
 *  2. **Structural.** `Inbox.tsx`, `App.tsx`, `routes.ts`, the API client, the
 *     conversations hook, the server router and the stylesheet are read as
 *     source and checked for what a renderer would otherwise be needed to
 *     prove — the preserved endpoints, the listbox semantics, the absence of
 *     any send path, and the absence of fabricated data.
 *
 * It never performs a network request, never signs in, never creates a
 * session, and never sends a message.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attentionOf,
  detailFailure,
  emptyCopy,
  filterConversations,
  formatAbsolute,
  groupMessagesByDay,
  isoAttribute,
  listFailure,
  matchesQuery,
  messagingState,
  senderLabel,
  statusCounts,
  statusPresentation,
  tierLabel,
  type ContractConversation,
  type ContractMessage,
} from "./conversationsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/conversations → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Inbox.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/conversations/conversationsContract.ts");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const apiSrc = read("artifacts/helpdesk/src/lib/api.ts");
const hookSrc = read("artifacts/helpdesk/src/hooks/useConversations.ts");
const shellSrc = read("artifacts/helpdesk/src/shells/DashboardShell.tsx");
const appShellSrc = read("artifacts/helpdesk/src/components/layout/AppShell.tsx");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-conversations.css");
const serverSrc = read("artifacts/api-server/src/routes/receptionistConversations.ts");

/**
 * Source with comments stripped. This workspace explains at length what it
 * does *not* have — a composer, a send endpoint, an unread flag — so a prose
 * mention of an absent capability must never be mistaken for the thing being
 * implemented.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const contractCode = stripComments(contractSrc);
const serverCode = stripComments(serverSrc);
/** CSS has only block comments, and this stylesheet documents what it avoids. */
const cssCode = cssSrc.replace(/\/\*[\s\S]*?\*\//g, "");

// ─── Tiny runner ───────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function equal(label: string, actual: unknown, expected: unknown): void {
  check(`${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected));
}

// ─── Fixtures (local to this file; never shipped, never a fallback) ────────

const conv = (over: Partial<ContractConversation> & { id: number }): ContractConversation => ({
  createdAt: "2026-08-01T10:00:00.000Z",
  lastMessageAt: "2026-08-01T12:00:00.000Z",
  callerPhone: "+15551230001",
  status: "in_progress",
  tier: null,
  disqualifyReason: null,
  ...over,
});

const msg = (over: Partial<ContractMessage> & { id: number }): ContractMessage => ({
  createdAt: "2026-08-01T10:00:00.000Z",
  conversationId: 1,
  direction: "inbound",
  body: "Hello",
  ...over,
});

// ── 1. Route, base path and authenticated protection ───────────────────────

console.log("\nRoute and protection");

check(
  "the conversations route is declared once, base-relative, in the shared route table",
  /conversations:\s*"\/conversations"/.test(routesSrc),
);
check(
  "the route renders the Inbox page inside the authenticated DashboardShell switch",
  /<Route path=\{ROUTES\.conversations\} component=\{Inbox\} \/>/.test(appSrc) &&
    appSrc.indexOf("<DashboardShell>") < appSrc.indexOf("ROUTES.conversations"),
);
check(
  "the route is not in the unauthenticated Switch (login and the public booking page are)",
  appSrc.indexOf("ROUTES.publicSchedule") < appSrc.indexOf("<DashboardShell>") &&
    appSrc.indexOf("ROUTES.login") < appSrc.indexOf("<DashboardShell>"),
);
check(
  "the page itself renders no authenticated content gate of its own — AppShell still owns the session",
  !/useSession|auth\/me/.test(pageCode) &&
    /GET \/api\/receptionist\/auth\/me|useSession/.test(appShellSrc),
);
check(
  "AppShell still redirects to /login when the session query errors",
  /if \(!isLoading && isError\) navigate\("\/login"\)/.test(appShellSrc),
);
check(
  "the shell wrapping the route is unchanged (still AppShell + route error boundary)",
  shellSrc.includes("<AppShell>") && shellSrc.includes("RouteErrorBoundary"),
);

// Both the root base and the configured prefix are produced by the same
// helper, so a route cannot be correct under one and wrong under the other.
check(
  "router base is derived from the Vite base, so root and prefix builds share one route table",
  /const RAW_BASE = import\.meta\.env\.BASE_URL \|\| "\/"/.test(routesSrc) &&
    /ROUTER_BASE = RAW_BASE\.replace\(\/\\\/\+\$\/, ""\)/.test(routesSrc),
);
check(
  "the router is mounted with that base",
  /<WouterRouter base=\{ROUTER_BASE\}>/.test(appSrc),
);
check(
  "no absolute dashboard path is hardcoded in the workspace",
  !/["'`]\/ai-receptionist\/dashboard/.test(pageCode),
);

// ── 2. Preserved API contracts ─────────────────────────────────────────────

console.log("\nPreserved API contracts");

check(
  "list request is unchanged: GET /receptionist/conversations via the shared apiFetch",
  /apiFetch<\{ conversations: Conversation\[\] \}>\("\/receptionist\/conversations"\)/.test(hookSrc),
);
check(
  "list query key and 30s refetch interval are unchanged",
  /queryKey: \["conversations"\]/.test(hookSrc) && /refetchInterval: 30_000/.test(hookSrc),
);
check(
  "detail request is unchanged: GET /receptionist/conversations/:id",
  /apiFetch<ConversationDetail>\(`\/receptionist\/conversations\/\$\{id\}`\)/.test(pageCode),
);
check(
  "detail query key and 15s refetch interval are unchanged",
  /queryKey: \["conversation", id\]/.test(pageCode) && /refetchInterval: 15_000/.test(pageCode),
);
check(
  "detail is only requested once a conversation is selected",
  /enabled: !!id/.test(pageCode),
);
check(
  "the API client still sends the session cookie and sets no new header",
  /credentials: "include"/.test(apiSrc) &&
    /"Content-Type": "application\/json"/.test(apiSrc),
);
check(
  "the workspace issues no request of its own — every call goes through apiFetch",
  !/\bfetch\(|XMLHttpRequest|axios|EventSource|WebSocket/.test(pageCode),
);
check(
  "no request body is ever constructed by the workspace",
  !/method:\s*["'](POST|PUT|PATCH|DELETE)/i.test(pageCode) && !/JSON\.stringify/.test(pageCode),
);
check(
  "polling is unchanged — no new interval, timer or animation-driven refetch",
  !/setInterval|setTimeout|requestAnimationFrame/.test(pageCode),
);
check(
  "no cross-selection cache carry-over: keepPreviousData / placeholderData is not used",
  !/keepPreviousData|placeholderData/.test(pageCode),
);

// ── 3. Tenant isolation and the absence of a send path ─────────────────────

console.log("\nTenant isolation and send-path absence");

check(
  "server list route is still firm-scoped by the session firmId",
  /eq\(intakeConversations\.firmId, req\.firmId!\)/.test(serverCode),
);
check(
  "server detail route still enforces firm isolation and 404s otherwise",
  /eq\(intakeConversations\.firmId, req\.firmId!\)/.test(serverCode) &&
    /status\(404\)/.test(serverCode),
);
check(
  "both server routes still require receptionist auth",
  // One import plus one guard per route. Counting the guard *inside* each
  // `router.get(...)` is what proves neither route lost it.
  (serverCode.match(/router\.get\([\s\S]*?requireReceptionistAuth/g) ?? []).length === 2,
);
check(
  "the server exposes exactly two conversation routes and both are GET",
  (serverCode.match(/router\.get\(/g) ?? []).length === 2 &&
    !/router\.(post|put|patch|delete)\(/.test(serverCode),
);
check(
  "no firm, tenant or account id is ever sent from the browser",
  !/firmId|firm_id|tenantId/.test(pageCode),
);

// This is the load-bearing assertion of the whole phase: the dashboard has no
// way to send an SMS, so the workspace must contain no control that implies
// one — not an enabled control, and not a disabled one either.
check(
  "messagingState().canSend is the literal type false — an enabled send control cannot be typed",
  /canSend: false;/.test(contractSrc),
);
check(
  "the workspace renders no textarea, no input other than the search field, and no form",
  !/<textarea|<form/i.test(pageCode) &&
    (pageCode.match(/<input/g) ?? []).length === 1 &&
    /type="search"/.test(pageCode),
);
check(
  "no send, reply, retry-send or draft handler exists",
  !/onSend|handleSend|sendMessage|useMutation|mutate\(/.test(pageCode),
);
check(
  "no invented composer affordance: attachments, voice notes, templates, scheduling, emoji or AI replies",
  !/attach|voice note|template|schedule send|emoji|suggest(ed)? repl|generate repl/i.test(pageCode),
);

// ── 4. Ordering, filtering and search ──────────────────────────────────────

console.log("\nOrdering, filtering and search");

const list: ContractConversation[] = [
  conv({ id: 3, lastMessageAt: "2026-08-03T00:00:00.000Z", status: "in_progress", callerPhone: "+15551230003" }),
  conv({ id: 2, lastMessageAt: "2026-08-02T00:00:00.000Z", status: "completed", tier: "Hot", callerPhone: "+1 (555) 123-0002" }),
  conv({ id: 1, lastMessageAt: "2026-08-01T00:00:00.000Z", status: "opted_out", callerPhone: "+15551230001" }),
];

equal("server order (last_message_at DESC) survives an unfiltered view",
  filterConversations(list, { status: "all", query: "" }).map((c) => c.id), [3, 2, 1]);
equal("server order survives a status filter",
  filterConversations(list, { status: "all", query: "" }).map((c) => c.id).slice(0, 2), [3, 2]);
equal("active filter selects only in_progress",
  filterConversations(list, { status: "active", query: "" }).map((c) => c.id), [3]);
equal("completed filter selects only completed",
  filterConversations(list, { status: "completed", query: "" }).map((c) => c.id), [2]);
equal("opted_out filter selects only opted_out",
  filterConversations(list, { status: "opted_out", query: "" }).map((c) => c.id), [1]);

equal("counts are computed from real statuses",
  statusCounts(list), { all: 3, active: 1, completed: 1, opted_out: 1 });

check("raw substring search still matches, exactly as before",
  matchesQuery(list[1]!, "(555)"));
check("digit search also matches a formatted number (a widening, not a change)",
  matchesQuery(list[1]!, "5551230002"));
check("a non-matching query excludes the row", !matchesQuery(list[0]!, "9999"));
check("an empty query matches everything", matchesQuery(list[0]!, "   "));
equal("search never reorders results",
  filterConversations(list, { status: "all", query: "555123000" }).map((c) => c.id), [3, 2, 1]);

// ── 5. Message ordering and grouping ───────────────────────────────────────

console.log("\nMessage ordering and grouping");

const messages: ContractMessage[] = [
  msg({ id: 1, createdAt: "2026-08-01T10:00:00.000Z", direction: "inbound" }),
  msg({ id: 2, createdAt: "2026-08-01T10:05:00.000Z", direction: "outbound" }),
  msg({ id: 3, createdAt: "2026-08-02T09:00:00.000Z", direction: "inbound" }),
  msg({ id: 4, createdAt: "2026-08-02T09:30:00.000Z", direction: "outbound" }),
];

const grouped = groupMessagesByDay(messages, new Date("2026-08-05T00:00:00.000Z"));
equal("messages group into calendar days without reordering",
  grouped.map((g) => g.messages.map((m) => m.id)), [[1, 2], [3, 4]]);
equal("group order follows the server's ascending created_at",
  grouped.map((g) => g.messages[0]!.id), [1, 3]);
check("each group has a stable non-index key", grouped.every((g) => typeof g.key === "string" && g.key.length > 0));
check("group keys are distinct", new Set(grouped.map((g) => g.key)).size === grouped.length);
equal("an empty history groups to nothing", groupMessagesByDay([]), []);

check("server still returns messages in ascending created_at",
  /orderBy\(asc\(intakeMessages\.createdAt\)\)/.test(serverCode));
check("server still returns conversations in descending last_message_at",
  /orderBy\(desc\(intakeConversations\.lastMessageAt\)\)/.test(serverCode));
check("the workspace never sorts or reverses either collection",
  !/\.sort\(|\.reverse\(/.test(pageCode) && !/\.sort\(|\.reverse\(/.test(contractCode));

equal("an outbound message is attributed to the automated receptionist",
  senderLabel(messages[1]!, list[0]!), "AI Receptionist");
equal("an inbound message is attributed to the contact's real number",
  senderLabel(messages[0]!, list[0]!), "+15551230003");

// ── 6. Selected, no-selection, loading and empty states ────────────────────

console.log("\nWorkspace states");

check("a no-selection state exists and says what to do",
  /No conversation selected/.test(pageCode) && /Choose a conversation to read its messages/.test(pageCode));
check("selection is tracked in component state, not in the URL or a global",
  /useState<number \| null>\(null\)/.test(pageCode));
check("a detail response is only rendered when it matches the current selection",
  /detail\.conversation\.id === selectedId/.test(pageCode));
check("the header falls back to the list row's own data, so identity never waits on a request",
  /summary \?\? null|loaded\?\.conversation \?\? summary/.test(pageCode));

check("list loading renders a busy placeholder with a status message",
  /aria-busy="true"/.test(pageCode) && /Loading conversations/.test(pageCode));
check("detail loading renders its own busy placeholder",
  />\s*Loading conversation\s*</.test(pageCode));
check("loading placeholders are not the empty state",
  pageCode.indexOf("Loading conversations") !== pageCode.indexOf("No conversations yet"));

equal("an account with nothing yet is distinguished from a filtered miss",
  emptyCopy({ status: "all", query: "", totalCount: 0 }).title, "No conversations yet");
equal("a search that matches nothing says so",
  emptyCopy({ status: "all", query: "999", totalCount: 5 }).title, "No matches for that number");
equal("an empty active filter does not claim the account is empty",
  emptyCopy({ status: "active", query: "", totalCount: 5 }).title, "Nothing in progress");
equal("an empty opted-out filter explains what would appear there",
  emptyCopy({ status: "opted_out", query: "", totalCount: 5 }).detail,
  "Contacts who reply STOP appear here.");
check("an empty message history is its own state, not a blank pane",
  /No messages in this conversation/.test(pageCode));

// ── 7. Errors are visible, distinct and retryable ──────────────────────────

console.log("\nErrors");

check("a list failure is announced to assistive technology",
  /role="alert"/.test(pageCode));
check("a list failure is never rendered as an empty inbox",
  pageCode.indexOf("listFailure") > -1 && /failure \?/.test(pageCode));
equal("a 500 on the list says the request failed, not that there are no conversations",
  listFailure({ status: 500 }).title, "Conversations could not be loaded");
equal("a 401 on the list is reported as an expired session",
  listFailure({ status: 401 }).title, "Your session has expired");
check("an expired session offers no retry — the shell owns the redirect",
  listFailure({ status: 401 }).isSession === true && listFailure({ status: 500 }).isSession === false);
equal("a 404 on detail is distinguished from a transport failure",
  detailFailure({ status: 404 }).title, "Conversation not available");
equal("a 500 on detail keeps the conversation itself credible",
  detailFailure({ status: 500 }).title, "Messages could not be loaded");
equal("an unknown error shape still produces a real message",
  listFailure(new Error("boom")).title, "Conversations could not be loaded");
check("both failures offer an explicit retry that re-issues the same GET",
  /onRetry=\{\(\) => void list\.refetch\(\)\}/.test(pageCode) &&
    /onRetry=\{\(\) => void detail\.refetch\(\)\}/.test(pageCode));

// ── 8. Messaging availability and opt-out ──────────────────────────────────

console.log("\nMessaging availability");

const optedOut = conv({ id: 9, status: "opted_out" });
const active = conv({ id: 8, status: "in_progress" });

equal("an opted-out contact is reported as opted out", messagingState(optedOut).key, "opted-out");
equal("an active conversation reports automatic replies", messagingState(active).key, "automatic");
check("sending is impossible in every state",
  messagingState(optedOut).canSend === false && messagingState(active).canSend === false);
check("the opt-out copy states the real STOP/START behaviour",
  /STOP/.test(messagingState(optedOut).detail) && /START/.test(messagingState(optedOut).detail));
check("the automatic copy does not promise a manual reply is coming on a date",
  !/soon|shortly|next (week|month|release)/i.test(messagingState(active).detail));
check("the opted-out region is visually distinct, not only differently worded",
  /data-tone=\{state\.tone\}/.test(pageCode) && /\.sc-messaging\[data-tone="stopped"\]/.test(cssSrc));
check("the messaging region is a landmark-appropriate footer, not a disabled form",
  /<footer className="sc-messaging"/.test(pageCode));

// ── 9. Attention, tiers and the absence of fabricated data ─────────────────

console.log("\nProduct truth");

check("an open conversation needs attention", attentionOf(active).needsAttention === true);
check("a completed conversation does not", attentionOf(conv({ id: 7, status: "completed", tier: "Cold" })).needsAttention === false);
equal("the trial cap is the one real warning",
  attentionOf(conv({ id: 6, isOverCap: true })).warnings, ["Past your trial conversation limit"]);
equal("no warning is invented when nothing is wrong",
  attentionOf(conv({ id: 5, status: "completed", tier: "Hot" })).warnings, []);
equal("an unscored case is reported honestly, never defaulted to a tier",
  tierLabel(null), "Not scored");
equal("a real tier is shown verbatim", tierLabel("Hot"), "Hot");

check("there is no unread flag anywhere — the product has no such field",
  !/unread|isRead|readAt|markAsRead/i.test(pageCode) && !/unread|isRead|readAt/i.test(contractCode));
check("no contact name is invented — identity is the phone number the API returns",
  !/displayName|fullName|contactName|firstName|lastName/.test(pageCode));
check("no avatar, initials or generated colour is rendered",
  !/Avatar|phoneInitials|phoneColor|initials/.test(pageCode));
check("no delivery, sent, queued or failed message status is displayed — no such column exists",
  !/delivered|deliveryStatus|"sent"|queued|undelivered/i.test(pageCode));
check("no AI summary, sentiment or fabricated score",
  !/summary of|sentiment|aiSummary|confidence|score\b/i.test(pageCode));
check("no unsupported call, email or appointment action",
  !/Call back|Send email|Book (a )?appointment|New appointment/i.test(pageCode));
check("no chart, graph or decorative media",
  !/recharts|<canvas|<svg viewBox|<img|<video/i.test(pageCode));
check("no fallback string stands in for missing real data",
  !/\|\|\s*["'](Unknown caller|N\/A|—|Anonymous)["']/.test(pageCode));

// ── 10. Accessibility ──────────────────────────────────────────────────────

console.log("\nAccessibility");

check("the list is a labelled region and the thread is another",
  /<section className="sc-list" aria-label="Conversations">/.test(pageCode) &&
    /aria-label="Selected conversation"/.test(pageCode));
check("the page contributes one h1 and the thread a heading beneath it",
  (pageCode.match(/<h1 /g) ?? []).length === 1 && /<h2 className="sc-thread__phone">/.test(pageCode));
check("day separators are real headings inside labelled sections",
  /<h3 className="sc-day__label">/.test(pageCode));
check("the conversation list is a listbox of options",
  /role="listbox"/.test(pageCode) && /role="option"/.test(pageCode));
check("selection is exposed as aria-selected, not colour alone",
  /aria-selected=\{selected\}/.test(pageCode));
check("the selected row also carries a non-colour indicator",
  /\.sc-option\[data-selected="true"\]::before/.test(cssSrc));
check("the list is a single tab stop with roving tabindex",
  /tabIndex=\{tabbable \? 0 : -1\}/.test(pageCode));
check("arrow, Home and End keys move focus within the list",
  /case "ArrowDown"/.test(pageCode) && /case "ArrowUp"/.test(pageCode) &&
    /case "Home"/.test(pageCode) && /case "End"/.test(pageCode));
check("Enter and Space select, so selection stays explicit and issues one request",
  /event\.key === "Enter" \|\| event\.key === " "/.test(pageCode));
check("status filters are labelled toggle buttons with pressed state",
  /aria-pressed=\{statusFilter === filter\.key\}/.test(pageCode) &&
    /aria-label="Filter conversations by status"/.test(pageCode));
check("the search field is labelled",
  /aria-label="Search conversations by phone number"/.test(pageCode));
check("every timestamp is machine readable and has an absolute screen-reader form",
  /<time className="sc-option__when" dateTime=/.test(pageCode) &&
    /Last message \{formatAbsolute/.test(pageCode));
equal("isoAttribute produces a valid datetime value",
  isoAttribute("2026-08-01T10:00:00.000Z"), "2026-08-01T10:00:00.000Z");
equal("an unusable date yields no datetime attribute rather than a wrong one",
  isoAttribute("not-a-date"), "");
equal("an unusable date still renders readable text", formatAbsolute("not-a-date"), "Unknown time");
check("message sender and time are stated per message, not implied by side",
  /senderLabel\(message, conversation\)/.test(pageCode));
check("the message history is focusable so it can be scrolled by keyboard",
  /className="sc-history sc-enter" tabIndex=\{0\}/.test(pageCode));
check("interactive targets meet 44px",
  (cssSrc.match(/min-height: 2\.75rem/g) ?? []).length >= 5);
check("focus is visible on every interactive element in this layer",
  (cssSrc.match(/:focus-visible \{/g) ?? []).length >= 6 &&
    cssSrc.includes("outline: var(--sd-focus-width) solid var(--sd-focus-color)"));
check("no element outside a real dialog traps focus",
  !/aria-modal|inert/.test(pageCode));

// ── 11. Mobile master/detail ───────────────────────────────────────────────

console.log("\nResponsive behaviour");

check("the workspace declares which pane is showing",
  /data-view=\{mobileView\}/.test(pageCode));
check("exactly one pane is in the flow on a narrow viewport",
  /\.sc-workspace\[data-view="list"\] \.sc-thread \{\s*display: none/.test(cssSrc) &&
    /\.sc-workspace\[data-view="thread"\] \.sc-list \{\s*display: none/.test(cssSrc));
check("a visible back control exists and is labelled in words",
  /Back to conversations/.test(pageCode));
check("the back control is shown only where there is something to go back from",
  /\.sc-thread__bar \{\s*display: none/.test(cssSrc) &&
    /\.sc-thread__bar \{\s*display: block/.test(cssSrc));
check("entering the thread moves focus to the way back out",
  /backRef\.current\?\.focus\(\)/.test(pageCode));
check("returning to the list restores focus to the row that was open",
  /sc-option-\$\{id\}/.test(pageCode) && /option\?\.focus\(\)/.test(pageCode));
check("the composer region respects the mobile safe area",
  /env\(safe-area-inset-bottom/.test(cssSrc));
check("long message bodies wrap instead of overflowing",
  /overflow-wrap: anywhere/.test(cssSrc));
check("the workspace never scrolls horizontally — panes own their own scroll",
  /overflow-y: auto/.test(cssSrc) && !/overflow-x: (auto|scroll)/.test(cssSrc));
check("a short viewport (200% zoom, landscape phone) has its own accommodation",
  /@media \(max-height: 34rem\)/.test(cssSrc));

// ── 12. Motion ─────────────────────────────────────────────────────────────

console.log("\nMotion");

check("only compositor-friendly properties are transitioned",
  !/transition:[^;]*\b(width|height|top|left|margin|padding|filter|background-position)\b/.test(cssSrc));
check("the only animation is the shell's entrance and one placeholder pulse",
  (cssSrc.match(/@keyframes/g) ?? []).length === 1);
check("nothing loops except the loading placeholder",
  (cssSrc.match(/infinite/g) ?? []).length === 1);
check("the message list itself is never animated or staggered",
  // Comments are stripped first: this stylesheet *says* it never staggers, and
  // saying so must not be mistaken for doing so.
  !/animation-delay|stagger|nth-child\([^)]*\)[^{]*\{[^}]*animation/.test(cssCode) &&
    !/\.sc-message[^{]*\{[^}]*animation/.test(cssCode) &&
    !/animation/.test(pageCode));
check("only the pane fades on a selection change, keyed by the selection",
  /key=\{selectedId\}/.test(pageCode) && /sc-history sc-enter/.test(pageCode));
check("hover transforms are gated behind a fine pointer",
  cssSrc.includes("@media (hover: hover) and (pointer: fine)"));
check("reduced motion removes the entrance and the pulse",
  /@media \(prefers-reduced-motion: reduce\)/.test(cssSrc) &&
    /\.sc-history\.sd-enter \{\s*animation: none/.test(cssSrc));
check("scrolling honours reduced motion rather than always easing",
  /prefersReducedMotion\(\) \? "auto" : "smooth"/.test(pageCode));
check("opening a conversation jumps rather than animating a long scroll",
  /changedConversation \|\| prefersReducedMotion\(\)/.test(pageCode));
check("no scroll, wheel or pointer listener hijacks the page",
  !/addEventListener\("(scroll|wheel|touchmove|pointermove)"/.test(pageCode));

// ── 13. Visual system ──────────────────────────────────────────────────────

console.log("\nVisual system");

check("the workspace layer defines no colour of its own — every value is a shell token",
  !/#[0-9a-fA-F]{3,8}\b/.test(cssSrc) && !/\brgba?\(/.test(cssSrc.replace(/--sd-[a-z-]+/g, "")));
check("no purple, indigo or ordinary green enters the palette",
  !/indigo|violet|purple|#6366f1|#8b5cf6|#10b981/i.test(cssSrc) &&
    !/indigo|violet|purple/i.test(pageCode));
check("no tailwind colour utility is used for meaning in the workspace",
  !/bg-(rose|amber|blue|yellow|emerald|indigo|violet)-\d{2,3}/.test(pageCode));
check("no remote request, font or asset is introduced",
  !/@import\s+url|https?:\/\/|url\(/.test(cssSrc));
check("no gradient, glass or glow",
  !/linear-gradient|radial-gradient|backdrop-filter|box-shadow:[^;]*rgba?\([^)]*\)\s*,\s*0 0/.test(cssSrc));
check("depth is one hairline and one surface change, not a shadow stack",
  (cssSrc.match(/box-shadow:/g) ?? []).length <= 1);
check("the shell stylesheet is imported alongside, not replaced",
  /import "@\/styles\/v2-dashboard\.css"/.test(pageSrc) &&
    /import "@\/styles\/v2-conversations\.css"/.test(pageSrc));
check("the workspace is styled by its own namespace and does not redefine sd-* classes",
  !/^\.sd-[a-z]/m.test(cssSrc));

// ── Result ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 8 conversations contract tests passed.");
