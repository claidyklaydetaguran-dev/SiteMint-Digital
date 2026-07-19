/**
 * Milestone 1 / Checkpoint F2A: the minimal official-SDK surface this
 * adapter depends on, narrowed from the installed `@vapi-ai/web@2.6.1`
 * TypeScript declarations (`Vapi` extends an `events`-package
 * `EventEmitter`). F2A is lifecycle-only, so only `call-start`, `call-end`,
 * and `error` are named here. The installed declarations type listener
 * removal as `removeListener(event, listener)` on the `Vapi` class itself
 * (it does not re-declare `.off`), so that is the exact API this adapter
 * uses — never assumed, verified against `dist/client.d.ts`.
 */
export type VapiSdkEventName = "call-start" | "call-end" | "error";

/** The real SDK types call/error listeners with `any`; kept as `unknown` here since this adapter never inspects payload shape beyond a narrow, defensive read. */
export type VapiSdkEventListener = (payload?: unknown) => void;

export interface VapiSdkInstance {
  start(assistantId: string): Promise<unknown>;
  stop(): Promise<void>;
  on(event: VapiSdkEventName, listener: VapiSdkEventListener): unknown;
  removeListener(event: VapiSdkEventName, listener: VapiSdkEventListener): unknown;
}

/** The installed SDK's constructor signature: `new Vapi(publicKey)`. */
export interface VapiSdkConstructor {
  new (publicKey: string): VapiSdkInstance;
}

/**
 * Loads the SDK module/class only when called — never at import time and
 * never merely to check availability. Production dynamically imports
 * `@vapi-ai/web` from inside `VapiBrowserVoiceClient#start()` so the SDK
 * (and its `@daily-co/daily-js`/Sentry transitive code) lands in its own
 * lazy chunk, fetched only once a user confirms Start Browser Test. Mocked
 * verification injects a fake loader that never touches the real package.
 */
export type VapiSdkLoader = () => Promise<VapiSdkConstructor>;
