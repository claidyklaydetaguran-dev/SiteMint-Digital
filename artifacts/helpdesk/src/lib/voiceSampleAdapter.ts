import type { SupportedVoicePresetId } from "@/pages/assistants/assistantsContract";

/**
 * V5 PR-6 (C-4): provider-neutral seam for a short audio sample of a voice
 * preset. `VoiceSamplePlayer` calls this and nothing else — it never talks to
 * a provider, a CDN, or browser text-to-speech directly, so a future
 * implementation (e.g. serving a pre-recorded, owner-approved asset) can
 * replace this one function without touching any caller.
 *
 * The program's binding rule for this build is no paid and no browser-TTS
 * voice samples. This default implementation honors that literally: it makes
 * no network request, loads no audio, and calls no synthesis API. It always
 * reports the sample as not yet installed, truthfully, rather than
 * simulating one.
 */
export type VoiceSampleResult = { url: string } | { unavailable: true; reason: string };

export const VOICE_SAMPLE_UNAVAILABLE_REASON = "Voice samples are not installed yet.";

export async function getVoiceSample(
  _presetId: SupportedVoicePresetId,
): Promise<VoiceSampleResult> {
  return { unavailable: true, reason: VOICE_SAMPLE_UNAVAILABLE_REASON };
}
