// M4 preflight — static security verification of the calendar OAuth surface.
//
// No credential, no network, no database, no provider mutation: every input is
// a literal fixture. These cover the properties that must hold BEFORE an owner
// supplies Google credentials, so activation is a configuration step rather
// than a trust exercise.
//
// Scope note: the state-consumption and connection queries are firm-scoped at
// the SQL level (calendarConnectionsRepository.ts) and are exercised by the
// existing integration suite; what is asserted here is everything provable
// without a database.

import { describe, expect, it } from "vitest";
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
  buildGoogleAuthUrl,
  challengeFromVerifier,
  generateOauthState,
  generatePkcePair,
  hashOauthState,
  isCalendarConnectEnabled,
  loadGoogleOAuthConfig,
  GoogleOAuthConfigError,
} from "./googleOAuth.js";
import {
  CALENDAR_TOKEN_KEY_ENV_VAR,
  encryptToken,
  decryptToken,
  loadCalendarTokenKey,
  isCalendarTokenKeyConfigured,
  TokenCryptoError,
} from "./tokenCrypto.js";
import { isCalendarWriteEnabled } from "./calendarEventSync.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Read the TTL from source rather than importing the repository: that module
// constructs the database client at import time, and this suite must run with
// no DATABASE_URL, no credential, and no network.
const REPOSITORY_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "calendarConnectionsRepository.ts"),
  "utf8",
);

const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const REDIRECT = "https://site-mint-voice-staging.replit.app/api/receptionist/calendar/google/callback";
const CONFIG = { clientId: "fixture-client-id", clientSecret: "fixture-client-secret", redirectUri: REDIRECT };

describe("OAuth state integrity", () => {
  it("generates high-entropy, non-repeating state values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateOauthState());
    expect(seen.size).toBe(500);
    for (const s of seen) expect(s.length).toBeGreaterThanOrEqual(43);
  });

  it("stores only a SHA-256 hash of the state, never the state itself", () => {
    const state = generateOauthState();
    const hash = hashOauthState(state);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(state);
    expect(hashOauthState(state)).toBe(hash);
    expect(hashOauthState(generateOauthState())).not.toBe(hash);
  });

  it("bounds the state lifetime to a short, explicit window", () => {
    const match = REPOSITORY_SOURCE.match(/OAUTH_STATE_TTL_MS\s*=\s*([^;]+);/);
    expect(match).not.toBeNull();
    // eslint-disable-next-line no-eval
    const ttl = Number(eval(match![1] as string));
    expect(ttl).toBe(10 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("consumes a state exactly once, scoped to the firm that created it", () => {
    // The delete-returning is the one-time guarantee, and both predicates are
    // required: a state cannot be replayed, nor redeemed by another firm.
    expect(REPOSITORY_SOURCE).toMatch(/export async function consumeOauthState/);
    const body = REPOSITORY_SOURCE.slice(REPOSITORY_SOURCE.indexOf("export async function consumeOauthState"));
    expect(body).toMatch(/\.delete\(/);
    expect(body).toMatch(/\.returning\(/);
    expect(body).toMatch(/eq\(schedulingCalendarOauthStates\.firmId, firmId\)/);
    expect(body).toMatch(/eq\(schedulingCalendarOauthStates\.stateHash, stateHash\)/);
    // Expired states are swept before the lookup, so a stale state finds nothing.
    expect(body).toMatch(/lt\(schedulingCalendarOauthStates\.expiresAt, new Date\(\)\)/);
  });

  it("persists only encrypted material — never a raw token or verifier column", () => {
    expect(REPOSITORY_SOURCE).toMatch(/codeVerifierEnc/);
    expect(REPOSITORY_SOURCE).toMatch(/refreshTokenEnc/);
    expect(REPOSITORY_SOURCE).not.toMatch(/\brefreshToken\s*[,:]/);
    expect(REPOSITORY_SOURCE).not.toMatch(/\bcodeVerifier\s*[,:]/);
  });
});

describe("PKCE", () => {
  it("produces an S256 challenge of the correct length and derivation", () => {
    const { verifier, challenge } = generatePkcePair();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toBe(challengeFromVerifier(verifier));
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats a verifier", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generatePkcePair().verifier);
    expect(seen.size).toBe(200);
  });
});

describe("authorization URL", () => {
  const url = new URL(buildGoogleAuthUrl(CONFIG, "state-fixture", "challenge-fixture"));

  it("is pinned to Google's documented host", () => {
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_ENDPOINT);
    expect(GOOGLE_TOKEN_ENDPOINT).toBe("https://oauth2.googleapis.com/token");
  });

  it("requests offline access with forced consent, so a refresh token always arrives", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("requests exactly the two narrow scopes and nothing broader", () => {
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPES.join(" "));
    expect([...GOOGLE_CALENDAR_SCOPES]).toEqual([
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/calendar.events",
    ]);
    // Never the full-calendar or readonly-everything scopes.
    for (const scope of GOOGLE_CALENDAR_SCOPES) {
      expect(scope).not.toBe("https://www.googleapis.com/auth/calendar");
      expect(scope).not.toBe("https://www.googleapis.com/auth/calendar.readonly");
    }
  });

  it("never places the client secret in the authorization URL", () => {
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe("configuration is fail-closed and never echoes values", () => {
  it("requires every OAuth variable, naming only the variable", () => {
    const base = {
      GOOGLE_OAUTH_CLIENT_ID: CONFIG.clientId,
      GOOGLE_OAUTH_CLIENT_SECRET: CONFIG.clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI: REDIRECT,
    };
    const bad: Array<Record<string, string | undefined>> = [
      { ...base, GOOGLE_OAUTH_CLIENT_ID: undefined },
      { ...base, GOOGLE_OAUTH_CLIENT_SECRET: undefined },
      { ...base, GOOGLE_OAUTH_REDIRECT_URI: undefined },
      { ...base, GOOGLE_OAUTH_REDIRECT_URI: "not-a-url" },
      { ...base, GOOGLE_OAUTH_REDIRECT_URI: "http://insecure.example/callback" },
    ];
    for (const env of bad) {
      let thrown: unknown;
      try {
        loadGoogleOAuthConfig(env);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(GoogleOAuthConfigError);
      expect((thrown as Error).message).not.toContain(CONFIG.clientSecret);
      expect((thrown as Error).message).not.toContain(CONFIG.clientId);
    }
  });

  it("treats the connect flag as exact-'true', default off", () => {
    expect(isCalendarConnectEnabled({})).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: "TRUE" })).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: "1" })).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: " true" })).toBe(false);
    expect(isCalendarConnectEnabled({ CALENDAR_CONNECT_ENABLED: "true" })).toBe(true);
  });

  it("separates read capability from write capability", () => {
    // Connecting a calendar must not by itself authorize writing to it.
    expect(isCalendarWriteEnabled({ CALENDAR_CONNECT_ENABLED: "true" })).toBe(false);
    expect(isCalendarWriteEnabled({})).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "TRUE" })).toBe(false);
    expect(isCalendarWriteEnabled({ CALENDAR_WRITE_ENABLED: "true" })).toBe(true);
  });
});

describe("token at rest", () => {
  it("stores an opaque envelope that leaks neither plaintext nor key", () => {
    const key = loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: KEY_B64 });
    const secretish = "1//0g-a-refresh-token-shaped-value";
    const envelope = encryptToken(secretish, key);

    expect(envelope).not.toContain(secretish);
    expect(envelope).not.toContain(KEY_B64);
    expect(envelope).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decryptToken(envelope, key)).toBe(secretish);
  });

  it("produces a distinct envelope every time (fresh IV)", () => {
    const key = loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: KEY_B64 });
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(encryptToken("same-plaintext", key));
    expect(seen.size).toBe(50);
  });

  it("rejects a wrong key and a tampered envelope alike", () => {
    const key = loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: KEY_B64 });
    const other = Buffer.alloc(32, 9);
    const envelope = encryptToken("plaintext", key);

    expect(() => decryptToken(envelope, other)).toThrow();
    const bytes = Buffer.from(envelope, "base64url");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptToken(bytes.toString("base64url"), key)).toThrow();
  });

  it("refuses a malformed key rather than falling back to a weaker cipher", () => {
    for (const raw of [undefined, "", "not-base64!!", Buffer.alloc(16, 1).toString("base64")]) {
      expect(isCalendarTokenKeyConfigured({ [CALENDAR_TOKEN_KEY_ENV_VAR]: raw })).toBe(false);
      let thrown: unknown;
      try {
        loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: raw });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(TokenCryptoError);
      if (raw) expect((thrown as Error).message).not.toContain(raw);
    }
  });

  it("accepts a correctly sized key in either base64 flavour", () => {
    const raw = Buffer.alloc(32, 3);
    expect(loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: raw.toString("base64") })).toEqual(raw);
    expect(loadCalendarTokenKey({ [CALENDAR_TOKEN_KEY_ENV_VAR]: raw.toString("base64url") })).toEqual(raw);
  });
});
