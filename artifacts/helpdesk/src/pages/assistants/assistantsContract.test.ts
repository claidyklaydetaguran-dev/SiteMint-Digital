/**
 * AR-001I — committed contract tests for the Assistants journey.
 *
 * Run via: tsx artifacts/helpdesk/src/pages/assistants/assistantsContract.test.ts
 *
 * Same arrangement as the Phase 5–14 page contract tests and AR-001A: the file
 * lives beside the module it covers, `tsx` is the runner, and helpdesk's
 * tsconfig excludes `**\/*.test.ts` by glob so nothing here is type-built into
 * the app or bundled by Vite.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * Assistants was the only remaining voice-platform journey without one, and it
 * is the journey with the most to overclaim: it is the single path that ends in
 * a real, irreversible provider mutation. Three defects were found and fixed,
 * and each has a section below that would fail if it came back:
 *
 *   1. Row controls named "Test" and "Publish" that only navigated.
 *   2. Hard-coded phone-number readiness content, supplied by no response.
 *   3. A selectable "Custom" preset the server cannot publish.
 *
 * ── What is proven mechanically, and what is proven structurally ───────────
 *
 * Mechanically (real production code executed here, against local fakes):
 *   • the contract module's rules and its whole renderable string surface;
 *   • `lib/assistantEstimates.ts` — the actual preset catalog;
 *   • `lib/assistantsApi.ts` — the real `publishAssistant()`, driven through a
 *     counting fetch stub that refuses any non-`/api/` URL, so request counts,
 *     the error shapes and the id guard are observed, not asserted about;
 *   • `lib/publishErrors.ts` — the real code-to-copy mapping;
 *   • `lib/assistantStatus.ts` — the real publish/delete eligibility rules;
 *   • the AR-001A `FakeBrowserVoiceClient`, driven through every lifecycle
 *     the journey can reach.
 *
 * Structurally (source assertion, because the code cannot be executed here):
 *   • anything reading `import.meta.env` — `featureFlags.ts` and everything
 *     importing it — which is a Vite compile-time construct plain Node cannot
 *     evaluate. Every contract test in this repository treats it this way.
 *   • the `.tsx` components, which need a React renderer this workspace does
 *     not have. AR-001I authorises no new dependency, so the single-flight
 *     publish guard and the hook's event-to-state mapping are asserted as
 *     source, not re-implemented here. Re-implementing a reducer in order to
 *     test it would assert only that a copy matches itself.
 *
 * That split is a real limitation and is stated plainly rather than papered
 * over. See the closing "Honest limitations" section.
 *
 * It never performs a network request, never signs in, never creates a
 * session, never loads a provider SDK, never requests a microphone, never
 * opens a WebRTC peer connection or WebSocket, never contacts a provider,
 * never touches a database, and never reaches a host other than nothing at
 * all.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILDER,
  CREATE,
  ESTIMATE_CHIP,
  ESTIMATE_NOTE,
  GUIDANCE_CHIP,
  GUIDANCE_NOTE,
  LIST,
  LIST_PATH,
  NEW_PATH,
  PRESET_RECOVERY,
  PROVIDER_LINKED,
  PROVIDER_NOT_LINKED,
  RETIRED_VOICE_PRESET_IDS,
  SAVE_PROMPT_EITHER,
  SAVE_PROMPT_PUBLISH,
  SAVE_PROMPT_TEST,
  SUPPORTED_VOICE_PRESET_IDS,
  VOICE_MODEL,
  assistantHref,
  deleteDialogTitle,
  everyRenderableString,
  isRetiredVoicePreset,
  isStoredVoicePreset,
  isSupportedVoicePreset,
  lastSyncedNote,
  moreActionsAccessibleName,
  openAccessibleName,
  providerLinkLabel,
} from "./assistantsContract.js";

import {
  VOICE_MODEL_PRESETS,
  findVoicePreset,
  voicePresetIds,
} from "../../lib/assistantEstimates.js";

import {
  AssistantApiRequestError,
  PUBLISH_ROUTE_ERROR_CODES,
  publishAssistant,
} from "../../lib/assistantsApi.js";

import {
  UNCERTAIN_ROUTE_ERROR_CODES,
  publishRouteErrorMessage,
  safeSyncErrorMessage,
} from "../../lib/publishErrors.js";

import { isEligibleForDelete, isPublishableStatus } from "../../lib/assistantStatus.js";

import {
  FakeBrowserVoiceClient,
  createFakeBrowserVoiceClientSource,
} from "../../lib/browserVoice/testing/FakeBrowserVoiceClient.js";
import type { BrowserVoiceEvent } from "../../lib/browserVoice/types.js";

import { VOICE_NAV, navGroupsWith } from "../../lib/nav.js";

/**
 * AR-001J owner review, correction A. The build classifier below now calls
 * the application's own parser instead of restating its rule inline, so all
 * three neighbouring built-output suites classify through one truth table
 * and none of them can drift away from it.
 */
import { parseBooleanFlag } from "../../lib/featureFlags.js";

/**
 * The complete navigation architecture, voice records included. AR-001J's
 * correction makes `NAV_GROUPS` build-selected — outside a bundler every flag
 * takes its documented default of false, so the ambient catalogue is the
 * default-gated one — and a test that needs the enabled architecture composes
 * it from the same single source rather than from a second copy.
 */
const ALL_NAV_GROUPS = navGroupsWith(VOICE_NAV);

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/assistants → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label} — expected ${b}, got ${a}`);
    console.log(`  FAIL  ${label} — expected ${b}, got ${a}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}`);
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// ─── Tripwires ─────────────────────────────────────────────────────────────
//
// The absence of a credential is not proof of inaction. Every escape route
// this process has is instrumented before any production code runs.
//
// `fetch` is the one exception to "throw on use", because this file drives the
// real `publishAssistant()` and needs to observe what it sends. It is replaced
// by a stub that refuses anything that is not a same-origin `/api/…` path, so
// an off-machine request is a failure rather than a silent success, and every
// call is counted.

const trips: Record<string, number> = {
  XMLHttpRequest: 0,
  WebSocket: 0,
  RTCPeerConnection: 0,
  getUserMedia: 0,
  sendBeacon: 0,
  importVapiSdk: 0,
  offMachineFetch: 0,
};

const g = globalThis as unknown as Record<string, unknown>;

for (const name of ["XMLHttpRequest", "WebSocket", "RTCPeerConnection", "sendBeacon"]) {
  g[name] = function tripped(): never {
    trips[name] = (trips[name] ?? 0) + 1;
    throw new Error(`AR-001I tripwire: ${name} was invoked`);
  };
}

const mediaDevicesPresent =
  typeof (g.navigator as { mediaDevices?: unknown } | undefined)?.mediaDevices !== "undefined";

interface RecordedRequest {
  url: string;
  method: string;
  hasBody: boolean;
  headers: Record<string, string>;
  credentials: string | undefined;
}

const requests: RecordedRequest[] = [];
let responseQueue: Array<() => Response> = [];

g.fetch = async function stubbedFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  // Anything that is not a same-origin API path is an escape, not a request.
  if (!url.startsWith("/api/")) {
    trips.offMachineFetch += 1;
    throw new Error(`AR-001I tripwire: off-machine fetch to ${url}`);
  }
  requests.push({
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    hasBody: init?.body !== undefined && init?.body !== null,
    headers: { ...((init?.headers ?? {}) as Record<string, string>) },
    credentials: init?.credentials as string | undefined,
  });
  const next = responseQueue.shift();
  if (!next) throw new Error("AR-001I: fetch stub had no queued response");
  return next();
};

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function resetRequests(queue: Array<() => Response> = []): void {
  requests.length = 0;
  responseQueue = queue;
}

// ─── Sources under assertion ───────────────────────────────────────────────

const listSrc = read("artifacts/helpdesk/src/pages/Assistants.tsx");
const createSrc = read("artifacts/helpdesk/src/pages/AssistantCreate.tsx");
const builderSrc = read("artifacts/helpdesk/src/pages/AssistantBuilder.tsx");
const builderNewSrc = read("artifacts/helpdesk/src/pages/AssistantBuilderNew.tsx");
const shellSrc = read("artifacts/helpdesk/src/pages/assistant-builder/BuilderShell.tsx");
const setupTabSrc = read("artifacts/helpdesk/src/pages/assistant-builder/SetupTab.tsx");
const promptTabSrc = read("artifacts/helpdesk/src/pages/assistant-builder/PromptTab.tsx");
const voiceTabSrc = read("artifacts/helpdesk/src/pages/assistant-builder/VoiceModelTab.tsx");
const presetSelectorSrc = read("artifacts/helpdesk/src/components/common/PresetSelector.tsx");
const templateCardSrc = read("artifacts/helpdesk/src/components/common/TemplateCard.tsx");
const costSrc = read("artifacts/helpdesk/src/components/common/CostBreakdown.tsx");
const latencySrc = read("artifacts/helpdesk/src/components/common/LatencyMeter.tsx");
const testDialogSrc = read("artifacts/helpdesk/src/components/common/BrowserTestConfirmDialog.tsx");
const testPanelSrc = read("artifacts/helpdesk/src/components/common/BrowserTestPanel.tsx");
const publishDialogSrc = read("artifacts/helpdesk/src/components/common/PublishConfirmDialog.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/assistants/assistantsContract.ts");
const templatesSrc = read("artifacts/helpdesk/src/lib/assistantTemplates.ts");
const estimatesSrc = read("artifacts/helpdesk/src/lib/assistantEstimates.ts");
const configSrc = read("artifacts/helpdesk/src/lib/assistantConfig.ts");
const draftsSrc = read("artifacts/helpdesk/src/hooks/useAssistantDrafts.tsx");
const voiceTestHookSrc = read("artifacts/helpdesk/src/hooks/useBrowserVoiceTest.ts");
const voiceContextSrc = read("artifacts/helpdesk/src/lib/browserVoice/context.tsx");

const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const voiceRoutesSrc = read("artifacts/helpdesk/src/routes/voiceRoutes.ts");
const scriptsPkgSrc = read("scripts/package.json");

const runtimeCatalogSrc = read("artifacts/api-server/src/lib/voicePublishing/runtimeCatalog.ts");
const publishServiceSrc = read("artifacts/api-server/src/lib/voicePublishing/publishService.ts");
const artifactPolicySrc = read(
  "artifacts/api-server/src/lib/voice/providers/vapi/artifactPolicy.ts",
);
const cleanupServiceSrc = read("artifacts/api-server/src/lib/voiceCleanup/cleanupService.ts");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why — including quoting the removed phrases verbatim — so a
 * prose mention of a deleted claim must never be mistaken for the claim still
 * being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const listCode = stripComments(listSrc);
const createCode = stripComments(createSrc);
const builderCode = stripComments(builderSrc);
const builderNewCode = stripComments(builderNewSrc);
const shellCode = stripComments(shellSrc);
const setupTabCode = stripComments(setupTabSrc);
const voiceTabCode = stripComments(voiceTabSrc);
const presetSelectorCode = stripComments(presetSelectorSrc);
const contractCode = stripComments(contractSrc);
const templatesCode = stripComments(templatesSrc);
const estimatesCode = stripComments(estimatesSrc);
const configCode = stripComments(configSrc);

/** Everything the journey can render, as one searchable body of code. */
const journeyCode = [
  listCode,
  createCode,
  builderCode,
  builderNewCode,
  shellCode,
  setupTabCode,
  stripComments(promptTabSrc),
  voiceTabCode,
  presetSelectorCode,
  stripComments(templateCardSrc),
  stripComments(costSrc),
  stripComments(latencySrc),
  stripComments(testDialogSrc),
  stripComments(testPanelSrc),
  stripComments(publishDialogSrc),
  contractCode,
  templatesCode,
  estimatesCode,
].join("\n");

// ═══════════════════════════════════════════════════════════════════════════
section("Premise — what the assistants API actually offers");
// ═══════════════════════════════════════════════════════════════════════════

{
  const apiSrc = read("artifacts/helpdesk/src/lib/assistantsApi.ts");
  const paths = [...apiSrc.matchAll(/request<[^>]*>\(\s*[`"]([^`"]+)/g)].map((m) => m[1]!);
  check(
    "every endpoint this journey can reach is an assistants endpoint",
    paths.length > 0 && paths.every((p) => p.startsWith("/receptionist/voice/assistants")),
  );
  check(
    "no endpoint in this journey names a phone number, message, mail or webhook",
    !/phone|number|sms|message|mail|webhook|call/i.test(paths.join(" ")),
  );
  check(
    "the API client is same-origin and cookie-authenticated, with no token",
    apiSrc.includes('credentials: "include"') && !/Authorization|Bearer|localStorage/.test(apiSrc),
  );
  check(
    "publish sends no request body",
    /publishAssistant[\s\S]*?method: "POST", headers: \{ Accept: "application\/json" \}/.test(apiSrc),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Feature gates — default-off, and unchanged by AR-001I");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the voice flag still defaults false and is still parsed from VITE_VOICE_PLATFORM_ENABLED",
  /voicePlatformEnabled: boolean = NO_BUILD_ENV[\s\S]{0,500}parseBooleanFlag\(import\.meta\.env\.VITE_VOICE_PLATFORM_ENABLED\)/.test(
    flagsSrc,
  ),
);
check(
  "the publish flag still defaults false and is still parsed from VITE_VOICE_PUBLISH_ENABLED",
  /voicePublishEnabled: boolean = NO_BUILD_ENV[\s\S]{0,500}parseBooleanFlag\(import\.meta\.env\.VITE_VOICE_PUBLISH_ENABLED\)/.test(
    flagsSrc,
  ),
);
check(
  "the browser-test flag still defaults false and is still parsed from VITE_VOICE_BROWSER_TEST_ENABLED",
  /voiceBrowserTestEnabled: boolean = NO_BUILD_ENV[\s\S]{0,500}parseBooleanFlag\(import\.meta\.env\.VITE_VOICE_BROWSER_TEST_ENABLED\)/.test(
    flagsSrc,
  ),
);
check(
  "a non-string or misspelled flag value is false, never truthy",
  /if \(typeof value !== "string"\) return false;/.test(flagsSrc) &&
    /value\.trim\(\)\.toLowerCase\(\) === "true"/.test(flagsSrc),
);
check(
  "AR-001I added no flag and removed none",
  [...new Set(flagsSrc.match(/import\.meta\.env\.VITE_[A-Z_]+/g) ?? [])].length === 3,
);
check(
  "no Assistants file reads import.meta.env directly",
  !/import\.meta\.env/.test(journeyCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Route registration — gated, unchanged, and base-relative");
// ═══════════════════════════════════════════════════════════════════════════

{
  const gatedBlock = appSrc.slice(
    appSrc.indexOf("{voicePlatformEnabled && ("),
    appSrc.indexOf("{comingSoonRoutes.map("),
  );
  for (const key of ["assistants", "assistantNew", "assistantNewTab", "assistantDetail"]) {
    check(
      `ROUTES.${key} is registered only inside the voice-platform gate`,
      gatedBlock.includes(`ROUTES.${key}`),
    );
  }
  check(
    "no Assistants route is registered outside that gate",
    (appSrc.match(/ROUTES\.assistant/g) ?? []).length ===
      (gatedBlock.match(/ROUTES\.assistant/g) ?? []).length,
  );
  eq("the four route paths are unchanged", [
    /assistants: "\/assistants",/.test(routesSrc),
    /assistantNew: "\/assistants\/new",/.test(routesSrc),
    /assistantNewTab: "\/assistants\/new\/:tab",/.test(routesSrc),
    /assistantDetail: "\/assistants\/:id\/:tab\?",/.test(routesSrc),
  ], [true, true, true, true]);

  check(
    "the router base is derived from BASE_URL, so a root base and a configured prefix both work",
    /const RAW_BASE = import\.meta\.env\.BASE_URL \|\| "\/";/.test(routesSrc) &&
      /ROUTER_BASE = RAW_BASE\.replace\(\/\\\/\+\$\/, ""\)/.test(routesSrc),
  );
  check(
    "every path this journey navigates to is base-relative — no host, no base prepended by hand",
    !/https?:\/\//.test(journeyCode.replace(/@\/[\w/-]+/g, "")) &&
      !/ROUTER_BASE|BASE_URL|withBase/.test(journeyCode),
  );
  check(
    "the contract's paths match lib/routes.ts exactly",
    LIST_PATH === "/assistants" && NEW_PATH === "/assistants/new",
  );
  eq("assistantHref lands on the builder's first tab by default", assistantHref(7), "/assistants/7/setup");
  eq("assistantHref names the tab when one is given", assistantHref(7, "voice-model"), "/assistants/7/voice-model");
}

check(
  "the Assistants navigation entry is unchanged and still voice-gated",
  /key: "assistants", label: "Assistants", href: "\/assistants"/.test(navSrc) &&
    /state: "live", voiceGated: true/.test(
      navSrc.slice(navSrc.indexOf('key: "assistants"'), navSrc.indexOf('key: "tools"')),
    ),
);
check(
  "AR-001I changed no navigation data",
  ALL_NAV_GROUPS.flatMap((group) => group.items).some(
    (item) => item.key === "assistants" && item.href === "/assistants",
  ),
);
/**
 * AR-001J corrected what this used to assert. Every page was lazily imported
 * from `App.tsx` unconditionally, so a default-gated build still *emitted*
 * the Assistants chunk: the gate removed the route, never the code. The
 * import now lives behind the build boundary, whose condition is a literal
 * the bundler can fold, so a default-gated build does not emit it at all.
 *
 * AR-001I's own subject is untouched. The route registration above, the page,
 * and its contract are exactly as AR-001I left them; only the place the
 * import is written has moved.
 */
check(
  "App.tsx no longer imports the Assistants page unconditionally",
  !/import\("@\/pages\/Assistants"\)/.test(appSrc) &&
    appSrc.includes('import { voiceRoutePages } from "@/routes/voiceRoutes";'),
);
check(
  "the boundary gates that import on the shared foldable flag, not a parser call of its own",
  /import \{ voicePlatformEnabled \} from "@\/lib\/featureFlags";/.test(voiceRoutesSrc) &&
    !/VITE_/.test(voiceRoutesSrc.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /voicePlatformEnabled[\s\S]{0,40}\?[\s\S]{0,240}import\("@\/pages\/Assistants"\)/.test(
      voiceRoutesSrc,
    ),
);
check(
  "all four Assistants routes still resolve through that one boundary",
  ["Assistants", "AssistantCreate", "AssistantBuilderNew", "AssistantBuilder"].every((page) =>
    voiceRoutesSrc.includes(`${page}: lazy(() => import("@/pages/${page}"))`),
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Row actions — every control is named for what it does");
// ═══════════════════════════════════════════════════════════════════════════

eq("the Open control names its assistant", openAccessibleName("Front Desk"), "Open Front Desk");
eq(
  "the overflow control names its assistant",
  moreActionsAccessibleName("Front Desk"),
  "More actions for Front Desk",
);
check(
  "the accessible name begins with the visible label, so Label-in-Name holds",
  openAccessibleName("Front Desk").startsWith(LIST.open),
);

check(
  'no row control is named "Test"',
  !/aria-label=\{`?Test /.test(listCode) && !/`Test \$\{assistant\.name\}`/.test(listCode),
);
check(
  'no row control is named "Publish"',
  !/aria-label=\{`?Publish /.test(listCode) && !/`Publish \$\{assistant\.name\}`/.test(listCode),
);
check(
  "the list imports neither a play nor a rocket icon",
  !/PlayCircle|Rocket/.test(listCode),
);
check(
  'the list no longer carries the "Open assistant to test/publish" tooltips',
  !/Open assistant to (test|publish)/.test(listCode),
);
check(
  "the only destination any row control reaches is the builder",
  (listCode.match(/navigate\(/g) ?? []).length ===
    (listCode.match(/navigate\((assistantHref\(|NEW_PATH)/g) ?? []).length,
);
check(
  "the row's Open handler navigates and does nothing else",
  /const openAssistant = \(assistant: AssistantDto\) => \{\s*navigate\(assistantHref\(assistant\.id\)\);\s*\};/.test(
    listCode,
  ),
);
check(
  "row controls keep a 44px minimum target and a visible focus ring",
  /min-h-11/.test(listCode) && /focus-visible:ring-2/.test(listCode),
);
check(
  "the delete item is still the only destructive one, and still status-gated",
  /disabled=\{!deletable\}/.test(listCode) && /isEligibleForDelete\(assistant\)/.test(listCode),
);

// Real rules, executed.
eq("a draft may be deleted", isEligibleForDelete({ status: "draft", provider: null, providerAssistantId: null } as never), true);
eq(
  "a published assistant may not be deleted",
  isEligibleForDelete({ status: "published", provider: "vapi", providerAssistantId: "a" } as never),
  false,
);
eq("an unknown status is never publishable", isPublishableStatus("unknown" as never), false);
eq("publish_uncertain is never publishable", isPublishableStatus("publish_uncertain" as never), false);

// ═══════════════════════════════════════════════════════════════════════════
section("Navigation produces no mutation");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Brace-balanced extraction of every `useEffect(` body in a file, so the
 * "nothing mutates on mount" claim is checked against the actual effect
 * bodies rather than a loose regex over the whole file.
 */
function effectBodies(src: string): string[] {
  const out: string[] = [];
  const needle = "useEffect(";
  let i = src.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j += 1) {
      if (src[j] === "(") depth += 1;
      else if (src[j] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(needle, j + 1);
  }
  return out;
}

const MUTATING = /\.mutate\(|publishAssistant\(|createAssistant\(|updateAssistant\(|deleteAssistant\(|duplicateAssistant\(|\bfetch\(/;

for (const [name, code] of [
  ["Assistants", listCode],
  ["AssistantCreate", createCode],
  ["AssistantBuilder", builderCode],
  ["AssistantBuilderNew", builderNewCode],
  ["BuilderShell", shellCode],
  ["VoiceModelTab", voiceTabCode],
  ["SetupTab", setupTabCode],
] as const) {
  const bodies = effectBodies(code);
  check(
    `${name}: no effect mutates on mount, navigation, tab change, focus or animation`,
    bodies.every((b) => !MUTATING.test(b)),
  );
  check(
    `${name}: nothing mutates at module scope`,
    !MUTATING.test(code.split(/export default function|export function/)[0] ?? ""),
  );
}

check(
  "the builder's only polling reads the ordinary detail endpoint, and only while publishing",
  /assistant\.status !== "publishing"\) return;/.test(builderCode) &&
    /setInterval\(\(\) => \{\s*refetch\(\);/.test(builderCode),
);
check(
  "a tab change navigates and nothing more",
  /onTabChange=\{\(t\) => navigate\(assistantHref\(numericId!, t\)\)\}/.test(builderCode),
);
check(
  "selecting a template navigates and creates nothing",
  /const handleSelect = \([\s\S]{0,200}navigate\(`\$\{NEW_PATH\}\/setup\?templateKey=/.test(createCode) &&
    !MUTATING.test(createCode),
);
check(
  "publish is reachable only from the confirm handler",
  (builderCode.match(/publishMutation\.mutate\(/g) ?? []).length === 1 &&
    builderCode.indexOf("publishMutation.mutate(") > builderCode.indexOf("const confirmPublish"),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Phone numbers — no content, no field, no readiness claim");
// ═══════════════════════════════════════════════════════════════════════════

const PHONE_NUMBER_SHAPES =
  /\+\d[\d\s().-]{7,}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|\btel:/;

check(
  "no phone-number literal appears anywhere in the journey",
  !PHONE_NUMBER_SHAPES.test(journeyCode),
);
check(
  "no phone-number literal appears in the contract's whole renderable surface",
  !PHONE_NUMBER_SHAPES.test(everyRenderableString().join("\n")),
);

const PHONE_READINESS = [
  /Assigned phone number/i,
  /Available after Phone Numbers setup/i,
  /Phone Numbers setup/i,
  /No number assigned/i,
  /\bphone number\s*:/i,
  /provision a number/i,
  /route calls to this assistant/i,
  /\bnumber is (connected|assigned|configured|ready|active)\b/i,
];
eq(
  "no phone-number readiness claim survives anywhere in the journey",
  PHONE_READINESS.filter((p) => p.test(journeyCode)).map(String),
  [],
);
check(
  "the list renders no phone-number column or field",
  !/Phone number|phoneNumber/i.test(listCode),
);
check(
  "the Setup tab renders no phone-number block",
  !/Phone|phone/.test(setupTabCode),
);
check(
  "the builder banner claims only a provider link, never a number",
  builderCode.includes("BUILDER.linkedNote") &&
    builderCode.includes("BUILDER.notLinkedNote") &&
    !/phone/i.test(builderCode),
);
check(
  "no phone-number field was added to the draft or the saved config",
  !/phone/i.test(draftsSrc) && !/phone/i.test(configCode),
);
check(
  "the provider link says only whether a provider-side assistant exists",
  BUILDER.linkedNote === "Linked to the voice provider." &&
    BUILDER.notLinkedNote === "Not linked to a voice provider.",
);

// ═══════════════════════════════════════════════════════════════════════════
section("Correction B — the unsaved-changes prompt names a reachable action");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AR-001I shipped one sentence for this — "Save your changes before
 * publishing." — held in `BUILDER` and rendered whenever the draft was dirty.
 * It is not a publish control, so AR-001J's build boundary left it alone, and
 * a build with `VITE_VOICE_PUBLISH_ENABLED` off both rendered and shipped
 * guidance about an action it cannot perform.
 *
 * Every assertion in this section fails against that build: `BUILDER` no
 * longer carries the sentence, the wording is selected from the same two
 * folded constants that decide whether either subordinate action exists, and
 * a build with neither renders nothing rather than a sentence naming one.
 */

eq("the publish wording is unchanged, and is now its own constant", SAVE_PROMPT_PUBLISH, "Save your changes before publishing.");
eq("the browser-test wording names testing, not publishing", SAVE_PROMPT_TEST, "Save your changes before testing.");
eq("the both-enabled wording names neither", SAVE_PROMPT_EITHER, "Save your changes before continuing.");

check(
  "the three sentences differ, so no build can silently borrow another's wording",
  new Set([SAVE_PROMPT_PUBLISH, SAVE_PROMPT_TEST, SAVE_PROMPT_EITHER]).size === 3,
);

check(
  "BUILDER no longer carries an unsaved-changes sentence of its own",
  !("savePrompt" in BUILDER) &&
    !Object.values(BUILDER).some((v) => /Save your changes/.test(v)),
);

check(
  "all three sentences stay in the module's enumerable string surface",
  [SAVE_PROMPT_PUBLISH, SAVE_PROMPT_TEST, SAVE_PROMPT_EITHER].every((s) =>
    everyRenderableString().includes(s),
  ),
);

/**
 * The selection itself. It is a ternary over the two constants the builder
 * already composes from `featureFlags.ts`, not a function call and not a
 * runtime read, because only that shape lets Rollup resolve it to one literal
 * and drop the other two — which is what keeps publish wording out of a
 * publish-disabled bundle rather than merely off the screen.
 */
check(
  "the builder selects the sentence from the two build constants, as a foldable ternary",
  /const unsavedChangesPrompt: string \| null = publishInBuild\s*\?\s*browserTestInBuild\s*\?\s*SAVE_PROMPT_EITHER\s*:\s*SAVE_PROMPT_PUBLISH\s*:\s*browserTestInBuild\s*\?\s*SAVE_PROMPT_TEST\s*:\s*null;/.test(
    builderCode,
  ),
);

check(
  "and renders nothing at all when neither subordinate action is in the build",
  /\{unsavedChangesPrompt !== null && isDirty && assistant\.status !== "publishing" && \(/.test(
    builderCode,
  ) && /\{unsavedChangesPrompt\}/.test(builderCode),
);

check(
  "no builder file renders a fixed publish-only save sentence any more",
  !/BUILDER\.savePrompt/.test(journeyCode) &&
    ![builderCode, builderNewCode, shellCode].some((c) =>
      /"Save your changes before (publishing|testing|continuing)\."/.test(c),
    ),
);

check(
  "the attempted-publish reason is the same constant, so the two cannot drift",
  /if \(isDirty\) return SAVE_PROMPT_PUBLISH;/.test(builderCode),
);

check(
  "the attempted-test reason still names testing and is still the eligibility module's",
  /if \(isDirty\) return "Save your changes before testing\.";/.test(
    read("artifacts/helpdesk/src/lib/browserVoice/eligibility.ts"),
  ) && /browserTestDisabledReason\(\{/.test(builderCode),
);

/**
 * Displaying a hint may not do anything. The paragraph renders a constant and
 * a boolean the builder already had — no state is set, no query is fetched,
 * no mutation is issued, and nothing is written back to the draft.
 */
check(
  "showing the prompt performs no state change, request or mutation",
  !/unsavedChangesPrompt[\s\S]{0,400}(mutate|refetch|useEffect|setState|set[A-Z])/.test(
    builderCode.slice(builderCode.indexOf("unsavedChangesPrompt !== null")),
  ),
);

check(
  "and no placeholder, disabled stand-in or unavailable notice replaces it",
  !/coming soon|not available in this build|unavailable/i.test(
    builderCode.slice(
      Math.max(0, builderCode.indexOf("unsavedChangesPrompt !== null") - 200),
      builderCode.indexOf("unsavedChangesPrompt !== null") + 400,
    ),
  ),
);

// The vendor's own name is an internal identifier the customer cannot act on.
check(
  "no vendor name is rendered to the customer",
  !/\bVapi\b/.test(journeyCode.replace(/"vapi"/g, "")) && !/formatProviderName/.test(builderCode),
);
check(
  "no provider assistant id is rendered",
  !/\{assistant\.providerAssistantId\}|\{.*providerAssistantId.*\}<\//.test(journeyCode),
);

eq("an unlinked assistant reads as not linked", providerLinkLabel({ provider: null, providerAssistantId: null }), PROVIDER_NOT_LINKED);
eq("a half-linked assistant reads as not linked", providerLinkLabel({ provider: "vapi", providerAssistantId: null }), PROVIDER_NOT_LINKED);
eq("only a complete pair reads as linked", providerLinkLabel({ provider: "vapi", providerAssistantId: "a" }), PROVIDER_LINKED);

// ═══════════════════════════════════════════════════════════════════════════
section("Browser test — described truthfully, and needing no phone number");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the confirmation says plainly that this is not a phone call",
  /This is not a phone call — no phone number will be assigned\./.test(testDialogSrc),
);
check(
  "the confirmation discloses microphone use before anything starts",
  /browser will ask for microphone permission/i.test(testDialogSrc),
);
check(
  "the test panel never claims a call was placed or received",
  !/call (placed|received|answered|connected to a caller)/i.test(stripComments(testPanelSrc)),
);
check(
  "the publish dialog states publishing assigns no number and places no call",
  /It will not assign a phone number\s*\n?\s*or place a call\./.test(publishDialogSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Presets — supported only, and Custom is not an active choice");
// ═══════════════════════════════════════════════════════════════════════════

{
  const serverKeys = [
    ...runtimeCatalogSrc
      .slice(
        runtimeCatalogSrc.indexOf("export const SITEMINT_PRESET_KEYS = ["),
        runtimeCatalogSrc.indexOf("] as const;", runtimeCatalogSrc.indexOf("SITEMINT_PRESET_KEYS")),
      )
      .matchAll(/"([a-z-]+)"/g),
  ].map((m) => m[1]!);

  eq(
    "the contract's supported presets equal the server's publishable catalog, key for key",
    [...SUPPORTED_VOICE_PRESET_IDS],
    serverKeys,
  );
  eq(
    "the presented catalog offers exactly those presets, in that order",
    voicePresetIds(),
    serverKeys,
  );
  eq("four presets are offered, not five", VOICE_MODEL_PRESETS.length, 4);
  check(
    "Custom is absent from the presented catalog",
    !VOICE_MODEL_PRESETS.some((p) => (p.id as string) === "custom"),
  );
  check(
    "the server still refuses an uncatalogued preset",
    /UNSUPPORTED_PRESET/.test(runtimeCatalogSrc) ||
      /UNSUPPORTED_PRESET/.test(
        read("artifacts/api-server/src/lib/voicePublishing/persistedConfigMapper.ts"),
      ),
  );
  check(
    "AR-001I did not weaken the server's unsupported_preset protection",
    /err\.code === "UNSUPPORTED_PRESET" \? "unsupported_preset"/.test(publishServiceSrc),
  );
}

eq("custom is not a supported preset", isSupportedVoicePreset("custom"), false);
eq("custom is recognised as a retired one", isRetiredVoicePreset("custom"), true);
eq("custom is still a value the builder may hold", isStoredVoicePreset("custom"), true);
eq("a supported preset is supported", isSupportedVoicePreset("natural-balanced"), true);
for (const junk of ["", "  ", "CUSTOM", "natural balanced", null, undefined, 7, {}]) {
  eq(`a junk preset (${JSON.stringify(junk)}) is neither supported nor stored`, [
    isSupportedVoicePreset(junk),
    isStoredVoicePreset(junk),
  ], [false, false]);
}
eq("the retired list is exactly custom", [...RETIRED_VOICE_PRESET_IDS], ["custom"]);

check(
  "the preset group offers only presets from the presented catalog",
  /VOICE_MODEL_PRESETS\.map\(/.test(presetSelectorCode) &&
    !/custom/i.test(presetSelectorCode),
);
check(
  "no Advanced tab is offered, and nothing points at one",
  !/Advanced tab|under Advanced|AdvancedTab/.test(journeyCode),
);
check(
  "the builder still exposes exactly the three tabs that are actually imported",
  /BUILDER_TABS = \[\s*\{ key: "setup"[\s\S]*?\{ key: "prompt"[\s\S]*?\{ key: "voice-model"[\s\S]*?\] as const;/.test(
    shellCode,
  ) && (shellCode.match(/key: "/g) ?? []).length === 3,
);
for (const orphan of ["AdvancedTab", "AnalysisTab", "KnowledgeTab", "TestingTab", "ToolsTab"]) {
  check(
    `${orphan} is imported by nothing, so it cannot surface`,
    !new RegExp(`import\\s+\\w*\\s*${orphan}|from "[^"]*${orphan}"`).test(journeyCode) &&
      !shellSrc.includes(orphan),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Stored retired preset — a truthful recovery, and no silent rewrite");
// ═══════════════════════════════════════════════════════════════════════════

eq("a retired preset resolves to no preset, never a substitute", findVoicePreset("custom"), undefined);
eq("an unknown preset resolves to no preset either", findVoicePreset("nonsense"), undefined);
check(
  "a supported preset still resolves",
  findVoicePreset("budget-friendly")?.label === "Budget Friendly",
);

check(
  "hydration preserves a stored preset instead of collapsing it to a default",
  /function voicePresetId\(value: unknown, fallback: StoredVoicePresetId\): StoredVoicePresetId \{\s*return isStoredVoicePreset\(value\) \? value : fallback;\s*\}/.test(
    configCode,
  ),
);
check(
  "the recovery state is shown on the tab that owns the choice",
  voiceTabCode.includes("PRESET_RECOVERY.title") && voiceTabCode.includes("PRESET_RECOVERY.detail"),
);
check(
  "the recovery state is also shown in the builder header, so it is visible from every tab",
  builderCode.includes("PRESET_RECOVERY.title"),
);
check(
  "the recovery state changes nothing by itself — the draft is written only by an explicit choice",
  (voiceTabCode.match(/\bupdate\(/g) ?? []).length ===
    (voiceTabCode.match(/onChange=\{\(preset\) => update\(/g) ?? []).length &&
    !/useEffect/.test(voiceTabCode),
);
check(
  "estimates are withheld rather than borrowed from a preset the customer never chose",
  voiceTabCode.includes("PRESET_RECOVERY.estimatesUnavailable") &&
    shellCode.includes("PRESET_RECOVERY.estimatesUnavailable"),
);
check(
  "publishing is blocked with the reason named, before an attempt is spent",
  builderCode.includes("PRESET_RECOVERY.publishBlocked") &&
    /isSupportedVoicePreset\(draft\.voiceModel\.preset\) &&/.test(builderCode),
);
check(
  "the recovery copy names the one action that resolves it",
  /Choose one/.test(PRESET_RECOVERY.detail) && /Nothing is changed until you do\./.test(PRESET_RECOVERY.detail),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Publish — one request per activation, and honest outcomes");
// ═══════════════════════════════════════════════════════════════════════════

{
  resetRequests([
    json(200, {
      assistant: {
        id: 12,
        status: "published",
        provider: "vapi",
        providerAssistantId: "asst_local_fake",
        lastSyncedAt: "2026-08-25T10:00:00.000Z",
      },
    }),
  ]);
  const result = await publishAssistant(12);
  eq("one activation issues exactly one request", requests.length, 1);
  eq("that request is a POST", requests[0]!.method, "POST");
  eq("to the documented publish path", requests[0]!.url, "/api/receptionist/voice/assistants/12/publish");
  eq("with no body", requests[0]!.hasBody, false);
  eq("with the session cookie", requests[0]!.credentials, "include");
  eq("and the server-confirmed status is what comes back", result.status, "published");
}

{
  // A second activation is a second, separate request — there is no hidden
  // retry, and no request is issued more than once per call.
  resetRequests([
    json(200, { assistant: { id: 12, status: "published", provider: "vapi", providerAssistantId: "x", lastSyncedAt: null } }),
    json(200, { assistant: { id: 12, status: "published", provider: "vapi", providerAssistantId: "x", lastSyncedAt: null } }),
  ]);
  await publishAssistant(12);
  await publishAssistant(12);
  eq("two activations issue exactly two requests, never more", requests.length, 2);
}

{
  // Duplicate prevention lives in the component, and is a synchronous ref so
  // two clicks in one tick cannot both pass. Asserted as source: driving it
  // needs a React renderer this workspace does not have.
  check(
    "a synchronous single-flight ref guards the confirm handler",
    /const publishInFlightRef = useRef\(false\);/.test(builderCode) &&
      /if \(publishInFlightRef\.current \|\| publishMutation\.isPending\) return;\s*publishInFlightRef\.current = true;/.test(
        builderCode,
      ),
  );
  check(
    "the guard is released only in onSettled, so it spans the whole request",
    /onSettled: \(\) => \{\s*publishInFlightRef\.current = false;\s*\},/.test(builderCode),
  );
  check(
    "the confirm control is also disabled while pending",
    /disabled=\{pending\}/.test(publishDialogSrc) && /if \(pending\) return;/.test(publishDialogSrc),
  );
  check(
    "an in-flight publish is never presented as cancellable by leaving the page",
    /publishMutation\.isPending[\s\S]{0,200}beforeunload/.test(builderCode),
  );
}

{
  // A definitive failure. 422 unsupported_preset is the exact outcome the
  // Custom preset used to produce at the end of the journey.
  resetRequests([
    json(422, {
      error: {
        code: "unsupported_preset",
        message: "This assistant's selected voice preset is not supported for publishing.",
        retryable: false,
      },
    }),
  ]);
  let caught: unknown;
  try {
    await publishAssistant(12);
  } catch (err) {
    caught = err;
  }
  const err = caught as AssistantApiRequestError;
  eq("a definitive failure issues one request and no retry", requests.length, 1);
  check("it surfaces as a typed API error", err instanceof AssistantApiRequestError);
  eq("carrying the machine code", err.code, "unsupported_preset");
  eq("and marked non-retryable", err.retryable, false);
  check(
    "the customer is shown static copy, never the raw code",
    !publishRouteErrorMessage(err.code, err.message).includes("unsupported_preset"),
  );
  check(
    "and that copy names the fix",
    /Choose a different preset/.test(publishRouteErrorMessage(err.code, err.message)),
  );
}

{
  // publish_uncertain — the one outcome that must never invite a retry.
  resetRequests([
    json(502, {
      error: { code: "publish_uncertain", message: "Publishing could not be confirmed.", retryable: false },
    }),
  ]);
  let caught: unknown;
  try {
    await publishAssistant(12);
  } catch (err) {
    caught = err;
  }
  const err = caught as AssistantApiRequestError;
  eq("publish_uncertain issues one request and no retry", requests.length, 1);
  eq("and carries its code", err.code, "publish_uncertain");
  const copy = publishRouteErrorMessage(err.code, err.message);
  check("the copy tells the customer not to publish again", /Do not publish again/.test(copy));
  check("and to contact support", /Contact support/.test(copy));
  check("publish_uncertain is in the uncertain set", UNCERTAIN_ROUTE_ERROR_CODES.has("publish_uncertain"));
  for (const code of ["provider_timeout", "provider_network_error", "provider_result_uncertain", "local_finalize_failed"] as const) {
    check(`${code} is treated as uncertain, never as an ordinary retryable error`, UNCERTAIN_ROUTE_ERROR_CODES.has(code));
    check(`${code} copy tells the customer not to publish again`, /Do not publish again/.test(publishRouteErrorMessage(code, "")));
  }
}

{
  check(
    "the builder shows publish_uncertain as a standing alert, not a transient toast",
    /assistant\.status === "publish_uncertain"[\s\S]{0,400}role="alert"/.test(builderCode),
  );
  check(
    "and announces it to assistive technology",
    /Publishing could not be confirmed\. Do not publish again\./.test(builderCode),
  );
  check(
    "a publish_uncertain assistant cannot be published again from the UI",
    /if \(assistant\.status === "publish_uncertain"\)\s*\n?\s*return "Publishing could not be confirmed/.test(
      builderCode,
    ),
  );
}

{
  // The id guard: a malformed id never reaches the network at all.
  for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
    resetRequests([]);
    let threw = false;
    try {
      await publishAssistant(bad);
    } catch {
      threw = true;
    }
    eq(`a malformed id (${bad}) is rejected before any request`, [threw, requests.length], [true, 0]);
  }
}

{
  eq(
    "every publish route error code has display copy, and none renders as a bare code",
    PUBLISH_ROUTE_ERROR_CODES.filter((c) => {
      const copy = publishRouteErrorMessage(c, "");
      return copy.length === 0 || copy.includes(c);
    }),
    [],
  );
  check(
    "an unrecognised sync error falls back to safe generic copy",
    safeSyncErrorMessage("something_new") === safeSyncErrorMessage(null) &&
      !safeSyncErrorMessage("something_new").includes("something_new"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Browser test — every lifecycle the journey can reach");
// ═══════════════════════════════════════════════════════════════════════════

const START = { provider: "vapi", providerAssistantId: "asst_local_fake" } as const;

async function drive(behavior: Parameters<typeof createFakeBrowserVoiceClientSource>[0]) {
  const source = createFakeBrowserVoiceClientSource(behavior);
  const client = source.create();
  const seen: BrowserVoiceEvent[] = [];
  const unsubscribe = client.subscribe((e) => seen.push(e));
  let startRejected = false;
  try {
    await client.start(START);
  } catch {
    startRejected = true;
  }
  await tick();
  await tick();
  return { source, client, seen, unsubscribe, startRejected };
}

{
  const source = createFakeBrowserVoiceClientSource({ behavior: { kind: "idle" } });
  eq("idle: no client exists until create() is called", source.created.length, 0);
  const client = source.create();
  eq("idle: creating one emits nothing", client.emitted.length, 0);
  eq("idle: and starts nothing", client.wasStarted, false);
}

{
  const { seen, client } = await drive({ behavior: { kind: "connects" } });
  eq("connecting → connected: exactly one call-start", seen.map((e) => e.type), ["call-start"]);
  eq("connecting → connected: the client was started once", client.calls.filter((c) => c === "start").length, 1);
}

{
  const { seen } = await drive({ behavior: { kind: "connectsThenRemoteEnd" } });
  eq("remote hangup: connected then ended, in order", seen.map((e) => e.type), ["call-start", "call-end"]);
}

{
  const { seen } = await drive({ behavior: { kind: "permissionDenied" } });
  eq("permission denial: denied without ever connecting", seen.map((e) => e.type), ["permission-denied"]);
}

{
  const { seen, startRejected } = await drive({ behavior: { kind: "failsToStart" } });
  eq("start failure: start() rejects and nothing is emitted", [startRejected, seen.length], [true, 0]);
}

{
  const { seen } = await drive({ behavior: { kind: "failsBeforeConnect" } });
  eq("provider failure before connect: error only", seen.map((e) => e.type), ["error"]);
}

{
  const { seen } = await drive({ behavior: { kind: "failsAfterConnect" } });
  eq("provider failure after connect: connected then error", seen.map((e) => e.type), ["call-start", "error"]);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const seen: BrowserVoiceEvent[] = [];
  client.subscribe((e) => seen.push(e));
  await client.start(START);
  await tick();
  eq("teardown: a subscriber is live while the call is", client.listenerCount, 1);
  await client.destroy();
  eq("teardown: destroy clears every subscriber", client.listenerCount, 0);
  eq("teardown: destroy is recorded", client.wasDestroyed, true);
  await client.destroy();
  eq("teardown: destroy is idempotent", client.wasDestroyed, true);
  client.emitNow({ type: "call-end" });
  eq("teardown: a destroyed client emits nothing further", seen.map((e) => e.type), ["call-start"]);
  eq("teardown: no timer outlives the test", client.pendingTimers, 0);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const off = client.subscribe(() => undefined);
  off();
  eq("teardown: unsubscribing removes exactly that subscriber", client.listenerCount, 0);
}

check(
  "the hook owns at most one client and destroys it on every terminal path",
  /clientRef\.current = null;/.test(voiceTestHookSrc) &&
    /safelyDestroyClient\(client\)/.test(voiceTestHookSrc) &&
    /useEffect\(\(\) => \(\) => teardownClient\(\), \[teardownClient\]\)/.test(voiceTestHookSrc),
);
check(
  "the hook unsubscribes before dropping the client",
  /unsubscribeRef\.current\?\.\(\);\s*unsubscribeRef\.current = null;/.test(voiceTestHookSrc),
);
check(
  "a start is guarded by a synchronous ref, so one confirm is one client.start()",
  /if \(startGuardRef\.current\) return;\s*startGuardRef\.current = true;/.test(voiceTestHookSrc),
);
check(
  "the builder guards the confirm handler the same way",
  /if \(testInFlightRef\.current \|\| browserTest\.isActive\) return;/.test(builderCode),
);
check(
  "a test is torn down when the firm, assistant or provider identity changes",
  /resetBrowserTestRef\.current\(\);/.test(builderCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("No SDK, no provider, no device — in this journey's own source");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "no Assistants page loads a provider SDK",
  !/@vapi-ai|vapi-web|import\(\s*["'][^"']*vapi/i.test(journeyCode),
);
check(
  "no Assistants page reaches a provider host",
  !/api\.vapi\.ai|vapi\.ai|daily\.co|twilio\.com|googleapis\.com|resend\.com|stripe\.com/i.test(journeyCode),
);
check(
  "no Assistants page requests a microphone or opens a peer connection",
  !/getUserMedia|RTCPeerConnection|new WebSocket|navigator\.mediaDevices/.test(journeyCode),
);
check(
  "no Assistants page calls fetch, XHR or sendBeacon directly",
  !/\bfetch\(|XMLHttpRequest|sendBeacon/.test(journeyCode),
);
check(
  "no Assistants page touches a database or a provider credential",
  !/drizzle|postgres|DATABASE_URL|VAPI_API_KEY|VAPI_WEBHOOK_SECRET/i.test(journeyCode),
);
check(
  "the browser client is still constructed only through the injectable source seam",
  /export interface BrowserVoiceClientSource \{\s*readonly available: boolean;\s*create\(\): BrowserVoiceClient;\s*\}/.test(
    voiceContextSrc,
  ) && /const source = useBrowserVoiceClientSource\(\);/.test(voiceTestHookSrc),
);
check(
  "the dev-only override remains behind import.meta.env.DEV",
  /if \(import\.meta\.env\.DEV && typeof window !== "undefined" && window\.__browserVoiceClientSourceOverride\)/.test(
    voiceContextSrc,
  ),
);
check(
  "the production source still fails closed when either flag is off",
  /if \(!voicePlatformEnabled \|\| !voiceBrowserTestEnabled\) \{\s*return new UnavailableBrowserVoiceClient\(\);/.test(
    voiceContextSrc,
  ),
);
check(
  "no test-only fake is imported by any production Assistants file",
  !/FakeBrowserVoiceClient|createFakeBrowserVoiceClientSource|ScriptedVoiceProvider|FakePublishRepository/.test(
    journeyCode,
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Prohibited claims — absent from the journey's own wording");
// ═══════════════════════════════════════════════════════════════════════════

const BANNED: Array<[string, RegExp]> = [
  ["a live or ready calling claim", /\b(is|are|now) (live|ready to (take|answer|receive))\b|ready to (take|answer|receive) calls/i],
  ["a claim that calls are being answered now", /\b(answers|answering|handles) (every |your |all )?calls?\b/i],
  ["a claim that a number is connected", /number is (connected|assigned|live|active|ready)/i],
  ["an SMS or text-message capability", /\bsend (an? )?(sms|text message)\b|\btexts? (the|your) (caller|customer)\b/i],
  ["an email capability", /\bsends? (an? )?email\b/i],
  ["a webhook claim", /\bwebhook\b/i],
  ["a guarantee", /\bguarantee(d|s)?\b/i],
  ["an unlimited claim", /\bunlimited\b/i],
  ["a production-availability claim", /\b(in|for) production\b|\bproduction[- ]ready\b/i],
  ["a provider-readiness badge", /provider (is )?(ready|connected|online|healthy)/i],
  ["internal checkpoint vocabulary", /\bCheckpoint [A-Z]\d|\bMilestone \d\b|\bAR-001[A-Z]?\b|\bPhase \d+\b/],
  ["a fabricated statistic", /\b\d+% (of )?(calls|callers|customers)\b|\b\d+\+ (calls|businesses)\b/i],
];

for (const [label, pattern] of BANNED) {
  check(`the journey renders no ${label}`, !pattern.test(journeyCode));
}

eq(
  "and none of them is reachable from the contract's whole string surface",
  BANNED.filter(([, p]) => p.test(everyRenderableString().join("\n"))).map(([l]) => l),
  [],
);

check(
  "the template copy describes what a template prefills, not what it achieves",
  (templatesCode.match(/outcome: "Prefills|outcome: "Starts with/g) ?? []).length === 8,
);
check(
  "the retired promises are gone from the template copy",
  !/Keeps the phone answered|never missing a call|calendar fills itself|Answers every call/.test(templatesCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Estimates — kept, and still visibly labelled as estimates");
// ═══════════════════════════════════════════════════════════════════════════

check("the cost figure carries an Estimate chip", stripComments(costSrc).includes(ESTIMATE_CHIP));
check("and a sentence naming its limit", stripComments(costSrc).includes(ESTIMATE_NOTE));
check("the latency figure carries a Guidance chip", stripComments(latencySrc).includes(GUIDANCE_CHIP));
check("and a sentence naming its limit", stripComments(latencySrc).includes(GUIDANCE_NOTE));
check(
  "the latency note denies being a measurement of this assistant",
  /not a measurement of this assistant's live performance/.test(GUIDANCE_NOTE),
);
check(
  "the preset cards mark their figures as estimates too",
  /Est\. \$/.test(presetSelectorCode) && /~\{preset\.latencyMs\} ms/.test(presetSelectorCode),
);
check(
  "every presented cost is a planning range, never a single settled price",
  VOICE_MODEL_PRESETS.every((p) => p.costRangeHigh > p.costRangeLow),
);
check(
  "the estimates module still says every number in it is a planning estimate",
  /planning estimate, not measured or\s*\*? ?fetched data/.test(estimatesSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("AR-001G — the artifact policy is untouched and still enforced");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the policy is read from the server environment only",
  /VOICE_ARTIFACT_POLICY_ENV_VAR = "VOICE_ARTIFACT_POLICY"/.test(artifactPolicySrc),
);
check(
  "an unset policy throws rather than defaulting",
  /throw notConfigured\(`\$\{VOICE_ARTIFACT_POLICY_ENV_VAR\} is not set\.`\)/.test(artifactPolicySrc),
);
check(
  "an invalid policy throws rather than resolving to something permissive",
  /must be one of: \$\{VOICE_ARTIFACT_POLICIES\.join\(", "\)\}/.test(artifactPolicySrc),
);
check(
  "the policy is validated before the row is claimed and before any provider request",
  publishServiceSrc.indexOf("deps.loadArtifactPolicy()") <
    publishServiceSrc.indexOf("deps.repository.claimForPublish") &&
    publishServiceSrc.indexOf("deps.loadArtifactPolicy()") <
      publishServiceSrc.indexOf("deps.createProvider()"),
);
check(
  "a missing or invalid policy fails the publish",
  /deps\.loadArtifactPolicy\(\);\s*\} catch \{\s*return failure\("publish_disabled"\);/.test(publishServiceSrc),
);
check(
  "the policy is never accepted from a request body or a persisted config",
  !/artifactPolicy/i.test(read("artifacts/api-server/src/lib/voicePublishing/persistedConfigMapper.ts")),
);
check(
  "no Assistants frontend file can influence the artifact policy",
  !/VOICE_ARTIFACT_POLICY|artifactPlan|artifactPolicy/i.test(journeyCode),
);
check(
  "AR-001I changed no api-server publish or policy source",
  /loadArtifactPolicy: loadVoiceArtifactPolicyFromEnv,/.test(publishServiceSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("AR-001E — cleanup behaviour is unchanged");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "a 404 is still classified as uncertain, never as proof of absence",
  /NOT_FOUND/.test(cleanupServiceSrc) && /status: "uncertain"/.test(cleanupServiceSrc),
);
check(
  'the removed "already_absent" success shape has not come back',
  !/already_absent/.test(cleanupServiceSrc.replace(/\/\*[\s\S]*?\*\//g, "")),
);
check(
  "VALIDATION_FAILED is still a distinct definitive rejection",
  /VALIDATION_FAILED/.test(cleanupServiceSrc),
);
check(
  "cleanup still runs only for eligible statuses",
  /CLEANUP_ELIGIBLE_STATUSES: readonly string\[\] = \["published", "publish_uncertain"\]/.test(cleanupServiceSrc),
);
check(
  "no Assistants frontend file can reach the cleanup path",
  !/cleanupStagingAssistant|cleanupService|CLEANUP_ELIGIBLE/.test(journeyCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Registration — this file runs in the standard aggregate command");
// ═══════════════════════════════════════════════════════════════════════════

{
  const testScript = JSON.parse(scriptsPkgSrc).scripts.test as string;
  const mine = "tsx ../artifacts/helpdesk/src/pages/assistants/assistantsContract.test.ts";
  eq("this test is registered exactly once", testScript.split(mine).length - 1, 1);
  check("and chained with && so a failure stops the run", testScript.includes(`${mine} &&`) || testScript.endsWith(mine));
  check(
    "every previously registered contract test is still registered",
    [
      "signup/signupContract.test.ts",
      "login/loginContract.test.ts",
      "overview/overviewContract.test.ts",
      "conversations/conversationsContract.test.ts",
      "receptionist/receptionistContract.test.ts",
      "contacts/contactsContract.test.ts",
      "settings/settingsContract.test.ts",
      "billing/billingContract.test.ts",
      "appointments/appointmentsContract.test.ts",
      "call-logs/callLogsContract.test.ts",
      "browserVoice/browserVoiceContract.test.ts",
    ].every((t) => testScript.includes(t)),
  );
  check(
    "AR-001I added no dependency to the scripts package",
    JSON.stringify(JSON.parse(scriptsPkgSrc).devDependencies) ===
      JSON.stringify({ "@types/node": "catalog:", tsx: "catalog:" }) &&
      JSON.parse(scriptsPkgSrc).dependencies === undefined,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Built output — the corrections survive the bundler");
// ═══════════════════════════════════════════════════════════════════════════

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
if (!existsSync(distDir)) {
  console.log("  SKIP  no built output present (run a production build to include these)");
} else {
  const files = readdirSync(distDir);
  const chunkFor = (name: string) => files.filter((f) => new RegExp(`^${name}-.*\\.js$`).test(f));
  const listChunks = chunkFor("Assistants");
  const createChunks = chunkFor("AssistantCreate");
  const builderChunks = chunkFor("AssistantBuilder");
  const builderNewChunks = chunkFor("AssistantBuilderNew");

  const everyEmittedJs = files
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(path.join(distDir, f), "utf8"))
    .join("\n");

  /**
   * Which build produced these assets — never read from the presence of the
   * chunks under test, which would make the assertion circular.
   *
   * The AR-001J correction folds every voice flag to a literal, so the parser
   * call this used to read out of the entry chunk is, by design, no longer
   * there in a canonically-flagged build. The variant is therefore declared
   * by whoever produced the build, under the same variable name it was built
   * with and read through the same truth table. An undeclared run still falls
   * back to the old echo — a non-canonical spelling keeps the parser in the
   * bundle — and reports indeterminate rather than guessing.
   */
  const buildVariant = ((): "default-gated" | "voice-enabled" | "indeterminate" => {
    const raw = ((): string | undefined | null => {
      if (process.env.AR001J_DECLARED === "1") {
        return process.env.AR001J_VITE_VOICE_PLATFORM_ENABLED;
      }
      const entryChunks = readdirSync(distDir).filter((f) => /^index-.*\.js$/.test(f));
      if (entryChunks.length !== 1) return null;
      const entrySrc = readFileSync(path.join(distDir, entryChunks[0]!), "utf8");
      const parser = /function (\w+)\(\w+\)\{[^{}]*trim\(\)\.toLowerCase\(\)==="true"\}/.exec(
        entrySrc,
      );
      if (parser === null) return null;
      return new RegExp(`${parser[1]}\\("([^"]*)"\\)`).exec(entrySrc)?.[1] ?? null;
    })();

    if (raw === null) return "indeterminate";
    // AR-001J final refinement: `vite.config.ts` canonicalises the flag before
    // Vite resolves its environment, so the chunks follow `parseBooleanFlag`
    // exactly. A spelling the parser rejects — `"1"`, `"yes"` — no longer
    // leaves the gated chunks emitted-but-unroutable; it removes them, like
    // any other false value. One rule, and — as of the owner review — it is
    // literally the parser's, called rather than restated.
    return parseBooleanFlag(raw) ? "voice-enabled" : "default-gated";
  })();

  /**
   * AR-001J. The Assistants chunks used to be emitted by every build, gated or
   * not, because `App.tsx` imported the pages unconditionally. They now exist
   * only in a build that registers their routes, so the expectation below is
   * per-variant rather than one rule for both.
   *
   * The whole-bundle absence checks for the default-gated variant — no retired
   * wording, no credential, no test-only fake — live in
   * `src/routes/voiceBoundaryContract.test.ts`, which asserts them over the
   * entire default bundle rather than around these chunks.
   */
  if (buildVariant === "default-gated") {
    eq("AR-001J — a default-gated build emits no Assistants list chunk", listChunks.length, 0);
    eq("AR-001J — a default-gated build emits no template-picker chunk", createChunks.length, 0);
    eq("AR-001J — a default-gated build emits no persisted-builder chunk", builderChunks.length, 0);
    eq("AR-001J — a default-gated build emits no unsaved-builder chunk", builderNewChunks.length, 0);
    check(
      "AR-001J — a default-gated build emits no provider SDK chunk",
      !files.some((f) => /^vapi-.*\.js$/.test(f)) && !everyEmittedJs.includes("api.vapi.ai"),
    );
    eq(
      "correction B — a default-gated build emits no unsaved-changes sentence at all",
      [SAVE_PROMPT_PUBLISH, SAVE_PROMPT_TEST, SAVE_PROMPT_EITHER].filter((s) =>
        everyEmittedJs.includes(s),
      ),
      [],
    );
  } else if (buildVariant === "indeterminate") {
    console.log("  SKIP  the build variant could not be read from the entry chunk");
  } else {
    check("exactly one Assistants list chunk is emitted", listChunks.length === 1);
    check("exactly one template-picker chunk is emitted", createChunks.length === 1);
    check("exactly one persisted-builder chunk is emitted", builderChunks.length === 1);
    check("exactly one unsaved-builder chunk is emitted", builderNewChunks.length === 1);

    /**
     * Follow each route's static import graph rather than globbing one file.
     * `assistantsContract.ts` has many importers, so Vite hoists it into a
     * shared chunk and a chunk-scoped assertion would silently stop finding
     * its strings. Required strings are looked for *including* the shared
     * entry, because the entry is genuinely shipped to the route; banned
     * strings are looked for *excluding* it, because the entry carries
     * unrelated code from every other route.
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
    const entries = [listChunks[0]!, createChunks[0]!, builderChunks[0]!, builderNewChunks[0]!];
    const built = join(entries.flatMap((e) => graph(e, true)));
    const routeOnly = join(entries.flatMap((e) => graph(e, false)));

    check("the corrected list wording reaches the built output", built.includes(LIST.detail));
    check("the Open control reaches the built output", built.includes(LIST.open));
    check("the recovery state reaches the built output", built.includes(PRESET_RECOVERY.title));
    check("the provider-link wording reaches the built output", built.includes(BUILDER.linkedNote));
    check("the template-picker wording reaches the built output", built.includes(CREATE.title));
    check("the Voice & Model wording reaches the built output", built.includes(VOICE_MODEL.detail));

    eq(
      "no prohibited claim survives into the built Assistants routes",
      BANNED.filter(([, p]) => p.test(routeOnly)).map(([l]) => l),
      [],
    );
    eq(
      "no phone-number readiness claim survives into the built Assistants routes",
      PHONE_READINESS.filter((p) => p.test(routeOnly)).map(String),
      [],
    );
    check(
      "no phone-number literal survives into the built Assistants routes",
      !PHONE_NUMBER_SHAPES.test(routeOnly),
    );
    check(
      'the retired "Custom" preset is absent from the built preset catalog',
      !routeOnly.includes("Configure each layer yourself") && !/["']Custom["']/.test(routeOnly),
    );
    check(
      "the removed phone-number string is absent from every emitted file",
      !everyEmittedJs.includes("Available after Phone Numbers setup"),
    );
    check(
      "the removed row-action labels are absent from every emitted file",
      !everyEmittedJs.includes("Open assistant to test") &&
        !everyEmittedJs.includes("Open assistant to publish"),
    );
    check(
      "the retired template promises are absent from every emitted file",
      !everyEmittedJs.includes("Keeps the phone answered after your team clocks out.") &&
        !everyEmittedJs.includes("Answers every call, greets callers, and routes them to the right outcome."),
    );

    check(
      "the built Assistants routes reach only the assistants path",
      (routeOnly.match(/receptionist\/voice\/[a-z-]+/g) ?? []).every((m) => m === "receptionist/voice/assistants"),
    );
    check(
      "the built routes contact no provider host and load no provider SDK",
      !/api\.vapi\.ai|daily\.co|twilio\.com|googleapis\.com/i.test(routeOnly),
    );
    check(
      "no private provider credential is present in any emitted chunk",
      !/VAPI_API_KEY|VAPI_WEBHOOK_SECRET|GOOGLE_CLIENT_SECRET|client_secret|refresh_token/i.test(everyEmittedJs),
    );
    check(
      "no test-only fake reaches any emitted chunk",
      !everyEmittedJs.includes("FakeBrowserVoiceClient") &&
        !everyEmittedJs.includes("createFakeBrowserVoiceClientSource") &&
        !everyEmittedJs.includes("ScriptedVoiceProvider") &&
        !everyEmittedJs.includes("FakePublishRepository"),
    );
    check(
      "no AR-001I tripwire helper reaches any emitted chunk",
      !everyEmittedJs.includes("AR-001I tripwire"),
    );
    check(
      "the dev-only client override is absent from production output",
      !everyEmittedJs.includes("__browserVoiceClientSourceOverride"),
    );
    check("no VOICE_PROVIDER branch reaches the bundle", !everyEmittedJs.includes("VOICE_PROVIDER"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
section("Tripwires — nothing left this process");
// ═══════════════════════════════════════════════════════════════════════════

check("navigator.mediaDevices was never present in this runtime", mediaDevicesPresent === false);
for (const [name, count] of Object.entries(trips)) {
  eq(`${name} was never invoked`, count, 0);
}
check(
  "every request this file made was a same-origin /api path",
  requests.every((r) => r.url.startsWith("/api/receptionist/voice/assistants")),
);

// ─── Honest limitations ────────────────────────────────────────────────────
//
// Stated, not hidden:
//
//  • The React components are asserted as source. Rendering them needs a DOM
//    renderer this workspace does not have, and AR-001I authorises no new
//    dependency. So "the Open button is labelled Open {name}" is proven from
//    the contract function plus the JSX that calls it, not from a rendered
//    tree. The local QA pass covers the rendered form.
//  • `useBrowserVoiceTest`'s event-to-state mapping is likewise source-
//    asserted. The client contract beneath it is executed in full.
//  • The single-flight publish guard is source-asserted for the same reason.
//    What is executed is the layer below it: `publishAssistant()` issues
//    exactly one request per call and never retries.
//  • Nothing here observes real provider behaviour. Every publish outcome is
//    a locally constructed Response. Real Vapi behaviour remains unverified,
//    exactly as ACTIVE.md records.

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All AR-001I assistants contract tests passed.");
