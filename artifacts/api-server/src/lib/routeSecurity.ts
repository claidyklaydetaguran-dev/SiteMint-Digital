// R6 — a durable, committed contract over every mutating route this API
// exposes.
//
// The AR-002B-R5 audit found two unauthenticated public writers by hand. A
// one-off audit rots the moment someone adds a route, so this module turns
// that audit into something CI re-derives from source on every run:
// `discoverMutatingRoutes` parses the route registrations, `detectProtection`
// reports which protection signals each one carries, and the committed
// manifest in routeSecurity.manifest.ts records the classification every route
// is expected to keep. routeSecurity.test.ts fails when the two disagree.
//
// A note on the parser, because it hid a real bug once. Route bodies are
// bounded by the NEXT route registration of ANY verb — not just the next
// mutating one. Bounding only on mutating verbs let `POST /landing-test/view`
// run past its own handler into the `GET /landing-test/stats` that follows,
// pick up that route's `requireAdmin`, and report itself protected while it
// was in fact an open analytics writer. The test asserts this specific
// regression directly.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** How a mutating route is allowed to be reachable. */
export type Protection =
  | "admin" // CRM/admin bearer token middleware
  | "session" // receptionist httpOnly-cookie session
  | "signature" // provider webhook with a verified signature
  | "credential" // validates a credential presented in the request itself
  | "token-proven" // single-use emailed token proves the caller
  | "feature-flag" // default-off capability flag (fail-closed)
  | "unauthenticated"; // deliberately open — must be allowlisted with a reason

export interface MutatingRoute {
  /** Full source of the file the route was declared in. */
  fileSource: string;
  /** Repo-relative source file. */
  file: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path as registered, i.e. without the `/api` mount prefix. */
  path: string;
  /** Unique key used by the manifest. */
  key: string;
  /** Source between the path literal and the handler's parameter list. */
  chain: string;
  /** Handler source, bounded by the next route registration of any verb. */
  body: string;
}

const MUTATING = /(?:router|app)\.(post|put|patch|delete)\(\s*(["'`])([^"'`]*)\2/g;
const ANY_ROUTE = /(?:router|app)\.(get|post|put|patch|delete|all|use)\(\s*(["'`])([^"'`]*)\2/g;

/** Middleware names that establish protection when they appear in the chain. */
const CHAIN_SIGNALS: Array<[RegExp, Protection]> = [
  [/\brequireAdmin\b/, "admin"],
  [/\brequireReceptionistAuth\b/, "session"],
  [/\bvalidateTwilioWebhook\b/, "signature"],
  [/\bvalidateIntakeTwilioSignature\b/, "signature"],
];

/** Guards applied inside the handler rather than as middleware. */
const BODY_SIGNALS: Array<[RegExp, Protection]> = [
  [/\brequireAdmin\b/, "admin"],
  [/\brequireReceptionistAuth\b/, "session"],
  [/\bauthenticateVapiWebhook\b/, "signature"],
  [/\bverifyTwilioSignature\b/, "signature"],
  [/\bverifyStripeSignature\b/, "signature"],
  [/\bvalidateTwilioWebhook\b/, "signature"],
  [/\bvalidateIntakeTwilioSignature\b/, "signature"],
  [/RESEND_WEBHOOK_SECRET|\bWebhook\s*\(|\bsvix\b/, "signature"],
  [/STRIPE_WEBHOOK_SECRET|stripe-signature/, "signature"],
  [/\bdestroySession\s*\(/, "session"],
  [/\bverifyAdminPassword\b/, "credential"],
  [/\bvalidateToken\s*\(/, "credential"],
  [/\bverifyPassword\b|\bbcrypt\.compare\b/, "credential"],
  [/\bcompletePasswordReset\b|\bacceptInvitation\b|\bconfirmEmailVerification\b|\bconsumeAccountToken\b/, "token-proven"],
  [/\bisPublic(Registration|FormSubmissions|AnalyticsWrites|SchedulingRequests|BetaRequests|Demo)Enabled\b/, "feature-flag"],
  [/\bisAiToolkitCheckoutEnabled\b/, "feature-flag"],
  [/\bisPasswordResetRequestsEnabled\b/, "feature-flag"],
  [/\bisInviteSignupEnabled\b/, "feature-flag"],
];

/**
 * Source of every same-file function the body calls, concatenated.
 *
 * Several routes are thin wrappers that delegate to a named handler defined
 * beside them — `POST /v1/discovery-submissions` calls
 * `handleDiscoverySubmission`, and the voice SMS webhooks call a local
 * `requireVerified` that performs the Twilio signature check. Without this,
 * those routes look unprotected when they are not, and — worse — a guard could
 * later be deleted from the delegate without this contract noticing. One level
 * is enough for every delegation in this codebase today; a deeper chain shows
 * up as an unclassified route, which fails the test rather than passing
 * silently.
 */
function inlineLocalCallees(src: string, body: string): string {
  const defRe =
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm;
  const starts: Array<{ name: string; at: number }> = [];
  for (let d = defRe.exec(src); d; d = defRe.exec(src)) {
    starts.push({ name: (d[1] ?? d[2]) as string, at: d.index });
  }
  // A definition ends at the next definition OR the next route registration,
  // whichever comes first. Without the route bound, a helper declared above a
  // block of routes would absorb those routes' text and hand their middleware
  // to whoever calls the helper — manufacturing protection that isn't there.
  // That false positive is more dangerous than an unclassified route, because
  // it reads as "safe".
  const routeAt: number[] = [];
  const routeRe = /(?:router|app)\.(get|post|put|patch|delete|all|use)\s*\(/g;
  for (let r = routeRe.exec(src); r; r = routeRe.exec(src)) routeAt.push(r.index);
  const defs = new Map<string, string>();
  for (let i = 0; i < starts.length; i++) {
    const nextDef = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const nextRoute = routeAt.find((x) => x > starts[i].at) ?? src.length;
    defs.set(starts[i].name, src.slice(starts[i].at, Math.min(nextDef, nextRoute)));
  }
  const called = new Set(
    (body.match(/\b([A-Za-z_$][\w$]*)\s*\(/g) ?? []).map((c) => c.slice(0, c.indexOf("(")).trim()),
  );
  let out = "";
  for (const name of called) {
    const def = defs.get(name);
    if (def) out += "\n" + def;
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * Parse every mutating route registration under `routesDir`.
 *
 * `rootDir` is used only to make reported paths repo-relative.
 */
export function discoverMutatingRoutes(routesDir: string, appFile?: string): MutatingRoute[] {
  const routes: MutatingRoute[] = [];
  const files = walk(routesDir).sort();
  // app.ts registers the Stripe webhook directly on the app, before the router
  // is mounted, so it is not reachable by walking routes/ alone. Its paths are
  // already absolute (they include the /api prefix).
  if (appFile) files.push(appFile);
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    const isApp = abs === appFile;
    const file = isApp ? "app.ts" : abs.slice(routesDir.length + 1).replace(/\\/g, "/");

    const bounds: number[] = [];
    ANY_ROUTE.lastIndex = 0;
    for (let b = ANY_ROUTE.exec(src); b; b = ANY_ROUTE.exec(src)) bounds.push(b.index);

    MUTATING.lastIndex = 0;
    for (let m = MUTATING.exec(src); m; m = MUTATING.exec(src)) {
      const after = MUTATING.lastIndex;
      const next = bounds.find((x) => x > m.index);
      const body = src.slice(after, next ?? src.length);
      const handlerAt = body.search(/async\s*\(|\(\s*_?req\b/);
      routes.push({
        fileSource: src,
        file,
        method: m[1].toUpperCase() as MutatingRoute["method"],
        path: m[3],
        key: `${m[1].toUpperCase()} ${isApp ? m[3] : `/api${m[3]}`}`,
        chain: handlerAt > 0 ? body.slice(0, handlerAt) : "",
        body: body + inlineLocalCallees(src, body),
      });
    }
  }
  return routes;
}

/**
 * What a route can do if it executes.
 *
 * Used to enforce R7's rule that an allowlisted open route must be incapable of
 * persisting data or initiating an external action. It is a SOURCE scan, so it
 * sees the route body plus same-file callees — it cannot follow a call into
 * another module. That limit is deliberate and load-bearing: an allowlist entry
 * whose work happens in an imported function cannot be proven safe here, so the
 * manifest requires such a route to declare its effects explicitly and the test
 * refuses to treat "detector found nothing" as proof on its own.
 */
export type SideEffect = "db-write" | "external";

const SIDE_EFFECT_SIGNALS: Array<[RegExp, SideEffect]> = [
  [/\.insert\s*\(/, "db-write"],
  [/\.update\s*\(/, "db-write"],
  [/\.delete\s*\(/, "db-write"],
  [/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i, "db-write"],
  [/\bissueAccountToken\b|\brecordAudit\b/, "db-write"],
  [/\bsubmitAppointmentRequest\b|\bcreateAppointmentRequest\b/, "db-write"],
  [/\bfetch\s*\(/, "external"],
  [/\bsendEmail\b|\bsendFormEmails\b|\bsendAiToolkitDeliveryEmail\b/, "external"],
  [/\bstripe\.|checkout\.sessions\.create/, "external"],
  [/\btwilio\b|\bsendSms\b/i, "external"],
];

/** Side effects detectable in the route body and its same-file callees. */
export function detectSideEffects(route: MutatingRoute): SideEffect[] {
  const found = new Set<SideEffect>();
  for (const [re, e] of SIDE_EFFECT_SIGNALS) if (re.test(route.body)) found.add(e);
  return [...found].sort();
}

/**
 * True when the handler delegates to a function imported from another module.
 *
 * Such a route cannot be proven side-effect-free by this source scan, so the
 * test refuses to accept "the detector found nothing" as proof for it.
 */
export function callsImportedFunction(route: MutatingRoute): boolean {
  const imported = new Set<string>();
  const importRe = /import\s*{([^}]*)}\s*from/g;
  for (let m = importRe.exec(route.fileSource); m; m = importRe.exec(route.fileSource)) {
    for (const part of (m[1] as string).split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (name) imported.add(name.trim());
    }
  }
  const called = new Set(
    (route.body.match(/\b([A-Za-z_$][\w$]*)\s*\(/g) ?? []).map((c) => c.slice(0, c.indexOf("(")).trim()),
  );
  for (const name of called) if (imported.has(name)) return true;
  return false;
}

/** Every protection signal the route carries, deduplicated and sorted. */
export function detectProtection(route: MutatingRoute): Protection[] {
  const found = new Set<Protection>();
  for (const [re, p] of CHAIN_SIGNALS) if (re.test(route.chain)) found.add(p);
  for (const [re, p] of BODY_SIGNALS) if (re.test(route.body)) found.add(p);
  return [...found].sort();
}
