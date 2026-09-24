/**
 * Who is allowed into the CRM workspace — and the third answer that was
 * missing.
 *
 * The guard used to ask one question, "may this person in, yes or no", and a
 * server it could not reach answered "no". For the legacy shared admin that was
 * survivable, because a stored bearer token stood in for the answer. For a
 * per-person staff session there is no stored token by design (signing in as
 * staff clears it), so a stopped API, a dropped VPN or a sleeping laptop
 * produced exactly the same outcome as being signed out: a redirect to the
 * sign-in page, with the open page and anything unsaved on it discarded.
 *
 * Observed on 2026-09-16 against a locally stopped API: every CRM route bounced
 * to `/admin?redirect=…` while the session itself was still perfectly valid on
 * the server.
 *
 * So the question now has three answers. `unreachable` is NOT `denied`: nothing
 * about the person's credentials has been learned, so the right response is to
 * say the server cannot be reached and offer to try again — never to throw the
 * page away.
 */

export type AccessOutcome = "allowed" | "denied" | "unreachable";

export interface AccessResult {
  outcome: AccessOutcome;
  /** The staff id when a per-person session answered; null for the legacy admin. */
  staffId: number | null;
}

export interface AccessProbes {
  /** `GET /api/crm/staff/me`. Rejects only when the request never completed. */
  probeStaff: () => Promise<Response>;
  /** `GET /api/admin/me`. Rejects only when the request never completed. */
  probeLegacy: () => Promise<Response>;
  /** Is a legacy shared-admin bearer token stored in this browser? */
  hasLegacyToken: () => boolean;
  /** Reads the staff id out of a successful staff probe. */
  staffIdFrom: (res: Response) => Promise<number | null>;
}

const allowed = (staffId: number | null): AccessResult => ({ outcome: "allowed", staffId });
const denied: AccessResult = { outcome: "denied", staffId: null };
const unreachable: AccessResult = { outcome: "unreachable", staffId: null };

/**
 * A 5xx is the server failing to answer, never a verdict on this person's
 * credentials — so it must not read as "denied" either.
 *
 * This is not a corner case: when the application is down, the thing in front
 * of it answers instead. The dev server's proxy turns a stopped API into a 500,
 * and the production edge turns it into a 502/503/504 — measured, not assumed,
 * on 2026-09-16 with the API stopped. Classifying only a rejected fetch as
 * "unreachable" therefore missed every real outage and still signed people out.
 */
const noVerdict = (res: Response): boolean => res.status >= 500;

/**
 * A transport failure keeps a stored legacy token working exactly as it did
 * before; with no token there is nothing to fall back on, and the honest answer
 * is that we do not know.
 */
function whenUnreachable(probes: AccessProbes): AccessResult {
  return probes.hasLegacyToken() ? allowed(null) : unreachable;
}

export async function resolveAccess(probes: AccessProbes): Promise<AccessResult> {
  let staff: Response;
  try {
    staff = await probes.probeStaff();
  } catch {
    // The transport is down; the second probe would fail the same way.
    return whenUnreachable(probes);
  }
  if (staff.ok) return allowed(await probes.staffIdFrom(staff));
  if (noVerdict(staff)) return whenUnreachable(probes);

  // A 401 here means "no staff session", not "signed out" — the legacy
  // shared-credential path may still be the valid one.
  let legacy: Response;
  try {
    legacy = await probes.probeLegacy();
  } catch {
    return whenUnreachable(probes);
  }
  if (legacy.ok) return allowed(null);
  if (noVerdict(legacy)) return whenUnreachable(probes);
  // An older backend without the route tells us nothing either way, so the
  // stored token is the only evidence left.
  if (legacy.status === 404) return probes.hasLegacyToken() ? allowed(null) : denied;
  return denied;
}
