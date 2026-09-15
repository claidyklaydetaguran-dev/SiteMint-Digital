/**
 * V5 customer-shell foundation — client for the account-editing surface added
 * by D-7 (editable business profile) and S-2 (password reset / change).
 *
 * `GET`/`PATCH /api/receptionist/agent-config` already exists and returns
 * `{ firm: { name, industry, greetingMessage, businessDescription,
 * qualifyingQuestions } }` (documented in the task brief and confirmed by
 * `readAgentConfig` in `pages/overview/overviewContract.ts`, a file this
 * session also owns). D-7 additionally needs `timezone`, `primaryContact`
 * and `defaultLocation` to be readable and writable there — these are the
 * PATCH-accepted keys this frontend assumes the backend owner is adding in
 * the same PR; report and confirm with the backend owner before relying on
 * them in production. Every field is optional and read defensively, so a
 * server that has not yet added a key degrades to "not set" rather than to
 * an error.
 *
 * The password-reset and password-change endpoints are the shapes specified
 * in the task brief; `changePassword` treats a 404 as "not available yet"
 * because that route may not exist until the backend owner ships it.
 */

import { apiFetch } from "@/lib/api";

export interface AccountProfile {
  name: string;
  industry: string;
  timezone: string;
  primaryContact: { name: string; email: string };
  defaultLocation: string;
  greetingMessage: string;
  businessDescription: string;
  qualifyingQuestions: string[];
}

export interface AgentConfigResponse {
  firm: Partial<{
    name: string;
    industry: string;
    timezone: string;
    primaryContact: Partial<{ name: string; email: string }>;
    defaultLocation: string;
    greetingMessage: string;
    businessDescription: string;
    qualifyingQuestions: string[];
  }>;
}

const EMPTY_PROFILE: AccountProfile = {
  name: "",
  industry: "",
  timezone: "",
  primaryContact: { name: "", email: "" },
  defaultLocation: "",
  greetingMessage: "",
  businessDescription: "",
  qualifyingQuestions: [],
};

export function readAccountProfile(body: AgentConfigResponse | null | undefined): AccountProfile {
  const firm = body?.firm ?? {};
  return {
    name: typeof firm.name === "string" ? firm.name : EMPTY_PROFILE.name,
    industry: typeof firm.industry === "string" ? firm.industry : EMPTY_PROFILE.industry,
    timezone: typeof firm.timezone === "string" ? firm.timezone : EMPTY_PROFILE.timezone,
    primaryContact: {
      name: typeof firm.primaryContact?.name === "string" ? firm.primaryContact.name : "",
      email: typeof firm.primaryContact?.email === "string" ? firm.primaryContact.email : "",
    },
    defaultLocation:
      typeof firm.defaultLocation === "string" ? firm.defaultLocation : EMPTY_PROFILE.defaultLocation,
    greetingMessage:
      typeof firm.greetingMessage === "string" ? firm.greetingMessage : EMPTY_PROFILE.greetingMessage,
    businessDescription:
      typeof firm.businessDescription === "string"
        ? firm.businessDescription
        : EMPTY_PROFILE.businessDescription,
    qualifyingQuestions: Array.isArray(firm.qualifyingQuestions)
      ? firm.qualifyingQuestions.filter((q): q is string => typeof q === "string")
      : [],
  };
}

export function fetchAgentConfig(): Promise<AgentConfigResponse> {
  return apiFetch<AgentConfigResponse>("/receptionist/agent-config");
}

// ─── Business profile ────────────────────────────────────────────────────
//
// Its own endpoint, not `agent-config`. That route configures the SMS
// receptionist's *agent* (greeting, description, qualifying questions) and
// accepts nothing else: sending it `name`/`industry`/`timezone` produced
// `400 No fields to update`, so this form never once saved, and Setup step 1
// — complete only when name AND industry are set — could never be finished.
//
// `primaryContact` and `defaultLocation` are stored in their own firm-scoped
// table (voice migration 0011) and returned by the same endpoint.

export const PROFILE_ENDPOINT = "/receptionist/account/profile";

export interface BusinessProfile {
  name: string;
  industry: string;
  timezone: string;
  primaryContact: { name: string; email: string };
  defaultLocation: string;
}

export interface BusinessProfileResponse {
  profile: Partial<Omit<BusinessProfile, "primaryContact">> & {
    primaryContact?: Partial<BusinessProfile["primaryContact"]>;
  };
}

export function readBusinessProfile(body: BusinessProfileResponse | null | undefined): BusinessProfile {
  const p = body?.profile ?? {};
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    name: text(p.name),
    industry: text(p.industry),
    timezone: text(p.timezone),
    primaryContact: { name: text(p.primaryContact?.name), email: text(p.primaryContact?.email) },
    defaultLocation: text(p.defaultLocation),
  };
}

export function fetchBusinessProfile(): Promise<BusinessProfileResponse> {
  return apiFetch<BusinessProfileResponse>(PROFILE_ENDPOINT);
}

export interface AccountProfilePatch {
  name?: string;
  industry?: string;
  timezone?: string;
  primaryContact?: { name?: string; email?: string };
  defaultLocation?: string;
}

export function updateAccountProfile(patch: AccountProfilePatch): Promise<BusinessProfileResponse> {
  return apiFetch<BusinessProfileResponse>(PROFILE_ENDPOINT, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ─── Can this business actually be emailed? ──────────────────────────────

export const EMAIL_STATUS_ENDPOINT = "/api/receptionist/account/email-status";

export interface EmailStatus {
  canReceiveEmail: boolean;
  email: string | null;
  reason: "no_account_email" | "email_not_verified" | null;
}

/**
 * `GET /account/email-status`.
 *
 * The server answers from the same resolver the SENDER uses, so a `true` here
 * means mail would actually be delivered — not that a column looks right.
 * Throws on failure so the caller can tell "not verified" apart from "could not
 * ask", which are different things to show a business.
 */
export async function fetchEmailStatus(): Promise<EmailStatus> {
  const res = await fetch(EMAIL_STATUS_ENDPOINT, { credentials: "include" });
  if (!res.ok) throw new Error("email-status unavailable");
  return (await res.json()) as EmailStatus;
}

// ─── Team ────────────────────────────────────────────────────────────────

export const MEMBERS_ENDPOINT = "/api/receptionist/account/members";

export interface TeamMemberResponse {
  id: number;
  email: string;
  role: string;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
}

export type TeamResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function teamFetch<T>(path: string, init?: RequestInit): Promise<TeamResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (!res.ok) {
      // The server's own sentence is passed through: it knows the member limit
      // and the roster, which the browser does not.
      return { ok: false, message: data.error?.trim() ? data.error : "Something went wrong. Try again." };
    }
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Try again." };
  }
}

export function fetchTeamMembers(): Promise<TeamResult<{ items: TeamMemberResponse[]; count: number }>> {
  return teamFetch(MEMBERS_ENDPOINT);
}

export function inviteTeamMember(email: string, role: string): Promise<TeamResult<{ member: TeamMemberResponse }>> {
  return teamFetch(MEMBERS_ENDPOINT, { method: "POST", body: JSON.stringify({ email, role }) });
}

export function removeTeamMember(id: number): Promise<TeamResult<Record<string, unknown>>> {
  return teamFetch(`${MEMBERS_ENDPOINT}/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

// ─── Email address ───────────────────────────────────────────────────────

export const EMAIL_CHANGE_ENDPOINT = "/api/receptionist/account/email";

export type ChangeEmailResult =
  | { ok: true; email: string; verificationSent: boolean }
  | { ok: false; message: string };

/**
 * Changes the address the account signs in with, and that every notification
 * goes to.
 *
 * The success shape carries TWO facts, because they can differ: the address
 * changed, and whether a confirmation code actually reached it. Collapsing them
 * would leave a business waiting for mail that was never sent.
 *
 * The server's own sentence is passed through on refusal — it knows things the
 * browser cannot, such as whether another account already holds the address.
 */
export async function changeAccountEmail(email: string, currentPassword: string): Promise<ChangeEmailResult> {
  try {
    const res = await fetch(EMAIL_CHANGE_ENDPOINT, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, currentPassword }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string; verificationSent?: boolean };
    if (!res.ok) {
      return { ok: false, message: data.error?.trim() ? data.error : "Could not change your email address." };
    }
    return { ok: true, email: data.email ?? email, verificationSent: data.verificationSent === true };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Try again." };
  }
}

// ─── Password ────────────────────────────────────────────────────────────

export const PASSWORD_RESET_REQUEST_ENDPOINT = "/api/receptionist/account/password-reset/request";
export const PASSWORD_RESET_COMPLETE_ENDPOINT = "/api/receptionist/account/password-reset/complete";
export const PASSWORD_CHANGE_ENDPOINT = "/api/receptionist/account/password/change";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "invalid" | "network"; message: string };

/**
 * `PASSWORD_CHANGE_ENDPOINT` may not exist yet (the brief flags it as
 * possibly unbuilt). A 404 is read as "not available yet", never as a
 * password error — those are different facts and the page must not conflate
 * them.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  try {
    const res = await fetch(PASSWORD_CHANGE_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.status === 404) {
      return { ok: false, reason: "unavailable", message: "Password change is not available yet." };
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        reason: "invalid",
        message: data.error?.trim() ? data.error : "Could not change your password.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "network",
      message: "We couldn't reach the server. Try again.",
    };
  }
}
