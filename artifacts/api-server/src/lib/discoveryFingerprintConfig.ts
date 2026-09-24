/**
 * Phase 2C.2D — startup validation for the Discovery duplicate-fingerprint
 * HMAC configuration (docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md
 * §18/§22 Correction 7/§34). Pure function of an env-like object (defaults
 * to `process.env`) so it is directly unit-testable without mutating real
 * process state.
 *
 * Fail-closed contract: `POST /api/v1/discovery-submissions` must not
 * accept ANY submission unless `DISCOVERY_FINGERPRINT_HMAC_KEY` is present.
 * This is "required security configuration missing" (§22 Correction 7),
 * distinct from a runtime store outage — the route stays disabled, not
 * degraded, until the key exists. Never logs or returns the key's value or
 * name to a client; the `reason` field on a failed result is for
 * server-side logging only.
 */

export interface DiscoveryFingerprintKeyConfig {
  key: string;
  keyVersion: string;
  previousKey?: string;
  previousKeyVersion?: string;
}

export type DiscoveryFingerprintConfigResult =
  | { ok: true; config: DiscoveryFingerprintKeyConfig }
  | { ok: false; reason: string };

const DEFAULT_KEY_VERSION = "v1";

export interface DiscoveryFingerprintEnv {
  DISCOVERY_FINGERPRINT_HMAC_KEY?: string;
  DISCOVERY_FINGERPRINT_KEY_VERSION?: string;
  DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY?: string;
  DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION?: string;
}

export function loadDiscoveryFingerprintConfig(
  env: DiscoveryFingerprintEnv = process.env as DiscoveryFingerprintEnv,
): DiscoveryFingerprintConfigResult {
  const key = env.DISCOVERY_FINGERPRINT_HMAC_KEY?.trim();
  if (!key) {
    return { ok: false, reason: "DISCOVERY_FINGERPRINT_HMAC_KEY is not set" };
  }

  const keyVersion = env.DISCOVERY_FINGERPRINT_KEY_VERSION?.trim() || DEFAULT_KEY_VERSION;

  const previousKey = env.DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY?.trim() || undefined;
  const previousKeyVersion = env.DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION?.trim() || undefined;

  // Rotation-window invariant (PRD §18 startup validation): previous key and
  // previous key version must be both-present or both-absent, and when both
  // are present they must not collide with the current version.
  if (previousKey && !previousKeyVersion) {
    return { ok: false, reason: "previous key is set without a previous key version" };
  }
  if (previousKeyVersion && !previousKey) {
    return { ok: false, reason: "previous key version is set without a previous key" };
  }
  if (previousKey && previousKeyVersion && previousKeyVersion === keyVersion) {
    return { ok: false, reason: "previous key version must differ from the current key version" };
  }

  return { ok: true, config: { key, keyVersion, previousKey, previousKeyVersion } };
}
