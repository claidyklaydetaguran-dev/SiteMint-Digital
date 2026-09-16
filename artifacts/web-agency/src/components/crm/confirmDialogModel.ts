/**
 * What a confirmation dialog decides, kept apart from how it looks.
 *
 * Everything here is a pure function or a reducer, in the same spirit as
 * `campaign/campaignListState.ts`: the rules that matter — when Confirm is
 * allowed, what a bad date says, whether a failure keeps the dialog open — are
 * testable without a DOM, which this package deliberately does not have.
 */

export type ConfirmTone = "destructive" | "default";

// ── What a request may ask the person for ────────────────────────────────────

export interface ReasonRequirement {
  label: string;
  /** Characters after trimming. Defaults to 1 — that is, "not blank". */
  minLength?: number;
  maxLength?: number;
  helper?: string;
  placeholder?: string;
}

export interface DateFieldSpec {
  kind: "date";
  label: string;
  /** Inclusive bounds as YYYY-MM-DD. */
  min?: string;
  max?: string;
  defaultValue?: string;
  helper?: string;
}

export interface IntegerFieldSpec {
  kind: "integer";
  label: string;
  max?: number;
  defaultValue?: string;
  helper?: string;
  placeholder?: string;
}

export type ValueFieldSpec = DateFieldSpec | IntegerFieldSpec;

export interface ConfirmInputSpec {
  reason?: ReasonRequirement;
  /** Checkbox label. Present means it must be ticked. */
  acknowledgement?: string;
  field?: ValueFieldSpec;
}

export interface ConfirmInputState {
  reason: string;
  acknowledged: boolean;
  value: string;
}

export interface ConfirmInputVerdict {
  ok: boolean;
  reasonProblem: string | null;
  fieldProblem: string | null;
  acknowledgementMissing: boolean;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, "0");

export function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = CALENDAR_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-tripping through UTC rejects the dates that look well-formed but do
  // not exist — 2026-02-30 is what a native date input hands over on a browser
  // that falls back to a text box.
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export const isCalendarDate = (value: string): boolean => parseCalendarDate(value) !== null;

/** Today where the person is, not where the server is. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysToDateKey(key: string, days: number): string {
  const parts = parseCalendarDate(key);
  if (!parts) return key;
  const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

export function formatDateKey(key: string, locale?: string): string {
  const parts = parseCalendarDate(key);
  if (!parts) return key;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(Date.UTC(parts.year, parts.month - 1, parts.day));
  } catch {
    return key;
  }
}

/**
 * A due date as the instant the rest of the CRM means by it: 5pm local, the
 * same convention `createInvoice` and document requests already use.
 *
 * Returns null instead of throwing. The `window.prompt` this replaces fed
 * whatever was typed straight into `new Date(...).toISOString()`, so "not a
 * date" was an uncaught RangeError rather than a message.
 */
export function dueDateIso(key: string, hour = 17): string | null {
  const text = key.trim();
  if (!isCalendarDate(text)) return null;
  const at = new Date(`${text}T${pad(hour)}:00:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Postgres `serial` tops out here; a larger id would only make the server 500. */
export const MAX_RECORD_ID = 2_147_483_647;

export function reasonProblem(value: string, spec: ReasonRequirement): string | null {
  const length = value.trim().length;
  const min = Math.max(spec.minLength ?? 1, 1);
  if (length === 0) return "This is required.";
  if (length < min) return `Write at least ${min} characters.`;
  if (spec.maxLength !== undefined && length > spec.maxLength) {
    return `Keep this to ${spec.maxLength} characters or fewer.`;
  }
  return null;
}

export function dateProblem(value: string, spec: DateFieldSpec): string | null {
  const text = value.trim();
  if (!text) return `Pick a ${spec.label.toLowerCase()}.`;
  if (!isCalendarDate(text)) return "Enter a real date, like 2026-09-30.";
  if (spec.min && text < spec.min) return `Pick a date on or after ${formatDateKey(spec.min)}.`;
  if (spec.max && text > spec.max) return `Pick a date on or before ${formatDateKey(spec.max)}.`;
  return null;
}

export function integerProblem(value: string, spec: IntegerFieldSpec): string | null {
  const text = value.trim();
  if (!text) return `Enter the ${spec.label.toLowerCase()}.`;
  if (!/^\d+$/.test(text)) return "Use digits only — a whole number, like 42.";
  const parsed = Number(text);
  if (parsed < 1) return "Ids start at 1.";
  if (!Number.isSafeInteger(parsed) || parsed > (spec.max ?? MAX_RECORD_ID)) {
    return "That number is too large to be a record id.";
  }
  return null;
}

export function parsePositiveInteger(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export function fieldProblem(value: string, spec: ValueFieldSpec): string | null {
  return spec.kind === "date" ? dateProblem(value, spec) : integerProblem(value, spec);
}

export function evaluateConfirmInputs(
  spec: ConfirmInputSpec,
  state: ConfirmInputState,
): ConfirmInputVerdict {
  const reason = spec.reason ? reasonProblem(state.reason, spec.reason) : null;
  const field = spec.field ? fieldProblem(state.value, spec.field) : null;
  const acknowledgementMissing = spec.acknowledgement !== undefined && !state.acknowledged;
  return {
    ok: reason === null && field === null && !acknowledgementMissing,
    reasonProblem: reason,
    fieldProblem: field,
    acknowledgementMissing,
  };
}

/**
 * Where focus starts.
 *
 * A dialog that asks for something focuses the thing it asks for. Everything
 * else focuses Cancel — the least destructive control, and the one that cannot
 * be triggered twice by a held-down Enter key that opened the dialog.
 */
export type ConfirmFocusTarget = "field" | "reason" | "cancel";

export function initialFocusTarget(spec: ConfirmInputSpec): ConfirmFocusTarget {
  if (spec.field) return "field";
  if (spec.reason) return "reason";
  return "cancel";
}

// ── The dialog's own state ───────────────────────────────────────────────────

export type ConfirmPhase =
  | { kind: "ready"; error: string | null }
  | { kind: "working" }
  | { kind: "finished"; confirmed: boolean };

export type ConfirmEvent =
  | { type: "submit" }
  | { type: "failed"; message: string }
  | { type: "succeeded" }
  | { type: "dismiss" }
  | { type: "edited" };

export const INITIAL_CONFIRM_PHASE: ConfirmPhase = { kind: "ready", error: null };

export function confirmReducer(phase: ConfirmPhase, event: ConfirmEvent): ConfirmPhase {
  switch (event.type) {
    case "submit":
      // Ignored while working: a second Enter must not run the action twice.
      return phase.kind === "ready" ? { kind: "working" } : phase;
    case "failed":
      // The dialog stays open and holds what was typed, so the person can fix
      // the cause and try again without re-entering anything.
      return phase.kind === "working" ? { kind: "ready", error: event.message } : phase;
    case "succeeded":
      return phase.kind === "working" ? { kind: "finished", confirmed: true } : phase;
    case "dismiss":
      return phase.kind === "ready" ? { kind: "finished", confirmed: false } : phase;
    case "edited":
      return phase.kind === "ready" && phase.error !== null ? { kind: "ready", error: null } : phase;
  }
}

/** Escape and Cancel work except while the action is in flight. */
export const canDismiss = (phase: ConfirmPhase): boolean => phase.kind === "ready";

// ── Running the action ───────────────────────────────────────────────────────

export interface ConfirmActionInput {
  reason: string;
  value: string;
}

export type ConfirmActionOutcome = { ok: true } | { ok: false; message: string };

export const CONNECTION_FAILURE_MESSAGE =
  "The server did not answer. Check your connection and try again.";
export const GENERIC_FAILURE_MESSAGE = "That did not go through. Try again.";

const FETCH_FAILURE = /failed to fetch|networkerror|network request failed|load failed/i;

/**
 * The sentence to show inside the dialog when an action throws.
 *
 * Only messages an action wrote on purpose reach the screen — a plain `Error`,
 * or the API client's `AdminApiError`, both of which carry the server's own
 * wording. A `TypeError` from a dropped connection gets the connection
 * sentence; anything else is a programming fault, whose message would mean
 * nothing to the person reading it.
 */
export function describeActionFailure(error: unknown): string {
  if (error instanceof TypeError) {
    return FETCH_FAILURE.test(error.message) ? CONNECTION_FAILURE_MESSAGE : GENERIC_FAILURE_MESSAGE;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    const deliberate = error.constructor === Error || error.name === "AdminApiError";
    return message && deliberate ? message : GENERIC_FAILURE_MESSAGE;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return GENERIC_FAILURE_MESSAGE;
}

export async function runConfirmAction(
  action: (input: ConfirmActionInput) => unknown,
  input: ConfirmActionInput,
): Promise<ConfirmActionOutcome> {
  try {
    await action(input);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeActionFailure(error) };
  }
}

/**
 * The server's own words for a refusal, or the caller's fallback with the
 * status — the same shape `campaign/shared.ts`'s `failureText` produces.
 */
export async function refusalMessage(
  response: { status: number; json(): Promise<unknown> },
  fallback: string,
): Promise<string> {
  const body = await response.json().catch(() => null);
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof error === "string" && error.trim() ? error.trim() : `${fallback} (${response.status})`;
}
