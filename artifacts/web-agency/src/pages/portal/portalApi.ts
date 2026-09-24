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
//
// Per tab also means a NEW tab starts without one — a customer following an
// emailed link while still signed in has a live session and no token. So when
// a write is refused for its token (`code: "csrf_token_invalid"`), this asks the
// server once for a fresh token for that live session and replays the write
// once. Never more than once, and never for a read.

const CSRF_KEY = "sitemint.portal.csrf";
const CSRF_HEADER = "x-portal-csrf";
const CSRF_TOKEN_INVALID_CODE = "csrf_token_invalid";
const CSRF_REISSUE_PATH = "/api/portal/session/csrf";
/** Cannot be sent by a form, and forces a CORS preflight for any other origin. */
const REISSUE_REQUEST_HEADER = "X-SiteMint-Request";

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

interface Answer {
  res: Response;
  data: Record<string, unknown>;
  /** The token this request carried, so recovery can tell whether it is already stale. */
  sentCsrf: string | null;
}

async function send(path: string, method: string, body: unknown, csrf?: string): Promise<Answer> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let sentCsrf: string | null = null;
  if (method !== "GET") {
    sentCsrf = csrf ?? portalCsrf();
    headers[CSRF_HEADER] = sentCsrf;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A dropped connection is not a server answer, and saying "something went
    // wrong" here would hide the one thing the reader can act on.
    throw new PortalError("We could not reach SiteMint. Check your connection and try again.", 0);
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* non-JSON */ }
  return { res, data, sentCsrf };
}

function outcome<T>({ res, data }: Answer): T {
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

type Recovery = { kind: "token"; token: string } | { kind: "signed-out" } | { kind: "failed" };

/** One shared request, however many writes were refused together. */
let reissueInflight: Promise<Recovery> | null = null;

async function reissuePortalCsrf(): Promise<Recovery> {
  let res: Response;
  try {
    res = await fetch(CSRF_REISSUE_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { [REISSUE_REQUEST_HEADER]: "1" },
    });
  } catch {
    return { kind: "failed" };
  }
  if (res.status === 401) return { kind: "signed-out" };
  if (!res.ok) return { kind: "failed" };
  try {
    const body = await res.json() as { csrfToken?: unknown };
    if (typeof body.csrfToken === "string" && body.csrfToken.length > 0) {
      setPortalCsrf(body.csrfToken);
      return { kind: "token", token: body.csrfToken };
    }
  } catch { /* an unreadable answer is a failed re-issue */ }
  return { kind: "failed" };
}

function recoverPortalCsrf(sentWith: string | null): Promise<Recovery> {
  if (reissueInflight) return reissueInflight;
  // Another write in this tab already fetched a newer token than the one this
  // request carried: use it rather than rotating the session's token again.
  const stored = portalCsrf();
  if (stored && stored !== sentWith) return Promise.resolve({ kind: "token", token: stored });
  const pending = reissuePortalCsrf();
  reissueInflight = pending;
  void pending.then(() => { if (reissueInflight === pending) reissueInflight = null; });
  return pending;
}

export async function portalFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const first = await send(path, method, init.body);

  if (method !== "GET" && first.res.status === 403 && first.data["code"] === CSRF_TOKEN_INVALID_CODE) {
    // The server's gate refuses a bad token before any handler runs, so the
    // refused write did nothing and replaying it once cannot do it twice.
    const recovery = await recoverPortalCsrf(first.sentCsrf);
    if (recovery.kind === "token") return outcome<T>(await send(path, method, init.body, recovery.token));
    if (recovery.kind === "signed-out") {
      throw new PortalError("Your session has ended. Sign in again to continue.", 401);
    }
  }
  return outcome<T>(first);
}

/** The portal's session state, as the UI needs to reason about it. */
export type PortalLoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: PortalError }
  | { status: "ready"; data: T };
