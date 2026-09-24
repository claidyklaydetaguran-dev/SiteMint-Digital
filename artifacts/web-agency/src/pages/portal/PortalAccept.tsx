// ── M4: where a portal invitation lands ─────────────────────────────────────
//
// Unauthenticated by design: the single-use token in the URL is the proof, and
// it is consumed the moment a password is set, so a forwarded link cannot be
// reused.
//
// There is deliberately no "check this token first" round trip. The server
// answers a revoked, expired, spent or invented token identically, so a preview
// could not tell the visitor anything the submit does not — and every extra
// endpoint that takes a token is another place one could be logged.

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { AlertTriangle, KeyRound } from "lucide-react";
import { portalFetch, setPortalCsrf, PortalError } from "./portalApi";

export default function PortalAccept() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Those two passwords do not match."); return; }
    setBusy(true);
    try {
      const data = await portalFetch<{ csrfToken: string }>("/api/portal/invitations/accept", {
        method: "POST", body: { token, password },
      });
      setPortalCsrf(data.csrfToken);
      navigate("/portal");
    } catch (err) {
      setError(err instanceof PortalError && err.status === 404
        ? "This link is not valid any more. Ask your SiteMint contact for a new one."
        : err instanceof PortalError ? err.message : "Something went wrong at our end.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <SiteMintLogo className="mx-auto h-8 w-auto" />
        <div className="mt-6 flex items-center justify-center gap-2 text-teal-700 dark:text-teal-300">
          <KeyRound className="h-5 w-5" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Set your password</h1>
        </div>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Choose a password and you will be able to sign in to your client area from then on.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="accept-password">New password</Label>
            <Input
              id="accept-password" type="password" autoComplete="new-password"
              className="min-h-11" value={password} required minLength={12}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accept-confirm">Repeat it</Label>
            <Input
              id="accept-confirm" type="password" autoComplete="new-password"
              className="min-h-11" value={confirm} required
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}

          <Button type="submit" className="min-h-11 w-full" disabled={busy || !token}>
            {busy ? "Setting it up…" : "Set password and continue"}
          </Button>
          {!token && (
            <p className="text-sm text-muted-foreground">
              This page needs the link from your invitation email.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
