/**
 * Frontend V2 Phase 14 — committed contract tests for the Call Logs workspace.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/call-logs/callLogsContract.test.ts
 *
 * Same arrangement as Phases 5–13: the file lives beside the module it tests,
 * `tsx` is the runner, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob
 * so nothing here is type-built into the app or bundled by Vite.
 *
 * Most of this file asserts absence, for two reasons.
 *
 * First, the route this replaces *shipped fabricated data*: four invented
 * calls with invented names, phone numbers, transcripts and outcomes, rendered
 * beside real records under a "Demo Mode" heading. That is the failure mode
 * worth spending a test file on, so the fixture module is required to be gone,
 * its exports are required to be unreachable, and no name, number, transcript
 * or outcome may be reconstructed anywhere in source or in the bundle.
 *
 * Second, Call Logs is one sentence away from claiming a working phone line.
 * "Your assistant answered 4 calls", "connected", "live", a Play button, a
 * Retry-the-call button, a "booked" badge — every one of them is plausible and
 * every one is backed by no endpoint at all. So the wording the route can
 * produce is enumerated exhaustively (`everyRenderableString()`) and the
 * prohibited claims are required to be absent from that surface, from each
 * page, from the stylesheet and from the built output.
 *
 * It never performs a network request, never signs in, never creates a
 * session, never contacts Vapi or any provider, and never touches a database.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANALYSIS_UNAVAILABLE,
  DETAIL,
  GIVEN,
  LIST,
  LIST_PATH,
  NOT_AVAILABLE,
  NOT_GIVEN,
  NOT_PROVIDED,
  PAGE,
  analysisIsAvailable,
  callHref,
  consent,
  dispositionLabel,
  everyRenderableString,
  formatDuration,
  formatFullTime,
  formatListTime,
  isRecordMissing,
  listOrMissing,
  machineTime,
  recordCount,
  requestStatusLabel,
  stateAccessibleName,
  stateLabel,
  stateLabelMap,
  stateTone,
  textOrMissing,
  urgencyLabel,
  yesNo,
} from "./callLogsContract.js";

import {
  visibleNavDestinations,
  visibleNavGroups,
} from "../../components/layout/dashboardNav.js";

import { NAV_GROUPS } from "../../lib/nav.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/call-logs → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel: string) => existsSync(path.join(repoRoot, rel));

const listSrc = read("artifacts/helpdesk/src/pages/CallLogs.tsx");
const detailSrc = read("artifacts/helpdesk/src/pages/CallLogDetail.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/call-logs/callLogsContract.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-call-logs.css");

const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const dashboardNavSrc = read("artifacts/helpdesk/src/components/layout/dashboardNav.ts");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const hooksSrc = read("artifacts/helpdesk/src/hooks/useVoiceCalls.ts");
const apiSrc = read("artifacts/helpdesk/src/lib/voiceCallsApi.ts");
const routeSrc = read("artifacts/api-server/src/routes/receptionistVoiceCalls.ts");
const stateModelSrc = read("artifacts/api-server/src/lib/voice/webhooks/callStateModel.ts");
const scriptsPkgSrc = read("scripts/package.json");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why — including quoting the removed phrases and naming the
 * deleted fixture — so a prose mention of a deleted claim must never be
 * mistaken for the claim still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const listCode = stripComments(listSrc);
const detailCode = stripComments(detailSrc);
const contractCode = stripComments(contractSrc);
const cssCode = stripComments(cssSrc);
const routeCode = [listCode, detailCode, contractCode].join("\n");

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

// ═══════════════════════════════════════════════════════════════════════════
section("Premise — what the voice-calls API actually offers");
// ═══════════════════════════════════════════════════════════════════════════

const ROUTER_CALLS = routeSrc.match(/router\.(get|post|put|patch|delete)\("([^"]+)"/g) ?? [];

eq("the voice-calls router exposes exactly three endpoints", ROUTER_CALLS.length, 3);

check(
  "every voice-calls endpoint is a GET — the API this route reads has no writer",
  ROUTER_CALLS.every((c) => c.startsWith("router.get(")),
);

eq(
  "the router's three paths are the two call reads plus provider-status",
  ROUTER_CALLS.map((c) => /"([^"]+)"/.exec(c)![1]).sort(),
  [
    "/receptionist/voice/calls",
    "/receptionist/voice/calls/:callId",
    "/receptionist/voice/provider-status",
  ],
);

check(
  "every voice-calls endpoint requires a receptionist session",
  (routeSrc.match(/router\.get\(/g) ?? []).length ===
    (routeSrc.match(/requireReceptionistAuth/g) ?? []).length - 1,
);

check(
  "the server derives the firm from the session, never from the request",
  /req\.firmId!/.test(routeSrc) && !/req\.(query|body|params)\.\w*[fF]irm/.test(routeSrc),
);

check(
  "a call the firm does not own is a 404, not a redacted record",
  /if \(!call\) \{\s*res\.status\(404\)/.test(routeSrc.replace(/\n\s*/g, "\n    ").replace(/\s+/g, " ")) ||
    /res\.status\(404\)\.json\(\{ error: "Call not found" \}\)/.test(routeSrc),
);

check(
  'the server collapses its internal "invalid" analysis state into "unavailable" before sending',
  /analysisAvailability === "invalid" \? "unavailable"/.test(routeSrc),
);

check(
  "the server withholds the structured outcome unless the analysis is available",
  /analysisAvailability === "available" \? call\.structuredOutcome \?\? null : null/.test(routeSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("The fabricated demo calls are gone");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "lib/demoCallLog.ts no longer exists",
  !exists("artifacts/helpdesk/src/lib/demoCallLog.ts"),
);

for (const [name, code] of [["the list", listCode], ["the detail", detailCode], ["the contract", contractCode]] as const) {
  check(
    `${name} imports nothing from a demo fixture`,
    !/from\s+["'][^"']*demoCallLog["']/.test(code),
  );
  check(
    `${name} references no demo fixture export`,
    !/\bDEMO_CALLS\b|\bfindDemoCall\b|\bformatDemoOutcome\b|\bdemoOutcomeTone\b|\bformatDemoDuration\b|\bDemoCall\b/.test(code),
  );
  check(
    `${name} renders no Demo Mode banner`,
    !/DemoModeBanner|Demo Mode|Sample data|sample record/i.test(code),
  );
}

/** Every fabricated value the deleted fixture carried, by name. */
const FABRICATED = [
  "Jordan Reyes", "Priya Nair", "Riverside Dental", "Blocked spam caller",
  "555) 010-2231", "555) 018-7745", "555) 099-0012", "555) 077-4400",
  "chipped a tooth", "Emergency exam", "this is Ava",
  "demo-1", "demo-2", "demo-3", "demo-4",
];
for (const phrase of FABRICATED) {
  check(
    `no source reconstructs the fabricated value ${JSON.stringify(phrase)}`,
    !routeCode.includes(phrase) && !cssCode.includes(phrase),
  );
}

check(
  "no reachable string is a phone number",
  everyRenderableString().every((s) => !/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)),
);

check(
  "neither page contains a hard-coded caller identity, transcript or outcome array",
  !/const\s+\w*(CALLS|TRANSCRIPT|RECORDS|SAMPLES)\w*\s*(:|=)\s*\[/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Feature gating is untouched");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the voice flag still defaults false and is still parsed from VITE_VOICE_PLATFORM_ENABLED",
  /voicePlatformEnabled: boolean = parseBooleanFlag\(\s*import\.meta\.env\.VITE_VOICE_PLATFORM_ENABLED,?\s*\)/
    .test(flagsSrc) && /if \(typeof value !== "string"\) return false;/.test(flagsSrc),
);

check(
  "the Call Logs nav entry is still live and still voiceGated",
  /key: "logs", label: "Call Logs", href: "\/logs", icon: ScrollText,\s*\n\s*state: "live", voiceGated: true,/
    .test(navSrc),
);

check(
  "a default build hides Call Logs from navigation",
  !visibleNavDestinations(false).includes("/logs"),
);

check(
  "a voice-enabled build shows Call Logs in navigation",
  visibleNavDestinations(true).includes("/logs"),
);

check(
  "Call Logs still belongs to the Observe group",
  visibleNavGroups(true).some((g) => g.key === "observe" && g.items.some((i) => i.href === "/logs")),
);

eq(
  "the default navigation contract is unchanged by this phase",
  visibleNavDestinations(false),
  ["/", "/conversations", "/receptionist", "/contacts", "/billing", "/settings"],
);

check(
  "both Call Logs routes are declared base-relative in the route table",
  /logs: "\/logs",/.test(routesSrc) && /logDetail: "\/logs\/:id",/.test(routesSrc),
);

check(
  "both Call Logs routes are registered only inside the voicePlatformEnabled branch",
  (() => {
    const gate = /\{voicePlatformEnabled && \(\s*<>([\s\S]*?)<\/>\s*\)\}/.exec(appSrc);
    if (gate === null) return false;
    const inside = gate[1]!;
    const outside = appSrc.replace(inside, "");
    return (
      inside.includes("ROUTES.logs") &&
      inside.includes("ROUTES.logDetail") &&
      !/path=\{ROUTES\.(logs|logDetail)\}/.test(outside)
    );
  })(),
);

check(
  "an unregistered route still falls through to the established not-found behaviour",
  /<Route component=\{NotFound\} \/>/.test(appSrc),
);

check(
  "the router is still mounted on the build's own base",
  /<WouterRouter base=\{ROUTER_BASE\}>/.test(appSrc) &&
    /ROUTER_BASE = RAW_BASE\.replace\(\/\\\/\+\$\/, ""\)/.test(routesSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Routing — base-aware, and only to a genuine record");
// ═══════════════════════════════════════════════════════════════════════════

eq("the list path is base-relative", LIST_PATH, "/logs");
eq("a record links to its own detail route", callHref("abc123"), "/logs/abc123");
eq("a record id is encoded, never interpolated raw", callHref("a/b?c=d"), "/logs/a%2Fb%3Fc%3Dd");
check("no href is absolute", !/^https?:|^\/\//.test(callHref("x")));

check(
  "both pages navigate through wouter's Link, so every href gets the build's base",
  /from "wouter"/.test(listCode) && /<Link href=/.test(listCode) &&
    /from "wouter"/.test(detailCode) && /<Link href=/.test(detailCode),
);

check(
  "neither page hard-codes the configured prefix",
  !/ai-receptionist\/dashboard/.test(routeCode),
);

check(
  "neither page performs a document navigation or a window.location write",
  !/window\.location|document\.location|href=\{`http/.test(routeCode),
);

check(
  "the detail page's back link targets the list route",
  detailCode.includes("<Link href={LIST_PATH}"),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Requests — two GETs, nothing else, ever");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "the API client declares exactly the two call paths plus provider-status",
  (apiSrc.match(/"\/receptionist\/voice\/[^"`]*"|`\/receptionist\/voice\/[^`]*`/g) ?? []).sort(),
  [
    "\"/receptionist/voice/calls\"",
    "\"/receptionist/voice/provider-status\"",
    "`/receptionist/voice/calls/${encodeURIComponent(callId)}`",
  ].sort(),
);

check(
  "the API client issues no method other than the default GET",
  !/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(apiSrc),
);

check(
  "neither page calls fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon directly",
  !/\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon/.test(routeCode),
);

check(
  "neither page names a mutating HTTP method",
  !/["'](POST|PUT|PATCH|DELETE)["']/i.test(routeCode),
);

check(
  "neither page uses a mutation hook",
  !/useMutation|mutateAsync|\bmutate\(/.test(routeCode),
);

check(
  "the list page reads only the calls list, through its hook",
  /useRealCallsList\(\)/.test(listCode) && !/useRealCallDetail|useVoiceProviderStatus/.test(listCode),
);

check(
  "the detail page reads only one call, through its hook",
  /useRealCallDetail\(params\.id\)/.test(detailCode) && !/useRealCallsList|useVoiceProviderStatus/.test(detailCode),
);

check(
  "neither page requests provider-status",
  !/provider-status|useVoiceProviderStatus|fetchVoiceProviderStatus|VoiceProviderStatusCard/.test(routeCode),
);

check(
  "neither page reaches a provider, an SDK or an external host",
  !/vapi|twilio|googleapis|\.com\/|https?:\/\//i.test(routeCode.replace(/@\/[\w/-]+/g, "")),
);

check(
  "neither page asks for a microphone, a media device or audio playback",
  !/getUserMedia|mediaDevices|new Audio|<audio|AudioContext|MediaRecorder/.test(routeCode),
);

check(
  "neither page polls, schedules or loops a read",
  !/refetchInterval|refetchOnWindowFocus|setInterval|setTimeout|requestAnimationFrame/.test(routeCode),
);

check(
  "neither page has an effect, so no request can be caused by mount, render or a route change",
  !/useEffect|useLayoutEffect/.test(routeCode),
);

check(
  "the only repeat read on each page is refetch, and it is bound to a click",
  (() => {
    const listOk = /onClick=\{retry\}/.test(listCode) && (listCode.match(/\.refetch\(\)/g) ?? []).length === 1;
    const detailOk = /onClick=\{retry\}/.test(detailCode) && (detailCode.match(/\.refetch\(\)/g) ?? []).length === 1;
    return listOk && detailOk;
  })(),
);

check(
  "retry is disabled while it is in flight, so it cannot be queued up",
  /disabled=\{calls\.isRefetching\}/.test(listCode) && /disabled=\{detail\.isRefetching\}/.test(detailCode),
);

check(
  "neither page sends a firm, tenant, account or organisation identifier",
  !/firmId|tenant|accountId|organisation|organizationId|orgId/i.test(routeCode),
);

check(
  "the firm id is only ever the resolved session's, and only as a cache key",
  /const firmId = useAuthenticatedFirmId\(\);/.test(hooksSrc) &&
    /queryKey: firmId !== undefined \?/.test(hooksSrc) &&
    !/firmId=|firmId:\s*firmId,?\s*\}\)/.test(hooksSrc.replace(/queryKey[\s\S]*?\],/g, "")),
);

check(
  "a read is enabled only once a firm id has resolved",
  /enabled: firmId !== undefined/.test(hooksSrc) && /enabled: resolved/.test(hooksSrc),
);

check(
  "an unresolved session cannot collide with a real firm's cache entry",
  /UNRESOLVED_SESSION_KEY/.test(hooksSrc) && /useAuthenticatedFirmId\(\): number \| undefined/.test(sessionSrc),
);

check(
  "both pages read the session the shell already fetched, so neither issues a second /auth/me",
  /useSession\(\)/.test(listCode) && /useSession\(\)/.test(detailCode) &&
    !/auth\/me/.test(routeCode) &&
    /queryKey: SESSION_KEY/.test(sessionSrc),
);

check(
  "no authenticated shape renders before the session resolves",
  /if \(sessionLoading\) \{/.test(listCode) && /if \(!me\) return null;/.test(listCode) &&
    /if \(sessionLoading\) \{/.test(detailCode) && /if \(!me\) return null;/.test(detailCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Internal call states — the server is the only authority");
// ═══════════════════════════════════════════════════════════════════════════

const SERVER_STATES = [...stateModelSrc.matchAll(/case "(\w+)": return "([^"]+)";/g)]
  .reduce<Record<string, string>>((acc, m) => ({ ...acc, [m[1]!]: m[2]! }), {});

const CLIENT_STATES = [...apiSrc.matchAll(/^\s{2}"(\w+)",$/gm)].map((m) => m[1]!);

eq(
  "the client's state list matches the server's label map, state for state",
  Object.keys(SERVER_STATES).sort(),
  CLIENT_STATES.filter((s) => s in SERVER_STATES).sort(),
);

eq(
  "the contract's fallback labels are byte-identical to the server's",
  stateLabelMap(),
  SERVER_STATES,
);

check(
  "every state maps to exactly one tone",
  Object.keys(SERVER_STATES).every((s) => ["settled", "open", "attention", "failed"].includes(stateTone(s))),
);

check(
  "no state is given a celebratory tone",
  !/tone === "success"|"success"|"positive"|"good"/.test(contractCode),
);

eq("a completed call is settled, not a success", stateTone("completed"), "settled");
eq("a call that never connected asks for attention", stateTone("no_answer"), "attention");
eq("a busy line asks for attention", stateTone("busy"), "attention");
eq("a cancelled call asks for attention", stateTone("canceled"), "attention");
eq("a failed call is an error", stateTone("failed"), "failed");
eq("a provider error is an error", stateTone("provider_error"), "failed");
eq("an in-progress call is open, not live", stateTone("in_progress"), "open");
eq("an unknown state falls back to settled, never to an error", stateTone("nonsense"), "settled");

check(
  "the server's label wins over the local copy",
  stateLabel({ state: "completed", stateLabel: "Server said this" }) === "Server said this",
);
eq(
  "a blank server label falls back to the local copy",
  stateLabel({ state: "no_answer", stateLabel: "   " }),
  "No answer",
);
eq(
  "an unknown state is humanised, never invented",
  stateLabel({ state: "some_new_state" as never, stateLabel: "" }),
  "Some new state",
);
eq(
  "an empty state is Unknown, not blank",
  stateLabel({ state: "" as never, stateLabel: "" }),
  "Unknown",
);

eq(
  "the state's accessible name names the state and nothing more",
  stateAccessibleName("No answer"),
  "Call state: No answer",
);

check(
  "the state is always spelled out beside its tone, so no meaning is colour-only",
  /sc-state__text/.test(listCode) && /sc-state__text/.test(detailCode) &&
    /data-tone=\{stateTone\(call\.state\)\}/.test(listCode),
);

check(
  "no page suggests the frontend can change a call's state",
  !/setState\(|updateState|changeState|transition\(|advance\(/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Missing and partial values are stated, never inferred");
// ═══════════════════════════════════════════════════════════════════════════

eq("an unmeasured duration is Not available", formatDuration(null), NOT_AVAILABLE);
eq("an undefined duration is Not available", formatDuration(undefined), NOT_AVAILABLE);
eq("a negative duration is Not available, not a negative clock", formatDuration(-5), NOT_AVAILABLE);
eq("a NaN duration is Not available", formatDuration(Number.NaN), NOT_AVAILABLE);
eq("a genuinely zero duration is 0:00, because zero was measured", formatDuration(0), "0:00");
eq("a sub-minute duration keeps two second digits", formatDuration(9), "0:09");
eq("a multi-minute duration is m:ss", formatDuration(171), "2:51");
eq("a fractional duration truncates rather than rounding up", formatDuration(59.9), "0:59");

check(
  "an absent duration is never rendered as zero",
  formatDuration(null) !== "0:00" && formatDuration(undefined) !== "0:00",
);

eq("an absent timestamp is Not available", formatListTime(null), NOT_AVAILABLE);
eq("an empty timestamp is Not available", formatFullTime(""), NOT_AVAILABLE);
eq("an unparseable timestamp is Not available", formatFullTime("not a date"), NOT_AVAILABLE);
eq("an absent timestamp has no machine-readable form", machineTime(null), undefined);
eq(
  "a real timestamp keeps its instant exactly",
  machineTime("2026-08-19T16:42:11.000Z"),
  "2026-08-19T16:42:11.000Z",
);
check(
  "a real timestamp renders something other than the absent wording",
  formatFullTime("2026-08-19T16:42:11.000Z") !== NOT_AVAILABLE,
);

eq("an absent string is Not provided", textOrMissing(null), NOT_PROVIDED);
eq("a whitespace-only string is Not provided", textOrMissing("   "), NOT_PROVIDED);
eq("a present string is trimmed and kept", textOrMissing("  hello  "), "hello");
eq("an empty list is Not provided", listOrMissing([]), NOT_PROVIDED);
eq("a list of blanks is Not provided", listOrMissing(["", "  "]), NOT_PROVIDED);
eq("a real list is joined", listOrMissing([" a ", "b"]), "a, b");
eq("a missing list is Not provided", listOrMissing(null), NOT_PROVIDED);

eq("an unknown urgency is Not provided, never Normal", urgencyLabel("nonsense"), NOT_PROVIDED);
eq("an absent urgency is Not provided, never Normal", urgencyLabel(null), NOT_PROVIDED);
eq("a real urgency is labelled", urgencyLabel("high"), "High");

eq("an unknown disposition is Not provided", dispositionLabel("nonsense"), NOT_PROVIDED);
eq("spam is named plainly", dispositionLabel("spam"), "Spam");
eq("an unresolved call is named plainly", dispositionLabel("unresolved"), "Unresolved");
eq(
  "a requested appointment is only ever described as requested",
  dispositionLabel("appointment_requested"),
  "Appointment requested",
);

eq("a not-requested status says so", requestStatusLabel("not_requested"), "Not requested");
eq("a pending status says pending review", requestStatusLabel("pending_review"), "Pending review");
eq("an unknown status is Not provided", requestStatusLabel("booked"), NOT_PROVIDED);

eq("consent given is Given", consent(true), GIVEN);
eq("consent not given is Not given, never No", consent(false), NOT_GIVEN);
eq("a boolean fact is Yes or No", [yesNo(true), yesNo(false)], ["Yes", "No"]);

check("analysis is available only when the API says so", analysisIsAvailable("available"));
check('"unavailable" is not available', !analysisIsAvailable("unavailable"));
check("an unknown availability is not upgraded into a result", !analysisIsAvailable("invalid"));
check("an absent availability is not a result", !analysisIsAvailable(null) && !analysisIsAvailable(undefined));

check(
  "the detail page shows the structured outcome only when the analysis is available",
  /analysisIsAvailable\(call\.analysisAvailability\) \? call\.structuredOutcome : null/.test(detailCode),
);

eq("one record reads as one record", recordCount(1), "1 record");
eq("no records reads as zero records", recordCount(0), "0 records");
eq("many records read as a plain count", recordCount(4), "4 records");

// ═══════════════════════════════════════════════════════════════════════════
section("Not found is separated from a read failure");
// ═══════════════════════════════════════════════════════════════════════════

const undefinedDataError = new Error(
  'Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ["real-voice-calls","detail",7,"x"]',
);
const httpError = Object.assign(new Error("API 500"), { status: 500 });
const http404 = Object.assign(new Error("API 404"), { status: 404 });
const networkError = new TypeError("Failed to fetch");

check("a resolved-undefined read is a missing record", isRecordMissing(undefinedDataError));
check("a 500 is a read failure, not a missing record", !isRecordMissing(httpError));
check("a surfaced 404 status is a read failure path, not silently missing", !isRecordMissing(http404));
check("a dropped connection is a read failure, not a missing record", !isRecordMissing(networkError));
check("a non-error is never a missing record", !isRecordMissing(null) && !isRecordMissing("nope"));

check(
  "the detail page routes a missing record away from the failure branch",
  /const missing = detail\.isError && isRecordMissing\(detail\.error\);/.test(detailCode) &&
    /if \(detail\.isError && !missing\) \{/.test(detailCode),
);

check(
  "the not-found state offers no Try again, because retrying cannot help",
  (() => {
    const notFound = /notFoundTitle[\s\S]{0,400}?notFoundDetail[\s\S]{0,200}?<\/div>/.exec(detailCode);
    return notFound !== null && !/sc-retry|retryLabel/.test(notFound[0]);
  })(),
);

check(
  "the not-found state still offers a way back",
  /notFoundTitle/.test(detailCode) &&
    /<div className="sc-nav">\s*<BackLink \/>\s*<\/div>\s*<div className="sc-empty sc-empty--notfound">/
      .test(detailCode.replace(/\n\s*/g, "\n        ").replace(/\s+/g, " ").replace(/> </g, ">\n<")) ||
    (detailCode.match(/<BackLink \/>/g) ?? []).length >= 4,
);

// ═══════════════════════════════════════════════════════════════════════════
section("List states — loading, empty, populated, partial, failure, retry");
// ═══════════════════════════════════════════════════════════════════════════

check("a loading list announces itself", /\{LIST\.loading\}/.test(listCode) && /role="status" aria-live="polite"/.test(listCode));
check("an empty list uses the empty block", /\{LIST\.emptyTitle\}/.test(listCode) && /sc-empty/.test(listCode));
check("a failed list uses the error block", /\{LIST\.errorTitle\}/.test(listCode) && /sc-error/.test(listCode) && /role="alert"/.test(listCode));

check(
  "empty and failure are mutually exclusive branches, so a failure can never render as empty",
  /\{!calls\.isLoading && !calls\.isError && items\.length === 0 &&/.test(listCode) &&
    /\{calls\.isError &&/.test(listCode),
);

check(
  "the table renders only on a successful, non-empty read",
  /const showTable = !calls\.isLoading && !calls\.isError && items\.length > 0;/.test(listCode),
);

check(
  "a missing items array is an empty list, not a crash",
  /const items = calls\.data\?\.items \?\? \[\];/.test(listCode),
);

check(
  "the count describes what is on screen, and only when there is something to count",
  /\{showTable && <p className="sc-count">\{recordCount\(items\.length\)\}<\/p>\}/.test(listCode),
);

eq(
  "the empty state promises nothing about calling, a number, an assistant or a delay",
  [LIST.emptyTitle, LIST.emptyDetail],
  ["No call records yet", "Call records will appear here after SiteMint receives them."],
);

check(
  "the empty state and the error state share no wording",
  LIST.emptyTitle !== LIST.errorTitle && LIST.emptyDetail !== LIST.errorDetail,
);

check(
  "the error names the failure and the recovery in the interface's own voice",
  /couldn't be loaded/.test(LIST.errorTitle) && /Try again/.test(LIST.errorDetail) &&
    !/sorry|apolog|oops|whoops/i.test(LIST.errorTitle + LIST.errorDetail),
);

eq("the retry control is named for what it does", LIST.retryLabel, "Try again");
check(
  "the retry announces its progress and its result",
  [LIST.announceRetrying, LIST.announceLoaded, LIST.announceFailed].every((s) => s.length > 0) &&
    LIST.announceLoaded !== LIST.announceFailed,
);

check(
  "the retry announcement lives in a targeted region, never a whole-page live region",
  (() => {
    // Three: the session gate, the retry announcement, and the list loading
    // line. Each wraps only its own sentence — none wraps the page.
    const live = listCode.match(/aria-live="polite"/g) ?? [];
    return live.length === 3 && !/aria-live="polite"[^>]*>\s*\{children\}/.test(listCode) &&
      /<p className="sd-sr" role="status" aria-live="polite">\s*\{announcement\}/.test(listCode);
  })(),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Detail states");
// ═══════════════════════════════════════════════════════════════════════════

check("a loading record announces itself", /\{DETAIL\.loading\}/.test(detailCode));
check("a missing transcript says Not provided", /\{NOT_PROVIDED\}/.test(detailCode));
check(
  "a missing transcript makes no promise that one will arrive",
  !/will appear|once it ends|still in progress|processing|shortly|soon/i.test(detailCode + JSON.stringify(DETAIL)),
);
check(
  "an unavailable analysis says exactly that",
  detailCode.includes("{ANALYSIS_UNAVAILABLE}") && ANALYSIS_UNAVAILABLE === "Analysis unavailable",
);
check(
  "a whitespace-only transcript is treated as absent, not rendered blank",
  /call\.transcript && call\.transcript\.trim\(\) !== ""/.test(detailCode) &&
    /call\.summary && call\.summary\.trim\(\) !== ""/.test(detailCode),
);
check(
  "the transcript is rendered as text, never as markup",
  !/dangerouslySetInnerHTML|innerHTML/.test(routeCode),
);
check(
  "long content wraps rather than overflowing",
  /overflow-wrap: anywhere/.test(cssCode) && /white-space: pre-wrap/.test(cssCode),
);
check(
  "the transcript keeps a reading measure",
  /\.sc-prose \{[^}]*max-width: 62ch/.test(cssCode.replace(/\n\s*/g, "\n  ").replace(/\s+/g, " ").replace(/\.sc-prose \{ /g, ".sc-prose {")) ||
    /max-width: 62ch/.test(cssCode),
);

check(
  "the detail exposes no internal or provider identifier",
  !/call\.callId\}|\{call\.assistantId|\{call\.source|\{call\.endedReason|assistantId\}/.test(detailCode),
);

check(
  "the detail exposes no raw provider event key",
  !/endedReason|customer-ended-call|assistant-ended-call|pipeline-error|silence-timed-out/.test(detailCode.replace(/\{DETAIL\./g, "{")),
);

check(
  "a call id only ever reaches the URL, never the page's copy",
  (listCode.match(/call\.callId/g) ?? []).every((_, i) =>
    ["callHref(call.callId)", "key={call.callId}"].some((form) =>
      listCode.includes(form)) && i >= 0),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Prohibited claims — nowhere in the reachable surface");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Each entry is a claim this route has no endpoint for. They are matched
 * against the enumerated string surface, both page sources, the contract, the
 * stylesheet and the built route code.
 *
 * Every pattern is anchored on rendered wording rather than on a bare word, so
 * that a legitimate identifier can never trip one: `export function`,
 * `items.filter(...)`, `Array.prototype.sort`, a `transfer-encoding` header in
 * a bundled library and the `source: "vapi_twilio"` discriminator are all
 * internal names, and none of them is a claim to anyone reading the screen.
 */
const BANNED: [string, RegExp][] = [
  ["calling is live", /\blive (calling|call|line|number|phone)\b|\bcalling is live\b|\bgoing live\b/i],
  ["calling is connected", /\b(calls?|calling|phone|number|line|assistant) (is|are|now)? ?connected\b|\bconnected to (a )?(live|real) /i],
  ["a phone number is configured", /\bnumber is (connected|configured|active|verified|live)\b|\byour (phone )?number\b/i],
  ["the assistant answers calls", /assistant (answers|is answering|answered|will answer|picks up)/i],
  ["the assistant is ready", /\bready to (take|answer|receive) calls\b|\bassistant is (ready|active|running|online)\b/i],
  ["a call was placed from here", /\b(place|start|make|dial|initiate) (a |this |the )?call\b/i],
  ["a call can be answered from here", /\banswer (this |the )?call\b/i],
  ["a call can be transferred", /\btransfer (the |this )?call\b|\bcall transfer\b|\btransferred to\b|\bwarm transfer\b/i],
  ["a call can be retried", /\bretry (the |this )?call\b|\bcall (them |him |her )?again\b|\bredial\b/i],
  ["a call was recorded", /\bcall recording\b|\brecorded call\b|\bplayback\b|\bplay (the |this )?(call|recording|audio)\b|\bwaveform\b|\blisten to (the |this )?call\b/i],
  ["a booking was confirmed", /\bbooked\b|\bappointment (is|was) (set|made|created|confirmed|booked)\b|\bconfirmed (appointment|booking|for)\b|\badded to (the |your )?calendar\b/i],
  ["a customer was contacted", /\b(we|SiteMint|the assistant) (sent|texted|emailed|notified|contacted)\b|\bmessage sent\b|\bsms sent\b|\bemail sent\b|\bcallback sent\b/i],
  ["Vapi is named to the reader", /\bvapi\b/i],
  ["Twilio is named to the reader", /\btwilio\b/i],
  ["provider status is known", /provider (status|readiness|is (connected|configured|ready))|\bwebhook secret\b|api key (is )?configured/i],
  ["availability is guaranteed", /\bguarantee|\bevery call will\b|\balways (includes|has|provides)\b|\bwill be available\b|\bwill appear once\b/i],
  ["the data is a demo", /\bdemo mode\b|\bdemo (call|record|data)\b|\bsample (data|record|call|transcript)\b|\bmock(ed)? (data|call|record)\b|\bfake\b|\bplaceholder\b|\bfor illustration\b|\bexample data\b/i],
  ["a fabricated statistic", /\b(hours saved|calls answered|conversion rate|revenue|success rate|answer rate)\b/i],
  ["a filter, search, sort or export that does not exist", /\bfilter by\b|\bsearch (calls?|records?|transcripts?)\b|\bsort by\b|\bexport (to|as|csv|records?|calls?)\b|\bdownload (the |this )?(record|call|transcript|csv)\b/i],
  ["promotional urgency", /\bupgrade now\b|\bget started today\b|\bdon't miss\b|\bunlock\b/i],
];

const bannedHits = (src: string) => BANNED.filter(([, re]) => re.test(src)).map(([name]) => name);

const renderable = everyRenderableString();

check(
  "the enumerated string surface is non-trivial",
  renderable.length > 60 && renderable.every((s) => typeof s === "string"),
);

eq(
  "no prohibited claim is reachable from any string this route can render",
  bannedHits(renderable.join("\n")),
  [],
);

eq("no prohibited claim appears in the list page", bannedHits(listCode), []);
eq("no prohibited claim appears in the detail page", bannedHits(detailCode), []);
eq("no prohibited claim appears in the contract module", bannedHits(contractCode), []);
eq("no prohibited claim appears in the stylesheet", bannedHits(cssCode), []);

check(
  "the removed header line is not reachable anywhere",
  !routeCode.includes("Calls your voice assistant answers"),
);

eq(
  "the approved workspace wording is exactly what the owner approved",
  [PAGE.title, PAGE.detail],
  ["Call Logs", "Review stored call records, transcripts, and analysis received by SiteMint."],
);

check(
  "the one disclosure names this page's limit, and claims nothing about any other system",
  DETAIL.note.includes("This page only displays it") &&
    !/calendar isn't connected|not connected to a live number|will be connected/i.test(DETAIL.note),
);

check(
  "no heading is promotional or oversized",
  [PAGE.title, LIST.heading, LIST.emptyTitle, LIST.errorTitle, DETAIL.notFoundTitle, DETAIL.errorTitle]
    .every((h) => h.length <= 42 && !/!$/.test(h) && h === h.replace(/\s{2,}/g, " ")),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Structure and accessibility");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "the list page has exactly one h1",
  (listCode.match(/<h1\b/g) ?? []).length,
  1,
);
eq(
  "every terminal detail state has exactly one h1",
  (detailCode.match(/<h1\b/g) ?? []).length,
  3,
);
check(
  "the detail's three h1s are the record, the failure and the missing record",
  /<h1 className="sc-record__title">/.test(detailCode) &&
    /<h1 className="sc-error__title sc-error__title--h1">/.test(detailCode) &&
    /<h1 className="sc-empty__title sc-empty__title--h1">/.test(detailCode),
);
check(
  "heading order descends without skipping",
  !/<h4|<h5|<h6/.test(routeCode) &&
    /<h2 className="sd-sr" id="sc-sheet-heading">/.test(listCode) &&
    /<h2 className="sc-doc__heading"/.test(detailCode) &&
    /<h3 className="sc-group__heading">/.test(detailCode),
);

check(
  "the list is a real table with explicit roles, so semantics survive the narrow layout",
  /<table className="sc-table" role="table">/.test(listCode) &&
    /<thead className="sc-table__head" role="rowgroup">/.test(listCode) &&
    /<tbody role="rowgroup">/.test(listCode) &&
    (listCode.match(/role="row"/g) ?? []).length === 2 &&
    (listCode.match(/role="columnheader"/g) ?? []).length === 4 &&
    (listCode.match(/role="cell"/g) ?? []).length === 4,
);

check(
  "every column header is scoped",
  (listCode.match(/scope="col"/g) ?? []).length === 4,
);

check(
  "every cell carries its own label for the narrow layout",
  (listCode.match(/className="sc-cell__label"/g) ?? []).length === 4,
);

check(
  "the in-cell labels are hidden on wide layouts and shown on narrow ones — exactly one label source per width",
  /\.sc-cell__label \{\s*display: none;/.test(cssCode.replace(/\n\s*/g, "\n  ")) &&
    /\.sc-table__head \{\s*display: none;/.test(cssCode.replace(/\n\s*/g, "\n  ")) &&
    /\.sc-cell__label \{\s*display: block;/.test(cssCode.replace(/\n\s*/g, "\n  ")),
);

check(
  "the narrow layout is the only place the table's display is overridden",
  (() => {
    const media = /@media \(max-width: 47\.99rem\) \{([\s\S]*?)\n\}/.exec(cssCode);
    return media !== null && /display: block;/.test(media[1]!) &&
      !/display: block;/.test(cssCode.replace(media[0], ""));
  })(),
);

check(
  "the row's only interactive element is a genuine link",
  /<Link href=\{callHref\(call\.callId\)\} className="sc-link">/.test(listCode) &&
    !/onClick=\{\(\) => (navigate|setLocation)/.test(listCode),
);

check(
  "no generic element is made clickable",
  !/<(div|span|tr|td|li|p)[^>]*onClick=/.test(routeCode),
);

check(
  "the whole row is a target via the link's own stretched pseudo-element, not a wrapper handler",
  /\.sc-link::after \{[\s\S]{0,120}position: absolute;/.test(cssCode) &&
    /\.sc-row \{[\s\S]{0,120}position: relative;/.test(cssCode),
);

check(
  "focus is drawn on the row that activates",
  /\.sc-row:focus-within \{[\s\S]{0,160}outline: var\(--sd-focus-width\) solid var\(--sd-focus-color\)/.test(cssCode),
);

check(
  "no focus outline is removed without a replacement on an ancestor",
  (() => {
    const removals = [...cssCode.matchAll(/([.\w:-]+)\s*\{[^}]*outline:\s*none/g)].map((m) => m[1]!);
    return removals.every((sel) => sel === ".sc-link:focus-visible");
  })(),
);

check(
  "every interactive target reaches 44px",
  (cssCode.match(/min-height: 44px/g) ?? []).length >= 3,
);

check(
  "the loading, error and empty blocks are each announced or role-marked",
  (listCode.match(/role="status"/g) ?? []).length === 3 &&
    (listCode.match(/role="alert"/g) ?? []).length === 1 &&
    (detailCode.match(/role="alert"/g) ?? []).length === 1,
);

check(
  "no aria-hidden is placed on a focusable or informative element",
  (routeCode.match(/aria-hidden="true"/g) ?? []).length ===
    (routeCode.match(/<span aria-hidden="true">&larr;<\/span>|className="sc-cell__label" aria-hidden="true"/g) ?? []).length,
);

check(
  "the interface adds no control that does nothing",
  (routeCode.match(/<button/g) ?? []).length === 2 &&
    (routeCode.match(/type="button"/g) ?? []).length === 2,
);

check(
  "there is no disabled decoy control, tooltip-only affordance or fake menu",
  !/UnavailableActionButton|ComingSoon|DisabledFeatureCard|title=|<select|<input|role="menu"/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Stylesheet — tokens only, no new palette, no request");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "every colour is a shell token",
  (cssCode.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).length === 0,
);

check(
  "no purple, indigo, ordinary green or neon is introduced",
  !/purple|indigo|violet|#8b5cf6|#6366f1|#22c55e|#00ff|lime|magenta/i.test(cssCode),
);

/**
 * Innermost `selector { body }` pairs. An at-rule's own opener can never match
 * (`[^{}]+` cannot span the inner `{`), so a nested block is attributed to its
 * real selector rather than to the media query around it.
 */
const ruleBlocks = (src: string): { selector: string; body: string }[] =>
  [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim().replace(/\s+/g, " "),
    body: m[2]!,
  }));

const blocks = ruleBlocks(cssCode);
check("the stylesheet parses into rule blocks", blocks.length > 30);

const usersOf = (token: RegExp) => blocks.filter((b) => token.test(b.body)).map((b) => b.selector);

eq(
  "mint is used only for focus",
  usersOf(/--sd-accent|--sd-focus-color/).filter((sel) => !/focus/.test(sel)),
  [],
);

eq(
  "amber appears only for the attention tone",
  usersOf(/--sd-warn/).filter((sel) => !/attention/.test(sel)),
  [],
);

eq(
  "red appears only for a failed call or a genuine error",
  usersOf(/--sd-danger/).filter((sel) => !/failed|\.sc-error/.test(sel)),
  [],
);

check("no remote font, image or asset is requested", !/@import|url\(|https?:/i.test(cssCode));
check("no gradient, glow, blur or filter", !/gradient|filter:|box-shadow:[^;]*\d{2,}px|backdrop/i.test(cssCode));
check("no decorative chart, waveform or play affordance", !/waveform|equalizer|::before\s*\{\s*content:\s*"[▶►]/.test(cssCode));

check(
  "the dark theme is inherited from the shell, not redefined here",
  !/prefers-color-scheme|\[data-theme|\.dark\b/.test(cssCode),
);

check(
  "only transform, opacity and colour are animated",
  (() => {
    const props = [...cssCode.matchAll(/transition:\s*([^;]+);/g)]
      .flatMap((m) => m[1]!.split(",").map((p) => p.trim().split(/\s+/)[0]!));
    return props.every((p) =>
      ["background-color", "color", "border-color", "opacity", "transform", "none"].includes(p));
  })(),
);

check("nothing loops", !/animation|@keyframes|infinite/.test(cssCode));

const reducedMotion = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\n\}/.exec(cssCode);
check("the stylesheet has a reduced-motion block", reducedMotion !== null);

const animatedSelectors = [
  ...new Set(
    blocks
      .filter((b) => /transition:/.test(b.body) && !/transition:\s*none/.test(b.body))
      .flatMap((b) => b.selector.split(",").map((s) => s.trim()))
      // The base class is what reduced motion switches off; a :hover or
      // :focus variant of it is covered by the same rule.
      .map((s) => (/^(\.[\w-]+)/.exec(s) ?? [, s])[1]!),
  ),
];

eq(
  "reduced motion removes every transition this file adds",
  animatedSelectors.filter((sel) => reducedMotion === null || !reducedMotion[1]!.includes(sel)),
  [],
);

check(
  "hover transforms are gated behind a fine pointer",
  [...cssCode.matchAll(/:hover/g)].length ===
    [...cssCode.matchAll(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/g)]
      .join("").match(/:hover/g)!.length,
);

check(
  "the sheet, not the page, scrolls sideways if a column cannot fit",
  /\.sc-tablewrap \{[\s\S]{0,240}overflow-x: auto/.test(cssCode) &&
    !/overflow-x: (scroll|visible)/.test(cssCode.replace(/overflow-x: auto/g, "")),
);

check(
  "the stylesheet is imported by both pages, and no other stylesheet is added",
  (listCode.match(/import "@\/styles\//g) ?? []).length === 2 &&
    (detailCode.match(/import "@\/styles\//g) ?? []).length === 2 &&
    listCode.includes('import "@/styles/v2-call-logs.css"') &&
    detailCode.includes('import "@/styles/v2-call-logs.css"'),
);

// ═══════════════════════════════════════════════════════════════════════════
section("No new dependency, no protected file touched");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "neither page imports a package that is not already in the app",
  (() => {
    const imports = [...routeCode.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    return imports.every((i) => i.startsWith("@/") || i.startsWith(".") ||
      ["react", "wouter"].includes(i));
  })(),
);

check(
  "no icon library is pulled into these routes",
  !/lucide-react|react-icons|framer-motion|recharts|@vapi-ai/.test(routeCode),
);

eq(
  "the Phase 14 contract test is registered exactly once in the aggregate command",
  (scriptsPkgSrc.match(/call-logs\/callLogsContract\.test\.ts/g) ?? []).length,
  1,
);

check(
  "the aggregate command still runs every earlier phase's contract test",
  ["signup/signupContract", "login/loginContract", "overview/overviewContract",
   "conversations/conversationsContract", "receptionist/receptionistContract",
   "contacts/contactsContract", "settings/settingsContract", "billing/billingContract",
   "appointments/appointmentsContract"].every((s) => scriptsPkgSrc.includes(s)),
);

check(
  "the API client and the hooks are unchanged in the ways this route depends on",
  /export function fetchRealCalls\(\): Promise<\{ items: RealCallSummary\[\]; count: number \}>/.test(apiSrc) &&
    /export function fetchRealCallDetail\(callId: string\)/.test(apiSrc) &&
    /credentials: "include"/.test(apiSrc) &&
    /export function useRealCallsList\(\)/.test(hooksSrc) &&
    /export function useRealCallDetail\(callId: string \| undefined\)/.test(hooksSrc),
);

check(
  "the shell's navigation selection rule is unchanged",
  /item\.state === "live" && \(!item\.voiceGated \|\| voiceEnabled\) && Boolean\(item\.href\)/.test(dashboardNavSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Navigation — the corrected Call Logs description");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Call Logs nav entry used to end with a sentence promising sample data
 * until calling was hooked up. Both halves are now false: the demo fixture is
 * deleted, the route renders only stored API records, and nothing on this
 * surface reads provider status, so the product cannot know — let alone
 * promise — that calling is connected. Phase 14 requires a prohibited claim to
 * be absent from source and from the bundle, not merely unrendered, so the
 * sentence is gone and its absence is pinned here.
 *
 * It is assembled from fragments rather than written out: a literal would put
 * the exact byte sequence this correction removes back into the tree, and into
 * the grep an owner review runs over it.
 */
const OBSOLETE_NAV_SENTENCE =
  ["Shows", "sample", "data", "until", "live", "calling", "is", "connected."].join(" ");

const CORRECTED_NAV_DESCRIPTION = "Review stored call records and analysis.";

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const CALL_LOGS_NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => item.key === "logs");

eq("exactly one Call Logs navigation record exists", CALL_LOGS_NAV_ITEMS.length, 1);

const callLogsNav = CALL_LOGS_NAV_ITEMS[0]!;

check(
  "the obsolete sentence is absent from lib/nav.ts",
  !navSrc.includes(OBSOLETE_NAV_SENTENCE),
);

eq(
  "no navigation entry anywhere still carries the obsolete sentence",
  ALL_NAV_ITEMS
    .filter((item) =>
      `${item.description ?? ""} ${item.availability ?? ""}`.includes(OBSOLETE_NAV_SENTENCE))
    .map((item) => item.key),
  [],
);

check(
  "the obsolete sentence is absent from every string this route can render",
  !renderable.join("\n").includes(OBSOLETE_NAV_SENTENCE),
);

eq(
  "the Call Logs description is the corrected wording, exactly",
  callLogsNav.description,
  CORRECTED_NAV_DESCRIPTION,
);

/**
 * The claim categories the owner named, probed against the corrected sentence
 * on its own. `BANNED` above is the same net cast wider over the whole route;
 * this is the narrow, explicit statement of what this one description may not
 * say, so a future edit to it fails here by name.
 */
const NAV_CLAIM_PROBES: [string, RegExp][] = [
  ["sample data", /\bsamples?\b/i],
  ["demo data", /\bdemos?\b|\bmock/i],
  ["live calling", /\blive\b/i],
  ["connected calling", /\bconnect(s|ed|ing|ion)?\b/i],
  ["operational calling", /\boperational\b|\bworking\b|\bactive\b|\bonline\b|\banswers? calls?\b|\btaking calls\b/i],
  ["a configured phone number", /\bphone number\b|\bconfigured\b|\bprovisioned\b|\bnumber is\b/i],
  ["provider readiness", /\bprovider\b|\bready\b|\bvapi\b|\btwilio\b/i],
];

eq(
  "the corrected description makes none of the prohibited calling claims",
  NAV_CLAIM_PROBES.filter(([, re]) => re.test(callLogsNav.description!)).map(([name]) => name),
  [],
);

eq(
  "the corrected description trips none of the route's own banned claims either",
  bannedHits(callLogsNav.description!),
  [],
);

/**
 * Truthful, not merely inoffensive: every noun in the replacement is something
 * this route demonstrably has. "Stored call records" are what the two GET
 * endpoints asserted at the top of this file return — the server's own rows,
 * never anything live — and "analysis" is the API's `analysisAvailability`
 * field, which the detail page renders including its honest unavailable case.
 */
check(
  "each thing the corrected description names is backed by the route's own surface",
  ROUTER_CALLS.some((c) => c.includes('"/receptionist/voice/calls"')) &&
    ROUTER_CALLS.some((c) => c.includes('"/receptionist/voice/calls/:callId"')) &&
    LIST.heading === "Call records" &&
    detailCode.includes("ANALYSIS_UNAVAILABLE") &&
    /analysisAvailability/.test(apiSrc) &&
    !/provider-status/.test(listCode + detailCode),
);

eq(
  "no other Call Logs navigation property moved",
  {
    key: callLogsNav.key,
    label: callLogsNav.label,
    href: callLogsNav.href,
    state: callLogsNav.state,
    voiceGated: callLogsNav.voiceGated,
    availability: callLogsNav.availability ?? null,
  },
  {
    key: "logs",
    label: "Call Logs",
    href: "/logs",
    state: "live",
    voiceGated: true,
    availability: null,
  },
);

eq(
  "the navigation groups, their items and their order are unchanged",
  NAV_GROUPS.map((group) => [group.key, group.items.map((item) => item.key)]),
  [
    ["overview", ["overview"]],
    ["build", ["assistants", "tools", "phone-numbers", "voice-library", "knowledge", "squads"]],
    ["operate", ["appointments", "conversations", "receptionist", "contacts", "outbound"]],
    ["observe", ["logs", "analytics", "testing", "structured-outputs", "issues"]],
    ["manage", ["integrations", "billing", "settings", "api-keys"]],
  ],
);

eq(
  "every other navigation description is byte-for-byte what it was",
  ALL_NAV_ITEMS
    .filter((item) => item.key !== "logs" && item.description !== undefined)
    .map((item) => [item.key, item.description]),
  [
    ["assistants", "Build and manage AI voice assistants for your business."],
    ["tools", "Assign actions your assistant can take during a call, like booking or transferring."],
    ["phone-numbers", "Get a SiteMint number or connect one you already own."],
    ["voice-library", "Browse and preview voices for your assistant."],
    ["knowledge", "Give your assistant reference material to draw on during calls."],
    ["appointments", "Visual booking calendar, requests, and availability rules. Development preview — no real calendar is connected yet."],
    ["analytics", "Business metrics — calls answered, appointments booked, hours saved."],
    ["testing", "Test your assistant with a browser call or a text conversation."],
    ["structured-outputs", "Data your assistant extracts and structures from each call."],
    ["integrations", "Connect Google Calendar, Google Sheets, and other accounts."],
    ["api-keys", "Manage API credentials for advanced integrations."],
  ],
);

check(
  "no navigation entry re-introduces demo, sample or fixture framing",
  !ALL_NAV_ITEMS.some((item) =>
    /\bdemo\b|\bsample\b|\bmock|\bfixture\b/i.test(
      `${item.label} ${item.description ?? ""} ${item.availability ?? ""}`,
    ),
  ),
);

/**
 * The set of descriptions the app actually renders is unchanged by this
 * correction, and Call Logs is still not in it: `description` reaches a reader
 * through exactly one JSX site, for `comingSoon` and `advanced` destinations
 * only, and the shell renders none at all. The corrected sentence is therefore
 * inert, which is why no Call Logs screen changes.
 */
eq(
  "the only navigation descriptions the app renders are the coming-soon and advanced ones",
  ALL_NAV_ITEMS
    .filter((item) => item.href && (item.state === "comingSoon" || item.state === "advanced"))
    .map((item) => item.key),
  ["tools", "phone-numbers", "voice-library", "knowledge", "analytics", "testing",
    "structured-outputs", "integrations", "api-keys"],
);

check(
  "Call Logs is live, so its description stays unrendered — through the one render site",
  callLogsNav.state === "live" &&
    (appSrc.match(/description=\{item\.description\}/g) ?? []).length === 1 &&
    /comingSoonRoutes = voicePlatformEnabled\s*\?\s*NAV_GROUPS[\s\S]*?item\.state === "comingSoon" \|\| item\.state === "advanced"/
      .test(appSrc) &&
    !/description/.test(read("artifacts/helpdesk/src/components/layout/AppShell.tsx")),
);

eq(
  "no production-renderable navigation string carries the obsolete sentence",
  ALL_NAV_ITEMS
    .filter((item) => item.href && (item.state === "comingSoon" || item.state === "advanced"))
    .flatMap((item) => [item.label, item.description ?? "", item.availability ?? ""])
    .filter((s) => s.includes(OBSOLETE_NAV_SENTENCE)),
  [],
);

// ═══════════════════════════════════════════════════════════════════════════
section("Built output — the claims are absent from the bundle");
// ═══════════════════════════════════════════════════════════════════════════

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
if (!existsSync(distDir)) {
  console.log("  SKIP  no built output present (run a production build to include these)");
} else {
  const files = readdirSync(distDir);
  const listChunks = files.filter((f) => /^CallLogs-.*\.js$/.test(f));
  const detailChunks = files.filter((f) => /^CallLogDetail-.*\.js$/.test(f));
  check("exactly one Call Logs list chunk is emitted", listChunks.length === 1);
  check("exactly one Call Logs detail chunk is emitted", detailChunks.length === 1);

  /**
   * Whole-bundle, and deliberately outside the per-chunk block below: the
   * navigation description ships in the entry chunk of *every* build —
   * including the default-gated one, where no Call Logs route is registered at
   * all — so this is the assertion that covers the gated build too.
   */
  const everyEmittedJs = files.filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(path.join(distDir, f), "utf8")).join("\n");

  check(
    "the obsolete sentence is absent from every emitted JavaScript file",
    !everyEmittedJs.includes(OBSOLETE_NAV_SENTENCE),
  );

  check(
    "the corrected Call Logs navigation description is what the bundle carries",
    everyEmittedJs.includes(CORRECTED_NAV_DESCRIPTION),
  );

  if (listChunks.length === 1 && detailChunks.length === 1) {
    /**
     * Follow each route's static import graph rather than globbing one file.
     * `callLogsContract.ts` has two importers, so Vite hoists it into a shared
     * chunk and a chunk-scoped assertion would silently stop finding its
     * strings. Required strings are looked for *including* the shared entry,
     * because the entry is genuinely shipped to the route; banned strings are
     * looked for *excluding* it, because the entry carries unrelated code.
     */
    const graph = (entry: string, includeEntry: boolean): string[] => {
      const seen = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const file = queue.shift()!;
        if (seen.has(file) || !existsSync(path.join(distDir, file))) continue;
        seen.add(file);
        const src = readFileSync(path.join(distDir, file), "utf8");
        for (const m of src.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
          if (includeEntry || !/^index-/.test(m[1]!)) queue.push(m[1]!);
        }
      }
      return [...seen];
    };
    const join = (f: string[]) => f.map((n) => readFileSync(path.join(distDir, n), "utf8")).join("\n");

    const built = join([...graph(listChunks[0]!, true), ...graph(detailChunks[0]!, true)]);
    const routeOnly = join([...graph(listChunks[0]!, false), ...graph(detailChunks[0]!, false)]);
    const wholeBundle = join(files.filter((f) => f.endsWith(".js")));

    eq("no prohibited claim survives into the built route code", bannedHits(routeOnly), []);

    check("the approved workspace wording reaches the built output", built.includes(PAGE.detail));
    check("the honest empty state reaches the built output", built.includes(LIST.emptyDetail));
    check("the distinct read-failure wording reaches the built output", built.includes(LIST.errorTitle));
    check("the not-found wording reaches the built output", built.includes(DETAIL.notFoundTitle));
    check("the analysis-unavailable wording reaches the built output", built.includes(ANALYSIS_UNAVAILABLE));

    eq(
      "no fabricated record survives anywhere in the bundle",
      FABRICATED.filter((p) => wholeBundle.includes(p)),
      [],
    );

    check(
      "the built Call Logs routes render no demo or sample framing",
      !/Demo Mode|Sample data|sample record/i.test(routeOnly),
    );

    /**
     * Scoped to the route graph excluding the entry. The shared entry carries
     * `useAssistantSessionGuard`, which reads
     * `/receptionist/voice/assistants` — that is the Assistants route's
     * request, present in every build since Milestone 1, and out of Phase 14's
     * scope. Call Logs itself must reach only the calls path.
     */
    check(
      "the built Call Logs routes call only the documented calls path",
      (routeOnly.match(/receptionist\/voice\/[a-z-]+/g) ?? [])
        .every((m) => m === "receptionist/voice/calls"),
    );

    check(
      "the built routes never request provider-status",
      !routeOnly.includes("provider-status"),
    );

    check(
      "the built routes contact no provider host and load no provider SDK",
      !/api\.vapi\.ai|vapi\.ai|daily\.co|twilio\.com|googleapis\.com/i.test(routeOnly),
    );

    check(
      "no private provider credential is present in any emitted chunk",
      !/VAPI_API_KEY|VAPI_WEBHOOK_SECRET|GOOGLE_CLIENT_SECRET|client_secret|refresh_token/i.test(wholeBundle),
    );

    const allCss = files.filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(path.join(distDir, f), "utf8")).join("\n");

    check(
      "the Call Logs stylesheet reaches the built output",
      /\.sc-tablewrap|\.sc-record|\.sc-prose/.test(allCss),
    );
    check(
      "no remote font is requested by any emitted stylesheet",
      !/@import\s+url\(|fonts\.googleapis|fonts\.gstatic|https?:\/\/[^)]*\.woff/i.test(allCss),
    );
    check(
      "no emitted stylesheet redefines the dark theme for this route",
      !/\.sc-[\w-]+[^{]*\{[^}]*\}[^}]*prefers-color-scheme/.test(allCss.replace(/\s+/g, " ")),
    );
  }
}

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 14 call logs contract tests passed.");
