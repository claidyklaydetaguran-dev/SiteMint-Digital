/**
 * Frontend V2 / AR-001J — the voice-platform **build** boundary.
 *
 * Before this module existed, `App.tsx` declared all seventeen pages with
 * `lazy(() => import("@/pages/X"))` at module scope, the voice-platform
 * pages included, and only the `<Route>` registrations sat behind
 * `voicePlatformEnabled`. But a dynamic import is a bundler instruction, not a
 * runtime one: Rollup emits a chunk for every `import()` it can reach, whether
 * or not the code around it ever runs. A default-gated build therefore built,
 * shipped and served every voice chunk — the Vapi SDK among them — that it
 * could never load.
 *
 * The first correction gave this module its own bare literal comparison
 * against `import.meta.env.VITE_VOICE_PLATFORM_ENABLED`, because that is the
 * only shape Vite substitutes and Rollup folds. It removed the chunks, but it
 * also created a second reading of the flag: `parseBooleanFlag` accepts
 * `"TRUE"` and `" true "`, this comparison did not, and a build set to either
 * spelling showed the voice navigation while every voice route resolved to
 * Not Found.
 *
 * `voicePlatformEnabled` is now itself foldable — see the note in
 * `lib/featureFlags.ts` — so this module reads that constant instead of
 * parsing the variable again. Navigation, route registration and the page
 * imports below therefore share one interpretation, and a build in which the
 * navigation is visible is by construction a build in which these imports
 * were kept.
 *
 * The disabled branch resolves each voice page to the existing not-found page
 * rather than to nothing. With a single interpretation it is unreachable —
 * whenever it is selected, `App.tsx` registers no voice route to render it —
 * and it stays as the branch's total answer for every key, and as the
 * defence if a route were ever registered without its gate. Neither flag's
 * meaning nor default changes.
 *
 * ── 2026-09 owner replan (D-2) ─────────────────────────────────────────────
 *
 * The gated set changed shape, not principle. Appointments moved out of the
 * voice gate entirely (owner decision B-1: calendar features, not voice
 * features) and is now imported inline in `App.tsx` like Overview or
 * Settings. Call Logs was renamed Calls (owner decision A-1) and kept its
 * `CallLogDetail` file name — only the exported key changed, to `Calls` /
 * `CallDetail`. Phone Number, Usage and Issues are new voice-gated surfaces
 * and go through this same boundary, for the same reason: an `import()`
 * written directly in `App.tsx` is emitted by every build regardless of any
 * runtime check around it.
 *
 * `UsageRailIndicatorGate` extends the same boundary to a component rather
 * than a route: `AppShell`'s navigation rail wants to show voice usage
 * (minutes) next to the existing SMS trial meter, but only in a voice-enabled
 * build. Wrapping the import in `voicePlatformEnabled ? lazy(...) : lazy(...)`
 * here is what keeps `AppShell` — mounted in every build — from ever pulling
 * in `useUsage` or the usage contract's copy when the flag is off; its
 * disabled branch resolves to a component that renders nothing, not to the
 * not-found page, since a rail slot is not a route.
 *
 * This module adds no behaviour of its own. The route table, its order, the
 * gate in `App.tsx`, and every page's own behaviour are unchanged.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import { voicePlatformEnabled } from "@/lib/featureFlags";

/** Each voice page reads its parameters through `useRoute`, never from props. */
type VoiceRoutePage = LazyExoticComponent<ComponentType>;

export interface VoiceRoutePages {
  Assistants: VoiceRoutePage;
  AssistantCreate: VoiceRoutePage;
  AssistantBuilderNew: VoiceRoutePage;
  AssistantBuilder: VoiceRoutePage;
  Calls: VoiceRoutePage;
  CallDetail: VoiceRoutePage;
  PhoneNumber: VoiceRoutePage;
  Usage: VoiceRoutePage;
  Issues: VoiceRoutePage;
}

/** Already emitted by every build, gated or not — see the note above. */
const unavailable = () => import("@/pages/not-found");

export const voiceRoutePages: VoiceRoutePages = voicePlatformEnabled
  ? {
      Assistants: lazy(() => import("@/pages/Assistants")),
      AssistantCreate: lazy(() => import("@/pages/AssistantCreate")),
      AssistantBuilderNew: lazy(() => import("@/pages/AssistantBuilderNew")),
      AssistantBuilder: lazy(() => import("@/pages/AssistantBuilder")),
      Calls: lazy(() => import("@/pages/Calls")),
      CallDetail: lazy(() => import("@/pages/CallLogDetail")),
      PhoneNumber: lazy(() => import("@/pages/PhoneNumber")),
      Usage: lazy(() => import("@/pages/Usage")),
      Issues: lazy(() => import("@/pages/Issues")),
    }
  : {
      Assistants: lazy(unavailable),
      AssistantCreate: lazy(unavailable),
      AssistantBuilderNew: lazy(unavailable),
      AssistantBuilder: lazy(unavailable),
      Calls: lazy(unavailable),
      CallDetail: lazy(unavailable),
      PhoneNumber: lazy(unavailable),
      Usage: lazy(unavailable),
      Issues: lazy(unavailable),
    };

/** A rail-widget's disabled answer: nothing, not a full "not found" page. */
function NullIndicator(): null {
  return null;
}

/**
 * `AppShell`'s voice-usage rail indicator. See the module doc for why this is
 * gated the same way the routes above are, rather than imported directly.
 */
export const UsageRailIndicatorGate: VoiceRoutePage = voicePlatformEnabled
  ? lazy(() => import("@/pages/usage/UsageRailIndicator"))
  : lazy(async () => ({ default: NullIndicator }));
