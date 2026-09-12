// AR-001V: the single place that decides what an assistant's provider
// synchronization state actually is.
//
// The rule that matters is the negative one: "synchronized" is returned ONLY
// when a stored digest exists AND it equals the digest of the payload the
// server would send right now. Every other situation — no stored digest, a
// different digest, an unreadable catalog or policy, a row that was never
// published — resolves to something the UI must not render as
// "Published · Saved".
//
// This is deliberately failure-tolerant. It is called on ordinary list and
// detail reads, so a missing runtime catalog or artifact policy must degrade
// to "unknown" rather than throw and break the assistants page. "unknown" is
// safe precisely because it is not "synchronized".

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import { systemClock, type Clock } from "../voice/types.js";
import { loadVoiceArtifactPolicyFromEnv } from "../voice/providers/vapi/artifactPolicy.js";
import { loadRuntimeCatalogFromEnv } from "../voicePublishing/runtimeCatalog.js";
import { loadVoiceServerConfigFromEnv } from "../voicePublishing/serverConfig.js";
import { loadVoiceToolsConfigFromEnv } from "../voicePublishing/toolsConfig.js";
import { loadVoiceCallPolicyFromEnv } from "../voicePublishing/callPolicyConfig.js";
import type { VoiceToolName } from "../voice/tools/toolCatalog.js";
import { computeProviderPayloadHash } from "../voicePublishing/providerPayloadHash.js";
import { buildSyncProviderInput } from "../voicePublishing/syncService.js";
import { STALE_PROVIDER_SYNC_THRESHOLD_MS } from "./repository.js";

export const PROVIDER_SYNC_STATES = [
  /** Not published, so there is no provider resource to agree or disagree with. */
  "not_published",
  /** A provider update is in flight right now, and is younger than the stale threshold. */
  "synchronizing",
  /**
   * A claim exists but is older than the stale threshold, so the process that
   * held it is gone. Recovery stays passive — the next explicit attempt
   * reclaims it — but the UI must stop saying "updating" forever.
   */
  "interrupted",
  /** The provider accepted exactly the payload we would send now. */
  "synchronized",
  /** Provider-relevant local configuration differs from what was last confirmed. */
  "local_changes",
  /** The last synchronization attempt failed or could not be confirmed. */
  "sync_failed",
  /** State could not be determined (catalog/policy unreadable, config unpublishable). */
  "unknown",
] as const;

export type ProviderSyncState = (typeof PROVIDER_SYNC_STATES)[number];

export interface ProviderSyncStateDependencies {
  loadCatalog: typeof loadRuntimeCatalogFromEnv;
  loadArtifactPolicy: typeof loadVoiceArtifactPolicyFromEnv;
  /**
   * V7: the SAME three attachments the sync path puts into the payload it
   * digests. They are dependencies of this module, not of sync alone, because
   * "what we would send right now" is only meaningful if both places mean the
   * same payload — see the note on buildComparisonInput below.
   */
  loadServerConfig: typeof loadVoiceServerConfigFromEnv;
  loadToolsConfig: typeof loadVoiceToolsConfigFromEnv;
  loadCallPolicy: typeof loadVoiceCallPolicyFromEnv;
  /**
   * V8: the business's effective tool names, resolved ONCE per request by the
   * caller and passed in.
   *
   * It is an argument rather than a lookup because this function runs per row
   * on list reads — a database round trip per assistant would be wasteful — and
   * because the publish path builds its payload from exactly this list. Passing
   * it keeps the two in step by construction; deriving it independently here is
   * how they drifted apart before.
   *
   * `undefined` means "not narrowed", which is what the env-contract probe and
   * pure unit tests want.
   */
  firmToolNames?: readonly VoiceToolName[] | undefined;
  /** Injected so stale-versus-fresh is deterministic under test, never wall-clock-dependent. */
  clock: Clock;
}

export const defaultProviderSyncStateDependencies: ProviderSyncStateDependencies = {
  loadCatalog: loadRuntimeCatalogFromEnv,
  loadArtifactPolicy: loadVoiceArtifactPolicyFromEnv,
  loadServerConfig: loadVoiceServerConfigFromEnv,
  loadToolsConfig: loadVoiceToolsConfigFromEnv,
  loadCallPolicy: loadVoiceCallPolicyFromEnv,
  clock: systemClock,
};

/**
 * Builds the payload this server WOULD send right now, for comparison against
 * the digest the provider last accepted.
 *
 * It must pass the server, tools and call-policy attachments, because the sync
 * path digests a payload that includes them. Omitting them here — which is what
 * this module did until V7 — makes the two sides digest different objects, so
 * the digests can never match while any attachment is enabled. The visible
 * symptom was an assistant stuck on "changes not published" forever, reported
 * within seconds of a sync that had just answered
 * `providerConfigSynchronized: true, providerRequestSent: false`.
 *
 * Same failure family as the publish digest that was never recorded (5cbc462):
 * a status derived from an input that does not match what was actually sent.
 */
function buildComparisonInput(row: VoiceAssistant, deps: ProviderSyncStateDependencies) {
  const serverConfig = deps.loadServerConfig();
  return buildSyncProviderInput(
    row,
    deps.loadCatalog(),
    serverConfig,
    deps.loadToolsConfig(serverConfig, process.env, deps.firmToolNames),
    deps.loadCallPolicy(),
  );
}

export function deriveProviderSyncState(
  row: VoiceAssistant,
  deps: ProviderSyncStateDependencies = defaultProviderSyncStateDependencies,
): ProviderSyncState {
  if (row.providerSyncAttemptId !== null) {
    // One bounded server-side threshold, shared with the repository's reclaim
    // predicate, so what the UI calls interrupted is exactly what the next
    // attempt is allowed to take over. A claim with no start time cannot be
    // shown to be fresh, so it is treated as interrupted rather than as
    // in-progress — the honest direction.
    const startedAt = row.providerSyncStartedAt;
    if (startedAt === null) return "interrupted";
    const age = deps.clock.now().getTime() - startedAt.getTime();
    return age >= STALE_PROVIDER_SYNC_THRESHOLD_MS ? "interrupted" : "synchronizing";
  }
  if (row.status !== "published") return "not_published";

  let currentHash: string;
  try {
    currentHash = computeProviderPayloadHash(buildComparisonInput(row, deps), deps.loadArtifactPolicy());
  } catch {
    // Cannot compute what we would send, so we cannot claim agreement.
    return row.providerSyncError !== null ? "sync_failed" : "unknown";
  }

  if (row.providerConfigHash !== null && row.providerConfigHash === currentHash) {
    return "synchronized";
  }

  return row.providerSyncError !== null ? "sync_failed" : "local_changes";
}
