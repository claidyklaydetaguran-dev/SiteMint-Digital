/**
 * Getting a customer into the portal — the staff half of M4.
 *
 * The portal, its invitation routes, its session cookie and its document grants
 * all shipped and all worked. Nothing in the CRM ever called them, so in
 * practice no customer could reach it: there was no control anywhere on a
 * contact that issued an invitation. This panel is that control.
 *
 * ── The one thing it refuses to blur ────────────────────────────────────────
 *
 * There are two completely different outcomes behind the word "invited", and a
 * UI that shows the same green tick for both is lying to the operator:
 *
 *   1. We EMAILED the link. The token is in the customer's mailbox and nowhere
 *      else — the server does not return it, and this panel could not show it
 *      if it wanted to. When they redeem it, the fact that it arrived is proof
 *      the address reaches them.
 *
 *   2. We could NOT email it (no mail configured, refused, failed, or an
 *      outcome nobody learned). The server hands back the raw link precisely so
 *      a person can pass it on — down the phone, in a chat window. That creates
 *      a working login over an address NOBODY HAS CHECKED. Every later message
 *      to it, a password reset included, may go nowhere.
 *
 * So the four `MailFailure` words from lib/staffMail.ts are reported as
 * themselves, each with what it means for a retry, and a hand-delivered link
 * always carries the warning about the unverified mailbox.
 *
 * Revoking is the other place the wording matters: it signs somebody out of
 * their own account, so it is named for what it does and confirmed before it
 * runs.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, CheckCircle2, Copy, KeyRound, Link2, Mail,
  RefreshCw, ShieldOff, FileText,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── Shape ─────────────────────────────────────────────────────────────────────

interface GrantItem {
  id: number;
  attachmentId: number;
  filename: string;
  grantedByLabel: string;
  createdAt: string;
}

interface PortalAccess {
  contact: { id: number; name: string; email: string | null };
  canInvite: boolean;
  blockedReason: string | null;
  mail: { configured: boolean; blockedReason: string | null };
  account: {
    id: number;
    email: string;
    status: string;
    active: boolean;
    lastSignInAt: string | null;
    createdAt: string;
    updatedAt: string;
    mailboxProven: boolean;
    mailboxNote: string | null;
    acceptedAt: string | null;
  } | null;
  invitation: {
    id: number;
    email: string;
    createdAt: string;
    createdByLabel: string;
    expiresAt: string;
    delivery: string | null;
    deliveryDetail: string | null;
    emailed: boolean;
  } | null;
  lapsedInvitationAt: string | null;
  invitationCount: number;
  documents: { granted: number; canList: boolean; items: GrantItem[] | null };
}

interface InviteResult {
  invitation: {
    id: number;
    email: string;
    expiresAt: string;
    delivery: string;
    deliveryDetail: string | null;
  };
  inviteToken?: string;
  invitePath?: string;
  handDelivered: boolean;
  mailboxWillBeProven: boolean;
  mailboxNote: string | null;
}

// ── The delivery vocabulary, in an operator's words ───────────────────────────
//
// These are the exact `MailFailure` values from artifacts/api-server/src/lib/
// staffMail.ts. The interesting column is `retry`: it is the difference between
// "send it again" and "sending it again may deliver twice", which is the only
// question somebody looking at a failed invitation actually has.

const DELIVERY: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad"; meaning: string; retry: string }
> = {
  sent: {
    label: "Emailed",
    tone: "ok",
    meaning: "The mail provider accepted the message for this address.",
    retry: "The link is in their mailbox and is not shown here.",
  },
  not_configured: {
    label: "Not emailed",
    tone: "warn",
    meaning: "Nothing was handed to the mail provider at all, so no message exists.",
    retry: "Pass the link on yourself, or configure mail and send again.",
  },
  rejected: {
    label: "Refused",
    tone: "bad",
    meaning: "The provider looked at the message and refused it.",
    retry: "The same message will be refused the same way. Fix the address or the sending domain first.",
  },
  failed: {
    label: "Not accepted",
    tone: "bad",
    meaning: "The provider did not take the message, for a reason that may pass.",
    retry: "Nothing was queued, so sending again cannot deliver twice.",
  },
  uncertain: {
    label: "Outcome unknown",
    tone: "warn",
    meaning: "The message went out and we never learned what happened to it.",
    retry: "It may already have arrived. Sending again could deliver it twice.",
  },
};

const TONE: Record<"ok" | "warn" | "bad", string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
};

function describe(state: string | null | undefined) {
  return (state && DELIVERY[state]) || {
    label: state ?? "Not recorded",
    tone: "warn" as const,
    meaning: "No delivery outcome was recorded for this invitation.",
    retry: "Send a fresh invitation if you need one you can account for.",
  };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function day(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function absoluteInviteUrl(path: string | undefined, token: string | undefined): string {
  if (!path) return "";
  // The server builds the whole link when CRM_PUBLIC_BASE_URL is set. When it
  // is not, it hands back the shape instead, and the honest thing is to fill it
  // from the address this CRM is being used at rather than invent a hostname.
  if (/^https?:\/\//i.test(path)) return path;
  if (path.includes("<token>") && token) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${path.replace("<token>", encodeURIComponent(token))}`;
  }
  return path;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function CustomerPortalPanel({
  leadId, contactEmail,
}: { leadId: number; contactEmail?: string }) {
  const [data, setData] = useState<PortalAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [actionError, setActionError] = useState("");
  const [confirming, setConfirming] = useState<"account" | "invitation" | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/crm/portal/access/${leadId}`);
      if (!res.ok) {
        setError(
          res.status === 403
            ? "You do not have permission to see this contact's portal access."
            : res.status === 404
              ? "This backend does not provide the portal access route yet."
              : `Could not load portal access (${res.status}).`,
        );
        setData(null);
        return;
      }
      setData(await res.json() as PortalAccess);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // `contactEmail` is a dependency on purpose: adding an email address to a
  // contact is exactly what turns "cannot be invited" into "can be", and the
  // panel would otherwise keep showing the refusal until a full page reload.
  useEffect(() => { void load(); }, [load, contactEmail]);

  async function act(
    label: string,
    path: string,
    onDone: (body: unknown) => void,
  ) {
    setBusy(label);
    setActionError("");
    try {
      const res = await adminFetch(path, { method: "POST", body: JSON.stringify({ leadId }) });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setActionError(body.error ?? `That did not work (${res.status}).`);
        return;
      }
      onDone(body);
      await load();
    } catch {
      setActionError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy("");
      setConfirming(null);
    }
  }

  const invite = () => act("invite", "/api/crm/portal/invitations", (body) => {
    setResult(body as InviteResult);
    setCopied(false);
  });

  const revokeInvitation = (id: number) =>
    act("invitation", `/api/crm/portal/invitations/${id}/revoke`, () => setResult(null));

  const revokeAccess = () =>
    act("account", `/api/crm/portal/accounts/${leadId}/revoke`, () => setResult(null));

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access is refused on an insecure origin and in some locked
      // down browsers. The link is on screen and selectable either way, so this
      // says so instead of pretending the copy worked.
      setActionError("Could not reach the clipboard — select the link above and copy it by hand.");
    }
  }

  // ── Chrome ────────────────────────────────────────────────────────────────

  const header = (right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-serif font-bold text-sm text-foreground flex items-center gap-1.5">
        <KeyRound className="w-3.5 h-3.5 shrink-0 text-teal-600" aria-hidden />
        Customer Portal
      </h3>
      {right}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
        {header()}
        <div className="animate-pulse space-y-2" aria-hidden>
          <div className="h-3 w-2/3 bg-muted rounded" />
          <div className="h-3 w-1/2 bg-muted rounded" />
          <div className="h-8 w-full bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
        {header()}
        <div className="flex flex-wrap items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{error || "Portal access could not be read."}</span>
        </div>
        <button
          onClick={() => void load()}
          className="w-full text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const { account, invitation, documents } = data;
  const status = account
    ? account.active
      ? { label: "Active", tone: "ok" as const }
      : { label: "Access revoked", tone: "bad" as const }
    : invitation
      ? { label: "Invited", tone: "warn" as const }
      : { label: "No access", tone: "warn" as const };

  const inviteLabel = account
    ? account.active ? "Send a new invitation" : "Invite again to restore access"
    : invitation ? "Send it again" : "Send portal invitation";

  const resultDelivery = result ? describe(result.invitation.delivery) : null;
  const resultUrl = result ? absoluteInviteUrl(result.invitePath, result.inviteToken) : "";

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
      {header(
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${TONE[status.tone]}`}>
          {status.label}
        </span>,
      )}

      <p className="text-[10px] text-muted-foreground -mt-1">
        Where this contact signs in to see their projects, documents, quotes and requests.
      </p>

      {/* ── Current state ─────────────────────────────────────────────────── */}
      {account ? (
        <div className="bg-muted rounded-lg px-3 py-2.5 border border-border/60 space-y-1.5">
          <p className="text-xs font-semibold text-foreground break-all">{account.email}</p>
          <dl className="space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">Account</dt>
              <dd className={`font-medium text-right ${account.active ? "text-foreground" : "text-red-600"}`}>
                {account.active ? "Can sign in" : "Signed out and locked"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">Last signed in</dt>
              <dd className="font-medium text-foreground text-right">
                {account.lastSignInAt ? when(account.lastSignInAt) : "Never"}
              </dd>
            </div>
          </dl>
          <p className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-start gap-1 ${account.mailboxProven ? TONE.ok : TONE.warn}`}>
            {account.mailboxProven
              ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0 mt-0.5" aria-hidden />
              : <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" aria-hidden />}
            <span className="min-w-0">
              {account.mailboxProven ? "Email address confirmed" : "Email address never confirmed"}
            </span>
          </p>
          {account.mailboxNote && (
            <p className="text-[10px] text-muted-foreground leading-snug">{account.mailboxNote}</p>
          )}
        </div>
      ) : invitation ? (
        <div className="bg-muted rounded-lg px-3 py-2.5 border border-border/60 space-y-1.5">
          <p className="text-xs font-semibold text-foreground break-all">{invitation.email}</p>
          <p className="text-[11px] text-muted-foreground">
            Invited by {invitation.createdByLabel} on {day(invitation.createdAt)} · expires {when(invitation.expiresAt)}
          </p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border inline-block ${TONE[describe(invitation.delivery).tone]}`}>
            {describe(invitation.delivery).label}
          </span>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {describe(invitation.delivery).meaning}
            {invitation.deliveryDetail ? ` ${invitation.deliveryDetail}` : ""}
          </p>
          {!invitation.emailed && (
            <p className="text-[10px] text-amber-700 leading-snug">
              They can only use this if somebody passed the link on by hand.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-muted rounded-lg px-3 py-2.5 border border-border/60">
          <p className="text-xs text-foreground font-medium">No portal access.</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            This contact cannot sign in and cannot see anything.
            {data.lapsedInvitationAt
              ? ` An earlier invitation lapsed on ${day(data.lapsedInvitationAt)}.`
              : ""}
          </p>
        </div>
      )}

      {/* ── What they would be able to see ────────────────────────────────── */}
      <div className="rounded-lg px-3 py-2.5 border border-border/60 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <FileText className="w-3 h-3 shrink-0" aria-hidden />
          Documents they can see
        </p>
        {documents.granted === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            None. They would sign in to an empty document list — nothing is shared until
            somebody grants it.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-foreground">
              {documents.granted} {documents.granted === 1 ? "document" : "documents"}
            </p>
            {documents.canList && documents.items ? (
              <ul className="space-y-0.5">
                {documents.items.slice(0, 4).map((g) => (
                  <li key={g.id} className="text-[11px] text-muted-foreground break-all">
                    {g.filename}
                  </li>
                ))}
                {documents.items.length > 4 && (
                  <li className="text-[11px] text-muted-foreground">
                    and {documents.items.length - 4} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-snug">
                You do not have permission to see which files these are.
              </p>
            )}
          </>
        )}
        <Link href="/admin/crm/documents">
          <button className="text-[11px] text-primary hover:opacity-80 transition-opacity underline">
            Manage what is shared
          </button>
        </Link>
      </div>

      {/* ── Why we cannot invite ──────────────────────────────────────────── */}
      {data.blockedReason && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 break-words">{data.blockedReason}</span>
        </p>
      )}

      {/* ── What sending one would do right now ───────────────────────────── */}
      {data.canInvite && !data.mail.configured && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <Mail className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 break-words">
            No email will be sent: {data.mail.blockedReason} You will be given the link to pass
            on yourself.
          </span>
        </p>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {actionError && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 break-words">{actionError}</span>
        </p>
      )}

      {confirming === "account" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
          <p className="text-[11px] text-red-700 leading-snug">
            Revoke portal access for {account?.email}? They are signed out immediately, their
            password stops working, and any invitation still outstanding is cancelled.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void revokeAccess()}
              disabled={busy !== ""}
              className="flex-1 min-w-[7rem] text-xs font-medium px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {busy === "account" ? "Revoking…" : "Yes, revoke access"}
            </button>
            <button
              onClick={() => setConfirming(null)}
              className="flex-1 min-w-[5rem] text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Keep access
            </button>
          </div>
        </div>
      ) : confirming === "invitation" && invitation ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
          <p className="text-[11px] text-amber-800 leading-snug">
            Cancel the invitation sent to {invitation.email}? The link stops working. Nobody is
            signed out, because it was never redeemed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void revokeInvitation(invitation.id)}
              disabled={busy !== ""}
              className="flex-1 min-w-[7rem] text-xs font-medium px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {busy === "invitation" ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button
              onClick={() => setConfirming(null)}
              className="flex-1 min-w-[5rem] text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Leave it
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => void invite()}
            disabled={!data.canInvite || busy !== ""}
            title={data.blockedReason ?? undefined}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2.5 bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "invite"
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden />
              : <Mail className="w-3.5 h-3.5" aria-hidden />}
            {busy === "invite" ? "Sending…" : inviteLabel}
          </button>
          {account?.active && (
            <>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Sending a new invitation resets their password and signs them out of any
                session they have open.
              </p>
              <button
                onClick={() => setConfirming("account")}
                disabled={busy !== ""}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <ShieldOff className="w-3.5 h-3.5" aria-hidden />
                Revoke portal access
              </button>
            </>
          )}
          {invitation && (
            <button
              onClick={() => setConfirming("invitation")}
              disabled={busy !== ""}
              className="w-full text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Cancel this invitation
            </button>
          )}
        </div>
      )}

      {/* ── What just happened ────────────────────────────────────────────── */}
      {result && resultDelivery && (
        <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${TONE[resultDelivery.tone]}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest">{resultDelivery.label}</p>
          <p className="text-[11px] leading-snug break-words">
            {resultDelivery.meaning}
            {result.invitation.deliveryDetail ? ` ${result.invitation.deliveryDetail}` : ""}
          </p>
          <p className="text-[11px] leading-snug break-words">{resultDelivery.retry}</p>

          {result.handDelivered && resultUrl && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Link2 className="w-3 h-3 shrink-0" aria-hidden />
                Pass this on yourself
              </p>
              <code className="block text-[10px] bg-white/70 border border-border/60 rounded px-2 py-1.5 break-all select-all">
                {resultUrl}
              </code>
              <button
                onClick={() => void copyLink(resultUrl)}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 border border-border rounded hover:bg-white/60 transition-colors"
              >
                <Copy className="w-3 h-3" aria-hidden />
                {copied ? "Copied" : "Copy link"}
              </button>
              <p className="text-[11px] leading-snug">
                It works once and expires {when(result.invitation.expiresAt)}.
              </p>
            </div>
          )}

          {result.mailboxNote && (
            <p className="text-[11px] leading-snug border-t border-border/60 pt-1.5">
              {result.mailboxNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
