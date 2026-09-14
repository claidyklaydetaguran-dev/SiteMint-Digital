// The business profile a customer edits in Settings.
//
// This form shipped unable to save anything at all: it sent five fields to the
// SMS agent-config route, which accepts none of them and answers
// "400 No fields to update". Because Setup step 1 is complete only when the
// business has BOTH a name and an industry, the first step of setup could
// never be finished and everything downstream of it stayed out of reach.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { applyProfilePatch, isKnownTimezone, validateProfilePatch, type ProfileDeps } from "./profileService.js";

const FIRM = 4;

function recorder() {
  const firmWrites: Array<{ name?: string; industry?: string | null }> = [];
  const timezoneWrites: string[] = [];
  const deps: ProfileDeps = {
    updateFirm: async (_f, values) => { firmWrites.push(values); },
    setTimezone: async (_f, tz) => { timezoneWrites.push(tz); },
  };
  return { deps, firmWrites, timezoneWrites };
}

function ok(body: unknown) {
  const result = validateProfilePatch(body);
  if (!result.ok) throw new Error(`expected valid, got ${result.code}`);
  return result.patch;
}

describe("what the profile accepts", () => {
  it("takes the three fields the account can actually store", () => {
    expect(ok({ name: "Northgate Plumbing", industry: "Home Services", timezone: "America/Chicago" })).toEqual({
      name: "Northgate Plumbing",
      industry: "Home Services",
      timezone: "America/Chicago",
    });
  });

  it("trims what the customer typed", () => {
    expect(ok({ name: "  Padded Co  " }).name).toBe("Padded Co");
  });

  it("treats an absent field as 'leave it alone', not 'clear it'", () => {
    const patch = ok({ name: "Only The Name" });
    expect(patch).toEqual({ name: "Only The Name" });
    expect("industry" in patch).toBe(false);
    expect("timezone" in patch).toBe(false);
  });

  it("refuses a blank business name rather than storing an empty one", () => {
    const result = validateProfilePatch({ name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("name_empty");
  });

  it("refuses a timezone this server cannot resolve", () => {
    // Storing an unresolvable zone would not fail here — it would fail later,
    // inside every slot calculation for this business.
    const result = validateProfilePatch({ timezone: "Mars/Olympus_Mons" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("timezone_unknown");
  });

  it("knows the real zones the picker offers", () => {
    for (const tz of ["America/Chicago", "America/Los_Angeles", "Asia/Manila", "UTC"]) {
      expect(isKnownTimezone(tz), tz).toBe(true);
    }
  });

  it("says plainly when nothing was sent, instead of reporting success", () => {
    const result = validateProfilePatch({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_fields");
  });

  it("ignores fields that have nowhere to be stored", () => {
    // The old form sent these. Accepting them silently is what made the bug
    // invisible: the customer typed an address, got "Saved", and lost it.
    const patch = ok({ name: "Northgate", primaryContact: { name: "Jamie" }, defaultLocation: "123 Main St" });
    expect(patch).toEqual({ name: "Northgate" });
  });
});

describe("where each field is written", () => {
  it("puts name and industry on the firm and the timezone on the scheduling settings", async () => {
    const r = recorder();
    await applyProfilePatch(FIRM, { name: "Northgate", industry: "Home Services", timezone: "America/Chicago" }, r.deps);
    expect(r.firmWrites).toEqual([{ name: "Northgate", industry: "Home Services" }]);
    // One timezone, in the row Availability already reads — never a second
    // copy that can disagree with the first.
    expect(r.timezoneWrites).toEqual(["America/Chicago"]);
  });

  it("stores a cleared industry as null, so readiness sees it as unset", async () => {
    const r = recorder();
    await applyProfilePatch(FIRM, { industry: "" }, r.deps);
    // "" would read as set to every `Boolean(industry)` check, and Setup would
    // call step 1 done for a business that had answered nothing.
    expect(r.firmWrites).toEqual([{ industry: null }]);
  });

  it("writes nothing to the firm when only the timezone changed", async () => {
    const r = recorder();
    await applyProfilePatch(FIRM, { timezone: "UTC" }, r.deps);
    expect(r.firmWrites).toEqual([]);
    expect(r.timezoneWrites).toEqual(["UTC"]);
  });

  it("writes the firm before the timezone", async () => {
    // If the timezone write fails, the name is already safely stored. The
    // reverse order could leave the business renamed to nothing it chose.
    const order: string[] = [];
    const deps: ProfileDeps = {
      updateFirm: async () => { order.push("firm"); },
      setTimezone: async () => { order.push("timezone"); },
    };
    await applyProfilePatch(FIRM, { name: "Northgate", timezone: "UTC" }, deps);
    expect(order).toEqual(["firm", "timezone"]);
  });
});
