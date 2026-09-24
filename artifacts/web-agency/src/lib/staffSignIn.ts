/**
 * Staff sign-in as request logic, with no UI.
 *
 * Two surfaces sign a person in: the sign-in page (`pages/AdminLogin.tsx`) and
 * the session-ended dialog (`components/crm/SessionEndedDialog.tsx`) that opens
 * over a page whose session ran out. They must call the same endpoints and keep
 * the same things afterwards — the security token, and no stale shared bearer —
 * so those calls live here exactly once.
 */

import { adminFetch, clearAdminToken, setCsrfToken } from "./adminFetch";
import { type Load, readAdminResource } from "./adminLoad";

/** The part of the signed-in person the sign-in surfaces need. */
export interface SignedInStaff {
  id: number;
  email: string;
  displayName: string;
}

export type SignInResult =
  | { kind: "signed-in"; staff: SignedInStaff | null }
  | { kind: "mfa-required" }
  | { kind: "error"; message: string };

export const SIGN_IN_CONNECTION_ERROR = "We could not reach the server. Check your connection and try again.";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? data as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function errorFrom(body: Record<string, unknown>, fallback: string): string {
  const error = body["error"];
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

function staffFrom(body: Record<string, unknown>): SignedInStaff | null {
  const raw = body["staff"];
  if (!raw || typeof raw !== "object") return null;
  const { id, email, displayName } = raw as Record<string, unknown>;
  if (typeof id !== "number") return null;
  return {
    id,
    email: typeof email === "string" ? email : "",
    displayName: typeof displayName === "string" ? displayName : "",
  };
}

/** Email and password. Stores the session's security token whenever the server issues one. */
export async function submitStaffPassword(email: string, password: string): Promise<SignInResult> {
  try {
    const res = await adminFetch("/api/crm/staff/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const body = await readJson(res);
    if (!res.ok) return { kind: "error", message: errorFrom(body, "That email address and password do not match.") };
    // Issued even when a second factor is still required: the code step and
    // everything after it belong to this same session.
    if (typeof body["csrfToken"] === "string") setCsrfToken(body["csrfToken"]);
    // The legacy bearer token is no longer issued to staff sign-ins; the
    // session cookie is the credential. Drop any stale token so requests are
    // attributed to this person rather than the old shared admin.
    clearAdminToken();
    if (body["mfaRequired"] === true) return { kind: "mfa-required" };
    return { kind: "signed-in", staff: staffFrom(body) };
  } catch {
    return { kind: "error", message: SIGN_IN_CONNECTION_ERROR };
  }
}

/** The authenticator (or recovery) code for a session whose password step succeeded. */
export async function submitStaffMfaCode(code: string): Promise<SignInResult> {
  try {
    const res = await adminFetch("/api/crm/staff/login/mfa", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const body = await readJson(res);
    if (!res.ok) return { kind: "error", message: errorFrom(body, "That code is not valid.") };
    return { kind: "signed-in", staff: staffFrom(body) };
  } catch {
    return { kind: "error", message: SIGN_IN_CONNECTION_ERROR };
  }
}

/** Creates the first owner from the server's admin password. Does not sign anybody in. */
export async function createFirstOwner(args: {
  adminPassword: string;
  email: string;
  displayName: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await adminFetch("/api/crm/staff/bootstrap", {
      method: "POST",
      body: JSON.stringify(args),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: errorFrom(await readJson(res), "Could not create the first account.") };
  } catch {
    return { ok: false, message: SIGN_IN_CONNECTION_ERROR };
  }
}

/**
 * How many staff accounts exist.
 *
 * Three answers, never two. This used to return `number | null` and its one
 * caller read null as "accounts exist", so a failed or slow probe showed the
 * sign-in form — and on a fresh deployment, where nobody has been created yet,
 * the first-run setup screen never appeared and the operator had no way
 * forward, with nothing on screen saying the count could not be read.
 *
 * Guessing the other way would be worse: offering to create an owner on a
 * system that may already have one. So a failure stays a failure, and the
 * caller says so instead of picking a form.
 */
export function staffAccountCount(): Promise<Load<number>> {
  return readAdminResource("/api/crm/staff/bootstrap-state", (body) => {
    const count = body && typeof body === "object" ? (body as { staffCount?: unknown }).staffCount : undefined;
    return typeof count === "number" ? count : undefined;
  });
}

/**
 * What a sign-in inside the session-ended dialog does with the page under it.
 *
 * "resume" only when the person who signed in is provably the one whose session
 * ended: the page, and whatever they had typed into it, is theirs. Anything else
 * — another account, a previous identity nobody knew (the legacy shared admin
 * has none), or a sign-in answer that named nobody — is "switch", and none of
 * the previous page may stay on screen.
 */
export function afterSessionSignIn(
  previousStaffId: number | string | null,
  signedIn: SignedInStaff | null,
): "resume" | "switch" {
  if (previousStaffId === null || !signedIn) return "switch";
  return String(previousStaffId) === String(signedIn.id) ? "resume" : "switch";
}
