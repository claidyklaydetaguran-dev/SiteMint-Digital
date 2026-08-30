// Phase 2C.2D — unit tests for the endpoint-scoped rate limiter, honeypot,
// and completion-time checks used by POST /api/v1/discovery-submissions.
// No Express app, no DB, no real waits — the limiter's clock is injected.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryV1Protection.test.ts
import { SlidingWindowLimiter } from "../src/lib/contactProtection";
import {
  DISCOVERY_V1_IP_LIMIT,
  DISCOVERY_V1_IP_WINDOW,
  MIN_COMPLETION_TIME_MS,
  isHoneypotTripped,
  isImplausiblyFast,
} from "../src/lib/discoveryV1Protection";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

// ── Rate limiting (same class as contactProtection.ts, separate instance) ──

{
  let now = 1_000_000;
  const limiter = new SlidingWindowLimiter(DISCOVERY_V1_IP_LIMIT, DISCOVERY_V1_IP_WINDOW, () => now);
  const key = "ip-a";
  for (let i = 0; i < DISCOVERY_V1_IP_LIMIT; i++) {
    check(`request ${i + 1}/${DISCOVERY_V1_IP_LIMIT} allowed`, !limiter.isOverLimit(key));
    limiter.record(key);
    now += 1000;
  }
  check(`request ${DISCOVERY_V1_IP_LIMIT + 1} (over limit) is blocked`, limiter.isOverLimit(key));
}

{
  let now = 2_000_000;
  const limiter = new SlidingWindowLimiter(DISCOVERY_V1_IP_LIMIT, DISCOVERY_V1_IP_WINDOW, () => now);
  limiter.record("ip-a");
  check("a different IP does not share ip-a's limit", !limiter.isOverLimit("ip-b"));
}

{
  let now = 3_000_000;
  const limiter = new SlidingWindowLimiter(1, DISCOVERY_V1_IP_WINDOW, () => now);
  limiter.record("ip-a");
  check("limiter blocks immediately after reaching a 1-request limit", limiter.isOverLimit("ip-a"));
  now += DISCOVERY_V1_IP_WINDOW + 1;
  check("expired window permits requests again", !limiter.isOverLimit("ip-a"));
}

// ── Honeypot ──────────────────────────────────────────────────────────────

check("undefined honeypot is not tripped", !isHoneypotTripped(undefined));
check("empty-string honeypot is not tripped", !isHoneypotTripped(""));
check("whitespace-only honeypot is not tripped", !isHoneypotTripped("   "));
check("populated honeypot is tripped", isHoneypotTripped("i-am-a-bot"));

// ── Completion-time check ────────────────────────────────────────────────

{
  const now = () => 1_700_000_000_000;
  const startedTooRecently = new Date(now() - (MIN_COMPLETION_TIME_MS - 1)).toISOString();
  check("submission faster than the floor is flagged implausible", isImplausiblyFast(startedTooRecently, now));
}

{
  const now = () => 1_700_000_000_000;
  const startedPlausibly = new Date(now() - (MIN_COMPLETION_TIME_MS + 5000)).toISOString();
  check("submission slower than the floor is not flagged", !isImplausiblyFast(startedPlausibly, now));
}

{
  const now = () => 1_700_000_000_000;
  check("malformed timestamp is treated as suspicious (fails the check)", isImplausiblyFast("not-a-date", now));
}

if (failures > 0) {
  console.error(`\n${failures} discoveryV1Protection test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll discoveryV1Protection tests passed.");
}
