/**
 * Saying "this did not load" instead of showing a zero.
 *
 * The CRM's standing rule is that a failed request must never be displayed as
 * "no data" or as a zero. A page whose contacts request was refused used to
 * render "All People — 0 people" over an empty table while the database held
 * fifteen contacts; the operator reading it was told something false about
 * their own business.
 *
 * These are the shared pieces that make the honest version cheap to write:
 *
 *   - `LoadFailure`      a stated failure with a Try again control.
 *   - `PageLoadFailures` the top-of-page banner naming which parts failed when
 *                        a page loads several things and only some succeeded.
 *   - `Figure`           a number, or an em dash — never a zero standing in
 *                        for "unknown".
 *   - `dataOf` / `countOf` / `failedParts` the derivations that keep a count
 *                        null when the list behind it never arrived.
 *
 * The words themselves come from `failureReason` / `responseFailureReason` in
 * `@/lib/adminLoad`, so a 401, a 403, a 404, a 500 and an unreachable server
 * each read differently. Pass that string in as `reason`; do not invent one.
 *
 * Everything here uses semantic token classes only (the ops contract bans raw
 * neutral utilities under `components/crm/**`), and stays reachable at 375px.
 */

import { AlertTriangle, Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Load } from "@/lib/adminLoad";

/** One part of a page that could not be loaded. */
export interface FailedPart {
  /** What is missing, as a noun phrase: "Contacts", "Today's tasks". */
  what: string;
  /** The written reason, from `failureReason` / `responseFailureReason`. */
  reason: string;
}

/** The data when it loaded, or null. Never a fabricated empty. */
export function dataOf<T>(load: Load<T>): T | null {
  return load.status === "ready" ? load.data : null;
}

/**
 * How many there are, or null when the list never arrived.
 *
 * `null` is the whole point: `list.length` on a failed load is 0, and 0 is a
 * claim about the business that nobody checked.
 */
export function countOf<T>(load: Load<readonly T[]>): number | null {
  return load.status === "ready" ? load.data.length : null;
}

/** The stated reason a load failed, or null when it did not fail. */
export function reasonOf(load: Load<unknown>): string | null {
  return load.status === "error" ? load.reason : null;
}

/**
 * The parts of a page that failed, ready for `PageLoadFailures`.
 *
 * Pass the page's loads with the name to show for each; the ones that are
 * loading or ready drop out.
 */
export function failedParts(
  parts: ReadonlyArray<readonly [what: string, load: Load<unknown>]>,
): FailedPart[] {
  const out: FailedPart[] = [];
  for (const [what, load] of parts) {
    if (load.status === "error") out.push({ what, reason: load.reason });
  }
  return out;
}

/**
 * A figure, or a dash that admits there is no figure.
 *
 * `value` is null/undefined when the data behind it failed or has not arrived.
 * Screen readers get "Loading" or "Not available" rather than a bare dash.
 */
export function Figure({
  value,
  loading = false,
  className,
}: {
  value: number | string | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (value !== null && value !== undefined && value !== "") {
    return <span className={className}>{value}</span>;
  }
  return (
    <span className={className}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{loading ? "Loading" : "Not available"}</span>
    </span>
  );
}

export interface LoadFailureProps {
  /** What could not be loaded, as a noun phrase: "Contacts", "This deal". */
  what: string;
  /** The written reason, from `failureReason` / `responseFailureReason`. */
  reason: string;
  /** Re-runs the load. Omit only when the surface genuinely cannot retry. */
  onRetry?: () => void;
  /** True while the retry is in flight. */
  retrying?: boolean;
  /**
   * `block` (default) fills an empty panel or table body.
   * `inline` is one compact line for a stat tile or a narrow card.
   */
  variant?: "block" | "inline";
  className?: string;
  /** Extra sentence for this surface, e.g. what the operator can do instead. */
  children?: React.ReactNode;
}

/**
 * A failed load, stated, with a way to try it again.
 *
 * Deliberately NOT the same shape as an empty state: an empty state is a fact
 * about the business ("no contacts yet"), this is a fact about the request. If
 * they looked alike the person could not tell "you have none" from "we don't
 * know".
 */
export function LoadFailure({
  what,
  reason,
  onRetry,
  retrying = false,
  variant = "block",
  className,
  children,
}: LoadFailureProps) {
  const retry = onRetry ? (
    <Button
      variant="outline"
      size="sm"
      className={variant === "inline" ? "mt-2 h-7 gap-1.5 text-xs" : "mt-3 gap-1.5"}
      onClick={onRetry}
      disabled={retrying}
    >
      {retrying
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
      {retrying ? "Trying again…" : "Try again"}
    </Button>
  ) : null;

  if (variant === "inline") {
    return (
      <div
        role="alert"
        data-testid="load-failure"
        className={`min-w-0 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <span className="font-medium text-foreground">{what} unavailable.</span> {reason}
          </span>
        </p>
        {children}
        {retry}
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="load-failure"
      className={`rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{what} could not be loaded.</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{reason}</p>
          {children}
          {retry}
        </div>
      </div>
    </div>
  );
}

/**
 * The banner for a page that loaded some parts and not others.
 *
 * Names the parts that failed, so the rest of the page can be read for what it
 * is instead of the whole screen being condemned or — worse — the missing
 * parts quietly reading as zero.
 */
export function PageLoadFailures({
  failures,
  onRetry,
  retrying = false,
  className,
}: {
  failures: readonly FailedPart[];
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  if (failures.length === 0) return null;
  if (failures.length === 1) {
    return (
      <LoadFailure
        what={failures[0].what}
        reason={failures[0].reason}
        onRetry={onRetry}
        retrying={retrying}
        className={className}
      />
    );
  }
  return (
    <div
      role="alert"
      data-testid="load-failure"
      className={`rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Parts of this page could not be loaded.</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {failures.map(f => (
              <li key={f.what} className="break-words">
                <span className="font-medium text-foreground">{f.what}:</span> {f.reason}
              </li>
            ))}
          </ul>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onRetry} disabled={retrying}>
              {retrying
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
