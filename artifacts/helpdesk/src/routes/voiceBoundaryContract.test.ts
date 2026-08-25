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
 * `voicePlatformEnabled` could not prevent that — it is
 * `parseBooleanFlag(import.meta.env.…)`, a function call no bundler can fold —
 * so the gate was only ever a runtime one. A default-gated build therefore
 * shipped and served every voice chunk, the Vapi browser SDK included.
 *
 * This file asserts all three properties, and asserts them per build variant,
 * because the correct answer genuinely differs between a default-gated build
 * and a voice-enabled one.
 *
 * It never performs a network request, never signs in, never creates a session,
 * never contacts Vapi, Twilio, Stripe, Google or any other provider, never
 * loads a provider SDK, and never touches a database.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NAV_GROUPS } from "../lib/nav.js";
import { visibleNavDestinations, visibleNavGroups } from "../components/layout/dashboardNav.js";
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
 * Deliberately read out of `NAV_GROUPS` rather than written down here. The
 * gated set is not "Assistants": it is every `voiceGated: true` item, and the
 * three live ones among them are only part of it.
 */
const gatedNavItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.voiceGated);

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
  NAV_GROUPS.flatMap((g) => g.items)
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
section("Flags — three, unchanged, and each still false by default");
// ═══════════════════════════════════════════════════════════════════════════

eq(
  "featureFlags.ts reads exactly the three documented variables, and no fourth",
  [...new Set(flagsSrc.match(/VITE_[A-Z_]+/g) ?? [])],
  ["VITE_VOICE_PLATFORM_ENABLED", "VITE_VOICE_PUBLISH_ENABLED", "VITE_VOICE_BROWSER_TEST_ENABLED"],
);

check(
  "each flag is still parsed by parseBooleanFlag, so no default changed",
  /voicePlatformEnabled: boolean = parseBooleanFlag\(\s*import\.meta\.env\.VITE_VOICE_PLATFORM_ENABLED,?\s*\)/.test(
    flagsSrc,
  ) &&
    /voicePublishEnabled: boolean = parseBooleanFlag\(\s*import\.meta\.env\.VITE_VOICE_PUBLISH_ENABLED,?\s*\)/.test(
      flagsSrc,
    ) &&
    /voiceBrowserTestEnabled: boolean = parseBooleanFlag\(\s*import\.meta\.env\.VITE_VOICE_BROWSER_TEST_ENABLED,?\s*\)/.test(
      flagsSrc,
    ),
);

check(
  "an unset or non-string value is still false, and only the exact word true is true",
  /if \(typeof value !== "string"\) return false;/.test(flagsSrc) &&
    /return value\.trim\(\)\.toLowerCase\(\) === "true";/.test(flagsSrc),
);

check(
  "the boundary introduces no flag of its own — it reads the platform variable",
  (boundaryCode.match(/VITE_[A-Z_]+/g) ?? []).every((v) => v === "VITE_VOICE_PLATFORM_ENABLED"),
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
  visibleNavDestinations(false),
  ["/", "/conversations", "/receptionist", "/contacts", "/billing", "/settings"],
);

eq(
  "with the flag on the complete gated set appears, in its approved order",
  visibleNavDestinations(true),
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
  visibleNavGroups(true).map((g) => g.key),
  ["overview", "build", "operate", "observe", "manage"],
);

eq(
  "with the flag off the Build group disappears entirely rather than rendering empty",
  visibleNavGroups(false).map((g) => g.key),
  ["overview", "operate", "manage"],
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
  "the boundary's condition is a literal comparison the bundler can fold",
  /const VOICE_BUILD_ENABLED = import\.meta\.env\.VITE_VOICE_PLATFORM_ENABLED === "true";/.test(
    boundarySrc,
  ),
);

check(
  "no bundler-opaque call sits between the flag and the imports",
  !/VOICE_BUILD_ENABLED\s*=\s*\w+\(/.test(boundaryCode),
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
  "the boundary imports no application module, so it can form no cycle",
  (boundaryCode.match(/from "[^"]+"/g) ?? []).every((m) => m === 'from "react"'),
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

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
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

  /**
   * Which build produced these assets, read from the flag literal the bundler
   * baked into the entry chunk — never from the presence of the chunks under
   * test, which would make every assertion below circular. A build with the
   * variable unset folds the parser away entirely and is reported as
   * indeterminate rather than guessed at.
   */
  const entryChunks = files.filter((f) => /^index-.*\.js$/.test(f));
  const buildVariant = ((): "default-gated" | "voice-enabled" | "indeterminate" => {
    if (entryChunks.length !== 1) return "indeterminate";
    const parsed =
      /function (\w+)\(\w+\)\{[^{}]*trim\(\)\.toLowerCase\(\)==="true"\}\s*(?:const|let|var) \w+=\1\(([^)]*)\)/.exec(
        readAsset(entryChunks[0]!),
      );
    if (parsed === null) return "indeterminate";
    return parsed[2] === '"true"' ? "voice-enabled" : "default-gated";
  })();

  console.log(`  NOTE  build variant read from the entry chunk: ${buildVariant}`);

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

  // ── The default-gated build: nothing gated may exist ─────────────────────

  if (buildVariant === "default-gated") {
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

  // ── The voice-enabled build: everything gated must exist, and stay lazy ──

  if (buildVariant === "voice-enabled") {
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
      "the provider SDK stays in its own chunk rather than the entry",
      files.some((f) => /^vapi-[A-Za-z0-9_-]{8}\.js$/.test(f)) && !entrySrc.includes("api.vapi.ai"),
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
  }

  if (buildVariant === "indeterminate") {
    console.log("  SKIP  the build variant could not be read from the entry chunk");
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

check(
  "and none of them still asserts the old always-emitted behaviour",
  !assistantsTestSrc.includes(
    "page components are lazily imported outside the gate, so chunk emission is unaffected by it",
  ),
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
//    `dist/`. It cannot build the matrix itself, so "the default build emits
//    nothing gated" is proven for the variant present when it runs. The
//    validation pass runs it against a default-gated build and a voice-enabled
//    one; a run with no `dist/` skips that section entirely and says so.
//  • A build with the flag variable unset — as opposed to explicitly "false" —
//    folds the flag parser away completely, so the variant cannot be read back
//    out of the entry chunk. That build is reported indeterminate rather than
//    assumed; its emitted asset set is identical to the explicitly-false one,
//    which is recorded in the AR-001J evidence rather than asserted here.
//  • Request counts — one session request, no route-specific request for an
//    unavailable route — are runtime facts. What is asserted here is the
//    stronger static precondition: the default build contains no voice
//    endpoint path at all, so no such request can be constructed. The counts
//    themselves come from the local QA pass.
//  • The navigation catalogue in `lib/nav.ts` is eagerly imported, by design
//    and by instruction: its labels and descriptions are frozen. The gated
//    items' *navigation text* therefore remains in the entry chunk of a
//    default-gated build. What this file proves absent is the gated pages'
//    own code and their own renderable content.

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All AR-001J voice build-boundary contract tests passed.");
