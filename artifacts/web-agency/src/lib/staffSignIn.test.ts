/**
 * Whether an owner account exists — and what happens when we cannot tell.
 *
 * The sign-in page picks between the first-run setup form and the ordinary
 * sign-in form from this one number. Reading a failure as "accounts exist"
 * hides first-run setup on a brand-new deployment and leaves the operator with
 * no way in; reading it as "no accounts" would offer to create an owner on a
 * system that may already have one. So the failure has to survive as a
 * failure, all the way to the page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { staffAccountCount } from "./staffSignIn.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function answers(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("staffAccountCount", () => {
  it("reports the count the server gave", async () => {
    answers({ staffCount: 3 });
    expect(await staffAccountCount()).toEqual({ status: "ready", data: 3 });
  });

  it("reports a real zero as a real zero, so first-run setup can be offered", async () => {
    answers({ staffCount: 0 });
    expect(await staffAccountCount()).toEqual({ status: "ready", data: 0 });
  });

  it("does not turn a server error into 'accounts exist'", async () => {
    answers({ error: "Database is unavailable" }, 500);
    const result = await staffAccountCount();
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("Database is unavailable");
  });

  it("does not turn an unreachable server into 'accounts exist'", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await staffAccountCount()).toMatchObject({ status: "error", httpStatus: null });
  });

  it("treats an answer with no numeric count as a failure, not as zero", async () => {
    answers({});
    expect((await staffAccountCount()).status).toBe("error");
  });

  it("treats a body that is not JSON as a failure, not as zero", async () => {
    answers("<html>gateway</html>");
    expect((await staffAccountCount()).status).toBe("error");
  });

  it("never returns a count that was not actually read", async () => {
    for (const bad of [{}, { staffCount: "2" }, { staffCount: null }]) {
      answers(bad);
      const result = await staffAccountCount();
      expect(result.status).toBe("error");
      expect(result).not.toHaveProperty("data");
    }
  });
});
