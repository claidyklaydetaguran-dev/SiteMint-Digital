// AR-001V: authenticated, firm-scoped synchronization of an ALREADY-PUBLISHED
// assistant with its existing provider resource.
//
// This is the update half of the lifecycle that Checkpoint E3B2 deliberately
// left out. It never creates a provider assistant: `createAssistant` is not
// imported, not referenced, and unreachable from here, so a published row can
// only ever be PATCHed onto the resource it is already linked to. Conversely
// publishAssistant() still owns draft/error rows and is untouched.
//
// Structure mirrors publishService.ts on purpose — same explicit dependency
// injection, same "never read configuration at module import time" rule, same
// atomic-claim-then-act state machine — so the two lifecycles fail in the same
// shapes and can be reviewed against each other.

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import type { Clock, JsonObject, VoiceAssistantInput } from "../voice/types.js";
import { systemClock } from "../voice/types.js";
import { VoiceProviderError, type VoiceProviderErrorCode } from "../voice/errors.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import { validateVapiAssistantName } from "../voice/providers/vapi/types.js";
import {
  loadVoiceArtifactPolicyFromEnv,
  type VoiceArtifactPolicy,
} from "../voice/providers/vapi/artifactPolicy.js";
import {
  voiceAssistantRepository,
  STALE_PROVIDER_SYNC_THRESHOLD_MS,
  type ClaimForProviderSyncResult,
} from "../voiceAssistants/repository.js";
import { isVoiceSyncEnabled } from "./featureFlags.js";
import { loadVoiceServerConfigFromEnv, type VoiceServerConfig } from "./serverConfig.js";
import { loadVoiceToolsConfigFromEnv } from "./toolsConfig.js";
import { loadVoiceCallPolicyFromEnv, type VoiceCallPolicy } from "./callPolicyConfig.js";
import { loadRuntimeCatalogFromEnv, getRuntimeCatalogPreset } from "./runtimeCatalog.js";
import { extractPublishableAssistantConfig } from "./persistedConfigMapper.js";
import { PublishFoundationError } from "./errors.js";
import { computeProviderPayloadHash } from "./providerPayloadHash.js";
import type { RuntimeCatalog, PublishFirstMessageMode } from "./types.js";
import { createProductionVoiceProvider } from "./providerFactory.js";
import {
  buildSyncRouteError,
  type ProviderSyncErrorCode,
  type SyncRouteError,
  type SyncRouteErrorCode,
} from "./syncErrors.js";

/** Route codes that are also persistable sync-error codes. */
type PersistableSyncFailureCode = Extract<SyncRouteErrorCode, ProviderSyncErrorCode>;

/** Provider-neutral literal, identical to the one the repository claim predicate uses. */
const VAPI_PROVIDER_NAME = "vapi";

/**
 * The minimal safe success shape. Deliberately carries no provider assistant
 * id, no provider response, no config and no digest input — only the facts an
 * authenticated owner needs to render honest state.
 */
export interface SynchronizedAssistantDto {
  id: number;
  status: string;
  /** True only because the provider accepted this exact payload, or already had it. */
  providerConfigSynchronized: true;
  /** False when the payload already matched and no provider request was made. */
  providerRequestSent: boolean;
  lastSyncedAt: string | null;
}

export type SyncServiceResult =
  | { ok: true; assistant: SynchronizedAssistantDto }
  | { ok: false; error: SyncRouteError };

export interface SyncRepositoryDependency {
  claimForProviderSync: typeof voiceAssistantRepository.claimForProviderSync;
  finalizeProviderSynced: typeof voiceAssistantRepository.finalizeProviderSynced;
  recordProviderSyncError: typeof voiceAssistantRepository.recordProviderSyncError;
  releaseProviderSyncClaim: typeof voiceAssistantRepository.releaseProviderSyncClaim;
  markStaleProviderSyncFailed: typeof voiceAssistantRepository.markStaleProviderSyncFailed;
  getPublishState: typeof voiceAssistantRepository.getPublishState;
}

export interface SyncServiceDependencies {
  /**
   * AR-001V.1: the backend switch for synchronization ONLY —
   * `VOICE_SYNC_ENABLED`, never the publish flag. Enabling publishing grants
   * no synchronization and enabling synchronization grants no publish, and
   * this is the line that makes that true on the server, where it is
   * authoritative regardless of what any client believes.
   */
  isEnabled: () => boolean;
  loadCatalog: () => RuntimeCatalog;
  loadArtifactPolicy: () => VoiceArtifactPolicy;
  /** P2: optional server-URL attachment loader; null (feature off) sends no `server` object. Defaults to the env loader when omitted. */
  loadServerConfig?: () => VoiceServerConfig | null;
  /** P3: optional tools attachment loader; null (feature off) sends no `tools`. Defaults to the env loader when omitted. */
  loadToolsConfig?: (serverConfig: VoiceServerConfig | null) => JsonObject[] | null;
  /** P6: optional call-behavior policy; null (default) sends nothing. */
  loadCallPolicy?: () => VoiceCallPolicy | null;
  createProvider: () => VoiceProvider;
  repository: SyncRepositoryDependency;
  clock: Clock;
  /** Optional safe event sink. Never receives prompts, credentials, payloads, provider ids, or caller data. */
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

/** Function references only — nothing here reads an env var or opens a connection at import time. */
export const defaultSyncServiceDependencies: SyncServiceDependencies = {
  isEnabled: isVoiceSyncEnabled,
  loadCatalog: loadRuntimeCatalogFromEnv,
  loadArtifactPolicy: loadVoiceArtifactPolicyFromEnv,
  loadServerConfig: loadVoiceServerConfigFromEnv,
  loadToolsConfig: loadVoiceToolsConfigFromEnv,
  loadCallPolicy: loadVoiceCallPolicyFromEnv,
  createProvider: createProductionVoiceProvider,
  repository: voiceAssistantRepository,
  clock: systemClock,
};

/**
 * A provider outcome we cannot prove either way. The remote resource may or
 * may not now hold the new payload, so the confirmed digest must not move.
 */
const UNCERTAIN_PROVIDER_CODES: ReadonlySet<VoiceProviderErrorCode> = new Set([
  "TIMEOUT",
  "NETWORK_ERROR",
  "PROVIDER_ERROR",
]);

const UNCERTAIN_SYNC_ERROR_BY_PROVIDER_CODE: Partial<Record<VoiceProviderErrorCode, PersistableSyncFailureCode>> = {
  TIMEOUT: "provider_timeout",
  NETWORK_ERROR: "provider_network_error",
  PROVIDER_ERROR: "provider_result_uncertain",
};

const DEFINITIVE_SYNC_ERROR_BY_PROVIDER_CODE: Partial<Record<VoiceProviderErrorCode, PersistableSyncFailureCode>> = {
  AUTHENTICATION_FAILED: "provider_authentication_failed",
  RATE_LIMITED: "provider_rate_limited",
  VALIDATION_FAILED: "provider_request_rejected",
  NOT_FOUND: "provider_request_rejected",
  CONFLICT: "provider_request_rejected",
  UNSUPPORTED_OPERATION: "provider_request_rejected",
};

function mapFirstMessageMode(mode: PublishFirstMessageMode): "assistant-speaks-first" | "assistant-waits-for-user" {
  return mode === "wait-for-caller" ? "assistant-waits-for-user" : "assistant-speaks-first";
}

function failure(code: SyncRouteErrorCode): SyncServiceResult {
  return { ok: false, error: buildSyncRouteError(code) };
}

function success(row: VoiceAssistant, providerRequestSent: boolean): SyncServiceResult {
  return {
    ok: true,
    assistant: {
      id: row.id,
      status: row.status,
      providerConfigSynchronized: true,
      providerRequestSent,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    },
  };
}

/**
 * Builds the provider-neutral input from the CLAIMED row only — never the
 * request body, never a pre-claim snapshot, never a browser-supplied value.
 * Identical construction to publishService.buildProviderInput, so the digest
 * of a create and the digest of an equivalent update agree by construction.
 */
export function buildSyncProviderInput(
  assistant: VoiceAssistant,
  catalog: RuntimeCatalog,
  serverConfig: VoiceServerConfig | null = null,
  toolsConfig: JsonObject[] | null = null,
  callPolicy: VoiceCallPolicy | null = null,
): VoiceAssistantInput {
  const extracted = extractPublishableAssistantConfig(assistant.config, catalog);
  const preset = getRuntimeCatalogPreset(catalog, extracted.presetKey);
  if (!preset) {
    throw new PublishFoundationError(
      "UNSUPPORTED_PRESET",
      "Selected voice preset is not present in the server runtime catalog.",
    );
  }

  const name = validateVapiAssistantName(assistant.name);

  return {
    name,
    config: {
      model: { provider: preset.model.provider, model: preset.model.model },
      voice: {
        provider: preset.voice.provider,
        voiceId: preset.voice.voiceId,
        ...(preset.voice.version !== undefined ? { version: preset.voice.version } : {}),
      },
      transcriber: {
        provider: preset.transcriber.provider,
        ...(preset.transcriber.model !== undefined ? { model: preset.transcriber.model } : {}),
        ...(preset.transcriber.language !== undefined ? { language: preset.transcriber.language } : {}),
      },
      firstMessageMode: mapFirstMessageMode(extracted.firstMessageMode),
      ...(extracted.firstMessage !== undefined ? { firstMessage: extracted.firstMessage } : {}),
      systemInstructions: extracted.systemInstructions,
      ...(serverConfig !== null ? { server: { url: serverConfig.url, credentialId: serverConfig.credentialId } } : {}),
      ...(toolsConfig !== null ? { tools: toolsConfig } : {}),
      ...(callPolicy !== null ? { callPolicy: callPolicy as unknown as JsonObject } : {}),
    },
  };
}

/**
 * Explains a failed claim using only a firm-scoped lookup, so a cross-tenant
 * id is indistinguishable from a nonexistent one. Makes no provider call
 * under any branch.
 */
async function classifyClaimConflict(
  deps: SyncServiceDependencies,
  firmId: number,
  assistantId: number,
): Promise<SyncServiceResult> {
  const row = await deps.repository.getPublishState(firmId, assistantId);
  if (!row) {
    return failure("assistant_not_found");
  }

  if (row.providerSyncAttemptId !== null) {
    const startedAt = row.providerSyncStartedAt;
    const isStale =
      startedAt !== null && deps.clock.now().getTime() - startedAt.getTime() >= STALE_PROVIDER_SYNC_THRESHOLD_MS;
    if (isStale) {
      try {
        await deps.repository.markStaleProviderSyncFailed(firmId, assistantId, {
          olderThanMs: STALE_PROVIDER_SYNC_THRESHOLD_MS,
          providerSyncAttemptId: row.providerSyncAttemptId,
        });
      } catch {
        // Best-effort sweep. Either way no provider call is made here and the
        // caller is never told to retry automatically.
      }
    }
    return failure("sync_in_progress");
  }

  if (row.status !== "published") {
    return failure("assistant_not_published");
  }
  if (row.provider === null || row.provider.trim().length === 0) {
    return failure("provider_link_missing");
  }
  if (row.provider !== VAPI_PROVIDER_NAME) {
    return failure("unsupported_provider");
  }
  if (row.providerAssistantId === null || row.providerAssistantId.trim().length === 0) {
    return failure("provider_link_missing");
  }
  if (row.publishAttemptId !== null) {
    return failure("sync_in_progress");
  }

  // Eligible on paper but the atomic claim still missed — another concurrent
  // transition raced this request between the failed claim and this lookup.
  return failure("sync_in_progress");
}

async function recordErrorAndFail(
  deps: SyncServiceDependencies,
  firmId: number,
  assistantId: number,
  providerSyncAttemptId: string,
  code: PersistableSyncFailureCode,
): Promise<SyncServiceResult> {
  let row: VoiceAssistant | null = null;
  try {
    row = await deps.repository.recordProviderSyncError(firmId, assistantId, providerSyncAttemptId, code);
  } catch {
    row = null;
  }
  if (!row) {
    deps.logger?.("provider_sync_transition_persistence_failed", { firmId, assistantId });
    return failure("internal_error");
  }
  return failure(code);
}

async function handleProviderUpdateFailure(
  deps: SyncServiceDependencies,
  firmId: number,
  assistantId: number,
  providerSyncAttemptId: string,
  err: unknown,
): Promise<SyncServiceResult> {
  if (!(err instanceof VoiceProviderError)) {
    return recordErrorAndFail(deps, firmId, assistantId, providerSyncAttemptId, "provider_result_uncertain");
  }
  if (UNCERTAIN_PROVIDER_CODES.has(err.code)) {
    const code = UNCERTAIN_SYNC_ERROR_BY_PROVIDER_CODE[err.code] ?? "provider_result_uncertain";
    return recordErrorAndFail(deps, firmId, assistantId, providerSyncAttemptId, code);
  }
  const code = DEFINITIVE_SYNC_ERROR_BY_PROVIDER_CODE[err.code] ?? "unknown_sync_error";
  return recordErrorAndFail(deps, firmId, assistantId, providerSyncAttemptId, code);
}

/**
 * Synchronizes exactly one firm-scoped, already-published assistant with its
 * existing provider resource. `firmId` must come only from the authenticated
 * server session; this function never reads it from anywhere else, and
 * `providerAssistantId` is read only from the claimed row, never from the
 * caller. Safe to call concurrently for the same assistant: at most one caller
 * wins the atomic claim, and only the winner can reach
 * `provider.updateAssistant`.
 */
export async function synchronizePublishedAssistant(
  firmId: number,
  assistantId: number,
  deps: SyncServiceDependencies = defaultSyncServiceDependencies,
): Promise<SyncServiceResult> {
  // STEP 1 — feature and server configuration. No claim, no provider request
  // and no database write happens before all of this succeeds.
  if (!deps.isEnabled()) {
    return failure("sync_disabled");
  }

  let catalog: RuntimeCatalog;
  try {
    catalog = deps.loadCatalog();
  } catch {
    return failure("sync_disabled");
  }

  let artifactPolicy: VoiceArtifactPolicy;
  try {
    artifactPolicy = deps.loadArtifactPolicy();
  } catch {
    return failure("sync_disabled");
  }

  // P2: server-URL attachment, validated pre-claim like catalog and policy.
  let serverConfig: VoiceServerConfig | null;
  try {
    serverConfig = (deps.loadServerConfig ?? loadVoiceServerConfigFromEnv)();
  } catch {
    return failure("sync_disabled");
  }

  // P3: tools attachment, validated pre-claim; requires the server config.
  let toolsConfig: JsonObject[] | null;
  try {
    toolsConfig = (deps.loadToolsConfig ?? loadVoiceToolsConfigFromEnv)(serverConfig);
  } catch {
    return failure("sync_disabled");
  }

  let callPolicy: VoiceCallPolicy | null;
  try {
    callPolicy = (deps.loadCallPolicy ?? loadVoiceCallPolicyFromEnv)();
  } catch {
    return failure("sync_disabled");
  }

  let provider: VoiceProvider;
  try {
    provider = deps.createProvider();
  } catch {
    return failure("sync_disabled");
  }

  // STEP 2 — atomic claim. The claim predicate is the whole eligibility test:
  // published + vapi + nonblank provider id + no attempt in flight.
  const claim: ClaimForProviderSyncResult | null = await deps.repository.claimForProviderSync(firmId, assistantId);
  if (!claim) {
    return classifyClaimConflict(deps, firmId, assistantId);
  }
  const { assistant, providerSyncAttemptId } = claim;

  // STEP 3 — build the payload from the claimed row and digest it.
  let providerInput: VoiceAssistantInput;
  try {
    providerInput = buildSyncProviderInput(assistant, catalog, serverConfig, toolsConfig, callPolicy);
  } catch (err) {
    const code: PersistableSyncFailureCode =
      err instanceof PublishFoundationError && err.code === "UNSUPPORTED_PRESET"
        ? "unsupported_preset"
        : "assistant_config_invalid";
    return recordErrorAndFail(deps, firmId, assistantId, providerSyncAttemptId, code);
  }

  const nextHash = computeProviderPayloadHash(providerInput, artifactPolicy);

  // STEP 4 — idempotence. If the provider already accepted exactly this
  // payload, there is nothing to send: release the claim and report success
  // without a provider request. This is what makes a double submission cost
  // at most one provider write.
  if (assistant.providerConfigHash === nextHash) {
    let released: VoiceAssistant | null = null;
    try {
      released = await deps.repository.releaseProviderSyncClaim(firmId, assistantId, providerSyncAttemptId);
    } catch {
      released = null;
    }
    if (!released) {
      deps.logger?.("provider_sync_release_failed", { firmId, assistantId });
      return failure("internal_error");
    }
    return success(released, false);
  }

  // STEP 5 — exactly one provider update for this claimed attempt. The
  // provider assistant id comes from the claimed row and nowhere else.
  const providerAssistantId = assistant.providerAssistantId as string;
  try {
    await provider.updateAssistant(providerAssistantId, providerInput);
  } catch (err) {
    return handleProviderUpdateFailure(deps, firmId, assistantId, providerSyncAttemptId, err);
  }

  // STEP 6 — stamp the confirmed digest atomically with clearing the claim.
  let finalized: VoiceAssistant | null = null;
  try {
    finalized = await deps.repository.finalizeProviderSynced(firmId, assistantId, providerSyncAttemptId, nextHash);
  } catch {
    finalized = null;
  }

  if (finalized) {
    return success(finalized, true);
  }

  // STEP 7 — provider accepted but local finalization failed. Never call the
  // provider again. The digest is deliberately not stamped, so the row keeps
  // reading as unsynchronized: claiming agreement we could not record would be
  // the one dishonest outcome available here.
  deps.logger?.("provider_sync_finalize_failed", { firmId, assistantId });
  return recordErrorAndFail(deps, firmId, assistantId, providerSyncAttemptId, "local_finalize_failed");
}
