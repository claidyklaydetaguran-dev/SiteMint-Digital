// What a failed session request means, and what the dashboard may do about it.
//
// The defect this pins: every session error counted as "signed out", so a
// request that never completed — a restarting instance, a dropped connection,
// a laptop waking up — sent the person to the login page and discarded
// whatever was on screen. Only a refusal may do that.
//
// Plain `tsx` runner, like every other contract test in this app.

// Imports the rule directly, not through useSession: that file imports
// `@/lib/api`, which plain tsx cannot resolve.
import { classifySessionAccess } from "./sessionAccess.js";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("--- session access classification ---");

check(
  "a session that answered is allowed",
  classifySessionAccess({ isLoading: false, isError: false, hasData: true }) === "allowed",
);

check(
  "still loading is neither allowed nor denied",
  classifySessionAccess({ isLoading: true, isError: false, hasData: false }) === "loading",
);

for (const status of [401, 403]) {
  check(
    `a ${status} is the signed-out signal`,
    classifySessionAccess({ isLoading: false, isError: true, error: { status }, hasData: false }) === "denied",
    String(status),
  );
}

check(
  "a network failure with no status is unreachable, not signed out",
  classifySessionAccess({ isLoading: false, isError: true, error: new Error("Failed to fetch"), hasData: false }) ===
    "unreachable",
);

for (const status of [500, 502, 503, 504]) {
  check(
    `a ${status} from a restarting server is unreachable, not signed out`,
    classifySessionAccess({ isLoading: false, isError: true, error: { status }, hasData: false }) === "unreachable",
    String(status),
  );
}

check(
  "no error and no data is unreachable rather than assumed signed in",
  classifySessionAccess({ isLoading: false, isError: false, hasData: false }) === "unreachable",
);

console.log(failures === 0 ? "\nAll session access checks passed." : `\n${failures} session access check(s) failed.`);
if (failures > 0) process.exit(1);
