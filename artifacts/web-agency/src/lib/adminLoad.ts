/**
 * Loading admin data honestly.
 *
 * A request that failed must never look like a request that returned nothing.
 * The legacy Discovery Portal did exactly that: a refused request left its list
 * empty, so every count read 0 and the table said "No submissions yet". These
 * helpers turn every answer into either data or a stated failure, in words that
 * tell the person what they can do about it.
 */

import { AdminApiError, adminFetch, describeRefusal } from "./adminFetch";

export type Load<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  /** `httpStatus` is null when the server could not be reached at all. */
  | { status: "error"; httpStatus: number | null; reason: string };

function serverError(body: unknown): string | null {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof error === "string" && error.trim().length > 0 ? error.trim().replace(/[.!]+$/, "") : null;
}

/** Why a request produced no data, as a complete sentence or two. */
export function failureReason(httpStatus: number | null, body?: unknown): string {
  if (httpStatus === null) return "The server could not be reached. Check your connection and try again.";
  if (httpStatus === 401 || httpStatus === 403) {
    const refusal = describeRefusal(new AdminApiError(httpStatus, serverError(body) ?? "The request was refused.", body));
    if (refusal) return `${refusal.title} ${refusal.detail}`;
  }
  if (httpStatus === 404) return "It was not found.";
  const detail = serverError(body);
  return detail
    ? `The server answered with an error (${httpStatus}): ${detail}.`
    : `The server answered with an error (${httpStatus}).`;
}

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** The reason a completed, non-2xx response gives. Reads the body. */
export async function responseFailureReason(res: Response): Promise<string> {
  return failureReason(res.status, await bodyOf(res));
}

/**
 * GET one resource. `pick` extracts the data from the parsed body and returns
 * undefined when the body is not what the page expects, which is also a failure
 * rather than an empty result.
 */
export async function readAdminResource<T>(
  path: string,
  pick: (body: unknown) => T | undefined,
): Promise<Load<T>> {
  let res: Response;
  try {
    res = await adminFetch(path);
  } catch {
    return { status: "error", httpStatus: null, reason: failureReason(null) };
  }
  const body = await bodyOf(res);
  if (!res.ok) return { status: "error", httpStatus: res.status, reason: failureReason(res.status, body) };
  const data = pick(body);
  if (data === undefined) {
    return { status: "error", httpStatus: res.status, reason: "The server's answer was not in the expected shape." };
  }
  return { status: "ready", data };
}
