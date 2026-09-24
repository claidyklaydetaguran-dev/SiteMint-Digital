// An operator can ask for a shorter-lived invite — a QA account, a one-off
// demo — but never a longer one than the default, which is already the ceiling
// on how long a leaked code stays live.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { INVITE_MAX_TTL_HOURS, INVITE_TTL_MS, resolveInviteTtlMs } from "./inviteService.js";

const HOUR = 60 * 60 * 1000;

describe("invite lifetime", () => {
  it("defaults to fourteen days when no lifetime is asked for", () => {
    expect(resolveInviteTtlMs(undefined)).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(14 * 24 * HOUR);
    expect(INVITE_MAX_TTL_HOURS).toBe(336);
  });

  it("honours a shorter whole-hour lifetime", () => {
    expect(resolveInviteTtlMs(1)).toBe(HOUR);
    expect(resolveInviteTtlMs(24)).toBe(24 * HOUR);
    expect(resolveInviteTtlMs(336)).toBe(336 * HOUR);
  });

  it("never lengthens past the default, and never guesses at bad input", () => {
    for (const bad of [0, -5, 337, 10_000, 1.5, "24", null, Number.NaN]) {
      expect(resolveInviteTtlMs(bad), String(bad)).toBe(INVITE_TTL_MS);
    }
  });
});
