/**
 * The words a failed load gets.
 *
 * The point of these helpers is that five different failures must not read
 * alike — and none of them may read like "you have no data". A page that turns
 * "refused" into 0 tells an owner they have no pipeline; a page that turns
 * "unreachable" into "not found" sends them to fix the wrong thing.
 */
import { describe, expect, it } from "vitest";

import { failureReason, responseFailureReason } from "./adminLoad.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("failureReason", () => {
  it("says the server could not be reached when nothing answered", () => {
    expect(failureReason(null)).toMatch(/could not be reached/i);
  });

  it("reads a 401 as a session that ended", () => {
    expect(failureReason(401)).toMatch(/session has ended/i);
  });

  it("names the grant when the server names one", () => {
    const words = failureReason(403, { error: "Forbidden", permission: "crm.contacts.read" });
    expect(words).toContain("crm.contacts.read");
    expect(words).toMatch(/permission/i);
  });

  it("reads a plain 403 as a permission refusal, not as a bare restatement", () => {
    const words = failureReason(403);
    expect(words).toMatch(/do not have permission/i);
    // The old wording was "This request was refused. The request was refused."
    expect(words).not.toMatch(/request was refused\. The request was refused/);
  });

  it("keeps the security-token refusal distinct from a missing permission", () => {
    const words = failureReason(403, { error: "Invalid CSRF token", code: "csrf_token_invalid" });
    expect(words).toMatch(/security token/i);
    expect(words).not.toMatch(/do not have permission/i);
  });

  it("keeps 404 distinct", () => {
    expect(failureReason(404)).toMatch(/not found/i);
  });

  it("quotes the server's own sentence on a 5xx, and always the status", () => {
    expect(failureReason(500, { error: "Database is unavailable" })).toContain("Database is unavailable");
    expect(failureReason(500)).toContain("500");
    expect(failureReason(503)).toContain("503");
  });

  it("gives six different failures six different answers", () => {
    const answers = [
      failureReason(null),
      failureReason(401),
      failureReason(403, { permission: "crm.deals.read" }),
      failureReason(403),
      failureReason(404),
      failureReason(500),
    ];
    expect(new Set(answers).size).toBe(6);
  });

  it("never answers with something that could be read as an empty result", () => {
    for (const status of [null, 401, 403, 404, 500, 503] as const) {
      const words = failureReason(status);
      expect(words).not.toMatch(/^(none|no |0\b)/i);
      expect(words.length).toBeGreaterThan(10);
    }
  });
});

describe("responseFailureReason", () => {
  it("reads the server's own error out of the body", async () => {
    expect(await responseFailureReason(json(500, { error: "Database is unavailable" })))
      .toContain("Database is unavailable");
  });

  it("names the permission a refusal carries", async () => {
    expect(await responseFailureReason(json(403, { error: "Forbidden", permission: "crm.deals.write" })))
      .toContain("crm.deals.write");
  });

  it("copes with a body that is not JSON at all", async () => {
    const res = new Response("<html>gateway</html>", { status: 502 });
    expect(await responseFailureReason(res)).toContain("502");
  });
});
