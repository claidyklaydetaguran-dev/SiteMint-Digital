/**
 * Missing merge values are warned about BEFORE a send, on the preview step.
 *
 * The server's preflight counts, per merge field, how many sendable recipients
 * have no value and will see the fallback instead, and refuses outright a token
 * that has no fallback at all. This is the function that turns that into what
 * the operator reads before pressing Send — so if it drops either, the warning
 * only arrives as a customer's "Hi there" after the fact.
 */
import { describe, it, expect } from "vitest";
import { issuesFor } from "./reviewIssues";
import type { Preflight } from "./shared";

const preflight = (over: Partial<Preflight> = {}): Preflight => ({
  audience: { mode: "list", label: "30 chosen contacts", note: null },
  audienceSize: 32,
  sendable: 30,
  excluded: 2,
  excludedByReason: [],
  fallbackWarnings: [],
  blockers: [],
  canSend: true,
  delivery: { configured: true, note: "Mail is configured." },
  ...over,
});

const base = { blocks: [], subject: "Hello", preheader: "A short note", audience: null, settings: null };

describe("what the preview step says before anything is sent", () => {
  it("says how many recipients will see a fallback, and for which field", () => {
    const issues = issuesFor({ ...base, preflight: preflight({ fallbackWarnings: [{ field: "first_name", count: 12, share: 40 }] }) });
    const warning = issues.find((i) => i.id === "fallback-first_name");
    expect(warning?.severity).toBe("worth");
    expect(warning?.text).toContain("12 of the 30 recipients (40%)");
    expect(warning?.text).toMatch(/no first name on file/);
    expect(warning?.text).toMatch(/fallback/);
  });

  it("puts a token with no fallback in front of the operator as something that must be fixed", () => {
    const blocker = "{{company}} — \"company\" has no fallback. Write it as {{company|something}}.";
    const issues = issuesFor({ ...base, preflight: preflight({ blockers: [blocker], canSend: false }) });
    expect(issues[0]).toEqual({ id: "blocker-0", severity: "must", text: blocker });
  });

  it("warns about nothing when every recipient has every value", () => {
    const issues = issuesFor({ ...base, preflight: preflight() });
    expect(issues.filter((i) => i.id.startsWith("fallback-"))).toEqual([]);
    expect(issues.filter((i) => i.severity === "must")).toEqual([]);
  });
});
