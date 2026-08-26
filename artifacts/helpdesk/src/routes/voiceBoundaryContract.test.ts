/**
 * AR-001J — committed contract test for the voice-platform **build** boundary.
 *
 * Run via: tsx artifacts/helpdesk/src/routes/voiceBoundaryContract.test.ts
 *
 * Same arrangement as Phases 5–14 and AR-001I: the file lives beside the module
 * it tests, `tsx` is the runner, and helpdesk's tsconfig excludes `*.test.ts`
 * by glob so nothing here is type-built into the app or bundled by Vite.
 *
 * What it is for. Three different properties were being conflated, and only the
 * first two held before AR-001J:
 *
 *   1. runtime unreachability   — no route is registered, so no voice page
 *                                 component is ever rendered;
 *   2. network non-fetching     — nothing links to a voice page, so no gated
 *                                 chunk is ever requested;
 *   3. build-time non-emission  — the gated chunk does not exist at all.
 *
 * (3) failed because `App.tsx` declared `lazy(() => import("@/pages/X"))` for
 * every page at module scope. `import()` is a bundler instruction: Rollup emits
 * a chunk for each one it can reach, whether or not the code around it can run.
 * `voicePlatformEnabled` could not prevent that — it was
 * `parseBooleanFlag(import.meta.env.…)`, a function call no bundler can fold —
 * so the gate was only ever a runtime one. A default-gated build therefore
 * shipped and served every voice chunk, the Vapi browser SDK included.
 *
 * ── The owner-review correction ───────────────────────────────────────────
 *
 * AR-001J closed (3) for the page chunks and left three defects behind. This
 * file now covers those too, and each of its new sections fails against the
 * uncorrected build:
 *
 *   A. **Two readings of one flag.** The build boundary compared the raw
 *      variable to `"true"` while navigation and route registration used
 *      `parseBooleanFlag`, which also accepts `"TRUE"` and `" true "`. A build
 *      set to either spelling showed the voice navigation while every voice
 *      destination resolved to Not Found. There is now one interpretation —
 *      the constants in `lib/featureFlags.ts` — and no other client module
 *      parses a voice variable at all.
 *   B. **The gated navigation catalogue was emitted regardless.** All fifteen
 *      `voiceGated: true` records — labels, descriptions, hrefs, icons —
 *      shipped in the entry chunk of every default build. They are now
 *      selected in by the same folded flag, so a default build contains none
 *      of them, and a voice-enabled build contains all fifteen unchanged.
 *   C. **The provider browser SDK was emitted with browser testing off.** The
 *      Vapi client source was constructed unconditionally at module scope, so
 *      `vapi/factory` and its `import("@vapi-ai/web")` stayed in the graph.
 *      A platform-enabled build with `VITE_VOICE_BROWSER_TEST_ENABLED=false`
 *      now emits no SDK chunk at all.
 *
 * It never performs a network request, never signs in, never creates a session,
 * never contacts Vapi, Twilio, Stripe, Google or any other provider, never
 * loads a provider SDK, and never touches a database.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NAV_GROUPS, VOICE_NAV, navGroupsWith } from "../lib/nav.js";
import { visibleNavDestinations, visibleNavGroups } from "../components/layout/dashboardNav.js";
import {
  parseBooleanFlag,
  voicePlatformEnabled,
  voicePublishEnabled,
  voiceBrowserTestEnabled,
} from "../lib/featureFlags.js";
import { LIST as ASSISTANTS_LIST } from "../pages/assistants/assistantsContract.js";
import { PAGE as CALL_LOGS_PAGE } from "../pages/call-logs/callLogsContract.js";
import { PAGE as APPOINTMENTS_PAGE } from "../pages/appointments/appointmentsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/routes → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const appSrc = read("artifacts/helpdesk/src/App.tsx");
const boundarySrc = read("artifacts/helpdesk/src/routes/voiceRoutes.ts");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const dashboardNavSrc = read("artifacts/helpdesk/src/components/layout/dashboardNav.ts");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const voiceContextSrc = read("artifacts/helpdesk/src/lib/browserVoice/context.tsx");
const vapiFactorySrc = read("artifacts/helpdesk/src/lib/browserVoice/vapi/factory.ts");
const shellSrc = read("artifacts/helpdesk/src/components/layout/AppShell.tsx");
const scriptsPkgSrc = read("scripts/package.json");
const assistantsTestSrc = read("artifacts/helpdesk/src/pages/assistants/assistantsContract.test.ts");
const appointmentsTestSrc = read(
  "artifacts/helpdesk/src/pages/appointments/appointmentsContract.test.ts",
);
const callLogsTestSrc = read("artifacts/helpdesk/src/pages/call-logs/callLogsContract.test.ts");

/**
 * Source with comments stripped. Both `App.tsx` and the boundary explain the
 * defect at length, quoting the old `lazy(() => import("@/pages/Assistants"))`
 * form, so a prose mention must never be mistaken for the code still being
 * there.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const appCode = stripComments(appSrc);
const boundaryCode = stripComments(boundarySrc);
const navCode = stripComments(navSrc);
const voiceContextCode = stripComments(voiceContextSrc);

/**
 * The complete navigation architecture, voice records included.
 *
 * Correction B makes `NAV_GROUPS` build-selected: outside a bundler every flag
 * takes its documented default of false, so the ambient catalogue here is the
 * default-gated one. Composing the enabled catalogue from the same single
 * source — rather than writing a second copy of it down — is what lets this
 * file assert both states without a duplicate catalogue existing anywhere.
 */
const ALL_NAV_GROUPS = navGroupsWith(VOICE_NAV);

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
section("The gated set — derived from the contracts, never assumed");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deliberately read out of the catalogue rather than written down here. The
 * gated set is not "Assistants": it is every `voiceGated: true` item, and the
 * three live ones among them are only part of it.
 */
const gatedNavItems = ALL_NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.voiceGated);

eq(
  "every voice-gated navigation item, in approved order",
  gatedNavItems.map((i) => i.key),
  [
    "assistants",
    "tools",
    "phone-numbers",
    "voice-library",
    "knowledge",
    "squads",
    "appointments",
    "outbound",
    "logs",
    "analytics",
    "testing",
    "structured-outputs",
    "issues",
    "integrations",
    "api-keys",
  ],
);

eq(
  "the live voice-gated destinations are exactly Assistants, Appointments and Call Logs",
  gatedNavItems.filter((i) => i.state === "live").map((i) => i.href),
  ["/assistants", "/appointments", "/logs"],
);

eq(
  "the placeholder voice destinations that still take a route",
  gatedNavItems
    .filter((i) => (i.state === "comingSoon" || i.state === "advanced") && i.href)
    .map((i) => i.href),
  [
    "/tools",
    "/phone-numbers",
    "/voice-library",
    "/knowledge",
    "/analytics",
    "/testing",
    "/structured-outputs",
    "/integrations",
    "/settings/api-keys",
  ],
);

check(
  "every placeholder route in App.tsx is voice-gated, so none can leak into a default build",
  ALL_NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => (i.state === "comingSoon" || i.state === "advanced") && i.href)
    .every((i) => i.voiceGated),
);

/** The seven page routes the flag governs, and the modules behind them. */
const GATED_ROUTE_KEYS = [
  "assistants",
  "assistantNew",
  "assistantNewTab",
  "assistantDetail",
  "logs",
  "logDetail",
  "appointments",
] as const;

const GATED_PAGE_MODULES = [
  "Assistants",
  "AssistantCreate",
  "AssistantBuilderNew",
  "AssistantBuilder",
  "CallLogs",
  "CallLogDetail",
  "Appointments",
] as const;

eq(
  "the gated route paths in lib/routes.ts are unchanged",
  GATED_ROUTE_KEYS.map((k) => new RegExp(`${k}: "([^"]+)"`).exec(routesSrc)?.[1] ?? null),
  [
    "/assistants",
    "/assistants/new",
    "/assistants/new/:tab",
    "/assistants/:id/:tab?",
    "/logs",
    "/logs/:id",
    "/appointments",
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
section("Correction A — the flag truth table, pinned exhaustively");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The whole accepted-true set and a representative sweep of everything else,
 * run against the real exported parser rather than matched in its source. The
 * point of the correction is that this table is the *only* interpretation in
 * the client, so it is asserted first and everything else is checked against
 * it.
 */
const TRUE_SPELLINGS: string[] = [
  "true",
  "TRUE",
  "True",
  "tRuE",
  " true",
  "true ",
  " true ",
  "\ttrue\t",
  "\ntrue\n",
  "\r\ntrue\r\n",
  "  \t TRUE \n ",
];

const FALSE_SPELLINGS: string[] = [
  "false",
  "FALSE",
  "False",
  " false ",
  "",
  " ",
  "\t",
  "0",
  "1",
  "yes",
  "no",
  "on",
  "off",
  "y",
  "n",
  "truthy",
  "true1",
  "1true",
  "tru e",
  "t rue",
  "truE ish",
  "null",
  "undefined",
  "TRUE=1",
];

const NON_STRINGS: unknown[] = [undefined, null, true, false, 0, 1, {}, [], () => true, NaN];

eq(
  "every whitespace and case spelling of the word is true",
  TRUE_SPELLINGS.filter((v) => !parseBooleanFlag(v)),
  [],
);

eq(
  "every other string is false — the parser accepts no 1, yes or on",
  FALSE_SPELLINGS.filter((v) => parseBooleanFlag(v)),
  [],
);

eq(
  "every non-string is false, including the boolean true",
  NON_STRINGS.filter((v) => parseBooleanFlag(v)).length,
  0,
);

check(
  "the parser is still trim-then-lowercase equality, and nothing more",
  /if \(typeof value !== "string"\) return false;/.test(flagsSrc) &&
    /return value\.trim\(\)\.toLowerCase\(\) === "true";/.test(flagsSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Correction A — one interpretation, shared by every gate");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "featureFlags.ts reads exactly the three documented variables, and no fourth",
  [...new Set(flagsSrc.match(/VITE_[A-Z_]+/g) ?? [])],
  ["VITE_VOICE_PLATFORM_ENABLED", "VITE_VOICE_PUBLISH_ENABLED", "VITE_VOICE_BROWSER_TEST_ENABLED"],
);

/**
 * The shape that makes one expression serve both the runtime gate and the
 * build boundary: the two statically decidable answers are literal
 * comparisons Vite substitutes and Rollup folds, and every other value falls
 * through to the parser above, unchanged. Asserted per flag so a later edit
 * cannot quietly drop one back to a bare comparison — which is exactly the
 * narrowing this correction exists to prevent.
 */
const FLAG_SHAPE: [string, string][] = [
  ["voicePlatformEnabled", "VITE_VOICE_PLATFORM_ENABLED"],
  ["voicePublishEnabled", "VITE_VOICE_PUBLISH_ENABLED"],
  ["voiceBrowserTestEnabled", "VITE_VOICE_BROWSER_TEST_ENABLED"],
];

eq(
  "each flag folds the decidable cases and defers every other spelling to the parser",
  FLAG_SHAPE.filter(
    ([name, variable]) =>
      !new RegExp(
        `${name}: boolean = NO_BUILD_ENV\\s*\\?\\s*false\\s*:\\s*` +
          `import\\.meta\\.env\\.${variable} === "true"\\s*\\?\\s*true\\s*:[\\s\\S]{0,400}` +
          `parseBooleanFlag\\(import\\.meta\\.env\\.${variable}\\)`,
      ).test(flagsSrc),
  ).map(([name]) => name),
  [],
);

eq(
  "and each still folds to false for the unset, empty and explicit-false forms",
  FLAG_SHAPE.filter(
    ([, variable]) =>
      !new RegExp(
        `import\\.meta\\.env\\.${variable} === "false" \\|\\|\\s*` +
          `import\\.meta\\.env\\.${variable} === "" \\|\\|\\s*` +
          `import\\.meta\\.env\\.${variable} === undefined`,
      ).test(flagsSrc),
  ).map(([, variable]) => variable),
  [],
);

check(
  "outside a bundler every flag takes its documented default of false",
  voicePlatformEnabled === false &&
    voicePublishEnabled === false &&
    voiceBrowserTestEnabled === false,
);

/**
 * The heart of correction A. Before it, `routes/voiceRoutes.ts` parsed the
 * platform variable a second time and disagreed with this file about what it
 * meant. Now no client module outside `featureFlags.ts` names a voice
 * variable at all, so there is nothing left that could disagree.
 */
{
  const srcRoot = path.join(repoRoot, "artifacts/helpdesk/src");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
    });

  const readers = walk(srcRoot)
    .filter((f) => /VITE_VOICE_[A-Z_]+/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => path.relative(srcRoot, f).replace(/\\/g, "/"));

  eq(
    "exactly one client module reads a VITE_VOICE_ variable, and it is the flag helper",
    readers,
    ["lib/featureFlags.ts"],
  );
}

eq(
  "every gate reads the shared constants — navigation, routes, imports, publish, browser test",
  [
    ["lib/nav.ts", /import \{ voicePlatformEnabled \} from "\.\/featureFlags\.js";/.test(navSrc)],
    [
      "routes/voiceRoutes.ts",
      /import \{ voicePlatformEnabled \} from "@\/lib\/featureFlags";/.test(boundarySrc),
    ],
    ["App.tsx", /import \{ voicePlatformEnabled \} from "@\/lib\/featureFlags";/.test(appSrc)],
    [
      "components/layout/AppShell.tsx",
      /import \{ voicePlatformEnabled \} from "@\/lib\/featureFlags";/.test(shellSrc),
    ],
    [
      "lib/browserVoice/context.tsx",
      /import \{ voicePlatformEnabled, voiceBrowserTestEnabled \} from "@\/lib\/featureFlags";/.test(
        voiceContextSrc,
      ),
    ],
  ]
    .filter(([, ok]) => !ok)
    .map(([name]) => name),
  [],
);

/**
 * The split state itself, stated as the invariant it violated: whatever
 * decides that a gated navigation item is visible must be the same value that
 * decides its destination resolves. One shared constant makes that true by
 * construction; these assertions are what stop a future edit from
 * reintroducing a second reading on either side.
 */
check(
  "the navigation catalogue is selected by the shared flag, not by a parser of its own",
  /navGroupsWith\(\s*voicePlatformEnabled \? VOICE_NAV : NO_VOICE_NAV,?\s*\)/.test(navCode) &&
    !/parseBooleanFlag/.test(navCode),
);

check(
  "the page import boundary is selected by the same shared flag",
  /voiceRoutePages: VoiceRoutePages = voicePlatformEnabled\s*\?/.test(boundaryCode) &&
    !/parseBooleanFlag/.test(boundaryCode),
);

check(
  "route registration is selected by the same shared flag",
  appCode.includes("{voicePlatformEnabled && (") &&
    appCode.includes("const comingSoonRoutes = voicePlatformEnabled"),
);

check(
  "no navigation-visible, route-not-found state is expressible from the source",
  visibleNavDestinations(true, ALL_NAV_GROUPS)
    .filter((href) => gatedNavItems.some((i) => i.href === href))
    .every((href) =>
      GATED_ROUTE_KEYS.some((k) => new RegExp(`${k}: "${href}"`).test(routesSrc)),
    ),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Navigation filtering — unchanged, and executed for both flag values");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the selection rule itself is untouched",
  /item\.state === "live" && \(!item\.voiceGated \|\| voiceEnabled\) && Boolean\(item\.href\)/.test(
    dashboardNavSrc,
  ),
);

eq(
  "with the flag off the shell links to no voice destination",
  visibleNavDestinations(false, ALL_NAV_GROUPS),
  ["/", "/conversations", "/receptionist", "/contacts", "/billing", "/settings"],
);

eq(
  "with the flag on the complete gated set appears, in its approved order",
  visibleNavDestinations(true, ALL_NAV_GROUPS),
  [
    "/",
    "/assistants",
    "/appointments",
    "/conversations",
    "/receptionist",
    "/contacts",
    "/logs",
    "/billing",
    "/settings",
  ],
);

eq(
  "group order and headings are the same either way, minus the emptied groups",
  visibleNavGroups(true, ALL_NAV_GROUPS).map((g) => g.key),
  ["overview", "build", "operate", "observe", "manage"],
);

eq(
  "with the flag off the Build group disappears entirely rather than rendering empty",
  visibleNavGroups(false, ALL_NAV_GROUPS).map((g) => g.key),
  ["overview", "operate", "manage"],
);

/**
 * A default-gated *build* must reach the same rendered navigation as a
 * default-gated *runtime* did before the correction — the records are gone
 * rather than filtered, and the visible result is identical.
 */
eq(
  "the ambient default-gated catalogue renders exactly the ungated destinations",
  visibleNavDestinations(false),
  visibleNavDestinations(false, ALL_NAV_GROUPS),
);

/**
 * The correction stated as data rather than as bundle bytes: with the flag
 * off, the gated records are not filtered out of the catalogue — they are not
 * in it. This is what makes their absence from the emitted output possible at
 * all, and it fails against the uncorrected `lib/nav.ts`, where `NAV_GROUPS`
 * held all fifteen unconditionally.
 */
eq(
  "the default-gated catalogue contains no voice-gated record at all",
  NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.voiceGated).map((i) => i.key),
  [],
);

eq(
  "and it keeps every ungated record, in the same groups and order",
  NAV_GROUPS.map((g) => [g.key, g.items.map((i) => i.key)]),
  [
    ["overview", ["overview"]],
    ["build", []],
    ["operate", ["conversations", "receptionist", "contacts"]],
    ["observe", []],
    ["manage", ["billing", "settings"]],
  ],
);

check(
  "no navigation label, description or icon was changed by AR-001J",
  navSrc.includes('description: "Build and manage AI voice assistants for your business."') &&
    navSrc.includes('description: "Review stored call records and analysis."') &&
    navSrc.includes(
      'description: "Visual booking calendar, requests, and availability rules. Development preview — no real calendar is connected yet."',
    ),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Correction B — the catalogue is one copy, gated in or out whole");
// ═══════════════════════════════════════════════════════════════════════════

/** Every field of every gated record, exactly as the approved architecture has it. */
const GATED_RECORDS: [string, string, string | null, string, boolean, string | null, string | null][] =
  [
    ["build", "assistants", "/assistants", "live", true, "Assistants", "Build and manage AI voice assistants for your business."],
    ["build", "tools", "/tools", "comingSoon", true, "Tools", "Assign actions your assistant can take during a call, like booking or transferring."],
    ["build", "phone-numbers", "/phone-numbers", "comingSoon", true, "Phone Numbers", "Get a SiteMint number or connect one you already own."],
    ["build", "voice-library", "/voice-library", "comingSoon", true, "Voice Library", "Browse and preview voices for your assistant."],
    ["build", "knowledge", "/knowledge", "comingSoon", true, "Knowledge Base", "Give your assistant reference material to draw on during calls."],
    ["build", "squads", null, "later", true, "Squads", null],
    ["operate", "appointments", "/appointments", "live", true, "Appointments", "Visual booking calendar, requests, and availability rules. Development preview — no real calendar is connected yet."],
    ["operate", "outbound", null, "later", true, "Outbound", null],
    ["observe", "logs", "/logs", "live", true, "Call Logs", "Review stored call records and analysis."],
    ["observe", "analytics", "/analytics", "comingSoon", true, "Analytics", "Business metrics — calls answered, appointments booked, hours saved."],
    ["observe", "testing", "/testing", "comingSoon", true, "Testing", "Test your assistant with a browser call or a text conversation."],
    ["observe", "structured-outputs", "/structured-outputs", "comingSoon", true, "Structured Outputs", "Data your assistant extracts and structures from each call."],
    ["observe", "issues", null, "later", true, "Issues", null],
    ["manage", "integrations", "/integrations", "comingSoon", true, "Integrations", "Connect Google Calendar, Google Sheets, and other accounts."],
    ["manage", "api-keys", "/settings/api-keys", "advanced", true, "API Keys", "Manage API credentials for advanced integrations."],
  ];

eq(
  "the voice-enabled catalogue is value-identical to the approved one, field by field",
  ALL_NAV_GROUPS.flatMap((g) => g.items.map((i) => [g.key, i] as const))
    .filter(([, i]) => i.voiceGated)
    .map(([group, i]) => [
      group,
      i.key,
      i.href ?? null,
      i.state,
      i.voiceGated,
      i.label,
      i.description ?? null,
    ]),
  GATED_RECORDS,
);

eq(
  "the placeholder and availability classification is unchanged",
  gatedNavItems.filter((i) => i.availability !== undefined).map((i) => [i.key, i.availability]),
  [
    ["tools", "Arriving in a later milestone"],
    ["phone-numbers", "Arriving in a later milestone"],
    ["voice-library", "Arriving in a later milestone"],
    ["knowledge", "Arriving in a later milestone"],
    ["analytics", "Arriving in a later milestone"],
    ["testing", "Arriving in a later milestone"],
    ["structured-outputs", "Arriving in a later milestone"],
    ["integrations", "Arriving in a later milestone"],
    ["api-keys", "Arriving in a later milestone"],
  ],
);

eq(
  "the route-less records keep their behaviour — visibly disabled, never linked",
  gatedNavItems.filter((i) => !i.href).map((i) => [i.key, i.state]),
  [
    ["squads", "later"],
    ["outbound", "later"],
    ["issues", "later"],
  ],
);

eq(
  "the ungated architecture is untouched, in its own order",
  ALL_NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => !i.voiceGated)
    .map((i) => i.key),
  ["overview", "conversations", "receptionist", "contacts", "billing", "settings"],
);

check(
  "there is exactly one catalogue — the ungated records are written once",
  ["conversations", "receptionist", "contacts", "billing", "settings"].every(
    (k) => navSrc.split(`key: "${k}"`).length - 1 === 1,
  ) && gatedNavItems.every((i) => navSrc.split(`key: "${i.key}"`).length - 1 === 1),
);

check(
  "the catalogue is composed synchronously — no dynamic import can delay the shell",
  !/import\s*\(/.test(navCode) && !/await|Promise|useState|useEffect/.test(navCode),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Correction C — the browser SDK is built in only where usable");
// ═══════════════════════════════════════════════════════════════════════════

check(
  "the Vapi client source is constructed behind the two flags, not at module scope",
  /const browserTestInBuild = voicePlatformEnabled && voiceBrowserTestEnabled;/.test(
    voiceContextCode,
  ) &&
    /browserTestInBuild\s*\?\s*createProductionBrowserVoiceClientSource\(\)\s*:\s*unavailableSource/.test(
      voiceContextCode,
    ),
);

check(
  "and the unconditional module-scope construction is gone",
  !/^const vapiSource = createProductionBrowserVoiceClientSource\(\);$/m.test(voiceContextCode),
);

check(
  "the fail-closed runtime behaviour is unchanged — this is a build gate, not a substitute",
  /return voicePlatformEnabled && voiceBrowserTestEnabled && vapiSource\.available;/.test(
    voiceContextSrc,
  ) &&
    /if \(!voicePlatformEnabled \|\| !voiceBrowserTestEnabled\) \{/.test(voiceContextSrc),
);

check(
  "the SDK is still reached only through a dynamic import inside the factory",
  /import\("@vapi-ai\/web"\)/.test(vapiFactorySrc) &&
    !/^import .*@vapi-ai\/web/m.test(vapiFactorySrc),
);

check(
  "the loader is still injected into the client rather than called to check availability",
  /new VapiBrowserVoiceClient\(publicKey, loadVapiSdk\)/.test(vapiFactorySrc) &&
    /get available\(\): boolean \{\s*return getVapiPublicKey\(\) !== null;/.test(vapiFactorySrc),
);

check(
  "no fake or provider stub was added to production source",
  !/FakeBrowserVoiceClient|FakeVoiceProvider|ScriptedVoiceProvider/.test(
    `${voiceContextCode}\n${stripComments(vapiFactorySrc)}`,
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Source — where the imports live, and what still gates the routes");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "App.tsx contains no direct import of any gated page — this is the correction",
  GATED_PAGE_MODULES.filter((m) => appCode.includes(`import("@/pages/${m}")`)),
  [],
);

check(
  "App.tsx takes the gated page components from the boundary instead",
  appCode.includes('import { voiceRoutePages } from "@/routes/voiceRoutes";') &&
    /=\s*voiceRoutePages;/.test(appCode),
);

eq(
  "every non-voice page is still imported inline and lazily, so the split is unchanged",
  [
    "Login",
    "PublicSchedule",
    "Overview",
    "Inbox",
    "AgentConfig",
    "Contacts",
    "ContactDetail",
    "Settings",
    "Billing",
    "not-found",
  ].filter((m) => !appCode.includes(`lazy(() => import("@/pages/${m}"))`)),
  [],
);

check(
  "the boundary gates on the shared foldable constant, never on a call the bundler cannot fold",
  /voiceRoutePages: VoiceRoutePages = voicePlatformEnabled\s*$/m.test(boundaryCode) &&
    !/VOICE_BUILD_ENABLED/.test(boundaryCode) &&
    !/parseBooleanFlag/.test(boundaryCode),
);

eq(
  "the boundary names no environment variable of its own any more",
  boundaryCode.match(/VITE_[A-Z_]+/g) ?? [],
  [],
);

eq(
  "all seven gated pages are imported inside the enabled branch, and nowhere else",
  GATED_PAGE_MODULES.filter(
    (m) => !boundaryCode.includes(`${m}: lazy(() => import("@/pages/${m}"))`),
  ),
  [],
);

check(
  "the disabled branch resolves to the existing not-found page, never to nothing",
  /const unavailable = \(\) => import\("@\/pages\/not-found"\);/.test(boundaryCode) &&
    GATED_PAGE_MODULES.every((m) => boundaryCode.includes(`${m}: lazy(unavailable)`)),
);

check(
  "the boundary imports only react and the flag helper, so it can form no cycle",
  (boundaryCode.match(/from "[^"]+"/g) ?? []).every(
    (m) => m === 'from "react"' || m === 'from "@/lib/featureFlags"',
  ) && (stripComments(flagsSrc).match(/^import /gm) ?? []).length === 0,
);

// Route registration — the gate itself, and the not-found fall-through.
{
  const gate = /\{voicePlatformEnabled && \(\s*<>([\s\S]*?)<\/>\s*\)\}/.exec(appSrc)?.[1] ?? "";
  eq(
    "all seven gated routes are still registered inside the voice-platform gate",
    GATED_ROUTE_KEYS.filter((k) => !gate.includes(`path={ROUTES.${k}}`)),
    [],
  );
  eq(
    "and each is defined exactly once, so no route is duplicated",
    GATED_ROUTE_KEYS.filter((k) => appSrc.split(`path={ROUTES.${k}}`).length - 1 !== 1),
    [],
  );
  check(
    "direct navigation to an unregistered route still falls through to not-found",
    /<Route component=\{NotFound\} \/>/.test(appSrc) &&
      appSrc.indexOf("<Route component={NotFound} />") > appSrc.indexOf("{comingSoonRoutes.map("),
  );
  check(
    "the placeholder routes are still built only when the flag is on",
    appSrc.includes("const comingSoonRoutes = voicePlatformEnabled"),
  );
  check(
    "the router is still mounted on the build's own base, so root and prefix both work",
    /<WouterRouter base=\{ROUTER_BASE\}>/.test(appSrc) &&
      /const RAW_BASE = import\.meta\.env\.BASE_URL \|\| "\/";/.test(routesSrc) &&
      /ROUTER_BASE = RAW_BASE\.replace\(\/\\\/\+\$\/, ""\)/.test(routesSrc),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Built output — what each variant may and may not emit");
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The probes below are not friendly filenames. Each is a string that the
 * genuine pre-AR-001J default-gated build **did** emit and that the corrected
 * one does not, so this section fails against that baseline rather than merely
 * describing it.
 */
const GATED_RENDERABLE = [
  ASSISTANTS_LIST.detail,
  ASSISTANTS_LIST.newAssistant,
  CALL_LOGS_PAGE.detail,
  APPOINTMENTS_PAGE.detail,
];

const GATED_MODULE_IDENTIFIERS = [
  "receptionist/voice/assistants",
  "receptionist/voice/calls",
  "receptionist/availability/config",
];

const PROVIDER_AND_MEDIA = [
  "api.vapi.ai",
  "daily.co",
  "getUserMedia",
  "mediaDevices",
  "RTCPeerConnection",
  "new WebSocket",
];

/** Correction C's own probes: the browser client, its loader and its copy. */
const BROWSER_TEST_ONLY = [
  "VapiBrowserVoiceClient",
  "@vapi-ai/web",
  "getVapiPublicKey",
];

/**
 * Gated navigation text. Every string here reaches a reader only through a
 * `voiceGated: true` record, and every one of them was in the entry chunk of
 * a default-gated AR-001J build.
 */
const GATED_NAV_LABELS = gatedNavItems.map((i) => i.label);
const GATED_NAV_DESCRIPTIONS = gatedNavItems
  .map((i) => i.description)
  .filter((d): d is string => d !== undefined);
const GATED_NAV_AVAILABILITY = [...new Set(
  gatedNavItems.map((i) => i.availability).filter((a): a is string => a !== undefined),
)];

/**
 * Hrefs that exist *only* as navigation. The three live ones are also route
 * table entries, so they are covered by the route-chunk assertions instead;
 * these nine appear nowhere but the catalogue.
 */
const GATED_NAV_ONLY_HREFS = gatedNavItems
  .map((i) => i.href)
  .filter((h): h is string => h !== undefined && !["/assistants", "/appointments", "/logs"].includes(h));

/**
 * Icons only the gated records use. Lucide's export name and the name it bakes
 * into the emitted output differ (`BarChart3` is emitted as `chart-column`),
 * so the pairing is written down and then checked against the source rather
 * than transformed by guesswork. `AlertTriangle` is deliberately absent: the
 * Issues record uses it, but so do ungated modules, so its presence in a
 * default build proves nothing — which the check below states explicitly.
 */
const GATED_ONLY_ICONS: [string, string][] = [
  ["Wrench", "wrench"],
  ["Phone", "phone"],
  ["AudioLines", "audio-lines"],
  ["BookOpen", "book-open"],
  ["Users", "users"],
  ["CalendarDays", "calendar-days"],
  ["PhoneOutgoing", "phone-outgoing"],
  ["ScrollText", "scroll-text"],
  ["BarChart3", "chart-column"],
  ["FlaskConical", "flask-conical"],
  ["Braces", "braces"],
  ["Plug", "plug"],
  ["KeyRound", "key-round"],
];

{
  const catalogue = /export const VOICE_NAV: VoiceNavSlots = \{[\s\S]*?\n\};/.exec(navSrc)?.[0] ?? "";
  const imported = [
    ...new Set(
      (/^import \{([\s\S]*?)\} from "lucide-react";/m.exec(navSrc)?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!)
        .filter((s) => s.length > 0 && s !== "LucideIcon"),
    ),
  ];
  const onlyInCatalogue = imported.filter(
    (name) =>
      new RegExp(`icon: ${name},`).test(catalogue) &&
      !new RegExp(`icon: ${name}[,\\s]`).test(navSrc.replace(catalogue, "")),
  );
  eq(
    "the gated-only icon list is derived from the catalogue, not guessed",
    onlyInCatalogue.filter((n) => n !== "AlertTriangle").sort(),
    GATED_ONLY_ICONS.map(([n]) => n).sort(),
  );
  check(
    "AlertTriangle is excluded because ungated modules import it independently",
    onlyInCatalogue.includes("AlertTriangle") &&
      /AlertTriangle/.test(read("artifacts/helpdesk/src/components/ErrorBoundary.tsx")),
  );
}

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
const indexHtmlPath = path.join(repoRoot, "artifacts/helpdesk/dist/public/index.html");
if (!existsSync(distDir)) {
  console.log("  SKIP  no built output present (run a production build to include these)");
} else {
  const files = readdirSync(distDir);
  const readAsset = (f: string) => readFileSync(path.join(distDir, f), "utf8");
  const everyJs = files.filter((f) => f.endsWith(".js")).map(readAsset).join("\n");
  const everyCss = files.filter((f) => f.endsWith(".css")).map(readAsset).join("\n");
  const everyAsset = `${everyJs}\n${everyCss}`;

  const chunksFor = (m: string) =>
    files.filter((f) => new RegExp(`^${m}-[A-Za-z0-9_-]{8}\\.(js|css)$`).test(f));

  const entryChunks = files.filter((f) => /^index-.*\.js$/.test(f));

  /**
   * Which build produced these assets — never read from the presence of the
   * chunks under test, which would make every assertion below circular.
   *
   * Correction A folds each flag to a literal, so the parser call this used to
   * read out of the entry chunk is, by design, no longer there in a
   * canonically-flagged build. The build declares itself instead, under the
   * same variable names it was built with and read through the same truth
   * table asserted at the top of this file. An undeclared run still falls back
   * to the old echo — a non-canonical spelling keeps the parser in the bundle
   * — and reports indeterminate rather than guessing.
   */
  const isDeclared = process.env.AR001J_DECLARED === "1";
  const declared = (name: string): string | undefined =>
    isDeclared ? process.env[`AR001J_VITE_VOICE_${name}`] : undefined;

  const echoedPlatform = ((): string | undefined => {
    if (entryChunks.length !== 1) return undefined;
    const entrySrc = readAsset(entryChunks[0]!);
    const parser = /function (\w+)\(\w+\)\{[^{}]*trim\(\)\.toLowerCase\(\)==="true"\}/.exec(
      entrySrc,
    );
    if (parser === null) return undefined;
    return new RegExp(`${parser[1]}\\("([^"]*)"\\)`).exec(entrySrc)?.[1];
  })();

  const rawPlatform = isDeclared ? declared("PLATFORM_ENABLED") : echoedPlatform;
  const known = isDeclared || echoedPlatform !== undefined;

  /**
   * Exactly the three spellings Vite substitutes and Rollup can then decide.
   * This is the whole of the statically removable set, and it is deliberately
   * not a list of "values that mean false": adding `"0"` or `"no"` here would
   * be inventing environment contract that `parseBooleanFlag` does not have.
   */
  const staticallyFalse = (v: string | undefined) =>
    v === undefined || v === "" || v === "false";

  /**
   * Four classes, because the flag has three statically distinguishable
   * outcomes and one unknown:
   *
   *   voice-enabled  the parser accepts it — every gated module is built in
   *                  and every gated route is registered;
   *   gated-out      the bundler can decide it is false — nothing gated is
   *                  emitted at all;
   *   gated-inert    the parser rejects it but the bundler cannot decide it
   *                  (`"1"`, `"yes"`). The runtime gate is false, so no route
   *                  and no navigation item exists; the modules are emitted
   *                  and unreachable. This is the documented cost of not
   *                  narrowing the flag contract to lowercase `"true"`, and it
   *                  is asserted rather than hidden;
   *   indeterminate  undeclared, and the entry chunk carries no parser echo.
   */
  const buildClass: "voice-enabled" | "gated-out" | "gated-inert" | "indeterminate" = !known
    ? "indeterminate"
    : parseBooleanFlag(rawPlatform)
      ? "voice-enabled"
      : staticallyFalse(rawPlatform)
        ? "gated-out"
        : "gated-inert";

  /** Only meaningful when the build declared itself. */
  const declaredPublish =
    declared("PUBLISH_ENABLED") === undefined && !isDeclared
      ? undefined
      : parseBooleanFlag(declared("PUBLISH_ENABLED"));
  const declaredBrowserTest =
    declared("BROWSER_TEST_ENABLED") === undefined && !isDeclared
      ? undefined
      : parseBooleanFlag(declared("BROWSER_TEST_ENABLED"));

  console.log(
    `  NOTE  build class: ${buildClass}` +
      ` (platform=${JSON.stringify(rawPlatform)}` +
      `, publish=${JSON.stringify(declared("PUBLISH_ENABLED"))}` +
      `, browserTest=${JSON.stringify(declared("BROWSER_TEST_ENABLED"))})`,
  );

  // ── True of every variant ────────────────────────────────────────────────

  eq("exactly one entry chunk is emitted", entryChunks.length, 1);

  eq(
    "every non-voice route is still emitted as its own lazy chunk",
    ["Login", "PublicSchedule", "Overview", "Inbox", "AgentConfig", "Contacts", "Settings", "Billing"]
      .filter((m) => chunksFor(m).filter((f) => f.endsWith(".js")).length !== 1),
    [],
  );

  check(
    "no private provider credential is present in any emitted asset",
    !/VAPI_API_KEY|VAPI_WEBHOOK_SECRET|GOOGLE_CLIENT_SECRET|client_secret|refresh_token/i.test(
      everyAsset,
    ),
  );

  check(
    "no test-only fake or provider-selection branch reaches any emitted asset",
    !everyJs.includes("FakeBrowserVoiceClient") &&
      !everyJs.includes("createFakeBrowserVoiceClientSource") &&
      !everyJs.includes("ScriptedVoiceProvider") &&
      !everyJs.includes("FakePublishRepository") &&
      !everyJs.includes("__browserVoiceClientSourceOverride") &&
      !everyJs.includes("VOICE_PROVIDER"),
  );

  /**
   * Scoped to application code. A voice-enabled build vendors the Vapi browser
   * SDK, which names Twilio because Vapi can attach a Twilio-imported number —
   * that is the provider's own vocabulary inside a third-party bundle, not a
   * transport this dashboard can reach. In a default-gated build no such chunk
   * exists, so there the same check covers every emitted asset.
   */
  const appJs = files
    .filter((f) => f.endsWith(".js") && !/^vapi-[A-Za-z0-9_-]{8}\.js$/.test(f))
    .map(readAsset)
    .join("\n");

  check(
    "no application chunk carries an SMS or email transport",
    !/twilio|sendgrid|nodemailer|resend\.com/i.test(`${appJs}\n${everyCss}`),
  );

  check(
    "no emitted asset can issue a webhook, phone or email mutation of its own",
    !/\/webhook|sms\/send|mail\/send|api\.twilio\.com/i.test(everyAsset),
  );

  // ── The base the build was mounted on ────────────────────────────────────

  if (existsSync(indexHtmlPath)) {
    const html = readFileSync(indexHtmlPath, "utf8");
    const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    const assetRefs = srcs.filter((s) => s.includes("/assets/"));
    const prefix = process.env.AR001J_BASE_PATH;

    check("the entry document references its own assets", assetRefs.length > 0);

    if (prefix === undefined) {
      console.log("  NOTE  no declared BASE_PATH — base shape asserted, not its value");
      check(
        "every asset reference is absolute from the build's own base",
        assetRefs.every((s) => s.startsWith("/") && s.includes("/assets/")),
      );
    } else if (prefix === "/") {
      check(
        "a root-base build references assets from the root",
        assetRefs.every((s) => s.startsWith("/assets/")),
      );
    } else {
      check(
        `a prefixed build references assets under ${prefix}`,
        assetRefs.every((s) => s.startsWith(`${prefix.replace(/\/$/, "")}/assets/`)),
      );
    }

    check(
      "no absolute origin is baked into the entry document",
      !/(?:src|href)="https?:\/\//.test(html),
    );
  }

  // ── The default-gated build: nothing gated may exist ─────────────────────

  if (buildClass === "gated-out") {
    eq(
      "no gated route chunk or stylesheet is emitted at all",
      GATED_PAGE_MODULES.flatMap((m) => chunksFor(m)),
      [],
    );

    check(
      "no provider SDK chunk is emitted",
      !files.some((f) => /^vapi-[A-Za-z0-9_-]{8}\.js$/.test(f)),
    );

    eq(
      "no gated module identifier survives into any emitted asset",
      GATED_MODULE_IDENTIFIERS.filter((s) => everyAsset.includes(s)),
      [],
    );

    eq(
      "no customer-facing string from a gated page survives into any emitted asset",
      GATED_RENDERABLE.filter((s) => everyAsset.includes(s)),
      [],
    );

    eq(
      "no provider host, microphone, WebRTC or WebSocket capability is emitted",
      PROVIDER_AND_MEDIA.filter((s) => everyJs.includes(s)),
      [],
    );

    // ── Correction B, in the built output ──────────────────────────────────

    eq(
      "no voice-gated navigation label is emitted",
      GATED_NAV_LABELS.filter((s) => everyAsset.includes(s)),
      [],
    );

    eq(
      "no voice-gated navigation description is emitted",
      GATED_NAV_DESCRIPTIONS.filter((s) => everyAsset.includes(s)),
      [],
    );

    eq(
      "no placeholder availability copy is emitted",
      GATED_NAV_AVAILABILITY.filter((s) => everyAsset.includes(s)),
      [],
    );

    eq(
      "no navigation-only gated href is emitted",
      GATED_NAV_ONLY_HREFS.filter((s) => everyAsset.includes(`"${s}"`)),
      [],
    );

    eq(
      "no icon that only a gated record uses is emitted",
      GATED_ONLY_ICONS.filter(([, emitted]) => everyJs.includes(`"${emitted}"`)).map(([n]) => n),
      [],
    );

    /**
     * The gated routes are the only place these paths are written, so their
     * absence is what proves no route-specific request can be issued: there is
     * no code left to issue one, whatever a caller types in the address bar.
     */
    check(
      "no voice or availability endpoint path is reachable from the default build",
      !/receptionist\/voice\//.test(everyJs) && !/receptionist\/availability\//.test(everyJs),
    );

    check(
      "and therefore no publish, call-start or other gated mutation can be issued",
      !everyJs.includes("/publish") && !everyJs.includes("provider-status"),
    );

    /**
     * The session request itself is untouched by the boundary: it is the
     * shell's, it is issued once, and no removed module ever added a second.
     * The count of *requests* is a runtime fact and is evidenced by the local
     * QA pass; what is checkable here is that only the shared session module
     * can issue one.
     */
    check(
      "the session request is still the shell's single shared query",
      everyJs.includes("receptionist/auth/me") &&
        (everyJs.match(/receptionist\/auth\/me/g) ?? []).length <= 2,
    );
  }

  // ── Any build that kept the gated code: it must exist, and stay lazy ─────

  if (buildClass === "voice-enabled" || buildClass === "gated-inert") {
    eq(
      "every gated page is emitted as exactly one lazy chunk of its own",
      GATED_PAGE_MODULES.filter((m) => chunksFor(m).filter((f) => f.endsWith(".js")).length !== 1),
      [],
    );

    check(
      "the Appointments route keeps its own stylesheet",
      chunksFor("Appointments").filter((f) => f.endsWith(".css")).length === 1,
    );

    const entrySrc = readAsset(entryChunks[0]!);
    eq(
      "no gated page's content is merged into the shared entry chunk",
      GATED_RENDERABLE.filter((s) => entrySrc.includes(s)),
      [],
    );

    check(
      "the entry still reaches each gated chunk only through a dynamic import",
      GATED_PAGE_MODULES.every((m) => {
        const chunk = chunksFor(m).find((f) => f.endsWith(".js"))!;
        return (
          entrySrc.includes(`"./${chunk}"`) && !new RegExp(`from\\s*"\\./${chunk}"`).test(entrySrc)
        );
      }),
    );

    /**
     * Correction B's other half: everything the default build must not have,
     * this build must. Asserted from the same derived lists, so the two can
     * never drift apart.
     */
    eq(
      "every voice-gated navigation label is present",
      GATED_NAV_LABELS.filter((s) => !everyAsset.includes(s)),
      [],
    );

    eq(
      "every voice-gated navigation description is present",
      GATED_NAV_DESCRIPTIONS.filter((s) => !everyAsset.includes(s)),
      [],
    );

    eq(
      "every navigation-only gated href is present",
      GATED_NAV_ONLY_HREFS.filter((s) => !everyAsset.includes(`"${s}"`)),
      [],
    );

    eq(
      "every icon a gated record uses is present",
      GATED_ONLY_ICONS.filter(([, emitted]) => !everyJs.includes(`"${emitted}"`)).map(([n]) => n),
      [],
    );

    // ── Correction C, keyed on the browser-test flag itself ────────────────

    const sdkChunks = files.filter((f) => /^vapi-[A-Za-z0-9_-]{8}\.js$/.test(f));

    /**
     * The SDK is built in exactly when the browser-test flag is not one of the
     * three spellings the bundler can decide is false — the same rule as every
     * other gated module, applied to its own flag. Stated as an equality so
     * both directions fail: emitting it with the flag off is correction C's
     * defect, and dropping it with the flag on would break AR-001A.
     */
    if (isDeclared) {
      const sdkExpected = !staticallyFalse(declared("BROWSER_TEST_ENABLED"));
      eq(
        "the provider SDK chunk is emitted exactly when browser testing is built in",
        sdkChunks.length === 1,
        sdkExpected,
      );

      const publishExpected = !staticallyFalse(declared("PUBLISH_ENABLED"));
      eq(
        "the publish request is present exactly when publishing is built in — independent of browser testing",
        everyJs.includes("/publish"),
        publishExpected,
      );

      check(
        "Assistants and its builder are available whatever publish and browser testing are set to",
        chunksFor("Assistants").filter((f) => f.endsWith(".js")).length === 1 &&
          chunksFor("AssistantBuilder").filter((f) => f.endsWith(".js")).length === 1,
      );
    }

    if (declaredBrowserTest === false && buildClass === "voice-enabled") {
      eq("browser testing off — no provider SDK chunk is emitted", sdkChunks, []);

      eq(
        "browser testing off — no browser client, loader or key reader is emitted",
        BROWSER_TEST_ONLY.filter((s) => everyJs.includes(s)),
        [],
      );

      eq(
        "browser testing off — no provider host, microphone or WebRTC capability is emitted",
        PROVIDER_AND_MEDIA.filter((s) => everyJs.includes(s)),
        [],
      );
    }

    if (sdkChunks.length === 1) {

      check("the SDK stays out of the entry chunk", !entrySrc.includes("api.vapi.ai"));

      /**
       * The SDK must be reachable only by a dynamic import: a static import
       * from any emitted chunk, or a modulepreload in the entry document,
       * would fetch it on load rather than on an explicit test activation.
       */
      const sdk = sdkChunks[0]!;
      check(
        "no emitted chunk statically imports the SDK, so nothing loads it eagerly",
        !files
          .filter((f) => f.endsWith(".js") && f !== sdk)
          .some((f) => new RegExp(`from\\s*"\\./${sdk}"`).test(readAsset(f))),
      );

      check(
        "the SDK is referenced as a dynamic import only",
        files
          .filter((f) => f.endsWith(".js") && f !== sdk)
          .some((f) => readAsset(f).includes(`"./${sdk}"`)),
      );

      if (existsSync(indexHtmlPath)) {
        const html = readFileSync(indexHtmlPath, "utf8");
        check("the entry document does not preload the SDK", !html.includes(sdk));
      }
    }
  }

  /**
   * The documented cost of keeping the flag contract wide. A spelling the
   * parser rejects but the bundler cannot decide leaves the gated code in the
   * build; what must still hold is that none of it is reachable, because the
   * one interpretation that registers routes and shows navigation is the same
   * runtime parser, and it says false.
   */
  if (buildClass === "gated-inert") {
    check(
      "a rejected but undecidable spelling is still false at runtime",
      parseBooleanFlag(rawPlatform) === false,
    );
    check(
      "and the parser it defers to is still in the bundle to say so",
      entryChunks.length === 1 &&
        /trim\(\)\.toLowerCase\(\)==="true"/.test(readAsset(entryChunks[0]!)),
    );
    console.log(
      "  NOTE  gated modules are emitted for this spelling and are unreachable —" +
        " see the limitations note at the end of this file",
    );
  }

  if (buildClass === "indeterminate") {
    console.log("  SKIP  the build class was neither declared nor readable from the entry chunk");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
section("The neighbouring contracts still describe this boundary");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "AR-001I, Phase 13 and Phase 14 all expect no gated chunk from a default build",
  [assistantsTestSrc, appointmentsTestSrc, callLogsTestSrc].filter(
    (src) => !src.includes('buildVariant === "default-gated"'),
  ).length,
  0,
);

eq(
  "and all three resolve the variant from the build's own declaration",
  [assistantsTestSrc, appointmentsTestSrc, callLogsTestSrc].filter(
    (src) => !src.includes("AR001J_VITE_VOICE_PLATFORM_ENABLED"),
  ).length,
  0,
);

check(
  "and none of them still asserts the old always-emitted behaviour",
  !assistantsTestSrc.includes(
    "page components are lazily imported outside the gate, so chunk emission is unaffected by it",
  ),
);

check(
  "AR-001I still pins the Assistants navigation record this file derives",
  assistantsTestSrc.includes('key: "assistants", label: "Assistants", href: "\\/assistants"') &&
    navSrc.includes('key: "assistants", label: "Assistants", href: "/assistants", icon: Bot,'),
);

// ═══════════════════════════════════════════════════════════════════════════
section("Registration — this file runs in the standard aggregate command");
// ═══════════════════════════════════════════════════════════════════════════

{
  const testScript = JSON.parse(scriptsPkgSrc).scripts.test as string;
  const mine = "tsx ../artifacts/helpdesk/src/routes/voiceBoundaryContract.test.ts";
  eq("this test is registered exactly once", testScript.split(mine).length - 1, 1);
  check(
    "and chained with && so a failure stops the run",
    testScript.includes(`${mine} &&`) || testScript.endsWith(mine),
  );
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
      "assistants/assistantsContract.test.ts",
      "browserVoice/browserVoiceContract.test.ts",
    ].every((t) => testScript.includes(t)),
  );
  check(
    "AR-001J added no dependency to the scripts package",
    JSON.stringify(JSON.parse(scriptsPkgSrc).devDependencies) ===
      JSON.stringify({ "@types/node": "catalog:", tsx: "catalog:" }) &&
      JSON.parse(scriptsPkgSrc).dependencies === undefined,
  );
}

// ─── Honest limitations ────────────────────────────────────────────────────
//
// Stated, not hidden:
//
//  • The built-output section asserts whichever build happens to be in
//    `dist/`. It cannot build the matrix itself, so each rule is proven for
//    the variant present when it runs. The validation pass runs it once per
//    build in the matrix, declaring that build's flags; a run with no `dist/`
//    skips the section entirely and says so.
//  • **The one thing correction A does not buy.** Semantic equivalence of the
//    gate is complete — there is a single constant, so navigation and routing
//    can no longer disagree. Static *removal* is not, and cannot be: the
//    bundler folds literal comparisons but not `trim().toLowerCase()`, so only
//    unset, `""` and `"false"` are decidable. A spelling the parser rejects but
//    the bundler cannot decide — `"1"`, `"yes"` — fails closed at runtime and
//    still emits the gated code, unreachable. The `gated-inert` class above
//    asserts exactly that, rather than hiding it. Narrowing the accepted set to
//    lowercase `"true"` would make removal exact at the cost of the documented
//    environment contract, and canonicalising the three variables in
//    `vite.config.ts` would make it exact without that cost — both are owner
//    decisions, and neither is taken here.
//  • The variant is now declared rather than inferred. That is deliberate:
//    correction A folds the flag to a literal, so the parser echo the old
//    detector relied on is gone from a canonically-flagged build, and reading
//    the variant from the chunks under test would be circular. An undeclared
//    run falls back to that echo where it still exists and reports
//    indeterminate otherwise, rather than guessing.
//  • Three gated hrefs — `/assistants`, `/appointments`, `/logs` — are also
//    route-table entries, so their absence from a default build is asserted
//    through the route and chunk checks rather than as navigation strings.
//    The nine navigation-only hrefs are asserted directly.
//  • Request counts — one session request, no route-specific request for an
//    unavailable route — are runtime facts. What is asserted here is the
//    stronger static precondition: the default build contains no voice
//    endpoint path at all, so no such request can be constructed. The counts
//    themselves come from the local QA pass.
//  • `components/common/BrowserTestPanel.tsx` is rendered unconditionally by
//    `pages/AssistantBuilder.tsx`, which is Assistants product layout and
//    outside this correction's authorised scope. Its idle-state copy therefore
//    still ships in a platform-enabled build with browser testing off. What
//    correction C removes — and what is asserted above — is the provider
//    client, its SDK loader, the key reader, and every microphone, WebRTC and
//    provider-host capability that came with them.

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All AR-001J voice build-boundary contract tests passed.");
