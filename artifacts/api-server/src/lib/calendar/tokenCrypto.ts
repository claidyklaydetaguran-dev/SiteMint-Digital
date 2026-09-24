// P4: at-rest encryption for per-firm OAuth material (refresh/access tokens,
// PKCE verifiers). AES-256-GCM with a server-held key; the database only
// ever stores an opaque envelope, and this module never logs or echoes
// plaintext or key material.
//
// Envelope format (single base64url string): iv(12) || tag(16) || ciphertext.
// Key: CALENDAR_TOKEN_KEY, base64/base64url of exactly 32 bytes. Fail-closed:
// a missing or malformed key means the calendar feature cannot store or read
// tokens — callers surface "not connected", never a weaker cipher.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CALENDAR_TOKEN_KEY_ENV_VAR = "CALENDAR_TOKEN_KEY";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/** Parses and validates the key. Throws TokenCryptoError; never logs the value. */
export function loadCalendarTokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env[CALENDAR_TOKEN_KEY_ENV_VAR];
  if (!raw) throw new TokenCryptoError(`${CALENDAR_TOKEN_KEY_ENV_VAR} is not set.`);
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new TokenCryptoError(`${CALENDAR_TOKEN_KEY_ENV_VAR} is not valid base64.`);
  }
  if (key.length !== 32) {
    throw new TokenCryptoError(`${CALENDAR_TOKEN_KEY_ENV_VAR} must decode to exactly 32 bytes.`);
  }
  return key;
}

export function isCalendarTokenKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    loadCalendarTokenKey(env);
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptToken(envelope: string, key: Buffer): string {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(envelope, "base64url");
  } catch {
    throw new TokenCryptoError("Token envelope is not valid base64url.");
  }
  if (bytes.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new TokenCryptoError("Token envelope is too short.");
  }
  const iv = bytes.subarray(0, IV_LENGTH);
  const tag = bytes.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = bytes.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Tamper or wrong key — indistinguishable by design.
    throw new TokenCryptoError("Token envelope failed authentication.");
  }
}
