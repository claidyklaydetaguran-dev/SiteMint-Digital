// Phase 2C.2D — unit tests for the fail-closed fingerprint-HMAC
// configuration loader used by POST /api/v1/discovery-submissions. Pure
// function of an env-like object; no process.env mutation, no DB, no real
// secret anywhere in this file.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryFingerprintConfig.test.ts
import { loadDiscoveryFingerprintConfig } from "../src/lib/discoveryFingerprintConfig";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

{
  const result = loadDiscoveryFingerprintConfig({});
  check("missing key fails closed", result.ok === false);
}

{
  const result = loadDiscoveryFingerprintConfig({ DISCOVERY_FINGERPRINT_HMAC_KEY: "   " });
  check("whitespace-only key fails closed (not treated as present)", result.ok === false);
}

{
  const result = loadDiscoveryFingerprintConfig({ DISCOVERY_FINGERPRINT_HMAC_KEY: "test-only-key-value" });
  check("valid key alone succeeds", result.ok === true);
  if (result.ok) {
    check("key version defaults to v1 when unset", result.config.keyVersion === "v1");
    check("no previous key present by default", result.config.previousKey === undefined);
  }
}

{
  const result = loadDiscoveryFingerprintConfig({
    DISCOVERY_FINGERPRINT_HMAC_KEY: "test-only-key-value",
    DISCOVERY_FINGERPRINT_KEY_VERSION: "v3",
  });
  check("explicit key version is honored", result.ok === true && result.config.keyVersion === "v3");
}

{
  const result = loadDiscoveryFingerprintConfig({
    DISCOVERY_FINGERPRINT_HMAC_KEY: "current",
    DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY: "previous",
    // previous key version missing
  });
  check("previous key without previous key version fails closed", result.ok === false);
}

{
  const result = loadDiscoveryFingerprintConfig({
    DISCOVERY_FINGERPRINT_HMAC_KEY: "current",
    DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION: "v0",
    // previous key missing
  });
  check("previous key version without previous key fails closed", result.ok === false);
}

{
  const result = loadDiscoveryFingerprintConfig({
    DISCOVERY_FINGERPRINT_HMAC_KEY: "current",
    DISCOVERY_FINGERPRINT_KEY_VERSION: "v2",
    DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY: "previous",
    DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION: "v2",
  });
  check("previous key version colliding with current key version fails closed", result.ok === false);
}

{
  const result = loadDiscoveryFingerprintConfig({
    DISCOVERY_FINGERPRINT_HMAC_KEY: "current",
    DISCOVERY_FINGERPRINT_KEY_VERSION: "v2",
    DISCOVERY_FINGERPRINT_HMAC_PREVIOUS_KEY: "previous",
    DISCOVERY_FINGERPRINT_PREVIOUS_KEY_VERSION: "v1",
  });
  check("valid rotation window (distinct versions) succeeds", result.ok === true);
  if (result.ok) {
    check("previous key carried through", result.config.previousKey === "previous");
    check("previous key version carried through", result.config.previousKeyVersion === "v1");
  }
}

{
  // Never reveal the secret's name or value in the failure result surfaced
  // to a caller who might log it — `reason` is for server-side logs only,
  // but even so it must never echo back the actual key value.
  const result = loadDiscoveryFingerprintConfig({});
  check(
    "failure reason never contains a key value placeholder like 'test-only-key-value'",
    result.ok === false && !result.reason.includes("test-only-key-value"),
  );
}

if (failures > 0) {
  console.error(`\n${failures} discoveryFingerprintConfig test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryFingerprintConfig tests passed.");
}
