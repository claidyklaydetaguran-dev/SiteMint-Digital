/**
 * Owner-preview live voice demo — build flag + frontend config readers
 * (owner responsive-first directive, 2026-09-06).
 *
 * `VITE_RECEPTIONIST_LIVE_VOICE_ENABLED` is the clearly-named feature flag
 * the directive requires. Exact-string comparison, fail-closed: unset,
 * blank, or any other value means the live path never mounts and the
 * simulated preview remains the only launchable mode. It is never "true"
 * in a committed build — it is set only for the owner-preview build after
 * the checklist in the owner package passes.
 *
 * The two config readers expose ONLY non-sensitive frontend context:
 * - the Vapi *public* browser key (designed by the provider to ship in
 *   frontend code; still never logged and never committed as a value);
 * - the dedicated demo assistant id (an identifier, not a credential).
 * The private `VAPI_API_KEY` must never appear anywhere in this tree —
 * that ban is unchanged and enforced by receptionistV5Contract.test.ts.
 */

export const liveVoiceEnabled: boolean =
  import.meta.env.VITE_RECEPTIONIST_LIVE_VOICE_ENABLED === "true";

export function getVapiPublicKey(): string | null {
  const raw = import.meta.env.VITE_VAPI_PUBLIC_KEY;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDemoAssistantId(): string | null {
  const raw = import.meta.env.VITE_VAPI_DEMO_ASSISTANT_ID;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Hard conversation cap (owner directive: maximum 90 seconds). */
export const LIVE_VOICE_MAX_SECONDS = 90;
