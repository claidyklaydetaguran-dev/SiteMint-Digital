/**
 * The route inventory, derived from `App.tsx` rather than maintained by hand.
 *
 * A hand-written list of pages is wrong within a week: somebody adds a route
 * and nobody adds the row, and the page nobody knew about is the page nobody
 * tested. So this reads the router and reports what is actually registered.
 *
 * It exists to answer one question during verification — "which pages are
 * there, and which have we actually opened?" — and to fail a test when a new
 * route appears without being classified. Classification is the point: a route
 * that serves customers has different access rules from one that serves staff,
 * and the two must never be confused.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type RouteAudience =
  /** Internal staff, behind the CRM session and the permission model. */
  | "staff"
  /** A signed-in customer, behind the separate portal session. */
  | "customer"
  /** Anyone, including search engines. */
  | "public"
  /** Reached with a single-use token and no session by definition. */
  | "token";

export interface InventoryRoute {
  path: string;
  audience: RouteAudience;
}

// `import.meta.url` rather than `__dirname`: this module is read by the vitest
// suite (which provides CJS globals) AND run directly under tsx as ESM (which
// does not). Using __dirname worked in one and threw in the other.
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_TSX = join(HERE, "..", "App.tsx");

/**
 * Every `<Route path=…>` registered in the application.
 *
 * Literal paths are returned verbatim; `ROUTES.x` references are returned as
 * `ROUTES.x` because their values live in `lib/routes.ts` and resolving them
 * here would duplicate that mapping — for the purposes of "is this classified",
 * the symbolic name is identity enough.
 */
export function readRegisteredRoutes(source = readFileSync(APP_TSX, "utf8")): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/<Route\s+path=(?:"([^"]+)"|\{(ROUTES\.[A-Za-z0-9_]+)\})/g)) {
    found.add(m[1] ?? m[2]);
  }
  return [...found].sort();
}

/**
 * How each registered route is reached.
 *
 * `/admin/activate` is deliberately `token`: the single-use invitation token in
 * the URL *is* the credential, and the person following it has no session yet
 * by definition. Putting it behind the staff guard would make an invitation
 * impossible to accept.
 *
 * The portal is `customer` and is a separate auth system from the staff one —
 * a portal session must be structurally unable to reach a `staff` route, and
 * the reverse. Anything unclassified is treated as a failure rather than
 * defaulted, because guessing wrong in the permissive direction is how a
 * customer surface quietly acquires staff data.
 */
export function classify(path: string): RouteAudience | null {
  if (path === "/admin/activate") return "token";
  if (path === "/portal/accept") return "token";
  if (path.startsWith("/portal")) return "customer";
  if (path.startsWith("/admin")) return "staff";
  if (path.startsWith("ROUTES.")) {
    // The public marketing surface, plus the three admin entries that carry
    // symbolic names.
    if (/^ROUTES\.(admin|adminLogin|adminDashboard|adminSubmission)$/.test(path)) return "staff";
    return "public";
  }
  return null;
}

export function buildInventory(source?: string): InventoryRoute[] {
  return readRegisteredRoutes(source).map((path) => {
    const audience = classify(path);
    if (!audience) throw new Error(`unclassified route: ${path}`);
    return { path, audience };
  });
}

/** Routes a staff verification sweep should open, with their params filled in. */
export function staffSweepPaths(inventory: InventoryRoute[], sample: Record<string, string> = {}): string[] {
  return inventory
    .filter((r) => r.audience === "staff" && !r.path.startsWith("ROUTES."))
    // `/admin/*?` is the catch-all that mounts the subtree, not a page.
    .filter((r) => !r.path.includes("*"))
    .map((r) => r.path.replace(/:(\w+)/g, (_, name: string) => sample[name] ?? "1"));
}
