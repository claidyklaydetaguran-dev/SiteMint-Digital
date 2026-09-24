import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { adminFetch } from "@/lib/adminFetch";

// M1: where an invitation or reset link lands. Unauthenticated by design — the
// single-use token in the URL is the proof, and it is consumed the moment a
// password is set, so a forwarded link cannot be reused.

export default function StaffActivation() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const kind = params.get("kind") === "password_reset" ? "password_reset" : "invite";

  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [account, setAccount] = useState<{ email: string; displayName: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setState("invalid"); return; }
      try {
        const r = await adminFetch(
          `/api/crm/staff/activation?kind=${kind}&token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (!r.ok) { setState("invalid"); return; }
        setAccount(await r.json() as { email: string; displayName: string });
        setState("ready");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, [token, kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Those two passwords do not match."); return; }
    setSaving(true);
    try {
      const path = kind === "invite" ? "/api/crm/staff/activation" : "/api/crm/staff/password-reset";
      const r = await adminFetch(path, { method: "POST", body: JSON.stringify({ token, password }) });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { setError(d.error ?? "That link is no longer valid."); return; }
      setState("done");
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen ops-auth flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <SiteMintLogo variant="ops" iconSize={36} />
        </div>

        <div className="ops-auth__card bg-background rounded-xl p-8 border border-border">
          {state === "checking" && (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {state === "invalid" && (
            <div className="text-center py-4">
              <h1 className="text-lg font-bold text-foreground mb-2">This link doesn't work</h1>
              <p className="text-sm text-muted-foreground mb-5">
                It has expired, was already used, or was mistyped. Ask an owner for a new one.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate("/admin")}>
                Go to sign in
              </Button>
            </div>
          )}

          {state === "done" && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <h1 className="text-lg font-bold text-foreground mb-2">
                {kind === "invite" ? "Your account is ready" : "Password updated"}
              </h1>
              <p className="text-sm text-muted-foreground mb-5">
                Sign in with your email address and the password you just chose.
              </p>
              <Button className="w-full" onClick={() => navigate("/admin")}>Sign in</Button>
            </div>
          )}

          {state === "ready" && account && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-foreground">
                    {kind === "invite" ? "Set your password" : "Choose a new password"}
                  </h1>
                  <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-5">
                <div>
                  <Label className="text-sm font-semibold mb-1.5 block">New password</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="At least 12 characters" className="h-11"
                    autoComplete="new-password" autoFocus />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1.5 block">Confirm password</Label>
                  <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Type it again" className="h-11" autoComplete="new-password" />
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full h-12 text-base"
                  disabled={saving || password.length === 0 || confirm.length === 0}>
                  {saving ? "Saving…" : kind === "invite" ? "Activate my account" : "Update password"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-background/40 mt-6">
          SiteMint Digital Solutions — Internal use only
        </p>
      </div>
    </div>
  );
}
