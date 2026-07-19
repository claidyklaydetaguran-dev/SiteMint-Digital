import { createContext, useContext, type ReactNode } from "react";
import type { BrowserVoiceClient } from "./types";
import { UnavailableBrowserVoiceClient } from "./UnavailableBrowserVoiceClient";

/**
 * Constructs one fresh client instance. Callers own the returned instance's
 * lifecycle (subscribe/start/end/destroy) — this module never holds a
 * global mutable call instance and never constructs a client at import
 * time.
 */
export type BrowserVoiceClientFactory = () => BrowserVoiceClient;

const productionFactory: BrowserVoiceClientFactory = () => new UnavailableBrowserVoiceClient();

/**
 * Dev-only mock-injection seam for local Playwright/component verification.
 * `import.meta.env.DEV` is a Vite compile-time constant: a production build
 * statically resolves this branch to `false` and dead-code-eliminates it,
 * so none of this — including the `window` property — exists in the
 * production bundle. Never read outside this resolver.
 */
declare global {
  interface Window {
    __browserVoiceClientFactoryOverride?: BrowserVoiceClientFactory;
  }
}

function resolveDefaultFactory(): BrowserVoiceClientFactory {
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__browserVoiceClientFactoryOverride) {
    return window.__browserVoiceClientFactoryOverride;
  }
  return productionFactory;
}

// `null` is the "no explicit override" sentinel — every consumer without an
// ancestor BrowserVoiceClientProvider (i.e. all of production) falls
// through to resolveDefaultFactory() below, evaluated fresh on every call
// rather than baked into a static context default.
const BrowserVoiceClientFactoryContext = createContext<BrowserVoiceClientFactory | null>(null);

/**
 * Optional: wrap a component subtree with this only to pin an exact factory
 * (e.g. an isolated component test). Application/route code never needs
 * this — omitting it entirely already resolves to the production
 * UnavailableBrowserVoiceClient (or, only in a dev server, an explicitly
 * window-injected override for local verification).
 */
export function BrowserVoiceClientProvider({ factory, children }: { factory: BrowserVoiceClientFactory; children: ReactNode }) {
  return <BrowserVoiceClientFactoryContext.Provider value={factory}>{children}</BrowserVoiceClientFactoryContext.Provider>;
}

export function useBrowserVoiceClientFactory(): BrowserVoiceClientFactory {
  const injected = useContext(BrowserVoiceClientFactoryContext);
  return injected ?? resolveDefaultFactory();
}
