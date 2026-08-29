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
  /** Injected so stale-versus-fresh is deterministic under test, never wall-clock-dependent. */
  clock: Clock;
}

export const defaultProviderSyncStateDependencies: ProviderSyncStateDependencies = {
  loadCatalog: loadRuntimeCatalogFromEnv,
  loadArtifactPolicy: loadVoiceArtifactPolicyFromEnv,
  clock: systemClock,
};

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
    const input = buildSyncProviderInput(row, deps.loadCatalog());
    currentHash = computeProviderPayloadHash(input, deps.loadArtifactPolicy());
  } catch {
    // Cannot compute what we would send, so we cannot claim agreement.
    return row.providerSyncError !== null ? "sync_failed" : "unknown";
  }

  if (row.providerConfigHash !== null && row.providerConfigHash === currentHash) {
    return "synchronized";
  }

  return row.providerSyncError !== null ? "sync_failed" : "local_changes";
}
