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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  /** True only when clicking should open the confirmation dialog. */
  eligible: boolean;
  /** True while a synchronization request is in flight. */
  pending: boolean;
  /** Accessible explanation shown whenever the control is not eligible. Always present when `eligible` is false. */
  disabledReason?: string;
  onClick: () => void;
}

/**
 * AR-001V: the header control that offers to send the saved configuration to
 * the voice provider. Mirrors PublishButton/BrowserTestButton's accessibility
 * pattern — `aria-disabled` plus a guarded no-op rather than a native
 * `disabled` attribute, so keyboard and screen-reader users can always
 * discover why it is unavailable.
 *
 * The annotation matters for the build boundary: `forwardRef(...)` is a call
 * expression at module top level, which a bundler must otherwise assume has
 * side effects and keep even when nothing references the result.
 */
export const SyncAssistantButton = /*#__PURE__*/ forwardRef<HTMLButtonElement, SyncButtonProps>(
  function SyncAssistantButton({ eligible, pending, disabledReason, onClick }, ref) {
    const descriptionId = useId();

    if (!eligible || pending) {
      const reason = pending
        ? "Sending this configuration to the voice provider."
        : (disabledReason ?? "There is nothing to send to the voice provider right now.");
      const guardedNoop = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        e.preventDefault();
      };
      return (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              ref={ref}
              type="button"
              aria-disabled="true"
              aria-describedby={descriptionId}
              onClick={guardedNoop}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") guardedNoop(e);
              }}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-11 cursor-not-allowed gap-1.5 opacity-50 md:min-h-8",
              )}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Publish update
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-52 text-xs">
            {reason}
          </TooltipContent>
          <span id={descriptionId} className="sr-only">
            Publish update — {reason}
          </span>
        </Tooltip>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11 gap-1.5 md:min-h-8")}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Publish update
      </button>
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
 * AR-001V: the explicit confirmation boundary required before any provider
 * update can occur. Nothing in the builder reaches the provider without a
 * deliberate second action here. Never renders a provider id, credential,
 * digest, or assistant config/prompt content.
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
