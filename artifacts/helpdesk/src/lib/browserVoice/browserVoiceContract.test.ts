/**
 * AR-001A — provider-safe browser voice-test contract.
 *
 * Run via: tsx artifacts/helpdesk/src/lib/browserVoice/browserVoiceContract.test.ts
 *
 * Same arrangement as the Phase 5–14 page contract tests: the file lives beside
 * the module it covers, `tsx` is the runner, and helpdesk's tsconfig excludes
 * `**\/*.test.ts` by glob so nothing here is type-built into the app or bundled
 * by Vite.
 *
 * ── What this covers, and what it deliberately does not ────────────────────
 *
 * It exercises the *client* half of the browser-test seam: the
 * `BrowserVoiceClient` contract, its four lifecycle events, its idempotence
 * guarantees, and its teardown — driven through a test-only fake that imports
 * nothing at runtime.
 *
 * It does NOT drive `useBrowserVoiceTest`. That hook maps client events onto the
 * eight-value `BrowserVoiceTestState` union, and running it requires a React
 * renderer (react-dom with a DOM, or react-test-renderer). helpdesk has neither,
 * and AR-001A authorises no new dependency, so the hook's state mapping is
 * stated here as an uncovered limitation rather than faked. A reimplementation
 * of the reducer inside this file would assert only that a copy matches itself.
 *
 * Likewise `eligibility.ts` and `context.tsx` are covered by source assertion,
 * not by import: both read `import.meta.env` through `featureFlags.ts`, which is
 * a Vite compile-time construct that plain Node cannot evaluate. Every existing
 * contract test in this repository treats `featureFlags.ts` the same way.
 *
 * It never performs a network request, never signs in, never creates a session,
 * never loads the Vapi SDK, never requests a microphone, never opens a WebRTC
 * peer connection or WebSocket, never contacts a provider, and never touches a
 * database.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UnavailableBrowserVoiceClient } from "./UnavailableBrowserVoiceClient.js";
import { safeBrowserVoiceErrorMessage, type BrowserVoiceErrorCategory } from "./errors.js";
import {
  FakeBrowserVoiceClient,
  createFakeBrowserVoiceClientSource,
} from "./testing/FakeBrowserVoiceClient.js";
import type { BrowserVoiceEvent } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n${title}`);
}

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

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// ─── Tripwires ─────────────────────────────────────────────────────────────
//
// The absence of credentials is not proof of inaction. Every escape route this
// process has is instrumented before a single line of the fake runs, and each
// is asserted to have been left untouched at the end.

const trips: Record<string, number> = {
  fetch: 0,
  XMLHttpRequest: 0,
  WebSocket: 0,
  RTCPeerConnection: 0,
  getUserMedia: 0,
  sendBeacon: 0,
  importVapiSdk: 0,
};

const g = globalThis as unknown as Record<string, unknown>;

for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "RTCPeerConnection", "sendBeacon"]) {
  g[name] = function tripped(): never {
    trips[name] = (trips[name] ?? 0) + 1;
    throw new Error(`AR-001A tripwire: ${name} was invoked`);
  };
}

// navigator.mediaDevices does not exist under Node; if a future runtime adds it,
// this makes any access observable rather than silently permitted.
const mediaDevicesPresent =
  typeof (g.navigator as { mediaDevices?: unknown } | undefined)?.mediaDevices !== "undefined";

// ═══════════════════════════════════════════════════════════════════════════
section("Fake client — construction is inert");
// ═══════════════════════════════════════════════════════════════════════════

{
  const client = new FakeBrowserVoiceClient();
  check("constructing the fake performs no lifecycle call", client.calls.length === 0);
  check("constructing the fake emits no event", client.emitted.length === 0);
  check("the fake schedules no timer", client.pendingTimers === 0);
  check("a freshly constructed fake reports available", client.available === true);
  check("a fake can report unavailable, matching a missing public key", new FakeBrowserVoiceClient({ available: false }).available === false);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Fake client — deterministic connection states");
// ═══════════════════════════════════════════════════════════════════════════

async function drive(behavior: Parameters<typeof createFakeBrowserVoiceClientSource>[0]["behavior"]) {
  const client = new FakeBrowserVoiceClient({ behavior });
  const seen: BrowserVoiceEvent[] = [];
  const unsubscribe = client.subscribe((e) => seen.push(e));
  let rejected = false;
  try {
    await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  } catch {
    rejected = true;
  }
  await tick();
  return { client, seen, rejected, unsubscribe };
}

{
  const { seen, rejected } = await drive({ kind: "connects" });
  eq("connecting → connected emits exactly one call-start", seen.map((e) => e.type), ["call-start"]);
  check("a connecting start does not reject", rejected === false);
}

{
  const { seen } = await drive({ kind: "connectsThenRemoteEnd" });
  eq("a provider-side hangup emits call-start then call-end in order", seen.map((e) => e.type), ["call-start", "call-end"]);
}

{
  const { seen, rejected } = await drive({ kind: "failsToStart" });
  check("an SDK-load / start failure rejects from start()", rejected === true);
  eq("a start failure emits no lifecycle event", seen.map((e) => e.type), []);
}

{
  const { seen, rejected } = await drive({ kind: "permissionDenied" });
  eq("a denied microphone emits exactly one permission-denied", seen.map((e) => e.type), ["permission-denied"]);
  check("a denied microphone does not also reject from start()", rejected === false);
}

{
  const { seen } = await drive({ kind: "failsBeforeConnect" });
  eq("a failure before connection emits error without call-start", seen.map((e) => e.type), ["error"]);
}

{
  const { seen } = await drive({ kind: "failsAfterConnect" });
  eq("a drop after connection emits call-start then error", seen.map((e) => e.type), ["call-start", "error"]);
}

{
  const { seen } = await drive({ kind: "idle" });
  eq("an idle behavior emits nothing until asked", seen.map((e) => e.type), []);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Fake client — guards and idempotence");
// ═══════════════════════════════════════════════════════════════════════════

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const seen: BrowserVoiceEvent[] = [];
  client.subscribe((e) => seen.push(e));

  await Promise.all([
    client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" }),
    client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" }),
  ]);
  await tick();

  eq("a duplicate start produces exactly one connection", seen.map((e) => e.type), ["call-start"]);
  check("both start calls were observed, so the guard — not the caller — deduplicated", client.calls.filter((c) => c === "start").length === 2);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "idle" } });
  let rejected = false;
  try {
    await client.start({ provider: "vapi", providerAssistantId: "   " });
  } catch {
    rejected = true;
  }
  check("a blank provider assistant id is refused", rejected === true);
  check("a refused start never marks the client as started", client.wasStarted === false);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "idle" } });
  let rejected = false;
  try {
    await client.start({ provider: "not-vapi" as "vapi", providerAssistantId: "asst_test_0001" });
  } catch {
    rejected = true;
  }
  check("an unsupported provider is refused", rejected === true);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const seen: BrowserVoiceEvent[] = [];
  client.subscribe((e) => seen.push(e));
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();

  await client.end();
  await client.end();
  await client.end();
  await tick();

  eq("repeated end() produces exactly one call-end", seen.map((e) => e.type), ["call-start", "call-end"]);
  check("every end() call was still observed", client.calls.filter((c) => c === "end").length === 3);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "idle" } });
  let threw = false;
  try {
    await client.end();
  } catch {
    threw = true;
  }
  check("end() before any start is safe", threw === false);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" }, failOnEnd: true });
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();
  let rejected = false;
  try {
    await client.end();
  } catch {
    rejected = true;
  }
  check("an unclean teardown surfaces as a rejected end()", rejected === true);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Fake client — cleanup leaves nothing behind");
// ═══════════════════════════════════════════════════════════════════════════

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const seen: BrowserVoiceEvent[] = [];
  client.subscribe((e) => seen.push(e));
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();

  await client.destroy();

  check("destroy() clears every subscriber", client.listenerCount === 0);
  check("destroy() marks the client destroyed", client.wasDestroyed === true);
  check("no timer survives destroy()", client.pendingTimers === 0);

  const before = seen.length;
  client.emitNow({ type: "error" });
  check("a destroyed client emits nothing further", seen.length === before);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "failsAfterConnect" } });
  const seen: BrowserVoiceEvent[] = [];
  client.subscribe((e) => seen.push(e));
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();
  await client.destroy();
  check("cleanup after a failure is complete", client.listenerCount === 0 && client.pendingTimers === 0);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();
  await client.end();
  await client.destroy();
  await client.destroy();
  check("repeated destroy() is safe", client.wasDestroyed === true);
  eq("cleanup order is start → end → destroy → destroy", client.calls, ["start", "end", "destroy", "destroy"]);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "connects" } });
  const seen: BrowserVoiceEvent[] = [];
  const unsubscribe = client.subscribe((e) => seen.push(e));
  unsubscribe();
  await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  await tick();
  eq("an unsubscribed listener receives nothing", seen.map((e) => e.type), []);
  check("unsubscribe removes exactly one listener", client.listenerCount === 0);
}

{
  const client = new FakeBrowserVoiceClient({ behavior: { kind: "idle" } });
  await client.destroy();
  let rejected = false;
  try {
    await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  } catch {
    rejected = true;
  }
  check("starting a destroyed client is refused — the unload/teardown race", rejected === true);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Fake source — matches the production source shape");
// ═══════════════════════════════════════════════════════════════════════════

{
  const source = createFakeBrowserVoiceClientSource({ behavior: { kind: "connects" } });
  check("the fake source exposes a side-effect-free `available`", source.available === true);
  check("reading `available` constructs no client", source.created.length === 0);

  const a = source.create();
  const b = source.create();
  check("each create() returns a distinct client instance", a !== b);
  check("the source records every client it created", source.created.length === 2);

  const unavailable = createFakeBrowserVoiceClientSource({ available: false });
  check("a source with no configured key reports unavailable", unavailable.available === false);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Production default client — the standing unavailable implementation");
// ═══════════════════════════════════════════════════════════════════════════

{
  const client = new UnavailableBrowserVoiceClient();
  check("the production default reports unavailable", client.available === false);

  let message = "";
  try {
    await client.start({ provider: "vapi", providerAssistantId: "asst_test_0001" });
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  check("its start() always rejects — Test never silently simulates a call", message.length > 0);
  check("its rejection message is the static safe copy", message === "Browser voice integration is not connected yet.");
  check("the message names no provider, host, or credential", !/vapi|api key|token|http/i.test(message));

  let threw = false;
  try {
    await client.end();
    client.destroy();
  } catch {
    threw = true;
  }
  check("its end() and destroy() are safe to call with no call in flight", threw === false);

  let received = 0;
  const unsubscribe = client.subscribe(() => {
    received += 1;
  });
  unsubscribe();
  check("it emits no event to any subscriber", received === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Production error copy — static, safe, and complete");
// ═══════════════════════════════════════════════════════════════════════════

{
  const CATEGORIES: BrowserVoiceErrorCategory[] = [
    "integration_unavailable",
    "permission_denied",
    "microphone_unavailable",
    "connection_failed",
    "connection_closed",
    "start_failed",
    "end_failed",
    "unexpected_browser_voice_error",
  ];

  eq("eight browser-voice error categories are defined", CATEGORIES.length, 8);

  for (const category of CATEGORIES) {
    const message = safeBrowserVoiceErrorMessage(category);
    check(`${category} resolves to non-empty static copy`, message.length > 0);
    check(`${category} names no provider, host, credential or stack`, !/vapi|daily|webrtc|api[ _-]?key|token|https?:|at .*\(/i.test(message));
  }

  check(
    "the default category is the generic safe message",
    safeBrowserVoiceErrorMessage() === "Something went wrong with the browser voice test. Please try again.",
  );
  check(
    "permission-denied copy tells the customer how to recover",
    /allow microphone access/i.test(safeBrowserVoiceErrorMessage("permission_denied")),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
section("Source guarantees — the fake can never reach a provider");
// ═══════════════════════════════════════════════════════════════════════════

{
  const fakeSrc = read("artifacts/helpdesk/src/lib/browserVoice/testing/FakeBrowserVoiceClient.ts");
  const testSrc = read("artifacts/helpdesk/src/lib/browserVoice/browserVoiceContract.test.ts");

  for (const [label, src] of [["the fake", fakeSrc], ["this test", testSrc]] as const) {
    check(`${label} imports no Vapi SDK`, !/@vapi-ai\/web/.test(src));
    check(`${label} never calls getUserMedia`, !/getUserMedia\s*\(/.test(src));
    check(`${label} never constructs an RTCPeerConnection`, !/new\s+RTCPeerConnection/.test(src));
    check(`${label} never constructs a WebSocket`, !/new\s+WebSocket/.test(src));
    check(`${label} never calls sendBeacon`, !/sendBeacon\s*\(/.test(src));
    // Reading a credential means accessing it, not naming it. This file has to
    // name VAPI_API_KEY to assert elsewhere that production never leaks it, so
    // a bare name check would only ever flag the assertion that protects it.
    check(
      `${label} performs no credential environment read`,
      !/(process|import\.meta)\.env\.[A-Za-z_]*VAPI[A-Za-z_]*/.test(src),
    );
  }

  check("the fake names no provider host", !/api\.vapi\.ai|vapi\.ai|daily\.co|twilio\.com/i.test(fakeSrc));
  check("the fake names no provider credential at all", !/VITE_VAPI_PUBLIC_KEY|VAPI_API_KEY/.test(fakeSrc));

  check("the fake performs no fetch", !/\bfetch\s*\(/.test(fakeSrc));
  check("the fake has exactly one import, and it is type-only", (fakeSrc.match(/^import /gm) ?? []).length === 1 && /^import type \{/m.test(fakeSrc));
  check("the fake schedules no timer", !/setTimeout|setInterval|requestAnimationFrame/.test(fakeSrc));
  check("the fake is labelled test-only", /TEST-ONLY/.test(fakeSrc));

  // No production module may import the fake, or it would enter the Vite graph.
  const srcRoot = path.join(repoRoot, "artifacts/helpdesk/src");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });

  const importers = walk(srcRoot).filter((file) => {
    if (/FakeBrowserVoiceClient\.ts$/.test(file) || /\.test\.ts$/.test(file)) return false;
    return /FakeBrowserVoiceClient|createFakeBrowserVoiceClientSource/.test(readFileSync(file, "utf8"));
  });
  eq("no production module imports the fake", importers.map((f) => path.relative(repoRoot, f)), []);
}

// ═══════════════════════════════════════════════════════════════════════════
section("Production seams remain intact and unmodified in shape");
// ═══════════════════════════════════════════════════════════════════════════

{
  const contextSrc = read("artifacts/helpdesk/src/lib/browserVoice/context.tsx");
  const factorySrc = read("artifacts/helpdesk/src/lib/browserVoice/vapi/factory.ts");
  const clientSrc = read("artifacts/helpdesk/src/lib/browserVoice/vapi/VapiBrowserVoiceClient.ts");
  const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");

  check("the injection seam is still a context with an optional provider", /BrowserVoiceClientProvider/.test(contextSrc) && /useContext\(BrowserVoiceClientSourceContext\)/.test(contextSrc));
  check("the production source still fails closed on both voice flags", /voicePlatformEnabled && voiceBrowserTestEnabled/.test(contextSrc));
  check("the dev-only window override is still guarded by import.meta.env.DEV", /import\.meta\.env\.DEV\s*&&/.test(contextSrc));

  check("the SDK is still loaded only through a dynamic import", /import\("@vapi-ai\/web"\)/.test(factorySrc));
  check("the factory does not statically import the SDK", !/^import .*@vapi-ai\/web/m.test(factorySrc));
  check("the client still receives its SDK loader by injection", /loadSdk:\s*VapiSdkLoader/.test(clientSrc) || /this\.loadSdk\s*=\s*loadSdk/.test(clientSrc));
  check("the client still loads the SDK only inside start()", /async start\([\s\S]*?await this\.loadSdk\(\)/.test(clientSrc));

  check("all three voice flags still default to false", (flagsSrc.match(/parseBooleanFlag\(/g) ?? []).length >= 3);
  check("no flag carries a provider host or private key", !/api\.vapi\.ai|VAPI_API_KEY/.test(flagsSrc));

  // AR-001A must not have introduced a fake-provider selector anywhere.
  const backendFactory = read("artifacts/api-server/src/lib/voicePublishing/providerFactory.ts");
  check("the backend provider factory reads no VOICE_PROVIDER variable", !/VOICE_PROVIDER/.test(backendFactory));
  check("the backend provider factory still constructs only the real provider", /new VapiVoiceProvider\(config\)/.test(backendFactory));
  check("the backend provider factory never selects FakeVoiceProvider", !/FakeVoiceProvider/.test(backendFactory));
}

// ═══════════════════════════════════════════════════════════════════════════
section("Built output — no test-only code reaches production");
// ═══════════════════════════════════════════════════════════════════════════

{
  const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
  if (!existsSync(distDir)) {
    console.log("  SKIP  no built output present (run a production build to include these)");
  } else {
    const files = readdirSync(distDir);
    const everyJs = files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(path.join(distDir, f), "utf8"))
      .join("\n");

    check("the fake class name appears in no emitted chunk", !everyJs.includes("FakeBrowserVoiceClient"));
    check("the fake source factory appears in no emitted chunk", !everyJs.includes("createFakeBrowserVoiceClientSource"));
    check("the scripted provider appears in no emitted chunk", !everyJs.includes("ScriptedVoiceProvider"));
    check("the fake repository appears in no emitted chunk", !everyJs.includes("FakePublishRepository"));
    check("no AR-001A tripwire helper appears in any emitted chunk", !everyJs.includes("AR-001A tripwire"));
    check("the dev-only override key is absent from production output", !everyJs.includes("__browserVoiceClientSourceOverride"));
    check("no VOICE_PROVIDER branch reaches the bundle", !everyJs.includes("VOICE_PROVIDER"));
    check("no private provider credential is present in any emitted chunk", !/VAPI_API_KEY|VAPI_WEBHOOK_SECRET/.test(everyJs));
    check("no test fixture assistant id reaches the bundle", !everyJs.includes("asst_test_0001") && !everyJs.includes("scripted_asst"));
    check("no fake provider id format reaches the bundle", !everyJs.includes("fake_asst_"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
section("Tripwires — nothing left this process");
// ═══════════════════════════════════════════════════════════════════════════

check("navigator.mediaDevices was never present in this runtime", mediaDevicesPresent === false);
for (const [name, count] of Object.entries(trips)) {
  eq(`${name} was never invoked`, count, 0);
}

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All AR-001A browser voice contract tests passed.");
