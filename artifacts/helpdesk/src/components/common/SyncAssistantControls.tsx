import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface SyncButtonProps {
  /** True only when clicking should open the confirmation dialog. */
  eligible: boolean;
  /** True while a synchronization request is in flight. */
  pending: boolean;
  /** Why the update is unavailable. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * The control that sends the saved configuration to the voice provider.
 *
 * Mirrors PublishButton and BrowserTestButton: `aria-disabled` plus a guarded
 * no-op rather than a native `disabled` attribute, so keyboard and
 * screen-reader users can always discover why it is unavailable — and the
 * reason is rendered as visible text rather than only in a tooltip.
 *
 * The `/*#__PURE__*\/` annotation matters for the build boundary:
 * `forwardRef(...)` is a call expression at module top level, which a bundler
 * must otherwise assume has side effects and keep even when nothing
 * references the result.
 */
export const SyncAssistantButton = /*#__PURE__*/ forwardRef<HTMLButtonElement, SyncButtonProps>(
  function SyncAssistantButton({ eligible, pending, disabledReason, onClick }, ref) {
    const descriptionId = useId();

    if (!eligible || pending) {
      const reason = pending
        ? "Applying your receptionist settings to the phone system."
        : (disabledReason ?? "Your receptionist settings are already up to date.");
      const guardedNoop = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        e.preventDefault();
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sd-space-2, .5rem)", minWidth: 0 }}>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            size="sm"
            aria-disabled="true"
            aria-describedby={descriptionId}
            onClick={guardedNoop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") guardedNoop(e);
            }}
            style={{ cursor: "not-allowed", opacity: 0.65, alignSelf: "flex-start" }}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Publish update
          </Button>
          <p
            id={descriptionId}
            style={{
              margin: 0,
              maxWidth: "34rem",
              fontSize: "var(--sd-text-small, .8125rem)",
              lineHeight: 1.5,
              color: "var(--sd-text-muted, #3b5265)",
            }}
          >
            {reason}
          </p>
        </div>
      );
    }

    return (
      <Button ref={ref} type="button" variant="outline" size="sm" onClick={onClick}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Publish update
      </Button>
    );
  },
);

interface SyncConfirmDialogProps {
  open: boolean;
  assistantName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The explicit confirmation boundary required before any provider update can
 * occur. Nothing in the builder reaches the provider without a deliberate
 * second action here. Never renders a provider id, credential, digest, or
 * assistant config/prompt content.
 */
export function SyncConfirmDialog({ open, assistantName, onCancel, onConfirm }: SyncConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Send "{assistantName}" to the voice provider?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>This replaces the configuration the voice provider is currently running with the one saved here.</p>
              <p>It updates the existing assistant. No new assistant is created and no phone number is assigned.</p>
              <p>Anyone already speaking to this assistant may hear the new behavior once the update completes.</p>
              <p>If it fails, the provider keeps running the configuration it has now.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Publish update
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
