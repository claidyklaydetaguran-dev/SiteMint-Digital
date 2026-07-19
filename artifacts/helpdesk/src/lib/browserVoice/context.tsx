import { createContext, useContext, type ReactNode } from "react";
import type { BrowserVoiceClient } from "./types";
import { UnavailableBrowserVoiceClient } from "./UnavailableBrowserVoiceClient";
import { createProductionBrowserVoiceClientSource } from "./vapi/factory";
import { voicePlatformEnabled, voiceBrowserTestEnabled } from "@/lib/featureFlags";

/**
 * Milestone 1 / Checkpoint F2A (correction): reports whether browser voice
 * testing is available *without* constructing a client, and constructs
 * exactly one client only when `create()` is explicitly called. This is the
 * seam that lets `useBrowserVoiceTest` know whether Test should be
 * eligible-in-principle without ever instantiating a `BrowserVoiceClient`
 * (or the real provider SDK) for a page view that never starts a test —
 * every state a persisted builder can be in still calls this once per
 * mount, but reading `.available` is a plain, side-effect-free config
 * check, never a client/SDK construction.
 */
export interface BrowserVoiceClientSource {
  readonly available: boolean;
  create(): BrowserVoiceClient;
}

/**
 * Constructing this doesn't touch the SDK, network, or microphone — it only
 * closes over the (cheap, config-only) Vapi client source for use once both
 * flags are on.
 */
const vapiSource = createProductionBrowserVoiceClientSource();

/**
 * Milestone 1 / Checkpoint F2A (correction): fails closed to the standing
 * unavailable source unless both `voicePlatformEnabled` and
 * `voiceBrowserTestEnabled` are true; `available` additionally requires a
 * configured public key (a cheap read inside `vapiSource.available` — see
 * `vapi/factory.ts`). Matches F1's production-safe default exactly when
 * either flag is off.
 */
const productionSource: BrowserVoiceClientSource = {
  get available(): boolean {
    return voicePlatformEnabled && voiceBrowserTestEnabled && vapiSource.available;
  },
  create(): BrowserVoiceClient {
    if (!voicePlatformEnabled || !voiceBrowserTestEnabled) {
      return new UnavailableBrowserVoiceClient();
    }
    return vapiSource.create();
  },
};

/**
 * Dev-only mock-injection seam for local Playwright/component verification.
 * `import.meta.env.DEV` is a Vite compile-time constant: a production build
 * statically resolves this branch to `false` and dead-code-eliminates it,
 * so none of this — including the `window` property — exists in the
 * production bundle. Never read outside this resolver.
 */
declare global {
  interface Window {
    __browserVoiceClientSourceOverride?: BrowserVoiceClientSource;
  }
}

function resolveDefaultSource(): BrowserVoiceClientSource {
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__browserVoiceClientSourceOverride) {
    return window.__browserVoiceClientSourceOverride;
  }
  return productionSource;
}

// `null` is the "no explicit override" sentinel — every consumer without an
// ancestor BrowserVoiceClientProvider (i.e. all of production) falls
// through to resolveDefaultSource() below, evaluated fresh on every call
// rather than baked into a static context default.
const BrowserVoiceClientSourceContext = createContext<BrowserVoiceClientSource | null>(null);

/**
 * Optional: wrap a component subtree with this only to pin an exact source
 * (e.g. an isolated component test). Application/route code never needs
 * this — omitting it entirely already resolves to the production
 * `UnavailableBrowserVoiceClient` source (or, only in a dev server, an
 * explicitly window-injected override for local verification).
 */
export function BrowserVoiceClientProvider({ source, children }: { source: BrowserVoiceClientSource; children: ReactNode }) {
  return <BrowserVoiceClientSourceContext.Provider value={source}>{children}</BrowserVoiceClientSourceContext.Provider>;
}

export function useBrowserVoiceClientSource(): BrowserVoiceClientSource {
  const injected = useContext(BrowserVoiceClientSourceContext);
  return injected ?? resolveDefaultSource();
}
