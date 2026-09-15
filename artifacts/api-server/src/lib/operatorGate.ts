// The one gate for platform-operator voice routes (numbers, invites, beta
// requests, diagnostics, issues, usage).
//
// Two operator identities exist while the CRM cutover is in progress:
//
//   1. a per-person `crm_staff_session` — CSRF check, MFA challenge and a named
//      permission, judged by `requireCrmAuth` (lib/staffAuth.ts);
//   2. the legacy shared-password admin, in either of its forms: the
//      process-lifetime bearer, or the persistent hashed `admin_session`
//      cookie (lib/admin-session.ts) that survives a restart and is accepted
//      by every instance.
//
// Before this module the operator files disagreed. Some accepted only (2),
// which locks a staff-account operator out of assigning a number in a
// deployment where staff accounts are the way people sign in. One accepted
// only the staff session or the bearer, which signs a shared-password operator
// out after every restart. Each route now accepts both, with one rule.
//
// Order is the security-relevant part: a request that resolves to a LIVE staff
// session is judged by the CRM gate as that person, with NO fallback — a staff
// member who lacks the named permission is not waved through on a shared
// credential their browser also happens to hold. A staff cookie that resolves
// to nobody (idle-expired, revoked, forged) carries no identity, so it neither
// grants nor blocks anything.
//
// The fallback honours `CRM_LEGACY_BEARER_ENABLED`: setting it to "false"
// retires the shared credential, bearer and cookie alike, on every route here
// at once. A customer's `receptionist_session` is neither identity and never
// passes.

import type { RequestHandler } from "express";

import { resolveAdminAuthMode } from "./admin-session.js";
import { legacyBearerEnabled, requireCrmAuth, resolveStaffSession } from "./staffAuth.js";
import type { Permission } from "./staffPermissions.js";

/** Puts the CRM staff gate in front of the legacy shared-admin modes. */
export function orLegacyAdminSession(gate: RequestHandler): RequestHandler {
  return async function adminOpsGate(req, res, next) {
    // A live session is resolved a second time inside `gate`. That is the price
    // of reusing the gate unmodified, which keeps its CSRF, MFA and permission
    // rules in exactly one place; these are low-traffic operator routes.
    const staff = await resolveStaffSession(req);
    if (!staff && legacyBearerEnabled() && (await resolveAdminAuthMode(req))) {
      next();
      return;
    }
    await gate(req, res, next);
  };
}

/** Operator-only: a staff member holding `permission`, or the legacy admin. */
export function requireOperator(permission: Permission): RequestHandler {
  return orLegacyAdminSession(requireCrmAuth(permission));
}
