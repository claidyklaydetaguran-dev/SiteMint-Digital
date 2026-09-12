/**
 * Every registered route is classified, and the classification is deliberate.
 *
 * The failure this prevents: somebody adds a page, nobody adds it to a list of
 * pages to check, and the page nobody knew about is the page nobody tested.
 * Deriving the inventory from `App.tsx` means a new route cannot be invisible —
 * it either classifies or fails here.
 *
 * The second failure it prevents is worse: a customer-facing route quietly
 * being treated as staff, or the reverse. Unclassified is an error rather than
 * a default, because a default is a guess, and guessing permissively is how a
 * portal page acquires staff data.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRegisteredRoutes, classify, buildInventory, staffSweepPaths } from "./routeInventory.js";

const source = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");

describe("route inventory", () => {
  const inventory = buildInventory(source);

  it("finds the routes the application actually registers", () => {
    const paths = readRegisteredRoutes(source);
    expect(paths.length).toBeGreaterThan(40);
    // Spot-check one of each kind so a regex that silently matched nothing
    // cannot pass this.
    expect(paths).toContain("/admin/crm/my-day");
    expect(paths).toContain("/portal/sign-in");
    expect(paths.some((p) => p.startsWith("ROUTES."))).toBe(true);
  });

  it("classifies every registered route", () => {
    // buildInventory throws on an unclassified path; this states the intent
    // plainly and names the offender when it fails.
    const unclassified = readRegisteredRoutes(source).filter((p) => classify(p) === null);
    expect(unclassified, `unclassified routes: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("keeps the portal out of the staff audience, and vice versa", () => {
    const portal = inventory.filter((r) => r.path.startsWith("/portal"));
    expect(portal.length).toBeGreaterThan(5);
    for (const r of portal) {
      expect(r.audience, `${r.path} must not be staff`).not.toBe("staff");
    }
    for (const r of inventory.filter((r) => r.path.startsWith("/admin/crm"))) {
      expect(r.audience, `${r.path} must be staff`).toBe("staff");
    }
  });

  it("treats a token-carrying landing page as neither staff nor customer", () => {
    // The token in the URL is the credential. Behind the staff guard, an
    // invitation could never be accepted.
    expect(classify("/admin/activate")).toBe("token");
    expect(classify("/portal/accept")).toBe("token");
  });

  it("produces an openable sweep list with parameters filled in", () => {
    const paths = staffSweepPaths(inventory, { id: "4" });
    expect(paths).toContain("/admin/crm/my-day");
    expect(paths).toContain("/admin/crm/leads/4");
    // The catch-all mounts the subtree; it is not a page to open.
    expect(paths.every((p) => !p.includes("*"))).toBe(true);
    expect(paths.every((p) => !p.includes(":"))).toBe(true);
  });

  it("covers the M4 and M5 surfaces, so a new area cannot skip the sweep", () => {
    const paths = staffSweepPaths(inventory);
    for (const expected of [
      "/admin/crm/support",
      "/admin/crm/operations",
      "/admin/crm/reporting",
      "/admin/crm/campaign-builder",
    ]) {
      expect(paths, `${expected} is missing from the staff sweep`).toContain(expected);
    }
  });
});
