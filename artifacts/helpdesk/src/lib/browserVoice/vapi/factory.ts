import type { BrowserVoiceClient } from "../types";
import type { BrowserVoiceClientSource } from "../context";
import { UnavailableBrowserVoiceClient } from "../UnavailableBrowserVoiceClient";
import { VapiBrowserVoiceClient } from "./VapiBrowserVoiceClient";
import { getVapiPublicKey } from "./config";
import type { VapiSdkConstructor, VapiSdkLoader } from "./sdkTypes";

/**
 * Milestone 1 / Checkpoint F2A (correction): dynamically imports
 * `@vapi-ai/web` only when called — never at module import, never merely to
 * check availability. This keeps the SDK (and its `@daily-co/daily-js` +
 * Sentry transitive code) out of the initial entry chunk; it is fetched as
 * its own lazy chunk only from inside `VapiBrowserVoiceClient#start()`.
 */
const loadVapiSdk: VapiSdkLoader = () =>
  import("@vapi-ai/web").then((mod) => mod.default as unknown as VapiSdkConstructor);

/**
 * Milestone 1 / Checkpoint F2A (correction): the production
 * BrowserVoiceClientSource. `available` is a cheap, side-effect-free config
 * check (public key presence only) — it constructs no client, loads no SDK
 * module, and constructs no SDK instance. `create()` constructs only the
 * inert `VapiBrowserVoiceClient` wrapper; the real SDK module/instance are
 * loaded only from inside that wrapper's own `start()`.
 */
export function createProductionBrowserVoiceClientSource(): BrowserVoiceClientSource {
  return {
    get available(): boolean {
      return getVapiPublicKey() !== null;
    },
    create(): BrowserVoiceClient {
      const publicKey = getVapiPublicKey();
      if (!publicKey) return new UnavailableBrowserVoiceClient();
      return new VapiBrowserVoiceClient(publicKey, loadVapiSdk);
    },
  };
}
