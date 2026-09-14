import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Monitor, KeyRound, Check, Copy, AlertCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// M1: the signed-in person's own account — name, password, second factor, and
// the list of devices holding a live session, each individually revocable.

interface Me {
  id: number;
  email: string;
  displayName: string;
  role: string;
  mfaEnrolled: boolean;
  permissions: string[];
  timezone: string | null;
}

/** What the browser thinks, offered as a suggestion rather than applied silently. */
const browserZone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
})();

interface SessionRow {
  id: number;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

function shortDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function CrmMyAccount() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [enrol, setEnrol] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [enrolCode, setEnrolCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, sessRes] = await Promise.all([
        adminFetch("/api/crm/staff/me"),
        adminFetch("/api/crm/staff/me/sessions"),
      ]);
      if (!meRes.ok) {
        setError("You are signed in with the legacy shared admin password, which has no personal account.");
        return;
      }
      const m = ((await meRes.json()) as { staff: Me }).staff;
      setMe(m);
      setDisplayName(m.displayName);
      setTimezone(m.timezone ?? "");
      if (sessRes.ok) {
        const d = await sessRes.json() as { sessions: SessionRow[]; currentSessionId: number };
        setSessions(d.sessions);
        setCurrentSessionId(d.currentSessionId);
      }
    } catch {
      setError("Couldn't load your account. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveName() {
    const r = await adminFetch("/api/crm/staff/me", {
      method: "PATCH", body: JSON.stringify({ displayName }),
    });
    const d = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) { setError(d.error ?? "Could not save your name."); return; }
    setNotice("Name updated.");
    void load();
  }

  async function saveTimezone() {
    setError(""); setNotice("");
    const r = await adminFetch("/api/crm/staff/me", {
      method: "PATCH", body: JSON.stringify({ timezone: timezone.trim() }),
    });
    const d = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) { setError(d.error ?? "Could not save your timezone."); return; }
    setNotice(`Timezone set to ${timezone.trim()}. Deadlines and reminders now follow it.`);
    void load();
  }

  async function changePassword() {
    setError(""); setNotice("");
    const r = await adminFetch("/api/crm/staff/me/password", {
      method: "POST", body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) { setError(d.error ?? "Could not change your password."); return; }
    navigate("/admin?reason=password-changed");
  }

  async function startEnrol() {
    const r = await adminFetch("/api/crm/staff/me/mfa/start", { method: "POST" });
    const d = await r.json().catch(() => ({})) as { secret?: string; otpauthUri?: string; error?: string };
    if (!r.ok || !d.secret || !d.otpauthUri) { setError(d.error ?? "Could not start enrolment."); return; }
    setEnrol({ secret: d.secret, otpauthUri: d.otpauthUri });
  }

  async function confirmEnrol() {
    const r = await adminFetch("/api/crm/staff/me/mfa/confirm", {
      method: "POST", body: JSON.stringify({ code: enrolCode }),
    });
    const d = await r.json().catch(() => ({})) as { recoveryCodes?: string[]; error?: string };
    if (!r.ok) { setError(d.error ?? "That code was not accepted."); return; }
    setEnrol(null); setEnrolCode("");
    setRecoveryCodes(d.recoveryCodes ?? []);
    void load();
  }

  async function disableMfa() {
    const r = await adminFetch("/api/crm/staff/me/mfa/disable", {
      method: "POST", body: JSON.stringify({ password: disablePassword }),
    });
    const d = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) { setError(d.error ?? "Could not turn off two-step verification."); return; }
    navigate("/admin?reason=mfa-disabled");
  }

  async function revoke(id: number) {
    const r = await adminFetch(`/api/crm/staff/me/sessions/${id}`, { method: "DELETE" });
    if (r.ok) void load();
  }

  return (
    <CrmLayout>
      <div className="max-w-2xl mx-auto p-5 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">My account</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your sign-in details and the devices currently signed in as you.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {notice && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{notice}</p>}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : me && (
          <>
            {/* Profile */}
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Display name</label>
                  <div className="flex gap-2">
                    <input className="flex-1 px-3 py-2 text-sm border border-input rounded-lg"
                      value={displayName} onChange={e => setDisplayName(e.target.value)} />
                    <Button size="sm" onClick={() => void saveName()}
                      disabled={displayName.trim().length < 2 || displayName === me.displayName}>
                      Save
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Your timezone</label>
                  <div className="flex flex-wrap gap-2">
                    <input className="flex-1 min-w-0 px-3 py-2 text-sm border border-input rounded-lg"
                      value={timezone} onChange={e => setTimezone(e.target.value)}
                      placeholder="Asia/Manila" />
                    <Button size="sm" onClick={() => void saveTimezone()}
                      disabled={!timezone.trim() || timezone === me.timezone}>
                      Save
                    </Button>
                  </div>
                  {/*
                    This decides whether a task is overdue, when its reminder
                    fires, and when the daily digest arrives — so a wrong value
                    is not cosmetic. Every account defaulted to UTC because
                    nothing could change it; for a team eight hours from UTC
                    that made a date-only task turn red on the morning it was
                    actually due.
                  */}
                  <p className="text-xs text-muted-foreground mt-1">
                    Decides when a task counts as overdue, when reminders fire, and when your daily
                    digest arrives.
                    {browserZone && browserZone !== me.timezone && (
                      <>
                        {" "}This device says you are in <strong>{browserZone}</strong>.{" "}
                        <button type="button" className="underline text-primary"
                          onClick={() => setTimezone(browserZone)}>
                          Use that
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {me.email} · {me.role.replace(/_/g, " ")}
                </p>
              </div>
            </section>

            {/* Password */}
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" /> Password
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Changing it signs you out everywhere, including here.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="password" autoComplete="current-password" placeholder="Current password"
                  className="px-3 py-2 text-sm border border-input rounded-lg"
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                <input type="password" autoComplete="new-password" placeholder="New password (12+ characters)"
                  className="px-3 py-2 text-sm border border-input rounded-lg"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <Button size="sm" className="mt-3" onClick={() => void changePassword()}
                disabled={!currentPassword || newPassword.length < 12}>
                Change password
              </Button>
            </section>

            {/* Two-step verification */}
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Two-step verification
              </h2>

              {recoveryCodes ? (
                <div className="mt-2">
                  <p className="text-xs text-foreground font-medium mb-1">
                    Save these recovery codes now — they are shown once.
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Each works once, in place of your authenticator app.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs bg-muted rounded-lg p-3">
                    {recoveryCodes.map(c => <span key={c}>{c}</span>)}
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 gap-1.5"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCodes.join("\n"));
                      setCopied(true); setTimeout(() => setCopied(false), 2000);
                    }}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy all"}
                  </Button>
                  <Button size="sm" className="mt-2 ml-2" onClick={() => setRecoveryCodes(null)}>Done</Button>
                </div>
              ) : me.mfaEnrolled ? (
                <div className="mt-2">
                  <p className="text-xs text-green-700 mb-3">
                    On — sign-in asks for a code from your authenticator app.
                  </p>
                  <div className="flex gap-2">
                    <input type="password" placeholder="Your password to turn it off"
                      className="flex-1 px-3 py-2 text-sm border border-input rounded-lg"
                      value={disablePassword} onChange={e => setDisablePassword(e.target.value)} />
                    <Button size="sm" variant="outline" onClick={() => void disableMfa()} disabled={!disablePassword}>
                      Turn off
                    </Button>
                  </div>
                </div>
              ) : enrol ? (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    Add this key to your authenticator app, then enter the 6-digit code it shows.
                  </p>
                  <code className="block text-xs font-mono bg-muted rounded-lg p-3 break-all mb-2">{enrol.secret}</code>
                  <div className="flex gap-2">
                    <input placeholder="000000" inputMode="numeric"
                      className="w-32 px-3 py-2 text-sm border border-input rounded-lg font-mono tracking-widest text-center"
                      value={enrolCode} onChange={e => setEnrolCode(e.target.value)} />
                    <Button size="sm" onClick={() => void confirmEnrol()} disabled={enrolCode.length !== 6}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEnrol(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    Off. Turning it on means a stolen password alone is not enough to reach client data.
                  </p>
                  <Button size="sm" onClick={() => void startEnrol()}>Set up</Button>
                </div>
              )}
            </section>

            {/* Sessions */}
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" /> Signed-in devices
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Revoking one signs that device out immediately.
              </p>
              <div className="divide-y divide-border/60">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {shortDevice(s.userAgent)}
                        {s.id === currentSessionId && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-teal-700">
                            this device
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.ip ?? "unknown address"} · last active {new Date(s.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                    {s.id !== currentSessionId && (
                      <button className="text-xs text-primary hover:underline shrink-0"
                        onClick={() => void revoke(s.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                {sessions.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">No other devices.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </CrmLayout>
  );
}
