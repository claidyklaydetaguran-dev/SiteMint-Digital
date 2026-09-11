// ── M4: the customer portal's only way of talking to the server ─────────────
//
// Deliberately NOT `adminFetch`. That helper carries the CRM's bearer token and
// its `x-csrf-token` header, and a customer must never be holding either. The
// portal's credential is an httpOnly `crm_portal_session` cookie the browser
// sends on its own; the only thing this file has to add is the double-submit
// CSRF token on mutations.
//
// Where the CSRF token lives: `sessionStorage`, per tab. It is not the session
// — the session cookie is, and JavaScript cannot read it — so storing this
// value where script can reach it gives an attacker nothing on its own. It has
// to survive a page refresh, and the cookie it pairs with cannot be read back
// to re-derive it, so a per-tab store is the honest place for it.

const CSRF_KEY = "sitemint.portal.csrf";
const CSRF_HEADER = "x-portal-csrf";

export function setPortalCsrf(token: string): void {
  try { sessionStorage.setItem(CSRF_KEY, token); } catch { /* private mode */ }
}

export function portalCsrf(): string {
  try { return sessionStorage.getItem(CSRF_KEY) ?? ""; } catch { return ""; }
}

export function clearPortalCsrf(): void {
  try { sessionStorage.removeItem(CSRF_KEY); } catch { /* private mode */ }
}

/** Thrown for anything the caller should show as an error with a Retry. */
export class PortalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PortalError";
  }
  /** True when signing in again is the fix, rather than retrying. */
  get needsSignIn(): boolean { return this.status === 401; }
}

export async function portalFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers[CSRF_HEADER] = portalCsrf();

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // A dropped connection is not a server answer, and saying "something went
    // wrong" here would hide the one thing the reader can act on.
    throw new PortalError("We could not reach SiteMint. Check your connection and try again.", 0);
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* non-JSON */ }

  if (!res.ok) {
    const message = typeof data["error"] === "string"
      ? data["error"]
      : res.status === 404
        ? "We could not find that."
        : "Something went wrong at our end.";
    throw new PortalError(message, res.status);
  }
  return data as T;
}

/** The portal's session state, as the UI needs to reason about it. */
export type PortalLoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: PortalError }
  | { status: "ready"; data: T };
