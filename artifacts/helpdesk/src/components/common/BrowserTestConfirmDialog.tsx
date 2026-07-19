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

interface BrowserTestConfirmDialogProps {
  open: boolean;
  assistantName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Milestone 1 / Checkpoint F1: the microphone-use disclosure and
 * confirmation step before a browser test can start. Built on the existing
 * AlertDialog primitive for its focus trap, Escape-to-close, and
 * focus-restore behavior — none of that is reimplemented here. Never
 * renders a provider id, credential, or assistant config/prompt.
 */
export function BrowserTestConfirmDialog({ open, assistantName, onCancel, onConfirm }: BrowserTestConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Test "{assistantName}" in your browser?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>This uses your browser's microphone. Your browser will ask for microphone permission.</p>
              <p>
                Once connected, audio from this browser is sent to the configured voice provider for the
                duration of the test.
              </p>
              <p>This is not a phone call — no phone number will be assigned.</p>
              <p>Ending or closing the test stops the browser voice session.</p>
              <p>
                Whether audio or a transcript is recorded depends on the voice provider's configuration for this
                account.
              </p>
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
            Start Browser Test
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
