/**
 * Team — the people a business has invited to its account.
 *
 * The backend has carried invite / list / revoke since P8
 * (`POST|GET|DELETE /api/receptionist/account/members`, plus the token-proven
 * `POST .../members/accept`). This page calls the first three.
 *
 * What it must NOT claim, because none of it exists yet:
 *
 *   - Invited people cannot sign in. Sign-in checks only the business's own
 *     account (the protected receptionist auth files); a roster row grants no
 *     login, whatever its status.
 *   - There is no screen to accept an invitation, and no link in the email —
 *     so nobody "sets their own password" from it.
 *   - Roles are labels. Nothing on the server reads `role` to allow or refuse
 *     anything, so "staff" cannot be kept out of billing or the team.
 *
 * An earlier version promised all three. It is corrected here rather than
 * hidden, because the invite, list and remove controls do work and are worth
 * keeping: they are a truthful record of who the business intends to let in.
 *
 * This module owns strings and rules only. It claims nothing the endpoints do
 * not support: no sign-in, no permissions, no last-seen, no activity per member.
 */

export const PAGE = {
  eyebrow: "ACCOUNT",
  title: "Team",
  detail:
    "Keep a list of the people you plan to give access to. Team sign-in is not available yet: invited people cannot sign in, and only your own email and password work.",
  loading: "Loading your team…",
  failed: "Your team couldn't be loaded. Try again shortly.",
} as const;

export const ROSTER = {
  heading: "Invited people",
  columnEmail: "Email",
  columnRole: "Role",
  columnStatus: "Status",
  columnInvited: "Invited",
  emptyTitle: "No one invited yet",
  emptyDetail: "Invitations you send are listed here. Invited people cannot sign in until team sign-in is available.",
  removeLabel: "Remove",
  removePendingLabel: "Removing…",
  removeConfirmTitle: "Remove this person?",
  removeConfirmDetail:
    "They come off this list and their invitation code stops working. Nothing else changes, because they could not sign in.",
  removeConfirmAction: "Remove",
  removeConfirmDismiss: "Keep them",
  removedAnnouncement: "That person was removed from your team list.",
  removeFailedTitle: "That person wasn't removed",
  removeFailedDetail: "Nothing changed. Try again.",
} as const;

export const INVITE = {
  heading: "Invite someone",
  detail:
    "We record the invitation and email them a code that is valid for seven days. They cannot sign in with it yet — team sign-in is not available.",
  emailLabel: "Their email address",
  roleLabel: "Role",
  submitLabel: "Send invitation",
  submitPendingLabel: "Sending…",
  sentTitle: "Invitation sent",
  sentDetail: "They appear below as invited. They cannot sign in yet.",
  failedTitle: "The invitation wasn't sent",
  emailRequired: "Enter their email address.",
  emailInvalid: "Enter a valid email address.",
} as const;

/** The one fact every Team string has to agree with. */
export const TEAM_SIGN_IN_AVAILABLE = false;

export type MemberRole = "owner" | "staff";
export type MemberStatus = "invited" | "active" | "revoked";

export interface TeamMember {
  id: number;
  email: string;
  role: string;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
}

/**
 * What each role means today: nothing is enforced.
 *
 * The server stores `owner` or `staff` and reads it for nothing else, so the
 * honest description is that a role is a label. It used to say staff could do
 * "everything except billing and the team", which the server has never
 * enforced.
 */
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff" };
export const ROLE_DETAIL: Record<string, string> = {
  owner: "Recorded as an owner. Roles are labels for now and do not change what anyone can do.",
  staff: "Recorded as staff. Roles are labels for now and do not change what anyone can do.",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? "Unknown role";
}

export const ROLE_OPTIONS: { value: MemberRole; label: string; detail: string }[] = [
  { value: "staff", label: ROLE_LABEL.staff!, detail: ROLE_DETAIL.staff! },
  { value: "owner", label: ROLE_LABEL.owner!, detail: ROLE_DETAIL.owner! },
];

/**
 * Status wording that says what is TRUE of the person right now.
 *
 * No status grants sign-in, so none may say "has access". "Accepted" is only
 * reachable through the API (there is no accept screen), and still means the
 * person cannot sign in.
 */
export const STATUS_LABEL: Record<string, string> = {
  invited: "Invited — cannot sign in yet",
  active: "Accepted — cannot sign in yet",
  revoked: "Removed",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? "Unknown";
}

export function statusTone(status: string): "attention" | "settled" | "muted" {
  if (status === "invited") return "attention";
  if (status === "active") return "settled";
  return "muted";
}

/** Only someone still on the list (invited or accepted) can be removed. */
export function canRemove(member: TeamMember): boolean {
  return member.status === "invited" || member.status === "active";
}

export function memberDate(iso: string | null): string {
  if (iso === null || iso.trim() === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface InviteForm {
  email: string;
  role: MemberRole;
}

export const EMPTY_INVITE_FORM: InviteForm = { email: "", role: "staff" };

export function validateInvite(form: InviteForm): { ok: true; payload: { email: string; role: MemberRole } } | { ok: false; error: string } {
  const email = form.email.trim().toLowerCase();
  if (email === "") return { ok: false, error: INVITE.emailRequired };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: INVITE.emailInvalid };
  return { ok: true, payload: { email, role: form.role } };
}

/**
 * The server's sentence is shown as-is when it has one — it knows things the
 * browser cannot, such as the member limit or that the address is already on
 * the roster. This is only the fallback.
 */
export function inviteErrorDetail(message: string | null | undefined): string {
  if (typeof message === "string" && message.trim() !== "") return message.trim();
  return "Nothing changed. Try sending the invitation again.";
}

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...Object.values(ROSTER),
    ...Object.values(INVITE),
    ...Object.values(ROLE_LABEL),
    ...Object.values(ROLE_DETAIL),
    ...Object.values(STATUS_LABEL),
    roleLabel("nonsense"),
    statusLabel("nonsense"),
    inviteErrorDetail(null),
    memberDate(null),
  ];
}
