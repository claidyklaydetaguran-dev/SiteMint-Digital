/**
 * Single import site for client-exposed feature flags. Never read
 * import.meta.env directly elsewhere — add new flags here instead.
 *
 * Flags are boolean capability switches only. Never put secrets or
 * provider credentials in VITE_ variables.
 *
 * ── AR-001J correction A: one interpretation, never two ───────────────────
 *
 * AR-001J left this flag with two readings. Navigation and route registration
 * used `parseBooleanFlag`, which accepts any spelling of the word — `"TRUE"`,
 * `" true "` — while the build boundary in `routes/voiceRoutes.ts` used its
 * own bare `=== "true"` comparison, because that is the only shape a bundler
 * can fold. `VITE_VOICE_PLATFORM_ENABLED=TRUE` therefore produced a build
 * that showed the voice navigation while every voice destination resolved to
 * Not Found.
 *
 * These three constants are now the only interpretation in the client. No
 * other module parses a voice variable: the navigation catalogue, the page
 * import boundary, route registration, publishing and browser testing all
 * read the constants below, so a disagreement is no longer expressible.
 *
 * The shape is what lets one expression serve both purposes. A function call
 * is opaque to every bundler, and a bare literal comparison folds but accepts
 * only lowercase `"true"` — adopting it outright would silently narrow the
 * documented environment contract. Each flag therefore answers the two
 * statically decidable cases with literal comparisons, which Vite substitutes
 * and Rollup folds, and defers every other value to `parseBooleanFlag`,
 * whose truth table is unchanged:
 *
 *   • unset, `""` and `"false"` fold to `false`, so a default build drops
 *     every gated module, chunk and navigation record;
 *   • `"true"` folds to `true`;
 *   • any other spelling falls through to `parseBooleanFlag`, whose truth
 *     table is unchanged: every spelling it accepts still enables the
 *     feature and every spelling it rejects still fails closed.
 *
 * ── AR-001J final refinement, owner decision A ───────────────────────────
 *
 * That last case used to be the boundary's one remaining limitation: a
 * spelling the bundler could not decide left the gated code in the build,
 * reachable or not. `vite.config.ts` now applies exactly the truth table
 * below once, before Vite resolves its environment and therefore before
 * Rollup constructs the module graph, so these three variables reach this
 * file only ever as the literal `"true"` or the literal `"false"`.
 *
 * The public contract is unchanged — the environment still accepts every
 * spelling it documented — but the deferred branch below is now unreachable
 * in any Vite build, and every value therefore removes or keeps the gated
 * code exactly as its meaning says it should. The branch stays because it,
 * not the canonicaliser, is the contract: it keeps this module correct
 * under any consumer, and it is what the canonicaliser is written to match.
 *
 * `typeof import.meta.env === "undefined"` is the no-bundler case. The
 * committed `tsx` contract tests import this module and its consumers
 * directly, where `import.meta.env` does not exist and reading a property of
 * it throws. Vite replaces `import.meta.env` with the build's own object, so
 * this test folds away with everything else; outside a bundler every flag
 * takes its documented default of `false`.
 */

/**
 * The flag truth table, unchanged since Milestone 1 and deliberately still
 * the only parser: a string whose trimmed, lower-cased form is exactly
 * `true`. Everything else — including `"1"`, `"yes"`, `"on"` and every
 * non-string — is false. Exported so the contract test can pin the whole
 * table directly rather than by matching this file's text.
 */
export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

/** True only outside a bundler — see the note above. */
const NO_BUILD_ENV = typeof import.meta.env === "undefined";

/**
 * Gates visibility of in-progress voice-platform navigation/routes, and — as
 * of the AR-001J correction — their presence in the build at all.
 * Defaults false (production-safe) when unset or invalid.
 * SMS/receptionist routes are never gated by this flag.
 */
export const voicePlatformEnabled: boolean = NO_BUILD_ENV
  ? false
  : import.meta.env.VITE_VOICE_PLATFORM_ENABLED === "true"
    ? true
    : import.meta.env.VITE_VOICE_PLATFORM_ENABLED === "false" ||
        import.meta.env.VITE_VOICE_PLATFORM_ENABLED === "" ||
        import.meta.env.VITE_VOICE_PLATFORM_ENABLED === undefined
      ? false
      : parseBooleanFlag(import.meta.env.VITE_VOICE_PLATFORM_ENABLED);

/**
 * Milestone 1 / Checkpoint E3C: gates the frontend Publish workflow (the
 * confirmation dialog and the POST .../publish request). Defaults false
 * (production-safe) when unset or invalid. This is a frontend convenience
 * gate only, never a security boundary — the backend `publish_disabled`
 * response remains the ultimate authority regardless of this flag's value.
 * Has no effect when `voicePlatformEnabled` is false, since the assistant
 * routes themselves are unavailable in that case.
 */
export const voicePublishEnabled: boolean = NO_BUILD_ENV
  ? false
  : import.meta.env.VITE_VOICE_PUBLISH_ENABLED === "true"
    ? true
    : import.meta.env.VITE_VOICE_PUBLISH_ENABLED === "false" ||
        import.meta.env.VITE_VOICE_PUBLISH_ENABLED === "" ||
        import.meta.env.VITE_VOICE_PUBLISH_ENABLED === undefined
      ? false
      : parseBooleanFlag(import.meta.env.VITE_VOICE_PUBLISH_ENABLED);

/**
 * Milestone 1 / Checkpoint F1: gates the frontend browser voice-test
 * foundation (the Test confirmation dialog, the browser-test state machine,
 * and the active test panel). Defaults false (production-safe) when unset
 * or invalid. This is a frontend convenience gate only, never a security
 * boundary, and it carries no provider host, public key, or private key —
 * it is a plain capability switch. Has no effect when `voicePlatformEnabled`
 * is false, since the assistant routes themselves are unavailable in that
 * case. A configured Vapi public key is also required; otherwise the client
 * fails closed to the unavailable implementation. As of the AR-001J
 * correction this flag also decides whether the provider browser SDK is
 * built at all — see `lib/browserVoice/context.tsx`.
 */
export const voiceBrowserTestEnabled: boolean = NO_BUILD_ENV
  ? false
  : import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED === "true"
    ? true
    : import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED === "false" ||
        import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED === "" ||
        import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED === undefined
      ? false
      : parseBooleanFlag(import.meta.env.VITE_VOICE_BROWSER_TEST_ENABLED);

/**
 * AR-001V.1: gates the frontend control that sends an already-published
 * assistant's saved configuration to the voice provider. Defaults false
 * (production-safe) when unset or invalid, and follows exactly the same
 * foldable shape as the three flags above, so a disabled build drops the
 * control, its confirmation dialog, its mutation hook and its copy.
 *
 * It is deliberately independent of `voicePublishEnabled`: publishing creates
 * a new provider assistant, synchronizing updates one that already exists, and
 * granting either must never grant the other. It remains subordinate to
 * `voicePlatformEnabled`, since the assistant routes do not exist without it.
 *
 * Like the others this is a plain capability switch, carrying no provider
 * host, public key, or private key. The server enforces its own separate
 * `VOICE_SYNC_ENABLED` and is authoritative — this flag only decides whether
 * the client offers the action.
 */
export const voiceSyncEnabled: boolean = NO_BUILD_ENV
  ? false
  : import.meta.env.VITE_VOICE_SYNC_ENABLED === "true"
    ? true
    : import.meta.env.VITE_VOICE_SYNC_ENABLED === "false" ||
        import.meta.env.VITE_VOICE_SYNC_ENABLED === "" ||
        import.meta.env.VITE_VOICE_SYNC_ENABLED === undefined
      ? false
      : parseBooleanFlag(import.meta.env.VITE_VOICE_SYNC_ENABLED);
