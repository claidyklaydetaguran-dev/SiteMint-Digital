// The rules a business relies on when it writes to Support: what is accepted,
// what each message does to the state, and that a closed request reopens when
// they write again rather than disappearing.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  statusAfterMessage,
  validateSupportMessage,
  validateSupportRequest,
} from "./supportService.js";

describe("validateSupportRequest", () => {
  it("accepts a normal request and normalises it", () => {
    const result = validateSupportRequest({ subject: "  Calendar keeps disconnecting  ", body: " It drops every week.\r\n ", category: "Problem" });
    expect(result).toEqual({ ok: true, value: { subject: "Calendar keeps disconnecting", body: "It drops every week.", category: "problem" } });
  });

  it("defaults the category rather than refusing a request without one", () => {
    const result = validateSupportRequest({ subject: "How do I add hours?", body: "Where are opening hours set?", category: "" });
    expect(result.ok && result.value.category).toBe("question");
  });

  it("names the field for each thing the customer must fix", () => {
    const result = validateSupportRequest({ subject: "  ", body: "", category: "urgent" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field).sort()).toEqual(["body", "category", "subject"]);
      for (const error of result.errors) expect(error.message.length).toBeGreaterThan(10);
    }
  });

  it("refuses text that is too long or carries control characters", () => {
    const long = validateSupportRequest({ subject: "x".repeat(161), body: "ok", category: "other" });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0]!.code).toBe("subject_too_long");
    const control = validateSupportRequest({ subject: "fine", body: "badbell", category: "other" });
    expect(control.ok).toBe(false);
    if (!control.ok) expect(control.errors[0]!.code).toBe("body_invalid");
  });
});

describe("validateSupportMessage", () => {
  it("accepts a reply and refuses an empty one", () => {
    expect(validateSupportMessage("  thanks, that worked ")).toEqual({ ok: true, value: "thanks, that worked" });
    const empty = validateSupportMessage("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors[0]!.code).toBe("body_required");
  });
});

describe("statusAfterMessage", () => {
  it("puts the request back on SiteMint when the business writes", () => {
    expect(statusAfterMessage("business")).toBe("open");
  });

  it("marks it answered when SiteMint writes", () => {
    expect(statusAfterMessage("sitemint")).toBe("answered");
  });
});
