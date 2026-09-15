/**
 * Team — the people a business has invited to its account.
 *
 * Invite, list and remove work. Invited people cannot sign in yet, there is no
 * screen to accept an invitation, and roles are labels only — the copy says so
 * rather than promising any of it.
 *
 * See `pages/team/teamContract.ts` for every string and rule.
 */

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { fetchTeamMembers, inviteTeamMember, removeTeamMember } from "@/lib/accountApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  EMPTY_INVITE_FORM,
  INVITE,
  PAGE,
  ROLE_DETAIL,
  ROLE_OPTIONS,
  ROSTER,
  canRemove,
  inviteErrorDetail,
  memberDate,
  roleLabel,
  statusLabel,
  statusTone,
  validateInvite,
  type InviteForm,
  type TeamMember,
} from "@/pages/team/teamContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-settings.css";
import "@/styles/v2-signin.css";

export default function Team() {
  const { data: me, isLoading } = useSession();

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<InviteForm>(EMPTY_INVITE_FORM);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<"idle" | "sending" | "sent">("idle");
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    const result = await fetchTeamMembers();
    if (result.ok) {
      setMembers(result.value.items);
      setLoadFailed(false);
    } else {
      // An empty roster and a failed read are different facts; showing the
      // empty state for a failure would tell a business nobody has access when
      // the truth is that nobody knows.
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    const validation = validateInvite(form);
    if (!validation.ok) {
      setInviteError(validation.error);
      return;
    }
    setInviteState("sending");
    const result = await inviteTeamMember(validation.payload.email, validation.payload.role);
    if (result.ok) {
      setInviteState("sent");
      setForm(EMPTY_INVITE_FORM);
      await load();
    } else {
      setInviteState("idle");
      setInviteError(inviteErrorDetail(result.message));
    }
  };

  const handleRemove = async (member: TeamMember) => {
    setRemoveFailed(false);
    setRemoving(member.id);
    const result = await removeTeamMember(member.id);
    setRemoving(null);
    if (result.ok) {
      setAnnouncement(ROSTER.removedAnnouncement);
      await load();
    } else {
      setRemoveFailed(true);
    }
  };

  if (isLoading) {
    return (
      <div className="sd-page">
        <p className="sd-sr" role="status" aria-live="polite">{PAGE.loading}</p>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      <div className="sd-sr" role="status" aria-live="polite">{announcement}</div>

      <section className="sd-section" aria-labelledby="tm-roster-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="tm-roster-title">{ROSTER.heading}</h2>
        </div>

        {loadFailed && (
          <div className="sd-error" role="alert">
            <div className="sd-error__body">
              <span className="sd-error__title">{PAGE.failed}</span>
            </div>
            <button type="button" className="sd-error__action" onClick={() => void load()}>Try again</button>
          </div>
        )}

        {removeFailed && (
          <div className="sd-error" role="alert">
            <div className="sd-error__body">
              <span className="sd-error__title">{ROSTER.removeFailedTitle}</span>
              <p className="sd-error__detail">{ROSTER.removeFailedDetail}</p>
            </div>
          </div>
        )}

        {members !== null && members.length === 0 && !loadFailed && (
          <div className="sd-empty">
            <p className="sd-empty__title">{ROSTER.emptyTitle}</p>
            <p className="sd-empty__detail">{ROSTER.emptyDetail}</p>
          </div>
        )}

        {members !== null && members.length > 0 && (
          <ul className="sd-list">
            <li className="sd-list__head" aria-hidden="true">
              <span>{ROSTER.columnEmail}</span>
              <span>{ROSTER.columnRole}</span>
              <span>{ROSTER.columnStatus}</span>
              <span>{ROSTER.columnInvited}</span>
              <span />
            </li>
            {members.map((member) => (
              <li className="sd-list__row" key={member.id}>
                <span className="sd-list__cell">{member.email}</span>
                <span className="sd-list__cell">{roleLabel(member.role)}</span>
                <span className="sd-list__cell" data-tone={statusTone(member.status)}>{statusLabel(member.status)}</span>
                <span className="sd-list__cell">{memberDate(member.invitedAt)}</span>
                <span className="sd-list__cell">
                  {canRemove(member) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="sd-error__action" disabled={removing === member.id}>
                          {removing === member.id ? ROSTER.removePendingLabel : ROSTER.removeLabel}
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{ROSTER.removeConfirmTitle}</AlertDialogTitle>
                          <AlertDialogDescription>{ROSTER.removeConfirmDetail}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{ROSTER.removeConfirmDismiss}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleRemove(member)}>
                            {ROSTER.removeConfirmAction}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sd-section" aria-labelledby="tm-invite-title">
        <div className="sd-section__head">
          <div>
            <h2 className="sd-h2" id="tm-invite-title">{INVITE.heading}</h2>
            <p className="sg-note">{INVITE.detail}</p>
          </div>
        </div>

        <form className="si-form" onSubmit={handleInvite} noValidate>
          {inviteError !== null && (
            <div className="si-alert" role="alert">
              <span className="si-alert__label">{INVITE.failedTitle}</span>
              <span className="si-alert__text">{inviteError}</span>
            </div>
          )}
          {inviteState === "sent" && (
            <div className="si-alert" role="status" data-tone="confirmed">
              <span className="si-alert__label">{INVITE.sentTitle}</span>
              <span className="si-alert__text">{INVITE.sentDetail}</span>
            </div>
          )}

          <div className="si-field">
            <label htmlFor="tm-email" className="si-label">
              {INVITE.emailLabel} <span className="si-req">Required</span>
            </label>
            <input
              id="tm-email"
              className="si-input"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <fieldset className="si-field">
            <legend className="si-label">{INVITE.roleLabel}</legend>
            {ROLE_OPTIONS.map((option) => (
              <label className="sa-check" htmlFor={`tm-role-${option.value}`} key={option.value}>
                <input
                  id={`tm-role-${option.value}`}
                  type="radio"
                  name="tm-role"
                  checked={form.role === option.value}
                  onChange={() => setForm((f) => ({ ...f, role: option.value }))}
                />
                <span>
                  {option.label} — {ROLE_DETAIL[option.value]}
                </span>
              </label>
            ))}
          </fieldset>

          <button type="submit" className="si-submit" disabled={inviteState === "sending"}>
            {inviteState === "sending" ? INVITE.submitPendingLabel : INVITE.submitLabel}
          </button>
        </form>
      </section>
    </div>
  );
}
