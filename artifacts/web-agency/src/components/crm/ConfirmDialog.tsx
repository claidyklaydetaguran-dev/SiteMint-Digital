/**
 * The CRM's confirmation dialog: one accessible dialog in place of
 * `window.confirm` / `window.prompt`.
 *
 * Why a hook that hands back an element rather than a provider: every CRM page
 * renders `<CrmLayout>` itself, from inside the page component. A provider
 * mounted in the layout would therefore sit *below* the code that needs to call
 * it, so the page could never reach it. Instead a page calls
 * `useConfirmDialog()`, renders `confirmation.element` once, and awaits
 * `confirmation.ask({...})` wherever a decision is needed.
 *
 *   const confirmation = useConfirmDialog();
 *   ...
 *   void confirmation.ask({
 *     title: 'Delete "Acme site"?',
 *     description: "This cannot be undone.",
 *     tone: "destructive",
 *     confirmLabel: "Delete project",
 *     action: async () => { ... throw on failure ... },
 *   });
 *   ...
 *   {confirmation.element}
 *
 * What it is built on, and why: the Radix **alert-dialog** primitive rather
 * than the plain dialog. A confirmation must not be dismissable by a stray
 * click on the backdrop, and it should announce itself as `alertdialog`;
 * alert-dialog gives both, and refuses outside-pointer dismissal by design.
 *
 * Three decisions worth keeping:
 *
 *  1. **The action runs inside the dialog.** A failure keeps the dialog open,
 *     shows the server's own sentence, and holds whatever was typed, so the
 *     person can fix the cause and press the button again. `window.confirm`
 *     could not do this: it closed, and the error landed somewhere else.
 *  2. **Busy buttons use `aria-disabled`, not `disabled`.** Disabling the
 *     button that currently has focus makes the browser move focus to `<body>`
 *     (the HTML focus fixup rule), which drops the person outside the focus
 *     trap mid-action — from there Tab walks the page behind the dialog. The
 *     buttons therefore stay focusable and refuse the press instead.
 *  3. **Focus return is ours, not Radix's.** See `@/lib/dialogFocus`.
 */

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  captureFocusOrigin,
  dialogContainer,
  restoreFocus,
  watchPointerOrigins,
  type FocusOrigin,
} from "@/lib/dialogFocus";
import {
  INITIAL_CONFIRM_PHASE,
  canDismiss,
  confirmReducer,
  evaluateConfirmInputs,
  initialFocusTarget,
  runConfirmAction,
  type ConfirmActionInput,
  type ConfirmInputSpec,
  type ConfirmTone,
} from "./confirmDialogModel";

export type { ConfirmActionInput, ConfirmTone };

export interface ConfirmRequest extends ConfirmInputSpec {
  title: string;
  /** What is about to happen, in plain words. */
  description: ReactNode;
  /** Specific consequences, one per bullet. */
  consequences?: ReactNode[];
  confirmLabel: string;
  cancelLabel?: string;
  /** Shown on the button while the action runs, e.g. "Deleting…". */
  busyLabel?: string;
  tone?: ConfirmTone;
  /**
   * The work to do. Throw to keep the dialog open with a message: a plain
   * `Error`'s text is shown as written, so pass the server's own sentence.
   * Omit it for a decision that only changes what is on screen.
   */
  action?: (input: ConfirmActionInput) => unknown;
  /**
   * Where focus belongs after a successful action, when the control that opened
   * the dialog is gone and there is a better answer than the generic fallback —
   * a link to the thing that was just created, say.
   */
  focusAfterSuccess?: () => HTMLElement | null;
}

export interface Confirmation {
  /** Render once per page, outside any element with its own click handling. */
  element: ReactNode;
  /** Resolves true only when it was confirmed AND the action succeeded. */
  ask: (request: ConfirmRequest) => Promise<boolean>;
}

interface ActiveRequest {
  id: number;
  request: ConfirmRequest;
  origin: FocusOrigin<HTMLElement> | null;
  container: HTMLElement | null;
}

export function useConfirmDialog(): Confirmation {
  const [active, setActive] = useState<ActiveRequest | null>(null);
  const [open, setOpen] = useState(false);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    watchPointerOrigins();
    // A page that unmounts with a question on screen answers it "no" rather
    // than leaving the caller's promise pending for ever.
    return () => {
      settle.current?.(false);
      settle.current = null;
    };
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    setOpen(false);
    const resolve = settle.current;
    settle.current = null;
    resolve?.(confirmed);
  }, []);

  const ask = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // A second question supersedes an unanswered one.
        settle.current?.(false);
        settle.current = resolve;
        const origin = captureFocusOrigin();
        nextId.current += 1;
        setActive({ id: nextId.current, request, origin, container: dialogContainer(origin) });
        setOpen(true);
      }),
    [],
  );

  const element = active ? (
    <ConfirmDialog
      key={active.id}
      open={open}
      request={active.request}
      origin={active.origin}
      container={active.container}
      onFinish={finish}
    />
  ) : null;

  return { element, ask };
}

// ── Presentation ─────────────────────────────────────────────────────────────

const BUTTON =
  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 "
  + "text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 "
  + "focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card "
  + "aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:w-auto";

const CONFIRM_TONE: Record<ConfirmTone, string> = {
  destructive: "bg-red-700 text-white hover:bg-red-800 aria-disabled:hover:bg-red-700",
  default: "bg-teal-700 text-white hover:bg-teal-800 aria-disabled:hover:bg-teal-700",
};

const CANCEL_BUTTON =
  "border border-border bg-card text-foreground hover:bg-accent aria-disabled:hover:bg-card";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground "
  + "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";

function ConfirmDialog({
  open,
  request,
  origin,
  container,
  onFinish,
}: {
  open: boolean;
  request: ConfirmRequest;
  origin: FocusOrigin<HTMLElement> | null;
  container: HTMLElement | null;
  onFinish: (confirmed: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [value, setValue] = useState(request.field?.defaultValue ?? "");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [valueTouched, setValueTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [phase, dispatch] = useReducer(confirmReducer, INITIAL_CONFIRM_PHASE);
  const succeeded = useRef(false);

  const fieldRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const acknowledgeRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ids = useId();
  const fieldId = `${ids}-field`;
  const fieldHelpId = `${ids}-field-help`;
  const fieldProblemId = `${ids}-field-problem`;
  const reasonId = `${ids}-reason`;
  const reasonHelpId = `${ids}-reason-help`;
  const reasonProblemId = `${ids}-reason-problem`;
  const acknowledgeProblemId = `${ids}-acknowledge-problem`;
  const blockedId = `${ids}-blocked`;

  const tone = request.tone ?? "default";
  const working = phase.kind === "working";
  const busyLabel = request.busyLabel ?? "Working…";
  const verdict = evaluateConfirmInputs(request, { reason, acknowledged, value });

  const showFieldProblem = verdict.fieldProblem !== null && (attempted || valueTouched);
  const showReasonProblem = verdict.reasonProblem !== null && (attempted || reasonTouched);
  const showAcknowledgeProblem = verdict.acknowledgementMissing && attempted;

  const blockedHint = verdict.ok
    ? null
    : verdict.fieldProblem
      ?? verdict.reasonProblem
      ?? (verdict.acknowledgementMissing ? "Tick the box above to continue." : null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind !== "ready") return;
    setAttempted(true);
    if (!verdict.ok) {
      // Take the person to the thing that is stopping them, so a screen reader
      // reads the problem rather than leaving them on a button that "does
      // nothing".
      if (verdict.fieldProblem) fieldRef.current?.focus();
      else if (verdict.reasonProblem) reasonRef.current?.focus();
      else if (verdict.acknowledgementMissing) acknowledgeRef.current?.focus();
      return;
    }
    dispatch({ type: "submit" });
    if (!request.action) {
      succeeded.current = true;
      dispatch({ type: "succeeded" });
      onFinish(true);
      return;
    }
    const outcome = await runConfirmAction(request.action, { reason: reason.trim(), value: value.trim() });
    if (outcome.ok) {
      succeeded.current = true;
      dispatch({ type: "succeeded" });
      onFinish(true);
      return;
    }
    dispatch({ type: "failed", message: outcome.message });
  };

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next || !canDismiss(phase)) return;
        dispatch({ type: "dismiss" });
        onFinish(false);
      }}
    >
      <AlertDialogPrimitive.Portal container={container}>
        <AlertDialogPrimitive.Overlay
          className="fixed inset-0 z-[300] bg-foreground/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none"
        />
        <AlertDialogPrimitive.Content
          data-testid="crm-confirm-dialog"
          data-tone={tone}
          // Stated rather than assumed: measured in a browser on 2026-09-16,
          // the rendered dialog carried no `aria-modal`, so a screen reader's
          // virtual cursor could still wander into the page behind it even
          // though Tab could not. Focus trapping is not the same guarantee.
          aria-modal="true"
          aria-busy={working || undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const target = initialFocusTarget(request);
            const element =
              target === "field" ? fieldRef.current : target === "reason" ? reasonRef.current : cancelRef.current;
            (element ?? cancelRef.current)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const preferred = succeeded.current ? request.focusAfterSuccess?.() ?? null : null;
            if (preferred) {
              preferred.focus();
              return;
            }
            restoreFocus(origin);
          }}
          onEscapeKeyDown={(event) => {
            if (working) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[300] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none"
        >
          <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              {tone === "destructive" && (
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700"
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 space-y-2">
                <AlertDialogPrimitive.Title className="text-base font-semibold break-words text-foreground">
                  {request.title}
                </AlertDialogPrimitive.Title>
                <AlertDialogPrimitive.Description asChild>
                  <div className="space-y-2 text-sm break-words text-muted-foreground">
                    <p>{request.description}</p>
                    {request.consequences && request.consequences.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5">
                        {request.consequences.map((consequence, index) => (
                          <li key={index}>{consequence}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </AlertDialogPrimitive.Description>
              </div>
            </div>

            {request.field && (
              <div className="space-y-1.5">
                <label htmlFor={fieldId} className="block text-xs font-semibold text-foreground">
                  {request.field.label}
                </label>
                <input
                  id={fieldId}
                  ref={fieldRef}
                  value={value}
                  readOnly={working}
                  aria-required="true"
                  aria-invalid={showFieldProblem || undefined}
                  aria-describedby={
                    [request.field.helper ? fieldHelpId : null, showFieldProblem ? fieldProblemId : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(event) => {
                    setValue(event.target.value);
                    dispatch({ type: "edited" });
                  }}
                  onBlur={() => setValueTouched(true)}
                  className={`${FIELD} ${showFieldProblem ? "border-red-500" : "border-input"}`}
                  {...(request.field.kind === "date"
                    ? { type: "date", min: request.field.min, max: request.field.max }
                    : {
                        type: "text",
                        inputMode: "numeric" as const,
                        autoComplete: "off",
                        placeholder: request.field.placeholder,
                      })}
                />
                {request.field.helper && (
                  <p id={fieldHelpId} className="text-xs text-muted-foreground">
                    {request.field.helper}
                  </p>
                )}
                {showFieldProblem && (
                  <p id={fieldProblemId} className="text-xs font-medium text-red-700">
                    {verdict.fieldProblem}
                  </p>
                )}
              </div>
            )}

            {request.reason && (
              <div className="space-y-1.5">
                <label htmlFor={reasonId} className="block text-xs font-semibold text-foreground">
                  {request.reason.label}
                </label>
                <textarea
                  id={reasonId}
                  ref={reasonRef}
                  rows={3}
                  value={reason}
                  readOnly={working}
                  maxLength={request.reason.maxLength}
                  placeholder={request.reason.placeholder}
                  aria-required="true"
                  aria-invalid={showReasonProblem || undefined}
                  aria-describedby={
                    [request.reason.helper ? reasonHelpId : null, showReasonProblem ? reasonProblemId : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(event) => {
                    setReason(event.target.value);
                    dispatch({ type: "edited" });
                  }}
                  onBlur={() => setReasonTouched(true)}
                  className={`${FIELD} resize-y ${showReasonProblem ? "border-red-500" : "border-input"}`}
                />
                {request.reason.helper && (
                  <p id={reasonHelpId} className="text-xs text-muted-foreground">
                    {request.reason.helper}
                  </p>
                )}
                {showReasonProblem && (
                  <p id={reasonProblemId} className="text-xs font-medium text-red-700">
                    {verdict.reasonProblem}
                  </p>
                )}
              </div>
            )}

            {request.acknowledgement && (
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                  <input
                    ref={acknowledgeRef}
                    type="checkbox"
                    checked={acknowledged}
                    aria-invalid={showAcknowledgeProblem || undefined}
                    aria-describedby={showAcknowledgeProblem ? acknowledgeProblemId : undefined}
                    onChange={(event) => {
                      if (working) return;
                      setAcknowledged(event.target.checked);
                      dispatch({ type: "edited" });
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                  />
                  <span>{request.acknowledgement}</span>
                </label>
                {showAcknowledgeProblem && (
                  <p id={acknowledgeProblemId} className="text-xs font-medium text-red-700">
                    Tick the box to continue.
                  </p>
                )}
              </div>
            )}

            {phase.kind === "ready" && phase.error !== null && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{phase.error}</span>
              </p>
            )}

            <span role="status" className="sr-only">
              {working ? busyLabel : ""}
            </span>
            {blockedHint && (
              <span id={blockedId} className="sr-only">
                {blockedHint}
              </span>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <AlertDialogPrimitive.Cancel
                ref={cancelRef}
                type="button"
                aria-disabled={working || undefined}
                onClick={(event) => {
                  if (working) event.preventDefault();
                }}
                className={`${BUTTON} ${CANCEL_BUTTON}`}
              >
                {request.cancelLabel ?? "Cancel"}
              </AlertDialogPrimitive.Cancel>
              <button
                type="submit"
                aria-disabled={working || !verdict.ok || undefined}
                aria-describedby={blockedHint ? blockedId : undefined}
                className={`${BUTTON} ${CONFIRM_TONE[tone]}`}
              >
                {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {working ? busyLabel : request.confirmLabel}
              </button>
            </div>
          </form>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
