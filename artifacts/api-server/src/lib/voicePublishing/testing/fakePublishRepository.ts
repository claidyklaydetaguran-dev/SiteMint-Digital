// AR-001A — TEST-ONLY. Never imported by production code.
//
// In-memory stand-in for the six `PublishRepositoryDependency` methods the
// publish service depends on. It exists so `publishAssistant()` can be driven
// through every branch with no database, no connection pool, no DATABASE_URL,
// and no environment read of any kind.
//
// The predicates below deliberately mirror the real repository's SQL WHERE
// clauses (artifacts/api-server/src/lib/voiceAssistants/repository.ts,
// read-only) field for field, because the value of this fake is entirely in
// rejecting the same writes Postgres would reject: a stale attempt id, a wrong
// firm, a second finalize for one attempt, a reclaim of publish_uncertain.
// A fake that accepted those would make the tests pass and prove nothing.
//
// Not a database: no transactions, no isolation levels, no concurrency
// semantics beyond JavaScript's single-threaded turn. Where the real claim
// relies on Postgres serializing two UPDATEs, this relies on the two calls
// running in one tick. That is sufficient to prove the service issues exactly
// one provider call, and is stated here so it is not mistaken for more.

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import type { PublishSyncErrorCode } from "../types.js";
import type { ClaimForPublishResult } from "../../voiceAssistants/repository.js";

/** Statuses `claimForPublish` may claim from — mirrors RETRYABLE_CLAIM_STATUSES. */
const RETRYABLE_CLAIM_STATUSES = new Set(["draft", "error"]);

export type FakeRepositoryMethod =
  | "claimForPublish"
  | "finalizePublished"
  | "recordPublishError"
  | "recordPublishUncertain"
  | "markStalePublishingUncertain"
  | "getPublishState";

export interface FakeAssistantSeed {
  id: number;
  firmId: number;
  name?: string;
  templateKey?: string;
  status?: string;
  provider?: string | null;
  providerAssistantId?: string | null;
  config?: Record<string, unknown>;
  syncError?: string | null;
  publishAttemptId?: string | null;
  publishStartedAt?: Date | null;
  lastSyncedAt?: Date | null;
}

export interface FakePublishRepositoryOptions {
  /** Rows the fake starts with. */
  seed?: FakeAssistantSeed[];
  /** Methods that should throw when called (simulates a repository read/write failure). */
  throwOn?: Partial<Record<FakeRepositoryMethod, boolean>>;
  /**
   * Methods that should report "matched zero rows" by returning null even
   * though the predicate would otherwise have matched. This is the shape a
   * lost race takes, and the only way to reach the service's
   * local_finalize_failed and double-persistence-failure branches.
   */
  returnNullOn?: Partial<Record<FakeRepositoryMethod, boolean>>;
  /** Fixed clock used for every timestamp the fake writes. */
  now?: () => Date;
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  schemaVersion: 1,
  setup: { assistantName: "Front Desk" },
  prompt: {
    firstMessageMode: "assistant-speaks-first",
    firstMessage: "Thanks for calling.",
    systemInstructions: "Answer politely and take a message.",
  },
  voiceModel: { preset: "natural-balanced" },
};

function buildRow(seed: FakeAssistantSeed, now: Date): VoiceAssistant {
  return {
    id: seed.id,
    firmId: seed.firmId,
    name: seed.name ?? "Front Desk",
    templateKey: seed.templateKey ?? "ai-receptionist",
    status: seed.status ?? "draft",
    provider: seed.provider ?? null,
    providerAssistantId: seed.providerAssistantId ?? null,
    config: seed.config ?? DEFAULT_CONFIG,
    lastSyncedAt: seed.lastSyncedAt ?? null,
    syncError: seed.syncError ?? null,
    publishAttemptId: seed.publishAttemptId ?? null,
    publishStartedAt: seed.publishStartedAt ?? null,
    createdAt: now,
    updatedAt: now,
  } as VoiceAssistant;
}

/**
 * Deterministic in-memory `PublishRepositoryDependency`.
 *
 * Attempt ids are sequential (`attempt-1`, `attempt-2`, …) rather than random,
 * so an assertion can name the exact attempt a test expects.
 */
export class FakePublishRepository {
  private readonly rows = new Map<string, VoiceAssistant>();
  private readonly options: FakePublishRepositoryOptions;
  private readonly nowFn: () => Date;
  private attemptCounter = 0;

  /** Per-method call counts, for asserting a branch did not touch the database. */
  readonly calls: Record<FakeRepositoryMethod, number> = {
    claimForPublish: 0,
    finalizePublished: 0,
    recordPublishError: 0,
    recordPublishUncertain: 0,
    markStalePublishingUncertain: 0,
    getPublishState: 0,
  };

  constructor(options: FakePublishRepositoryOptions = {}) {
    this.options = options;
    this.nowFn = options.now ?? (() => new Date("2026-08-25T00:00:00.000Z"));
    for (const seed of options.seed ?? []) {
      this.rows.set(this.key(seed.firmId, seed.id), buildRow(seed, this.nowFn()));
    }
  }

  private key(firmId: number, id: number): string {
    return `${firmId}:${id}`;
  }

  /** Firm-scoped read used by assertions. Returns a copy so a test cannot mutate fake state. */
  peek(firmId: number, id: number): VoiceAssistant | null {
    const row = this.rows.get(this.key(firmId, id));
    return row ? ({ ...row } as VoiceAssistant) : null;
  }

  private guard(method: FakeRepositoryMethod): void {
    this.calls[method] += 1;
    if (this.options.throwOn?.[method]) {
      throw new Error(`FakePublishRepository: forced failure in ${method}`);
    }
  }

  private nulled(method: FakeRepositoryMethod): boolean {
    return this.options.returnNullOn?.[method] === true;
  }

  claimForPublish = async (firmId: number, id: number): Promise<ClaimForPublishResult | null> => {
    this.guard("claimForPublish");
    if (this.nulled("claimForPublish")) return null;

    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;

    // Mirrors the real WHERE clause exactly.
    const matches =
      RETRYABLE_CLAIM_STATUSES.has(row.status) &&
      row.provider === null &&
      row.providerAssistantId === null &&
      row.publishAttemptId === null &&
      row.publishStartedAt === null;
    if (!matches) return null;

    this.attemptCounter += 1;
    const publishAttemptId = `attempt-${this.attemptCounter}`;
    const publishStartedAt = this.nowFn();

    const claimed = {
      ...row,
      status: "publishing",
      publishAttemptId,
      publishStartedAt,
      syncError: null,
      updatedAt: publishStartedAt,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), claimed);

    return { assistant: { ...claimed } as VoiceAssistant, publishAttemptId };
  };

  finalizePublished = async (
    firmId: number,
    id: number,
    publishAttemptId: string,
    provider: string,
    providerAssistantId: string,
  ): Promise<VoiceAssistant | null> => {
    this.guard("finalizePublished");
    if (this.nulled("finalizePublished")) return null;

    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;

    const matches =
      row.status === "publishing" &&
      row.publishAttemptId === publishAttemptId &&
      row.provider === null &&
      row.providerAssistantId === null;
    if (!matches) return null;

    const now = this.nowFn();
    const next = {
      ...row,
      status: "published",
      provider,
      providerAssistantId,
      lastSyncedAt: now,
      syncError: null,
      publishAttemptId: null,
      publishStartedAt: null,
      updatedAt: now,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), next);
    return { ...next } as VoiceAssistant;
  };

  recordPublishError = async (
    firmId: number,
    id: number,
    publishAttemptId: string,
    syncErrorCode: PublishSyncErrorCode,
  ): Promise<VoiceAssistant | null> => {
    this.guard("recordPublishError");
    if (this.nulled("recordPublishError")) return null;

    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;
    if (row.status !== "publishing" || row.publishAttemptId !== publishAttemptId) return null;

    const now = this.nowFn();
    const next = {
      ...row,
      status: "error",
      provider: null,
      providerAssistantId: null,
      syncError: syncErrorCode,
      publishAttemptId: null,
      publishStartedAt: null,
      updatedAt: now,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), next);
    return { ...next } as VoiceAssistant;
  };

  recordPublishUncertain = async (
    firmId: number,
    id: number,
    publishAttemptId: string,
    syncErrorCode: PublishSyncErrorCode,
    providerIdentity?: { provider: string; providerAssistantId: string },
  ): Promise<VoiceAssistant | null> => {
    this.guard("recordPublishUncertain");
    if (this.nulled("recordPublishUncertain")) return null;

    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;
    if (row.status !== "publishing" || row.publishAttemptId !== publishAttemptId) return null;

    const now = this.nowFn();
    const next = {
      ...row,
      status: "publish_uncertain",
      provider: providerIdentity?.provider ?? null,
      providerAssistantId: providerIdentity?.providerAssistantId ?? null,
      syncError: syncErrorCode,
      publishAttemptId: null,
      publishStartedAt: null,
      updatedAt: now,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), next);
    return { ...next } as VoiceAssistant;
  };

  markStalePublishingUncertain = async (
    firmId: number,
    id: number,
    params: { olderThanMs: number; publishAttemptId?: string },
  ): Promise<VoiceAssistant | null> => {
    this.guard("markStalePublishingUncertain");
    if (this.nulled("markStalePublishingUncertain")) return null;

    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;

    const now = this.nowFn();
    const cutoff = new Date(now.getTime() - params.olderThanMs);
    const startedAt = row.publishStartedAt;
    const matches =
      row.status === "publishing" &&
      startedAt !== null &&
      startedAt.getTime() < cutoff.getTime() &&
      (params.publishAttemptId === undefined || row.publishAttemptId === params.publishAttemptId);
    if (!matches) return null;

    const next = {
      ...row,
      status: "publish_uncertain",
      syncError: "stale_publish_attempt",
      publishAttemptId: null,
      publishStartedAt: null,
      updatedAt: now,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), next);
    return { ...next } as VoiceAssistant;
  };

  getPublishState = async (firmId: number, id: number): Promise<VoiceAssistant | null> => {
    this.guard("getPublishState");
    if (this.nulled("getPublishState")) return null;
    const row = this.rows.get(this.key(firmId, id));
    return row ? ({ ...row } as VoiceAssistant) : null;
  };

  /**
   * AR-001C: applies exactly the cleared-draft shape the real
   * `clearProviderLinkForFirm` writes. The caller owns the conditional
   * predicate; this performs only the write half.
   */
  applyCleared(firmId: number, id: number): VoiceAssistant | null {
    const row = this.rows.get(this.key(firmId, id));
    if (!row) return null;
    const now = this.nowFn();
    const next = {
      ...row,
      status: "draft",
      provider: null,
      providerAssistantId: null,
      publishAttemptId: null,
      publishStartedAt: null,
      syncError: null,
      lastSyncedAt: null,
      updatedAt: now,
    } as VoiceAssistant;
    this.rows.set(this.key(firmId, id), next);
    return { ...next } as VoiceAssistant;
  }

  /** AR-001C: simulates a concurrent writer landing a different provider identity mid-cleanup. */
  forceProviderAssistantId(firmId: number, id: number, providerAssistantId: string): void {
    const row = this.rows.get(this.key(firmId, id));
    if (!row) return;
    this.rows.set(this.key(firmId, id), { ...row, providerAssistantId } as VoiceAssistant);
  }
}
