import { useQuery } from "@tanstack/react-query";

/**
 * What this environment can actually publish: the voices a business may choose
 * and the response styles (performance presets) available. Served by
 * GET /api/receptionist/voice/options from the same server catalog publish
 * uses, so anything listed here can be published.
 */
export interface VoiceChoice {
  key: string;
  label: string;
  description: string;
}

export interface ResponseStyleChoice extends VoiceChoice {
  /** The listed voice this style speaks with when no voice was chosen. */
  voiceKey: string | null;
}

export interface VoiceOptions {
  available: boolean;
  styles: ResponseStyleChoice[];
  voices: VoiceChoice[];
  defaultStyle: string | null;
  defaultVoice: string | null;
}

export const VOICE_OPTIONS_ENDPOINT = "/api/receptionist/voice/options";

function isChoice(v: unknown): v is VoiceChoice {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.key === "string" && typeof o.label === "string" && typeof o.description === "string";
}

export function parseVoiceOptions(body: unknown): VoiceOptions {
  const o = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.styles) || !Array.isArray(o.voices)) throw new Error("Voice options response was malformed.");
  return {
    available: o.available === true,
    styles: o.styles.filter(isChoice).map((s) => {
      const raw = (s as unknown as { voiceKey?: unknown }).voiceKey;
      return { ...s, voiceKey: typeof raw === "string" ? raw : null };
    }),
    voices: o.voices.filter(isChoice),
    defaultStyle: typeof o.defaultStyle === "string" ? o.defaultStyle : null,
    defaultVoice: typeof o.defaultVoice === "string" ? o.defaultVoice : null,
  };
}

export function useVoiceOptions() {
  return useQuery({
    queryKey: ["voice-options"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(VOICE_OPTIONS_ENDPOINT, { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 503 ? "Voice choices are not available right now." : "Voice choices couldn't be loaded.");
      return parseVoiceOptions(await res.json());
    },
  });
}

/**
 * The voice callers will hear: the explicit choice if one was made, otherwise
 * the voice the selected style uses. `null` when neither is known.
 */
export function effectiveVoiceKey(options: VoiceOptions, preset: string, voice: string | null): string | null {
  if (voice) return voice;
  return options.styles.find((s) => s.key === preset)?.voiceKey ?? null;
}

/** Why the saved choice cannot be published here, or null when it can. */
export function unavailableChoice(options: VoiceOptions, preset: string, voice: string | null): "style" | "voice" | null {
  if (!options.styles.some((s) => s.key === preset)) return "style";
  if (voice && !options.voices.some((v) => v.key === voice)) return "voice";
  return null;
}
