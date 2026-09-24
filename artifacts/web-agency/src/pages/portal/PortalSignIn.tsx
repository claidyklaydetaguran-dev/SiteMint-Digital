// ── M4: the customer portal sign-in ─────────────────────────────────────────
//
// The public site's front door for clients. It does not mention the CRM, does
// not offer self-registration (access is granted by invitation, per contact),
// and says the same thing for a wrong password as for an address it has never
// seen — matching the server, which answers both identically on purpose.

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { AlertTriangle } from "lucide-react";
import { portalFetch, setPortalCsrf, PortalError } from "./portalApi";
import "@/components/mint/mint-auth.css";

export default function PortalSignIn() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await portalFetch<{ csrfToken: string }>(
        "/api/portal/login",
        {
          method: "POST",
          body: { email, password },
        },
      );
      setPortalCsrf(data.csrfToken);
      navigate("/portal");
    } catch (err) {
      setError(
        err instanceof PortalError
          ? err.message
          : "Something went wrong at our end.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mint-portal-auth flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <SiteMintLogo className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight">
          Your project, in one place
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sign in to see your projects, documents, payments and support
          requests.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="portal-email">Email address</Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              className="min-h-11"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-password">Password</Label>
            <Input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              className="min-h-11"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
              role="alert"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden
              />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}

          <Button type="submit" className="min-h-11 w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Access is set up by your SiteMint contact. If you have not had an
          invitation yet,{" "}
          <a
            className="underline underline-offset-4"
            href="mailto:info.sitemint@gmail.com?subject=Client%20portal%20access"
          >
            contact SiteMint about access
          </a>
          .
        </p>
        <a
          href="/"
          className="mt-4 min-h-11 flex items-center justify-center text-sm underline underline-offset-4"
        >
          Back to SiteMint Digital
        </a>
      </div>
    </div>
  );
}
