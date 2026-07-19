// Milestone 1 / Checkpoint E3B2: authenticated server-side publish
// orchestration. Connects a firm-scoped claimed assistant row, the
// server-owned runtime catalog, and the Vapi provider adapter through the
// E3B1 atomic publish state machine. Explicit dependency injection is
// supported throughout for mocked verification; production dependencies
// (feature flag, runtime catalog, provider construction) are only ever read
// or constructed lazily, at the point publishAssistant() is actually
// invoked — never at module import time, never automatically, and never
// with a silent fallback.

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import type { Clock, JsonObject, VoiceAssistantInput } from "../voice/types.js";
import { systemClock } from "../voice/types.js";
import { VoiceProviderError, type VoiceProviderErrorCode } from "../voice/errors.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import { validateVapiAssistantName } from "../voice/providers/vapi/types.js";
import {
  voiceAssistantRepository,
  STALE_PUBLISHING_THRESHOLD_MS,
  type ClaimForPublishResult,
} from "../voiceAssistants/repository.js";
import { isVoicePublishEnabled } from "./featureFlags.js";
import { loadRuntimeCatalogFromEnv, getRuntimeCatalogPreset } from "./runtimeCatalog.js";
import { extractPublishableAssistantConfig } from "./persistedConfigMapper.js";
import { PublishFoundationError } from "./errors.js";
import type { ExtractedAssistantPublishConfig, PublishFirstMessageMode, RuntimeCatalog } from "./types.js";
import { createProductionVoiceProvider } from "./providerFactory.js";
import { buildPublishRouteError, type PublishRouteError, type PublishRouteErrorCode } from "./publishHttpErrors.js";
import type { PublishSyncErrorCode } from "./types.js";

/** Route error codes that are also valid database sync-error codes — the only codes this service ever persists via recordPublishError/recordPublishUncertain. */
type PersistableFailureCode = Extract<PublishRouteErrorCode, PublishSyncErrorCode>;

export interface PublishedAssistantDto {
  id: number;
  status: string;
  provider: string;
  providerAssistantId: string;
  lastSyncedAt: string;
}

export type PublishServiceResult =
  | { ok: true; assistant: PublishedAssistantDto }
  | { ok: false; error: PublishRouteError };

/** Repository surface the publish service depends on — a subset of voiceAssistantRepository, explicit for verification. */
export interface PublishRepositoryDependency {
  claimForPublish: typeof voiceAssistantRepository.claimForPublish;
  finalizePublished: typeof voiceAssistantRepository.finalizePublished;
  recordPublishError: typeof voiceAssistantRepository.recordPublishError;
  recordPublishUncertain: typeof voiceAssistantRepository.recordPublishUncertain;
  markStalePublishingUncertain: typeof voiceAssistantRepository.markStalePublishingUncertain;
  getPublishState: typeof voiceAssistantRepository.getPublishState;
}

export interface PublishServiceDependencies {
  /** Explicit backend feature-flag check. Never read at module import time. */
  isEnabled: () => boolean;
  /** Explicit runtime-catalog load + validation. Never read at module import time. */
  loadCatalog: () => RuntimeCatalog;
  /** Explicit, lazy production-provider construction. No network request occurs during construction. */
  createProvider: () => VoiceProvider;
  repository: PublishRepositoryDependency;
  clock: Clock;
  /** Optional safe event sink. Never receives prompts, credentials, catalog JSON, or provider bodies. */
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

/**
 * Default production dependencies. Safe to reference at module load time:
 * every field here is a function reference, not an invocation — none of them
 * read an environment variable, open a database connection, or construct a
 * provider until the publish workflow explicitly calls them.
 */
export const defaultPublishServiceDependencies: PublishServiceDependencies = {
  isEnabled: isVoicePublishEnabled,
  loadCatalog: loadRuntimeCatalogFromEnv,
  createProvider: createProductionVoiceProvider,
  repository: voiceAssistantRepository,
  clock: systemClock,
};

const UNCERTAIN_PROVIDER_CODES: ReadonlySet<VoiceProviderErrorCode> = new Set([
  "TIMEOUT",
  "NETWORK_ERROR",
  "PROVIDER_ERROR",
]);

const UNCERTAIN_SYNC_ERROR_BY_PROVIDER_CODE: Partial<Record<VoiceProviderErrorCode, PersistableFailureCode>> = {
  TIMEOUT: "provider_timeout",
  NETWORK_ERROR: "provider_network_error",
  PROVIDER_ERROR: "provider_result_uncertain",
};

const DEFINITIVE_SYNC_ERROR_BY_PROVIDER_CODE: Partial<Record<VoiceProviderErrorCode, PersistableFailureCode>> = {
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

function failure(code: PublishRouteErrorCode): PublishServiceResult {
  return { ok: false, error: buildPublishRouteError(code) };
}

function success(row: VoiceAssistant): PublishServiceResult {
  return {
    ok: true,
    assistant: {
      id: row.id,
      status: row.status,
      provider: row.provider as string,
      providerAssistantId: row.providerAssistantId as string,
      lastSyncedAt: (row.lastSyncedAt as Date).toISOString(),
    },
  };
}

/**
 * Records a definitive, safely-retryable publish failure for the active
 * attempt and returns the corresponding route error. If the transition
 * itself cannot be confirmed (persistence throws or matches zero rows), no
 * further provider or database action is taken — the caller receives a
 * generic non-retryable internal-state failure instead, and stale-attempt
 * recovery is left as the only later automatic state action.
 */
async function recordDefinitiveErrorAndFail(
  deps: PublishServiceDependencies,
  firmId: number,
  assistantId: number,
  publishAttemptId: string,
  code: PersistableFailureCode,
): Promise<PublishServiceResult> {
  let row: VoiceAssistant | null = null;
  try {
    row = await deps.repository.recordPublishError(firmId, assistantId, publishAttemptId, code);
  } catch {
    row = null;
  }
  if (!row) {
    deps.logger?.("publish_transition_persistence_failed", { firmId, assistantId, transition: "error" });
    return failure("internal_error");
  }
  return failure(code);
}

/** Same contract as recordDefinitiveErrorAndFail, but for the publish_uncertain transition. */
async function recordUncertainAndFail(
  deps: PublishServiceDependencies,
  firmId: number,
  assistantId: number,
  publishAttemptId: string,
  code: PersistableFailureCode,
  providerIdentity?: { provider: string; providerAssistantId: string },
): Promise<PublishServiceResult> {
  let row: VoiceAssistant | null = null;
  try {
    row = await deps.repository.recordPublishUncertain(firmId, assistantId, publishAttemptId, code, providerIdentity);
  } catch {
    row = null;
  }
  if (!row) {
    deps.logger?.("publish_transition_persistence_failed", { firmId, assistantId, transition: "publish_uncertain" });
    return failure("internal_error");
  }
  return failure(code);
}

async function handleProviderCreateFailure(
  deps: PublishServiceDependencies,
  firmId: number,
  assistantId: number,
  publishAttemptId: string,
  err: unknown,
): Promise<PublishServiceResult> {
  if (!(err instanceof VoiceProviderError)) {
    // An unexpected, non-normalized throw from the provider layer is treated
    // conservatively as uncertain: we do not know whether the provider
    // created an assistant.
    return recordUncertainAndFail(deps, firmId, assistantId, publishAttemptId, "provider_result_uncertain");
  }

  if (UNCERTAIN_PROVIDER_CODES.has(err.code)) {
    const code = UNCERTAIN_SYNC_ERROR_BY_PROVIDER_CODE[err.code] ?? "provider_result_uncertain";
    return recordUncertainAndFail(deps, firmId, assistantId, publishAttemptId, code);
  }

  const code = DEFINITIVE_SYNC_ERROR_BY_PROVIDER_CODE[err.code] ?? "unknown_publish_error";
  return recordDefinitiveErrorAndFail(deps, firmId, assistantId, publishAttemptId, code);
}

/**
 * Classifies why claimForPublish returned no row, using only a firm-scoped
 * publish-state lookup — never a global assistant-ID lookup, so a
 * cross-tenant assistant ID produces the same "not found" outcome as a
 * genuinely nonexistent one. Makes no provider call under any branch.
 */
async function classifyClaimConflict(
  deps: PublishServiceDependencies,
  firmId: number,
  assistantId: number,
): Promise<PublishServiceResult> {
  const row = await deps.repository.getPublishState(firmId, assistantId);
  if (!row) {
    return failure("assistant_not_found");
  }

  if (row.status === "published") {
    return failure("already_published");
  }
  if (row.status === "publish_uncertain") {
    return failure("publish_uncertain");
  }

  if (row.status === "publishing") {
    const startedAt = row.publishStartedAt;
    const isStale =
      startedAt !== null && deps.clock.now().getTime() - startedAt.getTime() >= STALE_PUBLISHING_THRESHOLD_MS;

    if (isStale) {
      try {
        await deps.repository.markStalePublishingUncertain(firmId, assistantId, {
          olderThanMs: STALE_PUBLISHING_THRESHOLD_MS,
          ...(row.publishAttemptId !== null ? { publishAttemptId: row.publishAttemptId } : {}),
        });
      } catch {
        // Best-effort sweep only; the row either transitions now or is left
        // for a later sweep. Either way no provider call is made and the
        // caller still receives publish_uncertain, never a reset to draft.
      }
      return failure("publish_uncertain");
    }

    return failure("publish_in_progress");
  }

  // status is 'draft' or 'error' but the atomic claim still failed to match
  // — another concurrent transition raced this request between the failed
  // claim and this lookup.
  return failure("publish_state_conflict");
}

/**
 * Builds the provider-neutral input for the active claimed attempt using
 * only: the claimed row's name/config (never the pre-claim snapshot, the
 * request body, or any browser-supplied Advanced/runtime value), and the
 * matching server runtime-catalog preset. Throws PublishFoundationError or
 * VoiceProviderError on invalid claimed data — the caller records a
 * definitive error and never calls the provider.
 */
function buildProviderInput(
  assistant: VoiceAssistant,
  catalog: RuntimeCatalog,
): { input: VoiceAssistantInput; extracted: ExtractedAssistantPublishConfig } {
  const extracted = extractPublishableAssistantConfig(assistant.config, catalog);
  const preset = getRuntimeCatalogPreset(catalog, extracted.presetKey);
  if (!preset) {
    throw new PublishFoundationError("UNSUPPORTED_PRESET", "Selected voice preset is not present in the server runtime catalog.");
  }

  const name = validateVapiAssistantName(assistant.name);

  const config: JsonObject = {
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
  };

  return { input: { name, config }, extracted };
}

/**
 * Publishes exactly one firm-scoped assistant. firmId must come only from
 * the authenticated server session (the route enforces this — this function
 * never reads it from anywhere else). Safe to call concurrently for the
 * same assistant: at most one caller wins the atomic claim, and only the
 * winner ever reaches provider.createAssistant.
 */
export async function publishAssistant(
  firmId: number,
  assistantId: number,
  deps: PublishServiceDependencies = defaultPublishServiceDependencies,
): Promise<PublishServiceResult> {
  // STEP 1 — feature and server configuration. No claim, no provider network
  // request, and no database write occurs before this step succeeds in full.
  if (!deps.isEnabled()) {
    return failure("publish_disabled");
  }

  let catalog: RuntimeCatalog;
  try {
    catalog = deps.loadCatalog();
  } catch {
    return failure("publish_disabled");
  }

  let provider: VoiceProvider;
  try {
    provider = deps.createProvider();
  } catch {
    return failure("publish_disabled");
  }

  // STEP 2 — atomic claim. Only the winner proceeds past this point.
  const claim: ClaimForPublishResult | null = await deps.repository.claimForPublish(firmId, assistantId);
  if (!claim) {
    return classifyClaimConflict(deps, firmId, assistantId);
  }
  const { assistant, publishAttemptId } = claim;

  // STEP 3/4 — claimed row as source of truth; build provider input.
  let providerInput: VoiceAssistantInput;
  try {
    ({ input: providerInput } = buildProviderInput(assistant, catalog));
  } catch (err) {
    const code: PersistableFailureCode =
      err instanceof PublishFoundationError && err.code === "UNSUPPORTED_PRESET" ? "unsupported_preset" : "assistant_config_invalid";
    return recordDefinitiveErrorAndFail(deps, firmId, assistantId, publishAttemptId, code);
  }

  // STEP 5 — exactly one provider create call for this claimed attempt.
  let providerResult;
  try {
    providerResult = await provider.createAssistant(providerInput);
  } catch (err) {
    return handleProviderCreateFailure(deps, firmId, assistantId, publishAttemptId, err);
  }

  // STEP 6 — successful finalization.
  let finalized: VoiceAssistant | null = null;
  try {
    finalized = await deps.repository.finalizePublished(
      firmId,
      assistantId,
      publishAttemptId,
      providerResult.provider,
      providerResult.providerAssistantId,
    );
  } catch {
    finalized = null;
  }

  if (finalized) {
    return success(finalized);
  }

  // STEP 7 — local finalization failure after provider success. Never call
  // provider.createAssistant again; preserve the known provider identity.
  let uncertainRow: VoiceAssistant | null = null;
  try {
    uncertainRow = await deps.repository.recordPublishUncertain(
      firmId,
      assistantId,
      publishAttemptId,
      "local_finalize_failed",
      { provider: providerResult.provider, providerAssistantId: providerResult.providerAssistantId },
    );
  } catch {
    uncertainRow = null;
  }

  if (uncertainRow) {
    return failure("local_finalize_failed");
  }

  // Double failure: provider succeeded, finalize failed, and recording
  // uncertainty also failed. No further provider request is made; the row
  // may remain 'publishing' and is left for the stale-attempt sweep.
  deps.logger?.("publish_double_persistence_failure", { firmId, assistantId });
  return failure("internal_error");
}
