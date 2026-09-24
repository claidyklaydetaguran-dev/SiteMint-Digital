// Getting a usable Google access token for one firm's calendar connection.
//
// Extracted so the event writer and the calendar listing share ONE refresh
// path. Two copies would eventually disagree about the thing that matters
// most here: what `invalid_grant` means. It means the grant is gone — the
// owner revoked access, or, in a Testing-mode app, the seven-day refresh
// token simply expired — and the answer is `undefined`, never an exception
// and never a retry.

import type { SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";

import { decryptToken, encryptToken, loadCalendarTokenKey } from "./tokenCrypto.js";
import { loadGoogleOAuthConfig, refreshAccessToken, type OAuthTransport } from "./googleOAuth.js";

export interface AccessTokenDeps {
  now?: () => Date;
  oauthTransport?: OAuthTransport;
  updateAccessToken?: (firmId: number, accessTokenEnc: string, expiresAt: Date) => Promise<void>;
}

/**
 * Returns a usable access token, refreshing when the cached one is close to
 * expiry.
 *
 * `undefined` means the grant is gone and the caller should report the
 * connection as withdrawn. A transport failure is a different thing entirely
 * and is rejected, so a temporary outage is never mistaken for revocation —
 * telling a business its calendar access was withdrawn when Google was merely
 * slow would send it through a pointless reconnect.
 */
export async function resolveCalendarAccessToken(
  connection: SchedulingCalendarConnection,
  deps: AccessTokenDeps = {},
): Promise<string | undefined> {
  const key = loadCalendarTokenKey();
  const now = deps.now?.() ?? new Date();

  if (
    connection.accessTokenEnc &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - now.getTime() > 60_000
  ) {
    return decryptToken(connection.accessTokenEnc, key);
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc, key);
  const result = await refreshAccessToken(loadGoogleOAuthConfig(), refreshToken, deps.oauthTransport);
  if (!result.ok) {
    if (result.reason === "invalid_grant") return undefined;
    throw new Error("calendar token refresh failed");
  }
  if (deps.updateAccessToken) {
    await deps.updateAccessToken(
      connection.firmId,
      encryptToken(result.accessToken, key),
      new Date(now.getTime() + result.expiresInSec * 1000),
    );
  }
  return result.accessToken;
}

/** Production binding: refreshes and persists the new access token. */
export async function calendarAccessToken(connection: SchedulingCalendarConnection): Promise<string | undefined> {
  const { updateAccessToken } = await import("./calendarConnectionsRepository.js");
  return resolveCalendarAccessToken(connection, { updateAccessToken });
}
