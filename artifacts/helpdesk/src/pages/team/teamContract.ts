/**
 * Team — the people who can sign in to a business's receptionist dashboard.
 *
 * What the server does (api-server lib/voiceAccounts/membership.ts and
 * lib/receptionistRoles.ts), and therefore what this page may say:
 *
 *   - An owner invites someone by email. The email carries a link to the
 *     "Accept invitation" screen and a code valid for seven days.
 *   - The invited person chooses their own password there and is signed in.
 *     From then on they sign in with their own email and password.
 *   - Roles are enforced on every request. Staff can see everything and handle
 *     calls, messages, contacts, bookings and support; only owners can change
 *     the receptionist, phone number, calendar connection, transfers, team,
 *     billing and business details.
 *   - Removing someone ends their sessions immediately.
 *   - Only the business's main account changes the account's sign-in email
 *     and password; every member manages their own password.
 *
 * This module owns strings and rules only. It claims nothing the endpoints do
 * not support: no last-seen, no per-member activity, no custom permissions.
 */

export const PAGE = {
  eyebrow: "ACCOUNT",
  title: "Team",
  detail:
    "Give colleagues their own sign-in. Owners can change settings; staff can see everything and handle calls, messages, contacts and bookings.",
  staffDetail:
    "You're signed in as staff. You can see the team, but only an owner can invite, remove or change someone's role.",
  loading: "Loading your team…",
  failed: "Your team couldn't be loaded. Try again shortly.",
} as const;

export const ROSTER = {
  heading: "People",
  columnEmail: "Email",
  columnRole: "Role",
  columnStatus: "Status",
  columnInvited: "Invited",
  you: "You",
  accountHolderRow: "Main account",
  accountHolderDetail: "The business's own sign-in. It is always an owner and can't be removed here.",
  emptyTitle: "No one else has access yet",
  emptyDetail: "Invite a colleague below. They'll get an email to choose their own password.",
  removeLabel: "Remove",
  removePendingLabel: "Removing…",
  removeConfirmTitle: "Remove this person?",
  removeConfirmDetail:
    "They are signed out straight away and can't sign in again. An unused invitation stops working. You can invite them again later.",
  removeConfirmAction: "Remove",
  removeConfirmDismiss: "Keep them",
  removedAnnouncement: "That person was removed and signed out.",
  removeFailedTitle: "That person wasn't removed",
  removeFailedDetail: "Nothing changed. Try again.",
  roleChangeLabel: "Change role",
  roleChangedAnnouncement: "Role updated.",
  roleChangeFailedTitle: "The role wasn't changed",
} as const;

export const INVITE = {
  heading: "Invite someone",
  detail:
    "We email them a link to choose their own password. The link and its code work once, for seven days.",
  emailLabel: "Their email address",
  roleLabel: "Role",
  submitLabel: "Send invitation",
  submitPendingLabel: "Sending…",
  sentTitle: "Invitation sent",
  sentDetail: "They appear in the list as invited until they accept.",
  failedTitle: "The invitation wasn't sent",
  emailRequired: "Enter their email address.",
  emailInvalid: "Enter a valid email address.",
} as const;

export const OWN_PASSWORD = {
  heading: "Your password",
  detail: "Change the password you use to sign in to this business.",
  currentLabel: "Current password",
  newLabel: "New password",
  newHelp: "At least 8 characters.",
  submitLabel: "Change password",
  submitPendingLabel: "Changing…",
  doneTitle: "Password changed",
  doneDetail: "Any other place you were signed in has been signed out.",
  failedTitle: "Your password wasn't changed",
  tooShort: "Choose a password of at least 8 characters.",
  currentRequired: "Enter your current password.",
} as const;

/** The one fact every Team string has to agree with. */
export const TEAM_SIGN_IN_AVAILABLE = true;

export type MemberRole = "owner" | "staff";
export type MemberStatus = "invited" | "active" | "revoked";

export interface TeamMember {
  id: number;
  email: string;
  role: string;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  isYou?: boolean;
}

export const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff" };
export const ROLE_DETAIL: Record<string, string> = {
  owner: "Can do everything, including the receptionist's setup, phone number, calendar, team and billing.",
  staff: "Can see everything and handle calls, messages, contacts, bookings and support. Can't change settings.",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? "Unknown role";
}

export const ROLE_OPTIONS: { value: MemberRole; label: string; detail: string }[] = [
  { value: "staff", label: ROLE_LABEL.staff!, detail: ROLE_DETAIL.staff! },
  { value: "owner", label: ROLE_LABEL.owner!, detail: ROLE_DETAIL.owner! },
];

export const STATUS_LABEL: Record<string, string> = {
  invited: "Invited — hasn't accepted yet",
  active: "Can sign in",
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

/**
 * Whether the viewer may remove this row. Only owners manage the team, nobody
 * removes themselves, and a removed row has nothing left to remove.
 */
export function canRemove(member: TeamMember, viewerIsOwner = true): boolean {
  if (!viewerIsOwner || member.isYou === true) return false;
  return member.status === "invited" || member.status === "active";
}

/** Whether the viewer may change this row's role. */
export function canChangeRole(member: TeamMember, viewerIsOwner: boolean): boolean {
  if (!viewerIsOwner || member.isYou === true) return false;
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

export function validateOwnPassword(current: string, next: string): { ok: true } | { ok: false; error: string } {
  if (current === "") return { ok: false, error: OWN_PASSWORD.currentRequired };
  if (next.length < 8) return { ok: false, error: OWN_PASSWORD.tooShort };
  return { ok: true };
}

/**
 * The server's sentence is shown as-is when it has one — it knows things the
 * browser cannot, such as the member limit or that the address is already on
 * the team. This is only the fallback.
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
    ...Object.values(OWN_PASSWORD),
    ...Object.values(ROLE_LABEL),
    ...Object.values(ROLE_DETAIL),
    ...Object.values(STATUS_LABEL),
    roleLabel("nonsense"),
    statusLabel("nonsense"),
    inviteErrorDetail(null),
    memberDate(null),
  ];
}
