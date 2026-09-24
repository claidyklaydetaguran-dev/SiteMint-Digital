// ── Security-token (CSRF) refusal and recovery ──────────────────────────────
//
// Two cookie-session systems in this server use a double-submit token: the CRM
// staff session (`crm_staff_session` + `x-csrf-token`) and the customer portal
// (`crm_portal_session` + `x-portal-csrf`). In both, the raw token is handed to
// the browser once and only its sha256 is kept on the session row, so the
// server can check a token but can never hand the same one back.
//
// That made a lost token unrecoverable. The browser keeps the value in script-
// readable storage, and storage gets cleared — by a sign-out elsewhere, another
// tab, a cleanup, or simply opening the portal in a new tab — while the session
// cookie stays perfectly valid. Every write then failed, and the message told
// people to refresh the page, which could not help. This module holds the pieces
// both systems share: the refusal they answer with, and the checks in front of
// the endpoints that issue a fresh token for a session that is still alive.
//
// It shares no cookie, no table and no header value between the two systems.
// Each re-issue endpoint resolves its OWN session and rotates its OWN hash.

import type { Request, Response } from "express";
import { isOriginAllowed, resolveCorsPolicy, type CorsPolicyEnv } from "./corsPolicy.js";
import { SlidingWindowLimiter } from "./contactProtection.js";

// ── The refusal ─────────────────────────────────────────────────────────────

/** Machine-readable, so a client can tell this apart from a permission refusal. */
export const CSRF_TOKEN_INVALID_CODE = "csrf_token_invalid";

/**
 * Says what is actually wrong. It used to say "Refresh the page and try again",
 * which was untrue: the token lives in storage a refresh does not touch.
 */
export const CSRF_TOKEN_INVALID_MESSAGE = "This page's security token is missing or out of date.";

/** The one answer both gates give a mutating request whose token does not match. Status stays 403. */
export function refuseInvalidCsrfToken(res: Response): void {
  res.status(403).json({ error: CSRF_TOKEN_INVALID_MESSAGE, code: CSRF_TOKEN_INVALID_CODE });
}

// ── Who may ask for a fresh token ───────────────────────────────────────────
//
// A re-issue endpoint cannot require the token it exists to replace, so it needs
// a different defence against being driven by another site. Three layers, and
// the reasoning matters more than the code:
//
//  1. The session cookie. `crm_staff_session` and `crm_portal_session` are both
//     set `httpOnly`, `secure` in production and `SameSite=Lax`. Lax means a
//     browser does not attach them to a cross-site `fetch`, XHR, iframe or form
//     POST — only to a top-level GET navigation. A page on another site cannot
//     make this POST carry the session at all, so it is answered 401. (The
//     cookie is set explicitly Lax, so the old two-minute "Lax+POST" allowance
//     browsers gave cookies WITHOUT a SameSite attribute does not apply.)
//
//  2. A custom request header, `X-SiteMint-Request: 1`. No HTML form can send
//     one, and a script on another origin that adds one turns the request into
//     a non-simple request, which the browser must preflight. The credentialed
//     CORS allowlist (lib/corsPolicy.ts) approves only listed origins, so for
//     anyone else the real POST is never sent. This is what closes the gap Lax
//     leaves open: a SAME-site page (a sibling subdomain) does get the cookie,
//     but still cannot send the header without an approved preflight. Without
//     this layer such a page could not read the new token (CORS) but could
//     still ROTATE it, silently breaking the person's open tabs.
//
//  3. The `Origin` header, when present, must be one the same CORS policy
//     resolution app.ts uses would approve — or this request's own host, which
//     is what a same-origin deployment (the CRM served from the API's own
//     domain) sends and may not list. Same-host is safe to accept precisely
//     because of layer 1: cookies are bound to our host, so a page that merely
//     claims our host through DNS tricks never carries our session. When a
//     browser sends no Origin (it always does for POST today), `Sec-Fetch-Site`
//     must be same-origin, same-site or none if present. A caller with neither
//     header is not a browser, and a non-browser caller holding the session
//     cookie already holds everything this endpoint could give it.
//
// None of this is an authentication step. The session cookie is; these only
// decide whether a browser request plausibly came from our own pages.

export const REISSUE_REQUEST_HEADER = "x-sitemint-request";

export const REISSUE_REFUSED_CODE = "reissue_request_refused";

export type ReissueRefusal = "missing_request_header" | "origin_not_allowed" | "cross_site_fetch";

const SAFE_FETCH_SITES: ReadonlySet<string> = new Set(["same-origin", "same-site", "none"]);

function headerValue(req: Pick<Request, "headers">, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : undefined;
}

/** True when `origin` is the exact origin of the host this request was addressed to. */
function isSameHostOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false; // includes the opaque "null" origin
  }
  if (parsed.origin !== origin) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.host === host.trim().toLowerCase();
}

function originPermitted(origin: string, host: string | undefined, env: CorsPolicyEnv): boolean {
  try {
    if (isOriginAllowed(origin, resolveCorsPolicy(env))) return true;
  } catch {
    // An unusable policy approves nothing. In production app.ts has already
    // refused to start with one, so this only matters in development.
  }
  return isSameHostOrigin(origin, host);
}

/**
 * Why a token re-issue request must be refused, or undefined when it may
 * proceed to the session check. Pure: the environment is an argument.
 */
export function reissueRefusal(
  req: Pick<Request, "headers">,
  env: CorsPolicyEnv = process.env,
): ReissueRefusal | undefined {
  if (headerValue(req, REISSUE_REQUEST_HEADER) !== "1") return "missing_request_header";
  const origin = headerValue(req, "origin");
  if (origin !== undefined) {
    return originPermitted(origin, headerValue(req, "host"), env) ? undefined : "origin_not_allowed";
  }
  const site = headerValue(req, "sec-fetch-site");
  if (site !== undefined && !SAFE_FETCH_SITES.has(site)) return "cross_site_fetch";
  return undefined;
}

/** Answers the refusal when the request did not come from our own pages. True when it answered. */
export function refuseCrossSiteReissue(req: Request, res: Response): boolean {
  if (!reissueRefusal(req)) return false;
  res.status(403).json({
    error: "A new security token can only be requested from SiteMint's own pages.",
    code: REISSUE_REFUSED_CODE,
  });
  return true;
}

// ── Rate limiting ───────────────────────────────────────────────────────────
//
// A browser only asks after a write was refused for its token, which is rare.
// The limit is per session and generous enough for a person switching between
// several tabs, while stopping a runaway client from rotating a session's token
// in a tight loop. It bounds abuse; it is not access control.

export const CSRF_REISSUE_LIMIT = 20;
export const CSRF_REISSUE_WINDOW_MS = 15 * 60 * 1000;

export function createReissueLimiter(): SlidingWindowLimiter {
  const limiter = new SlidingWindowLimiter(CSRF_REISSUE_LIMIT, CSRF_REISSUE_WINDOW_MS);
  setInterval(() => limiter.purgeStale(), 5 * 60 * 1000).unref();
  return limiter;
}

export function refuseTooManyReissues(res: Response): void {
  res.status(429).json({ error: "Too many security token requests. Wait a few minutes and try again." });
}

/** The token is a credential for this session: never cached by anything in between. */
export function sendReissuedToken(res: Response, csrfToken: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.json({ csrfToken });
}
