// ── M1: staff credential primitives ─────────────────────────────────────────
//
// Password hashing, opaque-token hashing, TOTP, and recovery codes, built on
// node:crypto only. No new workspace dependency is introduced: scrypt is a
// memory-hard KDF that OWASP accepts for password storage, and TOTP (RFC 6238)
// is HMAC-SHA1 over a time counter, which node:crypto already provides.
//
// Nothing here ever logs, returns, or throws a secret.

import crypto from "crypto";
import { promisify } from "util";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// ── Passwords ───────────────────────────────────────────────────────────────
//
// N=2^16, r=8, p=1 needs ~67 MB per hash, so `maxmem` must be raised above
// node's 32 MB default or scrypt refuses to run. Parameters are stored inside
// the encoded hash, so they can be raised later without invalidating existing
// passwords — verify reads whatever the stored record says.

const SCRYPT_N = 65536;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 96 * 1024 * 1024;

/** Encoded as `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(plain.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Timing-safe. Returns false for a malformed or absent record rather than throwing. */
export async function verifyPassword(plain: string, encoded: string | null | undefined): Promise<boolean> {
  if (!encoded) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt: Buffer; let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch { return false; }
  if (expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N, r, p, maxmem: SCRYPT_MAXMEM,
    });
  } catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Minimum bar for a staff password. Length is the dominant factor, so this
 * asks for 12 characters rather than a symbol/digit alphabet puzzle.
 * Returns a human-readable reason, or undefined when acceptable.
 */
export function refusePassword(plain: string): string | undefined {
  if (plain.length < 12) return "Use at least 12 characters.";
  if (plain.length > 200) return "Use at most 200 characters.";
  if (!/[^\s]/.test(plain)) return "Use at least 12 non-blank characters.";
  const lowered = plain.toLowerCase();
  for (const banned of ["password", "sitemint", "123456", "qwerty", "letmein"]) {
    if (lowered.includes(banned)) return "That password contains an easily guessed word.";
  }
  return undefined;
}

// ── Opaque tokens (sessions, invites, resets, CSRF) ─────────────────────────
//
// These are 256-bit random values, not user-chosen secrets, so a fast digest
// is the correct choice — there is nothing to brute-force. Only the digest is
// ever stored.

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** Accept the neighbouring steps so a slightly skewed clock still works. */
const TOTP_WINDOW = 1;

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) return Buffer.alloc(0);
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  if (key.length === 0) return "";
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** Verifies a 6-digit code against the secret, tolerating ±1 time step. */
export function verifyTotp(secret: string | null | undefined, code: string, now: Date = new Date()): boolean {
  if (!secret) return false;
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift++) {
    const candidate = totpAt(secret, counter + drift);
    if (candidate.length === TOTP_DIGITS
      && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

/** The `otpauth://` URI an authenticator app scans. Contains the secret — never log it. */
export function totpEnrolmentUri(secret: string, accountEmail: string): string {
  const label = encodeURIComponent(`SiteMint CRM:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=SiteMint%20CRM&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

// ── Recovery codes ──────────────────────────────────────────────────────────
//
// Shown once at enrolment, stored only as hashes, and consumed on use — so
// losing the authenticator never means losing the account, and a stolen
// database still does not yield a usable code.

/**
 * 64 bits of entropy each (8 random bytes), formatted in four groups for
 * transcription. That entropy is what lets these be stored under a fast digest
 * rather than scrypt: there is no low-entropy guess space to grind, so a
 * stolen database still yields nothing, and enrolment stays instant instead of
 * running ten memory-hard hashes in one request.
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(8).toString("hex").toUpperCase(); // 16 chars
    return raw.match(/.{4}/g)!.join("-");
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function hashRecoveryCodes(codes: string[]): string[] {
  return codes.map((c) => hashToken(normalizeRecoveryCode(c)));
}

/**
 * Finds which stored hash a submitted recovery code matches. Returns the index
 * so the caller can consume exactly that one, or -1 when none match.
 */
export function findRecoveryCodeIndex(submitted: string, hashes: string[]): number {
  const normalized = normalizeRecoveryCode(submitted);
  if (normalized.length === 0) return -1;
  const digest = hashToken(normalized);
  return hashes.findIndex((stored) =>
    stored.length === digest.length
    && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(digest)));
}
