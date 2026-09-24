// AR-001V.1: the single, narrow boundary through which a provider assistant
// id may reach a browser.
//
// The id is not a secret in the way a key is — the Vapi Web SDK is handed it
// verbatim to start a call, so during an authorized browser test the
// authenticated owner's page necessarily has it. The requirement is
// confinement, not pretence: it must not sit in every list response, in every
// detail response, in a disabled-feature bundle, in a log line, or in an error
// body. It is issued here and nowhere else, once, on an explicit request that
// only happens after the owner confirms Start Browser Test.
//
// Every check below fails closed and none of them contacts a provider, reads a
// credential, constructs a provider client, or touches the microphone. This
// module resolves one firm-scoped row and returns two strings.

import { isVoiceBrowserTestEnabled } from "../voicePublishing/featureFlags.js";
import { voiceAssistantRepository } from "./repository.js";

/** The only provider key a browser test may be started for. Provider-neutral literal, no provider import. */
const VAPI_PROVIDER_NAME = "vapi";

export type BrowserTestSessionErrorCode =
  | "browser_test_disabled"
  | "invalid_request"
  | "assistant_not_found"
  | "assistant_not_published"
  | "provider_link_missing"
  | "unsupported_provider"
  | "browser_token_unavailable"
  | "internal_error";

export interface BrowserTestSessionError {
  status: number;
  code: BrowserTestSessionErrorCode;
  message: string;
}

/**
 * The complete response shape. Two fields, both required by the Web SDK to
 * start a call against an existing assistant.
 *
 * Deliberately absent: system instructions, first message, model/voice/
 * transcriber, artifact policy, the public key (which the browser gets from
 * its own build, never from an API), the private key, firmId, the database
 * row id, timestamps, publish status, attempt ids, the config digest, and any
 * field that would let a caller assemble a transient assistant.
 */
export interface BrowserTestSessionDto {
  provider: string;
  providerAssistantId: string;
  /**
   * AR-001V.3: a provider credential restricted to THIS assistant only. It
   * replaces the build-time browser key, which could start any assistant in
   * the organisation. Issued to the authenticated owner of this row and to
   * nobody else; never present in a list response and never logged.
   */
  publicKey: string;
}

export type BrowserTestSessionResult =
  | { ok: true; session: BrowserTestSessionDto }
  | { ok: false; error: BrowserTestSessionError };

const MESSAGE_BY_CODE: Record<BrowserTestSessionErrorCode, string> = {
  browser_test_disabled: "Browser testing is not currently available.",
  invalid_request: "The request was not valid.",
  assistant_not_found: "Assistant not found.",
  assistant_not_published: "This assistant has not been published yet.",
  provider_link_missing: "This assistant has no confirmed provider connection to test.",
  unsupported_provider: "Browser testing is not available for this assistant's provider.",
  browser_token_unavailable:
    "Browser testing could not be prepared for this assistant. Please try again, or contact SiteMint if it keeps happening.",
  internal_error: "An internal error occurred.",
};

const STATUS_BY_CODE: Record<BrowserTestSessionErrorCode, number> = {
  browser_test_disabled: 503,
  invalid_request: 400,
  assistant_not_found: 404,
  assistant_not_published: 409,
  provider_link_missing: 409,
  unsupported_provider: 409,
  browser_token_unavailable: 503,
  internal_error: 500,
};

export function buildBrowserTestSessionError(code: BrowserTestSessionErrorCode): BrowserTestSessionError {
  return { status: STATUS_BY_CODE[code], code, message: MESSAGE_BY_CODE[code] };
}

/**
 * How long one mint attempt may hold the claim. Long enough to cover a slow
 * provider round trip, short enough that a crashed request does not block
 * browser testing for a noticeable time.
 */
export const BROWSER_TOKEN_MINT_LEASE_SECONDS = 30;

export interface BrowserTestSessionDependencies {
  /** Explicit server switch, never read at module import time. Authoritative over any client build flag. */
  isEnabled: () => boolean;
  findByIdForFirm: typeof voiceAssistantRepository.findByIdForFirm;
  claimBrowserTokenMint: typeof voiceAssistantRepository.claimBrowserTokenMint;
  setBrowserToken: typeof voiceAssistantRepository.setBrowserToken;
  clearBrowserToken: typeof voiceAssistantRepository.clearBrowserToken;
  /** Mints a scoped browser credential. Null when the provider offers none. */
  mintBrowserToken: (
    providerAssistantId: string,
    name: string,
  ) => Promise<{ tokenId: string; tokenValue: string } | null>;
  /**
   * Revokes a provider-side token. Resolves false when the provider offers no
   * revocation, so callers can report an untidied token instead of pretending
   * it is gone.
   */
  revokeBrowserToken: (tokenId: string) => Promise<boolean>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

export const defaultBrowserTestSessionDependencies: BrowserTestSessionDependencies = {
  isEnabled: isVoiceBrowserTestEnabled,
  findByIdForFirm: voiceAssistantRepository.findByIdForFirm,
  claimBrowserTokenMint: voiceAssistantRepository.claimBrowserTokenMint,
  setBrowserToken: voiceAssistantRepository.setBrowserToken,
  clearBrowserToken: voiceAssistantRepository.clearBrowserToken,
  mintBrowserToken: async (providerAssistantId, name) => {
    // Lazy imports keep this module free of a provider construction at import
    // time, exactly as the publish path does.
    const { createProductionVoiceProvider } = await import("../voicePublishing/providerFactory.js");
    const { loadBrowserTokenOrigins } = await import("./browserTokenOrigins.js");
    const provider = createProductionVoiceProvider();
    if (typeof provider.createBrowserToken !== "function") return null;
    const origins = loadBrowserTokenOrigins();
    if (origins.length === 0) return null;
    return provider.createBrowserToken({ providerAssistantId, allowedOrigins: origins, name });
  },
  revokeBrowserToken: async (tokenId) => {
    const { createProductionVoiceProvider } = await import("../voicePublishing/providerFactory.js");
    const provider = createProductionVoiceProvider();
    if (typeof provider.deleteBrowserToken !== "function") return false;
    await provider.deleteBrowserToken(tokenId);
    return true;
  },
};

function failure(code: BrowserTestSessionErrorCode): BrowserTestSessionResult {
  return { ok: false, error: buildBrowserTestSessionError(code) };
}

/**
 * Issues browser-test metadata for exactly one firm-scoped assistant.
 * `firmId` must come only from the authenticated server session; this
 * function never reads it from anywhere else, and the lookup is firm-scoped,
 * so a cross-tenant id is indistinguishable from a nonexistent one.
 *
 * The server flag is checked FIRST, before the row is even read, so while it
 * is false no crafted request can learn whether an assistant exists.
 */
export async function getBrowserTestSession(
  firmId: number,
  assistantId: number,
  deps: BrowserTestSessionDependencies = defaultBrowserTestSessionDependencies,
  options: { replaceExistingToken?: boolean } = {},
): Promise<BrowserTestSessionResult> {
  if (!deps.isEnabled()) {
    return failure("browser_test_disabled");
  }

  const row = await deps.findByIdForFirm(firmId, assistantId);
  if (!row) {
    return failure("assistant_not_found");
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
  const providerAssistantId = row.providerAssistantId;
  if (providerAssistantId === null || providerAssistantId.trim().length === 0) {
    return failure("provider_link_missing");
  }

  const providerId = providerAssistantId.trim();

  // Reuse the token already minted for this assistant. Only an assistant that
  // has never had one causes a provider call, so an ordinary publish, sync, or
  // repeated browser test creates nothing new.
  let publicKey = typeof row.browserTokenValue === "string" ? row.browserTokenValue.trim() : "";

  // Controlled recovery: the owner asked for a replacement because the stored
  // credential is no longer accepted by the provider. Discard it — revoking it
  // provider-side first so a rejected-but-live token is not left behind — and
  // fall through to the ordinary mint path. There is no shared-key fallback
  // here and no widening of restrictions; a replacement is scoped exactly like
  // the token it replaces, and if minting fails the honest answer is that
  // browser testing is unavailable.
  if (publicKey.length > 0 && options.replaceExistingToken === true) {
    const staleTokenId = typeof row.browserTokenId === "string" ? row.browserTokenId.trim() : "";
    if (staleTokenId.length > 0) {
      const cleared = await deps.clearBrowserToken(firmId, row.id, staleTokenId);
      if (cleared !== null) {
        publicKey = "";
        // Best-effort revocation AFTER the row no longer references it: if this
        // fails, the token is unreferenced rather than unrevoked-and-in-use.
        try {
          const revoked = await deps.revokeBrowserToken(staleTokenId);
          if (!revoked) {
            deps.logger?.("voice_browser_token_revocation_unsupported", { firmId, assistantId: row.id });
          }
        } catch {
          deps.logger?.("voice_browser_token_revocation_failed", { firmId, assistantId: row.id });
        }
      } else {
        // Someone else already replaced it; re-read and use their token rather
        // than minting a third one.
        const reread = await deps.findByIdForFirm(firmId, row.id);
        publicKey = typeof reread?.browserTokenValue === "string" ? reread.browserTokenValue.trim() : "";
      }
    }
  }

  if (publicKey.length === 0) {
    // CLAIM BEFORE MINTING. The conditional write below cannot prevent a
    // duplicate provider token on its own — two requests could both mint and
    // only one could store, orphaning the loser's live credential. So the right
    // to mint is claimed first, and only the winner contacts the provider.
    const claimed = await deps.claimBrowserTokenMint(
      firmId,
      row.id,
      BROWSER_TOKEN_MINT_LEASE_SECONDS,
      new Date(),
    );
    if (claimed === null) {
      // Either a token appeared between our read and the claim, or another
      // request is minting right now. Re-read: a present token is the answer,
      // and an absent one means "ask again in a moment", which is what the
      // retryable 503 says.
      const reread = await deps.findByIdForFirm(firmId, row.id);
      publicKey = typeof reread?.browserTokenValue === "string" ? reread.browserTokenValue.trim() : "";
      if (publicKey.length === 0) return failure("browser_token_unavailable");
      return { ok: true, session: { provider: VAPI_PROVIDER_NAME, providerAssistantId: providerId, publicKey } };
    }

    let minted: { tokenId: string; tokenValue: string } | null = null;
    try {
      minted = await deps.mintBrowserToken(providerId, `sitemint-firm${firmId}-assistant${row.id}`);
    } catch {
      // A provider failure must not leak its text to the caller; the honest
      // outcome is "could not prepare", not a generic internal error. The lease
      // is deliberately left to expire rather than cleared, so a provider that
      // is failing is not hammered once per click.
      return failure("browser_token_unavailable");
    }
    if (minted === null) return failure("browser_token_unavailable");

    const stored = await deps.setBrowserToken(firmId, row.id, minted.tokenId, minted.tokenValue);
    if (stored !== null) {
      publicKey = minted.tokenValue;
    } else {
      // Holding the claim should make this unreachable; it remains handled
      // because "unreachable" plus a live provider credential is a leak. We
      // minted a token nobody will reference, so revoke it and use the stored
      // one.
      try {
        const revoked = await deps.revokeBrowserToken(minted.tokenId);
        if (!revoked) {
          deps.logger?.("voice_browser_token_orphan_not_revocable", { firmId, assistantId: row.id });
        }
      } catch {
        deps.logger?.("voice_browser_token_orphan_revocation_failed", { firmId, assistantId: row.id });
      }
      const reread = await deps.findByIdForFirm(firmId, row.id);
      publicKey = typeof reread?.browserTokenValue === "string" ? reread.browserTokenValue.trim() : "";
      if (publicKey.length === 0) return failure("browser_token_unavailable");
    }
  }

  return { ok: true, session: { provider: VAPI_PROVIDER_NAME, providerAssistantId: providerId, publicKey } };
}
