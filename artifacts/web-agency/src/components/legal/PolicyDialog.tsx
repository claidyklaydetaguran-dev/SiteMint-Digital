/**
 * Terms or Privacy Policy in an in-page dialog, so reading them never
 * navigates away from a half-filled form. Radix keeps focus inside while
 * open, closes on Escape, and returns focus to the button that opened it.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { PolicyUpdated, PrivacyBody, TermsBody } from "./PolicyBodies";

const TITLES = { terms: "Terms of Service", privacy: "Privacy Policy" } as const;

export function PolicyDialog({ policy, label }: { policy: "terms" | "privacy"; label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="sg-alt__link sg-policy-link">
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITLES[policy]}</DialogTitle>
          <DialogDescription>
            <PolicyUpdated policy={policy} />
          </DialogDescription>
        </DialogHeader>
        <div className="v3m-prose sg-policy-prose">{policy === "terms" ? <TermsBody /> : <PrivacyBody />}</div>
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className="sg-submit sg-policy-close">
              Back to sign-up
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
