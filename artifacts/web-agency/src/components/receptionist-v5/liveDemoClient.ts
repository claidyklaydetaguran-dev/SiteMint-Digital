/**
 * AI Receptionist V5 — the live-demo client (§try, mode 2).
 *
 * V5-BLUEPRINT §10 mode 2. This module talks to exactly one backend route,
 * `POST /api/public/demo/session`, with `fetch`. It contains **no provider
 * SDK import, no `@vapi-ai/*` reference, and no `VAPI_API_KEY` reference** —
 * that boundary is enforced by the contract test
 * (`receptionistV5Contract.test.ts`) and is binding per CLAUDE.md's voice
 * platform rules (only `VapiVoiceProvider.ts` and the provider factory may
 * reference the provider).
 *
 * `startDemoSession()` only fetches a short-lived session descriptor
 * (`token`, `expiresAt`, `maxSeconds`) from the server. It never uses that
 * token itself — actually placing a call is a separate, not-yet-certified
 * step (V5-BLUEPRINT §18.9: "the simulated preview is the only launchable
 * mode until then"). `DemoTransport` is the typed seam a future certified
 * transport would implement to consume the token; `UnavailableDemoTransport`
 * is the only implementation that ships, and it always reports the demo as
 * unavailable rather than silently doing nothing.
 */

export const DEMO_SESSION_ENDPOINT = "/api/public/demo/session";
export const DEMO_SESSION_METHOD = "POST";

export interface DemoSession {
  token: string;
  expiresAt: string;
  maxSeconds: number;
}

export class DemoUnavailableError extends Error {
  constructor(message = "Live demo is not available.") {
    super(message);
    this.name = "DemoUnavailableError";
  }
}

export type StartDemoSessionResult =
  | { ok: true; session: DemoSession }
  | { ok: false; reason: "unavailable" | "rate-limited" | "network" | "unknown"; message: string };

/**
 * Calls the backend to request a live-demo session. Always resolves (never
 * throws) so callers can render every documented state without a try/catch:
 * `unavailable` (503 — flag off or not yet certified), `rate-limited` (429),
 * `network` (fetch itself failed), `unknown` (any other non-2xx), or `ok`.
 */
export async function startDemoSession(
  fetchImpl: typeof fetch = fetch,
): Promise<StartDemoSessionResult> {
  let response: Response;
  try {
    response = await fetchImpl(DEMO_SESSION_ENDPOINT, {
      method: DEMO_SESSION_METHOD,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    return { ok: false, reason: "network", message: "We couldn't reach the server. Please try again." };
  }

  if (response.status === 503) {
    const body = await safeJson(response);
    return {
      ok: false,
      reason: "unavailable",
      message: (body?.error as string) || "Live demo is not available.",
    };
  }
  if (response.status === 429) {
    return { ok: false, reason: "rate-limited", message: "Please try again in a minute." };
  }
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      reason: "unknown",
      message: (body?.error as string) || "Something went wrong. Please try again.",
    };
  }

  const body = await safeJson(response);
  if (!body || typeof body.token !== "string" || typeof body.expiresAt !== "string" || typeof body.maxSeconds !== "number") {
    return { ok: false, reason: "unknown", message: "Unexpected response from the server." };
  }
  return { ok: true, session: { token: body.token, expiresAt: body.expiresAt, maxSeconds: body.maxSeconds } };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The seam a future certified voice transport would implement to actually
 * place the browser call using a `DemoSession.token`. Nothing in this
 * codebase may import a provider SDK to implement it yet.
 */
export interface DemoTransport {
  /** Human-readable name shown in diagnostics; never a provider name. */
  readonly name: string;
  connect(session: DemoSession): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * The only `DemoTransport` that ships. It always reports the demo as
 * unavailable — there is no live transport wired into any build, committed
 * or otherwise, until the browser call passes end-to-end certification.
 */
export class UnavailableDemoTransport implements DemoTransport {
  readonly name = "unavailable";

  async connect(): Promise<void> {
    throw new DemoUnavailableError();
  }

  async disconnect(): Promise<void> {
    // Nothing was ever connected.
  }
}
