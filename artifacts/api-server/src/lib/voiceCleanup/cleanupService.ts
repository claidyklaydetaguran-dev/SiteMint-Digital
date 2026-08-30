// AR-001C: operator-only staging cleanup for a provider-linked voice assistant.
//
// Why this exists: publishing creates a real assistant inside the voice
// provider's account, and until now nothing in this application could remove
// it. `deleteAssistant` was implemented on VapiVoiceProvider but reachable
// from no route, service, or script, and the local row could not be deleted
// either once it carried a provider id (deleteByIdForFirm requires
// provider IS NULL). AR-001B classified that gap as blocking.
//
// This module is the whole cleanup decision. It is deliberately transport-free
// and database-free: every dependency is injected, so it imports no db client,
// reads no environment variable, constructs no provider, and can be exercised
// end to end with deterministic fakes. The CLI shell
// (cleanupStagingAssistant.cli.ts) supplies the real repository and provider.
//
// Not a route and not a UI control, by owner decision. There is intentionally
// no HTTP surface here — a customer must never be able to trigger a provider
// deletion, and an operator must pass explicit guards to trigger one.

import type { VoiceAssistant } from "@workspace/db/schema/voice";
import { VoiceProviderError, type VoiceProviderErrorCode } from "../voice/errors.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import type { Clock } from "../voice/types.js";

/** Providers whose deletion capability this command is implemented against. */
export const CLEANUP_SUPPORTED_PROVIDERS: readonly string[] = ["vapi"];

/**
 * The only two statuses whose rows may legally carry a provider assistant id.
 *
 * This is not a second status model — it is read directly off the existing
 * database invariant `ck_voice_assistants_publish_invariants`
 * (lib/db/src/schema/voiceAssistants.ts), which requires provider and
 * provider_assistant_id to be NULL for 'draft', 'publishing' and 'error', and
 * allows them to be populated only for 'published' and for the
 * known-identity variant of 'publish_uncertain'.
 *
 * Consequence worth stating plainly: a stale or interrupted 'publishing' row
 * and a definitive 'error' row can never retain a provider id, so neither can
 * ever have a remote resource to clean up through this path. A stalled
 * 'publishing' row is moved to 'publish_uncertain' by the existing 5-minute
 * stale sweep in the publish service, and becomes eligible here only if that
 * sweep recorded a known provider identity.
 */
export const CLEANUP_ELIGIBLE_STATUSES: readonly string[] = ["published", "publish_uncertain"];

/** Provider error codes that prove the remote request was rejected and no deletion happened. */
const DEFINITIVE_FAILURE_CODES: ReadonlySet<VoiceProviderErrorCode> = new Set([
  "NOT_CONFIGURED",
  "VALIDATION_FAILED",
  "CONFLICT",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "UNSUPPORTED_OPERATION",
]);

/**
 * Provider error codes that leave the remote outcome genuinely unknown.
 *
 * AR-001E moved NOT_FOUND into this set. The only established fact is that
 * `NOT_FOUND` originates from an HTTP 404 on the Vapi DELETE endpoint —
 * Vapi does not document what that 404 means. Absent, inaccessible, and
 * addressed to a different organization are all consistent with it, and none
 * of them is proof that this firm's assistant is gone. Treating it as proof
 * would clear the only recorded identity of a resource that may still exist.
 */
const UNCERTAIN_CODES: ReadonlySet<VoiceProviderErrorCode> = new Set([
  "NOT_FOUND",
  "TIMEOUT",
  "NETWORK_ERROR",
  "PROVIDER_ERROR",
]);

export type IneligibleReason =
  | "invalid_identifiers"
  | "assistant_not_found"
  | "not_provider_linked"
  | "unsupported_provider"
  | "status_not_cleanable"
  | "confirmation_mismatch";

/** Static operator-facing copy. Never interpolates a prompt, config, credential, or session value. */
export const INELIGIBLE_REASON_MESSAGE: Record<IneligibleReason, string> = {
  invalid_identifiers: "Firm id and assistant id must both be positive integers.",
  assistant_not_found: "No assistant with that id belongs to that firm.",
  not_provider_linked: "That assistant has no recorded provider link, so there is no remote resource to delete.",
  unsupported_provider: "Cleanup is not implemented for that assistant's recorded provider.",
  status_not_cleanable: "That assistant's status cannot hold a remote resource.",
  confirmation_mismatch: "The confirmation value does not match that assistant's recorded provider assistant id.",
};

/**
 * The only remote outcome that may precede a local write.
 *
 * AR-001E removed the former `"already_absent"` member. It existed solely to
 * carry a 404 into the success path, and no evidence supports reading a 404 as
 * absence. Keeping the type as a single literal makes that success shape
 * unrepresentable rather than merely unused.
 */
export type RemoteOutcome = "deleted";

export type CleanupResult =
  /** Nothing was called and nothing was written. */
  | {
      ok: true;
      status: "dry_run";
      firmId: number;
      assistantId: number;
      assistantStatus: string;
      provider: string;
      providerAssistantId: string;
    }
  /** Remote resource is definitively gone AND local state was reconciled. */
  | {
      ok: true;
      status: "cleaned";
      remote: RemoteOutcome;
      firmId: number;
      assistantId: number;
      providerAssistantId: string;
    }
  | { ok: false; status: "ineligible"; reason: IneligibleReason }
  /** The provider definitively refused. Local state is untouched and still carries the provider id. */
  | {
      ok: false;
      status: "provider_failed";
      code: VoiceProviderErrorCode;
      firmId: number;
      assistantId: number;
      providerAssistantId: string;
    }
  /** The remote outcome is unknown. Local state is untouched. Never assume deletion. */
  | {
      ok: false;
      status: "uncertain";
      code: VoiceProviderErrorCode | "unnormalized_error";
      firmId: number;
      assistantId: number;
      providerAssistantId: string;
    }
  /** Remote is gone but the local row could not be reconciled. Recovery identity is preserved. */
  | {
      ok: false;
      status: "local_reconcile_failed";
      remote: RemoteOutcome;
      firmId: number;
      assistantId: number;
      providerAssistantId: string;
    };

/**
 * The exact repository surface this command needs — declared structurally so
 * this module never imports the real repository (and therefore never pulls in
 * the database client). Both methods are firm-scoped by contract.
 */
export interface CleanupRepositoryDependency {
  getPublishState(firmId: number, id: number): Promise<VoiceAssistant | null>;
  clearProviderLinkForFirm(
    firmId: number,
    id: number,
    expectedProviderAssistantId: string,
  ): Promise<VoiceAssistant | null>;
}

export interface CleanupServiceDependencies {
  repository: CleanupRepositoryDependency;
  /** Lazy — never invoked on the dry-run path, so a dry run needs no provider credential at all. */
  createProvider: () => VoiceProvider;
  clock: Clock;
  /** Safe event sink. Never receives prompts, credentials, config, or session values. */
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export interface CleanupRequest {
  firmId: number;
  assistantId: number;
  /** Must equal the row's recorded provider assistant id. Required only when executing. */
  confirmProviderAssistantId?: string;
  /** False (the default at every layer) performs no provider call and no write. */
  execute: boolean;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonBlank(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ineligible(reason: IneligibleReason): CleanupResult {
  return { ok: false, status: "ineligible", reason };
}

/**
 * Cleans up exactly one firm-scoped assistant's provider resource.
 *
 * Ordering is the safety property: the local provider id is never cleared
 * until the remote resource is definitively gone, and the row is never
 * deleted or reset after an uncertain provider result. There is no automatic
 * retry anywhere in this function, and at most one provider call is made per
 * invocation.
 */
export async function cleanupStagingAssistant(
  request: CleanupRequest,
  deps: CleanupServiceDependencies,
): Promise<CleanupResult> {
  const { firmId, assistantId } = request;

  // ── Step 1: validate identifiers, then read the firm-scoped local record ──
  if (!isPositiveInt(firmId) || !isPositiveInt(assistantId)) {
    return ineligible("invalid_identifiers");
  }

  // A wrong firm and a nonexistent assistant are indistinguishable by design:
  // getPublishState is firm-scoped, so a cross-tenant id returns null exactly
  // like a missing one and leaks nothing about another firm's data.
  const row = await deps.repository.getPublishState(firmId, assistantId);
  if (!row) return ineligible("assistant_not_found");

  // ── Step 2: eligibility. Fails closed on every branch. ────────────────────
  if (!nonBlank(row.provider) || !nonBlank(row.providerAssistantId)) {
    return ineligible("not_provider_linked");
  }
  if (!CLEANUP_SUPPORTED_PROVIDERS.includes(row.provider)) {
    return ineligible("unsupported_provider");
  }
  if (!CLEANUP_ELIGIBLE_STATUSES.includes(row.status)) {
    return ineligible("status_not_cleanable");
  }

  const providerAssistantId = row.providerAssistantId;

  // ── Step 3: dry run reports the plan and stops. Zero writes, zero calls. ──
  if (!request.execute) {
    return {
      ok: true,
      status: "dry_run",
      firmId,
      assistantId,
      assistantStatus: row.status,
      provider: row.provider,
      providerAssistantId,
    };
  }

  // Confirmation is checked only against the record we just read, and is
  // never used to look anything up — a provider id alone can never select a
  // target here.
  if (request.confirmProviderAssistantId !== providerAssistantId) {
    return ineligible("confirmation_mismatch");
  }

  // ── Step 4: exactly one provider delete call. No retry, ever. ─────────────
  let provider: VoiceProvider;
  try {
    provider = deps.createProvider();
  } catch {
    deps.logger?.("cleanup_provider_unavailable", { firmId, assistantId });
    return {
      ok: false,
      status: "provider_failed",
      code: "NOT_CONFIGURED",
      firmId,
      assistantId,
      providerAssistantId,
    };
  }

  let remote: RemoteOutcome;
  try {
    await provider.deleteAssistant(providerAssistantId);
    remote = "deleted";
  } catch (err) {
    if (err instanceof VoiceProviderError) {
      // There is deliberately no NOT_FOUND success branch here. NOT_FOUND
      // comes from an HTTP 404 on DELETE /assistant/{id}, and Vapi documents
      // nothing about what that 404 means, so it falls through to
      // UNCERTAIN_CODES below and reconciles nothing. No provider failure of
      // any kind is treated as a successful cleanup.
      if (DEFINITIVE_FAILURE_CODES.has(err.code)) {
        deps.logger?.("cleanup_provider_failed", { firmId, assistantId, code: err.code });
        return {
          ok: false,
          status: "provider_failed",
          code: err.code,
          firmId,
          assistantId,
          providerAssistantId,
        };
      } else if (UNCERTAIN_CODES.has(err.code)) {
        deps.logger?.("cleanup_provider_uncertain", { firmId, assistantId, code: err.code });
        return {
          ok: false,
          status: "uncertain",
          code: err.code,
          firmId,
          assistantId,
          providerAssistantId,
        };
      } else {
        // An unrecognized normalized code is treated conservatively.
        deps.logger?.("cleanup_provider_uncertain", { firmId, assistantId, code: err.code });
        return {
          ok: false,
          status: "uncertain",
          code: err.code,
          firmId,
          assistantId,
          providerAssistantId,
        };
      }
    } else {
      // A throw the provider layer did not normalize tells us nothing about
      // whether the delete landed, so it is uncertain, never a clean failure.
      deps.logger?.("cleanup_provider_uncertain", { firmId, assistantId, code: "unnormalized_error" });
      return {
        ok: false,
        status: "uncertain",
        code: "unnormalized_error",
        firmId,
        assistantId,
        providerAssistantId,
      };
    }
  }

  // ── Step 5: reconcile local state, conditional on the same provider id. ───
  // Reached only when the remote resource is definitively gone.
  let reconciled: VoiceAssistant | null = null;
  try {
    reconciled = await deps.repository.clearProviderLinkForFirm(firmId, assistantId, providerAssistantId);
  } catch {
    reconciled = null;
  }

  if (!reconciled) {
    // Remote deletion really did happen (a documented 200 proved it); only the
    // local write failed or matched zero rows because the row changed
    // underneath us. Report both halves honestly and keep the provider id.
    //
    // AR-001E: re-running this command is NOT the recovery. A second run would
    // issue a second DELETE whose 404 proves nothing, so it could neither
    // confirm the first deletion nor safely reconcile. A stale local link is
    // the strictly safer end state than a silently orphaned remote resource,
    // so the command stops here and hands the operator a manual procedure.
    deps.logger?.("cleanup_local_reconcile_failed", { firmId, assistantId, remote });
    return {
      ok: false,
      status: "local_reconcile_failed",
      remote,
      firmId,
      assistantId,
      providerAssistantId,
    };
  }

  deps.logger?.("cleanup_completed", { firmId, assistantId, remote });
  return { ok: true, status: "cleaned", remote, firmId, assistantId, providerAssistantId };
}

// ─── CLI guard helpers (pure, so they are testable without a database) ──────

export interface CleanupCliArgs {
  firmId?: number;
  assistantId?: number;
  confirmProviderAssistantId?: string;
  execute: boolean;
}

/**
 * Canonical positive base-10 integer: one leading digit 1-9, then digits.
 *
 * Anchored, so a trailing character fails. No sign, no decimal point, no
 * exponent, no radix prefix, no leading zero, no surrounding whitespace.
 */
const STRICT_POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/**
 * AR-001E: strict identifier parsing, replacing `Number(value)`.
 *
 * `Number()` was permissive in ways that mattered here. It accepted
 * whitespace-padded values, `"1e3"`, `"0x10"`, `"+1"`, `"Infinity"` and `""`
 * (which becomes 0), and it turned `"abc"` into `NaN` — a value that is not
 * `undefined`, so it passed the CLI's "was an id supplied?" check and let a
 * meaningless invocation reach the database import before being rejected.
 *
 * Returning `undefined` for every rejected form is what makes the CLI stop at
 * its usage message, before `@workspace/db` is imported (that import opens a
 * connection pool), before any provider is constructed, and therefore before
 * any provider or database call can occur.
 */
export function parseStrictPositiveInteger(value: string | undefined): number | undefined {
  if (typeof value !== "string" || !STRICT_POSITIVE_INTEGER.test(value)) return undefined;
  const parsed = Number(value);
  // Guards the upper end: digits alone can spell a value past 2^53-1, where
  // Number() silently rounds and the id would no longer be the one supplied.
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/**
 * Parses operator arguments. `execute` defaults to false, so an invocation
 * with no flags at all is a dry run — the safe default is the absence of a
 * flag, not the presence of one.
 *
 * An identifier that fails strict parsing is left `undefined`, exactly like a
 * missing one: both are refused by the caller before anything is loaded.
 */
export function parseCleanupArgs(argv: readonly string[]): CleanupCliArgs {
  const args: CleanupCliArgs = { execute: false };
  for (const raw of argv) {
    if (raw === "--execute") {
      args.execute = true;
      continue;
    }
    const eq = raw.indexOf("=");
    if (eq === -1) continue;
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    if (key === "--firm-id") args.firmId = parseStrictPositiveInteger(value);
    else if (key === "--assistant-id") args.assistantId = parseStrictPositiveInteger(value);
    else if (key === "--confirm") args.confirmProviderAssistantId = value;
  }
  return args;
}

export const STAGING_CLEANUP_ENV_VAR = "VOICE_STAGING_CLEANUP_ENABLED";

export type EnvironmentGuardFailure = "production_environment" | "not_enabled";

export const ENVIRONMENT_GUARD_MESSAGE: Record<EnvironmentGuardFailure, string> = {
  production_environment:
    "Refusing to run: NODE_ENV is production. This command is for an isolated staging environment only.",
  not_enabled: `Refusing to run: ${STAGING_CLEANUP_ENV_VAR} must be exactly "true" in this process.`,
};

/**
 * Both guards apply to a dry run as well as to an execution. A dry run still
 * reads the database, so it must still be pointed at a staging process on
 * purpose rather than by accident.
 */
export function evaluateEnvironmentGuards(
  env: Record<string, string | undefined>,
): EnvironmentGuardFailure | undefined {
  if (env["NODE_ENV"] === "production") return "production_environment";
  if (env[STAGING_CLEANUP_ENV_VAR] !== "true") return "not_enabled";
  return undefined;
}

/** Exit code contract: 0 only when nothing was left uncertain or half-done. */
export function exitCodeFor(result: CleanupResult): number {
  return result.ok ? 0 : 1;
}

/**
 * Structured, redacted operator output. Deliberately carries the provider
 * assistant id — an operator who must finish a cleanup by hand needs the
 * resource identifier, and AR-001B recorded that it appears nowhere in the
 * dashboard. It carries no prompt, no assistant configuration, no session
 * token, and no credential.
 */
export function formatCleanupResult(result: CleanupResult): string {
  const lines: string[] = [];
  const push = (k: string, v: string | number) => lines.push(`  ${k}: ${v}`);

  switch (result.status) {
    case "dry_run":
      lines.push("DRY RUN — nothing was deleted and nothing was written.");
      push("firmId", result.firmId);
      push("assistantId", result.assistantId);
      push("assistantStatus", result.assistantStatus);
      push("provider", result.provider);
      push("providerAssistantId", result.providerAssistantId);
      lines.push("");
      lines.push("To execute, re-run with:");
      lines.push(
        `  --firm-id=${result.firmId} --assistant-id=${result.assistantId} --confirm=${result.providerAssistantId} --execute`,
      );
      break;
    case "cleaned":
      lines.push("CLEANED — the remote assistant was deleted and local state was reconciled.");
      push("firmId", result.firmId);
      push("assistantId", result.assistantId);
      push("providerAssistantId", result.providerAssistantId);
      lines.push("  The assistant is now an editable draft and can be deleted normally.");
      break;
    case "ineligible":
      lines.push("REFUSED — nothing was deleted and nothing was written.");
      push("reason", result.reason);
      lines.push(`  ${INELIGIBLE_REASON_MESSAGE[result.reason]}`);
      break;
    case "provider_failed":
      lines.push("PROVIDER REFUSED — the remote assistant was NOT deleted.");
      push("firmId", result.firmId);
      push("assistantId", result.assistantId);
      push("providerAssistantId", result.providerAssistantId);
      push("providerErrorCode", result.code);
      lines.push("  The remote outcome is known: the provider rejected the request, so nothing was deleted.");
      lines.push("  Local state is unchanged and still records the provider link.");
      lines.push("  Nothing was retried. Re-run deliberately only after resolving the cause.");
      break;
    case "uncertain":
      lines.push("UNCERTAIN — it is NOT known whether the remote assistant was deleted.");
      push("firmId", result.firmId);
      push("assistantId", result.assistantId);
      push("providerAssistantId", result.providerAssistantId);
      push("providerErrorCode", result.code);
      lines.push("  DO NOT assume the remote resource is gone.");
      lines.push("  Local state is unchanged and still records the provider link.");
      lines.push("  Nothing was retried and nothing was written.");
      if (result.code === "NOT_FOUND") {
        // The 404 case is called out by name because AR-001C wrongly reported
        // it as a completed cleanup. The wording below is the full extent of
        // what is actually established.
        lines.push("  The provider answered HTTP 404 to the delete request.");
        lines.push("  Vapi does not document whether a 404 means the assistant is absent,");
        lines.push("  inaccessible, or owned by a different organization, so a 404 is NOT");
        lines.push("  proof of deletion and must not clear the local provider link.");
        lines.push("  STOP HERE. Do not re-run this command and do not edit the row by hand.");
        lines.push("  Escalate to the owner for a provider-dashboard investigation.");
      } else {
        lines.push("  Verify the resource in the provider account before acting.");
      }
      break;
    case "local_reconcile_failed":
      lines.push("PARTIAL — the remote assistant was deleted but local state was NOT reconciled.");
      push("firmId", result.firmId);
      push("assistantId", result.assistantId);
      push("providerAssistantId", result.providerAssistantId);
      push("remote", result.remote);
      lines.push("  Remote deletion IS confirmed: the provider returned its documented success");
      lines.push("  response for this assistant id. Local reconciliation is incomplete.");
      lines.push("  The local provider link was deliberately preserved — a stale local link is");
      lines.push("  safer than an orphaned remote resource.");
      lines.push("  STOP HERE. Do NOT re-run this command: a second delete would answer 404,");
      lines.push("  which proves nothing and cannot confirm the deletion above.");
      lines.push("  Verify the assistant's absence in the provider dashboard, then perform");
      lines.push("  local reconciliation only under a separately authorized procedure.");
      break;
  }

  return lines.join("\n");
}
