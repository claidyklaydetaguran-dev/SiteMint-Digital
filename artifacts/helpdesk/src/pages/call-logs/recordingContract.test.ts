import assert from "node:assert/strict";
import { parseRecordingResult } from "./recordingContract.js";
for (const status of ["disabled", "pending", "unavailable"] as const) assert.deepEqual(parseRecordingResult({ status }), { status });
assert.equal(parseRecordingResult({ status: "available", url: "https://storage.googleapis.com/audio?signature=temporary" }).status, "available");
for (const value of [null, {}, { status: "ready" }, { status: "available" }, { status: "available", url: "javascript:alert(1)" }, { status: "available", url: "https://secret@example.com/x" }]) {
  assert.throws(() => parseRecordingResult(value));
}
console.log("Recording response contract passed: honest unavailable states and no unsafe playback URLs.");
