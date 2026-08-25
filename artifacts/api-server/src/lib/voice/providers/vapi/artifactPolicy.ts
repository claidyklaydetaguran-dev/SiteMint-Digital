// AR-001G: server-owned Vapi artifact policy.
//
// Vapi's `ArtifactPlan` defaults are permissive: `recordingEnabled` defaults
// to TRUE and `transcriptPlan.enabled` defaults to TRUE. An assistant created
// without an explicit `artifactPlan` therefore has call audio recorded and the
// transcript retained by the provider — silently, and with no SiteMint code
// having asked for it. That is not an acceptable default for a staging test
// with a real microphone.
//
// This module makes the choice explicit and server-owned. The policy comes
// from one environment variable read by the server process. It is never
// accepted in an API request body, never read from a persisted assistant
// config, and never derived from anything a firm or a browser can influence —
// so there is no path by which a customer could turn recording back on.
//
// Every field emitted below is a documented field of Vapi's assistant-creation
// schema, verified against the locally installed official types
// (`@vapi-ai/web` 2.6.1, `dist/api.d.ts`: `ArtifactPlan`, `TranscriptPlan`).
// No field is invented, and no value falls back to a Vapi default.

import { VoiceProviderError } from "../../errors";
import type { JsonObject } from "../../types";
import { VAPI_PROVIDER_KEY } from "./config";

export const VOICE_ARTIFACT_POLICY_ENV_VAR = "VOICE_ARTIFACT_POLICY";

/**
 * The three approved policies.
 *
 * A precise reading of `none`: it disables every artifact Vapi will *retain*
 * for the call — the audio recording, the video recording, the stored
 * transcript, and the SIP packet capture. It does not, and cannot, stop
 * speech-to-text from happening during the call: a voice assistant works by
 * transcribing the caller in real time and feeding that text to the model, so
 * a transcriber is required for the assistant to function at all. What
 * `transcriptPlan.enabled: false` removes is the retained
 * `call.artifact.transcript`. See VOICE_ARTIFACT_POLICY in
 * docs/ai-receptionist/LAUNCH_CHECKLIST.md for the operator-facing wording.
 */
export const VOICE_ARTIFACT_POLICIES = ["none", "transcript_only", "full"] as const;

export type VoiceArtifactPolicy = (typeof VOICE_ARTIFACT_POLICIES)[number];

const POLICY_SET: ReadonlySet<string> = new Set(VOICE_ARTIFACT_POLICIES);

export function isVoiceArtifactPolicy(value: unknown): value is VoiceArtifactPolicy {
  return typeof value === "string" && POLICY_SET.has(value);
}

function notConfigured(message: string): VoiceProviderError {
  return new VoiceProviderError("NOT_CONFIGURED", message, { provider: VAPI_PROVIDER_KEY });
}

/**
 * Parses a policy value. Throws `VoiceProviderError("NOT_CONFIGURED")` for
 * anything that is not exactly one of the three approved names — no
 * case-folding, no trimming of interior text, and explicitly no default. The
 * rejected value is never echoed back.
 */
export function parseVoiceArtifactPolicy(raw: unknown): VoiceArtifactPolicy {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw notConfigured(`${VOICE_ARTIFACT_POLICY_ENV_VAR} is not set.`);
  }
  const trimmed = raw.trim();
  if (!isVoiceArtifactPolicy(trimmed)) {
    throw notConfigured(
      `${VOICE_ARTIFACT_POLICY_ENV_VAR} must be one of: ${VOICE_ARTIFACT_POLICIES.join(", ")}.`,
    );
  }
  return trimmed;
}

/** The only environment field this module reads. */
export interface VoiceArtifactPolicyEnv {
  VOICE_ARTIFACT_POLICY?: string | undefined;
}

/**
 * Explicitly reads and validates the policy from the environment. Never called
 * at module import time — callers invoke it at the point of use, exactly like
 * `loadRuntimeCatalogFromEnv()`. There is no silent fallback: an unset or
 * misspelled value throws rather than resolving to a permissive default.
 */
export function loadVoiceArtifactPolicyFromEnv(
  env: VoiceArtifactPolicyEnv = process.env,
): VoiceArtifactPolicy {
  return parseVoiceArtifactPolicy(env[VOICE_ARTIFACT_POLICY_ENV_VAR]);
}

/**
 * Builds the exact `artifactPlan` object for a policy.
 *
 * Every key is written explicitly, including the ones whose Vapi default
 * already matches the value we want (`videoRecordingEnabled` defaults to
 * false). Relying on a provider default is precisely the failure mode this
 * correction exists to remove, and a default can change without notice on the
 * provider's side.
 *
 * Fields deliberately NOT emitted here, because they belong to storage
 * configuration rather than to what is captured: `recordingFormat`,
 * `recordingPath`, `loggingPath`, `*UseCustomStorageEnabled`, and
 * `pcapS3PathPrefix`. SiteMint configures no S3/GCP credential, so there is
 * no custom storage for them to select.
 *
 * `loggingEnabled` is also not emitted, and that is a deliberate, reported
 * choice rather than an oversight — see the AR-001G report. Vapi's call log
 * is operational metadata about the call, not its audio or transcript, and
 * with no server URL configured for staging it is the only trace an operator
 * can inspect if the browser test misbehaves. It is left at the provider
 * default under every policy so the three policies differ only in captured
 * call content.
 */
export function buildVapiArtifactPlan(policy: VoiceArtifactPolicy): JsonObject {
  switch (policy) {
    case "none":
      return {
        recordingEnabled: false,
        videoRecordingEnabled: false,
        pcapEnabled: false,
        transcriptPlan: { enabled: false },
      };
    case "transcript_only":
      return {
        recordingEnabled: false,
        videoRecordingEnabled: false,
        pcapEnabled: false,
        transcriptPlan: { enabled: true },
      };
    case "full":
      return {
        recordingEnabled: true,
        videoRecordingEnabled: false,
        pcapEnabled: false,
        transcriptPlan: { enabled: true },
      };
  }
}
