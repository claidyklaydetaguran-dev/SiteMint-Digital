// Milestone 1 / Checkpoint D: provider-neutral types for the voice-provider
// boundary. Nothing here references a specific vendor (Vapi, ElevenLabs,
// OpenAI, Twilio, ...). Future real providers implement VoiceProvider using
// only these shapes.

/** A JSON-serializable value. No functions, symbols, bigint, undefined, Date,
 * Map, Set, class instances, or circular references. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON-serializable plain object (the root shape used for config/metadata). */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Normalized provider key, e.g. "fake". Real provider keys (e.g. a future
 * "vapi") are defined by whichever checkpoint introduces that provider —
 * this module does not enumerate or default to one.
 */
export type VoiceProviderKey = string;

/** Provider-neutral input for creating or updating a provider assistant. */
/**
 * AR-001V.3: request for a browser-call credential scoped to ONE assistant.
 * `allowedOrigins` is defence in depth only — an Origin header is trivially
 * set by any non-browser client, so it is never treated as authentication.
 * The assistant restriction is the control that actually holds.
 */
export interface VoiceBrowserTokenInput {
  providerAssistantId: string;
  allowedOrigins: string[];
  /** Operator-facing label at the provider. Never tenant-supplied free text. */
  name: string;
}

/** The provider's browser credential. `tokenValue` is a secret. */
export interface VoiceBrowserTokenResult {
  tokenId: string;
  tokenValue: string;
}

export interface VoiceAssistantInput {
  /** Non-empty display name for the assistant. */
  name: string;
  /** Provider-neutral, JSON-serializable assistant configuration. */
  config: JsonObject;
  /** Optional provider-neutral, JSON-serializable metadata. */
  metadata?: JsonObject;
  /** Optional SiteMint-controlled reference (e.g. an internal record key). */
  externalReference?: string;
}

/**
 * Normalized result of a provider assistant operation.
 *
 * Date convention: createdAt/updatedAt are native Date objects (internal,
 * repository-standard for Drizzle timestamp columns elsewhere in this repo).
 * Callers that need wire-format JSON serialize these at the boundary.
 *
 * This result is NOT persisted by SiteMint — it merely represents what the
 * provider (or the fake provider) reports at call time.
 */
export interface VoiceAssistantResult {
  provider: VoiceProviderKey;
  /** Opaque identifier assigned by the provider. Never parse or infer structure from it. */
  providerAssistantId: string;
  name: string;
  config: JsonObject;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal normalized result of a delete operation. */
export interface VoiceAssistantDeleteResult {
  providerAssistantId: string;
  deleted: true;
}

/**
 * One telephone number as the provider organisation holds it.
 *
 * Provider-neutral on purpose: no vendor field names reach a caller. It is a
 * READ of the organisation's stock, and it is what settles questions an empty
 * per-business list cannot — whether a number exists at all, who owns it, and
 * whether the provider already routes it somewhere.
 *
 * `assignedAssistantId` is the provider's own routing answer, not ours. When it
 * is set, that number already sends calls to an assistant at the provider, and
 * assigning it to a business here would be taking over live routing.
 */
export interface VoicePhoneNumberRecord {
  providerNumberId: string;
  /** E.164 as the provider reports it; never reformatted here. */
  e164: string;
  /** How it reached the provider, in the provider's own words (e.g. "twilio", "vapi"). */
  origin: string | null;
  /** Provider lifecycle word (e.g. "active"). Passed through, never interpreted as health. */
  status: string | null;
  /** The provider organisation that owns it. */
  orgId: string | null;
  /** Non-null when the provider already routes this number to an assistant. */
  assignedAssistantId: string | null;
}

/** Injectable clock, used so tests can produce deterministic timestamps. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
