// AR-001A — TEST-ONLY. Never imported by production code, never bundled.
//
// A `BrowserVoiceClient` that answers from a script instead of from a provider.
// The only import is a type-only one, so this file has no runtime coupling to
// anything at all: it loads no SDK, requests no microphone, opens no WebRTC
// peer connection or WebSocket, and issues no request.
//
// Why this can exist without touching production source: `useBrowserVoiceTest`
// obtains its client from `BrowserVoiceClientSource.create()`, and
// `useBrowserVoiceClientSource()` returns an injected context value when one is
// present. `VapiBrowserVoiceClient` likewise takes its SDK loader as a
// constructor argument. Both seams were built for substitution (see
// context.tsx and vapi/sdkTypes.ts) and neither is modified here.
//
// Scope note: this fakes the *client* contract — the four lifecycle events and
// the start/end/subscribe/destroy surface. The eight-value
// `BrowserVoiceTestState` union belongs to the hook, not the client, and is
// derived by the hook from these events. Driving the hook itself needs a React
// renderer this workspace does not have; see browserVoiceContract.test.ts.

import type { BrowserVoiceClient, BrowserVoiceEvent, BrowserVoiceStartInput } from "../types";

/** What `start()` should do, expressed only in terms the real contract allows. */
export type FakeStartBehavior =
  /** Resolve, then emit call-start — the ordinary connecting → connected path. */
  | { kind: "connects" }
  /** Resolve, emit call-start, then emit call-end — a provider-side hangup. */
  | { kind: "connectsThenRemoteEnd" }
  /** Reject before connecting. Mirrors a failed SDK module load or a refused start. */
  | { kind: "failsToStart" }
  /** Resolve, then emit the permission-denied event without ever connecting. */
  | { kind: "permissionDenied" }
  /** Resolve, then emit error without ever connecting. */
  | { kind: "failsBeforeConnect" }
  /** Resolve, emit call-start, then emit error — a drop after a working call. */
  | { kind: "failsAfterConnect" }
  /** Resolve and stay silent. Nothing is emitted until a test asks for it. */
  | { kind: "idle" };

export interface FakeBrowserVoiceClientOptions {
  behavior?: FakeStartBehavior;
  /** Reported by `available`. The production default source reports false when no public key is configured. */
  available?: boolean;
  /** When true, `end()` rejects — the client-side equivalent of a teardown that did not complete cleanly. */
  failOnEnd?: boolean;
}

/**
 * Deterministic, synchronous-by-construction fake.
 *
 * Every emission happens on a resolved-promise microtask rather than a timer,
 * so a test awaits a tick instead of sleeping, and no pending timer can outlive
 * the test. `pendingTimers` is exposed and asserted to stay at zero.
 */
export class FakeBrowserVoiceClient implements BrowserVoiceClient {
  readonly available: boolean;

  private readonly behavior: FakeStartBehavior;
  private readonly failOnEnd: boolean;
  private listeners = new Set<(event: BrowserVoiceEvent) => void>();

  private startCalled = false;
  private stopCalled = false;
  private destroyed = false;

  /** Ordered log of every lifecycle call, for asserting idempotence and ordering. */
  readonly calls: string[] = [];
  /** Every event this client emitted, in order. */
  readonly emitted: BrowserVoiceEvent[] = [];

  constructor(options: FakeBrowserVoiceClientOptions = {}) {
    this.behavior = options.behavior ?? { kind: "connects" };
    this.available = options.available ?? true;
    this.failOnEnd = options.failOnEnd ?? false;
  }

  /** Always zero: this fake never schedules a timer. Asserted by the contract test. */
  get pendingTimers(): number {
    return 0;
  }

  /** Live subscriber count — must return to zero after destroy(). */
  get listenerCount(): number {
    return this.listeners.size;
  }

  get wasStarted(): boolean {
    return this.startCalled;
  }

  get wasDestroyed(): boolean {
    return this.destroyed;
  }

  async start(input: BrowserVoiceStartInput): Promise<void> {
    this.calls.push("start");

    if (this.destroyed) throw new Error("The browser voice test couldn't start. Please try again.");
    if (input.provider !== "vapi") throw new Error("The browser voice test couldn't start. Please try again.");
    if (input.providerAssistantId.trim().length === 0) {
      throw new Error("The browser voice test couldn't start. Please try again.");
    }

    // Idempotent guard set synchronously, mirroring VapiBrowserVoiceClient:
    // a second start while active is a no-op, not an error.
    if (this.startCalled) return;
    this.startCalled = true;

    if (this.behavior.kind === "failsToStart") {
      throw new Error("The browser voice test couldn't start. Please try again.");
    }

    switch (this.behavior.kind) {
      case "connects":
        await this.tick();
        this.emit({ type: "call-start" });
        break;
      case "connectsThenRemoteEnd":
        await this.tick();
        this.emit({ type: "call-start" });
        await this.tick();
        this.emit({ type: "call-end" });
        break;
      case "permissionDenied":
        await this.tick();
        this.emit({ type: "permission-denied" });
        break;
      case "failsBeforeConnect":
        await this.tick();
        this.emit({ type: "error" });
        break;
      case "failsAfterConnect":
        await this.tick();
        this.emit({ type: "call-start" });
        await this.tick();
        this.emit({ type: "error" });
        break;
      case "idle":
        break;
    }
  }

  async end(): Promise<void> {
    this.calls.push("end");
    // Idempotent: safe even if a call was never started.
    if (this.stopCalled) return;
    this.stopCalled = true;
    if (this.failOnEnd) throw new Error("Ending the browser voice test didn't finish cleanly.");
    if (!this.startCalled) return;
    this.emit({ type: "call-end" });
  }

  subscribe(listener: (event: BrowserVoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async destroy(): Promise<void> {
    this.calls.push("destroy");
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
  }

  /** Emit an event on demand — used to drive states the scripted behaviors do not cover. */
  emitNow(event: BrowserVoiceEvent): void {
    this.emit(event);
  }

  private emit(event: BrowserVoiceEvent): void {
    if (this.destroyed) return;
    this.emitted.push(event);
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }

  private tick(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * A `BrowserVoiceClientSource`-shaped object over the fake. Structurally
 * matches the production interface (`{ available, create() }`) without
 * importing `context.tsx`, which reads `import.meta.env` and therefore cannot
 * be loaded outside a Vite build.
 */
export function createFakeBrowserVoiceClientSource(options: FakeBrowserVoiceClientOptions = {}): {
  readonly available: boolean;
  create(): FakeBrowserVoiceClient;
  readonly created: FakeBrowserVoiceClient[];
} {
  const created: FakeBrowserVoiceClient[] = [];
  return {
    get available(): boolean {
      return options.available ?? true;
    },
    create(): FakeBrowserVoiceClient {
      const client = new FakeBrowserVoiceClient(options);
      created.push(client);
      return client;
    },
    created,
  };
}
