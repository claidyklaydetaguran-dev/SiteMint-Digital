import { Loader2 } from "lucide-react";
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

interface PublishConfirmDialogProps {
  open: boolean;
  assistantName: string;
  statusLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Milestone 1 / Checkpoint E3C: the single confirmation step before the
 * POST .../publish request fires. Built on the existing AlertDialog
 * primitive for its focus trap, Escape-to-close, and focus-restore
 * behavior. Never renders a provider ID, catalog value, API key, model ID,
 * voice ID, or prompt — only the assistant's name and current status.
 */
export function PublishConfirmDialog({
  open,
  assistantName,
  statusLabel,
  pending,
  onCancel,
  onConfirm,
}: PublishConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Publish "{assistantName}"?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>Current status: {statusLabel}</p>
              <p>
                This will create a provider-side voice assistant using the currently saved
                configuration. It will not assign a phone number or place a call.
              </p>
              <p>
                Test calling remains unavailable until Checkpoint F. Do not submit again if
                publishing cannot be confirmed.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (pending) return;
              onConfirm();
            }}
            disabled={pending}
            className="gap-1.5"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Publish Assistant
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
