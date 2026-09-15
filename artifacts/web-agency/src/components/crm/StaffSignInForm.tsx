/**
 * The staff credential form, shared by the sign-in page and the session-ended
 * dialog so both collect the same things in the same order and call the same
 * endpoints (`lib/staffSignIn.ts`).
 *
 * Stages, decided by the server rather than guessed:
 *   "setup"  — no staff accounts exist yet (sign-in page only);
 *   "signin" — email and password;
 *   "mfa"    — the password was accepted and a second factor is required.
 */

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFirstOwner, submitStaffMfaCode, submitStaffPassword, type SignedInStaff,
} from "@/lib/staffSignIn";

export type SignInStage = "loading" | "setup" | "signin" | "mfa";

export interface StaffSignIn {
  stage: SignInStage;
  setStage: (stage: SignInStage) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  adminPassword: string;
  setAdminPassword: (value: string) => void;
  error: string;
  busy: boolean;
  submit: (event?: FormEvent) => Promise<void>;
}

export function useStaffSignIn(options: {
  initialStage: SignInStage;
  onSignedIn: (staff: SignedInStaff | null) => void;
}): StaffSignIn {
  const [stage, setStage] = useState<SignInStage>(options.initialStage);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The latest callback, without re-creating `submit` on every render.
  const onSignedIn = useRef(options.onSignedIn);
  onSignedIn.current = options.onSignedIn;
  const inFlight = useRef(false);

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setBusy(true);
    try {
      if (stage === "setup") {
        const created = await createFirstOwner({ adminPassword, email, displayName, password });
        if (!created.ok) { setError(created.message); return; }
        // Created, but not signed in — sign in with the credentials just set.
        setStage("signin");
        setAdminPassword("");
        setDisplayName("");
        return;
      }

      if (stage === "mfa") {
        const verified = await submitStaffMfaCode(code);
        if (verified.kind === "error") { setError(verified.message); return; }
        setCode("");
        if (verified.kind === "signed-in") onSignedIn.current(verified.staff);
        return;
      }

      const result = await submitStaffPassword(email, password);
      if (result.kind === "error") { setError(result.message); return; }
      if (result.kind === "mfa-required") {
        setStage("mfa");
        setPassword("");
        return;
      }
      onSignedIn.current(result.staff);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    stage, setStage, email, setEmail, password, setPassword, code, setCode,
    displayName, setDisplayName, adminPassword, setAdminPassword, error, busy, submit,
  };
}

/**
 * The fields for the current stage and the error line. The caller renders the
 * `<form>` and its submit button, because the sign-in page and the dialog label
 * and size them differently.
 */
export function StaffSignInFields({
  form,
  idPrefix,
  firstFieldRef,
  autoFocus = false,
}: {
  form: StaffSignIn;
  /** Keeps label/field ids unique when two forms could exist in one document. */
  idPrefix: string;
  /** The email field, for a caller that moves focus itself (the dialog). */
  firstFieldRef?: RefObject<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  const codeRef = useRef<HTMLInputElement>(null);
  const previousStage = useRef(form.stage);

  // Reaching the code step moves focus to the code field, so a keyboard or
  // screen-reader user is not left on a field that has just disappeared.
  useEffect(() => {
    if (previousStage.current !== form.stage && form.stage === "mfa") codeRef.current?.focus();
    previousStage.current = form.stage;
  }, [form.stage]);

  const id = (name: string) => `${idPrefix}-${name}`;
  const errorId = id("error");
  const described = form.error ? errorId : undefined;
  const invalid = form.error ? true : undefined;

  return (
    <>
      {form.stage === "setup" && (
        <>
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            This creates the owner account for SiteMint. It works once, and
            needs the server's <code className="font-mono">ADMIN_PASSWORD</code>.
            Everyone else is invited from Settings afterwards.
          </p>
          <div>
            <Label htmlFor={id("admin-password")} className="mb-1.5 block text-sm font-semibold">
              Server admin password
            </Label>
            <Input
              id={id("admin-password")} type="password" value={form.adminPassword} autoComplete="off"
              onChange={(e) => form.setAdminPassword(e.target.value)} className="h-11"
              aria-invalid={invalid} aria-describedby={described}
            />
          </div>
          <div>
            <Label htmlFor={id("display-name")} className="mb-1.5 block text-sm font-semibold">Your name</Label>
            <Input
              id={id("display-name")} value={form.displayName}
              onChange={(e) => form.setDisplayName(e.target.value)}
              placeholder="e.g. Shasta Green" className="h-11"
              aria-invalid={invalid} aria-describedby={described}
            />
          </div>
        </>
      )}

      {form.stage !== "mfa" && (
        <>
          <div>
            <Label htmlFor={id("email")} className="mb-1.5 block text-sm font-semibold">Email</Label>
            <Input
              id={id("email")} ref={firstFieldRef} type="email" value={form.email}
              onChange={(e) => form.setEmail(e.target.value)}
              placeholder="you@sitemintdigital.com" className="h-11"
              autoComplete="username" autoFocus={autoFocus && form.stage === "signin"}
              aria-invalid={invalid} aria-describedby={described}
            />
          </div>
          <div>
            <Label htmlFor={id("password")} className="mb-1.5 block text-sm font-semibold">
              {form.stage === "setup" ? "Choose a password" : "Password"}
            </Label>
            <Input
              id={id("password")} type="password" value={form.password}
              onChange={(e) => form.setPassword(e.target.value)}
              placeholder={form.stage === "setup" ? "At least 12 characters" : "Your password"}
              className="h-11"
              autoComplete={form.stage === "setup" ? "new-password" : "current-password"}
              aria-invalid={invalid} aria-describedby={described}
            />
          </div>
        </>
      )}

      {form.stage === "mfa" && (
        <div>
          <Label htmlFor={id("code")} className="mb-1.5 block text-sm font-semibold">6-digit code</Label>
          <Input
            id={id("code")} ref={codeRef} value={form.code}
            onChange={(e) => form.setCode(e.target.value)}
            placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
            className="h-12 text-center font-mono text-lg tracking-[0.4em]"
            aria-invalid={invalid} aria-describedby={described ? `${id("code-help")} ${described}` : id("code-help")}
          />
          <p id={id("code-help")} className="mt-2 text-xs text-muted-foreground">
            Lost your phone? Enter one of your recovery codes instead.
          </p>
        </div>
      )}

      {form.error && (
        <p id={errorId} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {form.error}
        </p>
      )}
    </>
  );
}
