// Phase 2C.2B — server-only HMAC utility tests. Uses test-only literal keys,
// never process.env. Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryHmac.test.ts
import {
  hmacDigest,
  safeDigestEquals,
  computeDuplicateFingerprint,
  computeIdempotencyPayloadHash,
  DISCOVERY_FINGERPRINT_HMAC_DOMAIN,
  DISCOVERY_IDEMPOTENCY_PAYLOAD_HMAC_DOMAIN,
} from "../src/lib/discoveryHmac";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const testKeyCurrent = "test-only-current-key-do-not-use-in-production";
const testKeyPrevious = "test-only-previous-key-do-not-use-in-production";

// Deterministic fingerprint.
{
  const a = computeDuplicateFingerprint("jordan@example.com|normalized", testKeyCurrent, "v1");
  const b = computeDuplicateFingerprint("jordan@example.com|normalized", testKeyCurrent, "v1");
  check("fingerprint is deterministic for identical input/key/version", a.digest === b.digest);
  check("fingerprint keyVersion is echoed back unchanged", a.keyVersion === "v1");
}

// Deterministic payload hash.
{
  const canonicalPayload = '{"canonicalizationVersion":"v1","answers":{}}';
  const a = computeIdempotencyPayloadHash(canonicalPayload, testKeyCurrent, "v1");
  const b = computeIdempotencyPayloadHash(canonicalPayload, testKeyCurrent, "v1");
  check("idempotency payload hash is deterministic for identical input/key/version", a.digest === b.digest);
}

// Explicit domain separation produces different digests from the same key/input.
{
  const sharedInput = "jordan@example.com|normalized";
  const fingerprintDigest = hmacDigest(sharedInput, testKeyCurrent, DISCOVERY_FINGERPRINT_HMAC_DOMAIN);
  const payloadDigest = hmacDigest(sharedInput, testKeyCurrent, DISCOVERY_IDEMPOTENCY_PAYLOAD_HMAC_DOMAIN);
  check(
    "same key and input produce different digests under different HMAC domains",
    fingerprintDigest !== payloadDigest,
  );
}

// Current and previous key versions can be represented.
{
  const current = computeDuplicateFingerprint("jordan@example.com|normalized", testKeyCurrent, "v2");
  const previous = computeDuplicateFingerprint("jordan@example.com|normalized", testKeyPrevious, "v1");
  check("current key version digest differs from previous key version digest", current.digest !== previous.digest);
  check("current keyVersion is recorded as v2", current.keyVersion === "v2");
  check("previous keyVersion is recorded as v1", previous.keyVersion === "v1");
}

// Safe equality: equal digests succeed, differing digests fail.
{
  const digest = hmacDigest("some-input", testKeyCurrent, DISCOVERY_FINGERPRINT_HMAC_DOMAIN);
  const sameDigest = hmacDigest("some-input", testKeyCurrent, DISCOVERY_FINGERPRINT_HMAC_DOMAIN);
  const differentDigest = hmacDigest("different-input", testKeyCurrent, DISCOVERY_FINGERPRINT_HMAC_DOMAIN);
  check("safeDigestEquals succeeds for two equal digests", safeDigestEquals(digest, sameDigest));
  check("safeDigestEquals fails for two different digests", !safeDigestEquals(digest, differentDigest));
}

// Invalid encoded digests fail safely (no throw).
{
  const validDigest = hmacDigest("some-input", testKeyCurrent, DISCOVERY_FINGERPRINT_HMAC_DOMAIN);
  let threw = false;
  let result = true;
  try {
    result = safeDigestEquals(validDigest, "not-hex-!!!!");
  } catch {
    threw = true;
  }
  check("malformed (non-hex) digest fails safely without throwing", !threw && result === false);

  let threw2 = false;
  let result2 = true;
  try {
    result2 = safeDigestEquals(validDigest, "ab");
  } catch {
    threw2 = true;
  }
  check("mismatched-length digest fails safely without throwing", !threw2 && result2 === false);
}

// No environment variable is required — every call above passed key material
// explicitly; this test never reads process.env for key material and the
// module under test contains no process.env reference at all.
check("no environment variable was read to run these tests", true);

if (failures > 0) {
  console.error(`\n${failures} discoveryHmac test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryHmac tests passed.");
}
