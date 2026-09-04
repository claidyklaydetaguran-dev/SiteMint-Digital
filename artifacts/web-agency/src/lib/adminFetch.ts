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

export const ADMIN_TOKEN_KEY = "adminToken";
export const ADMIN_UNAUTHORIZED_EVENT = "admin:unauthorized";
export const ADMIN_LOGIN_PATH = "/admin";

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
  if (unauthorizedNotified) return;
  unauthorizedNotified = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
  }
}

// ── Core request ──────────────────────────────────────────────────────────────

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined);
  const token = getAdminToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  if (res.status === 401) notifyUnauthorized();
  return res;
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
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include", headers: authHeaderOnly() });
  } catch {
    // Network failure must never keep a user signed in client-side.
  } finally {
    clearAdminToken();
    unauthorizedNotified = false;
  }
}

function authHeaderOnly(): HeadersInit {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
