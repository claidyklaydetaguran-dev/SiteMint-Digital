// The rules that keep a failed load from being reported as a fact.
//
// Plain `tsx` runner, like every other contract test in this app.

import { classifyLoad, countLabel, expectShape, failureReason, ShapeError, type Load } from "./load.js";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("--- load classification ---");

check(
  "a load that arrived is ready and carries its data",
  classifyLoad({ isLoading: false, isError: false, data: [1, 2, 3] }).status === "ready",
);

check(
  "still loading is not yet an answer",
  classifyLoad({ isLoading: true, isError: false, data: undefined }).status === "loading",
);

check(
  "a genuinely empty list is ready, not an error",
  classifyLoad({ isLoading: false, isError: false, data: [] }).status === "ready",
);

check(
  "resolved with no error and no data is a failure, not an empty success",
  classifyLoad({ isLoading: false, isError: false, data: undefined }).status === "error",
);

// ── Rule 3: each failure reads differently ──────────────────────────────────

const unreachable = classifyLoad({ isLoading: false, isError: true, error: new Error("Failed to fetch"), data: undefined });
check(
  "an unreachable server has no status and says the sign-in has not ended",
  unreachable.status === "error" &&
    unreachable.httpStatus === null &&
    unreachable.reason.includes("could not reach the server") &&
    unreachable.reason.includes("sign-in has not ended"),
  unreachable.status === "error" ? unreachable.reason : unreachable.status,
);

for (const status of [401, 403]) {
  const refused = classifyLoad({ isLoading: false, isError: true, error: { status }, data: undefined });
  check(
    `a ${status} reads as a refusal, not as an outage`,
    refused.status === "error" && refused.httpStatus === status && refused.reason.includes("do not have access"),
    String(status),
  );
}

for (const status of [500, 502, 503]) {
  const failed = classifyLoad({ isLoading: false, isError: true, error: { status }, data: undefined });
  check(
    `a ${status} reads as the server failing, and keeps its status`,
    failed.status === "error" && failed.httpStatus === status && failed.reason.includes(String(status)),
    String(status),
  );
}

check(
  "the four failure wordings are actually different from one another",
  new Set([failureReason(null), failureReason(401), failureReason(404), failureReason(500)]).size === 4,
);

// ── Rule 1: a wrong shape is a failure, not an empty result ─────────────────

console.log("\n--- shape guarding ---");

const pickList = (body: unknown): number[] | undefined => (Array.isArray(body) ? (body as number[]) : undefined);

check("a well-formed body passes through", expectShape([1, 2], pickList, "calls").length === 2);

check(
  "an empty list is a real answer, not a shape failure",
  expectShape([], pickList, "calls").length === 0,
);

let threw = false;
try {
  expectShape({ unexpected: true }, pickList, "calls");
} catch (error) {
  threw = error instanceof ShapeError;
}
check("a body of the wrong shape throws ShapeError", threw);

const shapeLoad = classifyLoad({ isLoading: false, isError: true, error: new ShapeError("calls"), data: undefined });
check(
  "a shape failure explains itself rather than borrowing a status wording",
  shapeLoad.status === "error" && shapeLoad.httpStatus === null && shapeLoad.reason.includes("not in a form this page can read"),
  shapeLoad.status === "error" ? shapeLoad.reason : shapeLoad.status,
);

// ── Rule 2: a count from a failed load is never 0 ───────────────────────────

console.log("\n--- counts ---");

const ready: Load<number[]> = { status: "ready", data: [1, 2, 3, 4, 5] };
const errored: Load<number[]> = { status: "error", httpStatus: 500, reason: "x" };
const loading: Load<number[]> = { status: "loading" };

check("a count from a load that arrived is the real number", countLabel(ready, (d) => d.length) === "5");
check("a genuinely empty list still counts zero", countLabel({ status: "ready", data: [] }, (d) => d.length) === "0");
check("a count from a failed load is an em dash, never 0", countLabel(errored, (d) => d.length) === "—");
check("a count from a pending load is an em dash, never 0", countLabel(loading, (d) => d.length) === "—");

console.log(failures === 0 ? "\nAll load checks passed." : `\n${failures} load check(s) failed.`);
if (failures > 0) process.exit(1);
