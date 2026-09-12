/**
 * Team — who else can get into this account.
 *
 * The backend has carried invite / list / revoke since P8
 * (`POST|GET|DELETE /api/receptionist/account/members`, plus the token-proven
 * `POST .../members/accept`). Nothing in the dashboard called any of it, so a
 * business had exactly one way to let a colleague in: share the owner's
 * password. That is the failure this page removes, and it is worth being
 * explicit about — a shared password cannot be revoked without locking the
 * owner out too, and gives no record of who did what.
 *
 * This module owns strings and rules only. It claims nothing the endpoints do
 * not support: no last-seen, no per-page permissions, no activity per member.
 */

export const PAGE = {
  eyebrow: "ACCOUNT",
  title: "Team",
  detail: "Who can sign in to this account. Everyone here gets their own password — nobody needs to share yours.",
  loading: "Loading your team…",
  failed: "Your team couldn't be loaded. Try again shortly.",
} as const;

export const ROSTER = {
  heading: "People with access",
  columnEmail: "Email",
  columnRole: "Role",
  columnStatus: "Status",
  columnInvited: "Invited",
  emptyTitle: "No one else has access",
  emptyDetail: "Invite a colleague below and they will get their own sign-in.",
  removeLabel: "Remove",
  removePendingLabel: "Removing…",
  removeConfirmTitle: "Remove this person?",
  removeConfirmDetail:
    "They lose access immediately, and any invitation they have not used stops working. Nothing they did is deleted.",
  removeConfirmAction: "Remove",
  removeConfirmDismiss: "Keep access",
  removedAnnouncement: "That person no longer has access.",
  removeFailedTitle: "That person wasn't removed",
  removeFailedDetail: "Nothing changed. Try again.",
} as const;

export const INVITE = {
  heading: "Invite someone",
  detail: "They get an email with a link to set their own password. The link works once, and expires after seven days.",
  emailLabel: "Their email address",
  roleLabel: "Role",
  submitLabel: "Send invitation",
  submitPendingLabel: "Sending…",
  sentTitle: "Invitation sent",
  sentDetail: "They will appear below as invited until they set their password.",
  failedTitle: "The invitation wasn't sent",
  emailRequired: "Enter their email address.",
  emailInvalid: "Enter a valid email address.",
} as const;

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
 * What each role can do, in the terms a business thinks in.
 *
 * Deliberately short and true: the server enforces one distinction (owner vs
 * staff), so this describes that one distinction and does not imply a
 * permissions system that does not exist.
 */
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff" };
export const ROLE_DETAIL: Record<string, string> = {
  owner: "Full access, including billing and the team.",
  staff: "Everything except billing and the team.",
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
 * "Invited" is not "has access" — the distinction matters when an owner is
 * working out why a colleague cannot sign in, and a single "pending" label
 * would hide it.
 */
export const STATUS_LABEL: Record<string, string> = {
  invited: "Invited, not signed in yet",
  active: "Has access",
  revoked: "Access removed",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? "Unknown";
}

export function statusTone(status: string): "attention" | "settled" | "muted" {
  if (status === "invited") return "attention";
  if (status === "active") return "settled";
  return "muted";
}

/** Only someone who currently has access, or is still waiting to use an invite, can be removed. */
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
