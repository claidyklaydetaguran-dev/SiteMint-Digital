// Phase 6 Contact integrity correction — unit tests for the extracted
// validation/protection units used by POST /api/contact/submit
// (contactValidation.ts, contactProtection.ts). No Express app, no DB, no
// Resend, no real waits — the rate limiter's clock is injected so window
// expiry is tested by advancing a fake `now()`, not by sleeping.
//
// Route-level behavior (status codes, which branch runs) is NOT executed
// here — there is no supertest/test-DB harness in this repo to spin up a
// live route safely. What IS verified: the exact functions the route calls
// (validateContactSubmission, isHoneypotTripped, stripHoneypot,
// SlidingWindowLimiter) behave correctly in isolation, and a source-text
// check confirms the route's catch block never interpolates the caught
// error into the client-facing response. The route's own status-code
// wiring (429/400/500) is code-traced by reading routes/contact.ts
// (verified inline, matches SlidingWindowLimiter.isOverLimit /
// validateContactSubmission.ok / the static catch-block message).
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/contactProtection.test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateContactSubmission,
  CONTACT_MAX_LENGTHS,
} from "../src/lib/contactValidation";
import {
  SlidingWindowLimiter,
  isHoneypotTripped,
  stripHoneypot,
  HONEYPOT_FIELD,
} from "../src/lib/contactProtection";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

// ── validateContactSubmission ────────────────────────────────────────────

{
  const result = validateContactSubmission({
    name: "Jamie Tester",
    email: "jamie@example.com",
    businessType: "Test Business LLC",
    message: "This is a valid, well-formed inquiry message.",
  });
  check("valid payload passes (continues to persistence/delivery path)", result.ok === true);
  if (result.ok) {
    check("valid payload: name is trimmed/normalized", result.data.name === "Jamie Tester");
    check("valid payload: email is trimmed/normalized", result.data.email === "jamie@example.com");
    check("valid payload: businessType carried through", result.data.businessType === "Test Business LLC");
  }
}

{
  const result = validateContactSubmission({ email: "jamie@example.com", message: "A real message here." });
  check("missing name is rejected", result.ok === false);
  if (!result.ok) check("missing name: field-specific message present", !!result.fields.name);
}

{
  const result = validateContactSubmission({ name: "   ", email: "jamie@example.com", message: "A real message here." });
  check("whitespace-only name is rejected", result.ok === false);
}

{
  const result = validateContactSubmission({ name: "Jamie", email: "   ", message: "A real message here." });
  check("whitespace-only email is rejected", result.ok === false);
}

{
  const result = validateContactSubmission({ name: "Jamie", email: "not-an-email", message: "A real message here." });
  check("invalid (non-email-shaped) email is rejected", result.ok === false);
}

{
  const result = validateContactSubmission({ name: "Jamie", email: "jamie@example.com" });
  check("missing message is rejected", result.ok === false);
}

{
  const result = validateContactSubmission({ name: "Jamie", email: "jamie@example.com", message: "   " });
  check("whitespace-only message is rejected", result.ok === false);
}

{
  // businessType is the one optional field — omitting it entirely must
  // still pass when name/email/message are valid.
  const result = validateContactSubmission({ name: "Jamie", email: "jamie@example.com", message: "A real message here." });
  check("businessType is optional — omitted entirely still passes", result.ok === true);
  if (result.ok) check("omitted businessType normalizes to null, not empty string", result.data.businessType === null);
}

{
  const overlongName = "x".repeat(CONTACT_MAX_LENGTHS.name + 1);
  const result = validateContactSubmission({ name: overlongName, email: "jamie@example.com", message: "A real message here." });
  check("name over the max length is rejected, not silently truncated", result.ok === false);
}

{
  const overlongMessage = "x".repeat(CONTACT_MAX_LENGTHS.message + 1);
  const result = validateContactSubmission({ name: "Jamie", email: "jamie@example.com", message: overlongMessage });
  check("message over the max length is rejected, not silently truncated", result.ok === false);
}

{
  const exactLengthMessage = "x".repeat(CONTACT_MAX_LENGTHS.message);
  const result = validateContactSubmission({ name: "Jamie", email: "jamie@example.com", message: exactLengthMessage });
  check("message at exactly the max length is accepted (boundary correct)", result.ok === true);
}

{
  // Failure responses must never carry stack traces or internal detail —
  // every returned field message should be a short, plain sentence.
  const result = validateContactSubmission({});
  if (!result.ok) {
    const allSafe = Object.values(result.fields).every(
      (msg) => msg.length < 120 && !/at .*:\d+:\d+|Error:|node_modules|\.ts:\d+/.test(msg),
    );
    check("validation failure messages contain no stack-trace-shaped content", allSafe);
  } else {
    check("validation failure messages contain no stack-trace-shaped content", false);
  }
}

// ── Honeypot ──────────────────────────────────────────────────────────────

{
  check("populated honeypot is tripped (rejected)", isHoneypotTripped({ [HONEYPOT_FIELD]: "I am a bot" }) === true);
  check("empty-string honeypot is NOT tripped (valid empty optional input accepted)", isHoneypotTripped({ [HONEYPOT_FIELD]: "" }) === false);
  check("whitespace-only honeypot is NOT tripped (still counts as empty)", isHoneypotTripped({ [HONEYPOT_FIELD]: "   " }) === false);
  check("missing honeypot key entirely is NOT tripped", isHoneypotTripped({}) === false);
}

{
  const stripped = stripHoneypot({ [HONEYPOT_FIELD]: "spam value", name: "Jamie", email: "jamie@example.com" });
  check("honeypot key is removed by stripHoneypot", !(HONEYPOT_FIELD in stripped));
  check("stripHoneypot preserves every other field", stripped.name === "Jamie" && stripped.email === "jamie@example.com");
}

// ── SlidingWindowLimiter (rate limiting) — deterministic via injected clock ─

{
  let fakeNow = 1_000_000;
  const limiter = new SlidingWindowLimiter(5, 60 * 60 * 1000, () => fakeNow);
  const key = "203.0.113.10";

  let allowedCount = 0;
  for (let i = 0; i < 5; i++) {
    if (!limiter.isOverLimit(key)) {
      limiter.record(key);
      allowedCount++;
    }
    fakeNow += 1000; // small gap between requests, still well inside the window
  }
  check("5 requests below/at the limit are all allowed", allowedCount === 5);
  check("the 6th request (over the intended threshold) is blocked", limiter.isOverLimit(key) === true);
}

{
  let fakeNow = 2_000_000;
  const limiter = new SlidingWindowLimiter(2, 1000, () => fakeNow);
  check("first key starts allowed", limiter.isOverLimit("ip-a") === false);
  limiter.record("ip-a");
  limiter.record("ip-a");
  check("ip-a is over its own limit after 2 records", limiter.isOverLimit("ip-a") === true);
  check("a different identifier (ip-b) does not share ip-a's limit", limiter.isOverLimit("ip-b") === false);
}

{
  let fakeNow = 3_000_000;
  const limiter = new SlidingWindowLimiter(1, 1000, () => fakeNow);
  const key = "203.0.113.20";
  limiter.record(key);
  check("limiter blocks immediately after reaching its 1-request limit", limiter.isOverLimit(key) === true);
  fakeNow += 1500; // advance past the 1000ms window
  check("expired window permits requests again", limiter.isOverLimit(key) === false);
}

// ── Source-text check: the 500 handler never leaks the caught error ───────

{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const routeSource = fs.readFileSync(path.join(here, "../src/routes/contact.ts"), "utf8");
  const catchBlockMatch = routeSource.match(/catch \(err\) \{([\s\S]*?)\n {2}\}/);
  const catchBlock = catchBlockMatch ? catchBlockMatch[1] : "";
  const responseLine = catchBlock.split("\n").find((line) => line.includes("res.status(500)")) ?? "";
  check(
    "the 500 response is a fixed generic string, not built from the caught error",
    responseLine.includes('"Failed to process submission"') && !responseLine.includes("err."),
  );
  check("the caught error is only ever passed to the logger, never res.json", !/res\.(json|send)\([^)]*err/.test(catchBlock));
}

if (failures > 0) {
  console.error(`\n${failures} contactProtection/contactValidation test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll contactProtection/contactValidation tests passed.");
}
