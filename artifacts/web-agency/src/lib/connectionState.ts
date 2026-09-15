/**
 * Connection state for an ONLINE-FIRST CRM.
 *
 * The owner's decision for this release is explicit: no offline database
 * synchronisation and no offline writes. That is a real constraint, not a gap
 * to paper over — so the job here is to make a connection problem *legible*
 * rather than to pretend the application still works without one.
 *
 * What this deliberately does NOT do:
 *   - queue writes to replay later. A queued "approve", "send" or "delete"
 *     that fires minutes later, against a record somebody else has since
 *     changed, is how an operator ends up having done something they never
 *     watched happen. Offline writes are out of scope on purpose.
 *   - treat `navigator.onLine` as truth. It reports whether the machine has a
 *     network interface, not whether this server is reachable — a captive
 *     portal, a dead VPN and a stopped API all read as "online". The real
 *     signal is whether our own requests are completing, so that is what
 *     drives the state. `navigator.onLine` is used only in the one direction
 *     it is reliable: going offline is a strong hint, coming back is not.
 */

export type ConnectionStatus = "online" | "reconnecting" | "offline";

export interface ConnectionState {
  status: ConnectionStatus;
  /** Consecutive failed requests. Zero whenever the last request succeeded. */
  consecutiveFailures: number;
  /** When we last completed a request against the server. */
  lastSuccessAt: number | null;
  /** When the current trouble began, for "reconnecting for 40s" style copy. */
  troubleSince: number | null;
}

/** One failure is a blip; this many in a row is a connection problem. */
const OFFLINE_AFTER_FAILURES = 3;

let state: ConnectionState = {
  status: "online",
  consecutiveFailures: 0,
  lastSuccessAt: null,
  troubleSince: null,
};

type Listener = (s: ConnectionState) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of [...listeners]) {
    try {
      l(state);
    } catch {
      // A broken subscriber must not stop the others from being told.
    }
  }
}

function set(next: Partial<ConnectionState>): void {
  const merged = { ...state, ...next };
  const changed =
    merged.status !== state.status ||
    merged.consecutiveFailures !== state.consecutiveFailures;
  state = merged;
  if (changed) emit();
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A request completed — whatever its HTTP status. The transport works. */
export function reportRequestSucceeded(): void {
  set({
    status: "online",
    consecutiveFailures: 0,
    lastSuccessAt: Date.now(),
    troubleSince: null,
  });
}

/**
 * A request never completed: the fetch itself rejected.
 *
 * An HTTP error is NOT a connection failure. A 500 means we reached the server
 * and it answered badly, which is a different problem with a different fix, and
 * conflating them would show "you are offline" to somebody whose connection is
 * fine.
 */
export function reportRequestFailed(): void {
  const failures = state.consecutiveFailures + 1;
  set({
    consecutiveFailures: failures,
    troubleSince: state.troubleSince ?? Date.now(),
    status: failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting",
  });
}

/**
 * Wire browser events. Idempotent; safe to call more than once.
 *
 * Only the `offline` event is trusted, for the reason in the header: the
 * browser saying it has a network back tells us nothing about whether our
 * server is reachable, so recovery is proven by a request succeeding.
 */
let wired = false;
export function startConnectionWatch(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("offline", () => {
    set({
      status: "offline",
      troubleSince: state.troubleSince ?? Date.now(),
      consecutiveFailures: Math.max(state.consecutiveFailures, OFFLINE_AFTER_FAILURES),
    });
  });
  window.addEventListener("online", () => {
    // A hint that it is worth trying again — not proof, so do not claim
    // "online" until a request actually completes.
    if (state.status === "offline") set({ status: "reconnecting" });
  });
}

/** Test seam. */
export function __resetConnectionState(): void {
  state = { status: "online", consecutiveFailures: 0, lastSuccessAt: null, troubleSince: null };
  listeners.clear();
  wired = false;
}
