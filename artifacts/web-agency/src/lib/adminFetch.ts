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
 * redirects to `/admin?redirect=<current path>` exactly once. Pages no longer
 * carry their own 401 branches.
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
 *  - Receptionist-owned admin routes (`/api/admin/receptionist-accounts`,
 *    `/api/admin/voice/*`), which still accept only the legacy shared bearer.
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
  /^\/api\/admin\/receptionist-accounts/,
  /^\/api\/admin\/voice\//,
  /^\/api\/crm\/conversations/,
  /^\/api\/crm\/phone\//,
  /^\/api\/crm\/leads\/\d+\/(messages|sms|call|sms-consent)/,
  /^\/api\/intake\//,
];

function ownsSessionSignal(path: string): boolean {
  return !TRANSITIONAL_FOREIGN_AUTH.some((re) => re.test(path));
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined);
  const token = getAdminToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (init.method ?? "GET").toUpperCase();
  const csrf = getCsrfToken();
  if (csrf && MUTATING_METHODS.has(method) && !headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, csrf);
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
  return res;
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
