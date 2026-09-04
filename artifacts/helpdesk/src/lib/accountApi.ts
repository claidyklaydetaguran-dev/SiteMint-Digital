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

export interface AccountProfilePatch {
  name?: string;
  industry?: string;
  timezone?: string;
  primaryContact?: { name: string; email: string };
  defaultLocation?: string;
}

export function updateAccountProfile(patch: AccountProfilePatch): Promise<AgentConfigResponse> {
  return apiFetch<AgentConfigResponse>("/receptionist/agent-config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
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
