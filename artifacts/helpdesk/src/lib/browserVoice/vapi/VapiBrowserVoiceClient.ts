import type { BrowserVoiceClient, BrowserVoiceEvent, BrowserVoiceStartInput } from "../types";
import { safeBrowserVoiceErrorMessage } from "../errors";
import type { VapiSdkEventListener, VapiSdkInstance, VapiSdkLoader } from "./sdkTypes";

const PERMISSION_DENIED_ERROR_NAMES = new Set(["NotAllowedError", "PermissionDeniedError"]);

/**
 * Reliable-only permission-denied detection: the installed SDK's `error`
 * event payload wraps a serialized `Error` (see `serializeError` in
 * `dist/vapi.js`) as `{ error: { name, message, ... }, ... }` for
 * Daily/getUserMedia failures, or occasionally surfaces the raw error
 * directly. This checks only the browser-standard `DOMException.name`
 * values for permission denial — never a substring search over arbitrary
 * error text.
 */
function isPermissionDeniedError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const nested = (payload as { error?: { name?: unknown } }).error?.name;
  if (typeof nested === "string" && PERMISSION_DENIED_ERROR_NAMES.has(nested)) return true;
  const direct = (payload as { name?: unknown }).name;
  return typeof direct === "string" && PERMISSION_DENIED_ERROR_NAMES.has(direct);
}

/**
 * Milestone 1 / Checkpoint F2A (correction): the real BrowserVoiceClient
 * adapter over the official `@vapi-ai/web` SDK. Constructing this class is
 * inert — it only stores the public key and the SDK loader function. The
 * SDK module is fetched, and the real SDK instance constructed, exactly
 * once, lazily, from inside `start()`; nothing here touches the network,
 * the microphone, or the SDK before that explicit call. Each instance owns
 * at most one SDK instance for its lifetime.
 */
export class VapiBrowserVoiceClient implements BrowserVoiceClient {
  readonly available = true;

  private readonly publicKey: string;
  private readonly loadSdk: VapiSdkLoader;
  private sdk: VapiSdkInstance | null = null;
  private listeners = new Set<(event: BrowserVoiceEvent) => void>();
  private destroyed = false;
  private startCalled = false;
  private startedSdk = false;
  private stopCalled = false;
  private sawCallStart = false;
  private sawCallEnd = false;

  private readonly onCallStart: VapiSdkEventListener = () => {
    if (this.destroyed || this.sawCallStart) return;
    this.sawCallStart = true;
    this.emit({ type: "call-start" });
  };

  private readonly onCallEnd: VapiSdkEventListener = () => {
    if (this.destroyed || this.sawCallEnd) return;
    this.sawCallEnd = true;
    this.emit({ type: "call-end" });
  };

  private readonly onError: VapiSdkEventListener = (payload) => {
    if (this.destroyed) return;
    this.emit(isPermissionDeniedError(payload) ? { type: "permission-denied" } : { type: "error" });
  };

  constructor(publicKey: string, loadSdk: VapiSdkLoader) {
    this.publicKey = publicKey;
    this.loadSdk = loadSdk;
  }

  async start(input: BrowserVoiceStartInput): Promise<void> {
    if (this.destroyed) throw new Error(safeBrowserVoiceErrorMessage("start_failed"));
    if (input.provider !== "vapi") throw new Error(safeBrowserVoiceErrorMessage("start_failed"));
    const providerAssistantId = input.providerAssistantId.trim();
    if (!providerAssistantId) throw new Error(safeBrowserVoiceErrorMessage("start_failed"));
    // Idempotent guard, set synchronously before any async work: a second
    // start while loading/active is a no-op, not an error — this also
    // guarantees rapid repeated confirmation triggers exactly one SDK
    // module load and one SDK construction.
    if (this.startCalled) return;
    this.startCalled = true;

    let SdkCtor;
    try {
      SdkCtor = await this.loadSdk();
    } catch {
      throw new Error(safeBrowserVoiceErrorMessage("start_failed"));
    }
    // Destroyed while the module was loading (unmount, firm/session/status
    // change) — abort before ever constructing the real SDK or touching the
    // network/microphone. No retry; destroy() already handled cleanup.
    if (this.destroyed) return;

    const sdk = new SdkCtor(this.publicKey);
    this.sdk = sdk;
    sdk.on("call-start", this.onCallStart);
    sdk.on("call-end", this.onCallEnd);
    sdk.on("error", this.onError);
    this.startedSdk = true;

    try {
      await sdk.start(providerAssistantId);
    } catch {
      throw new Error(safeBrowserVoiceErrorMessage("start_failed"));
    }
  }

  async end(): Promise<void> {
    // Idempotent guard: safe even if a call was never started.
    if (this.stopCalled) return;
    this.stopCalled = true;
    const sdk = this.sdk;
    if (!sdk) return;
    try {
      await sdk.stop();
    } catch {
      throw new Error(safeBrowserVoiceErrorMessage("end_failed"));
    }
  }

  subscribe(listener: (event: BrowserVoiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    const sdk = this.sdk;
    this.sdk = null;
    if (!sdk) return;

    try {
      sdk.removeListener("call-start", this.onCallStart);
      sdk.removeListener("call-end", this.onCallEnd);
      sdk.removeListener("error", this.onError);
    } catch {
      // Best-effort listener cleanup; destroy must never throw.
    }

    if (this.startedSdk && !this.stopCalled) {
      this.stopCalled = true;
      try {
        await sdk.stop();
      } catch {
        // Best-effort teardown; destroy must never throw or reject.
      }
    }
  }

  private emit(event: BrowserVoiceEvent): void {
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}
