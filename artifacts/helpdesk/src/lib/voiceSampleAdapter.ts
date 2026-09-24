/**
 * A short recording of one voice, as the provider itself publishes it.
 *
 * Requested by catalog voice key only; the server resolves the key to the
 * provider's own preview and returns the audio bytes. Nothing here synthesizes
 * speech, uses browser text-to-speech, or plays a different voice as a
 * stand-in — a voice without a sample is reported as unavailable.
 */
export type VoiceSampleResult = { url: string; release: () => void } | { unavailable: true; reason: string };

export const VOICE_SAMPLE_UNAVAILABLE_REASON = "This voice has no sample yet.";

export function voiceSampleEndpoint(voiceKey: string): string {
  return `/api/receptionist/voice/voices/${encodeURIComponent(voiceKey)}/sample`;
}

export async function getVoiceSample(voiceKey: string, signal?: AbortSignal): Promise<VoiceSampleResult> {
  const res = await fetch(voiceSampleEndpoint(voiceKey), { credentials: "include", signal });
  if (res.status === 404) return { unavailable: true, reason: VOICE_SAMPLE_UNAVAILABLE_REASON };
  if (res.status === 429) return { unavailable: true, reason: "Too many previews. Try again in a few minutes." };
  if (!res.ok) throw new Error("The sample couldn't be loaded.");
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("audio/")) throw new Error("The sample wasn't audio.");
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("The sample was empty.");
  const url = URL.createObjectURL(blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}
