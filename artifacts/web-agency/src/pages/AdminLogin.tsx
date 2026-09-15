import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck, UserPlus } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { StaffSignInFields, useStaffSignIn } from "@/components/crm/StaffSignInForm";
import { staffAccountCount } from "@/lib/staffSignIn";

// M1: sign-in is per person. Three states, decided by the server rather than
// by a guess:
//   "setup"  — no staff accounts exist yet, so the first owner is created here
//              using the server's own ADMIN_PASSWORD secret.
//   "signin" — email + password.
//   "mfa"    — the password was accepted and a second factor is required.
//
// The fields and the calls behind them are shared with the session-ended dialog
// (components/crm/StaffSignInForm.tsx, lib/staffSignIn.ts), so both sign a
// person in the same way.

export default function AdminLogin() {
  const [, navigate] = useLocation();

  function goToWorkspace() {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    navigate(redirect && redirect.startsWith("/admin") ? redirect : "/admin/crm/dashboard");
  }

  const form = useStaffSignIn({ initialStage: "loading", onSignedIn: () => goToWorkspace() });
  const { stage, setStage } = form;

  useEffect(() => {
    let cancelled = false;
    void staffAccountCount().then((count) => {
      if (!cancelled) setStage(count === 0 ? "setup" : "signin");
    });
    return () => { cancelled = true; };
  }, [setStage]);

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
            <form onSubmit={(event) => { void form.submit(event); }} className="space-y-5">
              <StaffSignInFields form={form} idPrefix="admin-login" autoFocus />

              <Button type="submit" className="w-full h-12 text-base" disabled={form.busy}>
                {form.busy ? "Working…"
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
