/**
 * "Your session has ended" — opened by `AdminRouteGuard` over the page whose
 * session ran out, instead of navigating away from it.
 *
 * The page underneath stays mounted, so a half-written note, an edited field or
 * an unsent reply is still there after the person signs in again. That is the
 * whole reason this is a dialog and not a redirect.
 *
 * Deliberately not dismissible: Escape and a click outside do nothing, and there
 * is no close button. Closing it without signing in would leave a page that can
 * neither read nor write, which is the broken state this replaces. The only
 * ways out are signing in, or the explicit link to the sign-in page (which says
 * that leaving discards unsaved work).
 *
 * Radix supplies role="dialog", the labelled title and description, the focus
 * trap, inert siblings and scroll locking; `aria-modal` is added here. The
 * overlay is the scroll container, so at 375px a tall form (the code step, an
 * error line) scrolls rather than being clipped.
 */

import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "wouter";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle,
} from "@/components/ui/dialog";
import { adminLoginPath } from "@/lib/adminFetch";
import type { SignedInStaff } from "@/lib/staffSignIn";
import { StaffSignInFields, useStaffSignIn } from "./StaffSignInForm";

export function SessionEndedDialog({
  onSignedIn,
  onLeave,
}: {
  onSignedIn: (staff: SignedInStaff | null) => void;
  /** Called as the person follows the link to the full sign-in page. */
  onLeave: () => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const form = useStaffSignIn({ initialStage: "signin", onSignedIn });

  return (
    <Dialog open onOpenChange={() => { /* stays open until the person signs in or leaves */ }}>
      <DialogPortal>
        <DialogOverlay className="overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPrimitive.Content
              aria-modal="true"
              onEscapeKeyDown={(event) => event.preventDefault()}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                firstFieldRef.current?.focus();
              }}
              className="relative w-full max-w-sm rounded-xl border border-border bg-background p-5 text-foreground shadow-2xl focus:outline-none sm:p-6"
            >
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                  <LogIn className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold leading-snug">Your session has ended</DialogTitle>
                  <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {form.stage === "mfa"
                      ? "Enter the code from your authenticator app to finish signing in."
                      : "Sign in again to carry on. This page stays open, so anything you haven't saved is still here."}
                  </DialogDescription>
                </div>
              </div>

              <form onSubmit={(event) => { void form.submit(event); }} className="space-y-4">
                <StaffSignInFields form={form} idPrefix="session-ended" firstFieldRef={firstFieldRef} />
                <Button type="submit" className="h-11 w-full text-base" disabled={form.busy}>
                  {form.busy ? "Signing in…" : form.stage === "mfa" ? "Verify" : "Sign in"}
                </Button>
              </form>

              <div className="mt-5 border-t border-border pt-4 text-center">
                <Link
                  href={adminLoginPath()}
                  onClick={onLeave}
                  className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Go to the sign-in page
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  Leaving this page discards anything you haven't saved.
                </p>
              </div>
            </DialogPrimitive.Content>
          </div>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

export default SessionEndedDialog;
