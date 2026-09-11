import { useCallback, useEffect, useState } from "react";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  Users, ShieldCheck, KeyRound, Copy, Check, UserPlus, AlertCircle, RefreshCw,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// M1: the people page. Who works here, what each may do, and the invitation /
// reset links — which are handed over manually, because staff email delivery
// does not exist yet and pretending otherwise would lose people's invitations.

interface Staff {
  id: number;
  email: string;
  displayName: string;
  role: "owner" | "technical_admin" | "operations_manager";
  status: "invited" | "active" | "disabled";
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  permissions: string[];
  extraPermissions: string[];
  revokedPermissions: string[];
}

const ROLE_LABEL: Record<Staff["role"], string> = {
  owner: "Owner",
  technical_admin: "Technical administrator",
  operations_manager: "Operations manager",
};

const ROLE_BLURB: Record<Staff["role"], string> = {
  owner: "Full access, including people, billing, exports and deletions.",
  technical_admin: "Operations plus integrations, settings and the audit trail. No billing, role changes or deletions.",
  operations_manager: "Leads, projects, tasks and conversations. No exports, deletions or bulk campaign sends.",
};

const STATUS_STYLE: Record<Staff["status"], string> = {
  active: "bg-green-100 text-green-700",
  invited: "bg-yellow-100 text-yellow-700",
  disabled: "bg-muted text-muted-foreground",
};

/** A link the owner must pass on themselves — shown once, copyable. */
function HandoffLink({ label, token, kind }: { label: string; token: string; kind: "invite" | "password_reset" }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/admin/activate?kind=${kind}&token=${encodeURIComponent(token)}`;
  return (
    <div className="mt-3 rounded-lg border border-border bg-accent p-3">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
        Send this to them yourself — staff email delivery is not configured, so nothing was emailed.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono bg-background border border-input rounded px-2 py-1.5 truncate">
          {url}
        </code>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function CrmStaffAdmin() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [handoff, setHandoff] = useState<{ id: number; token: string; kind: "invite" | "password_reset" } | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: "", displayName: "", role: "operations_manager" as Staff["role"] });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, meRes] = await Promise.all([
        adminFetch("/api/crm/staff"),
        adminFetch("/api/crm/staff/me"),
      ]);
      if (meRes.ok) setMe(((await meRes.json()) as { staff: Staff }).staff);
      if (listRes.status === 403) {
        setError("You do not have permission to manage staff accounts.");
        return;
      }
      if (!listRes.ok) throw new Error(String(listRes.status));
      setStaff(((await listRes.json()) as { staff: Staff[] }).staff);
    } catch {
      setError("Couldn't load staff accounts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const canManage = !!me?.permissions.includes("staff.role.assign");
  const canInvite = !!me?.permissions.includes("staff.invite");

  async function invite() {
    setFormError("");
    const r = await adminFetch("/api/crm/staff", { method: "POST", body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({})) as { error?: string; staff?: Staff; activationToken?: string };
    if (!r.ok) { setFormError(d.error ?? "Could not create that account."); return; }
    setShowInvite(false);
    setForm({ email: "", displayName: "", role: "operations_manager" });
    if (d.staff && d.activationToken) setHandoff({ id: d.staff.id, token: d.activationToken, kind: "invite" });
    void load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusyId(id);
    const r = await adminFetch(`/api/crm/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})) as { error?: string };
    setBusyId(null);
    if (!r.ok) { setError(d.error ?? "That change was refused."); return; }
    setError("");
    void load();
  }

  async function issue(id: number, kind: "invite" | "password_reset") {
    setBusyId(id);
    const path = kind === "invite" ? `/api/crm/staff/${id}/invite` : `/api/crm/staff/${id}/password-reset`;
    const r = await adminFetch(path, { method: "POST" });
    const d = await r.json().catch(() => ({})) as { activationToken?: string; resetToken?: string; error?: string };
    setBusyId(null);
    if (!r.ok) { setError(d.error ?? "Could not create that link."); return; }
    const token = d.activationToken ?? d.resetToken;
    if (token) setHandoff({ id, token, kind });
  }

  return (
    <CrmLayout>
      <div className="max-w-4xl mx-auto p-5">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">People</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Everyone with their own sign-in, and what each of them may do.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()} className="px-2 h-9">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            {canInvite && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowInvite(v => !v)}>
                <UserPlus className="w-3.5 h-3.5" /> Add person
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {showInvite && (
          <div className="mb-5 rounded-xl border border-border bg-white p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Add a person</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className="px-3 py-2 text-sm border border-input rounded-lg" placeholder="Full name"
                value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
              <input className="px-3 py-2 text-sm border border-input rounded-lg" placeholder="name@sitemintdigital.com"
                type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <select className="px-3 py-2 text-sm border border-input rounded-lg bg-white"
                value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Staff["role"] })}>
                <option value="operations_manager">Operations manager</option>
                {canManage && <option value="technical_admin">Technical administrator</option>}
                {canManage && <option value="owner">Owner</option>}
              </select>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{ROLE_BLURB[form.role]}</p>
            {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => void invite()}
                disabled={!form.email.trim() || form.displayName.trim().length < 2}>
                Create account
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 && !error ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No staff accounts yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map(person => (
              <div key={person.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-foreground">{person.displayName}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[person.status]}`}>
                        {person.status}
                      </span>
                      {person.mfaEnrolled && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-teal-700 inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> 2-step
                        </span>
                      )}
                      {me?.id === person.id && (
                        <span className="text-[10px] text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{person.email}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">{ROLE_BLURB[person.role]}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {person.lastLoginAt
                        ? `Last signed in ${new Date(person.lastLoginAt).toLocaleDateString()}`
                        : "Has never signed in"}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <select
                      className="px-2 py-1 text-xs border border-input rounded-lg bg-white disabled:opacity-50"
                      value={person.role}
                      disabled={!canManage || me?.id === person.id || busyId === person.id}
                      onChange={e => void patch(person.id, { role: e.target.value })}
                    >
                      {(Object.keys(ROLE_LABEL) as Staff["role"][]).map(r => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      {canInvite && person.status === "invited" && (
                        <button className="text-xs text-primary hover:underline"
                          onClick={() => void issue(person.id, "invite")} disabled={busyId === person.id}>
                          New invite link
                        </button>
                      )}
                      {canManage && person.status === "active" && (
                        <button className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          onClick={() => void issue(person.id, "password_reset")} disabled={busyId === person.id}>
                          <KeyRound className="w-3 h-3" /> Reset password
                        </button>
                      )}
                      {canManage && me?.id !== person.id && (
                        <button
                          className="text-xs text-primary hover:underline"
                          disabled={busyId === person.id}
                          onClick={() => void patch(person.id, {
                            status: person.status === "disabled" ? "active" : "disabled",
                          })}
                        >
                          {person.status === "disabled" ? "Reactivate" : "Disable"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {handoff?.id === person.id && (
                  <HandoffLink
                    kind={handoff.kind}
                    token={handoff.token}
                    label={handoff.kind === "invite" ? "Invitation link (expires in 7 days)" : "Password reset link (expires in 1 hour)"}
                  />
                )}

                {person.extraPermissions.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Also granted: {person.extraPermissions.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed">
          Changing someone's role, permissions or status signs them out of every device immediately.
          Accounts are disabled rather than deleted, so their past work keeps their name on it.
        </p>
      </div>
    </CrmLayout>
  );
}
