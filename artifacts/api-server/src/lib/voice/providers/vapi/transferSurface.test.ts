// The words a business reads, checked against the states they can come from.
//
// This exists because the failure mode is linguistic, not logical: the fold
// can be perfectly correct and the page can still say "transferred" for a
// request nobody answered. Every state must have copy, and the two states
// that are commonly mistaken for success must not read as success.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contract = readFileSync(
  join(process.cwd(), "../helpdesk/src/pages/call-logs/callLogsContract.ts"),
  "utf8",
);

const STATES = ["none", "requested", "accepted", "connected", "failed", "unknown"];

describe("transfer copy", () => {
  it("has wording for every state the server can produce", () => {
    for (const state of STATES) {
      expect(contract.includes(`  ${state}: {`), state).toBe(true);
    }
  });

  it("does not let an acknowledgement read as someone answering", () => {
    const accepted = /accepted: \{[\s\S]*?\},/.exec(contract)?.[0] ?? "";
    expect(accepted).toMatch(/not the same as someone answering/i);
    expect(accepted).not.toMatch(/\bconnected\b/i);
  });

  it("explains that an unknown outcome is a limit, not a fault", () => {
    expect(contract).toMatch(/the assistant leaves it/i);
    expect(contract).toMatch(/most this can honestly say/i);
  });

  it("keeps the blind-transfer limitation stated", () => {
    expect(contract).toMatch(/blindNote/);
  });
});
