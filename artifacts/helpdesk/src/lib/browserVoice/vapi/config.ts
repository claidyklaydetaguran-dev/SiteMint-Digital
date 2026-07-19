/**
 * Milestone 1 / Checkpoint F2A: the single, explicit reader for the Vapi
 * browser public key. Never read `import.meta.env.VITE_VAPI_PUBLIC_KEY`
 * anywhere else. Trims whitespace; missing or whitespace-only means
 * unavailable (`null`) — no fallback value, no private-key variable, no
 * value from an API endpoint or browser storage. Never logs the key.
 */
export function getVapiPublicKey(): string | null {
  const raw = import.meta.env.VITE_VAPI_PUBLIC_KEY;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
