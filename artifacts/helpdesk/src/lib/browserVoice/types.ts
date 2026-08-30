/**
 * Milestone 1 / Checkpoint F1: provider-neutral contract for a browser
 * voice-test client. No file in this module may import a provider SDK,
 * read import.meta.env, call fetch/WebSocket, or call
 * navigator.mediaDevices.getUserMedia — those all belong to a concrete
 * provider client landing in Checkpoint F2.
 */

export type BrowserVoiceTestState =
  | "idle"
  | "preparing"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "permission_denied"
  | "error";

/**
 * The exhaustive set of lifecycle events a BrowserVoiceClient may emit.
 * Consumers must ignore any event whose `type` isn't one of these instead
 * of throwing — a future provider client may emit additional event types
 * this checkpoint doesn't yet know about.
 */
export type BrowserVoiceEvent =
  | { type: "call-start" }
  | { type: "call-end" }
  | { type: "permission-denied" }
  | { type: "error" };

/**
 * Only the opaque provider assistant id crosses this boundary — never
 * firmId, the database assistant id, assistant config, or prompt content.
 */
export interface BrowserVoiceStartInput {
  provider: "vapi";
  providerAssistantId: string;
}

export interface BrowserVoiceClient {
  /** False for the safe default client; a real provider client sets this once it can actually start a call. */
  readonly available: boolean;

  start(input: BrowserVoiceStartInput): Promise<void>;

  /** Safe to call even if a call was never started; idempotent. */
  end(): Promise<void>;

  /** Returns an unsubscribe function. Listeners must never throw for an unrecognized event type. */
  subscribe(listener: (event: BrowserVoiceEvent) => void): () => void;

  /** Releases any resources held by this client instance. Safe to call more than once. */
  destroy(): Promise<void> | void;
}
