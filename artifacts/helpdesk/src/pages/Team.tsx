/**
 * Team — the people who can sign in to this business.
 *
 * Owners invite, remove and change roles; staff see the list. Every member,
 * whatever their role, can change their own password here. The server
 * enforces all of it — the page only avoids offering what would be refused.
 *
 * See `pages/team/teamContract.ts` for every string and rule.
 */

import { useCallback, useEffect, useState } from "react";
import { useSession, useViewer } from "@/hooks/useSession";
import {
  changeOwnMemberPassword,
  changeTeamMemberRole,
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
} from "@/lib/accountApi";
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
  OWN_PASSWORD,
  PAGE,
  ROLE_DETAIL,
  ROLE_OPTIONS,
  ROSTER,
  canChangeRole,
  canRemove,
  inviteErrorDetail,
  memberDate,
  roleLabel,
  statusLabel,
  statusTone,
  validateInvite,
  validateOwnPassword,
  type InviteForm,
  type TeamMember,
} from "@/pages/team/teamContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-settings.css";
import "@/styles/v2-signin.css";

export default function Team() {
  const { data: me, isLoading } = useSession();
  const viewer = useViewer();

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<InviteForm>(EMPTY_INVITE_FORM);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<"idle" | "sending" | "sent">("idle");
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ title: string; detail: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    const result = await fetchTeamMembers();
    if (result.ok) {
      setMembers(result.value.items);
      setLoadFailed(false);
    } else {
      // An empty roster and a failed read are different facts.
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
    setRowError(null);
    setBusyRow(member.id);
    const result = await removeTeamMember(member.id);
    setBusyRow(null);
    if (result.ok) {
      setAnnouncement(ROSTER.removedAnnouncement);
      await load();
    } else {
      setRowError({ title: ROSTER.removeFailedTitle, detail: result.message || ROSTER.removeFailedDetail });
    }
  };

  const handleRoleChange = async (member: TeamMember, role: string) => {
    if (role === member.role) return;
    setRowError(null);
    setBusyRow(member.id);
    const result = await changeTeamMemberRole(member.id, role);
    setBusyRow(null);
    if (result.ok) {
      setAnnouncement(ROSTER.roleChangedAnnouncement);
      await load();
    } else {
      setRowError({ title: ROSTER.roleChangeFailedTitle, detail: result.message });
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
          <p className="sd-page__meta">{viewer.isOwner ? PAGE.detail : PAGE.staffDetail}</p>
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

        {rowError !== null && (
          <div className="sd-error" role="alert">
            <div className="sd-error__body">
              <span className="sd-error__title">{rowError.title}</span>
              <p className="sd-error__detail">{rowError.detail}</p>
            </div>
          </div>
        )}

        <ul className="sd-list">
          <li className="sd-list__head" aria-hidden="true">
            <span>{ROSTER.columnEmail}</span>
            <span>{ROSTER.columnRole}</span>
            <span>{ROSTER.columnStatus}</span>
            <span>{ROSTER.columnInvited}</span>
            <span />
          </li>
          <li className="sd-list__row">
            <span className="sd-list__cell">
              {me.firm.email ?? "—"}
              {viewer.accountHolder && <span className="sd-chip"> {ROSTER.you}</span>}
            </span>
            <span className="sd-list__cell">{roleLabel("owner")}</span>
            <span className="sd-list__cell" title={ROSTER.accountHolderDetail}>{ROSTER.accountHolderRow}</span>
            <span className="sd-list__cell">{memberDate(me.firm.createdAt)}</span>
            <span className="sd-list__cell" />
          </li>
          {members !== null &&
            members.map((member) => (
              <li className="sd-list__row" key={member.id}>
                <span className="sd-list__cell">
                  {member.email}
                  {member.isYou && <span className="sd-chip"> {ROSTER.you}</span>}
                </span>
                <span className="sd-list__cell">
                  {canChangeRole(member, viewer.isOwner) ? (
                    <span className="si-form">
                    <select
                      className="si-input"
                      aria-label={`${ROSTER.roleChangeLabel} for ${member.email}`}
                      value={member.role}
                      disabled={busyRow === member.id}
                      onChange={(e) => void handleRoleChange(member, e.target.value)}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    </span>
                  ) : (
                    roleLabel(member.role)
                  )}
                </span>
                <span className="sd-list__cell" data-tone={statusTone(member.status)}>{statusLabel(member.status)}</span>
                <span className="sd-list__cell">{memberDate(member.invitedAt)}</span>
                <span className="sd-list__cell">
                  {canRemove(member, viewer.isOwner) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="sd-error__action" disabled={busyRow === member.id}>
                          {busyRow === member.id ? ROSTER.removePendingLabel : ROSTER.removeLabel}
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

        {members !== null && members.length === 0 && !loadFailed && (
          <div className="sd-empty">
            <p className="sd-empty__title">{ROSTER.emptyTitle}</p>
            <p className="sd-empty__detail">{ROSTER.emptyDetail}</p>
          </div>
        )}
      </section>

      {viewer.isOwner && (
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
      )}

      {!viewer.accountHolder && <OwnPasswordSection />}
    </div>
  );
}

/** A team member's own password. The main account uses Settings instead. */
function OwnPasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validation = validateOwnPassword(current, next);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setState("saving");
    const result = await changeOwnMemberPassword(current, next);
    if (result.ok) {
      setState("done");
      setCurrent("");
      setNext("");
    } else {
      setState("idle");
      setError(result.message);
    }
  };

  return (
    <section className="sd-section" aria-labelledby="tm-password-title">
      <div className="sd-section__head">
        <div>
          <h2 className="sd-h2" id="tm-password-title">{OWN_PASSWORD.heading}</h2>
          <p className="sg-note">{OWN_PASSWORD.detail}</p>
        </div>
      </div>
      <form className="si-form" onSubmit={submit} noValidate>
        {error !== null && (
          <div className="si-alert" role="alert">
            <span className="si-alert__label">{OWN_PASSWORD.failedTitle}</span>
            <span className="si-alert__text">{error}</span>
          </div>
        )}
        {state === "done" && (
          <div className="si-alert" role="status" data-tone="confirmed">
            <span className="si-alert__label">{OWN_PASSWORD.doneTitle}</span>
            <span className="si-alert__text">{OWN_PASSWORD.doneDetail}</span>
          </div>
        )}
        <div className="si-field">
          <label htmlFor="tm-current" className="si-label">{OWN_PASSWORD.currentLabel}</label>
          <input id="tm-current" className="si-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="si-field">
          <label htmlFor="tm-new" className="si-label">{OWN_PASSWORD.newLabel}</label>
          <input id="tm-new" className="si-input" type="password" autoComplete="new-password" aria-describedby="tm-new-help" value={next} onChange={(e) => setNext(e.target.value)} />
          <p className="si-hint" id="tm-new-help">{OWN_PASSWORD.newHelp}</p>
        </div>
        <button type="submit" className="si-submit" disabled={state === "saving"}>
          {state === "saving" ? OWN_PASSWORD.submitPendingLabel : OWN_PASSWORD.submitLabel}
        </button>
      </form>
    </section>
  );
}
