import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Lock, RotateCw, ShieldCheck, UserPlus } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { StaffSignInFields, useStaffSignIn } from "@/components/crm/StaffSignInForm";
import { staffAccountCount } from "@/lib/staffSignIn";
import type { Load } from "@/lib/adminLoad";

// M1: sign-in is per person. The stage is decided by the server rather than by
// a guess:
//   "setup"  — no staff accounts exist yet, so the first owner is created here
//              using the server's own ADMIN_PASSWORD secret.
//   "signin" — email + password.
//   "mfa"    — the password was accepted and a second factor is required.
//
// And a fourth answer that is not a stage at all: we asked how many accounts
// exist and did not find out. That used to be read as "accounts exist", which
// showed the sign-in form — so on a brand-new deployment, where nobody has
// been created yet, the first-run setup screen never appeared and the operator
// had no way in, with nothing on screen saying the count could not be read.
// Guessing "setup" instead would be worse: it would offer to create an owner
// on a system that may already have one. So neither is guessed.
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

  /** Whether an owner account exists yet — or that we could not find out. */
  const [accounts, setAccounts] = useState<Load<number>>({ status: "loading" });
  const [rechecking, setRechecking] = useState(false);

  const checkAccounts = useCallback(async () => {
    setRechecking(true);
    const next = await staffAccountCount();
    setAccounts(next);
    setRechecking(false);
    if (next.status === "ready") setStage(next.data === 0 ? "setup" : "signin");
  }, [setStage]);

  useEffect(() => { void checkAccounts(); }, [checkAccounts]);

  const unknown = accounts.status === "error";
  const heading = unknown ? "This server could not be checked"
    : stage === "setup" ? "Create the first account"
    : stage === "mfa" ? "Two-step verification"
    : "SiteMint Operations";
  const sub = unknown ? "Whether an account exists here is not known"
    : stage === "setup" ? "No staff accounts exist yet"
    : stage === "mfa" ? "Enter the code from your authenticator app"
    : "Sign in with your own account";
  const Icon = unknown ? AlertTriangle
    : stage === "setup" ? UserPlus
    : stage === "mfa" ? ShieldCheck
    : Lock;

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

          {accounts.status === "error" ? (
            /*
              No form at all: either one could be the wrong one, and showing
              the wrong one is how a fresh deployment ends up with no way in.
            */
            <div className="space-y-4">
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-foreground break-words">
                We could not read whether an owner account exists on this
                server, so this page is not showing you a sign-in form or a
                first-run setup form — either one could be the wrong one.{" "}
                <span className="text-muted-foreground">{accounts.reason}</span>
              </p>
              <Button
                type="button"
                className="w-full h-12 text-base gap-2"
                onClick={() => { void checkAccounts(); }}
                disabled={rechecking}
              >
                {rechecking
                  ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  : <RotateCw className="w-4 h-4" aria-hidden="true" />}
                {rechecking ? "Trying again…" : "Try again"}
              </Button>
            </div>
          ) : stage === "loading" ? (
            <div className="py-8 flex justify-center" role="status">
              <span className="sr-only">Checking this server…</span>
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
