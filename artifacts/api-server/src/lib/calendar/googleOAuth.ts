// P4: Google OAuth 2.0 (authorization-code + PKCE S256) for per-firm
// calendar connections — pure protocol logic with an injectable transport.
// Nothing here performs a network request unless the caller supplies (or
// the production route explicitly invokes) the transport; tests use fakes,
// and no live Google credential exists in any environment yet.
//
// Endpoints are PINNED to Google's documented hosts. The client id/secret
// and redirect URI come only from server env (validated https redirect);
// nothing request-supplied can alter where a token request goes.

import { createHash, randomBytes } from "node:crypto";

export const CALENDAR_CONNECT_ENABLED_ENV_VAR = "CALENDAR_CONNECT_ENABLED";
export const GOOGLE_OAUTH_CLIENT_ID_ENV_VAR = "GOOGLE_OAUTH_CLIENT_ID";
export const GOOGLE_OAUTH_CLIENT_SECRET_ENV_VAR = "GOOGLE_OAUTH_CLIENT_SECRET";
export const GOOGLE_OAUTH_REDIRECT_URI_ENV_VAR = "GOOGLE_OAUTH_REDIRECT_URI";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** freebusy read + events write; the narrowest pair that books appointments. */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export function isCalendarConnectEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[CALENDAR_CONNECT_ENABLED_ENV_VAR] === "true";
}

export class GoogleOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthConfigError";
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Fail-closed config load; messages name variables and rules, never values. */
export function loadGoogleOAuthConfig(env: Record<string, string | undefined> = process.env): GoogleOAuthConfig {
  const clientId = env[GOOGLE_OAUTH_CLIENT_ID_ENV_VAR];
  const clientSecret = env[GOOGLE_OAUTH_CLIENT_SECRET_ENV_VAR];
  const redirectUri = env[GOOGLE_OAUTH_REDIRECT_URI_ENV_VAR];
  if (!clientId) throw new GoogleOAuthConfigError(`${GOOGLE_OAUTH_CLIENT_ID_ENV_VAR} is not set.`);
  if (!clientSecret) throw new GoogleOAuthConfigError(`${GOOGLE_OAUTH_CLIENT_SECRET_ENV_VAR} is not set.`);
  if (!redirectUri) throw new GoogleOAuthConfigError(`${GOOGLE_OAUTH_REDIRECT_URI_ENV_VAR} is not set.`);
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new GoogleOAuthConfigError(`${GOOGLE_OAUTH_REDIRECT_URI_ENV_VAR} must be a valid absolute URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new GoogleOAuthConfigError(`${GOOGLE_OAUTH_REDIRECT_URI_ENV_VAR} must use https.`);
  }
  return { clientId, clientSecret, redirectUri };
}

// ── PKCE ─────────────────────────────────────────────────────────────────────

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url"); // 64 chars, within 43..128
  return { verifier, challenge: challengeFromVerifier(verifier) };
}

export function challengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function generateOauthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOauthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

// ── authorization URL ────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // guarantees a refresh_token on re-connect
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ── token exchange / refresh (injectable transport) ──────────────────────────

/** Minimal HTTP shape so tests never need a socket. */
export type OAuthTransport = (
  url: string,
  form: Record<string, string>,
) => Promise<{ status: number; body: unknown }>;

export const defaultOAuthTransport: OAuthTransport = async (url, form) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
};

export type TokenResult =
  | { ok: true; accessToken: string; expiresInSec: number; refreshToken?: string; scope?: string }
  | { ok: false; reason: "invalid_grant" | "provider_error" };

function parseTokenResponse(status: number, body: unknown): TokenResult {
  if (status === 200 && typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.access_token === "string" && typeof record.expires_in === "number") {
      return {
        ok: true,
        accessToken: record.access_token,
        expiresInSec: record.expires_in,
        ...(typeof record.refresh_token === "string" ? { refreshToken: record.refresh_token } : {}),
        ...(typeof record.scope === "string" ? { scope: record.scope } : {}),
      };
    }
  }
  const error =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : undefined;
  return { ok: false, reason: error === "invalid_grant" ? "invalid_grant" : "provider_error" };
}

export async function exchangeAuthorizationCode(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
  transport: OAuthTransport = defaultOAuthTransport,
): Promise<TokenResult> {
  const { status, body } = await transport(GOOGLE_TOKEN_ENDPOINT, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
  });
  return parseTokenResponse(status, body);
}

export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  transport: OAuthTransport = defaultOAuthTransport,
): Promise<TokenResult> {
  const { status, body } = await transport(GOOGLE_TOKEN_ENDPOINT, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return parseTokenResponse(status, body);
}
