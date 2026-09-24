import { describe, it, expect } from "vitest";
import { isHoneypotTripped, isImplausiblyFast, MIN_COMPLETION_TIME_MS } from "./publicSchedulingProtection.js";

describe("isHoneypotTripped", () => {
  it("is not tripped when undefined", () => {
    expect(isHoneypotTripped(undefined)).toBe(false);
  });
  it("is not tripped for an empty string", () => {
    expect(isHoneypotTripped("")).toBe(false);
  });
  it("is not tripped for whitespace only", () => {
    expect(isHoneypotTripped("   ")).toBe(false);
  });
  it("is tripped when populated", () => {
    expect(isHoneypotTripped("555-1234")).toBe(true);
  });
});

describe("isImplausiblyFast", () => {
  it("flags a submission faster than the floor", () => {
    const now = () => 10_000;
    const startedAt = new Date(10_000 - (MIN_COMPLETION_TIME_MS - 1)).toISOString();
    expect(isImplausiblyFast(startedAt, now)).toBe(true);
  });
  it("does not flag a submission slower than the floor", () => {
    const now = () => 10_000;
    const startedAt = new Date(10_000 - (MIN_COMPLETION_TIME_MS + 1000)).toISOString();
    expect(isImplausiblyFast(startedAt, now)).toBe(false);
  });
  it("flags a malformed timestamp as suspicious", () => {
    expect(isImplausiblyFast("not-a-date")).toBe(true);
  });
  it("flags a missing timestamp as suspicious", () => {
    expect(isImplausiblyFast(undefined)).toBe(true);
  });
});
