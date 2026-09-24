import type { BrowserVoiceClient, BrowserVoiceEvent, BrowserVoiceStartInput } from "./types";

/**
 * Milestone 1 / Checkpoint F1: the production default client until a real
 * provider client lands in Checkpoint F2. Deliberately does nothing: no
 * network request, no media access, no timer, no console output. `start`
 * always rejects with a static, safe message — Test must never silently
 * simulate a successful production call.
 */
export class UnavailableBrowserVoiceClient implements BrowserVoiceClient {
  readonly available = false;

  async start(_input: BrowserVoiceStartInput): Promise<void> {
    throw new Error("Browser voice integration is not connected yet.");
  }

  async end(): Promise<void> {
    // No call was ever started; nothing to do. Safe to call any number of times.
  }

  subscribe(_listener: (event: BrowserVoiceEvent) => void): () => void {
    // No events are ever emitted by this client.
    return () => {};
  }

  destroy(): void {
    // No resources are ever held by this client.
  }
}
