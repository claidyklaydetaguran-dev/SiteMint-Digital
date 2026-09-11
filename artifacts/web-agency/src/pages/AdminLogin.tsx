import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, UserPlus } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { adminFetch, clearAdminToken, setCsrfToken } from "@/lib/adminFetch";

// M1: sign-in is per person. Three states, decided by the server rather than
// by a guess:
//   "setup"  — no staff accounts exist yet, so the first owner is created here
//              using the server's own ADMIN_PASSWORD secret.
//   "signin" — email + password.
//   "mfa"    — the password was accepted and a second factor is required.
type Stage = "loading" | "setup" | "signin" | "mfa";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await adminFetch("/api/crm/staff/bootstrap-state");
        if (cancelled) return;
        if (!r.ok) { setStage("signin"); return; }
        const d = await r.json() as { staffCount?: number };
        setStage(d.staffCount === 0 ? "setup" : "signin");
      } catch {
        if (!cancelled) setStage("signin");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function goToWorkspace() {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    navigate(redirect && redirect.startsWith("/admin") ? redirect : "/admin/crm/dashboard");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (stage === "setup") {
        const r = await adminFetch("/api/crm/staff/bootstrap", {
          method: "POST",
          body: JSON.stringify({ adminPassword, email, displayName, password }),
        });
        const d = await r.json().catch(() => ({})) as { error?: string };
        if (!r.ok) { setError(d.error ?? "Could not create the first account."); return; }
        // Created, but not signed in — sign in with the credentials just set.
        setStage("signin");
        setAdminPassword("");
        setDisplayName("");
        return;
      }

      if (stage === "mfa") {
        const r = await adminFetch("/api/crm/staff/login/mfa", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        const d = await r.json().catch(() => ({})) as { error?: string };
        if (!r.ok) { setError(d.error ?? "That code is not valid."); return; }
        goToWorkspace();
        return;
      }

      const r = await adminFetch("/api/crm/staff/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json().catch(() => ({})) as {
        error?: string; csrfToken?: string; mfaRequired?: boolean;
      };
      if (!r.ok) { setError(d.error ?? "That email address and password do not match."); return; }
      if (d.csrfToken) setCsrfToken(d.csrfToken);
      // The legacy bearer token is no longer issued to staff sign-ins; the
      // session cookie is the credential. Drop any stale token so requests are
      // attributed to this person rather than the old shared admin.
      clearAdminToken();
      if (d.mfaRequired) { setStage("mfa"); setPassword(""); return; }
      goToWorkspace();
    } catch {
      setError("Connection error. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }

  const heading = stage === "setup" ? "Create the first account"
    : stage === "mfa" ? "Two-step verification"
    : "SiteMint Operations";
  const sub = stage === "setup" ? "No staff accounts exist yet"
    : stage === "mfa" ? "Enter the code from your authenticator app"
    : "Sign in with your own account";
  const Icon = stage === "setup" ? UserPlus : stage === "mfa" ? ShieldCheck : Lock;

  return (
    <div className="min-h-screen bg-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <SiteMintLogo variant="ops" iconSize={36} />
        </div>

        <div className="bg-background rounded-xl p-8 shadow-2xl border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">{heading}</h1>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          </div>

          {stage === "loading" ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {stage === "setup" && (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted rounded-lg p-3">
                    This creates the owner account for SiteMint. It works once, and
                    needs the server's <code className="font-mono">ADMIN_PASSWORD</code>.
                    Everyone else is invited from Settings afterwards.
                  </p>
                  <div>
                    <Label className="text-sm font-semibold mb-1.5 block">Server admin password</Label>
                    <Input type="password" value={adminPassword} autoComplete="off"
                      onChange={e => setAdminPassword(e.target.value)} className="h-11" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold mb-1.5 block">Your name</Label>
                    <Input value={displayName} onChange={e => setDisplayName(e.target.value)}
                      placeholder="e.g. Shasta Green" className="h-11" />
                  </div>
                </>
              )}

              {stage !== "mfa" && (
                <>
                  <div>
                    <Label className="text-sm font-semibold mb-1.5 block">Email</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@sitemintdigital.com" className="h-11"
                      autoComplete="username" autoFocus={stage === "signin"} />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold mb-1.5 block">
                      {stage === "setup" ? "Choose a password" : "Password"}
                    </Label>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder={stage === "setup" ? "At least 12 characters" : "Your password"}
                      className="h-11"
                      autoComplete={stage === "setup" ? "new-password" : "current-password"} />
                  </div>
                </>
              )}

              {stage === "mfa" && (
                <div>
                  <Label className="text-sm font-semibold mb-1.5 block">6-digit code</Label>
                  <Input value={code} onChange={e => setCode(e.target.value)}
                    placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                    className="h-12 tracking-[0.4em] text-center font-mono text-lg" autoFocus />
                  <p className="text-xs text-muted-foreground mt-2">
                    Lost your phone? Enter one of your recovery codes instead.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? "Working…"
                  : stage === "setup" ? "Create owner account"
                  : stage === "mfa" ? "Verify"
                  : "Sign In"}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-background/40 mt-6">
          SiteMint Digital Solutions — Internal use only
        </p>
      </div>
    </div>
  );
}
