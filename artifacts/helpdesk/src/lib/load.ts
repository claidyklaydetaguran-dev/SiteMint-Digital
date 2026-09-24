// What a data load actually produced, and what a page may claim because of it.
//
// The defect this exists to prevent was found for real in the sibling CRM: a
// page showed "0 people" while the database held 15, because the request failed
// during a restart and the count was taken from a default empty array. Writing
// `data ?? []` erases the difference between "we could not load this" and
// "there is none", and the page then states the second one as a fact. For a
// business owner, "0 calls today" when the truth is "we could not load your
// calls" is a lie that looks like a number.
//
// Mirrored from artifacts/web-agency/src/lib/adminLoad.ts rather than shared
// with it: the two apps have different fetch wrappers and different refusal
// vocabularies, and a shared module would drag one app's auth semantics into
// the other. The shape is the part worth copying.
//
// Three rules carry the weight here, more than the types do:
//
//   1. A body that is not the shape the page expects is a FAILURE, not an empty
//      result. That check belongs in the queryFn — see `expectShape` — because
//      by the time a component reads `data`, the claim has already been made.
//   2. Any count, badge or total derived from a load that did not succeed shows
//      "—", never 0. The empty state stays visually distinct from the failure.
//   3. Each failure reads differently: unreachable, refused, missing, and "the
//      server could not answer".

/** A load, in exactly one of its three honest states. */
export type Load<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  /** `httpStatus` is null when the server could not be reached at all. */
  | { status: "error"; httpStatus: number | null; reason: string };

/**
 * Thrown by a queryFn when the body is not the shape the page expects.
 *
 * A 200 carrying something unreadable is a failure, not an empty result. This
 * is the difference between "the server answered something we could not read"
 * and "you have no contacts" — the second is a claim about the business.
 */
export class ShapeError extends Error {
  /** No HTTP status: the request itself succeeded. */
  readonly status = null;

  constructor(what: string) {
    super(`The server's answer for ${what} was not in a form this page can read.`);
    this.name = "ShapeError";
  }
}

/**
 * Validate a response body inside the queryFn, so a wrong shape becomes a
 * failed query rather than an empty-looking success.
 *
 * `pick` returning undefined means "not the shape I expect" — so a genuinely
 * empty list must be returned as `[]` by `pick`, never as undefined.
 */
export function expectShape<T>(body: unknown, pick: (body: unknown) => T | undefined, what: string): T {
  const picked = pick(body);
  if (picked === undefined) throw new ShapeError(what);
  return picked;
}

/** Why a request produced no data, in words a business owner can act on. */
export function failureReason(httpStatus: number | null, what = "this information"): string {
  if (httpStatus === null) {
    return `We could not reach the server, so ${what} is not shown. Your sign-in has not ended — this is a connection problem.`;
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return `You do not have access to ${what}.`;
  }
  if (httpStatus === 404) {
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} could not be found.`;
  }
  if (httpStatus >= 500) {
    // A proxied outage answers 5xx rather than failing the fetch, so a null
    // status alone does not detect one.
    return `The server could not return ${what} right now (error ${httpStatus}). Try again in a moment.`;
  }
  return `The server refused the request for ${what} (error ${httpStatus}).`;
}

/**
 * Classify a React Query result into a `Load`.
 *
 * Note the last branch: resolved, no error, and still no data is treated as a
 * failure rather than as an empty success. Assuming emptiness there is exactly
 * the bug this module exists to prevent.
 */
export function classifyLoad<T>(
  state: { isLoading: boolean; isError: boolean; error?: unknown; data: T | undefined },
  what = "this information",
): Load<T> {
  if (state.isLoading) return { status: "loading" };

  if (state.isError) {
    const error = state.error as { status?: unknown; message?: unknown } | undefined;
    const httpStatus = typeof error?.status === "number" ? error.status : null;
    // A shape failure already explains itself; anything else gets the standard
    // wording for its status.
    const reason =
      error instanceof ShapeError && typeof error.message === "string"
        ? error.message
        : failureReason(httpStatus, what);
    return { status: "error", httpStatus, reason };
  }

  if (state.data === undefined) {
    return { status: "error", httpStatus: null, reason: failureReason(null, what) };
  }

  return { status: "ready", data: state.data };
}

/**
 * A number derived from a load, or an em dash when the load did not succeed.
 *
 * Rule 2 in one function: a count is a claim about the business, so it may only
 * be shown when the data behind it actually arrived.
 */
export function countLabel<T>(load: Load<T>, derive: (data: T) => number): string {
  return load.status === "ready" ? String(derive(load.data)) : "—";
}
