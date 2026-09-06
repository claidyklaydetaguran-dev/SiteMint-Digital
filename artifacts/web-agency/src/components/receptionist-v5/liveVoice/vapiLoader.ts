/**
 * The ONLY file in the marketing tree allowed to reference the Vapi Web
 * SDK (owner responsive-first directive, 2026-09-06 — supersedes the
 * previous blanket ban for this one dynamically-imported loader; the
 * receptionistV5Contract test enforces exactly that shape).
 *
 * Boundary rules, unchanged and absolute:
 * - Only the browser *public* key ever reaches this code. No VAPI_API_KEY,
 *   no server credential, no fallback value.
 * - The import is dynamic and reached only behind `liveVoiceEnabled`
 *   (a build-time exact-string flag), so a committed build — where the
 *   flag is unset — contains no SDK code at all (the lazy chunk that
 *   imports this module is folded out at the call site).
 */

/** The narrow slice of the SDK surface the call UI drives. */
export interface VapiLike {
  start(assistantId: string): Promise<unknown>;
  stop(): void;
  setMuted(muted: boolean): void;
  on(event: string, cb: (payload?: unknown) => void): void;
}

export async function loadVapi(publicKey: string): Promise<VapiLike> {
  const mod = (await import("@vapi-ai/web")) as unknown as {
    default: new (publicKey: string) => VapiLike;
  };
  return new mod.default(publicKey);
}
