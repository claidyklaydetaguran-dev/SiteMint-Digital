/**
 * adminFetch — the ONE authenticated request helper for every CRM / admin call
 * in web-agency (O-10).
 *
 * Transition contract (2026-09): the backend owner is adding a persistent
 * httpOnly `admin_session` cookie. Until every deployment carries it, the
 * legacy in-memory bearer token (localStorage `adminToken`) must keep working.
 * So every request:
 *
 *   1. sends `credentials: "include"` — the cookie travels when it exists;
 *   2. adds `Authorization: Bearer <token>` when a token is stored and the
 *      caller did not set its own Authorization header.
 *
 * On a 401 the helper clears the stored token and dispatches ONE
 * `admin:unauthorized` window event (deduplicated until the next login or
 * until the guard re-arms it). `AdminRouteGuard` listens for that event and
 * opens its "Your session has ended" dialog OVER the page, which stays mounted,
 * so whatever the person had not saved is still there after they sign in again.
 * Pages no longer carry their own 401 branches.
 *
 * On a 403 carrying `code: "csrf_token_invalid"` — a live session whose security
 * token this browser no longer holds — a mutating request asks the server for a
 * fresh token once and replays itself once. See `recoverCsrfToken`.
 *
 * `adminFetch` returns the raw `Response` so existing call sites keep their
 * behaviour (`r.ok`, `r.json()`, `r.status`). The typed helpers
 * (`adminGet` / `adminPost` / `adminPatch` / `adminDelete`) parse JSON and
 * throw `AdminApiError` for non-2xx responses.
 */

import { reportRequestFailed, reportRequestSucceeded } from "./connectionState";
import { clearAllDrafts, setDraftOwner } from "./draftVault";

export const ADMIN_TOKEN_KEY = "adminToken";
export const ADMIN_UNAUTHORIZED_EVENT = "admin:unauthorized";
export const ADMIN_LOGIN_PATH = "/admin";

/**
 * M1 CSRF token for the per-person staff session.
 *
 * The session itself lives in an httpOnly cookie the browser sends
 * automatically — which is exactly why a cross-site page could otherwise
 * trigger authenticated writes. The server therefore also demands this value
 * in a header on every mutating request. It is deliberately readable by our
 * own JavaScript and useless to anybody who cannot run script on this origin.
 */
export const CSRF_TOKEN_KEY = "crmStaffCsrf";
export const CSRF_HEADER = "X-CSRF-Token";

/** The code the CRM gate puts on a refusal for a missing or out-of-date security token. */
export const CSRF_TOKEN_INVALID_CODE = "csrf_token_invalid";

/** Issues a fresh security token to the live staff session. Requires no token itself. */
export const CSRF_REISSUE_PATH = "/api/crm/staff/session/csrf";

/**
 * Sent on the re-issue request. No form can add a custom header, and a script
 * on another origin that adds one must first pass a CORS preflight the server's
 * allowlist refuses — which is what stops another site rotating the token of a
 * signed-in person.
 */
export const REISSUE_REQUEST_HEADER = "X-SiteMint-Request";

export function getCsrfToken(): string | null {
  return storage()?.getItem(CSRF_TOKEN_KEY) ?? null;
}

export function setCsrfToken(token: string): void {
  storage()?.setItem(CSRF_TOKEN_KEY, token);
  unauthorizedNotified = false;
}

export function clearCsrfToken(): void {
  storage()?.removeItem(CSRF_TOKEN_KEY);
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.body = body;
  }
}

/** True when the failure means "this backend does not provide the route yet". */
export function isNotProvided(err: unknown): boolean {
  return err instanceof AdminApiError && err.status === 404;
}

/** True when the failure is an authorization failure (401/403). */
export function isDenied(err: unknown): boolean {
  return err instanceof AdminApiError && (err.status === 401 || err.status === 403);
}

/**
 * The permission a 403 names, or null.
 *
 * The CRM gate answers a signed-in person who lacks a grant with
 * `{ error, permission }`. A 403 without that field is a different refusal —
 * in this CRM usually the CSRF check — and must not be presented as a missing
 * permission.
 */
export function missingPermission(err: unknown): string | null {
  if (!(err instanceof AdminApiError) || err.status !== 403) return null;
  const body = err.body;
  if (!body || typeof body !== "object") return null;
  const permission = (body as { permission?: unknown }).permission;
  return typeof permission === "string" && permission.length > 0 ? permission : null;
}

/** True when a response body is the gate's refusal for a missing or stale security token. */
export function isCsrfTokenRefusalBody(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { code?: unknown }).code === CSRF_TOKEN_INVALID_CODE;
}

/** Plain-language copy for a refusal. */
export interface RefusalCopy {
  title: string;
  detail: string;
  /** The grant the server named, when it named one. */
  permission: string | null;
}

/**
 * Words for a 401/403, or null when the error is not a refusal.
 *
 * Several different answers share those two codes and need different words: a
 * person missing a named grant, a request the server could not verify, an
 * unfinished multi-factor step, and a session that has ended. "You don't have
 * access" for all of them sends people to ask an owner for a permission they
 * may already hold.
 */
export function describeRefusal(err: unknown): RefusalCopy | null {
  if (!(err instanceof AdminApiError) || (err.status !== 401 && err.status !== 403)) return null;
  const permission = missingPermission(err);
  if (permission) {
    return {
      title: "Your account doesn't have permission for this.",
      detail: `It needs the ${permission} permission — ask an owner if you need it.`,
      permission,
    };
  }
  if (err.status === 401) {
    const body = err.body;
    const mfa = !!body && typeof body === "object" && (body as { mfaRequired?: unknown }).mfaRequired === true;
    return mfa
      ? { title: "Multi-factor verification is required.", detail: "Sign in again and complete the verification step.", permission: null }
      : { title: "Your session has ended.", detail: "Sign in again to continue.", permission: null };
  }
  if (isCsrfTokenRefusalBody(err.body)) {
    // By the time a caller sees this, adminFetch has already asked for a fresh
    // token and replayed the request once, so reloading will not help either.
    return {
      title: "This page's security token could not be renewed.",
      detail: "Try again in a moment. If it keeps happening, copy anything you haven't saved, then sign out and back in.",
      permission: null,
    };
  }
  return { title: "This request was refused.", detail: err.message, permission: null };
}

// ── Token storage ─────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getAdminToken(): string | null {
  return storage()?.getItem(ADMIN_TOKEN_KEY) ?? null;
}

export function setAdminToken(token: string): void {
  storage()?.setItem(ADMIN_TOKEN_KEY, token);
  // A fresh login re-arms the single unauthorized notice.
  unauthorizedNotified = false;
}

export function clearAdminToken(): void {
  storage()?.removeItem(ADMIN_TOKEN_KEY);
}

/** Login page URL carrying the path to return to after a successful sign-in. */
export function adminLoginPath(returnTo?: string): string {
  const target = returnTo ?? (typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : "");
  if (!target || !target.startsWith("/admin") || target === ADMIN_LOGIN_PATH) return ADMIN_LOGIN_PATH;
  return `${ADMIN_LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
}

// ── 401 → one event ───────────────────────────────────────────────────────────

let unauthorizedNotified = false;

/** Re-arm the single unauthorized notice (the guard calls this once access is verified). */
export function resetUnauthorizedNotice(): void {
  unauthorizedNotified = false;
}

function notifyUnauthorized(): void {
  clearAdminToken();
  clearCsrfToken();
  if (unauthorizedNotified) return;
  unauthorizedNotified = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
  }
}

// ── Core request ──────────────────────────────────────────────────────────────

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Routes whose 401 must NOT be read as "your session ended".
 *
 * Two groups, and neither is this workstream's to change:
 *
 *  - Receptionist-owned admin routes that still accept only the shared admin
 *    credential: the invite and beta-request queues under `/api/admin/voice/`
 *    (lib/admin-session.ts's own `requireAdmin`). The Receptionist Ops
 *    console's routes — `/api/admin/receptionist-accounts` and
 *    `/api/admin/voice/{firms,issues,usage,numbers}` — accept staff sessions
 *    now, so a 401 from them means the session really ended, and they are no
 *    longer listed. Nor is the legacy Discovery Portal's
 *    `/api/admin/submissions`, which moved to the operator gate and answers a
 *    staff session as that person.
 *  - CLAUDE.md-protected files: `routes/phone.ts` serves the CRM's SMS and
 *    call reads (`/crm/conversations`, `/crm/phone/*`, a lead's messages and
 *    send paths) and `routes/intakeAgent.ts` serves `/api/intake/*`. Both keep
 *    their own bearer-only guard, so a staff session is refused there.
 *
 * Without this, signing in as a person and opening the Command Center — which
 * asks for conversations, receptionist health and voice issues as optional
 * extras — bounced straight back to the login page. Every caller already
 * treats these as best-effort and renders an unavailable state instead.
 *
 * Remove an entry the moment its route accepts staff sessions. The protected
 * files need an owner-named authorization first; see docs/crm-ops/.
 */
const TRANSITIONAL_FOREIGN_AUTH: RegExp[] = [
  /^\/api\/admin\/voice\/(invites|beta-requests)(\/|\?|$)/,
  /^\/api\/crm\/conversations/,
  /^\/api\/crm\/phone\//,
  /^\/api\/crm\/leads\/\d+\/(messages|sms|call|sms-consent)/,
  /^\/api\/intake\//,
];

/**
 * Credential exchanges. A 401 here means "those credentials were not accepted",
 * not "your session ended". Reading a mistyped password or MFA code as a
 * sign-out wiped the security token the password step had just stored, so a
 * person who fumbled one code and then typed the right one reached the CRM
 * unable to save anything — and inside the session-ended dialog it would do the
 * same to the page being rescued.
 */
const CREDENTIAL_EXCHANGE: RegExp[] = [
  /^\/api\/crm\/staff\/(login|login\/mfa|bootstrap)(\?|$)/,
];

function ownsSessionSignal(path: string): boolean {
  return !TRANSITIONAL_FOREIGN_AUTH.some((re) => re.test(path))
    && !CREDENTIAL_EXCHANGE.some((re) => re.test(path));
}

interface Sent {
  res: Response;
  /** The security token the request carried, if it was a mutation. */
  csrf: string | null;
}

async function send(path: string, init: RequestInit, method: string, csrfOverride?: string): Promise<Sent> {
  const headers = new Headers(init.headers ?? undefined);
  const token = getAdminToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let csrf: string | null = null;
  if (MUTATING_METHODS.has(method)) {
    if (csrfOverride !== undefined) {
      headers.set(CSRF_HEADER, csrfOverride);
    } else {
      const stored = getCsrfToken();
      if (stored && !headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, stored);
    }
    csrf = headers.get(CSRF_HEADER);
  }
  // A completed request proves the transport works, whatever the server said;
  // a rejected fetch is the only thing that means "we could not reach it". An
  // HTTP 500 is a server problem, not a connection problem, and telling
  // somebody they are offline when they are not sends them to fix the wrong
  // thing.
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch (err) {
    reportRequestFailed();
    throw err;
  }
  reportRequestSucceeded();
  if (res.status === 401 && ownsSessionSignal(path)) notifyUnauthorized();
  return { res, csrf };
}

/** A stream can be read once; every other body can be sent again unchanged. */
function replayable(body: RequestInit["body"]): boolean {
  if (body === undefined || body === null) return true;
  return !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

async function isCsrfTokenRefusal(res: Response): Promise<boolean> {
  try {
    // A clone, so the caller can still read the body we inspected.
    return isCsrfTokenRefusalBody(await res.clone().json());
  } catch {
    return false;
  }
}

type CsrfRecovery =
  | { kind: "token"; token: string }
  /** The session had ended too. Each caller gets its own copy of the 401. */
  | { kind: "signed-out"; response: () => Response }
  | { kind: "failed" };

/** One re-issue request, shared by every write that was refused together. */
let reissueInflight: Promise<CsrfRecovery> | null = null;

async function reissueCsrfToken(): Promise<CsrfRecovery> {
  let res: Response;
  try {
    // Not through `send`: this call must never recurse into recovery, carries
    // no bearer and no token, and its 401 is handled right here.
    res = await fetch(CSRF_REISSUE_PATH, {
      method: "POST",
      credentials: "include",
      headers: { [REISSUE_REQUEST_HEADER]: "1" },
    });
  } catch {
    reportRequestFailed();
    return { kind: "failed" };
  }
  reportRequestSucceeded();
  if (res.status === 401) {
    const text = await res.text().catch(() => "");
    notifyUnauthorized();
    return {
      kind: "signed-out",
      response: () => new Response(text || JSON.stringify({ error: "Not signed in." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  if (!res.ok) return { kind: "failed" };
  try {
    const body = await res.json() as { csrfToken?: unknown };
    if (typeof body.csrfToken === "string" && body.csrfToken.length > 0) {
      setCsrfToken(body.csrfToken);
      return { kind: "token", token: body.csrfToken };
    }
  } catch { /* an unreadable answer is a failed re-issue */ }
  return { kind: "failed" };
}

/**
 * A token to replay a refused write with, obtained at most once per failure.
 *
 * Joins a re-issue already in flight. Otherwise, when the stored token is no
 * longer the one this request was sent with — another write or another tab
 * already renewed it — it uses that rather than rotating the session's token
 * again, which would invalidate the renewal that other request is about to use.
 */
function recoverCsrfToken(sentWith: string | null): Promise<CsrfRecovery> {
  if (reissueInflight) return reissueInflight;
  const stored = getCsrfToken();
  if (stored && stored !== sentWith) return Promise.resolve({ kind: "token", token: stored });
  const pending = reissueCsrfToken();
  reissueInflight = pending;
  void pending.then(() => { if (reissueInflight === pending) reissueInflight = null; });
  return pending;
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const first = await send(path, init, method);

  if (!MUTATING_METHODS.has(method) || first.res.status !== 403 || !replayable(init.body)) return first.res;
  if (!(await isCsrfTokenRefusal(first.res))) return first.res;

  // Every CRM gate checks the token before any handler runs — no route places
  // work ahead of it — so the refused write changed nothing, and replaying it
  // once cannot perform it twice. A second refusal is returned as it is: there
  // is no second re-issue and no loop.
  const recovery = await recoverCsrfToken(first.csrf);
  if (recovery.kind === "token") return (await send(path, init, method, recovery.token)).res;
  if (recovery.kind === "signed-out") return recovery.response();
  return first.res;
}

/**
 * A read that must NOT be treated as a sign-out when it 401s.
 *
 * Used to ask "is there a staff session?" while a legacy shared-bearer session
 * may still be the valid one. Routing that probe through `adminFetch` would
 * clear the stored token and fire `admin:unauthorized`, bouncing a
 * legitimately signed-in user to the login page.
 */
export async function adminProbe(path: string): Promise<Response> {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { method: "GET", headers, credentials: "include" });
}

// ── Typed JSON helpers ────────────────────────────────────────────────────────

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

function messageFor(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown };
    if (typeof b.error === "string" && b.error) return b.error;
    if (typeof b.message === "string" && b.message) return b.message;
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this resource.";
  if (status === 404) return "This backend does not provide that resource.";
  return `Request failed (${status}).`;
}

export async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(path, init);
  const body = await readBody(res);
  if (!res.ok) throw new AdminApiError(res.status, messageFor(res.status, body), body);
  return body as T;
}

export function adminGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  return adminJson<T>(path, { ...init, method: "GET" });
}

export function adminPost<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return adminJson<T>(path, { ...init, method: "POST", body: body === undefined ? init.body : JSON.stringify(body) });
}

export function adminPatch<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return adminJson<T>(path, { ...init, method: "PATCH", body: body === undefined ? init.body : JSON.stringify(body) });
}

export function adminDelete<T>(path: string, init: RequestInit = {}): Promise<T> {
  return adminJson<T>(path, { ...init, method: "DELETE" });
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Proper logout: ask the backend to end the cookie session (a 404 from an
 * older backend is ignored), then clear the legacy token.
 */
export async function adminLogout(): Promise<void> {
  // Signing out on purpose is not a session that ended on its own: a 401 from
  // an already-dead session must not open the session-ended dialog on the way
  // out. Re-armed in `finally`.
  unauthorizedNotified = true;
  // M1: end the per-person staff session first (it is the real session now),
  // then the legacy admin cookie. A 401/404 from either is fine — the point is
  // that the server forgets the session, not just this browser.
  try {
    await adminFetch("/api/crm/staff/logout", { method: "POST" });
  } catch { /* fall through */ }
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include", headers: authHeaderOnly() });
  } catch {
    // Network failure must never keep a user signed in client-side.
  } finally {
    clearAdminToken();
    clearCsrfToken();
    // Unsent scratch content belongs to the person who typed it, and a shared
    // machine is normal in a three-person agency. It goes at sign-out, before
    // the next person can reach an editor — not "eventually".
    clearAllDrafts();
    unauthorizedNotified = false;
  }
}

/**
 * Bind preserved drafts to the signed-in person.
 *
 * Call this once the staff identity is known. Switching accounts on a shared
 * machine discards the previous person's unsent content; see `draftVault`.
 */
export function bindDraftOwner(staffId: number | string | null): void {
  setDraftOwner(staffId);
}

function authHeaderOnly(): HeadersInit {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
